const pool = require('../config/db');
const bcrypt = require('bcrypt');

exports.createUser = async (req, res) => {
    const { id, name, email, password, areaId, role } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10); // Encriptamos la contraseña
        await pool.query(
            `INSERT INTO users (id, name, email, password, area_id, role) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, name, email, hash, areaId, role]
        );
        res.status(201).json({ message: 'Usuario creado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al crear usuario' });
    }
};

exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, email, password, areaId, role } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10); // Encriptamos la nueva contraseña
        await pool.query(
            `UPDATE users SET name = ?, email = ?, password = ?, area_id = ?, role = ? WHERE id = ?`,
            [name, email, hash, areaId, role, id]
        );
        res.json({ message: 'Usuario actualizado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar usuario' });
    }
};

exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query(`DELETE FROM users WHERE id = ?`, [id]);
        res.json({ message: 'Usuario eliminado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al eliminar usuario' });
    }
};