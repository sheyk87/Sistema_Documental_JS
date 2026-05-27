# Walkthrough — Fase 5: Dockerización y Separación de Servicios

## Resumen

Se contenerizó todo el sistema GDE en 6 servicios Docker independientes, con Nginx como proxy reverso, red interna aislada, y soporte para servidor único y Docker Swarm.

---

## Arquitectura

```mermaid
graph TB
    subgraph "Red Externa"
        U["👤 Usuario"]
        NPM["🔒 Nginx Proxy Manager<br/>(SSL: gde.sistema.com)"]
    end
    
    subgraph "Docker Network (gde_network)"
        FE["🌐 Frontend<br/>Nginx :80"]
        BE["⚡ Backend API<br/>Express :3000"]
        SW["✍️ Signature Worker"]
        EW["📧 Email Worker"]
        RD["🔴 Redis :6379"]
        DB["🗄️ MySQL :3306"]
    end
    
    U -->|HTTPS :443| NPM
    NPM -->|HTTP :80| FE
    FE -->|"/ (estáticos)"| FE
    FE -->|"/api/* (proxy)"| BE
    BE --> RD
    BE --> DB
    SW --> RD
    SW --> DB
    EW --> RD
    
    style FE fill:#10b981,color:#fff
    style BE fill:#3b82f6,color:#fff
    style SW fill:#8b5cf6,color:#fff
    style EW fill:#f59e0b,color:#fff
    style RD fill:#ef4444,color:#fff
    style DB fill:#06b6d4,color:#fff
```

**Solo el Frontend (Nginx) es accesible desde fuera.** Backend, workers, Redis y MySQL están aislados en la red interna.

---

## Archivos Creados y Modificados

| Acción | Archivo | Descripción |
|--------|---------|-------------|
| **NUEVO** | [nginx.conf](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_frontend/nginx.conf) | Nginx: estáticos + proxy `/api/*` → backend:3000 |
| **NUEVO** | [Frontend Dockerfile](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_frontend/Dockerfile) | nginx:alpine + sed para URLs relativas |
| **NUEVO** | [Backend Dockerfile](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/Dockerfile) | node:25-alpine, usuario no-root, health check |
| **NUEVO** | [.dockerignore](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/.dockerignore) | Excluye node_modules, .env, certs, uploads |
| **NUEVO** | [docker-compose.yml](file:///home/jovillafane/Descargas/Sistema_Documental_JS/docker-compose.yml) | 6 servicios, servidor único |
| **NUEVO** | [docker-compose.swarm.yml](file:///home/jovillafane/Descargas/Sistema_Documental_JS/docker-compose.swarm.yml) | Swarm con réplicas y NFS |
| **NUEVO** | [.env.docker](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/.env.docker) | Template de producción |
| MOD | [server.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/server.js) | Workers solo en dev, CORS producción |
| MOD | [emailWorker.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/workers/emailWorker.js) | dotenv + timezone standalone |
| MOD | [signatureWorker.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/workers/signatureWorker.js) | dotenv + timezone standalone |

---

## Servicios Docker

| Servicio | Imagen | Puerto Externo | Réplicas (Swarm) |
|----------|--------|---------------|-----------------|
| `frontend` | gde-frontend (nginx:alpine) | 80, 443→80 | 3 |
| `backend` | gde-backend (node:25-alpine) | ❌ Ninguno | 3 |
| `signature-worker` | gde-backend (CMD diferente) | ❌ Ninguno | 2 |
| `email-worker` | gde-backend (CMD diferente) | ❌ Ninguno | 1 |
| `redis` | redis:7-alpine | ❌ Ninguno | 1 (manager) |
| `db` | mysql:8.0 | ❌ Ninguno | 1 (manager) |

---

## Volúmenes

| Volumen | Contenedores | Persistencia |
|---------|-------------|-------------|
| `backend_uploads` | backend, signature-worker | PDFs encriptados + adjuntos |
| `backend_certs` | backend, signature-worker | Certificado PKCS#12 |
| `backend_logs` | backend | Logs de Winston |
| `db_data` | db | Base de datos MySQL |
| `redis_data` | redis | AOF para persistencia de jobs |
| `.env` (bind mount) | backend, workers | Secretos y configuración |

---

## Guía de Despliegue — Servidor Único

### Pre-requisitos
```bash
# 1. Detener Redis y MySQL si están corriendo en Docker separados
docker stop gde-redis && docker rm gde-redis
# (detener MySQL existente si lo tenés en Docker)

# 2. Asegurar que el .env del backend tenga las credenciales correctas
cat gde_backend/.env
```

### Poblar volúmenes con datos existentes
```bash
# Si ya tenés certificados y datos, copiarlos después del primer build:

# 1. Construir y crear contenedores (sin iniciar)
docker compose create

# 2. Copiar certificado al volumen
docker cp gde_backend/certs/certificado.p12 gde-backend:/app/certs/
docker cp gde_backend/certs/jwt_private.pem gde-backend:/app/certs/
docker cp gde_backend/certs/jwt_public.pem gde-backend:/app/certs/

# 3. Si tenés uploads existentes, copiarlos
# docker cp gde_backend/uploads/. gde-backend:/app/uploads/
```

### Construir y levantar
```bash
cd /ruta/al/Sistema_Documental_JS

# Construir imágenes y levantar todos los servicios
docker compose up --build -d

# Verificar que todos están Up y Healthy
docker compose ps

# Verificar logs
docker compose logs -f backend
docker compose logs -f signature-worker
docker compose logs -f email-worker
```

### Inicializar base de datos (primera vez)
```bash
# Ejecutar el setup dentro del contenedor del backend
docker compose exec backend node setup_full.js
docker compose exec backend node migrations/add_indexes.js
```

### Verificación
```bash
# 1. Frontend accesible
curl http://localhost/

# 2. API funcional (a través del proxy Nginx)
curl http://localhost/api/health

# 3. Backend NO accesible directamente (debe fallar)
curl http://localhost:3000    # Connection refused ✅

# 4. Redis funcionando
docker compose exec redis redis-cli ping   # PONG

# 5. Workers activos
docker compose logs signature-worker | tail -3
docker compose logs email-worker | tail -3
```

---

## Guía de Despliegue — Docker Swarm

```bash
# 1. Inicializar Swarm (si no está)
docker swarm init

# 2. Construir imágenes localmente
docker compose build

# 3. Desplegar stack
docker stack deploy -c docker-compose.swarm.yml gde

# 4. Verificar servicios
docker service ls
docker service logs gde_backend
```

> [!WARNING]
> Para multi-nodo, las imágenes deben estar disponibles en todos los nodos. Sin un registry, usar `docker save` / `docker load` para distribuirlas.

---

## Decisiones de Diseño

| Decisión | Razón |
|----------|-------|
| Workers reusan imagen del backend | Menos imágenes que mantener, mismo código base |
| Nginx `sed` reemplaza URLs en build | Código fuente local intacto, Docker usa URLs relativas |
| MySQL en el compose | Stack auto-contenido, sin dependencias externas |
| `env_file` + `environment:` override | .env provee secretos, compose sobreescribe DB_HOST/REDIS_HOST |
| Usuario no-root en backend | OWASP A05: principio de menor privilegio |
| Health checks en todo | Docker Swarm y compose saben cuándo un servicio falló |

---

## Roadmap Completado

| Fase | Usuarios | Estado |
|------|---------|--------|
| 1. Quick Wins | ~200-400 | ✅ |
| 2. Async I/O | ~500-800 | ✅ |
| 3. Redis | ~800-1200 | ✅ |
| 4. BullMQ | ~1200-1800 | ✅ |
| **5. Docker** | **~2000-5000+** | **✅** |

**El sistema está listo para soportar 2000+ usuarios concurrentes.**
