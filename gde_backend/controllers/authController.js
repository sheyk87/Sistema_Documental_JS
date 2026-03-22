// controllers/authController.js
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
    // Recibimos el email y password que manda el frontend
    const { email, password } = req.body;

    try {
        // 1. Buscamos al usuario en la base de datos
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        
        if (rows.length === 0) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        const user = rows[0];

        // 2. Comparamos la contraseña enviada con la encriptada en la BD
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        // 3. Creamos el Pase VIP (Token JWT)
        const token = jwt.sign(
            { id: user.id, role: user.role, areaId: user.area_id },
            process.env.JWT_SECRET,
            { expiresIn: '8h' } // El token expira en 8 horas
        );

        // 4. Quitamos la contraseña del objeto antes de enviarlo al frontend
        delete user.password;

        // 5. Enviamos el token y los datos del usuario de vuelta
        res.json({ token, user });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};