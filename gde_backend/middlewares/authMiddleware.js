// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    // Buscamos el token en los encabezados de la petición
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ message: 'Acceso denegado. Se requiere un token.' });
    }

    try {
        // Verificamos si el token es real usando nuestra palabra secreta
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Guardamos los datos del usuario en la request
        next(); // Le decimos al servidor: "Todo en orden, déjalo pasar a la ruta"
    } catch (error) {
        res.status(400).json({ message: 'Token inválido o expirado.' });
    }
};