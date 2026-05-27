// services/emailService.js
// Fase 4: Los emails se encolan en BullMQ en vez de enviarse directamente.
// El emailWorker.js se encarga de procesarlos en background.
const nodemailer = require('nodemailer');

let transporter;

exports.initTransporter = () => {
    // Fase 5: Forzar recarga dinámica del archivo .env desde el disco
    try {
        const path = require('path');
        const envPath = path.join(__dirname, '../.env');
        if (require('fs').existsSync(envPath)) {
            require('dotenv').config({ path: envPath, override: true });
        }
    } catch (err) {
        console.error('Error al recargar dynamic .env en initTransporter:', err.message);
    }

    const isEnabled = process.env.EMAIL_ENABLED === 'true';

    if (isEnabled) {
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
            tls: { rejectUnauthorized: false }
        });

        transporter.verify().then(() => {
            console.log('✅ Servicio SMTP configurado y listo.');
        }).catch(err => console.error('⚠️ Error al configurar SMTP:', err.message));
    } else {
        transporter = null; // Destruimos el transporter si se desactiva
        console.log('⏸️ Servicio SMTP desactivado.');
    }
};

// Inicializamos al arrancar el servidor (para verificación SMTP)
exports.initTransporter();

// Fase 4: sendMail ahora ENCOLA el email en BullMQ en vez de enviarlo directamente.
// Todas las 8 llamadas existentes en el sistema se benefician automáticamente
// sin cambiar ningún controller. La interfaz es idéntica: fire-and-forget.
exports.sendMail = async (to, subject, text, html) => {
    // Fase 5: Forzar recarga dinámica del .env antes de evaluar si está habilitado
    try {
        const path = require('path');
        const envPath = path.join(__dirname, '../.env');
        if (require('fs').existsSync(envPath)) {
            require('dotenv').config({ path: envPath, override: true });
        }
    } catch (err) {
        console.error('Error al recargar dynamic .env en sendMail:', err.message);
    }

    const isEnabled = process.env.EMAIL_ENABLED === 'true';
    if (!isEnabled) return;

    try {
        const { emailQueue } = require('../config/queues');
        await emailQueue.add('send', { to, subject, text, html });
    } catch (err) {
        // Fallback: Si BullMQ/Redis falla, intentar envío directo
        console.error('⚠️ Cola de email no disponible, intentando envío directo:', err.message);
        if (transporter) {
            try {
                await transporter.sendMail({
                    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
                    to, subject, text, html
                });
            } catch (sendErr) {
                console.error("❌ Error al enviar correo a", to, ":", sendErr.message);
            }
        }
    }
};