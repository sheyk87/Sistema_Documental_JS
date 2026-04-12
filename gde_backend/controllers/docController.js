const pool = require('../config/db');
const fs = require('fs');
const path = require('path');

exports.createDocument = async (req, res) => {
    const { id, docType, subject, content, creatorId, currentOwnerId, owners, status, recipients } = req.body;
    try {
        await pool.query(
            `INSERT INTO documents (id, doc_type, subject, content, creator_id, current_owner_id, status, owners, recipients, signed_by, related_docs, signatories, attachments) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', '[]')`,
            [id, docType, subject, content, creatorId, currentOwnerId, status, JSON.stringify(owners||[]), JSON.stringify(recipients||[])]
        );
        await pool.query(
            `INSERT INTO history (item_id, item_type, user_id, action, notes) VALUES (?, 'documento', ?, 'Creación', 'Se generó borrador')`,
            [id, creatorId]
        );
        res.status(201).json({ message: 'Documento creado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al crear el documento' });
    }
};

exports.getAllDocuments = async (req, res) => {
    try {
        const [docs] = await pool.query('SELECT * FROM documents');
        const [history] = await pool.query("SELECT * FROM history WHERE item_type = 'documento' ORDER BY created_at ASC");
        
        const formattedDocs = docs.map(doc => {
            return {
                id: doc.id, type: 'documento', docType: doc.doc_type, subject: doc.subject, content: doc.content,
                creatorId: doc.creator_id, currentOwnerId: doc.current_owner_id, status: doc.status, number: doc.number, createdAt: doc.created_at,
                owners: typeof doc.owners === 'string' ? JSON.parse(doc.owners) : (doc.owners || []),
                recipients: typeof doc.recipients === 'string' ? JSON.parse(doc.recipients) : (doc.recipients || []),
                signedBy: typeof doc.signed_by === 'string' ? JSON.parse(doc.signed_by) : (doc.signed_by || []),
                relatedDocs: typeof doc.related_docs === 'string' ? JSON.parse(doc.related_docs) : (doc.related_docs || []),
                signatories: typeof doc.signatories === 'string' ? JSON.parse(doc.signatories) : (doc.signatories || []),
                attachments: typeof doc.attachments === 'string' ? JSON.parse(doc.attachments) : (doc.attachments || []), // <-- NUEVO
                history: history.filter(h => h.item_id === doc.id).map(h => ({
                    date: h.created_at, userId: h.user_id, action: h.action, notes: h.notes
                }))
            };
        });
        res.json(formattedDocs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener los documentos' });
    }
};

exports.updateDocument = async (req, res) => {
    const { item, historyEntry } = req.body;
    try {
        // Quitamos la columna 'attachments' de esta consulta para evitar 
        // que el frontend sobrescriba los cambios hechos por upload/delete
        await pool.query(
            `UPDATE documents SET 
                subject = ?, content = ?, status = ?, current_owner_id = ?, 
                owners = ?, recipients = ?, signed_by = ?, related_docs = ?, signatories = ?, number = ?
             WHERE id = ?`,
            [
                item.subject, item.content, item.status, item.currentOwnerId,
                JSON.stringify(item.owners || []), JSON.stringify(item.recipients || []), 
                JSON.stringify(item.signedBy || []), JSON.stringify(item.relatedDocs || []), 
                JSON.stringify(item.signatories || []), item.number, item.id
            ]
        );

        if (historyEntry) {
            await pool.query(
                `INSERT INTO history (item_id, item_type, user_id, action, notes) VALUES (?, 'documento', ?, ?, ?)`,
                [item.id, historyEntry.userId, historyEntry.action, historyEntry.notes]
            );
        }

        res.json({ message: 'Documento actualizado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar el documento' });
    }
};

// NUEVO: Subir archivo
exports.uploadAttachment = async (req, res) => {
    try {
        const { id } = req.params;
        const file = req.file;
        const userId = req.user.id; // Viene del token

        if (!file) return res.status(400).json({ message: 'No se subió ningún archivo' });

        const [rows] = await pool.query('SELECT attachments FROM documents WHERE id = ?', [id]);
        let attachments = typeof rows[0].attachments === 'string' ? JSON.parse(rows[0].attachments) : (rows[0].attachments || []);
        
        const newAttachment = { filename: file.filename, originalname: file.originalname, size: file.size };
        attachments.push(newAttachment);

        await pool.query('UPDATE documents SET attachments = ? WHERE id = ?', [JSON.stringify(attachments), id]);
        await pool.query(
            `INSERT INTO history (item_id, item_type, user_id, action, notes) VALUES (?, 'documento', ?, 'Archivo Adjuntado', ?)`,
            [id, userId, file.originalname]
        );

        res.json({ attachment: newAttachment });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al subir el archivo' });
    }
};

// NUEVO: Eliminar archivo
exports.deleteAttachment = async (req, res) => {
    try {
        const { id, filename } = req.params;
        const userId = req.user.id;

        const [rows] = await pool.query('SELECT attachments FROM documents WHERE id = ?', [id]);
        let attachments = typeof rows[0].attachments === 'string' ? JSON.parse(rows[0].attachments) : (rows[0].attachments || []);
        
        const fileToDelete = attachments.find(a => a.filename === filename);
        if (fileToDelete) {
            // Borramos el archivo físico del disco
            const filePath = path.join(__dirname, '../uploads', filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        attachments = attachments.filter(a => a.filename !== filename);
        await pool.query('UPDATE documents SET attachments = ? WHERE id = ?', [JSON.stringify(attachments), id]);
        await pool.query(
            `INSERT INTO history (item_id, item_type, user_id, action, notes) VALUES (?, 'documento', ?, 'Archivo Eliminado', ?)`,
            [id, userId, fileToDelete ? fileToDelete.originalname : filename]
        );

        res.json({ message: 'Archivo eliminado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al eliminar el archivo' });
    }
};

// NUEVO: Descargar archivo protegiendo con Token
exports.downloadAttachment = async (req, res) => {
    try {
        const { filename } = req.params;
        // El usuario está verificado porque pasó por el authMiddleware
        const filePath = path.join(__dirname, '../uploads', filename);
        
        if (fs.existsSync(filePath)) {
            // res.download envía el archivo físico al navegador del usuario
            res.download(filePath);
        } else {
            res.status(404).json({ message: 'El archivo físico no existe en el servidor' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al procesar la descarga' });
    }
};