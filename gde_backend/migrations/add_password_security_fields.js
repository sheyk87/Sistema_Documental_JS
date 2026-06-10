// migrations/add_password_security_fields.js
const pool = require('../config/db');

async function runMigration() {
    console.log('🏁 Iniciando migración de campos de seguridad de contraseña...');

    try {
        // 1. Modificar tabla users para agregar:
        // - must_change_password
        // - password_resets_today
        // - last_password_reset_date
        console.log('🔄 Verificando columnas en la tabla "users"...');
        const [cols] = await pool.query('SHOW COLUMNS FROM users');
        const colNames = cols.map(c => c.Field);

        if (!colNames.includes('must_change_password')) {
            await pool.query('ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) DEFAULT 1');
            console.log('  ✅ Columna "must_change_password" añadida.');
        } else {
            console.log('  ℹ️ Columna "must_change_password" ya existe.');
        }

        if (!colNames.includes('password_resets_today')) {
            await pool.query('ALTER TABLE users ADD COLUMN password_resets_today INT DEFAULT 0');
            console.log('  ✅ Columna "password_resets_today" añadida.');
        } else {
            console.log('  ℹ️ Columna "password_resets_today" ya existe.');
        }

        if (!colNames.includes('last_password_reset_date')) {
            await pool.query('ALTER TABLE users ADD COLUMN last_password_reset_date DATE DEFAULT NULL');
            console.log('  ✅ Columna "last_password_reset_date" añadida.');
        } else {
            console.log('  ℹ️ Columna "last_password_reset_date" ya existe.');
        }

        // 2. Crear tabla password_history
        console.log('🔄 Verificando tabla "password_history"...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS password_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('  ✅ Tabla "password_history" verificada/creada.');

        console.log('🎉 Migración completada con éxito.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error en la migración:', error);
        process.exit(1);
    }
}

runMigration();
