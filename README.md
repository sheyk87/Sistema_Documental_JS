# Sistema GDE Web - Gestión Documental Electrónica 📄🏛️

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)

GDE Web es un Sistema de Gestión Documental Electrónica desarrollado íntegramente en Vanilla JavaScript (Arquitectura SPA - Single Page Application). Diseñado para simular el ecosistema de administración pública o corporativa, permite la creación, firma electrónica, enrutamiento, archivo y vinculación de Documentos y Expedientes con un estricto control de acceso y trazabilidad.

## 📋 Tabla de Contenidos

- [Características Principales](#-características-principales)
- [Tipos de Documentos](#-tipos-de-documentos)
- [Ciclo de Vida y Diagramas de Flujo](#-ciclo-de-vida-y-diagramas-de-flujo)
  - [Flujo de Documentos](#1-ciclo-de-vida-de-un-documento)
  - [Flujo de Expedientes](#2-ciclo-de-vida-de-un-expediente)
- [Estructura y Arquitectura](#-estructura-y-arquitectura)
- [Módulos del Sistema](#-módulos-del-sistema)
- [Instalación y Uso Local](#-instalación-y-uso-local)

---

## ✨ Características Principales

* **Arquitectura de Estado Global:** Patrón de diseño reactivo implementado desde cero (`setState`), actualizando el DOM virtualmente sin recargas de página.
* **Bandejas de Entrada Inteligentes:** Separación entre "Trámites Personales" y "Trámites de Área". Los documentos asignados a un Área son adquiridos por el primer usuario que los reclame, desapareciendo para el resto (Prevención de duplicidad de trabajo).
* **Firma Digital en Cascada:** Soporte para múltiples firmantes. El documento viaja de bandeja en bandeja y se estampa al completarse el circuito.
* **Deduplicación de Destinatarios:** Algoritmo que previene el envío doble si un usuario es asignado como destinatario individual y, al mismo tiempo, como miembro de un área destinataria.
* **Seguridad y Control de Acceso:** Expedientes configurables como "Públicos" o "Reservados" (con listas de control de acceso granulares por área o usuario).
* **Trazabilidad Absoluta (Auditoría):** Historial inmutable en cada documento y expediente, registrando quién, cuándo y qué acción realizó (con notas justificativas).
* **Dashboard Estadístico:** Motor analítico con **Chart.js**. Gráficos de barras y tortas renderizados dinámicamente con filtros cruzados (por usuario, área, tipo y rango de fechas).
* **Exportación de Datos:** Botones de generación y descarga nativa de archivos `.csv` en todas las tablas y reportes estadísticos.

---

## 📑 Tipos de Documentos

El sistema clasifica los documentos por su comportamiento de enrutamiento:

1.  **Con Destinatario Único:** `Solicitud`, `Solicitud de Compra`, `Solicitud de Gasto`, `Orden de Compra`, `Carta`. (El sistema valida estrictamente que solo se envíen a un destino).
2.  **Con Destinatario Múltiple:** `Memo`, `Nota`, `Notificación`, `Circular`.
3.  **Sin Destinatario (De Registro):** `Acta`, `Informe`, `Resolucion`, `Disposicion`, `Actuacion`, `Dictamen`, `Factura`, `Presupuesto`, `Contrato`, etc.

---

## 🔄 Ciclo de Vida y Diagramas de Flujo

### 1. Ciclo de Vida de un Documento
Desde el momento en que un usuario hace clic en "Crear Documento" hasta que se estampa la firma y se archiva.

```mermaid
graph TD
    A([Crear Documento]) --> B[Estado: BORRADOR]
    B --> C{¿Acción del Dueño?}
    
    C -->|Enviar a Revisar| D[Bandeja de otro Usuario]
    D -->|Revisado / Devuelto| B
    
    C -->|Firmar Yo Mismo| E[Estado: FIRMADO]
    
    C -->|Enviar a Firmar| F[Estado: FIRMÁNDOSE]
    F --> G{Bandeja Firmante N}
    G -->|Firma Aplicada| H{¿Faltan Firmantes?}
    H -->|Sí| F
    H -->|No| E
    G -->|Rechazar Documento| I[Estado: RECHAZADO]
    I -->|Vuelve al Creador| B
    
    E --> J{Acciones Post-Firma}
    J -->|Derivar| K(Bandeja Destino)
    J -->|Vincular| L(Expediente)
    J -->|Relacionar| M(Otro Documento)
    J -->|Archivar| N((ARCHIVADO))
    J -->|Anular| O((ANULADO))
```
### 2. Ciclo de Vida de un Expediente
Los expedientes actúan como "carpetas contenedoras" (foliadas) que agrupan documentos firmados.

```mermaid
graph TD
    A([Apertura Expediente]) --> B[Estado: EN TRAMITE]
    
    B --> C{Acciones Administrativas}
    C -->|Derivar| D[Pasa a otra Área/Usuario]
    C -->|Vincular Doc| E[Se añade Foja]
    C -->|Desvincular Doc| F[Se quita Foja]
    C -->|Editar Permisos| G[Control de Acceso Reservado]
    
    B --> H{Cierre de Expediente}
    H -->|Archivar| I((ARCHIVADO))
    I -.->|Sella Fojas| J(Documentos Inamovibles)
    I -->|Desarchivar| B
    
    H -->|Anular| K((ANULADO))
```

### 🏗️ Estructura y Arquitectura
El proyecto es 100% Frontend y se ejecuta en el navegador (simulando una base de datos local en la variable state).

* **app.js**: Contiene la totalidad de la lógica de negocio, el estado global (state) y el motor de renderizado HTML.
* **Gestión de Estado**: La función setState(newState) intercepta los cambios de datos y dispara renderApp(), re-pintando solo las vistas necesarias. Esto emula el comportamiento de

UI/UX:
* **Tailwind CSS**: Se usa mediante CDN para estilos rápidos, estáticos y responsivos.
* **Lucide Icons**: Carga dinámica de iconografía limpia y minimalista.
* **Sidebar Retráctil**: Menú lateral expansible/colapsable con memoria visual (tooltips).

### 🧩 Módulos del Sistema
Seguridad y Autenticación: Login simulado. Diferencia entre roles (admin y user).

Mi Trabajo (Inbox & Drafts):
* **Las bandejas agrupan lógicamente Documentos y Expedientes.**
* **Búsqueda en tiempo real por número, asunto o remitente.**
* **Creación de Trámites:**
* **Campos inteligentes (El selector de destinatarios aparece o desaparece según el tipo de documento).**
* **Buscador predictivo para tipos de documentos y selección de destinatarios.**
* **Archivo Central y Anulados: Repositorios de lectura de trámites finalizados o dados de baja temporal/permanentemente.**
* **Buscador Global: Motor de búsqueda transversal que atraviesa todos los documentos y expedientes a los que el usuario tiene autorización de lectura.**

Módulo de Estadísticas:
* **Generación de KPI's (Total de Firmas, Exps Creados, Derivaciones, etc).**
* **Generación de top 10 (Usuarios con más derivaciones, Documentos más vinculados, etc).**
* **Gráficos intercalables (Torta o Barras) usando Chart.js + DataLabels.**
* **Administración (Solo Admins): Alta, Baja y Modificación (ABM) de Usuarios y Áreas.**


### 🚀 Instalación y Uso Local
Debido a los estrictos controles de seguridad de los navegadores modernos (Políticas CORS), este proyecto no debe abrirse haciendo doble clic en el archivo HTML (file:///...). Debe ejecutarse a través de un servidor local.

Prerrequisitos
* **Visual Studio Code (recomendado).**
* **Extensión Live Server instalada en tu editor.**

* **Pasos:**
Clona este repositorio:

```bash
git clone [https://github.com/TU_USUARIO/sistema-gde-web.git](https://github.com/TU_USUARIO/sistema-gde-web.git)
```

Abre la carpeta del proyecto en Visual Studio Code.
Haz clic derecho sobre el archivo index.html y selecciona "Open with Live Server".
El navegador se abrirá automáticamente en http://127.0.0.1:5500.

* **Credenciales de Prueba**
Para ingresar al sistema, utiliza las siguientes credenciales predefinidas:

* **Email:** admin@gde.com
* **Contraseña:** 123

(Puedes loguearte también como juan@gde.com o maria@gde.com usando la misma contraseña para probar la interacción entre distintas áreas).
