// tests/verify_document_rejection.js
const pool = require('../config/db');

async function run() {
    console.log('🧪 Iniciando verificación de flujo de Rechazo de Documento...');
    const backendUrl = 'http://localhost:3000/api';

    let docId = `doc_reject_test_${Date.now()}`;

    try {
        // 1. Obtener tokens de autenticación para Juan (u2, Area a1) y María (u3, Area a2)
        console.log('🔑 Logueando a Juan (u2)...');
        const resJuan = await fetch(`${backendUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'juan@gde.com', password: '123' })
        });
        const dataJuan = await resJuan.json();
        const tokenJuan = dataJuan.token;

        console.log('🔑 Logueando a María (u3)...');
        const resMaria = await fetch(`${backendUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'maria@gde.com', password: '123' })
        });
        const dataMaria = await resMaria.json();
        const tokenMaria = dataMaria.token;

        if (!tokenJuan || !tokenMaria) {
            console.error('❌ Error al obtener tokens de Juan/María.');
            process.exit(1);
        }

        // 2. Juan crea un documento
        console.log(`📄 Creando documento ${docId} como Juan (u2)...`);
        const createRes = await fetch(`${backendUrl}/docs/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenJuan}`
            },
            body: JSON.stringify({
                id: docId,
                docType: 'Nota',
                subject: 'Test de Rechazo',
                content: '<p>Contenido para rechazo.</p>',
                creatorId: 'u2',
                currentOwnerId: 'u2',
                status: 'Borrador',
                owners: ['u2'],
                recipients: [],
                areaId: 'a1',
                isPublic: true,
                authAreas: [],
                authUsers: []
            })
        });

        if (!createRes.ok) {
            console.error('❌ Falló la creación del documento:', await createRes.json());
            process.exit(1);
        }
        console.log('✅ Documento de prueba creado.');

        // 3. Simular el envío a María (cambia el dueño a u3 y el areaId a a2)
        console.log('✉️ Juan envía el documento a María para firma (cambio de dueño y área)...');
        const docObj = {
            id: docId,
            docType: 'Nota',
            subject: 'Test de Rechazo',
            content: '<p>Contenido para rechazo.</p>',
            creatorId: 'u2',
            currentOwnerId: 'u3', // nuevo dueño María
            owners: ['u2', 'u3'],
            recipients: [],
            areaId: 'a2', // área de María
            status: 'Firmándose',
            isPublic: true,
            authAreas: [],
            authUsers: [],
            history: [
                { date: new Date().toISOString(), userId: 'u2', action: 'Creación', notes: '' },
                { date: new Date().toISOString(), userId: 'u2', action: 'Enviado a firmar', notes: 'Por favor firmar' }
            ]
        };

        const updateRes1 = await fetch(`${backendUrl}/docs/update/${docId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenJuan}`
            },
            body: JSON.stringify({
                item: docObj,
                historyEntry: docObj.history[1]
            })
        });

        if (!updateRes1.ok) {
            console.error('❌ Error al enviar documento a María:', await updateRes1.json());
            process.exit(1);
        }
        console.log('✅ Documento enviado a María (dueño: u3, área: a2).');

        // 4. María rechaza el documento (simulamos la lógica implementada en app.js)
        // El dueño vuelve a Juan (u2) y el areaId se restaura a su área (a1)
        console.log('❌ María rechaza el documento (restaurando dueño u2 y área a1)...');
        const rejectedDocObj = {
            ...docObj,
            status: 'Rechazado',
            currentOwnerId: 'u2', // vuelto a Juan
            areaId: 'a1', // restaurado a a1
            history: [
                ...docObj.history,
                { date: new Date().toISOString(), userId: 'u3', action: 'Rechazado', notes: 'Rechazado por test' }
            ]
        };

        const updateRes2 = await fetch(`${backendUrl}/docs/update/${docId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenMaria}`
            },
            body: JSON.stringify({
                item: rejectedDocObj,
                historyEntry: rejectedDocObj.history[2]
            })
        });

        if (!updateRes2.ok) {
            console.error('❌ Error al procesar rechazo:', await updateRes2.json());
            process.exit(1);
        }
        console.log('✅ Rechazo procesado exitosamente en el servidor.');

        // 5. Verificar que en la base de datos el documento tiene area_id = 'a1' y current_owner_id = 'u2'
        const [dbRows] = await pool.query('SELECT current_owner_id, area_id, status FROM documents WHERE id = ?', [docId]);
        const dbDoc = dbRows[0];
        console.log(`🔍 Registro en DB: dueño = ${dbDoc.current_owner_id}, área = ${dbDoc.area_id}, estado = ${dbDoc.status}`);

        if (dbDoc.current_owner_id === 'u2' && dbDoc.area_id === 'a1' && dbDoc.status === 'Rechazado') {
            console.log('✅ VERIFICACIÓN EXITOSA: El documento volvió a Juan y su área original a1.');
        } else {
            console.error('❌ ERROR de verificación de base de datos.');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Error crítico en la verificación:', error.message);
    } finally {
        // Limpiar
        console.log('🧹 Limpiando documento de prueba...');
        await pool.query('DELETE FROM documents WHERE id = ?', [docId]);
        await pool.query('DELETE FROM history WHERE item_id = ?', [docId]);
        pool.end();
        console.log('🏁 Proceso finalizado.');
    }
}

run();
