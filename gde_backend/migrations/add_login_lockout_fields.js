// migrations/add_login_lockout_fields.js
const pool = require('../config/db');

async function runMigration() {
    console.log('🏁 Iniciando migración de campos de bloqueo por intentos fallidos...');

    try {
        console.log('🔄 Verificando columnas en la tabla "users"...');
        const [cols] = await pool.query('SHOW COLUMNS FROM users');
        const colNames = cols.map(c => c.Field);

        if (!colNames.includes('failed_login_attempts')) {
            await pool.query('ALTER TABLE users ADD COLUMN failed_login_attempts INT DEFAULT 0');
            console.log('  ✅ Columna "failed_login_attempts" añadida.');
        } else {
            console.log('  ℹ️ Columna "failed_login_attempts" ya existe.');
        }

        if (!colNames.includes('lockout_until')) {
            await pool.query('ALTER TABLE users ADD COLUMN lockout_until DATETIME DEFAULT NULL');
            console.log('  ✅ Columna "lockout_until" añadida.');
        } else {
            console.log('  ℹ️ Columna "lockout_until" ya existe.');
        }

        console.log('🎉 Migración completada con éxito.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error en la migración:', error);
        process.exit(1);
    }
}

runMigration();
