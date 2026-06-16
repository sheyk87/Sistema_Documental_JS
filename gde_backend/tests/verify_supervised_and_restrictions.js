// tests/verify_supervised_and_restrictions.js
const pool = require('../config/db');
const bcrypt = require('bcrypt');

const originalFetch = global.fetch;
global.fetch = function(url, options = {}) {
    options.headers = options.headers || {};
    options.headers['x-stress-bypass'] = 'STRESS_BYPASS_TOKEN_2026';
    return originalFetch(url, options);
};

async function runTests() {
    console.log("=== INICIANDO PRUEBA DE INTEGRACIÓN: SUPERVISADOS Y RESTRICCIONES DE CREACIÓN ===");
    const backendUrl = 'http://localhost:3000/api';

    try {
        console.log('🧹 Limpiando y preparando base de datos...');
        // Limpiar registros antiguos de pruebas anteriores si existen
        await pool.query('DELETE FROM notifications WHERE user_id IN ("u_sub", "u_sup") OR sender_id IN ("u_sub", "u_sup")');
        await pool.query('DELETE FROM history WHERE user_id IN ("u_sub", "u_sup")');
        await pool.query('DELETE FROM expediente_movements WHERE sender_id IN ("u_sub", "u_sup") OR receiver_id IN ("u_sub", "u_sup")');
        await pool.query('DELETE FROM expedientes WHERE creator_id IN ("u_sub", "u_sup") OR current_owner_id IN ("u_sub", "u_sup")');
        await pool.query('DELETE FROM documents WHERE creator_id IN ("u_sub", "u_sup") OR current_owner_id IN ("u_sub", "u_sup")');
        await pool.query('DELETE FROM user_roles WHERE user_id IN ("u_sub", "u_sup")');
        await pool.query('DELETE FROM users WHERE id IN ("u_sub", "u_sup")');

        // Crear roles sup_role y sub_role si no existen
        await pool.query('INSERT IGNORE INTO roles (id, name, description) VALUES ("sup_role", "Rol Superior Test", "Rol para superior")');
        await pool.query('INSERT IGNORE INTO roles (id, name, description) VALUES ("sub_role", "Rol Subordinado Test", "Rol para subordinado")');
        await pool.query('DELETE FROM role_permissions WHERE role_id IN ("sup_role", "sub_role")');
        await pool.query(`
            INSERT INTO role_permissions (role_id, permission_id) VALUES 
            ("sup_role", "doc_create"),
            ("sup_role", "doc_edit"),
            ("sup_role", "doc_read"),
            ("sup_role", "doc_sign"),
            ("sup_role", "doc_send_sign"),
            ("sup_role", "doc_derive"),
            ("sup_role", "exp_create"),
            ("sup_role", "exp_read"),
            ("sup_role", "exp_write"),
            ("sup_role", "exp_pase"),
            
            ("sub_role", "doc_create"),
            ("sub_role", "doc_edit"),
            ("sub_role", "doc_read"),
            ("sub_role", "doc_sign"),
            ("sub_role", "doc_send_sign"),
            ("sub_role", "doc_derive"),
            ("sub_role", "exp_read"),
            ("sub_role", "exp_write"),
            ("sub_role", "exp_pase")
        `);

        const hashPass = await bcrypt.hash('S3qpkzm1!', 10);

        // Crear usuario Superior
        await pool.query(`
            INSERT INTO users (id, name, email, password, area_id, role, status, must_change_password)
            VALUES ("u_sup", "Superior Test", "superior@gde.com", ?, "a1", "user", "active", 0)
        `, [hashPass]);
        await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ("u_sup", "sup_role")');

        // Crear usuario Subordinado (designándole u_sup como superior, con restricciones: allowed_doc_types = ["Nota"] y can_create_expedientes = 0)
        await pool.query(`
            INSERT INTO users (id, name, email, password, area_id, role, status, must_change_password, superior_id, can_create_expedientes, allowed_doc_types)
            VALUES ("u_sub", "Subordinado Test", "subordinado@gde.com", ?, "a1", "user", "active", 0, "u_sup", 0, '["Nota"]')
        `, [hashPass]);
        await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ("u_sub", "sub_role")');

        console.log('✅ Usuarios de test creados.');

        // Iniciar sesión para ambos usuarios
        console.log('🔑 Iniciando sesión de los usuarios...');
        const resSubLogin = await fetch(`${backendUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'subordinado@gde.com', password: 'S3qpkzm1!' })
        });
        const subLoginData = await resSubLogin.json();
        const subToken = subLoginData.token;

        const resSupLogin = await fetch(`${backendUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'superior@gde.com', password: 'S3qpkzm1!' })
        });
        const supLoginData = await resSupLogin.json();
        const supToken = supLoginData.token;

        if (!subToken || !supToken) {
            console.error('Sub Login Response:', subLoginData);
            console.error('Sup Login Response:', supLoginData);
            throw new Error("Fallo al iniciar sesión.");
        }
        console.log('✅ Sesiones iniciadas.');

        // --- PRUEBA 1: Restricción allowed_doc_types ---
        console.log('\n🚫 Prueba 1a: Subordinado intenta crear documento tipo "Circular" (no permitido)...');
        const resCreateCircular = await fetch(`${backendUrl}/docs/create`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${subToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: `doc_test_circ_${Date.now()}`,
                creatorId: 'u_sub',
                currentOwnerId: 'u_sub',
                owners: ['u_sub'],
                status: 'Borrador',
                areaId: 'a1',
                subject: 'Test Circular',
                content: 'Test content',
                docType: 'Circular',
                isPublic: true,
                recipients: []
            })
        });
        console.log(`Response Status: ${resCreateCircular.status}`);
        if (resCreateCircular.status === 403) {
            console.log("✅ Prueba 1a exitosa: El backend denegó la creación de Circular.");
        } else {
            throw new Error(`Fallo en Prueba 1a: Se esperaba 403, se obtuvo ${resCreateCircular.status}`);
        }

        console.log('\n📝 Prueba 1b: Subordinado intenta crear documento tipo "Nota" (permitido)...');
        const docId = `doc_test_nota_${Date.now()}`;
        const resCreateNota = await fetch(`${backendUrl}/docs/create`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${subToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: docId,
                creatorId: 'u_sub',
                currentOwnerId: 'u_sub',
                owners: ['u_sub'],
                status: 'Borrador',
                areaId: 'a1',
                subject: 'Test Nota',
                content: 'Test content',
                docType: 'Nota',
                isPublic: true,
                recipients: []
            })
        });
        console.log(`Response Status: ${resCreateNota.status}`);
        if (resCreateNota.status === 201 || resCreateNota.status === 200) {
            console.log("✅ Prueba 1b exitosa: El backend permitió la creación de Nota.");
        } else {
            throw new Error(`Fallo en Prueba 1b: Se esperaba 201, se obtuvo ${resCreateNota.status}`);
        }

        // --- PRUEBA 2: Restricción can_create_expedientes ---
        console.log('\n🚫 Prueba 2a: Subordinado intenta crear expediente (can_create_expedientes = 0)...');
        const resCreateExp = await fetch(`${backendUrl}/exps/create`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${subToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: `exp_test_fail_${Date.now()}`,
                creatorId: 'u_sub',
                currentOwnerId: 'u_sub',
                status: 'En Tramite',
                areaId: 'a1',
                subject: 'Test Expediente',
                isPublic: true
            })
        });
        console.log(`Response Status: ${resCreateExp.status}`);
        if (resCreateExp.status === 403) {
            console.log("✅ Prueba 2a exitosa: El backend denegó la creación de expediente.");
        } else {
            throw new Error(`Fallo en Prueba 2a: Se esperaba 403, se obtuvo ${resCreateExp.status}`);
        }

        // --- PRUEBA 3: Acceso de Superior a Trámites de Subordinado ---
        console.log('\n🔍 Prueba 3a: Superior intenta leer el documento del subordinado...');
        const resReadDoc = await fetch(`${backendUrl}/docs/${docId}/content`, {
            headers: { 'Authorization': `Bearer ${supToken}` }
        });
        console.log(`Response Status: ${resReadDoc.status}`);
        if (resReadDoc.status === 200) {
            console.log("✅ Prueba 3a exitosa: El superior pudo leer el documento de su subordinado.");
        } else {
            throw new Error(`Fallo en Prueba 3a: Se esperaba 200, se obtuvo ${resReadDoc.status}`);
        }

        console.log('\n🔄 Prueba 3b: Superior intenta reasignarse (derivar a sí mismo) el documento del subordinado...');
        const resReassignDoc = await fetch(`${backendUrl}/docs/update/${docId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${supToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                item: {
                    id: docId,
                    currentOwnerId: 'u_sup',
                    owners: ['u_sup'],
                    status: 'Borrador'
                }
            })
        });
        console.log(`Response Status: ${resReassignDoc.status}`);
        if (resReassignDoc.status === 200) {
            console.log("✅ Prueba 3b exitosa: El superior pudo autoasignarse el documento.");
        } else {
            throw new Error(`Fallo en Prueba 3b: Se esperaba 200, se obtuvo ${resReassignDoc.status}`);
        }

        // --- PRUEBA 4: Notificaciones de superior ---
        console.log('\n🔔 Prueba 4: Verificar notificaciones registradas en BD tras designación de superior...');
        // Al actualizar el superior mediante la API, se envían notificaciones.
        // Vamos a disparar una actualización de superior a través de la API para el subordinado
        console.log('🔄 Cambiando superior de u_sub a NULL via API...');
        const resUpdateProfile = await fetch(`${backendUrl}/users/profile`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${subToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'subordinado@gde.com',
                superiorId: null,
                webNotifications: true,
                emailNotifications: true
            })
        });
        console.log(`Response Status: ${resUpdateProfile.status}`);
        if (resUpdateProfile.status !== 200) {
            throw new Error(`Error actualizando perfil: ${resUpdateProfile.status}`);
        }

        console.log('🔄 Asignando de nuevo u_sup como superior via API...');
        const resUpdateProfile2 = await fetch(`${backendUrl}/users/profile`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${subToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'subordinado@gde.com',
                superiorId: 'u_sup',
                webNotifications: true,
                emailNotifications: true
            })
        });
        console.log(`Response Status: ${resUpdateProfile2.status}`);
        if (resUpdateProfile2.status !== 200) {
            throw new Error(`Error asignando superior: ${resUpdateProfile2.status}`);
        }

        // Consultar notificaciones en BD
        const [notifs] = await pool.query('SELECT * FROM notifications WHERE user_id IN ("u_sub", "u_sup") ORDER BY id DESC');
        console.log(`Notificaciones encontradas: ${notifs.length}`);
        const subNotif = notifs.find(n => n.user_id === 'u_sub' && n.action === 'superior_designado');
        const supNotif = notifs.find(n => n.user_id === 'u_sup' && n.action === 'subordinado_designado');

        if (subNotif && supNotif) {
            console.log("✅ Prueba 4 exitosa: Se encontraron notificaciones para subordinado y superior.");
            console.log(`  Subordinado Notif: "${subNotif.message}"`);
            console.log(`  Superior Notif: "${supNotif.message}"`);
        } else {
            throw new Error("Fallo en Prueba 4: No se encontraron las notificaciones esperadas.");
        }

        // Limpieza de datos temporales
        console.log('\n🧹 Limpiando base de datos...');
        await pool.query('DELETE FROM notifications WHERE user_id IN ("u_sub", "u_sup") OR sender_id IN ("u_sub", "u_sup")');
        await pool.query('DELETE FROM history WHERE user_id IN ("u_sub", "u_sup")');
        await pool.query('DELETE FROM expediente_movements WHERE sender_id IN ("u_sub", "u_sup") OR receiver_id IN ("u_sub", "u_sup")');
        await pool.query('DELETE FROM expedientes WHERE creator_id IN ("u_sub", "u_sup") OR current_owner_id IN ("u_sub", "u_sup")');
        await pool.query('DELETE FROM documents WHERE creator_id IN ("u_sub", "u_sup") OR current_owner_id IN ("u_sub", "u_sup")');
        await pool.query('DELETE FROM user_roles WHERE user_id IN ("u_sub", "u_sup")');
        await pool.query('DELETE FROM users WHERE id IN ("u_sub", "u_sup")');
        await pool.query('DELETE FROM role_permissions WHERE role_id IN ("sup_role", "sub_role")');
        await pool.query('DELETE FROM roles WHERE id IN ("sup_role", "sub_role")');
        console.log('✅ Base de datos limpia.');

        console.log("\n=== TODAS LAS PRUEBAS DE SUPERVISADOS Y RESTRICCIONES PASARON CON ÉXITO ===");

    } catch (err) {
        console.error("\n❌ ERROR EN LA VERIFICACIÓN:", err.message);
        process.exit(1);
    } finally {
        pool.end();
    }
}

runTests();
