const axios = require('axios');
require('dotenv').config();

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

/**
 * Envia un mensaje de texto simple.
 */
async function sendMessage(to, text) {
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
        console.error("Falta configurar WHATSAPP_TOKEN o PHONE_NUMBER_ID en el archivo .env");
        return;
    }
    
    try {
        const response = await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: {
                messaging_product: 'whatsapp',
                to: to,
                type: 'text',
                text: { body: text }
            }
        });
        return response.data;
    } catch (error) {
        console.error("Error enviando mensaje de texto:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    }
}

/**
 * Envía un mensaje con botones interactivos (máximo 3 botones).
 */
async function sendInteractiveButtons(to, text, buttons) {
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
        console.error("Falta configurar WHATSAPP_TOKEN o PHONE_NUMBER_ID en el archivo .env");
        return;
    }

    if (buttons.length > 3) {
        console.error("Error: WhatsApp no permite enviar más de 3 botones interactivos a la vez.");
        return;
    }

    const formattedButtons = buttons.map(button => ({
        type: "reply",
        reply: {
            id: button.id,
            title: button.title
        }
    }));

    try {
        const response = await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: {
                messaging_product: 'whatsapp',
                to: to,
                type: 'interactive',
                interactive: {
                    type: "button",
                    body: { text: text },
                    action: {
                        buttons: formattedButtons
                    }
                }
            }
        });
        return response.data;
    } catch (error) {
        console.error("Error enviando botones interactivos:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    }
}

/**
 * Envía un mensaje de Lista Interactiva (permite hasta 10 opciones ordenadas en secciones).
 */
async function sendInteractiveList(to, bodyText, buttonText, sections) {
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
        console.error("Falta configurar WHATSAPP_TOKEN o PHONE_NUMBER_ID en el archivo .env");
        return;
    }

    try {
        const response = await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: {
                messaging_product: 'whatsapp',
                to: to,
                type: 'interactive',
                interactive: {
                    type: "list",
                    body: { text: bodyText },
                    action: {
                        button: buttonText,
                        sections: sections
                    }
                }
            }
        });
        return response.data;
    } catch (error) {
        console.error("Error enviando lista interactiva:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    }
}

/**
 * Envía una imagen por WhatsApp a través de un enlace URL público.
 */
async function sendImageMessage(to, imageUrl, caption = '') {
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
        console.error("Falta configurar WHATSAPP_TOKEN o PHONE_NUMBER_ID en el archivo .env");
        return;
    }

    try {
        const response = await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: {
                messaging_product: 'whatsapp',
                to: to,
                type: 'image',
                image: {
                    link: imageUrl,
                    caption: caption
                }
            }
        });
        return response.data;
    } catch (error) {
        console.error("Error enviando imagen por WhatsApp:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    }
}

module.exports = {
    sendMessage,
    sendInteractiveButtons,
    sendInteractiveList,
    sendImageMessage
};
