const { sendMessage } = require('../whatsappApi');
const db = require('../database');
const { userStates, userLanguages, userLocations } = require('./stateManager');
const {
    sendLanguageMenu,
    showLocationOrMainMenu,
    sendLocationMenu,
    sendMainMenu
} = require('./menus');
const { handleListResponse, handleButtonResponse } = require('./interactiveHandler');
const { handleTextMessage } = require('./textHandler');

async function processMessage(message) {
    if (!message || !message.from) return;
    const from = message.from;
    const type = message.type;

    if (type === 'text') {
        const text = message.text ? message.text.body : '';
        await handleUserMessage(from, text, 'text');
    } else if (type === 'interactive') {
        const interactive = message.interactive;
        if (interactive && interactive.type === 'list_reply') {
            const listId = interactive.list_reply.id;
            const listTitle = interactive.list_reply.title || listId;
            await handleUserMessage(from, listTitle, 'interactive', { type: 'list', id: listId, title: listTitle });
        } else if (interactive && interactive.type === 'button_reply') {
            const buttonId = interactive.button_reply.id;
            const buttonTitle = interactive.button_reply.title || buttonId;
            await handleUserMessage(from, buttonTitle, 'interactive', { type: 'button', id: buttonId, title: buttonTitle });
        } else if (interactive && interactive.type === 'nfm_reply') {
            const flowData = interactive.nfm_reply.response_json;
            await handleUserMessage(from, "Formulario Meta Flow enviado", 'interactive', { type: 'flow', data: flowData });
        } else {
            const genericTitle = (interactive && (interactive.title || interactive.id)) ? (interactive.title || interactive.id) : 'Opción pulsada';
            await handleUserMessage(from, genericTitle, 'interactive', { type: 'interactive', data: interactive });
        }
    } else if (type === 'button') {
        const button = message.button;
        const buttonId = (button && (button.payload || button.text)) ? (button.payload || button.text) : '';
        const buttonTitle = (button && button.text) ? button.text : buttonId;
        await handleUserMessage(from, buttonTitle, 'interactive', { type: 'button', id: buttonId, title: buttonTitle });
    } else {
        const fallbackText = (message[type] && (message[type].caption || message[type].text)) ? (message[type].caption || message[type].text) : `[Mensaje entrante de tipo: ${type}]`;
        await handleUserMessage(from, fallbackText, type);
    }
}

async function handleUserMessage(from, body, type = 'text', interactiveData = null) {
    console.log(`\n📩 MENSAJE RECIBIDO de ${from} [Tipo: ${type}]: "${body}"`);

    // Registrar mensaje del cliente en el Historial Completo del Chatbot
    try {
        await db.logUserChatHistory(from, {
            emisor: 'cliente',
            tipo: type || 'text',
            texto: body || '',
            metadata: interactiveData || {}
        });
    } catch (histErr) {
        console.error("⚠️ Error guardando historial de chat de cliente:", histErr.message);
    }

    // 0. VERIFICAR SI EL NÚMERO ESTÁ EN LA LISTA DE NÚMEROS SILENCIADOS (PROVEEDORES / EMPLEADOS / ALBA)
    try {
        const silenced = await db.isPhoneSilenced(from);
        if (silenced) {
            console.log(`🔇 [MODO SILENCIOSO AUTOMÁTICO] Teléfono ${from} (${silenced.nombre || 'Contacto'} - ${silenced.categoria}) está en la lista silenciada. Bot en silencio permanente.`);
            
            // Crear o adjuntar mensaje a solicitud para recepción
            const activeSol = await db.getActiveHumanHandoverSolicitud(from);
            if (activeSol) {
                await db.appendMessageToSolicitud(activeSol.id, {
                    emisor: 'cliente',
                    texto: body || ''
                });
            } else {
                const catLabel = (silenced.categoria === 'empleado' || silenced.categoria === 'alba') ? '👷 Empleado / Personal' : '🚚 Proveedor';
                await db.createSolicitud({
                    tipoAccion: `CONTACTO SILENCIADO: ${silenced.nombre || 'Proveedor/Empleado'}`,
                    categoria: silenced.categoria || 'proveedor',
                    categoriaLabel: catLabel,
                    telefonoCliente: from,
                    nombreCliente: `${silenced.nombre || 'Contacto'} (${catLabel})`,
                    telefonoReserva: from,
                    datosDetallados: `💬 Mensaje directo de ${silenced.nombre || 'contacto'}:\n${body || ''}`,
                    estado: 'PENDIENTE',
                    enAtencionHumana: true
                });
            }
            return; // ⏸️ BYPASS TOTAL: EL BOT NUNCA INTERACTÚA CON ESTOS NÚMEROS
        }
    } catch (silenceErr) {
        console.error("⚠️ Error verificando número silenciado:", silenceErr.message);
    }

    // 0a. VERIFICAR SI EL CHATBOT ESTÁ ACTIVO O PAUSADO GLOBALMENTE (DESDE AJUSTES DEL CMS)
    try {
        const settings = await db.getSystemSettings();
        if (settings && settings.botActive === false) {
            console.log(`⏸️ Chatbot actualmente DESACTIVADO / PAUSADO por el Administrador. Mensaje ignorado o en espera.`);
            // Si hay un mensaje de mantenimiento configurado y es el primer mensaje o una interacción
            if (settings.maintenanceMessage && settings.sendMaintenanceNotice) {
                await sendMessage(from, settings.maintenanceMessage);
            }
            return;
        }
    } catch (err) {
        console.error("⚠️ Error consultando estado activo del bot:", err.message);
    }

    // 0b. MODO ATENCIÓN HUMANA (Handover a Recepción)
    // Si el cliente interactúa con cualquier botón o lista de opciones del chatbot, reactivamos automáticamente el modo bot
    const isInteractive = type === 'interactive' || type === 'button' || interactiveData !== null;

    try {
        const activeSolicitud = await db.getActiveHumanHandoverSolicitud(from);
        if (activeSolicitud) {
            if (isInteractive) {
                console.log(`🤖 Cliente ${from} interactúa con botón/menú del chatbot -> Reactivando Modo Bot (enAtencionHumana = false).`);
                await db.updateSolicitudStatus(activeSolicitud.id, activeSolicitud.estado, null, false);
            } else {
                const cleanInput = (body || '').toString().trim().toLowerCase();
                
                // Si el cliente pide explícitamente volver al menú automático por texto
                if (cleanInput === '#bot' || cleanInput === '/menu' || cleanInput === 'menu' || cleanInput === 'menú' || cleanInput === 'volver al bot') {
                    console.log(`🤖 Cliente ${from} solicita salir del modo atención humana y volver al bot.`);
                    await db.updateSolicitudStatus(activeSolicitud.id, activeSolicitud.estado, null, false);
                    await sendMessage(from, "🤖 Has salido del modo de atención personalizada. Volviendo al menú principal de Casa Julián...");
                    await showLocationOrMainMenu(from, userLocations, userLanguages, userStates);
                    return;
                }

                // Guardar el mensaje libre de texto del cliente en el hilo de la solicitud para Recepción
                await db.appendMessageToSolicitud(activeSolicitud.id, {
                    emisor: 'cliente',
                    texto: body || ''
                });

                console.log(`💬 Mensaje de texto de cliente (${from}) añadido al hilo de la solicitud [${activeSolicitud.id}]. Bot en silencio.`);
                return; // ⏸️ EL BOT NO RESPONDE A TEXTO LIBRE MIENTRAS ESTÉ EN ATENCIÓN HUMANA
            }
        }
    } catch (handoverErr) {
        console.error("⚠️ Error en interceptor de atención humana:", handoverErr.message);
    }

    // Interceptar reglas dinámicas de palabras clave configuradas por el administrador
    if (type === 'text' && body) {
        try {
            const customRules = db.getCustomRules();
            const cleanInput = body.trim().toLowerCase();
            const matchedRule = customRules.find(r => r.isActive && r.keyword && cleanInput.includes(r.keyword.toLowerCase()));
            if (matchedRule) {
                console.log(`🎯 Regla dinámica por palabra clave activada: "${matchedRule.keyword}"`);
                await sendMessage(from, matchedRule.responseText);
                await showLocationOrMainMenu(from, userLocations, userLanguages, userStates);
                return;
            }
        } catch (e) {
            console.error("⚠️ Error evaluando reglas dinámicas de usuario:", e.message);
        }
    }

    // 1. Interceptar selección de idioma por botón/lista
    if (interactiveData && (interactiveData.type === 'button' || interactiveData.type === 'list')) {
        const buttonId = interactiveData.id || '';
        const buttonTitle = (interactiveData.title || '').toLowerCase();
        
        if (buttonId === 'page_lang_1' || buttonId === 'page_lang_2') {
            await sendLanguageMenu(from, userLanguages, userStates);
            return;
        }

        let selectedLang = null;
        if (buttonId.startsWith('lang_')) {
            selectedLang = buttonId.replace('lang_', '');
        } else if (buttonTitle.includes('español') || buttonTitle.includes('espanol') || buttonTitle.startsWith('es ')) {
            selectedLang = 'es';
        } else if (buttonTitle.includes('euskara') || buttonTitle.includes('euskera') || buttonTitle.startsWith('eu ')) {
            selectedLang = 'eu';
        } else if (buttonTitle.includes('english') || buttonTitle.startsWith('en ')) {
            selectedLang = 'en';
        }

        if (selectedLang) {
            userLanguages.set(from, selectedLang);
            userStates.set(from, { step: 'select_location', data: {} });
            console.log(`🌐 Idioma de ${from} fijado a "${selectedLang}"`);
            await showLocationOrMainMenu(from, userLocations, userLanguages, userStates);
            return;
        }
    }

    if (type === 'interactive') {
        if (interactiveData.type === 'list') {
            await handleListResponse(from, interactiveData.id);
        } else if (interactiveData.type === 'button') {
            await handleButtonResponse(from, interactiveData.id);
        }
        return;
    }

    await handleTextMessage(from, body);
}

module.exports = {
    processMessage,
    handleUserMessage
};
