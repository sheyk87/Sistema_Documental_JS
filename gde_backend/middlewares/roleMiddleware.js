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

            // 2. Cargar el documento
            const [docRows] = await pool.query('SELECT * FROM documents WHERE id = ?', [docId]);
            if (docRows.length === 0) {
                return res.status(404).json({ message: 'Documento no encontrado.' });
            }
            const doc = docRows[0];

            const owners = typeof doc.owners === 'string' ? JSON.parse(doc.owners) : (doc.owners || []);
            const recipients = typeof doc.recipients === 'string' ? JSON.parse(doc.recipients) : (doc.recipients || []);
            const signatories = typeof doc.signatories === 'string' ? JSON.parse(doc.signatories) : (doc.signatories || []);

            // 3. Evaluar reglas según la acción solicitada y el permiso granular correspondiente
            if (action === 'read') {
                const hasReadPerm = await checkUserHasPermission(userId, 'doc_read');
                if (!hasReadPerm) {
                    return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Visualizar Detalles de Documento (doc_read).' });
                }

                const isAuditorOrAdmin = user.role === 'admin' || (await checkUserHasPermission(userId, 'audit_logs'));

                // Si es un documento reservado, solo acceden:
                // - Creador original o dueño actual directo
                // - Dueño actual por área
                // - Si el usuario está explícitamente en la lista de autorizados (auth_users)
                // - Si alguna de las áreas lícitas del usuario está en la lista de áreas autorizadas (auth_areas)
                // - Administradores y Auditores
                if (doc.is_public === 0) {
                    const authAreas = typeof doc.auth_areas === 'string' ? JSON.parse(doc.auth_areas) : (doc.auth_areas || []);
                    const authUsers = typeof doc.auth_users === 'string' ? JSON.parse(doc.auth_users) : (doc.auth_users || []);

                    const hasDirectAccess = doc.creator_id === userId || doc.current_owner_id === userId;
                    const isAreaOwner = userAreas.includes(doc.current_owner_id);
                    const isUserAuth = authUsers.includes(userId);
                    const isAreaAuth = userAreas.some(area => authAreas.includes(area));

                    if (hasDirectAccess || isAreaOwner || isUserAuth || isAreaAuth || isAuditorOrAdmin) {
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
                const hasDirectAccess = doc.creator_id === userId || doc.current_owner_id === userId;
                const isOwner = owners.includes(userId) || userAreas.some(area => owners.includes(area));
                const isRecipient = recipients.includes(userId) || userAreas.some(area => recipients.includes(area));
                const isPendingSignatory = signatories.includes(userId);

                if (hasDirectAccess || isOwner || isRecipient || isPendingSignatory || isAuditorOrAdmin) {
                    return next();
                }

                return res.status(403).json({ message: 'No tiene permisos para visualizar este documento.' });
            }

            if (action === 'write') {
                const { item } = req.body;
                if (item) {
                    // Validar transiciones de estado y derivaciones con permisos específicos
                    if (item.status !== doc.status && item.status === 'Archivado') {
                        const hasArchPerm = await checkUserHasPermission(userId, 'doc_archive');
                        if (!hasArchPerm) {
                            return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Archivar Documento (doc_archive).' });
                        }
                    }
                    if (item.status !== doc.status && item.status === 'Anulado') {
                        const hasAnnulPerm = await checkUserHasPermission(userId, 'doc_annul');
                        if (!hasAnnulPerm) {
                            return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Anular Documento (doc_annul).' });
                        }
                    }
                    if (item.currentOwnerId !== doc.current_owner_id) {
                        const hasDerivePerm = await checkUserHasPermission(userId, 'doc_derive');
                        if (!hasDerivePerm) {
                            return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Derivar Documento (doc_derive).' });
                        }
                    }
                    if (item.content !== doc.content || item.subject !== doc.subject) {
                        const hasEditPerm = await checkUserHasPermission(userId, 'doc_edit');
                        if (!hasEditPerm) {
                            return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Editar Borrador de Documento (doc_edit).' });
                        }
                    }
                } else {
                    // Si no viene el item en el cuerpo, asumimos edición directa de metadatos o adjuntos
                    const hasEditPerm = await checkUserHasPermission(userId, 'doc_edit');
                    if (!hasEditPerm) {
                        return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Editar Borrador de Documento (doc_edit).' });
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

                    // Permitimos modificar metadatos de circulación (dueños, área) si el usuario es creador, dueño o parte de los owners
                    const hasAccess = doc.creator_id === userId || doc.current_owner_id === userId || owners.includes(userId) || userAreas.some(area => owners.includes(area));
                    if (hasAccess) {
                        return next();
                    }
                    return res.status(403).json({ message: 'No tiene permisos para circular/derivar este documento.' });
                }

                // Caso B: Si está en preparación (Borrador, Rechazado) o en firmas (Firmandose)
                // Permitimos editar, subir o quitar adjuntos si el usuario es el dueño/tenedor actual del documento
                const isCurrentOwner = doc.current_owner_id === userId || userAreas.includes(doc.current_owner_id);
                if (isCurrentOwner) {
                    return next();
                }

                return res.status(403).json({ message: 'Acceso denegado: No posee la tenencia (dueño actual) de este documento en su bandeja.' });
            }

            if (action === 'delete') {
                const hasDeletePerm = await checkUserHasPermission(userId, 'doc_delete');
                if (!hasDeletePerm) {
                    return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Eliminar Borrador de Documento (doc_delete).' });
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
                const hasSignPerm = await checkUserHasPermission(userId, 'doc_sign');
                if (!hasSignPerm) {
                    return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Aplicar Firma a Documento (doc_sign).' });
                }

                // Si el documento es reservado, el usuario debe poseer el permiso doc_sign_reserved
                if (doc.is_public === 0) {
                    const hasSignReserved = await checkUserHasPermission(userId, 'doc_sign_reserved');
                    if (!hasSignReserved) {
                        return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso de firma de documentos reservados.' });
                    }
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

            // 2. Cargar el expediente
            const [expRows] = await pool.query('SELECT * FROM expedientes WHERE id = ?', [expId]);
            if (expRows.length === 0) {
                return res.status(404).json({ message: 'Expediente no encontrado.' });
            }
            const exp = expRows[0];

            const authAreas = typeof exp.auth_areas === 'string' ? JSON.parse(exp.auth_areas) : (exp.auth_areas || []);
            const authUsers = typeof exp.auth_users === 'string' ? JSON.parse(exp.auth_users) : (exp.auth_users || []);

            if (action === 'read') {
                const hasReadPerm = await checkUserHasPermission(userId, 'exp_read');
                if (!hasReadPerm) {
                    return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Visualizar Expediente (exp_read).' });
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
                const hasDirectAccess = exp.creator_id === userId || exp.current_owner_id === userId;
                const isAreaOwner = userAreas.includes(exp.current_owner_id);
                const isUserAuth = authUsers.includes(userId);
                const isAreaAuth = userAreas.some(area => authAreas.includes(area));
                const isAuditorOrAdmin = user.role === 'admin' || (await checkUserHasPermission(userId, 'audit_logs'));

                if (hasDirectAccess || isAreaOwner || isUserAuth || isAreaAuth || isAuditorOrAdmin) {
                    return next();
                }

                return res.status(403).json({ message: 'Acceso denegado. Este expediente es reservado.' });
            }

            if (action === 'write') {
                const { item } = req.body;
                if (item) {
                    // Validar transiciones de estado
                    if (item.status !== exp.status && item.status === 'Archivado') {
                        const hasArchPerm = await checkUserHasPermission(userId, 'exp_archive');
                        if (!hasArchPerm) {
                            return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Archivar Expediente (exp_archive).' });
                        }
                    }
                    if (item.status !== exp.status && item.status === 'Anulado') {
                        const hasAnnulPerm = await checkUserHasPermission(userId, 'exp_annul');
                        if (!hasAnnulPerm) {
                            return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Anular Expediente (exp_annul).' });
                        }
                    }
                    
                    // Validar si vincula fojas (linkedDocs o sealedDocs cambian)
                    const oldDocs = typeof exp.linked_docs === 'string' ? JSON.parse(exp.linked_docs) : (exp.linked_docs || []);
                    const newDocs = item.linkedDocs || [];
                    if (newDocs.length !== oldDocs.length || newDocs.some(d => !oldDocs.includes(d))) {
                        const hasWritePerm = await checkUserHasPermission(userId, 'exp_write');
                        if (!hasWritePerm) {
                            return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Editar Expediente y Vincular Fojas (exp_write).' });
                        }
                    }
                } else {
                    const hasWritePerm = await checkUserHasPermission(userId, 'exp_write');
                    if (!hasWritePerm) {
                        return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Editar Expediente y Vincular Fojas (exp_write).' });
                    }
                }

                // Solo el dueño actual (agente o área asignada) puede editar, vincular fojas o hacer pases
                const isDirectOwner = exp.current_owner_id === userId;
                const isAreaOwner = userAreas.includes(exp.current_owner_id);

                if (isDirectOwner || isAreaOwner) {
                    return next();
                }

                return res.status(403).json({ message: 'Acceso denegado. No posee la tenencia (dueño actual) de este expediente en su bandeja de trabajo.' });
            }

            if (action === 'pase') {
                const hasPasePerm = await checkUserHasPermission(userId, 'exp_pase');
                if (!hasPasePerm) {
                    return res.status(403).json({ message: 'Acceso denegado. Se requiere el permiso: Realizar Pase de Expediente (exp_pase).' });
                }

                // Solo el dueño actual (agente o área asignada) puede realizar un pase (ACL)
                const isDirectOwner = exp.current_owner_id === userId;
                const isAreaOwner = userAreas.includes(exp.current_owner_id);

                if (isDirectOwner || isAreaOwner) {
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
