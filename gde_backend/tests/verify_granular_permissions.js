// tests/verify_granular_permissions.js
const pool = require('../config/db');
const bcrypt = require('bcrypt');

async function runTests() {
    console.log("=== INICIANDO PRUEBA DE INTEGRACIÓN: VERIFICACIÓN DE PERMISOS GRANULARES ===");
    const backendUrl = 'http://localhost:3000/api';

    try {
        // 1. Preparar en base de datos el rol 'Test' y el usuario 'Test'
        console.log('🧹 Inicializando rol y usuario "Test" en la BD...');
        
        // Crear rol 'Test' si no existe
        await pool.query('INSERT IGNORE INTO roles (id, name, description) VALUES ("Test", "Rol de Test", "Rol limitado para pruebas de permisos")');
        
        // Limpiar permisos previos del rol 'Test' y asignarle ÚNICAMENTE 'doc_create'
        await pool.query('DELETE FROM role_permissions WHERE role_id = "Test"');
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ("Test", "doc_create")');

        // Crear/Restaurar usuario 'Test' (id: u_test)
        const hashPass = await bcrypt.hash('S3qpkzm1!', 10);
        await pool.query('DELETE FROM user_roles WHERE user_id = "u_test"');
        await pool.query('DELETE FROM users WHERE id = "u_test"');
        await pool.query(`
            INSERT INTO users (id, name, email, password, area_id, role, status, must_change_password) 
            VALUES ("u_test", "Test", "test@gde.com", ?, "a1", "user", "active", 0)
        `, [hashPass]);
        await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ("u_test", "Test")');

        console.log('✅ Rol y usuario Test creados/configurados con contraseña: S3qpkzm1!');

        // 2. Iniciar sesión como usuario 'Test' para obtener su token
        console.log('🔑 Iniciando sesión como usuario Test...');
        const resLogin = await fetch(`${backendUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'test@gde.com', password: 'S3qpkzm1!' })
        });
        const loginData = await resLogin.json();
        const testToken = loginData.token;

        if (!testToken) {
            throw new Error("No se pudo iniciar sesión como usuario Test.");
        }
        console.log('✅ Sesión iniciada con éxito.');

        // Crear un documento de prueba en la base de datos para validar restricciones.
        // Lo crearemos asignando a 'u_test' como creador y dueño, para comprobar que
        // incluso siendo el propietario, se le bloquea por falta de permisos de operación (doc_edit, doc_sign, doc_delete, etc.)
        console.log('📝 Creando documento y expediente de prueba asociados al usuario Test...');
        const docId = 'doc_test_' + Date.now();
        await pool.query(`
            INSERT INTO documents (id, number, subject, content, creator_id, current_owner_id, status, is_public, doc_type)
            VALUES (?, 'DOC-TEST-123', 'Documento Prueba Permisos', 'Contenido inicial', 'u_test', 'u_test', 'Borrador', 1, 'SOLI')
        `, [docId]);

        const expId = 'exp_test_' + Date.now();
        await pool.query(`
            INSERT INTO expedientes (id, number, subject, creator_id, current_owner_id, status, is_public)
            VALUES (?, 'EXP-TEST-123', 'Expediente Prueba Permisos', 'u_test', 'u_test', 'iniciado', 1)
        `, [expId]);

        // --- PRUEBA 1: Intentar Visualizar Detalles de Documento (doc_read) ---
        console.log('\n🚫 Prueba 1: Intentar leer detalles de un documento sin doc_read...');
        const resReadDoc = await fetch(`${backendUrl}/docs/${docId}/content`, {
            headers: { 'Authorization': `Bearer ${testToken}` }
        });
        console.log(`Response Status: ${resReadDoc.status}`);
        if (resReadDoc.status === 403) {
            console.log("✅ Prueba 1 exitosa: El backend bloqueó el acceso de lectura.");
        } else {
            throw new Error(`Fallo en Prueba 1: Se esperaba 403, se obtuvo ${resReadDoc.status}`);
        }

        // --- PRUEBA 2: Intentar Editar Borrador de Documento (doc_edit) ---
        console.log('\n🚫 Prueba 2: Intentar editar borrador sin doc_edit...');
        const resEditDoc = await fetch(`${backendUrl}/docs/update/${docId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ item: { subject: 'Editado', content: 'Contenido editado' } })
        });
        console.log(`Response Status: ${resEditDoc.status}`);
        if (resEditDoc.status === 403) {
            console.log("✅ Prueba 2 exitosa: El backend bloqueó la edición.");
        } else {
            throw new Error(`Fallo en Prueba 2: Se esperaba 403, se obtuvo ${resEditDoc.status}`);
        }

        // --- PRUEBA 3: Intentar Firmar Documento (doc_sign) ---
        console.log('\n🚫 Prueba 3: Intentar firmar documento sin doc_sign...');
        const resSignDoc = await fetch(`${backendUrl}/docs/sign-final/${docId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${testToken}` }
        });
        console.log(`Response Status: ${resSignDoc.status}`);
        if (resSignDoc.status === 403) {
            console.log("✅ Prueba 3 exitosa: El backend bloqueó la firma.");
        } else {
            throw new Error(`Fallo en Prueba 3: Se esperaba 403, se obtuvo ${resSignDoc.status}`);
        }

        // --- PRUEBA 4: Intentar Eliminar Borrador de Documento (doc_delete) ---
        console.log('\n🚫 Prueba 4: Intentar eliminar borrador sin doc_delete...');
        const resDeleteDoc = await fetch(`${backendUrl}/docs/delete/${docId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${testToken}` }
        });
        console.log(`Response Status: ${resDeleteDoc.status}`);
        if (resDeleteDoc.status === 403) {
            console.log("✅ Prueba 4 exitosa: El backend bloqueó la eliminación.");
        } else {
            throw new Error(`Fallo en Prueba 4: Se esperaba 403, se obtuvo ${resDeleteDoc.status}`);
        }

        // --- PRUEBA 5: Intentar Realizar Pase de Expediente (exp_pase) ---
        console.log('\n🚫 Prueba 5: Intentar realizar pase de expediente sin exp_pase o exp_read...');
        const resPaseExp = await fetch(`${backendUrl}/exps/${expId}/pase`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ receiverId: 'u2', notes: 'Pase de test' })
        });
        console.log(`Response Status: ${resPaseExp.status}`);
        if (resPaseExp.status === 403) {
            console.log("✅ Prueba 5 exitosa: El backend bloqueó el pase.");
        } else {
            throw new Error(`Fallo en Prueba 5: Se esperaba 403, se obtuvo ${resPaseExp.status}`);
        }

        // --- PRUEBA 6: Intentar operaciones administrativas sin permisos de administración ---
        console.log('\n🚫 Prueba 6: Intentar crear un rol administrativo sin admin_manage_roles...');
        const resCreateRole = await fetch(`${backendUrl}/roles/create`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id: 'bad_role', name: 'Malo', permissions: [] })
        });
        console.log(`Response Status: ${resCreateRole.status}`);
        if (resCreateRole.status === 403) {
            console.log("✅ Prueba 6 exitosa: El backend bloqueó la creación de roles.");
        } else {
            throw new Error(`Fallo en Prueba 6: Se esperaba 403, se obtuvo ${resCreateRole.status}`);
        }

        // Limpieza de datos temporales
        console.log('\n🧹 Limpiando documentos y expedientes temporales creados para las pruebas...');
        await pool.query('DELETE FROM documents WHERE id = ?', [docId]);
        await pool.query('DELETE FROM expedientes WHERE id = ?', [expId]);
        console.log('✅ Datos de prueba limpiados de la base de datos.');

        console.log("\n=== TODAS LAS PRUEBAS DE INTEGRACIÓN PASARON CON ÉXITO ===");

    } catch (err) {
        console.error("\n❌ ERROR EN LA VERIFICACIÓN:", err.message);
        process.exit(1);
    } finally {
        pool.end();
    }
}

runTests();
