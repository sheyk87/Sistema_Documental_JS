// utils/licenceHelper.js
// Función de utilidad para comprobar licencias activas y enrutar automáticamente la bandeja (Fase 3).

const pool = require('../config/db');

/**
 * Comprueba si un usuario destino posee una licencia activa y, si es así,
 * resuelve la delegación de bandeja hacia el usuario designado.
 *
 * @param {string} targetOwnerId ID del tenedor propuesto (usuario o área).
 * @returns {Promise<{finalOwnerId: string, delegated: boolean, originalOwnerName?: string, delegatedOwnerName?: string}>}
 */
async function resolveDelegatedOwner(targetOwnerId) {
    if (!targetOwnerId || !targetOwnerId.startsWith('u')) {
        // Áreas o valores vacíos no admiten desvíos de licencia personal
        return { finalOwnerId: targetOwnerId, delegated: false };
    }

    try {
        const [rows] = await pool.query(
            'SELECT delegated_to, licence_start, licence_end, name FROM users WHERE id = ?',
            [targetOwnerId]
        );
        if (rows.length === 0) {
            return { finalOwnerId: targetOwnerId, delegated: false };
        }

        const user = rows[0];
        if (user.delegated_to) {
            const now = new Date();
            
            const start = user.licence_start ? new Date(user.licence_start) : null;
            const end = user.licence_end ? new Date(user.licence_end) : null;

            const isStartValid = start && !isNaN(start.getTime());
            const isEndValid = end && !isNaN(end.getTime());

            let isActive = false;

            if (!isStartValid && !isEndValid) {
                // Permanente
                isActive = true;
            } else if (isStartValid && !isEndValid) {
                // Desde una fecha de inicio en adelante
                isActive = (now >= start);
            } else if (!isStartValid && isEndValid) {
                // Desde ya mismo hasta una fecha de fin
                isActive = (now <= end);
            } else {
                // Período acotado
                isActive = (now >= start && now <= end);
            }

            if (isActive) {
                // Licencia activa! Obtener el nombre del delegado
                const [delegatedRows] = await pool.query('SELECT name FROM users WHERE id = ?', [user.delegated_to]);
                const delegatedName = delegatedRows.length > 0 ? delegatedRows[0].name : user.delegated_to;

                return {
                    finalOwnerId: user.delegated_to,
                    delegated: true,
                    originalOwnerName: user.name,
                    delegatedOwnerName: delegatedName
                };
            }
        }
    } catch (error) {
        console.error('[licenceHelper.resolveDelegatedOwner] Error:', error);
    }

    return { finalOwnerId: targetOwnerId, delegated: false };
}

module.exports = {
    resolveDelegatedOwner
};
