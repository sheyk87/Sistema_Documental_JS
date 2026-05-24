// config/queues.js
// Definición centralizada de colas BullMQ para trabajos en background
// Fase 4: Emails y firmas se procesan fuera del thread principal
const { Queue } = require('bullmq');

// Construimos la conexión desde las mismas variables que redisClient.js
const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // BullMQ requiere null para workers
};

// Cola de emails: notificaciones, 2FA, password reset, alertas
const emailQueue = new Queue('gde-email', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }, // 5s, 10s, 20s
        removeOnComplete: { count: 100 },  // Mantener últimos 100 completados
        removeOnFail: { count: 200 },      // Mantener últimos 200 fallidos para diagnóstico
    },
});

// Cola de firmas: firma criptográfica de PDFs (CPU-intensive)
const signatureQueue = new Queue('gde-signature', {
    connection,
    defaultJobOptions: {
        attempts: 1,                       // NO reintentar firmas (evitar duplicación)
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },      // Más retención de errores para análisis
    },
});

module.exports = { emailQueue, signatureQueue, connection };
