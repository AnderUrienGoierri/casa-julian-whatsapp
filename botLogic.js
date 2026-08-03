const { 
    sendInteractiveButtons, 
    sendInteractiveList, 
    sendMessage,
    sendImageMessage,
    sendVideoMessage,
    sendStickerMessage
} = require('./whatsappApi');
const db = require('./database');
const { sendInternalStaffAlertInSpanish } = require('./notifications');
const { getTranslation } = require('./i18n');
const path = require('path');
const fs = require('fs');

// Mapas en memoria para rastrear estado, idioma y ubicación seleccionada por teléfono
const userStates = new Map();
const userLanguages = new Map();
const userLocations = new Map();

const statesFilePath = path.join(__dirname, 'user_states.json');

function loadPersistentStates() {
    try {
        if (fs.existsSync(statesFilePath)) {
            const raw = fs.readFileSync(statesFilePath, 'utf8');
            const data = JSON.parse(raw);
            if (data.states) {
                Object.keys(data.states).forEach(k => userStates.set(k, data.states[k]));
            }
            if (data.languages) {
                Object.keys(data.languages).forEach(k => userLanguages.set(k, data.languages[k]));
            }
            if (data.locations) {
                Object.keys(data.locations).forEach(k => userLocations.set(k, data.locations[k]));
            }
            console.log(`✅ Cargados ${userStates.size} estados de usuario de persistencia.`);
        }
    } catch (err) {
        console.error("⚠️ Error cargando estados persistentes:", err.message);
    }
}

let isSavingState = false;
function savePersistentStates() {
    if (isSavingState) return;
    isSavingState = true;
    try {
        const objStates = {};
        const objLangs = {};
        const objLocs = {};
        userStates.forEach((val, key) => { objStates[key] = val; });
        userLanguages.forEach((val, key) => { objLangs[key] = val; });
        userLocations.forEach((val, key) => { objLocs[key] = val; });
        fs.writeFileSync(statesFilePath, JSON.stringify({ states: objStates, languages: objLangs, locations: objLocs }, null, 2), 'utf8');
    } catch (err) {
        console.error("⚠️ Error guardando estados persistentes:", err.message);
    } finally {
        isSavingState = false;
    }
}

loadPersistentStates();

// Auto-persistencia en disco tras cada modificación
const rawStateSet = userStates.set.bind(userStates);
const rawStateDelete = userStates.delete.bind(userStates);
const rawLangSet = userLanguages.set.bind(userLanguages);
const rawLocSet = userLocations.set.bind(userLocations);
const rawLocDelete = userLocations.delete.bind(userLocations);

userStates.set = function(key, value) {
    const res = rawStateSet(key, value);
    savePersistentStates();
    return res;
};

userStates.delete = function(key) {
    const res = rawStateDelete(key);
    savePersistentStates();
    return res;
};

userLanguages.set = function(key, value) {
    const res = rawLangSet(key, value);
    savePersistentStates();
    return res;
};

userLocations.set = function(key, value) {
    const res = rawLocSet(key, value);
    savePersistentStates();
    return res;
};

userLocations.delete = function(key) {
    const res = rawLocDelete(key);
    savePersistentStates();
    return res;
};

/**
 * Muestra directamente el Menú Principal o la Ubicación según la selección previa guardada.
 */
async function showLocationOrMainMenu(from) {
    const loc = userLocations.get(from);
    if (loc === 'pais_vasco') {
        await sendMainMenu(from);
    } else if (loc === 'madrid') {
        const lang = userLanguages.get(from) || 'es';
        await sendMessage(from, getTranslation(lang, 'madridMsg'));
        await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
    } else {
        await sendLocationMenu(from);
    }
}

/**
 * Valida que un string sea un email válido.
 * Requiere: caracteres antes del @, dominio con punto y extensión.
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
}

/**
 * Devuelve el mensaje de error de email inválido según el idioma.
 */
function getInvalidEmailMsg(lang) {
    if (lang === 'eu') {
        return '⚠️ *Email helbide baliogabea.* Mesedez, idatzi email baliogarri bat (adib. *nombre@ejemplo.com*), edo sakatu botoiaren bidez saltatu:';
    } else if (lang === 'en') {
        return '⚠️ *Invalid email address.* Please enter a valid email (e.g. *nombre@ejemplo.com*), or skip using the button:';
    } else {
        return '⚠️ *Email no válido.* Por favor, introduce un email correcto (ej. *nombre@ejemplo.com*), o pulsa el botón para omitirlo:';
    }
}

/**
 * Parsea el payload de mensaje entrante de Meta Webhook y lo envía a handleUserMessage.
 */
async function processMessage(message) {
    const from = message.from;
    const type = message.type;

    if (type === 'text') {
        const text = message.text ? message.text.body : '';
        await handleUserMessage(from, text, 'text');
    } else if (type === 'interactive') {
        const interactive = message.interactive;
        if (interactive.type === 'list_reply') {
            const listId = interactive.list_reply.id;
            await handleUserMessage(from, listId, 'interactive', { type: 'list', id: listId });
        } else if (interactive.type === 'button_reply') {
            const buttonId = interactive.button_reply.id;
            await handleUserMessage(from, buttonId, 'interactive', { type: 'button', id: buttonId });
        }
    }
}

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
            
            await showLocationOrMainMenu(from);
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
        const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || 'https://casa-julian-whatsapp-bot.onrender.com';
        const welcomeImageUrl = process.env.WELCOME_IMAGE_URL || `${baseUrl}/public/casa_julian_erretegia.jpg`;
        const welcomeStickerUrl = `${baseUrl}/public/casa_julian_sticker.webp`;

        // 1. Enviar imagen de bienvenida del restaurante (una sola vez)
        try {
            await sendImageMessage(from, welcomeImageUrl, 'Asador Casa Julián de Tolosa');
        } catch (e) {
            console.error("⚠️ Error enviando imagen de bienvenida por WhatsApp:", e.message);
        }

        // Pequeña pausa de 1 segundo para asegurar la entrega secuencial en Meta WhatsApp API
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 2. Enviar el Sticker animado de bienvenida sin reproductor de vídeo (casa_julian_sticker.webp)
        try {
            const path = require('path');
            await sendStickerMessage(from, path.join(__dirname, 'media', 'casa_julian_sticker.webp'));
        } catch (e) {
            console.error("⚠️ Error enviando sticker animado por WhatsApp:", e.message);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        const bodyText = "🥩🔥 *¡Bienvenido/a a Casa Julián de Tolosa! / Ongi etorri!* 🥩🔥\n\n" +
            "🇪🇺 *EU:* Ongi etorri! Plazer bat izango da laguntzea. Zein hizkuntzatan jarraitu nahi duzu?\n" +
            "🇪🇸 *ES:* ¡Bienvenido/a! Será un placer ayudarte. ¿En qué idioma deseas continuar?\n" +
            "🇬🇧 *EN:* Welcome! It will be a pleasure to help you. Which language would you like to continue in?\n" +
            "🇫🇷 *FR:* Bienvenue! Ce sera un plaisir de vous aider. Dans quelle langue souhaitez-vous continuer?";
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
                { id: "opt_regalar_menu_tradicion", title: getTranslation(lang, 'opt4Title').slice(0, 24), description: getTranslation(lang, 'opt4Desc').slice(0, 72) },
                { id: "opt_otras_cuestiones", title: getTranslation(lang, 'opt5Title').slice(0, 24), description: getTranslation(lang, 'opt5Desc').slice(0, 72) },
                { id: "opt_cambiar_idioma", title: getTranslation(lang, 'opt6Title').slice(0, 24), description: getTranslation(lang, 'opt6Desc').slice(0, 72) }
            ]
        }
    ];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

/**
 * Envía la imagen del Menú Tradición y el enlace directo para comprar la tarjeta regalo en la web oficial.
 */
async function handleRegalarMenuTradicion(from, lang) {
    const serverBaseUrl = process.env.RENDER_EXTERNAL_URL || 'https://casa-julian-whatsapp-bot.onrender.com';
    const imageUrl = `${serverBaseUrl}/public/menu_tradicion.png`;
    const caption = getTranslation(lang, 'regalarMenuCaption');

    try {
        await sendImageMessage(from, imageUrl, caption);
    } catch (e) {
        console.error("⚠️ Error enviando imagen de Menú Tradición por WhatsApp:", e.message);
    }

    const messageText = getTranslation(lang, 'regalarMenuMsg');
    await sendMessage(from, messageText);
    await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
    await showLocationOrMainMenu(from);
}

async function sendGiftCardOptions(from, lang) {
    userStates.set(from, { step: 'menu_tradicion_opciones', data: {} });
    let promptBody = '';
    let btnRes = '';
    let btnCad = '';

    if (lang === 'eu') {
        promptBody = `💳 *Tradizio Menua (Opari Txartela)*\n\nZer kudeaketa egin nahi duzu?`;
        btnRes = `📅 Erreserbatu`;
        btnCad = `⏳ Iraungipena ikusi`;
    } else if (lang === 'en') {
        promptBody = `💳 *Tradition Menu (Gift Card)*\n\nWhat would you like to do?`;
        btnRes = `📅 Book`;
        btnCad = `⏳ Check Expiration`;
    } else {
        promptBody = `💳 *Menú Tradición (Tarjeta Regalo)*\n\n¿Qué gestión deseas realizar?`;
        btnRes = `📅 Reservar`;
        btnCad = `⏳ Ver fecha caducidad`;
    }

    const buttons = [
        { id: 'menu_tradicion_reservar', title: btnRes.slice(0, 20) },
        { id: 'menu_tradicion_caducidad', title: btnCad.slice(0, 20) }
    ];
    await sendInteractiveButtons(from, promptBody, buttons);
}

/**
 * Responde a selecciones de listas interactivas.
 */
async function handleListResponse(from, listId) {
    const lang = userLanguages.get(from) || 'es';

    switch (listId) {
        case 'opt_quiero_reservar': {
            userStates.set(from, { step: 'reserva_card_question', data: {} });
            const cardButtons = [
                { id: 'btn_reserva_con_tarjeta', title: getTranslation(lang, 'reservaCardBtnSi').slice(0, 20) },
                { id: 'btn_reserva_sin_tarjeta', title: getTranslation(lang, 'reservaCardBtnNo').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, getTranslation(lang, 'reservaCardPrompt'), cardButtons);
            break;
        }

        case 'opt_modificacion':
            userStates.set(from, { step: 'modificacion_datos_actuales', data: {} });
            await sendMessage(from, getTranslation(lang, 'modCancelDataPrompt'));
            break;

        case 'opt_cancelacion':
            userStates.set(from, { step: 'cancelacion_datos_actuales', data: {} });
            await sendMessage(from, getTranslation(lang, 'cancelDataPrompt'));
            break;

        case 'opt_regalar_menu_tradicion':
            await handleRegalarMenuTradicion(from, lang);
            break;

        case 'opt_otras_cuestiones':
            await sendFaqMenu(from, lang);
            break;

        case 'opt_cambiar_idioma':
            await sendLanguageMenu(from, 1);
            break;

        default:
            if (listId.startsWith('wl_slot_')) {
                await handleWaitlistSlotSelection(from, listId, lang);
            } else if (listId.startsWith('wl_day')) {
                await handleWaitlistDaySelection(from, listId, lang);
            } else if (listId.startsWith('mt_slot_')) {
                await handleMenuTradSlotSelection(from, listId, lang);
            } else if (listId.startsWith('mt_day')) {
                await handleMenuTradDaySelection(from, listId, lang);
            } else if (listId.startsWith('faq_')) {
                await handleFaqSelection(from, listId, lang);
            } else if (listId.startsWith('nac_')) {
                await handleNationalitySelection(from, listId, lang);
            } else if (listId.startsWith('form_lang_')) {
                await handleButtonResponse(from, listId);
            } else if (listId.startsWith('alg_')) {
                await handleAllergiesListSelection(from, listId, lang);
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
            userLocations.set(from, 'madrid');
            await sendMessage(from, getTranslation(lang, 'madridMsg'));
            await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
            break;

        case 'loc_pais_vasco':
            userLocations.set(from, 'pais_vasco');
            await sendMainMenu(from);
            break;

        case 'btn_reserva_con_tarjeta':
        case 'waitlist_init_si':
        case 'waitlist_menu_si':
            await sendGiftCardOptions(from, lang);
            break;

        case 'btn_reserva_sin_tarjeta': {
            userStates.set(from, { step: 'reserva_sin_tarjeta_opciones', data: {} });
            const noCardPrompt = getTranslation(lang, 'reservaNoCardPrompt');
            const noCardButtons = [
                { id: 'btn_reserva_web', title: getTranslation(lang, 'btnReservaWeb').slice(0, 20) },
                { id: 'btn_add_lista_espera', title: getTranslation(lang, 'btnReservaWaitlist').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, noCardPrompt, noCardButtons);
            break;
        }

        case 'btn_reserva_web':
        case 'btn_solicitar_reserva':
            await sendMessage(from, getTranslation(lang, 'webReservaLinkMsg'));
            await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
            await showLocationOrMainMenu(from);
            break;

        case 'btn_add_lista_espera':
            userStates.set(from, { step: 'espera_step1_nombre', data: { waitlist: {} } });
            await sendMessage(from, getTranslation(lang, 'waitlistStep1Nombre'));
            break;

        case 'btn_tarjeta_regalo': {
            userStates.set(from, { step: 'menu_tradicion_opciones', data: {} });
            const menuTradBody = getTranslation(lang, 'menuTradicionTitle');
            const menuTradButtons = [
                { id: 'menu_tradicion_regalar', title: getTranslation(lang, 'menuTradicionOptRegalar').slice(0, 20) },
                { id: 'menu_tradicion_reservar', title: getTranslation(lang, 'menuTradicionOptReservar').slice(0, 20) },
                { id: 'menu_tradicion_caducidad', title: getTranslation(lang, 'menuTradicionOptCaducidad').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, menuTradBody, menuTradButtons);
            break;
        }

        case 'btn_card_gestion_reservar': {
            const state = userStates.get(from) || { data: {} };
            state.data.menuTrad = state.data.menuTrad || {};
            const currentCards = state.data.menuTrad.cards || [];

            if (currentCards.length >= 3) {
                await sendMessage(from, getTranslation(lang, 'menuTradMaxTableCardsNotice'));
                state.step = 'menu_trad_step2_nombre';
                userStates.set(from, state);
                await sendMessage(from, getTranslation(lang, 'menuTradStep2Nombre'));
            } else {
                state.step = 'menu_trad_more_cards_choice';
                userStates.set(from, state);

                const promptBody = getTranslation(lang, 'menuTradMoreCardsPrompt')
                    .replace('{comensales}', state.data.menuTrad.comensales || 2);
                const buttons = [
                    { id: 'btn_mt_add_misma_mesa', title: getTranslation(lang, 'btnMtAddMismaMesa').slice(0, 20) },
                    { id: 'btn_mt_otra_mesa', title: getTranslation(lang, 'btnMtOtraMesa').slice(0, 20) },
                    { id: 'btn_mt_continuar', title: getTranslation(lang, 'btnMtContinuar').slice(0, 20) }
                ];
                await sendInteractiveButtons(from, promptBody, buttons);
            }
            break;
        }

        case 'btn_card_gestion_caducidad': {
            const state = userStates.get(from) || { data: {} };
            const card = state.data?.menuTrad?.card || (state.data?.menuTrad?.cards && state.data.menuTrad.cards[0]);
            const cardCode = card ? card.codigo : 'MT-2026';
            const cardExpiry = card ? (card.fecha_caducidad || '31/12/2026') : '31/12/2026';
            const cardStatus = card ? (card.estado || 'ACTIVA') : 'ACTIVA';

            let cadMsg = '';
            if (lang === 'eu') {
                cadMsg = `⏳ *OPARI-TXARTELAREN IRAUNGITZE DATA*\n\n` +
                         `✅ *Kodea:* ${cardCode}\n` +
                         `📅 *Iraungitze Data:* ${cardExpiry}\n` +
                         `📌 *Egoera:* ${cardStatus}\n\n` +
                         `Eskerrik asko Casa Juliánekin harremanetan jartzeagatik!`;
            } else if (lang === 'en') {
                cadMsg = `⏳ *GIFT CARD EXPIRATION DATE*\n\n` +
                         `✅ *Code:* ${cardCode}\n` +
                         `📅 *Expiration Date:* ${cardExpiry}\n` +
                         `📌 *Status:* ${cardStatus}\n\n` +
                         `Thank you for contacting Casa Julián!`;
            } else {
                cadMsg = `⏳ *FECHA DE CADUCIDAD DE TARJETA REGALO*\n\n` +
                         `✅ *Código:* ${cardCode}\n` +
                         `📅 *Fecha de Caducidad:* ${cardExpiry}\n` +
                         `📌 *Estado:* ${cardStatus}\n\n` +
                         `¡Muchas gracias por contactar con Casa Julián!`;
            }

            await sendMessage(from, cadMsg);
            await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
            userStates.delete(from);
            await showLocationOrMainMenu(from);
            break;
        }

        case 'btn_mt_add_misma_mesa': {
            const state = userStates.get(from) || { data: {} };
            state.data.menuTrad = state.data.menuTrad || {};
            const currentCards = state.data.menuTrad.cards || [];

            if (currentCards.length >= 3) {
                await sendMessage(from, getTranslation(lang, 'menuTradMaxTableCardsNotice'));
                state.step = 'menu_trad_step2_nombre';
                userStates.set(from, state);
                await sendMessage(from, getTranslation(lang, 'menuTradStep2Nombre'));
            } else {
                state.step = 'menu_trad_step1_tarjeta';
                userStates.set(from, state);
                await sendMessage(from, getTranslation(lang, 'menuTradAddSameTablePrompt'));
            }
            break;
        }

        case 'btn_mt_otra_mesa': {
            userStates.set(from, { step: 'menu_trad_step1_tarjeta', data: { menuTrad: { comensales: 2 } } });
            await sendMessage(from, getTranslation(lang, 'menuTradNewTablePrompt'));
            break;
        }

        case 'btn_mt_continuar': {
            const state = userStates.get(from) || { data: {} };
            state.step = 'menu_trad_step2_nombre';
            userStates.set(from, state);
            await sendMessage(from, getTranslation(lang, 'menuTradStep2Nombre'));
            break;
        }

        case 'menu_tradicion_regalar':
            await handleRegalarMenuTradicion(from, lang);
            break;

        case 'waitlist_init_si':
        case 'waitlist_menu_si': {
            userStates.set(from, { step: 'menu_tradicion_opciones', data: {} });
            let promptBody = '';
            let btnRes = '';
            let btnCad = '';

            if (lang === 'eu') {
                promptBody = `💳 *Tradizio Menua (Opari Txartela)*\n\nZer kudeaketa egin nahi duzu?`;
                btnRes = `📅 Erreserbatu`;
                btnCad = `⏳ Iraungipena ikusi`;
            } else if (lang === 'en') {
                promptBody = `💳 *Tradition Menu (Gift Card)*\n\nWhat would you like to do?`;
                btnRes = `📅 Book`;
                btnCad = `⏳ Check Expiration`;
            } else {
                promptBody = `💳 *Menú Tradición (Tarjeta Regalo)*\n\n¿Qué gestión deseas realizar?`;
                btnRes = `📅 Reservar`;
                btnCad = `⏳ Ver fecha caducidad`;
            }

            const buttons = [
                { id: 'menu_tradicion_reservar', title: btnRes.slice(0, 20) },
                { id: 'menu_tradicion_caducidad', title: btnCad.slice(0, 20) }
            ];
            await sendInteractiveButtons(from, promptBody, buttons);
            break;
        }

        case 'menu_tradicion_reservar':
            userStates.set(from, { step: 'menu_trad_step1_tarjeta', data: { menuTrad: { comensales: 2 } } });
            await sendMessage(from, getTranslation(lang, 'menuTradStep1Tarjeta'));
            break;

        case 'menu_tradicion_caducidad':
            userStates.set(from, { step: 'menu_tradicion_formulario_caducidad', data: {} });
            await sendMessage(from, getTranslation(lang, 'menuTradicionCaducidadPrompt'));
            break;

        case 'waitlist_init_no':
            userStates.set(from, { step: 'espera_step1_nombre', data: { waitlist: {} } });
            await sendMessage(from, getTranslation(lang, 'waitlistStep1Nombre'));
            break;

        case 'wl_tipo_comida': {
            const state = userStates.get(from) || { data: {} };
            state.data.waitlist = state.data.waitlist || {};
            state.data.waitlist.tipoServicio = 'Comida';
            state.step = 'espera_step3_hora';
            userStates.set(from, state);

            const bodyText = getTranslation(lang, 'waitlistStep3HoraComida');
            const buttonText = getTranslation(lang, 'menuButtonText');
            const sections = [
                {
                    title: "Turnos Comida",
                    rows: [
                        { id: "wl_slot_1230", title: "12:30", description: "Turno comida 12:30" },
                        { id: "wl_slot_1300", title: "13:00", description: "Turno comida 13:00" },
                        { id: "wl_slot_1330", title: "13:30", description: "Turno comida 13:30" },
                        { id: "wl_slot_1400", title: "14:00", description: "Turno comida 14:00" },
                        { id: "wl_slot_1515", title: "15:15", description: "Turno comida 15:15" }
                    ]
                }
            ];
            await sendInteractiveList(from, bodyText, buttonText, sections);
            break;
        }

        case 'wl_tipo_cena': {
            const state = userStates.get(from) || { data: {} };
            state.data.waitlist = state.data.waitlist || {};
            state.data.waitlist.tipoServicio = 'Cena';
            state.step = 'espera_step3_hora';
            userStates.set(from, state);

            const bodyText = getTranslation(lang, 'waitlistStep3HoraCena');
            const buttonText = getTranslation(lang, 'menuButtonText');
            const sections = [
                {
                    title: "Turnos Cena",
                    rows: [
                        { id: "wl_slot_2000", title: "20:00", description: "Turno cena 20:00 (Vie-Sáb)" },
                        { id: "wl_slot_2030", title: "20:30", description: "Turno cena 20:30 (Vie-Sáb)" },
                        { id: "wl_slot_2100", title: "21:00", description: "Turno cena 21:00 (Vie-Sáb)" },
                        { id: "wl_slot_2130", title: "21:30", description: "Turno cena 21:30 (Vie-Sáb)" }
                    ]
                }
            ];
            await sendInteractiveList(from, bodyText, buttonText, sections);
            break;
        }

        case 'wl_cena_viernes':
        case 'wl_cena_sabado':
        case 'wl_cena_skip': {
            const state = userStates.get(from) || { data: {} };
            state.data.waitlist = state.data.waitlist || {};
            
            if (buttonId === 'wl_cena_skip') {
                state.data.waitlist.dias = 'Sin preferencia';
            } else {
                const rawDay = buttonId.replace('wl_cena_', '');
                const dayLabel = getTranslation(lang, 'day' + rawDay.charAt(0).toUpperCase() + rawDay.slice(1));
                state.data.waitlist.dias = dayLabel;
            }
            state.step = 'espera_step5_ninos';
            userStates.set(from, state);

            await sendWaitlistNinosPrompt(from, lang);
            break;
        }

        case 'nac_es':
        case 'nac_fr':
        case 'nac_uk':
        case 'nac_us':
        case 'nac_de':
        case 'nac_it':
        case 'nac_pt':
        case 'nac_mx':
        case 'nac_jp':
        case 'nac_otro':
            await handleNationalitySelection(from, buttonId, lang);
            break;

        case 'form_lang_more': {
            await sendFormLanguageList(from, lang, true);
            break;
        }

        case 'form_lang_es':
        case 'form_lang_eu':
        case 'form_lang_en':
        case 'form_lang_fr':
        case 'form_lang_de':
        case 'form_lang_it':
        case 'form_lang_pt':
        case 'form_lang_skip':
        case 'form_lang_eu':
        case 'form_lang_es':
        case 'form_lang_en':
        case 'form_lang_fr':
        case 'form_lang_de':
        case 'form_lang_it':
        case 'form_lang_pt':
        case 'form_lang_nl':
        case 'form_lang_ca':
        case 'form_lang_gl':
        case 'form_lang_ru':
        case 'form_lang_zh':
        case 'form_lang_ja':
        case 'form_lang_ar': {
            const selectedLang = buttonId === 'form_lang_skip' ? null : buttonId.replace('form_lang_', '');
            const chatLang = userLanguages.get(from) || 'es';
            const currentState = userStates.get(from);

            const displayLang = selectedLang ? selectedLang.toUpperCase() : (chatLang === 'eu' ? 'Ez zehaztua (NULL)' : (chatLang === 'en' ? 'Not specified (NULL)' : 'No especificado (NULL)'));

            if (currentState && currentState.step === 'espera_step7_idioma') {
                const wl = currentState.data.waitlist || {};

                // 1. COMPROBACIÓN DE DUPLICADOS EN LISTA DE ESPERA (Por Teléfono + Nombre)
                const existingEntry = db.findExistingWaitlistEntry(from, wl.nombre);
                if (existingEntry) {
                    let dupMsg = '';
                    if (chatLang === 'eu') {
                        dupMsg = `⚠️ *Dagoeneko erreserba aktibo bat duzu Itxaron-zerrendan izen eta telefono honekin.*\n\n` +
                                 `🆔 *ID Eskaera:* ${existingEntry.id}\n` +
                                 `👤 *Izena:* ${existingEntry.nombre}\n` +
                                 `📅 *Egunak:* ${existingEntry.dias_preferencia}\n` +
                                 `📌 *Egoera:* ${existingEntry.estado}\n\n` +
                                 `Ez da beharrezkoa eskaera berririk egitea. Harremanetan jarriko gara lekua izatean.`;
                    } else if (chatLang === 'en') {
                        dupMsg = `⚠️ *You already have an active registration on the Waitlist with this name and phone number.*\n\n` +
                                 `🆔 *Existing Request ID:* ${existingEntry.id}\n` +
                                 `👤 *Name:* ${existingEntry.nombre}\n` +
                                 `📅 *Preferred Days:* ${existingEntry.dias_preferencia}\n` +
                                 `📌 *Status:* ${existingEntry.estado}\n\n` +
                                 `It is not necessary to submit a new request. We will contact you as soon as a table becomes available.`;
                    } else {
                        dupMsg = `⚠️ *Ya tienes una inscripción activa en la Lista de Espera con este nombre y número de teléfono.*\n\n` +
                                 `🆔 *ID Solicitud Existente:* ${existingEntry.id}\n` +
                                 `👤 *Nombre:* ${existingEntry.nombre}\n` +
                                 `📅 *Días de Preferencia:* ${existingEntry.dias_preferencia}\n` +
                                 `📌 *Estado:* ${existingEntry.estado}\n\n` +
                                 `No es necesario crear una nueva solicitud. Nos pondremos en contacto contigo en cuanto dispongamos de una mesa libre.`;
                    }
                    await sendMessage(from, dupMsg);
                    await sendMessage(from, getTranslation(chatLang, 'thanksClosingMsg'));
                    userStates.delete(from);
                    await showLocationOrMainMenu(from);
                    break;
                }

                // 2. CREACIÓN DIRECTA DE REGISTRO CONFIRMADO SIN CONFIRMACIÓN DE RECEPCIÓN
                const waitlistRecord = await db.addToWaitlist({
                    nombre: wl.nombre || 'No especificado',
                    telefono: from,
                    dni: wl.dni || 'N/A',
                    email: wl.email || 'N/A',
                    nacionalidad: wl.nacionalidad,
                    dias_preferencia: wl.dias || 'Sin preferencia',
                    hora: wl.horario || 'No especificado',
                    comensales: parseInt(wl.comensales, 10) || 1,
                    ninos: wl.ninos || '0',
                    alergias: wl.selectedAllergies || wl.alergias || [],
                    estado: 'Pendiente asignacion',
                    idioma: selectedLang
                });

                const displayNac = wl.nacionalidad || (chatLang === 'eu' ? 'Ez zehaztua' : (chatLang === 'en' ? 'Not specified' : 'No especificada'));
                const alergiasTxt = (wl.selectedAllergies && wl.selectedAllergies.length > 0) ? wl.selectedAllergies.join(', ') : (chatLang === 'eu' ? 'Ez' : (chatLang === 'en' ? 'None' : 'Ninguna'));

                let confirmMsg = '';
                if (chatLang === 'eu') {
                    confirmMsg = `✅ *ITXARON-ZERRENDAKO ERRESERBA BERRETSI DA!*\n\n` +
                                 `🆔 *Eskaera ID:* ${waitlistRecord.id}\n` +
                                 `👤 *Izena:* ${wl.nombre || 'Zehaztugabea'}\n` +
                                 `📱 *Telefonoa:* ${from}\n` +
                                 `📄 *NAN/Pasaportea:* ${wl.dni || 'N/A'}\n` +
                                 `📧 *Email:* ${wl.email || 'N/A'}\n` +
                                 `🌐 *Nazionalitatea:* ${displayNac}\n` +
                                 `👥 *Pertsona kopurua:* ${wl.comensales || '1'}\n` +
                                 `🕐 *Ordu hobespena:* ${wl.horario || 'Zehaztugabea'}\n` +
                                 `📅 *Egunak:* ${wl.dias || 'Hobespenik ez'}\n` +
                                 `👶 *Haurrak:* ${wl.ninos || '0'}\n` +
                                 `⚠️ *Alergiak:* ${alergiasTxt}\n` +
                                 `🗣️ *Hizkuntza:* ${displayLang}\n\n` +
                                 `Zure izen-ematea zuzen erregistratu eta berretsi da. Lekua izatean jakinaraziko dizugu.`;
                } else if (chatLang === 'en') {
                    confirmMsg = `✅ *WAITLIST REGISTRATION CONFIRMED!*\n\n` +
                                 `🆔 *Request ID:* ${waitlistRecord.id}\n` +
                                 `👤 *Name:* ${wl.nombre || 'Unspecified'}\n` +
                                 `📱 *Phone:* ${from}\n` +
                                 `📄 *ID/Passport:* ${wl.dni || 'N/A'}\n` +
                                 `📧 *Email:* ${wl.email || 'N/A'}\n` +
                                 `🌐 *Nationality:* ${displayNac}\n` +
                                 `👥 *Guests:* ${wl.comensales || '1'}\n` +
                                 `🕐 *Time Preference:* ${wl.horario || 'Unspecified'}\n` +
                                 `📅 *Preferred Days:* ${wl.dias || 'No preference'}\n` +
                                 `👶 *Children:* ${wl.ninos || '0'}\n` +
                                 `⚠️ *Allergies:* ${alergiasTxt}\n` +
                                 `🗣️ *Language:* ${displayLang}\n\n` +
                                 `Your registration has been successfully confirmed. We will contact you as soon as a table becomes available.`;
                } else {
                    confirmMsg = `✅ *¡INSCRIPCIÓN EN LISTA DE ESPERA CONFIRMADA!*\n\n` +
                                 `🆔 *ID Solicitud:* ${waitlistRecord.id}\n` +
                                 `👤 *Nombre:* ${wl.nombre || 'No especificado'}\n` +
                                 `📱 *Teléfono:* ${from}\n` +
                                 `📄 *DNI/Pasaporte:* ${wl.dni || 'N/A'}\n` +
                                 `📧 *Email:* ${wl.email || 'N/A'}\n` +
                                 `🌐 *Nacionalidad:* ${displayNac}\n` +
                                 `👥 *Comensales:* ${wl.comensales || '1'}\n` +
                                 `🕐 *Preferencia Horaria:* ${wl.horario || 'No especificado'}\n` +
                                 `📅 *Días de Preferencia:* ${wl.dias || 'Sin preferencia'}\n` +
                                 `👶 *Niños/as:* ${wl.ninos || '0'}\n` +
                                 `⚠️ *Alergias:* ${alergiasTxt}\n` +
                                 `🗣️ *Idioma:* ${displayLang}\n\n` +
                                 `Tu inscripción ha sido confirmada y registrada correctamente. Te avisaremos en cuanto dispongamos de una mesa libre.`;
                }

                await sendMessage(from, confirmMsg);

                try {
                    await sendInternalStaffAlertInSpanish(
                        'NUEVA INSCRIPCIÓN LISTA DE ESPERA (CONFIRMADA)',
                        from,
                        confirmMsg,
                        wl.nombre,
                        from
                    );
                } catch (err) {
                    console.error("⚠️ Error enviando alerta recepción:", err.message);
                }

                await sendMessage(from, getTranslation(chatLang, 'thanksClosingMsg'));
                userStates.delete(from);
                await showLocationOrMainMenu(from);
            } else if (currentState && currentState.step === 'menu_trad_step7_idioma') {
                const mt = currentState.data.menuTrad || {};
                const resRecord = db.createReservation({
                    nombre: mt.nombre || 'Cliente WhatsApp',
                    telefono: from,
                    dni: mt.dni || 'N/A',
                    email: mt.email || 'N/A',
                    nacionalidad: mt.nacionalidad,
                    fecha: '',
                    hora: mt.horario || '',
                    comensales: mt.comensales || 2,
                    estado: 'PENDIENTE CONFIRMACION',
                    dias_preferencia: mt.dias || 'Sin preferencia',
                    tipo_reserva: 'tarjeta_regalo',
                    alergias: mt.alergias || 'NO',
                    tipo_servicio: mt.tipoServicio || null,
                    tarjeta_regalo: mt.tarjeta || null,
                    idioma: selectedLang
                });

                const displayNac = mt.nacionalidad || (chatLang === 'eu' ? 'Ez zehaztua (NULL)' : (chatLang === 'en' ? 'Not specified (NULL)' : 'No especificada (NULL)'));

                let detalleMenuTrad = '';
                if (chatLang === 'eu') {
                    detalleMenuTrad = `🆔 *Erreserba ID:* ${resRecord.id}\n` +
                                            `👤 *Izen-abizenak:* ${mt.nombre || 'Ez zehaztua'}\n` +
                                            `🪪 *NAN/Pasaportea:* ${mt.dni || 'N/A'}\n` +
                                            `📧 *Posta elektronikoa:* ${mt.email || 'N/A'}\n` +
                                            `🌐 *Nazionalitatea:* ${displayNac}\n` +
                                            `🎁 *Opari-Txartel Zenbakia:* ${mt.tarjeta || 'Ez zehaztua'}\n` +
                                            `🍽️ *Zerbitzua:* ${mt.tipoServicio || 'Bazkaria/Afaria'}\n` +
                                            `⏰ *Aukeratutako ordua:* ${mt.horario || 'Ez zehaztua'}\n` +
                                            `📅 *Egunen erabilgarritasuna:* ${mt.dias || 'Hobespenik ez'}\n` +
                                            `⚠️ *Alergiak/Mugak:* ${mt.alergias || 'Ez'}\n` +
                                            `🗣️ *Harremanetarako hizkuntza:* ${displayLang}\n` +
                                            `📌 *Egoera:* PENDIENTE CONFIRMACION\n` +
                                            `📱 *Bidaltzailearen WhatsApp-a:* ${from}\n` +
                                            `📋 *Eskaera:* TRADIZIO MENUA ERRESERBA (OPARI TXARTELA)`;
                } else if (chatLang === 'en') {
                    detalleMenuTrad = `🆔 *Reservation ID:* ${resRecord.id}\n` +
                                            `👤 *Full Name:* ${mt.nombre || 'Not specified'}\n` +
                                            `🪪 *ID/Passport:* ${mt.dni || 'N/A'}\n` +
                                            `📧 *Email:* ${mt.email || 'N/A'}\n` +
                                            `🌐 *Nationality:* ${displayNac}\n` +
                                            `🎁 *Gift Card No.:* ${mt.tarjeta || 'Not specified'}\n` +
                                            `🍽️ *Service:* ${mt.tipoServicio || 'Lunch/Dinner'}\n` +
                                            `⏰ *Selected Time:* ${mt.horario || 'Not specified'}\n` +
                                            `📅 *Days Availability:* ${mt.dias || 'No preference'}\n` +
                                            `⚠️ *Allergies/Restrictions:* ${mt.alergias || 'None'}\n` +
                                            `🗣️ *Contact Language:* ${displayLang}\n` +
                                            `📌 *Status:* PENDIENTE CONFIRMACION\n` +
                                            `📱 *Sender WhatsApp:* ${from}\n` +
                                            `📋 *Request:* TRADITION MENU BOOKING (GIFT CARD)`;
                } else {
                    detalleMenuTrad = `🆔 *ID Reserva:* ${resRecord.id}\n` +
                                            `👤 *Nombre:* ${mt.nombre || 'No especificado'}\n` +
                                            `🪪 *DNI/Pasaporte:* ${mt.dni || 'N/A'}\n` +
                                            `📧 *Email:* ${mt.email || 'N/A'}\n` +
                                            `🌐 *Nacionalidad:* ${displayNac}\n` +
                                            `🎁 *Nº Tarjeta Regalo:* ${mt.tarjeta || 'No especificado'}\n` +
                                            `🍽️ *Servicio:* ${mt.tipoServicio || 'Comida/Cena'}\n` +
                                            `⏰ *Hora seleccionada:* ${mt.horario || 'No especificada'}\n` +
                                            `📅 *Disponibilidad días:* ${mt.dias || 'Sin preferencia'}\n` +
                                            `⚠️ *Alergias/Restricciones:* ${mt.alergias || 'Ninguna'}\n` +
                                            `🗣️ *Idioma contacto:* ${displayLang}\n` +
                                            `📌 *Estado:* PENDIENTE CONFIRMACION\n` +
                                            `📱 *WhatsApp Remitente:* ${from}\n` +
                                            `📋 *Solicitud:* RESERVA MENÚ TRADICIÓN (TARJETA REGALO)`;
                }

                await requestUserConfirmation(from, chatLang, {
                    tipoAccion: 'RESERVA MENÚ TRADICIÓN (TARJETA REGALO)',
                    detalleMod: detalleMenuTrad,
                    nombreCliente: mt.nombre || 'Cliente WhatsApp',
                    telefonoReserva: from,
                    tarjetaCodigo: mt.tarjeta,
                    diasPreferencia: mt.dias || 'Sin preferencia',
                    horario: mt.horario || '',
                    idioma: selectedLang,
                    reservationId: resRecord.id,
                    successMsgKey: 'menuTradicionSuccessMsg'
                });
            }
            break;
        }

        case 'btn_skip_dni': {
            const currentState = userStates.get(from);
            if (currentState && currentState.step === 'espera_step1b_dni') {
                await handleTextMessage(from, 'btn_skip_dni');
            } else if (currentState && currentState.step === 'menu_trad_step2b_dni') {
                await handleTextMessage(from, 'btn_skip_dni');
            }
            break;
        }

        case 'btn_skip_email': {
            const currentState = userStates.get(from);
            if (currentState && (currentState.step === 'espera_step1b2_email' || currentState.step === 'menu_trad_step2b2_email')) {
                await handleTextMessage(from, 'btn_skip_email');
            }
            break;
        }

        case 'btn_ninos_0':
        case 'btn_ninos_1':
        case 'btn_ninos_2': {
            const count = buttonId === 'btn_ninos_0' ? '0' : (buttonId === 'btn_ninos_1' ? '1' : '2');
            const state = userStates.get(from) || { data: {} };
            state.data = state.data || {};
            state.data.waitlist = state.data.waitlist || {};
            state.data.waitlist.ninos = count;
            state.step = 'espera_step6_alergias';
            state.data.waitlist.selectedAllergies = [];
            userStates.set(from, state);
            await sendAllergiesList(from, lang, 'waitlistStep6Alergias', []);
            break;
        }

        case 'nac_es':
        case 'nac_fr':
        case 'nac_uk':
        case 'nac_us':
        case 'nac_de':
        case 'nac_it':
        case 'nac_pt':
        case 'nac_mx':
        case 'nac_jp':
        case 'nac_otro':
        case 'btn_nac_es':
        case 'btn_nac_fr':
        case 'btn_nac_uk':
        case 'btn_nac_otro': {
            const currentState = userStates.get(from);
            if (currentState && (currentState.step === 'espera_step1c_nac' || currentState.step === 'menu_trad_step2c_nac')) {
                let nac = '';
                if (buttonId === 'nac_es' || buttonId === 'btn_nac_es') nac = lang === 'eu' ? 'Espainia' : (lang === 'en' ? 'Spain' : 'España');
                else if (buttonId === 'nac_fr' || buttonId === 'btn_nac_fr') nac = lang === 'eu' ? 'Frantzia' : (lang === 'en' ? 'France' : 'Francia');
                else if (buttonId === 'nac_uk' || buttonId === 'btn_nac_uk') nac = lang === 'eu' ? 'Erresuma Batua' : (lang === 'en' ? 'United Kingdom' : 'Reino Unido');
                else if (buttonId === 'nac_us') nac = lang === 'eu' ? 'AEB (Estados Unidos)' : (lang === 'en' ? 'USA (United States)' : 'EE.UU. (Estados Unidos)');
                else if (buttonId === 'nac_de') nac = lang === 'en' ? 'Germany' : 'Alemania';
                else if (buttonId === 'nac_it') nac = 'Italia';
                else if (buttonId === 'nac_pt') nac = 'Portugal';
                else if (buttonId === 'nac_mx') nac = lang === 'eu' ? 'Mexiko' : (lang === 'en' ? 'Mexico' : 'México');
                else if (buttonId === 'nac_jp') nac = lang === 'eu' ? 'Japonia' : (lang === 'en' ? 'Japan' : 'Japón');
                else nac = lang === 'eu' ? 'Beste bat' : (lang === 'en' ? 'Other' : 'Otro');

                await handleTextMessage(from, nac);
            }
            break;
        }

        case 'waitlist_menu_si':
        case 'menu_tradicion_reservar':
            userStates.set(from, { step: 'menu_trad_step1_nombre', data: { menuTrad: {} } });
            await sendMessage(from, getTranslation(lang, 'menuTradStep1Nombre'));
            break;

        case 'waitlist_menu_no': {
            const state = userStates.get(from);
            const wl = state?.data?.waitlist || {};

            const waitlistRecord = db.addToWaitlist({
                nombre: wl.nombre || 'No especificado',
                telefono: from,
                dni: 'N/A',
                email: 'N/A',
                dias_preferencia: wl.dias || 'Sin preferencia',
                hora: wl.horario || 'No especificado',
                comensales: parseInt(wl.comensales, 10) || 1,
                estado: 'Pendiente confirmar',
                idioma: lang
            });

            const detalleEspera = `🆔 *ID Solicitud:* ${waitlistRecord.id}\n` +
                                  `👤 *Nombre:* ${wl.nombre || 'No especificado'}\n` +
                                  `👥 *Comensales:* ${wl.comensales || '1'}\n` +
                                  `🕐 *Preferencia horaria:* ${wl.horario || 'No especificado'}\n` +
                                  `📅 *Disponibilidad días:* ${wl.dias || 'Sin preferencia'}\n` +
                                  `👶 *Niños:* ${wl.ninos || '0'}\n` +
                                  `⚠️ *Alergias/Restricciones:* ${wl.alergias || 'Ninguna'}\n` +
                                  `📌 *Estado:* Pendiente confirmar\n` +
                                  `🎁 *Menú Tradición:* No\n` +
                                  `📱 *WhatsApp Remitente:* ${from}\n` +
                                  `📋 *Solicitud:* INSCRIPCIÓN EN LISTA DE ESPERA`;

            await requestUserConfirmation(from, lang, {
                tipoAccion: 'SOLICITUD LISTA DE ESPERA',
                detalleMod: detalleEspera,
                nombreCliente: wl.nombre || 'Cliente WhatsApp',
                telefonoReserva: from,
                diasPreferencia: wl.dias || 'Sin preferencia',
                successMsgKey: 'waitlistSuccessMsg'
            });
            break;
        }

        case 'menu_trad_tipo_comida': {
            const state = userStates.get(from) || { data: {} };
            state.data.menuTrad = state.data.menuTrad || {};
            state.data.menuTrad.tipoServicio = 'Comida';
            state.step = 'menu_trad_step4_hora';
            userStates.set(from, state);

            const bodyText = getTranslation(lang, 'menuTradStep4HoraComida');
            const buttonText = getTranslation(lang, 'menuButtonText');
            const sections = [
                {
                    title: "Turnos Comida",
                    rows: [
                        { id: "mt_slot_1230", title: "12:30", description: "Turno comida 12:30" },
                        { id: "mt_slot_1300", title: "13:00", description: "Turno comida 13:00" },
                        { id: "mt_slot_1330", title: "13:30", description: "Turno comida 13:30" },
                        { id: "mt_slot_1400", title: "14:00", description: "Turno comida 14:00" },
                        { id: "mt_slot_1515", title: "15:15", description: "Turno comida 15:15" }
                    ]
                }
            ];
            await sendInteractiveList(from, bodyText, buttonText, sections);
            break;
        }

        case 'menu_trad_tipo_cena': {
            const state = userStates.get(from) || { data: {} };
            state.data.menuTrad = state.data.menuTrad || {};
            state.data.menuTrad.tipoServicio = 'Cena';
            state.step = 'menu_trad_step4_hora';
            userStates.set(from, state);

            const bodyText = getTranslation(lang, 'menuTradStep4HoraCena');
            const buttonText = getTranslation(lang, 'menuButtonText');
            const sections = [
                {
                    title: "Turnos Cena",
                    rows: [
                        { id: "mt_slot_2000", title: "20:00", description: "Turno cena 20:00 (Vie-Sáb)" },
                        { id: "mt_slot_2030", title: "20:30", description: "Turno cena 20:30 (Vie-Sáb)" },
                        { id: "mt_slot_2100", title: "21:00", description: "Turno cena 21:00 (Vie-Sáb)" },
                        { id: "mt_slot_2130", title: "21:30", description: "Turno cena 21:30 (Vie-Sáb)" }
                    ]
                }
            ];
            await sendInteractiveList(from, bodyText, buttonText, sections);
            break;
        }

        case 'mt_cena_viernes':
        case 'mt_cena_sabado':
        case 'mt_cena_skip': {
            const state = userStates.get(from) || { data: {} };
            state.data.menuTrad = state.data.menuTrad || {};

            if (buttonId === 'mt_cena_skip') {
                state.data.menuTrad.dias = 'Sin preferencia';
            } else {
                const rawDay = buttonId.replace('mt_cena_', '');
                const dayLabel = getTranslation(lang, 'day' + rawDay.charAt(0).toUpperCase() + rawDay.slice(1));
                state.data.menuTrad.dias = dayLabel;
            }
            state.step = 'menu_trad_step6_alergias';
            state.data.menuTrad.selectedAllergies = [];
            userStates.set(from, state);

            await sendAllergiesList(from, lang, 'menuTradStep6Alergias', []);
            break;
        }

        case 'menu_tradicion_caducidad':
            userStates.set(from, { step: 'menu_tradicion_formulario_caducidad', data: {} });
            await sendMessage(from, getTranslation(lang, 'menuTradicionCaducidadPrompt'));
            break;

        case 'confirm_yes': {
            const state = userStates.get(from);
            const pending = state?.data?.pendingAlert;

            if (pending) {
                try {
                    if (pending.isModification && pending.reservationId) {
                        await db.updateReservationStatus(pending.reservationId, 'PENDIENTE MODIFICACION');
                    } else if (pending.isCancellation && pending.reservationId) {
                        await db.updateReservationStatus(pending.reservationId, 'PENDIENTE CANCELACION');
                    } else if (pending.tarjetaCodigo) {
                        const codes = pending.tarjetaCodigo.split(',').map(c => c.trim()).filter(Boolean);
                        for (const code of codes) {
                            await db.updateGiftCardStatus(code, 'PENDIENTE RESERVA');
                        }
                    }

                    // 1. Responder al cliente con los mensajes de revisión y agradecimiento
                    await sendMessage(from, getTranslation(lang, pending.successMsgKey || 'modSuccessMsg'));
                    await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
                    
                    // 2. Re-desplegar la selección de ubicación de restaurante
                    await showLocationOrMainMenu(from);

                    // 3. Notificar a recepción por WhatsApp y Email
                    await sendInternalStaffAlertInSpanish(
                        pending.tipoAccion,
                        from,
                        pending.detalleMod,
                        pending.nombreCliente,
                        pending.telefonoReserva
                    );
                } catch (err) {
                    console.error("⚠️ Error procesando confirmación:", err.message);
                }
            } else {
                await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
                await showLocationOrMainMenu(from);
            }
            break;
        }

        case 'confirm_no': {
            const state = userStates.get(from);
            const pending = state?.data?.pendingAlert;
            if (pending && pending.reservationId) {
                db.cancelReservation(pending.reservationId);
            }
            await sendMessage(from, getTranslation(lang, 'confirmCancelledMsg'));
            await showLocationOrMainMenu(from);
            break;
        }

        case 'mod_comensales': {
            const state = userStates.get(from);
            userStates.set(from, { step: 'mod_val_comensales', data: state?.data || {} });
            
            const comensales = state?.data?.comensalesActuales;
            const reservaActual = state?.data?.reservaActual || '';

            let promptMsg = '';
            if (comensales) {
                promptMsg = getTranslation(lang, 'modComensalesPrompt').replace('{comensales}', comensales);
            } else {
                promptMsg = getTranslation(lang, 'modComensalesPromptUnknown').replace('{reserva}', reservaActual);
            }
            await sendMessage(from, promptMsg);
            break;
        }

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
    }
}

/**
 * Envía la pregunta de niños en Lista de Espera con botones interactivos (0 niños, 1 niño, 2 o más niños).
 */
async function sendWaitlistNinosPrompt(from, lang) {
    const promptBody = getTranslation(lang, 'waitlistStep5NinosPrompt');
    const buttons = [
        { id: 'btn_ninos_0', title: getTranslation(lang, 'btnNinos0').slice(0, 20) },
        { id: 'btn_ninos_1', title: getTranslation(lang, 'btnNinos1').slice(0, 20) },
        { id: 'btn_ninos_2', title: getTranslation(lang, 'btnNinos2').slice(0, 20) }
    ];
    await sendInteractiveButtons(from, promptBody, buttons);
}

/**
 * Genera filas para lista desplegable con los días de la semana (Martes a Domingo), con opción opcional 'Sin preferencia'.
 */
function getDaysListRows(lang, excludedKeys = [], includeSkipOption = false) {
    const rows = [];

    if (includeSkipOption) {
        rows.push({
            id: 'skip',
            title: getTranslation(lang, 'rowSinPreferenciaTitle').slice(0, 24),
            description: getTranslation(lang, 'rowSinPreferenciaDesc').slice(0, 72)
        });
    }

    const days = [
        { key: 'martes', label: getTranslation(lang, 'dayMartes') },
        { key: 'miercoles', label: getTranslation(lang, 'dayMiercoles') },
        { key: 'jueves', label: getTranslation(lang, 'dayJueves') },
        { key: 'viernes', label: getTranslation(lang, 'dayViernes') },
        { key: 'sabado', label: getTranslation(lang, 'daySabado') },
        { key: 'domingo', label: getTranslation(lang, 'dayDomingo') }
    ];

    days
        .filter(d => !excludedKeys.includes(d.key))
        .forEach(d => {
            rows.push({
                id: d.key,
                title: d.label.slice(0, 24),
                description: `Día de preferencia: ${d.label}`.slice(0, 72)
            });
        });

    return rows;
}

/**
 * Maneja la selección interactiva de turno en Lista de Espera.
 */
async function handleWaitlistSlotSelection(from, listId, lang) {
    const rawTime = listId.replace('wl_slot_', '');
    const timeClean = rawTime.replace(/(\d{2})(\d{2})/, '$1:$2');

    const state = userStates.get(from) || { data: {} };
    state.data.waitlist = state.data.waitlist || {};
    state.data.waitlist.horario = timeClean;
    state.step = 'espera_step4_dia1';
    userStates.set(from, state);

    const comensales = state.data.waitlist.comensales || '1';
    const avail = db.getNextAvailableDate(timeClean, comensales);

    let nextAvailMsg = '';
    if (avail && avail.encontrado) {
        if (lang === 'eu') {
            nextAvailMsg = `📅 *Hurrengo data librea (${comensales} pertsona, ${timeClean}):*\n👉 ${avail.diaSemana}, ${avail.fecha}`;
        } else if (lang === 'en') {
            nextAvailMsg = `📅 *Next available date (${comensales} guests, ${timeClean}):*\n👉 ${avail.diaSemana}, ${avail.fecha}`;
        } else {
            nextAvailMsg = `📅 *Próxima fecha libre (${comensales} comensales, ${timeClean}):*\n👉 ${avail.diaSemana}, ${avail.fecha}`;
        }
    } else {
        if (lang === 'eu') {
            nextAvailMsg = `📅 *Erabilgarritasuna (${timeClean}):* Eskuz kontsultatuko dugu.`;
        } else if (lang === 'en') {
            nextAvailMsg = `📅 *Availability (${timeClean}):* We will check manually.`;
        } else {
            nextAvailMsg = `📅 *Disponibilidad (${timeClean}):* Comprobaremos la disponibilidad manualmente.`;
        }
    }

    if (state.data.waitlist.tipoServicio === 'Cena') {
        state.step = 'espera_step4_cena';
        userStates.set(from, state);

        const promptBody = getTranslation(lang, 'waitlistStep4CenaDia').replace('{nextAvailable}', nextAvailMsg);
        const buttons = [
            { id: 'wl_cena_viernes', title: getTranslation(lang, 'dayViernes').slice(0, 20) },
            { id: 'wl_cena_sabado', title: getTranslation(lang, 'daySabado').slice(0, 20) },
            { id: 'wl_cena_skip', title: getTranslation(lang, 'btnSinPreferencia').slice(0, 20) }
        ];
        await sendInteractiveButtons(from, promptBody, buttons);
    } else {
        state.data.waitlist.selectedDays = [];
        state.data.waitlist.nextAvailMsg = nextAvailMsg;
        await sendWaitlistDaysList(from, lang);
    }
}

/**
 * Envía la lista desplegable interactiva para seleccionar alergias, intolerancias y enfermedades.
 */
function getAllergiesListRows(lang, selectedList = []) {
    const list = [
        { id: 'alg_gluten', title: '🌾 Gluten / Celíacos', desc: 'Intolerancia o alergia al gluten' },
        { id: 'alg_laktosa', title: '🥛 Lactosa / Lácteos', desc: 'Intolerancia a la lactosa o lácteos' },
        { id: 'alg_frutos_huevo', title: '🥜 Frutos secos / Huevo', desc: 'Alergia a frutos secos, cacahuete o huevo' },
        { id: 'alg_marisco_pescado', title: '🦐 Marisco / Pescado', desc: 'Alergia a marisco, crustáceos o pescado' },
        { id: 'alg_diabetes_sal', title: '🩺 Diabetes/Hipertensión', desc: 'Diabético, azúcar o bajo en sal' },
        { id: 'alg_vegano', title: '🥗 Vegetariano / Vegano', desc: 'Dieta vegetariana o vegana' },
        { id: 'alg_otro', title: '✍️ Otra (escribir texto)', desc: 'Escribir otra alergia o enfermedad' }
    ];

    const rows = [];
    
    if (selectedList.length > 0) {
        rows.push({
            id: 'alg_finish',
            title: getTranslation(lang, 'btnFinishAllergySelection').slice(0, 24),
            description: getTranslation(lang, 'descFinishAllergySelection').slice(0, 72)
        });
    }

    rows.push({
        id: 'alg_no',
        title: getTranslation(lang, 'btnNoAllergies').slice(0, 24),
        description: getTranslation(lang, 'descNoAllergies').slice(0, 72)
    });

    const allergyMapInv = {
        'Gluten / Celíacos': 'alg_gluten',
        'Lactosa': 'alg_laktosa',
        'Frutos secos / Huevo': 'alg_frutos_huevo',
        'Marisco / Pescado': 'alg_marisco_pescado',
        'Diabetes / Hipertensión': 'alg_diabetes_sal',
        'Vegetariano/Vegano': 'alg_vegano'
    };

    list.forEach(item => {
        const titleClean = item.title.replace(/^[^\s]+\s*/, '');
        const isSelected = selectedList.some(s => s.includes(titleClean) || allergyMapInv[s] === item.id);
        rows.push({
            id: item.id,
            title: (isSelected ? '✅ ' + item.title : item.title).slice(0, 24),
            description: item.desc.slice(0, 72)
        });
    });

    return rows;
}

async function sendAllergiesList(from, lang, promptKey, selectedList = []) {
    let bodyText = getTranslation(lang, promptKey);
    if (selectedList.length > 0) {
        const selStr = selectedList.join(', ');
        bodyText = getTranslation(lang, 'selectedAllergiesHeader').replace('{allergies}', selStr) +
            '\n\n' + getTranslation(lang, promptKey);
    }
    const buttonText = getTranslation(lang, 'menuButtonText');
    const rows = getAllergiesListRows(lang, selectedList);
    const sections = [{ title: "Alergias y Salud", rows }];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

/**
 * Maneja la selección interactiva de alergias/restricciones.
 */
async function handleAllergiesListSelection(from, listId, lang) {
    const currentState = userStates.get(from) || { data: {} };
    const isMenuTrad = (currentState.step === 'menu_trad_step6_alergias');
    const formKey = isMenuTrad ? 'menuTrad' : 'waitlist';
    currentState.data[formKey] = currentState.data[formKey] || {};
    currentState.data[formKey].selectedAllergies = currentState.data[formKey].selectedAllergies || [];

    if (listId === 'alg_no') {
        currentState.data[formKey].alergias = 'NO';
        currentState.step = isMenuTrad ? 'menu_trad_step7_idioma' : 'espera_step7_idioma';
        userStates.set(from, currentState);
        await sendFormLanguageList(from, lang);
        return;
    }

    if (listId === 'alg_finish') {
        const list = currentState.data[formKey].selectedAllergies;
        currentState.data[formKey].alergias = list.length > 0 ? list.join(', ') : 'NO';
        currentState.step = isMenuTrad ? 'menu_trad_step7_idioma' : 'espera_step7_idioma';
        userStates.set(from, currentState);
        await sendFormLanguageList(from, lang);
        return;
    }

    if (listId === 'alg_otro') {
        let msg = '';
        if (lang === 'eu') msg = "⚠️ Mesedez, idatzi testuz zure alergia edo osasun egoera (adib. \"Diabetesa\"):";
        else if (lang === 'en') msg = "⚠️ Please type your allergy or health condition (e.g. \"Diabetes\"):";
        else msg = "⚠️ Por favor, escribe por texto tu alergia o restricción alimentaria (ej. \"Diabetes\"):";
        // Marcamos el flag para que el handler de texto sepa que espera texto libre
        currentState.data[formKey]._pendingAlgOtro = true;
        userStates.set(from, currentState);
        await sendMessage(from, msg);
        return;
    }

    const allergyMap = {
        'alg_gluten': 'Gluten / Celíacos',
        'alg_laktosa': 'Lactosa',
        'alg_frutos_huevo': 'Frutos secos / Huevo',
        'alg_marisco_pescado': 'Marisco / Pescado',
        'alg_diabetes_sal': 'Diabetes / Hipertensión',
        'alg_vegano': 'Vegetariano/Vegano'
    };

    const selectedName = allergyMap[listId];
    if (selectedName && !currentState.data[formKey].selectedAllergies.includes(selectedName)) {
        currentState.data[formKey].selectedAllergies.push(selectedName);
    }
    userStates.set(from, currentState);

    const promptTextKey = isMenuTrad ? 'menuTradStep6Alergias' : 'waitlistStep6Alergias';
    await sendAllergiesList(from, lang, promptTextKey, currentState.data[formKey].selectedAllergies);
}

/**
 * Envía la lista desplegable interactiva para seleccionar de 1 a 3 días de preferencia en Lista de Espera.
 */
async function sendWaitlistDaysList(from, lang) {
    const state = userStates.get(from) || { data: {} };
    state.data.waitlist = state.data.waitlist || {};
    const selectedDays = state.data.waitlist.selectedDays || [];
    const nextAvailMsg = state.data.waitlist.nextAvailMsg || '';

    state.step = 'espera_step4_dias';
    userStates.set(from, state);

    let promptBody = getTranslation(lang, 'waitlistStep4Dia1').replace('{nextAvailable}', nextAvailMsg);
    if (selectedDays.length > 0) {
        const daysFormatted = selectedDays.map(d => d.label).join(', ');
        const daysHeader = getTranslation(lang, 'selectedDaysHeader').replace('{days}', daysFormatted);
        if (lang === 'eu') {
            promptBody = `📝 *Itxaron Zerrenda (4/7)*\n\n${daysHeader}\n\nHautatu beste egun bat (gehienez 3) edo sakatu "Amaitu hautaketa":`;
        } else if (lang === 'en') {
            promptBody = `📝 *Waitlist (4/7)*\n\n${daysHeader}\n\nSelect another day (max 3) or tap "Finish selection":`;
        } else {
            promptBody = `📝 *Lista de Espera (4/7)*\n\n${daysHeader}\n\nSeleccione otro día (máx 3) o pulse "Finalizar selección":`;
        }
    }

    const buttonText = getTranslation(lang, 'menuButtonText');
    const rows = [];

    if (selectedDays.length > 0) {
        rows.push({
            id: 'wl_day_done',
            title: (getTranslation(lang, 'btnFinishDaySelection') || '✅ Amaitu hautaketa').slice(0, 24),
            description: (getTranslation(lang, 'descFinishDaySelection') || 'Gorde aukeratutako egunak').slice(0, 72)
        });
    } else {
        rows.push({
            id: 'wl_day_skip',
            title: getTranslation(lang, 'rowSinPreferenciaTitle').slice(0, 24),
            description: getTranslation(lang, 'rowSinPreferenciaDesc').slice(0, 72)
        });
    }

    const allDays = [
        { key: 'martes', label: getTranslation(lang, 'dayMartes') },
        { key: 'miercoles', label: getTranslation(lang, 'dayMiercoles') },
        { key: 'jueves', label: getTranslation(lang, 'dayJueves') },
        { key: 'viernes', label: getTranslation(lang, 'dayViernes') },
        { key: 'sabado', label: getTranslation(lang, 'daySabado') },
        { key: 'domingo', label: getTranslation(lang, 'dayDomingo') }
    ];

    const selectedKeys = selectedDays.map(d => d.key);
    allDays.filter(d => !selectedKeys.includes(d.key)).forEach(d => {
        rows.push({
            id: 'wl_day_' + d.key,
            title: d.label.slice(0, 24),
            description: `Aukeratu ${d.label}`.slice(0, 72)
        });
    });

    await sendInteractiveList(from, promptBody, buttonText, [{ title: "Egunen erabilgarritasuna", rows }]);
}

/**
 * Maneja la selección interactiva de días de preferencia en Lista de Espera.
 */
async function handleWaitlistDaySelection(from, listId, lang) {
    const state = userStates.get(from) || { data: {} };
    state.data.waitlist = state.data.waitlist || {};
    let selectedDays = state.data.waitlist.selectedDays || [];

    if (listId === 'wl_day_skip' || listId === 'wl_day1_skip') {
        state.data.waitlist.dias = 'Sin preferencia';
        state.step = 'espera_step5_ninos';
        userStates.set(from, state);
        await sendWaitlistNinosPrompt(from, lang);
        return;
    }

    if (listId === 'wl_day_done') {
        const daysFormatted = selectedDays.map(d => d.label).join(', ');
        state.data.waitlist.dias = daysFormatted || 'Sin preferencia';
        state.step = 'espera_step5_ninos';
        userStates.set(from, state);
        await sendWaitlistNinosPrompt(from, lang);
        return;
    }

    const rawDayKey = listId.replace('wl_day_', '').replace(/^wl_day\d_/, '');
    const dayLabel = getTranslation(lang, 'day' + rawDayKey.charAt(0).toUpperCase() + rawDayKey.slice(1));

    if (!selectedDays.some(d => d.key === rawDayKey)) {
        selectedDays.push({ key: rawDayKey, label: dayLabel });
    }
    state.data.waitlist.selectedDays = selectedDays;
    userStates.set(from, state);

    if (selectedDays.length >= 3) {
        const daysFormatted = selectedDays.map(d => d.label).join(', ');
        state.data.waitlist.dias = daysFormatted;
        state.step = 'espera_step5_ninos';
        userStates.set(from, state);
        await sendWaitlistNinosPrompt(from, lang);
    } else {
        await sendWaitlistDaysList(from, lang);
    }
}

/**
 * Maneja la selección interactiva de turno horario (Comida/Cena) en el formulario de Menú Tradición.
 */
async function handleMenuTradSlotSelection(from, slotId, lang) {
    const rawTime = slotId.replace('mt_slot_', '');
    const timeClean = rawTime.replace(/(\d{2})(\d{2})/, '$1:$2');

    const state = userStates.get(from) || { data: {} };
    state.data.menuTrad = state.data.menuTrad || {};
    state.data.menuTrad.horario = timeClean;

    const avail = db.getNextAvailableDate(timeClean, 2);

    let nextAvailMsg = '';
    if (avail && avail.encontrado) {
        if (lang === 'eu') {
            nextAvailMsg = `📅 *Hurrengo data librea (2 pertsona, ${timeClean}):*\n👉 ${avail.diaSemana}, ${avail.fecha}`;
        } else if (lang === 'en') {
            nextAvailMsg = `📅 *Next available date (2 guests, ${timeClean}):*\n👉 ${avail.diaSemana}, ${avail.fecha}`;
        } else {
            nextAvailMsg = `📅 *Próxima fecha libre (2 comensales, ${timeClean}):*\n👉 ${avail.diaSemana}, ${avail.fecha}`;
        }
    } else {
        if (lang === 'eu') {
            nextAvailMsg = `📅 *Erabilgarritasuna (${timeClean}):* Eskuz kontsultatuko dugu.`;
        } else if (lang === 'en') {
            nextAvailMsg = `📅 *Availability (${timeClean}):* We will check manually.`;
        } else {
            nextAvailMsg = `📅 *Disponibilidad (${timeClean}):* Comprobaremos la disponibilidad manualmente.`;
        }
    }

    if (state.data.menuTrad.tipoServicio === 'Cena') {
        state.step = 'menu_trad_step5_cena';
        userStates.set(from, state);

        const promptBody = getTranslation(lang, 'menuTradStep5CenaDia').replace('{nextAvailable}', nextAvailMsg);
        const buttons = [
            { id: 'mt_cena_viernes', title: getTranslation(lang, 'dayViernes').slice(0, 20) },
            { id: 'mt_cena_sabado', title: getTranslation(lang, 'daySabado').slice(0, 20) },
            { id: 'mt_cena_skip', title: getTranslation(lang, 'btnSinPreferencia').slice(0, 20) }
        ];
        await sendInteractiveButtons(from, promptBody, buttons);
    } else {
        state.data.menuTrad.selectedDays = [];
        state.data.menuTrad.nextAvailMsg = nextAvailMsg;
        await sendMenuTradDaysList(from, lang);
    }
}

/**
 * Envía la lista desplegable interactiva para seleccionar de 1 a 3 días de preferencia en Menú Tradición.
 */
async function sendMenuTradDaysList(from, lang) {
    const state = userStates.get(from) || { data: {} };
    state.data.menuTrad = state.data.menuTrad || {};
    const selectedDays = state.data.menuTrad.selectedDays || [];
    const nextAvailMsg = state.data.menuTrad.nextAvailMsg || '';

    state.step = 'menu_trad_step5_dias';
    userStates.set(from, state);

    let promptBody = getTranslation(lang, 'menuTradStep5Dia1').replace('{nextAvailable}', nextAvailMsg);
    if (selectedDays.length > 0) {
        const daysFormatted = selectedDays.map(d => d.label).join(', ');
        const daysHeader = getTranslation(lang, 'selectedDaysHeader').replace('{days}', daysFormatted);
        if (lang === 'eu') {
            promptBody = `🎁 *Tradizio Menua (5/7)*\n\n${daysHeader}\n\nHautatu beste egun bat (gehienez 3) edo sakatu "Amaitu hautaketa":`;
        } else if (lang === 'en') {
            promptBody = `🎁 *Tradition Menu (5/7)*\n\n${daysHeader}\n\nSelect another day (max 3) or tap "Finish selection":`;
        } else {
            promptBody = `🎁 *Menú Tradición (5/7)*\n\n${daysHeader}\n\nSeleccione otro día (máx 3) o pulse "Finalizar selección":`;
        }
    }

    const buttonText = getTranslation(lang, 'menuButtonText');
    const rows = [];

    if (selectedDays.length > 0) {
        rows.push({
            id: 'mt_day_done',
            title: (getTranslation(lang, 'btnFinishDaySelection') || '✅ Amaitu hautaketa').slice(0, 24),
            description: (getTranslation(lang, 'descFinishDaySelection') || 'Gorde aukeratutako egunak').slice(0, 72)
        });
    } else {
        rows.push({
            id: 'mt_day_skip',
            title: getTranslation(lang, 'rowSinPreferenciaTitle').slice(0, 24),
            description: getTranslation(lang, 'rowSinPreferenciaDesc').slice(0, 72)
        });
    }

    const allDays = [
        { key: 'martes', label: getTranslation(lang, 'dayMartes') },
        { key: 'miercoles', label: getTranslation(lang, 'dayMiercoles') },
        { key: 'jueves', label: getTranslation(lang, 'dayJueves') },
        { key: 'viernes', label: getTranslation(lang, 'dayViernes') },
        { key: 'sabado', label: getTranslation(lang, 'daySabado') },
        { key: 'domingo', label: getTranslation(lang, 'dayDomingo') }
    ];

    const selectedKeys = selectedDays.map(d => d.key);
    allDays.filter(d => !selectedKeys.includes(d.key)).forEach(d => {
        rows.push({
            id: 'mt_day_' + d.key,
            title: d.label.slice(0, 24),
            description: `Aukeratu ${d.label}`.slice(0, 72)
        });
    });

    await sendInteractiveList(from, promptBody, buttonText, [{ title: "Egunen erabilgarritasuna", rows }]);
}

/**
 * Maneja la selección interactiva de días de preferencia en Menú Tradición.
 */
async function handleMenuTradDaySelection(from, listId, lang) {
    const state = userStates.get(from) || { data: {} };
    state.data.menuTrad = state.data.menuTrad || {};
    let selectedDays = state.data.menuTrad.selectedDays || [];

    if (listId === 'mt_day_skip' || listId === 'mt_day1_skip') {
        state.data.menuTrad.dias = 'Sin preferencia';
        state.step = 'menu_trad_step6_alergias';
        state.data.menuTrad.selectedAllergies = [];
        userStates.set(from, state);
        await sendAllergiesList(from, lang, 'menuTradStep6Alergias', []);
        return;
    }

    if (listId === 'mt_day_done') {
        const daysFormatted = selectedDays.map(d => d.label).join(', ');
        state.data.menuTrad.dias = daysFormatted || 'Sin preferencia';
        state.step = 'menu_trad_step6_alergias';
        state.data.menuTrad.selectedAllergies = [];
        userStates.set(from, state);
        await sendAllergiesList(from, lang, 'menuTradStep6Alergias', []);
        return;
    }

    const rawDayKey = listId.replace('mt_day_', '').replace(/^mt_day\d_/, '');
    const dayLabel = getTranslation(lang, 'day' + rawDayKey.charAt(0).toUpperCase() + rawDayKey.slice(1));

    if (!selectedDays.some(d => d.key === rawDayKey)) {
        selectedDays.push({ key: rawDayKey, label: dayLabel });
    }
    state.data.menuTrad.selectedDays = selectedDays;
    userStates.set(from, state);

    if (selectedDays.length >= 3) {
        const daysFormatted = selectedDays.map(d => d.label).join(', ');
        state.data.menuTrad.dias = daysFormatted;
        state.step = 'menu_trad_step6_alergias';
        state.data.menuTrad.selectedAllergies = [];
        userStates.set(from, state);
        await sendAllergiesList(from, lang, 'menuTradStep6Alergias', []);
    } else {
        await sendMenuTradDaysList(from, lang);
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
 * Envía la lista desplegable interactiva de Nacionalidad (países y estados de EE.UU.).
 */
async function sendNationalityList(from, lang) {
    const bodyText = getTranslation(lang, 'listNacBody');
    const buttonText = getTranslation(lang, 'listNacBtn').slice(0, 20);

    const sections = [
        {
            title: getTranslation(lang, 'listNacHeader').slice(0, 24),
            rows: [
                { id: 'nac_skip', title: getTranslation(lang, 'nacSkipTitle').slice(0, 24), description: getTranslation(lang, 'nacSkipDesc').slice(0, 72) },
                { id: 'nac_es', title: getTranslation(lang, 'nacEs').slice(0, 24) },
                { id: 'nac_fr', title: getTranslation(lang, 'nacFr').slice(0, 24) },
                { id: 'nac_uk', title: getTranslation(lang, 'nacUk').slice(0, 24) },
                { id: 'nac_us', title: getTranslation(lang, 'nacUs').slice(0, 24), description: getTranslation(lang, 'nacUsDesc').slice(0, 72) },
                { id: 'nac_de', title: getTranslation(lang, 'nacDe').slice(0, 24) },
                { id: 'nac_it', title: getTranslation(lang, 'nacIt').slice(0, 24) },
                { id: 'nac_pt', title: getTranslation(lang, 'nacPt').slice(0, 24) },
                { id: 'nac_mx', title: getTranslation(lang, 'nacMx').slice(0, 24) },
                { id: 'nac_otro', title: getTranslation(lang, 'nacOtro').slice(0, 24), description: getTranslation(lang, 'nacOtroDesc').slice(0, 72) }
            ]
        }
    ];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

/**
 * Maneja la selección interactiva de Nacionalidad desde la lista desplegable.
 */
async function handleNationalitySelection(from, listId, lang) {
    let selNac = null;
    if (listId !== 'nac_skip' && !['omitir', 'skip', 'utzi', 'no'].includes(listId.toLowerCase())) {
        const nacMap = {
            'nac_es': getTranslation(lang, 'nacEs'),
            'nac_fr': getTranslation(lang, 'nacFr'),
            'nac_uk': getTranslation(lang, 'nacUk'),
            'nac_us': getTranslation(lang, 'nacUs'),
            'nac_de': getTranslation(lang, 'nacDe'),
            'nac_it': getTranslation(lang, 'nacIt'),
            'nac_pt': getTranslation(lang, 'nacPt'),
            'nac_mx': getTranslation(lang, 'nacMx'),
            'nac_jp': getTranslation(lang, 'nacJp'),
            'nac_otro': getTranslation(lang, 'nacOtro')
        };
        selNac = nacMap[listId] || listId.replace('nac_', '').toUpperCase();
    }

    const currentState = userStates.get(from) || { data: {} };

    // Si estamos en el formulario de Menú Tradición
    if (currentState.step === 'menu_trad_step2c_nac' || (currentState.data && currentState.data.menuTrad && !currentState.data.waitlist)) {
        currentState.data.menuTrad = currentState.data.menuTrad || {};
        currentState.data.menuTrad.nacionalidad = selNac;
        currentState.step = 'menu_trad_step3_tipo';
        userStates.set(from, currentState);

        const promptBody = getTranslation(lang, 'menuTradStep3Tipo');
        const buttons = [
            { id: 'menu_trad_tipo_comida', title: getTranslation(lang, 'btnComida').slice(0, 20) },
            { id: 'menu_trad_tipo_cena', title: getTranslation(lang, 'btnCena').slice(0, 20) }
        ];
        await sendInteractiveButtons(from, promptBody, buttons);
        return;
    }

    // Por defecto o en formulario de Lista de Espera (espera_step1c_nac)
    currentState.data.waitlist = currentState.data.waitlist || {};
    currentState.data.waitlist.nacionalidad = selNac;
    currentState.step = 'espera_step2_comensales';
    userStates.set(from, currentState);

    await sendMessage(from, getTranslation(lang, 'waitlistStep2Comensales'));
}

/**
 * Envía la lista desplegable interactiva de 14 Idiomas para el formulario de lista de espera / menú tradición.
 */
async function sendFormLanguageList(from, lang, showMore = false) {
    const bodyText = getTranslation(lang, 'waitlistStep7Idioma');
    const buttonText = (getTranslation(lang, 'listLangBtn') || 'Hautatu Hizkuntza').slice(0, 20);

    let rows = [];
    if (!showMore) {
        rows = [
            { id: 'form_lang_skip', title: getTranslation(lang, 'formLangSkipTitle').slice(0, 24), description: getTranslation(lang, 'formLangSkipDesc').slice(0, 72) },
            { id: 'form_lang_eu', title: 'EU Euskara', description: 'Euskara' },
            { id: 'form_lang_es', title: 'ES Español', description: 'Español' },
            { id: 'form_lang_en', title: 'EN English', description: 'English' },
            { id: 'form_lang_fr', title: 'FR Français', description: 'Français' },
            { id: 'form_lang_de', title: 'DE Deutsch', description: 'Deutsch' },
            { id: 'form_lang_it', title: 'IT Italiano', description: 'Italiano' },
            { id: 'form_lang_pt', title: 'PT Português', description: 'Português' },
            { id: 'form_lang_nl', title: 'NL Nederlands', description: 'Nederlands' },
            { id: 'form_lang_more', title: '🌐 Beste batzuk / Otros', description: 'CA, GL, RU, ZH, JA...' }
        ];
    } else {
        rows = [
            { id: 'form_lang_skip', title: getTranslation(lang, 'formLangSkipTitle').slice(0, 24), description: getTranslation(lang, 'formLangSkipDesc').slice(0, 72) },
            { id: 'form_lang_ca', title: 'CA Català', description: 'Català' },
            { id: 'form_lang_gl', title: 'GL Galego', description: 'Galego' },
            { id: 'form_lang_ru', title: 'RU Русский', description: 'Русский' },
            { id: 'form_lang_zh', title: 'ZH 中文', description: '中文' },
            { id: 'form_lang_ja', title: 'JA 日本語', description: '日本語' },
            { id: 'form_lang_ar', title: 'AR العربية', description: 'العربية' },
            { id: 'form_lang_eu', title: 'EU Euskara', description: 'Euskara' },
            { id: 'form_lang_es', title: 'ES Español', description: 'Español' },
            { id: 'form_lang_en', title: 'EN English', description: 'English' }
        ];
    }

    const sections = [
        {
            title: showMore ? "Beste Hizkuntza Batzuk" : "Harreman-hizkuntza",
            rows: rows
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
        if (faqNum === '1' || faqNum === '2') {
            const baseUrl = process.env.PUBLIC_URL || 'https://casa-julian-whatsapp-bot.onrender.com';
            const imageUrl = `${baseUrl}/public/casa_julian_erretegia.jpg`;
            const imageCaption = "Asador Casa Julián (Tolosa) - Santa Clara Kalea, 6";
            
            try {
                await sendImageMessage(from, imageUrl, imageCaption);
            } catch (imgErr) {
                console.error("⚠️ Error enviando imagen de horarios:", imgErr.message);
            }
        }
        await sendMessage(from, responseMsg);
    }
    
    await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
    await showLocationOrMainMenu(from);
}

/**
 * Solicita confirmación interactiva al cliente antes de enviar la alerta a recepción.
 */
async function requestUserConfirmation(from, lang, pendingAlertData) {
    const state = userStates.get(from) || { lang: lang };
    state.step = 'confirmacion_solicitud';
    state.data = state.data || {};
    state.data.pendingAlert = pendingAlertData;
    userStates.set(from, state);

    // 1. Enviar primero al cliente un mensaje con el resumen detallado de su solicitud
    const summaryHeader = getTranslation(lang, 'requestSummaryHeader');
    const clientSummaryMsg = `${summaryHeader}\n\n${pendingAlertData.detalleMod}`;
    await sendMessage(from, clientSummaryMsg);

    // 2. Enviar la pregunta interactiva con los botones de confirmación
    const promptBody = getTranslation(lang, 'confirmPrompt');
    const buttons = [
        { id: 'confirm_yes', title: getTranslation(lang, 'confirmYesBtn').slice(0, 20) },
        { id: 'confirm_no', title: getTranslation(lang, 'confirmNoBtn').slice(0, 20) }
    ];
    await sendInteractiveButtons(from, promptBody, buttons);
}

/**
 * Maneja las respuestas de texto según el paso actual de la conversación.
 */
async function handleTextMessage(from, text) {
    const lang = userLanguages.get(from) || 'es';
    const cleanText = text.trim().toLowerCase();

    // 1. Interceptador de Saludo / Inicio: Borra cualquier estado o formulario incompleto y empieza el flujo desde cero
    const isGreeting = ['hola', 'kaixo', 'hello', 'hi', 'bonjour', 'hallo', 'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches', 'egun on', 'arratsalde on', 'gabon', 'start', 'inicio', 'empezar', 'menu', 'menú', 'volver', 'home', 'reiniciar', 'reset'].some(k => cleanText === k || cleanText.startsWith(k + ' '));

    if (isGreeting) {
        userStates.delete(from);
        await sendLanguageMenu(from, 1);
        return;
    }

    // 2. Interceptador de Despedida / Finalización: Borra la memoria del estado y despide al cliente
    const isFarewell = ['adios', 'adiós', 'agur', 'bye', 'goodbye', 'gracias', 'eskerrik asko', 'thank you', 'thanks', 'merci', 'danke', 'chao', 'chau', 'hasta luego', 'hasta pronto', 'salir', 'cancelar', 'finish', 'end'].some(k => cleanText === k || cleanText.startsWith(k + ' '));

    if (isFarewell) {
        userStates.delete(from);
        await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
        return;
    }

    const currentState = userStates.get(from);

    if (!currentState || currentState.step === 'select_language') {
        await sendLanguageMenu(from, 1);
        return;
    }

    switch (currentState.step) {
        case 'select_location':
            await showLocationOrMainMenu(from);
            break;

        case 'confirmacion_solicitud': {
            const lower = text.trim().toLowerCase();
            if (['si', 'sí', 'bai', 'yes', 's', 'confirmar', 'enviar'].includes(lower)) {
                await handleButtonResponse(from, 'confirm_yes', lang);
            } else {
                await handleButtonResponse(from, 'confirm_no', lang);
            }
            break;
        }

        case 'espera_step0_init': {
            const lowerText = text.trim().toLowerCase();
            if (['si', 'sí', 'bai', 'yes', 's'].includes(lowerText)) {
                await handleButtonResponse(from, 'waitlist_init_si');
            } else {
                await handleButtonResponse(from, 'waitlist_init_no');
            }
            break;
        }

        case 'espera_step1_nombre': {
            currentState.data.waitlist = currentState.data.waitlist || {};
            currentState.data.waitlist.nombre = text;
            currentState.data.waitlist.dni = null;
            currentState.step = 'espera_step1b2_email';
            userStates.set(from, currentState);

            const promptBody = getTranslation(lang, 'waitlistStep1b2Email');
            const buttons = [
                { id: 'btn_skip_email', title: getTranslation(lang, 'btnOmitirEmail').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, promptBody, buttons);
            break;
        }

        case 'espera_step1b2_email': {
            currentState.data.waitlist = currentState.data.waitlist || {};
            const cleanEmail = text.trim();
            if (['omitir', 'utzi', 'skip', 'no', 'btn_skip_email'].includes(cleanEmail.toLowerCase())) {
                currentState.data.waitlist.email = 'N/A';
                currentState.step = 'espera_step1c_nac';
                userStates.set(from, currentState);
                await sendNationalityList(from, lang);
            } else if (!isValidEmail(cleanEmail)) {
                // Email inválido: avisar y pedir de nuevo sin avanzar de paso
                const errMsg = getInvalidEmailMsg(lang);
                const buttons = [
                    { id: 'btn_skip_email', title: getTranslation(lang, 'btnOmitirEmail').slice(0, 20) }
                ];
                await sendMessage(from, errMsg);
                await sendInteractiveButtons(from, getTranslation(lang, 'waitlistStep1b2Email'), buttons);
            } else {
                currentState.data.waitlist.email = cleanEmail.toLowerCase();
                currentState.step = 'espera_step1c_nac';
                userStates.set(from, currentState);
                await sendNationalityList(from, lang);
            }
            break;
        }

        case 'espera_step1c_nac': {
            currentState.data.waitlist = currentState.data.waitlist || {};
            let nac = text.trim();
            if (['omitir', 'utzi', 'skip', 'otro', 'nac_otro'].includes(nac.toLowerCase())) {
                nac = lang === 'eu' ? 'Beste bat / Sin especificar' : (lang === 'en' ? 'Other / Unspecified' : 'Otro / Sin especificar');
            }
            currentState.data.waitlist.nacionalidad = nac;
            currentState.step = 'espera_step2_comensales';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'waitlistStep2Comensales'));
            break;
        }

        case 'espera_step2_comensales': {
            currentState.data.waitlist = currentState.data.waitlist || {};
            const cleanText = text.trim();
            const numComensales = parseInt(cleanText, 10);

            if (isNaN(numComensales) || numComensales < 1 || numComensales > 6) {
                const errMsg = getTranslation(lang, 'maxComensalesErrorMsg');
                await sendMessage(from, errMsg);
                await sendMessage(from, getTranslation(lang, 'waitlistStep2Comensales'));
                break;
            }

            currentState.data.waitlist.comensales = numComensales;
            currentState.step = 'espera_step3_tipo';
            userStates.set(from, currentState);

            const promptBody = getTranslation(lang, 'waitlistStep3Tipo');
            const buttons = [
                { id: 'wl_tipo_comida', title: getTranslation(lang, 'btnComida').slice(0, 20) },
                { id: 'wl_tipo_cena', title: getTranslation(lang, 'btnCena').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, promptBody, buttons);
            break;
        }

        case 'espera_step3_tipo': {
            const lowerText = text.trim().toLowerCase();
            if (lowerText.includes('comida') || lowerText.includes('bazkari') || lowerText.includes('lunch')) {
                await handleButtonResponse(from, 'wl_tipo_comida');
            } else {
                await handleButtonResponse(from, 'wl_tipo_cena');
            }
            break;
        }

        case 'espera_step3_hora': {
            const timeClean = text.trim().replace('.', ':');
            await handleWaitlistSlotSelection(from, 'wl_slot_' + timeClean.replace(':', ''), lang);
            break;
        }

        case 'espera_step4_cena': {
            const lowerText = text.trim().toLowerCase();
            if (lowerText.includes('viernes') || lowerText.includes('ostirala') || lowerText.includes('friday')) {
                await handleButtonResponse(from, 'wl_cena_viernes');
            } else {
                await handleButtonResponse(from, 'wl_cena_sabado');
            }
            break;
        }

        case 'espera_step4_dia1':
        case 'espera_step4_dia2':
        case 'espera_step4_dia3': {
            const cleanDay = text.trim();
            if (currentState.step === 'espera_step4_dia1') {
                currentState.data.waitlist.day1 = cleanDay;
                currentState.step = 'espera_step4_dia2';
                userStates.set(from, currentState);
                const bodyText = getTranslation(lang, 'waitlistStep4Dia2').replace('{day1}', cleanDay);
                const buttonText = getTranslation(lang, 'menuButtonText');
                const rows = getDaysListRows(lang).map(r => ({ ...r, id: 'wl_day2_' + r.id }));
                await sendInteractiveList(from, bodyText, buttonText, [{ title: "Día 2 de preferencia", rows }]);
            } else if (currentState.step === 'espera_step4_dia2') {
                currentState.data.waitlist.day2 = cleanDay;
                currentState.step = 'espera_step4_dia3';
                userStates.set(from, currentState);
                const d1 = currentState.data.waitlist.day1;
                const bodyText = getTranslation(lang, 'waitlistStep4Dia3').replace('{day1}', d1).replace('{day2}', cleanDay);
                const buttonText = getTranslation(lang, 'menuButtonText');
                const rows = getDaysListRows(lang).map(r => ({ ...r, id: 'wl_day3_' + r.id }));
                await sendInteractiveList(from, bodyText, buttonText, [{ title: "Día 3 de preferencia", rows }]);
            } else {
                currentState.data.waitlist.day3 = cleanDay;
                const d1 = currentState.data.waitlist.day1;
                const d2 = currentState.data.waitlist.day2;
                currentState.data.waitlist.dias = `${d1}, ${d2}, ${cleanDay}`;
                currentState.step = 'espera_step5_ninos';
                userStates.set(from, currentState);
                await sendWaitlistNinosPrompt(from, lang);
            }
            break;
        }

        case 'espera_step5_ninos': {
            currentState.data.waitlist = currentState.data.waitlist || {};
            const cleanText = text.trim();
            if (['no', 'ninguno', 'ninguna', '0', 'ez', 'nada', 'none'].includes(cleanText.toLowerCase())) {
                currentState.data.waitlist.ninos = '0';
            } else {
                currentState.data.waitlist.ninos = cleanText;
            }
            currentState.step = 'espera_step6_alergias';
            currentState.data.waitlist.selectedAllergies = [];
            userStates.set(from, currentState);
            await sendAllergiesList(from, lang, 'waitlistStep6Alergias', []);
            break;
        }

        case 'espera_step6_alergias': {
            currentState.data.waitlist = currentState.data.waitlist || {};
            const cleanText = text.trim();
            const pendingOtro = currentState.data.waitlist._pendingAlgOtro;
            if (pendingOtro) {
                delete currentState.data.waitlist._pendingAlgOtro;
                const selectedAllergies = currentState.data.waitlist.selectedAllergies || [];
                if (cleanText && !['no', 'ninguna', 'none', '0', 'nada'].includes(cleanText.toLowerCase())) {
                    selectedAllergies.push(cleanText);
                }
                currentState.data.waitlist.selectedAllergies = selectedAllergies;
                userStates.set(from, currentState);
                await sendAllergiesList(from, lang, 'waitlistStep6Alergias', selectedAllergies);
            } else {
                // Texto no esperado: volver a mostrar la lista desplegable
                currentState.data.waitlist.selectedAllergies = currentState.data.waitlist.selectedAllergies || [];
                userStates.set(from, currentState);
                await sendAllergiesList(from, lang, 'waitlistStep6Alergias', currentState.data.waitlist.selectedAllergies);
            }
            break;
        }

        case 'espera_step7_idioma': {
            if (['omitir', 'utzi', 'skip', 'no', 'form_lang_skip'].includes(cleanText.toLowerCase())) {
                await handleButtonResponse(from, 'form_lang_skip');
                break;
            }
            let selLang = 'es';
            if (cleanText.includes('eusk') || cleanText.includes('basq') || cleanText === 'eu') selLang = 'eu';
            else if (cleanText.includes('eng') || cleanText.includes('ingl') || cleanText === 'en') selLang = 'en';
            else if (cleanText.includes('fran') || cleanText.includes('fren') || cleanText === 'fr') selLang = 'fr';
            else if (cleanText.includes('deut') || cleanText.includes('germ') || cleanText.includes('aleman') || cleanText === 'de') selLang = 'de';
            else if (cleanText.includes('ital') || cleanText === 'it') selLang = 'it';
            else if (cleanText.includes('port') || cleanText === 'pt') selLang = 'pt';
            else if (cleanText.includes('neder') || cleanText.includes('dutc') || cleanText === 'nl') selLang = 'nl';
            else if (cleanText.includes('cat') || cleanText === 'ca') selLang = 'ca';
            else if (cleanText.includes('gal') || cleanText === 'gl') selLang = 'gl';
            else if (cleanText.includes('rus') || cleanText === 'ru') selLang = 'ru';
            else if (cleanText.includes('chin') || cleanText === 'zh') selLang = 'zh';
            else if (cleanText.includes('japo') || cleanText === 'ja') selLang = 'ja';
            else if (cleanText.includes('arab') || cleanText === 'ar') selLang = 'ar';
            await handleButtonResponse(from, 'form_lang_' + selLang);
            break;
        }

        case 'menu_trad_step1_tarjeta': {
            const rawCardCode = text.trim();
            const card = await db.getGiftCard(rawCardCode);

            if (card) {
                const estadoNorm = (card.estado || 'NO CONSUMIDA').trim().toUpperCase();

                if (estadoNorm === 'NO CONSUMIDA' || estadoNorm === 'ACTIVA') {
                    currentState.data.menuTrad = currentState.data.menuTrad || {};
                    const currentCards = currentState.data.menuTrad.cards || [];

                    // Evitar duplicar el mismo código en la misma sesión
                    if (currentCards.some(c => c.codigo.toUpperCase() === card.codigo.toUpperCase())) {
                        await sendMessage(from, `⚠️ La tarjeta regalo *${card.codigo}* ya ha sido añadida a esta reserva.`);
                        break;
                    }

                    currentCards.push(card);
                    currentState.data.menuTrad.cards = currentCards;
                    currentState.data.menuTrad.card = card; // Para compatibilidad
                    currentState.data.menuTrad.tarjeta = currentCards.map(c => c.codigo).join(', ');
                    currentState.data.menuTrad.comensales = currentCards.length * 2; // Cada tarjeta cuenta como 2 comensales

                    const expiry = card.fecha_caducidad || 'N/A';
                    const successNotice = getTranslation(lang, 'menuTradCardVerified')
                        .replace('{code}', card.codigo)
                        .replace('{expiry}', expiry);
                    await sendMessage(from, successNotice);

                    // Ofrecer opciones interactiva: ¿Qué gestión deseas realizar? (Reservar / Ver fecha caducidad)
                    currentState.step = 'menu_trad_select_gestion';
                    userStates.set(from, currentState);

                    let gestionPrompt = '';
                    let btnResTitle = '';
                    let btnCadTitle = '';

                    if (lang === 'eu') {
                        gestionPrompt = `💳 *Zer kudeaketa egin nahi duzu?*`;
                        btnResTitle = `📅 Erreserbatu`;
                        btnCadTitle = `⏳ Iraungipena ikusi`;
                    } else if (lang === 'en') {
                        gestionPrompt = `💳 *What would you like to do?*`;
                        btnResTitle = `📅 Book`;
                        btnCadTitle = `⏳ Check Expiration`;
                    } else {
                        gestionPrompt = `💳 *¿Qué gestión deseas realizar?*`;
                        btnResTitle = `📅 Reservar`;
                        btnCadTitle = `⏳ Ver fecha caducidad`;
                    }

                    const gestionButtons = [
                        { id: 'btn_card_gestion_reservar', title: btnResTitle.slice(0, 20) },
                        { id: 'btn_card_gestion_caducidad', title: btnCadTitle.slice(0, 20) }
                    ];
                    await sendInteractiveButtons(from, gestionPrompt, gestionButtons);
                } else {
                    let failNotice = '';
                    if (estadoNorm === 'PENDIENTE RESERVA') {
                        if (lang === 'eu') {
                            failNotice = `⚠️ *${card.codigo}* opari-txartelak badu dagoeneko jatetxearen berrespena behar duen erreserba-eskaera bat. Opari-txartelak behin bakarrik erabil daitezke.`;
                        } else if (lang === 'en') {
                            failNotice = `⚠️ Gift card *${card.codigo}* already has a booking request pending restaurant confirmation. Gift cards can only be used once.`;
                        } else {
                            failNotice = `⚠️ La tarjeta regalo *${card.codigo}* ya tiene una solicitud de reserva pendiente de confirmación por el restaurante. Las tarjetas regalo solo pueden utilizarse una sola vez.`;
                        }
                    } else if (estadoNorm === 'RESERVADA') {
                        if (lang === 'eu') {
                            failNotice = `⚠️ *${card.codigo}* opari-txartela dagoeneko erreserba bat egiteko erabili da. Opari-txartelak behin bakarrik erabil daitezke.`;
                        } else if (lang === 'en') {
                            failNotice = `⚠️ Gift card *${card.codigo}* has already been redeemed for a confirmed reservation. Gift cards can only be used once.`;
                        } else {
                            failNotice = `⚠️ La tarjeta regalo *${card.codigo}* ya ha sido utilizada para realizar una reserva confirmada. Las tarjetas regalo solo son utilizables una sola vez.`;
                        }
                    } else if (estadoNorm === 'CONSUMIDA') {
                        if (lang === 'eu') {
                            failNotice = `⚠️ *${card.codigo}* opari-txartela kontsumituta dago dagoeneko eta ezin da berriro erabili.`;
                        } else if (lang === 'en') {
                            failNotice = `⚠️ Gift card *${card.codigo}* has already been consumed and cannot be used again.`;
                        } else {
                            failNotice = `⚠️ La tarjeta regalo *${card.codigo}* ya ha sido consumida y no puede volver a utilizarse.`;
                        }
                    } else {
                        failNotice = getTranslation(lang, 'menuTradCardNotFound').replace('{code}', rawCardCode);
                    }
                    await sendMessage(from, failNotice);
                }
            } else {
                const failNotice = getTranslation(lang, 'menuTradCardNotFound')
                    .replace('{code}', rawCardCode);
                await sendMessage(from, failNotice);
            }
            break;
        }

        case 'menu_trad_more_cards_choice': {
            const maybeCard = await db.getGiftCard(text.trim());
            if (maybeCard) {
                userStates.set(from, { step: 'menu_trad_step1_tarjeta', data: currentState.data });
                await handleUserMessage(from, text, 'text');
            } else if (['continuar', 'no', 'skip', 'jarraitu', 'continue'].includes(text.trim().toLowerCase())) {
                currentState.step = 'menu_trad_step2_nombre';
                userStates.set(from, currentState);
                await sendMessage(from, getTranslation(lang, 'menuTradStep2Nombre'));
            } else {
                const promptBody = getTranslation(lang, 'menuTradMoreCardsPrompt')
                    .replace('{comensales}', currentState.data.menuTrad?.comensales || 2);
                const buttons = [
                    { id: 'btn_mt_add_misma_mesa', title: getTranslation(lang, 'btnMtAddMismaMesa').slice(0, 20) },
                    { id: 'btn_mt_otra_mesa', title: getTranslation(lang, 'btnMtOtraMesa').slice(0, 20) },
                    { id: 'btn_mt_continuar', title: getTranslation(lang, 'btnMtContinuar').slice(0, 20) }
                ];
                await sendInteractiveButtons(from, promptBody, buttons);
            }
            break;
        }

        case 'menu_trad_step2_nombre': {
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            currentState.data.menuTrad.nombre = text;
            currentState.data.menuTrad.dni = null;
            currentState.data.menuTrad.comensales = currentState.data.menuTrad.comensales || 2;
            currentState.step = 'menu_trad_step2b2_email';
            userStates.set(from, currentState);

            const promptBody = getTranslation(lang, 'menuTradStep2b2Email');
            const buttons = [
                { id: 'btn_skip_email', title: getTranslation(lang, 'btnOmitirEmail').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, promptBody, buttons);
            break;
        }

        case 'menu_trad_step2b2_email': {
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            const cleanEmail = text.trim();
            if (['omitir', 'utzi', 'skip', 'no', 'btn_skip_email'].includes(cleanEmail.toLowerCase())) {
                currentState.data.menuTrad.email = 'N/A';
                currentState.step = 'menu_trad_step2c_nac';
                userStates.set(from, currentState);
                await sendNationalityList(from, lang);
            } else if (!isValidEmail(cleanEmail)) {
                // Email inválido: avisar y pedir de nuevo sin avanzar de paso
                const errMsg = getInvalidEmailMsg(lang);
                const buttons = [
                    { id: 'btn_skip_email', title: getTranslation(lang, 'btnOmitirEmail').slice(0, 20) }
                ];
                await sendMessage(from, errMsg);
                await sendInteractiveButtons(from, getTranslation(lang, 'menuTradStep2b2Email'), buttons);
            } else {
                currentState.data.menuTrad.email = cleanEmail.toLowerCase();
                currentState.step = 'menu_trad_step2c_nac';
                userStates.set(from, currentState);
                await sendNationalityList(from, lang);
            }
            break;
        }

        case 'menu_trad_step2c_nac': {
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            let nac = text.trim();
            if (['omitir', 'utzi', 'skip', 'otro', 'nac_otro'].includes(nac.toLowerCase())) {
                nac = lang === 'eu' ? 'Beste bat / Sin especificar' : (lang === 'en' ? 'Other / Unspecified' : 'Otro / Sin especificar');
            }
            currentState.data.menuTrad.nacionalidad = nac;
            currentState.step = 'menu_trad_step3_tipo';
            userStates.set(from, currentState);

            const promptBody = getTranslation(lang, 'menuTradStep3Tipo');
            const buttons = [
                { id: 'menu_trad_tipo_comida', title: getTranslation(lang, 'btnComida').slice(0, 20) },
                { id: 'menu_trad_tipo_cena', title: getTranslation(lang, 'btnCena').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, promptBody, buttons);
            break;
        }

        case 'menu_trad_step3_tipo': {
            const lowerText = text.trim().toLowerCase();
            if (lowerText.includes('comida') || lowerText.includes('bazkari') || lowerText.includes('lunch')) {
                await handleButtonResponse(from, 'menu_trad_tipo_comida');
            } else {
                await handleButtonResponse(from, 'menu_trad_tipo_cena');
            }
            break;
        }

        case 'menu_trad_step4_hora': {
            const timeClean = text.trim().replace('.', ':');
            await handleMenuTradSlotSelection(from, 'mt_slot_' + timeClean.replace(':', ''), lang);
            break;
        }

        case 'menu_trad_step5_cena': {
            const lowerText = text.trim().toLowerCase();
            if (lowerText.includes('viernes') || lowerText.includes('ostirala') || lowerText.includes('friday')) {
                await handleButtonResponse(from, 'mt_cena_viernes');
            } else {
                await handleButtonResponse(from, 'mt_cena_sabado');
            }
            break;
        }

        case 'menu_trad_step5_dia1':
        case 'menu_trad_step5_dia2':
        case 'menu_trad_step5_dia3': {
            const cleanDay = text.trim();
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            if (currentState.step === 'menu_trad_step5_dia1') {
                currentState.data.menuTrad.day1 = cleanDay;
                currentState.step = 'menu_trad_step5_dia2';
                userStates.set(from, currentState);
                const bodyText = getTranslation(lang, 'menuTradStep5Dia2').replace('{day1}', cleanDay);
                const buttonText = getTranslation(lang, 'menuButtonText');
                const rows = getDaysListRows(lang).map(r => ({ ...r, id: 'mt_day2_' + r.id }));
                await sendInteractiveList(from, bodyText, buttonText, [{ title: "Día 2 de preferencia", rows }]);
            } else if (currentState.step === 'menu_trad_step5_dia2') {
                currentState.data.menuTrad.day2 = cleanDay;
                currentState.step = 'menu_trad_step5_dia3';
                userStates.set(from, currentState);
                const d1 = currentState.data.menuTrad.day1;
                const bodyText = getTranslation(lang, 'menuTradStep5Dia3').replace('{day1}', d1).replace('{day2}', cleanDay);
                const buttonText = getTranslation(lang, 'menuButtonText');
                const rows = getDaysListRows(lang).map(r => ({ ...r, id: 'mt_day3_' + r.id }));
                await sendInteractiveList(from, bodyText, buttonText, [{ title: "Día 3 de preferencia", rows }]);
            } else {
                currentState.data.menuTrad.day3 = cleanDay;
                const d1 = currentState.data.menuTrad.day1;
                const d2 = currentState.data.menuTrad.day2;
                currentState.data.menuTrad.dias = `${d1}, ${d2}, ${cleanDay}`;
                currentState.step = 'menu_trad_step6_alergias';
                currentState.data.menuTrad.selectedAllergies = [];
                userStates.set(from, currentState);
                await sendAllergiesList(from, lang, 'menuTradStep6Alergias', []);
            }
            break;
        }

        case 'menu_trad_step6_alergias': {
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            const cleanText = text.trim();
            // Si el texto viene de 'alg_otro' (texto libre de alergia personalizada),
            // lo guardamos y continuamos. En caso contrario, re-mostramos la lista.
            const pendingOtro = currentState.data.menuTrad._pendingAlgOtro;
            if (pendingOtro) {
                delete currentState.data.menuTrad._pendingAlgOtro;
                const selectedAllergies = currentState.data.menuTrad.selectedAllergies || [];
                if (cleanText && !['no', 'ninguna', 'none', '0', 'nada'].includes(cleanText.toLowerCase())) {
                    selectedAllergies.push(cleanText);
                }
                currentState.data.menuTrad.selectedAllergies = selectedAllergies;
                userStates.set(from, currentState);
                await sendAllergiesList(from, lang, 'menuTradStep6Alergias', selectedAllergies);
            } else {
                // Texto no esperado: volver a mostrar la lista desplegable
                currentState.data.menuTrad.selectedAllergies = currentState.data.menuTrad.selectedAllergies || [];
                userStates.set(from, currentState);
                await sendAllergiesList(from, lang, 'menuTradStep6Alergias', currentState.data.menuTrad.selectedAllergies);
            }
            break;
        }

        case 'menu_trad_step7_idioma': {
            if (['omitir', 'utzi', 'skip', 'no', 'form_lang_skip'].includes(cleanText.toLowerCase())) {
                await handleButtonResponse(from, 'form_lang_skip');
                break;
            }
            let selLang = 'es';
            if (cleanText.includes('eusk') || cleanText.includes('basq') || cleanText === 'eu') selLang = 'eu';
            else if (cleanText.includes('eng') || cleanText.includes('ingl') || cleanText === 'en') selLang = 'en';
            else if (cleanText.includes('fran') || cleanText.includes('fren') || cleanText === 'fr') selLang = 'fr';
            else if (cleanText.includes('deut') || cleanText.includes('germ') || cleanText.includes('aleman') || cleanText === 'de') selLang = 'de';
            else if (cleanText.includes('ital') || cleanText === 'it') selLang = 'it';
            else if (cleanText.includes('port') || cleanText === 'pt') selLang = 'pt';
            else if (cleanText.includes('neder') || cleanText.includes('dutc') || cleanText === 'nl') selLang = 'nl';
            else if (cleanText.includes('cat') || cleanText === 'ca') selLang = 'ca';
            else if (cleanText.includes('gal') || cleanText === 'gl') selLang = 'gl';
            else if (cleanText.includes('rus') || cleanText === 'ru') selLang = 'ru';
            else if (cleanText.includes('chin') || cleanText === 'zh') selLang = 'zh';
            else if (cleanText.includes('japo') || cleanText === 'ja') selLang = 'ja';
            else if (cleanText.includes('arab') || cleanText === 'ar') selLang = 'ar';
            await handleButtonResponse(from, 'form_lang_' + selLang);
            break;
        }

function formatModificationDetail(nombreCliente, telefonoReserva, from, reservaActual, label, value, lang) {
    if (lang === 'eu') {
        return `👤 *Bezeroaren Izena:* ${nombreCliente || 'Ez dago berariaz zehaztuta'}\n` +
               `📞 *Erreserbaren Telefonoa:* ${telefonoReserva}\n` +
               `📱 *Igorlearen WhatsApp-a:* ${from}\n` +
               `📄 *Egungo Erreserba:* ${reservaActual}\n` +
               `✏️ *Aldaketa (${label}):* ${value}`;
    } else if (lang === 'en') {
        return `👤 *Customer Name:* ${nombreCliente || 'Not specified'}\n` +
               `📞 *Reservation Phone:* ${telefonoReserva}\n` +
               `📱 *Sender WhatsApp:* ${from}\n` +
               `📄 *Current Reservation:* ${reservaActual}\n` +
               `✏️ *Modification (${label}):* ${value}`;
    } else if (lang === 'fr') {
        return `👤 *Nom du Client:* ${nombreCliente || 'Non spécifié'}\n` +
               `📞 *Téléphone Réservation:* ${telefonoReserva}\n` +
               `📱 *WhatsApp Expéditeur:* ${from}\n` +
               `📄 *Réservation Actuelle:* ${reservaActual}\n` +
               `✏️ *Modification (${label}):* ${value}`;
    } else {
        return `👤 *Nombre Cliente:* ${nombreCliente || 'No especificado explícitamente'}\n` +
               `📞 *Teléfono Reserva:* ${telefonoReserva}\n` +
               `📱 *WhatsApp Remitente:* ${from}\n` +
               `📄 *Reserva Actual:* ${reservaActual}\n` +
               `✏️ *Modificación (${label}):* ${value}`;
    }
}

function getHoursUntilService(fechaStr, horaStr) {
    if (!fechaStr || typeof fechaStr !== 'string') return 999;
    const parts = fechaStr.trim().split('/');
    if (parts.length !== 3) return 999;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);

    let hours = 13;
    let mins = 0;
    if (horaStr && typeof horaStr === 'string') {
        const timeParts = horaStr.trim().split(':');
        if (timeParts.length >= 2) {
            hours = parseInt(timeParts[0], 10) || 13;
            mins = parseInt(timeParts[1], 10) || 0;
        }
    }

    const serviceDate = new Date(year, month, day, hours, mins);
    const now = new Date();
    const diffMs = serviceDate.getTime() - now.getTime();
    return diffMs / (1000 * 60 * 60);
}

function formatCancellationDetail(reservaFound, queryText, from, lang) {
    const hoursLeft = getHoursUntilService(reservaFound.fecha, reservaFound.hora);
    const isLessThan24h = hoursLeft < 24;
    const comensales = parseInt(reservaFound.comensales, 10) || 1;
    const totalFee = comensales * 45;
    const hoursFormatted = Math.max(0, Math.floor(hoursLeft));

    let noteText = '';

    if (lang === 'eu') {
        if (isLessThan24h) {
            noteText = `🚨 *KONTUZ - 24H BAINO GUTXIAGOKO EZEZTAPEN KARGUA!*\n` +
                       `Zerbitzurako 24 ordu baino gutxiago falta dira (${hoursFormatted}h). Jatetxearen politikaren arabera, ezeztapen honek *45 €-ko kargua du mahaikide bakoitzeko* (Guztira: ${comensales} × 45 € = *${totalFee} €*). Ezeztapenak harrerako taldearen eskuzko berrespena behar du.`;
        } else {
            noteText = `✅ *KARGU GABEKO EZEZTAPENA (24H BAINO GEHIAGOKO ALDEZ AURRETIK)*\n` +
                       `Ezeztapena 24 ordu baino gehiagoko aldez aurretik eskatu da. Ez da inolako kargurik ezarriko. Jatetxeko arduradunen berrespena behar du.`;
        }
        return `🆔 *Erreserba Kodea:* ${reservaFound.id}\n` +
               `👤 *Bezeroaren Izena:* ${reservaFound.nombre}\n` +
               `📞 *Erreserbaren Telefonoa:* ${reservaFound.telefono}\n` +
               `📅 *Data eta Ordua:* ${reservaFound.fecha || 'N/A'} ${reservaFound.hora || ''}\n` +
               `👥 *Mahaikideak:* ${reservaFound.comensales}\n` +
               `📱 *Igorlearen WhatsApp-a:* ${from}\n` +
               `📄 *Sartutako Datuak:* ${queryText}\n` +
               `❌ *Eskaera:* ERRESERBA EZEZTATZEA\n` +
               `${noteText}`;
    } else if (lang === 'en') {
        if (isLessThan24h) {
            noteText = `🚨 *ATTENTION - CANCELLATION FEE APPLIES (LESS THAN 24H)!*\n` +
                       `There are less than 24 hours remaining until service (${hoursFormatted}h). According to restaurant policy, this cancellation incurs a fee of *€45 per guest* (Total: ${comensales} × €45 = *€${totalFee}*). Requires manual confirmation from management.`;
        } else {
            noteText = `✅ *FREE CANCELLATION (MORE THAN 24H NOTICE)*\n` +
                       `This cancellation is requested with more than 24 hours notice. No fee per guest will be charged. Requires manual confirmation from restaurant management.`;
        }
        return `🆔 *Reservation Code:* ${reservaFound.id}\n` +
               `👤 *Customer Name:* ${reservaFound.nombre}\n` +
               `📞 *Reservation Phone:* ${reservaFound.telefono}\n` +
               `📅 *Date and Time:* ${reservaFound.fecha || 'N/A'} ${reservaFound.hora || ''}\n` +
               `👥 *Guests:* ${reservaFound.comensales}\n` +
               `📱 *Sender WhatsApp:* ${from}\n` +
               `📄 *Input Data:* ${queryText}\n` +
               `❌ *Request:* RESERVATION CANCELLATION\n` +
               `${noteText}`;
    } else if (lang === 'fr') {
        if (isLessThan24h) {
            noteText = `🚨 *ATTENTION - FRAIS D'ANNULATION EN MOINS DE 24H !*\n` +
                       `Il reste moins de 24 heures avant le service (${hoursFormatted}h). Selon la politique du restaurant, cette annulation entraîne des frais de *45 € par couvert* (Total : ${comensales} × 45 € = *${totalFee} €*). Nécessite une confirmation manuelle de l'équipe.`;
        } else {
            noteText = `✅ *ANNULATION SANS FRAIS (PLUS DE 24H À L'AVANCE)*\n` +
                       `Demande faite plus de 24h à l'avance. Aucun frais par couvert ne sera appliqué. Nécessite une confirmation par la direction.`;
        }
        return `🆔 *Code Réservation:* ${reservaFound.id}\n` +
               `👤 *Nom du Client:* ${reservaFound.nombre}\n` +
               `📞 *Téléphone Réservation:* ${reservaFound.telefono}\n` +
               `📅 *Date et Heure:* ${reservaFound.fecha || 'N/A'} ${reservaFound.hora || ''}\n` +
               `👥 *Couverts:* ${reservaFound.comensales}\n` +
               `📱 *WhatsApp Expéditeur:* ${from}\n` +
               `📄 *Données Saisies:* ${queryText}\n` +
               `❌ *Demande:* ANNULATION DE RÉSERVATION\n` +
               `${noteText}`;
    } else {
        if (isLessThan24h) {
            noteText = `🚨 *¡ATENCIÓN - CARGO POR CANCELACIÓN EN MENOS DE 24H!*\n` +
                       `Faltan menos de 24 horas para el día del servicio (${hoursFormatted}h). Según la política del restaurante, esta cancelación conlleva un cargo de *45 € por comensal* (Total: ${comensales} × 45 € = *${totalFee} €*). La cancelación requiere confirmación manual por parte del equipo de recepción.`;
        } else {
            noteText = `✅ *CANCELACIÓN SIN CARGO (CON MÁS DE 24H DE ANTELACIÓN)*\n` +
                       `La cancelación se solicita con más de 24 horas de antelación respecto al día del servicio. No se aplicará ningún cargo por comensal. Requiere confirmación por parte de los responsables del restaurante.`;
        }
        return `🆔 *Código Reserva:* ${reservaFound.id}\n` +
               `👤 *Nombre Cliente:* ${reservaFound.nombre}\n` +
               `📞 *Teléfono Reserva:* ${reservaFound.telefono}\n` +
               `📅 *Fecha y Hora:* ${reservaFound.fecha || 'N/A'} ${reservaFound.hora || ''}\n` +
               `👥 *Comensales:* ${reservaFound.comensales}\n` +
               `📱 *WhatsApp Remitente:* ${from}\n` +
               `📄 *Datos Ingresados:* ${queryText}\n` +
               `❌ *Solicitud:* CANCELACIÓN DE RESERVA\n` +
               `${noteText}`;
    }
}

function analyzeVerificationInput(text) {
    const clean = (text || '').trim();
    const phoneRegex = /(?:\+?34\s*)?(?:[679]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}|\d{9,12})/g;
    const phoneMatches = clean.match(phoneRegex);

    let phone = null;
    let name = null;

    if (phoneMatches && phoneMatches.length > 0) {
        phone = phoneMatches[0].replace(/\D/g, '');
        const remaining = clean.replace(phoneMatches[0], '').replace(/[-–,:]/g, ' ').replace(/\s+/g, ' ').trim();
        if (remaining.length >= 2) {
            name = remaining;
        }
    } else {
        const cleanDigits = clean.replace(/\D/g, '');
        if (cleanDigits.length >= 7 && cleanDigits.length <= 12 && /^\+?[\d\s.-]+$/.test(clean)) {
            phone = cleanDigits;
        } else if (clean.length >= 2) {
            name = clean;
        }
    }

    return { phone, name };
}

async function executeReservationSearchForMod(from, lang, phone, name, currentState) {
    const searchResult = db.findReservationByNameAndPhone(phone, name);

    if (!searchResult || !searchResult.reservation) {
        let notFoundMsg = '';
        if (lang === 'eu') {
            notFoundMsg = `⚠️ *Ez dugu erreserba berretsirik aurkitu "${name}" izenean (${phone} telefonoarekin).*\n\nMesedez, egiaztatu sartutako izena eta telefonoa.`;
        } else if (lang === 'en') {
            notFoundMsg = `⚠️ *We could not locate any confirmed reservation for "${name}" (Phone: ${phone}).*\n\nPlease check the provided name and phone number.`;
        } else {
            notFoundMsg = `⚠️ *No hemos localizado ninguna reserva confirmada a nombre de "${name}" (Teléfono: ${phone}).*\n\nPor favor, verifica el nombre y teléfono introducidos.`;
        }
        await sendMessage(from, notFoundMsg);
        userStates.set(from, { step: 'modificacion_datos_actuales', data: {} });
        return;
    }

    const reservaFound = searchResult.reservation;

    if (!searchResult.isModifiable) {
        let restrictionMsg = getTranslation(lang, 'resStatusFinished').replace('{id}', reservaFound.id);
        if (searchResult.statusReason === 'PENDIENTE CANCELACION') restrictionMsg = getTranslation(lang, 'resStatusPendingCancel').replace('{id}', reservaFound.id);
        else if (searchResult.statusReason === 'PENDIENTE MODIFICACION') restrictionMsg = getTranslation(lang, 'resStatusPendingMod').replace('{id}', reservaFound.id);
        else if (searchResult.statusReason === 'EN SERVICIO') restrictionMsg = getTranslation(lang, 'resStatusInService').replace('{id}', reservaFound.id);
        else if (searchResult.statusReason === 'CANCELADA') restrictionMsg = getTranslation(lang, 'resStatusCancelled').replace('{id}', reservaFound.id);
        await sendMessage(from, restrictionMsg);
        return;
    }

    currentState.data = currentState.data || {};
    currentState.data.reservationId = reservaFound.id;
    currentState.data.comensalesActuales = reservaFound.comensales;
    currentState.data.nombreCliente = reservaFound.nombre;
    currentState.data.telefonoReserva = reservaFound.telefono;
    currentState.data.reservaActual = `🆔 ${reservaFound.id} (${reservaFound.nombre}, ${reservaFound.telefono})`;

    currentState.step = 'modificacion_tipo';
    userStates.set(from, currentState);

    const modBody = getTranslation(lang, 'modOptionsPrompt');
    const modButtons = [
        { id: 'mod_comensales', title: getTranslation(lang, 'modOptComensales').slice(0, 20) },
        { id: 'mod_dia', title: getTranslation(lang, 'modOptDia').slice(0, 20) },
        { id: 'mod_hora', title: getTranslation(lang, 'modOptHora').slice(0, 20) }
    ];
    await sendInteractiveButtons(from, modBody, modButtons);
}

async function executeReservationSearchForCancel(from, lang, phone, name, currentState) {
    const searchResult = db.findReservationByNameAndPhone(phone, name);

    if (!searchResult || !searchResult.reservation) {
        let notFoundMsg = '';
        if (lang === 'eu') {
            notFoundMsg = `⚠️ *Ez dugu erreserba berretsirik aurkitu "${name}" izenean (${phone} telefonoarekin).*\n\nMesedez, egiaztatu sartutako izena eta telefonoa.`;
        } else if (lang === 'en') {
            notFoundMsg = `⚠️ *We could not locate any confirmed reservation for "${name}" (Phone: ${phone}).*\n\nPlease check the provided name and phone number.`;
        } else {
            notFoundMsg = `⚠️ *No hemos localizado ninguna reserva confirmada a nombre de "${name}" (Teléfono: ${phone}).*\n\nPor favor, verifica el nombre y teléfono introducidos.`;
        }
        await sendMessage(from, notFoundMsg);
        userStates.set(from, { step: 'cancelacion_datos_actuales', data: {} });
        return;
    }

    const reservaFound = searchResult.reservation;

    if (!searchResult.isModifiable) {
        let restrictionMsg = getTranslation(lang, 'resStatusFinished').replace('{id}', reservaFound.id);
        if (searchResult.statusReason === 'PENDIENTE CANCELACION') restrictionMsg = getTranslation(lang, 'resStatusPendingCancel').replace('{id}', reservaFound.id);
        else if (searchResult.statusReason === 'PENDIENTE MODIFICACION') restrictionMsg = getTranslation(lang, 'resStatusPendingMod').replace('{id}', reservaFound.id);
        else if (searchResult.statusReason === 'EN SERVICIO') restrictionMsg = getTranslation(lang, 'resStatusInService').replace('{id}', reservaFound.id);
        else if (searchResult.statusReason === 'CANCELADA') restrictionMsg = getTranslation(lang, 'resStatusCancelled').replace('{id}', reservaFound.id);
        await sendMessage(from, restrictionMsg);
        return;
    }

    const detalleCancelacion = formatCancellationDetail(reservaFound, `${name} (${phone})`, from, lang);

    await requestUserConfirmation(from, lang, {
        tipoAccion: 'SOLICITUD CANCELACIÓN DE RESERVA',
        reservationId: reservaFound.id,
        isCancellation: true,
        detalleMod: detalleCancelacion,
        nombreCliente: reservaFound.nombre,
        telefonoReserva: reservaFound.telefono,
        successMsgKey: 'cancelSuccessMsg'
    });
}

        case 'modificacion_datos_actuales': {
            const { phone, name } = analyzeVerificationInput(text);

            if (name && !phone) {
                const activeRes = db.findActiveReservationsByName(name);
                if (activeRes.length === 0) {
                    let notFoundMsg = '';
                    if (lang === 'eu') {
                        notFoundMsg = `⚠️ *Ez dugu erreserba berretsirik aurkitu "${name}" izenean erreserben taulan.*\n\nMesedez, egiaztatu sartutako izena.`;
                    } else if (lang === 'en') {
                        notFoundMsg = `⚠️ *We could not locate any confirmed reservation for "${name}" in our reservations table.*\n\nPlease check the name provided.`;
                    } else {
                        notFoundMsg = `⚠️ *No hemos localizado ninguna reserva confirmada a nombre de "${name}" en nuestra tabla de reservas.*\n\nPor favor, verifica el nombre introducido.`;
                    }
                    await sendMessage(from, notFoundMsg);
                    break;
                }

                currentState.data.searchName = name;
                currentState.step = 'modificacion_esperar_telefono';
                userStates.set(from, currentState);

                let promptMsg = '';
                if (lang === 'eu') {
                    promptMsg = `📌 Erreserba aurkitu dugu *${name}* izenean. Mesedez, idatzi erreserbaren *telefono zenbakia* zure nortasuna egiaztatzeko:`;
                } else if (lang === 'en') {
                    promptMsg = `📌 We located a reservation under *${name}*. Please enter the *phone number* on the reservation to verify your identity:`;
                } else {
                    promptMsg = `📌 Hemos localizado una reserva a nombre de *${name}*. Por favor, indícanos el *número de teléfono* con el que la realizaste para verificar tu identidad:`;
                }
                await sendMessage(from, promptMsg);
                break;
            }

            if (phone && !name) {
                const activeRes = db.findActiveReservationsByPhone(phone);
                if (activeRes.length === 0) {
                    let notFoundMsg = '';
                    if (lang === 'eu') {
                        notFoundMsg = `⚠️ *Ez dugu erreserba berretsirik aurkitu "${phone}" telefonoarekin erreserben taulan.*\n\nMesedez, egiaztatu sartutako telefonoa.`;
                    } else if (lang === 'en') {
                        notFoundMsg = `⚠️ *We could not locate any confirmed reservation for phone "${phone}" in our reservations table.*\n\nPlease check the phone number provided.`;
                    } else {
                        notFoundMsg = `⚠️ *No hemos localizado ninguna reserva confirmada asociada al teléfono "${phone}" en nuestra tabla de reservas.*\n\nPor favor, verifica el número de teléfono introducido.`;
                    }
                    await sendMessage(from, notFoundMsg);
                    break;
                }

                currentState.data.searchPhone = phone;
                currentState.step = 'modificacion_esperar_nombre';
                userStates.set(from, currentState);

                let promptMsg = '';
                if (lang === 'eu') {
                    promptMsg = `📌 Erreserba aurkitu dugu *${phone}* telefonoarekin. Mesedez, idatzi erreserbaren *Izen-abizen osoak* zure nortasuna egiaztatzeko:`;
                } else if (lang === 'en') {
                    promptMsg = `📌 We located a reservation for *${phone}*. Please enter the *full name* on the reservation to verify your identity:`;
                } else {
                    promptMsg = `📌 Hemos localizado una reserva asociada al teléfono *${phone}*. Por favor, indícanos el *nombre completo* del titular para verificar tu identidad:`;
                }
                await sendMessage(from, promptMsg);
                break;
            }

            if (!phone && !name) {
                let promptMsg = '';
                if (lang === 'eu') {
                    promptMsg = `⚠️ *Mesedez, idatzi erreserbaren Titularraren Izen-abizenak eta Telefonoa:*`;
                } else if (lang === 'en') {
                    promptMsg = `⚠️ *Please enter the Full Name and Phone Number on the reservation:*`;
                } else {
                    promptMsg = `⚠️ *Por favor, indícanos el Nombre completo y Teléfono de la reserva:*`;
                }
                await sendMessage(from, promptMsg);
                break;
            }

            await executeReservationSearchForMod(from, lang, phone, name, currentState);
            break;
        }

        case 'modificacion_esperar_telefono': {
            const phoneDigits = text.trim().replace(/\D/g, '');
            const searchName = currentState.data.searchName;

            if (phoneDigits.length < 7) {
                let promptMsg = '';
                if (lang === 'eu') promptMsg = `⚠️ *Telefono zenbakia ez da baliozkoa.* Mesedez, idatzi telefono zenbaki egokia (adib: *612345678*):`;
                else if (lang === 'en') promptMsg = `⚠️ *Invalid phone number.* Please enter a valid phone number (e.g. *612345678*):`;
                else promptMsg = `⚠️ *El número de teléfono no parece válido.* Por favor, introduce un número correcto (ej: *612345678*):`;
                await sendMessage(from, promptMsg);
                break;
            }

            await executeReservationSearchForMod(from, lang, phoneDigits, searchName, currentState);
            break;
        }

        case 'modificacion_esperar_nombre': {
            const searchName = text.trim();
            const searchPhone = currentState.data.searchPhone;

            if (searchName.length < 2) {
                let promptMsg = '';
                if (lang === 'eu') promptMsg = `⚠️ *Izen-abizenak laburregiak dira.* Mesedez, idatzi izen osoa:`;
                else if (lang === 'en') promptMsg = `⚠️ *Name is too short.* Please enter the full name:`;
                else promptMsg = `⚠️ *El nombre es demasiado corto.* Por favor, introduce el nombre completo:`;
                await sendMessage(from, promptMsg);
                break;
            }

            await executeReservationSearchForMod(from, lang, searchPhone, searchName, currentState);
            break;
        }

        case 'cancelacion_datos_actuales': {
            const { phone, name } = analyzeVerificationInput(text);

            if (name && !phone) {
                const activeRes = db.findActiveReservationsByName(name);
                if (activeRes.length === 0) {
                    let notFoundMsg = '';
                    if (lang === 'eu') {
                        notFoundMsg = `⚠️ *Ez dugu erreserba berretsirik aurkitu "${name}" izenean erreserben taulan.*\n\nMesedez, egiaztatu sartutako izena.`;
                    } else if (lang === 'en') {
                        notFoundMsg = `⚠️ *We could not locate any confirmed reservation for "${name}" in our reservations table.*\n\nPlease check the name provided.`;
                    } else {
                        notFoundMsg = `⚠️ *No hemos localizado ninguna reserva confirmada a nombre de "${name}" en nuestra tabla de reservas.*\n\nPor favor, verifica el nombre introducido.`;
                    }
                    await sendMessage(from, notFoundMsg);
                    break;
                }

                currentState.data.searchName = name;
                currentState.step = 'cancelacion_esperar_telefono';
                userStates.set(from, currentState);

                let promptMsg = '';
                if (lang === 'eu') {
                    promptMsg = `📌 Erreserba aurkitu dugu *${name}* izenean. Mesedez, idatzi ezeztatu nahi duzun erreserbaren *telefono zenbakia* zure nortasuna egiaztatzeko:`;
                } else if (lang === 'en') {
                    promptMsg = `📌 We located a reservation under *${name}*. Please enter the *phone number* of the reservation to verify your identity:`;
                } else {
                    promptMsg = `📌 Hemos localizado una reserva a nombre de *${name}*. Por favor, indícanos el *número de teléfono* con el que realizaste la reserva para verificar tu identidad:`;
                }
                await sendMessage(from, promptMsg);
                break;
            }

            if (phone && !name) {
                const activeRes = db.findActiveReservationsByPhone(phone);
                if (activeRes.length === 0) {
                    let notFoundMsg = '';
                    if (lang === 'eu') {
                        notFoundMsg = `⚠️ *Ez dugu erreserba berretsirik aurkitu "${phone}" telefonoarekin erreserben taulan.*\n\nMesedez, egiaztatu sartutako telefonoa.`;
                    } else if (lang === 'en') {
                        notFoundMsg = `⚠️ *We could not locate any confirmed reservation for phone "${phone}" in our reservations table.*\n\nPlease check the phone number provided.`;
                    } else {
                        notFoundMsg = `⚠️ *No hemos localizado ninguna reserva confirmada asociada al teléfono "${phone}" en nuestra tabla de reservas.*\n\nPor favor, verifica el número de teléfono introducido.`;
                    }
                    await sendMessage(from, notFoundMsg);
                    break;
                }

                currentState.data.searchPhone = phone;
                currentState.step = 'cancelacion_esperar_nombre';
                userStates.set(from, currentState);

                let promptMsg = '';
                if (lang === 'eu') {
                    promptMsg = `📌 Erreserba aurkitu dugu *${phone}* telefonoarekin. Mesedez, idatzi ezeztatu nahi duzun erreserba zeinen izenean dagoen (*Izen-abizen osoak*):`;
                } else if (lang === 'en') {
                    promptMsg = `📌 We located a reservation for *${phone}*. Please provide the *full name* on the reservation to verify your identity:`;
                } else {
                    promptMsg = `📌 Hemos localizado una reserva asociada al teléfono *${phone}*. Por favor, indícanos el *nombre completo* a nombre de quien está la reserva para verificar tu identidad:`;
                }
                await sendMessage(from, promptMsg);
                break;
            }

            if (!phone && !name) {
                let promptMsg = '';
                if (lang === 'eu') {
                    promptMsg = `⚠️ *Mesedez, idatzi ezeztatu nahi duzun erreserbaren Izen-abizenak eta Telefonoa:*`;
                } else if (lang === 'en') {
                    promptMsg = `⚠️ *Please enter the Full Name and Phone Number of the reservation to cancel:*`;
                } else {
                    promptMsg = `⚠️ *Por favor, indícanos el Nombre completo y Teléfono de la reserva que deseas cancelar:*`;
                }
                await sendMessage(from, promptMsg);
                break;
            }

            await executeReservationSearchForCancel(from, lang, phone, name, currentState);
            break;
        }

        case 'cancelacion_esperar_telefono': {
            const phoneDigits = text.trim().replace(/\D/g, '');
            const searchName = currentState.data.searchName;

            if (phoneDigits.length < 7) {
                let promptMsg = '';
                if (lang === 'eu') promptMsg = `⚠️ *Telefono zenbakia ez da baliozkoa.* Mesedez, idatzi telefono zenbaki egokia (adib: *612345678*):`;
                else if (lang === 'en') promptMsg = `⚠️ *Invalid phone number.* Please enter a valid phone number (e.g. *612345678*):`;
                else promptMsg = `⚠️ *El número de teléfono no parece válido.* Por favor, introduce un número correcto (ej: *612345678*):`;
                await sendMessage(from, promptMsg);
                break;
            }

            await executeReservationSearchForCancel(from, lang, phoneDigits, searchName, currentState);
            break;
        }

        case 'cancelacion_esperar_nombre': {
            const searchName = text.trim();
            const searchPhone = currentState.data.searchPhone;

            if (searchName.length < 2) {
                let promptMsg = '';
                if (lang === 'eu') promptMsg = `⚠️ *Izen-abizenak laburregiak dira.* Mesedez, idatzi izen osoa:`;
                else if (lang === 'en') promptMsg = `⚠️ *Name is too short.* Please enter the full name:`;
                else promptMsg = `⚠️ *El nombre es demasiado corto.* Por favor, introduce el nombre completo:`;
                await sendMessage(from, promptMsg);
                break;
            }

            await executeReservationSearchForCancel(from, lang, searchPhone, searchName, currentState);
            break;
        }

        case 'mod_val_comensales': {
            const match = text.match(/\d+/);
            const numDiners = match ? parseInt(match[0], 10) : NaN;
            if (isNaN(numDiners) || numDiners <= 0 || numDiners > 6) {
                await sendMessage(from, getTranslation(lang, 'maxComensalesErrorMsg'));
                return;
            }

            const reservationId = currentState.data.reservationId || null;
            const nombreCliente = currentState.data.nombreCliente || null;
            const telefonoReserva = currentState.data.telefonoReserva || from;
            const reservaActual = currentState.data.reservaActual || 'No especificada';

            const detalleMod = formatModificationDetail(nombreCliente, telefonoReserva, from, reservaActual, 'MAHAIKIDEAK / COMENSALES', `${numDiners} pax`, lang);
            
            await requestUserConfirmation(from, lang, {
                tipoAccion: 'SOLICITUD MODIFICACIÓN DE RESERVA',
                reservationId: reservationId,
                isModification: true,
                detalleMod: detalleMod,
                nombreCliente: nombreCliente,
                telefonoReserva: telefonoReserva,
                successMsgKey: 'modSuccessMsg'
            });
            break;
        }

        case 'mod_val_dia':
        case 'mod_val_hora': {
            const tipoModLabel = currentState.step.replace('mod_val_', '').toUpperCase();
            const reservationId = currentState.data.reservationId || null;
            const nombreCliente = currentState.data.nombreCliente || null;
            const telefonoReserva = currentState.data.telefonoReserva || from;
            const reservaActual = currentState.data.reservaActual || 'No especificada';

            const detalleMod = formatModificationDetail(nombreCliente, telefonoReserva, from, reservaActual, tipoModLabel, text, lang);
            
            await requestUserConfirmation(from, lang, {
                tipoAccion: 'SOLICITUD MODIFICACIÓN DE RESERVA',
                reservationId: reservationId,
                isModification: true,
                detalleMod: detalleMod,
                nombreCliente: nombreCliente,
                telefonoReserva: telefonoReserva,
                successMsgKey: 'modSuccessMsg'
            });
            break;
        }

        case 'cancelacion_datos_actuales': {
            const queryText = text.trim();
            const searchResult = db.findReservationForCancellation(queryText, from);

            if (!searchResult || !searchResult.reservation) {
                const notFoundMsg = getTranslation(lang, 'cancelReservationNotFoundMsg').replace('{query}', queryText);
                await sendMessage(from, notFoundMsg);
                break;
            }

            const reservaFound = searchResult.reservation;

            if (!searchResult.isModifiable) {
                let restrictionMsg = getTranslation(lang, 'resStatusFinished').replace('{id}', reservaFound.id);
                if (searchResult.statusReason === 'PENDIENTE CANCELACION') restrictionMsg = getTranslation(lang, 'resStatusPendingCancel').replace('{id}', reservaFound.id);
                else if (searchResult.statusReason === 'PENDIENTE MODIFICACION') restrictionMsg = getTranslation(lang, 'resStatusPendingMod').replace('{id}', reservaFound.id);
                else if (searchResult.statusReason === 'EN SERVICIO') restrictionMsg = getTranslation(lang, 'resStatusInService').replace('{id}', reservaFound.id);
                else if (searchResult.statusReason === 'CANCELADA') restrictionMsg = getTranslation(lang, 'resStatusCancelled').replace('{id}', reservaFound.id);
                await sendMessage(from, restrictionMsg);
                break;
            }

            if (!searchResult.verified) {
                // Reserva encontrada pero no verificada — mostrar detalles reales de la BD
                userStates.set(from, {
                    step: 'cancelacion_verificar_datos',
                    data: { reservationId: reservaFound.id }
                });
                const verifyPrompt = getTranslation(lang, 'cancelReservationVerifyWithDetailsPrompt')
                    .replace('{id}', reservaFound.id)
                    .replace('{nombre}', reservaFound.nombre || 'N/A')
                    .replace('{fecha}', reservaFound.fecha || 'N/A')
                    .replace('{hora}', reservaFound.hora || 'N/A')
                    .replace('{comensales}', reservaFound.comensales || 'N/A');
                await sendMessage(from, verifyPrompt);
                break;
            }

            const detalleCancelacion = formatCancellationDetail(reservaFound, queryText, from, lang);

            await requestUserConfirmation(from, lang, {
                tipoAccion: 'SOLICITUD CANCELACIÓN DE RESERVA',
                reservationId: reservaFound.id,
                isCancellation: true,
                detalleMod: detalleCancelacion,
                nombreCliente: reservaFound.nombre,
                telefonoReserva: reservaFound.telefono,
                successMsgKey: 'cancelSuccessMsg'
            });
            break;
        }

        case 'cancelacion_verificar_datos': {
            const state = userStates.get(from);
            const resId = state?.data?.reservationId;
            const reservaFound = db.getReservationById(resId);

            if (!reservaFound) {
                const notFoundMsg = getTranslation(lang, 'cancelReservationNotFoundMsg').replace('{query}', text);
                await sendMessage(from, notFoundMsg);
                userStates.set(from, { step: 'cancelacion_datos_actuales', data: {} });
                break;
            }

            if (reservaFound.estado !== 'CONFIRMADA') {
                let restrictionMsg = getTranslation(lang, 'resStatusFinished').replace('{id}', reservaFound.id);
                if (reservaFound.estado === 'PENDIENTE CANCELACION') restrictionMsg = getTranslation(lang, 'resStatusPendingCancel').replace('{id}', reservaFound.id);
                else if (reservaFound.estado === 'PENDIENTE MODIFICACION') restrictionMsg = getTranslation(lang, 'resStatusPendingMod').replace('{id}', reservaFound.id);
                else if (reservaFound.estado === 'EN SERVICIO') restrictionMsg = getTranslation(lang, 'resStatusInService').replace('{id}', reservaFound.id);
                else if (reservaFound.estado === 'CANCELADA') restrictionMsg = getTranslation(lang, 'resStatusCancelled').replace('{id}', reservaFound.id);
                await sendMessage(from, restrictionMsg);
                break;
            }

            const inputNorm = text.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const inputDigits = text.toString().replace(/\D/g, '');

            // Verificar por código de reserva (ID)
            const resIdNorm = (reservaFound.id || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const idMatches = resIdNorm && inputNorm.includes(resIdNorm);

            const resPhoneDigits = (reservaFound.telefono || '').replace(/\D/g, '');
            const resDniNorm = (reservaFound.dni || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const resEmailNorm = (reservaFound.email || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

            const phoneMatches = inputDigits.length >= 7 && (inputDigits.includes(resPhoneDigits) || resPhoneDigits.includes(inputDigits));
            const dniMatches = resDniNorm.length >= 4 && (inputNorm.includes(resDniNorm) || resDniNorm.includes(inputNorm));
            const emailMatches = resEmailNorm.length >= 4 && (inputNorm.includes(resEmailNorm) || resEmailNorm.includes(inputNorm));

            // Verificadores válidos: código de reserva, teléfono, DNI o email
            if (idMatches || phoneMatches || dniMatches || emailMatches) {
                const detalleCancelacion = formatCancellationDetail(reservaFound, text, from, lang);

                await requestUserConfirmation(from, lang, {
                    tipoAccion: 'SOLICITUD CANCELACIÓN DE RESERVA',
                    reservationId: reservaFound.id,
                    isCancellation: true,
                    detalleMod: detalleCancelacion,
                    nombreCliente: reservaFound.nombre,
                    telefonoReserva: reservaFound.telefono,
                    successMsgKey: 'cancelSuccessMsg'
                });
            } else {
                const mismatchMsg = getTranslation(lang, 'cancelReservationMismatchMsg').replace('{id}', reservaFound.id);
                await sendMessage(from, mismatchMsg);
            }
            break;
        }

        case 'cancelacion_waitlist_datos': {
            const queryText = text.trim();
            const entry = db.getWaitlistEntry(queryText) || db.getWaitlistEntry(from);

            if (entry) {
                const cancelledEntry = db.cancelWaitlistEntry(entry.id);
                const successMsg = getTranslation(lang, 'cancelWaitlistSuccessMsg')
                    .replace('{id}', cancelledEntry.id)
                    .replace('{nombre}', cancelledEntry.nombre || 'N/A')
                    .replace('{telefono}', cancelledEntry.telefono || 'N/A')
                    .replace('{dias}', cancelledEntry.dias_preferencia || 'Sin preferencia');

                await sendMessage(from, successMsg);
                await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
                await showLocationOrMainMenu(from);
            } else {
                const notFoundMsg = getTranslation(lang, 'cancelWaitlistNotFoundMsg').replace('{query}', queryText);
                await sendMessage(from, notFoundMsg);
            }
            break;
        }

        case 'menu_tradicion_formulario_reserva':
            await requestUserConfirmation(from, lang, {
                tipoAccion: 'RESERVA MENÚ TRADICIÓN (TARJETA REGALO)',
                detalleMod: text,
                nombreCliente: null,
                telefonoReserva: from,
                successMsgKey: 'menuTradicionSuccessMsg'
            });
            break;

        case 'menu_tradicion_formulario_caducidad': {
            const card = await db.getGiftCard(text);

            if (card) {
                let msg = '';
                if (lang === 'eu') {
                    msg = `🎁 *OPARI-TXARTELAREN EGIAZTAPENA*\n\n` +
                          `✅ *Kodea:* ${card.codigo}\n` +
                          `👤 *Jabea / Emptlea:* ${card.comprador_nombre || 'Zehaztu gabea'}\n` +
                          `📅 *Iraungitze data:* ${card.fecha_caducidad}\n` +
                          `📌 *Egoera:* ${card.estado || 'AKTIBOA'}\n\n` +
                          `💡 *Mahaia erreserbatu nahi duzu?*\n` +
                          `Sartu menuan -> *"5. Tradizio Menua daukat"* -> *"Erreserbatu"*.`;
                } else if (lang === 'en') {
                    msg = `🎁 *GIFT CARD VERIFICATION*\n\n` +
                          `✅ *Code:* ${card.codigo}\n` +
                          `👤 *Holder / Buyer:* ${card.comprador_nombre || 'Not specified'}\n` +
                          `📅 *Expiration Date:* ${card.fecha_caducidad}\n` +
                          `📌 *Status:* ${card.estado || 'ACTIVE'}\n\n` +
                          `💡 *Would you like to book your table?*\n` +
                          `Go to main menu -> *"5. I have Tradition Menu"* -> *"Book Table"*.`;
                } else if (lang === 'fr') {
                    msg = `🎁 *VÉRIFICATION DE CARTE CADEAU*\n\n` +
                          `✅ *Code :* ${card.codigo}\n` +
                          `👤 *Titulaire / Acheteur :* ${card.comprador_nombre || 'Non spécifié'}\n` +
                          `📅 *Date d'expiration :* ${card.fecha_caducidad}\n` +
                          `📌 *Statut :* ${card.estado || 'ACTIF'}\n\n` +
                          `💡 *Souhaitez-vous réserver votre table ?*\n` +
                          `Allez au menu principal -> *"5. J'ai le Menu Tradition"* -> *"Réserver"*.`;
                } else {
                    msg = `🎁 *VERIFICACIÓN DE TARJETA REGALO*\n\n` +
                          `✅ *Código:* ${card.codigo}\n` +
                          `👤 *Titular / Comprador:* ${card.comprador_nombre || 'No especificado'}\n` +
                          `📅 *Fecha de Caducidad:* ${card.fecha_caducidad}\n` +
                          `📌 *Estado:* ${card.estado || 'ACTIVA'}\n\n` +
                          `💡 *¿Deseas reservar tu mesa con esta tarjeta?*\n` +
                          `Entra en el menú principal -> *"5. Tengo Menú Tradición"* -> *"Reservar"*.`;
                }

                await sendMessage(from, msg);
                await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
                await showLocationOrMainMenu(from);
            } else {
                let notFoundMsg = '';
                if (lang === 'eu') {
                    notFoundMsg = `⚠️ *Opari-txartela ez da sisteman aurkitu.* Ez dugu *"${text}"* kodearekin opari-txartel aktiborik aurkitu.\n\nGure taldeak zure kontsulta eskuz aztertuko du eta ahalik eta azkienez erantzungo dizu.`;
                } else if (lang === 'en') {
                    notFoundMsg = `⚠️ *Gift card not found in system.* We could not locate an active card with code *"${text}"*.\n\nOur team will review your inquiry manually and reply as soon as possible.`;
                } else {
                    notFoundMsg = `⚠️ *Tarjeta regalo no encontrada en el sistema.* No hemos localizado ninguna tarjeta activa con el código *"${text}"*.\n\nNuestro equipo revisará su consulta manualmente y le responderá a la menor brevedad posible.`;
                }

                await sendMessage(from, notFoundMsg);
                await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
                await showLocationOrMainMenu(from);

                try {
                    await sendInternalStaffAlertInSpanish(
                        'CONSULTA CADUCIDAD TARJETA REGALO (NO ENCONTRADA)',
                        from,
                        `📄 *Código/Texto ingresado:* ${text}`,
                        null,
                        from
                    );
                } catch (err) {
                    console.error("Error enviando alerta recepción:", err.message);
                }
            }
            break;
        }

        default:
            await sendLanguageMenu(from, 1);
            break;
    }
}

module.exports = {
    processMessage,
    handleUserMessage,
    sendLanguageMenu,
    sendLocationMenu,
    sendMainMenu
};
