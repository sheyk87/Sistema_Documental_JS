# Plan de Implementación: Fase 2 - Módulo de Numeración Transaccional (Correlatividad y Atomicidad en MySQL)

Este documento detalla el plan técnico para la centralización, secuenciación y atomicidad del sistema de numeración oficial del **Sistema GDE**, alineando la base de código actual (frontend, backend y base de datos) con el pliego formal **SGDE.pdf** y mitigando fallas de integridad de datos (OWASP A08).

---

## Goal Description

Actualmente, el frontend genera de forma local números provisorios en memoria. Esto es inseguro y genera colisiones y duplicaciones cuando varios usuarios operan al mismo tiempo o firman concurrentemente en una misma repartición.
El pliego especifica que cada documento y expediente oficial debe contar con un número correlativo e inalterable, en el siguiente formato:
$$[TIPO\_DOCUMENTO]-[AÑO]-[NÚMERO\_SEIS\_DÍGITOS]-[AREA]$$
*Ejemplo: `NO-2026-000001-Sistemas`*

La Fase 2 centraliza esta numeración a nivel de base de datos en el backend de forma completamente transaccional y atómica, utilizando bloqueos de fila (`SELECT ... FOR UPDATE`) en MySQL, y acoplándolo de manera elegante al flujo de carátula de expedientes y al sellado y firma digital de documentos.

---

## User Review Required

> [!IMPORTANT]
> **Secuencia por Tipo y Año**:
> La numeración se calcula dinámicamente según el código del tipo documental y el año en curso. Al iniciar cada año calendario, la secuencia se reiniciará automáticamente a `1` (`000001`) para cada tipo de documento de forma nativa en MySQL.
>
> **Asignación en Caliente al Firmar**:
> Para garantizar que el PDF final firmado y sellado contenga el número correlativo correcto impreso en su cuerpo, el frontend solicitará el número de forma atómica a la API justo antes de generar y encolar el PDF. El documento pasará de "S/N (Borrador)" a tener su número oficial inmutable de forma instantánea.

---

## Proposed Changes

Las modificaciones se estructuran en el backend y el frontend para garantizar compatibilidad total, atomicidad libre de colisiones concurrentes y consistencia visual en el PDF sellado.

---

### Módulo de Base de Datos y Backend (Fase 2 - Prioridad 2)

#### [NEW] [numberingService.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/services/numberingService.js)
Creación de motor transaccional atómico de foliación:
* Función `getNextNumber(docType, areaId)`:
  * Abre una transacción SQL.
  * Ejecuta una consulta con bloqueo exclusivo de fila:
    `SELECT last_value FROM numbering_sequences WHERE doc_type = ? AND year = ? FOR UPDATE`
  * Si la secuencia no existe para el tipo de documento y el año actual, inserta el registro inicial con valor `1`.
  * Si ya existe, incrementa el contador en `1` (`last_value = last_value + 1`) y lo actualiza en la base de datos.
  * Resuelve el nombre del área consultando la tabla `areas`.
  * Genera y retorna el número formateado de 6 dígitos (ej: `NO-2026-000001-Sistemas`).
  * Cierra la transacción, garantizando exclusión mutua perfecta.

#### [MODIFY] [docController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/docController.js)
Creación de endpoint para la asignación transaccional del número en documentos:
* Método `assignDocumentNumber`:
  * Abre una transacción de base de datos.
  * Valida que el documento esté en estado válido de firma (`Borrador`, `Rechazado`, `Firmándose`) y que pertenezca al usuario/área que solicita.
  * Si el documento ya cuenta con un número asignado (por ejemplo, en firmas conjuntas parciales ya foliadas), retorna dicho número.
  * Si no tiene número, invoca a `numberingService.getNextNumber(doc.doc_type, doc.area_id)`.
  * Actualiza la columna `number` de la tabla `documents` y registra la transacción.
  * Retorna el número oficial asignado en formato JSON `{ number: "..." }`.

#### [MODIFY] [docRoutes.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/routes/docRoutes.js)
Registro del nuevo endpoint seguro:
* `POST /assign-number/:id` ➔ Middleware de autenticación y control de accesos granular.

#### [MODIFY] [expController.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_backend/controllers/expController.js)
Integración del generador de numeración en el carátulado de expedientes:
* Método `createExpediente`:
  * En lugar de recibir el número precalculado del frontend, invoca dinámicamente a `numberingService.getNextNumber('EX', areaId)` dentro de la transacción de creación.
  * Inserta el registro del expediente con el número legal correlativo oficial.
  * Retorna el expediente creado e incluye el número generado en la respuesta HTTP 201: `{ message: '...', number: generatedNumber }`.

---

### Módulo de Frontend (Fase 2 - Interfaz de Usuario)

#### [MODIFY] [app.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_frontend/app.js)
* **Remover Lógica Local**: Eliminar la función `generateNumber()` y el objeto de contadores `state.db.counters` en memoria del frontend para evitar inconsistencias locales.
* **Flujo de Apertura de Expedientes (`form-create-exp`)**:
  * Modificar el envío al backend; omitir el campo `number` en el cuerpo del JSON enviado a `POST /api/exps/create`.
  * Al recibir la respuesta exitosa `201`, capturar el `resData.number` asignado atómicamente por el servidor y agregarlo a `state.db.expedientes` para mantener la UI sincronizada.
* **Flujo de Firma de Documentos (`confirmar_firma`)**:
  * Antes de invocar a `sealAndSaveDocument(item, hEntry)`, realizar una petición `POST` al endpoint `/api/docs/assign-number/${item.id}`.
  * Asignar el número legal correlativo retornado por el backend a `item.number`.
  * Esto permite que la función `sealAndSaveDocument` dibuje el HTML-to-PDF con el número oficial exacto ya impreso en el cuerpo del documento oficial y código QR de validación.
  * El PDF se envía a encolar con el número exacto.

#### [MODIFY] [sw.js](file:///home/jovillafane/Descargas/Sistema_Documental_JS/gde_frontend/sw.js)
* Incrementar la versión del Service Worker a `gde-pwa-v6` para forzar a los navegadores de los usuarios finales a descargar la nueva lógica de numeración atómica instantáneamente.

---

## Verification Plan

### Automated Tests
* **Prueba de Concurrencia Extrema de Numeración**:
  * Crearemos un script de pruebas concurrentes `verify_numbering_race.js` en el backend.
  * Simulará 50 firmas concurrentes sobre un mismo tipo de documento en el mismo año.
  * **Resultado Esperado**: MySQL procesará secuencialmente cada petición y la tabla `documents` reflejará 50 números correlativos perfectos del `000001` al `000050` sin saltos ni duplicaciones en base de datos.

### Manual Verification
1. **Creación de Expediente**: Registrar un expediente desde el frontend y verificar en la consola de base de datos MySQL que obtuvo un número en formato `EX-[AÑO]-00000X-[AREA]`.
2. **Firma y Sellado**: Firmar un borrador de Nota desde el frontend, y validar que el PDF oficial resultante y descargado de la bandeja cuenta con el número correlativo perfecto (`NO-[AÑO]-00000X-[AREA]`) impreso físicamente y encriptado en el PDF.
