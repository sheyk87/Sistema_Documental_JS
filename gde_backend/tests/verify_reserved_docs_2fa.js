// tests/verify_reserved_docs_2fa.js
const pool = require('../config/db');
const crypto = require('crypto');

function base32ToBuffer(base32) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleanStr = base32.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
    let bits = 0;
    let value = 0;
    const output = [];
    for (let i = 0; i < cleanStr.length; i++) {
        const val = alphabet.indexOf(cleanStr[i]);
        if (val === -1) throw new Error("Invalid base32 character");
        value = (value << 5) | val;
        bits += 5;
        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(output);
}

function generateTOTP(secret, windowOffset = 0) {
    const key = base32ToBuffer(secret);
    const time = Math.floor(Date.now() / 1000 / 30) + windowOffset;
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeUInt32BE(Math.floor(time / 0x100000000), 0);
    timeBuffer.writeUInt32BE(time & 0xffffffff, 4);
    
    const hmac = crypto.createHmac('sha1', key).update(timeBuffer).digest();
    const offset = hmac[19] & 0xf;
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
    return code.toString().padStart(6, '0');
}

async function run() {
    console.log('🧪 Iniciando verificación de Clasificación de Seguridad y Firma con 2FA...');
    const backendUrl = 'http://localhost:3000/api';
    const TEST_SECRET = 'JBSWY3DPEHPK3PXP'; // Secret base32 para TOTP

    let docId = `doc_reserved_${Date.now()}`;
    let backupUser2FA = null;

    try {
        // 1. Obtener tokens de autenticación para Juan (u2) y María (u3)
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
            console.error('❌ Error al obtener tokens de autenticación.');
            process.exit(1);
        }

        // 2. Configurar temporalmente a Juan con 2FA activo y secreto conocido
        console.log('🔒 Activando temporalmente 2FA para Juan (u2) en la DB...');
        const [userRows] = await pool.query('SELECT two_factor_enabled, two_factor_secret FROM users WHERE id = "u2"');
        backupUser2FA = userRows[0];

        await pool.query(
            'UPDATE users SET two_factor_enabled = 1, two_factor_secret = ? WHERE id = "u2"',
            [TEST_SECRET]
        );

        // 3. Crear documento reservado (isPublic = false) como Juan
        console.log(`📄 Creando documento reservado ${docId} como Juan...`);
        const createRes = await fetch(`${backendUrl}/docs/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenJuan}`
            },
            body: JSON.stringify({
                id: docId,
                docType: 'Nota',
                subject: 'Documento Reservado Test',
                content: '<p>Contenido secreto reservado.</p>',
                creatorId: 'u2',
                currentOwnerId: 'u2',
                status: 'Borrador',
                owners: ['u2'],
                recipients: [],
                areaId: 'a1',
                isPublic: false,
                authAreas: [],
                authUsers: [] // Nadie más está autorizado
            })
        });

        if (!createRes.ok) {
            console.error('❌ Falló la creación del documento reservado:', createRes.status, await createRes.json());
            process.exit(1);
        }
        console.log('✅ Documento reservado creado correctamente.');

        // 4. María intenta leer el documento (debe retornar 403 Forbidden)
        console.log('🔍 María intenta leer el documento directamente (debe dar 403)...');
        const readRes = await fetch(`${backendUrl}/docs/download-static/${docId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${tokenMaria}` }
        });

        console.log('Código HTTP al leer:', readRes.status);
        if (readRes.status === 403) {
            console.log('✅ BLOQUEO CORRECTO: María no tiene acceso de lectura.');
        } else {
            console.error('❌ ERROR: María pudo leer o recibió código distinto a 403:', readRes.status);
        }

        // 5. Simular firma de Juan sin código 2FA (debe dar 400 Bad Request)
        console.log('✍️ Juan intenta firmar el documento sin pasar código 2FA (debe dar 400)...');
        const formNo2FA = new FormData();
        formNo2FA.append('pdf', new Blob(['fake-pdf'], { type: 'application/pdf' }), 'fake.pdf');
        formNo2FA.append('documentData', JSON.stringify({
            id: docId, docType: 'Nota', subject: 'Documento Reservado Test', isPublic: false
        }));
        formNo2FA.append('historyEntry', JSON.stringify({
            userId: 'u2', action: 'Firma Directa', notes: 'Firma de prueba'
        }));

        const signNo2FARes = await fetch(`${backendUrl}/docs/sign-final/${docId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tokenJuan}` },
            body: formNo2FA
        });

        console.log('Código HTTP sin 2FA:', signNo2FARes.status);
        const signNo2FAData = await signNo2FARes.json();
        console.log('Respuesta:', signNo2FAData.message);
        if (signNo2FARes.status === 400) {
            console.log('✅ BLOQUEO CORRECTO: Se requiere código 2FA.');
        } else {
            console.error('❌ ERROR: Se esperaba 400 y se obtuvo:', signNo2FARes.status);
        }

        // 6. Simular firma de Juan con código 2FA incorrecto (debe dar 401 Unauthorized)
        console.log('✍️ Juan intenta firmar con un código 2FA incorrecto "111111" (debe dar 401)...');
        const formBad2FA = new FormData();
        formBad2FA.append('pdf', new Blob(['fake-pdf'], { type: 'application/pdf' }), 'fake.pdf');
        formBad2FA.append('documentData', JSON.stringify({
            id: docId, docType: 'Nota', subject: 'Documento Reservado Test', isPublic: false
        }));
        formBad2FA.append('historyEntry', JSON.stringify({
            userId: 'u2', action: 'Firma Directa', notes: 'Firma de prueba'
        }));
        formBad2FA.append('twoFactorCode', '111111');

        const signBad2FARes = await fetch(`${backendUrl}/docs/sign-final/${docId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tokenJuan}` },
            body: formBad2FA
        });

        console.log('Código HTTP con 2FA incorrecto:', signBad2FARes.status);
        const signBad2FAData = await signBad2FARes.json();
        console.log('Respuesta:', signBad2FAData.message);
        if (signBad2FARes.status === 401) {
            console.log('✅ BLOQUEO CORRECTO: Código incorrecto rechazado.');
        } else {
            console.error('❌ ERROR: Se esperaba 401 y se obtuvo:', signBad2FARes.status);
        }

        // 7. Simular firma de Juan con código 2FA correcto (debe dar 202 Accepted)
        console.log('✍️ Juan intenta firmar con un código 2FA correcto generado por otplib...');
        const correctCode = generateTOTP(TEST_SECRET);
        console.log(`Código 2FA generado: ${correctCode}`);

        const formGood2FA = new FormData();
        formGood2FA.append('pdf', new Blob(['fake-pdf'], { type: 'application/pdf' }), 'fake.pdf');
        formGood2FA.append('documentData', JSON.stringify({
            id: docId, docType: 'Nota', subject: 'Documento Reservado Test', isPublic: false
        }));
        formGood2FA.append('historyEntry', JSON.stringify({
            userId: 'u2', action: 'Firma Directa', notes: 'Firma de prueba'
        }));
        formGood2FA.append('twoFactorCode', correctCode);

        const signGood2FARes = await fetch(`${backendUrl}/docs/sign-final/${docId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tokenJuan}` },
            body: formGood2FA
        });

        console.log('Código HTTP con 2FA correcto:', signGood2FARes.status);
        const signGood2FAData = await signGood2FARes.json();
        console.log('Respuesta:', signGood2FAData);
        if (signGood2FARes.status === 202) {
            console.log('✅ FIRMA EXITOSA: Documento encolado correctamente para firmar.');
        } else {
            console.error('❌ ERROR: Se esperaba 202 y se obtuvo:', signGood2FARes.status);
        }

    } catch (error) {
        console.error('❌ Error crítico en la verificación:', error.message);
    } finally {
        // Restaurar estado de 2FA de Juan
        if (backupUser2FA) {
            console.log('🧹 Restaurando estado 2FA de Juan...');
            await pool.query(
                'UPDATE users SET two_factor_enabled = ?, two_factor_secret = ? WHERE id = "u2"',
                [backupUser2FA.two_factor_enabled, backupUser2FA.two_factor_secret]
            );
        }

        // Limpiar documento de prueba
        console.log('🧹 Limpiando documento de prueba...');
        await pool.query('DELETE FROM documents WHERE id = ?', [docId]);
        await pool.query('DELETE FROM history WHERE item_id = ?', [docId]);

        pool.end();
        console.log('🏁 Proceso finalizado.');
    }
}

run();
