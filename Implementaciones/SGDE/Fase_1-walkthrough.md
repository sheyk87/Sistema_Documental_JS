# Walkthrough de Implementación: Fase 1 Completada y Verificada

Este documento resume las tareas técnicas, los cambios en el código y los resultados de las pruebas de seguridad completadas para la **Fase 1: Módulo de Roles y Permisos (RBAC) y Seguridad en API (OWASP A01)**.

---

## 🛠️ Cambios Realizados en la Fase 1

### 1. Migración y Esquema de Base de Datos (MySQL)
* Se creó el script transaccional [migrate_rbac_and_sequences.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/migrations/migrate_rbac_and_sequences.js).
* **Nuevas Tablas Físicas**:
  * `roles`: Almacena roles de negocio (`admin`, `user`, `redactor`, `revisor`, `firmante`, `auditor`).
  * `permissions`: Registra los privilegios de grano fino del sistema.
  * `role_permissions`: Vinculación N:M de privilegios por rol.
  * `user_roles`: Vinculación N:M de roles por usuario.
  * `numbering_sequences`: Para numeración de fojas y documentos (listo para la Fase 2).
  * `expediente_movements`: Para registro histórico inmutable de pases (listo para la Fase 3).
  * `document_types`: Parametrización dinámica (listo para la Fase 4).
  * `templates`: Plantillas administrativas (listo para la Fase 4).
* **Nuevas Columnas de Usuario (para Licencias)**:
  * Se añadieron campos a `users`: `status`, `superior_id`, `delegated_to`, `licence_start`, `licence_end`.
* El script se ejecutó de forma segura dentro del contenedor Docker `gde-backend`, migrando con éxito a los usuarios activos (`admin@gde.com`, `juan@gde.com`, `maria@gde.com`, `carlos@gde.com`) a sus nuevos roles y permisos sin alterar sus hashes de contraseñas.

### 2. Middleware de Control de Accesos (RBAC/ACL)
* Se implementó el archivo [roleMiddleware.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/middlewares/roleMiddleware.js):
  * **Verificación Dinámica**: Consulta en caliente los permisos reales del usuario mediante JOINs sobre las tablas de roles y permisos.
  * **Control de Accesos a nivel de Objeto (ACL Documentos)**:
    * `read`: Valida si el usuario es el creador, dueño, destinatario o firmante lícito (utilizando sus áreas lícitas cargadas de BD en caliente) antes de permitir la lectura.
    * `write` / `delete`: Impide que se modifiquen documentos en circulación (`Firmando`, `Firmado`, `Archivado`, `Anulado`) y restringe la edición al creador original.
    * `sign`: Permite la firma o el rechazo exclusivamente al firmante pendiente declarado en el trámite.
  * **Control de Accesos a nivel de Objeto (ACL Expedientes)**:
    * Impide lecturas de expedientes reservados a usuarios ajenos al trámite o sus áreas asignadas.
    * Exige la tenencia física (dueño actual) para modificar, vincular fojas o hacer pases.

### 3. Blindaje de Endpoints del Backend
* **Rutas de Documentos** ([docRoutes.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/routes/docRoutes.js)): Se inyectó `checkDocumentAccess` en todos los endpoints sensibles.
* **Controlador de Descargas** ([docController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/docController.js)): Se inyectó validación de autorización en caliente en `/download/:filename` para evitar descargas ilegítimas de anexos cifrados adivinando nombres de archivo.
* **Rutas de Expedientes** ([expRoutes.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/routes/expRoutes.js)): Se protegió el endpoint de actualización `/update/:id` con `checkExpedienteAccess('write')`.
* **Regla de Integridad de Fojas Selladas** ([expController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/expController.js)): Se inyectó una validación estricta de base de datos que compara el array `sealed_docs` anterior. Si una foja sellada es omitida en la nueva lista de fojas vinculadas, la petición es rechazada con un error HTTP 403.

---

## 🧪 Pruebas de Integración y Verificación

Se creó un script de verificación automatizado, [verify_bola.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/tests/verify_bola.js), que simula ataques BOLA/IDOR y violaciones de fojas selladas.

### Resultado de la Ejecución dentro de Docker:
```bash
$ docker compose exec backend node tests/verify_bola.js

🧪 Iniciando verificación de seguridad de la Fase 1...
🔑 Obteniendo credenciales de Juan (User 1)...
🔑 Obteniendo credenciales de María (User 2)...
📄 Creando borrador de prueba para Juan...
🚨 ATAQUE BOLA: María (User 2) intenta leer el borrador confidencial de Juan...
✅ A01 PROTEGIDO: Acceso denegado con HTTP 403 (BOLA Mitigado).
🧹 Eliminando borrador de prueba...
📂 Validando integridad de fojas selladas en Expedientes...
🚨 ATAQUE INTEGRIDAD: Juan intenta desvincular la foja sellada...
✅ REGLA CUMPLIDA: El sistema bloqueó la desvinculación de la foja sellada con HTTP 403.
🎉 🎉 TODAS LAS PRUEBAS DE LA FASE 1 PASARON CON ÉXITO! El backend es seguro.
```

Las brechas más críticas de **Broken Access Control** han sido resueltas en su totalidad para el backend.

---

## 🩹 Hotfixes: Resolución del Bug de Pérdida de Cuerpo/Asunto en Borradores

Se identificaron y resolvieron con éxito los bugs relacionados con la desaparición del cuerpo y el asunto al realizar transiciones como "Volver", "Enviar a Revisar", "Enviar a Firmar", "Aplicar Firma" y al recargar la página.

### Diagnóstico y Causa Raíz:
1. **Lazy Loading Incompleto en Tablas**: Al abrir un documento haciendo clic en su fila (`tr`), no se cargaba el cuerpo completo mediante la API, inicializando el editor de texto TinyMCE con un valor vacío y guardándolo en la base de datos al disparar el autoguardado.
2. **Espejo `state.selectedItem` Desactualizado**: Al guardar cambios, la función `autoSaveDraft()` actualizaba la base de datos central `state.db.documents`, pero no sincronizaba el objeto activo de visualización en pantalla (`state.selectedItem`). Al abrir cualquier modal o menú, `setState()` redibujaba el DOM leyendo los valores desactualizados de `state.selectedItem`, pisando visualmente el texto escrito por el usuario.
3. **Caché PWA Agresiva**: El Service Worker (`sw.js`) mantenía cacheado el archivo `app.js` anterior en el navegador, impidiendo que las actualizaciones de código se aplicaran inmediatamente a los clientes.

### Soluciones Implementadas:
1. **Backend Seguro (Control de Integridad)**: Se modificó `updateDocument` en `docController.js` para rechazar explícitamente cualquier intento de sobrescribir el asunto o el cuerpo con valores vacíos provenientes de cargas perezosas incompletas.
2. **Sincronización Bidireccional en Caliente**: Se actualizó `autoSaveDraft()` en `app.js` para sincronizar en tiempo real el asunto y cuerpo de TinyMCE directamente sobre `state.selectedItem` y su espejo centralizado, garantizando que `setState()` siempre redibuje la pantalla con los datos más recientes del usuario.
3. **Control de Navegación Anticipada**: Se inyectó `await ensureDocContent(item)` en el manejador de clics globales de filas de tablas (`tr[data-id]`) para garantizar la descarga asíncrona del cuerpo de los borradores desde la base de datos central antes de inicializar la pantalla del editor.
4. **Invalidación de Caché PWA**: Se incrementó la versión del Service Worker a `gde-pwa-v4` en `sw.js` para asegurar que todos los clientes finales actualicen sus estáticos y adopten los cambios de forma instantánea.
5. **Despliegue e Inyección**: Se copiaron las actualizaciones a los contenedores Docker en ejecución (`gde-backend` y `gde-frontend`), se adaptaron las URLs a relativas con `sed` en caliente y se recargó la configuración de Nginx.

---

## ↩️ Hotfix: Retorno de Documentos Rechazados al Remitente Anterior

Se detectó que al rechazar un documento enviado a firmar o revisar, el flujo redirigía la propiedad del borrador (`currentOwnerId`) siempre al creador original del documento (`creatorId`), ignorando si un usuario intermedio o revisor/firmante anterior había sido quien efectivamente lo remitió para su firma o revisión.

### Diagnóstico y Causa Raíz:
Tanto en la acción individual del modal de rechazo como en el proceso de rechazo masivo (`processBatchReject`), se tenía hardcodeada la asignación:
`item.currentOwnerId = item.creatorId;`
Esto rompía el flujo orgánico en trámites donde un borrador es creado por un redactor y derivado/gestionado por un usuario intermedio, quien finalmente decide enviarlo a firma.

### Soluciones Implementadas:
1. **Helper de Rastreo del Historial (`app.js`)**: Implementamos la función `getPreviousSenderId(item)`. Este motor de búsqueda analiza el histórico inmutable del documento (`item.history`) en sentido inverso (del evento más reciente al más antiguo) para identificar la última acción de transición real del trámite (`Enviado a firmar...`, `Enviado a Revisar...` o `Derivado...`) y extraer el `userId` exacto de quien realizó el envío. Si no existe historial previo, retorna de forma segura `item.creatorId` como fallback.
2. **Actualización de Flujo de Rechazo**:
   * Modificamos el controlador individual de `rechazar_doc` para asignar `item.currentOwnerId = getPreviousSenderId(item)` y dirigir la alerta/notificación de campana a dicho usuario.
   * Modificamos el motor de rechazo masivo (`processBatchReject`) de igual manera para que la derivación por rechazo de firma en masa sea bidireccional y vuelva al usuario emisor anterior.
3. **Invalidación de Caché PWA**: Incrementamos la versión del Service Worker a `gde-pwa-v5` en `sw.js` para forzar a los navegadores del cliente final a desechar la versión obsoleta del script frontend.
4. **Despliegue en Caliente**: Actualizamos los archivos estáticos dentro del contenedor Docker `gde-frontend` y recargamos el servicio web con éxito.


