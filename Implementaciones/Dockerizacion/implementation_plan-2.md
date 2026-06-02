# Fase 4 — Cola de Trabajos (BullMQ)

## Objetivo

Mover las operaciones pesadas (emails, firma PDF, notificaciones) a workers en background usando BullMQ. El objetivo es que la API responda instantáneamente y los trabajos pesados se procesen asincrónicamente.

**Proyección:** De ~800-1200 usuarios (Fase 3) a ~1200-1800 usuarios concurrentes.

---

## Contexto y Análisis del Código Actual

### Operaciones bloqueantes identificadas:

| Operación | Archivo | Impacto | Frecuencia |
|-----------|---------|---------|------------|
| `signFinalAndSeal` — 5 fases (PDF+crypto+firma+hash+DB) | [docController.js L432-541](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/docController.js#L432-L541) | 3-10s por firma | Alta (firmas masivas) |
| `emailService.sendMail` — SMTP síncrono en request | 8 call-sites en 3 controllers | 200ms-2s por email | Alta |
| `createNotification` — expansión de áreas N+1 + emails | [notificationController.js L5-78](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/notificationController.js#L5-L78) | Variable (N emails) | Alta |

### Flujo actual de firma (frontend → backend):
1. Frontend genera PDF con `html2pdf` → blob
2. Frontend envía blob + metadata a `POST /api/docs/sign-final/:id`
3. Backend ejecuta 5 fases bloqueantes → responde con `{ pdfHash }`
4. Frontend espera **todo el tiempo** bloqueado → muestra éxito/error

---

## Propuesta de Cambios

### Componente 1: Infraestructura BullMQ

#### [NEW] [config/queues.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/config/queues.js)

Definición centralizada de colas BullMQ:

```javascript
const { Queue } = require('bullmq');
const redis = require('./redisClient');

const connection = { host: redis.options.host, port: redis.options.port, password: redis.options.password };

const emailQueue = new Queue('gde:email', { connection });
const signatureQueue = new Queue('gde:signature', { connection });

module.exports = { emailQueue, signatureQueue, connection };
```

Colas:
- `gde:email` — Emails de notificaciones, 2FA, password reset, etc.
- `gde:signature` — Firma criptográfica de PDFs (CPU-intensive)

---

### Componente 2: Email Worker

#### [MODIFY] [services/emailService.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/services/emailService.js)

`sendMail()` deja de enviar directamente y **encola** el email en BullMQ:

```javascript
exports.sendMail = async (to, subject, text, html) => {
    if (process.env.EMAIL_ENABLED !== 'true') return;
    const { emailQueue } = require('../config/queues');
    await emailQueue.add('send', { to, subject, text, html }, {
        attempts: 3,           // Reintentar 3 veces si falla
        backoff: { type: 'exponential', delay: 5000 },  // 5s, 10s, 20s
        removeOnComplete: 100, // Mantener últimos 100 completados
        removeOnFail: 200,     // Mantener últimos 200 fallidos para diagnóstico
    });
};
```

**Impacto:** Todas las 8 llamadas a `emailService.sendMail()` en el sistema **se benefician automáticamente** sin cambiar ningún controller. La función ya es fire-and-forget; ahora será fire-and-queue.

#### [NEW] [workers/emailWorker.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/workers/emailWorker.js)

Worker dedicado que procesa la cola de emails:

```javascript
const { Worker } = require('bullmq');
const nodemailer = require('nodemailer');
// Crea su propio transporter SMTP
// Procesa emails uno a uno con retry automático
```

Se arranca como proceso separado o como parte del server.js en desarrollo.

---

### Componente 3: Firma PDF como Job Asíncrono

#### [MODIFY] [controllers/docController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/docController.js)

**Cambio en `signFinalAndSeal` (L432-541):** 

El endpoint actual ejecuta 5 fases y responde con el hash. Se cambiará para:
1. Recibir el upload del PDF
2. Guardar el archivo temporal en disco
3. Encolar un job en `gde:signature` con toda la metadata
4. Responder inmediatamente con `{ jobId }` (HTTP 202 Accepted)

```javascript
exports.signFinalAndSeal = async (req, res) => {
    // Validación
    if (!req.file) return res.status(400).json({ message: 'No se recibió el PDF.' });
    
    const docData = JSON.parse(req.body.documentData);
    const historyEntry = JSON.parse(req.body.historyEntry);
    
    // Encolar el trabajo pesado
    const { signatureQueue } = require('../config/queues');
    const job = await signatureQueue.add('sign-seal', {
        documentId: req.params.id,
        tempFilePath: req.file.path,
        docData,
        historyEntry,
    }, {
        attempts: 1,           // La firma NO se reintenta (podrían duplicarse)
        removeOnComplete: 200,
    });
    
    // Respuesta instantánea
    res.status(202).json({ jobId: job.id, message: 'Documento encolado para firma' });
};
```

#### [NEW] [workers/signatureWorker.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/workers/signatureWorker.js)

Worker que ejecuta las 5 fases de firma. **La lógica existente se mueve aquí casi intacta:**

1. Lee el PDF temporal
2. Desencripta y embebe adjuntos
3. Firma PKCS#7
4. Hash SHA-256 + encripta
5. Actualiza BD + limpia archivos temporales

---

### Componente 4: Endpoint de Estado de Job

#### [NEW] [controllers/jobController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/jobController.js)

```javascript
exports.getJobStatus = async (req, res) => {
    const { queueName, jobId } = req.params;
    // Buscar job en la cola correspondiente
    // Devolver: { status: 'waiting|active|completed|failed', result, error }
};
```

#### [NEW] [routes/jobRoutes.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/routes/jobRoutes.js)

```
GET /api/jobs/:queueName/:jobId → jobController.getJobStatus
```

**Seguridad (OWASP A01):** Solo el usuario autenticado puede consultar jobs. El `queueName` se valida contra whitelist (`['signature']`) — no se expone la cola de emails.

---

### Componente 5: Arranque de Workers

#### [MODIFY] [server.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/server.js)

En modo desarrollo, los workers se inician **dentro del mismo proceso** para simplicidad.
En producción (clustering), los workers corren en procesos separados.

```javascript
// Solo 1 worker de email por cluster (evitar duplicados)
if (cluster.isPrimary || process.env.NODE_ENV !== 'production') {
    require('./workers/emailWorker');
    require('./workers/signatureWorker');
}
```

> [!NOTE]
> En Fase 5 (Microservicios), estos workers se separarán en contenedores Docker independientes. Por ahora, corren en el mismo servidor.

---

### Componente 6: Cambios en Frontend

#### [MODIFY] [app.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_frontend/app.js)

**6.1 Logout con revocación JWT (Fase 3 pendiente):**

La función `clearSession()` (L442) actualmente solo borra localStorage. Se modifica para llamar al endpoint de logout:

```javascript
async function clearSession() {
    const token = localStorage.getItem('gde_token');
    if (token) {
        try {
            await fetch('http://localhost:3000/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) { /* Offline → solo limpiamos local */ }
    }
    localStorage.removeItem('gde_token');
    localStorage.removeItem('gde_login_time');
    document.cookie = "gde_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict";
    state.currentUser = null;
}
```

Y el handler de logout (L3195) se actualiza para ser `async`:
```javascript
if (action === 'logout') { await clearSession(); return renderApp(); }
```

**6.2 Firma con polling de estado:**

La función `sealAndSaveDocument` (L554-710) actualmente espera la respuesta síncrona. Se modifica para:
1. Enviar el PDF al backend → recibir `jobId`
2. Hacer polling a `/api/jobs/signature/:jobId` cada 2 segundos
3. Mostrar un indicador de progreso mientras espera
4. Resolver cuando el job termine (completado o fallido)

```javascript
// Nuevo flujo:
const res = await fetch(`/api/docs/sign-final/${doc.id}`, { ... });
const { jobId } = await res.json();

// Polling hasta completado
const result = await pollJobStatus('signature', jobId, (status) => {
    // Callback de progreso para actualizar UI
});
```

---

### Componente 7: Redis en Docker Compose

#### [MODIFY] [docker_swarm_architecture.md](file:///home/jovillafane/Descargas/Sistema_Documental_JS/docker_swarm_architecture.md)

Agregar servicio Redis al compose documentado:

```yaml
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD:-}
    networks:
      - gde_network
    volumes:
      - redis_data:/data
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
```

---

## Resumen de Archivos

| Acción | Archivo | Cambio |
|--------|---------|--------|
| **NUEVO** | `config/queues.js` | Definición de colas BullMQ |
| **NUEVO** | `workers/emailWorker.js` | Worker de emails con retry |
| **NUEVO** | `workers/signatureWorker.js` | Worker de firma PDF (5 fases) |
| **NUEVO** | `controllers/jobController.js` | Endpoint de estado de jobs |
| **NUEVO** | `routes/jobRoutes.js` | Ruta GET /api/jobs/:queue/:id |
| MODIFICAR | `services/emailService.js` | `sendMail()` encola en vez de enviar |
| MODIFICAR | `controllers/docController.js` | `signFinalAndSeal` encola job |
| MODIFICAR | `server.js` | Arranque de workers |
| MODIFICAR | `routes/docRoutes.js` | Registrar jobRoutes |
| MODIFICAR | `gde_frontend/app.js` | Logout con revocación + polling firma |
| MODIFICAR | `docker_swarm_architecture.md` | Redis en compose |
| MODIFICAR | `package.json` | Agregar bullmq |

---

## Consideraciones de Seguridad (OWASP)

| Control | Detalle |
|---------|---------|
| **A01 (Broken Access Control)** | Jobs solo consultables por usuario autenticado. Cola de emails NO expuesta via API |
| **A04 (Insecure Design)** | Jobs de firma no se reintentan (attempts: 1) para evitar duplicación |
| **A07 (Auth Failures)** | Frontend ahora revoca JWT en logout (complemento de Fase 3) |
| **A09 (Logging)** | Workers logean inicio/fin/error de cada job |

---

## Plan de Verificación

### Tests
1. **Email encolado:** Enviar notificación → verificar que el email se procesa en background (no bloquea response)
2. **Firma async:** Firmar documento → verificar que el endpoint responde 202 → polling muestra progreso → firma se completa
3. **Firma masiva:** Firmar 5 documentos → verificar que el polling funciona secuencialmente
4. **Job fallido:** Simular error en firma → verificar que el frontend muestra el error correcto
5. **Logout revocación:** Login → logout → intentar usar token → debe fallar 401

---

## Decisiones que requieren tu input

> [!IMPORTANT]
> **1. ¿El frontend usa URLs hardcodeadas?** Vi `http://localhost:3000` en muchos fetch del `app.js`. Para producción, ¿ya tienen un mecanismo para cambiar la URL base? (No lo cambio en esta fase, pero lo menciono para no romper nada)

> [!IMPORTANT]
> **2. ¿Firmas masivas también asíncronas?** El flujo actual en `processBatchSign()` (L808-887) llama a `sealAndSaveDocument()` secuencialmente. ¿Quieres que las firmas masivas también usen el polling, o mantenemos el flujo síncrono para mantener el orden secuencial?

> [!IMPORTANT]
> **3. ¿Tolerancia a pérdida de jobs?** Si Redis se reinicia, los jobs en cola se pierden. ¿Necesitas persistencia de Redis (AOF/RDB) para producción? Se puede configurar en el compose.
