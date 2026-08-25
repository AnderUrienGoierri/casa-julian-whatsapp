const { 
    sendInteractiveButtons, 
    sendInteractiveList, 
    sendCtaUrlButton,
    sendTemplateMessage,
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
    isValidEmail,
    getInvalidEmailMsg,
    formatModificationDetail
} = require('./utils');

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

    currentState.data.menuTrad = currentState.data.menuTrad || {};
    currentState.data.menuTrad.nacionalidad = selNac;
    currentState.step = 'menu_trad_step3_tipo';
    userStates.set(from, currentState);

    const promptBody = getTranslation(lang, 'menuTradStep3Tipo');
    const buttons = [
        { id: 'menu_trad_tipo_comida', title: getTranslation(lang, 'btnComida').slice(0, 20) },
        { id: 'menu_trad_tipo_cena', title: getTranslation(lang, 'btnCena').slice(0, 20) },
        { id: 'menu_trad_tipo_sin_preferencia', title: getTranslation(lang, 'btnSinPreferencia').slice(0, 20) }
    ];
    await sendInteractiveButtons(from, promptBody, buttons);
}

async function sendWaitlistNinosPrompt(from, lang) {
    // Stub de compatibilidad
    return;
}

function getAllergiesListRows(lang, selectedList = []) {
    let list = [
        { id: 'alg_gluten', title: '🌾 Gluten / Celíacos', desc: 'Intolerancia o alergia al gluten' },
        { id: 'alg_laktosa', title: '🥛 Lactosa / Lácteos', desc: 'Intolerancia a la lactosa o lácteos' },
        { id: 'alg_frutos_huevo', title: '🥜 Frutos secos / Huevo', desc: 'Alergia a frutos secos, cacahuete o huevo' },
        { id: 'alg_marisco_pescado', title: '🦐 Marisco / Pescado', desc: 'Alergia a marisco, crustáceos o pescado' },
        { id: 'alg_diabetes_sal', title: '🩺 Diabetes/Hipertensión', desc: 'Diabético, azúcar o bajo en sal' },
        { id: 'alg_vegano', title: '🥗 Vegetariano / Vegano', desc: 'Dieta vegetariana o vegana' },
        { id: 'alg_otro', title: '✍️ Otra (escribir texto)', desc: 'Escribir otra alergia o enfermedad' }
    ];

    if (lang === 'eu') {
        list = [
            { id: 'alg_gluten', title: '🌾 Glutena / Zeliakoak', desc: 'Glutenarekiko intolerantzia edo alergia' },
            { id: 'alg_laktosa', title: '🥛 Laktosa / Esnekiak', desc: 'Laktosarekiko edo esnekiekiko intolerantzia' },
            { id: 'alg_frutos_huevo', title: '🥜 Fruitu lehorrak/Arrautza', desc: 'Fruitu lehorrak edo arrautzari alergia' },
            { id: 'alg_marisco_pescado', title: '🦐 Mariskoa / Arraina', desc: 'Mariskoari edo arrainari alergia' },
            { id: 'alg_diabetes_sal', title: '🩺 Diabetesa / Gatza', desc: 'Diabetikoa, azukrea edo gatz gutxi' },
            { id: 'alg_vegano', title: '🥗 Begetarianoa/Veganoa', desc: 'Dieta begetarianoa edo veganoa' },
            { id: 'alg_otro', title: '✍️ Bestelakoa (idatzi)', desc: 'Idatzi beste alergia edo gaixotasun bat' }
        ];
    } else if (lang === 'en') {
        list = [
            { id: 'alg_gluten', title: '🌾 Gluten / Celiac', desc: 'Gluten intolerance or celiac condition' },
            { id: 'alg_laktosa', title: '🥛 Lactose / Dairy', desc: 'Lactose intolerance or dairy allergy' },
            { id: 'alg_frutos_huevo', title: '🥜 Nuts / Peanuts / Egg', desc: 'Nut, peanut or egg allergy' },
            { id: 'alg_marisco_pescado', title: '🦐 Seafood / Fish', desc: 'Seafood, shellfish or fish allergy' },
            { id: 'alg_diabetes_sal', title: '🩺 Diabetes / Low Salt', desc: 'Diabetic, sugar-free or low sodium' },
            { id: 'alg_vegano', title: '🥗 Vegetarian / Vegan', desc: 'Vegetarian or vegan diet' },
            { id: 'alg_otro', title: '✍️ Other (write text)', desc: 'Write another allergy or medical condition' }
        ];
    }

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
            title: (isSelected ? '✅ ' : '') + item.title.slice(0, 21),
            description: item.desc.slice(0, 72)
        });
    });

    return rows;
}

async function sendAllergiesList(from, lang, promptTextKey, selectedList = []) {
    const promptBody = getTranslation(lang, promptTextKey);
    const buttonText = getTranslation(lang, 'menuButtonText');
    const rows = getAllergiesListRows(lang, selectedList);

    const sections = [
        {
            title: "Alergias / Intolerancias",
            rows: rows
        }
    ];

    await sendInteractiveList(from, promptBody, buttonText, sections);
}

async function processMenuTradReservation(from, lang) {
    const currentState = userStates.get(from) || { data: {} };
    const chatLang = userLanguages.get(from) || lang || 'es';
    const mt = currentState.data.menuTrad || {};
    const fechasStr = (mt.fechas && mt.fechas.length > 0) ? mt.fechas.join(', ') : 'Sin preferencia';
    
    const resRecord = db.createReservation({
        nombre: mt.nombre || 'Cliente WhatsApp',
        telefono: from,
        dni: mt.dni || 'N/A',
        email: mt.email || 'N/A',
        nacionalidad: mt.nacionalidad,
        fecha: '',
        hora: mt.horario || 'Sin preferencia',
        comensales: mt.comensales || 2,
        estado: 'PENDIENTE CONFIRMACION',
        fechas_preferencia: mt.fechas || [],
        tipo_reserva: 'tarjeta_regalo',
        alergias: mt.alergias || 'NO',
        tipo_servicio: mt.tipoServicio || 'Sin preferencia',
        tarjeta_regalo: mt.tarjeta || null,
        ninos: mt.ninos || mt.num_ninos || 0,
        idioma: chatLang
    });

    let detalleMenuTrad = '';
    if (chatLang === 'eu') {
        detalleMenuTrad = `👤 *Izen-abizenak:* ${mt.nombre || 'Ez zehaztua'}\n` +
                                `🎁 *Opari-Txartel Zenbakia:* ${mt.tarjeta || 'Ez zehaztua'}\n` +
                                `👥 *Jankideak:* ${mt.comensales || 2}\n` +
                                `👶 *Haurrak (<12 urte):* ${mt.ninos || 0}\n` +
                                `🍽️ *Zerbitzua:* ${mt.tipoServicio || 'Hobespenik ez'}\n` +
                                `⏰ *Aukeratutako ordua:* ${mt.horario || 'Hobespenik ez'}\n` +
                                `📅 *Hobetsitako datak:* ${fechasStr}\n` +
                                `⚠️ *Alergiak/Mugak:* ${mt.alergias || 'Ez'}\n` +
                                `📌 *Egoera:* PENDIENTE CONFIRMACION\n` +
                                `📱 *Bidaltzailearen WhatsApp-a:* ${from}\n` +
                                `📋 *Eskaera:* TRADIZIO MENUA ERRESERBA (OPARI TXARTELA)`;
    } else if (chatLang === 'en') {
        detalleMenuTrad = `👤 *Full Name:* ${mt.nombre || 'Not specified'}\n` +
                                `🎁 *Gift Card No.:* ${mt.tarjeta || 'Not specified'}\n` +
                                `👥 *Guests:* ${mt.comensales || 2}\n` +
                                `👶 *Children (<12 yrs):* ${mt.ninos || 0}\n` +
                                `🍽️ *Service:* ${mt.tipoServicio || 'No preference'}\n` +
                                `⏰ *Selected Time:* ${mt.horario || 'No preference'}\n` +
                                `📅 *Preferred Dates:* ${fechasStr}\n` +
                                `⚠️ *Allergies/Restrictions:* ${mt.alergias || 'None'}\n` +
                                `📌 *Status:* PENDIENTE CONFIRMACION\n` +
                                `📱 *Sender WhatsApp:* ${from}\n` +
                                `📋 *Request:* TRADITION MENU BOOKING (GIFT CARD)`;
    } else {
        detalleMenuTrad = `👤 *Nombre:* ${mt.nombre || 'No especificado'}\n` +
                                `🎁 *Nº Tarjeta Regalo:* ${mt.tarjeta || 'No especificado'}\n` +
                                `👥 *Comensales:* ${mt.comensales || 2}\n` +
                                `👶 *Niños (<12 años):* ${mt.ninos || 0}\n` +
                                `🍽️ *Servicio:* ${mt.tipoServicio || 'Sin preferencia'}\n` +
                                `⏰ *Hora seleccionada:* ${mt.horario || 'Sin preferencia'}\n` +
                                `📅 *Fechas de preferencia:* ${fechasStr}\n` +
                                `⚠️ *Alergias/Restricciones:* ${mt.alergias || 'Ninguna'}\n` +
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
        idioma: chatLang,
        reservationId: resRecord.id,
        successMsgKey: 'menuTradicionSuccessMsg'
    }, userStates);
}

async function handleAllergiesListSelection(from, listId, lang) {
    const currentState = userStates.get(from) || { data: {} };
    const isMenuTrad = currentState.step.startsWith('menu_trad');
    const formKey = isMenuTrad ? 'menuTrad' : 'waitlist';

    currentState.data[formKey] = currentState.data[formKey] || {};
    currentState.data[formKey].selectedAllergies = currentState.data[formKey].selectedAllergies || [];

    if (listId === 'alg_no') {
        currentState.data[formKey].alergias = 'NO';
        currentState.data[formKey].selectedAllergies = [];
        if (isMenuTrad) {
            userStates.set(from, currentState);
            await processMenuTradReservation(from, lang);
        } else {
            currentState.step = 'espera_step7_idioma';
            userStates.set(from, currentState);
            await sendFormLanguageList(from, lang);
        }
        return;
    }

    if (listId === 'alg_finish') {
        const sel = currentState.data[formKey].selectedAllergies;
        currentState.data[formKey].alergias = sel.length > 0 ? sel.join(', ') : 'NO';
        if (isMenuTrad) {
            userStates.set(from, currentState);
            await processMenuTradReservation(from, lang);
        } else {
            currentState.step = 'espera_step7_idioma';
            userStates.set(from, currentState);
            await sendFormLanguageList(from, lang);
        }
        return;
    }

    if (listId === 'alg_otro') {
        currentState.step = isMenuTrad ? 'menu_trad_step6_alergia_custom' : 'espera_step6_alergia_custom';
        userStates.set(from, currentState);
        await sendMessage(from, getTranslation(lang, 'promptCustomAllergy'));
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
    if (selectedName) {
        const idx = currentState.data[formKey].selectedAllergies.indexOf(selectedName);
        if (idx >= 0) {
            currentState.data[formKey].selectedAllergies.splice(idx, 1);
        } else {
            currentState.data[formKey].selectedAllergies.push(selectedName);
        }
    }
    userStates.set(from, currentState);

    await sendAllergiesList(from, lang, 'menuTradStep6Alergias', currentState.data[formKey].selectedAllergies);
}

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
        await sendMenuTradDaysList(from, lang, userStates);
    }
}

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

async function sendConsultaAbiertaSummary(from, lang, consultas = []) {
    let summaryText = '';
    const inquiriesFormatted = consultas.map((q, idx) => `${idx + 1}. ${q}`).join('\n');

    if (lang === 'eu') {
        summaryText = `📋 *Zure erregistratutako galdera(k):*\n${inquiriesFormatted}\n\n(Zuzenean beste galdera bat idatz dezakezu)`;
    } else if (lang === 'en') {
        summaryText = `📋 *Your registered inquiry/inquiries:*\n${inquiriesFormatted}\n\n(You can type another question directly)`;
    } else {
        summaryText = `📋 *Tu(s) consulta(s) registrada(s):*\n${inquiriesFormatted}\n\n(Puedes escribir directamente otra consulta)`;
    }

    const btnAddTitle = (lang === 'eu' ? 'Beste galdera bat' : (lang === 'en' ? 'Add inquiry' : 'Otra consulta'));
    const btnSendTitle = (lang === 'eu' ? 'Bidali eskaera' : (lang === 'en' ? 'Submit request' : 'Enviar solicitud'));

    const buttons = [
        { id: 'btn_consulta_otra', title: btnAddTitle.slice(0, 20) },
        { id: 'btn_consulta_enviar', title: btnSendTitle.slice(0, 20) }
    ];

    await sendInteractiveButtons(from, summaryText, buttons);
}

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

        case 'opt_modificacion': {
            userStates.set(from, { step: 'modificacion_tipo_inicial', data: {} });
            const modBody = getTranslation(lang, 'modOptionsPrompt');
            const modButtons = [
                { id: 'mod_comensales', title: getTranslation(lang, 'modOptComensales').slice(0, 20) },
                { id: 'mod_dia', title: getTranslation(lang, 'modOptDia').slice(0, 20) },
                { id: 'mod_hora', title: getTranslation(lang, 'modOptHora').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, modBody, modButtons);
            break;
        }

        case 'opt_cancelacion':
        case 'btn_go_cancelacion':
            userStates.set(from, { step: 'cancelacion_datos_actuales', data: {} });
            await sendMessage(from, getTranslation(lang, 'cancelDataPrompt'));
            break;

        case 'opt_consulta_abierta': {
            userStates.set(from, { step: 'consulta_abierta_paso1_texto', data: {} });
            let promptMsg = `💬 *Consulta Abierta (Casuísticas Especiales)*\n\nPor favor, indícanos a continuación tu duda o consulta (preguntas sobre embarazadas, mascotas de asistencia, eventos o cualquier necesidad especial):\n\nNuestro equipo la revisará y te responderemos lo antes posible.`;
            if (lang === 'eu') {
                promptMsg = `💬 *Galdera Irekia (Kasuistika Bereziak)*\n\nMesedez, idatzi hemen zure zalantza edo kontsulta (haurdunaldia, laguntza-txakurrak edo zeinahi behar berezi):\n\nGure lantaldeak zure mezua aztertuko du eta ahalik eta azkien erantzungo dizu.`;
            } else if (lang === 'en') {
                promptMsg = `💬 *Open Inquiry (Special Requests)*\n\nPlease type your inquiry or special request below (pregnancy restrictions, assistance animals, special requirements, etc.):\n\nOur team will review your message and respond as soon as possible.`;
            }
            await sendMessage(from, promptMsg);
            break;
        }

        case 'opt_regalar_menu_tradicion':
            await handleRegalarMenuTradicion(from, lang, userStates);
            break;

        case 'opt_otras_cuestiones':
            await sendFaqMenu(from, lang, userStates);
            break;

        case 'opt_cambiar_idioma':
            await sendLanguageMenu(from, userLanguages, userStates);
            break;

        default:
            if (listId.startsWith('wl_slot_')) {
                await handleWaitlistSlotSelection(from, listId, lang);
            } else if (listId.startsWith('wl_day')) {
                await handleWaitlistDaySelection(from, listId, lang);
            } else if (listId.startsWith('mt_slot_')) {
                await handleMenuTradSlotSelection(from, listId, lang, userStates);
            } else if (listId.startsWith('mt_day')) {
                await handleMenuTradDaySelection(from, listId, lang);
            } else if (listId.startsWith('faq_')) {
                await handleFaqSelection(from, listId, lang, handleRegalarMenuTradicion);
            } else if (listId.startsWith('nac_')) {
                await handleNationalitySelection(from, listId, lang);
            } else if (listId.startsWith('mod_time_')) {
                const rawTime = listId.replace('mod_time_', '');
                const timeFormatted = rawTime.slice(0, 2) + ':' + rawTime.slice(2);
                await handleModHoraSelection(from, timeFormatted, userStates, userLanguages);
            } else if (listId.startsWith('form_lang_')) {
                await handleButtonResponse(from, listId);
            } else if (listId.startsWith('alg_')) {
                await handleAllergiesListSelection(from, listId, lang);
            } else {
                await sendLanguageMenu(from, userLanguages, userStates);
            }
            break;
    }
}

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
            await sendMainMenu(from, userLanguages, userStates);
            break;

        case 'btn_go_modificacion': {
            userStates.set(from, { step: 'modificacion_tipo_inicial', data: {} });
            const modBody = getTranslation(lang, 'modOptionsPrompt');
            const modButtons = [
                { id: 'mod_comensales', title: getTranslation(lang, 'modOptComensales').slice(0, 20) },
                { id: 'mod_dia', title: getTranslation(lang, 'modOptDia').slice(0, 20) },
                { id: 'mod_hora', title: getTranslation(lang, 'modOptHora').slice(0, 20) }
            ];
            await sendInteractiveButtons(from, modBody, modButtons);
            break;
        }

        case 'btn_go_cancelacion':
            userStates.set(from, { step: 'cancelacion_datos_actuales', data: {} });
            await sendMessage(from, getTranslation(lang, 'cancelDataPrompt'));
            break;

        case 'btn_volver_menu':
            await showLocationOrMainMenu(from, userLocations, userLanguages, userStates);
            break;

        case 'btn_reserva_con_tarjeta':
        case 'waitlist_init_si':
        case 'waitlist_menu_si':
            await sendGiftCardOptions(from, lang, userStates);
            break;

        case 'btn_reserva_sin_tarjeta':
        case 'btn_reserva_web':
        case 'btn_solicitar_reserva':
        case 'btn_add_lista_espera':
        case 'btn_go_lista_espera':
        case 'opt_lista_espera': {
            let templateName = 'reserva_online_web';
            let tLang = 'es';
            if (lang === 'en') {
                templateName = 'book_a_table_web';
                tLang = 'en';
            } else if (lang === 'eu') {
                templateName = 'erreserba_online_web';
                tLang = 'es';
            }

            let templateRes = await sendTemplateMessage(from, templateName, tLang);
            if (!templateRes || !templateRes.messages) {
                templateRes = await sendTemplateMessage(from, 'reserva_online_web', 'es');
            }

            if (!templateRes || !templateRes.messages) {
                let webMsg = `📅 *SOLICITAR RESERVA / LISTA DE ESPERA ONLINE*\n\nPara realizar tu reserva directamente en la web oficial de Casa Julián (o inscribirte en la lista de espera si la fecha deseada está completa), accede a través del siguiente enlace oficial:\n\n🌐 https://casajulian.eus/#shopify-section-template--28289495892308__reservation_iframe_AqMBUi`;
                if (lang === 'eu') {
                    webMsg = `📅 *ONLINE ERRESERBA / ITXARON-ZERRENDA*\n\nZure erreserba zuzenean Casa Julián-eko webgune ofizialean egiteko (edo itxaron-zerrendan izena emateko nahi duzun data beteta badago), sartu webgune ofizialean:\n\n🌐 https://casajulian.eus/eu/#shopify-section-template--28289495892308__reservation_iframe_AqMBUi`;
                } else if (lang === 'en') {
                    webMsg = `📅 *ONLINE BOOKING / WAITLIST*\n\nTo make your reservation directly on Casa Julián's official website (or join the waitlist if your preferred date is full), please visit the official link:\n\n🌐 https://casajulian.eus/en/#shopify-section-template--28289495892308__reservation_iframe_AqMBUi`;
                }
                await sendMessage(from, webMsg);
            }

            // Enviar inmediatamente los dos botones de acción post-reserva
            await new Promise(resolve => setTimeout(resolve, 800));
            const postButtons = [
                { id: 'btn_volver_menu', title: (getTranslation(lang, 'btnPostMenuPrincipal') || 'Menú Principal').slice(0, 20) },
                { id: 'btn_terminar', title: (getTranslation(lang, 'btnPostTerminar') || 'Terminar').slice(0, 20) }
            ];
            const postPrompt = getTranslation(lang, 'postWebReservaPrompt') || '¿Deseas realizar alguna otra gestión o finalizar la conversación?';
            await sendInteractiveButtons(from, postPrompt, postButtons);
            userStates.delete(from);
            break;
        }

        case 'btn_terminar': {
            await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
            userStates.delete(from);
            break;
        }

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
            const card = state.data?.menuTrad?.card || (state.data?.menuTrad?.cards && state.data.menuTrad.cards[0]);
            
            if (card && (card.activo === false || (card.estado && card.estado !== 'DISPONIBLE' && card.estado !== 'ACTIVA'))) {
                let inactiveMsg = `⚠️ La tarjeta regalo *${card.codigo}* no es válida para reservar porque se encuentra *INACTIVA* (${card.estado || 'NO VÁLIDA'}). Por favor, contacta con recepción para más información.`;
                if (lang === 'eu') inactiveMsg = `⚠️ *${card.codigo}* opari-txartela ez da baliagarria erreserba egiteko *EZ-AKTIBO* dagoelako (${card.estado || 'EZ BALIAGARRIA'}). Mesedez, jarri harremanetan harrerarekin.`;
                else if (lang === 'en') inactiveMsg = `⚠️ Gift card *${card.codigo}* is not valid for booking because it is *INACTIVE* (${card.estado || 'NOT VALID'}). Please contact reception for more information.`;
                await sendMessage(from, inactiveMsg);
                await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
                userStates.delete(from);
                break;
            }

            state.data.menuTrad = state.data.menuTrad || {};
            state.step = 'menu_trad_step2_nombre';
            userStates.set(from, state);
            await sendMessage(from, getTranslation(lang, 'menuTradStep2Nombre'));
            break;
        }

        case 'btn_card_gestion_caducidad': {
            const state = userStates.get(from) || { data: {} };
            const card = state.data?.menuTrad?.card || (state.data?.menuTrad?.cards && state.data.menuTrad.cards[0]);
            const cardCode = card ? card.codigo : 'MT-2026';
            const cardExpiry = card ? (card.fecha_caducidad || 'No especificada') : 'No especificada';
            const cardComprador = card ? (card.nombre_comensal || card.nombre_compra || 'No especificado') : 'No especificado';

            let cadMsg = '';
            if (lang === 'eu') {
                cadMsg = `🎁 *OPARI-TXARTELAREN EGIAZTAPENA*\n\n` +
                         `👤 *Izena:* ${cardComprador}\n` +
                         `✅ *Kodea:* ${cardCode}\n` +
                         `📅 *Iraungitze data:* ${cardExpiry}\n` +
                         `⚡ *Aktibo:* ${esActiva ? 'BAI' : 'EZ'}`;
            } else if (lang === 'en') {
                cadMsg = `🎁 *GIFT CARD VERIFICATION*\n\n` +
                         `👤 *Name:* ${cardComprador}\n` +
                         `✅ *Code:* ${cardCode}\n` +
                         `📅 *Expiration Date:* ${cardExpiry}\n` +
                         `⚡ *Active:* ${esActiva ? 'YES' : 'NO'}`;
            } else {
                cadMsg = `🎁 *VERIFICACIÓN DE TARJETA REGALO*\n\n` +
                         `👤 *Nombre:* ${cardComprador}\n` +
                         `✅ *Código:* ${cardCode}\n` +
                         `📅 *Fecha de Caducidad:* ${cardExpiry}\n` +
                         `⚡ *Activo:* ${esActiva ? 'SÍ' : 'NO'}`;
            }

            await sendMessage(from, cadMsg);

            if (esActiva) {
                state.step = 'menu_trad_after_caducidad_options';
                userStates.set(from, state);

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
                let invalidReason = `⚠️ Esta tarjeta regalo no se encuentra activa.\n\nGracias por contactar con Casa Julián. Si deseas realizar otra consulta o gestionar tu reserva, elige una de las siguientes opciones:`;
                if (lang === 'eu') {
                    invalidReason = `⚠️ Opari-txartel hau ez dago aktibo.\n\nEskerrik asko Casa Julianekin harremanetan jartzeagatik. Beste kontsultaren bat egin edo zure erreserba kudeatu nahi baduzu, aukeratu aukera hauetako bat:`;
                } else if (lang === 'en') {
                    invalidReason = `⚠️ This gift card is not active.\n\nThank you for contacting Casa Julián. If you would like to make another inquiry or manage your reservation, please choose an option below:`;
                }

                const btnFinishTitle = (lang === 'eu' ? 'Amaitu' : (lang === 'en' ? 'Finish' : 'Terminar'));
                const btnMainMenuTitle = (lang === 'eu' ? 'Menu Nagusia' : (lang === 'en' ? 'Main Menu' : 'Menú principal'));

                const flowButtons = [
                    { id: 'btn_flow_finish', title: btnFinishTitle.slice(0, 20) },
                    { id: 'btn_flow_main_menu', title: btnMainMenuTitle.slice(0, 20) }
                ];

                await sendInteractiveButtons(from, invalidReason, flowButtons);
                userStates.set(from, { step: 'post_request_options', data: {} });
            }
            break;
        }

        case 'btn_salir_menu': {
            await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
            userStates.delete(from);
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
            await handleRegalarMenuTradicion(from, lang, userStates);
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
                btnCad = `⏳ Fecha caducidad`;
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
        case 'waitlist_init_si':
        case 'waitlist_menu_si':
        case 'wl_tipo_comida':
        case 'wl_tipo_cena':
        case 'wl_tipo_sin_pref':
        case 'wl_tipo_sin_preferencia':
        case 'wl_cena_viernes':
        case 'wl_cena_sabado':
        case 'wl_cena_skip': {
            await handleButtonResponse(from, 'btn_add_lista_espera');
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
            await sendFormLanguageList(from, lang);
            break;
        }

        case 'form_lang_es':
        case 'form_lang_eu':
        case 'form_lang_en':
        case 'form_lang_skip': {
            const selectedLang = buttonId === 'form_lang_skip' ? null : buttonId.replace('form_lang_', '');
            const chatLang = userLanguages.get(from) || 'es';
            const currentState = userStates.get(from);

            const displayLang = selectedLang ? selectedLang.toUpperCase() : (chatLang === 'eu' ? 'Ez zehaztua (NULL)' : (chatLang === 'en' ? 'Not specified (NULL)' : 'No especificado (NULL)'));

            if (currentState && currentState.step === 'espera_step7_idioma') {
                const wl = currentState.data.waitlist || {};

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
                    break;
                }

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
            } else if (currentState && currentState.step === 'menu_trad_step7_idioma') {
                const mt = currentState.data.menuTrad || {};
                const fechasStr = (mt.fechas && mt.fechas.length > 0) ? mt.fechas.join(', ') : 'Sin preferencia';
                const resRecord = db.createReservation({
                    nombre: mt.nombre || 'Cliente WhatsApp',
                    telefono: from,
                    dni: mt.dni || 'N/A',
                    email: mt.email || 'N/A',
                    nacionalidad: mt.nacionalidad,
                    fecha: '',
                    hora: mt.horario || 'Sin preferencia',
                    comensales: mt.comensales || 2,
                    estado: 'PENDIENTE CONFIRMACION',
                    fechas_preferencia: mt.fechas || [],
                    tipo_reserva: 'tarjeta_regalo',
                    alergias: mt.alergias || 'NO',
                    tipo_servicio: mt.tipoServicio || 'Sin preferencia',
                    tarjeta_regalo: mt.tarjeta || null,
                    ninos: mt.ninos || mt.num_ninos || 0,
                    idioma: selectedLang
                });

                const displayNac = mt.nacionalidad || (chatLang === 'eu' ? 'Ez zehaztua (NULL)' : (chatLang === 'en' ? 'Not specified (NULL)' : 'No especificada (NULL)'));

                let detalleMenuTrad = '';
                if (chatLang === 'eu') {
                    detalleMenuTrad = `🆔 *Erreserba ID:* ${resRecord.id}\n` +
                                            `👤 *Izen-abizenak:* ${mt.nombre || 'Ez zehaztua'}\n` +
                                            `🎁 *Opari-Txartel Zenbakia:* ${mt.tarjeta || 'Ez zehaztua'}\n` +
                                            `👥 *Jankideak:* ${mt.comensales || 2}\n` +
                                            `👶 *Haurrak (<12 urte):* ${mt.ninos || 0}\n` +
                                            `🍽️ *Zerbitzua:* ${mt.tipoServicio || 'Hobespenik ez'}\n` +
                                            `⏰ *Aukeratutako ordua:* ${mt.horario || 'Hobespenik ez'}\n` +
                                            `📅 *Hobetsitako datak:* ${fechasStr}\n` +
                                            `⚠️ *Alergiak/Mugak:* ${mt.alergias || 'Ez'}\n` +
                                            `📌 *Egoera:* PENDIENTE CONFIRMACION\n` +
                                            `📱 *Bidaltzailearen WhatsApp-a:* ${from}\n` +
                                            `📋 *Eskaera:* TRADIZIO MENUA ERRESERBA (OPARI TXARTELA)`;
                } else if (chatLang === 'en') {
                    detalleMenuTrad = `🆔 *Reservation ID:* ${resRecord.id}\n` +
                                            `👤 *Full Name:* ${mt.nombre || 'Not specified'}\n` +
                                            `🎁 *Gift Card No.:* ${mt.tarjeta || 'Not specified'}\n` +
                                            `👥 *Guests:* ${mt.comensales || 2}\n` +
                                            `👶 *Children (<12 yrs):* ${mt.ninos || 0}\n` +
                                            `🍽️ *Service:* ${mt.tipoServicio || 'No preference'}\n` +
                                            `⏰ *Selected Time:* ${mt.horario || 'No preference'}\n` +
                                            `📅 *Preferred Dates:* ${fechasStr}\n` +
                                            `⚠️ *Allergies/Restrictions:* ${mt.alergias || 'None'}\n` +
                                            `📌 *Status:* PENDIENTE CONFIRMACION\n` +
                                            `📱 *Sender WhatsApp:* ${from}\n` +
                                            `📋 *Request:* TRADITION MENU BOOKING (GIFT CARD)`;
                } else {
                    detalleMenuTrad = `🆔 *ID Reserva:* ${resRecord.id}\n` +
                                            `👤 *Nombre:* ${mt.nombre || 'No especificado'}\n` +
                                            `🎁 *Nº Tarjeta Regalo:* ${mt.tarjeta || 'No especificado'}\n` +
                                            `👥 *Comensales:* ${mt.comensales || 2}\n` +
                                            `👶 *Niños (<12 años):* ${mt.ninos || 0}\n` +
                                            `🍽️ *Servicio:* ${mt.tipoServicio || 'Sin preferencia'}\n` +
                                            `⏰ *Hora seleccionada:* ${mt.horario || 'Sin preferencia'}\n` +
                                            `📅 *Fechas de preferencia:* ${fechasStr}\n` +
                                            `⚠️ *Alergias/Restricciones:* ${mt.alergias || 'Ninguna'}\n` +
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

        case 'btn_finish_fechas': {
            const currentState = userStates.get(from) || { data: {} };
            if (currentState.step === 'mod_val_dia' || currentState.step === 'mod_fechas_multiples') {
                currentState.data = currentState.data || {};
                currentState.data.modFechas = currentState.data.modFechas || [];

                if (currentState.data.modFechas.length === 0) {
                    await sendMessage(from, getTranslation(lang, 'invalidDateFormatMsg'));
                    break;
                }

                const reservationId = currentState.data.reservationId || null;
                const nombreCliente = currentState.data.nombreCliente || null;
                const telefonoReserva = currentState.data.telefonoReserva || from.replace(/\D/g, '');
                const reservaActual = currentState.data.reservaActual || 'No especificada';

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
            currentState.data = currentState.data || {};
            currentState.data.menuTrad = currentState.data.menuTrad || {};
            const fechas = currentState.data.menuTrad.fechas || [];

            if (fechas.length === 0) {
                await sendMessage(from, getTranslation(lang, 'invalidDateFormatMsg'));
                break;
            }

            await sendConfirmTwoGuestsPrompt(from, lang, userStates);
            break;
        }

        case 'btn_confirm_2_comensales_si': {
            const state = userStates.get(from) || { data: {} };
            state.data = state.data || {};
            state.data.menuTrad = state.data.menuTrad || {};
            state.data.menuTrad.comensales = 2;
            userStates.set(from, state);

            await sendMenuTradChildrenPrompt(from, lang, userStates);
            break;
        }

        case 'btn_confirm_2_comensales_no': {
            await sendHowManyGuestsPrompt(from, lang, userStates);
            break;
        }

        case 'btn_mt_comensales_2':
        case 'btn_mt_comensales_3':
        case 'btn_mt_comensales_4': {
            const count = parseInt(buttonId.replace('btn_mt_comensales_', ''), 10) || 2;
            const state = userStates.get(from) || { data: {} };
            state.data = state.data || {};
            state.data.menuTrad = state.data.menuTrad || {};
            state.data.menuTrad.comensales = count;
            userStates.set(from, state);

            await sendMenuTradChildrenPrompt(from, lang, userStates);
            break;
        }

        case 'btn_add_fecha': {
            const currentState = userStates.get(from) || { data: {} };
            currentState.step = 'menu_trad_step5_dias';
            userStates.set(from, currentState);

            let msg = `📅 *Indícanos la siguiente fecha de preferencia (formato DD/MM/AAAA):*`;
            if (lang === 'eu') msg = `📅 *Eman hurrengo data hobetsia (DD/MM/AAAA formatuan):*`;
            else if (lang === 'en') msg = `📅 *Please specify the next preferred date (DD/MM/AAAA format):*`;
            await sendMessage(from, msg);
            break;
        }

        case 'btn_fechas_confirm_si':
        case 'btn_fechas_confirm_no': {
            const currentState = userStates.get(from) || { data: {} };
            currentState.step = 'menu_trad_step5_fechas_confirm';
            userStates.set(from, currentState);
            await handleTextMessage(from, buttonId);
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
            await sendAllergiesList(from, lang, 'menuTradStep6Alergias', []);
            break;
        }

        case 'btn_mt_ninos_0':
        case 'btn_mt_ninos_1':
        case 'btn_mt_ninos_2': {
            const count = parseInt(buttonId.replace('btn_mt_ninos_', ''), 10) || 0;
            const state = userStates.get(from) || { data: {} };
            state.data = state.data || {};
            state.data.menuTrad = state.data.menuTrad || {};
            state.data.menuTrad.ninos = count;
            state.data.menuTrad.num_ninos = count;
            state.step = 'menu_trad_step6_alergias';
            state.data.menuTrad.selectedAllergies = [];
            userStates.set(from, state);
            await sendAllergiesList(from, lang, 'menuTradStep6Alergias', []);
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
                        { id: "mt_slot_1515", title: "15:15", description: "Turno comida 15:15" },
                        { id: "mt_slot_sin_pref", title: getTranslation(lang, 'btnSinPreferencia').slice(0, 24), description: "Sin horario de preferencia" }
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
                        { id: "mt_slot_2130", title: "21:30", description: "Turno cena 21:30 (Vie-Sáb)" },
                        { id: "mt_slot_sin_pref", title: getTranslation(lang, 'btnSinPreferencia').slice(0, 24), description: "Sin horario de preferencia" }
                    ]
                }
            ];
            await sendInteractiveList(from, bodyText, buttonText, sections);
            break;
        }

        case 'menu_trad_tipo_sin_pref':
        case 'menu_trad_tipo_sin_preferencia': {
            const state = userStates.get(from) || { data: {} };
            state.data.menuTrad = state.data.menuTrad || {};
            state.data.menuTrad.tipoServicio = 'Sin preferencia';
            state.data.menuTrad.horario = 'Sin preferencia';
            state.data.menuTrad.fechas = [];
            state.step = 'menu_trad_step5_dias';
            userStates.set(from, state);

            await sendMessage(from, getTranslation(lang, 'menuTradStep5FechasPrompt'));
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
            console.log(`\n🔍 [confirm_yes] from=${from}`);
            console.log(`🔍 [confirm_yes] state exists: ${!!state}`);
            console.log(`🔍 [confirm_yes] pending exists: ${!!pending}`);
            if (pending) console.log(`🔍 [confirm_yes] tipoAccion: ${pending.tipoAccion}`);

            if (pending && pending.tipoAccion) {
                state.data.pendingAlert = null;
                userStates.set(from, state);

                console.log(`✅ [confirm_yes] Rama IF PENDING → enviando email...`);
                try {
                    let customSuccessMsg = null;

                    if (pending.isModification && pending.reservationId) {
                        await db.updateReservationStatus(pending.reservationId, 'PENDIENTE MODIFICACION');
                    } else if (pending.isCancellation && pending.reservationId) {
                        const existingRes = db.getReservationById(pending.reservationId);
                        const currentStatus = (pending.initialStatus || existingRes?.estado || '').trim().toUpperCase();
                        const isPendingRes = currentStatus.includes('PENDIENTE CONFIRM') || currentStatus === 'PENDIENTE';

                        if (isPendingRes) {
                            await db.updateReservationStatus(pending.reservationId, 'CANCELADA');
                        } else {
                            await db.updateReservationStatus(pending.reservationId, 'PENDIENTE CANCELACION');
                        }
                    }
                    
                    const targetCardCode = pending.tarjetaCodigo || db.extractGiftCardCodeFromText(pending.detalleMod);
                    if (targetCardCode) {
                        const codes = targetCardCode.split(',').map(c => c.trim()).filter(Boolean);
                        for (const code of codes) {
                            console.log(`🎁 [confirm_yes] Tarjeta ${code} pasa a 'PENDIENTE RESERVA'.`);
                            await db.updateGiftCardStatus(code, 'PENDIENTE RESERVA');
                        }
                    }

                    console.log(`📧 [confirm_yes] Llamando a sendInternalStaffAlertInSpanish...`);
                    try {
                        const emailResult = await sendInternalStaffAlertInSpanish(
                            pending.tipoAccion,
                            from,
                            pending.detalleMod,
                            pending.nombreCliente,
                            pending.telefonoReserva
                        );
                        console.log(`✅ [confirm_yes] Email enviado:`, JSON.stringify(emailResult));
                    } catch (alertErr) {
                        console.error("⚠️ Error enviando alerta de recepción:", alertErr.message);
                    }

                    try {
                        const finalMsg = customSuccessMsg || getTranslation(lang, pending.successMsgKey || 'modSuccessMsg');

                        const btnFinishTitle = (lang === 'eu' ? 'Amaitu' : (lang === 'en' ? 'Finish' : 'Terminar'));
                        const btnMainMenuTitle = (lang === 'eu' ? 'Menu Nagusia' : (lang === 'en' ? 'Main Menu' : 'Menú principal'));

                        const flowButtons = [
                            { id: 'btn_flow_finish', title: btnFinishTitle.slice(0, 20) },
                            { id: 'btn_flow_main_menu', title: btnMainMenuTitle.slice(0, 20) }
                        ];

                        await sendInteractiveButtons(from, finalMsg, flowButtons);
                        userStates.set(from, { step: 'post_request_options', data: {} });
                    } catch (clientMsgErr) {
                        console.error("⚠️ Error enviando respuesta WhatsApp al cliente:", clientMsgErr.message);
                        userStates.delete(from);
                    }
                } catch (err) {
                    console.error("⚠️ Error procesando confirmación:", err.message, err.stack);
                }
            } else {
                console.warn(`⚠️ [confirm_yes] RAMA ELSE (sin pending): no hay solicitud pendiente en memoria para ${from}`);
                await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
                userStates.delete(from);
            }
            break;
        }

        case 'btn_flow_finish':
        case 'Terminar':
        case 'terminar':
        case 'Amaitu':
        case 'Finish': {
            await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
            userStates.delete(from);
            break;
        }

        case 'btn_flow_main_menu':
        case 'Menú principal':
        case 'menu principal':
        case 'Menu principal':
        case 'Menu Nagusia':
        case 'Main Menu': {
            userStates.delete(from);
            await sendMainMenu(from, userLanguages, userStates);
            break;
        }

        case 'confirm_no': {
            const state = userStates.get(from);
            const pending = state?.data?.pendingAlert;
            if (pending && pending.reservationId) {
                db.cancelReservation(pending.reservationId);
            }

            const cancelledMsg = getTranslation(lang, 'confirmCancelledMsg');
            const btnFinishTitle = (lang === 'eu' ? 'Amaitu' : (lang === 'en' ? 'Finish' : 'Terminar'));
            const btnMainMenuTitle = (lang === 'eu' ? 'Menu Nagusia' : (lang === 'en' ? 'Main Menu' : 'Menú principal'));

            const flowButtons = [
                { id: 'btn_flow_finish', title: btnFinishTitle.slice(0, 20) },
                { id: 'btn_flow_main_menu', title: btnMainMenuTitle.slice(0, 20) }
            ];

            await sendInteractiveButtons(from, cancelledMsg, flowButtons);
            userStates.set(from, { step: 'post_request_options', data: {} });
            break;
        }

        case 'mod_comensales':
        case 'mod_dia':
        case 'mod_hora': {
            const state = userStates.get(from) || { data: {} };
            state.data = state.data || {};
            const tipo = buttonId === 'mod_comensales' ? 'comensales' : (buttonId === 'mod_dia' ? 'dia' : 'hora');
            state.data.modTipo = tipo;

            if (state.data.reservationId && state.data.nombreCliente && state.data.telefonoReserva) {
                if (tipo === 'comensales') {
                    state.step = 'mod_val_comensales';
                    userStates.set(from, state);
                    const promptMsg = getTranslation(lang, 'modComensalesPrompt').replace('{comensales}', state.data.comensalesActuales || 2);
                    await sendMessage(from, promptMsg);
                } else if (tipo === 'dia') {
                    state.step = 'mod_val_dia';
                    state.data.modFechas = [];
                    userStates.set(from, state);
                    await sendMessage(from, getTranslation(lang, 'modDiaPrompt'));
                } else if (tipo === 'hora') {
                    state.step = 'mod_val_hora';
                    userStates.set(from, state);
                    await sendModHoraOptions(from, lang, state);
                }
                break;
            }

            state.step = 'modificacion_datos_actuales';
            userStates.set(from, state);
            await sendMessage(from, getTranslation(lang, 'modCancelDataPrompt'));
            break;
        }

        case 'btn_add_mod_hora': {
            const currentState = userStates.get(from) || { data: {} };
            await sendModHoraOptions(from, lang, currentState);
            break;
        }

        case 'btn_add_mod_fecha': {
            let msg = `📅 *Fechas de Preferencia para Modificación*\n\nPor favor, indícanos tus fechas de preferencia deseada para la modificación (puedes indicar hasta 5 fechas de preferencia, ej: 15/08/2026, 16/08/2026):`;
            if (lang === 'eu') {
                msg = `📅 *Aldaketarako Hobetsitako Datak*\n\nMesedez, adierazi aldatzeko hobetsitako datak (gehienez 5 data adieraz ditzakezu, adib: 15/08/2026, 16/08/2026):`;
            } else if (lang === 'en') {
                msg = `📅 *Preferred Dates for Modification*\n\nPlease specify your preferred dates for modification (you can specify up to 5 dates, e.g. 15/08/2026, 16/08/2026):`;
            }
            await sendMessage(from, msg);
            break;
        }

        case 'btn_finish_horas':
        case 'btn_finish_mod_horas': {
            const currentState = userStates.get(from) || { data: {} };
            currentState.data = currentState.data || {};
            currentState.data.modHoras = currentState.data.modHoras || [];

            if (currentState.data.modHoras.length === 0) {
                await sendMessage(from, getTranslation(lang, 'invalidDateFormatMsg'));
                break;
            }

            const reservationId = currentState.data.reservationId || null;
            const nombreCliente = currentState.data.nombreCliente || null;
            const telefonoReserva = currentState.data.telefonoReserva || from.replace(/\D/g, '');
            const reservaActual = currentState.data.reservaActual || 'No especificada';

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

        case 'btn_finish_mod_fechas': {
            const currentState = userStates.get(from) || { data: {} };
            currentState.data = currentState.data || {};
            currentState.data.modFechas = currentState.data.modFechas || [];

            if (currentState.data.modFechas.length === 0) {
                await sendMessage(from, getTranslation(lang, 'invalidDateFormatMsg'));
                break;
            }

            const reservationId = currentState.data.reservationId || null;
            const nombreCliente = currentState.data.nombreCliente || null;
            const telefonoReserva = currentState.data.telefonoReserva || from.replace(/\D/g, '');
            const reservaActual = currentState.data.reservaActual || 'No especificada';

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

        case 'btn_consulta_otra':
        case 'Otra consulta':
        case 'otra consulta':
        case 'Beste galdera bat':
        case 'Add inquiry': {
            const state = userStates.get(from) || { data: {} };
            state.step = 'consulta_abierta_mas_texto';
            userStates.set(from, state);

            let msg = `💬 *Añadir otra consulta:*\n\nPor favor, escribe a continuación tu siguiente pregunta o necesidad especial:`;
            if (lang === 'eu') msg = `💬 *Beste galdera bat gehitu:*\n\nMesedez, idatzi jarraian zure hurrengo galdera edo behar berezia:`;
            else if (lang === 'en') msg = `💬 *Add another inquiry:*\n\nPlease enter your next question or special request below:`;
            await sendMessage(from, msg);
            break;
        }

        case 'btn_consulta_enviar':
        case 'Enviar solicitud':
        case 'enviar solicitud':
        case 'Bidali eskaera':
        case 'Submit request': {
            const state = userStates.get(from) || { data: {} };

            const consultas = (state.data && Array.isArray(state.data.consultas) && state.data.consultas.length > 0)
                ? state.data.consultas
                : ['Consulta abierta'];

            const telefonoCliente = from.replace(/\D/g, '');
            const nombreCliente = `Cliente WhatsApp (${telefonoCliente})`;
            const inquiriesFormatted = consultas.length > 1
                ? consultas.map((q, idx) => `${idx + 1}. ${q}`).join('\n')
                : consultas[0];

            const detalleConsulta = 
                `🆔 *Tipo de Solicitud:* CONSULTA ABIERTA / CASUÍSTICAS ESPECIALES\n` +
                `👤 *Cliente:* ${nombreCliente}\n` +
                `📞 *Teléfono:* ${telefonoCliente}\n` +
                `💬 *Consulta(s) del Cliente:*\n${inquiriesFormatted}\n` +
                `📌 *Estado:* PENDIENTE RESPUESTA RESTAURANTE\n` +
                `📱 *WhatsApp Remitente:* ${from}`;

            state.data = state.data || {};
            state.data.pendingAlert = {
                tipoAccion: 'CONSULTA ABIERTA (CASUÍSTICAS ESPECIALES)',
                detalleMod: detalleConsulta,
                nombreCliente: nombreCliente,
                telefonoReserva: telefonoCliente,
                successMsgKey: 'consultaSuccessMsg'
            };
            userStates.set(from, state);

            await handleButtonResponse(from, 'confirm_yes');
            break;
        }

        default:
            await sendLanguageMenu(from, userLanguages, userStates);
    }
}

module.exports = {
    handleListResponse,
    handleButtonResponse,
    sendWaitlistNinosPrompt,
    sendAllergiesList,
    handleAllergiesListSelection,
    sendWaitlistDaysList,
    handleWaitlistDaySelection,
    handleMenuTradDaySelection,
    handleWaitlistSlotSelection,
    sendConsultaAbiertaSummary,
    handleNationalitySelection,
    processMenuTradReservation
};
