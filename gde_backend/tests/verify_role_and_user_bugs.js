// tests/verify_role_and_user_bugs.js
const pool = require('../config/db');
const bcrypt = require('bcrypt');

async function runTests() {
    console.log("=== INICIANDO PRUEBA DE INTEGRACIÓN: CONTROL DE ROL Y ELIMINACIÓN DE USUARIOS ===");
    const backendUrl = 'http://localhost:3000/api';

    try {
        // Restaurar Juan Perez (u2) en la BD para asegurarnos de que existe
        console.log('🧹 Restableciendo usuario Juan Perez (u2) en la BD...');
        const hash = await bcrypt.hash('123', 10);
        await pool.query('DELETE FROM user_roles WHERE user_id = "u2"');
        await pool.query('DELETE FROM users WHERE id = "u2"');
        await pool.query('INSERT INTO users (id, name, email, password, area_id, role, status) VALUES ("u2", "Juan Perez", "juan@gde.com", ?, "a1", "user", "active")', [hash]);
        await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES ("u2", "user")');

        // 1. Iniciar sesión como Admin (u1)
        console.log('🔑 Iniciando sesión como Admin (u1)...');
        const resLogin = await fetch(`${backendUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@gde.com', password: '123' })
        });
        const loginData = await resLogin.json();
        const token = loginData.token;

        if (!token) {
            throw new Error("No se pudo iniciar sesión como administrador.");
        }

        // --- PRUEBA 1: Intentar eliminar un rol que está asignado a un usuario ---
        console.log('\n🛡️ Prueba 1: Intentar eliminar un rol en uso...');
        
        // El rol 'user' está asignado a varios usuarios (por ejemplo, u2, u3, u4)
        const resDeleteRole = await fetch(`${backendUrl}/roles/delete/user`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const deleteRoleData = await resDeleteRole.json();
        console.log(`Response Status: ${resDeleteRole.status}`);
        console.log(`Response Message: ${deleteRoleData.message}`);
        
        if (resDeleteRole.status === 400 && (deleteRoleData.message.includes('No se pueden eliminar los roles básicos') || deleteRoleData.message.includes('está asignado'))) {
            console.log("✅ Prueba 1 exitosa: El sistema protegió el rol básico/en uso.");
        } else {
            throw new Error("Fallo en Prueba 1: El sistema no bloqueó correctamente la eliminación del rol básico o en uso.");
        }

        // Crear un rol de prueba y asignarlo a un usuario para verificar el bloqueo dinámico
        console.log('\n🔨 Creando rol de prueba "temp_role" y asignándolo a un usuario...');
        // Limpiar posible residuo previo
        await pool.query('DELETE FROM roles WHERE id = "temp_role"');
        await pool.query('INSERT INTO roles (id, name, description) VALUES ("temp_role", "Rol Temporal", "Rol de prueba")');
        // Asignar rol a Juan (u2)
        await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES ("u2", "temp_role")');

        console.log('🗑️ Intentando eliminar "temp_role" que está asignado a Juan (u2)...');
        const resDeleteTempRole = await fetch(`${backendUrl}/roles/delete/temp_role`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}`
            }
        });
        const deleteTempRoleData = await resDeleteTempRole.json();
        console.log(`Response Status: ${resDeleteTempRole.status}`);
        console.log(`Response Message: ${deleteTempRoleData.message}`);

        if (resDeleteTempRole.status === 400 && deleteTempRoleData.message.includes('está asignado')) {
            console.log("✅ Prueba 1b exitosa: Se bloqueó la eliminación del rol personalizado asignado.");
        } else {
            throw new Error("Fallo en Prueba 1b: Se eliminó el rol a pesar de estar asignado a un usuario.");
        }

        // Limpiar asignación de rol
        await pool.query('DELETE FROM user_roles WHERE user_id = "u2" AND role_id = "temp_role"');
        console.log('🗑️ Intentando eliminar "temp_role" ahora que NO está asignado a nadie...');
        const resDeleteTempRole2 = await fetch(`${backendUrl}/roles/delete/temp_role`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}`
            }
        });
        console.log(`Response Status (sin asignación): ${resDeleteTempRole2.status}`);
        if (resDeleteTempRole2.status === 200) {
            console.log("✅ Prueba 1c exitosa: Se eliminó el rol sin problemas cuando no estaba asignado.");
        } else {
            throw new Error("Fallo en Prueba 1c: No se pudo eliminar el rol libre.");
        }

        // --- PRUEBA 2: Intentar eliminar un usuario con registros asociados (e.g. Juan u2 tiene documentos o expedientes) ---
        console.log('\n🛡️ Prueba 2: Intentar eliminar usuario "Juan" (u2) que posee documentos/expedientes...');
        
        // Crear un expediente temporal asociado a Juan (u2)
        console.log('📁 Creando un expediente temporal asignado a Juan (u2) para generar la clave foránea...');
        const expId = 'temp_exp_' + Date.now();
        await pool.query(
            `INSERT INTO expedientes (id, number, subject, creator_id, area_id, current_owner_id, status) 
             VALUES (?, ?, 'Expediente Prueba FK', 'u2', 'a1', 'u2', 'iniciado')`,
            [expId, 'EX-TEMP-' + Date.now()]
        );

        const resDeleteUser = await fetch(`${backendUrl}/users/delete/u2`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}`
            }
        });
        
        const deleteUserData = await resDeleteUser.json();
        console.log(`Response Status: ${resDeleteUser.status}`);
        console.log(`Response Message: ${deleteUserData.message}`);

        // Limpiar expediente temporal
        await pool.query('DELETE FROM expedientes WHERE id = ?', [expId]);

        if (resDeleteUser.status === 400 && deleteUserData.message.includes('No se puede eliminar el usuario')) {
            console.log("✅ Prueba 2 exitosa: Se devolvió error 400 con mensaje explicativo en lugar de error interno 500.");
        } else {
            throw new Error("Fallo en Prueba 2: Se esperaba estatus 400 con mensaje explicativo. Se obtuvo: " + resDeleteUser.status);
        }

        console.log("\n=== TODAS LAS PRUEBAS DE INTEGRACIÓN PASARON CON ÉXITO ===");

    } catch (err) {
        console.error("❌ ERROR EN LA VERIFICACIÓN:", err.message);
        process.exit(1);
    } finally {
        pool.end();
    }
}

runTests();
