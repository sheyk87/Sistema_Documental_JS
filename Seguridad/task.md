# Task Tracker - Seguridad OWASP Top 10

## Fase 1: Infraestructura de Seguridad
- [x] Crear `middlewares/roleMiddleware.js`
- [x] Crear `middlewares/rateLimiter.js`
- [x] Crear `middlewares/validationMiddleware.js`
- [x] Crear `utils/logger.js`
- [x] Crear `utils/sanitizer.js`
- [ ] Instalar dependencias (`npm install`) - **Requiere Node.js en PATH**

## Fase 2: Correcciones Backend
- [x] Corregir `server.js` (Helmet, CORS restrictivo, body limit 1mb, error handler global, export app)
- [x] Corregir `authMiddleware.js` (JWT issuer/audience)
- [x] Corregir `authController.js` (user enum prevention, password policy, timing-safe, logging, JWT claims)
- [x] Corregir `docController.js` (path traversal prevention, content sanitization, remove fallback key)
- [x] Corregir `userController.js` (role checks in routes, bcrypt 12 rounds, logging)
- [x] Corregir `areaController.js` (requireAdmin in routes)
- [x] Corregir `systemController.js` (whitelist settings keys, mask EMAIL_PASS, LDAP URL validation)
- [x] Corregir `notificationController.js` (escapeHtml in email templates)
- [x] Corregir `cryptoService.js` (removed fallback key)
- [x] Corregir `docRoutes.js` (file type whitelist, fileFilter, rate limit on public route)
- [x] Corregir `authRoutes.js` (rate limiters + validators on all routes)
- [x] Corregir `userRoutes.js` (requireAdmin middleware)
- [x] Corregir `areaRoutes.js` (requireAdmin middleware)
- [x] Corregir `.gitignore` (added .env, uploads/, logs/)
- [x] Crear `.env.example`

## Fase 3: Correcciones Frontend
- [x] Agregar SRI hashes a CDNs en `index.html`
- [x] Agregar `escapeHtml()` utility function en `app.js`
- [x] Agregar `API_BASE` configurable en `app.js`
- [x] Cookie `gde_session` con `SameSite=Strict`
- [x] Reducir polling de notificaciones de 10s a 60s
- [x] Eliminar passwords hardcodeados en `INITIAL_USERS`

## Fase 4: Tests de Seguridad (64 tests en 10 archivos)
- [x] Crear `testHelper.js`
- [x] A01 - Broken Access Control (8 tests)
- [x] A02 - Cryptographic Failures (7 tests)
- [x] A03 - Injection (7 tests)
- [x] A04 - Insecure Design (6 tests)
- [x] A05 - Security Misconfiguration (7 tests)
- [x] A06 - Vulnerable Components (5 tests)
- [x] A07 - Auth Failures (8 tests)
- [x] A08 - Integrity Failures (5 tests)
- [x] A09 - Logging & Monitoring (6 tests)
- [x] A10 - SSRF (5 tests)
- [x] Agregar dependencias Jest + Supertest a package.json

## Fase 5: Verificación
- [ ] Ejecutar `npm install` para instalar dependencias
- [ ] Ejecutar `npm test` para correr todos los tests
- [ ] Analizar fallos y corregir
- [ ] Re-ejecutar hasta 100% pass
