# Tareas de Implementación

- [x] Definir `showConfirm` y el tipo de modal `'confirmar_accion'` en `app.js`
- [x] Definir el tipo de modal `'pedir_contrasena'` en `app.js`
- [x] Refactorizar las 11 llamadas a `confirm()` por `showConfirm()`
  - [x] 1. Eliminación de adjuntos (acción `delete-file`)
  - [x] 2. Eliminación de todas las notificaciones (acción `delete-all-notifications`)
  - [x] 3. Eliminación de plantilla (acción `delete-template-btn`)
  - [x] 4. Eliminación de licencia propia (acción `clear-my-licence`)
  - [x] 5. Eliminación de usuario por administrador (acción `admin-del-user`)
  - [x] 6. Eliminación de área por administrador (acción `admin-del-area`)
  - [x] 7. Eliminación de rol por administrador (acción `admin-del-role`)
  - [x] 8. Regenerar códigos 2FA por administrador (acción `admin-regenerate-user-2fa-codes`)
  - [x] 9. Aplicar cambios en edición de usuario (modal `editar_usuario`)
  - [x] 10. Eliminar un borrador (acción `doc-delete`)
  - [x] 11. Eliminar relación entre documentos (acción `doc-unrelate`)
- [x] Refactorizar el prompt de regenerar códigos 2FA de usuario propio por el modal `'pedir_contrasena'`
- [x] Corregir la descarga de CSV agregando la columna `'Acceso'` en `handleExport`
- [x] Incrementar versión de caché del Service Worker en `sw.js`
- [x] Reconstruir contenedor Docker y verificar funcionamiento
