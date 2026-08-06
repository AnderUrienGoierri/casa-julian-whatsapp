const express = require('express');
const { processMessage } = require('./botLogic');
require('dotenv').config();

const path = require('path');

const app = express();

// Middleware para parsear el JSON que envía Meta (con límite para subida de adjuntos base64)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir archivos estáticos (imágenes, vídeos, gifs, stickers, uploads)
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'media')));
app.use('/media', express.static(path.join(__dirname, 'media')));
app.use('/documentacion', express.static(path.join(__dirname, 'documentacion')));
app.use('/admin', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
}, express.static(path.join(__dirname, 'public', 'admin')));

// API de Administración Interna
const adminApiRouter = require('./adminApi');
app.use('/api/admin', adminApiRouter);

// Endpoint de salud raíz para Render.com
app.get('/', (req, res) => {
    res.send('🔥 Asador Casa Julian - Servidor de WhatsApp Bot 24/7 Activo');
});

// Endpoint de versión para verificar qué código está desplegado
const DEPLOY_VERSION = 'v2026-08-06-CMS-V62-REVERSE-MODIFICATION-FLOW-ORDER';
app.get('/version', (req, res) => {
    res.json({ version: DEPLOY_VERSION, timestamp: new Date().toISOString() });
});

// Endpoint de diagnóstico directo para probar el envío de emails desde Render
app.get('/test-email', async (req, res) => {
    const { sendInternalStaffAlertInSpanish } = require('./notifications');
    try {
        const result = await sendInternalStaffAlertInSpanish(
            'SOLICITUD MODIFICACIÓN DE RESERVA (DIAGNÓSTICO)',
            '34664037707',
            'Prueba de diagnóstico de correo desde Render.com',
            'Sophie Fernández',
            '+34624570248'
        );
        res.json({ status: 'OK', message: 'Intento de envío de email ejecutado', result: result });
    } catch (e) {
        res.status(500).json({ status: 'ERROR', error: e.message, stack: e.stack });
    }
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

// Cache en memoria para deduplicar mensajes de webhook reintentados por Meta
const processedMessageIds = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [id, timestamp] of processedMessageIds.entries()) {
        if (now - timestamp > 10 * 60 * 1000) {
            processedMessageIds.delete(id);
        }
    }
}, 5 * 60 * 1000);

/**
 * 2. Endpoint POST: Recepción de mensajes
 * Aquí es donde Meta enviará todas las notificaciones de nuevos mensajes
 * que los clientes envíen a nuestro bot.
 */
app.post('/webhook', async (req, res) => {
    // Responder a Meta 200 OK inmediatamente para evitar reintentos duplicados
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

                        // Evitar procesar mensajes duplicados si Meta reintenta la petición
                        if (processedMessageIds.has(message.id)) {
                            console.log(`⚠️ Webhook duplicado omitido (${message.id})`);
                            continue;
                        }
                        processedMessageIds.set(message.id, Date.now());
                        
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
