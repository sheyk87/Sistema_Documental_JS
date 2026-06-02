// controllers/licenceController.js
// Controlador para la gestión de licencias y delegación administrativa (Fase 3).
// Previene bucles infinitos por delegación cruzada y realiza notificaciones en cascada (campana y email).

const pool = require('../config/db');
const emailService = require('../services/emailService');
const { logAdminAction, logSecurityError } = require('../utils/logger');

// Configurar o limpiar licencia/ausencia
exports.updateLicence = async (req, res) => {
    // Si viene targetUserId, requiere privilegios de administrador.
    // De lo contrario, se autogestiona el propio usuario autenticado.
    const { licenceStart, licenceEnd, delegatedTo, targetUserId, notes } = req.body;
    const isSelfService = !targetUserId;
    const userId = isSelfService ? req.user.id : targetUserId;

    if (!isSelfService && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Acceso denegado. Se requieren privilegios de administrador.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Obtener los datos del usuario A (titular de la licencia) y su delegado actual anterior
        const [userARows] = await connection.query('SELECT name, email, delegated_to FROM users WHERE id = ?', [userId]);
        if (userARows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        const userA = userARows[0];
        const oldDelegatedTo = userA.delegated_to;

        // 2. Si se está asignando un delegado, realizar validaciones
        if (delegatedTo) {
            if (delegatedTo === userId) {
                await connection.rollback();
                return res.status(400).json({ message: 'No puedes designarte a ti mismo como delegado.' });
            }

            // A. Verificar existencia del delegado B
            const [userBRows] = await connection.query('SELECT name, email, delegated_to FROM users WHERE id = ?', [delegatedTo]);
            if (userBRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({ message: 'El usuario delegado no existe.' });
            }
            const userB = userBRows[0];

            // B. VALIDAR DELEGACIÓN CRUZADA:
            // "si un usuario A designa al usuario B como delegado, el usuario B ya no puede asignar al usuario A"
            // Por ende, si B ya tiene asignado a A en su columna "delegated_to", bloqueamos la operación.
            if (userB.delegated_to === userId) {
                await connection.rollback();
                return res.status(400).json({ 
                    message: `Delegación cruzada prohibida: El usuario de destino (${userB.name}) ya te tiene configurado a ti (${userA.name}) como su delegado activo.` 
                });
            }

            // Formatear datetimes de ISO-8601 a YYYY-MM-DD HH:MM:SS para compatibilidad estricta con MySQL
            const formattedStart = licenceStart ? licenceStart.replace('T', ' ').substring(0, 19) : null;
            const formattedEnd = licenceEnd ? licenceEnd.replace('T', ' ').substring(0, 19) : null;

            // 3. Ejecutar la actualización en BD
            await connection.query(
                'UPDATE users SET licence_start = ?, licence_end = ?, delegated_to = ? WHERE id = ?',
                [formattedStart, formattedEnd, delegatedTo, userId]
            );

            // 4. Procesar Notificaciones y Envíos de Correo
            const webNotifAction = 'licence_assigned';
            const itemType = 'documento'; // Enlazar a tabla de notificaciones existente

            if (isSelfService) {
                // Caso A: Autogestión (Usuario A delegando en B)
                // Notificar campanita a B (el delegado)
                const notifMsgB = `El usuario ${userA.name} te ha designado como su delegado administrativo debido a licencia/ausencia.${notes ? ` Nota: "${notes}"` : ''}`;
                await connection.query(`
                    INSERT INTO notifications (user_id, sender_id, item_id, item_type, action, message)
                    VALUES (?, ?, 'licence', ?, ?, ?)
                `, [delegatedTo, userId, itemType, webNotifAction, notifMsgB]);

                // Enviar correo a B si SMTP y notificaciones de email están activas
                if (process.env.EMAIL_ENABLED === 'true') {
                    const mailSubject = 'GDE - Has sido designado como Delegado Administrativo';
                    const mailHtml = `
                        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px;">
                            <h2 style="color: #3b82f6; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">Designación de Delegado</h2>
                            <p style="color: #334155;">Hola <strong>${userB.name}</strong>,</p>
                            <p style="color: #334155;">El usuario <strong>${userA.name}</strong> te ha designado como su **delegado administrativo** para gestionar su bandeja de tareas durante su período de licencia/ausencia:</p>
                            <ul style="color: #334155; line-height: 1.6;">
                                <li><strong>Inicio de Licencia:</strong> ${new Date(licenceStart).toLocaleString()}</li>
                                <li><strong>Fin de Licencia:</strong> ${new Date(licenceEnd).toLocaleString()}</li>
                            </ul>
                            ${notes ? `<p style="color: #475569; background-color: #f8fafc; padding: 12px; border-left: 4px solid #cbd5e1; font-style: italic; margin-top: 15px;">Nota del usuario: "${notes}"</p>` : ''}
                            <p style="color: #64748b; font-size: 12px; margin-top: 20px;">Todos los documentos y expedientes derivados a ${userA.name} ingresarán automáticamente a tu bandeja de entrada.</p>
                        </div>`;
                    emailService.sendMail(userB.email, mailSubject, 'Delegación de Licencia', mailHtml);
                }
            } else {
                // Caso B: Asignación por Administrador
                // Campanita al titular A
                const notifMsgA = `Un administrador del sistema ha configurado tu licencia/ausencia, delegando tu bandeja a ${userB.name}.`;
                await connection.query(`
                    INSERT INTO notifications (user_id, sender_id, item_id, item_type, action, message)
                    VALUES (?, ?, 'licence', ?, ?, ?)
                `, [userId, req.user.id, itemType, webNotifAction, notifMsgA]);

                // Campanita al delegado B
                const notifMsgB = `Un administrador te ha designado como delegado administrativo de ${userA.name} durante su ausencia.${notes ? ` Nota: "${notes}"` : ''}`;
                await connection.query(`
                    INSERT INTO notifications (user_id, sender_id, item_id, item_type, action, message)
                    VALUES (?, ?, 'licence', ?, ?, ?)
                `, [delegatedTo, req.user.id, itemType, webNotifAction, notifMsgB]);

                // Enviar correos a A y B si SMTP está activo
                if (process.env.EMAIL_ENABLED === 'true') {
                    // Correo al titular A
                    const mailSubjectA = 'GDE - Licencia Administrativa Configurada por Administrador';
                    const mailHtmlA = `
                        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #10b981; border-radius: 8px;">
                            <h2 style="color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px;">Licencia Registrada por Administrador</h2>
                            <p style="color: #334155;">Hola <strong>${userA.name}</strong>,</p>
                            <p style="color: #334155;">Un administrador de sistemas ha configurado tu **licencia/ausencia** en la plataforma, designando como delegado a <strong>${userB.name}</strong>:</p>
                            <ul style="color: #334155; line-height: 1.6;">
                                <li><strong>Desde:</strong> ${new Date(licenceStart).toLocaleString()}</li>
                                <li><strong>Hasta:</strong> ${new Date(licenceEnd).toLocaleString()}</li>
                                <li><strong>Delegado:</strong> ${userB.name}</li>
                            </ul>
                            ${notes ? `<p style="color: #475569; background-color: #f8fafc; padding: 12px; border-left: 4px solid #cbd5e1; font-style: italic; margin-top: 15px;">Nota de administración: "${notes}"</p>` : ''}
                            <p style="color: #64748b; font-size: 12px; margin-top: 20px;">Durante este rango de fechas, los documentos dirigidos a tu bandeja se desviarán a tu delegado.</p>
                        </div>`;
                    emailService.sendMail(userA.email, mailSubjectA, 'Licencia Registrada', mailHtmlA);

                    // Correo al delegado B
                    const mailSubjectB = 'GDE - Designación de Delegado por el Administrador';
                    const mailHtmlB = `
                        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #3b82f6; border-radius: 8px;">
                            <h2 style="color: #3b82f6; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">Designación de Delegación por Administrador</h2>
                            <p style="color: #334155;">Hola <strong>${userB.name}</strong>,</p>
                            <p style="color: #334155;">El administrador de sistemas te ha designado como **delegado administrativo** de <strong>${userA.name}</strong> para el período comprendido entre:</p>
                            <ul style="color: #334155; line-height: 1.6;">
                                <li><strong>Inicio:</strong> ${new Date(licenceStart).toLocaleString()}</li>
                                <li><strong>Fin:</strong> ${new Date(licenceEnd).toLocaleString()}</li>
                            </ul>
                            ${notes ? `<p style="color: #475569; background-color: #f8fafc; padding: 12px; border-left: 4px solid #cbd5e1; font-style: italic; margin-top: 15px;">Nota de administración: "${notes}"</p>` : ''}
                        </div>`;
                    emailService.sendMail(userB.email, mailSubjectB, 'Designación de Delegación', mailHtmlB);
                }
            }

            logAdminAction('LICENCE_UPDATED', { userId, delegatedTo, by: req.user?.id });
        } else {
            // Caso C: Limpieza de Licencia (Retorno de licencia o cancelación)
            // Primero, si había un delegado anterior, le notificamos la desactivación.
            if (oldDelegatedTo) {
                const [userBRows] = await connection.query('SELECT name, email FROM users WHERE id = ?', [oldDelegatedTo]);
                if (userBRows.length > 0) {
                    const userB = userBRows[0];
                    const webNotifAction = 'licence_cleared';
                    const itemType = 'documento';

                    if (isSelfService) {
                        // Caso A: Autogestión (Usuario A cancela delegación en B)
                        const notifMsgB = `El usuario ${userA.name} ha cancelado o finalizado su periodo de licencia y delegación de bandeja.`;
                        await connection.query(`
                            INSERT INTO notifications (user_id, sender_id, item_id, item_type, action, message)
                            VALUES (?, ?, 'licence', ?, ?, ?)
                        `, [oldDelegatedTo, userId, itemType, webNotifAction, notifMsgB]);

                        if (process.env.EMAIL_ENABLED === 'true') {
                            const mailSubject = 'GDE - Fin de Delegación de Bandeja';
                            const mailHtml = `
                                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px;">
                                    <h2 style="color: #64748b; border-bottom: 2px solid #64748b; padding-bottom: 10px;">Fin de Delegación</h2>
                                    <p style="color: #334155;">Hola <strong>${userB.name}</strong>,</p>
                                    <p style="color: #334155;">El usuario <strong>${userA.name}</strong> ha **cancelado o finalizado** su periodo de licencia.</p>
                                    <p style="color: #334155;">A partir de este momento, los nuevos documentos y expedientes dirigidos a él ingresarán a su propia bandeja de entrada, finalizando el desvío automático hacia ti.</p>
                                    <p style="color: #64748b; font-size: 12px; margin-top: 20px;">Gracias por su colaboración durante esta ausencia.</p>
                                </div>`;
                            emailService.sendMail(userB.email, mailSubject, 'Fin de Delegación', mailHtml);
                        }
                    } else {
                        // Caso B: Desactivado por Administrador
                        const notifMsgA = `Un administrador del sistema ha cancelado o desactivado tu licencia/ausencia, restableciendo tu bandeja.`;
                        await connection.query(`
                            INSERT INTO notifications (user_id, sender_id, item_id, item_type, action, message)
                            VALUES (?, ?, 'licence', ?, ?, ?)
                        `, [userId, req.user.id, itemType, webNotifAction, notifMsgA]);

                        const notifMsgB = `Un administrador ha cancelado o finalizado la delegación de la bandeja de ${userA.name} hacia ti.`;
                        await connection.query(`
                            INSERT INTO notifications (user_id, sender_id, item_id, item_type, action, message)
                            VALUES (?, ?, 'licence', ?, ?, ?)
                        `, [oldDelegatedTo, req.user.id, itemType, webNotifAction, notifMsgB]);

                        if (process.env.EMAIL_ENABLED === 'true') {
                            // Correo a A
                            const mailSubjectA = 'GDE - Licencia Cancelada/Desactivada por Administrador';
                            const mailHtmlA = `
                                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #ef4444; border-radius: 8px;">
                                    <h2 style="color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">Licencia Desactivada</h2>
                                    <p style="color: #334155;">Hola <strong>${userA.name}</strong>,</p>
                                    <p style="color: #334155;">Un administrador del sistema ha **desactivado o cancelado** tu licencia/ausencia registrada en la plataforma.</p>
                                    <p style="color: #334155;">Tu bandeja ha sido restablecida a su estado normal. Los nuevos documentos y expedientes ingresarán directamente a tu bandeja.</p>
                                </div>`;
                            emailService.sendMail(userA.email, mailSubjectA, 'Licencia Desactivada', mailHtmlA);

                            // Correo a B
                            const mailSubjectB = 'GDE - Fin de Delegación por Administrador';
                            const mailHtmlB = `
                                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #ef4444; border-radius: 8px;">
                                    <h2 style="color: #64748b; border-bottom: 2px solid #64748b; padding-bottom: 10px;">Fin de Delegación</h2>
                                    <p style="color: #334155;">Hola <strong>${userB.name}</strong>,</p>
                                    <p style="color: #334155;">Un administrador de sistemas ha **finalizado o cancelado** la delegación de la bandeja de <strong>${userA.name}</strong> hacia ti.</p>
                                    <p style="color: #64748b; font-size: 12px; margin-top: 20px;">Los nuevos documentos y expedientes ya no serán desviados a tu bandeja.</p>
                                </div>`;
                            emailService.sendMail(userB.email, mailSubjectB, 'Fin de Delegación', mailHtmlB);
                        }
                    }
                }
            }

            await connection.query(
                'UPDATE users SET licence_start = NULL, licence_end = NULL, delegated_to = NULL WHERE id = ?',
                [userId]
            );
            logAdminAction('LICENCE_CLEARED', { userId, by: req.user?.id });
        }

        await connection.commit();
        res.json({ message: 'Licencia y delegación configuradas correctamente.' });
    } catch (error) {
        await connection.rollback();
        console.error('[licenceController.updateLicence] Error:', error);
        res.status(500).json({ message: 'Error al actualizar la licencia' });
    } finally {
        connection.release();
    }
};

// Obtener delegados elegibles
exports.getEligibleDelegates = async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, name, email, area_id FROM users WHERE id != ? AND status = "active" ORDER BY name ASC',
            [req.user.id]
        );
        res.json({ delegates: rows });
    } catch (error) {
        console.error('[licenceController.getEligibleDelegates] Error:', error);
        res.status(500).json({ message: 'Error al recuperar usuarios elegibles' });
    }
};
