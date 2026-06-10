const pool = require('../config/db');
const { invalidateInitialDataCache } = require('./systemController');
const { logAdminAction } = require('../utils/logger');

// Obtener todos los tipos de documentos
exports.getDocTypes = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT code, name, requires_signature, allows_attachments, is_reserved, dest_type, template_id FROM document_types ORDER BY name ASC');
        const documentTypes = rows.map(dt => ({
            code: dt.code,
            name: dt.name,
            requires_signature: dt.requires_signature === 1,
            allows_attachments: dt.allows_attachments === 1,
            is_reserved: dt.is_reserved === 1,
            dest_type: dt.dest_type || 'none',
            template_id: dt.template_id
        }));
        res.json({ documentTypes });
    } catch (error) {
        console.error('[docTypeController.getDocTypes] Error:', error);
        res.status(500).json({ message: 'Error al recuperar los tipos de documentos' });
    }
};

// Crear un tipo de documento
exports.createDocType = async (req, res) => {
    const { code, name, requires_signature, allows_attachments, is_reserved, dest_type, template_id } = req.body;

    // Validación básica del código (alfanumérico mayúsculas, longitud 1-10)
    if (!code || !/^[A-Z0-9]{1,10}$/.test(code)) {
        return res.status(400).json({ message: 'El código debe ser alfanumérico en mayúsculas (máximo 10 caracteres).' });
    }

    if (!name || name.trim().length === 0 || name.length > 100) {
        return res.status(400).json({ message: 'El nombre es requerido y no debe superar los 100 caracteres.' });
    }

    if (!['none', 'single', 'multiple'].includes(dest_type)) {
        return res.status(400).json({ message: 'El tipo de destinatario no es válido.' });
    }

    try {
        // Verificar si el código ya existe
        const [codeExists] = await pool.query('SELECT code FROM document_types WHERE code = ?', [code]);
        if (codeExists.length > 0) {
            return res.status(400).json({ message: 'El código de tipo de documento ya está registrado.' });
        }

        // Verificar si el nombre ya existe
        const [nameExists] = await pool.query('SELECT code FROM document_types WHERE name = ?', [name.trim()]);
        if (nameExists.length > 0) {
            return res.status(400).json({ message: 'El nombre de tipo de documento ya está registrado.' });
        }

        // Si hay template_id, verificar si existe en base de datos
        let finalTemplateId = null;
        if (template_id) {
            const [tempExists] = await pool.query('SELECT id FROM templates WHERE id = ?', [template_id]);
            if (tempExists.length > 0) {
                finalTemplateId = template_id;
            }
        }

        await pool.query(
            `INSERT INTO document_types (code, name, requires_signature, allows_attachments, is_reserved, dest_type, template_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                code,
                name.trim(),
                requires_signature ? 1 : 0,
                allows_attachments ? 1 : 0,
                is_reserved ? 1 : 0,
                dest_type,
                finalTemplateId
            ]
        );

        await invalidateInitialDataCache();
        logAdminAction('DOCTYPE_CREATED', { code, name: name.trim(), by: req.user?.id });

        res.status(201).json({ message: 'Tipo de documento creado exitosamente' });
    } catch (error) {
        console.error('[docTypeController.createDocType] Error:', error);
        res.status(500).json({ message: 'Error al crear el tipo de documento' });
    }
};

// Actualizar un tipo de documento
exports.updateDocType = async (req, res) => {
    const { code } = req.params;
    const { name, requires_signature, allows_attachments, is_reserved, dest_type, template_id } = req.body;

    if (!name || name.trim().length === 0 || name.length > 100) {
        return res.status(400).json({ message: 'El nombre es requerido y no debe superar los 100 caracteres.' });
    }

    if (!['none', 'single', 'multiple'].includes(dest_type)) {
        return res.status(400).json({ message: 'El tipo de destinatario no es válido.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Verificar si existe el tipo de documento
        const [docTypeRows] = await connection.query('SELECT code, name FROM document_types WHERE code = ?', [code]);
        if (docTypeRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Tipo de documento no encontrado.' });
        }
        const oldDocType = docTypeRows[0];

        // Verificar si el nombre ya está tomado por otro tipo de documento
        const [nameExists] = await connection.query('SELECT code FROM document_types WHERE name = ? AND code != ?', [name.trim(), code]);
        if (nameExists.length > 0) {
            await connection.rollback();
            return res.status(400).json({ message: 'El nombre de tipo de documento ya está registrado por otra definición.' });
        }

        // Si hay template_id, verificar si existe en base de datos
        let finalTemplateId = null;
        if (template_id) {
            const [tempExists] = await connection.query('SELECT id FROM templates WHERE id = ?', [template_id]);
            if (tempExists.length > 0) {
                finalTemplateId = template_id;
            }
        }

        // Si cambia el nombre, debemos actualizar también los documentos que tengan el nombre viejo en doc_type
        if (oldDocType.name !== name.trim()) {
            await connection.query('UPDATE documents SET doc_type = ? WHERE doc_type = ?', [name.trim(), oldDocType.name]);
        }

        await connection.query(
            `UPDATE document_types 
             SET name = ?, requires_signature = ?, allows_attachments = ?, is_reserved = ?, dest_type = ?, template_id = ? 
             WHERE code = ?`,
            [
                name.trim(),
                requires_signature ? 1 : 0,
                allows_attachments ? 1 : 0,
                is_reserved ? 1 : 0,
                dest_type,
                finalTemplateId,
                code
            ]
        );

        await connection.commit();
        await invalidateInitialDataCache();
        logAdminAction('DOCTYPE_UPDATED', { code, name: name.trim(), by: req.user?.id });

        res.json({ message: 'Tipo de documento actualizado exitosamente' });
    } catch (error) {
        await connection.rollback();
        console.error('[docTypeController.updateDocType] Error:', error);
        res.status(500).json({ message: 'Error al actualizar el tipo de documento' });
    } finally {
        connection.release();
    }
};

// Eliminar un tipo de documento
exports.deleteDocType = async (req, res) => {
    const { code } = req.params;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Verificar si existe el tipo de documento
        const [docTypeRows] = await connection.query('SELECT code, name FROM document_types WHERE code = ?', [code]);
        if (docTypeRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Tipo de documento no encontrado.' });
        }
        const docTypeName = docTypeRows[0].name;

        // Comprobación crítica: no se puede eliminar si hay documentos asociados (activos o no)
        const [usageRows] = await connection.query('SELECT COUNT(*) AS count FROM documents WHERE doc_type = ?', [docTypeName]);
        if (usageRows[0].count > 0) {
            await connection.rollback();
            return res.status(400).json({ message: 'No se puede eliminar el tipo de documento porque hay documentos activos o registrados con este tipo en el sistema.' });
        }

        // Eliminar de document_types
        await connection.query('DELETE FROM document_types WHERE code = ?', [code]);

        // Eliminar de numbering_sequences (limpieza huérfanos)
        await connection.query('DELETE FROM numbering_sequences WHERE doc_type = ?', [code]);

        await connection.commit();
        await invalidateInitialDataCache();
        logAdminAction('DOCTYPE_DELETED', { code, name: docTypeName, by: req.user?.id });

        res.json({ message: 'Tipo de documento eliminado exitosamente' });
    } catch (error) {
        await connection.rollback();
        console.error('[docTypeController.deleteDocType] Error:', error);
        res.status(500).json({ message: 'Error al eliminar el tipo de documento' });
    } finally {
        connection.release();
    }
};
