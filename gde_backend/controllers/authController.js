// controllers/authController.js
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const ldapService = require('../services/ldapService');

exports.login = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Faltan credenciales' });

    try {
        // 1. Verificamos que el usuario exista en nuestra BD (Necesitamos su Área y Rol)
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado en el sistema local' });
        
        let user = rows[0];
        let isAuthenticated = false;

        // 2. Intentamos Autenticación LDAP si está habilitado
        if (process.env.LDAP_ENABLED === 'true') {
            try {
                await ldapService.authenticateLDAP(email, password);
                isAuthenticated = true;
                console.log(`✅ [LDAP] Usuario autenticado por Directorio Activo: ${email}`);
            } catch (ldapError) {
                console.log(`⚠️ [LDAP] Falló autenticación para ${email}. Motivo: ${ldapError.message}`);
                // No retornamos error aún, hacemos Fallback a la BD local
            }
        }

        // 3. Fallback a BD Local (Si LDAP está apagado, falló, o es un usuario admin externo)
        if (!isAuthenticated) {
            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ message: 'Credenciales inválidas' });
            }
            isAuthenticated = true;
            console.log(`✅ [LOCAL] Usuario autenticado por BD Local: ${email}`);
        }

        // 4. Parseamos las áreas permitidas (Feature 5)
        user.areas = typeof user.areas === 'string' ? JSON.parse(user.areas) : (user.areas || [user.area_id]);
        user.areaId = user.area_id; 

        // 5. Generamos el Token JWT
        delete user.password;
        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '8h' });
        
        res.json({ token, user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en el servidor durante el login' });
    }
};