// controllers/systemController.js
const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const emailService = require('../services/emailService');

exports.getInitialData = async (req, res) => {
    try {
        const [areas] = await pool.query('SELECT id, name FROM areas');
        // Agregamos la columna 'areas' a la consulta
        const [usersRows] = await pool.query('SELECT id, name, email, area_id AS areaId, role, areas FROM users');
        
        // Parseamos el JSON para el frontend
        const users = usersRows.map(u => ({
            ...u,
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
    
    res.json({
        EMAIL_ENABLED: process.env.EMAIL_ENABLED === 'true',
        EMAIL_HOST: process.env.EMAIL_HOST || '',
        EMAIL_PORT: process.env.EMAIL_PORT || '',
        EMAIL_SECURE: process.env.EMAIL_SECURE === 'true',
        EMAIL_USER: process.env.EMAIL_USER || '',
        EMAIL_PASS: process.env.EMAIL_PASS || '',
        EMAIL_FROM: process.env.EMAIL_FROM || '',
        LDAP_ENABLED: process.env.LDAP_ENABLED === 'true',
        LDAP_URL: process.env.LDAP_URL || '',
        LDAP_DOMAIN: process.env.LDAP_DOMAIN || ''
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

        // Procesamos todos los cambios
        for (const [key, value] of Object.entries(updates)) {
            // Los booleanos llegan como true/false, los pasamos a string
            updateEnvVar(key, String(value));
        }

        // Guardamos físicamente en disco
        fs.writeFileSync(envPath, envContent);

        // Reiniciamos el servicio SMTP en caliente
        emailService.initTransporter();

        res.json({ message: 'Configuración actualizada y servicios reiniciados en caliente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al escribir el archivo de configuración' });
    }
};