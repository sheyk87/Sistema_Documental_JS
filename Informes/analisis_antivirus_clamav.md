# Informe Técnico Ampliado: Arquitectura e Integración de Antivirus (ClamAV) en GDE

Este informe extiende el análisis previo para abordar los requerimientos específicos de escalabilidad (archivos de hasta 100MB), control dinámico desde el panel de administración, actualizaciones de firmas en entornos distribuidos (Docker Swarm) y diseño del dashboard de métricas.

---

## 1. Definición de la Estrategia Óptima

### La decisión: Escaneo Asíncrono con Cuarentena Criptográfica

Para un sistema que procesa adjuntos grandes, **la mejor estrategia de implementación es la Asíncrona (con colas de trabajo y estado de cuarentena)**.

#### ¿Por qué descartar la síncrona para 100MB?
En Node.js/Express, mantener una petición HTTP abierta de forma síncrona durante 10-30 segundos (tiempo estimado para subir, transmitir y escanear un archivo de 100MB bajo estrés de CPU) bloquea los hilos de red y puede causar:
* **Gateway Timeouts (HTTP 504)** en el proxy Nginx.
* **Consumo excesivo de sockets concurrentes**, provocando denegación de servicio para otros usuarios.

#### Funcionamiento de la Estrategia de Cuarentena:
1. **Subida rápida**: El usuario sube el archivo. El backend lo guarda temporalmente en disco y registra el adjunto en la base de datos con estado `Pendiente de Análisis`.
2. **Cifrado y Aislamiento**: Para cumplir con las políticas de privacidad del sistema, el archivo se cifra y se guarda en un directorio específico (`uploads/quarantine/`).
3. **Encolado**: Se crea una tarea en BullMQ. El backend responde inmediatamente con un código `HTTP 202 (Accepted)`.
4. **Control de Acceso (BOLA / OWASP A01)**: El middleware de descargas del backend (`downloadAttachment`) bloquea cualquier intento de descarga del archivo si su estado en la base de datos no es `Limpio`. El frontend muestra un estado visual *"Analizando en busca de virus..."* y deshabilita el botón de descarga.
5. **Procesamiento y Alertas**: El worker antivirus toma la tarea, descifra el archivo temporalmente en memoria (o en un directorio temporal en RAM para optimizar rendimiento), y lo envía a ClamAV.
   * **Si está limpio**: El estado se cambia a `Limpio` y se mueve el archivo a la carpeta final de adjuntos.
   * **Si está infectado**: El archivo se elimina definitivamente del almacenamiento físico, su estado cambia a `Infectado` en la base de datos, y se gatilla un evento para alertar al usuario subidor y a los administradores del sistema (vía notificaciones internas en tiempo real y correo electrónico).

---

## 2. Impacto de Cargas de 100MB y Recursos de ClamAV

El incremento del tamaño máximo a 100MB tiene un impacto significativo en el consumo de recursos de ClamAV, principalmente debido al procesamiento de archivos comprimidos (que ClamAV debe descomprimir de forma recursiva en memoria/disco).

### Requisitos de Recursos para el Contenedor ClamAV
* **Memoria RAM**: 
  * *Base*: ~2 GB (para almacenar la base de datos de firmas).
  * *Operación con 100MB*: **Mínimo 4 GB a 6 GB de RAM** por contenedor ClamAV. Esto previene que el kernel de Linux termine el proceso debido a falta de memoria (*OOM Killer*) al escanear múltiples archivos concurrentes o archivos zip con alta tasa de compresión.
* **CPU**: **2 a 3 Cores Dedicados** por contenedor. El análisis sintáctico de archivos de 100MB (especialmente PDFs grandes y comprimidos) es una operación puramente monohilo en CPU por archivo escaneado.

### Ajustes Obligatorios de Configuración (`clamd.conf`)
Los valores por defecto de ClamAV bloquean archivos mayores a 25MB. Es indispensable configurar:
```ini
# Configuración en /etc/clamav/clamd.conf
MaxScanSize 150M         # Límite máximo de datos escaneados por archivo (incluyendo descompresión)
MaxFileSize 100M         # Tamaño de archivo máximo permitido
StreamMaxLength 100M     # Tamaño máximo aceptable si se escanea por socket de red (INSTREAM)
MaxRecursion 10          # Límite de descompresión zip recursiva (defensa ante Zip Bombs)
```

---

## 3. Administración Dinámica (Activar / Desactivar Servicio)

Es totalmente factible implementar una sección de administración para gestionar este servicio, similar a la lógica utilizada para LDAP o SMTP.

### Arquitectura de Control:
1. **Configuración en BD/Redis**:
   Se almacena el estado del antivirus en la base de datos (tabla `system_settings`) o en Redis (`config:antivirus_enabled = true/false`) para un acceso de lectura ultrarrápido (O(1)) desde el backend.
2. **Flujo lógico de desvío (Bypass)**:
   Al momento de subir el archivo, el backend consulta el estado:
   * **Si está Activado**: Aplica el flujo de cuarentena y encolado en BullMQ.
   * **Si está Desactivado**: Omite el análisis. El adjunto se marca directamente como `Limpio` en la base de datos y se activa inmediatamente para descarga.
3. **Estrategia de Fallo Configurable (Fail-Safe)**:
   La interfaz administrativa debe permitir configurar el comportamiento si el contenedor de ClamAV no responde estando el servicio activado:
   * *Modo Bloqueante (Fail-Closed)*: Detiene la subida y devuelve error HTTP 500 (Seguridad crítica).
   * *Modo Permisivo (Fail-Open)*: Permite la subida, pero registra una alerta crítica de sistema en la bitácora de auditoría.

---

## 4. Gestión de Actualizaciones y Firmas de Virus

Mantener actualizada la base de datos de firmas de virus de ClamAV es vital. 

### Actualización Automática a la 01:00 AM
Se configura el daemon `freshclam` (encargado de descargar actualizaciones de `database.clamav.net`) mediante su archivo de configuración interno, o mediante un cron job dentro del contenedor:
```ini
# Configuración en /etc/clamav/freshclam.conf
Checks 24              # Comprobar 24 veces al día (cada hora) para máxima protección.
# Alternativamente, se puede inhabilitar el demonio y usar el Cron del host o del container
# para ejecutar "freshclam" exactamente a las 01:00 AM.
```

### Visualización del Estado en el Panel de Administración
Podemos consultar el estado actual de la base de datos de firmas haciendo una llamada directa al puerto del demonio de ClamAV.
* **Consulta de Versión**:
  El backend Node.js abre un socket TCP al contenedor ClamAV y envía el comando plano `VERSION`.
  * *Respuesta de ClamAV*: `ClamAV 1.3.0/26700/Tue Jun 23 08:31:00 2026`
  * *Interpretación*: Indica la versión del motor, el número de firma actual (`26700`) y la fecha de publicación de la base de datos.
  * El backend expone un endpoint `GET /api/admin/antivirus/status` que retorna esta información formateada para el panel web.

### Envío de Orden de Actualización Manual en Entornos Distribuidos (Docker Swarm)
En Docker Swarm, las tareas de ClamAV se distribuyen entre múltiples nodos. Para actualizar todas las instancias desde el panel web de forma atómica:

1. **Uso de Volumen Compartido (NFS)**:
   Si todas las réplicas del servicio `clamav` comparten el volumen `clamav_data` vía NFS (similar al volumen de uploads en Swarm), ejecutar la actualización manual en un contenedor actualizará los archivos de firmas físicamente en el storage compartido.
2. **Gatillar la Recarga en las Réplicas (Patrón Resolutivo DNS)**:
   Una vez actualizados los archivos de firmas, todos los contenedores activos de ClamAV deben recargar la base de datos en su RAM. En Swarm, para enviar la orden `RELOAD` a cada contenedor individual:
   * El backend realiza una consulta DNS de tipo `A` sobre el host especial de Swarm: `tasks.clamav`.
   * Swarm responde con una lista de las IPs internas de **todos los contenedores individuales** activos de ese servicio.
   * El backend itera sobre esa lista de IPs y abre un socket TCP (puerto 3310) a cada una de ellas enviando el comando `RELOAD`.
   * Cada contenedor ClamAV recarga las firmas desde el disco compartido instantáneamente, sin necesidad de reiniciar el servicio ni interrumpir la disponibilidad del sistema.

---

## 5. Dashboard de Métricas y Alertas

Para el panel de administración, se propone la creación de un modelo de datos especializado en registrar las métricas de análisis.

### Diseño de la Tabla en BD: `antivirus_scans`
```sql
CREATE TABLE antivirus_scans (
    id VARCHAR(36) PRIMARY KEY,
    attachment_name VARCHAR(255) NOT NULL,
    document_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    scan_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    file_size_bytes BIGINT NOT NULL,
    status ENUM('pending', 'scanning', 'clean', 'infected', 'error') NOT NULL,
    virus_name VARCHAR(150) NULL, -- Guardará la firma detectada si aplica (ej. Eicar-Test-Signature)
    scan_duration_ms INT NULL,
    INDEX (status),
    INDEX (scan_date)
);
```

### Componentes del Dashboard Administrativo

```
+---------------------------------------------------------------------------------+
|                         PANEL DE CONTROL DE ANTIVIRUS                           |
+---------------------------------------------------------------------------------+
| ESTADO DEL SERVICIO: [ ACTIVO ]             | BASE DE DATOS: Actualizada        |
| MÁXIMO PERMITIDO: 100 MB                    | FIRMA: #26700 (23 Jun 2026 08:31) |
| ESTRATEGIA: Asíncrona (Cola de Trabajo)     | ACCIÓN: [ ACTUALIZAR AHORA ]      |
+---------------------------------------------------------------------------------+
|                                 ESTADÍSTICAS                                    |
| [ 1,245 ] Analizados | [ 1,242 ] Limpios | [ 3 ] Infectados | [ 0 ] Pendientes  |
+---------------------------------------------------------------------------------+
|                              ALERTAS DE INFECCIÓN                               |
| Fecha      | Usuario    | Documento      | Archivo           | Virus Detectado  |
| 23/06 14:02| jdoe       | DOC-2026-0045  | malware_test.zip  | Win.Trojan.Generic|
| 20/06 09:15| asmits     | DOC-2026-0012  | invoice_pdf.scr   | Heuristics.Phish  |
+---------------------------------------------------------------------------------+
```

1. **Indicadores de Estado (KPIs)**:
   * Cantidad total de archivos procesados.
   * Tasa de positividad (porcentaje de archivos infectados).
   * Estado de la cola de BullMQ (número de trabajos esperando ser analizados en tiempo real).
2. **Métricas de Rendimiento**:
   * Tiempo de procesamiento promedio por tamaño de archivo (permite diagnosticar si el servicio ClamAV está infradimensionado en CPU).
3. **Registro de Alertas Críticas**:
   * Listado de las detecciones recientes con opción de ver el historial del documento original y detalles del usuario que subió el adjunto infectado, facilitando el análisis forense de seguridad.
