// config/db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

// Creamos un "Pool" de conexiones (es más rápido y seguro que una conexión simple)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10, // Limite de conexiones simultáneas
    queueLimit: 0
});

module.exports = pool;