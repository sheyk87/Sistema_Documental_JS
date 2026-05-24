// middlewares/rateLimiter.js
// Rate Limiting para prevenir ataques de fuerza bruta (OWASP A04, A07)
// Fase 3: Redis store para compartir contadores entre instancias (clustering + Docker Swarm)
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('../config/redisClient');

// ==========================================
// Helper: Crea un RedisStore con prefijo único por limiter
// express-rate-limit v7 NO permite reusar la misma instancia de store
// ==========================================
function createRedisStore(prefix) {
    try {
        return new RedisStore({
            sendCommand: (...args) => redis.call(...args),
            prefix: `gde:rl:${prefix}:`,
        });
    } catch (err) {
        console.error(`⚠️  Redis store '${prefix}' no disponible, usando memoria local:`, err.message);
        return undefined; // express-rate-limit usará MemoryStore por defecto
    }
}

// Limiter para login: 10 intentos cada 15 minutos por IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,
    message: { message: 'Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    store: createRedisStore('login')
});

// Limiter para forgot-password: 5 intentos cada 15 minutos
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: 'Demasiadas solicitudes de recuperación. Intente de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    store: createRedisStore('forgot')
});

// Limiter para 2FA verify: 5 intentos cada 5 minutos
const twoFactorLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 5,
    message: { message: 'Demasiados intentos de verificación 2FA. Intente de nuevo en 5 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    store: createRedisStore('2fa')
});

// Limiter global para API: 200 requests cada 15 minutos
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { message: 'Demasiadas solicitudes. Intente de nuevo más tarde.' },
    standardHeaders: true,
    legacyHeaders: false,
    store: createRedisStore('api')
});

// Limiter para rutas públicas: 30 requests cada 15 minutos
const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { message: 'Demasiadas consultas públicas. Intente de nuevo más tarde.' },
    standardHeaders: true,
    legacyHeaders: false,
    store: createRedisStore('public')
});

module.exports = { loginLimiter, forgotPasswordLimiter, twoFactorLimiter, apiLimiter, publicLimiter };
