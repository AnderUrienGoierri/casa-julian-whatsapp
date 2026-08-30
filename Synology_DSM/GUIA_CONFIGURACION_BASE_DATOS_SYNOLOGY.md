# 🚀 Guía de Configuración: Base de Datos en Synology NAS (Casa Julián)

> **Objetivo:** Alojar la base de datos PostgreSQL del chatbot y panel de administración directamente en el servidor **Synology DiskStation DS223j** del restaurante, eliminando para siempre las cuotas de Neon Cloud y garantizando almacenamiento ilimitado (más de 6.8 TB libres), privacidad total y máxima disponibilidad.

---

## 📋 Ficha Técnica del Synology (Extraída de tu sistema)

| Parámetro                      | Valor detectado en Casa Julián                                  |
| :----------------------------- | :-------------------------------------------------------------- |
| **Modelo**                     | Synology DiskStation**DS223j**                                  |
| **Procesador / CPU**           | Realtek RTD1619B (4 núcleos, 64-bit ARMv8)                      |
| **Memoria RAM**                | 1024 MB (1 GB)                                                  |
| **Sistema Operativo**          | DSM 7.4.1 / 7.2                                                 |
| **Almacenamiento Libre**       | **~6.8 TB libres** (Volumen 1 en RAID/SHR)                      |
| **IP Local en el Restaurante** | `192.168.110.57`                                                |
| **Puerta de Enlace / Router**  | `192.168.110.1`                                                 |
| **Dominio DDNS Synology**      | **`casajuliantolosa.synology.me`** (Estado: Normal / Conectado) |
| **Herramienta disponible**     | **Container Manager (Docker)** ya instalado y operativo         |

---

## 🛠️ PASO A PASO: Configuración en el Restaurante

---

### PASO 1: Crear la carpeta persistente para los datos

1. Abre el navegador y accede al panel de DSM: `https://192.168.110.57:5001` (o mediante `https://casajuliantolosa.synology.me:5001`).
2. Abre la aplicación **File Station**.
3. Ve a la carpeta compartida **`docker`** (si no existe, créala desde _Panel de Control > Carpeta compartida_).
4. Dentro de `docker`, crea una nueva carpeta llamada:
   📁 **`postgres_casa_julian`** (Ruta: `/volume1/docker/postgres_casa_julian`).

---

### PASO 2: Levantar el contenedor PostgreSQL con Container Manager (Docker)

1. En el menú principal de DSM, abre la aplicación **Container Manager**.
2. Ve a la pestaña **Registro** (Registry) en el menú de la izquierda.
3. En la barra de búsqueda escribe: `postgres`.
4. Selecciona la imagen oficial **`postgres`**, haz clic en **Descargar** y elige la etiqueta:
   🏷️ **`16-alpine`** _(Es ultra ligera, consume menos de 30 MB de RAM y es 100% compatible con la arquitectura ARM64 de tu DS223j)_.
5. Una vez descargada, ve a la pestaña **Imagen**, selecciona `postgres:16-alpine` y pulsa **Ejecutar**.
6. Configura los siguientes parámetros en el asistente:

#### Configuración General:

- **Nombre del contenedor:** `casa-julian-postgres`
- **Habilitar reinicio automático:** ✅ **Marcado** _(Si el Synology se reinicia por corte de luz, la base de datos arrancará sola)_.

#### Configuración Avanzada:

- **Configuración de puertos:**
  - Puerto local: `5433`
  - Puerto de contenedor: `5432`
  - Tipo: `TCP`
- **Configuración de volumen (Almacenamiento):**
  - Haz clic en **Agregar carpeta**.
  - Carpeta del Synology: `/docker/postgres_casa_julian`
  - Ruta de montaje dentro del contenedor: `/var/lib/postgresql/data`
- **Variables de Entorno (Environment Variables):**
  Pulsa _Agregar_ para añadir cada una de estas 3 variables:

| Variable            | Valor                   | Descripción                           |
| :------------------ | :---------------------- | :------------------------------------ |
| `POSTGRES_DB`       | `casa_julian_db`        | Nombre de la base de datos            |
| `POSTGRES_USER`     | `casajulian_admin`      | Usuario administrador de la BD        |
| `POSTGRES_PASSWORD` | `CasaJulianTolosa2026!` | _(O la contraseña segura que elijas)_ |

7. Haz clic en **Siguiente** y luego en **Listo**. El contenedor se iniciará inmediatamente.

---

### PASO 3: Dar Acceso al Bot desde Internet (Router del Restaurante)

Dado que el bot/panel corre en la nube (Render) o en remoto, necesita conectar con la IP pública del restaurante a través del DDNS `casajuliantolosa.synology.me`:

1. Entra a la administración del router del restaurante (`http://192.168.110.1`).
2. Ve a la sección **Redirección de Puertos (Port Forwarding / NAT / Servidores Virtuales)**.
3. Añade una regla de redirección:
   - **Nombre:** `PostgreSQL Casa Julian`
   - **Protocolo:** `TCP`
   - **Puerto Externo (WAN):** `5432` _(o `54320` por mayor seguridad)_
   - **IP Interna:** `192.168.110.57` _(la IP fija del Synology)_
   - **Puerto Interno (LAN):** `5432`
4. Guarda los cambios en el router.

> 🔒 **Recomendación de Seguridad:** En el cortafuegos de Synology (_Panel de Control > Seguridad > Cortafuegos_), asegúrate de que el puerto `5432` esté permitido.

---

### PASO 4: Conectar el Chatbot con la Base de Datos del Synology

La nueva URL de conexión PostgreSQL para el proyecto es:

```env
DATABASE_URL=postgresql://casajulian_admin:CasaJulianTolosa2026!@casajuliantolosa.synology.me:5432/casa_julian_db?sslmode=disable
```

_(Si usaste un puerto externo diferente en el router, por ejemplo 54320, sustituye `:5432` por `:54320`)_.

#### Dónde se aplica:

1. **En el archivo `.env` local:** Cambiar el valor de `DATABASE_URL`.
2. **En el panel de Render.com:**
   - Entra en tu servicio en [dashboard.render.com](https://dashboard.render.com/).
   - Ve a **Environment Variables**.
   - Edita `DATABASE_URL` con la cadena del Synology y pulsa **Save Changes**.
3. **Inicializar las tablas:**
   - Ejecuta el script del proyecto para crear automáticamente todas las tablas:
     ```bash
     node initPostgres.js
     ```

---

### PASO 5: Copias de Seguridad Automáticas (Hyper Backup)

Tu Synology ya tiene instalado el paquete **Hyper Backup**:

1. Abre **Hyper Backup** en DSM.
2. Crea una nueva tarea de copia de seguridad local o a nube (Synology C2 / Google Drive / USB).
3. Selecciona la carpeta compartida `/docker/postgres_casa_julian`.
4. Programa la copia para ejecutarse **todos los días a las 04:00 AM**.
5. ¡Listo! Tendrás copias históricas y recuperación ante cualquier desastre.

---

## 🚀 Resumen de Beneficios Obtenidos

- ✅ **Sin cuotas mensuales de transferencia:** 0€/mes para siempre.
- ✅ **Sin límite de gigabytes:** Más de 6.8 TB libres en tus discos duros Seagate IronWolf.
- ✅ **Privacidad y cumplimiento RGPD:** Los datos de clientes y chats se guardan físicamente en el restaurante.
- ✅ **Sin caídas por límites de servicio:** El panel de administración y el bot funcionarán de manera ininterrumpida.
