const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const ldapService = require('../services/ldapService');
const crypto = require('crypto');
const emailService = require('../services/emailService');
const qrcode = require('qrcode');

// ============================================================================
// MOTOR TOTP NATIVO (Cero dependencias) - Compatible con Google Authenticator
// ============================================================================
function generateBase32Secret(length = 20) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes = crypto.randomBytes(length);
    let secret = '';
    for (let i = 0; i < length; i++) {
        secret += alphabet[bytes[i] % 32];
    }
    return secret;
}

function base32ToBuffer(base32) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleanStr = base32.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
    let bits = 0;
    let value = 0;
    const output = [];
    for (let i = 0; i < cleanStr.length; i++) {
        const val = alphabet.indexOf(cleanStr[i]);
        if (val === -1) throw new Error("Invalid base32 character");
        value = (value << 5) | val;
        bits += 5;
        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(output);
}

function generateTOTP(secret, windowOffset = 0) {
    const key = base32ToBuffer(secret);
    const time = Math.floor(Date.now() / 1000 / 30) + windowOffset;
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeUInt32BE(Math.floor(time / 0x100000000), 0);
    timeBuffer.writeUInt32BE(time & 0xffffffff, 4);
    
    const hmac = crypto.createHmac('sha1', key).update(timeBuffer).digest();
    const offset = hmac[19] & 0xf;
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
    return code.toString().padStart(6, '0');
}

function verifyTOTP(token, secret) {
    // Comprueba el ciclo de tiempo actual (0), el anterior (-1) y el siguiente (1)
    // Esto da un margen de error de +- 30 segundos (sincronizacion de reloj)
    for (let i = -1; i <= 1; i++) {
        if (generateTOTP(secret, i) === token) return true;
    }
    return false;
}
// ============================================================================

function maskEmail(email) {
    const [local, domainExt] = email.split('@');
    if (!domainExt) return email;
    const domainParts = domainExt.split('.');
    const domain = domainParts[0];
    const tld = domainParts.slice(1).join('.');
    let maskedLocal = local;
    if (local.length > 2) maskedLocal = local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];
    else if (local.length === 2) maskedLocal = local[0] + '*';
    let maskedDomain = domain;
    if (domain.length > 1) maskedDomain = domain[0] + '*'.repeat(domain.length - 1);
    return `${maskedLocal}@${maskedDomain}.${tld}`;
}

exports.login = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Faltan credenciales' });

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
        
        let user = rows[0];
        let isAuthenticated = false;

        if (process.env.LDAP_ENABLED === 'true') {
            try {
                await ldapService.authenticateLDAP(email, password);
                isAuthenticated = true;
            } catch (ldapError) {}
        }

        if (!isAuthenticated) {
            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) return res.status(401).json({ message: 'Credenciales invalidas' });
        }

        // LOGICA 2FA
        const global2FA = process.env.TWO_FACTOR_GLOBAL_ENABLED === 'true';
        const mandatory2FA = process.env.TWO_FACTOR_MANDATORY === 'true';
        const user2FAEnabled = user.two_factor_enabled === 1;

        let requires2FA = false;
        if (global2FA && (mandatory2FA || user2FAEnabled)) {
            requires2FA = true;
        }

        if (requires2FA) {
            // Verificamos que tenga un secreto válido
            const isConfigured = user.two_factor_secret && user.two_factor_secret.length >= 16;
            const tempToken = jwt.sign({ id: user.id, isTemp: true }, process.env.JWT_SECRET, { expiresIn: '15m' });
            return res.json({ requires2FA: true, isConfigured, tempToken, message: 'Validacion 2FA requerida' });
        }

        // Flujo sin 2FA
        user.areas = typeof user.areas === 'string' ? JSON.parse(user.areas) : (user.areas || [user.area_id]);
        user.areaId = user.area_id; 
        delete user.password;
        delete user.two_factor_secret;

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '10h' });
        res.json({ token, user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
};

exports.setup2FA = async (req, res) => {
    try {
        const userId = req.user.id; 
        const [rows] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });

        const secret = generateBase32Secret(20);
        const emailEncoded = encodeURIComponent(rows[0].email);
        const otpauth = `otpauth://totp/SistemaGDE:${emailEncoded}?secret=${secret}&issuer=SistemaGDE`;
        
        const qrCodeUrl = await qrcode.toDataURL(otpauth);

        // NUEVO: Generamos 6 códigos de recuperación alfanuméricos de 8 caracteres
        const recoveryCodes = Array.from({ length: 6 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());

        // Guardamos tanto el secreto como los códigos en la BD
        await pool.query('UPDATE users SET two_factor_secret = ?, two_factor_recovery_codes = ? WHERE id = ?', [secret, JSON.stringify(recoveryCodes), userId]);

        res.json({ qrCodeUrl, secret, recoveryCodes });
    } catch (error) {
        console.error("Error en setup2FA:", error);
        res.status(500).json({ message: 'Error al generar configuracion 2FA' });
    }
};

exports.verify2FA = async (req, res) => {
    const { code } = req.body;
    const userId = req.user.id;

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });

        const user = rows[0];
        const secret = user.two_factor_secret;

        if (!secret || secret.length < 16) {
            return res.status(400).json({ message: 'Servicio 2FA no configurado o corrupto. Contacte al Administrador.' });
        }

        const tokenStr = String(code).trim().toUpperCase(); // Forzamos mayúsculas por si ingresan un código de recuperación
        let isValid = false;

        // NUEVO: Extraemos los códigos de recuperación de la BD
        let recoveryCodes = [];
        try {
            recoveryCodes = typeof user.two_factor_recovery_codes === 'string' ? JSON.parse(user.two_factor_recovery_codes) : (user.two_factor_recovery_codes || []);
        } catch(e) {}

        // Verificamos si el usuario ingresó un código de recuperación válido (8 caracteres)
        if (tokenStr.length === 8 && recoveryCodes.includes(tokenStr)) {
            isValid = true;
            // Como es de un solo uso, lo eliminamos del array y actualizamos la base de datos
            recoveryCodes = recoveryCodes.filter(c => c !== tokenStr);
            await pool.query('UPDATE users SET two_factor_recovery_codes = ? WHERE id = ?', [JSON.stringify(recoveryCodes), userId]);
            console.log(`[2FA] Usuario ${user.email} ingreso usando codigo de recuperacion.`);
        } else {
            // Si no es un código de recuperación, intentamos la Validación Nativa TOTP normal (6 dígitos)
            isValid = verifyTOTP(tokenStr, secret);
        }

        if (!isValid) {
            return res.status(401).json({ message: 'Codigo 2FA o codigo de recuperacion incorrecto.' });
        }

        // ÉXITO
        user.areas = typeof user.areas === 'string' ? JSON.parse(user.areas) : (user.areas || [user.area_id]);
        user.areaId = user.area_id; 
        delete user.password;
        delete user.two_factor_secret;
        delete user.two_factor_recovery_codes;

        const tokenJWT = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '10h' });
        res.json({ token: tokenJWT, user });

    } catch (error) {
        console.error("Error en verify2FA:", error);
        res.status(500).json({ message: 'Error interno al verificar 2FA.' });
    }
};

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Ingrese su usuario / correo electronico' });
    try {
        const [rows] = await pool.query('SELECT id, name, email FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
        const user = rows[0];
        const code = crypto.randomBytes(4).toString('hex').toUpperCase(); 
        const expires = new Date(Date.now() + 15 * 60 * 1000); 
        await pool.query('UPDATE users SET reset_code = ?, reset_expires = ? WHERE id = ?', [code, expires, user.id]);
        if (process.env.EMAIL_ENABLED === 'true') {
            const mailSubject = 'GDE - Codigo de recuperacion de contrasena';
            const mailHtml = `<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px;"><h2 style="color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">Recuperacion de Contrasena</h2><p style="color: #334155;">Hola <strong>${user.name}</strong>,</p><p style="color: #334155;">Has solicitado restablecer tu contrasena. Tu codigo de validacion de 8 caracteres es:</p><div style="background: #f8fafc; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;"><h1 style="margin: 0; letter-spacing: 8px; color: #2563eb; font-family: monospace;">${code}</h1></div><p style="color: #334155;">Este codigo es valido por <strong>15 minutos</strong>.</p><p style="color: #dc2626; font-size: 13px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;"><strong>Aviso de Seguridad:</strong> Si no es una solicitud real, por favor desestime este correo y contemple cambiar su contrasena actual desde el panel de configuracion de su cuenta para mantener su seguridad.</p></div>`;
            emailService.sendMail(user.email, mailSubject, `Tu codigo es: ${code}`, mailHtml);
        }
        res.json({ message: 'Codigo generado y enviado', maskedEmail: maskEmail(user.email) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno' });
    }
};

exports.validateResetCode = async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: 'Faltan datos' });
    try {
        const [rows] = await pool.query('SELECT id, reset_code, reset_expires FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
        const user = rows[0];
        if (!user.reset_code || user.reset_code !== code.toUpperCase()) return res.status(400).json({ message: 'Codigo invalido' });
        if (new Date() > new Date(user.reset_expires)) return res.status(400).json({ message: 'El codigo ha expirado' });
        res.json({ message: 'Codigo valido' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno' });
    }
};

exports.resetPassword = async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.status(400).json({ message: 'Faltan datos' });
    try {
        const [rows] = await pool.query('SELECT id, reset_code, reset_expires FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
        const user = rows[0];
        if (!user.reset_code || user.reset_code !== code.toUpperCase()) return res.status(400).json({ message: 'Codigo invalido' });
        if (new Date() > new Date(user.reset_expires)) return res.status(400).json({ message: 'El codigo ha expirado' });
        const hash = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password = ?, reset_code = NULL, reset_expires = NULL WHERE id = ?', [hash, user.id]);
        res.json({ message: 'Contrasena actualizada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno' });
    }
};