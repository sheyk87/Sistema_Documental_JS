// migrations/add_dest_type_to_document_types.js
const pool = require('../config/db');

async function runMigration() {
    console.log('🏁 Iniciando migración de campo dest_type en document_types...');

    try {
        console.log('🔄 Verificando columnas en la tabla "document_types"...');
        const [cols] = await pool.query('SHOW COLUMNS FROM document_types');
        const colNames = cols.map(c => c.Field);

        if (!colNames.includes('dest_type')) {
            await pool.query("ALTER TABLE document_types ADD COLUMN dest_type ENUM('none', 'single', 'multiple') DEFAULT 'none'");
            console.log('  ✅ Columna "dest_type" añadida.');
        } else {
            console.log('  ℹ️ Columna "dest_type" ya existe.');
        }

        console.log('🔄 Actualizando clasificaciones de tipos de documentos existentes...');
        // single: SOLI, SC, GASTO, OC, CAR
        await pool.query("UPDATE document_types SET dest_type = 'single' WHERE code IN ('SOLI', 'SC', 'GASTO', 'OC', 'CAR')");
        // multiple: ME, NO, NOTI, CIRC
        await pool.query("UPDATE document_types SET dest_type = 'multiple' WHERE code IN ('ME', 'NO', 'NOTI', 'CIRC')");
        
        console.log('  ✅ Clasificaciones actualizadas correctamente.');
        console.log('🎉 Migración completada con éxito.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error en la migración:', error);
        process.exit(1);
    }
}

runMigration();
