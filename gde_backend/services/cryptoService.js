const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-cbc';

// Función auxiliar blindada para obtener siempre una clave de exactamente 32 bytes.
// Se llama por dentro de las funciones para evitar problemas de asincronía con dotenv.
const getSecureKey = () => {
    // Tomamos la clave del .env, o usamos una de respaldo si el .env falla
    const rawKey = process.env.STORAGE_ENCRYPTION_KEY || 'clave_respaldo_gde_2026_secreta';
    
    // Al aplicarle un Hash SHA-256 y pedir el Buffer, 
    // garantizamos físicamente que la clave tenga EXACTAMENTE 32 bytes, 
    // sin importar si en el .env pusiste espacios o caracteres de más.
    return crypto.createHash('sha256').update(String(rawKey)).digest();
};

// 1. Calcula el Hash SHA-256 de un archivo para la validación pública
exports.calculateHash = (buffer) => {
    return crypto.createHash('sha256').update(buffer).digest('hex');
};

// 2. Encripta un PDF crudo y lo guarda blindado en el disco
exports.encryptAndSave = (buffer, filePath) => {
    const keyBuffer = getSecureKey();
    
    // Vector de inicialización aleatorio (IV). Hace que el cifrado sea único cada vez.
    const iv = crypto.randomBytes(16);
    
    // Iniciamos el motor de cifrado
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
    
    // Encriptamos el archivo
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    
    // Guardamos el IV pegado al inicio del archivo cifrado (lo necesitamos para abrirlo luego)
    const fileData = Buffer.concat([iv, encrypted]);
    
    // Aseguramos que la carpeta exista
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Guardamos físicamente en el disco
    fs.writeFileSync(filePath, fileData);
};

// 3. Lee del disco cerrado y desencripta el PDF directo a la memoria RAM
exports.decryptAndRead = (filePath) => {
    if (!fs.existsSync(filePath)) throw new Error("Archivo seguro no encontrado en el disco.");

    const fileData = fs.readFileSync(filePath);
    
    // Extraemos el IV de los primeros 16 bytes
    const iv = fileData.subarray(0, 16);
    const encrypted = fileData.subarray(16);
    
    const keyBuffer = getSecureKey();
    
    // Iniciamos el motor de descifrado
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    
    return decrypted;
};