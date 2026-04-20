// controllers/authController.js
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const ldapService = require('../services/ldapService');
const crypto = require('crypto');
const emailService = require('../services/emailService');

exports.login = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Faltan credenciales' });

    try {
        // 1. Verificamos que el usuario exista en nuestra BD (Necesitamos su Área y Rol)
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado en el sistema local' });
        
        let user = rows[0];
        let isAuthenticated = false;

        // 2. Intentamos Autenticación LDAP si está habilitado
        if (process.env.LDAP_ENABLED === 'true') {
            try {
                await ldapService.authenticateLDAP(email, password);
                isAuthenticated = true;
                console.log(`✅ [LDAP] Usuario autenticado por Directorio Activo: ${email}`);
            } catch (ldapError) {
                console.log(`⚠️ [LDAP] Falló autenticación para ${email}. Motivo: ${ldapError.message}`);
                // No retornamos error aún, hacemos Fallback a la BD local
            }
        }

        // 3. Fallback a BD Local (Si LDAP está apagado, falló, o es un usuario admin externo)
        if (!isAuthenticated) {
            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ message: 'Credenciales inválidas' });
            }
            isAuthenticated = true;
            console.log(`✅ [LOCAL] Usuario autenticado por BD Local: ${email}`);
        }

        // 4. Parseamos las áreas permitidas (Feature 5)
        user.areas = typeof user.areas === 'string' ? JSON.parse(user.areas) : (user.areas || [user.area_id]);
        user.areaId = user.area_id; 

        // 5. Generamos el Token JWT
        delete user.password;
        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '10h' });
        
        res.json({ token, user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en el servidor durante el login' });
    }
};

// Función auxiliar para enmascarar el correo según la regla solicitada
function maskEmail(email) {
    const [local, domainExt] = email.split('@');
    if (!domainExt) return email;
    
    const domainParts = domainExt.split('.');
    const domain = domainParts[0];
    const tld = domainParts.slice(1).join('.');

    let maskedLocal = local;
    if (local.length > 2) {
        maskedLocal = local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];
    } else if (local.length === 2) {
        maskedLocal = local[0] + '*';
    }

    let maskedDomain = domain;
    if (domain.length > 1) {
        maskedDomain = domain[0] + '*'.repeat(domain.length - 1);
    }

    return `${maskedLocal}@${maskedDomain}.${tld}`;
}

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Ingrese su usuario / correo electrónico' });

    try {
        const [rows] = await pool.query('SELECT id, name, email FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });

        const user = rows[0];
        // Genera código alfanumérico de 8 caracteres
        const code = crypto.randomBytes(4).toString('hex').toUpperCase(); 
        
        // Expiración en 15 minutos exactos
        const expires = new Date(Date.now() + 15 * 60 * 1000); 

        await pool.query('UPDATE users SET reset_code = ?, reset_expires = ? WHERE id = ?', [code, expires, user.id]);

        if (process.env.EMAIL_ENABLED === 'true') {
            const mailSubject = 'GDE - Código de recuperación de contraseña';
            const mailHtml = `
                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <h2 style="color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">Recuperación de Contraseña</h2>
                    <p style="color: #334155;">Hola <strong>${user.name}</strong>,</p>
                    <p style="color: #334155;">Has solicitado restablecer tu contraseña. Tu código de validación de 8 caracteres es:</p>
                    <div style="background: #f8fafc; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
                        <h1 style="margin: 0; letter-spacing: 8px; color: #2563eb; font-family: monospace;">${code}</h1>
                    </div>
                    <p style="color: #334155;">Este código es válido por <strong>15 minutos</strong>.</p>
                    <p style="color: #dc2626; font-size: 13px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                        <strong>Aviso de Seguridad:</strong> Si no es una solicitud real, por favor desestime este correo y contemple cambiar su contraseña actual desde el panel de configuración de su cuenta para mantener su seguridad.
                    </p>
                </div>
            `;
            emailService.sendMail(user.email, mailSubject, `Tu código es: ${code}`, mailHtml);
        }

        res.json({ message: 'Código generado y enviado', maskedEmail: maskEmail(user.email) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno al generar código de recuperación' });
    }
};

exports.validateResetCode = async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: 'Faltan datos' });

    try {
        const [rows] = await pool.query('SELECT id, reset_code, reset_expires FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });

        const user = rows[0];
        
        if (!user.reset_code || user.reset_code !== code.toUpperCase()) {
            return res.status(400).json({ message: 'Código inválido o incorrecto' });
        }
        if (new Date() > new Date(user.reset_expires)) {
            return res.status(400).json({ message: 'El código ha expirado (pasaron más de 15 minutos)' });
        }

        res.json({ message: 'Código válido' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno al validar el código' });
    }
};

exports.resetPassword = async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.status(400).json({ message: 'Faltan datos' });

    try {
        const [rows] = await pool.query('SELECT id, reset_code, reset_expires FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });

        const user = rows[0];

        // Doble validación por seguridad antes de impactar la base de datos
        if (!user.reset_code || user.reset_code !== code.toUpperCase()) return res.status(400).json({ message: 'Código inválido' });
        if (new Date() > new Date(user.reset_expires)) return res.status(400).json({ message: 'El código ha expirado' });

        const hash = await bcrypt.hash(newPassword, 10);
        // Actualizamos contraseña y limpiamos los códigos de recuperación
        await pool.query('UPDATE users SET password = ?, reset_code = NULL, reset_expires = NULL WHERE id = ?', [hash, user.id]);

        res.json({ message: 'Contraseña actualizada exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno al restablecer contraseña' });
    }
};