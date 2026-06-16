// migrations/add_user_creation_restrictions.js
const pool = require('../config/db');

async function runMigration() {
    console.log('🏁 Iniciando migración de restricciones de creación de documentos y expedientes...');

    try {
        console.log('🔄 Verificando columnas en la tabla "users"...');
        const [cols] = await pool.query('SHOW COLUMNS FROM users');
        const colNames = cols.map(c => c.Field);

        if (!colNames.includes('can_create_expedientes')) {
            await pool.query('ALTER TABLE users ADD COLUMN can_create_expedientes TINYINT(1) DEFAULT 1');
            console.log('  ✅ Columna "can_create_expedientes" añadida.');
        } else {
            console.log('  ℹ️ Columna "can_create_expedientes" ya existe.');
        }

        if (!colNames.includes('allowed_doc_types')) {
            await pool.query('ALTER TABLE users ADD COLUMN allowed_doc_types JSON DEFAULT NULL');
            console.log('  ✅ Columna "allowed_doc_types" añadida.');
        } else {
            console.log('  ℹ️ Columna "allowed_doc_types" ya existe.');
        }

        console.log('🎉 Migración completada con éxito.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error en la migración:', error);
        process.exit(1);
    }
}

runMigration();
