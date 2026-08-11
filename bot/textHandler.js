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
    isWithin24Hours
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

            const candidates = text.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
            if (candidates.length === 0) {
                await sendMessage(from, getDateValidationErrorMsg({ isValid: false, reason: 'format', date: text }, lang));
                break;
            }

            for (const cand of candidates) {
                const val = validateSingleDate(cand, lang, { checkMax6Months: true });
                if (!val.isValid) {
                    await sendMessage(from, getDateValidationErrorMsg(val, lang));
                } else if (isDinner) {
                    const dayOfWeek = getDayOfWeekFromDateStr(val.formatted);
                    if (dayOfWeek !== 5 && dayOfWeek !== 6) {
                        const dayNames = {
                            es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
                            eu: ['igandea', 'astelehena', 'asteartea', 'asteazkena', 'osteguna', 'ostirala', 'larunbata'],
                            en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                        };
                        const dayName = (dayNames[lang] || dayNames.es)[dayOfWeek] || '';
                        let dinnerErr = `⚠️ En Asador Casa Julián las cenas únicamente se sirven los *viernes y sábados*. La fecha *${val.formatted}* cae en *${dayName}*.\n\nPor favor, indica una fecha de viernes o sábado para cena:`;
                        if (lang === 'eu') {
                            dinnerErr = `⚠️ Casa Juliánen afariak *ostiral eta larunbatetan* bakarrik ematen dira. *${val.formatted}* data *${dayName}* da.\n\nMesedez, adierazi ostiral edo larunbateko data bat afaria egiteko:`;
                        } else if (lang === 'en') {
                            dinnerErr = `⚠️ At Casa Julián, dinners are only served on *Fridays and Saturdays*. The date *${val.formatted}* is a *${dayName}*.\n\nPlease specify a Friday or Saturday date for dinner:`;
                        }
                        await sendMessage(from, dinnerErr);
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

            if (currentState.data.menuTrad.fechas.length >= 5) {
                const datesStr = currentState.data.menuTrad.fechas.join(', ');
                let maxHeader = `📌 *Has indicado el máximo de 5 fechas de preferencia:* ${datesStr}\n\n`;
                if (lang === 'eu') maxHeader = `📌 *Gehienezko 5 data hobetsiak adierazi dituzu:* ${datesStr}\n\n`;
                else if (lang === 'en') maxHeader = `📌 *You specified the maximum 5 preferred dates:* ${datesStr}\n\n`;

                await sendConfirmTwoGuestsPrompt(from, lang, userStates, maxHeader);
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
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            let numComensales = 2;
            const cleanTextVal = text.trim().toLowerCase();

            if (cleanTextVal.startsWith('btn_mt_comensales_')) {
                numComensales = parseInt(cleanTextVal.replace('btn_mt_comensales_', ''), 10) || 2;
            } else {
                numComensales = parseInt(cleanTextVal.replace(/\D/g, ''), 10) || 2;
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

            for (const cand of candidates) {
                const val = validateSingleDate(cand, lang);
                if (!val.isValid) {
                    await sendMessage(from, getDateValidationErrorMsg(val, lang));
                } else {
                    if (!currentState.data.modFechas.includes(val.formatted) && currentState.data.modFechas.length < 5) {
                        currentState.data.modFechas.push(val.formatted);
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

            const parts = text.split(/[,y\/]+/i).map(p => p.trim()).filter(Boolean);

            for (const p of parts) {
                const validation = validateAndParseModShifts(p, fechaStr, lang);
                if (!validation.isValid) {
                    let errMsg = '';
                    if (validation.reason === 'dinner_not_allowed') {
                        const dayNames = {
                            es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
                            eu: ['igandea', 'astelehena', 'asteartea', 'asteazkena', 'osteguna', 'ostirala', 'larunbata'],
                            en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                        };
                        const dayOfWeek = getDayOfWeekFromDateStr(fechaStr);
                        const dayName = (dayNames[lang] || dayNames.es)[dayOfWeek] || '';

                        if (lang === 'eu') {
                            errMsg = `⚠️ Casa Juliánen afariak *ostiral eta larunbatetan* bakarrik ematen dira. *${fechaStr || ''}* data *${dayName}* da.\n\nMesedez, aukeratu bazkariko txanda zehaztu bat: *12:30, 13:00, 13:30, 14:00, 15:15*`;
                        } else if (lang === 'en') {
                            errMsg = `⚠️ At Casa Julián, dinners are only served on *Fridays and Saturdays*. The date *${fechaStr || ''}* is a *${dayName}*.\n\nPlease select one of the predefined lunch shifts: *12:30, 13:00, 13:30, 14:00, 15:15*`;
                        } else {
                            errMsg = `⚠️ En Asador Casa Julián las cenas únicamente se sirven los *viernes y sábados*. La fecha *${fechaStr || ''}* cae en *${dayName}*.\n\nPor favor, selecciona uno de los turnos de comida predefinidos: *12:30, 13:00, 13:30, 14:00, 15:15*`;
                        }
                    } else {
                        if (lang === 'eu') {
                            errMsg = `⚠️ *${validation.invalidTime || p}* ordua ez da Casa Juliánen txanda zehaztu bat.\n\nMesedez, aukeratu ordutegi zehaztu hauetako bat:\n• *Bazkaria:* 12:30, 13:00, 13:30, 14:00, 15:15\n• *Afaria:* 20:00, 20:30, 21:00, 21:30 (Ostiral eta Larunbatetan bakarrik)`;
                        } else if (lang === 'en') {
                            errMsg = `⚠️ The time *${validation.invalidTime || p}* is not a predefined shift at Casa Julián.\n\nPlease select one of the predefined times:\n• *Lunch:* 12:30, 13:00, 13:30, 14:00, 15:15\n• *Dinner:* 20:00, 20:30, 21:00, 21:30 (Fridays & Saturdays only)`;
                        } else {
                            errMsg = `⚠️ La hora *${validation.invalidTime || p}* no es un turno predefinido en Asador Casa Julián.\n\nPor favor, elige uno de los turnos predefinidos del restaurante:\n• *Comida:* 12:30, 13:00, 13:30, 14:00, 15:15\n• *Cena:* 20:00, 20:30, 21:00, 21:30 (solo Viernes y Sábados)`;
                        }
                    }
                    await sendMessage(from, errMsg);
                } else {
                    const validTimeStr = validation.formatted;
                    if (!currentState.data.modHoras.includes(validTimeStr) && currentState.data.modHoras.length < 5) {
                        currentState.data.modHoras.push(validTimeStr);
                    }
                }
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
                          `📅 *Iraungitze data:* ${card.fecha_caducidad}\n` +
                          `📌 *Egoera:* ${card.estado || 'AKTIBOA'}`;
                } else if (lang === 'en') {
                    msg = `🎁 *GIFT CARD VERIFICATION*\n\n` +
                          `✅ *Code:* ${card.codigo}\n` +
                          `📅 *Expiration Date:* ${card.fecha_caducidad}\n` +
                          `📌 *Status:* ${card.estado || 'ACTIVE'}`;
                } else {
                    msg = `🎁 *VERIFICACIÓN DE TARJETA REGALO*\n\n` +
                          `✅ *Código:* ${card.codigo}\n` +
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
