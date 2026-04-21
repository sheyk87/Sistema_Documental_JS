const pool = require('../config/db');
const bcrypt = require('bcrypt');
const emailService = require('../services/emailService');

exports.createUser = async (req, res) => {
    const { id, name, email, password, areaId, role, areas } = req.body; // <-- Agregar areas
    try {
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
            `INSERT INTO users (id, name, email, password, area_id, role, areas) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, name, email, hash, areaId, role, JSON.stringify(areas || [areaId])] // <-- Guardar JSON
        );
        res.status(201).json({ message: 'Usuario creado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al crear usuario' });
    }
};

exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, email, password, areaId, role, areas, twoFactorEnabled } = req.body;
    
    try {
        const is2FAEnabled = twoFactorEnabled ? 1 : 0;
        
        // 1. Obtenemos datos actuales para comparar los cambios
        const [oldRows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
        const old = oldRows[0];
        if (!old) return res.status(404).json({ message: 'Usuario no encontrado' });

        const secretQuery = is2FAEnabled === 0 ? ", two_factor_secret = NULL, two_factor_recovery_codes = NULL" : "";

        // 2. Ejecutar la actualización en BD
        if (password && password.trim() !== '') {
            const hash = await bcrypt.hash(password, 10);
            await pool.query(
                `UPDATE users SET name = ?, email = ?, password = ?, area_id = ?, role = ?, areas = ?, two_factor_enabled = ?${secretQuery} WHERE id = ?`,
                [name, email, hash, areaId, role, JSON.stringify(areas || [areaId]), is2FAEnabled, id]
            );
        } else {
            await pool.query(
                `UPDATE users SET name = ?, email = ?, area_id = ?, role = ?, areas = ?, two_factor_enabled = ?${secretQuery} WHERE id = ?`,
                [name, email, areaId, role, JSON.stringify(areas || [areaId]), is2FAEnabled, id]
            );
        }

        // 3. Notificaciones Dinámicas por Correo
        if (process.env.EMAIL_ENABLED === 'true') {
            let changes = [];
            if (old.name !== name) changes.push(`<li>Nombre actualizado a: <strong>${name}</strong></li>`);
            if (old.email !== email) changes.push(`<li>Correo actualizado a: <strong>${email}</strong></li>`);
            if (old.role !== role) changes.push(`<li>Nivel de acceso (Rol) modificado a: <strong>${role.toUpperCase()}</strong></li>`);
            if (password && password.trim() !== '') changes.push(`<li>Se ha establecido una <strong>nueva contraseña</strong> para su cuenta.</li>`);
            
            // Enviamos el resumen de cambios si hubo alguno
            if (changes.length > 0) {
                const mailSubject = 'GDE - Actualizacion de datos de su cuenta';
                const mailHtml = `
                    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px;">
                        <h2 style="color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">Informacion de Perfil Actualizada</h2>
                        <p style="color: #334155;">Un administrador ha realizado los siguientes cambios en su perfil:</p>
                        <ul style="color: #334155; line-height: 1.6;">${changes.join('')}</ul>
                        <p style="color: #64748b; font-size: 12px; margin-top: 20px;">Si considera que esto es un error, por favor contacte a su administrador de sistemas.</p>
                    </div>`;
                emailService.sendMail(email, mailSubject, 'Perfil Actualizado', mailHtml); // Se envía al correo nuevo
            }

            // Alerta de seguridad severa si le quitan el 2FA
            if (old.two_factor_enabled === 1 && is2FAEnabled === 0) {
                const alertHtml = `
                    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #f87171; border-radius: 8px; background: #fef2f2;">
                        <h2 style="color: #b91c1c; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">Seguridad 2FA Desactivada</h2>
                        <p style="color: #7f1d1d;">Un administrador del sistema ha <strong>desactivado</strong> la Autenticacion de Dos Factores (2FA) para su cuenta.</p>
                        <p style="color: #7f1d1d;">Sus codigos de recuperacion y su vinculacion con la aplicacion autenticadora han sido eliminados del servidor.</p>
                        <p style="color: #991b1b; font-size: 13px; margin-top: 20px;">Si usted no solicito esta accion a la administracion, su cuenta esta operando con seguridad reducida.</p>
                    </div>`;
                emailService.sendMail(email, 'GDE - ALERTA: Seguridad 2FA Desactivada', 'Seguridad Reducida', alertHtml);
            }
        }

        res.json({ message: 'Usuario actualizado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar usuario' });
    }
};

exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query(`DELETE FROM users WHERE id = ?`, [id]);
        res.json({ message: 'Usuario eliminado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al eliminar usuario' });
    }
};

exports.bulkCreateUsers = async (req, res) => {
    const { users } = req.body;
    if (!users || !users.length) return res.status(400).json({ message: 'No hay datos válidos' });
    
    try {
        for (let u of users) {
            const hash = await bcrypt.hash(u.password || '123', 10);
            const uid = `u${Date.now()}${Math.floor(Math.random() * 1000)}`;
            const role = u.role || 'user';
            const areasArray = u.areas ? u.areas.split('-').map(x => x.trim()) : [u.areaId];
            
            await pool.query(
                `INSERT IGNORE INTO users (id, name, email, password, area_id, role, areas) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [uid, u.name, u.email, hash, u.areaId, role, JSON.stringify(areasArray)]
            );
        }
        res.status(201).json({ message: 'Usuarios importados exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en la importación masiva de usuarios' });
    }
};

exports.getMe = async (req, res) => {
    try {
        // req.user.id viene del authMiddleware (el token decodificado)
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });

        let user = rows[0];
        delete user.password;
        
        // Parseamos las áreas igual que en el login
        user.areas = typeof user.areas === 'string' ? JSON.parse(user.areas) : (user.areas || [user.area_id]);
        user.areaId = user.area_id; 

        res.json({ user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al recuperar la sesión' });
    }
};

exports.updateProfile = async (req, res) => {
    const { email, newPassword, webNotifications, emailNotifications } = req.body;
    const userId = req.user.id;

    try {
        if (newPassword && newPassword.trim() !== '') {
            const hash = await bcrypt.hash(newPassword, 10);
            await pool.query(
                'UPDATE users SET email = ?, password = ?, web_notifications = ?, email_notifications = ? WHERE id = ?',
                [email, hash, webNotifications ? 1 : 0, emailNotifications ? 1 : 0, userId]
            );

            // === NUEVO: Notificación de Cambio de Clave desde Perfil ===
            if (process.env.EMAIL_ENABLED === 'true') {
                const mailSubject = 'GDE - Cambio de Contraseña de Perfil';
                const mailHtml = `
                    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px;">
                        <h2 style="color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;">Contraseña Actualizada</h2>
                        <p style="color: #334155;">La contraseña de su perfil en el Sistema GDE ha sido modificada desde el panel de configuracion.</p>
                        <p style="color: #dc2626; font-size: 12px; font-weight: bold; margin-top: 20px;">Si usted no realizo este cambio, su cuenta puede estar comprometida.</p>
                    </div>
                `;
                emailService.sendMail(email, mailSubject, 'Contraseña Cambiada', mailHtml);
            }
        } else {
            // Actualización sin cambiar clave
            await pool.query(
                'UPDATE users SET email = ?, web_notifications = ?, email_notifications = ? WHERE id = ?',
                [email, webNotifications ? 1 : 0, emailNotifications ? 1 : 0, userId]
            );
        }
        res.json({ message: 'Perfil actualizado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar el perfil' });
    }
};