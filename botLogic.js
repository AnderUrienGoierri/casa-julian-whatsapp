const { 
    sendInteractiveButtons, 
    sendInteractiveList, 
    sendMessage,
    sendImageMessage 
} = require('./whatsappApi');
const db = require('./database');
const { sendInternalStaffAlertInSpanish } = require('./notifications');
const { getTranslation } = require('./i18n');

// Mapas en memoria para rastrear estado e idioma de los usuarios por teléfono
const userStates = new Map();
const userLanguages = new Map();

/**
 * Maneja el flujo de mensajes recibidos de WhatsApp.
 */
async function handleUserMessage(from, body, type = 'text', interactiveData = null) {
    console.log(`\n📩 MENSAJE RECIBIDO de ${from} [Tipo: ${type}]: "${body}"`);

    // 1. Interceptar selección de idioma por botón/lista
    if (interactiveData && (interactiveData.type === 'button' || interactiveData.type === 'list')) {
        const buttonId = interactiveData.id;
        
        if (buttonId === 'page_lang_1') {
            await sendLanguageMenu(from, 1);
            return;
        }
        if (buttonId === 'page_lang_2') {
            await sendLanguageMenu(from, 2);
            return;
        }

        if (buttonId && buttonId.startsWith('lang_')) {
            const langCode = buttonId.replace('lang_', '');
            userLanguages.set(from, langCode);
            userStates.set(from, { step: 'select_location', data: {} });
            
            await sendLocationMenu(from);
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

/**
 * Muestra el menú de selección de idioma paginado (14 idiomas).
 * Página 1 muestra prioritariamente: 1. Español, 2. Euskara, 3. English.
 */
async function sendLanguageMenu(from, page = 1) {
    userStates.set(from, { step: 'select_language', data: {} });

    if (page === 2) {
        const bodyText = "🌍 *Selecciona tu idioma / Select your language (Pág. 2/2):*";
        const buttonText = "Seleccionar Idioma";
        const sections = [
            {
                title: "Idiomas (Pág. 2/2)",
                rows: [
                    { id: "lang_it", title: "🇮🇹 8. Italiano", description: "Assistenza clienti in Italiano." },
                    { id: "lang_pl", title: "🇵🇱 9. Polski", description: "Obsługa klienta w języku polskim." },
                    { id: "lang_ro", title: "🇷🇴 10. Română", description: "Asistență clienți în limba română." },
                    { id: "lang_be", title: "🇧🇪 11. Belgisch (NL/FR)", description: "Belgische ondersteuning / Support Belge." },
                    { id: "lang_ko", title: "🇰🇷 12. 한국어", description: "한국어 고객 지원 서비스." },
                    { id: "lang_zh", title: "🇨🇳 13. 中文", description: "中文全方位客户服务。" },
                    { id: "lang_ja", title: "🇯🇵 14. 日本語", description: "日本語によるカスタマーサポート。" },
                    { id: "lang_ru", title: "🇷🇺 15. Русский", description: "Полная поддержка на русском языке." },
                    { id: "page_lang_1", title: "◀️ Pág. 1/2", description: "Volver a la página 1 de idiomas." }
                ]
            }
        ];
        await sendInteractiveList(from, bodyText, buttonText, sections);
    } else {
        const bodyText = "🥩🔥 *¡Bienvenido/a a Casa Julián!* 🥩🔥\n\nSerá un placer ayudarte. ¿En qué idioma deseas continuar? / Select your language:";
        const buttonText = "Seleccionar Idioma";
        const sections = [
            {
                title: "Idiomas (Pág. 1/2)",
                rows: [
                    { id: "lang_es", title: "🇪🇸 1. Español", description: "Atención al cliente en Español." },
                    { id: "lang_eu", title: "🇪🇺 2. Euskara", description: "Bezeroen arreta Euskaraz." },
                    { id: "lang_en", title: "🇬🇧 3. English", description: "Customer support in English." },
                    { id: "lang_fr", title: "🇫🇷 4. Français", description: "Support client en Français." },
                    { id: "lang_de", title: "🇩🇪 5. Deutsch", description: "Kundenservice auf Deutsch." },
                    { id: "lang_nl", title: "🇳🇱 6. Nederlands", description: "Klantenservice in het Nederlands." },
                    { id: "lang_ar", title: "🇸🇦 7. العربية", description: "خدمة العملاء باللغة العربية." },
                    { id: "page_lang_2", title: "▶️ Más idiomas", description: "Ver página 2 de idiomas." }
                ]
            }
        ];
        await sendInteractiveList(from, bodyText, buttonText, sections);
    }
}

/**
 * Pregunta al cliente la ubicación del restaurante de su interés (Madrid vs País Vasco).
 */
async function sendLocationMenu(from) {
    const lang = userLanguages.get(from) || 'es';
    const bodyText = getTranslation(lang, 'selectLocationBody');
    const buttons = [
        { id: 'loc_pais_vasco', title: getTranslation(lang, 'locPaisVasco').slice(0, 20) },
        { id: 'loc_madrid', title: getTranslation(lang, 'locMadrid').slice(0, 20) }
    ];
    await sendInteractiveButtons(from, bodyText, buttons);
}

/**
 * Muestra el menú principal de País Vasco (Tolosa) en el idioma del usuario.
 */
async function sendMainMenu(from) {
    const lang = userLanguages.get(from) || 'es';
    userStates.set(from, { step: 'main_menu', data: {} });

    // 1. Imagen oficial de Casa Julián
    const imageUrl = "https://casa-julian-whatsapp-bot.onrender.com/public/imagen_chat_casa_julian.jpg";
    await sendImageMessage(from, imageUrl, "🥩🔥 *Asador Casa Julián de Tolosa* 🥩🍖");

    // 2. Menú desplegable interactivo con las 5 categorías del diagrama
    const bodyText = getTranslation(lang, 'mainMenuHeader');
    const buttonText = getTranslation(lang, 'menuButtonText');
    
    const sections = [
        {
            title: "Servicios Casa Julián",
            rows: [
                { id: "opt_quiero_reservar", title: getTranslation(lang, 'opt1Title').slice(0, 24), description: getTranslation(lang, 'opt1Desc').slice(0, 72) },
                { id: "opt_modificacion", title: getTranslation(lang, 'opt2Title').slice(0, 24), description: getTranslation(lang, 'opt2Desc').slice(0, 72) },
                { id: "opt_cancelacion", title: getTranslation(lang, 'opt3Title').slice(0, 24), description: getTranslation(lang, 'opt3Desc').slice(0, 72) },
                { id: "opt_tengo_menu_tradicion", title: getTranslation(lang, 'opt4Title').slice(0, 24), description: getTranslation(lang, 'opt4Desc').slice(0, 72) },
                { id: "opt_otras_cuestiones", title: getTranslation(lang, 'opt5Title').slice(0, 24), description: getTranslation(lang, 'opt5Desc').slice(0, 72) },
                { id: "opt_cambiar_idioma", title: getTranslation(lang, 'optLangTitle').slice(0, 24), description: getTranslation(lang, 'optLangDesc').slice(0, 72) }
            ]
        }
    ];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

/**
 * Responde a selecciones de listas interactivas.
 */
async function handleListResponse(from, listId) {
    const lang = userLanguages.get(from) || 'es';

    switch (listId) {
        case 'opt_cambiar_idioma':
            await sendLanguageMenu(from, 1);
            break;

        case 'opt_quiero_reservar':
            userStates.set(from, { step: 'reserva_opciones', data: {} });
            const reservaBody = getTranslation(lang, 'reservaIntro');
            const reservaButtons = [
                { id: 'btn_solicitar_reserva', title: getTranslation(lang, 'btnSolicitarReserva').slice(0, 20) },
                { id: 'btn_add_lista_espera', title: getTranslation(lang, 'btnAddListaEspera').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, reservaBody, reservaButtons);
            break;

        case 'opt_modificacion':
            userStates.set(from, { step: 'modificacion_datos_actuales', data: {} });
            await sendMessage(from, getTranslation(lang, 'modCancelDataPrompt'));
            break;

        case 'opt_cancelacion':
            userStates.set(from, { step: 'cancelacion_datos_actuales', data: {} });
            await sendMessage(from, getTranslation(lang, 'modCancelDataPrompt'));
            break;

        case 'opt_tengo_menu_tradicion':
            userStates.set(from, { step: 'menu_tradicion_opciones', data: {} });
            const menuTradBody = getTranslation(lang, 'menuTradicionTitle');
            const menuTradButtons = [
                { id: 'menu_tradicion_reservar', title: getTranslation(lang, 'menuTradicionOptReservar').slice(0, 20) },
                { id: 'menu_tradicion_caducidad', title: getTranslation(lang, 'menuTradicionOptCaducidad').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, menuTradBody, menuTradButtons);
            break;

        case 'opt_otras_cuestiones':
            await sendFaqMenu(from, lang);
            break;

        default:
            if (listId.startsWith('faq_')) {
                await handleFaqSelection(from, listId, lang);
            } else {
                await sendLanguageMenu(from, 1);
            }
            break;
    }
}

/**
 * Responde a pulsaciones de botones interactivos.
 */
async function handleButtonResponse(from, buttonId) {
    const lang = userLanguages.get(from) || 'es';

    switch (buttonId) {
        case 'loc_madrid':
            await sendMessage(from, getTranslation(lang, 'madridMsg'));
            await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
            userStates.delete(from);
            break;

        case 'loc_pais_vasco':
            await sendMainMenu(from);
            break;

        case 'btn_solicitar_reserva':
            await sendMessage(from, getTranslation(lang, 'webReservaLinkMsg'));
            await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
            userStates.delete(from);
            break;

        case 'btn_add_lista_espera':
            userStates.set(from, { step: 'espera_formulario', data: {} });
            await sendMessage(from, getTranslation(lang, 'waitlistFormPrompt'));
            break;

        case 'menu_tradicion_reservar':
            userStates.set(from, { step: 'menu_tradicion_formulario_reserva', data: {} });
            await sendMessage(from, getTranslation(lang, 'menuTradicionFormPrompt'));
            break;

        case 'menu_tradicion_caducidad':
            userStates.set(from, { step: 'menu_tradicion_formulario_caducidad', data: {} });
            await sendMessage(from, getTranslation(lang, 'menuTradicionCaducidadPrompt'));
            break;

        case 'mod_comensales':
            userStates.set(from, { step: 'mod_val_comensales', data: userStates.get(from)?.data || {} });
            await sendMessage(from, getTranslation(lang, 'modComensalesPrompt'));
            break;

        case 'mod_dia':
            userStates.set(from, { step: 'mod_val_dia', data: userStates.get(from)?.data || {} });
            await sendMessage(from, getTranslation(lang, 'modDiaPrompt'));
            break;

        case 'mod_hora':
            userStates.set(from, { step: 'mod_val_hora', data: userStates.get(from)?.data || {} });
            await sendMessage(from, getTranslation(lang, 'modHoraPrompt'));
            break;

        default:
            await sendLanguageMenu(from, 1);
            break;
    }
}

/**
 * Despliega el menú de las 11 Preguntas Frecuentes (Otras cuestiones).
 */
async function sendFaqMenu(from, lang) {
    userStates.set(from, { step: 'faq_menu', data: {} });

    const bodyText = getTranslation(lang, 'faqTitle');
    const buttonText = getTranslation(lang, 'menuButtonText');
    const sections = [
        {
            title: "Otras Cuestiones",
            rows: [
                { id: "faq_1", title: getTranslation(lang, 'faq1Title').slice(0, 24), description: getTranslation(lang, 'faq1Desc').slice(0, 72) },
                { id: "faq_2", title: getTranslation(lang, 'faq2Title').slice(0, 24), description: getTranslation(lang, 'faq2Desc').slice(0, 72) },
                { id: "faq_3", title: getTranslation(lang, 'faq3Title').slice(0, 24), description: getTranslation(lang, 'faq3Desc').slice(0, 72) },
                { id: "faq_4", title: getTranslation(lang, 'faq4Title').slice(0, 24), description: getTranslation(lang, 'faq4Desc').slice(0, 72) },
                { id: "faq_5", title: getTranslation(lang, 'faq5Title').slice(0, 24), description: getTranslation(lang, 'faq5Desc').slice(0, 72) },
                { id: "faq_6", title: getTranslation(lang, 'faq6Title').slice(0, 24), description: getTranslation(lang, 'faq6Desc').slice(0, 72) },
                { id: "faq_7", title: getTranslation(lang, 'faq7Title').slice(0, 24), description: getTranslation(lang, 'faq7Desc').slice(0, 72) },
                { id: "faq_8", title: getTranslation(lang, 'faq8Title').slice(0, 24), description: getTranslation(lang, 'faq8Desc').slice(0, 72) },
                { id: "faq_9", title: getTranslation(lang, 'faq9Title').slice(0, 24), description: getTranslation(lang, 'faq9Desc').slice(0, 72) },
                { id: "faq_10", title: getTranslation(lang, 'faq10Title').slice(0, 24), description: getTranslation(lang, 'faq10Desc').slice(0, 72) }
            ]
        }
    ];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

/**
 * Responde a una selección de FAQ.
 */
async function handleFaqSelection(from, faqId, lang) {
    const faqNum = faqId.replace('faq_', '');
    const msgKey = `faq${faqNum}Msg`;
    const responseMsg = getTranslation(lang, msgKey);

    if (responseMsg) {
        await sendMessage(from, responseMsg);
    }
    
    await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
    userStates.delete(from);
}

/**
 * Maneja las respuestas de texto según el paso actual de la conversación.
 */
async function handleTextMessage(from, text) {
    const lang = userLanguages.get(from) || 'es';
    const cleanText = text.trim().toLowerCase();

    // Interceptador global para volver al menú de idioma o inicio
    if (['menu', 'menú', 'inicio', '0', 'cancelar', 'salir', 'volver', 'home', 'start'].includes(cleanText)) {
        userStates.delete(from);
        await sendMessage(from, getTranslation(lang, 'returningToMenu'));
        await sendLanguageMenu(from, 1);
        return;
    }

    const currentState = userStates.get(from);

    if (!currentState || currentState.step === 'select_language') {
        await sendLanguageMenu(from, 1);
        return;
    }

    switch (currentState.step) {
        case 'select_location':
            await sendLocationMenu(from);
            break;

        case 'espera_formulario':
            // Registrar solicitud de Lista de Espera
            await sendInternalStaffAlertInSpanish('SOLICITUD LISTA DE ESPERA', from, text);
            await sendMessage(from, getTranslation(lang, 'waitlistSuccessMsg'));
            await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
            userStates.delete(from);
            break;

        case 'modificacion_datos_actuales':
            // Guardar datos de reserva actual y preguntar qué desea modificar
            currentState.data.reservaActual = text;
            currentState.step = 'modificacion_tipo';
            userStates.set(from, currentState);

            const modBody = getTranslation(lang, 'modOptionsPrompt');
            const modButtons = [
                { id: 'mod_comensales', title: getTranslation(lang, 'modOptComensales').slice(0, 20) },
                { id: 'mod_dia', title: getTranslation(lang, 'modOptDia').slice(0, 20) },
                { id: 'mod_hora', title: getTranslation(lang, 'modOptHora').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, modBody, modButtons);
            break;

        case 'mod_val_comensales':
        case 'mod_val_dia':
        case 'mod_val_hora':
            // Registrar solicitud de modificación
            const tipoModLabel = currentState.step.replace('mod_val_', '').toUpperCase();
            const detalleMod = `Reserva Actual: ${currentState.data.reservaActual || 'No especificada'}\nModificación (${tipoModLabel}): ${text}`;
            
            await sendInternalStaffAlertInSpanish('SOLICITUD MODIFICACIÓN DE RESERVA', from, detalleMod);
            await sendMessage(from, getTranslation(lang, 'modSuccessMsg'));
            await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
            userStates.delete(from);
            break;

        case 'cancelacion_datos_actuales':
            // Registrar solicitud de cancelación
            await sendInternalStaffAlertInSpanish('SOLICITUD CANCELACIÓN DE RESERVA', from, `Datos Reserva Actual: ${text}`);
            await sendMessage(from, getTranslation(lang, 'cancelSuccessMsg'));
            await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
            userStates.delete(from);
            break;

        case 'menu_tradicion_formulario_reserva':
            // Registrar reserva con Menú Tradición
            await sendInternalStaffAlertInSpanish('RESERVA MENÚ TRADICIÓN (TARJETA REGALO)', from, text);
            await sendMessage(from, getTranslation(lang, 'menuTradicionSuccessMsg'));
            await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
            userStates.delete(from);
            break;

        case 'menu_tradicion_formulario_caducidad':
            // Registrar consulta de caducidad
            await sendInternalStaffAlertInSpanish('CONSULTA CADUCIDAD MENÚ TRADICIÓN', from, text);
            await sendMessage(from, getTranslation(lang, 'menuTradicionCaducidadMsg'));
            await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
            userStates.delete(from);
            break;

        default:
            await sendLanguageMenu(from, 1);
            break;
    }
}

module.exports = {
    handleUserMessage,
    sendLanguageMenu,
    sendLocationMenu,
    sendMainMenu
};
