# Plan de Implementación — Optimización y Benchmarking de Stress Test (Fase 5)

## Objetivo
Optimizar la infraestructura contenerizada y los mecanismos de comunicación para permitir la ejecución exitosa de pruebas de estrés masivas (Artillery con 1790+ usuarios concurrentes), resolviendo definitivamente los bloqueos de seguridad (`HTTP 429`), cuellos de botella de disco (I/O) y optimizando los límites de recursos de red/sistema en Docker.

---

## User Review Required

> [!IMPORTANT]
> **1. bypass de Seguridad mediante Token de Stress**:
> Leer del disco físico `.env` en caliente en cada petición genera race-conditions y cuellos de botella de I/O masivos bajo estrés (miles de peticiones/segundo).
> **Propuesta**: Implementar un middleware de bypass ultra rápido en memoria que evalúe si la petición proviene del contenedor de Artillery comparando un Header de Seguridad (`x-stress-bypass: <CLAVE_SECRETA>`). La clave secreta se inyecta al inicio y se valida en memoria en microsegundos sin tocar el disco.

> [!WARNING]
> **2. Incremento de ulimits de descriptores de archivos en Docker**:
> Bajo 2000+ conexiones concurrentes, Linux por defecto limita a 1024 archivos abiertos (`nofile`). Esto causa errores de socket caído (`502` / `Connection reset`).
> **Propuesta**: Configurar `ulimits` en `docker-compose.yml` para los servicios `backend` y `frontend` elevando los límites a `65536`.

---

## Proposed Changes

### Componente 1: Backend API

#### [MODIFY] [rateLimiter.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/middlewares/rateLimiter.js)
Eliminar la lectura repetitiva del archivo `.env` del disco duro físico. En su lugar, validar en memoria usando un bypass seguro y limpio de stress-test:
- Si la petición incluye el Header `x-stress-bypass` con la firma secreta de stress de Artillery, o si `process.env.NODE_ENV === 'test'`, se salta el rate-limiting al instante con 0 picos de I/O.
- El bypass se limita estrictamente a IPs de redes internas o firmas específicas para que nunca sea explotable en producción real.

#### [MODIFY] [db.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/config/db.js)
Optimizar el pool de conexiones MySQL para tolerar 2000+ usuarios concurrentes. 
- Elevar `connectionLimit` a `150` conexiones simultáneas.
- Configurar tiempos de espera (`queueLimit: 0`, `waitForConnections: true`) para encolar peticiones de BD de forma eficiente durante picos masivos.

---

### Componente 2: Configuración de Docker Compose (Infraestructura)

#### [MODIFY] [docker-compose.yml](file:///home/jovillafane/Descargas/Sistema_Documental_JS/docker-compose.yml)
1. **Límites de Descriptores de Archivos (`ulimits`)**:
   Agregar límites de descriptores en `backend` y `frontend`:
   ```yaml
   ulimits:
     nofile:
       soft: 65536
       hard: 65536
   ```
2. **Volumen Temporal en Memoria (`tmpfs`)**:
   Montar `/app/uploads/temp_sealing` en un volumen en memoria RAM (`tmpfs`) para que las firmas de PDFs pesadas y temporales que genera Artillery se realicen a la velocidad de la luz en RAM, evitando desgastar el SSD/HDD físico del host.

---

### Componente 3: Nginx Frontend (Optimización de Conexiones)

#### [MODIFY] [nginx.conf](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_frontend/nginx.conf)
Elevar la directiva `worker_connections` de Nginx de 1024 a 4096 para permitir que el proxy procese miles de sockets concurrentes de Artillery de forma nativa.

---

### Componente 4: Suite de Stress Test (Artillery)

#### [MODIFY] [stress-test.yml](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/tests/stress/stress-test.yml)
Configurar Artillery para inyectar automáticamente el header de bypass seguro `x-stress-bypass` en todos los escenarios concurrentes.

#### [MODIFY] [run-stress.sh](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/tests/stress/run-stress.sh)
Simplificar el script eliminando las escrituras en caliente de archivos `.env` (preservando inodos y evitando corrupciones) ya que todo se validará a través del token de bypass seguro y dinámico en memoria.

---

## Plan de Verificación

### Pruebas de Carga Sostenida
1. Reconstruir los servicios optimizados:
   ```bash
   docker compose up --build -d
   ```
2. Ejecutar la suite completa de estrés:
   ```bash
   ./gde_backend/tests/stress/run-stress.sh
   ```
3. Verificar que Artillery reporte:
   - **`http.codes.2xx`**: 100% de tasa de éxito.
   - **`http.codes.429`**: `0` respuestas.
   - **`http.response_time`**: Menor a 25ms promedio para transacciones complejas.
