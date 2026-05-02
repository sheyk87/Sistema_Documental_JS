// controllers/systemController.js
const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const emailService = require('../services/emailService');
const { logAdminAction, logSecurityError } = require('../utils/logger');

// OWASP A03, A08: Whitelist de variables permitidas en updateSettings
const ALLOWED_SETTINGS_KEYS = [
    'EMAIL_ENABLED', 'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_SECURE',
    'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM',
    'LDAP_ENABLED', 'LDAP_URL', 'LDAP_DOMAIN',
    'TWO_FACTOR_GLOBAL_ENABLED', 'TWO_FACTOR_MANDATORY'
];

exports.getInitialData = async (req, res) => {
    try {
        const [areas] = await pool.query('SELECT id, name FROM areas');
        const [usersRows] = await pool.query('SELECT id, name, email, area_id AS areaId, role, areas, two_factor_enabled FROM users');
        
        const users = usersRows.map(u => ({
            ...u,
            twoFactorEnabled: u.two_factor_enabled === 1,
            areas: typeof u.areas === 'string' ? JSON.parse(u.areas) : (u.areas || [u.areaId])
        }));
        
        res.json({ areas, users });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener datos del sistema' });
    }
};

exports.getSettings = (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Acceso denegado' });
    
    // OWASP A02: No exponer la contraseña real del email
    res.json({
        EMAIL_ENABLED: process.env.EMAIL_ENABLED === 'true',
        EMAIL_HOST: process.env.EMAIL_HOST || '',
        EMAIL_PORT: process.env.EMAIL_PORT || '',
        EMAIL_SECURE: process.env.EMAIL_SECURE === 'true',
        EMAIL_USER: process.env.EMAIL_USER || '',
        EMAIL_PASS: process.env.EMAIL_PASS ? '••••••••' : '',
        EMAIL_FROM: process.env.EMAIL_FROM || '',
        LDAP_ENABLED: process.env.LDAP_ENABLED === 'true',
        LDAP_URL: process.env.LDAP_URL || '',
        LDAP_DOMAIN: process.env.LDAP_DOMAIN || '',
        TWO_FACTOR_GLOBAL_ENABLED: process.env.TWO_FACTOR_GLOBAL_ENABLED === 'true',
        TWO_FACTOR_MANDATORY: process.env.TWO_FACTOR_MANDATORY === 'true'
    });
};

exports.updateSettings = (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Acceso denegado' });
    
    const updates = req.body;
    const envPath = path.join(__dirname, '../.env');

    try {
        let envContent = fs.readFileSync(envPath, 'utf8');
        
        // Helper para reemplazar o añadir variables en el string del .env
        const updateEnvVar = (key, value) => {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            const newVal = `${key}=${value}`;
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, newVal);
            } else {
                envContent += `\n${newVal}`;
            }
            process.env[key] = value; // Sincroniza la memoria RAM de Node.js
        };

        // OWASP A03, A08: Solo permitir keys de whitelist
        for (const [key, value] of Object.entries(updates)) {
            if (!ALLOWED_SETTINGS_KEYS.includes(key)) {
                continue; // Ignorar keys no autorizadas silenciosamente
            }
            // OWASP A10: Validar formato de LDAP_URL
            if (key === 'LDAP_URL' && value) {
                const urlStr = String(value);
                if (!urlStr.startsWith('ldap://') && !urlStr.startsWith('ldaps://')) {
                    continue; // Ignorar URLs de LDAP no válidas
                }
            }
            // Los booleanos llegan como true/false, los pasamos a string
            updateEnvVar(key, String(value));
        }

        // Guardamos físicamente en disco
        fs.writeFileSync(envPath, envContent);

        // Reiniciamos el servicio SMTP en caliente
        emailService.initTransporter();

        logAdminAction('SETTINGS_UPDATED', { updatedKeys: Object.keys(updates).filter(k => ALLOWED_SETTINGS_KEYS.includes(k)), by: req.user.id });
        res.json({ message: 'Configuración actualizada y servicios reiniciados en caliente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al escribir el archivo de configuración' });
    }
};