# Plan de Implementación: Sistema GDE vs. SGDE.pdf

Este documento detalla el plan técnico para subsanar los vacíos funcionales y las vulnerabilidades críticas de seguridad detectadas en el **Sistema GDE**, alineando la base de código actual (frontend, backend y base de datos) con el pliego formal **SGDE.pdf**.

---

## User Review Required

> [!IMPORTANT]
> **Modelo de Migración de Base de Datos**: 
> La introducción de un modelo formal de Roles y Permisos (RBAC) y la eliminación del `ENUM('admin', 'user')` en la tabla `users` requerirán una migración de datos que modifique registros existentes sin alterar las contraseñas hasheadas. Se propone un script de migración versionado (`migrations/migrate_rbac_and_sequences.js`) para evitar cualquier pérdida de datos en desarrollo o producción.

> [!WARNING]
> **Incompatibilidad de Numeración del Frontend**: 
> Al centralizar la numeración oficial en el backend de forma atómica para evitar colisiones de concurrencia, el frontend dejará de asignar números "provisorios" o inventados. Los borradores y documentos en trámite de firma circularán identificados estrictamente por su ID único interno hasta que se les asigne su número legal inmutable en el momento del sellado.

---

## Open Questions

> [!IMPORTANT]
> **Firma Digital Individual**:
> ¿Para el alcance de la Etapa 3 (Firma), continuaremos utilizando exclusivamente el certificado `.p12` global del servidor para la validación del sistema, o requerimos que en esta fase se diseñe la subida/asociación de certificados individuales para cada usuario firmante en la tabla `users`?

---

## Proposed Changes

Las modificaciones se dividen en 5 fases lógicas y secuenciales, estructuradas de forma que se garantice la integridad de la base de datos y la compatibilidad con el frontend reactivo en cada paso.

---

### Módulo de Base de Datos (MySQL Schema)

Se crearán las tablas relacionales para soportar la normalización de la seguridad, numeración atómica, pases administrativos y parametrización del negocio.

#### [NEW] [migrations/migrate_rbac_and_sequences.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/migrations/migrate_rbac_and_sequences.js)
Creación de script de base de datos para la definición de tablas y carga inicial:
* Tabla `roles`: `id VARCHAR(50) PK`, `name VARCHAR(100)`.
* Tabla `permissions`: `id VARCHAR(50) PK`, `name VARCHAR(100)`.
* Tabla `role_permissions`: `role_id FK`, `permission_id FK` (PK compuesta).
* Tabla `user_roles`: `user_id FK`, `role_id FK` (PK compuesta).
* Tabla `numbering_sequences`: `id INT AI PK`, `doc_type VARCHAR(50)`, `year INT`, `last_value INT` (Índice único compuesto `doc_type` + `year`).
* Tabla `expediente_movements`: `id VARCHAR(50) PK`, `expediente_id FK`, `sender_id FK`, `sender_area_id FK`, `receiver_id FK`, `receiver_area_id FK`, `notes TEXT`, `linked_docs_snapshot JSON`, `created_at DATETIME`.
* Tabla `document_types`: `code VARCHAR(10) PK`, `name VARCHAR(100)`, `requires_signature BOOLEAN`, `allows_attachments BOOLEAN`, `is_reserved BOOLEAN`.
* Tabla `templates`: `id VARCHAR(50) PK`, `doc_type VARCHAR(10) FK`, `name VARCHAR(100)`, `content TEXT`, `created_at DATETIME`.
* Modificación de la tabla `users`: Agregar campos `status ENUM('active', 'inactive', 'suspended') DEFAULT 'active'`, `superior_id VARCHAR(50) FK` (recursivo a `users.id`), `delegated_to VARCHAR(50) FK` (recursivo a `users.id`), `licence_start DATETIME`, `licence_end DATETIME`.

---

### Módulo de Seguridad y API (Fase 1 - Prioridad 1)

Solución al problema crítico **OWASP A01 (Broken Access Control / IDOR)** en el backend mediante un control a nivel de API REST.

#### [NEW] [middlewares/roleMiddleware.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/middlewares/roleMiddleware.js)
Reemplazo total del middleware para soportar RBAC granular basado en permisos:
* Crear función `checkPermission(requiredPermission)` que valide si el rol del token (o cargado en BD) posee el permiso solicitado en la tabla asociativa `role_permissions`.
* Crear función `checkDocumentAccess(action)` y `checkExpedienteAccess(action)` para validar de forma estricta:
  * Si el documento es borrador: Solo el creador original tiene acceso de lectura y escritura.
  * Si el documento está en firma: Solo los firmantes declarados en la lista de firmas pendientes tienen derecho a firmar/rechazar.
  * Si el documento está firmado/archivado: Solo el creador, destinatarios, integrantes de las áreas involucradas o auditores autorizados tienen derecho a ver su metadato y descargar su PDF.
  * Si el expediente es reservado (`is_public = 0`): Validar que el área activa del usuario esté en `auth_areas` o su ID de usuario en `auth_users` antes de permitir listado o consulta de fojas.

#### [MODIFY] [routes/docRoutes.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/routes/docRoutes.js)
Inyección de middlewares de autorización granular en endpoints sensibles:
* `GET /:id/content` ➔ `checkDocumentAccess('read')`
* `PUT /update/:id` ➔ `checkDocumentAccess('write')`
* `DELETE /delete/:id` ➔ `checkDocumentAccess('delete')`
* `POST /sign-final/:id` ➔ `checkDocumentAccess('sign')`

#### [MODIFY] [routes/expRoutes.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/routes/expRoutes.js)
Inyección de middlewares en endpoints de expedientes:
* `PUT /update/:id` ➔ `checkExpedienteAccess('write')`

---

### Módulo de Numeración Transaccional (Fase 2 - Prioridad 2)

Solución al problema **OWASP A08 (Data Integrity Failure)** mediante centralización y atomicidad de folios correlativos en MySQL.

#### [NEW] [services/numberingService.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/services/numberingService.js)
Creación de motor transaccional atómico:
* Función `getNextNumber(docType, areaId)`:
  * Ejecuta una transacción SQL con bloqueo de lectura (`SELECT last_value FROM numbering_sequences WHERE doc_type = ? AND year = ? FOR UPDATE`).
  * Si la secuencia no existe para el año actual, inserta la fila con valor inicial `1`.
  * Incrementa el contador en la BD (`UPDATE numbering_sequences SET last_value = last_value + 1 WHERE ...`).
  * Obtiene el nombre/código abreviado del área (`areas` table).
  * Formatea y retorna el número oficial atómico (ej: `NO-[AÑO]-[VALOR_SEIS_DIGITOS]-[ORGANISMO]-[AREA]`).
  * Garantiza atomicidad libre de colisiones ante peticiones simultáneas (concurrencia de firmas).

#### [MODIFY] [workers/signatureWorker.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/workers/signatureWorker.js)
El worker asume la asignación del número legal inmutable en el backend:
* Al dispararse el job de firma en background, se invoca a `numberingService.getNextNumber()` para calcular el folio único exacto en el momento del sellado.
* Se inyecta el número generado en los metadatos de firma y en el PDF antes de su encriptación y guardado.
* Se actualiza la base de datos con el número inmutable final.

#### [MODIFY] [gde_frontend/app.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_frontend/app.js)
Eliminación de la lógica de generación del número en la SPA:
* Remover la función `generateNumber` y los contadores en memoria (`state.db.counters`).
* Los documentos se enviarán al backend con campo `number = null` (Borradores).
* La interfaz mostrará "S/N (Borrador)" hasta que la API confirme el sellado final y retorne el número definitivo asignado por el servidor.

---

### Módulo de Pases de Expediente (Fase 3 - Prioridad 3)

Registro histórico e inmutable de los pases de expedientes entre áreas y agentes.

#### [MODIFY] [controllers/expController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/expController.js)
Creación de endpoints para pases formales:
* Crear método `makePase(req, res)`:
  * Abre una transacción SQL.
  * Valida que el usuario solicitante posee el expediente asignado en su bandeja.
  * Registra la inserción formal en la tabla `expediente_movements` almacenando emisor, área emisora, receptor, área receptora, notas del pase y una instantánea JSON (`linked_docs_snapshot`) de las fojas vigentes en el instante exacto del pase.
  * Actualiza la tabla principal `expedientes` modificando el `current_owner_id` e inyectando un registro inmutable en la tabla de auditoría `history`.

#### [MODIFY] [gde_frontend/app.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_frontend/app.js)
* Modificar el modal de "Realizar Pase" en la UI.
* Cambiar la petición HTTP: en lugar de enviar un `PUT` al endpoint general `/api/exps/update/:id`, invocará de forma explícita al nuevo endpoint `POST /api/exps/:id/pase` enviando el cuerpo detallado del pase (receptor, notas).

---

### Módulo de Licencias, Ausencias y Desvíos (Fase 4 - Prioridad 4)

Lógica de negocio para delegación automatizada de bandejas de trabajo.

#### [NEW] [controllers/licenceController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/licenceController.js)
ABM administrativo y de usuario para gestionar licencias.
* Registro de fecha de inicio, fecha de fin y usuario delegado.

#### [MODIFY] [middlewares/authMiddleware.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/middlewares/authMiddleware.js)
Interceptación en tiempo de ejecución:
* Al cargar las bandejas del usuario o al realizar un enrutamiento/pase, el sistema comprobará si el usuario destinatario tiene una licencia activa.
* Si está de licencia, la API reencauzará de forma transparente la asignación del propietario actual (`current_owner_id`) hacia el `delegated_to` correspondiente, dejando constancia de la derivación automática por ausencia en el historial de auditoría.

---

## Verification Plan

### Automated Tests
* **Prueba de Inyección BOLA (Borrador Ajeno)**:
  * Autenticar como `juan@gde.com` (User 1) y obtener token.
  * Autenticar como `maria@gde.com` (User 2) y obtener token.
  * Crear un documento borrador con `juan@gde.com` y obtener su `id`.
  * Realizar petición `GET /api/docs/[ID]/content` enviando el token de `maria@gde.com`.
  * **Resultado Esperado**: HTTP `403 Forbidden` (Acceso denegado).
* **Prueba de Concurrencia de Numeración Legal**:
  * Ejecutar script en Node.js que realice 50 peticiones simultáneas a `POST /api/docs/sign-final/[ID]` simulando firmas en paralelo en una misma área.
  * **Resultado Esperado**: Se deben generar 50 folios ininterrumpidos y correlativos sin saltos ni duplicaciones en base de datos.

### Manual Verification
1. **Flujo de Pase**: Desde el frontend, realizar un pase de expediente del área "Recursos Humanos" a "Dirección General" agregando una nota de pase. Validar en la base de datos que se haya creado un registro exacto en la tabla `expediente_movements`.
2. **Flujo de Licencia**: Poner al usuario `juan@gde.com` de licencia delegando en `maria@gde.com`. Crear un documento y derivarlo a Juan. Comprobar que el documento aparezca de inmediato en la bandeja de entrada de María con la marca del historial "Derivado automáticamente por ausencia".
