# Tareas de Ejecución

- `[x]` **Base de datos y Semillado**
  - `[x]` Crear migración `migrations/add_reserved_security_classification.js`
  - `[x]` Ejecutar la migración
  - `[x]` Actualizar `setup_full.js`
- `[x]` **Backend**
  - `[x]` Exportar helpers en `roleMiddleware.js` y actualizar middleware `checkDocumentAccess`
  - `[x]` Exportar helper `verifyTOTP` en `authController.js` e inyectar `user.permissions`
  - `[x]` Inyectar `user.permissions` en `getMe` de `userController.js`
  - `[x]` Actualizar `docController.js` (creación, edición, listado seguro, descargas y firma con 2FA)
  - `[x]` Actualizar `expController.js` (validaciones de creación y listado seguro)
- `[x]` **Frontend**
  - `[x]` Soportar checkbox de Reservado en expedientes y documentos en base al permiso `doc_create_reserved`
  - `[x]` Implementar modal `editar_permisos_doc` en `app.js` y sincronización con el backend
  - `[x]` Implementar `canViewDocumento` y filtrado en vistas y búsqueda de documentos
  - `[x]` Solicitar y validar 2FA en el modal `confirmar_firma` al firmar documentos reservados
- `[x]` **Verificación**
  - `[x]` Probar creación de documentos/expedientes reservados con y sin permisos
  - `[x]` Probar edición de permisos y accesos denegados a documentos reservados
  - `[x]` Probar firmas de documentos reservados (2FA erróneo y 2FA correcto)

## Ajustes y Correcciones Solicitadas
- `[x]` **Columna "Acceso" en Listados y Buscador**
  - `[x]` Añadir columna "Acceso" con badge en el listado de Firma Masiva
  - `[x]` Corregir comparador de ordenación por "Acceso" en `app.js`
- `[x]` **Corrección de Visibilidad en Rechazos**
  - `[x]` Restaurar `areaId` al área del remitente original al rechazar un documento individual
  - `[x]` Restaurar `areaId` al área del remitente original al rechazar documentos de forma masiva
- `[x]` **Despliegue y Verificación**
  - `[x]` Reconstruir y reiniciar contenedores Docker
  - `[x]` Probar el flujo completo de rechazo y visibilidad de badges

