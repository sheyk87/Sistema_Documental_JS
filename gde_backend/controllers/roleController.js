// controllers/roleController.js
const pool = require('../config/db');
const { logAdminAction } = require('../utils/logger');
const { invalidateInitialDataCache } = require('./systemController');

// Obtiene todos los permisos granulares del sistema
exports.getPermissions = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name, description FROM permissions');
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener permisos:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// Obtiene todos los roles con sus mapeos de permisos correspondientes
exports.getAllRoles = async (req, res) => {
    try {
        const [roles] = await pool.query('SELECT id, name, description FROM roles');
        const [mappings] = await pool.query('SELECT role_id, permission_id FROM role_permissions');

        const formatted = roles.map(r => {
            const perms = mappings.filter(m => m.role_id === r.id).map(m => m.permission_id);
            return {
                id: r.id,
                name: r.name,
                description: r.description,
                permissions: perms
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('Error al obtener roles:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// Crea un nuevo rol y le asigna sus permisos en una transacción atómica
exports.createRole = async (req, res) => {
    const { name, description, permissions } = req.body;

    if (!name || name.trim() === '') {
        return res.status(400).json({ message: 'El nombre del rol es obligatorio.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Generar un ID de rol único basado en el nombre slugificado
        const baseId = name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
        
        if (!baseId || baseId === '') {
            return res.status(400).json({ message: 'El nombre del rol no es válido para generar un ID único.' });
        }

        // Evitar duplicados de ID de rol
        const [existing] = await connection.query('SELECT id FROM roles WHERE id = ?', [baseId]);
        let finalId = baseId;
        if (existing.length > 0) {
            finalId = `${baseId}_${Date.now()}`;
        }

        // Insertar el rol
        await connection.query(
            'INSERT INTO roles (id, name, description) VALUES (?, ?, ?)',
            [finalId, name.trim(), description ? description.trim() : null]
        );

        // Insertar permisos
        if (Array.isArray(permissions) && permissions.length > 0) {
            for (const pId of permissions) {
                await connection.query(
                    'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
                    [finalId, pId]
                );
            }
        }

        await connection.commit();

        // Registrar acción y vaciar la caché inicial
        logAdminAction('ROLE_CREATED', { roleId: finalId, name, by: req.user?.id });
        await invalidateInitialDataCache();

        res.status(201).json({ id: finalId, message: 'Rol creado exitosamente.' });
    } catch (error) {
        await connection.rollback();
        console.error('Error al crear rol:', error);
        res.status(500).json({ message: 'Error al crear el rol.' });
    } finally {
        connection.release();
    }
};

// Actualiza un rol existente y sus permisos
exports.updateRole = async (req, res) => {
    const { id } = req.params;
    const { name, description, permissions } = req.body;

    if (!name || name.trim() === '') {
        return res.status(400).json({ message: 'El nombre del rol es obligatorio.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Verificar si existe el rol
        const [existing] = await connection.query('SELECT id FROM roles WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'El rol especificado no existe.' });
        }

        // Actualizar datos de rol
        await connection.query(
            'UPDATE roles SET name = ?, description = ? WHERE id = ?',
            [name.trim(), description ? description.trim() : null, id]
        );

        // Actualizar mapeos de permisos (eliminar anteriores y asociar nuevos)
        await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [id]);

        if (Array.isArray(permissions) && permissions.length > 0) {
            for (const pId of permissions) {
                await connection.query(
                    'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
                    [id, pId]
                );
            }
        }

        await connection.commit();

        // Registrar acción y vaciar la caché inicial
        logAdminAction('ROLE_UPDATED', { roleId: id, by: req.user?.id });
        await invalidateInitialDataCache();

        res.json({ message: 'Rol actualizado exitosamente.' });
    } catch (error) {
        await connection.rollback();
        console.error('Error al actualizar rol:', error);
        res.status(500).json({ message: 'Error al actualizar el rol.' });
    } finally {
        connection.release();
    }
};

// Elimina un rol del sistema (con protecciones especiales para roles del sistema)
exports.deleteRole = async (req, res) => {
    const { id } = req.params;

    // Proteger los roles vitales del sistema
    if (['admin', 'user'].includes(id)) {
        return res.status(400).json({ message: 'No se pueden eliminar los roles básicos del sistema (admin/user).' });
    }

    try {
        const [result] = await pool.query('DELETE FROM roles WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'El rol especificado no existe.' });
        }

        // Registrar acción y vaciar la caché inicial
        logAdminAction('ROLE_DELETED', { roleId: id, by: req.user?.id });
        await invalidateInitialDataCache();

        res.json({ message: 'Rol eliminado exitosamente.' });
    } catch (error) {
        console.error('Error al eliminar rol:', error);
        res.status(500).json({ message: 'Error al eliminar el rol.' });
    }
};
