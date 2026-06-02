# Explicación de Roles y Permisos en el SGDE

Este documento proporciona una explicación exhaustiva sobre el modelo de seguridad basado en roles (RBAC - *Role-Based Access Control*) y listas de control de acceso por objeto (ACL - *Access Control Lists*) que rige en el sistema.

---

## 🔑 Permisos Granulares (Permissions)

Los permisos granulares son las operaciones mínimas individuales que un usuario puede realizar en el sistema. Están definidos en la base de datos y validados rigurosamente en cada ruta de la API del backend:

| Identificador del Permiso | Nombre del Permiso | ¿Qué permite hacer realmente? |
| :--- | :--- | :--- |
| **`doc_create`** | Crear Borrador de Documento | Permite iniciar la redacción de un nuevo documento (Nota, Memo, Solicitud, etc.). |
| **`doc_read`** | Visualizar Detalles de Documento | Permite leer el contenido, firmantes y el historial de un documento lícito. |
| **`doc_edit`** | Editar Borrador de Documento | Permite modificar el asunto, cuerpo y adjuntos de un borrador antes de firmarse. |
| **`doc_delete`** | Eliminar Borrador de Documento | Permite borrar borradores propios que no han entrado en circulación oficial. |
| **`doc_sign`** | Aplicar Firma a Documento | Permite aplicar la firma electrónica (sellado digital) para oficializar un documento. |
| **`exp_create`** | Caratular / Iniciar Expediente | Permite abrir un expediente nuevo (público o reservado), dándole una carátula. |
| **`exp_read`** | Visualizar Expediente | Permite consultar la metadata, fojas enlazadas e historial de pases de un expediente. |
| **`exp_write`** | Editar Expediente y Vincular Fojas | Permite modificar la carátula o asociarle nuevos documentos firmados (vincular fojas). |
| **`exp_pase`** | Realizar Pase de Expediente | Permite transferir (derivar) la tenencia de un expediente a otro usuario o área. |
| **`admin_users`** | Gestionar Usuarios | Permite crear, modificar, suspender, eliminar usuarios y administrar sus licencias. |
| **`admin_areas`** | Gestionar Reparticiones / Áreas | Permite configurar el organigrama (crear y editar reparticiones/sectores). |
| **`admin_services`** | Configurar Conectividad | Permite modificar las credenciales de correo (SMTP), LDAP y configuraciones de 2FA. |
| **`audit_logs`** | Acceso a Logs de Auditoría | Permite visualizar la trazabilidad de logs críticos para el control interno de seguridad. |

---

## 🎭 Roles Estándar y su Propósito

Cada rol representa un perfil de negocio específico que agrupa un conjunto lógico de permisos granulares. El sistema soporta la asignación múltiple de roles por usuario.

### 1. Administrador Técnico (`admin`)
* **Propósito:** Mantenimiento, control global de accesos y auditoría de la plataforma.
* **Acciones Reales:**
  * Crear, modificar, suspender o reactivar cuentas de usuario.
  * Configurar e importar áreas (organigrama institucional).
  * Habilitar o inhabilitar de manera global la autenticación 2FA, conectividad LDAP corporativa o envío de notificaciones por correo electrónico.
  * Visualizar los logs de auditoría para el análisis forense de cualquier acción (quién firmó, quién derivó, qué se modificó).
  * *Permisos:* Cuenta con **todos** los permisos del sistema de forma implícita.

### 2. Usuario Estándar (`user`)
* **Propósito:** Operador común de mesa de entradas, despacho o tramitación institucional diaria.
* **Acciones Reales:**
  * Iniciar borradores de notas, memos o providencias.
  * Caratular expedientes públicos o reservados.
  * Vincular fojas (documentos firmados) y realizar pases oficiales a otras personas o reparticiones.
  * *Permisos:* `doc_create`, `doc_read`, `doc_edit`, `doc_delete`, `doc_sign`, `exp_create`, `exp_read`, `exp_write`, `exp_pase`.

### 3. Redactor de Documentos (`redactor`)
* **Propósito:** Personal de apoyo o asistentes administrativos encargados de la confección de textos, transcripciones o preparación previa de la documentación.
* **Acciones Reales:**
  * Crear borradores de documentos y editarlos (`doc_create`, `doc_edit`).
  * No tiene potestad legal para firmar los documentos (no puede oficializarlos).
  * No puede realizar la apertura ni pases de expedientes, limitando su alcance estrictamente a borradores documentales.

### 4. Revisor de Trámites (`revisor`)
* **Propósito:** Jefes de sector o inspectores dedicados al control formal, foliatura, ortografía y contenido antes de que los expedientes avancen a su sanción legal.
* **Acciones Reales:**
  * Examinar borradores y expedientes asignados a su bandeja.
  * Modificar, añadir o rechazar fojas de los trámites en curso.
  * *Permisos:* `doc_read`, `doc_edit`, `exp_read`, `exp_write`. Carece de permisos para aplicar firmas o caratular nuevos expedientes.

### 5. Firmante Oficial (`firmante`)
* **Propósito:** Autoridad con poder de decisión y representación legal (Ministros, Secretarios, Directores, Apoderados).
* **Acciones Reales:**
  * Aplicar firma digital y sellado criptográfico (`doc_sign`) a los borradores elevados por redactores o revisores, convirtiéndolos en instrumentos públicos inmutables.
  * Aprobar y oficializar pases de expedientes vinculando fojas.
  * *Permisos:* `doc_read`, `doc_sign`, `exp_read`.

### 6. Auditor Gubernamental (`auditor`)
* **Propósito:** Organismos de control externo (como Tribunales de Cuentas, Sindicaturas o auditores internos).
* **Acciones Reales:**
  * Visualización de **sólo lectura** de absolutamente todos los expedientes del sistema, incluyendo aquellos marcados como **reservados** (saltándose las restricciones geográficas de áreas).
  * Acceso de lectura completo a los logs de auditoría para verificar la legalidad de los plazos y firmas de cada trámite.
  * *Permisos:* `doc_read`, `exp_read`, `audit_logs`. Tiene estrictamente prohibido crear, modificar, firmar, eliminar o desviar cualquier trámite o expediente.

---

## 🔒 Control de Accesos por Objeto (ACL / Inmutabilidad)

Además de los roles, el sistema implementa reglas contextuales de seguridad muy estrictas (OWASP A01):
1. **Tenencia Física:** Solo el tenedor actual (`current_owner_id`) de un expediente o documento puede modificarlo o derivarlo. Aunque seas un Revisor o un Administrador, si el documento no está actualmente en tu bandeja, no puedes editarlo.
2. **Inmutabilidad Documental:** Una vez que un documento es firmado (`Firmado`), archivado o anulado, su asunto y su cuerpo son **criptográficamente inmutables**. Nadie (incluyendo administradores) puede modificar una sola letra del texto original.
3. **Integridad de Fojas Selladas:** Al realizar un pase de expediente, todas las fojas (documentos) vinculadas son selladas de manera definitiva. Si intentas desvincular una foja sellada, el backend abortará y rechazará la transacción para evitar fraudes en la foliación.
