# Fase 5 — Dockerización y Separación de Servicios

## Objetivo

Contenerizar todo el sistema GDE en servicios Docker independientes, con Nginx como proxy reverso en el frontend, red interna aislada, y soporte tanto para servidor único como Docker Swarm.

---

## Análisis: ¿Qué servicios separar?

### Servicios que SÍ deben ser contenedores separados

| Servicio | Justificación | Escala independiente |
|----------|--------------|---------------------|
| **Frontend (Nginx)** | Sirve archivos estáticos + proxy reverso a la API | Sí (3+ réplicas) |
| **Backend API** | Express con todas las rutas `/api/*` | Sí (3+ réplicas) |
| **Signature Worker** | CPU-intensive. La firma de PDFs bloquea si compite con la API | Sí (1-2 réplicas) |
| **Email Worker** | I/O SMTP. Debe escalar independiente del tráfico HTTP | Sí (1 réplica) |
| **Redis** | Cache, colas BullMQ, blacklist JWT | No (1 réplica, manager) |
| **MySQL** | Base de datos | No (1 réplica, manager) |

### Servicios que NO necesitan ser separados

| Candidato | Decisión | Razón |
|-----------|----------|-------|
| Descarga de PDFs | ❌ Queda en Backend | Ya es async I/O (Fase 2). Separarlo duplica el volumen de certs/uploads sin beneficio |
| Notificaciones (campanita) | ❌ Queda en Backend | Son queries simples (SELECT/INSERT). Cacheadas en Redis (Fase 3) |
| Métricas Dashboard | ❌ Queda en Backend | Ya cacheadas en Redis con TTL 30s. 0 queries SQL en cache hit |

> [!NOTE]
> Separar descarga, notificaciones o métricas añadiría complejidad (más contenedores, más configuración) sin ganar rendimiento significativo. Estos endpoints ya son rápidos gracias a las Fases 2-4.

---

## Arquitectura Final

```
┌─────────────────────────────────────────────────────────┐
│                    RED EXTERNA                          │
│                                                         │
│   Usuario → https://gde.dominio.ar                     │
│                     │                                   │
│              ┌──────▼──────┐                           │
│              │  FRONTEND   │ ← Puerto 80/443           │
│              │   (Nginx)   │   ÚNICO punto de entrada  │
│              └──────┬──────┘                           │
│                     │                                   │
├─────────────────────┼───────────────────────────────────┤
│            RED INTERNA (gde_network)                    │
│                     │                                   │
│         ┌───────────┼───────────┐                      │
│         │           │           │                      │
│    / (estáticos)  /api/* ──►┌───▼────┐                │
│    index.html              │BACKEND │ ← :3000         │
│    app.js, css             │  API   │   (NO expuesto)  │
│                            └───┬────┘                  │
│                                │                       │
│              ┌─────────────────┼────────────┐         │
│              │                 │            │         │
│        ┌─────▼─────┐    ┌─────▼─────┐ ┌────▼────┐   │
│        │  REDIS    │    │  MySQL    │ │ Workers │   │
│        │  :6379    │    │  :3306    │ │ (Email/ │   │
│        └───────────┘    └───────────┘ │ Firma)  │   │
│                                       └─────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Punto clave:** El backend y los workers **NO exponen puertos** al host. Solo el frontend (Nginx) es accesible desde fuera. Nginx proxea `/api/*` al backend vía la red interna Docker.

### ¿El frontend se comunica con los microservicios?

**No.** El flujo es siempre:
```
Usuario → Nginx → Backend API → Redis/BullMQ ← Workers
```
Los workers solo consumen jobs de BullMQ (Redis). Nunca reciben HTTP directo.

---

## Propuesta de Cambios

### Componente 1: Frontend — Nginx + Static Files

#### [NEW] `gde_frontend/nginx.conf`

Configuración de Nginx como proxy reverso:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    
    # Archivos estáticos del frontend
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Proxy reverso hacia el backend API (red interna Docker)
    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts para operaciones largas (uploads)
        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        
        # Tamaño máximo de upload (PDFs + adjuntos)
        client_max_body_size 15M;
    }
}
```

#### [NEW] `gde_frontend/Dockerfile`

```dockerfile
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html/
# Eliminar nginx.conf y Dockerfile de los estáticos servidos
RUN rm -f /usr/share/nginx/html/nginx.conf /usr/share/nginx/html/Dockerfile
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q --spider http://localhost/ || exit 1
EXPOSE 80
```

---

### Componente 2: Backend API

#### [NEW] `gde_backend/Dockerfile`

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# Crear directorios necesarios
RUN mkdir -p uploads/secure_docs uploads/temp_sealing logs
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q --spider http://localhost:3000/api/health || exit 1
EXPOSE 3000
CMD ["node", "server.js"]
```

#### [NEW] `gde_backend/.dockerignore`

```
node_modules
.env
uploads/*
!uploads/.gitkeep
logs/*
certs/*
tests/
docs/
*.md
```

---

### Componente 3: Workers como servicios independientes

Los workers usan la **misma imagen Docker** que el backend, pero con `CMD` diferente. No necesitan Dockerfile propio.

En el `docker-compose.yml`:
```yaml
signature-worker:
    build: ./gde_backend
    command: ["node", "workers/signatureWorker.js"]
    # ... mismas env vars, mismos volúmenes de uploads/certs

email-worker:
    build: ./gde_backend
    command: ["node", "workers/emailWorker.js"]
    # ... mismas env vars, NO necesita volúmenes de uploads
```

> [!IMPORTANT]
> Los workers necesitan `require('dotenv').config()` al inicio de sus archivos ya que correrán como procesos independientes (no pasan por `server.js`). Actualmente no lo tienen.

---

### Componente 4: Docker Compose — Servidor Único

#### [NEW] `docker-compose.yml`

Servicios:
- `frontend` — Nginx (puerto 80 expuesto)
- `backend` — Express API (solo red interna)
- `signature-worker` — BullMQ signature (solo red interna)
- `email-worker` — BullMQ email (solo red interna)
- `redis` — Redis con AOF (solo red interna)
- `db` — MySQL 8 (solo red interna)

Volúmenes:
- `db_data` — persistencia MySQL
- `redis_data` — persistencia Redis (AOF)
- `backend_uploads` — archivos subidos/encriptados (compartido entre backend + signature-worker)
- `backend_certs` — certificado PKCS#12 (compartido entre backend + signature-worker)

---

### Componente 5: Docker Compose — Swarm

#### [NEW] `docker-compose.swarm.yml`

Diferencias con el compose base:
- Usa `image:` en vez de `build:` (imágenes pre-construidas)
- Volúmenes NFS para compartir `uploads` y `certs` entre nodos
- `deploy.replicas` y `placement.constraints`
- Frontend y backend con 3 réplicas
- Redis y MySQL fijos en el nodo manager

---

### Componente 6: Cambios en Código

#### [MODIFY] `gde_backend/server.js`

- **Remover arranque de workers** (líneas 179-189). Los workers corren en contenedores separados.
- **Adaptar CORS** para que acepte peticiones del proxy Nginx (mismo origen, sin CORS necesario en producción).
- CORS se mantiene activo solo para desarrollo local.

#### [MODIFY] `gde_frontend/app.js`

- **Reemplazar `http://localhost:3000`** con string vacío en todas las URLs de fetch. En Docker, Nginx proxea `/api/*` al backend, así que los fetch deben ser relativos: `fetch('/api/docs/all', ...)`.
- Se implementará como script en el Dockerfile o como búsqueda y reemplazo directo. El código local de desarrollo **no se toca** — el Dockerfile transforma las URLs al construir la imagen.

> [!IMPORTANT]
> **Decisión de diseño:** No modifico `app.js` en el repo. En su lugar, el `Dockerfile` del frontend ejecuta un `sed` que reemplaza `http://localhost:3000` con `` (vacío) al construir la imagen. Así el desarrollo local sigue funcionando con `localhost:3000` y Docker usa URLs relativas automáticamente.

#### [MODIFY] `gde_backend/workers/emailWorker.js` y `signatureWorker.js`

- Agregar `require('dotenv').config()` al inicio (necesario cuando corren como proceso independiente fuera de `server.js`).

---

## Resumen de Archivos

| Acción | Archivo | Descripción |
|--------|---------|-------------|
| **NUEVO** | `gde_frontend/nginx.conf` | Nginx proxy config |
| **NUEVO** | `gde_frontend/Dockerfile` | Imagen frontend |
| **NUEVO** | `gde_backend/Dockerfile` | Imagen backend + base workers |
| **NUEVO** | `gde_backend/.dockerignore` | Excluir node_modules, certs, uploads del build |
| **NUEVO** | `docker-compose.yml` | Despliegue servidor único (6 servicios) |
| **NUEVO** | `docker-compose.swarm.yml` | Despliegue Swarm (réplicas + NFS) |
| MODIFICAR | `gde_backend/server.js` | Remover arranque de workers embebido |
| MODIFICAR | `workers/emailWorker.js` | Agregar `dotenv.config()` |
| MODIFICAR | `workers/signatureWorker.js` | Agregar `dotenv.config()` |

---

## Servidor Único vs Swarm — ¿Archivos separados o compartidos?

> [!IMPORTANT]
> **Decisión: archivos separados.** Razones:
> 
> 1. Docker Compose v2 (`docker compose up`) soporta `build:` — Swarm (`docker stack deploy`) **no**.
> 2. Swarm requiere volúmenes NFS y `deploy.placement.constraints` que no aplican en servidor único.
> 3. Compartir un solo archivo con profiles/overrides agrega complejidad sin ganancia.
>
> **Resultado:**
> - `docker-compose.yml` → `docker compose up -d` (1 servidor)
> - `docker-compose.swarm.yml` → `docker stack deploy -c docker-compose.swarm.yml gde` (cluster)

---

## Plan de Verificación

### Servidor Único
```bash
# 1. Construir y levantar
docker compose up --build -d

# 2. Verificar que todos los contenedores están Up
docker compose ps

# 3. Verificar health checks
curl http://localhost/api/health

# 4. Probar frontend
# Abrir http://localhost en el navegador

# 5. Verificar que el backend NO es accesible directamente
curl http://localhost:3000  # Debe FALLAR (puerto no expuesto)

# 6. Probar firma de documento → verificar logs del signature-worker
docker compose logs -f signature-worker

# 7. Probar logout → verificar blacklist en Redis
docker compose exec redis redis-cli KEYS "gde:bl:*"
```

### Swarm
```bash
# 1. Construir y pushear imágenes
docker compose build
docker tag gde-frontend:latest registro/gde-frontend:latest
docker push registro/gde-frontend:latest
# (repetir para backend)

# 2. Desplegar stack
docker stack deploy -c docker-compose.swarm.yml gde

# 3. Verificar servicios
docker service ls
docker service logs gde_backend
```

---

## Preguntas que requieren tu input

> [!IMPORTANT]
> **1. ¿MySQL ya corre en Docker o localmente?** Necesito saber si incluyo MySQL en el compose o si apunto a un servidor externo. Si está local, lo incluyo en el compose y necesito los datos para crear la base de datos inicial.

> [!IMPORTANT]
> **2. ¿Puerto externo del frontend?** En el compose, el frontend (Nginx) expondrá un puerto al host. ¿Querés usar el `80` directamente, o preferís `8080` u otro? (En producción con NPM/DNS, generalmente es 80.)

> [!IMPORTANT]
> **3. ¿Nombre del registro de imágenes para Swarm?** Para el compose de Swarm necesito un registro Docker (Docker Hub, registry privado, etc.) donde pushear las imágenes. ¿Tenés uno, o creamos un registry local?

> [!IMPORTANT]
> **4. ¿Password de MySQL para producción?** El `.env` actual tiene `R00tMySQL`. ¿Querés que el compose use una variable de entorno para la contraseña de MySQL, o dejamos que se configure manualmente?

> [!IMPORTANT]
> **5. ¿WebSockets para dashboard real-time?** El task.md original mencionaba WebSockets. ¿Los incluimos en esta fase o los dejamos para después? Agregaría complejidad al proxy Nginx y al backend.
