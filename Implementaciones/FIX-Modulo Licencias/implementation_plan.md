# Plan de Implementación - Correcciones al Módulo de Licencia/Ausencia

Este documento detalla los cambios técnicos que realizaremos en el backend y en el frontend para corregir el comportamiento de las licencias, la delegación automática de bandejas de entrada, las notificaciones y los controles de fechas.

## Proposed Changes

### [Backend] Notificaciones y Lógica de Licencia

---

#### [MODIFY] [notificationController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/notificationController.js)
Refactorizaremos el controlador para extraer la lógica interna de creación y envío de notificaciones (tanto de base de datos como por correo) a una función helper exportable que se pueda reutilizar directamente en el backend.

* Crear y exportar la función `sendNotificationInternal({ userIds, senderId, action, message, itemId, itemType })` que:
  * Resuelva los IDs de las áreas a IDs de usuarios pertenecientes a esas áreas.
  * Obtenga la configuración de notificaciones (`web_notifications`, `email_notifications`) de cada destinatario.
  * Inserte las notificaciones web para quienes las tengan habilitadas.
  * Envíe el correo electrónico con `emailService.sendMail` usando una plantilla HTML similar para quienes tengan activada la notificación por correo.
* Refactorizar el endpoint existente `createNotification` para que delegue en `sendNotificationInternal`.

#### [MODIFY] [licenceHelper.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/utils/licenceHelper.js)
Reescribiremos la función `resolveDelegatedOwner` para que valide correctamente las delegaciones en función de fechas parciales, nulas o completas:

* Si `delegated_to` está asignado:
  * Sin fecha de inicio ni fin: Delegación activa permanente.
  * Con fecha de inicio y sin fecha de fin: Activa desde la fecha de inicio en adelante.
  * Sin fecha de inicio y con fecha de fin: Activa desde el momento actual hasta la fecha de fin.
  * Con fecha de inicio y de fin: Activa estrictamente en el rango `now >= start && now <= end`.

#### [MODIFY] [docController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/docController.js)
* Reemplazar la inserción manual en `notifications` por una llamada a `sendNotificationInternal` cuando se realice un desvío automático de un documento en `updateDocument`.

#### [MODIFY] [expController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/expController.js)
* En `updateExpediente`, cuando el destinatario tiene una licencia activa, además de cambiar `item.currentOwnerId = delegation.finalOwnerId`, recuperaremos el `area_id` del delegado desde la base de datos y actualizaremos `item.areaId` con el mismo. Esto permitirá que pase el filtro de bandeja de entrada en el frontend.
* En `updateExpediente` y `makePase`, reemplazar las inserciones manuales en la tabla `notifications` por llamadas a `sendNotificationInternal`.

#### [MODIFY] [licenceController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/licenceController.js)
* Implementar la función de formateo explícito de fechas a formato `DD/MM/YYYY HH:MM hs`.
* Ajustar la creación del texto y el HTML del correo al momento de asignar o actualizar una licencia para que se adapte según las fechas provistas (permanente, desde inicio sin límite, o ya mismo hasta el fin).

---

### [Frontend] Validaciones y Modal de Advertencia de Licencia

---

#### [MODIFY] [app.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_frontend/app.js)
* **Validación de Fechas en Formulario:**
  * En el envío de licencia propia (`form-user-licence`) y en el modal de actualización de usuario de administración (`editar_usuario`), validar que si se ingresan fecha de inicio y fecha de fin, la de fin sea mayor o igual a la de inicio. Si no se cumple, mostrar una advertencia mediante un `alert()` y cancelar el guardado.
* **Función de Comprobación local:**
  * Implementar la función `checkActiveLicence(userId)` que realice la misma validación que el backend basándose en la lista de usuarios cargada en local (`state.db.users`).
  * Implementar `formatLicencePeriodText(startStr, endStr)` para generar descripciones amigables del período con formato de fecha `DD/MM/YYYY HH:MM`.
* **Modal de Advertencia de Licencia al Remitente:**
  * Agregar soporte para un modal informativo de confirmación de tipo `advertencia_licencia`.
  * Modificar los flujos de "Confirmar" de los modales de derivación de expedientes, envío a revisar, derivación de documentos y envío a firmar:
    * Antes de concretar el envío, comprobar si el o los destinatarios tienen licencias activas.
    * Si al menos uno tiene licencia activa, guardar la acción pendiente en el estado y abrir el modal `advertencia_licencia` mostrando el mensaje descriptivo del desvío y período.
    * En el modal `advertencia_licencia`, si el usuario selecciona "Confirmar Envío", ejecutar la acción pendiente original. Si selecciona "Cancelar", retornar al modal o vista previa.

## Verification Plan

### Automated Tests
* Ejecutar la suite de tests existente (`npm run test` o equivalente) para asegurar que no se introduzcan regresiones.
* Ejecutar el script `tests/verify_fase3.js` para asegurar que las pruebas de delegación sigan funcionando correctamente.

### Manual Verification
1. **Configuración de Licencias:**
   * Intentar configurar una licencia con fecha de fin menor a la de inicio y verificar la advertencia.
   * Configurar licencias parciales (solo inicio, solo fin, o vacías) y verificar las notificaciones por campanita y correo del delegado con los textos dinámicos correspondientes en el formato `DD/MM/YYYY`.
2. **Envío de Documento/Expediente a Licencia Futura vs Licencia Activa:**
   * Con una licencia programada a futuro (ej. a partir de mañana), derivar un documento y verificar que el destinatario original lo reciba y que el delegado no lo reciba antes de tiempo.
   * Con una licencia activa en el momento actual, derivar un documento/expediente y verificar que el remitente vea la advertencia modal antes de enviar, y que el delegado reciba la notificación y el correo del desvío.
3. **Bandeja de Entrada del Delegado (Expedientes):**
   * Verificar que al derivarse un expediente al delegado, éste le llegue y aparezca correctamente listado en su bandeja de entrada personal, pudiendo tramitarlo.
