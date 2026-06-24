# Informe de Parámetros y Configuraciones del Sistema GDE

Este documento contiene un desglose completo de todas las configuraciones, límites, políticas de contraseñas y tiempos de expiración definidos en la plataforma de Gestión Documental Electrónica (GDE).

---

## 1. Límites de Archivos Adjuntos

Estas políticas restringen las cargas de archivos en el sistema para cumplir con los estándares de integridad y seguridad de almacenamiento (OWASP A08).

| Parámetro / Límite | Valor Actual | Tipo de Configuración | Archivo de Origen | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| **Tamaño Máximo de Archivo** | `10 MB` (`10 * 1024 * 1024` bytes) | Código Duro (Multer Config) | [docRoutes.js:L51](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/routes/docRoutes.js#L51) | Restricción física en la carga de archivos adjuntos y documentos PDF a firmar. Si se excede, retorna código 400. |
| **Tipos MIME Permitidos (`ALLOWED_MIME_TYPES`)** | PDF, Imágenes (JPEG, PNG, GIF, WebP), MS Word, MS Excel, MS PowerPoint, TXT, CSV, ZIP, RAR | Código Duro (Array de Whitelist) | [docRoutes.js:L12](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/routes/docRoutes.js#L12) | Lista blanca de tipos de archivos que el middleware Multer aceptará bajo validación normal. |
| **Extensiones Permitidas (`ALLOWED_EXTENSIONS`)** | `.pdf`, `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.txt`, `.csv`, `.zip`, `.rar` | Código Duro (Lista blanca de extensiones) | [docRoutes.js:L22](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/routes/docRoutes.js#L22) | Lista blanca estricta de extensiones autorizadas en el sistema. Los archivos con cualquier otra extensión son rechazados inmediatamente. |
| **Extensiones Bloqueadas (`BLOCKED_EXTENSIONS`)** | `.exe`, `.bat`, `.cmd`, `.com`, `.msi`, `.scr`, `.pif`, `.js`, `.vbs`, `.wsf`, `.ps1`, `.sh`, `.php`, `.py`, `.dll`, `.sys`, `.drv`, `.cpl` | Código Duro (Array de Blacklist) | [docRoutes.js:L30](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/routes/docRoutes.js#L30) | Lista negra estricta de extensiones ejecutables o con scripts potenciales. Bloquea la subida en última instancia por motivos de seguridad. |

### Mecanismo de Validación de Archivos Adjuntos (Fallback de Mime Types en Linux)
Para evitar bloqueos innecesarios en navegadores sobre sistemas operativos Linux (los cuales suelen carecer de asociaciones para formatos de Microsoft Office y envían los archivos bajo tipos MIME genéricos o de empaquetado/contenedores antiguos):
1. **Control de Extensión Primario**: Se comprueba primero que la extensión del archivo a subir se encuentre en la lista de extensiones autorizadas (`ALLOWED_EXTENSIONS`).
2. **Control de Tipo MIME Secundario**: Si el tipo MIME del archivo es el oficial, se permite. Adicionalmente, se permite la subida si el tipo MIME es genérico o pertenece a clasificaciones alternativas/genéricas de documentos (e.g., `application/octet-stream`, `application/x-zip-compressed`, `binary/octet-stream`, `application/vnd.ms-office`, `application/x-ms-office`, `application/x-ole-storage`, `application/cdfv2`, `application/x-cdf`, `application/zip`, `application/x-zip`, `application/rar`, `application/x-rar`, tipos que inicien con `application/vnd.openxmlformats-officedocument` o `application/vnd.ms-`, o bien si el tipo MIME viene vacío), **únicamente si la extensión coincide con un formato autorizado de la lista blanca** (como `.docx`, `.xlsx`, `.doc`, `.xls` o `.zip`). Esto impide la inyección de ejecutables con mimetypes alterados a la vez que asegura total compatibilidad.
3. **Mapeo de Errores Multer a 400**: El middleware de carga en [docRoutes.js:L106](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/routes/docRoutes.js#L106) intercepta de forma local los errores de validación de extensión o tamaño máximo de Multer, devolviendo una respuesta con código `400 Bad Request` y el mensaje de error correspondiente para que el frontend pueda informarlo de manera amigable en la interfaz de usuario en lugar de colapsar con un error 500 genérico.

---

## 2. Parámetros de la Base de Datos (MySQL Connection Pool)

Opciones para afinar la concurrencia y el rendimiento del servidor de base de datos MySQL.

| Parámetro / Límite | Valor Actual / Defecto | Tipo de Configuración | Archivo de Origen | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| **Límite de Conexiones del Pool (`DB_POOL_LIMIT`)** | `150` (Por defecto) | Variable de Entorno | [db.js:L12](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/config/db.js#L12) | Máximo número de conexiones TCP simultáneas que el pool mantendrá abiertas con MySQL. Se puede configurar en el archivo `.env`. |
| **Límite de la Cola del Pool (`queueLimit`)** | `0` (Ilimitado) | Código Duro | [db.js:L13](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/config/db.js#L13) | Número de solicitudes que pueden esperar en cola cuando no hay conexiones disponibles en el pool. Al ser `0`, no rechaza peticiones prematuramente. |
| **Keep-Alive inicial** | `30000` ms (30 segundos) | Código Duro | [db.js:L15](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/config/db.js#L15) | Frecuencia de envío de paquetes ping de bajo nivel en las conexiones inactivas para evitar cierres abruptos por cortafuegos o timeouts del host MySQL. |

---

## 3. Políticas y Seguridad de Contraseñas

Reglas que gobiernan el ciclo de vida y la robustez de las contraseñas en el sistema.

| Parámetro / Límite | Valor Actual | Tipo de Configuración | Archivo de Origen | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| **Longitud Mínima** | `8` caracteres | Código Duro | [userController.js:L253](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/userController.js#L253) | Validación en el controlador de usuarios antes de procesar el hash Bcrypt (aplica al crear/actualizar). |
| **Historial de Contraseñas Recordadas** | `10` contraseñas anteriores | Código Duro (Query + Pruning) | [passwordSecurity.js:L9](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/utils/passwordSecurity.js#L9) | Impide que el usuario vuelva a reutilizar cualquiera de sus últimas 10 contraseñas al cambiarla desde perfil o tras un restablecimiento. |
| **Reseteos de Contraseña por Día** | Máximo `5` por día | Código Duro | [passwordSecurity.js:L57](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/utils/passwordSecurity.js#L57) | Limita la cantidad de veces al día que un mismo usuario puede realizar un cambio exitoso de contraseña mediante recuperación por mail. |

---

## 4. Tiempos de Expiración, Sesión y Bloqueos

Límites temporales y protecciones de autenticación para mitigar ataques de fuerza bruta y accesos no autorizados.

| Parámetro / Límite | Valor Actual | Tipo de Configuración | Archivo de Origen | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| **Validez del Código OTP por Mail** | `15` minutos | Código Duro | [authController.js:L453](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/authController.js#L453) | Tiempo de validez del código alfanumérico temporal generado tras pulsar en "Olvidé mi contraseña". |
| **Errores de Login antes del Bloqueo** | `5` intentos fallidos | Código Duro | [authController.js:L153](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/authController.js#L153) | Cantidad de contraseñas incorrectas consecutivas permitidas antes de congelar temporalmente la cuenta del usuario. |
| **Duración del Bloqueo Temporal** | `5` minutos | Código Duro | [authController.js:L154](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/authController.js#L154) | Período durante el cual la cuenta se mantendrá inaccesible. Adicionalmente, el sistema envía un correo de alerta de seguridad al usuario de forma opcional. |
| **Duración del Token de Sesión (JWT)** | `10` horas (`10h`) | Código Duro | [authController.js:L224](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/authController.js#L224) | Período de expiración del token firmado que viaja en las cabeceras HTTP. Después de este tiempo, el usuario debe reautenticarse. |
| **Token Temporal 2FA** | `5` minutos (`5m`) | Código Duro | [authController.js:L204](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/authController.js#L204) | Tiempo de vida del token temporal generado tras validar credenciales exitosamente, usado únicamente para completar el paso del código 2FA. |
| **Tiempo de Inactividad del Usuario** | `15` minutos | Código Duro (Frontend JS) | [app.js:L119](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_frontend/app.js#L119) | Cronómetro en frontend que monitorea eventos (mouse, teclado, clicks). Si no se detectan movimientos en 15 minutos, destruye la sesión y redirige al login. |

---

## 5. Controles de Rate Limiting (Fuerza Bruta)

Limitadores de peticiones basados en Redis que protegen los recursos del sistema frente a ataques de denegación de servicio distribuidos (DDoS) o búsquedas automáticas de contraseñas.

* **Ubicación de Implementación**: [rateLimiter.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/middlewares/rateLimiter.js)

| Middleware Limiter | Ventana de Tiempo | Peticiones Máximas | Acción / Descripción |
| :--- | :--- | :--- | :--- |
| **`loginLimiter`** | `15 minutos` | `10` intentos | Límite por dirección IP para llamadas al endpoint de inicio de sesión `/api/auth/login`. |
| **`forgotPasswordLimiter`** | `15 minutos` | `5` intentos | Límite por dirección IP para solicitudes de envío de correo OTP de recuperación. |
| **`twoFactorLimiter`** | `5 minutos` | `5` intentos | Límite para llamadas al endpoint de validación de código de segundo factor 2FA. |
| **`apiLimiter`** | `15 minutos` | `200` llamadas | Límite de carga general por cliente para todas las peticiones a la API del backend. |
| **`publicLimiter`** | `15 minutos` | `30` consultas | Límite de verificación y consulta externa de expedientes y fojas públicas sin token. |

---

## 6. Configuración y Límites de ClamAV (Antivirus)

La configuración del motor de análisis antivirus ClamAV se realiza en un archivo dedicado y persistentente montado directamente en los contenedores.

* **Archivo de Configuración**: [clamd.conf](file:///home/jovillafane/Descargas/Sistema_Documental_JS/clamd.conf) en la raíz del proyecto.
* **Montaje en Contenedores**: 
  * Docker Compose Local: [docker-compose.yml:L178](file:///home/jovillafane/Descargas/Sistema_Documental_JS/docker-compose.yml#L178)
  * Docker Swarm Compose: [docker-compose.swarm.yml:L179](file:///home/jovillafane/Descargas/Sistema_Documental_JS/docker-compose.swarm.yml#L179)

| Directiva en `clamd.conf` | Valor por Defecto | Descripción |
| :--- | :--- | :--- |
| **`TCPSocket`** | `3310` | Puerto TCP en el que el demonio `clamd` escucha solicitudes de análisis del backend/workers. |
| **`TCPAddr`** | `0.0.0.0` | Dirección IP a la que se enlaza el puerto TCP de ClamAV para permitir conexiones en la red Docker. |
| **`LocalSocket`** | `/run/clamav/clamd.sock` | Socket Unix local. Es obligatorio definirlo para que el script `/init` de la imagen de Docker detecte que `clamd` inició con éxito y no falle por timeout. |
| **`MaxFileSize`** | `100M` | Tamaño máximo permitido para un archivo individual a escanear. Archivos mayores no serán analizados. |
| **`MaxScanSize`** | `400M` | Tamaño total de datos máximo a escanear en cada llamada o lote de análisis. |
| **`MaxFiles`** | `10000` | Cantidad máxima de archivos que ClamAV desempaquetará e inspeccionará dentro de un comprimido (.zip, .rar, etc.). |
| **`MaxRecursion`** | `17` | Límite máximo de recursión para abrir comprimidos anidados (ej. zip dentro de otro zip). |
| **`MaxEmbeddedPE`** | `40M` | Tamaño máximo permitido para binarios portables ejecutables (PE) incrustados dentro de otros archivos. |
| **`MaxHTMLNormalize`** | `40M` | Límite máximo de datos a procesar en la normalización de código HTML para análisis heurístico. |
| **`MaxHTMLNoTags`** | `8M` | Límite máximo de tamaño para texto HTML sin formato a analizar. |
| **`MaxScriptNormalize`** | `20M` | Límite máximo de tamaño para normalización de scripts (JS, VBS, etc.). |
| **`MaxZipTypeRcg`** | `1M` | Límite máximo de datos para el reconocimiento de tipos de archivo basados en cabeceras de compresión Zip. |
| **`MaxPartitions`** | `50` | Límite máximo de particiones en imágenes de disco que se inspeccionarán. |
| **`MaxIconsPE`** | `100` | Número máximo de iconos de ejecutables PE a extraer y contrastar contra firmas conocidas. |
| **`AlertExceedsMax`** | `no` | Si se establece en `yes`, ClamAV marcará como infectado/peligroso a cualquier archivo que exceda las directivas de tamaño configuradas. |
| **`SelfCheck`** | `600` | Intervalo de tiempo (en segundos) en el cual el motor antivirus realiza una comprobación interna de integridad y estado de la base de datos de firmas. |
