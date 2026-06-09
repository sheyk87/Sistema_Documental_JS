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
    const { id, subject, creatorId, currentOwnerId, status, isPublic, authAreas, authUsers, areaId } = req.body;

    try {
        const isPublicVal = isPublic === false ? 0 : 1;
        if (isPublicVal === 0) {
            const { checkUserHasPermission } = require('../middlewares/roleMiddleware');
            const hasCreateReserved = await checkUserHasPermission(req.user.id, 'doc_create_reserved');
            if (!hasCreateReserved) {
                return res.status(403).json({ message: 'Acceso denegado. Se requieren permisos para crear expedientes reservados.' });
            }
        }

        const serverTime = getArgTime();

        // Generamos el número atómico en el backend
        const numberingService = require('../services/numberingService');
        const generatedNumber = await numberingService.getNextNumber('EX', areaId);

        await pool.query(
            `INSERT INTO expedientes (id, number, subject, creator_id, current_owner_id, status, is_public, auth_areas, auth_users, linked_docs, sealed_docs, created_at, area_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?)`,
            [
                id, generatedNumber, subject, creatorId, currentOwnerId, status, 
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

        res.status(201).json({ message: 'Expediente creado exitosamente', number: generatedNumber });
    } catch (error) {
        console.error("Error al crear expediente:", error);
        res.status(500).json({ message: 'Error al crear el expediente' });
    }
};

exports.getAllExpedientes = async (req, res) => {
    try {
        const [exps] = await pool.query('SELECT * FROM expedientes');
        const [history] = await pool.query(
            "SELECT item_id, created_at, user_id, action, notes FROM history WHERE item_type = 'expediente' ORDER BY created_at ASC"
        );
        const [movements] = await pool.query('SELECT * FROM expediente_movements ORDER BY created_at ASC');

        // Optimización: Pre-indexamos el historial
        const historyMap = new Map();
        for (const h of history) {
            if (!historyMap.has(h.item_id)) historyMap.set(h.item_id, []);
            historyMap.get(h.item_id).push({ date: h.created_at, userId: h.user_id, action: h.action, notes: h.notes });
        }

        // Optimización: Pre-indexamos los movimientos
        const movementsMap = new Map();
        for (const m of movements) {
            if (!movementsMap.has(m.expediente_id)) movementsMap.set(m.expediente_id, []);
            movementsMap.get(m.expediente_id).push({
                id: m.id,
                senderId: m.sender_id,
                senderAreaId: m.sender_area_id,
                receiverId: m.receiver_id,
                receiverAreaId: m.receiver_area_id,
                notes: m.notes,
                linkedDocsSnapshot: typeof m.linked_docs_snapshot === 'string' ? JSON.parse(m.linked_docs_snapshot) : (m.linked_docs_snapshot || []),
                date: m.created_at
            });
        }

        // CONTROL DE ACCESOS SEGURO (OWASP A01: Broken Access Control)
        const userId = req.user.id;
        const [userRows] = await pool.query('SELECT area_id, areas, role FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        const user = userRows[0];
        const userAreas = typeof user.areas === 'string' ? JSON.parse(user.areas) : (user.areas || [user.area_id]);
        
        const { checkUserHasPermission } = require('../middlewares/roleMiddleware');
        const isAuditorOrAdmin = user.role === 'admin' || (await checkUserHasPermission(userId, 'audit_logs'));

        let filteredExps = exps;
        if (!isAuditorOrAdmin) {
            filteredExps = exps.filter(e => {
                if (e.is_public !== 0) return true;
                
                const authAreas = typeof e.auth_areas === 'string' ? JSON.parse(e.auth_areas) : (e.auth_areas || []);
                const authUsers = typeof e.auth_users === 'string' ? JSON.parse(e.auth_users) : (e.auth_users || []);
                
                const hasDirectAccess = e.creator_id === userId || e.current_owner_id === userId;
                const isAreaOwner = userAreas.includes(e.current_owner_id);
                const isUserAuth = authUsers.includes(userId);
                const isAreaAuth = userAreas.some(area => authAreas.includes(area));
                
                return hasDirectAccess || isAreaOwner || isUserAuth || isAreaAuth;
            });
        }

        const formattedExps = filteredExps.map(e => {
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
                authAreas: typeof e.auth_areas === 'string' ? JSON.parse(e.auth_areas) : (e.auth_areas || []),
                authUsers: typeof e.auth_users === 'string' ? JSON.parse(e.auth_users) : (e.auth_users || []),
                linkedDocs: typeof e.linked_docs === 'string' ? JSON.parse(e.linked_docs) : (e.linked_docs || []),
                sealedDocs: typeof e.sealed_docs === 'string' ? JSON.parse(e.sealed_docs) : (e.sealed_docs || []),
                history: historyMap.get(e.id) || [],
                movements: movementsMap.get(e.id) || []
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
        // 1. REGLA DE NEGOCIO CRÍTICA (Inmutabilidad de Fojas Selladas):
        // Obtenemos el estado actual del expediente para verificar fojas selladas
        const [rows] = await pool.query('SELECT sealed_docs FROM expedientes WHERE id = ?', [item.id]);
        if (rows.length > 0) {
            const currentSealed = typeof rows[0].sealed_docs === 'string' ? JSON.parse(rows[0].sealed_docs) : (rows[0].sealed_docs || []);
            const newLinked = item.linkedDocs || [];
            
            // Si algún documento que estaba sellado ya no figura en el nuevo listado de vinculados, se bloquea la acción
            const wasSealedRemoved = currentSealed.some(docId => !newLinked.includes(docId));
            if (wasSealedRemoved) {
                return res.status(403).json({ message: 'Seguridad del Expediente: Las fojas selladas no pueden ser desvinculadas bajo ninguna circunstancia, ni siquiera por un administrador.' });
            }
        }

        // === NUEVO: Comprobar licencia/ausencia del destinatario (Fase 3) ===
        const { resolveDelegatedOwner } = require('../utils/licenceHelper');
        const delegation = await resolveDelegatedOwner(item.currentOwnerId);
        
        if (delegation.delegated) {
            item.currentOwnerId = delegation.finalOwnerId;
            
            // Obtener el área del delegado para actualizar el area_id del expediente
            const [delUserRows] = await pool.query('SELECT area_id FROM users WHERE id = ?', [delegation.finalOwnerId]);
            if (delUserRows.length > 0) {
                item.areaId = delUserRows[0].area_id;
            }
            
            // Notificar al delegado con campanita y correo
            const notifMsg = `Recibiste el expediente por desvío automático debido a la licencia de ${delegation.originalOwnerName}.`;
            const { sendNotificationInternal } = require('./notificationController');
            await sendNotificationInternal({
                userIds: [delegation.finalOwnerId],
                senderId: req.user?.id || 'system',
                action: 'delegado_licencia',
                message: notifMsg,
                itemId: item.id,
                itemType: 'expediente'
            });
            
            // Modificar la nota de historia
            if (historyEntry) {
                historyEntry.notes = (historyEntry.notes || '') + ` (Desviado automáticamente a ${delegation.delegatedOwnerName} por licencia de ${delegation.originalOwnerName})`;
            }
        }

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

// NUEVO: Realizar pase formal de expediente (Fase 3)
exports.makePase = async (req, res) => {
    const { id } = req.params;
    const { receiverId, notes } = req.body;

    if (!receiverId) return res.status(400).json({ message: 'El destinatario es obligatorio.' });
    if (!notes || !notes.trim()) return res.status(400).json({ message: 'El motivo o nota de pase es obligatorio.' });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Obtener y bloquear expediente
        const [rows] = await connection.query(
            'SELECT current_owner_id, area_id, linked_docs, sealed_docs FROM expedientes WHERE id = ? FOR UPDATE',
            [id]
        );
        if (rows.length === 0) {
            connection.release();
            return res.status(404).json({ message: 'Expediente no encontrado.' });
        }

        const exp = rows[0];

        // Validar tenencia física
        if (exp.current_owner_id !== req.user.id && exp.current_owner_id !== req.user.areaId) {
            connection.release();
            return res.status(403).json({ message: 'Acceso denegado: No posee la tenencia del expediente para realizar el pase.' });
        }

        // === NUEVO: Comprobar licencia/ausencia del destinatario (Fase 3) ===
        const { resolveDelegatedOwner } = require('../utils/licenceHelper');
        const delegation = await resolveDelegatedOwner(receiverId);
        
        let actualReceiverId = receiverId;
        let redirectedNote = '';
        if (delegation.delegated) {
            actualReceiverId = delegation.finalOwnerId;
            redirectedNote = ` (Desviado automáticamente por licencia de ${delegation.originalOwnerName})`;
        }

        // 2. Resolver receptor y emisor
        let receiverUserId = null;
        let receiverAreaId = null;
        let destName = '';

        if (actualReceiverId.startsWith('u')) {
            receiverUserId = actualReceiverId;
            const [uRows] = await connection.query('SELECT name, area_id FROM users WHERE id = ?', [receiverUserId]);
            if (uRows.length === 0) throw new Error('Usuario receptor no encontrado.');
            receiverAreaId = uRows[0].area_id;
            destName = uRows[0].name + redirectedNote;
        } else if (actualReceiverId.startsWith('a')) {
            receiverAreaId = actualReceiverId;
            const [aRows] = await connection.query('SELECT name FROM areas WHERE id = ?', [receiverAreaId]);
            if (aRows.length === 0) throw new Error('Área receptora no encontrada.');
            destName = `Área: ${aRows[0].name}`;
        } else {
            throw new Error('Identificador de receptor inválido.');
        }

        const senderUserId = req.user.id;
        const [senderRows] = await connection.query('SELECT area_id FROM users WHERE id = ?', [senderUserId]);
        if (senderRows.length === 0) throw new Error('Usuario emisor no encontrado.');
        const senderAreaId = senderRows[0].area_id;

        // 3. Fojas selladas: Todas las vinculadas pasan a estar selladas al realizar el pase
        const currentSealed = typeof exp.sealed_docs === 'string' ? JSON.parse(exp.sealed_docs) : (exp.sealed_docs || []);
        const currentLinked = typeof exp.linked_docs === 'string' ? JSON.parse(exp.linked_docs) : (exp.linked_docs || []);
        const nextSealed = [...new Set([...currentSealed, ...currentLinked])];

        // 4. Insertar movimiento inmutable (Pase)
        const movementId = `mov_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        await connection.query(
            `INSERT INTO expediente_movements (id, expediente_id, sender_id, sender_area_id, receiver_id, receiver_area_id, notes, linked_docs_snapshot, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                movementId, id, senderUserId, senderAreaId, receiverUserId, receiverAreaId,
                notes, JSON.stringify(currentLinked), getArgTime()
            ]
        );

        // 5. Actualizar expediente principal
        await connection.query(
            `UPDATE expedientes SET 
                current_owner_id = ?, area_id = ?, sealed_docs = ?, status = 'En Tramite'
             WHERE id = ?`,
            [actualReceiverId, receiverAreaId, JSON.stringify(nextSealed), id]
        );

        // 6. Insertar historial de auditoría
        const hAction = `Derivado a ${destName}`;
        await connection.query(
            `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) 
             VALUES (?, 'expediente', ?, ?, ?, ?)`,
            [id, senderUserId, hAction, notes, getArgTime()]
        );

        // 7. Notificar al delegado con campanita y correo si hubo desvío
        if (delegation.delegated) {
            const notifMsg = `Recibiste el expediente por desvío automático debido a la licencia de ${delegation.originalOwnerName}.`;
            const { sendNotificationInternal } = require('./notificationController');
            await sendNotificationInternal({
                userIds: [delegation.finalOwnerId],
                senderId: senderUserId,
                action: 'delegado_licencia',
                message: notifMsg,
                itemId: id,
                itemType: 'expediente'
            });
        }

        await connection.commit();
        res.json({ message: 'Pase realizado exitosamente.', nextSealed });

    } catch (error) {
        await connection.rollback();
        console.error('Error realizando pase de expediente:', error);
        res.status(500).json({ message: error.message || 'Error interno al realizar el pase.' });
    } finally {
        connection.release();
    }
};