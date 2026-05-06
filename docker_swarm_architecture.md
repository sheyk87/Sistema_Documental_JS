# Guía de Despliegue en Docker Swarm: Sistema GDE

Esta guía detalla la arquitectura y los pasos teóricos para desplegar el Sistema Documental en un clúster de Docker Swarm con 1 Manager y 3 Workers, cumpliendo con todas tus restricciones de seguridad y persistencia.

---

## 1. Topología y Red
Nginx Proxy Manager (NPM) recibe el tráfico HTTPS en `gde.dominio.ar` y lo redirige a la IP del nodo Master o de los Workers en el puerto `8080`. Docker Swarm usa una red interna llamada **Ingress Routing Mesh**, lo que significa que no importa qué nodo reciba la petición en el puerto 8080, Swarm la ruteará automáticamente a un contenedor del Frontend disponible.

## 2. Estrategia Front-Back (Usuario no toca el Back)
Dado que el frontend es una aplicación web (HTML/JS/CSS que se ejecuta en el navegador del usuario), si el código JS hace una petición a `http://back:3000`, el *navegador* intentará conectarse directamente al backend. 

**La solución elegante:**
Empaquetaremos el Frontend dentro de un servidor **Nginx**. Este Nginx servirá los archivos estáticos (HTML/JS), pero además actuará como **Proxy Inverso** dentro del clúster. 
- Cuando el navegador pida `gde.dominio.ar/`, Nginx le da el HTML.
- Cuando el navegador haga una petición JS a `gde.dominio.ar/api/...`, el Nginx del Frontend interceptará esa petición y la enviará de forma **interna** al servicio del Backend.
- De esta forma, el servicio Backend **no expone ningún puerto al exterior**. Solo vive en la red interna (`overlay`) de Docker y solo el Frontend se comunica con él.

## 3. Persistencia de Datos Compartida (Back)
Si tienes 3 réplicas del backend repartidas en 3 nodos distintos, usar volúmenes locales no sirve. Si un usuario sube un archivo y cae en la réplica del Nodo 1, la réplica del Nodo 2 no lo verá.

**La solución:** Usar un almacenamiento en red, típicamente **NFS (Network File System)** o un NAS.
1. Configuras un servidor NFS (puede ser el propio nodo Master o un servidor externo) y exportas una carpeta (ej. `/mnt/nfs_share`).
2. En Docker Swarm, declaras los volúmenes usando el driver de NFS. Esto hace que las 3 réplicas monten físicamente la misma carpeta en red. Las carpetas `uploads`, `certs` y el archivo `.env` se guardarán allí.

## 4. Persistencia y Clustering en MySQL
Desplegar bases de datos relacionales con múltiples réplicas de lectura/escritura (Clustering activo-activo) en Docker Swarm es complejo, ya que una base de datos estándar no sincroniza sus datos mágicamente al clonar el contenedor.

Tienes dos opciones:
*   **Opción A (Recomendada para simplificar):** Configuras el servicio de MySQL con **1 sola réplica** y le asignas restricciones (`constraints`) para que corra siempre en el nodo Master o en un Worker específico que tenga el volumen local montado. Todas las réplicas del backend se conectarán a este único contenedor de MySQL.
*   **Opción B (Clúster Real Galera / InnoDB):** Si estrictamente requieres 3 réplicas de MySQL corriendo simultáneamente por Alta Disponibilidad, debes usar una imagen específica de clúster como `bitnami/mariadb-galera`. Esta imagen crea una red de replicación entre los 3 contenedores. Requiere volúmenes separados por cada nodo para persistir su propia copia sincronizada de la base de datos.

A continuación, la configuración asume la **Opción A** (que es el estándar para despliegues donde la base de datos no justifica la complejidad de un Galera Cluster).

---

## 5. Preparación del Clúster Swarm

**En el Nodo Master:**
```bash
docker swarm init --advertise-addr <IP_DEL_MASTER>
```
Esto generará un token. Cópialo.

**En los 3 Nodos Workers:**
```bash
docker swarm join --token <TOKEN_COPIADO> <IP_DEL_MASTER>:2377
```

---

## 6. Archivos de Construcción (Dockerfiles)

### Frontend (Nginx Proxy Inverso)
Crea un archivo `nginx.conf` junto a tu Frontend:
```nginx
server {
    listen 80;
    server_name localhost;

    # Servir archivos estáticos del frontend
    location / {
        root   /usr/share/nginx/html;
        index  index.html;
        try_files $uri $uri/ /index.html;
    }

    # Proxy inverso para el Backend
    location /api/ {
        # 'backend' es el nombre del servicio en Docker Swarm
        proxy_pass http://backend:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

`Dockerfile` del Frontend:
```dockerfile
FROM nginx:alpine
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY ./ /usr/share/nginx/html
EXPOSE 80
```

### Backend (Node.js)
`Dockerfile` del Backend:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# No exponemos puerto aquí, se gestiona internamente en compose
CMD ["npm", "start"]
```

---

## 7. Archivo de Despliegue (docker-compose.yml)

Este es el archivo que se despliega en el Master usando: `docker stack deploy -c docker-compose.yml gde_stack`

```yaml
version: '3.8'

services:
  frontend:
    image: tu-registro/gde-frontend:latest
    ports:
      - "8080:80" # NPM apunta a cualquier nodo en la 8080
    networks:
      - gde_network
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure

  backend:
    image: tu-registro/gde-backend:latest
    networks:
      - gde_network
    volumes:
      - backend_uploads:/app/uploads
      - backend_certs:/app/certs
      - backend_env:/app/.env
    deploy:
      replicas: 3
      restart_policy:
        condition: on-failure

  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: gde_db
    networks:
      - gde_network
    volumes:
      - db_data:/var/lib/mysql
    deploy:
      replicas: 1
      placement:
        constraints:
          # Obligamos a que la base de datos viva en un nodo específico
          # para mantener la consistencia del disco físico.
          - node.role == manager 

networks:
  gde_network:
    driver: overlay

volumes:
  # Configuracion de Volumenes Compartidos via NFS
  backend_uploads:
    driver: localPlease provide the code changes or file descriptions so I can generate the commit message for you.
    driver_opts:
      type: nfs
      o: addr=<IP_DEL_SERVIDOR_NFS>,rw
      device: ":/ruta/en/el/nfs/uploads"
      
  backend_certs:
    driver: local
    driver_opts:
      type: nfs
      o: addr=<IP_DEL_SERVIDOR_NFS>,rw
      device: ":/ruta/en/el/nfs/certs"
      
  backend_env:
    driver: local
    driver_opts:
      type: nfs
      o: addr=<IP_DEL_SERVIDOR_NFS>,rw
      device: ":/ruta/en/el/nfs/env"

  # Volumen local para MySQL (ya que corre en un solo nodo por constraint)
  db_data:
    driver: local
```

### Resumen del Flujo
1. **NPM** recibe `gde.dominio.ar` y manda el tráfico a `<IP_CUALQUIERA>:8080`.
2. **Swarm Mesh** toma ese tráfico del 8080 y lo manda a uno de los 3 contenedores **Frontend (Nginx)**.
3. El **Frontend** responde con el JS al navegador.
4. Cuando el JS hace `fetch('/api/docs')`, la petición llega al **Frontend (Nginx)** nuevamente.
5. El Nginx lee el `/api/`, se da cuenta de que es una regla de proxy, y reenvía internamente la solicitud a la ruta `http://backend:3000` a través de la red `gde_network`.
6. Swarm balancea la petición a uno de los 3 contenedores **Backend**.
7. El Backend, como tiene montado el disco por NFS, puede leer los certificados y guardar archivos sin problemas.
8. El Backend consulta a la base de datos `db` en la red interna, que está aislada y protegida.
