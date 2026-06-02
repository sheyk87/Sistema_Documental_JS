const pool = require('../config/db');
const { invalidateInitialDataCache } = require('./systemController');

exports.createArea = async (req, res) => {
    const { id, name } = req.body;
    try {
        await pool.query(`INSERT INTO areas (id, name) VALUES (?, ?)`, [id, name]);
        await invalidateInitialDataCache(); // Fase 3: Limpiar cache Redis
        res.status(201).json({ message: 'Área creada exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al crear área' });
    }
};

exports.deleteArea = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query(`DELETE FROM areas WHERE id = ?`, [id]);
        await invalidateInitialDataCache(); // Fase 3: Limpiar cache Redis
        res.json({ message: 'Área eliminada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'No se puede eliminar un área que contiene usuarios.' });
    }
};

exports.bulkCreateAreas = async (req, res) => {
    const { areas } = req.body;
    if (!areas || !areas.length) return res.status(400).json({ message: 'No hay datos válidos' });
    
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        for (let a of areas) {
            let aid = a.id || null;
            let isNew = false;
            
            if (aid) {
                // Verificar si existe el área
                const [exists] = await connection.query('SELECT id FROM areas WHERE id = ?', [aid]);
                if (exists.length === 0) {
                    isNew = true;
                }
            } else {
                aid = `a${Date.now()}${Math.floor(Math.random() * 1000)}`;
                isNew = true;
            }

            if (isNew) {
                await connection.query(`INSERT INTO areas (id, name) VALUES (?, ?)`, [aid, a.name]);
            } else {
                await connection.query(`UPDATE areas SET name = ? WHERE id = ?`, [a.name, aid]);
            }
        }
        await connection.commit();
        await invalidateInitialDataCache(); // Fase 3: Limpiar cache Redis
        res.status(201).json({ message: 'Áreas importadas exitosamente' });
    } catch (error) {
        await connection.rollback();
        console.error('Error en bulkCreateAreas:', error);
        res.status(500).json({ message: 'Error en la importación masiva de áreas' });
    } finally {
        connection.release();
    }
};