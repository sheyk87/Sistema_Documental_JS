// controllers/systemController.js
const pool = require('../config/db');

exports.getInitialData = async (req, res) => {
    try {
        const [areas] = await pool.query('SELECT id, name FROM areas');
        // Agregamos la columna 'areas' a la consulta
        const [usersRows] = await pool.query('SELECT id, name, email, area_id AS areaId, role, areas FROM users');
        
        // Parseamos el JSON para el frontend
        const users = usersRows.map(u => ({
            ...u,
            areas: typeof u.areas === 'string' ? JSON.parse(u.areas) : (u.areas || [u.areaId])
        }));
        
        res.json({ areas, users });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener datos del sistema' });
    }
};