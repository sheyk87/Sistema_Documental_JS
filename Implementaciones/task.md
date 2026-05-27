# Tareas — Escalabilidad GDE a 2000 Usuarios

## Fase 1 — Quick Wins ✅
- [x] Pool MySQL → 100 conexiones + queueLimit 500
- [x] 15 índices SQL creados
- [x] Optimizar getAllDocuments con Map O(N+M) + excluir `content`
- [x] Optimizar getAllExpedientes con Map O(N+M)
- [x] Endpoint lazy loading `/api/docs/:id/content`
- [x] Frontend `ensureDocContent()` en view-item, notificaciones, firma

## Fase 2 — Eliminar Bloqueos Síncronos ✅
- [x] `cryptoService.js` → async I/O completo (readFile/writeFile/access async)
- [x] `signatureService.js` → async I/O + cache del certificado PKCS#12
- [x] `docController.js` → 20 operaciones de I/O convertidas a async
- [x] Dashboard: de 14 queries → 6 queries consolidadas con CASE WHEN
- [x] Clustering Node.js (multi-core en producción, single en desarrollo)
- [x] Health check endpoint `/api/health`
- [x] Graceful shutdown en workers
- [x] Tests de integración: Pool, Hash, Encrypt/Decrypt, Signature ✅

## Fase 3 — Redis (Cache + Rate Limit + Sesiones) ✅
- [x] Cliente Redis centralizado (`config/redisClient.js`) con reconexión y fallback
- [x] Cache de dashboard stats (TTL 30s) — 0 queries SQL en cache hit
- [x] Cache de `getInitialData` (TTL 60s) — invalidación al mutar users/areas
- [x] Rate limiter con Redis store (un store por limiter con prefijo único)
- [x] Blacklist JWT en Redis para logout real (`POST /api/auth/logout`)
- [x] Invalidación de cache en `userController.js` y `areaController.js`
- [x] Variables de entorno Redis en `.env` y `.env.example`
- [x] Degradación elegante: si Redis cae, el sistema sigue con MySQL y MemoryStore

## Fase 4 — Cola de Trabajos (BullMQ) ✅
- [x] Colas BullMQ definidas (`config/queues.js`) — email + signature
- [x] Email worker con retry exponencial, SMTP pooling, rate limit 30/min
- [x] Firma PDF como job asíncrono — 5 fases en `signatureWorker.js` con progreso
- [x] `emailService.sendMail()` encola en BullMQ (8 call-sites beneficiados automáticamente)
- [x] `signFinalAndSeal` responde HTTP 202 + jobId (firma en background)
- [x] Endpoint de estado de job (`GET /api/jobs/:queue/:id`)
- [x] Frontend: logout con revocación JWT + polling de firma async
- [x] Redis con persistencia AOF en docker-compose
- [x] Workers arrancan en `server.js` (solo 1 instancia por cluster)

## Fase 5 — Dockerización y Separación de Servicios ✅
- [x] `gde_frontend/Dockerfile` — Nginx proxy reverso + archivos estáticos
- [x] `gde_frontend/nginx.conf` — Proxy `/api/*` al backend interno
- [x] `gde_backend/Dockerfile` — Node.js 25 con usuario no-root (OWASP A05)
- [x] `gde_backend/.dockerignore` — Excluir secretos y datos del build
- [x] `docker-compose.yml` — 6 servicios, servidor único (solo frontend expuesto)
- [x] `docker-compose.swarm.yml` — Cluster Swarm con NFS y réplicas
- [x] Workers como contenedores independientes (email-worker, signature-worker)
- [x] Workers con `dotenv` y timezone para ejecución standalone
- [x] Backend: workers solo en desarrollo, contenedores separados en producción
- [x] `.env.docker` template con valores de producción
- [x] Health checks en todos los servicios
- [x] WebSockets para dashboard real-time → pospuesto (no requerido para 2000 usuarios)
