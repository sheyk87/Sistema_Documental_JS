// services/numberingService.js
const pool = require('../config/db');

/**
 * Obtiene el código abreviado de un tipo de documento
 */
async function getDocCode(docType) {
    if (docType === 'expediente' || docType === 'EX' || docType === 'exp') return 'EX';
    
    const docCodeMap = {
        'Memo': 'ME',
        'Nota': 'NO',
        'Informe': 'IF',
        'Acta': 'ACTA',
        'Resolucion': 'RESOL',
        'Disposicion': 'DISP',
        'Actuacion': 'ACTU',
        'Dictamen': 'DICT'
    };

    if (docCodeMap[docType]) {
        return docCodeMap[docType];
    }

    try {
        const [rows] = await pool.query('SELECT code FROM document_types WHERE name = ? LIMIT 1', [docType]);
        if (rows.length > 0) {
            return rows[0].code;
        }
    } catch (err) {
        console.error('[NumberingService] Error consultando document_types:', err);
    }

    // Fallback genérico
    return docType.toUpperCase().substring(0, 4);
}

/**
 * Obtiene el nombre del área
 */
async function getAreaName(areaId) {
    try {
        const [rows] = await pool.query('SELECT name FROM areas WHERE id = ? LIMIT 1', [areaId]);
        if (rows.length > 0) {
            return rows[0].name;
        }
    } catch (err) {
        console.error('[NumberingService] Error consultando áreas:', err);
    }
    return areaId; // Fallback al ID del área
}

/**
 * Genera el siguiente número transaccional atómico
 */
exports.getNextNumber = async (docType, areaId) => {
    const code = await getDocCode(docType);
    const year = new Date().getFullYear();
    const areaName = await getAreaName(areaId);

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Bloqueo exclusivo a nivel de fila (FOR UPDATE)
        const [rows] = await connection.query(
            'SELECT `last_value` FROM numbering_sequences WHERE doc_type = ? AND year = ? FOR UPDATE',
            [code, year]
        );

        let nextValue = 1;
        if (rows.length > 0) {
            nextValue = rows[0].last_value + 1;
            await connection.query(
                'UPDATE numbering_sequences SET `last_value` = ? WHERE doc_type = ? AND year = ?',
                [nextValue, code, year]
            );
        } else {
            await connection.query(
                'INSERT INTO numbering_sequences (doc_type, year, `last_value`) VALUES (?, ?, ?)',
                [code, year, nextValue]
            );
        }

        await connection.commit();

        // Formato final correlativo: NO-2026-000001-Sistemas
        const paddedValue = String(nextValue).padStart(6, '0');
        return `${code}-${year}-${paddedValue}-${areaName}`;

    } catch (error) {
        await connection.rollback();
        console.error('[NumberingService] Error en getNextNumber:', error);
        throw new Error('Error al generar el número correlativo atómico');
    } finally {
        connection.release();
    }
};
