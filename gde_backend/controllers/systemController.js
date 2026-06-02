// controllers/systemController.js
const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const emailService = require('../services/emailService');
const { logAdminAction, logSecurityError } = require('../utils/logger');
const redis = require('../config/redisClient');

// OWASP A03, A08: Whitelist de variables permitidas en updateSettings
const ALLOWED_SETTINGS_KEYS = [
    'EMAIL_ENABLED', 'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_SECURE',
    'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM',
    'LDAP_ENABLED', 'LDAP_URL', 'LDAP_DOMAIN',
    'TWO_FACTOR_GLOBAL_ENABLED', 'TWO_FACTOR_MANDATORY'
];

// ==========================================
// CACHE KEYS Y TTLs
// ==========================================
const CACHE_KEYS = {
    INITIAL_DATA: 'gde:cache:initialData',
    DASHBOARD_PREFIX: 'gde:cache:dashboard:', // + timeRange
};
const CACHE_TTL = {
    INITIAL_DATA: 60,   // 60 segundos — áreas/usuarios cambian poco
    DASHBOARD: 30,      // 30 segundos — métricas en tiempo real
};

// ==========================================
// Helper: Cache get/set con fallback a MySQL si Redis falla
// ==========================================
async function cacheGet(key) {
    try {
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
    } catch (err) {
        // Degradación elegante: si Redis falla, seguimos sin cache
        console.error('Redis GET fallback:', err.message);
        return null;
    }
}

async function cacheSet(key, data, ttlSeconds) {
    try {
        await redis.setex(key, ttlSeconds, JSON.stringify(data));
    } catch (err) {
        console.error('Redis SET fallback:', err.message);
    }
}

async function cacheDel(key) {
    try {
        await redis.del(key);
    } catch (err) {
        console.error('Redis DEL fallback:', err.message);
    }
}

// ==========================================
// Invalidar cache de datos iniciales (llamado desde user/area controllers)
// ==========================================
exports.invalidateInitialDataCache = async () => {
    await cacheDel(CACHE_KEYS.INITIAL_DATA);
};

exports.getInitialData = async (req, res) => {
    try {
        // --- CACHE HIT: Devolver datos cacheados (0 queries SQL) ---
        const cached = await cacheGet(CACHE_KEYS.INITIAL_DATA);
        if (cached) return res.json(cached);

        // --- CACHE MISS: Consultar MySQL y cachear ---
        const [areas] = await pool.query('SELECT id, name FROM areas');
        const [usersRows] = await pool.query('SELECT id, name, email, area_id AS areaId, role, areas, two_factor_enabled, status FROM users');
        
        const users = usersRows.map(u => ({
            ...u,
            twoFactorEnabled: u.two_factor_enabled === 1,
            areas: typeof u.areas === 'string' ? JSON.parse(u.areas) : (u.areas || [u.areaId])
        }));
        
        const responseData = { areas, users };
        await cacheSet(CACHE_KEYS.INITIAL_DATA, responseData, CACHE_TTL.INITIAL_DATA);

        res.json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener datos del sistema' });
    }
};

exports.getSettings = (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Acceso denegado' });
    
    // Fase 5: Forzar recarga dinámica del archivo .env desde el disco (volumen montado)
    // Esto previene inconsistencia entre diferentes procesos del cluster Express/Docker.
    try {
        const path = require('path');
        const envPath = path.join(__dirname, '../.env');
        if (require('fs').existsSync(envPath)) {
            require('dotenv').config({ path: envPath, override: true });
        }
    } catch (err) {
        console.error('Error al recargar dynamic .env en getSettings:', err.message);
    }
    
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
// DASHBOARD STATS — Endpoint optimizado para métricas avanzadas
// Consolidado: De ~14 queries individuales a 6 queries eficientes
// + Cache Redis con TTL 30 segundos (Fase 3)
// ==========================================
exports.getDashboardStats = async (req, res) => {
    try {
        // Parámetro de rango sanitizado (OWASP A03)
        const timeRange = parseInt(req.query.timeRange) || 30;
        const safeRange = Math.min(Math.max(timeRange, 7), 365);

        // --- CACHE HIT: Devolver stats cacheadas (0 queries SQL) ---
        const cacheKey = `${CACHE_KEYS.DASHBOARD_PREFIX}${safeRange}`;
        const cached = await cacheGet(cacheKey);
        if (cached) return res.json(cached);

        // --- CACHE MISS: Ejecutar las 6 queries y cachear ---
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
        const pad = (n) => n.toString().padStart(2, '0');
        const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const fiveMinAgo = new Date(now - 5 * 60 * 1000);
        const oneHourAgo = new Date(now - 60 * 60 * 1000);
        const fifteenMinAgo = new Date(now - 15 * 60 * 1000);

        // === QUERY 1: Todas las métricas de documentos en una sola query ===
        const [[docMetrics]] = await pool.query(`
            SELECT 
                COUNT(*) AS totalDocuments,
                COALESCE(SUM(CASE WHEN status IN ('Firmado', 'Archivado') THEN 1 ELSE 0 END), 0) AS totalSigned,
                COALESCE(SUM(CASE WHEN status = 'Firmandose' THEN 1 ELSE 0 END), 0) AS pendingReview,
                COALESCE(SUM(CASE WHEN status IN ('Borrador', 'Firmandose') AND created_at < DATE_SUB(NOW(), INTERVAL 72 HOUR) THEN 1 ELSE 0 END), 0) AS stuckDocs
            FROM documents
        `);

        // === QUERY 2: Todas las métricas de historial en una sola query (condicional) ===
        const [[histMetrics]] = await pool.query(`
            SELECT
                COUNT(DISTINCT CASE WHEN item_type = 'documento' AND action LIKE '%Firma%' AND created_at >= ? THEN item_id END) AS signedToday,
                COUNT(CASE WHEN action LIKE '%Firma%' AND item_type = 'documento' AND created_at >= ? THEN 1 END) AS signaturesLast5Min,
                COUNT(CASE WHEN action LIKE '%Firma%' AND item_type = 'documento' AND created_at >= ? THEN 1 END) AS signaturesLastHour,
                COUNT(CASE WHEN action LIKE '%Firma%' AND item_type = 'documento' AND created_at >= ? THEN 1 END) AS signaturesToday,
                COUNT(CASE WHEN action LIKE '%Adjuntado%' AND created_at >= ? THEN 1 END) AS uploadsLast5Min,
                COUNT(CASE WHEN action LIKE '%Adjuntado%' AND created_at >= ? THEN 1 END) AS uploadsLastHour,
                COUNT(CASE WHEN action LIKE '%Adjuntado%' AND created_at >= ? THEN 1 END) AS uploadsToday,
                COUNT(CASE WHEN action LIKE '%Descarga%' AND created_at >= ? THEN 1 END) AS downloadsLast5Min,
                COUNT(CASE WHEN action LIKE '%Descarga%' AND created_at >= ? THEN 1 END) AS downloadsLastHour,
                COUNT(CASE WHEN action LIKE '%Descarga%' AND created_at >= ? THEN 1 END) AS downloadsToday,
                COUNT(DISTINCT CASE WHEN created_at >= ? THEN user_id END) AS onlineUsers
            FROM history
        `, [
            fmt(todayStart),
            fmt(fiveMinAgo), fmt(oneHourAgo), fmt(todayStart),
            fmt(fiveMinAgo), fmt(oneHourAgo), fmt(todayStart),
            fmt(fiveMinAgo), fmt(oneHourAgo), fmt(todayStart),
            fmt(fifteenMinAgo)
        ]);

        // === QUERY 3: Agrupaciones (docs por tipo, por estado) — 2 queries ligeras ===
        const [docsByType] = await pool.query(
            'SELECT doc_type AS type, COUNT(*) AS count FROM documents GROUP BY doc_type ORDER BY count DESC'
        );
        const [docsByStatus] = await pool.query(
            'SELECT status, COUNT(*) AS count FROM documents GROUP BY status ORDER BY count DESC'
        );

        // === QUERY 4: Timeline de firmas (con rango sanitizado) ===
        const rangeStart = new Date(now);
        rangeStart.setDate(rangeStart.getDate() - safeRange);

        const [loadTimeline] = await pool.query(
            `SELECT DATE(h.created_at) AS date, COUNT(DISTINCT h.item_id) AS count 
             FROM history h
             WHERE h.item_type = 'documento' AND h.action LIKE '%Firma%' AND h.created_at >= ?
             GROUP BY DATE(h.created_at) 
             ORDER BY date ASC`,
            [fmt(rangeStart)]
        );

        // === QUERY 5: Actividad reciente (últimas 25 acciones) ===
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

        // === QUERY 6: Eficiencia de procesos ===
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
        slow += docMetrics.stuckDocs;

        const responseData = {
            totalDocuments: docMetrics.totalDocuments,
            signedToday: histMetrics.signedToday,
            totalSigned: docMetrics.totalSigned,
            pendingReview: docMetrics.pendingReview,
            docsByType,
            docsByStatus,
            loadTimeline: loadTimeline.map(r => ({ date: r.date, count: r.count })),
            realtimeMetrics: {
                signaturesPerMinute: Math.round(histMetrics.signaturesLast5Min / 5),
                signaturesPerHour: histMetrics.signaturesLastHour,
                signaturesPerDay: histMetrics.signaturesToday,
                uploadsPerMinute: Math.round(histMetrics.uploadsLast5Min / 5),
                uploadsPerHour: histMetrics.uploadsLastHour,
                uploadsPerDay: histMetrics.uploadsToday,
                downloadsPerMinute: Math.round(histMetrics.downloadsLast5Min / 5),
                downloadsPerHour: histMetrics.downloadsLastHour,
                downloadsPerDay: histMetrics.downloadsToday,
                onlineUsers: histMetrics.onlineUsers
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
        };

        // Guardar en cache (TTL 30 segundos)
        await cacheSet(cacheKey, responseData, CACHE_TTL.DASHBOARD);

        res.json(responseData);
    } catch (error) {
        console.error('Error en dashboard stats:', error);
        res.status(500).json({ message: 'Error al obtener estadísticas del dashboard' });
    }
};