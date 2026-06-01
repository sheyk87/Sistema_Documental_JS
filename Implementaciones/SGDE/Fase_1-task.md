# Fase 1: Módulo de Roles y Permisos (RBAC) y Seguridad en API (OWASP A01)

Checklist de tareas para completar y verificar de forma secuencial la primera etapa de refactorización del Sistema GDE.

- `[x]` **1. Configuración de Base de Datos (Esquema y Migración)**
  - `[x]` Crear script de migración `/migrations/migrate_rbac_and_sequences.js` para crear tablas físicas y columnas de licencia.
  - `[x]` Modificar `setup_full.js` para asegurar que las instalaciones nuevas incorporen todas las tablas de RBAC, numeración y pases.
  - `[x]` Ejecutar la migración inicial en el entorno local del usuario para crear las tablas físicas en MySQL.

- `[x]` **2. Middleware de Autorización y Roles (RBAC / ACL) en Backend**
  - `[x]` Reemplazar `/middlewares/roleMiddleware.js` con soporte granular para chequear permisos en base de datos.
  - `[x]` Implementar funciones `checkDocumentAccess(action)` y `checkExpedienteAccess(action)` para control granular (ACL).

- `[x]` **3. Blindaje de Controladores y Rutas de Documentos (OWASP A01)**
  - `[x]` Proteger las rutas en `routes/docRoutes.js` usando los middlewares de control de acceso.
  - `[x]` Refactorizar controladores en `controllers/docController.js` para asegurar que el backend bloquea accesos no autorizados a nivel de objeto (BOLA/IDOR).

- `[x]` **4. Blindaje de Controladores y Rutas de Expedientes**
  - `[x]` Proteger las rutas en `routes/expRoutes.js` con el middleware de acceso granular.
  - `[x]` Añadir validación estricta de ACL en `controllers/expController.js`.
  - `[x]` **Regla Crítica del Usuario**: Validar que las fojas selladas de los expedientes (`sealedDocs`) no puedan ser desvinculadas bajo ninguna circunstancia, ni siquiera por administradores.

- `[x]` **5. Verificación y Pruebas Automatizadas/Manuales de la Fase 1**
  - `[x]` Validar que un usuario no pueda leer ni modificar borradores de otros.
  - `[x]` Validar que un usuario no pueda desvincular fojas selladas de un expediente.
  - `[x]` Validar que el rol de administrador y auditor mantengan sus accesos lícitos.
