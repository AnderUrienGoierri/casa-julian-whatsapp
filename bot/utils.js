/**
 * Utility functions for bot logic (date parsing, closure checks, email validation, etc.).
 */

function parseAndValidateDates(text) {
    if (!text) return [];
    const parts = text.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
    const validDates = [];

    for (const part of parts) {
        const match = part.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
        if (match) {
            const day = parseInt(match[1], 10);
            const month = parseInt(match[2], 10);
            const year = parseInt(match[3], 10);

            if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2024 && year <= 2035) {
                const formattedDay = day < 10 ? '0' + day : '' + day;
                const formattedMonth = month < 10 ? '0' + month : '' + month;
                const cleanDateStr = `${formattedDay}/${formattedMonth}/${year}`;
                if (!validDates.includes(cleanDateStr)) {
                    validDates.push(cleanDateStr);
                }
            }
        }
    }
    return validDates;
}

function getDayOfWeekFromDateStr(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const match = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (!match) return null;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const d = new Date(year, month, day, 12, 0, 0);
    return d.getDay();
}

function checkRestaurantClosedDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const match = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (!match) return null;

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    // 1. Descanso semanal del restaurante: Lunes (dayOfWeek === 1) para CUALQUIER año
    // Se usa las 12:00:00 del mediodía para evitar cualquier desfasaje por zona horaria
    const dateObj = new Date(year, month - 1, day, 12, 0, 0);
    const dayOfWeek = dateObj.getDay();
    if (dayOfWeek === 1) {
        return { closed: true, reason: 'monday', date: dateStr };
    }

    // 2. Único periodo de vacaciones del restaurante: Del 24 de Agosto al 7 de Septiembre (ambos inclusive)
    if ((month === 8 && day >= 24) || (month === 9 && day <= 7)) {
        return { closed: true, reason: 'vacation', date: dateStr };
    }

    return null;
}

function isValidEmail(email) {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
}

function getInvalidEmailMsg(lang) {
    if (lang === 'eu') {
        return '⚠️ *Email helbide baliogabea.* Mesedez, idatzi email baliogarri bat (adib. *nombre@ejemplo.com*), edo sakatu botoiaren bidez saltatu:';
    } else if (lang === 'en') {
        return '⚠️ *Invalid email address.* Please enter a valid email (e.g. *nombre@ejemplo.com*), or skip using the button:';
    } else {
        return '⚠️ *Email no válido.* Por favor, introduce un email correcto (ej. *nombre@ejemplo.com*), o pulsa el botón para omitirlo:';
    }
}

function formatModificationDetail(nombreCliente, telefonoReserva, from, reservaActual, campoMod, valorMod, lang = 'es') {
    let detailStr = '';

    if (lang === 'eu') {
        detailStr = `🆔 *Berrespen-kodea:* Ez da berretsi (Jatetxeak aztertzeko zain)\n` +
                    `👤 *Bezeroaren izena:* ${nombreCliente || 'Zehaztugabea'}\n` +
                    `📞 *Telefonoa:* ${telefonoReserva || from}\n` +
                    `📌 *Uneko erreserba:* ${reservaActual}\n` +
                    `✏️ *Eskatutako aldaketa (${campoMod}):* ${valorMod}`;
    } else if (lang === 'en') {
        detailStr = `🆔 *Confirmation Code:* Not confirmed (Pending restaurant review)\n` +
                    `👤 *Guest Name:* ${nombreCliente || 'Unspecified'}\n` +
                    `📞 *Phone:* ${telefonoReserva || from}\n` +
                    `📌 *Current Reservation:* ${reservaActual}\n` +
                    `✏️ *Requested Change (${campoMod}):* ${valorMod}`;
    } else {
        detailStr = `🆔 *Código de Confirmación:* No confirmada (Pendiente de revisión por el restaurante)\n` +
                    `👤 *Nombre del Cliente:* ${nombreCliente || 'No especificado'}\n` +
                    `📞 *Teléfono:* ${telefonoReserva || from}\n` +
                    `📌 *Reserva Actual:* ${reservaActual}\n` +
                    `✏️ *Modificación Solicitada (${campoMod}):* ${valorMod}`;
    }

    return detailStr;
}

function validateAndParseModShifts(text, fechaStr, lang = 'es') {
    if (!text || typeof text !== 'string') {
        return { isValid: false, invalidTime: '', reason: 'invalid_shift' };
    }

    const cleanText = text.trim();
    const lowerText = cleanText.toLowerCase();

    if (['sin preferencia', 'hobespenik ez', 'no preference', 'sin preferia'].includes(lowerText)) {
        return { isValid: true, formatted: 'Sin preferencia' };
    }

    const parts = cleanText.split(/[,y\/]+/i).map(p => p.trim()).filter(Boolean);

    const validLunch = ['12:30', '13:00', '13:30', '14:00', '15:15'];
    const validDinner = ['20:00', '20:30', '21:00', '21:30'];

    const dayOfWeek = fechaStr ? getDayOfWeekFromDateStr(fechaStr) : null;
    const isDinnerAllowed = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === null);

    const parsedTimes = [];

    for (let part of parts) {
        const match = part.match(/(\d{1,2})[:\.]?(\d{2})/);
        if (!match) {
            return {
                isValid: false,
                invalidTime: part,
                reason: 'invalid_shift'
            };
        }

        let hours = match[1].padStart(2, '0');
        let minutes = match[2];
        let normalizedTime = `${hours}:${minutes}`;

        if (validLunch.includes(normalizedTime)) {
            parsedTimes.push(normalizedTime);
        } else if (validDinner.includes(normalizedTime)) {
            if (!isDinnerAllowed) {
                return {
                    isValid: false,
                    invalidTime: normalizedTime,
                    reason: 'dinner_not_allowed'
                };
            }
            parsedTimes.push(normalizedTime);
        } else {
            return {
                isValid: false,
                invalidTime: part,
                reason: 'invalid_shift'
            };
        }
    }

    if (parsedTimes.length === 0) {
        return {
            isValid: false,
            invalidTime: cleanText,
            reason: 'invalid_shift'
        };
    }

    return {
        isValid: true,
        formatted: parsedTimes.join(', ')
    };
}

module.exports = {
    parseAndValidateDates,
    getDayOfWeekFromDateStr,
    checkRestaurantClosedDate,
    isValidEmail,
    getInvalidEmailMsg,
    formatModificationDetail,
    validateAndParseModShifts
};
