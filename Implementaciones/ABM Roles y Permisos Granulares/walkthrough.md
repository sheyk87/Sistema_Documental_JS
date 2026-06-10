## ABM Completo de Roles y Permisos Granulares

Se completó la implementación del módulo de administración de roles y sus permisos mapeados, habilitando un flujo robusto y dinámico.

### Cambios Realizados

#### 1. Backend (Soporte de Roles de Usuario en Inicialización)
- **systemController.js**: Se modificó `getInitialData` para consultar y agregar el listado de roles asignados a cada usuario (columna `roles` obtenida de la tabla `user_roles`). Esto asegura que al inicializarse la SPA, los roles actuales de cada usuario se carguen correctamente en los listados y formularios de edición.

#### 2. Frontend (Integración de Eventos en la SPA)
- **Formulario de Creación**: Se implementó el manejador de envío (`submit`) para el formulario `#form-admin-role`. Este captura el nombre, descripción y la selección de permisos granulares mediante interruptores (iOS-style toggles) y realiza una petición `POST /api/roles/create`. Al completarse, invalida el caché del backend, recarga el estado dinámicamente y re-renderiza la grilla.
- **Eliminación de Roles**: Se agregó soporte para la acción `admin-del-role`. Valida que no se intente eliminar roles esenciales (`admin`, `user`), solicita confirmación al usuario y efectúa la petición `DELETE /api/roles/delete/:id`.
- **Modal de Edición de Rol**:
  - **Apertura**: El trigger de click en "Editar" en la tabla de roles inicializa el modal `editar_rol` cargando los datos actuales del rol (`editRId`, `editRName`, `editRDesc`, `editRPermissions`).
  - **Visualización (`renderModalOverlay`)**: Genera el modal con el listado completo de permisos organizados en categorías e interruptores deslizables pre-seleccionados de forma reactiva.
  - **Guardado**: Al dar clic en "Confirmar", envía una solicitud `PUT /api/roles/update/:id` con la información del formulario, refrescando el estado del sistema tras finalizar.

---

## Verificación Manual Recomendada

1. **Ingresar a Roles**: Navegue a Administración -> Roles en el menú lateral. Compruebe la existencia de la tabla de roles registrados con sus permisos.
2. **Crear nuevo rol**: Use el panel superior para definir un rol (ej. `Validador Documental`) y active permisos específicos con los toggles. Confirme la creación y valide su registro en la tabla.
3. **Modificar rol**: Dé clic en "Editar" sobre el rol recién creado. Desactive algunos permisos y modifique la descripción. Confirme y verifique la actualización en la tabla.
4. **Asignar a un usuario**: Vaya a Administración -> Usuarios. Edite un usuario y asigne el nuevo rol personalizado. Confirme y verifique que el usuario obtenga dinámicamente los permisos correspondientes.
5. **Protección de eliminación**: Valide que al intentar eliminar los roles `admin` o `user`, el sistema lo rechace. Luego elimine el rol de prueba y verifique que se remueva exitosamente.

## Correcciones y Mejoras en 2FA, Reversión de Estado y Firma Masiva

Se implementaron con éxito las correcciones y características pendientes relacionadas con el ciclo de vida del documento, alertas durante el inicio de sesión con 2FA y la integración de firmas masivas para documentos reservados.

### Cambios Realizados

#### 1. Visibilidad de Mensajes de Error de 2FA en Login y Recuperación
- **app.js (`renderApp`)**: Se corrigió el flujo de renderizado agregando `+ renderModalOverlay()` al HTML de la pantalla de inicio de sesión (`renderLogin`) y de recuperación de contraseña (`renderForgotPassword`). Esto asegura que cuando `window.alert` es interceptado (por ejemplo, al ingresar un código 2FA erróneo), el modal estético de error de 2FA se renderice inmediatamente sobre el formulario en lugar de postergarse hasta después de ingresar correctamente.
- **Evitar Errores de Referencia en el Modal**: Se protegió `renderModalOverlay` de forma que no intente consultar propiedades de `state.currentUser` (el cual es `null` antes de iniciar sesión), previniendo excepciones y permitiendo el correcto renderizado de modales informativos o de alerta en la etapa de login.

#### 2. Reversión de Estado del Documento en Firmas Fallidas (Firma Individual)
- **Manejador `confirmar_firma`**: Se implementó un sistema de captura y restauración de estado original del documento (`status`, `signedBy`, `signatories`, `currentOwnerId`, `number`, `owners`, e historial).
- Si la llamada al servicio de firma/sellado (`sealAndSaveDocument`) o la verificación previa de 2FA fallan (por ejemplo, si el usuario no tiene 2FA configurado en su cuenta o ingresa un código incorrecto), todos estos campos son restaurados inmediatamente a su estado original. Esto evita que los borradores pasen incorrectamente al estado `FIRMANDOSE` o queden corruptos en el sistema en caso de una firma no completada.

#### 3. Soporte y Firma Masiva de Documentos Reservados con 2FA
- **Filtro de Firma Masiva (`batchSign` en `app.js`)**: Se actualizó el filtro de la bandeja de Firma Masiva para permitir listar tanto documentos públicos como reservados. Los documentos reservados solo se listan si el usuario activo posee el permiso granular de firma de reservados (`doc_sign_reserved`) y tiene acceso lícito de lectura (`canViewDocumento`).
- **Modal de Confirmación Masiva con 2FA**: Se modificó `renderModalOverlay` para detectar si la selección de Firma Masiva actual contiene al menos un documento reservado. De ser así, se solicita el código de autenticación 2FA de 6 dígitos directamente en el modal de confirmación en bloque.
- **Motor Secuencial de Firma Masiva con Validación de 2FA**:
  - Al hacer clic en "Confirmar", si hay reservados en el lote, el motor realiza una validación preliminar del código 2FA ingresado a través de la API (`POST /api/auth/2fa/verify`). Si la validación falla, se cancela todo el proceso de firma en lote de inmediato, previniendo modificaciones parciales.
  - Al procesar cada documento del lote, el código 2FA verificado es enviado de forma segura al endpoint `/api/docs/sign-final/:id`.
  - Se agregó captura de valores originales y rollback completo para cada documento individual dentro del bucle del motor de firma masiva. Si la firma de un documento específico falla en el lote, este documento se revierte limpiamente a su estado anterior y el motor continúa con el siguiente documento.