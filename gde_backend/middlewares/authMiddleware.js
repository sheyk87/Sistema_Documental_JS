// middlewares/authMiddleware.js
// OWASP A07: Autenticación y verificación de sesiones con blacklist JWT (Fase 3)
const jwt = require('jsonwebtoken');
const { logAccessDenied } = require('../utils/logger');
const redis = require('../config/redisClient');

module.exports = async (req, res, next) => {
    // Buscamos el token en los encabezados de la petición
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ message: 'Acceso denegado. Se requiere un token.' });
    }

    try {
        // OWASP A07: Verificar si el token fue revocado (logout)
        // Si Redis falla, permitimos pasar (degradación elegante)
        try {
            const isBlacklisted = await redis.get(`gde:bl:${token}`);
            if (isBlacklisted) {
                logAccessDenied({ reason: 'blacklisted_token', ip: req.ip, path: req.path });
                return res.status(401).json({ message: 'Token inválido o expirado.' });
            }
        } catch (redisErr) {
            // Redis caído → no podemos verificar blacklist, pero no bloqueamos al usuario
            console.error('Redis blacklist check fallback:', redisErr.message);
        }

        // Verificamos si el token es real usando nuestra palabra secreta
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            issuer: 'gde-system',
            audience: 'gde-api'
        });

        // === NUEVO: Comprobar estado de cuenta y sincronizar rol en caliente (Fase 3) ===
        const pool = require('../config/db');
        const [statusRows] = await pool.query('SELECT status, role, must_change_password FROM users WHERE id = ?', [decoded.id]);
        if (statusRows.length === 0 || statusRows[0].status !== 'active') {
            logAccessDenied({ reason: 'inactive_or_suspended_account', ip: req.ip, path: req.path });
            return res.status(401).json({ message: 'Acceso denegado: Tu cuenta está inactiva o suspendida.' });
        }

        // Mantener sincronizado el rol real de la BD en req.user
        decoded.role = statusRows[0].role;
        req.user = decoded; // Guardamos los datos del usuario en la request

        // Gestión de cambio obligado de contraseña
        const userMustChange = statusRows[0].must_change_password === 1;
        if (userMustChange) {
            // Permitir solo las excepciones especificadas:
            const isMe = req.baseUrl === '/api/users' && req.path === '/me' && req.method === 'GET';
            const isProfile = req.baseUrl === '/api/users' && req.path === '/profile' && req.method === 'PUT';
            const isLogout = req.baseUrl === '/api/auth' && req.path === '/logout' && req.method === 'POST';
            const is2FAVerify = req.baseUrl === '/api/auth' && req.path === '/2fa/verify' && req.method === 'POST';
            const is2FASetup = req.baseUrl === '/api/auth' && req.path === '/2fa/setup' && req.method === 'POST';

            if (!isMe && !isProfile && !isLogout && !is2FAVerify && !is2FASetup) {
                return res.status(403).json({
                    message: 'Debe cambiar su contraseña antes de realizar otras acciones.',
                    mustChangePassword: true
                });
            }
        }

        next(); // Le decimos al servidor: "Todo en orden, déjalo pasar a la ruta"
    } catch (error) {
        logAccessDenied({ reason: 'invalid_token', ip: req.ip, path: req.path });
        // Mensaje genérico para no revelar si el token expiró o es inválido
        res.status(401).json({ message: 'Token inválido o expirado.' });
    }
};