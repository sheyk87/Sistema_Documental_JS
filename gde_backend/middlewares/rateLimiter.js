// middlewares/rateLimiter.js
// Rate Limiting para prevenir ataques de fuerza bruta (OWASP A04, A07)
const rateLimit = require('express-rate-limit');

// Limiter para login: 10 intentos cada 15 minutos por IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,
    message: { message: 'Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip
});

// Limiter para forgot-password: 5 intentos cada 15 minutos
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: 'Demasiadas solicitudes de recuperación. Intente de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Limiter para 2FA verify: 5 intentos cada 5 minutos
const twoFactorLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 5,
    message: { message: 'Demasiados intentos de verificación 2FA. Intente de nuevo en 5 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Limiter global para API: 200 requests cada 15 minutos
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { message: 'Demasiadas solicitudes. Intente de nuevo más tarde.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Limiter para rutas públicas: 30 requests cada 15 minutos
const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { message: 'Demasiadas consultas públicas. Intente de nuevo más tarde.' },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = { loginLimiter, forgotPasswordLimiter, twoFactorLimiter, apiLimiter, publicLimiter };
