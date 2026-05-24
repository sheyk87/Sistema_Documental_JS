# 📊 Análisis de Cumplimiento: Sistema_Documental_JS vs. GDE

A continuación, se presenta un análisis detallado del estado actual de su proyecto `Sistema_Documental_JS` contrastado contra su lista de requerimientos. El análisis se divide en lo que ya **cumple**, lo que debe **mejorar** y lo que **no haría falta** (con sus justificaciones).

---

## 1. Requerimientos funcionales y no funcionales
### 1.1 Objetivo general del sistema
✅ **Cumple:** El sistema ya abarca el ciclo vital básico: creación, firma electrónica, circulación (enrutamiento por áreas/destinatarios), trazabilidad (tabla `history`) y archivo de documentos y expedientes. 
⚠️ **A Mejorar:** Formalizar los "Tipos de Documentos" en la base de datos. Actualmente, en el código y README se mencionan tipos de forma estática, pero no existe una tabla `document_types` para parametrizarlos dinámicamente.

---

## 2. Módulos funcionales principales
### 2.1 Autenticación y acceso
✅ **Cumple:** Inicio de sesión, 2FA (TOTP nativo), JWT, recuperación por códigos. Soporte LDAP en configuración.
⚠️ **A Mejorar:** 
- **Gestión de sesiones:** Al usar JWT sin estado, no tienes una tabla `sessions` para "Cerrar sesión remota" de forma inmediata (requerirías un esquema de refresh tokens o blacklist de tokens).
- **Bloqueo por intentos:** El backend tiene `express-rate-limit`, pero sería ideal registrar bloqueos temporales del usuario en la BD tras "N" intentos fallidos.
- **Cambio de contraseña:** Añadir una flag `force_password_change` en la tabla `users` para primeros ingresos.
❌ **No haría falta:** 
- **Detección de dispositivo no habitual:** Para el alcance actual, es complejo y propenso a falsos positivos sin un servicio de geolocalización. Con el 2FA obligatorio ya mitigas el acceso no autorizado.

### 2.2 Módulo de usuarios
✅ **Cumple:** Relación con áreas principales y secundarias (`area_id`, `areas` JSON), ABM básico.
⚠️ **A Mejorar:** 
- **Estados explícitos:** Añadir un campo `status` (Enum: 'active', 'inactive', 'suspended') a la tabla `users`. Actualmente solo se asume que si existe, está activo.
- **Delegación / Superior Jerárquico:** Añadir campos `superior_id` y `delegated_to` para permitir desvíos automáticos cuando un usuario está de licencia.

### 2.3 Roles y permisos
⚠️ **A Mejorar (Crítico):** 
- El sistema actual usa un esquema muy binario (`role ENUM('admin', 'user')`). Esto es insuficiente para un GDE real.
- Debes migrar a un modelo RBAC estructurado. Deberías crear tablas `roles`, `permissions` y `role_permissions` para separar a un "Redactor" de un "Firmante" o "Mesa de Entrada".

---

## 3. Gestión de documentos
### 3.1, 3.2 y 3.3 Creación, Tipos y Editor Documental
✅ **Cumple:** Editor web, soporte para múltiples destinatarios, manejo de PDF, campos JSON flexibles (`recipients`, `signed_by`).
⚠️ **A Mejorar:** 
- **Tabla `document_types`:** Necesaria para configurar metadatos (requiere firma conjunta, permite adjuntos, plantilla, etc.).
- **Plantillas:** Falta un gestor de plantillas (`templates`) en base de datos.
- **Documentos Reservados:** Agregar un campo booleano `is_reserved` a la tabla `documents` (actualmente solo lo tiene `expedientes` con `is_public`).

### 3.4 y 3.5 Estados y Numeración
⚠️ **A Mejorar:** 
- **Numeración Fuerte:** Actualmente el número es un `VARCHAR(50)`. Deberías implementar una tabla `numbering_sequences` que maneje el autoincremento atómico por Tipo y Año (ej. `NO-2026-000123-AREA`) para evitar huecos de numeración por concurrencia.

### 3.6 Adjuntos
✅ **Cumple:** Uso de Multer y JSON para metadatos.
⚠️ **A Mejorar:** 
- **Seguridad:** Añadir escaneo de Malware o al menos una validación estricta de "Magic Bytes" y no solo de la extensión.

---

## 4. Expediente electrónico
✅ **Cumple:** Creación, vinculación de fojas (`linked_docs`, `sealed_docs`), control de acceso por área/usuario (`auth_areas`).
⚠️ **A Mejorar:** 
- **Pases Formales:** Crear una tabla `expediente_movements` (Pases) para registrar de manera transaccional cuando un expediente salta de un área a otra, quién lo envió, quién lo recibe y qué fojas se añadieron en ese pase.
- **Carátula:** Generación automática en PDF de la "Carátula" del expediente.

---

## 5. Bandejas de trabajo
✅ **Cumple:** Enrutamiento a "Mi Trabajo" o "Trámites de Área" (según el README).
⚠️ **A Mejorar:** Mejorar los filtros en la API para soportar vistas como "Borradores", "Pendientes de Firma", "Enviados".

---

## 6. Flujos de trabajo
⚠️ **A Mejorar:**
- Actualmente el flujo está "hardcodeado" (ej. va de Creador -> Firmante N -> Archivo). Para flujos paralelos y secuenciales dinámicos, se requeriría una tabla `document_workflow` que defina los pasos y reglas de cada tipo de documento.
❌ **No haría falta:** 
- **Motor de reglas complejo (BPMN):** Programar un motor de reglas al estilo Alfresco es masivo. Se recomienda empezar con rutas predefinidas y saltos jerárquicos simples programados en el backend.

---

## 7. Firma electrónica / digital
✅ **Cumple:** Firma en lote, firma en cascada, QR, Hash SHA-256, sellado con certificado global del servidor (`node-signpdf`).
⚠️ **A Mejorar:** 
- El sistema usa un certificado `.p12` **global** del servidor. Si se busca "Firma Digital" con validez jurídica total para cada individuo, el sistema debería soportar que el usuario enchufe un Token (Hardware) o suba su propio certificado y la firma ocurra en el cliente o con su clave privada en el servidor.
❌ **No haría falta:** 
- **Sellado de tiempo (TSA externo):** A menos que la ley lo exija estrictamente, usar la marca de tiempo del propio servidor (asumiendo que está sincronizado por NTP) es suficiente para entornos internos.

---

## 8. Búsqueda, consulta y trazabilidad
✅ **Cumple:** Trazabilidad inmutable gracias a la tabla `history`. Búsqueda transversal por base de datos.
⚠️ **A Mejorar:** 
- **Búsqueda Full Text:** Actualmente buscas mediante `LIKE '%texto%'` en MySQL. Con muchos documentos, esto es lento. Considera usar índices `FULLTEXT` de MySQL sobre el campo `content` de los documentos.
❌ **No haría falta:** 
- **ElasticSearch / OCR:** Integrar OCR y ElasticSearch añadirá demasiada carga de infraestructura. Para iniciar, los índices de MySQL son más que suficientes.

---

## 9. Administración del sistema
✅ **Cumple:** ABM básico de áreas y usuarios.
⚠️ **A Mejorar:** Faltan todos los submódulos de administración avanzada: gestión de flujos, organigramas jerárquicos (áreas padres/hijas), numeradores y tipos de documentos.

---

## 10 y 11. Seguridad (Frontend y Backend)
✅ **Cumple:** `helmet`, CORS, Rate Limiting, sanitización DOMPurify, bcrypt, variables de entorno. Estás usando un enfoque muy seguro y moderno.
⚠️ **A Mejorar:**
- **Inyección SQL / ORM:** Estás usando `pool.query` con interpolación manual de strings en el `setup_full.js` (Ej: `INSERT ... VALUES ('${hash}')`). Aunque sea el setup, en los controladores *DEBES* usar consultas parametrizadas o prepared statements (`pool.query('SELECT * FROM users WHERE email = ?', [email])`) para evitar inyecciones.
- **Archivos:** Guardar archivos fuera del path público estático y servirlos por un endpoint que primero valide el JWT del usuario y sus permisos (Autorización).
- **Autorización Backend (ABAC/ACL):** Actualmente validas si es "admin" o "user". Falta validar en cada endpoint si el usuario `X` tiene acceso al documento `Y`.

---

## 12 y 13. Seguridad de BD y API
⚠️ **A Mejorar:**
- De la lista de "Tablas críticas sugeridas", te faltan: `roles`, `permissions`, `user_roles`, `document_types`, `document_workflow`, `expediente_movements`, `sessions`, `templates`, `numbering_sequences`. Tu esquema actual es eficiente gracias al uso de columnas JSON, pero sacrifica normalización necesaria para permisos granulares.

---

## 14. Robustez, disponibilidad y rendimiento
✅ **Cumple:** Node.js es excelente para concurrencia. MySQL maneja bien la transaccionalidad.
⚠️ **A Mejorar:**
- Implementar transacciones de base de datos (`BEGIN`, `COMMIT`, `ROLLBACK`) en las acciones complejas (ej. firmar documento, que actualiza el documento, añade historial y mueve expedientes). Esto es crítico para no perder integridad si el servidor falla a la mitad del proceso.

---

## 📌 Resumen del camino a seguir:

1. **Prioridad 1 (Arquitectura):** Refactorizar el sistema de roles y permisos. Dejar el binario admin/user y pasar a un esquema RBAC granular (Tablas de Roles y Permisos).
2. **Prioridad 2 (Estructuración):** Crear las tablas maestras de `document_types` y `numbering_sequences` para eliminar el hardcodeo y robustecer la numeración legal.
3. **Prioridad 3 (Expedientes):** Crear el flujo de `Pases` formal en base de datos.
4. **Prioridad 4 (Seguridad):** Validar que TODAS las consultas SQL sean parametrizadas, y que la subida/bajada de adjuntos esté protegida por autorización.
