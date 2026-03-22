// controllers/systemController.js
const pool = require('../config/db');

exports.getInitialData = async (req, res) => {
    try {
        // Traemos todas las áreas
        const [areas] = await pool.query('SELECT id, name FROM areas');
        
        // Traemos los usuarios (¡SIN LA CONTRASEÑA!) y renombramos area_id a areaId para que coincida con tu Frontend
        const [users] = await pool.query('SELECT id, name, email, area_id AS areaId, role FROM users');
        
        res.json({ areas, users });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener datos del sistema' });
    }
};