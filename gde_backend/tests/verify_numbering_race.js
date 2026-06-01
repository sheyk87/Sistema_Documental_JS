// tests/verify_numbering_race.js
// Script de prueba de concurrencia extrema para validar la Fase 2 (Numeración Atómica y Correlatividad)

const pool = require('../config/db');

async function runRaceVerification() {
    console.log('🧪 Iniciando verificación de concurrencia de la Fase 2...');
    let passed = true;

    try {
        const backendUrl = 'http://localhost:3000/api';

        console.log('🔑 Obteniendo credenciales de Juan (User 1)...');
        const resJuan = await fetch(`${backendUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'juan@gde.com', password: '123' })
        });
        const dataJuan = await resJuan.json();
        const tokenJuan = dataJuan.token;

        if (!tokenJuan) {
            console.error('❌ No se pudo obtener el token de Juan. Asegúrese de que el backend esté arriba.');
            process.exit(1);
        }

        const CONCURRENT_REQUESTS = 50;
        const docPrefix = `doc_race_${Date.now()}`;
        const docIds = [];

        console.log(`📄 Creando ${CONCURRENT_REQUESTS} borradores de prueba en la base de datos...`);
        for (let i = 1; i <= CONCURRENT_REQUESTS; i++) {
            const docId = `${docPrefix}_${i}`;
            docIds.push(docId);

            // Insertamos directamente en base de datos para velocidad
            await pool.query(
                `INSERT INTO documents (id, number, doc_type, subject, content, creator_id, current_owner_id, status, owners, recipients, area_id)
                 VALUES (?, NULL, 'Nota', ?, '<p>Contenido</p>', 'u2', 'u2', 'Borrador', '["u2"]', '[]', 'a1')`,
                [docId, `Documento Concurrente ${i}`]
            );
        }

        console.log(`⚡ Disparando ${CONCURRENT_REQUESTS} peticiones de foliación en paralelo de forma concurrente...`);
        
        // Ejecutamos Promise.all para forzar concurrencia a nivel de thread de red
        const requests = docIds.map(docId => {
            return fetch(`${backendUrl}/docs/assign-number/${docId}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${tokenJuan}` }
            }).then(async res => {
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(`Fallo en asignación de ${docId}: ${err.message}`);
                }
                return res.json();
            });
        });

        const results = await Promise.all(requests);
        console.log('✅ Todas las llamadas concurrentes finalizaron.');

        // 3. Validaciones de consistencia
        const numbers = results.map(r => r.number);
        console.log('📋 Números generados:');
        console.log(numbers);

        // Validar unicidad
        const uniqueNumbers = new Set(numbers);
        if (uniqueNumbers.size === CONCURRENT_REQUESTS) {
            console.log('✅ UNICIDAD COMPLETA: Todos los números correlativos generados son únicos.');
        } else {
            console.error(`❌ ERROR DE DUPLICADOS: Solo ${uniqueNumbers.size} de ${CONCURRENT_REQUESTS} números son únicos.`);
            passed = false;
        }

        // Validar formato (NO-YYYY-XXXXXX-Dirección General)
        const year = new Date().getFullYear();
        const formatRegex = new RegExp(`^NO-${year}-\\d{6}-Dirección General$`);
        const invalidFormats = numbers.filter(n => !formatRegex.test(n));

        if (invalidFormats.length === 0) {
            console.log('✅ FORMATO CORRECTO: Todos los números cumplen con la estructura [PREFIX]-[AÑO]-[NroPadded]-[AREA].');
        } else {
            console.error('❌ ERROR DE FORMATO en los siguientes números:', invalidFormats);
            passed = false;
        }

        // Validar correlatividad consecutiva
        // Extraemos la parte numérica y las ordenamos
        const sequenceNumbers = numbers
            .map(n => parseInt(n.split('-')[2], 10))
            .sort((a, b) => a - b);

        console.log(`🔢 Secuencia correlativa ordenada: ${sequenceNumbers[0]} hasta ${sequenceNumbers[sequenceNumbers.length - 1]}`);

        // Verificamos que no haya saltos
        let gapDetected = false;
        for (let i = 1; i < sequenceNumbers.length; i++) {
            if (sequenceNumbers[i] !== sequenceNumbers[i - 1] + 1) {
                console.error(`❌ HUECO/SALTO DETECTADO: Entre ${sequenceNumbers[i - 1]} y ${sequenceNumbers[i]}`);
                gapDetected = true;
                passed = false;
            }
        }

        if (!gapDetected) {
            console.log('✅ SECUENCIA PERFECTA: No se detectó ningún salto ni duplicación en la numeración asignada.');
        }

        // 4. Limpieza
        console.log('🧹 Limpiando los documentos concurrentes creados...');
        await pool.query('DELETE FROM documents WHERE id LIKE ?', [`${docPrefix}%`]);

        if (passed) {
            console.log('🎉 🎉 LA FASE 2 PASÓ CON ÉXITO! El motor de numeración es 100% atómico y seguro bajo stress concurrente.');
            process.exit(0);
        } else {
            console.error('❌ LA VERIFICACIÓN FALLÓ.');
            process.exit(1);
        }

    } catch (e) {
        console.error('❌ Error catastrófico en la ejecución del test concurrente:', e.message);
        process.exit(1);
    }
}

runRaceVerification();
