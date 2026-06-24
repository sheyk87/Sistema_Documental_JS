// workers/antivirusWorker.js
require('dotenv').config();
process.env.TZ = 'America/Argentina/Buenos_Aires';

const { Worker } = require('bullmq');
const { connection } = require('../config/queues');
const pool = require('../config/db');
const antivirusService = require('../services/antivirusService');
const { sendNotificationInternal } = require('../controllers/notificationController');
const { logSecurityError } = require('../utils/logger');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const ENCRYPTION_KEY = process.env.FILE_SECRET;

const getArgTime = () => {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const antivirusWorker = new Worker('gde-antivirus', async (job) => {
    const { documentId, filename, originalname, size, userId } = job.data;
    const filePath = path.join(__dirname, '../uploads', filename);

    // Cargar dinámicamente configuraciones en caliente del .env en disco
    try {
        const envPath = path.join(__dirname, '../.env');
        if (fs.existsSync(envPath)) {
            require('dotenv').config({ path: envPath, override: true });
        }
    } catch (err) {
        console.error('Error al recargar dynamic .env en antivirusWorker:', err.message);
    }

    const scanId = crypto.randomUUID();
    const startTime = Date.now();

    console.log(`🔍 Iniciando análisis de antivirus [Job ${job.id}]: ${originalname} (${(size / 1024).toFixed(1)} KB)`);

    // 1. Verificar existencia del archivo físico
    try {
        await fsPromises.access(filePath, fs.constants.R_OK);
    } catch (err) {
        console.error(`❌ Archivo físico no encontrado en ruta: ${filePath}`);
        await pool.query(
            `INSERT INTO antivirus_scans (id, attachment_name, document_id, user_id, status, file_size_bytes, scan_duration_ms, virus_name) 
             VALUES (?, ?, ?, ?, 'error', ?, 0, 'Archivo no encontrado')`,
            [scanId, originalname, documentId, userId, size]
        );
        throw new Error(`Archivo adjunto no encontrado en disco: ${filename}`);
    }

    // 2. Preparar el stream descifrando al vuelo
    const parts = filename.split('-');
    const ivHex = parts[0];
    let fileStream;

    try {
        if (ivHex.length === 32) {
            const iv = Buffer.from(ivHex, 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
            fileStream = fs.createReadStream(filePath).pipe(decipher);
        } else {
            fileStream = fs.createReadStream(filePath);
        }
    } catch (cryptoErr) {
        console.error('❌ Error al preparar stream de descifrado:', cryptoErr.message);
        // Marcar escaneo como error
        await pool.query(
            `INSERT INTO antivirus_scans (id, attachment_name, document_id, user_id, status, file_size_bytes, scan_duration_ms, virus_name) 
             VALUES (?, ?, ?, ?, 'error', ?, 0, 'Error de descifrado')`,
            [scanId, originalname, documentId, userId, size]
        );
        throw cryptoErr;
    }

    // 3. Ejecutar escaneo contra ClamAV
    try {
        const scanResult = await antivirusService.scanStream(fileStream);
        const duration = Date.now() - startTime;

        if (scanResult.isInfected) {
            console.warn(`🚨 ¡VIRUS DETECTADO! Archivo: ${originalname} | Firma: ${scanResult.virusName}`);
            
            // A. Eliminar archivo físico
            try {
                await fsPromises.unlink(filePath);
            } catch (err) {
                console.error(`No se pudo eliminar el archivo infectado: ${filePath}`, err.message);
            }

            // B. Eliminar de la base de datos de documentos
            const [docRows] = await pool.query('SELECT attachments, current_owner_id FROM documents WHERE id = ?', [documentId]);
            if (docRows.length > 0) {
                let attachments = typeof docRows[0].attachments === 'string' 
                    ? JSON.parse(docRows[0].attachments) 
                    : (docRows[0].attachments || []);
                
                attachments = attachments.filter(a => a.filename !== filename);
                
                await pool.query('UPDATE documents SET attachments = ? WHERE id = ?', [JSON.stringify(attachments), documentId]);

                // Registrar en historial del documento
                const hNotes = `Archivo infectado: ${originalname} (Virus: ${scanResult.virusName}). Archivo eliminado automáticamente.`;
                await pool.query(
                    `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) 
                     VALUES (?, 'documento', ?, 'Antivirus - Virus Detectado', ?, ?)`,
                    [documentId, userId, hNotes, getArgTime()]
                );

                // Notificar al usuario que subió el archivo y al dueño del documento
                const notificationMsg = `El archivo adjunto "${originalname}" fue eliminado porque el sistema antivirus detectó software malicioso (${scanResult.virusName}).`;
                const recipients = new Set([userId, docRows[0].current_owner_id]);
                await sendNotificationInternal({
                    userIds: Array.from(recipients),
                    senderId: 'system',
                    action: 'Alerta Antivirus',
                    message: notificationMsg,
                    itemId: documentId,
                    itemType: 'documento'
                });
            }

            // C. Registrar en base de datos de auditoría de antivirus
            await pool.query(
                `INSERT INTO antivirus_scans (id, attachment_name, document_id, user_id, status, file_size_bytes, scan_duration_ms, virus_name) 
                 VALUES (?, ?, ?, ?, 'infected', ?, ?, ?)`,
                [scanId, originalname, documentId, userId, size, duration, scanResult.virusName]
            );

            logSecurityError(new Error(`Antivirus: Malware detectado en adjunto`), {
                documentId,
                filename: originalname,
                virus: scanResult.virusName,
                uploadedBy: userId
            });

            return { status: 'infected', virusName: scanResult.virusName };
        } else {
            console.log(`✅ Archivo limpio: ${originalname}`);

            // A. Cambiar estado a 'clean' en el JSON de documentos
            const [docRows] = await pool.query('SELECT attachments FROM documents WHERE id = ?', [documentId]);
            if (docRows.length > 0) {
                const attachments = typeof docRows[0].attachments === 'string' 
                    ? JSON.parse(docRows[0].attachments) 
                    : (docRows[0].attachments || []);
                
                const attIndex = attachments.findIndex(a => a.filename === filename);
                if (attIndex > -1) {
                    attachments[attIndex].status = 'clean';
                }
                
                await pool.query('UPDATE documents SET attachments = ? WHERE id = ?', [JSON.stringify(attachments), documentId]);

                // Registrar en el historial del documento
                const hNotes = `Archivo verificado (Limpio): ${originalname}`;
                await pool.query(
                    `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) 
                     VALUES (?, 'documento', ?, 'Antivirus - Escaneo Exitoso', ?, ?)`,
                    [documentId, userId, hNotes, getArgTime()]
                );
            }

            // B. Registrar en BD de auditoría de antivirus
            await pool.query(
                `INSERT INTO antivirus_scans (id, attachment_name, document_id, user_id, status, file_size_bytes, scan_duration_ms, virus_name) 
                 VALUES (?, ?, ?, ?, 'clean', ?, ?, NULL)`,
                [scanId, originalname, documentId, userId, size, duration]
            );

            return { status: 'clean' };
        }
    } catch (scanErr) {
        const duration = Date.now() - startTime;
        console.error('❌ Error de comunicación con ClamAV:', scanErr.message);

        // Estrategia de Fail-Safe (Fallo Seguro)
        const failSafeMode = process.env.ANTIVIRUS_FAIL_SAFE || 'closed';

        if (failSafeMode === 'closed') {
            console.warn(`🛑 Política Fail-Closed activa: Eliminando archivo por fallo del servicio antivirus.`);

            // A. Eliminar archivo físico
            try { await fsPromises.unlink(filePath); } catch (e) {}

            // B. Eliminar de la base de datos de documentos
            const [docRows] = await pool.query('SELECT attachments FROM documents WHERE id = ?', [documentId]);
            if (docRows.length > 0) {
                let attachments = typeof docRows[0].attachments === 'string' 
                    ? JSON.parse(docRows[0].attachments) 
                    : (docRows[0].attachments || []);
                
                attachments = attachments.filter(a => a.filename !== filename);
                await pool.query('UPDATE documents SET attachments = ? WHERE id = ?', [JSON.stringify(attachments), documentId]);

                // Registrar en historial del documento
                const hNotes = `Archivo rechazado: ${originalname} (El servicio de antivirus no responde y la política del sistema es restrictiva).`;
                await pool.query(
                    `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) 
                     VALUES (?, 'documento', ?, 'Antivirus - Error de Análisis', ?, ?)`,
                    [documentId, userId, hNotes, getArgTime()]
                );

                // Notificar al usuario
                const notificationMsg = `El archivo adjunto "${originalname}" fue rechazado porque el sistema antivirus está fuera de línea y la política del sistema es restrictiva.`;
                await sendNotificationInternal({
                    userIds: [userId],
                    senderId: 'system',
                    action: 'Error de Antivirus',
                    message: notificationMsg,
                    itemId: documentId,
                    itemType: 'documento'
                });
            }

            // C. Registrar en base de datos de auditoría
            await pool.query(
                `INSERT INTO antivirus_scans (id, attachment_name, document_id, user_id, status, file_size_bytes, scan_duration_ms, virus_name) 
                 VALUES (?, ?, ?, ?, 'error', ?, ?, 'Servicio offline (Fail-Closed)')`,
                [scanId, originalname, documentId, userId, size, duration]
            );

        } else {
            console.warn(`⚠️ Política Fail-Open activa: Permitiendo archivo a pesar del fallo del antivirus.`);

            // A. Activar el archivo a pesar del error
            const [docRows] = await pool.query('SELECT attachments FROM documents WHERE id = ?', [documentId]);
            if (docRows.length > 0) {
                const attachments = typeof docRows[0].attachments === 'string' 
                    ? JSON.parse(docRows[0].attachments) 
                    : (docRows[0].attachments || []);
                
                const attIndex = attachments.findIndex(a => a.filename === filename);
                if (attIndex > -1) {
                    attachments[attIndex].status = 'clean'; // Permitir acceso
                }
                await pool.query('UPDATE documents SET attachments = ? WHERE id = ?', [JSON.stringify(attachments), documentId]);

                // Registrar en historial
                const hNotes = `Archivo adjuntado sin escanear (Antivirus fuera de línea): ${originalname}`;
                await pool.query(
                    `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) 
                     VALUES (?, 'documento', ?, 'Antivirus - Omitido', ?, ?)`,
                    [documentId, userId, hNotes, getArgTime()]
                );
            }

            // B. Registrar en base de datos de auditoría
            await pool.query(
                `INSERT INTO antivirus_scans (id, attachment_name, document_id, user_id, status, file_size_bytes, scan_duration_ms, virus_name) 
                 VALUES (?, ?, ?, ?, 'error', ?, ?, 'Servicio offline (Fail-Open)')`,
                [scanId, originalname, documentId, userId, size, duration]
            );
        }

        throw scanErr;
    }
}, {
    connection,
    concurrency: 3, // Analizar hasta 3 archivos concurrentemente
});

antivirusWorker.on('completed', (job, result) => {
    console.log(`🔍 Escaneo completado [Job ${job.id}]: Estado final -> ${result.status}`);
});

antivirusWorker.on('failed', (job, err) => {
    console.error(`❌ Escaneo fallido [Job ${job?.id}]: ${err.message}`);
});

console.log('🔍 Antivirus Worker iniciado');

module.exports = antivirusWorker;
