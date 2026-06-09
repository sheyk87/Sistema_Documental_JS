# Plan de Implementación: ABM Completo de Roles

Este plan detalla los pasos para completar el ABM de Roles (Alta, Baja y Modificación) con sus permisos granulares mapeados en la SPA y asegurar la coherencia de datos vinculando correctamente la asignación de roles a nivel de usuario.

---

## Cambios Propuestos

### 1. Backend

#### [MODIFY] [systemController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/systemController.js)
- En `getInitialData`, realizar una consulta a la tabla `user_roles` para traer todas las asociaciones de usuarios y roles.
- Mapear estas asociaciones agregando la propiedad `roles` (un array de strings de IDs de roles) a cada objeto de usuario retornado al frontend. Esto asegurará que al cargar la SPA, los roles de cada usuario se carguen dinámicamente en el formulario de edición y creación de usuarios.

---

### 2. Frontend

#### [MODIFY] [app.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_frontend/app.js)
- **Manejador de Envío de Creación de Rol (`submit` event listener):**
  - Agregar la captura del evento `submit` para `#form-admin-role`.
  - Recopilar el nombre, descripción y los checkboxes marcados del listado de permisos (`permissions`).
  - Realizar una petición `POST /api/roles/create` con los datos recogidos.
  - Al recibir respuesta exitosa, refrescar el estado global mediante `loadFullState()` y re-renderizar la UI.
- **Manejador de Eliminación de Rol (`click` event listener):**
  - Capturar la acción `admin-del-role`.
  - Validar que no se intente eliminar roles esenciales del sistema (`admin`, `user`).
  - Confirmar la acción mediante un modal o `confirm`.
  - Realizar una petición `DELETE /api/roles/delete/:id`.
  - Recargar el estado global al confirmarse la eliminación.
- **Inicialización de Modal de Edición de Rol (`open-modal` action):**
  - Añadir soporte para el tipo de modal `editar_rol`.
  - Buscar los datos del rol seleccionado en `state.db.roles` y mapear su ID, nombre, descripción y array de permisos activos en el estado temporal del modal.
- **Diseño del Modal de Edición de Rol (`renderModalOverlay` function):**
  - Agregar el bloque HTML para `m.type === 'editar_rol'`.
  - Mostrar campos editables para el nombre y la descripción.
  - Renderizar la grilla de selección de permisos granulares agrupados por categorías, utilizando el mismo diseño de interruptor deslizable (iOS-style switch) que el panel de creación.
  - Los permisos activos de dicho rol deben aparecer pre-seleccionados y enlazados a la propiedad reactiva `editRPermissions` usando `data-modal-toggle`.
- **Manejador de Confirmación de Cambios en Rol (`confirm-modal` action):**
  - Añadir soporte para guardar cambios de `editar_rol`.
  - Validar que el nombre del rol no esté vacío.
  - Realizar una petición `PUT /api/roles/update/:id` enviando el nombre, descripción y listado actualizado de IDs de permisos.
  - Cerrar el modal y refrescar el estado global del sistema tras un guardado exitoso.

---

## Plan de Verificación

### Pruebas Automatizadas
- Verificaremos el correcto inicio de los contenedores Docker mediante comandos de estado de Docker y logs.

### Verificación Manual
1. **Listado de Roles:** Comprobar que en el menú lateral de Administración aparezca el item "Roles" y liste todos los roles existentes con sus respectivos badges de permisos.
2. **Creación de Rol:** Crear un rol personalizado con una selección específica de permisos (por ejemplo, solo lectura de documentos y expedientes) y verificar que se agregue inmediatamente a la tabla.
3. **Modificación de Rol:** Abrir el modal de edición de un rol existente, alterar sus permisos activando o desactivando los interruptores deslizables, y verificar que los cambios se guarden correctamente.
4. **Eliminación de Rol:** Intentar eliminar un rol del sistema básico (ej. `admin` o `user`) y confirmar que esté bloqueado tanto en frontend como en backend. Luego eliminar un rol personalizado creado anteriormente y verificar que se remueva de la base de datos y de la interfaz.
5. **Asignación en Usuarios:** Verificar que al editar un usuario, sus roles actuales aparezcan pre-seleccionados, y que al asignarle un nuevo rol personalizado, el usuario adquiera dinámicamente dichos permisos granulares en su sesión.
