// services/antivirusService.js
const net = require('net');

/**
 * Escanea un stream legible enviándolo al demonio de ClamAV (ClamD) vía TCP.
 * Conforme al protocolo ClamD INSTREAM (bloques con tamaño prefijado de 4-bytes Big Endian).
 * 
 * @param {ReadableStream} readableStream Stream del archivo desencriptado al vuelo
 * @returns {Promise<{isInfected: boolean, virusName?: string}>}
 */
function scanStream(readableStream) {
    return new Promise((resolve, reject) => {
        const host = process.env.ANTIVIRUS_HOST || 'clamav';
        const port = parseInt(process.env.ANTIVIRUS_PORT) || 3310;
        
        let socket;
        let result = '';
        let hasFinished = false;

        // Establecer un timeout general de 60 segundos
        const timeout = setTimeout(() => {
            if (socket) socket.destroy();
            if (!hasFinished) {
                hasFinished = true;
                reject(new Error('Timeout de conexión o escaneo con el servicio antivirus ClamAV.'));
            }
        }, 60000);

        socket = net.connect({ host, port }, () => {
            // Enviar comando para indicar que vamos a transmitir un stream
            socket.write('nINSTREAM\n');

            readableStream.on('data', (chunk) => {
                if (hasFinished) return;
                // Cada bloque debe iniciar con un entero de 4 bytes en Big Endian con la longitud del bloque
                const sizeBuf = Buffer.alloc(4);
                sizeBuf.writeUInt32BE(chunk.length, 0);
                try {
                    socket.write(sizeBuf);
                    socket.write(chunk);
                } catch (writeErr) {
                    cleanup(writeErr);
                }
            });

            readableStream.on('end', () => {
                if (hasFinished) return;
                // Para cerrar la transmisión se envía un bloque de tamaño 0
                const endBuf = Buffer.alloc(4);
                endBuf.writeUInt32BE(0, 0);
                try {
                    socket.write(endBuf);
                } catch (writeErr) {
                    cleanup(writeErr);
                }
            });

            readableStream.on('error', (streamErr) => {
                cleanup(streamErr);
            });
        });

        function cleanup(err) {
            if (hasFinished) return;
            hasFinished = true;
            clearTimeout(timeout);
            if (socket) socket.destroy();
            reject(err);
        }

        socket.on('data', (data) => {
            result += data.toString();
        });

        socket.on('end', () => {
            if (hasFinished) return;
            hasFinished = true;
            clearTimeout(timeout);
            
            // Analizar respuesta. Ej: "stream: OK\n" o "stream: Eicar-Test-Signature FOUND\n"
            const cleanResult = result.trim();
            if (cleanResult.includes('FOUND')) {
                const parts = cleanResult.split(' ');
                const virusName = parts[parts.length - 2] || 'Software Malicioso';
                resolve({ isInfected: true, virusName });
            } else if (cleanResult.includes('OK')) {
                resolve({ isInfected: false });
            } else if (cleanResult.includes('PARSE') || cleanResult.includes('LIMIT')) {
                reject(new Error(`ClamAV error de límites/parseo: ${cleanResult}`));
            } else {
                reject(new Error(`Respuesta desconocida de ClamAV: ${cleanResult}`));
            }
        });

        socket.on('error', (socketErr) => {
            cleanup(socketErr);
        });
    });
}

module.exports = { scanStream };
