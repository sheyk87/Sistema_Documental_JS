// controllers/docController.js
const pool = require('../config/db');

// 1. Guardar un nuevo documento
exports.createDocument = async (req, res) => {
    const { id, docType, subject, content, creatorId, currentOwnerId, owners, status, recipients } = req.body;

    // Convertimos los arreglos a formato texto JSON para MySQL
    const ownersJSON = JSON.stringify(owners || []);
    const recipientsJSON = JSON.stringify(recipients || []);

    try {
        // Insertamos el documento
        await pool.query(
            `INSERT INTO documents (id, doc_type, subject, content, creator_id, current_owner_id, status, owners, recipients, signed_by, related_docs) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]')`,
            [id, docType, subject, content, creatorId, currentOwnerId, status, ownersJSON, recipientsJSON]
        );

        // Insertamos el primer paso en el historial
        await pool.query(
            `INSERT INTO history (item_id, item_type, user_id, action, notes) 
             VALUES (?, 'documento', ?, 'Creación', 'Se generó borrador')`,
            [id, creatorId]
        );

        res.status(201).json({ message: 'Documento creado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al crear el documento' });
    }
};

// 2. Enviar todos los documentos al Frontend
exports.getAllDocuments = async (req, res) => {
    try {
        // Traemos todos los documentos
        const [docs] = await pool.query('SELECT * FROM documents');
        
        // Traemos todo el historial de los documentos
        const [history] = await pool.query("SELECT * FROM history WHERE item_type = 'documento' ORDER BY created_at ASC");

        // Formateamos los datos para que sean EXACTAMENTE iguales a como los espera tu Frontend
        const formattedDocs = docs.map(doc => {
            return {
                id: doc.id,
                type: 'documento',
                docType: doc.doc_type,
                subject: doc.subject,
                content: doc.content,
                creatorId: doc.creator_id,
                currentOwnerId: doc.current_owner_id,
                status: doc.status,
                number: doc.number,
                createdAt: doc.created_at,
                // Si MySQL devuelve texto, lo convertimos de vuelta a Arreglo de JS
                owners: typeof doc.owners === 'string' ? JSON.parse(doc.owners) : (doc.owners || []),
                recipients: typeof doc.recipients === 'string' ? JSON.parse(doc.recipients) : (doc.recipients || []),
                signedBy: typeof doc.signed_by === 'string' ? JSON.parse(doc.signed_by) : (doc.signed_by || []),
                relatedDocs: typeof doc.related_docs === 'string' ? JSON.parse(doc.related_docs) : (doc.related_docs || []),
                
                // Filtramos el historial que le pertenece solo a este documento
                history: history.filter(h => h.item_id === doc.id).map(h => ({
                    date: h.created_at,
                    userId: h.user_id,
                    action: h.action,
                    notes: h.notes
                }))
            };
        });

        res.json(formattedDocs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener los documentos' });
    }
};

// Actualizar un documento existente y agregar su historial
exports.updateDocument = async (req, res) => {
    const { item, historyEntry } = req.body;
    try {
        await pool.query(
            `UPDATE documents SET 
                subject = ?, content = ?, status = ?, current_owner_id = ?, 
                owners = ?, recipients = ?, signed_by = ?, related_docs = ?, number = ?
             WHERE id = ?`,
            [
                item.subject, item.content, item.status, item.currentOwnerId,
                JSON.stringify(item.owners || []), JSON.stringify(item.recipients || []), 
                JSON.stringify(item.signedBy || []), JSON.stringify(item.relatedDocs || []), 
                item.number, item.id
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