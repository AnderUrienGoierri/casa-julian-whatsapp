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

        case 'btn_add_lista_espera':
            userStates.set(from, { step: 'espera_step1_nombre', data: { waitlist: {} } });
            await sendMessage(from, getTranslation(lang, 'waitlistStep1Nombre'));
            break;

        case 'menu_tradicion_reservar':
            userStates.set(from, { step: 'menu_tradicion_formulario_reserva', data: {} });
            await sendMessage(from, getTranslation(lang, 'menuTradicionFormPrompt'));
            break;

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

                // 4. Enviar la alerta a recepción por WhatsApp y Email con AWAIT garantizado
                try {
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

        case 'confirmacion_solicitud': {
            const lower = text.trim().toLowerCase();
            if (['si', 'sí', 'bai', 'yes', 's', 'confirmar', 'enviar'].includes(lower)) {
                await handleButtonResponse(from, 'confirm_yes', lang);
            } else {
                await handleButtonResponse(from, 'confirm_no', lang);
            }
            break;
        }

        case 'espera_step1_nombre': {
            currentState.data.waitlist = currentState.data.waitlist || {};
            currentState.data.waitlist.nombre = text;
            currentState.step = 'espera_step2_comensales';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'waitlistStep2Comensales'));
            break;
        }

        case 'espera_step2_comensales': {
            currentState.data.waitlist.comensales = text;
            currentState.step = 'espera_step3_horario';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'waitlistStep3Horario'));
            break;
        }

        case 'espera_step3_horario': {
            currentState.data.waitlist.horario = text;
            currentState.step = 'espera_step4_dias';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'waitlistStep4Dias'));
            break;
        }

        case 'espera_step4_dias': {
            currentState.data.waitlist.dias = text;
            currentState.step = 'espera_step5_ninos';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'waitlistStep5Ninos'));
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
            currentState.step = 'espera_step7_menu_tradicion';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'waitlistStep7MenuTradicion'));
            break;
        }

        case 'espera_step7_menu_tradicion': {
            currentState.data.waitlist.menuTradicion = text;
            const wl = currentState.data.waitlist;

            const detalleEspera = `👤 *Nombre:* ${wl.nombre}\n` +
                                  `👥 *Comensales:* ${wl.comensales}\n` +
                                  `🕐 *Preferencia horaria:* ${wl.horario}\n` +
                                  `📅 *Disponibilidad días:* ${wl.dias}\n` +
                                  `👶 *Niños:* ${wl.ninos}\n` +
                                  `⚠️ *Alergias/Restricciones:* ${wl.alergias}\n` +
                                  `🎁 *Menú Tradición:* ${wl.menuTradicion}\n` +
                                  `📱 *WhatsApp Remitente:* ${from}\n` +
                                  `📋 *Solicitud:* INSCRIPCIÓN EN LISTA DE ESPERA`;

            await requestUserConfirmation(from, lang, {
                tipoAccion: 'SOLICITUD LISTA DE ESPERA',
                detalleMod: detalleEspera,
                nombreCliente: wl.nombre,
                telefonoReserva: from,
                successMsgKey: 'waitlistSuccessMsg'
            });
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

        case 'menu_tradicion_formulario_caducidad':
            await requestUserConfirmation(from, lang, {
                tipoAccion: 'CONSULTA CADUCIDAD MENÚ TRADICIÓN',
                detalleMod: text,
                nombreCliente: null,
                telefonoReserva: from,
                successMsgKey: 'menuTradicionCaducidadMsg'
            });
            break;

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
