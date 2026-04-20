const pool = require('../config/db');
const emailService = require('../services/emailService');

exports.createNotification = async (req, res) => {
    const { userIds, action, message, itemId, itemType } = req.body;
    const senderId = req.user.id;

    if (!userIds || userIds.length === 0) return res.status(400).json({ message: 'Sin destinatarios' });

    try {
        const expandedUserIds = new Set();
        
        for (let id of userIds) {
            if (id.startsWith('a')) {
                const [users] = await pool.query('SELECT id FROM users WHERE area_id = ? OR JSON_CONTAINS(areas, ?)', [id, `"${id}"`]);
                users.forEach(u => expandedUserIds.add(u.id));
            } else {
                expandedUserIds.add(id);
            }
        }

        expandedUserIds.delete(senderId); 
        if (expandedUserIds.size === 0) return res.json({ message: 'Nadie a quien notificar' });

        const userIdsArray = Array.from(expandedUserIds);

        // --- NUEVO: OBTENER PREFERENCIAS DE LOS USUARIOS ---
        const [usersConfigs] = await pool.query(
            'SELECT id, email, name, web_notifications, email_notifications FROM users WHERE id IN (?)', 
            [userIdsArray]
        );

        const webValues = [];
        const emailRecipients = [];

        usersConfigs.forEach(u => {
            // 1 para MySQL significa TRUE (Activado)
            if (u.web_notifications !== 0) {
                webValues.push([u.id, senderId, itemId, itemType, action, message]);
            }
            if (u.email_notifications !== 0) {
                emailRecipients.push(u);
            }
        });

        // 1. Guardar notificaciones web SOLO a quienes las tienen activadas
        if (webValues.length > 0) {
            await pool.query(
                `INSERT INTO notifications (user_id, sender_id, item_id, item_type, action, message) VALUES ?`,
                [webValues]
            );
        }

        // 2. Disparar correos SOLO a quienes los tienen activados
        if (process.env.EMAIL_ENABLED === 'true' && emailRecipients.length > 0) {
            emailRecipients.forEach(u => {
                const mailSubject = `GDE - Notificación: ${action}`;
                const mailHtml = `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 600px;">
                        <h2 style="color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">Sistema GDE</h2>
                        <p style="font-size: 16px; color: #334155;">Hola <strong>${u.name}</strong>,</p>
                        <p style="font-size: 16px; color: #334155;">Tienes una nueva notificación en el sistema:</p>
                        <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0;">
                            <p style="margin: 0; font-weight: bold; color: #1e293b;">Acción: ${action}</p>
                            <p style="margin: 5px 0 0 0; color: #475569;">${message}</p>
                        </div>
                    </div>
                `;
                emailService.sendMail(u.email, mailSubject, message, mailHtml);
            });
        }

        res.status(201).json({ message: 'Notificaciones procesadas' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al procesar notificaciones' });
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