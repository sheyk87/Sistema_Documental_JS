const pool = require('./config/db');

async function fix() {
    try {
        await pool.query('ALTER TABLE documents ADD COLUMN signatories JSON');
        console.log('Columna de firmantes agregada con exito.');
    } catch (error) {
        console.log('La columna ya existe o hubo un error.');
    }
    process.exit();
}

fix();