const pool = require('../config/db');
const bcrypt = require('bcrypt');

exports.createUser = async (req, res) => {
    const { id, name, email, password, areaId, role, areas } = req.body; // <-- Agregar areas
    try {
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
            `INSERT INTO users (id, name, email, password, area_id, role, areas) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, name, email, hash, areaId, role, JSON.stringify(areas || [areaId])] // <-- Guardar JSON
        );
        res.status(201).json({ message: 'Usuario creado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al crear usuario' });
    }
};

exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, email, password, areaId, role, areas } = req.body;
    try {
        if (password && password.trim() !== '') {
            // Si enviaron una contraseña nueva, la encriptamos y la guardamos
            const hash = await bcrypt.hash(password, 10);
            await pool.query(
                `UPDATE users SET name = ?, email = ?, password = ?, area_id = ?, role = ?, areas = ? WHERE id = ?`,
                [name, email, hash, areaId, role, JSON.stringify(areas || [areaId]), id]
            );
        } else {
            // Si está vacía, actualizamos todo MENOS la contraseña
            await pool.query(
                `UPDATE users SET name = ?, email = ?, area_id = ?, role = ?, areas = ? WHERE id = ?`,
                [name, email, areaId, role, JSON.stringify(areas || [areaId]), id]
            );
        }
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

exports.bulkCreateUsers = async (req, res) => {
    const { users } = req.body;
    if (!users || !users.length) return res.status(400).json({ message: 'No hay datos válidos' });
    
    try {
        for (let u of users) {
            const hash = await bcrypt.hash(u.password || '123', 10);
            const uid = `u${Date.now()}${Math.floor(Math.random() * 1000)}`;
            const role = u.role || 'user';
            const areasArray = u.areas ? u.areas.split('-').map(x => x.trim()) : [u.areaId];
            
            await pool.query(
                `INSERT IGNORE INTO users (id, name, email, password, area_id, role, areas) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [uid, u.name, u.email, hash, u.areaId, role, JSON.stringify(areasArray)]
            );
        }
        res.status(201).json({ message: 'Usuarios importados exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en la importación masiva de usuarios' });
    }
};