# Walkthrough - Clasificación de Seguridad y 2FA en Firmas de Documentos

Hemos finalizado con éxito la implementación de los dos primeros puntos pendientes del archivo `ToDo.txt`. Este documento resume los cambios, la verificación automatizada realizada, y los pasos para la validación manual.

---

## Cambios Realizados

### 1. Base de Datos
- **Migración y Semillado**: Columnas `is_public` (boolean), `auth_areas` (json) y `auth_users` (json) agregadas a la tabla `documents`. Sembrados los permisos `doc_create_reserved` y `doc_sign_reserved` vinculados a los roles correspondientes.

### 2. Backend
- **roleMiddleware.js**: Restringe el acceso de lectura a documentos reservados según creador, dueño, usuarios autorizados, áreas autorizadas, o roles de administrador/auditor. Exige el permiso `doc_sign_reserved` para firmar.
- **authController.js / userController.js**: Retornan los permisos del usuario actual en respuestas de login, validación de 2FA y `/api/users/me` para inyectarlos en el estado del cliente.
- **docController.js**:
  - `createDocument` y `updateDocument`: Validan y guardan las columnas de clasificación de seguridad (`is_public`, `auth_areas`, `auth_users`). Rebotan la creación reservada si el usuario carece de `doc_create_reserved` (403).
  - `getAllDocuments` y `downloadAttachment`: Filtran y protegen a nivel de servidor los documentos no públicos para evitar Broken Access Control (OWASP A01).
  - `signFinalAndSeal`: Exige y valida el parámetro `twoFactorCode` usando el generador TOTP nativo si el documento es reservado.
- **expController.js**: Agrega validaciones similares de permisos en la creación y filtrado seguro de expedientes reservados en `getAllExpedientes`.

### 3. Frontend (`app.js`)
- **Creación de Documentos y Expedientes**: La opción para crear expedientes o documentos de tipo "Reservado" (toggle de privacidad y listas de selección de áreas y usuarios) solo se renderiza si el usuario activo posee el permiso `doc_create_reserved` en `state.currentUser.permissions`.
- **Filtros de Búsqueda local**: Añadido soporte local de búsqueda (`create-doc-auth`) para filtrar usuarios/áreas dinámicamente al redactar documentos reservados.
- **Detalle de Documentos**:
  - Renderiza un badge visual de **RESERVADO** para documentos que no son públicos.
  - Ofrece el botón de "Editar Permisos" (modal `editar_permisos_doc`) solo al dueño del documento si es reservado.
  - Oculta los botones de firma ("Firmar Yo Mismo", "Aplicar mi Firma") para documentos reservados si el usuario activo carece de `doc_sign_reserved`.
- **Intercepción y Filtrado**:
  - Protege el acceso desde la UI interceptando clics de visualización de documentos y expedientes reservados a los cuales no se tiene acceso (muestra alerta de acceso denegado).
  - Filtra todos los listados de bandejas de entrada, archivo general, bandeja del área, anulados y búsquedas utilizando la lógica unificada del helper `canViewDocumento`.
- **Firma 2FA**:
  - El modal de confirmación de firma solicita dinámicamente el código de 6 dígitos si el documento es reservado.
  - Valida el código 2FA llamando a la API en firmas intermedias, o lo envía en el `FormData` final a `/api/docs/sign-final/:id`.

---

## Verificación Automatizada

Se creó y ejecutó un script de prueba de integración en `/app/tests/verify_reserved_docs_2fa.js` dentro del contenedor `gde-backend`. 

### Resultados de la Ejecución:
```bash
🧪 Iniciando verificación de Clasificación de Seguridad y Firma con 2FA...
🔑 Logueando a Juan (u2)...
🔑 Logueando a María (u3)...
🔒 Activando temporalmente 2FA para Juan (u2) en la DB...
📄 Creando documento reservado doc_reserved_1781016954819 como Juan...
✅ Documento reservado creado correctamente.
🔍 María intenta leer el documento directamente (debe dar 403)...
Código HTTP al leer: 403
✅ BLOQUEO CORRECTO: María no tiene acceso de lectura.
✍️ Juan intenta firmar el documento sin pasar código 2FA (debe dar 400)...
Código HTTP sin 2FA: 400
Respuesta: Se requiere el código 2FA para firmar este documento reservado.
✅ BLOQUEO CORRECTO: Se requiere código 2FA.
✍️ Juan intenta firmar con un código 2FA incorrecto "111111" (debe dar 401)...
Código HTTP con 2FA incorrecto: 401
Respuesta: Código 2FA incorrecto.
✅ BLOQUEO CORRECTO: Código incorrecto rechazado.
✍️ Juan intenta firmar con un código 2FA correcto generado por otplib...
Código 2FA generado: 540495
Código HTTP con 2FA correcto: 202
Respuesta: { jobId: '4', message: 'Documento encolado para firma y sellado' }
✅ FIRMA EXITOSA: Documento encolado correctamente para firmar.
🧹 Restaurando estado 2FA de Juan...
🧹 Limpiando documento de prueba...
🏁 Proceso finalizado.
```

---

## Ajustes y Correcciones de Follow-up

### 1. Columna "Acceso" en Tablas y Buscador
- **Firma Masiva**: Se agregó la columna "Acceso" a la tabla de Firma Masiva (`renderBatchSign` en `app.js`), mostrando el correspondiente badge visual (`Público` / `Reservado` con el icono de escudo/candado).
- **Tablas de Documentos (Bandejas, Borradores, Archivo, Anulados)**: Gracias al nuevo uso unificado de `renderAccessBadge(item)` en `renderTable`, todos los listados de documentos (Bandeja Personal, Bandeja del Área, Mis Borradores, Archivo Central, Anulados) muestran el badge dinámico correctamente.
- **Buscador (Consulta General)**: Se corrigió la lógica del buscador para mostrar el badge del documento en lugar del texto '-' cuando se busca con el filtro "Todos". También se actualizó el comparador de ordenación por "Acceso" en `app.js` para que funcione correctamente con ambos tipos de elementos (documentos y expedientes).

### 2. Iconos de Candado en Badges Reservados
- Se unificó el badge en todas las tablas y en las vistas de detalle de documentos y expedientes para mostrar el icono de seguridad de Lucide (`shield` / candado de seguridad) con el fondo amarillo característico y texto en mayúsculas `RESERVADO`.

### 3. Corrección de Visibilidad en Rechazo de Firmas
- **Rechazo Individual y Masivo**: Al rechazar la firma de un documento, la propiedad `areaId` del documento ahora se actualiza al área del propietario anterior (el remitente original). Esto soluciona el problema por el cual el documento no reaparecía en la bandeja del remitente debido a filtros de pertenencia al escritorio.

---

## Verificación de Integración de Rechazos

Se creó y ejecutó un script de prueba de integración en `/app/tests/verify_document_rejection.js` dentro del contenedor `gde-backend`. 

### Resultados de la Ejecución:
```bash
🧪 Iniciando verificación de flujo de Rechazo de Documento...
🔑 Logueando a Juan (u2)...
🔑 Logueando a María (u3)...
📄 Creando documento doc_reject_test_1781019797306 como Juan (u2)...
✅ Documento de prueba creado.
✉️ Juan envía el documento a María para firma (cambio de dueño y área)...
✅ Documento enviado a María (dueño: u3, área: a2).
❌ María rechaza el documento (restaurando dueño u2 y área a1)...
✅ Rechazo procesado exitosamente en el servidor.
🔍 Registro en DB: dueño = u2, área = a1, estado = Rechazado
✅ VERIFICACIÓN EXITOSA: El documento volvió a Juan y su área original a1.
🧹 Limpiando documento de prueba...
🏁 Proceso finalizado.
```

---

## Verificación Manual de los Ajustes

1. **Visualización de la Columna Acceso**:
   - Inicie sesión y acceda a "Firma Masiva", "Mis Borradores", "Archivo Central", "Anulados" y la "Bandeja de Entrada". Compruebe que todos los documentos y expedientes listados muestran el badge verde `PÚBLICO` o amarillo `RESERVADO` (con su icono de escudo) bajo la columna **Acceso**.
   - En el buscador ("Consulta General"), realice una búsqueda general y valide que la columna de acceso muestra el badge correcto para documentos reservados.
2. **Prueba de Rechazo**:
   - Juan crea un documento y lo envía a María para su firma.
   - Inicie sesión como María, localice el documento en su bandeja personal y proceda a rechazar la firma indicando un motivo.
   - Vuelva a iniciar sesión como Juan. Valide que el documento rechazado aparece inmediatamente en su Bandeja Personal / Mis Borradores, con estado `Rechazado` y el badge de acceso correspondiente.

