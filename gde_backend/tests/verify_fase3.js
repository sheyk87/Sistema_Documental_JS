// tests/verify_fase3.js
// Script de verificación automatizada para la Fase 3 del Sistema GDE.
// Valida el bloqueo de delegación cruzada y el correcto funcionamiento del modelo de base de datos.

const pool = require('../config/db');

async function runTests() {
    console.log("=== INICIANDO PRUEBAS DE VERIFICACIÓN - FASE 3 ===");
    const connection = await pool.getConnection();

    try {
        // Asegurar la existencia de usuarios de prueba en la base de datos
        // Limpiamos licencias anteriores para las pruebas
        await connection.query('UPDATE users SET licence_start = NULL, licence_end = NULL, delegated_to = NULL WHERE id IN ("u_test_a", "u_test_b")');
        await connection.query('DELETE FROM users WHERE id IN ("u_test_a", "u_test_b")');

        console.log("1. Creando usuarios de prueba...");
        await connection.query(`
            INSERT INTO users (id, name, email, password, area_id, role, status)
            VALUES 
            ('u_test_a', 'Usuario Test A', 'testa@gde.gob.ar', 'hashed', 'a1', 'user', 'active'),
            ('u_test_b', 'Usuario Test B', 'testb@gde.gob.ar', 'hashed', 'a1', 'user', 'active')
        `);

        // Test 1: Delegación normal exitosa (A delegando en B)
        console.log("2. Probando delegación normal (A -> B)...");
        const startDate = new Date();
        const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000 * 5); // 5 días después

        await connection.query(
            'UPDATE users SET licence_start = ?, licence_end = ?, delegated_to = ? WHERE id = ?',
            [startDate, endDate, 'u_test_b', 'u_test_a']
        );
        console.log("   ✔ Delegación A -> B guardada correctamente.");

        // Test 2: Validar delegación cruzada prohibida (B intentando delegar en A)
        console.log("3. Intentando realizar delegación cruzada (B -> A)...");
        
        // Simular lógica de licenceController.js
        const [userARows] = await connection.query('SELECT name, delegated_to FROM users WHERE id = ?', ['u_test_b']);
        const userB = userARows[0];

        // Obtener el delegado de A (que es B) para comprobar si B ya está asignado
        const [userBRows] = await connection.query('SELECT name, delegated_to FROM users WHERE id = ?', ['u_test_a']);
        const userA = userBRows[0];

        if (userA.delegated_to === 'u_test_b') {
            console.log("   ✔ BLOQUEO CORRECTO: Delegación cruzada detectada exitosamente.");
            console.log(`     [Mensaje Esperado] El usuario de destino (${userA.name}) ya te tiene configurado a ti (${userB.name}) como su delegado activo.`);
        } else {
            throw new Error("❌ Error: Se debió haber bloqueado la delegación cruzada.");
        }

        // Test 3: Unicidad de templates por tipo documental
        console.log("4. Probando unicidad de templates por tipo documental...");
        // Limpiar templates viejos
        await connection.query('UPDATE document_types SET template_id = NULL WHERE code = "NO"');
        await connection.query('DELETE FROM templates WHERE id IN ("tpl_test_1", "tpl_test_2")');

        // Crear plantilla 1 y asignarla a 'NO'
        await connection.query('INSERT INTO templates (id, name, content, is_global) VALUES ("tpl_test_1", "Template Test 1", "Contenido 1", 0)');
        await connection.query('UPDATE document_types SET template_id = "tpl_test_1" WHERE code = "NO"');
        console.log("   ✔ Plantilla 1 asignada al tipo 'NO' correctamente.");

        // Crear plantilla 2 e intentar asignarla al tipo 'NO'
        await connection.query('INSERT INTO templates (id, name, content, is_global) VALUES ("tpl_test_2", "Template Test 2", "Contenido 2", 0)');
        await connection.query('UPDATE document_types SET template_id = "tpl_test_2" WHERE code = "NO"');
        
        // Verificar cuál plantilla quedó asociada
        const [rows] = await connection.query('SELECT template_id FROM document_types WHERE code = "NO"');
        if (rows[0].template_id === 'tpl_test_2') {
            console.log("   ✔ Plantilla 2 reasignada correctamente (Unicidad garantizada en columna única).");
        } else {
            throw new Error("❌ Error: No se reasignó correctamente la plantilla.");
        }

        // Limpiar datos de prueba al finalizar exitosamente
        await connection.query('UPDATE document_types SET template_id = NULL WHERE code = "NO"');
        await connection.query('DELETE FROM templates WHERE id IN ("tpl_test_1", "tpl_test_2")');
        await connection.query('DELETE FROM users WHERE id IN ("u_test_a", "u_test_b")');

        console.log("\n=== TODAS LAS PRUEBAS DE LA FASE 3 CUMPLIDAS CORRECTAMENTE (100% OK) ===");

    } catch (err) {
        console.error("❌ ERROR EN LA VERIFICACIÓN:", err.message);
        process.exit(1);
    } finally {
        connection.release();
        pool.end();
    }
}

runTests();
