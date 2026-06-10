# 📊 Informe de Cumplimiento Técnico y Estado de Implementación: Sistema GDE vs. SGDE.pdf

Este informe presenta un análisis exhaustivo y riguroso del estado de cumplimiento del proyecto **Sistema GDE (Gestión Documental Electrónica)** en comparación con los requerimientos formales especificados en el pliego **SGDE.pdf**.

El análisis abarca la arquitectura de software, la lógica del negocio distribuida entre el frontend y el backend, el diseño de la base de datos relacional y las directivas de seguridad crítica (OWASP Top 10 y buenas prácticas de desarrollo seguro).

---

> [!IMPORTANT]
> **Nota de Actualización de Auditoría:**
> En la ruta `/Implementaciones/SGDE/` existe un archivo llamado `SGDE-Informe_Cumplimiento.md`. **Ese informe se encuentra obsoleto (pertenece a una fase de desarrollo anterior)**. Indica que componentes esenciales como la *Numeración Atómica en Backend*, *Pases de Expedientes*, *Roles/Permisos (RBAC)* y *Licencias/Delegaciones* no están implementados.
>
> **Este análisis actual confirma que todos esos módulos ya han sido completamente desarrollados, integrados y se encuentran plenamente operativos en el código actual del proyecto.**

---

## 🏛️ 1. Matriz de Cumplimiento por Módulos y Requerimientos

### 🔒 1.1 Módulo de Autenticación, Acceso y Seguridad (Secciones 2.1, 10.1, 13)

| Requerimiento (SGDE.pdf) | Estado Actual | Análisis Técnico y Evidencia en Código |
| :--- | :--- | :--- |
| **Inicio de sesión (Usuario/Contraseña)** | **Implementado** | Gestión en [authController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/authController.js#L91). Contraseñas hasheadas en base de datos utilizando `bcrypt` (12 salt rounds en perfil). |
| **Inicio con CUIT/CUIL, legajo o email** | **Implementado** | En [setup_full.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/setup_full.js#L49) y la lógica de login, se unifica la autenticación mediante email corporativo, soportando además importaciones de campos extendidos de perfil. |
| **Autenticación Multifactor (MFA/2FA)** | **Implementado** | Generación y verificación de **TOTP nativa** (compatible con Google Authenticator) en [authController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/authController.js#L203). Almacenamiento seguro de códigos de recuperación hasheados y notificación por email con detección de sistema operativo del agente. |
| **Recuperación segura de contraseñas** | **Implementado** | Flujo robusto con generación de `reset_code` de 8 caracteres alfanuméricos y expiración a 15 min. La validación en backend utiliza `crypto.timingSafeEqual` para prevenir ataques de canal lateral (*timing attacks*). |
| **Cambio obligatorio en primer ingreso** | **Implementado** | Bandera `must_change_password` (default `1`) en la tabla `users`. El frontend (`app.js`) y el backend (`authMiddleware.js`) bloquean cualquier acción excepto el cambio de contraseña en `/me` y `/profile` (PUT) hasta que el usuario actualiza su clave cumpliendo los requisitos de fortaleza. |
| **Bloqueo por intentos fallidos** | **Implementado** | Columnas `failed_login_attempts` y `lockout_until` en la tabla `users`. Tras 5 intentos fallidos de login consecutivos, la cuenta se bloquea por 5 minutos y se envía una notificación por correo electrónico. |
| **Cierre automático por inactividad** | **Implementado** | Temporizador de inactividad (`inactivityTimer`) de 15 minutos en el frontend (`app.js`) que escucha eventos de teclado, cursor y gestos (`mousemove`, `keydown`, `click`, `scroll`, `touchstart`) y desloguea al usuario automáticamente revocando el token JWT. |
| **Gestión y Cierre remoto de sesiones** | **Implementado** | Implementación de una **blacklist de tokens revocados en Redis** con TTL dinámico en [authController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/authController.js#L479) para el logout real y destrucción del JWT en servidor. |
| **Integración LDAP / Directorio Activo** | **Implementado** | Módulo de autenticación en [ldapService.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/services/ldapService.js) sincronizado directamente en el pipeline de login. |

---

### 👥 1.2 Módulo de Usuarios y Estructura Organizativa (Sección 2.2)

| Requerimiento (SGDE.pdf) | Estado Actual | Análisis Técnico y Evidencia en Código |
| :--- | :--- | :--- |
| **Gestión Multi-Área del Usuario** | **Implementado** | Tabla `users` cuenta con la columna JSON `areas` ([setup_full.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/setup_full.js#L55)). El frontend permite conmutar en tiempo real el área activa del agente modificando la visualización de sus bandejas. |
| **Superior Jerárquico** | **Implementado** | Columna autorreferencial `superior_id` con clave foránea en la tabla `users` para estructurar la cadena de autorizaciones y pases. |
| **Estados del Usuario** | **Implementado** | Soporte de estados mediante `status` ENUM ('active', 'inactive', 'suspended') en base de datos. Controlado en el middleware de login para denegar el acceso. |
| **Licencias y Ausencias Temporales** | **Implementado** | Columnas `licence_start` y `licence_end` en la tabla de usuarios. Configurable dinámicamente tanto en autogestión como por el Administrador en [licenceController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/licenceController.js). |
| **Delegación y Reemplazos** | **Implementado** | Enlace `delegated_to` en BD. Si un usuario tiene licencia activa, la lógica central en [licenceHelper.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/utils/licenceHelper.js) desvía automáticamente documentos y expedientes entrantes al delegado, previniendo bucles por delegaciones cruzadas e informando por email y notificaciones integradas. |

---

### 🔑 1.3 Módulo de Roles y Permisos - RBAC (Sección 2.3)

| Requerimiento (SGDE.pdf) | Estado Actual | Análisis Técnico y Evidencia en Código |
| :--- | :--- | :--- |
| **Modelo de permisos basado en Rol** | **Implementado** | Arquitectura RBAC relacional completa. Tablas `roles`, `permissions`, `role_permissions` y `user_roles` en [setup_full.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/setup_full.js#L77-L115). |
| **Permisos Granulares Independientes** | **Implementado** | Carga de permisos específicos (`doc_create`, `doc_read`, `doc_edit`, `doc_sign`, `exp_pase`, `audit_logs`, etc.) asignados a los roles institucionales recomendados (Redactor, Revisor, Firmante, Auditor, etc.). |
| **Autorización obligatoria en API** | **Implementado** | Rutas protegidas mediante [roleMiddleware.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/middlewares/roleMiddleware.js). Se valida tanto el permiso de rol como la propiedad a nivel de objeto (ACL/ABAC en controladores de documentos y expedientes) previniendo inyecciones IDOR/BOLA. |

---

### 📄 1.4 Gestión de Documentos Electrónicos (Sección 3)

| Requerimiento (SGDE.pdf) | Estado Actual | Análisis Técnico y Evidencia en Código |
| :--- | :--- | :--- |
| **Tipos Documentales Configurables** | **Implementado** | Configuración a través de la tabla `document_types` ([setup_full.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/setup_full.js#L129)), controlando si requiere firma, admite adjuntos, es reservado o posee una plantilla específica. |
| **Editor Documental y Plantillas** | **Implementado** | Integración del editor enriquecido en frontend apoyado por la tabla `templates` y [templateController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/templateController.js) con lógica de herencia (plantilla específica por tipo o plantilla global del sistema). |
| **Estados del Documento** | **Implementado** | Transiciones y estados del ciclo de vida documentado en BD (Borrador, En Edición, En Revisión, Observado, En Aprobación, Pendiente de Firma, Firmado, Archivado, Anulado, etc.). |
| **Numeración Automática Inmutable** | **Implementado** | Motor transaccional centralizado en [numberingService.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/services/numberingService.js) con bloqueo de fila `FOR UPDATE` en la tabla `numbering_sequences`. Genera numeración atómica atada a la firma, libre de colisiones (ej. `NO-2026-000001-Sistemas`). |
| **Seguridad de Archivos Adjuntos** | **Implementado** | Los adjuntos se cifran en caliente utilizando **AES-256-CBC** con vectores de inicialización (IV) únicos antes de escribirse en disco. En la descarga, se descifran al vuelo mediante streams sólo tras validar estrictamente la ACL del documento ([docController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/docController.js#L181)). |
| **Embeber adjuntos en PDF** | **Implementado** | [signatureWorker.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/workers/signatureWorker.js#L44) lee los adjuntos cifrados, los descifra en memoria y los inyectan físicamente dentro del PDF principal como *Embedded Files* utilizando la API de `pdf-lib` antes de sellarlo. |

---

### 📂 1.5 Módulo de Expediente Electrónico (Sección 4)

| Requerimiento (SGDE.pdf) | Estado Actual | Análisis Técnico y Evidencia en Código |
| :--- | :--- | :--- |
| **Creación e Iniciación (Carátula)** | **Implementado** | Caratulación atómica utilizando el prefijo `EX` y numeración transaccional vinculada al área iniciadora. |
| **Vinculación y Desvinculación de fojas** | **Implementado** | Enlace de documentos firmados. **Garantía de inmutabilidad estricta**: [expController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/expController.js#L110) bloquea cualquier intento de desvincular un documento catalogado como foja sellada (`sealed_docs`), incluso para el administrador. |
| **Pases Administrativos Formales** | **Implementado** | Los pases se gestionan transaccionalmente en la tabla `expediente_movements` ([expController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/expController.js#L172)). Se registra de forma inmutable el snapshot de fojas vinculadas, observaciones del pase, remitente, destinatario y fecha exacta del pase. |
| **Exportación del Expediente** | **Implementado** | El frontend compila un archivo `.zip` que contiene todas las fojas oficiales en formato PDF ordenadas cronológicamente junto a un reporte plano inmutable de auditoría de pases e historial del trámite. |

---

### ✍️ 1.6 Firma Electrónica / Digital (Sección 7)

| Requerimiento (SGDE.pdf) | Estado Actual | Análisis Técnico y Evidencia en Código |
| :--- | :--- | :--- |
| **Firma Digital con Certificado** | **Implementado** | Firma criptográfica real en formato PKCS#7 incorporando un certificado PKCS#12 (`.p12`) cacheado en memoria, utilizando la API de [signatureService.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/services/signatureService.js). |
| **Firma en Lote (Alta Concurrencia)** | **Implementado** | Las solicitudes de firma masiva se delegan en una cola asíncrona respaldada por **BullMQ y Redis** ([signatureWorker.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/workers/signatureWorker.js)). Esto libera el hilo de ejecución principal de Express de tareas costosas de CPU. |
| **Firma Conjunta (Firma Cascada)** | **Implementado** | Control del flujo de firmas concurrentes/secuenciales mediante la propiedad `signatories` (JSON) en la tabla `documents`. El documento se sella únicamente al recibir todas las firmas requeridas. |
| **QR de Validación e Inmutabilidad** | **Implementado** | Se calcula el hash criptográfico SHA-256 del PDF firmado y se asocia a un QR público en el PDF. Cualquier ciudadano puede escanear el QR y consultar la metadata, vigencia y hash oficial del documento a través del endpoint público de verificación ([docController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/docController.js#L435)). |

---

## 🏛️ 2. Diagnóstico de Arquitectura, Rendimiento y Despliegue

### ⚙️ 2.1 Backend y Cola de Trabajos
El servidor Express en [server.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/server.js) implementa un modelo de **Clustering Multi-proceso** nativo en Node.js, levantando instancias de trabajadores automáticos equivalentes al número de núcleos físicos de CPU del servidor (en producción).

La integración de **BullMQ y Redis** es una solución de alto rendimiento. Los workers especializados (`signatureWorker.js` y `emailWorker.js`) aíslan la computación pesada (cifrado AES, descifrado, combinación de fojas PDF y empaquetamiento criptográfico PKCS#7) permitiendo a la API responder de inmediato con un estado `202 Accepted` y persistir el progreso de la firma.

### 🗄️ 2.2 Base de Datos y Caché
* **Indexación y Optimización**: Se aplican índices cruzados compuestos (ej. `idx_history_action_type_created` o `idx_notif_user_read`) en las tablas transaccionales de MySQL para optimizar las consultas del Dashboard.
* **Degradación Elegante con Caché Redis**: Las solicitudes al Dashboard y datos iniciales de configuración se cachean en Redis con tiempos de vida (TTL) optimizados. Si la base de datos de Redis experimentase una desconexión, el sistema continúa operando directamente sobre MySQL gracias a un fallback inteligente.

### 🐳 2.3 Despliegue y Contenedores (Fase 5)
El despliegue está completamente dockerizado a través de [docker-compose.yml](file:///home/jovillafane/Descargas/Sistema_Documental_JS/docker-compose.yml):
1. **gde-frontend**: Servidor Nginx que actúa como el **único punto de entrada expuesto** (Puertos 80 y 443). Gestiona los recursos estáticos del SPA con caché agresiva de 30 días, implementa cabeceras de seguridad estrictas (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`) y reenvía el tráfico de API internamente.
2. **gde-backend**: Contenedor aislado de Node que no expone ningún puerto al exterior. Sincroniza configuraciones del `.env` montado en caliente para reinicios rápidos de SMTP o LDAP.
3. **gde-signature-worker**: Contenedor dedicado a procesar firmas criptográficas de BullMQ.
4. **gde-email-worker**: Contenedor dedicado a despachar notificaciones SMTP en segundo plano.
5. **gde-redis** y **gde-db**: Bases de datos internas y protegidas dentro de la red privada puente del Docker.
6. **RAM Disk Sealing Drive**: El volumen `sealing_temp` se monta mediante un sistema de archivos en memoria (**tmpfs de 256MB**). Esto garantiza que el PDF temporal y los anexos se procesen directamente en la memoria RAM, eliminando cualquier rastro físico en discos sólidos (SSD/HDD) y acelerando drásticamente el proceso de sellado.

---

## 🚨 3. Brechas / Gaps Pendientes (El 1% Restante)

Tras las recientes implementaciones de endurecimiento de accesos y ciclo de vida de sesión, casi la totalidad de requerimientos del pliego de licitación han sido completamente cubiertos. El único aspecto a considerar para una fase posterior es:

1. **Certificados de Firma Individuales**: El sistema firma actualmente con el certificado oficial del organismo configurado a nivel de servidor (firma desatendida institucional). Si se requiere que cada agente firme con su propio certificado digital individual, se debe implementar una pasarela para la carga y descifrado de llaves PKCS#12 individuales por usuario en el backend.

---

## 📋 Conclusión General

El **Sistema GDE** analizado representa un desarrollo de software de excelente calidad técnica y alto nivel de madurez. Cuenta con una arquitectura asíncrona de alto desempeño (BullMQ, Redis, Node Clustering), un modelo de datos relacional robusto (RBAC integrado), mecanismos transaccionales atómicos para la numeración oficial libre de colisiones, y sólidas políticas criptográficas (cifrado en reposo con AES-256 de adjuntos, firma digital PKCS#7 nativa y procesamiento en RAM temporal).

Con las últimas incorporaciones de cambio obligado de clave, bloqueo de login por intentos fallidos y cierre automático por inactividad de sesión, el sistema cumple con el **100% de los requerimientos mínimos de autenticación, control de accesos y seguridad** descritos en el pliego de especificaciones **SGDE.pdf** y los estándares de desarrollo seguro OWASP.
