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
    const from = message.from;
    const type = message.type;

    if (type === 'text') {
        const text = message.text ? message.text.body : '';
        await handleUserMessage(from, text, 'text');
    } else if (type === 'interactive') {
        const interactive = message.interactive;
        if (interactive && interactive.type === 'list_reply') {
            const listId = interactive.list_reply.id;
            await handleUserMessage(from, listId, 'interactive', { type: 'list', id: listId });
        } else if (interactive && interactive.type === 'button_reply') {
            const buttonId = interactive.button_reply.id;
            await handleUserMessage(from, buttonId, 'interactive', { type: 'button', id: buttonId });
        }
    } else if (type === 'button') {
        const button = message.button;
        const buttonId = (button && (button.payload || button.text)) ? (button.payload || button.text) : '';
        await handleUserMessage(from, buttonId, 'interactive', { type: 'button', id: buttonId });
    }
}

async function handleUserMessage(from, body, type = 'text', interactiveData = null) {
    console.log(`\n📩 MENSAJE RECIBIDO de ${from} [Tipo: ${type}]: "${body}"`);

    // 0. MODO ATENCIÓN HUMANA ACTIVO (Handover a Recepción)
    // Solo interceptar si es texto libre escrito por el cliente (no botones de navegación del bot como 'Terminar' o 'Menú principal')
    const buttonId = interactiveData ? interactiveData.id : body;
    const isFlowNavButton = (type === 'interactive' || type === 'button') && (
        buttonId === 'btn_flow_finish' || buttonId === 'btn_flow_main_menu' ||
        buttonId === 'Terminar' || buttonId === 'terminar' || buttonId === 'Amaitu' || buttonId === 'Finish' ||
        buttonId === 'Menú principal' || buttonId === 'menu principal' || buttonId === 'Menu principal' ||
        buttonId === 'Menu Nagusia' || buttonId === 'Main Menu' ||
        buttonId === 'confirm_yes' || buttonId === 'confirm_no' ||
        (buttonId && buttonId.startsWith('lang_'))
    );

    if (!isFlowNavButton) {
        try {
            const activeSolicitud = await db.getActiveHumanHandoverSolicitud(from);
            if (activeSolicitud) {
                const cleanInput = (body || '').toString().trim().toLowerCase();
                
                // Si el cliente pide explícitamente volver al menú automático
                if (cleanInput === '#bot' || cleanInput === '/menu' || cleanInput === 'menu' || cleanInput === 'menú' || cleanInput === 'volver al bot') {
                    console.log(`🤖 Cliente ${from} solicita salir del modo atención humana y volver al bot.`);
                    await db.updateSolicitudStatus(activeSolicitud.id, activeSolicitud.estado, null, false);
                    await sendMessage(from, "🤖 Has salido del modo de atención personalizada. Volviendo al menú principal de Casa Julián...");
                    await showLocationOrMainMenu(from, userLocations, userLanguages, userStates);
                    return;
                }

                // Guardar el mensaje del cliente en el hilo de la solicitud para que Recepción lo vea
                const mensajeTexto = (type === 'text') ? (body || '') : `[Opción: ${body}]`;
                await db.appendMessageToSolicitud(activeSolicitud.id, {
                    emisor: 'cliente',
                    texto: mensajeTexto
                });

                console.log(`💬 Mensaje de cliente (${from}) añadido al hilo de la solicitud [${activeSolicitud.id}]. Bot en silencio.`);
                return; // ⏸️ EL BOT NO RESPONDE CON MENÚS NI INTERFIERE EN LA CONVERSACIÓN
            }
        } catch (handoverErr) {
            console.error("⚠️ Error en interceptor de atención humana:", handoverErr.message);
        }
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
        const buttonId = interactiveData.id;
        
        if (buttonId === 'page_lang_1' || buttonId === 'page_lang_2') {
            await sendLanguageMenu(from, userLanguages, userStates);
            return;
        }

        if (buttonId && buttonId.startsWith('lang_')) {
            const langCode = buttonId.replace('lang_', '');
            userLanguages.set(from, langCode);
            userStates.set(from, { step: 'select_location', data: {} });
            
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
