// config/db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

// Pool de conexiones optimizado para alta concurrencia (2000+ usuarios)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_POOL_LIMIT) || 150,  // Escalado a 150 por defecto
    queueLimit: 0,                // Ilimitado en cola en pico (previene rechazo prematuro de sockets)
    enableKeepAlive: true,       // Reutiliza conexiones TCP (reduce overhead)
    keepAliveInitialDelay: 30000 // Ping cada 30s para mantener conexiones vivas
});

module.exports = pool;