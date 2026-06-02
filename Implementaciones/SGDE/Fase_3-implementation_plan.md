# Plan de Implementación: Fase 3 - Gestión de Plantillas, Roles/Permisos Avanzados, Licencias con Prevención de Bucle y Control de Cuentas

Este documento detalla la propuesta técnica para la implementación de la **Fase 3** del Sistema de Gestión Documental Electrónica (SGDE). Cubre los requerimientos de plantillas dinámicas, control de roles y permisos con pop-ups descriptivos, configuración segura de licencias/ausencias sin delegación cruzada y control de estado de cuentas de usuarios.

---

## Goal Description

El objetivo de la Fase 3 es dotar al sistema de capacidades de administración avanzadas a nivel empresarial y optimizar la experiencia de redacción y configuración mediante las siguientes adiciones funcionales y de seguridad (OWASP Top 10):

1. **Gestión Completa de Plantillas (Templates)**:
   * Los administradores podrán crear, editar y eliminar plantillas desde la interfaz.
   * Una plantilla puede asignarse a múltiples tipos de documentos.
   * Una plantilla puede ser designada como **Global** (aplica para todos los tipos de documentos).
   * Un tipo de documento **no puede tener más de una plantilla asignada a la vez**.
   * Al crear un nuevo documento, el cuerpo (TinyMCE) se precargará dinámicamente con la plantilla correspondiente (priorizando la específica, y recurriendo a la global si no tiene una asignada).

2. **Grilla Interactiva de Roles y Permisos**:
   * En el ABM de creación y edición de usuarios, los administradores tendrán una grilla dinámica elegante para asignar múltiples roles y permisos.
   * Cada rol o permiso tendrá una ayuda contextual interactiva (pop-up o tooltip) con una descripción premium que explica detalladamente qué hace ese rol/permiso para mitigar la delegación accidental de privilegios (OWASP A01: Broken Access Control).

3. **Módulo de Licencias / Ausencias y Prevención de Delegación Cruzada**:
   * Los usuarios podrán configurar su licencia en su configuración de perfil (Fecha Inicio, Fecha Fin, Usuario Delegado).
   * **Bloqueo de Delegación Cruzada**: Si el usuario A designa al usuario B como delegado, el sistema validará y bloqueará que el usuario B pueda designar al usuario A como su delegado (previniendo bucles de delegación infinitos). Se mostrará una advertencia clara en el frontend.
   * **Notificaciones e Integración SMTP**:
     * Si un usuario autogestiona su licencia, el delegado recibe una notificación de campanita en tiempo real y un correo electrónico (si SMTP está activo).
     * Los administradores también pueden configurar licencias en el ABM de usuarios. En este caso, **tanto el usuario titular (A) como el delegado (B)** reciben notificaciones y correos.
   * **Redirección de Bandeja**: Durante la vigencia de la licencia, los pases o envíos dirigidos al usuario A se redirigirán automáticamente al usuario B.

4. **Estado de Cuentas de Usuario**:
   * Los administradores podrán modificar el estado de la cuenta (`Activo`, `Inactivo`, `Suspendido`) desde el ABM de usuarios.
   * Los usuarios `inactivos` o `suspendidos` tendrán bloqueado el acceso de login inmediatamente, y sus sesiones activas serán invalidadas.

---

## User Review Required

> [!IMPORTANT]
> **Bloqueo Transaccional contra Delegación Cruzada**:
> Para garantizar la máxima robustez (OWASP Top 10), la validación de delegación cruzada se realizará en el backend mediante una transacción atómica para evitar condiciones de carrera. Si se detecta que el usuario destino ya tiene asignado al emisor como su delegado activo, se abortará la transacción y se retornará un error `400 Bad Request`.
>
> **Comportamiento de Asignación de Plantillas**:
> Al asignar una plantilla a varios tipos de documentos, si alguno de ellos ya tiene asignada otra plantilla, el sistema advertirá y desvinculará la plantilla previa del tipo de documento seleccionado para asegurar que se cumpla la restricción de que "un tipo de documento no tiene más de una plantilla activa".

---

## Open Questions

> [!NOTE]
> No hay preguntas abiertas de momento. Procederemos con el diseño detallado para el backend y el frontend reactivo.

---

## Proposed Changes

A continuación se detallan las modificaciones y adiciones de archivos en el backend y el frontend.

### Módulo de Base de Datos y Backend (gde_backend)

---

#### [MODIFY] [gde_backend/setup_full.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/setup_full.js)
* Actualizar el esquema de creación de tablas en la inicialización:
  * Modificar la tabla `templates` para remover la clave foránea restrictiva `doc_type` en su definición original, y adaptarla a una relación flexible:
    ```sql
    CREATE TABLE IF NOT EXISTS templates (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        is_global BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ```
  * Modificar `document_types` para incluir la columna `template_id` y su clave foránea:
    ```sql
    ALTER TABLE document_types ADD COLUMN template_id VARCHAR(50) NULL,
    ADD CONSTRAINT fk_document_types_template FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL;
    ```
  * Agregar descripciones a los roles y permisos en la base de datos agregando la columna `description TEXT NULL` a las tablas `roles` y `permissions`, y poblándolas con explicaciones detalladas y legibles en el script de carga de datos maestros.

#### [NEW] [gde_backend/migrations/update_fase3_schema.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/migrations/update_fase3_schema.js)
* Crear una nueva migración que actualice de forma segura las bases de datos de producción/desarrollo existentes:
  * Eliminar la tabla `templates` vieja si existe (ya que está vacía y no tiene código previo).
  * Crear la nueva tabla `templates` flexible.
  * Añadir columnas `template_id` a `document_types` si no existe.
  * Añadir columnas `description` a `roles` y `permissions` si no existen.
  * Actualizar descripciones de roles y permisos.

#### [NEW] [gde_backend/controllers/templateController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/templateController.js)
* Controlador para la gestión completa de plantillas:
  * `createTemplate`: Crea una plantilla. Si es global, pone `is_global = FALSE` a todas las demás. Si recibe un array de `docTypes` (códigos de tipos de documentos), actualiza la tabla `document_types` asignando la nueva plantilla a dichos tipos.
  * `updateTemplate`: Actualiza una plantilla existente, incluyendo su contenido, nombre, estado global, y actualiza los tipos de documentos asignados.
  * `deleteTemplate`: Elimina una plantilla física.
  * `getTemplates`: Obtiene todas las plantillas registradas junto con los códigos de tipos de documentos asociados.
  * `getTemplateForType`: Recupera de forma ágil el contenido de plantilla específico para un tipo de documento determinado (ej: `NO`). Si no tiene, busca el `is_global = TRUE`. Si no hay ninguno, retorna un texto vacío.

#### [NEW] [gde_backend/routes/templateRoutes.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/routes/templateRoutes.js)
* Exponer endpoints protegidos para plantillas:
  * `GET /api/templates` (Lectura para redactores y admins)
  * `GET /api/templates/for-type/:docType` (Lectura para redactores)
  * `POST /api/templates`, `PUT /api/templates/:id`, `DELETE /api/templates/:id` (Restringido para `admin`)

#### [MODIFY] [gde_backend/controllers/userController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/userController.js)
* Modificar `createUser` y `updateUser`:
  * Soportar la asignación del estado de cuenta (`status` = 'active', 'inactive', 'suspended').
  * Recibir un arreglo de roles (`roles` array) y actualizar la tabla de mapeo asociativa `user_roles` dentro de una transacción.
  * Validar parámetros usando prepared queries para mitigar ataques de inyección SQL (OWASP A03).
  * Si un usuario es suspendido o inactivado, realizar la invalidación o revocación de tokens JWT activos agregando el token a Redis o forzando su desconexión en el siguiente request (se implementará revocación en Redis).

#### [NEW] [gde_backend/controllers/licenceController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/licenceController.js)
* Controlador de autogestión y administración de licencias:
  * `updateUserLicence`: Permite a un usuario común o administrador actualizar su licencia:
    * Abre una transacción atómica.
    * Valida que no haya **delegación cruzada**: Si el usuario actual A delega en B, y el usuario B ya tiene configurado su `delegated_to` apuntando a A con una fecha de fin de licencia futura, se aborta y retorna HTTP `400 Bad Request` indicando "Delegación cruzada prohibida".
    * Actualiza los campos `licence_start`, `licence_end`, `delegated_to` del usuario en la base de datos.
    * **Notificaciones duales**:
      * Si la solicitud la realiza el propio usuario (autogestión): Lanza una notificación de campanita en tiempo real al usuario delegado (B) y le envía un correo electrónico detallado.
      * Si la solicitud la realiza un administrador (ABM): Envía campanitas y correos a ambos implicados (Usuario A que sale de licencia y Delegado B).
  * `getEligibleDelegates`: Endpoint para obtener la lista de usuarios elegibles para delegación (excluyendo a sí mismo).

#### [NEW] [gde_backend/routes/licenceRoutes.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/routes/licenceRoutes.js)
* Rutas de licencias y delegaciones:
  * `POST /api/licences/configure` (Autogestión de usuario)
  * `POST /api/licences/admin-configure/:userId` (Acceso reservado a `admin`)
  * `GET /api/licences/delegates` (Listar delegados candidatos)

#### [MODIFY] [gde_backend/controllers/authController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/authController.js)
* En la función `login`:
  * Validar el estado del usuario (`status`). Si es diferente de `'active'`, rechazar la autenticación inmediatamente retornando HTTP `403 Forbidden` con una explicación clara pero segura ("Su cuenta ha sido desactivada o suspendida.").

#### [MODIFY] [gde_backend/controllers/docController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/docController.js)
y #### [MODIFY] [gde_backend/controllers/expController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/expController.js)
* En los flujos de creación/transferencia/pase/firma:
  * Antes de reasignar un documento o expediente a un usuario `targetId`, verificar de forma reactiva si el destinatario posee una licencia activa en base a la fecha actual (`NOW() BETWEEN licence_start AND licence_end`).
  * Si está de licencia activa, enrutar la tenencia física (`current_owner_id`) de manera transparente al `delegated_to` seleccionado.
  * Registrar la traza en la tabla de auditoría `history`: "Derivado automáticamente a [Usuario B] debido a la licencia activa de [Usuario A]".
  * Notificar al delegado B con una campanita.

#### [MODIFY] [gde_backend/server.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/server.js)
* Registrar los nuevos enrutadores de API:
  * `app.use('/api/templates', templateRoutes);`
  * `app.use('/api/licences', licenceRoutes);`

---

### Módulo de Frontend (gde_frontend - Interfaz Reactiva y Premium)

#### [MODIFY] [gde_frontend/app.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_frontend/app.js)
Para consolidar todas las características requeridas, enriqueceremos la interfaz SPA con una estética sumamente premium:

1. **Gestión de Plantillas (ABM de Plantillas)**:
   * Crear vista de administración `renderAdminTemplates()` que permita a los administradores:
     * Listar plantillas con diseños limpios y tarjetas de estado elegantes.
     * Crear y editar plantillas con un formulario interactivo.
     * Asignar la plantilla a múltiples tipos de documentos mediante una lista interactiva de selección o checkboxes con chips modernos.
     * Permitir marcarla como global mediante un toggle switch fluido.
   * **Precarga Dinámica**: En la vista de confección de nuevo documento (`renderCreateDocument`), al seleccionar un tipo del select `#create-doc-type`, se invocará de inmediato a `/api/templates/for-type/:docType` y se inyectará el contenido de la plantilla predeterminada directamente dentro del editor de texto TinyMCE usando `tinymce.get('create-doc-content').setContent(templateText)`.

2. **Grilla Interactiva de Roles/Permisos con Tooltips**:
   * En los formularios del ABM de usuarios (creación y el modal de edición `editar_usuario`), reemplazaremos el simple desplegable de roles por una **Grilla de Control de Accesos (RBAC Grid)** sumamente elegante.
   * La grilla mostrará los roles y permisos disponibles con checkboxes personalizados con diseño HSL dinámico.
   * Cada fila de la grilla incluirá un ícono de ayuda interactiva (`info` de Lucide) que al pasar el mouse (o tocar en móvil) desplegará un **Popup/Tooltip premium autodefinido** mostrando la descripción detallada del rol o permiso para mitigar errores administrativos.

3. **Módulo de Configuración de Licencias y Ausencias**:
   * En la sección "Configuración de Perfil", añadir una pestaña o tarjeta moderna llamada **"Licencias y Delegación Administrativa"**.
   * Formularios limpios con selectores de fecha (`input[type="date"]`) y buscador predictivo de usuarios candidatos para delegar.
   * Validación interactiva: Si la API retorna un error de delegación cruzada, se mostrará una alerta animada contextual de color rojo y diseño sofisticado indicando la advertencia.
   * En el ABM de usuarios, agregar una opción para que los administradores editen y activen la licencia del usuario de forma directa con los mismos controles.

4. **Visualización y Edición de Estado de Cuenta**:
   * En la grilla general del ABM de usuarios, mostrar badges coloreados de acuerdo al estado (`Activo` en verde HSL, `Inactivo` en gris HSL, `Suspendido` en rojo/naranja HSL).
   * En el modal `editar_usuario`, agregar un selector elegante para conmutar entre los estados correspondientes.

---

## Verification Plan

### Automated Tests
* **Prueba de Prevención de Bucle de Delegación**:
  * Simular petición de asignación de licencia: El usuario `u2` delega en `u3`.
  * Simular petición inversa: El usuario `u3` intenta delegar en `u2`.
  * **Resultado Esperado**: HTTP `400 Bad Request` indicando "Delegación cruzada prohibida: El usuario destino ya te ha asignado como delegado activo."
* **Prueba de Unicidad de Plantillas**:
  * Crear una plantilla y asignarla al tipo `Nota` (`NO`).
  * Crear una segunda plantilla e intentar asignarla también al tipo `Nota` (`NO`).
  * **Resultado Esperado**: Advertencia y reasignación automática de la plantilla hacia el nuevo template seleccionado, o error HTTP en caso de colisión estricta.

### Manual Verification
1. **Verificación de Tooltips**: Desplegar el modal de edición de un usuario, posicionar el cursor sobre el ícono de ayuda del rol "Firmante Oficial" y comprobar la aparición instantánea del popup explicativo.
2. **Desvío Automático por Licencia**: Configurar una licencia activa para el usuario `Juan Pérez` delegando en `María Gómez`. Derivar un expediente a Juan y comprobar que se almacene inmediatamente bajo el ownership de María, registrando la traza por ausencia en el historial de pases.
3. **Bloqueo de Login**: Configurar a un usuario como `Suspendido` desde el panel. Intentar iniciar sesión con las credenciales de dicho usuario y validar que la pantalla de login bloquee el ingreso mostrando el mensaje seguro.
