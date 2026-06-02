// tests/verify_admin_edit_bug.js
// Script de verificación para asegurar que los datos de la licencia de un usuario
// se devuelven correctamente en los datos de inicio del sistema (/api/system/init)
// y que el caché se invalida inmediatamente al configurar la licencia.

const pool = require('../config/db');

async function runTests() {
    console.log("=== INICIANDO PRUEBA DE INTEGRACIÓN: VERIFICAR LICENCIAS EN INIT ===");
    const backendUrl = 'http://localhost:3000/api';

    try {
        // 1. Obtener credenciales de Juan (u2)
        console.log('🔑 Iniciando sesión como Juan (u2)...');
        const resLogin = await fetch(`${backendUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'juan@gde.com', password: '123' })
        });
        const loginData = await resLogin.json();
        const token = loginData.token;

        if (!token) {
            throw new Error("No se pudo iniciar sesión.");
        }

        // Limpiar cualquier licencia previa de Juan en base de datos
        console.log('🧹 Limpiando licencias previas...');
        await pool.query('UPDATE users SET licence_start = NULL, licence_end = NULL, delegated_to = NULL WHERE id = "u2"');

        // 2. Obtener datos iniciales del sistema
        console.log('📋 Consultando init para verificar estado inicial de Juan (u2)...');
        const resInit1 = await fetch(`${backendUrl}/system/init`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const initData1 = await resInit1.json();
        const userJuan1 = initData1.users.find(u => u.id === 'u2');

        if (!userJuan1) {
            throw new Error("No se encontró a Juan (u2) en los datos iniciales.");
        }

        // Verificar que tenga las propiedades y estén en nulo
        if (
            'licence_start' in userJuan1 &&
            'licence_end' in userJuan1 &&
            'delegated_to' in userJuan1 &&
            userJuan1.licence_start === null &&
            userJuan1.delegated_to === null
        ) {
            console.log("   ✔ Estado inicial correcto: propiedades presentes y en nulo.");
        } else {
            console.log("Juan en init:", userJuan1);
            throw new Error("Las propiedades de licencia no están en el objeto del usuario o no son nulas.");
        }

        // 3. Activar licencia de Juan delegando en Carlos (u4)
        console.log('📝 Configurando licencia activa para Juan delegando en Carlos (u4)...');
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const resConfigure = await fetch(`${backendUrl}/licences/configure`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                licenceStart: tomorrow.toISOString(),
                licenceEnd: nextWeek.toISOString(),
                delegatedTo: 'u4',
                notes: 'Licencia para test de ABM'
            })
        });

        if (!resConfigure.ok) {
            const errData = await resConfigure.json();
            throw new Error(`Error configurando licencia: ${errData.message}`);
        }
        console.log("   ✔ Licencia guardada correctamente en backend.");

        // 4. Obtener datos iniciales del sistema de nuevo (para verificar que el caché se invalidó y devuelve el valor actualizado)
        console.log('📋 Consultando init de nuevo para verificar invalidación de caché...');
        const resInit2 = await fetch(`${backendUrl}/system/init`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const initData2 = await resInit2.json();
        const userJuan2 = initData2.users.find(u => u.id === 'u2');

        if (!userJuan2) {
            throw new Error("No se encontró a Juan (u2) en la segunda consulta.");
        }

        // Verificar que los datos reflejen la licencia activa
        if (
            userJuan2.delegated_to === 'u4' &&
            userJuan2.licence_start !== null &&
            userJuan2.licence_end !== null
        ) {
            console.log(`   ✔ ÉXITO: Los datos de la licencia se actualizaron en /system/init.`);
            console.log(`     Delegado: ${userJuan2.delegated_to}`);
            console.log(`     Inicio: ${userJuan2.licence_start}`);
            console.log(`     Fin: ${userJuan2.licence_end}`);
        } else {
            console.log("Juan en segunda consulta de init:", userJuan2);
            throw new Error("Fallo: La segunda consulta de init no devolvió los datos actualizados de la licencia. El caché podría no haberse invalidado o el query no trae los datos.");
        }

        // Limpiar al terminar
        console.log('🧹 Limpiando licencia al terminar...');
        await pool.query('UPDATE users SET licence_start = NULL, licence_end = NULL, delegated_to = NULL WHERE id = "u2"');

        console.log("\n=== PRUEBA DE INTEGRACIÓN COMPLETADA CON ÉXITO (100% OK) ===");

    } catch (err) {
        console.error("❌ ERROR EN LA VERIFICACIÓN:", err.message);
        process.exit(1);
    } finally {
        pool.end();
    }
}

runTests();
