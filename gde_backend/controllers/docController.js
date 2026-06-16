const pool = require('../config/db');
const cryptoService = require('../services/cryptoService');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const crypto = require('crypto');
const ENCRYPTION_KEY = process.env.FILE_SECRET;
const signatureService = require('../services/signatureService');
const { sanitizeHtml, sanitizeText, escapeHtml } = require('../utils/sanitizer');
const { logSecurityError, logDataModification } = require('../utils/logger');

// OWASP A03: Validación de nombre de archivo para prevenir Path Traversal
function isValidFilename(filename) {
    if (!filename || typeof filename !== 'string') return false;
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return false;
    if (filename.includes('\0')) return false;
    return true;
}

// Función blindada: Obtiene la hora del servidor forzada a Argentina y lista para MySQL
const getArgTime = () => {
    const d = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Argentina/Buenos_Aires"}));
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

exports.createDocument = async (req, res) => {
    // Ya no usamos el createdAt del frontend
    const { id, docType, subject, content, creatorId, currentOwnerId, owners, status, recipients, areaId, isPublic, authAreas, authUsers } = req.body;
    try {
        const { checkUserHasPermission } = require('../middlewares/roleMiddleware');
        
        // 1. Validar permiso general para crear borradores de documentos (doc_create)
        const hasCreatePermission = await checkUserHasPermission(req.user.id, 'doc_create');
        if (!hasCreatePermission) {
            return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Crear Borrador de Documento (doc_create).' });
        }

        // Validar si el tipo de documento está permitido para este usuario
        const [userRestrictions] = await pool.query('SELECT allowed_doc_types FROM users WHERE id = ?', [req.user.id]);
        if (userRestrictions.length > 0) {
            const allowedDocTypes = typeof userRestrictions[0].allowed_doc_types === 'string'
                ? JSON.parse(userRestrictions[0].allowed_doc_types)
                : userRestrictions[0].allowed_doc_types;
            if (Array.isArray(allowedDocTypes) && !allowedDocTypes.includes(docType)) {
                return res.status(403).json({ message: `Acceso denegado. No tiene permisos para crear documentos de tipo "${docType}".` });
            }
        }

        const serverTime = getArgTime(); // Hora blindada
        // OWASP A03: Sanitizar contenido HTML y texto plano
        const safeSubject = sanitizeText(subject);
        const safeContent = sanitizeHtml(content);

        // 2. Validar tipos de documentos reservados por defecto
        const [dtRows] = await pool.query('SELECT is_reserved FROM document_types WHERE code = ? OR name = ?', [docType, docType]);
        const isReservedByDefault = dtRows.length > 0 && (dtRows[0].is_reserved === 1 || dtRows[0].is_reserved === true);

        const isPublicVal = isPublic === false ? 0 : 1;
        if (isReservedByDefault && isPublicVal !== 0) {
            return res.status(400).json({ message: 'Este tipo de documento está reservado por defecto y no puede ser público.' });
        }

        if (isPublicVal === 0) {
            const hasCreateReserved = await checkUserHasPermission(req.user.id, 'doc_create_reserved');
            if (!hasCreateReserved) {
                return res.status(403).json({ message: 'Acceso denegado. Se requieren permisos para crear documentación reservada.' });
            }
        }
        
        await pool.query(
            `INSERT INTO documents (id, doc_type, subject, content, creator_id, current_owner_id, status, owners, recipients, read_by, signed_by, related_docs, signatories, attachments, created_at, area_id, is_public, auth_areas, auth_users) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', '[]', '[]', ?, ?, ?, ?, ?)`,
            [
                id, docType, safeSubject, safeContent, creatorId, currentOwnerId, status, 
                JSON.stringify(owners||[]), JSON.stringify(recipients||[]), 
                serverTime, areaId,
                isPublicVal,
                JSON.stringify(authAreas || []),
                JSON.stringify(authUsers || [])
            ]
        );
        await pool.query(
            `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) VALUES (?, 'documento', ?, 'Creación', 'Se generó borrador', ?)`,
            [id, creatorId, serverTime]
        );
        res.status(201).json({ id, message: 'Documento creado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al crear el documento' });
    }
};

exports.getAllDocuments = async (req, res) => {
    try {
        // Optimización: Excluimos 'content' del listado (el frontend no lo necesita en la tabla)
        // Si se requiere el contenido, se obtiene al abrir un documento individual
        const includeContent = req.query.includeContent === 'true';
        const columns = includeContent
            ? '*'
            : 'id, doc_type, subject, creator_id, current_owner_id, area_id, status, number, created_at, owners, recipients, read_by, signed_by, related_docs, signatories, attachments, pdf_hash, is_public, auth_areas, auth_users';
        
        const [docs] = await pool.query(`SELECT ${columns} FROM documents`);
        const [history] = await pool.query(
            "SELECT item_id, created_at, user_id, action, notes FROM history WHERE item_type = 'documento' ORDER BY created_at ASC"
        );
        
        // Optimización: Pre-indexamos el historial en un Map para lookup O(1) por documento
        const historyMap = new Map();
        for (const h of history) {
            if (!historyMap.has(h.item_id)) historyMap.set(h.item_id, []);
            historyMap.get(h.item_id).push({ date: h.created_at, userId: h.user_id, action: h.action, notes: h.notes });
        }

        // CONTROL DE ACCESOS SEGURO (OWASP A01: Broken Access Control)
        const userId = req.user.id;
        const [userRows] = await pool.query('SELECT area_id, areas, role FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        const user = userRows[0];
        const userAreas = typeof user.areas === 'string' ? JSON.parse(user.areas) : (user.areas || [user.area_id]);
        
        const { checkUserHasPermission } = require('../middlewares/roleMiddleware');
        const isAuditorOrAdmin = user.role === 'admin' || (await checkUserHasPermission(userId, 'audit_logs'));

        let filteredDocs = docs;
        if (!isAuditorOrAdmin) {
            const [subordinatesRows] = await pool.query('SELECT id FROM users WHERE superior_id = ?', [userId]);
            const subordinateIds = subordinatesRows.map(s => s.id);

            filteredDocs = docs.filter(doc => {
                if (doc.is_public !== 0) return true;
                
                const authAreas = typeof doc.auth_areas === 'string' ? JSON.parse(doc.auth_areas) : (doc.auth_areas || []);
                const authUsers = typeof doc.auth_users === 'string' ? JSON.parse(doc.auth_users) : (doc.auth_users || []);
                
                const hasDirectAccess = doc.creator_id === userId || doc.current_owner_id === userId;
                const isAreaOwner = userAreas.includes(doc.current_owner_id);
                const isUserAuth = authUsers.includes(userId);
                const isAreaAuth = userAreas.some(area => authAreas.includes(area));
                const isOwnedBySubordinate = subordinateIds.includes(doc.current_owner_id);
                
                return hasDirectAccess || isAreaOwner || isUserAuth || isAreaAuth || isOwnedBySubordinate;
            });
        }
        
        const formattedDocs = filteredDocs.map(doc => {
            return {
                id: doc.id, type: 'documento', docType: doc.doc_type, subject: doc.subject,
                content: includeContent ? doc.content : '',
                creatorId: doc.creator_id, currentOwnerId: doc.current_owner_id, areaId: doc.area_id, status: doc.status, number: doc.number, createdAt: doc.created_at,
                owners: typeof doc.owners === 'string' ? JSON.parse(doc.owners) : (doc.owners || []),
                recipients: typeof doc.recipients === 'string' ? JSON.parse(doc.recipients) : (doc.recipients || []),
                readBy: typeof doc.read_by === 'string' ? JSON.parse(doc.read_by) : (doc.read_by || []),
                signedBy: typeof doc.signed_by === 'string' ? JSON.parse(doc.signed_by) : (doc.signed_by || []),
                relatedDocs: typeof doc.related_docs === 'string' ? JSON.parse(doc.related_docs) : (doc.related_docs || []),
                signatories: typeof doc.signatories === 'string' ? JSON.parse(doc.signatories) : (doc.signatories || []),
                attachments: typeof doc.attachments === 'string' ? JSON.parse(doc.attachments) : (doc.attachments || []),
                isPublic: doc.is_public === 1,
                authAreas: typeof doc.auth_areas === 'string' ? JSON.parse(doc.auth_areas) : (doc.auth_areas || []),
                authUsers: typeof doc.auth_users === 'string' ? JSON.parse(doc.auth_users) : (doc.auth_users || []),
                history: historyMap.get(doc.id) || []
            };
        });
        res.json(formattedDocs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener los documentos' });
    }
};

// Endpoint para carga lazy del contenido de un documento individual
// Usado cuando el frontend necesita el content (vista detalle, edición, firma)
exports.getDocumentContent = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT content FROM documents WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Documento no encontrado' });
        res.json({ content: rows[0].content });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener el contenido del documento' });
    }
};

exports.updateDocument = async (req, res) => {
    const { item, historyEntry } = req.body;
    try {
        // OWASP A03: Sanitizar contenido
        const safeSubject = sanitizeText(item.subject);
        const safeContent = sanitizeHtml(item.content);

        // Protección contra sobreescrituras accidentales de contenido vacío por carga lazy (Fase 1)
        const [currentRows] = await pool.query('SELECT subject, content FROM documents WHERE id = ?', [item.id]);
        let finalSubject = safeSubject;
        let finalContent = safeContent;
        if (currentRows.length > 0) {
            const currentDoc = currentRows[0];
            if ((!safeSubject || safeSubject.trim() === '') && currentDoc.subject) {
                finalSubject = currentDoc.subject;
            }
            if ((!safeContent || safeContent.trim() === '') && currentDoc.content) {
                finalContent = currentDoc.content;
            }
        }

        // === NUEVO: Comprobar licencia/ausencia del destinatario (Fase 3) ===
        const { resolveDelegatedOwner } = require('../utils/licenceHelper');
        const delegation = await resolveDelegatedOwner(item.currentOwnerId);
        
        if (delegation.delegated) {
            item.currentOwnerId = delegation.finalOwnerId;
            
            // Notificar al delegado con campanita y correo
            const notifMsg = `Recibiste el documento "${finalSubject}" por desvío automático debido a la licencia de ${delegation.originalOwnerName}.`;
            const { sendNotificationInternal } = require('./notificationController');
            await sendNotificationInternal({
                userIds: [delegation.finalOwnerId],
                senderId: req.user?.id || 'system',
                action: 'delegado_licencia',
                message: notifMsg,
                itemId: item.id,
                itemType: 'documento'
            });
            
            // Modificar la nota de historia
            if (historyEntry) {
                historyEntry.notes = (historyEntry.notes || '') + ` (Desviado automáticamente a ${delegation.delegatedOwnerName} por licencia de ${delegation.originalOwnerName})`;
            }
        }

        await pool.query(
            `UPDATE documents SET 
                subject = ?, content = ?, status = ?, current_owner_id = ?, 
                owners = ?, recipients = ?, signed_by = ?, related_docs = ?, signatories = ?, number = ?, area_id = ?,
                is_public = ?, auth_areas = ?, auth_users = ?
             WHERE id = ?`,
            [
                finalSubject, finalContent, item.status, item.currentOwnerId,
                JSON.stringify(item.owners || []), JSON.stringify(item.recipients || []), 
                JSON.stringify(item.signedBy || []), JSON.stringify(item.relatedDocs || []), 
                JSON.stringify(item.signatories || []), item.number, item.areaId,
                item.isPublic ? 1 : 0,
                JSON.stringify(item.authAreas || []),
                JSON.stringify(item.authUsers || []),
                item.id
            ]
        );

        if (historyEntry) {
            // Ignoramos historyEntry.date e insertamos la hora real del servidor
            await pool.query(
                `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) VALUES (?, 'documento', ?, ?, ?, ?)`,
                [item.id, historyEntry.userId, historyEntry.action, historyEntry.notes, getArgTime()]
            );
        }

        res.json({ message: 'Documento actualizado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar el documento' });
    }
};

// NUEVO: Subir archivo y Cifrarlo en el Servidor
exports.uploadAttachment = async (req, res) => {
    try {
        const { id } = req.params;
        const file = req.file;
        const userId = req.user.id; 

        if (!file) return res.status(400).json({ message: 'No se subió ningún archivo' });

        const [docRows] = await pool.query('SELECT doc_type FROM documents WHERE id = ?', [id]);
        if (docRows.length === 0) {
            if (file) { try { await fsPromises.unlink(file.path); } catch (e) {} }
            return res.status(404).json({ message: 'Documento no encontrado' });
        }
        const docType = docRows[0].doc_type;

        // Validar si el tipo de documento permite adjuntos
        const [dtRows] = await pool.query('SELECT allows_attachments FROM document_types WHERE code = ? OR name = ?', [docType, docType]);
        if (dtRows.length > 0 && (dtRows[0].allows_attachments === 0 || dtRows[0].allows_attachments === false)) {
            if (file) { try { await fsPromises.unlink(file.path); } catch (e) {} }
            return res.status(400).json({ message: 'Este tipo de documento no admite archivos adjuntos.' });
        }

        // 1. Configuración Criptográfica
        const iv = crypto.randomBytes(16); // Vector de inicialización único por archivo
        const ivHex = iv.toString('hex');
        // El nuevo nombre del archivo contendrá el IV para poder descifrarlo sin consultar la BD
        const encryptedFilename = `${ivHex}-${file.filename}.enc`; 
        const encryptedFilePath = path.join(__dirname, '../uploads', encryptedFilename);

        // 2. Ciframos el archivo usando Streams
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        const input = fs.createReadStream(file.path);
        const output = fs.createWriteStream(encryptedFilePath);

        await new Promise((resolve, reject) => {
            input.pipe(cipher).pipe(output);
            output.on('finish', resolve);
            output.on('error', reject);
        });

        // 3. Borramos el archivo original sin cifrar
        await fsPromises.unlink(file.path);

        // 4. Guardamos la referencia en la Base de Datos
        const [rows] = await pool.query('SELECT attachments FROM documents WHERE id = ?', [id]);
        let attachments = typeof rows[0].attachments === 'string' ? JSON.parse(rows[0].attachments) : (rows[0].attachments || []);
        
        const newAttachment = { filename: encryptedFilename, originalname: file.originalname, size: file.size };
        attachments.push(newAttachment);

        await pool.query('UPDATE documents SET attachments = ? WHERE id = ?', [JSON.stringify(attachments), id]);
        await pool.query(
            `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) VALUES (?, 'documento', ?, 'Archivo Adjuntado (Cifrado)', ?, ?)`,
            [id, userId, file.originalname, getArgTime()]
        );

        res.json({ attachment: newAttachment });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al subir y cifrar el archivo' });
    }
};

// NUEVO: Eliminar archivo
exports.deleteAttachment = async (req, res) => {
    try {
        const { id, filename } = req.params;
        const userId = req.user.id;

        // OWASP A03: Prevenir path traversal
        if (!isValidFilename(filename)) {
            return res.status(400).json({ message: 'Nombre de archivo inválido.' });
        }

        const [rows] = await pool.query('SELECT attachments FROM documents WHERE id = ?', [id]);
        let attachments = typeof rows[0].attachments === 'string' ? JSON.parse(rows[0].attachments) : (rows[0].attachments || []);
        
        const fileToDelete = attachments.find(a => a.filename === filename);
        if (fileToDelete) {
            // Borramos el archivo físico del disco
            const filePath = path.join(__dirname, '../uploads', filename);
            // Verificar que la ruta resultante está dentro de uploads
            const uploadsDir = path.resolve(__dirname, '../uploads');
            const resolvedPath = path.resolve(filePath);
            if (!resolvedPath.startsWith(uploadsDir)) {
                return res.status(400).json({ message: 'Ruta de archivo inválida.' });
            }
            try { await fsPromises.unlink(filePath); } catch (e) { /* archivo ya no existe */ }
        }

        attachments = attachments.filter(a => a.filename !== filename);
        await pool.query('UPDATE documents SET attachments = ? WHERE id = ?', [JSON.stringify(attachments), id]);
        await pool.query(
            `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) VALUES (?, 'documento', ?, 'Archivo Eliminado', ?, ?)`,
            [id, userId, fileToDelete ? fileToDelete.originalname : filename, getArgTime()]
        );

        res.json({ message: 'Archivo eliminado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al eliminar el archivo' });
    }
};

// NUEVO: Descargar archivo Descifrando "On the Fly"
exports.downloadAttachment = async (req, res) => {
    try {
        const { filename } = req.params;
        const userId = req.user.id;

        // OWASP A03: Prevenir path traversal
        if (!isValidFilename(filename)) {
            return res.status(400).json({ message: 'Nombre de archivo inválido.' });
        }

        // 1. VALIDACIÓN DE AUTORIZACIÓN (OWASP A01 / BOLA):
        // Buscamos el documento al que pertenece este adjunto para evaluar la ACL
        const [docRows] = await pool.query(
            `SELECT id, creator_id, current_owner_id, owners, recipients, signatories, status, is_public, auth_areas, auth_users FROM documents WHERE JSON_CONTAINS(attachments, JSON_OBJECT('filename', ?)) LIMIT 1`,
            [filename]
        );

        if (docRows.length > 0) {
            const doc = docRows[0];
            const [userRows] = await pool.query('SELECT area_id, areas, role FROM users WHERE id = ?', [userId]);
            if (userRows.length === 0) {
                return res.status(404).json({ message: 'Usuario no encontrado.' });
            }
            const user = userRows[0];
            const userAreas = typeof user.areas === 'string' ? JSON.parse(user.areas) : (user.areas || [user.area_id]);
            const isAuditorOrAdmin = user.role === 'admin' || (await checkUserHasPermission(userId, 'audit_logs'));

            if (doc.is_public === 0) {
                const authAreas = typeof doc.auth_areas === 'string' ? JSON.parse(doc.auth_areas) : (doc.auth_areas || []);
                const authUsers = typeof doc.auth_users === 'string' ? JSON.parse(doc.auth_users) : (doc.auth_users || []);
                
                const hasDirectAccess = doc.creator_id === userId || doc.current_owner_id === userId;
                const isAreaOwner = userAreas.includes(doc.current_owner_id);
                const isUserAuth = authUsers.includes(userId);
                const isAreaAuth = userAreas.some(area => authAreas.includes(area));

                if (!hasDirectAccess && !isAreaOwner && !isUserAuth && !isAreaAuth && !isAuditorOrAdmin) {
                    return res.status(403).json({ message: 'Acceso denegado: Este documento es reservado.' });
                }
            } else {
                const owners = typeof doc.owners === 'string' ? JSON.parse(doc.owners) : (doc.owners || []);
                const recipients = typeof doc.recipients === 'string' ? JSON.parse(doc.recipients) : (doc.recipients || []);
                const signatories = typeof doc.signatories === 'string' ? JSON.parse(doc.signatories) : (doc.signatories || []);

                const hasDirectAccess = doc.creator_id === userId || doc.current_owner_id === userId;
                const isOwner = owners.includes(userId) || userAreas.some(area => owners.includes(area));
                const isRecipient = recipients.includes(userId) || userAreas.some(area => recipients.includes(area));
                const isPendingSignatory = signatories.includes(userId);

                if (!hasDirectAccess && !isOwner && !isRecipient && !isPendingSignatory && !isAuditorOrAdmin) {
                    return res.status(403).json({ message: 'Acceso denegado: No tiene permisos para descargar el anexo de este documento.' });
                }
            }
        }

        const filePath = path.join(__dirname, '../uploads', filename);
        
        // Verificar que la ruta resultante está dentro de uploads
        const uploadsDir = path.resolve(__dirname, '../uploads');
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(uploadsDir)) {
            return res.status(400).json({ message: 'Ruta de archivo inválida.' });
        }

        try {
            await fsPromises.access(filePath, fs.constants.R_OK);
        } catch {
            return res.status(404).json({ message: 'El archivo físico no existe en el servidor' });
        }

        // Registrar la descarga en el historial para métricas del dashboard
        try {
            if (docRows.length > 0) {
                await pool.query(
                    `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) VALUES (?, 'documento', ?, 'Descarga Adjunto', ?, ?)`,
                    [docRows[0].id, userId, filename.substring(33).replace('.enc', ''), getArgTime()]
                );
            }
        } catch (logErr) { console.error('Error registrando descarga:', logErr); }

        // Extraemos el IV que escondimos en el nombre del archivo
        const parts = filename.split('-');
        const ivHex = parts[0];

        // Compatibilidad hacia atrás: si no tiene el formato de IV (archivos viejos), lo mandamos directo
        if (ivHex.length !== 32) {
            return res.download(filePath); 
        }

        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        const input = fs.createReadStream(filePath);

        // Configuramos las cabeceras para que el navegador lo interprete como descarga binaria
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename.substring(33).replace('.enc', '')}"`);

        // Desciframos y enviamos directamente al cliente (Stream)
        input.pipe(decipher).pipe(res);

    } catch (error) {
        console.error("Error en descarga:", error);
        res.status(500).json({ message: 'Error al descifrar y procesar la descarga' });
    }
};

// Función auxiliar interna del controlador para validar permisos
async function checkUserHasPermission(userId, permissionName) {
    try {
        const [rows] = await pool.query(`
            SELECT p.id 
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id
            JOIN user_roles ur ON rp.role_id = ur.role_id
            WHERE ur.user_id = ? AND p.id = ?
        `, [userId, permissionName]);
        return rows.length > 0;
    } catch (e) {
        return false;
    }
}

// NUEVO: Eliminar Borrador y limpiar sus archivos adjuntos
exports.deleteDocument = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Buscamos el documento para ver si tiene adjuntos
        const [rows] = await pool.query('SELECT attachments, status FROM documents WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Documento no encontrado' });

        const doc = rows[0];

        // Medida de seguridad: Solo se pueden borrar físicamente los Borradores o Rechazados
        if (doc.status !== 'Borrador' && doc.status !== 'Rechazado') {
            return res.status(403).json({ message: 'No se puede eliminar un documento que ya está en circulación' });
        }

        // 2. Extraemos los adjuntos
        const attachments = typeof doc.attachments === 'string' ? JSON.parse(doc.attachments) : (doc.attachments || []);

        // 3. Iteramos y borramos cada archivo físico del disco duro
        for (const file of attachments) {
            const filePath = path.join(__dirname, '../uploads', file.filename);
            try { await fsPromises.unlink(filePath); } catch (e) { /* archivo ya no existe */ }
        }

        // 4. Eliminamos el documento y su historial de la Base de Datos
        await pool.query('DELETE FROM documents WHERE id = ?', [id]);
        await pool.query('DELETE FROM history WHERE item_id = ?', [id]);

        res.json({ message: 'Documento y archivos adjuntos eliminados correctamente' });
    } catch (error) {
        console.error("Error al eliminar documento:", error);
        res.status(500).json({ message: 'Error al eliminar el documento' });
    }
};

exports.cryptographicSign = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No se recibió el PDF crudo' });

        // req.file.buffer contiene el PDF generado por html2pdf en el frontend
        const signedBuffer = await signatureService.signPdfBuffer(req.file.buffer);

        // Configuramos las cabeceras para forzar la descarga del binario
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="documento_sellado.pdf"');
        
        res.send(signedBuffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno al aplicar firma criptográfica' });
    }
};

// NUEVO: Verificación pública de documentos mediante QR
exports.verifyPublicDoc = async (req, res) => {
    const { id } = req.params;
    
    try {
        const [rows] = await pool.query('SELECT * FROM documents WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Documento no encontrado o no existe.' });

        const doc = rows[0];

        // Permitimos verificar documentos Anulados, Firmados y Archivados
        if (doc.status !== 'Firmado' && doc.status !== 'Archivado' && doc.status !== 'Anulado') {
            return res.status(400).json({ message: 'El documento especificado aún se encuentra en trámite o no es válido para verificación pública.' });
        }

        // 1. Extraer el último firmante y su área de firma
        let signedBy = typeof doc.signed_by === 'string' ? JSON.parse(doc.signed_by) : (doc.signed_by || []);
        let lastSignerId = null;
        let signatureDate = doc.created_at;
        let signatureAreaId = null; // Variable para atrapar el área exacta
        
        if (signedBy && signedBy.length > 0) {
            const lastSigner = signedBy[signedBy.length - 1];
            lastSignerId = lastSigner.id;
            signatureDate = lastSigner.date;
            signatureAreaId = lastSigner.areaId || doc.area_id; // Área de firma o área del doc
        }

        // 2. Obtener Nombre y Área del Firmante
        let signerName = 'Sistema';
        let signerArea = 'Área Desconocida';
        if (lastSignerId) {
            const [uRows] = await pool.query('SELECT name, area_id FROM users WHERE id = ?', [lastSignerId]);
            if (uRows.length > 0) {
                signerName = uRows[0].name;
                // Si la firma tiene área la usamos, si no, usamos el área por defecto del usuario
                const finalAreaId = signatureAreaId || uRows[0].area_id; 
                const [aRows] = await pool.query('SELECT name FROM areas WHERE id = ?', [finalAreaId]);
                if (aRows.length > 0) signerArea = aRows[0].name;
            }
        }

        // 3. Obtener nombres de destinatarios (¡El bloque que faltaba!)
        let recipients = typeof doc.recipients === 'string' ? JSON.parse(doc.recipients) : (doc.recipients || []);
        let recipientsNames = [];
        for (let rId of recipients) {
            if (rId.startsWith('a')) {
                const [aRows] = await pool.query('SELECT name FROM areas WHERE id = ?', [rId]);
                if (aRows.length > 0) recipientsNames.push('Área: ' + aRows[0].name);
            } else {
                const [uRows] = await pool.query('SELECT name FROM users WHERE id = ?', [rId]);
                if (uRows.length > 0) recipientsNames.push(uRows[0].name);
            }
        }

        // Retornamos SOLO metadata, no enviamos el "content" del documento por seguridad.
        res.json({
            isValid: true,
            status: doc.status,
            number: doc.number,
            docType: doc.doc_type,
            subject: doc.subject,
            signatureDate: signatureDate,
            signerName: signerName,
            signerArea: signerArea,
            recipients: recipientsNames.join(' | ') || 'Ninguno',
            pdfHash: doc.pdf_hash
        });

    } catch (error) {
        console.error("Error en validación pública:", error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FUNCIÓN UNIFICADA: Desencripta adjuntos, Embebe, Firma, Hashea y Encripta el final
// Fase 4: La operación pesada se encola en BullMQ y se procesa en background
exports.signFinalAndSeal = async (req, res) => {
    const { id } = req.params;
    
    try {
        if (!req.file) return res.status(400).json({ message: 'No se recibió el PDF.' });
        
        const docData = JSON.parse(req.body.documentData);
        const historyEntry = JSON.parse(req.body.historyEntry);

        // Validar que el documento existe antes de encolar y verificar su privacidad
        const [checkRows] = await pool.query('SELECT id, is_public FROM documents WHERE id = ?', [id]);
        if (!checkRows || checkRows.length === 0) {
            try { await fsPromises.unlink(req.file.path); } catch (e) { /* */ }
            return res.status(404).json({ message: 'Documento no encontrado' });
        }

        const docObj = checkRows[0];
        if (docObj.is_public === 0) {
            // El documento es reservado, se requiere validación de 2FA
            const twoFactorCode = req.body.twoFactorCode;
            if (!twoFactorCode) {
                try { await fsPromises.unlink(req.file.path); } catch (e) { /* */ }
                return res.status(400).json({ message: 'Se requiere el código 2FA para firmar este documento reservado.' });
            }

            const [userRows] = await pool.query('SELECT two_factor_enabled, two_factor_secret FROM users WHERE id = ?', [req.user.id]);
            if (userRows.length === 0) {
                try { await fsPromises.unlink(req.file.path); } catch (e) { /* */ }
                return res.status(404).json({ message: 'Usuario no encontrado.' });
            }

            const userObj = userRows[0];
            if (userObj.two_factor_enabled !== 1 || !userObj.two_factor_secret) {
                try { await fsPromises.unlink(req.file.path); } catch (e) { /* */ }
                return res.status(400).json({ message: 'Debe configurar y activar 2FA en su cuenta para firmar documentos reservados.' });
            }

            const authController = require('./authController');
            const is2faValid = authController.verifyTOTP(String(twoFactorCode).trim(), userObj.two_factor_secret);
            if (!is2faValid) {
                try { await fsPromises.unlink(req.file.path); } catch (e) { /* */ }
                return res.status(401).json({ message: 'Código 2FA incorrecto.' });
            }
        }

        // Encolar el trabajo pesado en BullMQ (respuesta instantánea)
        const { signatureQueue } = require('../config/queues');
        const job = await signatureQueue.add('sign-seal', {
            documentId: id,
            tempFilePath: req.file.path,
            docData,
            historyEntry,
        });

        // HTTP 202 Accepted — el trabajo se procesa en background
        res.status(202).json({ 
            jobId: job.id, 
            message: 'Documento encolado para firma y sellado'
        });

    } catch (error) {
        console.error("Error al encolar firma:", error);
        if (req.file) { try { await fsPromises.unlink(req.file.path); } catch (e) { /* */ } }
        res.status(500).json({ message: error.message });
    }
};

// NUEVO: Asignar número oficial de forma atómica en el backend
exports.assignDocumentNumber = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await pool.query(
            'SELECT number, doc_type, area_id, status FROM documents WHERE id = ?',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Documento no encontrado' });
        }

        const doc = rows[0];

        // Si ya tiene número asignado, lo retornamos inmediatamente
        if (doc.number) {
            return res.json({ number: doc.number });
        }

        // Generamos el número atómico usando el numberingService
        const numberingService = require('../services/numberingService');
        const nextNumber = await numberingService.getNextNumber(doc.doc_type, doc.area_id || req.user.areaId);

        // Guardamos el número en la base de datos
        await pool.query(
            'UPDATE documents SET number = ? WHERE id = ?',
            [nextNumber, id]
        );

        res.json({ number: nextNumber });

    } catch (error) {
        console.error("Error al asignar número al documento:", error);
        res.status(500).json({ message: 'Error interno al asignar número al documento' });
    }
};

// NUEVO: Descarga estática del PDF encriptado
exports.downloadStaticPdf = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const [rows] = await pool.query('SELECT number, status FROM documents WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Documento no encontrado.' });
        
        const doc = rows[0];
        if (doc.status !== 'Firmado' && doc.status !== 'Archivado' && doc.status !== 'Anulado') {
            return res.status(400).json({ message: 'El documento no tiene un PDF sellado generado.' });
        }

        const securePath = path.join(__dirname, '../uploads/secure_docs', `${id}.enc`);
        
        // Desencriptamos al vuelo
        const decryptedPdf = await cryptoService.decryptAndRead(securePath);

        // Registrar la descarga en el historial para métricas del dashboard
        try {
            await pool.query(
                `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) VALUES (?, 'documento', ?, 'Descarga PDF', ?, ?)`,
                [id, userId, doc.number || 'S/N', getArgTime()]
            );
        } catch (logErr) { console.error('Error registrando descarga:', logErr); }

        // Enviamos el PDF directamente al navegador
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${doc.number}.pdf"`);
        res.send(decryptedPdf);

    } catch (error) {
        console.error("Error al descargar PDF estático:", error);
        res.status(500).json({ message: 'Error al recuperar el archivo seguro.' });
    }
};

// NUEVO: Abre el PDF crudo, le inyecta los archivos adjuntos como "Embedded Files" y lo devuelve
exports.embedAttachments = async (req, res) => {
    const { id } = req.params;

    try {
        if (!req.file) return res.status(400).json({ message: 'No se recibió el PDF crudo.' });

        // 1. Buscamos los adjuntos en la BD
        const [rows] = await pool.query('SELECT attachments FROM documents WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Documento no encontrado.' });
        
        let attachments = typeof rows[0].attachments === 'string' ? JSON.parse(rows[0].attachments) : (rows[0].attachments || []);

        const pdfBytes = await fsPromises.readFile(req.file.path);

        // Si no hay adjuntos, devolvemos el PDF intacto inmediatamente
        if (attachments.length === 0) {
            await fsPromises.unlink(req.file.path); // Limpiamos temp
            res.setHeader('Content-Type', 'application/pdf');
            return res.send(pdfBytes);
        }

        // 2. Cargamos el PDF con pdf-lib
        const pdfDoc = await PDFDocument.load(pdfBytes);

        // 3. Iteramos e inyectamos físicamente cada archivo
        for (let att of attachments) {
            const attPath = path.join(__dirname, '../uploads', att.filename); // Ajusta '../uploads' si tu carpeta real se llama distinto
            let exists = true;
            try { await fsPromises.access(attPath, fs.constants.R_OK); } catch { exists = false; }
            if (exists) {
                const fileBytes = await fsPromises.readFile(attPath);
                await pdfDoc.attach(fileBytes, att.originalname, {
                    mimeType: att.mimetype,
                    description: 'Anexo Oficial del Documento',
                    creationDate: new Date(),
                    modificationDate: new Date(),
                });
            }
        }

        // 4. Guardamos el nuevo PDF "Gordito" (Desactivamos ObjectStreams para compatibilidad con node-signpdf)
        const finalPdfBytes = await pdfDoc.save({ useObjectStreams: false });
        
        // Limpiamos el archivo temporal
        await fsPromises.unlink(req.file.path);

        res.setHeader('Content-Type', 'application/pdf');
        res.send(Buffer.from(finalPdfBytes));

    } catch (error) {
        console.error("Error al embeber adjuntos:", error);
        if (req.file) { try { await fsPromises.unlink(req.file.path); } catch (e) { /* */ } }
        res.status(500).json({ message: 'Error interno al inyectar anexos en el PDF.' });
    }
};

// Registrar confirmación de lectura silenciosa
exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id; 

        const [rows] = await pool.query('SELECT read_by FROM documents WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({message: 'Doc no encontrado'});

        let readBy = [];
        try {
            // Manejamos el caso de que la BD tenga basura o el array vacío como string
            readBy = typeof rows[0].read_by === 'string' ? JSON.parse(rows[0].read_by) : (rows[0].read_by || []);
        } catch (e) {
            readBy = [];
        }
        
        // Si el usuario aún no lo leyó, lo agregamos y guardamos de forma explícita
        if (!readBy.includes(userId)) {
            readBy.push(userId);
            // El JSON.stringify es crucial para MySQL
            await pool.query('UPDATE documents SET read_by = ? WHERE id = ?', [JSON.stringify(readBy), id]);
            console.log(`[Lectura] El usuario ${userId} leyó el doc ${id}`);
        }

        res.json({ message: 'Lectura registrada', readBy });
    } catch (error) {
        console.error("Error al marcar lectura:", error);
        res.status(500).json({ message: 'Error interno al registrar lectura' });
    }
};