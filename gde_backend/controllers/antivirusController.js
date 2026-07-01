// controllers/antivirusController.js
const pool = require('../config/db');
const { antivirusQueue } = require('../config/queues');
const net = require('net');
const dns = require('dns').promises;

// Helper para enviar comandos cortos a ClamAV (VERSION, RELOAD, PING)
function sendClamCommand(command, host, port) {
    return new Promise((resolve, reject) => {
        const socket = net.connect({ host, port: port || 3310 });
        let response = '';
        socket.setTimeout(5000);

        socket.on('connect', () => {
            socket.write(`n${command}\n`);
        });

        socket.on('data', (data) => {
            response += data.toString();
        });

        socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('Timeout de comunicación con el antivirus ClamAV'));
        });

        socket.on('end', () => {
            resolve(response.trim());
        });

        socket.on('error', (err) => {
            reject(err);
        });
    });
}

exports.getStats = async (req, res) => {
    // Protección de acceso a administradores
    const { checkUserHasPermission } = require('../middlewares/roleMiddleware');
    const hasAdminServices = req.user.role === 'admin' || (await checkUserHasPermission(req.user.id, 'admin_services'));
    if (!hasAdminServices) return res.status(403).json({ message: 'Acceso denegado. Se requiere permiso admin_services.' });

    try {
        // 1. Obtener contadores agrupados de la base de datos
        const [rows] = await pool.query(
            `SELECT status, COUNT(*) AS count FROM antivirus_scans GROUP BY status`
        );

        let cleanCount = 0;
        let infectedCount = 0;
        let errorCount = 0;

        rows.forEach(r => {
            if (r.status === 'clean') cleanCount = r.count;
            else if (r.status === 'infected') infectedCount = r.count;
            else if (r.status === 'error') errorCount = r.count;
        });

        // 2. Consultar BullMQ para conocer los trabajos en cola/ejecución
        let pendingCount = 0;
        let scanningCount = 0;
        try {
            const jobCounts = await antivirusQueue.getJobCounts();
            pendingCount = (jobCounts.waiting || 0) + (jobCounts.delayed || 0) + (jobCounts.paused || 0);
            scanningCount = jobCounts.active || 0;
        } catch (queueErr) {
            console.error('Error al leer cola de antivirus:', queueErr.message);
        }

        const totalScanned = cleanCount + infectedCount + errorCount;

        // 3. Obtener todos los análisis de virus recientes (últimos 200 para mantener performance)
        const [recentAlerts] = await pool.query(
            `SELECT a.*, u.name AS user_name 
             FROM antivirus_scans a
             JOIN users u ON a.user_id = u.id
             ORDER BY a.scan_date DESC 
             LIMIT 200`
        );

        res.json({
            totalScanned,
            cleanCount,
            infectedCount,
            errorCount,
            pendingCount,
            scanningCount,
            recentAlerts: recentAlerts.map(alert => ({
                id: alert.id,
                attachmentName: alert.attachment_name,
                documentId: alert.document_id,
                userName: alert.user_name,
                scanDate: alert.scan_date,
                fileSizeBytes: alert.file_size_bytes,
                status: alert.status,
                virusName: alert.virus_name || '-',
                scanDurationMs: alert.scan_duration_ms || 0
            }))
        });

    } catch (error) {
        console.error('Error al obtener estadísticas del antivirus:', error);
        res.status(500).json({ message: 'Error al obtener estadísticas del antivirus' });
    }
};

exports.getStatus = async (req, res) => {
    const { checkUserHasPermission } = require('../middlewares/roleMiddleware');
    const hasAdminServices = req.user.role === 'admin' || (await checkUserHasPermission(req.user.id, 'admin_services'));
    if (!hasAdminServices) return res.status(403).json({ message: 'Acceso denegado.' });

    const host = process.env.ANTIVIRUS_HOST || 'clamav';
    const port = parseInt(process.env.ANTIVIRUS_PORT) || 3310;

    try {
        const rawVersion = await sendClamCommand('VERSION', host, port);
        
        // Parsear versión. Ej: "ClamAV 1.3.0/26700/Tue Jun 23 08:31:00 2026"
        const parts = rawVersion.split('/');
        res.json({
            online: true,
            version: parts[0] || 'Desconocido',
            dbVersion: parts[1] || 'Desconocido',
            dbDate: parts[2] || 'Desconocido'
        });
    } catch (error) {
        console.warn('Servicio de antivirus fuera de línea:', error.message);
        res.json({
            online: false,
            error: error.message
        });
    }
};

exports.updateSignatures = async (req, res) => {
    const { checkUserHasPermission } = require('../middlewares/roleMiddleware');
    const hasAdminServices = req.user.role === 'admin' || (await checkUserHasPermission(req.user.id, 'admin_services'));
    if (!hasAdminServices) return res.status(403).json({ message: 'Acceso denegado.' });

    const host = process.env.ANTIVIRUS_HOST || 'clamav';
    const port = parseInt(process.env.ANTIVIRUS_PORT) || 3310;

    try {
        let targets = [];

        // Estrategia Swarm: Buscar todas las réplicas del servicio usando DNS tasks.clamav
        try {
            const ips = await dns.resolve4('tasks.clamav');
            if (ips && ips.length > 0) {
                targets = ips.map(ip => ({ host: ip, port }));
                console.log(`Swarm detectado: Enviando recarga a ${ips.length} réplicas de ClamAV:`, ips);
            }
        } catch (dnsErr) {
            // Fuera de Swarm, apuntar únicamente al host configurado
            targets = [{ host, port }];
        }

        const promises = targets.map(target => 
            sendClamCommand('RELOAD', target.host, target.port)
                .then(res => ({ host: target.host, success: true, result: res }))
                .catch(err => ({ host: target.host, success: false, error: err.message }))
        );

        const results = await Promise.all(promises);
        
        const successCount = results.filter(r => r.success).length;
        const totalCount = results.length;

        res.json({
            message: `Órdenes de recarga enviadas con éxito (${successCount}/${totalCount} réplicas respondieron).`,
            details: results
        });
    } catch (error) {
        console.error('Error al actualizar firmas de antivirus:', error);
        res.status(500).json({ message: 'Error interno al procesar la actualización manual.' });
    }
};
