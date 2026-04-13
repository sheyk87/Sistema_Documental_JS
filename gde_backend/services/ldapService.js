const ldap = require('ldapjs');

exports.authenticateLDAP = (email, password) => {
    return new Promise((resolve, reject) => {
        // Si no hay contraseña, rechazamos inmediatamente (evita unbinds anónimos permitidos por error)
        if (!password || password.trim() === '') {
            return reject(new Error('Contraseña vacía no permitida en LDAP'));
        }

        const client = ldap.createClient({
            url: process.env.LDAP_URL,
            timeout: 5000,
            connectTimeout: 5000
        });

        // Formateamos el usuario para Active Directory.
        // Si el usuario ingresa "juan@gde.com", extraemos "juan" y le pegamos el dominio del .env
        // Formato final de Bind para AD: juan@midominio.local
        const username = email.split('@')[0];
        const bindDN = process.env.LDAP_DOMAIN ? `${username}@${process.env.LDAP_DOMAIN}` : email;

        client.on('error', (err) => {
            // Manejo de errores de red o servidor caído
            client.destroy();
            reject(err);
        });

        // Intentamos autenticarnos
        client.bind(bindDN, password, (err) => {
            if (err) {
                client.unbind();
                reject(err); // Credenciales inválidas en LDAP
            } else {
                client.unbind();
                resolve(true); // Autenticación exitosa
            }
        });
    });
};