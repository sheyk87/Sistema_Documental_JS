const nodemailer = require('nodemailer');

const isEnabled = process.env.EMAIL_ENABLED === 'true';

let transporter;

if (isEnabled) {
    const port = parseInt(process.env.EMAIL_PORT) || 587;
    const isSecure = process.env.EMAIL_SECURE === 'true'; 

    transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: port,
        secure: isSecure, // false para 587 (STARTTLS) y 25. true para 465.
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        tls: {
            // Evita errores con certificados auto-firmados en servidores locales puerto 25
            rejectUnauthorized: false 
        }
    });

    // Verificamos la conexión al iniciar el servidor
    transporter.verify().then(() => {
        console.log('✅ Servicio SMTP configurado y listo para enviar correos.');
    }).catch(console.error);
}

exports.sendMail = async (to, subject, text, html) => {
    if (!isEnabled || !transporter) return; // Si está apagado en el .env, se aborta silenciosamente
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to,
            subject,
            text,
            html
        });
    } catch (error) {
        console.error("❌ Error al enviar correo a", to, ":", error.message);
    }
};