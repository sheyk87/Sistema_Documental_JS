// migrations/add_antivirus_table.js
const pool = require('../config/db');

async function runMigration() {
    console.log('🏁 Iniciando migración de la tabla para registros del antivirus...');

    try {
        console.log('🔄 Creando tabla "antivirus_scans" si no existe...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS antivirus_scans (
                id VARCHAR(36) PRIMARY KEY,
                attachment_name VARCHAR(255) NOT NULL,
                document_id VARCHAR(36) NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                scan_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                file_size_bytes BIGINT NOT NULL,
                status ENUM('pending', 'scanning', 'clean', 'infected', 'error') NOT NULL DEFAULT 'pending',
                virus_name VARCHAR(150) NULL,
                scan_duration_ms INT NULL,
                INDEX idx_av_status (status),
                INDEX idx_av_scan_date (scan_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        `);
        console.log('  ✅ Tabla "antivirus_scans" verificada/creada correctamente.');

        console.log('🎉 Migración completada con éxito.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error en la migración de antivirus:', error);
        process.exit(1);
    }
}

runMigration();
