# Caso de Uso 01: Saludo Inicial y Selección de Restaurante

## 📌 Descripción General
Este flujo administra el primer contacto del cliente con el chatbot de **Asador Casa Julián**. Muestra las imágenes de bienvenida, saluda al usuario y le permite seleccionar en cuál de los restaurantes de la firma desea ser atendido (**Tolosa** o **Madrid**).

> **Regla de Memoria Persistente:** Una vez que el cliente selecciona un restaurante (por ejemplo, Tolosa), la preferencia queda registrada. En interacciones posteriores, el chatbot no volverá a solicitar la elección de restaurante y lo dirigirá directamente al Menú Principal, salvo que el usuario reinicie la sesión enviando un saludo inicial (*"hola"*, *"inicio"*, *"menú"*).

---

## 🔄 Flujo Paso a Paso Detallado

### Paso 1: Mensaje de Inicio del Cliente
* **Mensaje del Cliente:**
  > `Hola` (o *"Buenas"*, *"Inicio"*, *"Kaixo"*, *"Menú"*)

* **Procesamiento Interno del Chatbot:**
  1. Verifica el idioma predeterminado del remitente (por defecto, Español `es`).
  2. Comprueba si el usuario tiene una ubicación guardada en la base de datos/sesión (`userLocations`).
  3. Si es la primera interacción o el cliente envía un saludo de reinicio, resetea cualquier formulario incompleto y muestra la pantalla inicial.

---

### Paso 2: Respuesta Inicial del Chatbot (Selección de Restaurante)
* **Respuesta del Chatbot (Mensaje 1 - Imagen):**
  > 📷 *(Envía la imagen de bienvenida `media/saludo_inicial.png` con la tarjeta del Asador).*

* **Respuesta del Chatbot (Mensaje 2 - Sticker & Botones Interactivos):**
  > 📌 **¿En cuál de nuestros restaurantes estás interesado?**
  >
  > [ 📍 Tolosa ]
  > [ 📍 Madrid ]

---

### Paso 3A: Opción Selección Madrid (Interacción)
* **Acción del Cliente:**
  > Pulsa el botón **`[ 📍 Madrid ]`** (o escribe *"Madrid"*).

* **Respuesta del Chatbot:**
  > 📍 **Casa Julián de Tolosa - Madrid**
  > 
  > Calle Don Ramón de la Cruz, 6, Salamanca, 28001 Madrid
  > 📞 **Atención Telefónica / Reservas:** +34 914 31 15 60
  > 🌐 **Web de Reservas Madrid:** https://casajulian.es/madrid/
  >
  > ¡Esperamos verte pronto en Madrid!

---

### Paso 3B: Opción Selección Tolosa (Interacción)
* **Acción del Cliente:**
  > Pulsa el botón **`[ 📍 Tolosa ]`** (o escribe *"Tolosa"*).

* **Procesamiento Interno:**
  - Se guarda la ubicación **Tolosa** para la sesión actual y persistencia futura.

* **Respuesta del Chatbot (Menú Principal de Tolosa):**
  > 🥩 **DÍGANOS EN QUÉ LE PODEMOS AYUDAR:**
  >
  > **1. Hacer una reserva**
  > *Consultar disponibilidad, reservar online o lista de espera.*
  >
  > **2. Modificación**
  > *Solicitar cambio de comensales, fecha u hora.*
  >
  > **3. Cancelar reserva**
  > *Solicitar cancelación de una reserva.*
  >
  > **4. Regalar Menú Trad.**
  > *Comprar tarjeta regalo del Menú Tradición online.*
  >
  > **5. Otras cuestiones**
  > *Horarios, preguntas frecuentes y teléfono.*
  >
  > **6. Cambiar Idioma**
  > *Change language / Hizkuntza aldatu.*

---

## 🛠️ Excepciones y Caso de Reingreso
* **Si el cliente ya había seleccionado Tolosa previamente:**
  - Al escribir cualquier mensaje de opción (ej. *"1"* o *"hacer reserva"*), el chatbot **salta directamente** al Menú Principal de Tolosa sin volver a solicitar restaurante.
