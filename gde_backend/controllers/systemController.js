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

// ==========================================
// DASHBOARD STATS — Endpoint para métricas avanzadas
// ==========================================
exports.getDashboardStats = async (req, res) => {
    try {
        // OWASP A01: Validar que el usuario está autenticado (ya lo hace el middleware)
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const pad = (n) => n.toString().padStart(2, '0');
        const formatMysqlDate = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

        // 1. Total de documentos
        const [[{ totalDocuments }]] = await pool.query('SELECT COUNT(*) AS totalDocuments FROM documents');

        // 2. Documentos firmados hoy
        const [[{ signedToday }]] = await pool.query(
            `SELECT COUNT(DISTINCT item_id) AS signedToday FROM history 
             WHERE item_type = 'documento' AND action LIKE '%Firma%' AND created_at >= ?`,
            [formatMysqlDate(todayStart)]
        );

        // 3. Total de documentos firmados (todos los tiempos)
        const [[{ totalSigned }]] = await pool.query(
            `SELECT COUNT(*) AS totalSigned FROM documents WHERE status = 'Firmado' OR status = 'Archivado'`
        );

        // 4. Pendientes de revisión (en proceso de firma)
        const [[{ pendingReview }]] = await pool.query(
            `SELECT COUNT(*) AS pendingReview FROM documents WHERE status = 'Firmandose'`
        );

        // 5. Documentos por tipo
        const [docsByType] = await pool.query(
            'SELECT doc_type AS type, COUNT(*) AS count FROM documents GROUP BY doc_type ORDER BY count DESC'
        );

        // 6. Timeline de documentos firmados (últimos 30 días por defecto)
        const timeRange = parseInt(req.query.timeRange) || 30;
        // OWASP A03: Sanitizar parámetro de rango de tiempo
        const safeRange = Math.min(Math.max(timeRange, 7), 365);
        const rangeStart = new Date(now);
        rangeStart.setDate(rangeStart.getDate() - safeRange);

        const [loadTimeline] = await pool.query(
            `SELECT DATE(h.created_at) AS date, COUNT(DISTINCT h.item_id) AS count 
             FROM history h
             WHERE h.item_type = 'documento' AND h.action LIKE '%Firma%' AND h.created_at >= ?
             GROUP BY DATE(h.created_at) 
             ORDER BY date ASC`,
            [formatMysqlDate(rangeStart)]
        );

        // 7. Métricas en tiempo real
        const oneMinuteAgo = new Date(now - 60 * 1000);
        const oneHourAgo = new Date(now - 60 * 60 * 1000);

        // Firmas por minuto (últimos 5 min promediados)
        const fiveMinAgo = new Date(now - 5 * 60 * 1000);
        const [[{ signaturesLast5Min }]] = await pool.query(
            `SELECT COUNT(*) AS signaturesLast5Min FROM history 
             WHERE action LIKE '%Firma%' AND item_type = 'documento' AND created_at >= ?`,
            [formatMysqlDate(fiveMinAgo)]
        );
        const [[{ signaturesLastHour }]] = await pool.query(
            `SELECT COUNT(*) AS signaturesLastHour FROM history 
             WHERE action LIKE '%Firma%' AND item_type = 'documento' AND created_at >= ?`,
            [formatMysqlDate(oneHourAgo)]
        );
        const [[{ signaturesToday }]] = await pool.query(
            `SELECT COUNT(*) AS signaturesToday FROM history 
             WHERE action LIKE '%Firma%' AND item_type = 'documento' AND created_at >= ?`,
            [formatMysqlDate(todayStart)]
        );

        // Adjuntos subidos
        const [[{ uploadsLast5Min }]] = await pool.query(
            `SELECT COUNT(*) AS uploadsLast5Min FROM history 
             WHERE action LIKE '%Adjuntado%' AND created_at >= ?`,
            [formatMysqlDate(fiveMinAgo)]
        );
        const [[{ uploadsLastHour }]] = await pool.query(
            `SELECT COUNT(*) AS uploadsLastHour FROM history 
             WHERE action LIKE '%Adjuntado%' AND created_at >= ?`,
            [formatMysqlDate(oneHourAgo)]
        );
        const [[{ uploadsToday }]] = await pool.query(
            `SELECT COUNT(*) AS uploadsToday FROM history 
             WHERE action LIKE '%Adjuntado%' AND created_at >= ?`,
            [formatMysqlDate(todayStart)]
        );

        // Descargas
        const [[{ downloadsLast5Min }]] = await pool.query(
            `SELECT COUNT(*) AS downloadsLast5Min FROM history 
             WHERE action LIKE '%Descarga%' AND created_at >= ?`,
            [formatMysqlDate(fiveMinAgo)]
        );
        const [[{ downloadsLastHour }]] = await pool.query(
            `SELECT COUNT(*) AS downloadsLastHour FROM history 
             WHERE action LIKE '%Descarga%' AND created_at >= ?`,
            [formatMysqlDate(oneHourAgo)]
        );
        const [[{ downloadsToday }]] = await pool.query(
            `SELECT COUNT(*) AS downloadsToday FROM history 
             WHERE action LIKE '%Descarga%' AND created_at >= ?`,
            [formatMysqlDate(todayStart)]
        );

        // Usuarios activos (realizaron alguna acción en los últimos 15 min)
        const fifteenMinAgo = new Date(now - 15 * 60 * 1000);
        const [[{ onlineUsers }]] = await pool.query(
            `SELECT COUNT(DISTINCT user_id) AS onlineUsers FROM history WHERE created_at >= ?`,
            [formatMysqlDate(fifteenMinAgo)]
        );

        // 8. Actividad reciente (últimas 25 acciones)
        const [recentActivity] = await pool.query(
            `SELECT h.item_id, h.item_type, h.user_id, h.action, h.notes, h.created_at,
                    u.name AS user_name,
                    CASE 
                        WHEN h.item_type = 'documento' THEN (SELECT COALESCE(number, subject) FROM documents WHERE id = h.item_id LIMIT 1)
                        WHEN h.item_type = 'expediente' THEN (SELECT COALESCE(number, subject) FROM expedientes WHERE id = h.item_id LIMIT 1)
                    END AS item_label
             FROM history h
             JOIN users u ON h.user_id = u.id
             ORDER BY h.created_at DESC
             LIMIT 25`
        );

        // 9. Eficiencia de procesos
        // Medimos el tiempo entre Creación y Firma para documentos firmados
        const [processData] = await pool.query(
            `SELECT d.id, d.created_at AS doc_created,
                    (SELECT MIN(h.created_at) FROM history h WHERE h.item_id = d.id AND h.action LIKE '%Firma%' AND h.item_type = 'documento') AS first_signature
             FROM documents d 
             WHERE d.status IN ('Firmado', 'Archivado')
             LIMIT 500`
        );

        let fast = 0, normal = 0, slow = 0;
        processData.forEach(row => {
            if (!row.first_signature) { slow++; return; }
            const created = new Date(row.doc_created).getTime();
            const signed = new Date(row.first_signature).getTime();
            const diffHours = (signed - created) / (1000 * 60 * 60);
            if (diffHours <= 24) fast++;
            else if (diffHours <= 72) normal++;
            else slow++;
        });

        // También contar documentos pendientes que llevan más de 72h sin firmar
        const [[{ stuckDocs }]] = await pool.query(
            `SELECT COUNT(*) AS stuckDocs FROM documents 
             WHERE status IN ('Borrador', 'Firmandose') 
             AND created_at < DATE_SUB(NOW(), INTERVAL 72 HOUR)`
        );
        slow += stuckDocs;

        // 10. Documentos por estado (para gráfico de barras)
        const [docsByStatus] = await pool.query(
            `SELECT status, COUNT(*) AS count FROM documents GROUP BY status ORDER BY count DESC`
        );

        res.json({
            totalDocuments,
            signedToday,
            totalSigned,
            pendingReview,
            docsByType,
            docsByStatus,
            loadTimeline: loadTimeline.map(r => ({ date: r.date, count: r.count })),
            realtimeMetrics: {
                signaturesPerMinute: Math.round(signaturesLast5Min / 5),
                signaturesPerHour: signaturesLastHour,
                signaturesPerDay: signaturesToday,
                uploadsPerMinute: Math.round(uploadsLast5Min / 5),
                uploadsPerHour: uploadsLastHour,
                uploadsPerDay: uploadsToday,
                downloadsPerMinute: Math.round(downloadsLast5Min / 5),
                downloadsPerHour: downloadsLastHour,
                downloadsPerDay: downloadsToday,
                onlineUsers
            },
            recentActivity: recentActivity.map(a => ({
                userId: a.user_id,
                userName: a.user_name,
                action: a.action,
                itemId: a.item_id,
                itemType: a.item_type,
                itemLabel: a.item_label || 'Sin número',
                notes: a.notes,
                createdAt: a.created_at
            })),
            processEfficiency: { fast, normal, slow }
        });
    } catch (error) {
        console.error('Error en dashboard stats:', error);
        res.status(500).json({ message: 'Error al obtener estadísticas del dashboard' });
    }
};