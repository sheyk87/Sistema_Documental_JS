# gde_backend/Dockerfile
# Fase 5: Imagen del backend API + base para workers
# Los workers reusan esta imagen con CMD diferente

FROM node:25-alpine

# Dependencias de sistema: build tools para bcrypt + su-exec para drop privileges
RUN apk add --no-cache python3 make g++ su-exec

WORKDIR /app

# Instalar dependencias primero (cache de Docker layers)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar código fuente
COPY server.js ./
COPY config/ ./config/
COPY controllers/ ./controllers/
COPY middlewares/ ./middlewares/
COPY routes/ ./routes/
COPY services/ ./services/
COPY utils/ ./utils/
COPY workers/ ./workers/
COPY migrations/ ./migrations/
COPY tests/ ./tests/
COPY setup_full.js ./
COPY reset_db.js ./

# Copiar y dar permisos al entrypoint
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Crear directorios que serán montados como volúmenes
RUN mkdir -p uploads/secure_docs uploads/temp_sealing logs certs

# OWASP A05: Crear usuario no-root
RUN addgroup -S gde && adduser -S gde -G gde
RUN chown -R gde:gde /app

# Limpiar dependencias de compilación (reducir tamaño de imagen)
RUN apk del python3 make g++

# Health check para Docker Swarm
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q --spider http://localhost:3000/api/health || exit 1

EXPOSE 3000

# Entrypoint: arranca como root → fija permisos de volúmenes → baja a user gde
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
