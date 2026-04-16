const pool = require('./config/db');

async function resetData() {
    try {
        console.log('Iniciando limpieza de la base de datos...');

        // Desactivamos temporalmente las restricciones de llaves foráneas
        await pool.query('SET FOREIGN_KEY_CHECKS = 0;');

        // Vaciamos las tablas transaccionales
        await pool.query('TRUNCATE TABLE history');
        await pool.query('TRUNCATE TABLE documents');
        await pool.query('TRUNCATE TABLE expedientes');
        await pool.query('TRUNCATE TABLE notifications');

        // Volvemos a activar las restricciones de seguridad
        await pool.query('SET FOREIGN_KEY_CHECKS = 1;');

        console.log('¡Limpieza completada! Todos los documentos, expedientes e historiales han sido borrados.');
        console.log('Tus Áreas y Usuarios siguen intactos.');
        
        process.exit();
    } catch (error) {
        console.error('Ocurrió un error al limpiar la base de datos:', error);
        process.exit(1);
    }
}

resetData();