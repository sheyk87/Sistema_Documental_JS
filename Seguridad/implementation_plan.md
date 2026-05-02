# Plan de Seguridad Integral - Sistema GDE (OWASP Top 10)

## Resumen

Análisis completo del Sistema GDE (backend Express + frontend Vanilla JS) identificando **vulnerabilidades críticas** y plan de corrección + testing según OWASP Top 10 2021.

---

## Vulnerabilidades Identificadas por OWASP Top 10

### A01 - Broken Access Control (CRÍTICO)
- **Sin verificación de roles** en rutas admin (crear/eliminar usuarios, áreas, settings)
- Cualquier usuario autenticado puede crear/eliminar usuarios y áreas
- `updateSettings` verifica rol en controller pero no en middleware
- `deleteAttachment`, `deleteDocument` no verifican ownership
- `updateDocument` no verifica que el usuario sea owner
- Ruta pública `verifyPublicDoc` expone metadata sin rate limiting

### A02 - Cryptographic Failures (CRÍTICO)
- **Secretos hardcodeados en .env versionado**: JWT_SECRET, FILE_SECRET, STORAGE_ENCRYPTION_KEY, DB_PASSWORD
- `.env` NO está en `.gitignore` → secretos en repositorio
- `JWT_SECRET` débil: `mi_palabra_secreta_super_segura_123`
- `FILE_SECRET` de solo 32 chars sin entropía real
- Clave de respaldo hardcodeada en `cryptoService.js`
- Cookie `gde_session` sin flags `Secure`, `HttpOnly`, `SameSite`
- Token JWT almacenado en `localStorage` (vulnerable a XSS)
- TLS no verificado en email: `tls: { rejectUnauthorized: false }`
- Contraseña del certificado P12 vacía

### A03 - Injection (ALTO)
- Si bien usa queries parametrizadas (bueno), hay **XSS masivo**: todo el frontend usa `innerHTML` con datos del servidor sin sanitizar
- `doc.content` (HTML de TinyMCE) se renderiza directamente → Stored XSS
- `notificationController` inyecta `action` y `message` en HTML de email sin escape
- `systemController.updateSettings` escribe valores del body directo al `.env` sin validación → puede inyectar variables arbitrarias
- `filename` en `downloadAttachment` viene del URL param sin sanitizar → Path Traversal potencial

### A04 - Insecure Design (ALTO)
- Sin rate limiting en login, forgot-password, 2FA verify
- Reset code de solo 8 chars hex sin bloqueo por intentos
- Reset code comparación sin timing-safe
- No hay bloqueo de cuenta tras intentos fallidos
- Token temporal 2FA dura 15min, demasiado largo
- `bulkCreateUsers` usa contraseña por defecto `'123'`
- Polling de notificaciones cada 10 segundos (DoS potencial)

### A05 - Security Misconfiguration (CRÍTICO)
- **CORS totalmente abierto**: `app.use(cors())` sin restricción de origen
- Sin headers de seguridad (Helmet): no X-Frame-Options, no CSP, no HSTS
- `express.json()` sin límite de tamaño de body
- `console.error(error)` expone stack traces completos
- Sin configuración de producción/desarrollo
- CDNs del frontend sin Subresource Integrity (SRI)

### A06 - Vulnerable and Outdated Components (MEDIO)
- Dependencias sin auditoría de seguridad
- CDNs de terceros sin SRI hashes
- `node-signpdf` puede tener vulnerabilidades conocidas

### A07 - Identification and Authentication Failures (ALTO)
- Sin política de contraseñas (se aceptan passwords como "123")
- Sin protección contra brute force
- JWT sin `issuer` ni `audience`
- Token 2FA temporal no está limitado en scope
- `forgotPassword` confirma si un email existe → enumeración de usuarios
- Login responde diferente si usuario no existe vs contraseña incorrecta → user enumeration

### A08 - Software and Data Integrity Failures (MEDIO)
- CDNs sin SRI (Subresource Integrity)
- `updateSettings` permite modificar cualquier variable del `.env`
- Sin validación de integridad en uploads

### A09 - Security Logging and Monitoring Failures (ALTO)
- Solo `console.error` para errores
- Sin logging estructurado de eventos de seguridad
- Sin registro de intentos de login fallidos
- Sin alertas de actividad sospechosa
- Sin audit trail para acciones administrativas

### A10 - Server-Side Request Forgery (BAJO)
- `LDAP_URL` configurable desde panel admin sin validación

---

## Proposed Changes

### Fase 1: Infraestructura de Seguridad

#### [NEW] `gde_backend/middlewares/roleMiddleware.js`
Middleware de autorización por roles (`requireAdmin`, `requireRole`)

#### [NEW] `gde_backend/middlewares/rateLimiter.js`
Rate limiting con `express-rate-limit` para login, forgot-password, 2FA

#### [NEW] `gde_backend/middlewares/validationMiddleware.js`
Validación de entrada con `express-validator` para todos los endpoints

#### [NEW] `gde_backend/middlewares/securityHeaders.js`
Configuración de Helmet para headers de seguridad

#### [NEW] `gde_backend/utils/logger.js`
Logger estructurado con Winston para audit trail de seguridad

#### [NEW] `gde_backend/utils/sanitizer.js`
Funciones de sanitización HTML con `DOMPurify` (server-side con jsdom)

---

### Fase 2: Correcciones del Backend

#### [MODIFY] [server.js](file:///c:/Users/UNaB/Desktop/Sistema_Documental_JS/gde_backend/server.js)
- Agregar Helmet, CORS restrictivo, rate limiters globales
- Limitar `express.json({ limit: '1mb' })`
- Middleware global de error handling
- Deshabilitar `x-powered-by`

#### [MODIFY] [authMiddleware.js](file:///c:/Users/UNaB/Desktop/Sistema_Documental_JS/gde_backend/middlewares/authMiddleware.js)
- Validar `issuer` y `audience` en JWT
- Distinguir tokens temporales vs completos
- No exponer tipo de error específico

#### [MODIFY] [authController.js](file:///c:/Users/UNaB/Desktop/Sistema_Documental_JS/gde_backend/controllers/authController.js)
- Mensajes de error genéricos (anti user-enumeration)
- Validación de fortaleza de contraseñas
- Comparación timing-safe para reset codes
- Logging de eventos de autenticación
- JWT con `issuer` y `audience`

#### [MODIFY] [docController.js](file:///c:/Users/UNaB/Desktop/Sistema_Documental_JS/gde_backend/controllers/docController.js)
- Verificación de ownership en todas las operaciones
- Sanitización de `filename` contra path traversal
- Validación de tipos de archivo en uploads
- Sanitización de `content` HTML

#### [MODIFY] [userController.js](file:///c:/Users/UNaB/Desktop/Sistema_Documental_JS/gde_backend/controllers/userController.js)
- Agregar verificación de rol admin en create/update/delete
- Validación de email, name, password
- No permitir password `'123'` en bulk

#### [MODIFY] [areaController.js](file:///c:/Users/UNaB/Desktop/Sistema_Documental_JS/gde_backend/controllers/areaController.js)
- Agregar verificación de rol admin

#### [MODIFY] [systemController.js](file:///c:/Users/UNaB/Desktop/Sistema_Documental_JS/gde_backend/controllers/systemController.js)
- Whitelist de keys permitidas en `updateSettings`
- No exponer `EMAIL_PASS` en `getSettings`

#### [MODIFY] [notificationController.js](file:///c:/Users/UNaB/Desktop/Sistema_Documental_JS/gde_backend/controllers/notificationController.js)
- Sanitizar `action` y `message` antes de inyectar en HTML

#### [MODIFY] [emailService.js](file:///c:/Users/UNaB/Desktop/Sistema_Documental_JS/gde_backend/services/emailService.js)
- Habilitar `tls: { rejectUnauthorized: true }` en producción

#### [MODIFY] [cryptoService.js](file:///c:/Users/UNaB/Desktop/Sistema_Documental_JS/gde_backend/services/cryptoService.js)
- Eliminar clave de respaldo hardcodeada
- Usar AES-256-GCM en lugar de CBC (integridad + confidencialidad)

#### [MODIFY] [docRoutes.js](file:///c:/Users/UNaB/Desktop/Sistema_Documental_JS/gde_backend/routes/docRoutes.js)
- Habilitar fileFilter en multer (whitelist de tipos)
- Agregar rate limiting en ruta pública

#### [MODIFY] Todas las rutas admin
- Agregar `requireAdmin` middleware a rutas de users, areas, settings

#### [MODIFY] [.env](file:///c:/Users/UNaB/Desktop/Sistema_Documental_JS/gde_backend/.env)
- Regenerar secretos con entropía criptográfica adecuada

#### [NEW] `.env.example`
- Template sin secretos reales

#### [MODIFY] [.gitignore](file:///c:/Users/UNaB/Desktop/Sistema_Documental_JS/.gitignore)
- Agregar `.env`, `uploads/`, `*.enc`, logs

---

### Fase 3: Correcciones del Frontend

#### [MODIFY] [index.html](file:///c:/Users/UNaB/Desktop/Sistema_Documental_JS/gde_frontend/index.html)
- Agregar SRI hashes a todos los CDN scripts
- Agregar meta CSP como fallback
- Agregar `referrerPolicy`

#### [MODIFY] [app.js](file:///c:/Users/UNaB/Desktop/Sistema_Documental_JS/gde_frontend/app.js)
- Crear función `escapeHtml()` y aplicar a todo output dinámico
- URL base configurable en vez de hardcodeada
- Cookie `gde_session` con flags `Secure; SameSite=Strict`
- Reducir polling de notificaciones a 60 segundos

---

### Fase 4: Testing de Seguridad OWASP Top 10

#### [NEW] `gde_backend/tests/security/` (directorio completo)

Se crearán tests con **Jest + Supertest** organizados por categoría OWASP:

| Archivo | OWASP | Tests |
|---------|-------|-------|
| `a01-broken-access-control.test.js` | A01 | 8 tests |
| `a02-cryptographic-failures.test.js` | A02 | 7 tests |
| `a03-injection.test.js` | A03 | 7 tests |
| `a04-insecure-design.test.js` | A04 | 6 tests |
| `a05-security-misconfiguration.test.js` | A05 | 7 tests |
| `a06-vulnerable-components.test.js` | A06 | 5 tests |
| `a07-auth-failures.test.js` | A07 | 8 tests |
| `a08-integrity-failures.test.js` | A08 | 5 tests |
| `a09-logging-monitoring.test.js` | A09 | 6 tests |
| `a10-ssrf.test.js` | A10 | 5 tests |
| **TOTAL** | | **64 tests** |

#### Detalle de tests por categoría:

**A01 - Broken Access Control (8 tests)**
1. User no-admin no puede crear usuarios
2. User no-admin no puede eliminar usuarios
3. User no-admin no puede crear áreas
4. User no-admin no puede eliminar áreas
5. User no-admin no puede acceder a settings
6. User no-admin no puede modificar settings
7. User no puede eliminar documento de otro usuario
8. User no puede eliminar archivo adjunto de otro usuario

**A02 - Cryptographic Failures (7 tests)**
1. JWT_SECRET tiene mínimo 64 caracteres
2. Passwords se almacenan hasheados con bcrypt
3. Response de login no contiene password
4. Response de /me no contiene password ni 2FA secret
5. FILE_SECRET tiene longitud correcta
6. Tokens JWT expiran correctamente
7. Encryption key no es la de respaldo

**A03 - Injection (7 tests)**
1. SQL Injection en login (email con payload)
2. SQL Injection en búsqueda de documentos
3. XSS en subject de documento (se sanitiza)
4. XSS en content de documento (se sanitiza)
5. Path traversal en download de archivos
6. Path traversal en delete de archivos
7. Inyección de variables en updateSettings (whitelist)

**A04 - Insecure Design (6 tests)**
1. Rate limit en login tras 10 intentos
2. Rate limit en forgot-password
3. Rate limit en 2FA verify
4. Password debe cumplir política de complejidad
5. Reset code expira correctamente
6. Bulk create no acepta passwords débiles

**A05 - Security Misconfiguration (7 tests)**
1. CORS no permite origen wildcard
2. Headers de seguridad presentes (X-Frame-Options, etc.)
3. Body parser tiene límite de tamaño
4. Errors no exponen stack traces
5. X-Powered-By deshabilitado
6. Content-Type correcto en responses
7. Upload file filter rechaza tipos peligrosos

**A06 - Vulnerable Components (5 tests)**
1. npm audit no reporta vulnerabilidades críticas
2. No hay dependencias deprecated
3. Express es versión actual
4. bcrypt salt rounds >= 10
5. Dependencias de seguridad instaladas

**A07 - Auth Failures (8 tests)**
1. Login sin credenciales retorna 400
2. Login con email incorrecto retorna mensaje genérico
3. Login con password incorrecto retorna mismo mensaje genérico
4. Token expirado retorna 401
5. Token inválido retorna 401
6. Forgot-password con email inexistente retorna respuesta genérica
7. JWT contiene issuer y audience
8. Contraseña '123' es rechazada

**A08 - Integrity Failures (5 tests)**
1. Settings solo acepta keys de whitelist
2. Upload rechaza archivos sin extensión válida
3. Multer respeta límite de tamaño
4. El hash del PDF sellado es verificable
5. No se puede manipular el doc_type con valores arbitrarios

**A09 - Logging & Monitoring (6 tests)**
1. Login fallido genera log de seguridad
2. Login exitoso genera log
3. Cambio de password genera log
4. Intento de acceso admin sin permisos genera log
5. Acción de eliminación genera audit log
6. Logs no contienen datos sensibles (passwords)

**A10 - SSRF (5 tests)**
1. LDAP_URL no acepta URLs internas peligrosas
2. Settings no permite inyectar URLs maliciosas
3. EMAIL_HOST se valida contra whitelist de formato
4. Redirect no es posible vía parámetros de respuesta
5. Verificación pública no expone datos internos del servidor

---

### Fase 5: Dependencias Nuevas

```json
{
  "dependencies": {
    "helmet": "^8.x",
    "express-rate-limit": "^7.x",
    "express-validator": "^7.x",
    "winston": "^3.x",
    "dompurify": "^3.x",
    "jsdom": "^25.x",
    "crypto": "(built-in)"
  },
  "devDependencies": {
    "jest": "^30.x",
    "supertest": "^7.x"
  }
}
```

---

## Verificación

### Ejecución de Tests
```bash
cd gde_backend
npx jest tests/security/ --verbose --forceExit
```

### Ciclo de Corrección
1. Ejecutar todos los tests de seguridad
2. Analizar fallos
3. Corregir código según el fallo
4. Re-ejecutar hasta 100% pass rate

### Manual
- Verificar que `.env` no se sube al repositorio
- Verificar headers de respuesta HTTP con DevTools
- Verificar que errores no exponen stack traces

---

## Open Questions

> [!IMPORTANT]
> **Base de datos**: ¿Tienes acceso a una instancia MySQL corriendo para poder ejecutar los tests de integración? ¿O prefieres que use mocks/stubs para la capa de BD?

> [!IMPORTANT]  
> **Scope del frontend**: El `app.js` tiene ~3250 líneas con `innerHTML` masivo. La sanitización completa requiere reescribir cientos de interpolaciones. ¿Prefieres: (A) sanitizar solo los datos del servidor antes de renderizar, o (B) una refactorización más profunda del renderizado?

> [!WARNING]
> **Secretos existentes**: El `.env` actual contiene secretos reales en el repo. Al regenerarlos, las sesiones JWT activas se invalidarán y los archivos cifrados con la clave anterior **no se podrán descifrar**. ¿Hay datos en producción que necesitan migración?
