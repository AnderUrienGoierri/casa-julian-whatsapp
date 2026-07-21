const { 
    sendInteractiveButtons, 
    sendInteractiveList, 
    sendMessage 
} = require('./whatsappApi');
const db = require('./database');
const notifications = require('./notifications');
const { getTranslation } = require('./i18n');

// Mapas en memoria para rastrear estado e idioma de los usuarios por teléfono
const userStates = new Map();
const userLanguages = new Map();

/**
 * Maneja el flujo de mensajes recibidos de WhatsApp.
 */
async function handleUserMessage(from, body, type = 'text', interactiveData = null) {
    console.log(`\n📩 MENSAJE RECIBIDO de ${from} [Tipo: ${type}]: "${body}"`);

    // Interceptar botón de cambio de idioma global
    if (interactiveData && interactiveData.type === 'button') {
        const buttonId = interactiveData.id;
        if (buttonId.startsWith('lang_')) {
            const langCode = buttonId.replace('lang_', '');
            userLanguages.set(from, langCode);
            userStates.set(from, { step: 'main_menu', data: {} });
            
            const currentLangName = getTranslation(langCode, 'langName') || 'Español';
            await sendMessage(from, `🌐 *Idioma cambiado a:* ${currentLangName}`);
            await sendMainMenu(from);
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
 * Muestra el menú principal en el idioma del usuario (List Interactive Message).
 */
async function sendMainMenu(from) {
    const lang = userLanguages.get(from) || 'es';
    
    userStates.set(from, { step: 'main_menu', data: {} });

    const bodyText = getTranslation(lang, 'welcomeMessage');
    const buttonText = getTranslation(lang, 'menuButtonText');
    
    const sections = [
        {
            title: getTranslation(lang, 'menuTitle'),
            rows: [
                { id: "opt_quiero_reservar", title: getTranslation(lang, 'opt1Title'), description: getTranslation(lang, 'opt1Desc') },
                { id: "opt_tengo_reserva", title: getTranslation(lang, 'opt2Title'), description: getTranslation(lang, 'opt2Desc') },
                { id: "opt_lista_espera", title: getTranslation(lang, 'opt3Title'), description: getTranslation(lang, 'opt3Desc') },
                { id: "opt_preguntas_frecuentes", title: getTranslation(lang, 'opt4Title'), description: getTranslation(lang, 'opt4Desc') },
                { id: "opt_ver_disponibilidad", title: getTranslation(lang, 'opt5Title'), description: getTranslation(lang, 'opt5Desc') },
                { id: "opt_cambiar_idioma", title: getTranslation(lang, 'optLangTitle'), description: getTranslation(lang, 'optLangDesc') }
            ]
        }
    ];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

/**
 * Muestra la lista interactiva profesional para seleccionar entre los 8 idiomas.
 */
async function sendLanguageMenu(from) {
    const bodyText = "🌍 *Por favor, selecciona tu idioma / Select your language / Choisis ta langue / Sprache wählen:*\n\nDisponemos de atención multilingüe automatizada en 10 idiomas:";
    const buttonText = "Seleccionar Idioma";
    const sections = [
        {
            title: "Idiomas Disponibles",
            rows: [
                { id: "lang_es", title: "🇪🇸 Español", description: "Atención completa en Español." },
                { id: "lang_eu", title: "🇪🇺 Euskara", description: "Arreta osoa Euskaraz." },
                { id: "lang_en", title: "🇬🇧 English", description: "Full customer support in English." },
                { id: "lang_fr", title: "🇫🇷 Français", description: "Service client complet en Français." },
                { id: "lang_de", title: "🇩🇪 Deutsch", description: "Kundenservice auf Deutsch." },
                { id: "lang_nl", title: "🇳🇱 Nederlands", description: "Klantenservice in het Nederlands." },
                { id: "lang_be", title: "🇧🇪 Belgisch (NL/FR)", description: "Belgische ondersteuning / Support Belge." },
                { id: "lang_zh", title: "🇨🇳 中文", description: "中文全方位客户服务。" },
                { id: "lang_ja", title: "🇯🇵 日本語", description: "日本語によるカスタマーサポート。" },
                { id: "lang_ru", title: "🇷🇺 Русский", description: "Полная поддержка на русском языке." }
            ]
        }
    ];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

/**
 * Procesa las respuestas a las Listas Interactivas.
 */
async function handleListResponse(from, listId) {
    // 0. Selección de idioma desde la lista de 8 idiomas
    if (listId.startsWith('lang_')) {
        const langCode = listId.replace('lang_', '');
        userLanguages.set(from, langCode);
        userStates.set(from, { step: 'main_menu', data: {} });
        
        const currentLangName = getTranslation(langCode, 'langName') || 'Español';
        await sendMessage(from, `🌐 *Idioma cambiado a / Language changed to:* ${currentLangName}`);
        await sendMainMenu(from);
        return;
    }
    // 1. Paginación de múltiples reservas encontradas
    if (listId.startsWith('page_res_')) {
        const page = parseInt(listId.replace('page_res_', ''), 10);
        const currentState = userStates.get(from) || {};
        if (currentState.userReservations) {
            await sendPaginatedReservationsList(from, currentState.userReservations, page);
        }
        return;
    }

    // 2. Selección de reserva específica de una lista paginada
    if (listId.startsWith('sel_res_')) {
        const resId = listId.replace('sel_res_', '');
        const reservation = db.getReservationById(resId);
        if (reservation) {
            await sendReservationManagementMenu(from, reservation);
        } else {
            await sendMessage(from, "⚠️ No hemos podido cargar los detalles de esa reserva. Por favor, inténtalo de nuevo.");
            await sendMainMenu(from);
        }
        return;
    }

    // 3. Selección directa de turno disponible en proceso de reserva (Turnos según las imágenes oficiales)
    if (listId.startsWith('sel_hora_')) {
        const hora = listId.replace('sel_hora_', '');
        const currentState = userStates.get(from) || { data: {} };
        currentState.data.hora = hora;
        currentState.step = 'reserva_esperando_comensales';
        userStates.set(from, currentState);

        await sendMessage(from, `👥 *Reserva para el ${currentState.data.fecha} a las ${hora}*\n\n¿Cuántos comensales vais a ser en total? (Ejemplo: 4):`);
        return;
    }

    // 4. Selección directa de turno libre desde "5. VER DISPONIBILIDAD"
    if (listId.startsWith('slot_res_')) {
        const parts = listId.replace('slot_res_', '').split('_');
        const fecha = parts[0];
        const hora = parts[1];
        
        const currentState = {
            step: 'reserva_esperando_comensales_directo',
            data: { fecha, hora }
        };
        userStates.set(from, currentState);

        await sendMessage(from, `👥 *Reserva para el ${fecha} a las ${hora}*\n\n¿Cuántos comensales vais a ser en total? (Ejemplo: 4):`);
        return;
    }

    const lang = userLanguages.get(from) || 'es';

    switch (listId) {
        case 'opt_cambiar_idioma':
            await sendLanguageMenu(from);
            break;

        case 'opt_quiero_reservar':
            userStates.set(from, { step: 'reserva_esperando_fecha', data: {} });
            await sendMessage(from, getTranslation(lang, 'stepDate'));
            break;

        case 'opt_lista_espera':
            userStates.set(from, { step: 'espera_esperando_id', data: {} });
            await sendMessage(from, "🔎 *Consulta de Lista de Espera*\n\nPor favor, introduce tu *DNI, Teléfono o Email* para localizar tu posición:");
            break;

        case 'opt_tengo_reserva':
            userStates.set(from, { step: 'reserva_existente_esperando_id', data: {} });
            await sendMessage(from, "📋 *Gestión de Reserva Existente*\n\nPor favor, introduce el *DNI, Teléfono o Email* asociado a tu reserva:");
            break;

        case 'opt_preguntas_frecuentes':
            await sendFaqMenu(from, lang);
            break;

        case 'opt_ver_disponibilidad':
            await sendUpcomingSlotsMenu(from, lang);
            break;

        // FAQS SUB-OPCIONES
        case 'faq_carta':
            await sendMessage(from, "📜 *Carta y Menús de Casa Julian*\n\nPuedes consultar nuestra carta completa de chuletones, entrantes y vinos en nuestra web oficial:\n👉 https://casajulian.eus/");
            await sendBackToMenuButton(from, lang);
            break;

        case 'faq_ubicacion':
            await sendMessage(from, "📍 *Ubicación de Casa Julian*\n\nEstamos situados en:\n- *Tolosa:* Calle Sta. Clara, 6, 20400 Tolosa, Gipuzkoa.\n- *Madrid:* Calle Ibiza 42, 28009 Madrid.\n\n🌐 Ver mapa: https://casajulian.eus/");
            await sendBackToMenuButton(from, lang);
            break;

        case 'faq_horarios':
            await sendMessage(from, "🕒 *Horarios de Apertura*\n\n• *Comidas (Martes a Domingo):* 12:30, 13:00, 13:30, 14:00 y 15:15.\n• *Cenas (Viernes y Sábado):* 20:00, 20:30, 21:00 y 21:30.\n• *Lunes:* Cerrado por descanso semanal.");
            await sendBackToMenuButton(from, lang);
            break;

        case 'faq_grupos':
            await sendMessage(from, "👥 *Reservas para Grupos*\n\nPara reservas de más de 8 personas, coordinamos menús especiales de degustación. Escribe tu consulta aquí y un responsable te contactará.");
            await sendBackToMenuButton(from, lang);
            break;

        case 'faq_parking':
            await sendMessage(from, "🚗 *Aparcamiento*\n\nContamos con convenios con el parking público cercano a 2 minutos a pie del restaurante.");
            await sendBackToMenuButton(from, lang);
            break;

        case 'faq_alergias':
            await sendMessage(from, "🌾 *Alergias e Intolerancias*\n\nDisponemos de carta de alérgenos actualizada y opciones 100% aptas para celíacos. Avísanos en tu reserva.");
            await sendBackToMenuButton(from, lang);
            break;

        // OPCIONES DE GESTIÓN DE RESERVA (DESDE LISTA INTERACTIVA)
        case 'btn_ver_reserva':
        case 'btn_modificar_reserva':
        case 'btn_cancelar_reserva':
        case 'btn_volver_menu':
            await handleButtonResponse(from, listId);
            break;

        default:
            await sendMainMenu(from);
    }
}

/**
 * Muestra el menú de gestión de una reserva localizada con las 4 opciones solicitadas.
 */
async function sendReservationManagementMenu(from, reservation) {
    const currentState = userStates.get(from) || {};
    currentState.tempReserva = reservation;
    userStates.set(from, currentState);

    const bodyText = `🔎 *Reserva Localizada:* ${reservation.id}\n\nA nombre de: *${reservation.nombre}*\nFecha: ${reservation.fecha} a las ${reservation.hora} (${reservation.comensales} personas).\n\n¿Qué te gustaría hacer con tu reserva? Por favor, despliega las opciones de abajo 👇`;
    const buttonText = "Ver Opciones";

    const sections = [
        {
            title: "Gestión de Reserva",
            rows: [
                { id: "btn_ver_reserva", title: "1. VER RESERVA", description: "Consultar detalles completos de la reserva." },
                { id: "btn_modificar_reserva", title: "2. MODIFICAR RESERVA", description: "Cambiar fecha, hora o comensales." },
                { id: "btn_cancelar_reserva", title: "3. CANCELAR RESERVA", description: "Cancelar esta reserva y liberar la mesa." },
                { id: "btn_volver_menu", title: "4. MENÚ PRINCIPAL", description: "Volver al menú de inicio." }
            ]
        }
    ];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

/**
 * Envia la lista paginada de reservas.
 */
async function sendPaginatedReservationsList(from, reservas, page = 1) {
    const currentState = userStates.get(from) || {};
    currentState.userReservations = reservas;
    currentState.currentResPage = page;
    userStates.set(from, currentState);

    const PAGE_SIZE = 8;
    const totalReservas = reservas.length;
    const totalPages = Math.ceil(totalReservas / PAGE_SIZE);

    const startIndex = (page - 1) * PAGE_SIZE;
    const pageItems = reservas.slice(startIndex, startIndex + PAGE_SIZE);

    const rows = pageItems.map(r => {
        const shortTitle = `${r.fecha} (${r.hora})`.slice(0, 24);
        return {
            id: `sel_res_${r.id}`,
            title: shortTitle,
            description: `${r.comensales} personas • Cod: ${r.id}`
        };
    });

    if (page < totalPages) {
        rows.push({
            id: `page_res_${page + 1}`,
            title: `▶️ Ver más (Pág. ${page + 1}/${totalPages})`,
            description: `Ver siguientes reservas de la lista.`
        });
    }

    if (page > 1) {
        rows.push({
            id: `page_res_${page - 1}`,
            title: `◀️ Pág. Anterior (${page - 1}/${totalPages})`,
            description: `Volver a la página anterior.`
        });
    }

    const bodyText = `📋 *Hemos localizado ${totalReservas} reservas activas a tu nombre.* (Pág. ${page} de ${totalPages})\n\nPor favor, selecciona abajo cuál de tus reservas deseas gestionar:`;
    const buttonText = "Seleccionar Reserva";
    const sections = [
        {
            title: `Reservas (${page}/${totalPages})`.slice(0, 24),
            rows: rows
        }
    ];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

/**
 * Muestra los próximos turnos disponibles en el Asador Casa Julian.
 */
async function sendUpcomingSlotsMenu(from, lang) {
    const slots = db.getUpcomingAvailableSlots(8);

    if (!slots || slots.length === 0) {
        await sendMessage(from, "😔 *Sin disponibilidad próxima.*\n\nActualmente no disponemos de plazas libres en los próximos días. Te sugerimos unirte a nuestra Lista de Espera.");
        await sendMainMenu(from);
        return;
    }

    const rows = slots.map(s => ({
        id: `slot_res_${s.fecha}_${s.hora}`,
        title: `${s.fecha} (${s.hora})`.slice(0, 24),
        description: `${s.plazasLibres} plazas libres disponibles`
    }));

    const bodyText = "📅 *Próximos Turnos Libres en Asador Casa Julian*\n\nSelecciona el turno que prefieras para realizar tu reserva:";
    const buttonText = "Ver Turnos";
    const sections = [
        {
            title: "Turnos Disponibles",
            rows: rows
        }
    ];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

/**
 * Procesa las respuestas a los Botones Interactivos.
 */
async function handleButtonResponse(from, buttonId) {
    const currentState = userStates.get(from) || { data: {} };
    const lang = userLanguages.get(from) || 'es';

    switch (buttonId) {
        case 'btn_unirse_espera':
            currentState.step = 'espera_datos_nombre';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'askName'));
            break;

        case 'btn_cancelar_espera':
        case 'btn_volver_menu':
            await sendMainMenu(from);
            break;

        case 'btn_eliminar_espera':
            if (currentState.tempWaitlistId) {
                db.removeFromWaitlist(currentState.tempWaitlistId);
                await sendMessage(from, "❌ Te hemos eliminado correctamente de la lista de espera.");
            }
            await sendMainMenu(from);
            break;

        case 'btn_seguir_esperando':
            await sendMessage(from, "👍 ¡Entendido! Mantendremos tu turno en la lista de espera.");
            await sendMainMenu(from);
            break;

        case 'btn_ver_reserva':
            if (currentState.tempReserva) {
                const r = currentState.tempReserva;
                await sendMessage(from, `ℹ️ *Reserva (${r.id}):*\n\n👤 *Nombre:* ${r.nombre}\n📅 *Fecha:* ${r.fecha}\n⏰ *Hora:* ${r.hora}\n👥 *Comensales:* ${r.comensales}\n🪪 *DNI:* ${r.dni}\n📧 *Email:* ${r.email}\n🌐 *Idioma:* ${r.idioma || 'es'}\n📌 *Estado:* ${r.estado}`);
            }
            await sendBackToMenuButton(from, lang);
            break;

        case 'btn_modificar_reserva':
            currentState.step = 'modificar_reserva_fecha';
            userStates.set(from, currentState);
            await sendMessage(from, "✏️ *Modificar Reserva*\n\nPor favor, introduce la *nueva Fecha* deseada (ej. 26/10/2026):");
            break;

        case 'btn_cancelar_reserva':
            if (currentState.tempReserva) {
                const reservaCancelada = db.cancelReservation(currentState.tempReserva.id);
                await sendMessage(from, `🗑️ *Reserva Cancelada*\n\nLa reserva a nombre de *${currentState.tempReserva.nombre}* ha sido cancelada correctamente y la mesa se ha liberado.`);
                
                if (reservaCancelada) {
                    await checkAndNotifyWaitlist(reservaCancelada.fecha, reservaCancelada.hora);
                }
            }
            await sendMainMenu(from);
            break;
    }
}

/**
 * Notifica automáticamente al primer cliente en Lista de Espera cuando se libera una mesa.
 */
async function checkAndNotifyWaitlist(fecha, hora) {
    const primerEnEspera = db.getFirstWaitlistForSlot(fecha, hora);

    if (primerEnEspera) {
        console.log(`\n🔔 NOTIFICANDO A LISTA DE ESPERA: ${primerEnEspera.nombre} (${primerEnEspera.telefono})`);
        
        const avisoText = `🎉 *¡BUENAS NOTICIAS, ${primerEnEspera.nombre.toUpperCase()}!*\n\nSe ha liberado una mesa en *Casa Julian* para el día *${fecha}* a las *${hora}*.\n\nComo estás en la *Lista de Espera*, tienes prioridad para reservarla. ¿Deseas confirmar la reserva ahora?`;
        const buttons = [
            { id: 'btn_unirse_espera', title: "Confirmar Reserva" },
            { id: 'btn_volver_menu', title: "No, gracias" }
        ];
        await sendInteractiveButtons(primerEnEspera.telefono, avisoText, buttons);

        await notifications.sendEmailConfirmation({
            ...primerEnEspera,
            estado: "¡MESA LIBERADA! - TIENES PRIORIDAD DE RESERVA"
        });
        await notifications.sendSMSConfirmation(primerEnEspera);
    }
}

/**
 * Maneja el flujo secuencial por mensajes de texto.
 */
async function handleTextMessage(from, text) {
    let lang = userLanguages.get(from);
    if (!lang) {
        lang = 'es';
        userLanguages.set(from, 'es');
    }

    const currentState = userStates.get(from);

    if (!currentState || currentState.step === 'main_menu') {
        await sendMainMenu(from);
        return;
    }

    switch (currentState.step) {
        case 'reserva_esperando_fecha':
            if (text.length < 5 || (!text.includes('/') && !text.includes('-'))) {
                await sendMessage(from, "⚠️ Por favor, introduce una fecha válida en formato *DD/MM/AAAA* (Ejemplo: 25/10/2026):");
                return;
            }

            const formattedFecha = text.trim();
            const dateCheck = db.getAvailableTimeSlotsForDate(formattedFecha);

            if (dateCheck.cerrado) {
                await sendMessage(from, "🛑 *Restaurante Cerrado*\n\nLos lunes el restaurante está cerrado por descanso semanal. Por favor, introduce otra fecha (Ejemplo: 03/11/2026):");
                return;
            }

            if (!dateCheck.valido) {
                await sendMessage(from, "⚠️ Por favor, introduce una fecha válida en formato *DD/MM/AAAA* (Ejemplo: 25/10/2026):");
                return;
            }

            if (!dateCheck.availableSlots || dateCheck.availableSlots.length === 0) {
                await sendMessage(from, `😔 *Aforo Completo para el ${formattedFecha}*\n\nLo sentimos, todas las mesas están reservadas para este día en Asador Casa Julian.`);
                
                const buttons = [
                    { id: 'btn_unirse_espera', title: getTranslation(lang, 'btnWaitlist') },
                    { id: 'btn_volver_menu', title: getTranslation(lang, 'btnMenu') }
                ];
                await sendInteractiveButtons(from, getTranslation(lang, 'askWaitlist'), buttons);
                return;
            }

            currentState.data.fecha = formattedFecha;
            currentState.step = 'reserva_esperando_hora_lista';
            userStates.set(from, currentState);

            const rows = dateCheck.availableSlots.map(s => ({
                id: `sel_hora_${s.hora}`,
                title: `⏰ Turno ${s.hora}`,
                description: `${s.capacidadRestante} plazas libres disponibles`
            }));

            const bodyText = `📅 *Fecha Seleccionada:* ${formattedFecha}\n\nLos siguientes turnos disponen de plazas libres para tu reserva en Asador Casa Julian. Por favor, selecciona la hora que prefieras:`;
            const buttonText = "Elegir Turno";
            const sections = [
                {
                    title: "Turnos Disponibles",
                    rows: rows
                }
            ];

            await sendInteractiveList(from, bodyText, buttonText, sections);
            break;

        case 'reserva_esperando_hora_lista':
            // Fallback en caso de escribir la hora manualmente
            currentState.data.hora = text.trim();
            currentState.step = 'reserva_esperando_comensales';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'stepGuests'));
            break;

        case 'reserva_esperando_comensales':
            currentState.data.comensales = text;

            const { fecha, hora, comensales } = currentState.data;
            const check = db.checkAvailability(fecha, hora, comensales);

            if (check.cerrado) {
                await sendMessage(from, "🛑 *Restaurante Cerrado*\n\nLos lunes el restaurante está cerrado por descanso semanal. Por favor, selecciona otro día para tu reserva.");
                await sendMainMenu(from);
            } else if (check.turnoInvalido) {
                await sendMessage(from, `⚠️ *Turno no disponible*\n\n${check.razon}\nPor favor, vuelve a intentarlo seleccionando un turno correcto.`);
                await sendMainMenu(from);
            } else if (check.disponible) {
                currentState.step = 'reserva_datos_nombre';
                userStates.set(from, currentState);
                await sendMessage(from, getTranslation(lang, 'available'));
            } else {
                await sendMessage(from, getTranslation(lang, 'notAvailable'));
                
                const buttons = [
                    { id: 'btn_unirse_espera', title: getTranslation(lang, 'btnWaitlist') },
                    { id: 'btn_volver_menu', title: getTranslation(lang, 'btnMenu') }
                ];
                await sendInteractiveButtons(from, getTranslation(lang, 'askWaitlist'), buttons);
            }
            break;

        case 'reserva_esperando_comensales_directo':
            const numComensales = parseInt(text, 10);
            if (isNaN(numComensales) || numComensales <= 0) {
                await sendMessage(from, "⚠️ Por favor, introduce un número válido de comensales (Ejemplo: 4):");
                return;
            }

            currentState.data.comensales = numComensales;
            const checkDirect = db.checkAvailability(currentState.data.fecha, currentState.data.hora, numComensales);

            if (checkDirect.disponible) {
                currentState.step = 'reserva_datos_nombre';
                userStates.set(from, currentState);
                await sendMessage(from, getTranslation(lang, 'available'));
            } else {
                await sendMessage(from, `😔 *Capacidad insuficiente para ${numComensales} personas en ese turno.*\n\nCapacidad disponible restante: ${checkDirect.capacidadRestante} plazas.`);
                const buttons = [
                    { id: 'btn_unirse_espera', title: getTranslation(lang, 'btnWaitlist') },
                    { id: 'btn_volver_menu', title: getTranslation(lang, 'btnMenu') }
                ];
                await sendInteractiveButtons(from, getTranslation(lang, 'askWaitlist'), buttons);
            }
            break;

        case 'reserva_datos_nombre':
            currentState.data.nombre = text;
            currentState.step = 'reserva_datos_telefono';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'askPhone'));
            break;

        case 'reserva_datos_telefono':
            currentState.data.telefono = text;
            currentState.step = 'reserva_datos_dni';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'askDni'));
            break;

        case 'reserva_datos_dni':
            currentState.data.dni = text;
            currentState.step = 'reserva_datos_email';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'askEmail'));
            break;

        case 'reserva_datos_email':
            currentState.data.email = text;
            currentState.data.idioma = lang;

            const nuevaReserva = db.createReservation(currentState.data);

            const msgConfirm = `🎉 *¡RESERVA CONFIRMADA EN CASA JULIAN!*\n\n📌 *Código de Reserva:* ${nuevaReserva.id}\n👤 *Nombre:* ${nuevaReserva.nombre}\n📅 *Fecha:* ${nuevaReserva.fecha}\n⏰ *Hora:* ${nuevaReserva.hora}\n👥 *Comensales:* ${nuevaReserva.comensales} personas\n🪪 *DNI:* ${nuevaReserva.dni}\n📧 *Email:* ${nuevaReserva.email}\n🌐 *Idioma:* ${lang}\n\nTe hemos enviado un correo electrónico de confirmación. ¡Te esperamos!`;
            await sendMessage(from, msgConfirm);

            await notifications.sendEmailConfirmation(nuevaReserva);
            await notifications.sendSMSConfirmation(nuevaReserva);

            userStates.delete(from);
            await sendBackToMenuButton(from, lang);
            break;

        case 'reserva_existente_esperando_id':
            const reservasCliente = db.getAllReservations(text);

            if (reservasCliente && reservasCliente.length > 0) {
                if (reservasCliente.length === 1) {
                    await sendReservationManagementMenu(from, reservasCliente[0]);
                } else {
                    await sendPaginatedReservationsList(from, reservasCliente, 1);
                }
            } else {
                await sendMessage(from, "❌ No hemos encontrado ninguna reserva activa asociada a esos datos. Por favor, verifica el DNI, teléfono o código.");
                await sendBackToMenuButton(from, lang);
            }
            break;

        case 'modificar_reserva_fecha':
            if (currentState.tempReserva) {
                const nuevaFecha = text.trim();
                const dateCheckMod = db.getAvailableTimeSlotsForDate(nuevaFecha);

                if (dateCheckMod.cerrado) {
                    await sendMessage(from, "🛑 *Restaurante Cerrado*\n\nLos lunes el restaurante está cerrado por descanso semanal. Por favor, introduce otra fecha:");
                    return;
                }

                if (!dateCheckMod.valido || !dateCheckMod.availableSlots || dateCheckMod.availableSlots.length === 0) {
                    await sendMessage(from, `😔 *Sin disponibilidad para el ${nuevaFecha}*\n\nPor favor, introduce otra fecha disponible.`);
                    return;
                }

                currentState.tempNuevaFecha = nuevaFecha;
                currentState.step = 'modificar_reserva_hora_lista';
                userStates.set(from, currentState);

                const rowsMod = dateCheckMod.availableSlots.map(s => ({
                    id: `mod_hora_${s.hora}`,
                    title: `⏰ Turno ${s.hora}`,
                    description: `${s.capacidadRestante} plazas libres disponibles`
                }));

                const bodyTextMod = `📅 *Nueva Fecha:* ${nuevaFecha}\n\nSelecciona la hora deseada para modificar tu reserva:`;
                await sendInteractiveList(from, bodyTextMod, "Elegir Hora", [{ title: "Turnos Disponibles", rows: rowsMod }]);
            }
            break;

        case 'espera_esperando_id':
            const posicion = db.getWaitlistPosition(text);
            if (posicion.encontrado) {
                const e = posicion.registro;
                const msgPos = `📋 *Tu Estado en Lista de Espera*\n\n👤 *Nombre:* ${e.nombre}\n📅 *Fecha Deseada:* ${e.fecha} a las ${e.hora}\n👥 *Comensales:* ${e.comensales}\n🏆 *Posición Actual:* Nº ${posicion.posicion}\n👥 *Personas delante:* ${posicion.personasDelante}`;
                
                currentState.tempWaitlistId = e.id;
                userStates.set(from, currentState);

                const buttons = [
                    { id: 'btn_seguir_esperando', title: "Seguir esperando" },
                    { id: 'btn_eliminar_espera', title: "Cancelar espera" }
                ];
                await sendInteractiveButtons(from, msgPos, buttons);
            } else {
                await sendMessage(from, "❌ No hemos localizado ninguna solicitud en lista de espera asociada a esos datos.");
                await sendBackToMenuButton(from, lang);
            }
            break;

        case 'espera_datos_nombre':
            currentState.data = currentState.data || {};
            currentState.data.nombre = text;
            currentState.step = 'espera_datos_telefono';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'askPhone'));
            break;

        case 'espera_datos_telefono':
            currentState.data.telefono = text;
            currentState.step = 'espera_datos_dni';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'askDni'));
            break;

        case 'espera_datos_dni':
            currentState.data.dni = text;
            currentState.step = 'espera_datos_email';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'askEmail'));
            break;

        case 'espera_datos_email':
            currentState.data.email = text;
            currentState.data.fecha = currentState.data.fecha || '25/10/2026';
            currentState.data.hora = currentState.data.hora || '13:30';
            currentState.data.comensales = currentState.data.comensales || 2;
            currentState.data.idioma = lang;

            const waitlistReg = db.addToWaitlist(currentState.data);

            const msgEsperaConf = `📋 *¡REGISTRADO EN LISTA DE ESPERA!*\n\n📌 *Código:* ${waitlistReg.id}\n👤 *Nombre:* ${waitlistReg.nombre}\n📅 *Fecha Deseada:* ${waitlistReg.fecha} a las ${waitlistReg.hora}\n👥 *Comensales:* ${waitlistReg.comensales} personas\n🌐 *Idioma:* ${lang}\n\nTe notificaremos por WhatsApp y Email automáticamente en cuanto se libere una mesa.`;
            await sendMessage(from, msgEsperaConf);

            userStates.delete(from);
            await sendBackToMenuButton(from, lang);
            break;

        default:
            await sendMainMenu(from);
    }
}

/**
 * Envía un botón rápido para regresar al Menú Principal.
 */
async function sendBackToMenuButton(from, lang = 'es') {
    const buttons = [
        { id: 'btn_volver_menu', title: getTranslation(lang, 'btnMenu') }
    ];
    await sendInteractiveButtons(from, "👇 *¿Deseas realizar otra consulta?*", buttons);
}

/**
 * Menú de Preguntas Frecuentes.
 */
async function sendFaqMenu(from, lang) {
    const bodyText = getTranslation(lang, 'faqTitle');
    const buttonText = getTranslation(lang, 'menuButtonText');
    const sections = [
        {
            title: "Preguntas Frecuentes",
            rows: [
                { id: "faq_carta", title: getTranslation(lang, 'faq1Title'), description: getTranslation(lang, 'faq1Desc') },
                { id: "faq_ubicacion", title: getTranslation(lang, 'faq2Title'), description: getTranslation(lang, 'faq2Desc') },
                { id: "faq_horarios", title: getTranslation(lang, 'faq3Title'), description: getTranslation(lang, 'faq3Desc') },
                { id: "faq_grupos", title: getTranslation(lang, 'faq4Title'), description: getTranslation(lang, 'faq4Desc') },
                { id: "faq_parking", title: getTranslation(lang, 'faq5Title'), description: getTranslation(lang, 'faq5Desc') },
                { id: "faq_alergias", title: getTranslation(lang, 'faq6Title'), description: getTranslation(lang, 'faq6Desc') }
            ]
        }
    ];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

/**
 * Procesa el objeto 'message' raw recibido desde el webhook POST de Meta.
 */
async function processMessage(message) {
    if (!message || !message.from) return;

    const from = message.from;
    const type = message.type || 'text';

    let body = '';
    let interactiveData = null;

    if (type === 'text') {
        body = message.text ? message.text.body : '';
    } else if (type === 'interactive') {
        const interactive = message.interactive;
        if (interactive && interactive.type === 'list_reply') {
            body = interactive.list_reply ? interactive.list_reply.title : '';
            interactiveData = { type: 'list', id: interactive.list_reply ? interactive.list_reply.id : '' };
        } else if (interactive && interactive.type === 'button_reply') {
            body = interactive.button_reply ? interactive.button_reply.title : '';
            interactiveData = { type: 'button', id: interactive.button_reply ? interactive.button_reply.id : '' };
        }
    }

    await handleUserMessage(from, body, type, interactiveData);
}

module.exports = {
    handleUserMessage,
    processMessage
};

