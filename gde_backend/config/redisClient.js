// config/redisClient.js
// Cliente Redis centralizado para cache, rate limiting y blacklist JWT
// OWASP A02: Autenticación con password, A05: Conexión segura sin exposición externa
const Redis = require('ioredis');

// Configuración con fallback seguro y reconexión automática
const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,           // Evita cuelgues infinitos por Redis caído
    retryStrategy: (times) => {
        if (times > 10) return null;   // Dejar de reintentar después de 10 fallos
        return Math.min(times * 200, 5000); // Backoff exponencial, máximo 5s
    },
    enableReadyCheck: true,
    lazyConnect: false,                // Conectar al importar para detectar fallos temprano
    db: parseInt(process.env.REDIS_DB) || 0,
});

redis.on('connect', () => console.log('✅ Redis conectado'));
redis.on('error', (err) => console.error('❌ Redis error:', err.message));
redis.on('close', () => console.log('⚠️  Redis conexión cerrada'));

module.exports = redis;
