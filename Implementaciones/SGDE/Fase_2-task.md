# Fase 1: Módulo de Roles y Permisos (RBAC) y Seguridad en API (OWASP A01) - COMPLETADO
Checklist de tareas completado y verificado de la primera etapa.

- `[x]` **1. Configuración de Base de Datos (Esquema y Migración)**
- `[x]` **2. Middleware de Autorización y Roles (RBAC / ACL) en Backend**
- `[x]` **3. Blindaje de Controladores y Rutas de Documentos (OWASP A01)**
- `[x]` **4. Blindaje de Controladores y Rutas de Expedientes**
- `[x]` **5. Verificación y Pruebas Automatizadas/Manuales de la Fase 1**

---

# Fase 2: Módulo de Numeración Transaccional (Correlatividad y Atomicidad en MySQL) - COMPLETADO

Checklist de tareas para la segunda etapa de refactorización del Sistema GDE.

- `[x]` **1. Servicio de Numeración Atómica en Backend (`numberingService.js`)**
  - Implementar transacción con bloqueo exclusivo `SELECT ... FOR UPDATE` sobre la tabla `numbering_sequences`.
  - Dar soporte a reinicios anuales automáticos por cada tipo documental.
  - Formatear el número correlativo de 6 dígitos con el sufijo de área.
- `[x]` **2. Integración de Numeración en Documentos (Backend y Rutas)**
  - Implementar controlador `assignDocumentNumber` en `docController.js` para asignar número a borradores en trámite.
  - Registrar ruta `POST /api/docs/assign-number/:id` en `docRoutes.js` con las debidas autorizaciones.
- `[x]` **3. Integración de Numeración en Expedientes (Backend)**
  - Refactorizar `createExpediente` in `expController.js` para llamar a `numberingService.getNextNumber('EX', areaId)` internamente al caratular.
  - Retornar el número correlativo generado al frontend en la respuesta HTTP 201.
- `[x]` **4. Adaptación del Frontend (`app.js`)**
  - Remover la función `generateNumber` y `state.db.counters` locales del frontend.
  - Adaptar la creación de expedientes para enviar la petición sin número precalculado y leer el asignado por el servidor.
  - Adaptar la firma de documentos para solicitar atómicamente el número al backend vía `/api/docs/assign-number/:id` antes de rendering a PDF.
- `[x]` **5. Verificación y Pruebas de la Fase 2**
  - Incrementar Service Worker a `gde-pwa-v6` y desplegar cambios en contenedores.
  - Escribir y ejecutar script `tests/verify_numbering_race.js` para certificar atomicidad ante 50 peticiones concurrentes simultáneas.
