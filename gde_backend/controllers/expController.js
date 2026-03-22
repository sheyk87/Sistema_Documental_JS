// controllers/expController.js
const pool = require('../config/db');

// 1. Guardar un nuevo expediente
exports.createExpediente = async (req, res) => {
    const { id, number, subject, creatorId, currentOwnerId, status, isPublic, authAreas, authUsers } = req.body;

    try {
        await pool.query(
            `INSERT INTO expedientes (id, number, subject, creator_id, current_owner_id, status, is_public, auth_areas, auth_users, linked_docs, sealed_docs) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]')`,
            [
                id, number, subject, creatorId, currentOwnerId, status, 
                isPublic ? 1 : 0, // MySQL guarda los booleanos como 1 (true) o 0 (false)
                JSON.stringify(authAreas || []), 
                JSON.stringify(authUsers || [])
            ]
        );

        // Guardamos el primer movimiento en el historial
        await pool.query(
            `INSERT INTO history (item_id, item_type, user_id, action, notes) 
             VALUES (?, 'expediente', ?, 'Apertura', 'Expediente inicializado')`,
            [id, creatorId]
        );

        res.status(201).json({ message: 'Expediente creado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al crear el expediente' });
    }
};

// 2. Traer todos los expedientes para el Frontend
exports.getAllExpedientes = async (req, res) => {
    try {
        const [exps] = await pool.query('SELECT * FROM expedientes');
        const [history] = await pool.query("SELECT * FROM history WHERE item_type = 'expediente' ORDER BY created_at ASC");

        const formattedExps = exps.map(e => {
            return {
                id: e.id,
                type: 'expediente',
                number: e.number,
                subject: e.subject,
                creatorId: e.creator_id,
                currentOwnerId: e.current_owner_id,
                status: e.status,
                isPublic: e.is_public === 1,
                createdAt: e.created_at,
                // Parseamos los JSON de MySQL a Arreglos de JavaScript
                authAreas: typeof e.auth_areas === 'string' ? JSON.parse(e.auth_areas) : (e.auth_areas || []),
                authUsers: typeof e.auth_users === 'string' ? JSON.parse(e.auth_users) : (e.auth_users || []),
                linkedDocs: typeof e.linked_docs === 'string' ? JSON.parse(e.linked_docs) : (e.linked_docs || []),
                sealedDocs: typeof e.sealed_docs === 'string' ? JSON.parse(e.sealed_docs) : (e.sealed_docs || []),
                
                history: history.filter(h => h.item_id === e.id).map(h => ({
                    date: h.created_at,
                    userId: h.user_id,
                    action: h.action,
                    notes: h.notes
                }))
            };
        });

        res.json(formattedExps);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener expedientes' });
    }
};

// Actualizar un expediente existente y agregar su historial
exports.updateExpediente = async (req, res) => {
    const { item, historyEntry } = req.body;
    try {
        await pool.query(
            `UPDATE expedientes SET 
                current_owner_id = ?, status = ?, auth_areas = ?, auth_users = ?, 
                linked_docs = ?, sealed_docs = ?
             WHERE id = ?`,
            [
                item.currentOwnerId, item.status, 
                JSON.stringify(item.authAreas || []), JSON.stringify(item.authUsers || []), 
                JSON.stringify(item.linkedDocs || []), JSON.stringify(item.sealedDocs || []), 
                item.id
            ]
        );

        if (historyEntry) {
            await pool.query(
                `INSERT INTO history (item_id, item_type, user_id, action, notes) VALUES (?, 'expediente', ?, ?, ?)`,
                [item.id, historyEntry.userId, historyEntry.action, historyEntry.notes]
            );
        }

        res.json({ message: 'Expediente actualizado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar el expediente' });
    }
};