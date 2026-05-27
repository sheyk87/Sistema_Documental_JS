#!/bin/sh
# docker-entrypoint.sh
# Fase 5: Entrypoint que arranca como root para fijar permisos de volúmenes,
# luego baja a usuario no-root (gde) para ejecutar la aplicación.
# Patrón estándar usado por imágenes oficiales (postgres, mysql, redis).

set -e

# Fijar permisos de directorios montados como volúmenes
# y del .env (bind mount) para que el admin pueda editarlo desde el panel
chown -R gde:gde /app/uploads /app/logs 2>/dev/null || true
chown -R gde:gde /app/certs 2>/dev/null || true
chown gde:gde /app/.env 2>/dev/null || true

# Ejecutar el comando como usuario no-root (OWASP A05)
exec su-exec gde "$@"
