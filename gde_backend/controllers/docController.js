const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // <-- NUEVO
const ENCRYPTION_KEY = process.env.FILE_SECRET || 'unaclavesupersecretaexactamented'; // 32 bytes
const signatureService = require('../services/signatureService');

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

// NUEVO: Subir archivo y Cifrarlo en el Servidor
exports.uploadAttachment = async (req, res) => {
    try {
        const { id } = req.params;
        const file = req.file;
        const userId = req.user.id; 

        if (!file) return res.status(400).json({ message: 'No se subió ningún archivo' });

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
        fs.unlinkSync(file.path);

        // 4. Guardamos la referencia en la Base de Datos
        const [rows] = await pool.query('SELECT attachments FROM documents WHERE id = ?', [id]);
        let attachments = typeof rows[0].attachments === 'string' ? JSON.parse(rows[0].attachments) : (rows[0].attachments || []);
        
        const newAttachment = { filename: encryptedFilename, originalname: file.originalname, size: file.size };
        attachments.push(newAttachment);

        await pool.query('UPDATE documents SET attachments = ? WHERE id = ?', [JSON.stringify(attachments), id]);
        await pool.query(
            `INSERT INTO history (item_id, item_type, user_id, action, notes) VALUES (?, 'documento', ?, 'Archivo Adjuntado (Cifrado)', ?)`,
            [id, userId, file.originalname]
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

// NUEVO: Descargar archivo Descifrando "On the Fly"
exports.downloadAttachment = async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, '../uploads', filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'El archivo físico no existe en el servidor' });
        }

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
        attachments.forEach(file => {
            const filePath = path.join(__dirname, '../uploads', file.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath); // Elimina el archivo
            }
        });

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
        const signedBuffer = signatureService.signPdfBuffer(req.file.buffer);

        // Configuramos las cabeceras para forzar la descarga del binario
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="documento_sellado.pdf"');
        
        res.send(signedBuffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno al aplicar firma criptográfica' });
    }
};