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
    sendFaqMenu
} = require('./menus');
const { handleFaqSelection } = require('./faq');
const { requestUserConfirmation } = require('./confirmation');
const {
    handleRegalarMenuTradicion,
    sendGiftCardOptions,
    handleMenuTradSlotSelection,
    sendMenuTradDaysList,
    sendConfirmTwoGuestsPrompt,
    sendHowManyGuestsPrompt,
    sendMenuTradChildrenPrompt
} = require('./giftCardFlow');
const {
    sendModHoraOptions,
    handleModHoraSelection
} = require('./modCancelFlow');
const {
    parseAndValidateDates,
    checkRestaurantClosedDate,
    getDayOfWeekFromDateStr,
    isValidEmail,
    getInvalidEmailMsg,
    formatModificationDetail,
    validateAndParseModShifts,
    isValidPersonName,
    getInvalidNameMsg,
    validateSingleDate,
    getDateValidationErrorMsg,
    formatCombinedDateErrorMsg,
    isWithin24Hours
} = require('./utils');

const {
    handleListResponse,
    handleButtonResponse,
    sendWaitlistNinosPrompt,
    sendAllergiesList,
    handleAllergiesListSelection,
    sendWaitlistDaysList,
    handleWaitlistDaySelection,
    handleWaitlistSlotSelection,
    sendConsultaAbiertaSummary,
    handleNationalitySelection,
    processMenuTradReservation
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
        if (['1', 'es', 'español', 'espanol', 'castellano', 'spanish'].includes(cleanText)) {
            userLanguages.set(from, 'es');
            userStates.set(from, { step: 'select_location', data: {} });
            await showLocationOrMainMenu(from, userLocations, userLanguages, userStates);
            return;
        }
        if (['2', 'eu', 'euskara', 'euskera', 'basque'].includes(cleanText)) {
            userLanguages.set(from, 'eu');
            userStates.set(from, { step: 'select_location', data: {} });
            await showLocationOrMainMenu(from, userLocations, userLanguages, userStates);
            return;
        }
        if (['3', 'en', 'english', 'ingles', 'inglés'].includes(cleanText)) {
            userLanguages.set(from, 'en');
            userStates.set(from, { step: 'select_location', data: {} });
            await showLocationOrMainMenu(from, userLocations, userLanguages, userStates);
            return;
        }
        userStates.delete(from);
        userLocations.delete(from);
        await sendLanguageMenu(from, userLanguages, userStates);
        return;
    }

    switch (currentState.step) {
        case 'select_location': {
            if (['1', 'tolosa', 'pais vasco', 'país vasco', 'euskadi', 'pv', 'gipuzkoa', 'guipuzcoa'].includes(cleanText)) {
                await handleButtonResponse(from, 'loc_pais_vasco');
            } else if (['2', 'madrid', 'zurbano', 'calle zurbano'].includes(cleanText)) {
                await handleButtonResponse(from, 'loc_madrid');
            } else {
                await showLocationOrMainMenu(from, userLocations, userLanguages, userStates);
            }
            break;
        }

        case 'main_menu': {
            if (['1', 'reservar', 'reserva', 'quiero reservar', 'erreserbatu', 'book', 'booking', 'mesa', 'table'].some(k => cleanText === k || cleanText.startsWith(k + ' '))) {
                await handleListResponse(from, 'opt_quiero_reservar');
            } else if (['2', 'modificar', 'modificacion', 'modificación', 'aldatu', 'modify', 'cambiar'].some(k => cleanText === k || cleanText.startsWith(k + ' '))) {
                await handleListResponse(from, 'opt_modificacion');
            } else if (['3', 'cancelar', 'cancelacion', 'cancelación', 'ezeztatu', 'cancel', 'anular'].some(k => cleanText === k || cleanText.startsWith(k + ' '))) {
                await handleListResponse(from, 'opt_cancelacion');
            } else if (['4', 'consulta', 'consulta abierta', 'kontsulta', 'inquiry', 'pregunta', 'hablar', 'recepcion', 'recepción'].some(k => cleanText === k || cleanText.startsWith(k + ' '))) {
                await handleListResponse(from, 'opt_consulta_abierta');
            } else if (['5', 'faq', 'dudas', 'otras', 'otras cuestiones', 'carta', 'menu', 'menú', 'informacion', 'información', 'besteak', 'other'].some(k => cleanText === k || cleanText.startsWith(k + ' '))) {
                await handleListResponse(from, 'opt_otras_cuestiones');
            } else {
                await sendMainMenu(from, userLanguages, userStates);
            }
            break;
        }

        case 'confirmacion_solicitud': {
            const lower = text.trim().toLowerCase();
            if (['si', 'sí', 'bai', 'yes', 's', 'confirmar', 'enviar'].includes(lower)) {
                await handleButtonResponse(from, 'confirm_yes');
            } else {
                await handleButtonResponse(from, 'confirm_no');
            }
            break;
        }

        case 'espera_step0_init':
        case 'espera_step1_nombre':
        case 'espera_step1b2_email':
        case 'espera_step1c_nac':
        case 'espera_step2_comensales':
        case 'espera_step3_tipo':
        case 'espera_step3_hora':
        case 'espera_step4_cena':
        case 'espera_step4_dia1':
        case 'espera_step4_dia2':
        case 'espera_step4_dia3':
        case 'espera_step4_dias':
        case 'espera_step5_ninos':
        case 'espera_step6_alergias':
        case 'espera_step6_alergia_custom': {
            await handleButtonResponse(from, 'btn_add_lista_espera');
            break;
        }

        case 'menu_trad_step1_tarjeta': {
            const cardInput = text.trim().toUpperCase();
            const card = await db.getGiftCard(cardInput);

            if (card) {
                if (card.activo === false) {
                    let inactiveMsg = `⚠️ La tarjeta regalo *${card.codigo}* no se encuentra *ACTIVA* actualmente. Por favor, contacta con recepción o introduce otro código:`;
                    if (lang === 'eu') inactiveMsg = `⚠️ *${card.codigo}* opari-txartela ez dago *AKTIBO* une honetan. Mesedez, jarri harremanetan harrerarekin edo sartu beste kode bat:`;
                    else if (lang === 'en') inactiveMsg = `⚠️ Gift card *${card.codigo}* is currently *NOT ACTIVE*. Please contact reception or enter another code:`;
                    await sendMessage(from, inactiveMsg);
                    break;
                }

                const statusUpper = (card.estado || 'DISPONIBLE').toString().trim().toUpperCase();
                
                if (statusUpper !== 'DISPONIBLE' && statusUpper !== 'ACTIVA') {
                    let inactiveMsg = '';
                    if (statusUpper === 'CADUCADA') {
                        inactiveMsg = `⚠️ La tarjeta regalo *${card.codigo}* está *CADUCADA* (plazo máximo de 6 meses superado, válida hasta ${card.fecha_caducidad}). Por favor, introduce otro código:`;
                        if (lang === 'eu') inactiveMsg = `⚠️ *${card.codigo}* opari-txartela *IRAUNGITA* dago (6 hilabeteko epea igaro da, ${card.fecha_caducidad} arte baliogarria zen). Mesedez, sartu beste kode bat:`;
                        else if (lang === 'en') inactiveMsg = `⚠️ Gift card *${card.codigo}* is *EXPIRED* (6-month validity period passed, valid until ${card.fecha_caducidad}). Please enter another code:`;
                    } else if (statusUpper === 'PENDIENTE RESERVA') {
                        inactiveMsg = `⚠️ La tarjeta regalo *${card.codigo}* ya tiene una solicitud de reserva *PENDIENTE DE CONFIRMAR* con recepción. Por favor, introduce otro código:`;
                        if (lang === 'eu') inactiveMsg = `⚠️ *${card.codigo}* opari-txartelak badu dagoeneko harrerarekin *BERRESTEN EGOTEAN* dagoen erreserba eskaera bat. Mesedez, sartu beste kode bat:`;
                        else if (lang === 'en') inactiveMsg = `⚠️ Gift card *${card.codigo}* already has a booking request *PENDING CONFIRMATION* with reception. Please enter another code:`;
                    } else if (statusUpper === 'RESERVADA') {
                        inactiveMsg = `⚠️ La tarjeta regalo *${card.codigo}* ya se encuentra *RESERVADA* para un servicio. Por favor, introduce otro código:`;
                        if (lang === 'eu') inactiveMsg = `⚠️ *${card.codigo}* opari-txartela dagoeneko zerbitzu baterako *ERRESERBATUTA* dago. Mesedez, sartu beste kode bat:`;
                        else if (lang === 'en') inactiveMsg = `⚠️ Gift card *${card.codigo}* is already *RESERVED* for a confirmed service. Please enter another code:`;
                    } else if (statusUpper === 'CONSUMIDA' || statusUpper === 'USADA' || statusUpper === 'CANJEADA') {
                        inactiveMsg = `⚠️ La tarjeta regalo *${card.codigo}* ya ha sido *CONSUMIDA* en el restaurante. Por favor, introduce otro código:`;
                        if (lang === 'eu') inactiveMsg = `⚠️ *${card.codigo}* opari-txartela jatetxean *KONTSUMITUTA* dago dagoeneko. Mesedez, sartu beste kode bat:`;
                        else if (lang === 'en') inactiveMsg = `⚠️ Gift card *${card.codigo}* has already been *CONSUMED* at the restaurant. Please enter another code:`;
                    } else {
                        inactiveMsg = `⚠️ La tarjeta regalo *${card.codigo}* se encuentra en estado *${card.estado}* y no puede usarse para reservar. Por favor, introduce otro código:`;
                    }

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
                    `📅 *Válida hasta:* ${card.fecha_caducidad} (plazo 6 meses)\n` +
                    `📌 *Estado:* DISPONIBLE\n` +
                    `👥 *Comensales del Menú Tradición:* 2 personas por tarjeta`;

                if (lang === 'eu') {
                    cardVerifiedMsg = `🎁 *OPARI-TXARTELA EGOKI EGIAZTATU DA*\n\n` +
                        `✅ *Kodea:* ${card.codigo}\n` +        
                        `📅 *Noiz arte baliogarria:* ${card.fecha_caducidad} (6 hilabeteko epea)\n` +
                        `📌 *Egoera:* ESKURAGARRI\n` +
                        `👥 *Tradizio Menuko jankideak:* 2 pertsona txartel bakoitzeko`;
                } else if (lang === 'en') {
                    cardVerifiedMsg = `🎁 *GIFT CARD VERIFIED SUCCESSFULLY*\n\n` +
                        `✅ *Code:* ${card.codigo}\n` +
                        `📅 *Valid until:* ${card.fecha_caducidad} (6-month period)\n` +
                        `📌 *Status:* AVAILABLE\n` +
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
            const rawName = text.trim();
            if (!isValidPersonName(rawName)) {
                await sendMessage(from, getInvalidNameMsg(lang));
                break;
            }
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            currentState.data.menuTrad.nombre = rawName;
            currentState.data.menuTrad.dni = null;
            currentState.data.menuTrad.email = 'N/A';
            currentState.data.menuTrad.nacionalidad = 'España';
            currentState.step = 'menu_trad_step3_tipo';
            userStates.set(from, currentState);

            const promptBody = getTranslation(lang, 'menuTradStep3Tipo');
            const buttons = [
                { id: 'menu_trad_tipo_comida', title: getTranslation(lang, 'btnComida').slice(0, 20) },
                { id: 'menu_trad_tipo_cena', title: getTranslation(lang, 'btnCena').slice(0, 20) },
                { id: 'menu_trad_tipo_sin_preferencia', title: getTranslation(lang, 'btnSinPreferencia').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, promptBody, buttons);
            break;
        }

        case 'menu_trad_step2b2_email': {
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            const cleanEmail = text.trim();
            if (['omitir', 'utzi', 'skip', 'no', 'btn_skip_email'].includes(cleanEmail.toLowerCase())) {
                currentState.data.menuTrad.email = 'N/A';
            } else if (!isValidEmail(cleanEmail)) {
                const errMsg = getInvalidEmailMsg(lang);
                const buttons = [
                    { id: 'btn_skip_email', title: getTranslation(lang, 'btnOmitirEmail').slice(0, 20) }
                ];
                await sendMessage(from, errMsg);
                await sendInteractiveButtons(from, getTranslation(lang, 'menuTradStep2b2Email'), buttons);
                break;
            } else {
                currentState.data.menuTrad.email = cleanEmail.toLowerCase();
            }

            currentState.step = 'menu_trad_step3_tipo';
            userStates.set(from, currentState);

            const promptBody = getTranslation(lang, 'menuTradStep3Tipo');
            const buttons = [
                { id: 'menu_trad_tipo_comida', title: getTranslation(lang, 'btnComida').slice(0, 20) },
                { id: 'menu_trad_tipo_cena', title: getTranslation(lang, 'btnCena').slice(0, 20) },
                { id: 'menu_trad_tipo_sin_preferencia', title: getTranslation(lang, 'btnSinPreferencia').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, promptBody, buttons);
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
                { id: 'menu_trad_tipo_cena', title: getTranslation(lang, 'btnCena').slice(0, 20) },
                { id: 'menu_trad_tipo_sin_preferencia', title: getTranslation(lang, 'btnSinPreferencia').slice(0, 20) }
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

            const isDinner = currentState.data.menuTrad.tipoServicio === 'Cena' || 
                             ['20:00', '20:30', '21:00', '21:30'].includes(currentState.data.menuTrad.horario);

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

                let n0 = '0 niños', n1 = '1 niño', n2 = '2 niños';
                if (lang === 'eu') {
                    n0 = '0 haur';
                    n1 = '1 haur';
                    n2 = '2 haur';
                } else if (lang === 'en') {
                    n0 = '0 children';
                    n1 = '1 child';
                    n2 = '2 children';
                }

                const buttons = [
                    { id: 'btn_mt_ninos_0', title: n0 },
                    { id: 'btn_mt_ninos_1', title: n1 },
                    { id: 'btn_mt_ninos_2', title: n2 }
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

            const candidates = text.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
            if (candidates.length === 0) {
                await sendMessage(from, getDateValidationErrorMsg({ isValid: false, reason: 'format', date: text }, lang));
                break;
            }

            const invalidItems = [];

            for (const cand of candidates) {
                const val = validateSingleDate(cand, lang, { checkMax6Months: true });
                if (!val.isValid) {
                    invalidItems.push(val);
                } else if (isDinner) {
                    const dayOfWeek = getDayOfWeekFromDateStr(val.formatted);
                    if (dayOfWeek !== 5 && dayOfWeek !== 6) {
                        invalidItems.push({ isValid: false, reason: 'dinner_days', date: val.formatted });
                    } else {
                        if (!currentState.data.menuTrad.fechas.includes(val.formatted) && currentState.data.menuTrad.fechas.length < 5) {
                            currentState.data.menuTrad.fechas.push(val.formatted);
                        }
                    }
                } else {
                    if (!currentState.data.menuTrad.fechas.includes(val.formatted) && currentState.data.menuTrad.fechas.length < 5) {
                        currentState.data.menuTrad.fechas.push(val.formatted);
                    }
                }
            }

            userStates.set(from, currentState);

            if (invalidItems.length > 0) {
                const validFechas = currentState.data.menuTrad.fechas || [];
                const combinedErrorMsg = formatCombinedDateErrorMsg(invalidItems, lang, validFechas);

                if (validFechas.length > 0) {
                    const btnFinishTitle = (lang === 'eu' ? '✅ Datak amaitu' : (lang === 'en' ? '✅ Finish dates' : '✅ Finalizar fechas'));
                    const buttons = [
                        { id: 'btn_finish_fechas', title: btnFinishTitle.slice(0, 20) }
                    ];
                    await sendInteractiveButtons(from, combinedErrorMsg, buttons);
                } else {
                    await sendMessage(from, combinedErrorMsg);
                }
                break;
            }

            if (currentState.data.menuTrad.fechas.length >= 5) {
                const datesStr = currentState.data.menuTrad.fechas.join(', ');
                let maxHeader = `📌 *Has indicado el máximo de 5 fechas de preferencia:* ${datesStr}\n\n`;
                if (lang === 'eu') maxHeader = `📌 *Gehienezko 5 data hobetsiak adierazi dituzu:* ${datesStr}\n\n`;
                else if (lang === 'en') maxHeader = `📌 *You specified the maximum 5 preferred dates:* ${datesStr}\n\n`;

                await sendConfirmTwoGuestsPrompt(from, lang, userStates, maxHeader);
            } else if (currentState.data.menuTrad.fechas.length > 0) {
                const count = currentState.data.menuTrad.fechas.length;
                const datesListStr = currentState.data.menuTrad.fechas.map(f => `• ${f}`).join('\n');
                let savedHeader = `📌 *Nuevas fechas de preferencia guardadas (${count}/5):*`;
                if (lang === 'eu') savedHeader = `📌 *Berezitako data berriak gorde dira (${count}/5):*`;
                else if (lang === 'en') savedHeader = `📌 *New preferred dates saved (${count}/5):*`;

                const promptBody = `${savedHeader}\n${datesListStr}\n\n¿Deseas añadir otra fecha o finalizar la selección?`;

                const btnAddTitle = (lang === 'eu' ? '+ Data bat gehitu' : (lang === 'en' ? '+ Add another date' : '+ Añadir otra fecha'));
                const btnFinishTitle = (lang === 'eu' ? '✅ Datak amaitu' : (lang === 'en' ? '✅ Finish dates' : '✅ Finalizar fechas'));

                const buttons = [
                    { id: 'btn_add_fecha', title: btnAddTitle.slice(0, 20) },
                    { id: 'btn_finish_fechas', title: btnFinishTitle.slice(0, 20) }
                ];
                await sendInteractiveButtons(from, promptBody, buttons);
            }
            break;
        }

        case 'menu_trad_step5_confirm_2_comensales': {
            const cleanTextVal = text.trim().toLowerCase();
            if (cleanTextVal === 'btn_confirm_2_comensales_si' || ['si', 'sí', 'yes', 'bai'].includes(cleanTextVal)) {
                currentState.data = currentState.data || {};
                currentState.data.menuTrad = currentState.data.menuTrad || {};
                currentState.data.menuTrad.comensales = 2;
                userStates.set(from, currentState);
                await sendMenuTradChildrenPrompt(from, lang, userStates);
            } else {
                await sendHowManyGuestsPrompt(from, lang, userStates);
            }
            break;
        }

        case 'menu_trad_step5a_comensales': {
            currentState.data = currentState.data || {};
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            let numComensales = null;
            const cleanTextVal = text.trim().toLowerCase();

            if (cleanTextVal.startsWith('btn_mt_comensales_')) {
                numComensales = parseInt(cleanTextVal.replace('btn_mt_comensales_', ''), 10);
            } else {
                const digits = cleanTextVal.match(/\d+/);
                if (digits) {
                    numComensales = parseInt(digits[0], 10);
                }
            }

            if (!numComensales || isNaN(numComensales) || numComensales < 1 || numComensales > 6) {
                let errorMsg = `⚠️ El número de comensales debe ser *entre 1 y 6 personas* (no aceptamos grupos mayores de 6 comensales).\n\nPor favor, selecciona una de las opciones o introduce un número del 1 al 6:`;
                if (lang === 'eu') {
                    errorMsg = `⚠️ Jankide kopurua *1 eta 6 pertsona artekoa* izan behar da (ez dugu 6 pertsona baino gehiagoko talderik onartzen).\n\nMesedez, aukeratu aukeretako bat edo idatzi 1etik 6rako zenbaki bat:`;
                } else if (lang === 'en') {
                    errorMsg = `⚠️ The number of guests must be *between 1 and 6 people* (we do not accept groups larger than 6 guests).\n\nPlease select one of the options or enter a number from 1 to 6:`;
                }
                await sendMessage(from, errorMsg);
                await sendHowManyGuestsPrompt(from, lang, userStates);
                break;
            }

            currentState.data.menuTrad.comensales = numComensales;
            userStates.set(from, currentState);

            await sendMenuTradChildrenPrompt(from, lang, userStates);
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

                let n0 = '0 niños', n1 = '1 niño', n2 = '2 niños';
                if (lang === 'eu') {
                    n0 = '0 haur';
                    n1 = '1 haur';
                    n2 = '2 haur';
                } else if (lang === 'en') {
                    n0 = '0 children';
                    n1 = '1 child';
                    n2 = '2 children';
                }

                const buttons = [
                    { id: 'btn_mt_ninos_0', title: n0 },
                    { id: 'btn_mt_ninos_1', title: n1 },
                    { id: 'btn_mt_ninos_2', title: n2 }
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

        case 'menu_trad_step6_alergias': {
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            const cleanText = text.trim();
            const lowerText = cleanText.toLowerCase();

            if (['no', 'ninguno', 'ninguna', 'none', '0', 'sin alergias', 'sin alergia', 'ez'].includes(lowerText)) {
                currentState.data.menuTrad.alergias = 'NO';
                currentState.data.menuTrad.selectedAllergies = [];
            } else {
                const prev = currentState.data.menuTrad.selectedAllergies || [];
                if (!prev.includes(cleanText)) prev.push(cleanText);
                currentState.data.menuTrad.selectedAllergies = prev;
                currentState.data.menuTrad.alergias = prev.join(', ');
            }
            userStates.set(from, currentState);

            await processMenuTradReservation(from, lang);
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
            const consultaTexto = text.trim();
            const cleanTextVal = consultaTexto.toLowerCase();

            // 1. Si el cliente escribe/pulsa "Enviar solicitud" o "Submit request" o "Bidali eskaera"
            if (cleanTextVal === 'enviar' || cleanTextVal === 'enviar solicitud' || cleanTextVal === 'submit' || cleanTextVal === 'submit request' || cleanTextVal === 'bidali' || cleanTextVal === 'bidali eskaera' || cleanTextVal.includes('enviar solicitud') || cleanTextVal.includes('submit request') || cleanTextVal.includes('bidali eskaera')) {
                await handleButtonResponse(from, 'btn_consulta_enviar');
                break;
            }

            // 2. Si el cliente escribe/pulsa "Otra consulta" o "Add inquiry"
            if (cleanTextVal === 'otra consulta' || cleanTextVal === 'otra' || cleanTextVal === 'añadir' || cleanTextVal === 'anadir' || cleanTextVal === 'gehitu' || cleanTextVal === 'add' || cleanTextVal === 'add inquiry' || cleanTextVal === 'beste galdera bat') {
                await handleButtonResponse(from, 'btn_consulta_otra');
                break;
            }

            // 3. Si el cliente escribe directamente su siguiente consulta como texto
            if (consultaTexto.length < 3) {
                let msg = `⚠️ Por favor, escribe tu consulta detalladamente o pulsa [Enviar solicitud] para finalizar:`;
                if (lang === 'eu') msg = `⚠️ Mesedez, idatzi zure galdera xehetasunez edo sakatu [Bidali eskaera] amaitzeko:`;
                else if (lang === 'en') msg = `⚠️ Please enter your question in detail or tap [Submit request] to finish:`;
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

            if (!isValidPersonName(nombreCliente)) {
                await sendMessage(from, getInvalidNameMsg(lang));
                break;
            }

            currentState.data = currentState.data || {};
            currentState.data.nombreCliente = nombreCliente;
            currentState.data.telefonoReserva = telefonoCliente;
            currentState.step = 'modificacion_fecha_reserva';
            userStates.set(from, currentState);

            let promptFecha = `📅 *Indícanos la fecha actual de la reserva que deseas modificar:* (ejemplo:DD/MM/AAAA):`;
            if (lang === 'eu') promptFecha = `📅 *Mesedez, adierazi aldatu nahi duzun erreserbaren egungo data:* (adibidez: DD/MM/AAAA):`;
            else if (lang === 'en') promptFecha = `📅 *Please specify the current date of the reservation you wish to modify:* (example: DD/MM/AAAA):`;

            await sendMessage(from, promptFecha);
            break;
        }

        case 'modificacion_fecha_reserva': {
            const val = validateSingleDate(text, lang);
            if (!val.isValid) {
                await sendMessage(from, getDateValidationErrorMsg(val, lang));
                break;
            }

            const fechaReservaOriginal = val.formatted;

            const nombreCliente = currentState.data?.nombreCliente || 'Cliente';
            const telefonoCliente = currentState.data?.telefonoReserva || from.replace(/\D/g, '');

            currentState.data.fechaReservaOriginal = fechaReservaOriginal;
            currentState.data.reservaActual = `${nombreCliente} (${telefonoCliente}) - Fecha: ${fechaReservaOriginal}`;

            const modTipo = currentState.data.modTipo;
            if (modTipo === 'comensales') {
                currentState.step = 'mod_val_comensales';
                userStates.set(from, currentState);

                let notice24h = '';
                if (isWithin24Hours(fechaReservaOriginal)) {
                    if (lang === 'eu') notice24h = '\n\n⚠️ *Kide kopurua txikitzeak kargu gehigarriak ekar ditzake.*';
                    else if (lang === 'en') notice24h = '\n\n⚠️ *Reductions in the number of guests may be subject to additional charges.*';
                    else notice24h = '\n\n⚠️ *Las disminuciones en el número de comensales pueden verse sometidas a cargos adicionales.*';
                }

                let promptMsg = `📌 *Modificación de comensales para ${nombreCliente} (Reserva fecha: ${fechaReservaOriginal})*${notice24h}\n\nIndica el nuevo número de comensales deseado (máx. 6):`;
                if (lang === 'eu') promptMsg = `📌 *Kide kopuruaren aldaketa ${nombreCliente} izenean (${fechaReservaOriginal} erreserba-data)*${notice24h}\n\nIdatzi kide kopuru berria (geh. 6):`;
                else if (lang === 'en') promptMsg = `📌 *Guest count modification for ${nombreCliente} (Reservation date: ${fechaReservaOriginal})*${notice24h}\n\nEnter the new number of guests (max. 6):`;
                await sendMessage(from, promptMsg);
            } else if (modTipo === 'dia') {
                currentState.step = 'mod_val_dia';
                currentState.data.modFechas = [];
                userStates.set(from, currentState);
                await sendMessage(from, getTranslation(lang, 'modDiaPrompt'));
            } else if (modTipo === 'hora') {
                currentState.step = 'mod_val_hora';
                currentState.data.modHoras = [];
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

            const isFinishCommand = cleanInput === 'btn_finish_mod_fechas' ||
                                    cleanInput === 'btn_finish_fechas' ||
                                    cleanInput.includes('finalizar') ||
                                    cleanInput.includes('terminar') ||
                                    ['fin', 'listo', 'ok', 'hecho'].includes(cleanInput);

            if (isFinishCommand) {
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

            const isAddCommand = cleanInput === 'btn_add_mod_fecha' ||
                                 cleanInput.includes('añadir') ||
                                 cleanInput.includes('anadir') ||
                                 cleanInput.includes('gehitu') ||
                                 cleanInput.includes('add') ||
                                 cleanInput.includes('+');

            if (isAddCommand) {
                let msg = `📅 *Fechas de Preferencia para Modificación*\n\nPor favor, indícanos tus fechas de preferencia deseada para la modificación (puedes indicar hasta 5 fechas de preferencia, ej: 15/08/2026, 16/08/2026):`;
                if (lang === 'eu') {
                    msg = `📅 *Aldaketarako Hobetsitako Datak*\n\nMesedez, adierazi aldatzeko hobetsitako datak (gehienez 5 data adieraz ditzakezu, adib: 15/08/2026, 16/08/2026):`;
                } else if (lang === 'en') {
                    msg = `📅 *Preferred Dates for Modification*\n\nPlease specify your preferred dates for modification (you can specify up to 5 dates, e.g. 15/08/2026, 16/08/2026):`;
                }
                await sendMessage(from, msg);
                break;
            }

            const candidates = text.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
            if (candidates.length === 0) {
                await sendMessage(from, getDateValidationErrorMsg({ isValid: false, reason: 'format', date: text }, lang));
                break;
            }

            const invalidItems = [];

            for (const cand of candidates) {
                const val = validateSingleDate(cand, lang);
                if (!val.isValid) {
                    invalidItems.push(val);
                } else {
                    if (!currentState.data.modFechas.includes(val.formatted) && currentState.data.modFechas.length < 5) {
                        currentState.data.modFechas.push(val.formatted);
                    }
                }
            }

            userStates.set(from, currentState);

            if (invalidItems.length > 0) {
                const validFechas = currentState.data.modFechas || [];
                const combinedErrorMsg = formatCombinedDateErrorMsg(invalidItems, lang, validFechas);

                if (validFechas.length > 0) {
                    const btnFinishTitle = (lang === 'eu' ? '✅ Datak amaitu' : (lang === 'en' ? '✅ Finish dates' : '✅ Finalizar fechas'));
                    const buttons = [
                        { id: 'btn_finish_mod_fechas', title: btnFinishTitle.slice(0, 20) }
                    ];
                    await sendInteractiveButtons(from, combinedErrorMsg, buttons);
                } else {
                    await sendMessage(from, combinedErrorMsg);
                }
                break;
            }

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
                let savedHeader = `📌 *Nuevas fechas de preferencia guardadas (${count}/5):*`;
                if (lang === 'eu') savedHeader = `📌 *Berezitako data berriak gorde dira (${count}/5):*`;
                else if (lang === 'en') savedHeader = `📌 *New preferred dates saved (${count}/5):*`;

                const promptBody = `${savedHeader}\n${datesListStr}\n\n¿Deseas añadir otra fecha o finalizar la selección?`;

                const btnAddTitle = (lang === 'eu' ? '+ Data bat gehitu' : (lang === 'en' ? '+ Add another date' : '+ Añadir otra fecha'));
                const btnFinishTitle = (lang === 'eu' ? '✅ Datak amaitu' : (lang === 'en' ? '✅ Finish dates' : '✅ Finalizar fechas'));

                const buttons = [
                    { id: 'btn_add_mod_fecha', title: btnAddTitle.slice(0, 20) },
                    { id: 'btn_finish_mod_fechas', title: btnFinishTitle.slice(0, 20) }
                ];
                await sendInteractiveButtons(from, promptBody, buttons);
            }
            break;
        }

        case 'mod_val_hora': {
            const cleanInput = text.trim().toLowerCase();
            currentState.data = currentState.data || {};
            currentState.data.modHoras = currentState.data.modHoras || [];

            const isFinishCommand = cleanInput === 'btn_finish_mod_horas' ||
                                    cleanInput === 'btn_finish_horas' ||
                                    cleanInput.includes('finalizar') ||
                                    cleanInput.includes('terminar') ||
                                    ['fin', 'listo', 'ok', 'hecho'].includes(cleanInput);

            if (isFinishCommand) {
                if (currentState.data.modHoras.length === 0) {
                    await sendMessage(from, getTranslation(lang, 'invalidDateFormatMsg'));
                    break;
                }

                const reservationId = currentState?.data?.reservationId || null;
                const nombreCliente = currentState?.data?.nombreCliente || null;
                const telefonoReserva = currentState?.data?.telefonoReserva || from.replace(/\D/g, '');
                const reservaActual = currentState?.data?.reservaActual || 'No especificada';

                const timesStr = currentState.data.modHoras.join(', ');
                const detalleMod = formatModificationDetail(nombreCliente, telefonoReserva, from, reservaActual, 'HORA DE PREFERENCIA / TURNO', timesStr, lang);

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

            if (cleanInput === 'btn_add_mod_hora' || cleanInput.includes('añadir') || cleanInput.includes('anadir') || cleanInput.includes('gehitu') || cleanInput.includes('add') || cleanInput.includes('+')) {
                await sendModHoraOptions(from, lang, currentState);
                break;
            }

            const fechaStr = currentState?.data?.fechaReservaOriginal || currentState?.data?.fecha || (Array.isArray(currentState?.data?.modFechas) && currentState.data.modFechas.length > 0 ? currentState.data.modFechas[0] : null);

            const dayOfWeek = getDayOfWeekFromDateStr(fechaStr);
            const isWeekend = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === null);

            const allowedShifts = isWeekend 
                ? ['12:30', '13:00', '13:30', '14:00', '15:15', '20:00', '20:30', '21:00', '21:30']
                : ['12:30', '13:00', '13:30', '14:00', '15:15'];

            const parts = text.split(/[,y\/]+/i).map(p => p.trim()).filter(Boolean);

            const invalidShifts = [];

            for (const p of parts) {
                const isDinnerTime = ['20:00', '20:30', '21:00', '21:30'].some(t => p.includes(t));
                if (isDinnerTime && !isWeekend) {
                    const dayNames = {
                        es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
                        eu: ['igandea', 'astelehena', 'asteartea', 'asteazkena', 'osteguna', 'ostirala', 'larunbata'],
                        en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                    };
                    const dayName = (dayNames[lang] || dayNames.es)[dayOfWeek] || '';

                    let reason = `Cenas solo viernes y sábados (${dayName})`;
                    if (lang === 'eu') reason = `Afariak ostiral eta larunbatetan bakarrik (${dayName})`;
                    else if (lang === 'en') reason = `Dinners only on Fri & Sat (${dayName})`;

                    invalidShifts.push({ time: p, reason });
                    continue;
                }

                const validation = validateAndParseModShifts(p, allowedShifts);
                if (!validation.isValid || validation.validShifts.length === 0) {
                    let reason = 'No es un turno predefinido';
                    if (lang === 'eu') reason = 'Ez da Casa Julianen txanda zehaztu bat';
                    else if (lang === 'en') reason = 'Not a predefined shift';

                    invalidShifts.push({ time: p, reason });
                } else {
                    for (const validTimeStr of validation.validShifts) {
                        if (!currentState.data.modHoras.includes(validTimeStr) && currentState.data.modHoras.length < 5) {
                            currentState.data.modHoras.push(validTimeStr);
                        }
                    }
                }
            }

            if (invalidShifts.length > 0) {
                let savedSection = '';
                if (currentState.data.modHoras.length > 0) {
                    const count = currentState.data.modHoras.length;
                    const validListStr = currentState.data.modHoras.map(h => `• ${h}`).join('\n');
                    let savedHeader = `📌 *Nuevos turnos válidos guardados (${count}/5):*`;
                    if (lang === 'eu') savedHeader = `📌 *Gorde diren txanda baliagarriak (${count}/5):*`;
                    else if (lang === 'en') savedHeader = `📌 *Valid preferred time slots saved (${count}/5):*`;
                    savedSection = `${savedHeader}\n${validListStr}\n\n`;
                }

                let header = '⚠️ *Las siguientes horas no son válidas:*';
                let body = 'Por favor, elige uno de los turnos predefinidos del restaurante:\n• *Comida:* 12:30, 13:00, 13:30, 14:00, 15:15\n• *Cena:* 20:00, 20:30, 21:00, 21:30 (solo Viernes y Sábados)';

                if (lang === 'eu') {
                    header = '⚠️ *Hurrengo orduak ez dira baliozkoak:*';
                    body = 'Mesedez, aukeratu ordutegi zehaztu hauetako bat:\n• *Bazkaria:* 12:30, 13:00, 13:30, 14:00, 15:15\n• *Afaria:* 20:00, 20:30, 21:00, 21:30 (Ostiral eta Larunbatetan bakarrik)';
                } else if (lang === 'en') {
                    header = '⚠️ *The following times are not valid:*';
                    body = 'Please select one of the predefined times:\n• *Lunch:* 12:30, 13:00, 13:30, 14:00, 15:15\n• *Dinner:* 20:00, 20:30, 21:00, 21:30 (Fridays & Saturdays only)';
                }

                const invalidListStr = invalidShifts.map(item => `• *${item.time}*: ${item.reason}`).join('\n');
                await sendMessage(from, `${savedSection}${header}\n${invalidListStr}\n\n${body}`);
            }

            userStates.set(from, currentState);

            if (currentState.data.modHoras.length >= 5) {
                const reservationId = currentState?.data?.reservationId || null;
                const nombreCliente = currentState?.data?.nombreCliente || null;
                const telefonoReserva = currentState?.data?.telefonoReserva || from.replace(/\D/g, '');
                const reservaActual = currentState?.data?.reservaActual || 'No especificada';

                const timesStr = currentState.data.modHoras.join(', ');
                const detalleMod = formatModificationDetail(nombreCliente, telefonoReserva, from, reservaActual, 'HORA DE PREFERENCIA / TURNO', timesStr, lang);

                await requestUserConfirmation(from, lang, {
                    tipoAccion: 'SOLICITUD MODIFICACIÓN DE RESERVA',
                    reservationId: reservationId,
                    isModification: true,
                    detalleMod: detalleMod,
                    nombreCliente: nombreCliente,
                    telefonoReserva: telefonoReserva,
                    successMsgKey: 'modSuccessMsg'
                });
            } else if (currentState.data.modHoras.length > 0) {
                const count = currentState.data.modHoras.length;
                const timesListStr = currentState.data.modHoras.map(h => `• ${h}`).join('\n');
                
                let promptBody = `📌 *Nuevos turnos de preferencia guardados (${count}/5):*\n${timesListStr}\n\n¿Deseas añadir otro turno o finalizar la selección?`;
                if (lang === 'eu') {
                    promptBody = `📌 *Gorde diren txanda hobetsi berriak (${count}/5):*\n${timesListStr}\n\nBeste txanda bat gehitu edo hautapena amaitu nahi duzu?`;
                } else if (lang === 'en') {
                    promptBody = `📌 *New preferred time slots saved (${count}/5):*\n${timesListStr}\n\nWould you like to add another time slot or finish selection?`;
                }

                const buttons = [
                    { id: 'btn_add_mod_hora', title: getTranslation(lang, 'btnAddOtroTurno').slice(0, 20) },
                    { id: 'btn_finish_mod_horas', title: getTranslation(lang, 'btnFinalizarTurnos').slice(0, 20) }
                ];
                await sendInteractiveButtons(from, promptBody, buttons);
            }
            break;
        }

        case 'cancelacion_datos_actuales':
        case 'cancelacion_paso1_nombre': {
            const nombreIngresado = text.trim();
            if (!isValidPersonName(nombreIngresado)) {
                await sendMessage(from, getInvalidNameMsg(lang));
                break;
            }

            const currentState = userStates.get(from) || { data: {} };
            currentState.data = currentState.data || {};
            currentState.data.cancelNombre = nombreIngresado;
            currentState.step = 'cancelacion_paso2_fecha';
            userStates.set(from, currentState);

            let promptFecha = `📅 *Indícanos la fecha actual de la reserva que deseas cancelar* (ejemplo: DD/MM/AAAA):`;
            if (lang === 'eu') {
                promptFecha = `📅 *Indíka iezaguzu ezeztatu nahi duzun erreserbaren egungo data* (adibidez: DD/MM/AAAA):`;
            } else if (lang === 'en') {
                promptFecha = `📅 *Please enter the current date of the reservation you wish to cancel* (example: DD/MM/AAAA):`;
            }

            await sendMessage(from, promptFecha);
            break;
        }

        case 'cancelacion_paso2_fecha':
        case 'cancelacion_verificar_datos': {
            const val = validateSingleDate(text, lang);
            if (!val.isValid) {
                await sendMessage(from, getDateValidationErrorMsg(val, lang));
                break;
            }

            const fechaIngresada = val.formatted;

            const currentState = userStates.get(from) || { data: {} };
            const cancelNombre = currentState?.data?.cancelNombre || 'No especificado';

            let cancelNotice24h = '';
            if (isWithin24Hours(fechaIngresada)) {
                if (lang === 'eu') cancelNotice24h = '\n\n⚠️ *Erreserba 24 ordu baino gutxiagoko aldez aurretik ezeztatuz gero, 45€-ko kargua ezarriko da kide bakoitzeko.*';
                else if (lang === 'en') cancelNotice24h = '\n\n⚠️ *In case of cancelling the reservation with less than 24 hours notice, a fee of €45 per guest will apply.*';
                else cancelNotice24h = '\n\n⚠️ *En el caso de cancelar la reserva con menos de 24 horas de antelación, se aplicará un cargo de 45€ por comensal.*';
            }

            const detalleCancelacion = 
                `👤 *Nombre del Titular:* ${cancelNombre}\n` +
                `📅 *Fecha de la Reserva a Cancelar:* ${fechaIngresada}\n` +
                `📱 *WhatsApp Remitente:* ${from}\n` +
                `📋 *Solicitud:* SOLICITUD CANCELACIÓN DE RESERVA${cancelNotice24h}`;

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

        case 'post_request_options': {
            const cleanTextVal = text.trim().toLowerCase();
            if (cleanTextVal.includes('menu') || cleanTextVal.includes('menú') || cleanTextVal.includes('nagusia')) {
                await handleButtonResponse(from, 'btn_flow_main_menu');
            } else {
                await handleButtonResponse(from, 'btn_flow_finish');
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
                const esActiva = card.activo !== false;
                const estadoTexto = !esActiva ? 'INACTIVA' : (card.estado || 'DISPONIBLE');
                let msg = '';
                if (lang === 'eu') {
                    msg = `🎁 *OPARI-TXARTELAREN EGIAZTAPENA*\n\n` +
                          `✅ *Kodea:* ${card.codigo}\n` +
                          `📅 *Iraungitze data:* ${card.fecha_caducidad || 'Zehaztu gabe'}\n` +
                          `📌 *Egoera:* ${estadoTexto}\n` +
                          `⚡ *Aktibo:* ${esActiva ? 'BAI' : 'EZ'}`;
                } else if (lang === 'en') {
                    msg = `🎁 *GIFT CARD VERIFICATION*\n\n` +
                          `✅ *Code:* ${card.codigo}\n` +
                          `📅 *Expiration Date:* ${card.fecha_caducidad || 'Not specified'}\n` +
                          `📌 *Status:* ${estadoTexto}\n` +
                          `⚡ *Active:* ${esActiva ? 'YES' : 'NO'}`;
                } else {
                    msg = `🎁 *VERIFICACIÓN DE TARJETA REGALO*\n\n` +
                          `✅ *Código:* ${card.codigo}\n` +
                          `📅 *Fecha de Caducidad:* ${card.fecha_caducidad || 'No especificada'}\n` +
                          `📌 *Estado:* ${estadoTexto}\n` +
                          `⚡ *Activo:* ${esActiva ? 'SÍ' : 'NO'}`;
                await sendMessage(from, msg);

                if (esActiva && (card.estado === 'DISPONIBLE' || card.estado === 'ACTIVA')) {
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

                    if (lang === 'eu') {
                        promptBody = `¿Erreserba egin nahi duzu txartel honekin?`;
                        btnRes = `📅 Erreserbatu`;                    
                    } else if (lang === 'en') {
                        promptBody = `Would you like to book a table with this card?`;
                        btnRes = `📅 Book Table`;
                    } else {
                        promptBody = `¿Deseas reservar tu mesa con esta tarjeta?`;
                        btnRes = `📅 Reservar`;
                    }

                    const buttons = [
                        { id: 'btn_card_gestion_reservar', title: btnRes.slice(0, 20) }
                    ];
                    await sendInteractiveButtons(from, promptBody, buttons);
                } else {
                    let invalidReason = `⚠️ Esta tarjeta regalo no es válida para realizar reservas porque no se encuentra activa (${estadoTexto}). Si necesitas ayuda, por favor contacta directamente con recepción.`;
                    if (lang === 'eu') invalidReason = `⚠️ Opari-txartel hau ez da baliagarria erreserbak egiteko ez baitago aktibo (${estadoTexto}). Laguntzarik behar baduzu, jarri harremanetan harrerarekin.`;
                    else if (lang === 'en') invalidReason = `⚠️ This gift card is not valid for bookings as it is not active (${estadoTexto}). If you need assistance, please contact reception.`;
                    
                    await sendMessage(from, invalidReason);
                    await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
                    userStates.delete(from);
                }
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
            if (userLanguages.has(from)) {
                await showLocationOrMainMenu(from, userLocations, userLanguages, userStates);
            } else {
                await sendLanguageMenu(from, userLanguages, userStates);
            }
            break;
    }
}

module.exports = {
    handleTextMessage
};
