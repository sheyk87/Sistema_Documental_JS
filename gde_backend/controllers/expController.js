// controllers/expController.js
const pool = require('../config/db');

// Función blindada: Obtiene la hora del servidor forzada a Argentina
const getArgTime = () => {
    const d = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Argentina/Buenos_Aires"}));
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// 1. Guardar un nuevo expediente
exports.createExpediente = async (req, res) => {
    const { id, number, subject, creatorId, currentOwnerId, status, isPublic, authAreas, authUsers, areaId } = req.body;

    try {
        const serverTime = getArgTime();

        await pool.query(
            `INSERT INTO expedientes (id, number, subject, creator_id, current_owner_id, status, is_public, auth_areas, auth_users, linked_docs, sealed_docs, created_at, area_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?)`,
            [
                id, number, subject, creatorId, currentOwnerId, status, 
                isPublic ? 1 : 0, 
                JSON.stringify(authAreas || []), 
                JSON.stringify(authUsers || []),
                serverTime, areaId
            ]
        );

        await pool.query(
            `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) 
             VALUES (?, 'expediente', ?, 'Apertura', 'Expediente inicializado', ?)`,
            [id, creatorId, serverTime]
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
                areaId: e.area_id,
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
                linked_docs = ?, sealed_docs = ?, area_id = ?
             WHERE id = ?`,
            [
                item.currentOwnerId, item.status, 
                JSON.stringify(item.authAreas || []), JSON.stringify(item.authUsers || []), 
                JSON.stringify(item.linkedDocs || []), JSON.stringify(item.sealedDocs || []), 
                item.areaId, item.id
            ]
        );

        if (historyEntry) {
            await pool.query(
                `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) VALUES (?, 'expediente', ?, ?, ?, ?)`,
                [item.id, historyEntry.userId, historyEntry.action, historyEntry.notes, getArgTime()]
            );
        }

        res.json({ message: 'Expediente actualizado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar el expediente' });
    }
};