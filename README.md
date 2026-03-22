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
