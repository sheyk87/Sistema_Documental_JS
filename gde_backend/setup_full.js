const pool = require('./config/db');
const bcrypt = require('bcrypt');

async function setupFull() {
    try {
        console.log('Construyendo la base de datos completa...');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS areas (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                area_id VARCHAR(50) NOT NULL,
                areas JSON,
                role ENUM('admin', 'user') DEFAULT 'user',
                web_notifications BOOLEAN DEFAULT TRUE,
                email_notifications BOOLEAN DEFAULT TRUE,
                reset_code VARCHAR(8) DEFAULT NULL, 
                reset_expires DATETIME DEFAULT NULL;
                two_factor_secret VARCHAR(255) DEFAULT NULL,
                two_factor_enabled BOOLEAN DEFAULT FALSE;
                two_factor_recovery_codes JSON DEFAULT NULL;
                FOREIGN KEY (area_id) REFERENCES areas(id)
            )
        `);

        console.log('Insertando áreas...');
        await pool.query(`INSERT IGNORE INTO areas (id, name) VALUES 
            ('a1', 'Dirección General'), ('a2', 'Recursos Humanos'), ('a3', 'Sistemas')
        `);

        console.log('Encriptando contraseñas e insertando usuarios...');
        const hash = await bcrypt.hash('123', 10); // Encriptamos el "123"

        await pool.query(`INSERT IGNORE INTO users (id, name, email, password, area_id, role) VALUES 
            ('u1', 'Admin Sistema', 'admin@gde.com', '${hash}', 'a3', 'admin'),
            ('u2', 'Juan Perez', 'juan@gde.com', '${hash}', 'a1', 'user'),
            ('u3', 'Maria Gomez', 'maria@gde.com', '${hash}', 'a2', 'user'),
            ('u4', 'Carlos Lopez', 'carlos@gde.com', '${hash}', 'a3', 'user')
        `);

        // 1. Tabla Documents
        await pool.query(`
            CREATE TABLE IF NOT EXISTS documents (
                id VARCHAR(50) PRIMARY KEY,
                number VARCHAR(50),
                doc_type VARCHAR(50) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                creator_id VARCHAR(50) NOT NULL,
                current_owner_id VARCHAR(50) NOT NULL,
                area_id VARCHAR(50) DEFAULT NULL;
                status VARCHAR(50) NOT NULL,
                owners JSON,
                recipients JSON,
                signed_by JSON,
                signatories JSON,
                attachments JSON,
                related_docs JSON,
                pdf_hash VARCHAR(64) DEFAULT NULL;
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (creator_id) REFERENCES users(id)
            )
        `);
        console.log('- Tabla documents creada.');

        // 2. Tabla Expedientes
        await pool.query(`
            CREATE TABLE IF NOT EXISTS expedientes (
                id VARCHAR(50) PRIMARY KEY,
                number VARCHAR(50) UNIQUE NOT NULL,
                subject VARCHAR(255) NOT NULL,
                creator_id VARCHAR(50) NOT NULL,
                area_id VARCHAR(50) DEFAULT NULL;
                current_owner_id VARCHAR(50) NOT NULL,
                status VARCHAR(50) NOT NULL,
                is_public BOOLEAN DEFAULT TRUE,
                auth_areas JSON,
                auth_users JSON,
                linked_docs JSON,
                sealed_docs JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (creator_id) REFERENCES users(id)
            )
        `);
        console.log('- Tabla expedientes creada.');

        // 3. Tabla History (Historial universal)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                item_id VARCHAR(50) NOT NULL,
                item_type ENUM('documento', 'expediente') NOT NULL,
                user_id VARCHAR(50) NOT NULL,
                action VARCHAR(100) NOT NULL,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        console.log('- Tabla history creada.');

        // 4. Tabla Notifications
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                sender_id VARCHAR(50) NOT NULL,
                item_id VARCHAR(50) NOT NULL,
                item_type ENUM('documento', 'expediente') NOT NULL,
                action VARCHAR(100) NOT NULL,
                message VARCHAR(255) NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (sender_id) REFERENCES users(id)
            )
        `);
        console.log('- Tabla notifications creada.');

        console.log('¡Todas las tablas fueron creadas con éxito!');
        process.exit();
    } catch (error) {
        console.error('Error al crear las tablas:', error);
        process.exit(1);
    }
}

setupFull();
