// middlewares/roleMiddleware.js
// Middleware avanzado de control de accesos RBAC y ACL (OWASP A01: Broken Access Control)

const pool = require('../config/db');

/**
 * Middleware Factory: Exige un permiso específico registrado en base de datos.
 */
const requirePermission = (requiredPermission) => {
    return async (req, res, next) => {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ message: 'No autenticado.' });
        }

        try {
            // Consultamos si el usuario tiene asignado el permiso a través de sus roles
            const [rows] = await pool.query(`
                SELECT p.id 
                FROM permissions p
                JOIN role_permissions rp ON p.id = rp.permission_id
                JOIN user_roles ur ON rp.role_id = ur.role_id
                WHERE ur.user_id = ? AND p.id = ?
            `, [req.user.id, requiredPermission]);

            if (rows.length === 0) {
                return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${requiredPermission}` });
            }

            next();
        } catch (error) {
            console.error('[RBAC Middleware Error]:', error);
            res.status(500).json({ message: 'Error interno de autorización.' });
        }
    };
};

/**
 * Middleware Factory: Exige que el usuario sea Administrador Técnico.
 */
const requireAdmin = async (req, res, next) => {
    if (!req.user || !req.user.id) {
        return res.status(401).json({ message: 'No autenticado.' });
    }

    try {
        const [rows] = await pool.query(`
            SELECT role_id FROM user_roles WHERE user_id = ? AND role_id = 'admin'
        `, [req.user.id]);

        if (rows.length === 0) {
            return res.status(403).json({ message: 'Acceso denegado. Se requieren privilegios de administrador.' });
        }

        next();
    } catch (error) {
        console.error('[Admin Middleware Error]:', error);
        res.status(500).json({ message: 'Error interno de autorización.' });
    }
};

/**
 * Middleware Factory: Valida acceso lícito a nivel de objeto sobre un Documento (ACL).
 * Parámetro 'action': 'read' | 'write' | 'delete' | 'sign'
 */
const checkDocumentAccess = (action) => {
    return async (req, res, next) => {
        const docId = req.params.id || req.body.id || req.body.item?.id;
        const userId = req.user.id;

        if (!docId) {
            return res.status(400).json({ message: 'ID de documento no provisto.' });
        }

        try {
            // 1. Cargar datos del usuario en caliente desde la base de datos
            const [userRows] = await pool.query('SELECT area_id, areas, role FROM users WHERE id = ?', [userId]);
            if (userRows.length === 0) {
                return res.status(404).json({ message: 'Usuario no encontrado.' });
            }
            const user = userRows[0];
            const userAreas = typeof user.areas === 'string' ? JSON.parse(user.areas) : (user.areas || [user.area_id]);

            // Obtener subordinados del usuario actual para habilitar accesos de superior
            const [subordinatesRows] = await pool.query('SELECT id FROM users WHERE superior_id = ?', [userId]);
            const subordinateIds = subordinatesRows.map(s => s.id);

            // 2. Cargar el documento
            const [docRows] = await pool.query('SELECT * FROM documents WHERE id = ?', [docId]);
            if (docRows.length === 0) {
                return res.status(404).json({ message: 'Documento no encontrado.' });
            }
            const doc = docRows[0];

            const owners = typeof doc.owners === 'string' ? JSON.parse(doc.owners) : (doc.owners || []);
            const recipients = typeof doc.recipients === 'string' ? JSON.parse(doc.recipients) : (doc.recipients || []);
            const signatories = typeof doc.signatories === 'string' ? JSON.parse(doc.signatories) : (doc.signatories || []);

            const isOwnedBySubordinate = subordinateIds.includes(doc.current_owner_id);

            // 3. Evaluar reglas según la acción solicitada y el permiso granular correspondiente
            if (action === 'read') {
                const isDraft = ['Borrador', 'Rechazado'].includes(doc.status);
                const isReserved = doc.is_public === 0;
                let requiredPerm;
                let permDesc;
                if (isReserved) {
                    requiredPerm = isDraft ? 'doc_edit_reserved' : 'doc_read_reserved';
                    permDesc = isDraft ? 'Editar Borradores Reservados (doc_edit_reserved)' : 'Visualizar Documentos Reservados Firmados (doc_read_reserved)';
                } else {
                    requiredPerm = isDraft ? 'doc_edit' : 'doc_read';
                    permDesc = isDraft ? 'Editar Borrador de Documento (doc_edit)' : 'Visualizar Detalles de Documento (doc_read)';
                }
                const hasPerm = await checkUserHasPermission(userId, requiredPerm);
                if (!hasPerm) {
                    return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                }

                const isAuditorOrAdmin = user.role === 'admin' || (await checkUserHasPermission(userId, 'audit_logs'));

                // Si es un documento reservado, solo acceden:
                // - Creador original o dueño actual directo
                // - Dueño actual por área
                // - Si el usuario está explícitamente en la lista de autorizados (auth_users)
                // - Si alguna de las áreas lícitas del usuario está en la lista de áreas autorizadas (auth_areas)
                // - Administradores y Auditores
                // - Superior de su subordinado si este es el dueño actual
                if (doc.is_public === 0) {
                    const authAreas = typeof doc.auth_areas === 'string' ? JSON.parse(doc.auth_areas) : (doc.auth_areas || []);
                    const authUsers = typeof doc.auth_users === 'string' ? JSON.parse(doc.auth_users) : (doc.auth_users || []);

                    const hasDirectAccess = doc.creator_id === userId || doc.current_owner_id === userId;
                    const isAreaOwner = userAreas.includes(doc.current_owner_id);
                    const isUserAuth = authUsers.includes(userId);
                    const isAreaAuth = userAreas.some(area => authAreas.includes(area));

                    if (hasDirectAccess || isAreaOwner || isUserAuth || isAreaAuth || isAuditorOrAdmin || isOwnedBySubordinate) {
                        return next();
                    }
                    return res.status(403).json({ message: 'Acceso denegado. Este documento es reservado.' });
                }

                // Si es público, el usuario puede leer si:
                // - Es el creador original
                // - Es el dueño actual
                // - Su ID de usuario está en la lista de dueños (owners)
                // - Alguna de sus áreas lícitas está en la lista de dueños (owners) o destinatarios (recipients)
                // - El documento está en firma y él es uno de los firmantes pendientes (signatories)
                // - Es administrador o auditor
                // - Superior de su subordinado si este es el dueño actual
                const hasDirectAccess = doc.creator_id === userId || doc.current_owner_id === userId;
                const isOwner = owners.includes(userId) || userAreas.some(area => owners.includes(area));
                const isRecipient = recipients.includes(userId) || userAreas.some(area => recipients.includes(area));
                const isPendingSignatory = signatories.includes(userId);

                if (hasDirectAccess || isOwner || isRecipient || isPendingSignatory || isAuditorOrAdmin || isOwnedBySubordinate) {
                    return next();
                }

                return res.status(403).json({ message: 'No tiene permisos para visualizar este documento.' });
            }

            if (action === 'attach') {
                if (!['Borrador', 'Rechazado'].includes(doc.status)) {
                    return res.status(403).json({ message: 'Solo se pueden adjuntar archivos a borradores o documentos rechazados.' });
                }

                const isCurrentOwner = doc.current_owner_id === userId || userAreas.includes(doc.current_owner_id) || isOwnedBySubordinate;
                if (!isCurrentOwner) {
                    return res.status(403).json({ message: 'Acceso denegado: No posee la tenencia (dueño actual) de este borrador.' });
                }

                const isReserved = doc.is_public === 0;
                const requiredPerm = isReserved ? 'doc_attach_reserved' : 'doc_attach';
                const permDesc = isReserved ? 'Adjuntar archivos en Documentos Reservados (doc_attach_reserved)' : 'Adjuntar archivos (doc_attach)';
                const hasAttachPerm = await checkUserHasPermission(userId, requiredPerm);
                if (!hasAttachPerm) {
                    return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                }
                return next();
            }

            if (action === 'write') {
                const { item } = req.body;
                const isReserved = doc.is_public === 0;
                const isDraft = ['Borrador', 'Rechazado'].includes(doc.status);

                if (item) {
                    // Validar si cambia la lista de autorizados de un documento reservado
                    if (isReserved && (item.authUsers !== undefined || item.authAreas !== undefined)) {
                        const oldAuthUsers = typeof doc.auth_users === 'string' ? JSON.parse(doc.auth_users) : (doc.auth_users || []);
                        const oldAuthAreas = typeof doc.auth_areas === 'string' ? JSON.parse(doc.auth_areas) : (doc.auth_areas || []);
                        const newAuthUsers = item.authUsers !== undefined ? item.authUsers : oldAuthUsers;
                        const newAuthAreas = item.authAreas !== undefined ? item.authAreas : oldAuthAreas;
                        const authUsersChanged = newAuthUsers.length !== oldAuthUsers.length || newAuthUsers.some(u => !oldAuthUsers.includes(u));
                        const authAreasChanged = newAuthAreas.length !== oldAuthAreas.length || newAuthAreas.some(a => !oldAuthAreas.includes(a));
                        if (authUsersChanged || authAreasChanged) {
                            const hasChangePerm = await checkUserHasPermission(userId, 'doc_change_reserved_perms');
                            if (!hasChangePerm) {
                                return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Cambiar permisos en Documentos Reservados (doc_change_reserved_perms).' });
                            }
                        }
                    }

                    // Validar transiciones de estado
                    if (item.status !== undefined && item.status !== doc.status) {
                        if (item.status === 'Archivado') {
                            const requiredPerm = isReserved ? 'doc_archive_reserved' : 'doc_archive';
                            const permDesc = isReserved ? 'Archivar Documentos Reservados (doc_archive_reserved)' : 'Archivar Documento (doc_archive)';
                            const hasArchPerm = await checkUserHasPermission(userId, requiredPerm);
                            if (!hasArchPerm) {
                                return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                            }
                        }
                        if (item.status === 'Anulado') {
                            const requiredPerm = isReserved ? 'doc_annul_reserved' : 'doc_annul';
                            const permDesc = isReserved ? 'Anular Documentos Reservados (doc_annul_reserved)' : 'Anular Documento (doc_annul)';
                            const hasAnnulPerm = await checkUserHasPermission(userId, requiredPerm);
                            if (!hasAnnulPerm) {
                                return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                            }
                        }
                        if (doc.status === 'Archivado' && item.status === 'Firmado') {
                            const requiredPerm = isReserved ? 'doc_unarchive_reserved' : 'doc_unarchive';
                            const permDesc = isReserved ? 'Desarchivar Documentos Reservados (doc_unarchive_reserved)' : 'Desarchivar Documento (doc_unarchive)';
                            const hasUnarchPerm = await checkUserHasPermission(userId, requiredPerm);
                            if (!hasUnarchPerm) {
                                return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                            }
                        }
                        if (isDraft && item.status === 'Firmandose') {
                            const requiredPerm = isReserved ? 'doc_send_sign_reserved' : 'doc_send_sign';
                            const permDesc = isReserved ? 'Enviar a Firmar Documentos Reservados (doc_send_sign_reserved)' : 'Enviar a Firmar (doc_send_sign)';
                            const hasSendSignPerm = await checkUserHasPermission(userId, requiredPerm);
                            if (!hasSendSignPerm) {
                                return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                            }
                        }
                    }

                    // Validar derivaciones y envío a firmar/revisar
                    if (item.currentOwnerId !== undefined && item.currentOwnerId !== doc.current_owner_id) {
                        const requiredPerm = isDraft
                            ? (isReserved ? 'doc_send_sign_reserved' : 'doc_send_sign')
                            : (isReserved ? 'doc_derive_reserved' : 'doc_derive');
                        const permDesc = isDraft
                            ? (isReserved ? 'Enviar a Firmar Documentos Reservados (doc_send_sign_reserved)' : 'Enviar a Firmar (doc_send_sign)')
                            : (isReserved ? 'Derivar Documentos Reservados (doc_derive_reserved)' : 'Derivar Documento (doc_derive)');
                        const hasDerivePerm = await checkUserHasPermission(userId, requiredPerm);
                        if (!hasDerivePerm) {
                            return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                        }
                    }

                    // Validar edición de borradores
                    if ((item.content !== undefined && item.content !== doc.content) || (item.subject !== undefined && item.subject !== doc.subject)) {
                        const requiredPerm = isReserved ? 'doc_edit_reserved' : 'doc_edit';
                        const permDesc = isReserved ? 'Editar Borradores Reservados (doc_edit_reserved)' : 'Editar Borrador de Documento (doc_edit)';
                        const hasEditPerm = await checkUserHasPermission(userId, requiredPerm);
                        if (!hasEditPerm) {
                            return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                        }
                    }
                } else {
                    const requiredPerm = isReserved ? 'doc_edit_reserved' : 'doc_edit';
                    const permDesc = isReserved ? 'Editar Borradores Reservados (doc_edit_reserved)' : 'Editar Borrador de Documento (doc_edit)';
                    const hasEditPerm = await checkUserHasPermission(userId, requiredPerm);
                    if (!hasEditPerm) {
                        return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                    }
                }

                // Caso A: Si el documento ya está Firmado, Archivado o Anulado (Circulación del documento)
                if (['Firmado', 'Archivado', 'Anulado'].includes(doc.status)) {
                    // Validamos que NO se esté intentando alterar el asunto o el cuerpo (Inmutabilidad - OWASP A08)
                    const newSubject = req.body.item ? req.body.item.subject : null;
                    const newContent = req.body.item ? req.body.item.content : null;

                    if (newSubject && newSubject !== doc.subject) {
                        return res.status(403).json({ message: 'Integridad: No se puede modificar el asunto de un documento firmado.' });
                    }
                    if (newContent && newContent !== doc.content) {
                        return res.status(403).json({ message: 'Integridad: No se puede modificar el cuerpo de un documento firmado.' });
                    }

                    // Permitimos modificar metadatos de circulación (dueños, área) si el usuario es creador, dueño o parte de los owners o superior del dueño
                    const hasAccess = doc.creator_id === userId || doc.current_owner_id === userId || owners.includes(userId) || userAreas.some(area => owners.includes(area)) || isOwnedBySubordinate;
                    if (hasAccess) {
                        return next();
                    }
                    return res.status(403).json({ message: 'No tiene permisos para circular/derivar este documento.' });
                }

                // Caso B: Si está en preparación (Borrador, Rechazado) o en firmas (Firmandose)
                // Permitimos editar, subir o quitar adjuntos si el usuario es el dueño/tenedor actual del documento o su superior
                const isCurrentOwner = doc.current_owner_id === userId || userAreas.includes(doc.current_owner_id) || isOwnedBySubordinate;
                if (isCurrentOwner) {
                    return next();
                }

                return res.status(403).json({ message: 'Acceso denegado: No posee la tenencia (dueño actual) de este documento en su bandeja.' });
            }

            if (action === 'delete') {
                const isReserved = doc.is_public === 0;
                const requiredPerm = isReserved ? 'doc_delete_reserved' : 'doc_delete';
                const permDesc = isReserved ? 'Eliminar Borrador Reservado (doc_delete_reserved)' : 'Eliminar Borrador de Documento (doc_delete)';
                const hasDeletePerm = await checkUserHasPermission(userId, requiredPerm);
                if (!hasDeletePerm) {
                    return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                }

                // Solo se pueden borrar documentos en Borrador o Rechazados
                if (doc.status !== 'Borrador' && doc.status !== 'Rechazado') {
                    return res.status(403).json({ message: 'No se puede eliminar un documento en circulación oficial.' });
                }

                // Solo el creador original puede borrarlo
                if (doc.creator_id === userId) {
                    return next();
                }

                return res.status(403).json({ message: 'Solo el creador del borrador puede eliminarlo.' });
            }

            if (action === 'sign') {
                const isReserved = doc.is_public === 0;
                const requiredPerm = isReserved ? 'doc_sign_reserved' : 'doc_sign';
                const permDesc = isReserved ? 'Firmar Documentos Reservados (doc_sign_reserved)' : 'Aplicar Firma a Documento (doc_sign)';
                const hasSignPerm = await checkUserHasPermission(userId, requiredPerm);
                if (!hasSignPerm) {
                    return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                }

                // Caso A: Circuito de firmas múltiples en cascada
                if (doc.status === 'Firmandose' && signatories.includes(userId)) {
                    return next();
                }

                // Caso B: Firma directa del creador sobre su propio borrador
                if (doc.status === 'Borrador' && doc.creator_id === userId && doc.current_owner_id === userId) {
                    return next();
                }

                return res.status(400).json({ message: 'El documento no está habilitado para firmar en esta etapa o no es un firmante autorizado.' });
            }

            res.status(400).json({ message: 'Acción de autorización no reconocida.' });

        } catch (error) {
            console.error('[Document ACL Error]:', error);
            res.status(500).json({ message: 'Error interno de validación de permisos.' });
        }
    };
};

/**
 * Middleware Factory: Valida acceso lícito a nivel de objeto sobre un Expediente (ACL).
 * Parámetro 'action': 'read' | 'write'
 */
const checkExpedienteAccess = (action) => {
    return async (req, res, next) => {
        const expId = req.params.id || req.body.id || req.body.item?.id;
        const userId = req.user.id;

        if (!expId) {
            return res.status(400).json({ message: 'ID de expediente no provisto.' });
        }

        try {
            // 1. Cargar datos del usuario
            const [userRows] = await pool.query('SELECT area_id, areas, role FROM users WHERE id = ?', [userId]);
            if (userRows.length === 0) {
                return res.status(404).json({ message: 'Usuario no encontrado.' });
            }
            const user = userRows[0];
            const userAreas = typeof user.areas === 'string' ? JSON.parse(user.areas) : (user.areas || [user.area_id]);

            // Obtener subordinados del usuario actual para habilitar accesos de superior
            const [subordinatesRows] = await pool.query('SELECT id FROM users WHERE superior_id = ?', [userId]);
            const subordinateIds = subordinatesRows.map(s => s.id);

            // 2. Cargar el expediente
            const [expRows] = await pool.query('SELECT * FROM expedientes WHERE id = ?', [expId]);
            if (expRows.length === 0) {
                return res.status(404).json({ message: 'Expediente no encontrado.' });
            }
            const exp = expRows[0];

            const authAreas = typeof exp.auth_areas === 'string' ? JSON.parse(exp.auth_areas) : (exp.auth_areas || []);
            const authUsers = typeof exp.auth_users === 'string' ? JSON.parse(exp.auth_users) : (exp.auth_users || []);

            const isOwnedBySubordinate = subordinateIds.includes(exp.current_owner_id);

            if (action === 'read') {
                const isReserved = exp.is_public === 0;
                const requiredPerm = isReserved ? 'exp_read_reserved' : 'exp_read';
                const permDesc = isReserved ? 'Visualizar Expediente Reservado (exp_read_reserved)' : 'Visualizar Expediente (exp_read)';
                const hasReadPerm = await checkUserHasPermission(userId, requiredPerm);
                if (!hasReadPerm) {
                    return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                }

                // Si el expediente es público, cualquiera lo puede ver
                if (exp.is_public === 1) {
                    return next();
                }

                // Si es reservado, solo acceden:
                // - Creador original
                // - Dueño actual (usuario o área del usuario)
                // - Si el usuario está explícitamente en la lista de autorizados (authUsers)
                // - Si alguna de las áreas lícitas del usuario está en la lista de áreas autorizadas (authAreas)
                // - Administradores y Auditores
                // - Superior de su subordinado si este es el dueño actual
                const hasDirectAccess = exp.creator_id === userId || exp.current_owner_id === userId;
                const isAreaOwner = userAreas.includes(exp.current_owner_id);
                const isUserAuth = authUsers.includes(userId);
                const isAreaAuth = userAreas.some(area => authAreas.includes(area));
                const isAuditorOrAdmin = user.role === 'admin' || (await checkUserHasPermission(userId, 'audit_logs'));

                if (hasDirectAccess || isAreaOwner || isUserAuth || isAreaAuth || isAuditorOrAdmin || isOwnedBySubordinate) {
                    return next();
                }

                return res.status(403).json({ message: 'Acceso denegado. Este expediente es reservado.' });
            }

            if (action === 'download') {
                const isReserved = exp.is_public === 0;
                const requiredPerm = isReserved ? 'exp_download_reserved' : 'exp_download';
                const permDesc = isReserved ? 'Descargar Expedientes Reservados (exp_download_reserved)' : 'Descargar Expedientes (exp_download)';
                const hasDownloadPerm = await checkUserHasPermission(userId, requiredPerm);
                if (!hasDownloadPerm) {
                    return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                }

                if (isReserved) {
                    const hasDirectAccess = exp.creator_id === userId || exp.current_owner_id === userId;
                    const isAreaOwner = userAreas.includes(exp.current_owner_id);
                    const isUserAuth = authUsers.includes(userId);
                    const isAreaAuth = userAreas.some(area => authAreas.includes(area));
                    const isAuditorOrAdmin = user.role === 'admin' || (await checkUserHasPermission(userId, 'audit_logs'));

                    if (hasDirectAccess || isAreaOwner || isUserAuth || isAreaAuth || isAuditorOrAdmin || isOwnedBySubordinate) {
                        return next();
                    }
                    return res.status(403).json({ message: 'Acceso denegado. Este expediente es reservado.' });
                }

                return next();
            }

            if (action === 'write') {
                const { item } = req.body;
                const isReserved = exp.is_public === 0;

                if (item) {
                    // Validar si cambia la lista de autorizados de un expediente reservado
                    if (isReserved && (item.authUsers !== undefined || item.authAreas !== undefined)) {
                        const oldAuthUsers = typeof exp.auth_users === 'string' ? JSON.parse(exp.auth_users) : (exp.auth_users || []);
                        const oldAuthAreas = typeof exp.auth_areas === 'string' ? JSON.parse(exp.auth_areas) : (exp.auth_areas || []);
                        const newAuthUsers = item.authUsers !== undefined ? item.authUsers : oldAuthUsers;
                        const newAuthAreas = item.authAreas !== undefined ? item.authAreas : oldAuthAreas;
                        const authUsersChanged = newAuthUsers.length !== oldAuthUsers.length || newAuthUsers.some(u => !oldAuthUsers.includes(u));
                        const authAreasChanged = newAuthAreas.length !== oldAuthAreas.length || newAuthAreas.some(a => !oldAuthAreas.includes(a));
                        if (authUsersChanged || authAreasChanged) {
                            const hasChangePerm = await checkUserHasPermission(userId, 'exp_change_reserved_perms');
                            if (!hasChangePerm) {
                                return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Cambiar permisos en Expedientes Reservados (exp_change_reserved_perms).' });
                            }
                        }
                    }

                    // Validar transiciones de estado
                    if (item.status !== undefined && item.status !== exp.status) {
                        if (item.status === 'Archivado') {
                            const requiredPerm = isReserved ? 'exp_archive_reserved' : 'exp_archive';
                            const permDesc = isReserved ? 'Archivar Expedientes Reservados (exp_archive_reserved)' : 'Archivar Expediente (exp_archive)';
                            const hasArchPerm = await checkUserHasPermission(userId, requiredPerm);
                            if (!hasArchPerm) {
                                return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                            }
                        }
                        if (item.status === 'Anulado') {
                            const requiredPerm = isReserved ? 'exp_annul_reserved' : 'exp_annul';
                            const permDesc = isReserved ? 'Anular Expedientes Reservados (exp_annul_reserved)' : 'Anular Expediente (exp_annul)';
                            const hasAnnulPerm = await checkUserHasPermission(userId, requiredPerm);
                            if (!hasAnnulPerm) {
                                return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                            }
                        }
                        if (exp.status === 'Archivado' && item.status === 'En Tramite') {
                            const requiredPerm = isReserved ? 'exp_unarchive_reserved' : 'exp_unarchive';
                            const permDesc = isReserved ? 'Desarchivar Expedientes Reservados (exp_unarchive_reserved)' : 'Desarchivar Expediente (exp_unarchive)';
                            const hasUnarchPerm = await checkUserHasPermission(userId, requiredPerm);
                            if (!hasUnarchPerm) {
                                return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                            }
                        }
                    }
                    
                    // Validar si vincula fojas (linkedDocs o sealedDocs cambian)
                    if (item.linkedDocs !== undefined) {
                        const oldDocs = typeof exp.linked_docs === 'string' ? JSON.parse(exp.linked_docs) : (exp.linked_docs || []);
                        const newDocs = item.linkedDocs;
                        if (newDocs.length !== oldDocs.length || newDocs.some(d => !oldDocs.includes(d))) {
                            const requiredPerm = isReserved ? 'exp_edit_reserved' : 'exp_write';
                            const permDesc = isReserved ? 'Editar Expedientes Reservados (exp_edit_reserved)' : 'Editar Expediente y Vincular Fojas (exp_write)';
                            const hasWritePerm = await checkUserHasPermission(userId, requiredPerm);
                            if (!hasWritePerm) {
                                return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                            }
                        }
                    }
                } else {
                    const requiredPerm = isReserved ? 'exp_edit_reserved' : 'exp_write';
                    const permDesc = isReserved ? 'Editar Expedientes Reservados (exp_edit_reserved)' : 'Editar Expediente y Vincular Fojas (exp_write)';
                    const hasWritePerm = await checkUserHasPermission(userId, requiredPerm);
                    if (!hasWritePerm) {
                        return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                    }
                }

                // Solo el dueño actual (agente o área asignada) puede editar, vincular fojas o hacer pases, o su superior
                const isDirectOwner = exp.current_owner_id === userId;
                const isAreaOwner = userAreas.includes(exp.current_owner_id);

                if (isDirectOwner || isAreaOwner || isOwnedBySubordinate) {
                    return next();
                }

                return res.status(403).json({ message: 'Acceso denegado. No posee la tenencia (dueño actual) de este expediente en su bandeja de trabajo.' });
            }

            if (action === 'pase') {
                const isReserved = exp.is_public === 0;
                const requiredPerm = isReserved ? 'exp_derive_reserved' : 'exp_pase';
                const permDesc = isReserved ? 'Derivar Expedientes Reservados (exp_derive_reserved)' : 'Realizar Pase de Expediente (exp_pase)';
                const hasPasePerm = await checkUserHasPermission(userId, requiredPerm);
                if (!hasPasePerm) {
                    return res.status(403).json({ message: `Acceso denegado. Se requiere el permiso: ${permDesc}.` });
                }

                // Solo el dueño actual (agente o área asignada) puede realizar un pase (ACL), o su superior
                const isDirectOwner = exp.current_owner_id === userId;
                const isAreaOwner = userAreas.includes(exp.current_owner_id);

                if (isDirectOwner || isAreaOwner || isOwnedBySubordinate) {
                    return next();
                }

                return res.status(403).json({ message: 'Acceso denegado. No posee la tenencia (dueño actual) de este expediente para realizar el pase.' });
            }

            res.status(400).json({ message: 'Acción de autorización de expediente no reconocida.' });

        } catch (error) {
            console.error('[Expediente ACL Error]:', error);
            res.status(500).json({ message: 'Error interno de validación de permisos del expediente.' });
        }
    };
};

/**
 * Función de utilidad interna para validar permisos
 */
async function checkUserHasPermission(userId, permissionName) {
    try {
        const [rows] = await pool.query(`
            SELECT p.id 
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id
            JOIN user_roles ur ON rp.role_id = ur.role_id
            WHERE ur.user_id = ? AND p.id = ?
        `, [userId, permissionName]);
        return rows.length > 0;
    } catch (e) {
        return false;
    }
}

async function getUserPermissions(userId) {
    try {
        const [rows] = await pool.query(`
            SELECT DISTINCT p.id 
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id
            JOIN user_roles ur ON rp.role_id = ur.role_id
            WHERE ur.user_id = ?
        `, [userId]);
        return rows.map(r => r.id);
    } catch (e) {
        return [];
    }
}

module.exports = {
    requirePermission,
    requireAdmin,
    checkDocumentAccess,
    checkExpedienteAccess,
    checkUserHasPermission,
    getUserPermissions
};
