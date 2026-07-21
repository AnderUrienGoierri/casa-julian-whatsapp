const { sendMessage, sendInteractiveButtons, sendInteractiveList } = require('./whatsappApi');
const db = require('./database');
const notifications = require('./notifications');
const { getTranslation } = require('./i18n');

// Mapas en memoria por número de teléfono
const userStates = new Map();
const userLanguages = new Map(); // Guarda el idioma de cada usuario (es, eu, en, fr, zh, ja, ru, ar)

/**
 * Punto de entrada principal para procesar mensajes entrantes de WhatsApp.
 */
async function processMessage(message) {
    const from = message.from; // Número de teléfono del usuario

    // 1. Respuestas a botones interactivos
    if (message.type === 'interactive' && message.interactive.type === 'button_reply') {
        const buttonId = message.interactive.button_reply.id;
        await handleButtonResponse(from, buttonId);
        return;
    }

    // 2. Respuestas a listas interactivas
    if (message.type === 'interactive' && message.interactive.type === 'list_reply') {
        const listId = message.interactive.list_reply.id;
        await handleListResponse(from, listId);
        return;
    }

    // 3. Mensajes de texto libre
    if (message.type === 'text') {
        const text = message.text.body.trim();
        await handleTextMessage(from, text);
        return;
    }
}

/**
 * Muestra el menú inicial de Selección de Idioma (8 Idiomas).
 */
async function sendLanguageMenu(from) {
    userStates.delete(from);

    const bodyText = "🌍 *Bienvenido / Ongi Etorri / Welcome to Asador Casa Julian*\n\nPor favor, selecciona tu idioma preferido para continuar:\nMesedez, aukeratu zure hizkuntza:\nPlease select your preferred language:";
    const buttonText = "🌐 Idioma / Language";

    const sections = [
        {
            title: "Selecciona tu Idioma",
            rows: [
                { id: "lang_es", title: "Castellano 🇪🇸", description: "Español - Spanish" },
                { id: "lang_eu", title: "Euskera 🟢", description: "Euskara - Basque" },
                { id: "lang_en", title: "English 🇬🇧", description: "English" },
                { id: "lang_fr", title: "Français 🇫🇷", description: "Français - French" },
                { id: "lang_zh", title: "中文 🇨🇳", description: "Chinese" },
                { id: "lang_ja", title: "日本語 🇯🇵", description: "Japanese" },
                { id: "lang_ru", title: "Русский 🇷🇺", description: "Russian" },
                { id: "lang_ar", title: "العربية 🇸🇦", description: "Arabic" }
            ]
        }
    ];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

/**
 * Muestra el Menú Principal traducido al idioma seleccionado por el cliente.
 */
async function sendMainMenu(from) {
    const lang = userLanguages.get(from) || 'es';

    const bodyText = getTranslation(lang, 'welcomeTitle') + "\n\n" + getTranslation(lang, 'welcomeBody');
    const buttonText = getTranslation(lang, 'buttonText');

    const sections = [
        {
            title: getTranslation(lang, 'sectionTitle'),
            rows: [
                { id: "opt_quiero_reservar", title: getTranslation(lang, 'opt1Title'), description: getTranslation(lang, 'opt1Desc') },
                { id: "opt_lista_espera", title: getTranslation(lang, 'opt2Title'), description: getTranslation(lang, 'opt2Desc') },
                { id: "opt_tengo_reserva", title: getTranslation(lang, 'opt3Title'), description: getTranslation(lang, 'opt3Desc') },
                { id: "opt_preguntas_frecuentes", title: getTranslation(lang, 'opt4Title'), description: getTranslation(lang, 'opt4Desc') },
                { id: "opt_cambiar_idioma", title: "🌐 Cambiar Idioma", description: "Seleccionar otro idioma / Change language." }
            ]
        }
    ];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

/**
 * Procesa las selecciones de Listas Interactivas (Idiomas, Menú Principal y FAQs).
 */
async function handleListResponse(from, listId) {
    // 1. Selección de Idioma
    if (listId.startsWith('lang_')) {
        const selectedLang = listId.replace('lang_', '');
        userLanguages.set(from, selectedLang);
        console.log(`🌐 Idioma cambiado para ${from} ➔ ${selectedLang}`);
        await sendMainMenu(from);
        return;
    }

    // 2. Selección de Reserva específica (cuando el cliente tiene más de una reserva)
    if (listId.startsWith('sel_res_')) {
        const resId = listId.replace('sel_res_', '');
        const r = db.getReservationById(resId);
        if (!r) {
            await sendMessage(from, "❌ No se pudo encontrar la reserva seleccionada.");
            await sendMainMenu(from);
            return;
        }
        await sendReservationManagementMenu(from, r);
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
            await sendMessage(from, "🕒 *Horarios de Apertura*\n\n• *Comidas:* Martes a Domingo de 13:30 a 16:00 h.\n• *Cenas:* Jueves a Sábado de 20:30 a 23:00 h.\n• *Lunes:* Cerrado por descanso semanal.");
            await sendBackToMenuButton(from, lang);
            break;

        case 'faq_grupos':
            await sendMessage(from, "👥 *Reservas para Grupos*\n\nPara reservas de más de 8 personas, coordinamos menús especiales de degustación. Escribe tu consulta aquí y un responsable te contactará.");
            await sendBackToMenuButton(from, lang);
            break;

        case 'faq_mascotas':
            await sendMessage(from, "🐶 *Política de Mascotas*\n\nAdmitimos mascotas bien educadas en las zonas habilitadas del comedor de la entrada. Por favor indícalo al reservar.");
            await sendBackToMenuButton(from);
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
 * Muestra el menú de gestión de una reserva localizada con las 4 opciones solicitadas:
 * 1. Ver reserva, 2. Modificar reserva, 3. Cancelar reserva, 4. Menú principal.
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
                await sendMessage(from, `ℹ️ *Reserva (${r.id}):*\n\n👤 *Nombre:* ${r.nombre}\n📅 *Fecha:* ${r.fecha}\n⏰ *Hora:* ${r.hora}\n👥 *Comensales:* ${r.comensales}\n🪪 *DNI:* ${r.dni}\n📧 *Email:* ${r.email}\n📌 *Estado:* ${r.estado}`);
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
    const lang = userLanguages.get(from) || 'es';
    const currentState = userStates.get(from);

    // Si no ha seleccionado idioma o no hay estado, mostrar selección de idioma inicial
    if (!userLanguages.has(from)) {
        await sendLanguageMenu(from);
        return;
    }

    if (!currentState) {
        await sendMainMenu(from);
        return;
    }

    switch (currentState.step) {
        case 'reserva_esperando_fecha':
            if (text.length < 5 || (!text.includes('/') && !text.includes('-'))) {
                await sendMessage(from, "⚠️ Por favor, introduce una fecha válida en formato *DD/MM/AAAA* (Ejemplo: 25/10/2026):");
                return;
            }
            currentState.data.fecha = text;
            currentState.step = 'reserva_esperando_hora';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'stepTime'));
            break;

        case 'reserva_esperando_hora':
            currentState.data.hora = text;
            currentState.step = 'reserva_esperando_comensales';
            userStates.set(from, currentState);
            await sendMessage(from, getTranslation(lang, 'stepGuests'));
            break;

        case 'reserva_esperando_comensales':
            currentState.data.comensales = text;

            const { fecha, hora, comensales } = currentState.data;
            const check = db.checkAvailability(fecha, hora, comensales);

            if (check.disponible) {
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
            
            const nuevaReserva = db.createReservation(currentState.data);
            userStates.delete(from);

            await notifications.sendEmailConfirmation(nuevaReserva);
            await notifications.sendSMSConfirmation(nuevaReserva);

            await sendMessage(from, `${getTranslation(lang, 'confirmed')}\n\n📋 *Resumen:*
- *${getTranslation(lang, 'code')}:* ${nuevaReserva.id}
- *Nombre:* ${nuevaReserva.nombre}
- *Fecha:* ${nuevaReserva.fecha}
- *Hora:* ${nuevaReserva.hora}
- *Comensales:* ${nuevaReserva.comensales}
- *DNI:* ${nuevaReserva.dni}
- *Email:* ${nuevaReserva.email}

📩 *Confirmación por Email y SMS enviada.* ¡Te esperamos! 🔥`);
            await sendMainMenu(from);
            break;

        case 'espera_datos_nombre':
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
            
            const registroEspera = db.addToWaitlist(currentState.data);
            const pos = db.getWaitlistPosition(registroEspera.dni);
            userStates.delete(from);

            await notifications.sendEmailConfirmation({ ...registroEspera, estado: "LISTA DE ESPERA (Puesto #" + pos.posicion + ")" });
            await notifications.sendSMSConfirmation(registroEspera);

            await sendMessage(from, `📥 *¡Inscripción Guardada en Lista de Espera!*\n\nTe hemos inscrito en la lista de espera para el *${registroEspera.fecha}* a las *${registroEspera.hora}* (${registroEspera.comensales} personas).\n\n📍 Tu posición actual en la cola es la *#${pos.posicion}*. Te contactaremos de inmediato por WhatsApp, SMS y Email en cuanto se libere una mesa.`);
            await sendMainMenu(from);
            break;

        case 'espera_esperando_id':
            const consultaEspera = db.getWaitlistPosition(text);
            
            if (!consultaEspera.encontrado) {
                await sendMessage(from, `❌ No consta ninguna inscripción activa en la lista de espera para la búsqueda: *${text}*.`);
                await sendMainMenu(from);
            } else {
                const reg = consultaEspera.registro;
                currentState.tempWaitlistId = reg.id;
                userStates.set(from, currentState);

                const infoText = `📋 *Tu Inscripción en Lista de Espera:*\n\n👤 *Nombre:* ${reg.nombre}\n📅 *Fecha solicitada:* ${reg.fecha} (${reg.hora})\n👥 *Comensales:* ${reg.comensales}\n\n📍 *Posición actual:* #${consultaEspera.posicion} (Hay ${consultaEspera.personasDelante} personas delante de ti).`;
                
                const buttons = [
                    { id: 'btn_seguir_esperando', title: "Seguir esperando" },
                    { id: 'btn_eliminar_espera', title: "Eliminarme de lista" }
                ];
                await sendInteractiveButtons(from, infoText, buttons);
            }
            break;

        case 'reserva_existente_esperando_id':
            const reservasEncontradas = db.getAllReservations(text);

            if (!reservasEncontradas || reservasEncontradas.length === 0) {
                await sendMessage(from, `❌ No existe ninguna reserva activa a nombre, DNI, teléfono o email: *${text}*.`);
                await sendMainMenu(from);
            } else if (reservasEncontradas.length === 1) {
                await sendReservationManagementMenu(from, reservasEncontradas[0]);
            } else {
                // Múltiples reservas encontradas para el mismo cliente
                const rows = reservasEncontradas.slice(0, 10).map(r => {
                    const shortTitle = `${r.fecha} (${r.hora})`.slice(0, 24);
                    return {
                        id: `sel_res_${r.id}`,
                        title: shortTitle,
                        description: `${r.comensales} personas • Código: ${r.id}`
                    };
                });

                const bodyText = `📋 *Hemos localizado ${reservasEncontradas.length} reservas activas a tu nombre.*\n\nPor favor, selecciona abajo cuál de tus reservas deseas consultar, modificar o cancelar:`;
                const buttonText = "Seleccionar Reserva";
                const sections = [
                    {
                        title: "Tus Reservas",
                        rows: rows
                    }
                ];

                await sendInteractiveList(from, bodyText, buttonText, sections);
            }
            break;

        default:
            await sendLanguageMenu(from);
    }
}

async function sendFaqMenu(from, lang) {
    const bodyText = "❓ *Preguntas Frecuentes - Casa Julian*\n\nSelecciona el tema sobre el que deseas información:";
    const buttonText = "Ver Preguntas";

    const sections = [
        {
            title: "Información General",
            rows: [
                { id: "faq_carta", title: "📜 Carta y Menús", description: "Ver platos, chuletones y carta de vinos." },
                { id: "faq_ubicacion", title: "📍 Ubicación", description: "Direcciones de Tolosa y Madrid." },
                { id: "faq_horarios", title: "🕒 Horarios", description: "Días de apertura, turnos de comida y cena." },
                { id: "faq_grupos", title: "👥 Reservas Grupos", description: "Reservas de más de 8 personas." },
                { id: "faq_mascotas", title: "🐶 Mascotas", description: "Política sobre mascotas." },
                { id: "faq_parking", title: "🚗 Parking", description: "Opciones de aparcamiento cercano." },
                { id: "faq_alergias", title: "🌾 Alergias y Dietas", description: "Opciones celíacos y alérgenos." }
            ]
        }
    ];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

async function sendBackToMenuButton(from, lang) {
    const buttons = [
        { id: 'btn_volver_menu', title: getTranslation(lang, 'btnMenu') }
    ];
    await sendInteractiveButtons(from, "¿Quieres realizar otra consulta?", buttons);
}

module.exports = {
    processMessage,
    sendLanguageMenu,
    sendMainMenu
};
