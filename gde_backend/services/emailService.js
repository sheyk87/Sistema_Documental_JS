const nodemailer = require('nodemailer');

let transporter;

exports.initTransporter = () => {
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

// Inicializamos al arrancar el servidor
exports.initTransporter();

exports.sendMail = async (to, subject, text, html) => {
    const isEnabled = process.env.EMAIL_ENABLED === 'true';
    if (!isEnabled || !transporter) return; 
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to, subject, text, html
        });
    } catch (error) {
        console.error("❌ Error al enviar correo a", to, ":", error.message);
    }
};