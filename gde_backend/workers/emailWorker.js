// workers/emailWorker.js
// Worker de BullMQ para procesar emails en background
// Fase 4: Libera el thread principal de bloqueos SMTP
// Fase 5: Corre como contenedor Docker independiente
require('dotenv').config();
process.env.TZ = 'America/Argentina/Buenos_Aires';
const { Worker } = require('bullmq');
const nodemailer = require('nodemailer');
const { connection } = require('../config/queues');

let transporter = null;
let currentSmtpConfigString = ''; // Guardamos un string resumen de la configuración activa para detectar cambios

function getTransporter() {
    // Fase 5: Forzar recarga de .env antes de evaluar la configuración
    try {
        const path = require('path');
        const envPath = path.join(__dirname, '../.env');
        if (require('fs').existsSync(envPath)) {
            require('dotenv').config({ path: envPath, override: true });
        }
    } catch (err) {
        console.error('Error al recargar dynamic .env en emailWorker:', err.message);
    }

    const isEnabled = process.env.EMAIL_ENABLED === 'true';
    if (!isEnabled) {
        if (transporter) {
            console.log('⏸️ Desactivando transporter SMTP en worker (cambio de configuración).');
            transporter.close();
            transporter = null;
            currentSmtpConfigString = '';
        }
        return null;
    }

    // Generar firma de configuración para detectar cambios en caliente
    const configString = `${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}:${process.env.EMAIL_SECURE}:${process.env.EMAIL_USER}:${process.env.EMAIL_PASS}:${process.env.EMAIL_FROM}`;

    if (transporter && configString === currentSmtpConfigString) {
        return transporter;
    }

    // Si había un transporter anterior pero la config cambió, cerrarlo
    if (transporter) {
        console.log('🔄 Reconfigurando transporter SMTP en worker (cambio de configuración detectado).');
        transporter.close();
        transporter = null;
    }

    const port = parseInt(process.env.EMAIL_PORT) || 587;
    const isSecure = process.env.EMAIL_SECURE === 'true';

    transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: port,
        secure: isSecure,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        tls: { rejectUnauthorized: false },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
    });

    currentSmtpConfigString = configString;
    console.log('✅ Nuevo transporter SMTP inicializado en worker con la configuración del .env.');
    return transporter;
}

const emailWorker = new Worker('gde-email', async (job) => {
    const { to, subject, text, html } = job.data;

    const smtp = getTransporter();
    if (!smtp) {
        // SMTP desactivado: completar job sin enviar
        return { skipped: true, reason: 'SMTP disabled' };
    }

    await smtp.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject,
        text,
        html
    });

    return { sent: true, to, subject };
}, {
    connection,
    concurrency: 5,  // Procesar hasta 5 emails simultáneamente
    limiter: {
        max: 30,     // Máximo 30 emails por intervalo
        duration: 60000, // por minuto (evitar saturar el SMTP)
    },
});

emailWorker.on('completed', (job, result) => {
    if (!result?.skipped) {
        console.log(`📧 Email enviado [Job ${job.id}]: ${result.to} — ${result.subject}`);
    }
});

emailWorker.on('failed', (job, err) => {
    console.error(`❌ Email fallido [Job ${job?.id}]: ${err.message}`);
});

console.log('📧 Email Worker iniciado');

module.exports = emailWorker;
