# Tareas - Correcciones del Módulo de Licencia/Ausencia

## Backend
- [x] Refactorizar `notificationController.js` para extraer la lógica interna a la función `sendNotificationInternal`
- [x] Modificar `licenceHelper.js` para reescribir `resolveDelegatedOwner` y validar rangos de fechas dinámicos
- [x] Modificar `docController.js` para usar `sendNotificationInternal` al desviar documentos
- [x] Modificar `expController.js` para:
  - [x] Actualizar el `areaId` al del delegado en `updateExpediente`
  - [x] Usar `sendNotificationInternal` en `updateExpediente` y `makePase`
- [x] Modificar `licenceController.js` para:
  - [x] Implementar la función de formateo de fecha `DD/MM/YYYY HH:MM hs`
  - [x] Adaptar la notificación y correo según las fechas configuradas
  - [x] Invalidar el caché de datos del sistema al configurar una licencia
- [x] Modificar `systemController.js` para incluir campos de licencia en la consulta inicial de usuarios para el ABM

## Frontend
- [x] Modificar `app.js` para:
  - [x] Validar que la fecha de fin de la licencia no sea menor que la de inicio en autogestión y administración
  - [x] Implementar `checkActiveLicence(userId)` en local
  - [x] Implementar `formatLicencePeriodText(startStr, endStr)` para descripción de fechas en el frontend
  - [x] Crear el modal de confirmación `advertencia_licencia`
  - [x] Modificar los flujos de envío (derivación/revisión) para interceptar y mostrar la advertencia si hay licencias activas

## Verificación
- [x] Ejecutar pruebas automáticas
- [x] Realizar verificación manual (simulada y de integración de rangos)
- [x] Crear el reporte en `walkthrough.md`
- [x] Crear y ejecutar prueba de integración `verify_admin_edit_bug.js` para validar la corrección del caché en el ABM de administrador
