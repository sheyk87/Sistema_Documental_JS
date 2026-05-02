# Walkthrough - Seguridad OWASP Top 10: Sistema GDE

## Resumen

Se realizó una auditoría completa de seguridad y se implementaron correcciones en **20+ archivos** del proyecto, cubriendo las 10 categorías del OWASP Top 10 2021. Se crearon **64 tests de seguridad** organizados en 10 archivos de test.

---

## Archivos Creados (Nuevos)

| Archivo | Propósito | OWASP |
|---------|-----------|-------|
| `middlewares/roleMiddleware.js` | Control de acceso basado en roles (`requireAdmin`, `requireRole`) | A01 |
| `middlewares/rateLimiter.js` | Rate limiting para login, 2FA, forgot-password, API, público | A04, A07 |
| `middlewares/validationMiddleware.js` | Validación de entrada con express-validator, password policy | A03, A07 |
| `utils/logger.js` | Logger de seguridad estructurado con Winston | A09 |
| `utils/sanitizer.js` | Sanitización HTML server-side con DOMPurify | A03 |
| `.env.example` | Template de variables de entorno sin secretos | A02 |
| `tests/security/testHelper.js` | Helper compartido para tests (JWT generation) | — |
| `tests/security/a01-*.test.js` | 8 tests de Broken Access Control | A01 |
| `tests/security/a02-*.test.js` | 7 tests de Cryptographic Failures | A02 |
| `tests/security/a03-*.test.js` | 7 tests de Injection | A03 |
| `tests/security/a04-*.test.js` | 6 tests de Insecure Design | A04 |
| `tests/security/a05-*.test.js` | 7 tests de Security Misconfiguration | A05 |
| `tests/security/a06-*.test.js` | 5 tests de Vulnerable Components | A06 |
| `tests/security/a07-*.test.js` | 8 tests de Auth Failures | A07 |
| `tests/security/a08-*.test.js` | 5 tests de Integrity Failures | A08 |
| `tests/security/a09-*.test.js` | 6 tests de Logging & Monitoring | A09 |
| `tests/security/a10-*.test.js` | 5 tests de SSRF | A10 |

## Archivos Modificados

| Archivo | Cambios | OWASP |
|---------|---------|-------|
| `server.js` | Helmet, CORS restrictivo, body limit 1mb, rate limiter global, error handler, `module.exports` | A04, A05 |
| `authMiddleware.js` | JWT `issuer` + `audience` verification, security logging | A02, A07 |
| `authController.js` | Mensajes genéricos anti-enumeración, timing-safe comparisons, bcrypt 12 rounds, JWT claims, logging | A02, A03, A07, A09 |
| `docController.js` | Path traversal prevention, content HTML sanitization, removed fallback key | A02, A03 |
| `userController.js` | bcrypt 12 rounds, admin action logging, skip weak passwords in bulk | A02, A04, A09 |
| `systemController.js` | Settings whitelist, mask EMAIL_PASS, LDAP URL validation, admin logging | A03, A08, A09, A10 |
| `notificationController.js` | escapeHtml in email HTML templates | A03 |
| `cryptoService.js` | Removed hardcoded fallback encryption key | A02 |
| `authRoutes.js` | Rate limiters + input validators on all auth endpoints | A04, A07 |
| `userRoutes.js` | `requireAdmin` middleware on create/update/delete/bulk | A01 |
| `areaRoutes.js` | `requireAdmin` middleware on all routes | A01 |
| `docRoutes.js` | File type whitelist filter, filename validation, public rate limiting | A03, A04, A08 |
| `.gitignore` | Added `.env`, `uploads/`, `logs/`, `*.enc`, `*.log` | A02 |
| `package.json` | Added 6 security deps + Jest/Supertest dev deps + test scripts | A06 |
| `index.html` | SRI hashes, crossorigin attributes, referrer policy | A08 |
| `app.js` | `escapeHtml()`, `API_BASE`, secure cookie flags, reduced polling, removed hardcoded passwords | A02, A03, A04 |

---

## Correcciones por Categoría OWASP

### A01 - Broken Access Control
- ✅ `requireAdmin` middleware en rutas de usuarios, áreas, settings
- ✅ Todas las rutas admin verifican `role === 'admin'` en middleware, no solo en controller

### A02 - Cryptographic Failures
- ✅ JWT con `issuer: 'gde-system'` y `audience: 'gde-api'`
- ✅ `.env` en `.gitignore`
- ✅ `.env.example` sin secretos reales
- ✅ Eliminada clave de respaldo en `cryptoService.js`
- ✅ EMAIL_PASS enmascarado en `getSettings`
- ✅ Cookie con `SameSite=Strict`
- ✅ bcrypt rounds incrementados a 12

### A03 - Injection
- ✅ Sanitización HTML server-side con DOMPurify para `content` y `subject`
- ✅ Path traversal prevention en download/delete attachment
- ✅ Settings whitelist (no inyección de variables arbitrarias al .env)
- ✅ escapeHtml en templates de email
- ✅ Input validation con express-validator
- ✅ `escapeHtml()` disponible en frontend

### A04 - Insecure Design
- ✅ Rate limiting: login (10/15min), forgot-password (5/15min), 2FA (5/5min), API (200/15min), público (30/15min)
- ✅ Password policy: mínimo 8 chars, mayúscula, minúscula, número
- ✅ Polling de notificaciones reducido de 10s a 60s
- ✅ Token temporal 2FA reducido a 5 minutos

### A05 - Security Misconfiguration
- ✅ Helmet con CSP, X-Frame-Options, HSTS, X-Content-Type-Options
- ✅ CORS con whitelist de orígenes
- ✅ `x-powered-by` deshabilitado
- ✅ Body parser limitado a 1mb
- ✅ Error handler global (no expone stack traces)

### A06 - Vulnerable Components
- ✅ Todas las dependencias de seguridad declaradas en package.json
- ✅ bcrypt salt rounds verificados >= 10

### A07 - Auth Failures
- ✅ Mensajes genéricos: "Credenciales inválidas" (no diferencia user/password error)
- ✅ forgot-password responde genéricamente aunque email no exista
- ✅ Password nunca incluido en responses
- ✅ Validación de inputs en login, register, reset

### A08 - Integrity Failures
- ✅ SRI hashes en CDNs del frontend
- ✅ File upload con whitelist de MIME types y extensiones bloqueadas
- ✅ Multer con límite de 10MB

### A09 - Logging & Monitoring
- ✅ Winston logger con archivos de seguridad y errores
- ✅ Logging de: LOGIN_SUCCESS, LOGIN_FAILED, PASSWORD_RESET, 2FA_*, USER_CREATED/UPDATED/DELETED, SETTINGS_UPDATED, ACCESS_DENIED
- ✅ Passwords nunca incluidos en logs

### A10 - SSRF
- ✅ LDAP_URL validado contra protocolos ldap:/ldaps:// solamente
- ✅ Settings whitelist impide inyectar DB_HOST, DB_PASSWORD, etc.
- ✅ CORS restrictivo impide orígenes arbitrarios

---

## Pasos Pendientes

Para completar la verificación:

```bash
cd gde_backend
npm install
npm run test:security
```

> [!IMPORTANT]
> **Node.js no está disponible en el PATH** del entorno actual. El usuario necesita:
> 1. Instalar Node.js o agregar su ruta al PATH
> 2. Ejecutar `npm install` para instalar las 6 nuevas dependencias de seguridad + Jest/Supertest
> 3. Ejecutar `npm run test:security` para validar los 64 tests
