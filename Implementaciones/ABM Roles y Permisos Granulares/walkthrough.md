## ABM Completo de Roles y Permisos Granulares

Se completó la implementación del módulo de administración de roles y sus permisos mapeados, habilitando un flujo robusto y dinámico.

### Cambios Realizados

#### 1. Backend (Soporte de Roles de Usuario en Inicialización)
- **systemController.js**: Se modificó `getInitialData` para consultar y agregar el listado de roles asignados a cada usuario (columna `roles` obtenida de la tabla `user_roles`). Esto asegura que al inicializarse la SPA, los roles actuales de cada usuario se carguen correctamente en los listados y formularios de edición.

#### 2. Frontend (Integración de Eventos en la SPA)
- **Formulario de Creación**: Se implementó el manejador de envío (`submit`) para el formulario `#form-admin-role`. Este captura el nombre, descripción y la selección de permisos granulares mediante interruptores (iOS-style toggles) y realiza una petición `POST /api/roles/create`. Al completarse, invalida el caché del backend, recarga el estado dinámicamente y re-renderiza la grilla.
- **Eliminación de Roles**: Se agregó soporte para la acción `admin-del-role`. Valida que no se intente eliminar roles esenciales (`admin`, `user`), solicita confirmación al usuario y efectúa la petición `DELETE /api/roles/delete/:id`.
- **Modal de Edición de Rol**:
  - **Apertura**: El trigger de click en "Editar" en la tabla de roles inicializa el modal `editar_rol` cargando los datos actuales del rol (`editRId`, `editRName`, `editRDesc`, `editRPermissions`).
  - **Visualización (`renderModalOverlay`)**: Genera el modal con el listado completo de permisos organizados en categorías e interruptores deslizables pre-seleccionados de forma reactiva.
  - **Guardado**: Al dar clic en "Confirmar", envía una solicitud `PUT /api/roles/update/:id` con la información del formulario, refrescando el estado del sistema tras finalizar.

---

## Verificación Manual Recomendada

1. **Ingresar a Roles**: Navegue a Administración -> Roles en el menú lateral. Compruebe la existencia de la tabla de roles registrados con sus permisos.
2. **Crear nuevo rol**: Use el panel superior para definir un rol (ej. `Validador Documental`) y active permisos específicos con los toggles. Confirme la creación y valide su registro en la tabla.
3. **Modificar rol**: Dé clic en "Editar" sobre el rol recién creado. Desactive algunos permisos y modifique la descripción. Confirme y verifique la actualización en la tabla.
4. **Asignar a un usuario**: Vaya a Administración -> Usuarios. Edite un usuario y asigne el nuevo rol personalizado. Confirme y verifique que el usuario obtenga dinámicamente los permisos correspondientes.
5. **Protección de eliminación**: Valide que al intentar eliminar los roles `admin` o `user`, el sistema lo rechace. Luego elimine el rol de prueba y verifique que se remueva exitosamente.
