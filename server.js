const express = require('express');
const { processMessage } = require('./botLogic');
require('dotenv').config();

const path = require('path');

const app = express();

// Middleware para parsear el JSON que envía Meta
app.use(express.json());
// Servir archivos estáticos (imágenes) en /public
app.use('/public', express.static(path.join(__dirname, 'documentacion')));

// Endpoint de salud raíz para Render.com
app.get('/', (req, res) => {
    res.send('🔥 Asador Casa Julian - Servidor de WhatsApp Bot 24/7 Activo');
});

const PORT = process.env.PORT || 3000;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

/**
 * 1. Endpoint GET: Verificación de Webhook
 * Requerido por Meta la primera vez que configuras la URL en su panel.
 * Comprueba que el token que te envían coincida con el tuyo.
 */
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Si Meta está intentando suscribirse y el token coincide
    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
        console.log('✅ Webhook verificado correctamente por Meta!');
        res.status(200).send(challenge);
    } else {
        // Si el token no coincide
        console.log('❌ Falló la verificación del Webhook.');
        res.sendStatus(403);
    }
});

/**
 * 2. Endpoint POST: Recepción de mensajes
 * Aquí es donde Meta enviará todas las notificaciones de nuevos mensajes
 * que los clientes envíen a nuestro bot.
 */
app.post('/webhook', async (req, res) => {
    // IMPORTANTE: Responder con 200 OK inmediatamente.
    // Meta requiere una respuesta rápida, si tardas procesando, reenviará el mensaje.
    res.sendStatus(200);

    try {
        const body = req.body;
        
        // Asegurarnos de que viene de una cuenta de WhatsApp
        if (body.object === 'whatsapp_business_account') {
            
            // Un payload puede contener múltiples entradas
            for (const entry of body.entry) {
                // Cada entrada puede contener múltiples cambios
                for (const change of entry.changes) {
                    // Verificamos que contenga un mensaje entrante
                    if (change.value && change.value.messages && change.value.messages[0]) {
                        
                        const message = change.value.messages[0];
                        
                        // Enviamos el mensaje a nuestra lógica (botLogic.js)
                        await processMessage(message);
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error al procesar el webhook entrante:", error);
    }
});

// Levantar el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor de WhatsApp Bot para Casa Julian corriendo en http://localhost:${PORT}`);
    console.log(`🌍 Para conectarlo con Meta, ejecuta en otra terminal: ngrok http ${PORT}`);
});
