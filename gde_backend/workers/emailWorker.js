// workers/emailWorker.js
// Worker de BullMQ para procesar emails en background
// Fase 4: Libera el thread principal de bloqueos SMTP
const { Worker } = require('bullmq');
const nodemailer = require('nodemailer');
const { connection } = require('../config/queues');

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    const isEnabled = process.env.EMAIL_ENABLED === 'true';
    if (!isEnabled) return null;

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
        // Pool de conexiones SMTP para eficiencia
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
    });

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
