const { sendMessage } = require('../whatsappApi');
const { getTranslation } = require('../i18n');
const { getDayOfWeekFromDateStr, formatModificationDetail } = require('./utils');
const { requestUserConfirmation } = require('./confirmation');

/**
 * Envía las opciones de turnos horarios para modificación en formato texto según el día de la semana.
 */
async function sendModHoraOptions(from, lang, state) {
    const fechaStr = state?.data?.fechaReservaOriginal || state?.data?.fecha || (Array.isArray(state?.data?.modFechas) && state.data.modFechas.length > 0 ? state.data.modFechas[0] : null);
    
    const dayOfWeek = getDayOfWeekFromDateStr(fechaStr);
    const isWeekend = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === null);

    let msg = '';

    if (lang === 'eu') {
        if (isWeekend) {
            msg = `🕐 *Ordu Berriaren Aukeraketa Erreserba Aldatzeko*\n\n` +
                  `📅 Erreserba-data: *${fechaStr || 'Zehaztua'}* (Ostirala / Larunbata)\n\n` +
                  `📌 *Eskuragarri dauden txanda berriak:*\n` +
                  `☀️ *Bazkaria:* 12:30, 13:00, 13:30, 14:00, 15:15\n` +
                  `🌙 *Afaria:* 20:00, 20:30, 21:00, 21:30\n\n` +
                  `✍️ *Mesedez, idatzi zure ordu hobetsia(k)* (txanda bat edo gehiago idatz ditzakezu malgutasun handiagoa izateko, adibidez: *13:30, 14:00* edo *20:00*):`;
        } else {
            msg = `🕐 *Ordu Berriaren Aukeraketa Erreserba Aldatzeko*\n\n` +
                  `📅 Erreserba-data: *${fechaStr || 'Zehaztua'}*\n` +
                  `*(Igandetik ostegunera bazkari zerbitzua bakarrik eskaintzen da)*\n\n` +
                  `📌 *Eskuragarri dauden bazkari txanda berriak:*\n` +
                  `☀️ *Bazkaria:* 12:30, 13:00, 13:30, 14:00, 15:15\n\n` +
                  `✍️ *Mesedez, idatzi zure ordu hobetsia(k)* (txanda bat edo gehiago idatz ditzakezu malgutasun handiagoa izateko, adibidez: *13:30, 14:00*):`;
        }
    } else if (lang === 'en') {
        if (isWeekend) {
            msg = `🕐 *Select New Time Slot for Modification*\n\n` +
                  `📅 Reservation date: *${fechaStr || 'Specified'}* (Friday / Saturday)\n\n` +
                  `📌 *Available turn/time options:*\n` +
                  `☀️ *Lunch:* 12:30, 13:00, 13:30, 14:00, 15:15\n` +
                  `🌙 *Dinner:* 20:00, 20:30, 21:00, 21:30\n\n` +
                  `✍️ *Please enter your preferred time slot(s)* (you can enter one or more available shifts for flexibility, e.g.: *13:30, 14:00* or *20:00*):`;
        } else {
            msg = `🕐 *Select New Time Slot for Modification*\n\n` +
                  `📅 Reservation date: *${fechaStr || 'Specified'}*\n` +
                  `*(Sunday to Thursday we offer lunch service exclusively)*\n\n` +
                  `📌 *Available lunch turn/time options:*\n` +
                  `☀️ *Lunch:* 12:30, 13:00, 13:30, 14:00, 15:15\n\n` +
                  `✍️ *Please enter your preferred time slot(s)* (you can enter one or more available shifts for flexibility, e.g.: *13:30, 14:00*):`;
        }
    } else {
        if (isWeekend) {
            msg = `🕐 *Selección de Turno Horario para Modificación*\n\n` +
                  `📅 Fecha de reserva: *${fechaStr || 'Especificada'}* (Viernes / Sábado)\n\n` +
                  `📌 *Turnos disponibles para elegir:*\n` +
                  `☀️ *Comida:* 12:30, 13:00, 13:30, 14:00, 15:15\n` +
                  `🌙 *Cena:* 20:00, 20:30, 21:00, 21:30\n\n` +
                  `✍️ *Por favor, escribe la hora o turnos de preferencia deseados* (puedes indicar uno o varios turnos posibles para mayor flexibilidad, ej: *13:30, 14:00* o *20:00*):`;
        } else {
            msg = `🕐 *Selección de Turno Horario para Modificación*\n\n` +
                  `📅 Fecha de reserva: *${fechaStr || 'Especificada'}*\n` +
                  `*(De domingo a jueves el restaurante ofrece exclusivamente servicio de comidas)*\n\n` +
                  `📌 *Turnos de comida disponibles para elegir:*\n` +
                  `☀️ *Comida:* 12:30, 13:00, 13:30, 14:00, 15:15\n\n` +
                  `✍️ *Por favor, escribe la hora o turnos de preferencia deseados* (puedes indicar uno o varios turnos posibles para mayor flexibilidad, ej: *13:30, 14:00*):`;
        }
    }

    await sendMessage(from, msg);
}

/**
 * Maneja la selección del turno horario de modificación.
 */
async function handleModHoraSelection(from, selectedTime, userStates, userLanguages) {
    try {
        const state = userStates.get(from) || { data: {} };
        state.data = state.data || {};
        const lang = userLanguages.get(from) || 'es';

        const reservationId = state.data.reservationId || null;
        const nombreCliente = state.data.nombreCliente || null;
        const telefonoReserva = state.data.telefonoReserva || from.replace(/\D/g, '');
        const reservaActual = state.data.reservaActual || 'No especificada';

        const detalleMod = formatModificationDetail(nombreCliente, telefonoReserva, from, reservaActual, 'HORA DE PREFERENCIA / TURNO', selectedTime, lang);

        await requestUserConfirmation(from, lang, {
            tipoAccion: 'SOLICITUD MODIFICACIÓN DE RESERVA',
            reservationId: reservationId,
            isModification: true,
            detalleMod: detalleMod,
            nombreCliente: nombreCliente,
            telefonoReserva: telefonoReserva,
            successMsgKey: 'modSuccessMsg'
        }, userStates);
    } catch (err) {
        console.error("⚠️ Error en handleModHoraSelection:", err.stack || err);
    }
}

module.exports = {
    sendModHoraOptions,
    handleModHoraSelection
};
