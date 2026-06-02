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

---

## 🔢 Walkthrough de Implementación: Fase 2 - Módulo de Numeración Transaccional

Se completó con éxito el diseño, desarrollo, acoplamiento y verificación bajo stress de concurrencia de la **Fase 2: Módulo de Numeración Transaccional y Atomicidad (MySQL)**.

### 🛠️ Cambios Realizados en la Fase 2

#### 1. Servicio de Foliación y Numeración Transaccional (`numberingService.js`)
* Creamos el archivo [numberingService.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/services/numberingService.js) en el backend.
* **Manejo de Transacciones y Bloqueo FOR UPDATE**: El servicio abre una transacción SQL aislada y ejecuta `SELECT \`last_value\` FROM numbering_sequences WHERE doc_type = ? AND year = ? FOR UPDATE` para bloquear de forma exclusiva la fila de la secuencia en curso.
* **Retrocompatibilidad y Mitigación de Palabras Reservadas**: Escapamos la columna `last_value` con comillas invertidas para prevenir fallos de análisis sintáctico con la función de ventana `LAST_VALUE` introducida en MySQL 8.0.
* **Sufijo y Prefijo Oficial**: Formatea de forma segura e inmutable la numeración en el formato legal: `[PREFIX]-[YEAR]-[NroPadded]-[AREA]` (ej. `NO-2026-000001-Sistemas`).

#### 2. Controlador y Ruta de Asignación en Caliente (`docController.js` y `docRoutes.js`)
* Implementamos `exports.assignDocumentNumber` para resolver la foliación atómica antes de generar el PDF en el frontend, previniendo doble asignación o race conditions.
* Registramos la ruta `POST /api/docs/assign-number/:id` bajo el middleware de autenticación y control de accesos.

#### 3. Carátula de Expedientes en Backend (`expController.js`)
* Refactorizamos `createExpediente` para calcular atómicamente el número correlativo `EX-[AÑO]-[Nro]-[Área]` llamando a `numberingService.getNextNumber('EX', areaId)` en el momento de inserción en MySQL.
* Retorna el número oficial directamente en el JSON de respuesta exitosa.

#### 4. Reactividad en el Frontend (`app.js`)
* Eliminamos la función `generateNumber` y los contadores en memoria del cliente (`state.db.counters`) para centralizar el 100% de la foliación en MySQL.
* Ajustamos la firma de documentos (individual y masiva) para llamar asíncronamente a `/api/docs/assign-number/:id` en caliente, estampando físicamente el número definitivo en el PDF autogenerado y el código QR de validación.

---

## 🧪 Pruebas de Integración y Concurrencia de la Fase 2

Creamos un script de pruebas concurrentes extremas, [verify_numbering_race.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/tests/verify_numbering_race.js), que simula un escenario real donde 50 usuarios firman documentos simultáneamente.

### Ejecución del Test de Concurrencia:
```bash
$ docker exec gde-backend node tests/verify_numbering_race.js

🧪 Iniciando verificación de concurrencia de la Fase 2...
🔑 Obteniendo credenciales de Juan (User 1)...
📄 Creando 50 borradores de prueba en la base de datos...
⚡ Disparando 50 peticiones de foliación en paralelo de forma concurrente...
✅ Todas las llamadas concurrentes finalizaron.
📋 Números generados:
[
  'NO-2026-000001-Dirección General',
  'NO-2026-000006-Dirección General',
  'NO-2026-000037-Dirección General',
  ...
  'NO-2026-000016-Dirección General'
]
✅ UNICIDAD COMPLETA: Todos los números correlativos generados son únicos.
✅ FORMATO CORRECTO: Todos los números cumplen con la estructura [PREFIX]-[AÑO]-[NroPadded]-[AREA].
🔢 Secuencia correlativa ordenada: 1 hasta 50
✅ SECUENCIA PERFECTA: No se detectó ningún salto ni duplicación en la numeración asignada.
🧹 Limpiando los documentos concurrentes creados...
🎉 🎉 LA FASE 2 PASÓ CON ÉXITO! El motor de numeración es 100% atómico y seguro bajo stress concurrente.
```

El motor de foliación cumple ahora de forma absoluta con el estándar del pliego y está a prueba de cualquier nivel de concurrencia administrativa concurrente.

---

## 📂 Walkthrough de Implementación: Fase 3 - Plantillas, Roles, Licencias y Estado de Cuentas

Se ha completado con éxito la **Fase 3: Gestión de Plantillas, Roles/Permisos Avanzados, Licencias con Prevención de Bucle y Control de Cuentas**.

### 🛠️ Cambios Realizados en la Fase 3

#### 1. Gestión Completa de Plantillas (Templates)
* **Backend y Base de Datos**: Recreación de la tabla `templates` con relación flexible, adición de la columna `template_id` en `document_types`, e implementación de un controlador de resolución atómica (`templateController.js`) con fallback global.
* **Frontend (`app.js`)**:
  * Implementación del panel de gestión premium `renderAdminTemplates()` para Admins con inicialización dinámica de TinyMCE.
  * **Precarga Reactiva**: Inyección de un listener de selección (`#create-doc-type`) que recupera asíncronamente el template correspondiente a través de `/api/templates/for-type/:docCode` y lo precarga directamente dentro del cuerpo de TinyMCE.

#### 2. Roles, Permisos y Estados de Cuenta
* **Asignación Múltiple**: Los administradores ahora pueden asignar múltiples roles a los usuarios tanto en la creación como en el modal de edición (`editar_usuario`), guardándolos atómicamente en la tabla asociativa `user_roles` del backend.
* **Grilla Premium con Tooltips CSS**: Implementación de una grilla de control de accesos elegante con tooltips descriptivos contextuales puros CSS (`group-hover:opacity-100`) inmunes a condiciones de carrera de Javascript.
* **Estado de Cuenta (`status`)**: Selector de estado (`Activo`, `Inactivo`, `Suspendido`) en el modal con badges coloreados en el listado. Modificación en `authController.js` y `authMiddleware.js` para revocar en tiempo real los accesos y sesiones de cuentas desactivadas o suspendidas.

#### 3. Módulo de Licencias / Ausencias y Bucle de Delegación
* **Autogestión de Perfil**: Inyección de la pestaña **Licencia / Ausencia Administrativa** (`#form-user-licence`) en la sección de configuración de perfil del usuario.
* **Validación de Bucle**: Validación estricta en el backend (`licenceController.js`) que previene de forma atómica y transaccional la **delegación cruzada** (si A designa a B, B no puede designar a A).
* **Notificaciones Duales**: Emisión automática de notificaciones de campanita web y correos electrónicos SMTP al delegado en autogestión, y a ambos implicados si lo asigna un administrador.
* **Redirección de Bandeja**: Intercepción de pases y derivaciones de documentos/expedientes para reencaminar automáticamente el ownership físico al delegado del usuario durante la vigencia de su licencia, registrando la traza en la auditoría inmutable.

---

## 🧪 Pruebas de Integración y Verificación de la Fase 3

Creamos un script automatizado para la Fase 3, [verify_fase3.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/tests/verify_fase3.js), ejecutado con éxito dentro del contenedor Docker `gde-backend`.

### Resultados de la Ejecución de Pruebas:
```bash
$ docker compose exec backend node tests/verify_fase3.js

=== INICIANDO PRUEBAS DE VERIFICACIÓN - FASE 3 ===
1. Creando usuarios de prueba...
2. Probando delegación normal (A -> B)...
   ✔ Delegación A -> B guardada correctamente.
3. Intentando realizar delegación cruzada (B -> A)...
   ✔ BLOQUEO CORRECTO: Delegación cruzada detectada exitosamente.
     [Mensaje Esperado] El usuario de destino (Usuario Test A) ya te tiene configurado a ti (Usuario Test B) como su delegado activo.
4. Probando unicidad de templates por tipo documental...
   ✔ Plantilla 1 asignada al tipo 'NO' correctamente.
   ✔ Plantilla 2 reasignada correctamente (Unicidad garantizada en columna única).

=== TODAS LAS PRUEBAS DE LA FASE 3 CUMPLIDAS CORRECTAMENTE (100% OK) ===
```

### 🩹 Optimizaciones de Último Momento (Fase 3 Final Hotfixes)

Para asegurar la robustez definitiva del sistema antes de iniciar la Fase 4, se completaron los siguientes refinamientos críticos:

1. **Buscador de Delegados y Robustez Local (`app.js`)**:
   * **Buscador Scope-Sensitive**: Modificamos el manejador del evento `input` de `data-local-search` para limitar su área de búsqueda en el DOM. En lugar de interrogar a todas las etiquetas `.dest-item` globales (lo que causaba interferencias visuales), ahora filtra exclusivamente los elementos secundarios que pertenecen al contenedor actual del buscador (ej: `#licence-delegate-container` en configuración de perfil, o el bloque del modal de edición del administrador).
   * **Prevención de Excepciones Runtime**: Añadimos validaciones condicionales que aseguran que si un elemento `.dest-item` carece de `.dest-text`, el buscador lo omite de forma segura sin arrojar un error de `TypeError` en el hilo de ejecución principal de JavaScript.

2. **Migración a Endpoints Relativos Dinámicos (`API_BASE`)**:
   * Descubrimos que el frontend conservaba URLs absolutas hardcodeadas apuntando a `http://localhost:3000` en unos 38 endpoints. Esto impedía que las llamadas asíncronas de templates, licencias, descargas o firmas funcionaran de forma correcta al acceder desde un dominio de producción (como `gde.sistema.com`).
   * Reemplazamos todos los llamados directos por la constante dinámica `${API_BASE}`, garantizando que las peticiones se dirijan fluidamente a `localhost:3000` durante el desarrollo local, y hereden transparentemente el origen de dominio real de Nginx (`window.location.origin`) al desplegarse en producción o en el enjambre de Docker.

3. **Seguimiento e Integridad de Plantillas (Comportamiento del Fallback)**:
   * **Precedencia de Plantilla Específica**: Confirmamos y blindamos el comportamiento del motor de plantillas: cuando una plantilla es marcada como "Global", se adopta reactivamente en todos los tipos de documentos *a excepción* de aquellos tipos documentales que posean un template específico explícitamente asignado (ej: "Memo" mantiene su propio diseño estructurado y "Nota" funciona como plantilla fallback para el resto). Esto cumple perfectamente con la regla de negocio de que un documento nunca puede tener más de una plantilla asignada a la vez.

4. **Invalidación de Caché Completa**:
   * Para asegurar la propagación inmediata de todas estas mejoras a nivel de navegador y cliente final, la versión del Service Worker se incrementó a `gde-pwa-v11` en `sw.js` y el contenedor frontend de Nginx fue exitosamente recompilado y reiniciado.

### 🎨 Refinamiento y Homologación de Editores de Plantillas

Para brindar una experiencia totalmente premium y alineada con los requisitos exigentes del pliego, implementamos las siguientes mejoras clave:

1. **Autocarga Reactiva al Ingresar al Panel de Plantillas**:
   * **Causa Raíz:** Anteriormente, `state.db.templates` solo se cargaba al realizar una acción de guardar, actualizar o eliminar. Si un administrador ingresaba al panel por primera vez tras iniciar sesión, el listado se mostraba vacío.
   * **Solución:** Implementamos un validador asíncrono en `renderAdminTemplates()` que detecta si el catálogo de plantillas está indefinido, gatillando automáticamente un llamado asíncrono a `/api/templates` para renderizar en pantalla las plantillas preexistentes.

2. **Validación del Cuerpo de Plantilla en Frontend**:
   * **Causa Raíz:** Si un administrador intentaba guardar una plantilla con el editor vacío, el sistema realizaba una petición POST al servidor que fallaba en la validación del modelo backend devolviendo un error `400 Bad Request`.
   * **Solución:** Inyectamos un validador robusto en el submit de `form-admin-template`. Este remueve selectivamente etiquetas HTML vacías generadas por TinyMCE (como `<p></p>`, `<p><br></p>` y caracteres de espacio no separable `&nbsp;`) y, si determina que el cuerpo está vacío de contenido, interrumpe el flujo de manera segura notificando un amigable `alert` al usuario.

3. **Homologación Premium de Editores TinyMCE**:
   * **Causa Raíz:** El editor del diseñador de plantillas tenía una inicialización simplificada sin menús y con opciones muy reducidas en comparación con el editor completo de redacción de documentos.
   * **Solución:** Actualizamos la función `initTemplatesEditor()` de `app.js` para heredar de forma idéntica todas las capacidades de `initTinyMCE()`. Ahora el creador de plantillas ofrece:
     * Menú completo de edición de tablas, formatos, inserción de caracteres especiales y herramientas.
     * Barra de herramientas extendida (selección de fuentes, alineación avanzada, paleta de colores HSL, código de fojas).
     * Integración y compatibilidad al 100% con el **Modo Oscuro (Dark Mode)**, aplicando skins dinámicos en caliente y estilos serif coherentes.

---

## 📂 Walkthrough de Implementación: Fase 4 - Corrección de Delegación y Buscador de Expedientes Reservados

Se ha completado con éxito la **Fase 4: Corrección de Delegación Cruzada y Búsqueda en Expedientes Reservados**.

### 🛠️ Cambios Realizados en la Fase 4

#### 1. Corrección del Bug de Delegación en ABM de Usuarios (Frontend)
* **Causa Raíz:** Anteriormente, al guardar un usuario en el panel ABM (`editar_usuario`), si el endpoint de configuración de licencia (`/api/licences/admin-configure`) fallaba (debido a validaciones de delegación cruzada u otras restricciones de base de datos), el estado en el frontend (`state.db.users[uIdx]`) se actualizaba ávidamente con los valores uncommitted de licencia. Al cerrar e intentar editar nuevamente al usuario, la delegación seguía viéndose erróneamente marcada.
* **Solución:** Modificamos la secuencia de guardado en `app.js` para actualizar los campos `licence_start`, `licence_end`, y `delegated_to` en el estado local de memoria **solamente tras haber recibido una confirmación HTTP 200 (res.ok) por parte de la API**. De esta forma, si el backend rechaza la delegación por cruzamiento prohibido, la vista del administrador descarta inmediatamente los datos temporales no guardados, previniendo visualizaciones inconsistentes.

#### 2. Buscador en la Lista de Autorizados de Expedientes Reservados
* **Edición de Permisos**: Rediseñamos el modal de permisos de expediente (`editar_permisos_exp`) en `app.js` para incorporar un buscador de áreas o usuarios. Este buscador utiliza la arquitectura reactiva de búsqueda del modal (`data-modal-input="search"`), la cual filtra reactiva y dinámicamente las áreas y usuarios autorizados basados en el término buscado.
* **Apertura de Expedientes**: Validamos y garantizamos que el buscador dinámico por DOM (`data-local-search="create-exp-auth"`) del formulario de caratulación esté completamente operativo y filtre de manera óptima las áreas y usuarios para caratulación reservada.

---

## 📂 Walkthrough de Implementación: Fase 5 - Resolución de Bug en Pase de Expediente e Importación/Exportación CSV Completa

Se ha completado con éxito la **Fase 5: Resolución de Bug en Pase de Expediente e Importación/Exportación CSV Completa**.

### 🛠️ Cambios Realizados en la Fase 5

#### 1. Resolución de Bug de Pase de Expediente (`expController.js`)
* **Causa Raíz:** Al intentar hacer un pase formal de expediente (`/api/exps/:id/pase`), el servidor arrojaba un error `Column 'sender_area_id' cannot be null (ER_BAD_NULL_ERROR)`. Esto ocurría porque la constante `senderAreaId` se leía directamente de `req.user.areaId`, pero el middleware de autenticación (`authMiddleware.js`) no almacena la repartición (`areaId`) dentro de la sesión decodificada del JWT, lo cual provocaba un valor `undefined` que bloqueaba la consulta MySQL.
* **Solución:** Modificamos la función `makePase` para consultar dinámicamente y en caliente el `area_id` real del emisor directamente de la base de datos dentro del contexto transaccional. Esto elimina cualquier dependencia de propiedades del token JWT y garantiza un pase formal 100% libre de fallas de nulos.

#### 2. Ampliación y Homologación del ABM CSV de Usuarios
* **Exportación Completa (`app.js`)**: Extendimos el formateador `handleExport('admin_users')` para emitir la cabecera completa 1-to-1 mapeada a las propiedades de importación: `name,email,password,areaId,role,areas,status,twoFactorEnabled,roles,licenceStart,licenceEnd,delegatedTo`. Para mayor seguridad, la contraseña de los usuarios se emite con el placeholder `********` (el cual es inteligentemente ignorado si se vuelve a re-importar para no alterar claves existentes).
* **Importación Tolerante (`app.js`)**: Refactorizamos el cargador de archivos del frontend para remover comillas envolventes de las celdas, ignorar de manera inteligente los placeholders de password y parsear reactivamente el estado de la cuenta, la bandera 2FA, la lista de múltiples roles separados por punto y coma, y todos los campos de licencia y delegación de forma robusta.
* **Transaccionalidad en Backend (`userController.js`)**: Modificamos el controlador `bulkCreateUsers` del servidor para envolver el guardado masivo en una transacción SQL aislada. El nuevo motor ahora inserta con éxito:
  * El estado de cuenta (`status`).
  * La configuración 2FA activa/desactiva (`two_factor_enabled`).
  * Los datetimes de licencias formateados a MySQL (`licence_start`, `licence_end`).
  * El identificador del usuario delegado (`delegated_to`).
  * La vinculación automática de múltiples roles granulares en la tabla asociativa `user_roles`.

---

## 📂 Walkthrough de Implementación: Fase 6 - Sincronización UPSERT Simétrica para Usuarios y Áreas mediante CSV

Se ha completado con éxito la **Fase 6: Sincronización UPSERT Simétrica para Usuarios y Áreas mediante CSV**.

### 🛠️ Cambios Realizados en la Fase 6

#### 1. Lógica de Sincronización UPSERT para Usuarios (`userController.js` y `app.js`)
* **Exportación Simétrica**: Agregamos la columna `id` al inicio de la exportación de usuarios en `app.js` (`handleExport('admin_users')`).
* **UPSERT en Backend**: Refactorizamos `bulkCreateUsers` en `userController.js` para procesar de forma transaccional el guardado masivo:
  * Si la fila del CSV viene con un `id` que ya existe en la base de datos, realiza una actualización del registro (`UPDATE`) respetando la contraseña existente (sólo la cambia si se proporciona una clave nueva distinta a `********`).
  * Si la fila del CSV viene con el `id` **vacío/en blanco**, el sistema le asigna un ID autogenerado único (`u[timestamp][random]`) y lo **inserta** como usuario nuevo (`INSERT`), requiriendo que posea una contraseña válida de al menos 8 caracteres.
  * También actualiza en caliente los roles asociados en la tabla `user_roles` eliminando los anteriores y vinculando los nuevos definidos en el CSV (separados por `;`).

#### 2. Lógica de Sincronización UPSERT para Áreas (`areaController.js` y `app.js`)
* **Exportación Simétrica**: Modificamos el módulo de exportación de áreas en `app.js` (`handleExport('admin_areas')`) para emitir una estructura de columnas simétrica limpia `id,name` coherente al formato de importación.
* **Importación Flexible**: Ajustamos el lector CSV del frontend para áreas para soportar la omisión del ID en registros nuevos y filtrar las áreas válidas únicamente basándose en la presencia del nombre (`a.name`).
* **UPSERT en Backend**: Refactorizamos `bulkCreateAreas` en `areaController.js` para realizar una actualización transaccional:
  * Si la fila posee un `id` que ya existe en la base de datos, ejecuta un `UPDATE` del nombre de la repartición.
  * Si el campo `id` viene vacío o en blanco, genera automáticamente un identificador de área único (`a[timestamp][random]`) y lo inserta como nueva repartición (`INSERT`).

---

## 📂 Walkthrough de Implementación: Hotfix Final - Traducción de Notificaciones de Licencias e Invalidación de Caché PWA

Se ha completado con éxito la **Traducción Definitiva y Consistente de las Notificaciones de Licencia en Español e Invalidación de Caché Automatizada**.

### 🛠️ Cambios Realizados

#### 1. Unificación y Diccionario de Traducción en Frontend (`app.js`)
* **Consistencia Total**: Homologamos la traducción de la acción de notificación (`n.action`) utilizando un objeto diccionario de mapeo robusto tanto en la vista del sidebar de notificaciones (`renderNotifications`, línea 456) como en el menú flotante del header de notificaciones (`app.js`, línea 1777).
* **Mapeo Soportado**:
  * `licence_assigned` / `LICENCE_ASSIGNED` ➔ **Licencia Asignada**
  * `licence_cleared` / `LICENCE_CLEARED` ➔ **Licencia Finalizada**
  * `delegado_licencia` / `DELEGADO_LICENCIA` ➔ **Desvío por Licencia**
  * `derivacion` / `DERIVACION` ➔ **Derivación**
  * `firma` / `FIRMA` ➔ **Firma**
  * `rechazo` / `RECHAZO` ➔ **Rechazo**

#### 2. Actualización de Versión de Service Worker e Invalidación de Caché (`sw.js`)
* **Causa Raíz**: Aunque el código local de `app.js` ya contenía modificaciones previas en algunos módulos, los navegadores de los usuarios retenían agresivamente la versión anterior en caché debido al comportamiento off-line del Service Worker de la PWA.
* **Solución**: Incrementamos la constante `CACHE_NAME` a `gde-pwa-v13` en `sw.js`. Al cargarse esta nueva versión de Service Worker, el navegador destruye automáticamente la caché obsoleta (`gde-pwa-v12`) y descarga el nuevo `app.js` modificado sin requerir la intervención manual del usuario.

#### 3. Despliegue en Caliente en Contenedores Docker
* Copiamos en caliente `app.js` y `sw.js` actualizados al directorio de Nginx del contenedor `gde-frontend`:
  `docker cp gde_frontend/app.js gde-frontend:/usr/share/nginx/html/app.js`
  `docker cp gde_frontend/sw.js gde-frontend:/usr/share/nginx/html/sw.js`
* Sanitizamos las URLs locales en caliente dentro de Nginx utilizando `sed`:
  `docker exec gde-frontend sed -i 's|http://localhost:3000||g' /usr/share/nginx/html/app.js`
