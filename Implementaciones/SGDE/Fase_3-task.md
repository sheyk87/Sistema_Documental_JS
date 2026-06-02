# Fase 1: Módulo de Roles y Permisos (RBAC) y Seguridad en API (OWASP A01) - COMPLETADO
- `[x]` Configuración de Base de Datos (Esquema y Migración)
- `[x]` Middleware de Autorización y Roles (RBAC / ACL) en Backend
- `[x]` Blindaje de Controladores y Rutas de Documentos (OWASP A01)
- `[x]` Blindaje de Controladores y Rutas de Expedientes
- `[x]` Verificación y Pruebas Automatizadas/Manuales de la Fase 1

---

# Fase 2: Módulo de Numeración Transaccional (Correlatividad y Atomicidad en MySQL) - COMPLETADO
- `[x]` Servicio de Numeración Atómica en Backend (`numberingService.js`)
- `[x]` Integración de Numeración en Documentos (Backend y Rutas)
- `[x]` Integración de Numeración en Expedientes (Backend)
- `[x]` Adaptación del Frontend (`app.js`)
- `[x]` Verificación y Pruebas de la Fase 2

---

# Fase 3: Pases de Expediente, Gestión de Plantillas y Administración Avanzada - COMPLETADO

Checklist de tareas para la tercera etapa de refactorización del Sistema GDE.

- `[x]` **1. Módulo de Pases de Expediente (Backend y Frontend)**
  - `[x]` Implementar método `makePase` en `expController.js` para registrar pases inmutables con snapshot JSON.
  - `[x]` Registrar ruta `POST /api/exps/:id/pase` en `expRoutes.js`.
  - `[x]` Modificar frontend (`app.js`) para invocar el endpoint de pases.
  - `[x]` Implementar una **Línea de Tiempo Gráfica Premium (Timeline)** en el detalle de expedientes.
- `[x]` **2. Módulo de Gestión de Plantillas (Templates)**
  - `[x]` Crear el controlador `templateController.js` para ABM de plantillas, con validación de máximo 1 template por tipo documental y templates globales.
  - `[x]` Registrar rutas en `templateRoutes.js`.
  - `[x]` Implementar en `app.js` la administración de plantillas para Admins (`admin_templates`).
  - `[x]` Implementar en `app.js` la precarga del template en TinyMCE al redactar un nuevo documento.
- `[x]` **3. ABM de Roles, Permisos y Estados de Cuenta para Admins**
  - `[x]` Adaptar `userController.js` para guardar roles en `user_roles` y `status` de cuenta.
  - `[x]` Implementar en `app.js` la grilla de roles/permisos con checkboxes y pop-ups informativos (tooltips) descriptivos.
  - `[x]` Permitir al administrador editar el estado de la cuenta (`Activo`, `Inactivo`, `Suspendido`).
- `[x]` **4. Módulo de Licencia / Ausencia / Delegación**
  - `[x]` Crear el controlador `licenceController.js` para autogestión de licencias y asignación administrativa.
  - `[x]` Implementar validación de delegación cruzada a nivel de base de datos/API.
  - `[x]` Diseñar la cascada de notificaciones duales (campana/correo) según corresponda.
  - `[x]` Integrar el panel de licencias en la configuración de usuario y en el ABM administrativo en el frontend.
- `[x]` **5. Despliegue, Verificación y Pruebas**
  - `[x]` Incrementar el Service Worker a `gde-pwa-v7` y recargar servidores.
  - `[x]` Escribir scripts de verificación para validar delegación cruzada y unicidad de templates.

