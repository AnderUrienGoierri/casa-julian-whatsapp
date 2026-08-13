# Guía de Implementación: Respuestas Automáticas a Llamadas de WhatsApp (Voz & Chat)

## 📌 1. Resumen Ejecutivo
Este documento detalla el procedimiento técnico y funcional para gestionar las llamadas entrantes realizadas al número de WhatsApp del restaurante (`+1 555-166-7550` en entorno de prueba / `+34 943 67 14 17` en entorno oficial de producción).

---

## 🔍 2. Funcionamiento de la API de WhatsApp Cloud sobre Llamadas

1. **Llamadas VoIP por la App de WhatsApp:**
   - La API oficial de WhatsApp (Cloud API) **no permite reproducir locuciones interactivas (IVR) dentro de la llamada de voz en tiempo real**.
   - Sin embargo, Meta envía un evento por **Webhook** (`field: calls`) cada vez que un cliente realiza una llamada o cuando la llamada finaliza/se pierde.

2. **Recepción del Evento por el Chatbot:**
   - Al detectar el evento de llamada entrante o no atendida, el chatbot responde de forma **inmediata al chat del cliente** enviando:
     - **Mensaje de Texto Explicativo:** Informando que las llamadas de voz no se atienden por WhatsApp y guiándolo al menú de reservas.
     - **Nota de Voz Pregrabada (Opcional):** Un archivo de audio `.ogg` / `.mp3` enviado como nota de voz oficial de WhatsApp (`type: audio`), seguido de los botones del menú.

---

## 🛠️ 3. Pasos de Configuración en Meta Business (Developer Portal)

1. Acceder al Administrador de Meta Business > **Administrador de WhatsApp > Números de Teléfono**.
2. Seleccionar el número de teléfono correspondiente (`+1 555-166-7550` o `+34 943 67 14 17`).
3. Entrar en el apartado **Configuración de llamadas**:
   - Activar o desactivar *"Permitir llamadas de voz"*.
   - En *Configuración para desarrolladores*, asegurarse de que las suscripciones a Webhooks en la App de Meta incluyen el evento `calls`.

---

## 💻 4. Guía Técnica de Código para Desarrolladores

### A. Detección del Evento de Llamada (`server.js`)
```javascript
// En el handler POST del webhook de WhatsApp (server.js):
if (entry.changes && entry.changes[0].value.calls) {
    const callData = entry.changes[0].value.calls[0];
    const from = callData.from; // Número de teléfono del cliente
    const callState = callData.event || callData.status; // 'ringing', 'missed', 'rejected'

    await handleIncomingCallEvent(from, callState);
}
```

### B. Handler de Respuesta Automática (`bot/textHandler.js` / `whatsappApi.js`)
```javascript
async function handleIncomingCallEvent(from, callState) {
    const lang = userLanguages.get(from) || 'es';
    
    // 1. Mensaje explicativo multilenguaje
    let callMsg = `ℹ️ *Llamadas de Voz en WhatsApp*\n\nHola, este número no atiende llamadas de voz por WhatsApp. Para consultar disponibilidad, realizar una reserva o resolver cualquier duda, por favor utiliza este chat.`;
    if (lang === 'eu') {
        callMsg = `ℹ️ *Ahots deiak WhatsApp-en*\n\nKaixo, zenbaki honek ez ditu ahots-deiak erantzuten WhatsApp bidez. Erreserbak egiteko edo edozein zalantza argitzeko, erabili txat hau.`;
    } else if (lang === 'en') {
        callMsg = `ℹ️ *WhatsApp Voice Calls*\n\nHello, this number does not handle voice calls on WhatsApp. For reservations or inquiries, please use this chat.`;
    }

    // 2. Opcional: Enviar archivo de audio pregrabado (Nota de Voz)
    // await sendAudioMessage(from, AUDIO_URL_RESPUESTA_LLAMADAS);

    // 3. Enviar botones interactivos hacia el Menú Principal
    const btnTitle = (lang === 'eu' ? 'Menu Nagusia' : (lang === 'en' ? 'Main Menu' : 'Menú principal'));
    await sendInteractiveButtons(from, callMsg, [
        { id: 'btn_flow_main_menu', title: btnTitle }
    ]);
}
```

---

## 📞 5. Llamadas Telefónicas Convencionales (`+34 943 67 14 17`)
Para las llamadas realizadas desde la red telefónica fija/móvil convencional (fuera de la app de WhatsApp):
- La locución o contestador automático se configura directamente en la **centralita telefónica del operador** (Movistar, Vodafone, Orange, etc.) o mediante una Centralita Virtual SIP (Twilio / Asterisk).
- **Ejemplo de Locución Recomendada:**  
  *"Gracias por llamar a Asador Casa Julián de Tolosa. Para gestionar su reserva de forma rápida sin esperas, también puede escribir un mensaje por WhatsApp a este mismo número."*
