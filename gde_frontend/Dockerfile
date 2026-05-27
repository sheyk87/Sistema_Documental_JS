# gde_frontend/Dockerfile
# Fase 5: Imagen del frontend con Nginx como proxy reverso
# Sirve archivos estáticos y proxea /api/* al backend interno

FROM nginx:alpine

# Copiar configuración de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar archivos estáticos del frontend
COPY index.html /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/
COPY icon-512.png /usr/share/nginx/html/
COPY manifest.json /usr/share/nginx/html/
COPY sw.js /usr/share/nginx/html/

# Fase 5: Reemplazar URLs hardcodeadas de desarrollo por URLs relativas
# En Docker, Nginx proxea /api/* al backend, así que los fetch deben ser relativos
# Esto NO modifica el código fuente local — solo la imagen Docker
RUN sed -i 's|http://localhost:3000||g' /usr/share/nginx/html/app.js

# Health check para Docker Swarm y compose
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
