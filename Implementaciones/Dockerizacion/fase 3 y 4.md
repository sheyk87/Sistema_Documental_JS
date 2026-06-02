✅ Fase 3 Completada
Resumen de lo implementado:
| Componente |Qué hace Archivo |
|--------|---------|
| Redis Client | Cliente singleton con reconexión automática y logging |
| Cache Dashboard | Stats cacheadas 30s → 0 queries SQL en cache hit |
| Cache InitialData | Areas/users cacheados 60s → invalidación al mutar |
| Rate Limiter Redis | Contadores compartidos entre workers/réplicas |
| JWT Blacklist | `POST /api/auth/logout` revoca tokens realmente |
| Degradación elegante | Si Redis cae → MySQL directo + MemoryStore |


Para activar Redis:
```bash
docker run -d --name gde-redis -p 6379:6379 redis:7-alpine
```
Archivos modificados: 10 (1 nuevo + 9 actualizados)
El walkthrough tiene todos los detalles.

✅ Fase 4 Completada
Resumen de lo implementado:
| Componente |Qué hace Archivo |
|--------|---------|
| Email Queue | `emailService.sendMail()` encola en BullMQ → 8 call-sites beneficiados automáticamente|
| Email Worker | SMTP con pool de 5 conexiones, rate limit 30/min, retry exponencial|
| Signature Queue | `signFinalAndSeal` → HTTP 202 + jobId instantáneo|
| Signature Worker | 5 fases con reportes de progreso (10→20→50→70→90→100%)|
| Job Status | `GET /api/jobs/signature/:id` para polling desde frontend|
| Frontend Polling | `pollJobStatus()` cada 2s, timeout 120s|
| Frontend Logout | `clearSession()` ahora revoca JWT en Redis|
| Docker | Redis con AOF persistence en compose|

Bugs encontrados y resueltos:
1. BullMQ: Queue names no pueden tener `:` → cambiados a `-`

Archivos: 17 (6 nuevos + 11 modificados)
El walkthrough tiene el diagrama completo del flujo async.

🧪 Test 2 — Rate Limiting con Redis (Fase 3)
Qué probamos: Que los contadores de rate limit se almacenan en Redis (compartidos entre workers).

Después de hacer login, verificá que existen keys de rate limiting:

```bash
docker exec gde-redis redis-cli KEYS "gde:rl:*"
```

🧪 Test 3 — Logout con Revocación JWT (Fase 3)
Qué probamos: Que al hacer logout, el token se blacklistea en Redis.

1. Logueate en el sistema
2. Abrí DevTools → Network → copiá el token JWT del header Authorization
3. Hacé clic en "Cerrar Sesión"
4. Verificá que el token fue blacklisteado:

```bash
docker exec gde-redis redis-cli KEYS "gde:bl:*"
```
Deberías ver una key con el token. Esta key se auto-elimina cuando el JWT expire.

Probá usar el token viejo (con curl o Postman):
```bash
curl -H "Authorization: Bearer <TOKEN_COPIADO>" http://localhost:3000/api/users/me
```
Debe devolver `401 Token inválido o expirado`.

🧪 Test 4 — Email Worker BullMQ (Fase 4)
Qué probamos: Que los emails se encolan en BullMQ en vez de enviarse directamente.

Si tenés `EMAIL_ENABLED=true` en tu `.env`, cualquier acción que envíe email (crear usuario, notificar, etc.) ahora encola el email. Vas a ver en la terminal del servidor:

```bash
📧 Email enviado [Job 1]: usuario@correo.com — GDE - Notificación: ...
```

Si `EMAIL_ENABLED=false`, los jobs se completan silenciosamente con `{ skipped: true }`.

🧪 Test 5 — Firma Async con Polling (Fase 4) ⚠️ El más importante
Qué probamos: Que la firma de documentos ahora es asíncrona con polling.

1. Logueate y creá un documento borrador
2. Firmá el documento como lo hacías normalmente
3. Observá que:
    - La UI muestra el progreso de sellado (el polling está activo)
    - En la terminal del servidor verás:

```bash
✍️  Firma completada [Job 1]: Doc XXXXX — Hash: a1b2c3d4...
```

4. El documento aparece como Firmado una vez que el polling detecta `state: completed`.

Comando rápido para arrancar y probar todo:
```bash
# Terminal 1: Arrancar servidor (incluye workers)
cd gde_backend && node server.js

# Terminal 2: Monitorear Redis en tiempo real
docker exec gde-redis redis-cli MONITOR

# Terminal 3: Ver keys de Redis
watch -n 2 'docker exec gde-redis redis-cli KEYS "gde:*" | head -20'
```

El `MONITOR` de Redis te va a mostrar cada operación que pasa por Redis en tiempo real — vas a poder ver las lecturas de cache, los rate limit checks, los jobs de BullMQ, etc.

Resumen de qué buscar al probar:
| Test | Qué verificar | Dónde mirarlo |
|--------|---------|---------|
| Cache | Keys `gde:cache:*` aparecen en Redis | `redis-cli KEYS "gde:cache:*"` |
| Rate Limit | Keys `gde:rl:*` aparecen en Redis | `redis-cli KEYS "gde:rl:*"` |
| Logout | Key `gde:bl:*` aparece al cerrar sesión | `redis-cli KEYS "gde:bl:*"` |
| Emails | Logs `📧 Email enviado [Job X]` en terminal | Terminal del servidor |
| Firma | Logs `✍️ Firma completada [Job X]` en terminal | Terminal del servidor |
| Polling | Network tab muestra requests a `/api/jobs/signature/*` | DevTools del navegador |