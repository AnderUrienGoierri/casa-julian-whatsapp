# Arquitectura de Sincronización Automática: Google Drive (Excel) ➔ Base de Datos

Guía técnica detallada sobre cómo sincronizar en tiempo real el archivo Excel **`OPARI TXARTELAK.xlsx`** (con sus 3 pestañas: *OT PERSONALIZADAS*, *OT WIX* y *OT SHOPIFY*) alojado en **Google Drive** con la base de datos **PostgreSQL (Neon)** del Chatbot de Casa Julián.

---

## 1. ¿Es posible automatizar la sincronización con Google Drive?

**Sí, es 100% posible y es una solución excelente.**

Permite que el equipo de Recepción y Administración siga trabajando con total comodidad en su Excel habitual de Google Drive sin cambiar sus hábitos, mientras que el bot de WhatsApp y el panel de reservas tienen acceso instantáneo a todas las tarjetas actualizadas en la base de datos.

---

## 2. Métodos de Sincronización Recomendados

Existen tres formas estándar para conectar Google Drive / Google Sheets con nuestro servidor Node.js:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 GOOGLE DRIVE / SHEETS                                  │
│                             (OPARI TXARTELAK.xlsx)                                     │
│     [Pestaña: OT PERSONALIZADAS]  |  [Pestaña: OT WIX]  |  [Pestaña: OT SHOPIFY]       │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │ Disparador al editar / Webhook o Polling
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                           API CASA JULIÁN (Node.js Server)                             │
│                               /api/sync-giftcards                                      │
│                                           │                                            │
│        1. Parsear cada pestaña con su estructura de columnas específica                │
│        2. Calcular fecha de caducidad (+6 meses) automáticamente si está vacía         │
│        3. Mapear al modelo unificado y normalizar valores booleanos/nulos              │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │ Upsert masivo (INSERT ... ON CONFLICT)
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        BASE DE DATOS NEON POSTGRESQL                                   │
│                           (Tabla: tarjetas_regalo)                                     │
│             540+ Registros sincronizados en tiempo real para el Chatbot                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Opción A: Google Apps Script (Webhook Instantáneo al Guardar/Editar) — *La Más Eficiente*

Si el Excel se edita como **Google Sheets** en Google Drive, podemos añadir un pequeño script de 15 líneas en Google Sheets (*Extensiones > Apps Script*):

1. **Evento `onEdit(e)` o `onChange(e)`:** Cada vez que recepción escribe una nueva fila, modifica o borra algo, Google envía un aviso HTTP `POST` a nuestro bot (`https://tudominio.com/api/sync-giftcards`).
2. **Ventaja:**
   * **Tiempo real inmediato:** No hay esperas. Si recepción crea una tarjeta, en 1 segundo el bot de WhatsApp ya la reconoce.
   * **Consumo de recursos cero:** El servidor no tiene que estar preguntando a cada rato.

---

### Opción B: Cron Job / Polling Periódico desde el Servidor (Google Drive API)

El servidor Node.js (en el Synology NAS o en la nube) consulta la API de Google Drive cada **5 o 10 minutos** (o cada hora):

1. **Lectura con Service Account de Google:** El bot se descarga el archivo `OPARI TXARTELAK.xlsx` desde Google Drive con una clave de servicio.
2. **Comprobación de fecha de modificación:** Solo si el archivo ha cambiado desde la última lectura, ejecuta el parser de las 3 pestañas y actualiza la base de datos.
3. **Ventaja:**
   * Funciona directamente aunque el archivo sea un binario `.xlsx` de Excel subido a Drive (sin necesidad de convertirlo a formato nativo Google Sheets).

---

### Opción C: Botón de "🔄 Sincronizar Excel de Google Drive" en el Panel Admin

Añadir un botón en el Panel de Recepción (`/admin/`) con un clic:
* **"🔄 Forzar Sincronización con Drive"**
* Lee el archivo en ese instante y muestra un mensaje: *"541 tarjetas sincronizadas correctamente desde Google Drive"*.

---

## 3. Lógica de Transformación de las 3 Pestañas

Cada pestaña del Excel tiene columnas distintas que se unifican automáticamente al entrar en la base de datos:

| Atributo Unificado | OT PERSONALIZADAS | OT WIX | OT SHOPIFY |
| :--- | :--- | :--- | :--- |
| **`id`** | Generado / ID fila | Generado / ID fila | Generado / ID fila |
| **`nombre_compra`** | `NOMBRE` | `NOMBRE` | `NOMBRE` |
| **`nombre_comensal`** | `NOMBRE COMENSAL` | `NULL` | `NULL` |
| **`telefono_compra`** | `TELF` | `TELF` | `NULL` |
| **`codigo_tarjeta_regalo`**| `Nº` (o generado) | `NºTARJ.REG.` | `NºTARJ.REG.` |
| **`importe`** | `IMPORTE` | `IMPORTE` | `IMPORTE` |
| **`observaciones`** | `OBSERVACIONES` | `OBSERVACIONES` | `OBSERVACIONES` |
| **`creada_en_revo`** | `NULL` | `CREADA EN REVO` | `CREADA EN REVO` |
| **`fecha_compra`** | `NULL` | `COMPRADO` | `COMPRADO` |
| **`entregado`** | `ENTREGADO` | `NULL` | `NULL` |
| **`fecha_entrega`** | `FECHA` (de entrega) | `NULL` | `NULL` |
| **`pagado`** | `PAGADO` | `NULL` | `NULL` |
| **`fecha_pago`** | `FECHA` (de pago) | `NULL` | `NULL` |
| **`usado`** | `USADO` | `USADO` | `USADO` |
| **`fecha_caducidad`** | Si `NULL` ➔ **+6 meses** desde `fecha_pago`/`fecha_entrega` | Si `NULL` ➔ **+6 meses** desde `fecha_compra` | Si `NULL` ➔ **+6 meses** desde `fecha_compra` |

---

## 4. Próximos Pasos para Implementarlo

1. **Crear endpoint en el servidor:** Añadir `/api/sync-giftcards-drive` en `routes.js` que ejecute el parser y upsert en Postgres.
2. **Configurar el Acceso a Google Drive:**
   * **Opción rápida:** Publicar el archivo / compartir con una cuenta de servicio de Google Cloud (`credentials.json`).
   * **O bien vía Google Apps Script:** Un webhook directo que envíe el JSON al editar el documento.
3. **Añadir botón de sincronización manual en el panel de administración (`/admin/`).**
