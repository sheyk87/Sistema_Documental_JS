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
    connectionLimit: parseInt(process.env.DB_POOL_LIMIT) || 100,  // Escalable vía .env
    queueLimit: 500,             // Máximo 500 en cola antes de rechazar (previene OOM)
    enableKeepAlive: true,       // Reutiliza conexiones TCP (reduce overhead)
    keepAliveInitialDelay: 30000 // Ping cada 30s para mantener conexiones vivas
});

module.exports = pool;