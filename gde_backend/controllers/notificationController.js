const pool = require('../config/db');

exports.createNotification = async (req, res) => {
    const { userIds, action, message, itemId, itemType } = req.body;
    const senderId = req.user.id;

    if (!userIds || userIds.length === 0) return res.status(400).json({ message: 'Sin destinatarios' });

    try {
        const expandedUserIds = new Set();
        
        // Expandimos las áreas a usuarios individuales
        for (let id of userIds) {
            if (id.startsWith('a')) {
                const [users] = await pool.query('SELECT id FROM users WHERE area_id = ? OR JSON_CONTAINS(areas, ?)', [id, `"${id}"`]);
                users.forEach(u => expandedUserIds.add(u.id));
            } else {
                expandedUserIds.add(id);
            }
        }

        // Evitamos auto-notificarnos
        expandedUserIds.delete(senderId);

        if (expandedUserIds.size === 0) return res.json({ message: 'Nadie a quien notificar' });

        const values = Array.from(expandedUserIds).map(uId => [uId, senderId, itemId, itemType, action, message]);
        
        await pool.query(
            `INSERT INTO notifications (user_id, sender_id, item_id, item_type, action, message) VALUES ?`,
            [values]
        );

        res.status(201).json({ message: 'Notificaciones enviadas' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al enviar notificaciones' });
    }
};

exports.getMyNotifications = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT n.*, u.name as sender_name 
             FROM notifications n 
             JOIN users u ON n.sender_id = u.id 
             WHERE n.user_id = ? 
             ORDER BY n.created_at DESC LIMIT 50`,
            [req.user.id]
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener notificaciones' });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        res.json({ message: 'Marcada como leída' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar notificación' });
    }
};

exports.markAllRead = async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.user.id]);
        res.json({ message: 'Todas marcadas como leídas' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error' });
    }
};

exports.deleteAllMyNotifications = async (req, res) => {
    try {
        await pool.query('DELETE FROM notifications WHERE user_id = ?', [req.user.id]);
        res.json({ message: 'Notificaciones eliminadas' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al eliminar notificaciones' });
    }
};