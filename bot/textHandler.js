const { 
    sendInteractiveButtons, 
    sendInteractiveList, 
    sendMessage,
    sendImageMessage
} = require('../whatsappApi');
const db = require('../database');
const { sendInternalStaffAlertInSpanish } = require('../notifications');
const { getTranslation } = require('../i18n');
const { userStates, userLanguages, userLocations } = require('./stateManager');
const {
    sendLanguageMenu,
    showLocationOrMainMenu,
    sendLocationMenu,
    sendMainMenu,
    sendFaqMenu,
    sendNationalityList,
    sendFormLanguageList
} = require('./menus');
const { handleFaqSelection } = require('./faq');
const { requestUserConfirmation } = require('./confirmation');
const {
    handleRegalarMenuTradicion,
    sendGiftCardOptions,
    handleMenuTradSlotSelection,
    sendMenuTradDaysList
} = require('./giftCardFlow');
const {
    sendModHoraOptions,
    handleModHoraSelection
} = require('./modCancelFlow');
const {
    parseAndValidateDates,
    checkRestaurantClosedDate,
    isValidEmail,
    getInvalidEmailMsg,
    formatModificationDetail
} = require('./utils');

const {
    handleButtonResponse,
    sendWaitlistNinosPrompt,
    sendAllergiesList,
    handleAllergiesListSelection,
    sendWaitlistDaysList,
    handleWaitlistDaySelection,
    handleWaitlistSlotSelection,
    sendConsultaAbiertaSummary,
    handleNationalitySelection
} = require('./interactiveHandler');

function formatCancellationDetail(reservaFound, queryText, from, lang) {
    let detalle = `🆔 *Código Reserva / ID:* ${reservaFound.id}\n` +
        `👤 *Nombre del Cliente:* ${reservaFound.nombre || 'N/A'}\n` +
        `📞 *Teléfono:* ${reservaFound.telefono || from}\n` +
        `📅 *Fecha:* ${reservaFound.fecha || 'Sin fecha'}\n` +
        `🕐 *Hora:* ${reservaFound.hora || 'Sin hora'}\n` +
        `👥 *Comensales:* ${reservaFound.comensales || 'N/A'}\n` +
        `📌 *Estado Actual:* ${reservaFound.estado || 'CONFIRMADA'}`;
    return detalle;
}

async function handleTextMessage(from, text) {
    const lang = userLanguages.get(from) || 'es';
    const cleanText = text.trim().toLowerCase();

    // 1. Interceptador de Saludo / Inicio
    const isGreeting = ['hola', 'kaixo', 'hello', 'hi', 'bonjour', 'hallo', 'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches', 'egun on', 'arratsalde on', 'gabon', 'start', 'inicio', 'empezar', 'menu', 'menú', 'volver', 'home', 'reiniciar', 'reset', 'saludo'].some(k => cleanText === k || cleanText.startsWith(k + ' '));

    if (isGreeting) {
        userStates.delete(from);
        userLocations.delete(from);
        await sendLanguageMenu(from, userLanguages, userStates);
        return;
    }

    // 2. Interceptador de Despedida / Finalización
    const isFarewell = ['adios', 'adiós', 'agur', 'bye', 'goodbye', 'gracias', 'eskerrik asko', 'thank you', 'thanks', 'merci', 'danke', 'chao', 'chau', 'hasta luego', 'hasta pronto', 'salir', 'cancelar', 'finish', 'end'].some(k => cleanText === k || cleanText.startsWith(k + ' '));

    if (isFarewell) {
        userStates.delete(from);
        userLocations.delete(from);
        await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
        return;
    }

    const currentState = userStates.get(from);

    if (!currentState || currentState.step === 'select_language') {
        userStates.delete(from);
        userLocations.delete(from);
        await sendLanguageMenu(from, userLanguages, userStates);
        return;
    }

    switch (currentState.step) {
        case 'select_location':
            await showLocationOrMainMenu(from, userLocations, userLanguages, userStates);
            break;

        case 'confirmacion_solicitud': {
            const lower = text.trim().toLowerCase();
            if (['si', 'sí', 'bai', 'yes', 's', 'confirmar', 'enviar'].includes(lower)) {
                await handleButtonResponse(from, 'confirm_yes');
            } else {
                await handleButtonResponse(from, 'confirm_no');
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
            currentState.data.waitlist.nombre = text.trim();
            currentState.data.waitlist.dni = null;
            currentState.data.waitlist.email = 'N/A';
            currentState.data.waitlist.nacionalidad = 'España';
            currentState.step = 'espera_step2_comensales';
            userStates.set(from, currentState);

            await sendMessage(from, getTranslation(lang, 'waitlistStep2Comensales'));
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
            const cleanTextVal = text.trim();
            const numComensales = parseInt(cleanTextVal, 10);

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
        case 'espera_step4_dia3':
        case 'espera_step4_dias': {
            const rawDay = text.trim().toLowerCase();
            await handleButtonResponse(from, 'wl_day_' + rawDay);
            break;
        }

        case 'espera_step5_ninos': {
            currentState.data.waitlist = currentState.data.waitlist || {};
            let numNinos = 0;
            const cleanTextVal = text.trim().toLowerCase();

            if (!['no', 'ninguno', 'ninguna', 'none', '0', 'omitir', 'skip'].includes(cleanTextVal)) {
                numNinos = parseInt(cleanTextVal, 10) || 0;
            }

            currentState.data.waitlist.ninos = numNinos;
            currentState.step = 'espera_step6_alergias';
            currentState.data.waitlist.selectedAllergies = [];
            userStates.set(from, currentState);

            await sendAllergiesList(from, lang, 'waitlistStep6Alergias', []);
            break;
        }

        case 'espera_step6_alergia_custom': {
            currentState.data.waitlist = currentState.data.waitlist || {};
            currentState.data.waitlist.selectedAllergies = currentState.data.waitlist.selectedAllergies || [];
            const customVal = text.trim();
            if (customVal && !currentState.data.waitlist.selectedAllergies.includes(customVal)) {
                currentState.data.waitlist.selectedAllergies.push(customVal);
            }
            currentState.step = 'espera_step6_alergias';
            userStates.set(from, currentState);

            await sendAllergiesList(from, lang, 'waitlistStep6Alergias', currentState.data.waitlist.selectedAllergies);
            break;
        }

        case 'menu_trad_step1_tarjeta': {
            const cardInput = text.trim().toUpperCase();
            const card = await db.getGiftCard(cardInput);

            if (card) {
                const statusUpper = (card.estado || 'ACTIVA').toString().trim().toUpperCase();
                const invalidStates = ['CADUCADA', 'USADA', 'CANJEADA', 'CANCELADA', 'PENDIENTE RESERVA', 'INACTIVA', 'DESACTIVADA'];
                const isCardActive = !invalidStates.includes(statusUpper);
                if (!isCardActive) {
                    let inactiveMsg = `⚠️ La tarjeta regalo *${card.codigo}* se encuentra actualmente en estado: *${card.estado}* y no puede usarse para reservar en este momento. Por favor, introduce otro código de tarjeta regalo:`;
                    if (lang === 'eu') inactiveMsg = `⚠️ *${card.codigo}* opari-txartela *${card.estado}* egoeran dago eta ezin da erabili erreserba egiteko une honetan. Mesedez, sartu beste opari-txartel baten kodea:`;
                    else if (lang === 'en') inactiveMsg = `⚠️ Gift card *${card.codigo}* is currently in state: *${card.estado}* and cannot be used for booking right now. Please enter another gift card code:`;
                    await sendMessage(from, inactiveMsg);
                    break;
                }

                currentState.data = currentState.data || {};
                currentState.data.menuTrad = currentState.data.menuTrad || {};
                currentState.data.menuTrad.card = card;
                currentState.data.menuTrad.cards = [card];
                currentState.data.menuTrad.tarjeta = card.codigo;
                currentState.data.menuTrad.comensales = 2;
                currentState.step = 'menu_trad_step2_nombre';
                userStates.set(from, currentState);

                let cardVerifiedMsg = `🎁 *TARJETA REGALO VERIFICADA CORRECTAMENTE*\n\n` +
                    `✅ *Código:* ${card.codigo}\n` +
                    `📅 *Válida hasta:* ${card.fecha_caducidad}\n` +
                    `👥 *Comensales del Menú Tradición:* 2 personas por tarjeta`;

                if (lang === 'eu') {
                    cardVerifiedMsg = `🎁 *OPARI-TXARTELA EGOKI EGIAZTATU DA*\n\n` +
                        `✅ *Kodea:* ${card.codigo}\n` +        
                        `📅 *Noiz arte baliogarria:* ${card.fecha_caducidad}\n` +
                        `👥 *Tradizio Menuko jankideak:* 2 pertsona txartel bakoitzeko`;
                } else if (lang === 'en') {
                    cardVerifiedMsg = `🎁 *GIFT CARD VERIFIED SUCCESSFULLY*\n\n` +
                        `✅ *Code:* ${card.codigo}\n` +
                        `📅 *Valid until:* ${card.fecha_caducidad}\n` +
                        `👥 *Tradition Menu Guests:* 2 people per card`;
                }

                await sendMessage(from, cardVerifiedMsg);
                await sendMessage(from, getTranslation(lang, 'menuTradStep2Nombre'));
            } else {
                let notFoundMsg = `⚠️ *Tarjeta regalo no encontrada en el sistema.* No hemos localizado ninguna tarjeta activa con el código *"${cardInput}"*.\n\nPor favor, comprueba el código e introdúcelo de nuevo a continuación:`;
                if (lang === 'eu') {
                    notFoundMsg = `⚠️ *Opari-txartela ez da sisteman aurkitu.* Ez dugu *"${cardInput}"* kodearekin opari-txartel aktiborik aurkitu.\n\nMesedez, egiaztatu sartutako kodea eta idatzi berriro jarraian:`;
                } else if (lang === 'en') {
                    notFoundMsg = `⚠️ *Gift card not found in system.* We could not locate an active card with code *"${cardInput}"*.\n\nPlease check the code and type it again below:`;
                }

                currentState.step = 'menu_trad_step1_tarjeta';
                userStates.set(from, currentState);

                await sendMessage(from, notFoundMsg);

                const buttons = [
                    { id: 'btn_volver_menu', title: getTranslation(lang, 'btnVolverMenu').slice(0, 20) }
                ];
                const optHeader = (lang === 'eu' ? 'Edo hautatu aukera bat:' : (lang === 'en' ? 'Or select an option:' : 'O selecciona una opción:'));
                await sendInteractiveButtons(from, optHeader, buttons);
            }
            break;
        }

        case 'menu_trad_step2_nombre': {
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            currentState.data.menuTrad.nombre = text.trim();
            currentState.data.menuTrad.dni = null;
            currentState.data.menuTrad.email = 'N/A';
            currentState.data.menuTrad.nacionalidad = 'España';
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

        case 'menu_trad_step2b2_email': {
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            const cleanEmail = text.trim();
            if (['omitir', 'utzi', 'skip', 'no', 'btn_skip_email'].includes(cleanEmail.toLowerCase())) {
                currentState.data.menuTrad.email = 'N/A';
                currentState.step = 'menu_trad_step2c_nac';
                userStates.set(from, currentState);
                await sendNationalityList(from, lang);
            } else if (!isValidEmail(cleanEmail)) {
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
            } else if (lowerText.includes('cena') || lowerText.includes('afari') || lowerText.includes('dinner')) {
                await handleButtonResponse(from, 'menu_trad_tipo_cena');
            } else {
                await handleButtonResponse(from, 'menu_trad_tipo_sin_pref');
            }
            break;
        }

        case 'menu_trad_step4_hora': {
            const timeClean = text.trim().replace('.', ':');
            await handleMenuTradSlotSelection(from, 'mt_slot_' + timeClean.replace(':', ''), lang, userStates);
            break;
        }

        case 'menu_trad_step5_dias':
        case 'menu_trad_step5_cena':
        case 'menu_trad_step5_dia1':
        case 'menu_trad_step5_dia2':
        case 'menu_trad_step5_dia3': {
            const cleanInput = text.trim().toLowerCase();
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            currentState.data.menuTrad.fechas = currentState.data.menuTrad.fechas || [];

            if (cleanInput === 'btn_finish_fechas' || ['fin', 'finalizar', 'listo', 'ok', 'terminar', 'hecho'].includes(cleanInput)) {
                if (currentState.data.menuTrad.fechas.length === 0) {
                    await sendMessage(from, getTranslation(lang, 'invalidDateFormatMsg'));
                    break;
                }
                currentState.step = 'menu_trad_step5b_ninos';
                userStates.set(from, currentState);

                let promptBody = `👶 *¿Cuántos niños (<12 años) acudirán a la reserva?*\n\nSelecciona una opción o escribe la cantidad en texto (0 si ninguno):`;
                if (lang === 'eu') promptBody = `👶 *Zenbat haur (<12 urte) etorriko dira erreserbara?*\n\nAukeratu aukera bat edo idatzi kopurua testuz (0 inor ez bada):`;
                else if (lang === 'en') promptBody = `👶 *How many children (<12 years) will attend the reservation?*\n\nSelect an option or type the quantity (0 if none):`;

                const buttons = [
                    { id: 'btn_mt_ninos_0', title: '0 niños' },
                    { id: 'btn_mt_ninos_1', title: '1 niño' },
                    { id: 'btn_mt_ninos_2', title: '2 niños' }
                ];
                await sendInteractiveButtons(from, promptBody, buttons);
                break;
            }

            if (cleanInput === 'btn_add_fecha') {
                let msg = `📅 *Indícanos la siguiente fecha de preferencia (formato DD/MM/AAAA):*`;
                if (lang === 'eu') msg = `📅 *Eman hurrengo data hobetsia (DD/MM/AAAA formatuan):*`;
                else if (lang === 'en') msg = `📅 *Please specify the next preferred date (DD/MM/AAAA format):*`;
                await sendMessage(from, msg);
                break;
            }

            const newDates = parseAndValidateDates(text);

            if (newDates.length === 0) {
                await sendMessage(from, getTranslation(lang, 'invalidDateFormatMsg'));
                break;
            }

            for (const d of newDates) {
                const closedCheck = checkRestaurantClosedDate(d);
                if (closedCheck) {
                    const msgKey = closedCheck.reason === 'vacation' ? 'closedVacationMsg' : 'closedMondayMsg';
                    const msgText = getTranslation(lang, msgKey).replace('{date}', d);
                    await sendMessage(from, msgText);
                } else {
                    if (!currentState.data.menuTrad.fechas.includes(d) && currentState.data.menuTrad.fechas.length < 5) {
                        currentState.data.menuTrad.fechas.push(d);
                    }
                }
            }

            userStates.set(from, currentState);

            if (currentState.data.menuTrad.fechas.length >= 5) {
                currentState.step = 'menu_trad_step5a_comensales';
                userStates.set(from, currentState);

                const datesStr = currentState.data.menuTrad.fechas.join(', ');
                let maxHeader = `📌 *Has indicado el máximo de 5 fechas de preferencia:* ${datesStr}\n\n`;
                if (lang === 'eu') maxHeader = `📌 *Gehienezko 5 data hobetsiak adierazi dituzu:* ${datesStr}\n\n`;
                else if (lang === 'en') maxHeader = `📌 *You specified the maximum 5 preferred dates:* ${datesStr}\n\n`;

                let promptBody = maxHeader + `👥 *¿Cuántos comensales (personas en total) acudirán a la reserva?*\n\n(La tarjeta regalo suele ser para 2 comensales, pero puedes indicar si seréis más personas):`;
                if (lang === 'eu') promptBody = maxHeader + `👥 *Zenbat jankide (pertsona guztira) etorriko dira erreserbara?*\n\n(Normalean opari-txartela 2 jankiderentzat izaten da, baina gehiago bazarete aukeratu dezakezu):`;
                else if (lang === 'en') promptBody = maxHeader + `👥 *How many guests (total people) will attend the reservation?*\n\n(The gift card is usually for 2 guests, but you can specify if more people will attend):`;

                const buttons = [
                    { id: 'btn_mt_comensales_2', title: '2 comensales' },
                    { id: 'btn_mt_comensales_3', title: '3 comensales' },
                    { id: 'btn_mt_comensales_4', title: '4 comensales' }
                ];
                await sendInteractiveButtons(from, promptBody, buttons);
            } else if (currentState.data.menuTrad.fechas.length > 0) {
                const count = currentState.data.menuTrad.fechas.length;
                const datesListStr = currentState.data.menuTrad.fechas.map(f => `• ${f}`).join('\n');
                const promptBody = `📌 *Fechas de preferencia guardadas (${count}/5):*\n${datesListStr}\n\n¿Deseas añadir otra fecha o finalizar la selección?`;

                const buttons = [
                    { id: 'btn_add_fecha', title: getTranslation(lang, 'btnAddOtraFecha').slice(0, 20) },
                    { id: 'btn_finish_fechas', title: getTranslation(lang, 'btnFinalizarFechas').slice(0, 20) }
                ];
                await sendInteractiveButtons(from, promptBody, buttons);
            }
            break;
        }

        case 'menu_trad_step5a_comensales': {
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            let numComensales = 2;
            const cleanTextVal = text.trim().toLowerCase();

            if (cleanTextVal.startsWith('btn_mt_comensales_')) {
                numComensales = parseInt(cleanTextVal.replace('btn_mt_comensales_', ''), 10) || 2;
            } else {
                numComensales = parseInt(cleanTextVal.replace(/\D/g, ''), 10) || 2;
            }

            currentState.data.menuTrad.comensales = numComensales;
            currentState.step = 'menu_trad_step5b_ninos';
            userStates.set(from, currentState);

            let promptBody = `👶 *¿Cuántos niños (<12 años) acudirán a la reserva?*\n\nSelecciona una opción o escribe la cantidad en texto (0 si ninguno):`;
            if (lang === 'eu') promptBody = `👶 *Zenbat haur (<12 urte) etorriko dira erreserbara?*\n\nAukeratu aukera bat edo idatzi kopurua testuz (0 inor ez bada):`;
            else if (lang === 'en') promptBody = `👶 *How many children (<12 years) will attend the reservation?*\n\nSelect an option or type the quantity (0 if none):`;

            const buttons = [
                { id: 'btn_mt_ninos_0', title: '0 niños' },
                { id: 'btn_mt_ninos_1', title: '1 niño' },
                { id: 'btn_mt_ninos_2', title: '2 niños' }
            ];
            await sendInteractiveButtons(from, promptBody, buttons);
            break;
        }

        case 'menu_trad_step5_fechas_confirm': {
            const cleanInput = text.trim().toLowerCase();
            if (cleanInput === 'btn_fechas_confirm_si' || ['si', 'sí', 'correcto', 'ok', 'yes', 'bai'].includes(cleanInput)) {
                currentState.step = 'menu_trad_step5b_ninos';
                currentState.data.menuTrad = currentState.data.menuTrad || {};
                userStates.set(from, currentState);

                let promptBody = `👶 *¿Cuántos niños (<12 años) acudirán a la reserva?*\n\nSelecciona una opción o escribe la cantidad en texto (0 si ninguno):`;
                if (lang === 'eu') promptBody = `👶 *Zenbat haur (<12 urte) etorriko dira erreserbara?*\n\nAukeratu aukera bat edo idatzi kopurua testuz (0 inor ez bada):`;
                else if (lang === 'en') promptBody = `👶 *How many children (<12 years) will attend the reservation?*\n\nSelect an option or type the quantity (0 if none):`;

                const buttons = [
                    { id: 'btn_mt_ninos_0', title: '0 niños' },
                    { id: 'btn_mt_ninos_1', title: '1 niño' },
                    { id: 'btn_mt_ninos_2', title: '2 niños' }
                ];
                await sendInteractiveButtons(from, promptBody, buttons);
            } else {
                currentState.data.menuTrad = currentState.data.menuTrad || {};
                currentState.data.menuTrad.fechas = [];
                currentState.step = 'menu_trad_step5_dias';
                userStates.set(from, currentState);

                let resetMsg = `📅 *De acuerdo. Por favor, vuelve a indicarnos tus fechas de preferencia (formato DD/MM/AAAA):*`;
                if (lang === 'eu') resetMsg = `📅 *Ados. Mesedez, adierazi berriro zure data hobetsiak (DD/MM/AAAA formatuan):*`;
                else if (lang === 'en') resetMsg = `📅 *Understood. Please specify your preferred dates again (DD/MM/AAAA format):*`;
                await sendMessage(from, resetMsg);
            }
            break;
        }

        case 'menu_trad_step5b_ninos': {
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            let numNinos = 0;
            const cleanTextVal = text.trim().toLowerCase();

            if (cleanTextVal.startsWith('btn_mt_ninos_')) {
                numNinos = parseInt(cleanTextVal.replace('btn_mt_ninos_', ''), 10) || 0;
            } else if (!['no', 'ninguno', 'ninguna', 'none', '0', 'omitir', 'skip'].includes(cleanTextVal)) {
                numNinos = parseInt(cleanTextVal, 10) || 0;
            }

            currentState.data.menuTrad.ninos = numNinos;
            currentState.data.menuTrad.num_ninos = numNinos;
            currentState.step = 'menu_trad_step6_alergias';
            currentState.data.menuTrad.selectedAllergies = [];
            userStates.set(from, currentState);

            await sendAllergiesList(from, lang, 'menuTradStep6Alergias', []);
            break;
        }

        case 'menu_trad_step6_alergia_custom': {
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            currentState.data.menuTrad.selectedAllergies = currentState.data.menuTrad.selectedAllergies || [];
            const customVal = text.trim();
            if (customVal && !currentState.data.menuTrad.selectedAllergies.includes(customVal)) {
                currentState.data.menuTrad.selectedAllergies.push(customVal);
            }
            currentState.step = 'menu_trad_step6_alergias';
            userStates.set(from, currentState);

            await sendAllergiesList(from, lang, 'menuTradStep6Alergias', currentState.data.menuTrad.selectedAllergies);
            break;
        }

        case 'consulta_abierta_paso1_texto': {
            const consultaTexto = text.trim();
            if (consultaTexto.length < 3) {
                let msg = `⚠️ Por favor, escribe tu consulta detalladamente:`;
                if (lang === 'eu') msg = `⚠️ Mesedez, idatzi zure galdera xehetasunez:`;
                else if (lang === 'en') msg = `⚠️ Please enter your question in detail:`;
                await sendMessage(from, msg);
                break;
            }

            currentState.data = currentState.data || {};
            currentState.data.consultas = [consultaTexto];
            currentState.step = 'consulta_abierta_opciones';
            userStates.set(from, currentState);

            await sendConsultaAbiertaSummary(from, lang, currentState.data.consultas);
            break;
        }

        case 'consulta_abierta_mas_texto': {
            const consultaTexto = text.trim();
            if (consultaTexto.length < 3) {
                let msg = `⚠️ Por favor, escribe tu consulta detalladamente:`;
                if (lang === 'eu') msg = `⚠️ Mesedez, idatzi zure galdera xehetasunez:`;
                else if (lang === 'en') msg = `⚠️ Please enter your question in detail:`;
                await sendMessage(from, msg);
                break;
            }

            currentState.data = currentState.data || {};
            currentState.data.consultas = currentState.data.consultas || [];
            currentState.data.consultas.push(consultaTexto);
            currentState.step = 'consulta_abierta_opciones';
            userStates.set(from, currentState);

            await sendConsultaAbiertaSummary(from, lang, currentState.data.consultas);
            break;
        }

        case 'consulta_abierta_opciones': {
            const cleanTextVal = text.trim().toLowerCase();
            if (cleanTextVal.includes('otra') || cleanTextVal.includes('añadir') || cleanTextVal.includes('anadir') || cleanTextVal.includes('gehitu') || cleanTextVal.includes('add') || cleanTextVal.includes('mas') || cleanTextVal.includes('más')) {
                await handleButtonResponse(from, 'btn_consulta_otra');
            } else {
                await handleButtonResponse(from, 'btn_consulta_enviar');
            }
            break;
        }

        case 'modificacion_tipo_inicial': {
            const cleanTextVal = text.trim().toLowerCase();
            let tipo = 'comensales';
            if (cleanTextVal.includes('día') || cleanTextVal.includes('dia') || cleanTextVal.includes('fecha')) {
                tipo = 'dia';
            } else if (cleanTextVal.includes('hora')) {
                tipo = 'hora';
            }
            currentState.data = currentState.data || {};
            currentState.data.modTipo = tipo;
            currentState.step = 'modificacion_datos_actuales';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'modCancelDataPrompt'));
            break;
        }

        case 'modificacion_datos_actuales': {
            const nombreCliente = text.trim();
            const telefonoCliente = from.replace(/\D/g, '');

            if (nombreCliente.length < 2) {
                let promptMsg = `⚠️ *Por favor, indícanos el nombre del titular para la modificación:*`;
                if (lang === 'eu') promptMsg = `⚠️ *Mesedez, idatzi titularraren izena aldatzeko:*`;
                else if (lang === 'en') promptMsg = `⚠️ *Please provide the reservation name for the modification:*`;
                await sendMessage(from, promptMsg);
                break;
            }

            currentState.data = currentState.data || {};
            currentState.data.nombreCliente = nombreCliente;
            currentState.data.telefonoReserva = telefonoCliente;
            currentState.step = 'modificacion_fecha_reserva';
            userStates.set(from, currentState);

            let promptFecha = `📅 *Indícanos la fecha actual de la reserva que deseas modificar:*`;
            if (lang === 'eu') promptFecha = `📅 *Mesedez, adierazi aldatu nahi duzun erreserbaren egungo data:*`;
            else if (lang === 'en') promptFecha = `📅 *Please specify the current date of the reservation you wish to modify:*`;

            await sendMessage(from, promptFecha);
            break;
        }

        case 'modificacion_fecha_reserva': {
            const rawText = text.trim();
            const parsedDates = parseAndValidateDates(rawText);
            if (parsedDates.length === 0) {
                await sendMessage(from, getTranslation(lang, 'invalidDateFormatMsg'));
                break;
            }

            const fechaReservaOriginal = parsedDates[0];
            const closedCheck = checkRestaurantClosedDate(fechaReservaOriginal);
            if (closedCheck) {
                const msgKey = closedCheck.reason === 'vacation' ? 'closedVacationMsg' : 'closedMondayMsg';
                const msgText = getTranslation(lang, msgKey).replace('{date}', fechaReservaOriginal);
                await sendMessage(from, msgText);
                break;
            }

            const nombreCliente = currentState.data?.nombreCliente || 'Cliente';
            const telefonoCliente = currentState.data?.telefonoReserva || from.replace(/\D/g, '');

            currentState.data.fechaReservaOriginal = fechaReservaOriginal;
            currentState.data.reservaActual = `${nombreCliente} (${telefonoCliente}) - Fecha: ${fechaReservaOriginal}`;

            const modTipo = currentState.data.modTipo;
            if (modTipo === 'comensales') {
                currentState.step = 'mod_val_comensales';
                userStates.set(from, currentState);
                let promptMsg = `📌 *Modificación de comensales para ${nombreCliente} (Reserva fecha: ${fechaReservaOriginal})*\n\nIndica el nuevo número de comensales deseado (máx. 6):`;
                if (lang === 'eu') promptMsg = `📌 *Kide kopuruaren aldaketa ${nombreCliente} izenean (${fechaReservaOriginal} erreserba-data)*\n\nIdatzi kide kopuru berria (geh. 6):`;
                else if (lang === 'en') promptMsg = `📌 *Guest count modification for ${nombreCliente} (Reservation date: ${fechaReservaOriginal})*\n\nEnter the new number of guests (max. 6):`;
                await sendMessage(from, promptMsg);
            } else if (modTipo === 'dia') {
                currentState.step = 'mod_val_dia';
                currentState.data.modFechas = [];
                userStates.set(from, currentState);
                await sendMessage(from, getTranslation(lang, 'modDiaPrompt'));
            } else if (modTipo === 'hora') {
                currentState.step = 'mod_val_hora';
                userStates.set(from, currentState);
                await sendModHoraOptions(from, lang, currentState);
            } else {
                currentState.step = 'modificacion_tipo';
                userStates.set(from, currentState);
                await sendMessage(from, getTranslation(lang, 'modOptionsPrompt'));
            }
            break;
        }

        case 'mod_val_comensales': {
            const rawVal = text.trim();
            const numNew = parseInt(rawVal, 10);

            if (isNaN(numNew) || numNew < 1 || numNew > 6) {
                const errMsg = getTranslation(lang, 'maxComensalesErrorMsg');
                await sendMessage(from, errMsg);
                break;
            }

            const reservationId = currentState?.data?.reservationId || null;
            const nombreCliente = currentState?.data?.nombreCliente || null;
            const telefonoReserva = currentState?.data?.telefonoReserva || from.replace(/\D/g, '');
            const reservaActual = currentState?.data?.reservaActual || 'No especificada';

            const detalleMod = formatModificationDetail(nombreCliente, telefonoReserva, from, reservaActual, 'NÚMERO DE COMENSALES', `${numNew} personas`, lang);

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

        case 'mod_val_dia': {
            const cleanInput = text.trim().toLowerCase();
            currentState.data = currentState.data || {};
            currentState.data.modFechas = currentState.data.modFechas || [];

            if (cleanInput === 'btn_finish_mod_fechas' || ['fin', 'finalizar', 'listo', 'ok', 'terminar', 'hecho'].includes(cleanInput)) {
                if (currentState.data.modFechas.length === 0) {
                    await sendMessage(from, getTranslation(lang, 'invalidDateFormatMsg'));
                    break;
                }

                const reservationId = currentState?.data?.reservationId || null;
                const nombreCliente = currentState?.data?.nombreCliente || null;
                const telefonoReserva = currentState?.data?.telefonoReserva || from.replace(/\D/g, '');
                const reservaActual = currentState?.data?.reservaActual || 'No especificada';

                const datesStr = currentState.data.modFechas.join(', ');
                const detalleMod = formatModificationDetail(nombreCliente, telefonoReserva, from, reservaActual, 'FECHA(S) DE PREFERENCIA', datesStr, lang);

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

            if (cleanInput === 'btn_add_mod_fecha') {
                let msg = `📅 *Indícanos la siguiente fecha de preferencia (formato DD/MM/AAAA):*`;
                if (lang === 'eu') msg = `📅 *Eman hurrengo data hobetsia (DD/MM/AAAA formatuan):*`;
                else if (lang === 'en') msg = `📅 *Please specify the next preferred date (DD/MM/AAAA format):*`;
                await sendMessage(from, msg);
                break;
            }

            const newDates = parseAndValidateDates(text);

            if (newDates.length === 0) {
                await sendMessage(from, getTranslation(lang, 'invalidDateFormatMsg'));
                break;
            }

            for (const d of newDates) {
                const closedCheck = checkRestaurantClosedDate(d);
                if (closedCheck) {
                    const msgKey = closedCheck.reason === 'vacation' ? 'closedVacationMsg' : 'closedMondayMsg';
                    const msgText = getTranslation(lang, msgKey).replace('{date}', d);
                    await sendMessage(from, msgText);
                } else {
                    if (!currentState.data.modFechas.includes(d) && currentState.data.modFechas.length < 5) {
                        currentState.data.modFechas.push(d);
                    }
                }
            }

            userStates.set(from, currentState);

            if (currentState.data.modFechas.length >= 5) {
                const reservationId = currentState?.data?.reservationId || null;
                const nombreCliente = currentState?.data?.nombreCliente || null;
                const telefonoReserva = currentState?.data?.telefonoReserva || from.replace(/\D/g, '');
                const reservaActual = currentState?.data?.reservaActual || 'No especificada';

                const datesStr = currentState.data.modFechas.join(', ');
                const detalleMod = formatModificationDetail(nombreCliente, telefonoReserva, from, reservaActual, 'FECHA(S) DE PREFERENCIA', datesStr, lang);

                await requestUserConfirmation(from, lang, {
                    tipoAccion: 'SOLICITUD MODIFICACIÓN DE RESERVA',
                    reservationId: reservationId,
                    isModification: true,
                    detalleMod: detalleMod,
                    nombreCliente: nombreCliente,
                    telefonoReserva: telefonoReserva,
                    successMsgKey: 'modSuccessMsg'
                });
            } else if (currentState.data.modFechas.length > 0) {
                const count = currentState.data.modFechas.length;
                const datesListStr = currentState.data.modFechas.map(f => `• ${f}`).join('\n');
                const promptBody = `📌 *Nuevas fechas de preferencia guardadas (${count}/5):*\n${datesListStr}\n\n¿Deseas añadir otra fecha o finalizar la selección?`;

                const buttons = [
                    { id: 'btn_add_mod_fecha', title: getTranslation(lang, 'btnAddOtraFecha').slice(0, 20) },
                    { id: 'btn_finish_mod_fechas', title: getTranslation(lang, 'btnFinalizarFechas').slice(0, 20) }
                ];
                await sendInteractiveButtons(from, promptBody, buttons);
            }
            break;
        }

        case 'mod_val_hora': {
            const rawInput = text.trim();
            if (rawInput.length < 1) {
                await sendModHoraOptions(from, lang, currentState);
                break;
            }

            const reservationId = currentState?.data?.reservationId || null;
            const nombreCliente = currentState?.data?.nombreCliente || null;
            const telefonoReserva = currentState?.data?.telefonoReserva || from.replace(/\D/g, '');
            const reservaActual = currentState?.data?.reservaActual || 'No especificada';

            const detalleMod = formatModificationDetail(nombreCliente, telefonoReserva, from, reservaActual, 'HORA DE PREFERENCIA / TURNO', rawInput, lang);

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

        case 'cancelacion_datos_actuales':
        case 'cancelacion_paso1_nombre': {
            const nombreIngresado = text.trim();
            if (!nombreIngresado) {
                await sendMessage(from, getTranslation(lang, 'cancelDataPrompt'));
                break;
            }

            const currentState = userStates.get(from) || { data: {} };
            currentState.data = currentState.data || {};
            currentState.data.cancelNombre = nombreIngresado;
            currentState.step = 'cancelacion_paso2_fecha';
            userStates.set(from, currentState);

            let promptFecha = `📅 *Indícanos la fecha actual de la reserva que deseas cancelar* (ejemplo: 15/09/2026):`;
            if (lang === 'eu') {
                promptFecha = `📅 *Indíka iezaguzu ezeztatu nahi duzun erreserbaren egungo data* (adibidez: 15/09/2026):`;
            } else if (lang === 'en') {
                promptFecha = `📅 *Please enter the current date of the reservation you wish to cancel* (example: 15/09/2026):`;
            }

            await sendMessage(from, promptFecha);
            break;
        }

        case 'cancelacion_paso2_fecha':
        case 'cancelacion_verificar_datos': {
            const rawDates = parseAndValidateDates(text);
            if (rawDates.length === 0) {
                await sendMessage(from, getTranslation(lang, 'invalidDateFormatMsg'));
                break;
            }

            const fechaIngresada = rawDates[0];
            const closedCheck = checkRestaurantClosedDate(fechaIngresada);
            if (closedCheck) {
                const msgKey = closedCheck.reason === 'vacation' ? 'closedVacationMsg' : 'closedMondayMsg';
                const msgText = getTranslation(lang, msgKey).replace('{date}', fechaIngresada);
                await sendMessage(from, msgText);
                break;
            }

            const currentState = userStates.get(from) || { data: {} };
            const cancelNombre = currentState?.data?.cancelNombre || 'No especificado';

            const detalleCancelacion = 
                `👤 *Nombre del Titular:* ${cancelNombre}\n` +
                `📅 *Fecha de la Reserva a Cancelar:* ${fechaIngresada}\n` +
                `📱 *WhatsApp Remitente:* ${from}\n` +
                `📋 *Solicitud:* SOLICITUD CANCELACIÓN DE RESERVA`;

            await requestUserConfirmation(from, lang, {
                tipoAccion: 'SOLICITUD CANCELACIÓN DE RESERVA',
                isCancellation: true,
                detalleMod: detalleCancelacion,
                nombreCliente: cancelNombre,
                telefonoReserva: from,
                successMsgKey: 'cancelSuccessMsg'
            });
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
                userStates.delete(from);
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
                          `📌 *Egoera:* ${card.estado || 'AKTIBOA'}`;
                } else if (lang === 'en') {
                    msg = `🎁 *GIFT CARD VERIFICATION*\n\n` +
                          `✅ *Code:* ${card.codigo}\n` +
                          `👤 *Holder / Buyer:* ${card.comprador_nombre || 'Not specified'}\n` +
                          `📅 *Expiration Date:* ${card.fecha_caducidad}\n` +
                          `📌 *Status:* ${card.estado || 'ACTIVE'}`;
                } else if (lang === 'fr') {
                    msg = `🎁 *VÉRIFICATION DE CARTE CADEAU*\n\n` +
                          `✅ *Code :* ${card.codigo}\n` +
                          `👤 *Titulaire / Acheteur :* ${card.comprador_nombre || 'Non spécifié'}\n` +
                          `📅 *Date d'expiration :* ${card.fecha_caducidad}\n` +
                          `📌 *Statut :* ${card.estado || 'ACTIF'}`;
                } else {
                    msg = `🎁 *VERIFICACIÓN DE TARJETA REGALO*\n\n` +
                          `✅ *Código:* ${card.codigo}\n` +
                          `👤 *Titular / Comprador:* ${card.comprador_nombre || 'No especificado'}\n` +
                          `📅 *Fecha de Caducidad:* ${card.fecha_caducidad}\n` +
                          `📌 *Estado:* ${card.estado || 'ACTIVA'}`;
                }

                await sendMessage(from, msg);

                const currentStateVal = userStates.get(from) || { data: {} };
                currentStateVal.data = currentStateVal.data || {};
                currentStateVal.data.menuTrad = currentStateVal.data.menuTrad || {};
                currentStateVal.data.menuTrad.card = card;
                currentStateVal.data.menuTrad.cards = [card];
                currentStateVal.data.menuTrad.tarjeta = card.codigo;
                currentStateVal.data.menuTrad.comensales = 2;
                currentStateVal.step = 'menu_trad_after_caducidad_options';
                userStates.set(from, currentStateVal);

                let promptBody = '';
                let btnRes = '';
                let btnExit = '';

                if (lang === 'eu') {
                    promptBody = `¿Erreserba egin nahi duzu txartel honekin edo menura itzuli?`;
                    btnRes = `📅 Erreserbatu`;
                    btnExit = `🏠 Menura itzuli`;
                } else if (lang === 'en') {
                    promptBody = `Would you like to book a table with this card or return to the main menu?`;
                    btnRes = `📅 Book Table`;
                    btnExit = `🏠 Main Menu`;
                } else {
                    promptBody = `¿Deseas reservar tu mesa con esta tarjeta o volver al menú principal?`;
                    btnRes = `📅 Reservar`;
                    btnExit = `🏠 Salir al menú`;
                }

                const buttons = [
                    { id: 'btn_card_gestion_reservar', title: btnRes.slice(0, 20) },
                    { id: 'btn_salir_menu', title: btnExit.slice(0, 20) }
                ];
                await sendInteractiveButtons(from, promptBody, buttons);
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
                userStates.delete(from);

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
            await sendLanguageMenu(from, userLanguages, userStates);
            break;
    }
}

module.exports = {
    handleTextMessage
};
