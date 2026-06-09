# Plan de Implementación: Clasificación de Seguridad y 2FA en Firmas

Este plan detalla los cambios requeridos para implementar el soporte de clasificación de seguridad en documentos (documentos reservados con permisos de visualización por usuario/área) y la validación de doble factor (2FA) obligatoria al firmar documentos de carácter reservado.

---

## Cambios Propuestos

### 1. Base de Datos (Esquema y Permisos)

#### [NEW] [add_reserved_security_classification.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/migrations/add_reserved_security_classification.js)
Crearemos un script de migración idempotente para:
- Alterar la tabla `documents` y agregar las columnas `is_public` (BOOLEAN DEFAULT TRUE), `auth_areas` (JSON) y `auth_users` (JSON).
- Insertar los nuevos permisos en la tabla `permissions`:
  - `doc_create_reserved`: "Crear Documentación Reservada" (permite crear documentos o expedientes reservados).
  - `doc_sign_reserved`: "Firmar Documentación Reservada" (permite aplicar firma a documentos de carácter reservado).
- Asociar los nuevos permisos a los roles correspondientes en la tabla `role_permissions`:
  - `doc_create_reserved` al rol `admin` y `user`.
  - `doc_sign_reserved` al rol `admin`, `user` y `firmante`.

#### [MODIFY] [setup_full.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/setup_full.js)
Actualizaremos el script de inicialización completa:
- Incluir las columnas `is_public`, `auth_areas` y `auth_users` en la definición de la tabla `documents`.
- Registrar los permisos `doc_create_reserved` y `doc_sign_reserved` en el sembrado inicial.
- Vincular los permisos a los roles correspondientes (`admin`, `user`, `firmante`) en la configuración inicial de RBAC.

---

### 2. Backend (Lógica de Negocio y Control de Accesos)

#### [MODIFY] [roleMiddleware.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/middlewares/roleMiddleware.js)
- Exportar la función helper `checkUserHasPermission` y definir/exportar una nueva función `getUserPermissions` para obtener el listado completo de permisos asignados a un usuario a través de sus roles.
- Actualizar el middleware `checkDocumentAccess` para la acción `'read'`:
  - Si el documento es reservado (`is_public = 0`), validar que el usuario tenga acceso: creador, dueño actual directo o por área, listado en `auth_users`, área listada en `auth_areas`, o perfil administrador/auditor.
- Actualizar el middleware `checkDocumentAccess` para la acción `'sign'`:
  - Si el documento es reservado, validar adicionalmente que el usuario posea el permiso granular `doc_sign_reserved`.

#### [MODIFY] [authController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/authController.js)
- Importar y usar `getUserPermissions` para inyectar el listado de permisos del usuario en la respuesta de `login` y `verify2FA` (`user.permissions = [...]`).
- Exportar la función helper nativa `verifyTOTP` para validar códigos de doble factor en el controlador de documentos.

#### [MODIFY] [userController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/userController.js)
- Importar y usar `getUserPermissions` para inyectar los permisos del usuario en la respuesta del endpoint `/api/users/me` (`getMe`).

#### [MODIFY] [docController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/docController.js)
- **Creación:** En `createDocument`, extraer `isPublic`, `authAreas` y `authUsers` del cuerpo de la petición y guardarlos. Si `isPublic` es falso, verificar previamente que el usuario cuente con el permiso `doc_create_reserved` (devolviendo 403 si no lo posee).
- **Actualización:** En `updateDocument`, guardar los campos `is_public`, `auth_areas` y `auth_users` actualizados desde el cliente.
- **Visualización individual/Descarga:** En `getAllDocuments` y `downloadAttachment`, aplicar filtros de seguridad robustos a nivel de servidor (solución al Broken Access Control de OWASP A01). Si el usuario no es admin/auditor, filtrar el listado devuelto para que solo incluya documentos públicos o reservados lícitos para él.
- **Firma:** En `signFinalAndSeal` (firma y sellado final): si el documento es reservado, requerir y validar el parámetro `twoFactorCode` utilizando la función `verifyTOTP` de `authController.js`. Si no se provee, el código es incorrecto, o si el usuario no tiene configurado el 2FA, se abortará la transacción con error 400/401 antes de procesar el archivo o encolarlo.

#### [MODIFY] [expController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/expController.js)
- **Creación:** En `createExpediente`, si el expediente se marca como reservado (`isPublic` es falso), verificar que el usuario cuente con el permiso `doc_create_reserved` (devolviendo 403 si no lo posee).
- **Visualización:** En `getAllExpedientes`, aplicar la misma lógica de filtrado de seguridad a nivel de servidor para evitar fugas de información de expedientes reservados por llamadas directas a la API.

---

### 3. Frontend (Interfaz de Usuario)

#### [MODIFY] [app.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_frontend/app.js)
- **Creación de Documentos y Expedientes:**
  - Agregar una variable `canCreateReserved` que evalúe si `state.currentUser.permissions` incluye `doc_create_reserved`.
  - En `renderCreateExpediente()` y `renderCreateDocument()`, renderizar el checkbox de "Expediente/Documento Público" y la caja de selección de autorizados (`authUsers` / `authAreas`) **únicamente** si `canCreateReserved` es verdadero.
  - Soportar el filtrado de búsqueda local para la lista de usuarios y áreas en la creación de documentos (`create-doc-auth`).
  - Capturar `isPublic`, `authAreas` y `authUsers` al enviar el formulario `form-create-doc` y mandarlos en el cuerpo de la petición.
- **Edición de Permisos en Detalles:**
  - En `renderDocumentDetail()`, si el documento es reservado (`!doc.isPublic`) y el usuario logueado es el dueño actual, renderizar el botón de "Editar Permisos" (modal de tipo `editar_permisos_doc`).
  - Registrar el tipo de modal `editar_permisos_doc` en el renderizador de modales, inicializador de arrays de selección y manejador de confirmación para que filtre por áreas (`a*`) y usuarios (`u*`) y guarde usando `syncData(item, 'documento')`.
- **Filtros de Listados de Documentos:**
  - Implementar la función helper `canViewDocumento(doc, user)` en base a las reglas de privacidad y permisos.
  - Aplicar `canViewDocumento` al filtrar documentos en el archivo general, anulados, bandeja de entrada y buscador general de la SPA.
  - Interceptación en click de visualización: En la acción `view-item` para tipo `documento`, si `!canViewDocumento(doc, user)`, mostrar un alert de acceso denegado.
- **Control de Firmas y Validación 2FA:**
  - En `renderDocumentDetail()`, solo mostrar los botones de firma ("Firmar Yo Mismo", "Aplicar mi Firma") para documentos reservados si el usuario cuenta con el permiso `doc_sign_reserved`.
  - En el modal `confirmar_firma`, si el documento es reservado, mostrar un campo de texto para ingresar el código 2FA de 6 dígitos.
  - En el manejador de la firma (`confirmar_firma` submit) de documentos reservados, capturar el código e invocar `sealAndSaveDocument(item, hEntry)` pasándolo como argumento.
  - En `sealAndSaveDocument`, adjuntar el código en el `FormData` (`twoFactorCode`) antes de realizar la petición HTTP.

---

## Plan de Verificación

### Pruebas Automatizadas
- Ejecutaremos los scripts de migración y validaremos que los esquemas de las tablas y las referencias de permisos se hayan creado correctamente.

### Verificación Manual
1. **Creación de reservado:**
   - Loguearse con un usuario que **no** tiene el permiso `doc_create_reserved` (ej: un usuario al que se le remueva). Verificar que en los módulos de Expedientes y Documentos **no** aparece la opción para hacerlos reservados (se crean como públicos por defecto).
   - Loguearse con un usuario con el permiso. Confirmar que se puede alternar el toggle para hacerlo reservado, seleccionar áreas/usuarios autorizados, y guardar.
2. **Acceso y Edición de Permisos:**
   - Entrar con un usuario no autorizado a ver el documento reservado. Validar que no figura en sus listas y que si intenta acceder directamente mediante URL/petición, el sistema responde con "Acceso denegado".
   - Con el creador/dueño del documento, abrir la vista de detalles, dar click en "Editar Permisos", modificar el listado de autorizados y confirmar que se sincronizan los cambios.
3. **Firma y 2FA:**
   - Intentar firmar un documento reservado con un usuario que tiene el rol pero **no** tiene el permiso `doc_sign_reserved`. Comprobar que los botones de firma no están visibles y que el backend rechaza la petición si se fuerza.
   - Con un usuario autorizado, dar click en firmar. Verificar que solicita el código de 6 dígitos de 2FA.
   - Probar ingresando un código 2FA erróneo (debe abortar y mostrar error).
   - Probar con un código 2FA correcto de la app autenticadora. Verificar que el documento se firma y se sella exitosamente.
