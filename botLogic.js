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
        const welcomeImageUrl = process.env.WELCOME_IMAGE_URL || 'https://raw.githubusercontent.com/AnderUrienGoierri/casa-julian-whatsapp/main/documentacion/casa_julian_erretegia.jpg';
        try {
            await sendImageMessage(from, welcomeImageUrl, 'Asador Casa Julián de Tolosa');
        } catch (e) {
            console.error("⚠️ Error enviando imagen de bienvenida por WhatsApp:", e.message);
        }

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
                { id: "opt_regalar_menu_tradicion", title: getTranslation(lang, 'opt5Title').slice(0, 24), description: getTranslation(lang, 'opt5Desc').slice(0, 72) },
                { id: "opt_otras_cuestiones", title: getTranslation(lang, 'opt6Title').slice(0, 24), description: getTranslation(lang, 'opt6Desc').slice(0, 72) },
                { id: "opt_cambiar_idioma", title: getTranslation(lang, 'optLangTitle').slice(0, 24), description: getTranslation(lang, 'optLangDesc').slice(0, 72) }
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
    await sendLocationMenu(from);
}

/**
 * Responde a selecciones de listas interactivas.
 */
async function handleListResponse(from, listId) {
    const lang = userLanguages.get(from) || 'es';

    switch (listId) {
        case 'opt_quiero_reservar':
            userStates.set(from, { step: 'reserva_tipo', data: {} });
            const resButtons = [
                { id: 'btn_solicitar_reserva', title: getTranslation(lang, 'btnSolicitarReserva').slice(0, 20) },
                { id: 'btn_add_lista_espera', title: getTranslation(lang, 'btnAddListaEspera').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, getTranslation(lang, 'reservaIntro'), resButtons);
            break;

        case 'opt_modificacion':
            userStates.set(from, { step: 'modificacion_datos_actuales', data: {} });
            await sendMessage(from, getTranslation(lang, 'modCancelDataPrompt'));
            break;

        case 'opt_cancelacion':
            userStates.set(from, { step: 'cancelacion_datos_actuales', data: {} });
            await sendMessage(from, getTranslation(lang, 'modCancelDataPrompt'));
            break;

        case 'opt_tengo_menu_tradicion': {
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

        case 'opt_regalar_menu_tradicion':
            await handleRegalarMenuTradicion(from, lang);
            break;

        case 'opt_otras_cuestiones':
            await sendFaqMenu(from, lang);
            break;

        default:
            if (listId.startsWith('wl_slot_')) {
                await handleWaitlistSlotSelection(from, listId, lang);
            } else if (listId.startsWith('wl_day1_')) {
                await handleWaitlistDaySelection(from, listId, 1, lang);
            } else if (listId.startsWith('wl_day2_')) {
                await handleWaitlistDaySelection(from, listId, 2, lang);
            } else if (listId.startsWith('wl_day3_')) {
                await handleWaitlistDaySelection(from, listId, 3, lang);
            } else if (listId.startsWith('mt_slot_')) {
                await handleMenuTradSlotSelection(from, listId, lang);
            } else if (listId.startsWith('mt_day1_')) {
                await handleMenuTradDaySelection(from, listId, 1, lang);
            } else if (listId.startsWith('mt_day2_')) {
                await handleMenuTradDaySelection(from, listId, 2, lang);
            } else if (listId.startsWith('mt_day3_')) {
                await handleMenuTradDaySelection(from, listId, 3, lang);
            } else if (listId.startsWith('faq_')) {
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
            await sendLocationMenu(from);
            break;

        case 'loc_pais_vasco':
            await sendMainMenu(from);
            break;

        case 'btn_solicitar_reserva':
            await sendMessage(from, getTranslation(lang, 'webReservaLinkMsg'));
            await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
            await sendLocationMenu(from);
            break;

        case 'btn_add_lista_espera': {
            userStates.set(from, { step: 'espera_step0_init', data: { waitlist: {} } });
            const promptBody = getTranslation(lang, 'waitlistInitPrompt');
            const buttons = [
                { id: 'waitlist_init_si', title: getTranslation(lang, 'waitlistMenuTradicionBtnSi').slice(0, 20) },
                { id: 'waitlist_init_no', title: getTranslation(lang, 'waitlistMenuTradicionBtnNo').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, promptBody, buttons);
            break;
        }

        case 'menu_tradicion_regalar':
            await handleRegalarMenuTradicion(from, lang);
            break;

        case 'waitlist_init_si':
        case 'waitlist_menu_si':
        case 'menu_tradicion_reservar':
            userStates.set(from, { step: 'menu_trad_step1_tarjeta', data: { menuTrad: { comensales: 2 } } });
            await sendMessage(from, getTranslation(lang, 'menuTradStep1Tarjeta'));
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

            await sendMessage(from, getTranslation(lang, 'waitlistStep5Ninos'));
            break;
        }

        case 'form_lang_es':
        case 'form_lang_eu':
        case 'form_lang_en': {
            const selectedLang = buttonId.replace('form_lang_', '');
            userLanguages.set(from, selectedLang);
            const currentState = userStates.get(from);

            if (currentState && currentState.step === 'espera_step7_idioma') {
                const wl = currentState.data.waitlist || {};
                const waitlistRecord = db.addToWaitlist({
                    nombre: wl.nombre || 'No especificado',
                    telefono: from,
                    dni: wl.dni || 'N/A',
                    email: 'N/A',
                    nacionalidad: wl.nacionalidad || 'España',
                    dias_preferencia: wl.dias || 'Sin preferencia',
                    hora: wl.horario || 'No especificado',
                    comensales: parseInt(wl.comensales, 10) || 1,
                    ninos: wl.ninos || '0',
                    alergias: wl.alergias || 'Ninguna',
                    estado: 'Pendiente confirmar',
                    idioma: selectedLang
                });

                const detalleEspera = `🆔 *ID Solicitud:* ${waitlistRecord.id}\n` +
                                      `👤 *Nombre:* ${wl.nombre || 'No especificado'}\n` +
                                      `🪪 *DNI/Pasaporte:* ${wl.dni || 'N/A'}\n` +
                                      `🌐 *Nacionalidad:* ${wl.nacionalidad || 'España'}\n` +
                                      `👥 *Comensales:* ${wl.comensales || '1'}\n` +
                                      `🕐 *Preferencia horaria:* ${wl.horario || 'No especificado'}\n` +
                                      `📅 *Disponibilidad días:* ${wl.dias || 'Sin preferencia'}\n` +
                                      `👶 *Niños:* ${wl.ninos || '0'}\n` +
                                      `⚠️ *Alergias/Restricciones:* ${wl.alergias || 'Ninguna'}\n` +
                                      `🗣️ *Idioma contacto:* ${selectedLang.toUpperCase()}\n` +
                                      `📌 *Estado:* Pendiente confirmar\n` +
                                      `🎁 *Menú Tradición:* No\n` +
                                      `📱 *WhatsApp Remitente:* ${from}\n` +
                                      `📋 *Solicitud:* INSCRIPCIÓN EN LISTA DE ESPERA`;

                await requestUserConfirmation(from, selectedLang, {
                    tipoAccion: 'SOLICITUD LISTA DE ESPERA',
                    detalleMod: detalleEspera,
                    nombreCliente: wl.nombre || 'Cliente WhatsApp',
                    telefonoReserva: from,
                    diasPreferencia: wl.dias || 'Sin preferencia',
                    successMsgKey: 'waitlistSuccessMsg'
                });
            } else if (currentState && currentState.step === 'menu_trad_step7_idioma') {
                const mt = currentState.data.menuTrad || {};
                const detalleMenuTrad = `👤 *Nombre:* ${mt.nombre || 'No especificado'}\n` +
                                        `🪪 *DNI/Pasaporte:* ${mt.dni || 'N/A'}\n` +
                                        `🌐 *Nacionalidad:* ${mt.nacionalidad || 'España'}\n` +
                                        `🎁 *Nº Tarjeta Regalo:* ${mt.tarjeta || 'No especificado'}\n` +
                                        `🍽️ *Servicio:* ${mt.tipoServicio || 'Comida/Cena'}\n` +
                                        `🕐 *Hora seleccionada:* ${mt.horario || 'No especificada'}\n` +
                                        `📅 *Disponibilidad días:* ${mt.dias || 'No especificado'}\n` +
                                        `⚠️ *Alergias/Restricciones:* ${mt.alergias || 'Ninguna'}\n` +
                                        `🗣️ *Idioma contacto:* ${selectedLang.toUpperCase()}\n` +
                                        `📱 *WhatsApp Remitente:* ${from}\n` +
                                        `📋 *Solicitud:* RESERVA MENÚ TRADICIÓN (TARJETA REGALO)`;

                await requestUserConfirmation(from, selectedLang, {
                    tipoAccion: 'RESERVA MENÚ TRADICIÓN (TARJETA REGALO)',
                    detalleMod: detalleMenuTrad,
                    nombreCliente: mt.nombre || 'Cliente WhatsApp',
                    telefonoReserva: from,
                    tarjetaCodigo: mt.tarjeta,
                    diasPreferencia: mt.dias || 'Sin preferencia',
                    horario: mt.horario || '',
                    idioma: selectedLang,
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
            userStates.set(from, state);

            await sendMessage(from, getTranslation(lang, 'menuTradStep6Alergias'));
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
                // 1. Enviar primero al cliente un mensaje con el resumen detallado de su solicitud
                const summaryHeader = getTranslation(lang, 'requestSummaryHeader');
                const clientSummaryMsg = `${summaryHeader}\n\n${pending.detalleMod}`;
                await sendMessage(from, clientSummaryMsg);

                // 2. Responder al cliente con los mensajes de revisión y agradecimiento del diagrama
                await sendMessage(from, getTranslation(lang, pending.successMsgKey || 'modSuccessMsg'));
                await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
                
                // 3. Re-desplegar automáticamente la selección de ubicación de restaurante
                await sendLocationMenu(from);

                // 4. Enviar la alerta a recepción por WhatsApp y Email con AWAIT garantizado y registrar en BD
                try {
                    if (pending.tarjetaCodigo) {
                        await db.updateGiftCardStatus(pending.tarjetaCodigo, 'PENDIENTE RESERVA');
                    }
                    if (pending.tipoAccion && pending.tipoAccion.includes('RESERVA MENÚ TRADICIÓN')) {
                        const mt = state?.data?.menuTrad || {};
                        db.createReservation({
                            nombre: pending.nombreCliente,
                            telefono: pending.telefonoReserva,
                            dni: mt.dni || 'N/A',
                            email: 'N/A',
                            nacionalidad: mt.nacionalidad || 'España',
                            fecha: '', // Fecha pendiente de asignación por recepción
                            hora: pending.horario || '',
                            comensales: 2,
                            estado: 'PENDIENTE CONFIRMACIÓN',
                            dias_preferencia: pending.diasPreferencia || 'Sin preferencia',
                            tipo_reserva: 'tarjeta_regalo',
                            idioma: lang
                        });
                    }
                    await sendInternalStaffAlertInSpanish(
                        pending.tipoAccion,
                        from,
                        pending.detalleMod,
                        pending.nombreCliente,
                        pending.telefonoReserva
                    );
                } catch (err) {
                    console.error("⚠️ Error alerta recepción:", err.message);
                }
            } else {
                await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
                await sendLocationMenu(from);
            }
            break;
        }

        case 'confirm_no': {
            await sendMessage(from, getTranslation(lang, 'confirmCancelledMsg'));
            await sendLocationMenu(from);
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
        state.step = 'espera_step4_dia1';
        userStates.set(from, state);

        const bodyText = getTranslation(lang, 'waitlistStep4Dia1').replace('{nextAvailable}', nextAvailMsg);
        const buttonText = getTranslation(lang, 'menuButtonText');
        const rows = getDaysListRows(lang, [], true).map(r => ({ ...r, id: 'wl_day1_' + r.id }));

        await sendInteractiveList(from, bodyText, buttonText, [{ title: "Día 1 de preferencia", rows }]);
    }
}

/**
 * Maneja la selección interactiva de días (Día 1, 2, 3) en Lista de Espera.
 */
async function handleWaitlistDaySelection(from, listId, stepNum, lang) {
    const state = userStates.get(from) || { data: {} };
    state.data.waitlist = state.data.waitlist || {};

    if (listId === 'wl_day1_skip') {
        state.data.waitlist.dias = 'Sin preferencia';
        state.step = 'espera_step5_ninos';
        userStates.set(from, state);
        await sendMessage(from, getTranslation(lang, 'waitlistStep5Ninos'));
        return;
    }

    const rawDayKey = listId.replace(`wl_day${stepNum}_`, '');
    const dayLabel = getTranslation(lang, 'day' + rawDayKey.charAt(0).toUpperCase() + rawDayKey.slice(1));

    if (stepNum === 1) {
        state.data.waitlist.day1Key = rawDayKey;
        state.data.waitlist.day1 = dayLabel;
        state.step = 'espera_step4_dia2';
        userStates.set(from, state);

        const bodyText = getTranslation(lang, 'waitlistStep4Dia2').replace('{day1}', dayLabel);
        const buttonText = getTranslation(lang, 'menuButtonText');
        const rows = getDaysListRows(lang, [rawDayKey]).map(r => ({ ...r, id: 'wl_day2_' + r.id }));
        await sendInteractiveList(from, bodyText, buttonText, [{ title: "Día 2 de preferencia", rows }]);
    } else if (stepNum === 2) {
        state.data.waitlist.day2Key = rawDayKey;
        state.data.waitlist.day2 = dayLabel;
        state.step = 'espera_step4_dia3';
        userStates.set(from, state);

        const day1Label = state.data.waitlist.day1;
        const bodyText = getTranslation(lang, 'waitlistStep4Dia3').replace('{day1}', day1Label).replace('{day2}', dayLabel);
        const buttonText = getTranslation(lang, 'menuButtonText');
        const excluded = [state.data.waitlist.day1Key, rawDayKey];
        const rows = getDaysListRows(lang, excluded).map(r => ({ ...r, id: 'wl_day3_' + r.id }));
        await sendInteractiveList(from, bodyText, buttonText, [{ title: "Día 3 de preferencia", rows }]);
    } else if (stepNum === 3) {
        state.data.waitlist.day3Key = rawDayKey;
        state.data.waitlist.day3 = dayLabel;
        
        const d1 = state.data.waitlist.day1;
        const d2 = state.data.waitlist.day2;
        const d3 = dayLabel;
        state.data.waitlist.dias = `${d1}, ${d2}, ${d3}`;

        state.step = 'espera_step5_ninos';
        userStates.set(from, state);
        await sendMessage(from, getTranslation(lang, 'waitlistStep5Ninos'));
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

    // Consultar BD para buscar la siguiente fecha libre para esta hora y 2 comensales (Menú Tradición)
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
        state.step = 'menu_trad_step5_dia1';
        userStates.set(from, state);

        const bodyText = getTranslation(lang, 'menuTradStep5Dia1').replace('{nextAvailable}', nextAvailMsg);
        const buttonText = getTranslation(lang, 'menuButtonText');
        const rows = getDaysListRows(lang, [], true).map(r => ({ ...r, id: 'mt_day1_' + r.id }));

        await sendInteractiveList(from, bodyText, buttonText, [{ title: "Día 1 de preferencia", rows }]);
    }
}

/**
 * Maneja la selección interactiva de días (Día 1, 2, 3) en Menú Tradición.
 */
async function handleMenuTradDaySelection(from, listId, stepNum, lang) {
    const state = userStates.get(from) || { data: {} };
    state.data.menuTrad = state.data.menuTrad || {};

    if (listId === 'mt_day1_skip') {
        state.data.menuTrad.dias = 'Sin preferencia';
        state.step = 'menu_trad_step6_alergias';
        userStates.set(from, state);
        await sendMessage(from, getTranslation(lang, 'menuTradStep6Alergias'));
        return;
    }

    const rawDayKey = listId.replace(`mt_day${stepNum}_`, '');
    const dayLabel = getTranslation(lang, 'day' + rawDayKey.charAt(0).toUpperCase() + rawDayKey.slice(1));

    if (stepNum === 1) {
        state.data.menuTrad.day1Key = rawDayKey;
        state.data.menuTrad.day1 = dayLabel;
        state.step = 'menu_trad_step5_dia2';
        userStates.set(from, state);

        const bodyText = getTranslation(lang, 'menuTradStep5Dia2').replace('{day1}', dayLabel);
        const buttonText = getTranslation(lang, 'menuButtonText');
        const rows = getDaysListRows(lang, [rawDayKey]).map(r => ({ ...r, id: 'mt_day2_' + r.id }));
        await sendInteractiveList(from, bodyText, buttonText, [{ title: "Día 2 de preferencia", rows }]);
    } else if (stepNum === 2) {
        state.data.menuTrad.day2Key = rawDayKey;
        state.data.menuTrad.day2 = dayLabel;
        state.step = 'menu_trad_step5_dia3';
        userStates.set(from, state);

        const day1Label = state.data.menuTrad.day1;
        const bodyText = getTranslation(lang, 'menuTradStep5Dia3').replace('{day1}', day1Label).replace('{day2}', dayLabel);
        const buttonText = getTranslation(lang, 'menuButtonText');
        const excluded = [state.data.menuTrad.day1Key, rawDayKey];
        const rows = getDaysListRows(lang, excluded).map(r => ({ ...r, id: 'mt_day3_' + r.id }));
        await sendInteractiveList(from, bodyText, buttonText, [{ title: "Día 3 de preferencia", rows }]);
    } else if (stepNum === 3) {
        state.data.menuTrad.day3Key = rawDayKey;
        state.data.menuTrad.day3 = dayLabel;

        const d1 = state.data.menuTrad.day1;
        const d2 = state.data.menuTrad.day2;
        const d3 = dayLabel;
        state.data.menuTrad.dias = `${d1}, ${d2}, ${d3}`;

        state.step = 'menu_trad_step6_alergias';
        userStates.set(from, state);
        await sendMessage(from, getTranslation(lang, 'menuTradStep6Alergias'));
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
                { id: 'nac_es', title: getTranslation(lang, 'nacEs').slice(0, 24) },
                { id: 'nac_fr', title: getTranslation(lang, 'nacFr').slice(0, 24) },
                { id: 'nac_uk', title: getTranslation(lang, 'nacUk').slice(0, 24) },
                { id: 'nac_us', title: getTranslation(lang, 'nacUs').slice(0, 24), description: getTranslation(lang, 'nacUsDesc').slice(0, 72) },
                { id: 'nac_de', title: getTranslation(lang, 'nacDe').slice(0, 24) },
                { id: 'nac_it', title: getTranslation(lang, 'nacIt').slice(0, 24) },
                { id: 'nac_pt', title: getTranslation(lang, 'nacPt').slice(0, 24) },
                { id: 'nac_mx', title: getTranslation(lang, 'nacMx').slice(0, 24) },
                { id: 'nac_jp', title: getTranslation(lang, 'nacJp').slice(0, 24) },
                { id: 'nac_otro', title: getTranslation(lang, 'nacOtro').slice(0, 24), description: getTranslation(lang, 'nacOtroDesc').slice(0, 72) }
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
    await sendLocationMenu(from);
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

    // Interceptador global para volver al menú de idioma o inicio
    if (['menu', 'menú', 'inicio', 'cancelar', 'salir', 'volver', 'home', 'start'].includes(cleanText)) {
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
            currentState.step = 'espera_step1b_dni';
            userStates.set(from, currentState);

            const promptBody = getTranslation(lang, 'waitlistStep1bDni');
            const buttons = [
                { id: 'btn_skip_dni', title: getTranslation(lang, 'btnOmitirDni').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, promptBody, buttons);
            break;
        }

        case 'espera_step1b_dni': {
            currentState.data.waitlist = currentState.data.waitlist || {};
            const cleanDni = text.trim();
            if (['omitir', 'utzi', 'skip', 'no', 'btn_skip_dni'].includes(cleanDni.toLowerCase())) {
                currentState.data.waitlist.dni = 'N/A';
            } else {
                currentState.data.waitlist.dni = cleanDni.toUpperCase();
            }
            currentState.step = 'espera_step1c_nac';
            userStates.set(from, currentState);

            await sendNationalityList(from, lang);
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
            currentState.data.waitlist.comensales = text;
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
                await sendMessage(from, getTranslation(lang, 'waitlistStep5Ninos'));
            }
            break;
        }

        case 'espera_step5_ninos': {
            currentState.data.waitlist.ninos = text;
            currentState.step = 'espera_step6_alergias';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'waitlistStep6Alergias'));
            break;
        }

        case 'espera_step6_alergias': {
            currentState.data.waitlist.alergias = text;
            currentState.step = 'espera_step7_idioma';
            userStates.set(from, currentState);

            const promptBody = getTranslation(lang, 'waitlistStep7Idioma');
            const buttons = [
                { id: 'form_lang_es', title: getTranslation(lang, 'btnIdiomaEs').slice(0, 20) },
                { id: 'form_lang_eu', title: getTranslation(lang, 'btnIdiomaEu').slice(0, 20) },
                { id: 'form_lang_en', title: getTranslation(lang, 'btnIdiomaEn').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, promptBody, buttons);
            break;
        }

        case 'espera_step7_idioma': {
            let selLang = 'es';
            if (cleanText.includes('eusk') || cleanText.includes('basq') || cleanText.includes('eu')) {
                selLang = 'eu';
            } else if (cleanText.includes('eng') || cleanText.includes('ingl') || cleanText.includes('en')) {
                selLang = 'en';
            }
            await handleButtonResponse(from, 'form_lang_' + selLang);
            break;
        }

        case 'menu_trad_step1_tarjeta': {
            const rawCardCode = text.trim();
            const card = await db.getGiftCard(rawCardCode);

            if (card && (card.estado === 'ACTIVA' || !card.estado)) {
                currentState.data.menuTrad = currentState.data.menuTrad || {};
                currentState.data.menuTrad.card = card;
                currentState.data.menuTrad.tarjeta = card.codigo;
                currentState.data.menuTrad.comensales = 2; // Cada tarjeta cuenta como 2 comensales
                currentState.step = 'menu_trad_step2_nombre';
                userStates.set(from, currentState);

                const expiry = card.fecha_caducidad || 'N/A';
                const successNotice = getTranslation(lang, 'menuTradCardVerified')
                    .replace('{code}', card.codigo)
                    .replace('{expiry}', expiry);
                await sendMessage(from, successNotice);

                await sendMessage(from, getTranslation(lang, 'menuTradStep2Nombre'));
            } else {
                const failNotice = getTranslation(lang, 'menuTradCardNotFound')
                    .replace('{code}', rawCardCode);
                await sendMessage(from, failNotice);
            }
            break;
        }

        case 'menu_trad_step2_nombre': {
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            currentState.data.menuTrad.nombre = text;
            currentState.data.menuTrad.comensales = 2;
            currentState.step = 'menu_trad_step2b_dni';
            userStates.set(from, currentState);

            const promptBody = getTranslation(lang, 'menuTradStep2bDni');
            const buttons = [
                { id: 'btn_skip_dni', title: getTranslation(lang, 'btnOmitirDni').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, promptBody, buttons);
            break;
        }

        case 'menu_trad_step2b_dni': {
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            const cleanDni = text.trim();
            if (['omitir', 'utzi', 'skip', 'no', 'btn_skip_dni'].includes(cleanDni.toLowerCase())) {
                currentState.data.menuTrad.dni = 'N/A';
            } else {
                currentState.data.menuTrad.dni = cleanDni.toUpperCase();
            }
            currentState.step = 'menu_trad_step2c_nac';
            userStates.set(from, currentState);

            await sendNationalityList(from, lang);
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
                userStates.set(from, currentState);
                await sendMessage(from, getTranslation(lang, 'menuTradStep6Alergias'));
            }
            break;
        }

        case 'menu_trad_step6_alergias': {
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            currentState.data.menuTrad.alergias = text;
            currentState.step = 'menu_trad_step7_idioma';
            userStates.set(from, currentState);

            const promptBody = getTranslation(lang, 'menuTradStep7Idioma');
            const buttons = [
                { id: 'form_lang_es', title: getTranslation(lang, 'btnIdiomaEs').slice(0, 20) },
                { id: 'form_lang_eu', title: getTranslation(lang, 'btnIdiomaEu').slice(0, 20) },
                { id: 'form_lang_en', title: getTranslation(lang, 'btnIdiomaEn').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, promptBody, buttons);
            break;
        }

        case 'menu_trad_step7_idioma': {
            let selLang = 'es';
            if (cleanText.includes('eusk') || cleanText.includes('basq') || cleanText.includes('eu')) {
                selLang = 'eu';
            } else if (cleanText.includes('eng') || cleanText.includes('ingl') || cleanText.includes('en')) {
                selLang = 'en';
            }
            await handleButtonResponse(from, 'form_lang_' + selLang);
            break;
        }

        case 'modificacion_datos_actuales':
            // Guardar datos de reserva actual y buscar si existe en BD o en el texto
            currentState.data.reservaActual = text;
            
            // Intentar encontrar reserva previa en la BD por texto o por número del usuario
            const reservaEncontrada = db.getReservation(text) || db.getReservation(from);
            if (reservaEncontrada) {
                currentState.data.comensalesActuales = reservaEncontrada.comensales;
                currentState.data.nombreCliente = reservaEncontrada.nombre;
                currentState.data.telefonoReserva = reservaEncontrada.telefono;
            } else {
                const esTelefono = text.match(/\+?\d{8,15}/);
                if (esTelefono) {
                    currentState.data.telefonoReserva = esTelefono[0];
                    const restoTexto = text.replace(esTelefono[0], '').trim();
                    if (restoTexto) {
                        currentState.data.nombreCliente = restoTexto;
                    }
                } else {
                    currentState.data.nombreCliente = text;
                }
            }

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

        case 'mod_val_comensales': {
            const match = text.match(/\d+/);
            const numDiners = match ? parseInt(match[0], 10) : NaN;
            if (isNaN(numDiners) || numDiners <= 0 || numDiners > 6) {
                await sendMessage(from, getTranslation(lang, 'maxComensalesErrorMsg'));
                return;
            }

            const nombreCliente = currentState.data.nombreCliente || null;
            const telefonoReserva = currentState.data.telefonoReserva || from;
            const reservaActual = currentState.data.reservaActual || 'No especificada';

            const detalleMod = `👤 *Nombre Cliente:* ${nombreCliente || 'No especificado explícitamente'}\n` +
                               `📞 *Teléfono Reserva:* ${telefonoReserva}\n` +
                               `📱 *WhatsApp Remitente:* ${from}\n` +
                               `📄 *Datos Ingresados:* ${reservaActual}\n` +
                               `✏️ *Modificación (COMENSALES):* ${numDiners} personas`;
            
            await requestUserConfirmation(from, lang, {
                tipoAccion: 'SOLICITUD MODIFICACIÓN DE RESERVA',
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
            const nombreCliente = currentState.data.nombreCliente || null;
            const telefonoReserva = currentState.data.telefonoReserva || from;
            const reservaActual = currentState.data.reservaActual || 'No especificada';

            const detalleMod = `👤 *Nombre Cliente:* ${nombreCliente || 'No especificado explícitamente'}\n` +
                               `📞 *Teléfono Reserva:* ${telefonoReserva}\n` +
                               `📱 *WhatsApp Remitente:* ${from}\n` +
                               `📄 *Datos Ingresados:* ${reservaActual}\n` +
                               `✏️ *Modificación (${tipoModLabel}):* ${text}`;
            
            await requestUserConfirmation(from, lang, {
                tipoAccion: 'SOLICITUD MODIFICACIÓN DE RESERVA',
                detalleMod: detalleMod,
                nombreCliente: nombreCliente,
                telefonoReserva: telefonoReserva,
                successMsgKey: 'modSuccessMsg'
            });
            break;
        }

        case 'cancelacion_datos_actuales': {
            let nombreCliente = null;
            let telefonoReserva = from;
            const reservaEncontrada = db.getReservation(text) || db.getReservation(from);
            if (reservaEncontrada) {
                nombreCliente = reservaEncontrada.nombre;
                telefonoReserva = reservaEncontrada.telefono;
            } else {
                const esTelefono = text.match(/\+?\d{8,15}/);
                if (esTelefono) {
                    telefonoReserva = esTelefono[0];
                    const restoTexto = text.replace(esTelefono[0], '').trim();
                    if (restoTexto) nombreCliente = restoTexto;
                } else {
                    nombreCliente = text;
                }
            }

            const detalleCancelacion = `👤 *Nombre Cliente:* ${nombreCliente || 'No especificado explícitamente'}\n` +
                                       `📞 *Teléfono Reserva:* ${telefonoReserva}\n` +
                                       `📱 *WhatsApp Remitente:* ${from}\n` +
                                       `📄 *Datos Ingresados:* ${text}\n` +
                                       `❌ *Solicitud:* CANCELACIÓN DE RESERVA`;

            await requestUserConfirmation(from, lang, {
                tipoAccion: 'SOLICITUD CANCELACIÓN DE RESERVA',
                detalleMod: detalleCancelacion,
                nombreCliente: nombreCliente,
                telefonoReserva: telefonoReserva,
                successMsgKey: 'cancelSuccessMsg'
            });
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
                          `Sartu menuan -> *"4. Tradizio Menua"* -> *"Erreserbatu"*.`;
                } else if (lang === 'en') {
                    msg = `🎁 *GIFT CARD VERIFICATION*\n\n` +
                          `✅ *Code:* ${card.codigo}\n` +
                          `👤 *Holder / Buyer:* ${card.comprador_nombre || 'Not specified'}\n` +
                          `📅 *Expiration Date:* ${card.fecha_caducidad}\n` +
                          `📌 *Status:* ${card.estado || 'ACTIVE'}\n\n` +
                          `💡 *Would you like to book your table?*\n` +
                          `Go to main menu -> *"4. Tradition Menu"* -> *"Book Table"*.`;
                } else {
                    msg = `🎁 *VERIFICACIÓN DE TARJETA REGALO*\n\n` +
                          `✅ *Código:* ${card.codigo}\n` +
                          `👤 *Titular / Comprador:* ${card.comprador_nombre || 'No especificado'}\n` +
                          `📅 *Fecha de Caducidad:* ${card.fecha_caducidad}\n` +
                          `📌 *Estado:* ${card.estado || 'ACTIVA'}\n\n` +
                          `💡 *¿Deseas reservar tu mesa con esta tarjeta?*\n` +
                          `Entra en el menú principal -> *"4. Menú Tradición"* -> *"Reservar"*.`;
                }

                await sendMessage(from, msg);
                await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
                await sendLocationMenu(from);
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
                await sendLocationMenu(from);

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
