const pool = require('../config/db');
const cryptoService = require('../services/cryptoService');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const crypto = require('crypto');
const ENCRYPTION_KEY = process.env.FILE_SECRET || 'unaclavesupersecretaexactamented'; // 32 bytes
const signatureService = require('../services/signatureService');

// Función blindada: Obtiene la hora del servidor forzada a Argentina y lista para MySQL
const getArgTime = () => {
    const d = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Argentina/Buenos_Aires"}));
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

exports.createDocument = async (req, res) => {
    // Ya no usamos el createdAt del frontend
    const { id, docType, subject, content, creatorId, currentOwnerId, owners, status, recipients } = req.body;
    try {
        const serverTime = getArgTime(); // Hora blindada
        
        await pool.query(
            `INSERT INTO documents (id, doc_type, subject, content, creator_id, current_owner_id, status, owners, recipients, signed_by, related_docs, signatories, attachments, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', '[]', ?)`,
            [id, docType, subject, content, creatorId, currentOwnerId, status, JSON.stringify(owners||[]), JSON.stringify(recipients||[]), serverTime]
        );
        await pool.query(
            `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) VALUES (?, 'documento', ?, 'Creación', 'Se generó borrador', ?)`,
            [id, creatorId, serverTime]
        );
        res.status(201).json({ message: 'Documento creado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al crear el documento' });
    }
};

exports.getAllDocuments = async (req, res) => {
    try {
        const [docs] = await pool.query('SELECT * FROM documents');
        const [history] = await pool.query("SELECT * FROM history WHERE item_type = 'documento' ORDER BY created_at ASC");
        
        const formattedDocs = docs.map(doc => {
            return {
                id: doc.id, type: 'documento', docType: doc.doc_type, subject: doc.subject, content: doc.content,
                creatorId: doc.creator_id, currentOwnerId: doc.current_owner_id, status: doc.status, number: doc.number, createdAt: doc.created_at,
                owners: typeof doc.owners === 'string' ? JSON.parse(doc.owners) : (doc.owners || []),
                recipients: typeof doc.recipients === 'string' ? JSON.parse(doc.recipients) : (doc.recipients || []),
                signedBy: typeof doc.signed_by === 'string' ? JSON.parse(doc.signed_by) : (doc.signed_by || []),
                relatedDocs: typeof doc.related_docs === 'string' ? JSON.parse(doc.related_docs) : (doc.related_docs || []),
                signatories: typeof doc.signatories === 'string' ? JSON.parse(doc.signatories) : (doc.signatories || []),
                attachments: typeof doc.attachments === 'string' ? JSON.parse(doc.attachments) : (doc.attachments || []), // <-- NUEVO
                history: history.filter(h => h.item_id === doc.id).map(h => ({
                    date: h.created_at, userId: h.user_id, action: h.action, notes: h.notes
                }))
            };
        });
        res.json(formattedDocs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener los documentos' });
    }
};

exports.updateDocument = async (req, res) => {
    const { item, historyEntry } = req.body;
    try {
        await pool.query(
            `UPDATE documents SET 
                subject = ?, content = ?, status = ?, current_owner_id = ?, 
                owners = ?, recipients = ?, signed_by = ?, related_docs = ?, signatories = ?, number = ?
             WHERE id = ?`,
            [
                item.subject, item.content, item.status, item.currentOwnerId,
                JSON.stringify(item.owners || []), JSON.stringify(item.recipients || []), 
                JSON.stringify(item.signedBy || []), JSON.stringify(item.relatedDocs || []), 
                JSON.stringify(item.signatories || []), item.number, item.id
            ]
        );

        if (historyEntry) {
            // Ignoramos historyEntry.date e insertamos la hora real del servidor
            await pool.query(
                `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) VALUES (?, 'documento', ?, ?, ?, ?)`,
                [item.id, historyEntry.userId, historyEntry.action, historyEntry.notes, getArgTime()]
            );
        }

        res.json({ message: 'Documento actualizado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar el documento' });
    }
};

// NUEVO: Subir archivo y Cifrarlo en el Servidor
exports.uploadAttachment = async (req, res) => {
    try {
        const { id } = req.params;
        const file = req.file;
        const userId = req.user.id; 

        if (!file) return res.status(400).json({ message: 'No se subió ningún archivo' });

        // 1. Configuración Criptográfica
        const iv = crypto.randomBytes(16); // Vector de inicialización único por archivo
        const ivHex = iv.toString('hex');
        // El nuevo nombre del archivo contendrá el IV para poder descifrarlo sin consultar la BD
        const encryptedFilename = `${ivHex}-${file.filename}.enc`; 
        const encryptedFilePath = path.join(__dirname, '../uploads', encryptedFilename);

        // 2. Ciframos el archivo usando Streams
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        const input = fs.createReadStream(file.path);
        const output = fs.createWriteStream(encryptedFilePath);

        await new Promise((resolve, reject) => {
            input.pipe(cipher).pipe(output);
            output.on('finish', resolve);
            output.on('error', reject);
        });

        // 3. Borramos el archivo original sin cifrar
        fs.unlinkSync(file.path);

        // 4. Guardamos la referencia en la Base de Datos
        const [rows] = await pool.query('SELECT attachments FROM documents WHERE id = ?', [id]);
        let attachments = typeof rows[0].attachments === 'string' ? JSON.parse(rows[0].attachments) : (rows[0].attachments || []);
        
        const newAttachment = { filename: encryptedFilename, originalname: file.originalname, size: file.size };
        attachments.push(newAttachment);

        await pool.query('UPDATE documents SET attachments = ? WHERE id = ?', [JSON.stringify(attachments), id]);
        await pool.query(
            `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) VALUES (?, 'documento', ?, 'Archivo Adjuntado (Cifrado)', ?, ?)`,
            [id, userId, file.originalname, getArgTime()]
        );

        res.json({ attachment: newAttachment });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al subir y cifrar el archivo' });
    }
};

// NUEVO: Eliminar archivo
exports.deleteAttachment = async (req, res) => {
    try {
        const { id, filename } = req.params;
        const userId = req.user.id;

        const [rows] = await pool.query('SELECT attachments FROM documents WHERE id = ?', [id]);
        let attachments = typeof rows[0].attachments === 'string' ? JSON.parse(rows[0].attachments) : (rows[0].attachments || []);
        
        const fileToDelete = attachments.find(a => a.filename === filename);
        if (fileToDelete) {
            // Borramos el archivo físico del disco
            const filePath = path.join(__dirname, '../uploads', filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        attachments = attachments.filter(a => a.filename !== filename);
        await pool.query('UPDATE documents SET attachments = ? WHERE id = ?', [JSON.stringify(attachments), id]);
        await pool.query(
            `INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) VALUES (?, 'documento', ?, 'Archivo Eliminado', ?, ?)`,
            [id, userId, fileToDelete ? fileToDelete.originalname : filename, getArgTime()]
        );

        res.json({ message: 'Archivo eliminado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al eliminar el archivo' });
    }
};

// NUEVO: Descargar archivo Descifrando "On the Fly"
exports.downloadAttachment = async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, '../uploads', filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'El archivo físico no existe en el servidor' });
        }

        // Extraemos el IV que escondimos en el nombre del archivo
        const parts = filename.split('-');
        const ivHex = parts[0];

        // Compatibilidad hacia atrás: si no tiene el formato de IV (archivos viejos), lo mandamos directo
        if (ivHex.length !== 32) {
            return res.download(filePath); 
        }

        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        const input = fs.createReadStream(filePath);

        // Configuramos las cabeceras para que el navegador lo interprete como descarga binaria
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename.substring(33).replace('.enc', '')}"`);

        // Desciframos y enviamos directamente al cliente (Stream)
        input.pipe(decipher).pipe(res);

    } catch (error) {
        console.error("Error en descarga:", error);
        res.status(500).json({ message: 'Error al descifrar y procesar la descarga' });
    }
};

// NUEVO: Eliminar Borrador y limpiar sus archivos adjuntos
exports.deleteDocument = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Buscamos el documento para ver si tiene adjuntos
        const [rows] = await pool.query('SELECT attachments, status FROM documents WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Documento no encontrado' });

        const doc = rows[0];

        // Medida de seguridad: Solo se pueden borrar físicamente los Borradores o Rechazados
        if (doc.status !== 'Borrador' && doc.status !== 'Rechazado') {
            return res.status(403).json({ message: 'No se puede eliminar un documento que ya está en circulación' });
        }

        // 2. Extraemos los adjuntos
        const attachments = typeof doc.attachments === 'string' ? JSON.parse(doc.attachments) : (doc.attachments || []);

        // 3. Iteramos y borramos cada archivo físico del disco duro
        attachments.forEach(file => {
            const filePath = path.join(__dirname, '../uploads', file.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath); // Elimina el archivo
            }
        });

        // 4. Eliminamos el documento y su historial de la Base de Datos
        await pool.query('DELETE FROM documents WHERE id = ?', [id]);
        await pool.query('DELETE FROM history WHERE item_id = ?', [id]);

        res.json({ message: 'Documento y archivos adjuntos eliminados correctamente' });
    } catch (error) {
        console.error("Error al eliminar documento:", error);
        res.status(500).json({ message: 'Error al eliminar el documento' });
    }
};

exports.cryptographicSign = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No se recibió el PDF crudo' });

        // req.file.buffer contiene el PDF generado por html2pdf en el frontend
        const signedBuffer = signatureService.signPdfBuffer(req.file.buffer);

        // Configuramos las cabeceras para forzar la descarga del binario
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="documento_sellado.pdf"');
        
        res.send(signedBuffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno al aplicar firma criptográfica' });
    }
};

// NUEVO: Verificación pública de documentos mediante QR
exports.verifyPublicDoc = async (req, res) => {
    const { id } = req.params;
    
    try {
        const [rows] = await pool.query('SELECT * FROM documents WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Documento no encontrado o no existe.' });

        const doc = rows[0];

        // Por seguridad, solo se pueden verificar documentos finalizados
        if (doc.status !== 'Firmado' && doc.status !== 'Archivado' && doc.status !== 'Anulado') {
            return res.status(400).json({ message: 'El documento especificado aún se encuentra en trámite o no es válido para verificación pública.' });
        }

        // 1. Extraer el último firmante
        let signedBy = typeof doc.signed_by === 'string' ? JSON.parse(doc.signed_by) : (doc.signed_by || []);
        let lastSignerId = null;
        let signatureDate = doc.created_at;
        
        if (signedBy && signedBy.length > 0) {
            const lastSigner = signedBy[signedBy.length - 1];
            lastSignerId = lastSigner.id;
            signatureDate = lastSigner.date;
        }

        // 2. Obtener Nombre y Área del Firmante
        let signerName = 'Sistema';
        let signerArea = 'Área Desconocida';
        if (lastSignerId) {
            const [uRows] = await pool.query('SELECT name, area_id FROM users WHERE id = ?', [lastSignerId]);
            if (uRows.length > 0) {
                signerName = uRows[0].name;
                const [aRows] = await pool.query('SELECT name FROM areas WHERE id = ?', [uRows[0].area_id]);
                if (aRows.length > 0) signerArea = aRows[0].name;
            }
        }

        // 3. Obtener nombres de destinatarios
        let recipients = typeof doc.recipients === 'string' ? JSON.parse(doc.recipients) : (doc.recipients || []);
        let recipientsNames = [];
        for (let rId of recipients) {
            if (rId.startsWith('a')) {
                const [aRows] = await pool.query('SELECT name FROM areas WHERE id = ?', [rId]);
                if (aRows.length > 0) recipientsNames.push('Área: ' + aRows[0].name);
            } else {
                const [uRows] = await pool.query('SELECT name FROM users WHERE id = ?', [rId]);
                if (uRows.length > 0) recipientsNames.push(uRows[0].name);
            }
        }

        // Retornamos SOLO metadata, no enviamos el "content" del documento por seguridad.
        res.json({
            isValid: true,
            status: doc.status,
            number: doc.number,
            docType: doc.doc_type,
            subject: doc.subject,
            signatureDate: signatureDate,
            signerName: signerName,
            signerArea: signerArea,
            recipients: recipientsNames.join(' | ') || 'Ninguno',
            pdfHash: doc.pdf_hash
        });

    } catch (error) {
        console.error("Error en validación pública:", error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FUNCIÓN UNIFICADA: Desencripta adjuntos, Embebe, Firma, Hashea y Encripta el final
exports.signFinalAndSeal = async (req, res) => {
    const { id } = req.params;
    
    try {
        if (!req.file) return res.status(400).json({ message: 'No se recibió el PDF.' });
        
        const docData = JSON.parse(req.body.documentData);
        const historyEntry = JSON.parse(req.body.historyEntry);

        // --- FASE 1: CARGAR PDF BASE ---
        let pdfBuffer = fs.readFileSync(req.file.path);
        
        // Buscamos los adjuntos en la BD
        const [rows] = await pool.query('SELECT attachments FROM documents WHERE id = ?', [id]);
        let attachments = typeof rows[0].attachments === 'string' ? JSON.parse(rows[0].attachments) : (rows[0].attachments || []);

        // --- FASE 2: DESENCRIPTAR Y EMBEBER ADJUNTOS ---
        if (attachments.length > 0) {
            const pdfDoc = await PDFDocument.load(pdfBuffer);
            
            for (let att of attachments) {
                const attPath = path.join(__dirname, '../uploads', att.filename);
                
                if (fs.existsSync(attPath)) {
                    let fileBytesToEmbed;
                    
                    try {
                        // Extraemos el IV del nombre del archivo, tal como se guardó en uploadAttachment
                        const parts = att.filename.split('-');
                        const ivHex = parts[0];
                        
                        if (ivHex.length === 32) {
                            // Está cifrado. Desciframos en memoria.
                            const iv = Buffer.from(ivHex, 'hex');
                            const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
                            const encryptedData = fs.readFileSync(attPath);
                            
                            // Concatenamos el resultado del decipher
                            fileBytesToEmbed = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
                        } else {
                            // Por compatibilidad con archivos súper antiguos que no se cifraron
                            fileBytesToEmbed = fs.readFileSync(attPath);
                        }
                    } catch (cryptoErr) {
                        console.error(`[Error] Fallo al desencriptar el anexo ${att.filename}:`, cryptoErr);
                        // Si falla catastróficamente, usamos el archivo crudo como último recurso
                        fileBytesToEmbed = fs.readFileSync(attPath);
                    }
                    
                    await pdfDoc.attach(fileBytesToEmbed, att.originalname, {
                        mimeType: att.mimetype,
                        description: 'Anexo Oficial',
                        creationDate: new Date(),
                        modificationDate: new Date(),
                    });
                }
            }
            // Guardamos el PDF con los adjuntos legibles internamente (sin Object Streams para compatibilidad)
            pdfBuffer = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
        }

        // --- FASE 3: FIRMA CRIPTOGRÁFICA (PKCS#7) ---
        const signatureService = require('../services/signatureService');
        try {
            // Firmamos el buffer que ya contiene los adjuntos desencriptados
            pdfBuffer = await signatureService.signPdfBuffer(pdfBuffer);
        } catch (signErr) {
            console.error("Error en firma interna:", signErr);
            throw new Error("No se pudo aplicar la firma con certificado al documento.");
        }

        // --- FASE 4: HASH, ENCRIPTACIÓN DEL PDF FINAL Y GUARDADO ---
        // Aquí encriptamos TODO el paquete (PDF + Adjuntos internos + Firma)
        const pdfHash = cryptoService.calculateHash(pdfBuffer);
        const securePath = path.join(__dirname, '../uploads/secure_docs', `${id}.enc`);
        cryptoService.encryptAndSave(pdfBuffer, securePath);

        // Limpieza de archivos temporales y adjuntos originales encriptados
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        if (attachments.length > 0) {
            for (let att of attachments) {
                const attPath = path.join(__dirname, '../uploads', att.filename);
                if (fs.existsSync(attPath)) fs.unlinkSync(attPath);
            }
        }

        // --- FASE 5: ACTUALIZAR BASE DE DATOS ---
        await pool.query(
            `UPDATE documents SET status = 'Firmado', number = ?, signed_by = ?, owners = ?, pdf_hash = ? WHERE id = ?`,
            [docData.number, JSON.stringify(docData.signedBy), JSON.stringify(docData.owners), pdfHash, id]
        );

        if (historyEntry) {
            await pool.query(
                'INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [id, 'documento', historyEntry.userId, historyEntry.action, historyEntry.notes, getArgTime()]
            );
        }

        res.json({ message: 'Documento procesado, firmado y encriptado correctamente.', pdfHash });

    } catch (error) {
        console.error("Error en el proceso unificado:", error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: error.message });
    }
};

// NUEVO: Descarga estática del PDF encriptado
exports.downloadStaticPdf = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await pool.query('SELECT number, status FROM documents WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Documento no encontrado.' });
        
        const doc = rows[0];
        if (doc.status !== 'Firmado' && doc.status !== 'Archivado' && doc.status !== 'Anulado') {
            return res.status(400).json({ message: 'El documento no tiene un PDF sellado generado.' });
        }

        const securePath = path.join(__dirname, '../uploads/secure_docs', `${id}.enc`);
        
        // Desencriptamos al vuelo
        const decryptedPdf = cryptoService.decryptAndRead(securePath);

        // Enviamos el PDF directamente al navegador
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${doc.number}.pdf"`);
        res.send(decryptedPdf);

    } catch (error) {
        console.error("Error al descargar PDF estático:", error);
        res.status(500).json({ message: 'Error al recuperar el archivo seguro.' });
    }
};

// NUEVO: Abre el PDF crudo, le inyecta los archivos adjuntos como "Embedded Files" y lo devuelve
exports.embedAttachments = async (req, res) => {
    const { id } = req.params;

    try {
        if (!req.file) return res.status(400).json({ message: 'No se recibió el PDF crudo.' });

        // 1. Buscamos los adjuntos en la BD
        const [rows] = await pool.query('SELECT attachments FROM documents WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Documento no encontrado.' });
        
        let attachments = typeof rows[0].attachments === 'string' ? JSON.parse(rows[0].attachments) : (rows[0].attachments || []);

        const pdfBytes = fs.readFileSync(req.file.path);

        // Si no hay adjuntos, devolvemos el PDF intacto inmediatamente
        if (attachments.length === 0) {
            fs.unlinkSync(req.file.path); // Limpiamos temp
            res.setHeader('Content-Type', 'application/pdf');
            return res.send(pdfBytes);
        }

        // 2. Cargamos el PDF con pdf-lib
        const pdfDoc = await PDFDocument.load(pdfBytes);

        // 3. Iteramos e inyectamos físicamente cada archivo
        for (let att of attachments) {
            const attPath = path.join(__dirname, '../uploads', att.filename); // Ajusta '../uploads' si tu carpeta real se llama distinto
            if (fs.existsSync(attPath)) {
                const fileBytes = fs.readFileSync(attPath);
                await pdfDoc.attach(fileBytes, att.originalname, {
                    mimeType: att.mimetype,
                    description: 'Anexo Oficial del Documento',
                    creationDate: new Date(),
                    modificationDate: new Date(),
                });
            }
        }

        // 4. Guardamos el nuevo PDF "Gordito" (Desactivamos ObjectStreams para compatibilidad con node-signpdf)
        const finalPdfBytes = await pdfDoc.save({ useObjectStreams: false });
        
        // Limpiamos el archivo temporal
        fs.unlinkSync(req.file.path);

        res.setHeader('Content-Type', 'application/pdf');
        res.send(Buffer.from(finalPdfBytes));

    } catch (error) {
        console.error("Error al embeber adjuntos:", error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: 'Error interno al inyectar anexos en el PDF.' });
    }
};