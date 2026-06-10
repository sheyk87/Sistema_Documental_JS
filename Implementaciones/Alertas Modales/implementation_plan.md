# Plan de Implementación: Corrección de Descargas CSV y Reemplazo de Diálogos Nativos (Confirm/Prompt) por Modales

Este plan detalla los cambios necesarios para resolver dos tareas del frontend:
1. **Descarga de CSV con campo ACCESO**: Agregar la columna `Acceso` a todas las descargas de CSV de documentos y expedientes (Bandejas de entrada, Firma Masiva, Mis Borradores, Buscador, Archivo Central, Anulados).
2. **Reemplazo de diálogos nativos (`confirm` y `prompt`) por modales**: Eliminar todo uso de `confirm()` y `prompt()` del navegador, sustituyéndolos por modales diseñados con la estética premium del proyecto.

---

## Cambios Propuestos

### Frontend

#### [MODIFY] [app.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_frontend/app.js)

1. **Corrección de Exportación a CSV (`handleExport`)**:
   - En la función `handleExport(model)` en el bloque `else` (que maneja las tablas de documentos y expedientes de bandejas de entrada, firma masiva, borradores, buscador, archivo y anulados), modificar las cabeceras (`headers`) para incluir la columna `'Acceso'`.
   - Modificar el mapeo de filas (`rows`) para incluir el valor de acceso (`i.isPublic ? 'Público' : 'Reservado'`).
   - El orden de las columnas se alineará con el de las tablas de la interfaz: `['Número', 'Tipo', 'Asunto', 'Estado', 'Enviado Por', 'Acceso', 'Fecha', 'Fojas']`.

2. **Creación del Asistente `showConfirm`**:
   - Agregar una función global `showConfirm(message, callback)` que establece `state.modal` en un objeto del tipo `'confirmar_accion'`, guardando el mensaje y la función callback a ejecutar al confirmar.
   - En `renderModalOverlay()`, agregar soporte para `m.type === 'confirmar_accion'`. Se renderizará un diseño de tarjeta de advertencia premium con un icono interrogativo/advertencia (`help-circle` o `alert-triangle`) y el mensaje.
   - En el manejador de la acción `'confirm-modal'`, si el tipo de modal es `'confirmar_accion'`, ejecutar de forma asíncrona la función callback guardada en `onConfirm`, cerrando previamente el modal.

3. **Reemplazo de Diálogos de Confirmación (`confirm()`)**:
   Refactorizar los 11 puntos donde se usa la función sincrónica `confirm()` del navegador para que utilicen la nueva llamada asincrónica `showConfirm(mensaje, callback)`:
   - **Eliminación de adjunto** (acción `delete-file`): Cambiar a `showConfirm(...)`.
   - **Eliminación de notificaciones** (acción `delete-all-notifications`): Cambiar a `showConfirm(...)`.
   - **Eliminación de plantilla** (acción `delete-template-btn`): Cambiar a `showConfirm(...)`.
   - **Eliminación de licencia propia** (acción `clear-my-licence`): Cambiar a `showConfirm(...)`.
   - **Eliminación de usuario por administrador** (acción `admin-del-user`): Cambiar a `showConfirm(...)`.
   - **Eliminación de área por administrador** (acción `admin-del-area`): Cambiar a `showConfirm(...)`.
   - **Eliminación de rol por administrador** (acción `admin-del-role`): Cambiar a `showConfirm(...)`.
   - **Regeneración de códigos 2FA por administrador** (acción `admin-regenerate-user-2fa-codes`): Cambiar a `showConfirm(...)`.
   - **Aplicación de edición de usuario** (dentro del modal `editar_usuario`): Cambiar a `showConfirm(...)`.
   - **Eliminación de borrador** (acción `doc-delete`): Cambiar a `showConfirm(...)`.
   - **Eliminación de relación entre documentos** (acción `doc-unrelate`): Cambiar a `showConfirm(...)`.

4. **Reemplazo de Diálogos de Entrada de Texto (`prompt()`)**:
   - En la acción `ask-password-regenerate-2fa` se utiliza un prompt nativo: `const pass = prompt(...)`.
   - Definir un nuevo tipo de modal `'pedir_contrasena'` en `renderModalOverlay()`, que muestra un campo input de tipo password estético.
   - En `'confirm-modal'`, si el tipo de modal es `'pedir_contrasena'`, capturar el valor del input, validar que no esté vacío, y ejecutar la callback pasándole dicho valor.
   - Modificar la acción `ask-password-regenerate-2fa` para que llame a este modal en lugar del `prompt` nativo.

5. **Actualización de Versión de Cache en Service Worker**:
   - Para forzar la actualización de la aplicación PWA y evitar caché vieja de `app.js` en los navegadores de los usuarios, incrementar la constante `CACHE_NAME` en [sw.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_frontend/sw.js) a `gde-pwa-v17`.

---

## Plan de Verificación

### Verificación Automatizada y de Sintaxis
- Revisar que `gde_frontend/app.js` no tenga errores de sintaxis y que la aplicación compile y corra en el contenedor Docker.

### Verificación Manual

1. **Descarga de CSV**:
   - Ingresar a la Bandeja de Entrada, Firma Masiva, Mis Borradores, Buscador, Archivo Central y Anulados.
   - Hacer clic en el botón de exportación "CSV" en cada una de estas secciones.
   - Abrir el archivo CSV descargado y verificar que la columna **Acceso** está presente y que los registros tienen los valores `'Público'` o `'Reservado'` según corresponda.

2. **Validación de Modales de Confirmación**:
   - **Eliminación de borrador**: Ir a "Mis Borradores", entrar a un borrador y presionar "Eliminar Borrador". Validar que se muestra el nuevo modal de confirmación premium en lugar del confirm nativo. Confirmar la eliminación y verificar que se borra correctamente.
   - **Eliminación de adjunto**: Subir un archivo adjunto a un borrador, luego presionar el botón de eliminar. Validar que el modal de confirmación aparece y que funciona correctamente.
   - **ABM de Administración**: Probar la eliminación de un usuario, área o rol. Validar que las confirmaciones se realicen mediante los nuevos modales premium.

3. **Validación de Modal de Contraseña**:
   - Ir al Perfil de usuario, intentar regenerar los códigos de seguridad 2FA.
   - Validar que en lugar de un `prompt()` del navegador, se abre un modal estético solicitando la contraseña.

### Despliegue local
- Ejecutar `docker compose up --build -d frontend` para reconstruir la imagen del frontend e implementar los cambios.
