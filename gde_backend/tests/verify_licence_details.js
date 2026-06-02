// tests/verify_licence_details.js
// Script de verificación para los detalles de Licencias, Rangos de Fechas y Validaciones de API.

const pool = require('../config/db');
const { resolveDelegatedOwner } = require('../utils/licenceHelper');

async function runTests() {
    console.log("=== INICIANDO PRUEBAS DE DETALLES DE LICENCIA Y RANGOS ===");
    const connection = await pool.getConnection();

    try {
        // Asegurar que existan los usuarios de prueba u_test_x y u_test_y
        await connection.query('UPDATE users SET licence_start = NULL, licence_end = NULL, delegated_to = NULL WHERE id IN ("u_test_x", "u_test_y")');
        await connection.query('DELETE FROM users WHERE id IN ("u_test_x", "u_test_y")');

        console.log("1. Creando usuarios de prueba...");
        await connection.query(`
            INSERT INTO users (id, name, email, password, area_id, role, status)
            VALUES 
            ('u_test_x', 'Usuario Test X', 'testx@gde.gob.ar', 'hashed', 'a1', 'user', 'active'),
            ('u_test_y', 'Usuario Test Y', 'testy@gde.gob.ar', 'hashed', 'a1', 'user', 'active')
        `);

        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Helper para actualizar en BD y llamar a resolveDelegatedOwner
        async function testLicence(start, end, expectedDelegated, caseName) {
            await connection.query(
                'UPDATE users SET licence_start = ?, licence_end = ?, delegated_to = ? WHERE id = ?',
                [start, end, 'u_test_y', 'u_test_x']
            );
            const [debugRows] = await connection.query(
                'SELECT id, licence_start, licence_end, delegated_to FROM users WHERE id = ?',
                ['u_test_x']
            );
            console.log(`     [Debug db] start=${debugRows[0].licence_start}, end=${debugRows[0].licence_end}, delegated_to=${debugRows[0].delegated_to}`);
            const res = await resolveDelegatedOwner('u_test_x');
            if (res.delegated === expectedDelegated) {
                console.log(`   ✔ Caso [${caseName}]: CORRECTO (Esperado delegated: ${expectedDelegated}, Obtenido: ${res.delegated})`);
            } else {
                throw new Error(`❌ Error en Caso [${caseName}]: Se esperaba delegated ${expectedDelegated} pero se obtuvo ${res.delegated}`);
            }
        }

        console.log("2. Verificando lógica de rangos de fechas...");

        // Caso 1: Permanente (no start, no end)
        await testLicence(null, null, true, "Permanente - Sin Fechas");

        // Caso 2: Desde una fecha de inicio en el pasado (sin fin)
        await testLicence(yesterday, null, true, "Inicio en el pasado - Sin fin");

        // Caso 3: Desde una fecha de inicio en el futuro (sin fin)
        await testLicence(tomorrow, null, false, "Inicio en el futuro - Sin fin");

        // Caso 4: Hasta una fecha de fin en el futuro (sin inicio)
        await testLicence(null, tomorrow, true, "Fin en el futuro - Sin inicio");

        // Caso 5: Hasta una fecha de fin en el pasado (sin inicio)
        await testLicence(null, yesterday, false, "Fin en el pasado - Sin inicio");

        // Caso 6: Rango acotado activo (inicio pasado, fin futuro)
        await testLicence(yesterday, tomorrow, true, "Rango acotado activo");

        // Caso 7: Rango acotado inactivo a futuro (inicio futuro, fin futuro)
        await testLicence(tomorrow, nextWeek, false, "Rango acotado futuro");

        // Caso 8: Rango acotado inactivo en el pasado (inicio pasado, fin pasado)
        await testLicence(lastWeek, yesterday, false, "Rango acotado pasado");


        console.log("3. Verificando validaciones de API (Fecha Fin < Fecha Inicio)...");
        
        // Simular login para obtener token
        const backendUrl = 'http://localhost:3000/api';
        const resLogin = await fetch(`${backendUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'juan@gde.com', password: '123' })
        });
        const loginData = await resLogin.json();
        const token = loginData.token;

        if (!token) {
            throw new Error("No se pudo iniciar sesión con Juan para probar la API.");
        }

        // Caso 9: Intentar configurar con fecha fin menor a inicio
        const resConfigure = await fetch(`${backendUrl}/licences/configure`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                licenceStart: tomorrow.toISOString(),
                licenceEnd: yesterday.toISOString(),
                delegatedTo: 'u_test_y',
                notes: 'Test de validación de fecha'
            })
        });

        const configureData = await resConfigure.json();
        if (resConfigure.status === 400 && configureData.message.includes("no puede ser menor")) {
            console.log(`   ✔ Caso [Validación API Fin < Inicio]: CORRECTO (HTTP 400, Mensaje: "${configureData.message}")`);
        } else {
            throw new Error(`❌ Error en Validación API: Se esperaba HTTP 400 y mensaje de error de fechas. Obtenido HTTP ${resConfigure.status}, mensaje: "${configureData.message}"`);
        }

        // Limpiar datos
        await connection.query('UPDATE users SET licence_start = NULL, licence_end = NULL, delegated_to = NULL WHERE id IN ("u_test_x", "u_test_y")');
        await connection.query('DELETE FROM users WHERE id IN ("u_test_x", "u_test_y")');

        console.log("\n=== TODAS LAS PRUEBAS DE LICENCIAS CUMPLIDAS CORRECTAMENTE (100% OK) ===");

    } catch (err) {
        console.error("❌ ERROR EN LA VERIFICACIÓN:", err.message);
        process.exit(1);
    } finally {
        connection.release();
        pool.end();
    }
}

runTests();
