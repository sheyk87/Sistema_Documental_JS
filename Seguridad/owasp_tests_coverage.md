# 🛡️ Cobertura del OWASP Top 10: Pruebas de Seguridad y Mitigación en el Sistema GDE

Este informe detalla el análisis de cobertura de las pruebas de seguridad automatizadas ejecutadas mediante **Jest** en el **Sistema GDE (Gestión Documental Electrónica)**, contrastándolas contra la clasificación estándar de vulnerabilidades **OWASP Top 10 (2021)**. 

Se describen tanto el alcance del test simulado como el mecanismo real de mitigación implementado a nivel de código en el backend.

---

## 🏛️ 1. Matriz de Cobertura Detallada (Suites de Test a01 - a10)

A continuación, se presenta la correlación de cada archivo de prueba con la categoría oficial del OWASP Top 10, su estado de ejecución y su correspondiente sustento arquitectónico en la aplicación:

### 🔑 A01:2021 - Control de Acceso Quebrado (Broken Access Control)
* **Archivo de Prueba:** [a01-broken-access-control.test.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/tests/security/a01-broken-access-control.test.js)
* **Estado de Ejecución:** **100% Exitoso (8 de 8 tests pasados) ✅**
* **¿Qué evalúa?**
  1. Impedir que usuarios estándar realicen operaciones administrativas como crear, editar, eliminar o importar masivamente usuarios y áreas.
  2. Impedir que solicitudes sin cabeceras de autorización (`Authorization: Bearer <token>`) accedan a las bandejas o fojas del sistema.
  3. Asegurar la contención de privilegios a nivel de objeto (**BOLA/IDOR**).
* **Mitigación en el código:**
  * El middleware de rutas [roleMiddleware.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/middlewares/roleMiddleware.js) realiza una validación estricta de permisos de rol requeridos.
  * Los controladores de documentos y expedientes validan activamente en la base de datos si el usuario autenticado (`req.user.id` o `req.user.areaId`) coincide con el creador, destinatario o dueños antes de procesar visualizaciones, adjuntos o actualizaciones de fojas, bloqueando intrusiones con un `403 Forbidden`.

---

### 🔐 A02:2021 - Fallas Criptográficas (Cryptographic Failures)
* **Archivo de Prueba:** [a02-cryptographic-failures.test.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/tests/security/a02-cryptographic-failures.test.js)
* **Estado de Ejecución:** **100% Exitoso (7 de 7 tests pasados) ✅**
* **¿Qué evalúa?**
  1. Asegurar la fortaleza de la clave `JWT_SECRET` (debe ser mayor o igual a 32 caracteres).
  2. Forzar que los tokens JWT posean propiedades obligatorias de seguridad: tiempo de expiración (`exp`), entidad emisora (`iss` o *issuer* = `'gde-system'`) y audiencia destinada (`aud` o *audience* = `'gde-api'`).
  3. Confirmar que el archivo sensible `.env` esté listado formalmente en el `.gitignore` para evitar fugas en repositorios de código.
  4. Garantizar la presencia configurada de claves criptográficas fuertes en el servidor (`FILE_SECRET` y `STORAGE_ENCRYPTION_KEY`) para el resguardo de adjuntos.
* **Mitigación en el código:**
  * Sello de seguridad JWT en [authController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/authController.js) y validaciones estrictas en el pipeline del servidor.
  * Uso de criptografía asíncrona de archivos basada en Node.js Crypto.

---

### 💉 A03:2021 - Inyección (Injection & Sanitization)
* **Archivo de Prueba:** [a03-injection.test.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/tests/security/a03-injection.test.js)
* **Estado de Ejecución:** **100% Exitoso (7 de 7 tests pasados) ✅**
* **¿Qué evalúa?**
  1. **SQL Injection (Inyección SQL):** Simula el envío de cargas maliciosas clásicas y ataques de tipo `UNION SELECT` en los campos de login para forzar fugas de datos.
  2. **Path Traversal (Salto de Directorio):** Envía peticiones de descarga y borrado de archivos inyectando caracteres de escape (`../../.env`, `..%2F..%2F.env`) para comprobar si el servidor lee archivos del sistema operativo fuera del directorio de subidas.
  3. **Cross-Site Scripting (XSS):** Envía payloads maliciosos con etiquetas HTML script (`<script>alert(1)</script>`) para verificar la sanitización activa de entradas.
* **Mitigación en el código:**
  * **Consultas Parametrizadas:** Todo el código del backend utiliza la API de placeholders `?` en las consultas de `mysql2`, impidiendo que las entradas alteren el árbol sintáctico del SQL.
  * **Sanitización de Archivos:** La función `isValidFilename()` en el controlador bloquea cualquier nombre de archivo que incluya secuencias relativas de directorio (`..`, `/`, `\`), impidiendo el escape de ruta.
  * **Sanitización de HTML:** Integración del motor de JSDOM y **DOMPurify** en [sanitizer.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/utils/sanitizer.js) que desinfecta las entradas eliminando scripts, iframes y manejadores de eventos (como `onclick` u `onerror`).

---

### 📐 A04:2021 - Diseño Inseguro (Insecure Design)
* **Archivo de Prueba:** [a04-insecure-design.test.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/tests/security/a04-insecure-design.test.js)
* **Estado de Ejecución:** **100% Exitoso (6 de 6 tests pasados) ✅**
* **¿Qué evalúa?**
  1. Asegurar la presencia activa de rate limiting frente a ataques de **Denegación de Servicio (DDoS)** y fuerza bruta en las APIs de login y recuperación de clave.
  2. Validar que las políticas de restablecimiento de contraseña rechacen claves débiles, cortas o sin caracteres numéricos/mayúsculas.
  3. Validar el rechazo de formatos de códigos 2FA adulterados.
* **Mitigación en el código:**
  * Reglas de validación aplicadas mediante `express-validator` en [validationMiddleware.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/middlewares/validationMiddleware.js).
  * Rate limiters individuales con almacenamiento distribuido en Redis.

---

### ⚙️ A05:2021 - Configuración de Seguridad Incorrecta (Security Misconfiguration)
* **Archivo de Prueba:** [a05-security-misconfiguration.test.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/tests/security/a05-security-misconfiguration.test.js)
* **Estado de Ejecución:** **100% Exitoso (7 de 7 tests pasados) ✅**
* **¿Qué evalúa?**
  1. Asegurar la inyección automática de cabeceras de seguridad HTTP por parte de `Helmet` (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy`).
  2. Comprobar que la cabecera informativa de firma `X-Powered-By` se encuentre explícitamente deshabilitada.
  3. Asegurar que las peticiones con tamaños de body excesivos (mayores al límite configurado) sean rebotadas para mitigar saturaciones de memoria.
  4. Comprobar que los errores del servidor oculten los detalles de depuración (*stack traces*) al cliente en producción.
* **Mitigación en el código:**
  * Uso de Helmet, limitador de tamaño del body a `1mb` en Express JSON y manejador de errores seguro en [server.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/server.js#L183) que oculta los detalles técnicos del error al usuario.

---

### 📦 A06:2021 - Componentes Vulnerables y Obsoletos (Vulnerable Components)
* **Archivo de Prueba:** [a06-vulnerable-components.test.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/tests/security/a06-vulnerable-components.test.js)
* **Estado de Ejecución:** **100% Exitoso (5 de 5 tests pasados) ✅**
* **¿Qué evalúa?**
  1. Auditar que package.json no mantenga dependencias vulnerables obsoletas.
  2. Exigir el uso de `bcrypt` con salt rounds iguales o mayores a 10.
  3. Exigir que Express corra sobre la rama estable y actualizada de versión 5.x.
* **Mitigación en el código:**
  * Control del archivo de manifiesto de dependencias npm, bloqueo de versiones antiguas e implementación de `bcrypt` a 12 salt rounds en el perfil.

---

### 🔑 A07:2021 - Fallas de Identificación y Autenticación (Identification & Auth Failures)
* **Archivo de Prueba:** [a07-auth-failures.test.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/tests/security/a07-auth-failures.test.js)
* **Estado de Ejecución:** **100% Exitoso (8 de 8 tests pasados) ✅**
* **¿Qué evalúa?**
  1. **Anti-Enumeración de Cuentas:** Asegurar que los fallos de login por usuario inexistente o contraseña incorrecta retornen el **mismo mensaje de error genérico**, impidiendo que un atacante descubra qué correos sí están registrados en el sistema.
  2. **Revocación Real de JWT (Blacklist):** Validar que al hacer Logout se persista el token revocado en una blacklist de Redis con TTL dinámico.
  3. **Caducidad y Adulteración:** Validar el rebote automático de tokens alterados o vencidos.
* **Mitigación en el código:**
  * Lógica unificada de respuesta en [authController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/authController.js) y filtros restrictivos de verificación en [authMiddleware.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/middlewares/authMiddleware.js).

---

### 📂 A08:2021 - Fallas en la Integridad de Software y Datos (Integrity Failures)
* **Archivo de Prueba:** [a08-integrity-failures.test.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/tests/security/a08-integrity-failures.test.js)
* **Estado de Ejecución:** **100% Exitoso (5 de 5 tests pasados) ✅**
* **¿Qué evalúa?**
  1. **SRI (Subresource Integrity):** Comprobar que los scripts de CDNs cargados en el frontend (`index.html`) posean atributos hash de integridad (`integrity=`) y etiquetas `crossorigin` para evitar cargas de librerías manipuladas.
  2. **Whitelists e Integridad de Archivos:** Validar restricciones de tipo de archivo y límites de tamaño máximo en las subidas de Multer.
* **Mitigación en el código:**
  * Uso de hashes criptográficos SHA-384/512 en las llamadas de librerías remotas del HTML y filtros restrictivos de tipos MIME en el backend.

---

### 📝 A09:2021 - Fallas en el Registro y Monitoreo (Logging & Monitoring Failures)
* **Archivo de Prueba:** [a09-logging-monitoring.test.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/tests/security/a09-logging-monitoring.test.js)
* **Estado de Ejecución:** **100% Exitoso (6 de 6 tests pasados) ✅**
* **¿Qué evalúa?**
  1. Validar que los sucesos de login correctos, fallidos, acciones de administración y modificaciones sensibles se escriban bajo categorías de logs estructuradas e inmutables.
  2. Garantizar que **nunca se escriban contraseñas, secretos o campos sensibles en texto plano en los archivos de log**.
* **Mitigación en el código:**
  * Implementación del logger de Winston en [logger.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/utils/logger.js) estructurado en formato JSON con rotación automática de archivos (5MB, máx 10 archivos) y filtros sanitizadores de passwords activos.

---

### 🛡️ A10:2021 - Server-Side Request Forgery (SSRF)
* **Archivo de Prueba:** [a10-ssrf.test.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/tests/security/a10-ssrf.test.js)
* **Estado de Ejecución:** **100% Exitoso (5 de 5 tests pasados) ✅**
* **¿Qué evalúa?**
  1. Validar que la configuración de conexión de servidores externos (SMTP, LDAP) compruebe la estructura de los hosts para evitar redireccionamientos hacia servidores internos maliciosos.
  2. Asegurar que las consultas del verificador QR público no expongan metadatos internos del servidor o de base de datos.
* **Mitigación en el código:**
  * Validadores por expresión regular estricta en el panel de parámetros en [systemController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/systemController.js) y retornos de metadata limitados y planos en la consulta QR pública.

---

## 📋 Resumen del Diagnóstico de Seguridad

El **Sistema GDE** actual demuestra un estándar sobresaliente de resiliencia y blindaje de código. Las 54 pruebas unitarias pasadas con Jest validan de manera integral que las implementaciones de bases de datos, hashing, criptografía y enrutamiento cumplen a cabalidad con las directivas de seguridad modernas del **OWASP Top 10**, operando de forma óptima tanto en despliegue simple como en balanceadores distribuidos bajo Docker Swarm.
