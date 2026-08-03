# Caso de Uso 04: Inscripción en Lista de Espera

## 📌 Descripción General
Este flujo permite a un cliente inscribirse en la **Lista de Espera** cuando no hay plazas disponibles para la fecha deseada o cuando elige anotarse proactivamente.

> **Reglas de Negocio Clave:**
> 1. Todas las inscripciones en la lista de espera quedan registradas con el estado inicial **`Pendiente asignacion`**.
> 2. Cuando la recepción del restaurante procesa la solicitud y le asigna una mesa/reserva, el registro pasa al estado **`Reserva Asignada`**.
> 3. **Control Anti-Duplicados:** Si ya existe un registro activo en la lista de espera en estado `Pendiente asignacion` con el mismo número de teléfono o nombre del titular, el chatbot bloquea la duplicación.

---

## 🔄 Flujo Paso a Paso Detallado

### Paso 1: Inicio del Formulario de Lista de Espera
* **Origen:** Menú Principal ➔ Opción `1. Hacer una reserva` ➔ `[ 🚫 No tengo ]` ➔ `[ 📝 Lista de Espera ]`.

* **Respuesta del Chatbot:**
  > 📝 **Lista de Espera (1/6)**
  >
  > ¿Para cuántos comensales sería la mesa? (Indica la cifra, máximo 6):

---

### Paso 2: Selección de Comensales
* **Mensaje del Cliente:**
  > `4`

* **Respuesta del Chatbot (Botones de Niños/Niñas):**
  > 📝 **Lista de Espera (2/6)**
  >
  > ¿Cuántos niños/niñas habría en la mesa?
  >
  > [ 0 ]
  > [ 1 ]
  > [ 2 niños/niñas ]

---

### Paso 3: Selección de Niños/Niñas
* **Acción del Cliente:**
  > Pulsa **`[ 0 ]`**.

* **Respuesta del Chatbot:**
  > 📝 **Lista de Espera (3/6)**
  >
  > ¿Qué días o turnos tienes preferencia para acudir? (Ejemplo: *"Sábados a comer"*, *"Fines de semana cena"*, *"Cualquier día de agosto"*):

---

### Paso 4: Preferencia de Días y Turnos
* **Mensaje del Cliente:**
  > `Cualquier sábado de agosto a comer`

* **Respuesta del Chatbot:**
  > 📝 **Lista de Espera (4/6)**
  >
  > Indícanos tu **Nombre y Apellidos**:

---

### Paso 5: Nombre del Titular y Verificación Anti-Duplicados
* **Mensaje del Cliente:**
  > `Ander Urien Telleria`

* **Evaluación Interna Anti-Duplicados:**
  - El sistema consulta si existe un registro activo en estado `Confirmada` para el teléfono del remitente (`34664037707`) o para `Ander Urien Telleria`.

* **Si YA EXISTE un registro activo (Bloqueo de Duplicado):**
  - **Respuesta del Chatbot:**
    > ⚠️ **Ya dispones de una solicitud activa en la Lista de Espera:**
    >
    > 🆔 **Solicitud:** `ESP-942945`
    > 👤 **Titular:** Ander Urien Telleria
    > 📊 **Estado:** Pendiente asignacion
    > 📅 **Preferencia:** Cualquier sábado de agosto
    >
    > Si necesitas hacer cambios, ponte en contacto directamente con nosotros por teléfono.

* **Si NO existe duplicado (Continuar):**
  - **Respuesta del Chatbot:**
    > 📝 **Lista de Espera (5/6)**
    >
    > Indícanos tu **correo electrónico** (opcional, para informarte si se libera mesa):
    >
    > [ ❌ Omitir Email ]

---

### Paso 6: Email y Creación Directa
* **Acción del Cliente:**
  > Pulsa **`[ ❌ Omitir Email ]`** (o escribe su correo).

* **Procesamiento Interno:**
  1. Se genera un registro en `lista_espera` con estado **`Pendiente asignacion`** e ID único `ESP-XXXXXX`.
  2. Se guarda en PostgreSQL y `db.json`.
  3. Se notifica inmediatamente por email a la recepción del restaurante.

* **Respuesta del Chatbot (Mensaje de Confirmación):**
  > ✅ **¡INSCRIPCIÓN EN LISTA DE ESPERA REGISTRADA!**
  >
  > 🆔 **ID Solicitud:** `ESP-182022`
  > 👤 **Nombre:** Ander Urien Telleria
  > 📞 **Teléfono:** 34664037707
  > 👥 **Comensales:** 4 personas (0 niños/niñas)
  > 📅 **Días de Preferencia:** Cualquier sábado de agosto a comer
  > 📊 **Estado:** Pendiente asignacion
  >
  > Tu inscripción ha sido registrada correctamente. Te avisaremos en cuanto dispongamos de una mesa libre.
