// controllers/templateController.js
// Controlador para la gestión de plantillas de documentos (Fase 3).
// Cumple con la restricción de que cada tipo documental tenga a lo sumo 1 plantilla asignada.

const pool = require('../config/db');
const { logAdminAction } = require('../utils/logger');

// Obtener todas las plantillas junto con los tipos documentales asociados
exports.getTemplates = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT t.*, 
                   (SELECT JSON_ARRAYAGG(dt.code) 
                    FROM document_types dt 
                    WHERE dt.template_id = t.id) as doc_types
            FROM templates t
            ORDER BY t.created_at DESC
        `);

        // Normalizar doc_types que devuelva MySQL (puede venir como string JSON o array directo)
        const templates = rows.map(r => {
            let docTypes = [];
            if (r.doc_types) {
                docTypes = typeof r.doc_types === 'string' ? JSON.parse(r.doc_types) : r.doc_types;
            }
            return {
                ...r,
                is_global: !!r.is_global,
                doc_types: docTypes.filter(Boolean)
            };
        });

        res.json({ templates });
    } catch (error) {
        console.error('[templateController.getTemplates] Error:', error);
        res.status(500).json({ message: 'Error al recuperar las plantillas' });
    }
};

// Crear una plantilla y opcionalmente asignarla a tipos de documentos
exports.createTemplate = async (req, res) => {
    const { name, content, isGlobal, docTypes } = req.body;
    if (!name || !content) {
        return res.status(400).json({ message: 'El nombre y el contenido son obligatorios.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const templateId = `tpl_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const isGlobalVal = isGlobal ? 1 : 0;

        // Si se marca como global, remover el estado global a todas las demás plantillas
        if (isGlobalVal === 1) {
            await connection.query('UPDATE templates SET is_global = FALSE');
        }

        // Insertar la plantilla
        await connection.query(
            'INSERT INTO templates (id, name, content, is_global) VALUES (?, ?, ?, ?)',
            [templateId, name, content, isGlobalVal]
        );

        // Asignar a tipos documentales específicos (si aplica)
        if (Array.isArray(docTypes) && docTypes.length > 0) {
            // Un tipo de documento sólo puede tener una plantilla, al actualizar aquí,
            // automáticamente reemplaza cualquier asignación anterior porque template_id es de valor único.
            await connection.query(
                'UPDATE document_types SET template_id = ? WHERE code IN (?)',
                [templateId, docTypes]
            );
        }

        await connection.commit();
        logAdminAction('TEMPLATE_CREATED', { templateId, by: req.user?.id });
        res.status(201).json({ message: 'Plantilla creada exitosamente', templateId });
    } catch (error) {
        await connection.rollback();
        console.error('[templateController.createTemplate] Error:', error);
        res.status(500).json({ message: 'Error al crear la plantilla' });
    } finally {
        connection.release();
    }
};

// Actualizar plantilla
exports.updateTemplate = async (req, res) => {
    const { id } = req.params;
    const { name, content, isGlobal, docTypes } = req.body;

    if (!name || !content) {
        return res.status(400).json({ message: 'El nombre y el contenido son obligatorios.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Verificar si la plantilla existe
        const [exists] = await connection.query('SELECT id FROM templates WHERE id = ?', [id]);
        if (exists.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Plantilla no encontrada.' });
        }

        const isGlobalVal = isGlobal ? 1 : 0;

        // Si se marca como global, remover el estado global a todas las demás plantillas
        if (isGlobalVal === 1) {
            await connection.query('UPDATE templates SET is_global = FALSE');
        }

        // Actualizar datos básicos de la plantilla
        await connection.query(
            'UPDATE templates SET name = ?, content = ?, is_global = ? WHERE id = ?',
            [name, content, isGlobalVal, id]
        );

        // Actualizar asignación de tipos documentales:
        // Primero removemos todas las asignaciones anteriores a esta plantilla
        await connection.query('UPDATE document_types SET template_id = NULL WHERE template_id = ?', [id]);

        // Luego agregamos las nuevas asignaciones
        if (Array.isArray(docTypes) && docTypes.length > 0) {
            await connection.query(
                'UPDATE document_types SET template_id = ? WHERE code IN (?)',
                [id, docTypes]
            );
        }

        await connection.commit();
        logAdminAction('TEMPLATE_UPDATED', { templateId: id, by: req.user?.id });
        res.json({ message: 'Plantilla actualizada exitosamente' });
    } catch (error) {
        await connection.rollback();
        console.error('[templateController.updateTemplate] Error:', error);
        res.status(500).json({ message: 'Error al actualizar la plantilla' });
    } finally {
        connection.release();
    }
};

// Eliminar plantilla
exports.deleteTemplate = async (req, res) => {
    const { id } = req.params;
    try {
        // Al eliminar, la clave foránea ON DELETE SET NULL de document_types
        // limpiará automáticamente la asignación de tipos de documentos.
        const [result] = await pool.query('DELETE FROM templates WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Plantilla no encontrada.' });
        }

        logAdminAction('TEMPLATE_DELETED', { templateId: id, by: req.user?.id });
        res.json({ message: 'Plantilla eliminada exitosamente' });
    } catch (error) {
        console.error('[templateController.deleteTemplate] Error:', error);
        res.status(500).json({ message: 'Error al eliminar la plantilla' });
    }
};

// Recuperar la plantilla correspondiente a un tipo de documento
exports.getTemplateForType = async (req, res) => {
    const { docType } = req.params; // Viene el código (ej: 'NO', 'ME')
    try {
        // 1. Buscar si hay una plantilla asignada específicamente a este tipo de documento
        const [specific] = await pool.query(`
            SELECT t.* FROM templates t
            JOIN document_types dt ON dt.template_id = t.id
            WHERE dt.code = ?
        `, [docType]);

        if (specific.length > 0) {
            return res.json({ template: specific[0] });
        }

        // 2. Si no hay plantilla específica, retornar la plantilla marcada como global
        const [globalTpl] = await pool.query('SELECT * FROM templates WHERE is_global = TRUE LIMIT 1');
        if (globalTpl.length > 0) {
            return res.json({ template: globalTpl[0] });
        }

        // 3. Si no hay ninguna, retornar objeto vacío
        res.json({ template: null });
    } catch (error) {
        console.error('[templateController.getTemplateForType] Error:', error);
        res.status(500).json({ message: 'Error al recuperar la plantilla para este documento' });
    }
};
