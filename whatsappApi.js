const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config();

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

let simMessageStore = new Map();

function interceptSimMessage(to, payload) {
    if (to && (to.startsWith('sim_') || to === 'test_admin')) {
        if (!simMessageStore.has(to)) {
            simMessageStore.set(to, []);
        }
        simMessageStore.get(to).push({
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            timestamp: new Date().toISOString(),
            ...payload
        });
        return true;
    }
    return false;
}

function getSimMessages(to) {
    return simMessageStore.get(to) || [];
}

function clearSimMessages(to) {
    simMessageStore.set(to, []);
}

/**
 * Envia un mensaje de texto simple.
 */
async function sendMessage(to, text) {
    if (interceptSimMessage(to, { type: 'text', text })) {
        return { success: true, simulated: true };
    }

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
    if (interceptSimMessage(to, { type: 'button', text, buttons })) {
        return { success: true, simulated: true };
    }

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
    if (interceptSimMessage(to, { type: 'list', text: bodyText, buttonText, sections })) {
        return { success: true, simulated: true };
    }

    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
        console.error("Falta configurar WHATSAPP_TOKEN o PHONE_NUMBER_ID en el archivo .env");
        return;
    }

    // Garantizar que ninguna sección supere el límite estricto de 10 filas de WhatsApp Cloud API
    const sanitizedSections = (sections || []).map(sec => ({
        ...sec,
        title: (sec.title || '').slice(0, 24),
        rows: (sec.rows || []).slice(0, 10)
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
                    type: "list",
                    body: { text: bodyText },
                    action: {
                        button: (buttonText || '').slice(0, 20),
                        sections: sanitizedSections
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

/**
 * Envía un vídeo o GIF animado por WhatsApp a través de un enlace URL público.
 * Si isGif es true, incluye gif_playback: true para autoreproducción en bucle tipo GIF.
 */
async function sendVideoMessage(to, videoUrl, caption = '') {
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
        console.error("Falta configurar WHATSAPP_TOKEN o PHONE_NUMBER_ID en el archivo .env");
        return;
    }

    try {
        const videoPayload = {
            link: videoUrl,
            caption: caption
        };

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
                type: 'video',
                video: videoPayload
            }
        });
        return response.data;
    } catch (error) {
        console.error("Error enviando vídeo/GIF por WhatsApp:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    }
}

let cachedStickerMediaId = null;

async function uploadStickerToMeta(filePath) {
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('file', fs.createReadStream(filePath));
    formData.append('type', 'image/webp');

    const uploadRes = await axios.post(
        `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/media`,
        formData,
        {
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                ...formData.getHeaders()
            }
        }
    );
    return uploadRes.data.id;
}

/**
 * Envía un sticker animado por WhatsApp subiéndolo a la API de Medios de Meta.
 * Si la llamada con el ID cacheado falla, reintenta automáticamente una subida fresca.
 */
async function sendStickerMessage(to, stickerFilePath) {
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
        console.error("Falta configurar WHATSAPP_TOKEN o PHONE_NUMBER_ID en el archivo .env");
        return;
    }

    const filePath = stickerFilePath || path.join(__dirname, 'media', 'casa_julian_sticker.webp');
    if (!fs.existsSync(filePath)) {
        console.error("El archivo de sticker no existe en la ruta:", filePath);
        return;
    }

    try {
        if (!cachedStickerMediaId) {
            cachedStickerMediaId = await uploadStickerToMeta(filePath);
            console.log("✅ Sticker animado subido con éxito a Meta. Media ID:", cachedStickerMediaId);
        }

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
                type: 'sticker',
                sticker: {
                    id: cachedStickerMediaId
                }
            }
        });
        return response.data;
    } catch (error) {
        console.warn("⚠️ Error en envío con Media ID cacheado. Reintentando subida fresca a Meta...", error.message);
        cachedStickerMediaId = null;

        try {
            const freshMediaId = await uploadStickerToMeta(filePath);
            cachedStickerMediaId = freshMediaId;
            console.log("✅ Sticker subido en reintento fresco. Nuevo Media ID:", freshMediaId);

            const retryResponse = await axios({
                method: 'POST',
                url: `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                data: {
                    messaging_product: 'whatsapp',
                    to: to,
                    type: 'sticker',
                    sticker: {
                        id: freshMediaId
                    }
                }
            });
            return retryResponse.data;
        } catch (retryErr) {
            console.error("❌ Error definitivo enviando sticker por WhatsApp:", retryErr.response ? JSON.stringify(retryErr.response.data, null, 2) : retryErr.message);
        }
    }
}

module.exports = {
    sendMessage,
    sendInteractiveButtons,
    sendInteractiveList,
    sendImageMessage,
    sendVideoMessage,
    sendStickerMessage,
    getSimMessages,
    clearSimMessages
};
