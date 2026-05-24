// server.js
require('dotenv').config();
// Forzar la Zona Horaria para el motor de Node y la criptografía
process.env.TZ = 'America/Argentina/Buenos_Aires';

const cluster = require('cluster');
const os = require('os');

// ==========================================
// CLUSTERING: Usa todos los CPU cores disponibles
// El proceso Master crea Workers (1 por core)
// Si un Worker muere, el Master lo respawnea
// ==========================================
const numCPUs = parseInt(process.env.CLUSTER_WORKERS) || os.cpus().length;

if (cluster.isPrimary && process.env.NODE_ENV === 'production') {
    console.log(`🚀 Master ${process.pid} iniciando ${numCPUs} workers...`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.error(`⚠️  Worker ${worker.process.pid} terminó (code: ${code}, signal: ${signal}). Respawneando...`);
        cluster.fork();
    });

    // Graceful shutdown: cuando el Master recibe SIGTERM, cierra todos los Workers
    process.on('SIGTERM', () => {
        console.log('🛑 Master recibió SIGTERM. Cerrando workers...');
        for (const id in cluster.workers) {
            cluster.workers[id].kill('SIGTERM');
        }
        process.exit(0);
    });

} else {
    // ==========================================
    // WORKER: Cada proceso corre una instancia de Express
    // ==========================================
    const express = require('express');
    const cors = require('cors');
    const path = require('path');
    const fs = require('fs');
    const helmet = require('helmet');
    const { apiLimiter } = require('./middlewares/rateLimiter');
    const { logSecurityError } = require('./utils/logger');

    const app = express();

    // === SEGURIDAD: Headers HTTP con Helmet (OWASP A05) ===
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "blob:"],
                connectSrc: ["'self'", "http://localhost:3000"],
                fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
                frameSrc: ["'none'"],
                objectSrc: ["'none'"]
            }
        },
        crossOriginEmbedderPolicy: false, // Necesario para CDNs
        crossOriginResourcePolicy: { policy: "cross-origin" }
    }));

    // === SEGURIDAD: Deshabilitar x-powered-by (OWASP A05) ===
    app.disable('x-powered-by');

    // === SEGURIDAD: CORS restrictivo (OWASP A05) ===
    const allowedOrigins = process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
        : ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000', 'http://127.0.0.1:3000'];

    app.use(cors({
        origin: function (origin, callback) {
            // Permitir todo en desarrollo para facilitar testing en red local (celulares)
            if (process.env.NODE_ENV !== 'production') return callback(null, true);

            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('No permitido por CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // === SEGURIDAD: Limitar tamaño del body (OWASP A05) ===
    app.use(express.json({ limit: '1mb' }));

    // === SEGURIDAD: Rate Limiting global (OWASP A04) ===
    app.use('/api/', apiLimiter);

    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir);
    }

    // Crear directorio de logs si no existe
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir);
    }

    // === HEALTH CHECK para Load Balancers y Docker Swarm ===
    app.get('/api/health', (req, res) => {
        res.json({ 
            status: 'ok', 
            pid: process.pid, 
            uptime: Math.round(process.uptime()),
            memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
        });
    });

    // Importamos las rutas
    const authRoutes = require('./routes/authRoutes');
    app.use('/api/auth', authRoutes);

    const systemRoutes = require('./routes/systemRoutes');
    app.use('/api/system', systemRoutes);

    const docRoutes = require('./routes/docRoutes');
    app.use('/api/docs', docRoutes);

    const expRoutes = require('./routes/expRoutes');
    app.use('/api/exps', expRoutes);

    const userRoutes = require('./routes/userRoutes');
    const areaRoutes = require('./routes/areaRoutes');

    app.use('/api/users', userRoutes);
    app.use('/api/areas', areaRoutes);

    const notificationRoutes = require('./routes/notificationRoutes');
    app.use('/api/notifications', notificationRoutes);

    // Fase 4: Rutas para consultar estado de jobs (firma async)
    const jobRoutes = require('./routes/jobRoutes');
    app.use('/api/jobs', jobRoutes);

    // === SEGURIDAD: Manejador global de errores (OWASP A05, A09) ===
    // No expone stack traces ni detalles internos al cliente
    app.use((err, req, res, next) => {
        logSecurityError(err, { path: req.path, method: req.method, ip: req.ip });

        // En producción, nunca exponer detalles del error
        const statusCode = err.status || 500;
        res.status(statusCode).json({
            message: process.env.NODE_ENV === 'production'
                ? 'Error interno del servidor.'
                : err.message || 'Error interno del servidor.'
        });
    });

    // Graceful shutdown del Worker
    process.on('SIGTERM', () => {
        console.log(`Worker ${process.pid} cerrando gracefully...`);
        server.close(() => {
            console.log(`Worker ${process.pid} cerrado.`);
            process.exit(0);
        });
        // Forzar cierre después de 10 segundos
        setTimeout(() => process.exit(1), 10000);
    });

    // Exportar app para testing
    const PORT = process.env.PORT || 3000;
    let server;
    if (process.env.NODE_ENV !== 'test') {
        server = app.listen(PORT, () => {
            const mode = cluster.isWorker ? `Worker ${process.pid}` : 'Single-process';
            console.log(`${mode} — Servidor corriendo en el puerto ${PORT}`);

            // Fase 4: Iniciar BullMQ workers
            // En producción con cluster: solo el primer worker los arranca
            // En desarrollo: se arrancan junto al servidor
            if (!cluster.isWorker || cluster.worker.id === 1) {
                try {
                    require('./workers/emailWorker');
                    require('./workers/signatureWorker');
                } catch (err) {
                    console.error('⚠️  Error iniciando workers BullMQ:', err.message);
                }
            }
        });
    }

    module.exports = app;
}