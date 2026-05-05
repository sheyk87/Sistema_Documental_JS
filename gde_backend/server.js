// server.js
require('dotenv').config();
// Forzar la Zona Horaria para el motor de Node y la criptografía
process.env.TZ = 'America/Argentina/Buenos_Aires';
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

// Exportar app para testing
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en el puerto ${PORT}`);
    });
}

module.exports = app;