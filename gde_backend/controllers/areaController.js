const pool = require('../config/db');

exports.createArea = async (req, res) => {
    const { id, name } = req.body;
    try {
        await pool.query(`INSERT INTO areas (id, name) VALUES (?, ?)`, [id, name]);
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
        res.json({ message: 'Área eliminada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'No se puede eliminar un área que contiene usuarios.' });
    }
};