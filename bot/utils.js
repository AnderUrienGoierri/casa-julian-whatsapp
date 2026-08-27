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

function getClosedDateDetails(year, month, day, dayOfWeek, dateStr) {
    // 1. Lunes siempre cerrado por descanso semanal
    if (dayOfWeek === 1) {
        return { closed: true, reason: 'monday', date: dateStr };
    }

    // 2. Calendario 2026:
    if (year === 2026) {
        // Vacaciones 2026: 24 de agosto al 8 de septiembre
        if ((month === 8 && day >= 24) || (month === 9 && day <= 8)) {
            return { closed: true, reason: 'vacation_2026', date: dateStr };
        }
        // 12 de octubre festivo
        if (month === 10 && day === 12) {
            return { closed: true, reason: 'holiday_12_oct', date: dateStr };
        }
        // 24, 25 y 31 de diciembre festivos
        if (month === 12 && (day === 24 || day === 25 || day === 31)) {
            return { closed: true, reason: `holiday_${day}_dec_2026`, date: dateStr };
        }
    }

    // 3. Calendario 2027:
    if (year === 2027) {
        // 1, 5, 6 de enero festivos
        if (month === 1 && (day === 1 || day === 5 || day === 6)) {
            return { closed: true, reason: `holiday_${day}_jan_2027`, date: dateStr };
        }
        // Vacaciones 2027: 18 al 31 de enero
        if (month === 1 && day >= 18 && day <= 31) {
            return { closed: true, reason: 'vacation_2027', date: dateStr };
        }
        // 10 de febrero cerrado (Carnaval)
        if (month === 2 && day === 10) {
            return { closed: true, reason: 'holiday_carnaval_2027', date: dateStr };
        }
    }

    // Regla general para vacaciones estivales (24 agosto - 8 septiembre) si no coincide año explícito
    if ((month === 8 && day >= 24) || (month === 9 && day <= 8)) {
        return { closed: true, reason: 'vacation_2026', date: dateStr };
    }

    return null;
}

function checkRestaurantClosedDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const match = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (!match) return null;

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    const dateObj = new Date(year, month - 1, day, 12, 0, 0);
    const dayOfWeek = dateObj.getDay();

    return getClosedDateDetails(year, month, day, dayOfWeek, dateStr);
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
        return '⚠️ *Dirección de email no válida.* Por favor, introduce un email válido (ej: *nombre@ejemplo.com*), o pulsa para omitir:';
    }
}

function formatModificationDetail(nombreCliente, telefonoReserva, senderPhone, reservaActual, labelCampo, nuevoValor, lang = 'es') {
    let localizedLabelCampo = labelCampo;
    if (lang === 'eu') {
        if (labelCampo === 'NÚMERO DE COMENSALES' || labelCampo === 'NUMERO DE COMENSALES') {
            localizedLabelCampo = 'MAHAIKIDE KOPURUA';
        } else if (labelCampo === 'FECHA(S) DE PREFERENCIA' || labelCampo.includes('FECHA')) {
            localizedLabelCampo = 'AUKERATUTAKO DATA(K)';
        } else if (labelCampo === 'HORA DE PREFERENCIA / TURNO' || labelCampo.includes('HORA') || labelCampo.includes('TURNO')) {
            localizedLabelCampo = 'AUKERATUTAKO ORDUTEGIA / TXANDA';
        }
    } else if (lang === 'en') {
        if (labelCampo === 'NÚMERO DE COMENSALES' || labelCampo === 'NUMERO DE COMENSALES') {
            localizedLabelCampo = 'NUMBER OF GUESTS';
        } else if (labelCampo === 'FECHA(S) DE PREFERENCIA' || labelCampo.includes('FECHA')) {
            localizedLabelCampo = 'PREFERRED DATE(S)';
        } else if (labelCampo === 'HORA DE PREFERENCIA / TURNO' || labelCampo.includes('HORA') || labelCampo.includes('TURNO')) {
            localizedLabelCampo = 'PREFERRED TIME / SHIFT';
        }
    }

    let localizedNuevoValor = nuevoValor;
    if (lang === 'eu' && typeof nuevoValor === 'string') {
        localizedNuevoValor = nuevoValor.replace(/\bpersonas\b/gi, 'pertsona');
    } else if (lang === 'en' && typeof nuevoValor === 'string') {
        localizedNuevoValor = nuevoValor.replace(/\bpersonas\b/gi, 'guests');
    }

    let localizedReservaActual = reservaActual;
    if (lang === 'eu' && typeof reservaActual === 'string') {
        localizedReservaActual = reservaActual.replace(/-\s*Fecha:\s*/gi, '- Data: ').replace(/\bFecha:\s*/gi, 'Data: ');
    } else if (lang === 'en' && typeof reservaActual === 'string') {
        localizedReservaActual = reservaActual.replace(/-\s*Fecha:\s*/gi, '- Date: ').replace(/\bFecha:\s*/gi, 'Date: ');
    }

    const titleLabel = lang === 'eu' ? 'RESERBA ALDATZEKO ESKAERA' : (lang === 'en' ? 'RESERVATION MODIFICATION REQUEST' : 'SOLICITUD MODIFICACIÓN DE RESERVA');
    const holderLabel = lang === 'eu' ? 'Titularraren izena:' : (lang === 'en' ? 'Holder Name:' : 'Nombre del Titular:');
    const phoneLabel = lang === 'eu' ? 'Telefonoa:' : (lang === 'en' ? 'Phone:' : 'Teléfono Reserva:');
    const senderLabel = lang === 'eu' ? 'Bidaltzailearen WhatsApp-a:' : (lang === 'en' ? 'Sender WhatsApp:' : 'WhatsApp Remitente:');
    const currentResLabel = lang === 'eu' ? 'Egungo erreserba:' : (lang === 'en' ? 'Current reservation:' : 'Reserva Actual:');
    const modLabel = lang === 'eu' ? 'Aldatu nahi den eremua:' : (lang === 'en' ? 'Field to modify:' : 'Campo a Modificar:');
    const valLabel = lang === 'eu' ? 'Balio berria:' : (lang === 'en' ? 'New value:' : 'Nuevo Valor:');
    const requestTypeLabel = lang === 'eu' ? 'Eskaera:' : (lang === 'en' ? 'Request:' : 'Solicitud:');
    const notSpecified = lang === 'eu' ? 'Zehaztu gabe' : (lang === 'en' ? 'Not specified' : 'No especificado');

    return (
        `👤 *${holderLabel}* ${nombreCliente || notSpecified}\n` +
        `📞 *${phoneLabel}* ${telefonoReserva || notSpecified}\n` +
        `📱 *${senderLabel}* ${senderPhone}\n` +
        `📌 *${currentResLabel}* ${localizedReservaActual}\n` +
        `✏️ *${modLabel}* ${localizedLabelCampo}\n` +
        `🆕 *${valLabel}* ${localizedNuevoValor}\n` +
        `📋 *${requestTypeLabel}* ${titleLabel}`
    );
}

function validateAndParseModShifts(textStr, predefinedShifts = []) {
    if (!textStr || typeof textStr !== 'string') return { validShifts: [], invalidShifts: [], isValid: false };
    const parts = textStr.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);

    const validShifts = [];
    const invalidShifts = [];

    let allowed = [];
    if (Array.isArray(predefinedShifts)) {
        allowed = predefinedShifts.map(s => String(s).trim());
    } else if (typeof predefinedShifts === 'string') {
        allowed = [predefinedShifts.trim()];
    }

    for (const part of parts) {
        const timeMatch = part.match(/(\d{1,2})[:\.](\d{2})/);
        if (timeMatch) {
            const h = timeMatch[1].padStart(2, '0');
            const m = timeMatch[2];
            const formatted = `${h}:${m}`;
            if (allowed.length === 0 || allowed.includes(formatted)) {
                if (!validShifts.includes(formatted)) validShifts.push(formatted);
            } else {
                if (!invalidShifts.includes(part)) invalidShifts.push(part);
            }
        } else {
            if (!invalidShifts.includes(part)) invalidShifts.push(part);
        }
    }

    return { 
        validShifts, 
        invalidShifts, 
        isValid: validShifts.length > 0 && invalidShifts.length === 0,
        formatted: validShifts.join(', ')
    };
}

function isValidPersonName(text) {
    if (!text || typeof text !== 'string') return false;
    const cleanText = text.trim();

    if (cleanText.length < 2 || cleanText.length > 50) return false;
    if (/\d/.test(cleanText)) return false;

    const lower = cleanText.toLowerCase();
    const bannedKeywords = [
        'lunes', 'martes', 'miercoles', 'miércoles', 'jueves', 'viernes', 'sabado', 'sábado', 'domingo',
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
        'cancelar', 'modificar', 'reserva', 'mesa', 'comida', 'cena', 'hoy', 'mañana', 'manana'
    ];

    if (bannedKeywords.some(kw => lower.includes(kw))) return false;
    if (!/[a-zA-ZáéíóúÁÉÍÓÚñÑàèìòùÀÈÌÒÙäëïöüÄËÏÖÜçÇ]/.test(cleanText)) return false;

    return true;
}

function getInvalidNameMsg(lang = 'es') {
    if (lang === 'eu') {
        return `⚠️ Data bat edo formatu baliogabe bat idatzi duzu izen baten ordez.\n\nMesedez, idatzi titularraren *Izen-Abizen* osoak testu moduan (adibidez: *Ander Urien*):`;
    } else if (lang === 'en') {
        return `⚠️ You entered a date or an invalid format instead of a name.\n\nPlease enter the reservation holder's *Full Name* as text (e.g. *Ander Urien*):`;
    } else {
        return `⚠️ Has introducido una fecha o un formato no válido en lugar de un nombre.\n\nPor favor, indícanos el *Nombre y Apellidos* del titular en formato texto (ej: *Ander Urien*):`;
    }
}

function isWithin24Hours(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    const cleanStr = dateStr.trim();
    let day, month, year;

    const matchDMY = cleanStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    const matchYMD = cleanStr.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);

    if (matchDMY) {
        day = parseInt(matchDMY[1], 10);
        month = parseInt(matchDMY[2], 10);
        year = parseInt(matchDMY[3], 10);
    } else if (matchYMD) {
        year = parseInt(matchYMD[1], 10);
        month = parseInt(matchYMD[2], 10);
        day = parseInt(matchYMD[3], 10);
    } else {
        return false;
    }

    if (isNaN(day) || isNaN(month) || isNaN(year)) return false;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const resDateStart = new Date(year, month - 1, day, 0, 0, 0);

    const diffDays = Math.round((resDateStart.getTime() - todayStart.getTime()) / 86400000);

    // Si la reserva es para hoy, mañana (siguiente día) o anterior, aplica la advertencia de antelación
    return diffDays <= 1;
}

function validateSingleDate(dateStr, lang = 'es', options = {}) {
    if (!dateStr || typeof dateStr !== 'string') {
        return { isValid: false, reason: 'format', date: dateStr || '' };
    }

    const cleanInput = dateStr.trim();
    const match = cleanInput.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (!match) {
        return { isValid: false, reason: 'format', date: cleanInput };
    }

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year) || day < 1 || day > 31 || month < 1 || month > 12 || year < 2024 || year > 2035) {
        return { isValid: false, reason: 'format', date: cleanInput };
    }

    const testDate = new Date(year, month - 1, day);
    if (testDate.getFullYear() !== year || testDate.getMonth() !== month - 1 || testDate.getDate() !== day) {
        return { isValid: false, reason: 'format', date: cleanInput };
    }

    const formattedDay = day < 10 ? '0' + day : '' + day;
    const formattedMonth = month < 10 ? '0' + month : '' + month;
    const formattedDateStr = `${formattedDay}/${formattedMonth}/${year}`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const inputDateObj = new Date(year, month - 1, day, 12, 0, 0);
    if (inputDateObj < today) {
        return { isValid: false, reason: 'past', date: formattedDateStr };
    }

    const checkMax6Months = options.checkMax6Months !== false;
    if (checkMax6Months) {
        const maxDate = new Date();
        maxDate.setMonth(maxDate.getMonth() + 6);
        maxDate.setHours(23, 59, 59, 999);

        if (inputDateObj > maxDate) {
            return { isValid: false, reason: 'max_6_months', date: formattedDateStr };
        }
    }

    const dayOfWeek = inputDateObj.getDay();
    const closedDetails = getClosedDateDetails(year, month, day, dayOfWeek, formattedDateStr);
    if (closedDetails) {
        return { isValid: false, reason: closedDetails.reason, date: formattedDateStr };
    }

    return { isValid: true, formatted: formattedDateStr, date: formattedDateStr };
}

function getConciseDateReason(val, lang = 'es') {
    const reason = val?.reason || 'format';
    if (reason === 'max_6_months') {
        if (lang === 'eu') return 'Gehienez 6 hilabeteko aldez aurretik';
        if (lang === 'en') return 'Max 6 months in advance';
        return 'Máximo 6 meses de antelación';
    }
    if (reason === 'past') {
        if (lang === 'eu') return 'Igarotako data';
        if (lang === 'en') return 'Past date';
        return 'Fecha pasada';
    }
    if (reason === 'monday') {
        if (lang === 'eu') return 'Astelehena (itxita atsedenagatik)';
        if (lang === 'en') return 'Monday (weekly rest day)';
        return 'Lunes (cerrado por descanso)';
    }
    if (reason && reason.startsWith('vacation')) {
        let period = '24 abuztua - 8 iraila';
        if (lang === 'es') period = '24 ago - 8 sep';
        if (lang === 'en') period = 'Aug 24 - Sep 8';
        if (reason === 'vacation_2027') {
            period = lang === 'eu' ? '18-31 urtarrila' : (lang === 'en' ? 'Jan 18-31' : '18-31 ene');
        }
        if (lang === 'eu') return `Oporraldia (${period})`;
        if (lang === 'en') return `Vacation period (${period})`;
        return `Vacaciones del restaurante (${period})`;
    }
    if (reason && reason.startsWith('holiday')) {
        if (lang === 'eu') return 'Jai-eguna (itxita)';
        if (lang === 'en') return 'Public holiday (closed)';
        return 'Día festivo (cerrado)';
    }
    if (reason === 'dinner_days') {
        if (lang === 'eu') return 'Afariak ostiral eta larunbatetan bakarrik';
        if (lang === 'en') return 'Dinners only on Friday & Saturday';
        return 'Cenas solo viernes y sábados';
    }
    if (lang === 'eu') return 'Formatu edo data baliogabea';
    if (lang === 'en') return 'Invalid date or format';
    return 'Formato o fecha no válida';
}

function formatCombinedDateErrorMsg(invalidList, lang = 'es', validFechas = []) {
    if (!invalidList || invalidList.length === 0) return '';

    let savedSection = '';
    if (validFechas && validFechas.length > 0) {
        const count = validFechas.length;
        const validListStr = validFechas.map(f => `• ${f}`).join('\n');
        let savedHeader = `📌 *Nuevas fechas de preferencia guardadas (${count}/5):*`;
        if (lang === 'eu') savedHeader = `📌 *Berezitako data berriak gorde dira (${count}/5):*`;
        else if (lang === 'en') savedHeader = `📌 *New preferred dates saved (${count}/5):*`;

        savedSection = `${savedHeader}\n${validListStr}\n\n`;
    }

    let header = '⚠️ *Las siguientes fechas no son válidas:*';
    let footer = 'Por favor, indica fechas válidas en formato DD/MM/AAAA (ej: 15/09/2026):';

    if (lang === 'eu') {
        header = '⚠️ *Hurrengo datak ez dira baliozkoak:*';
        footer = 'Mesedez, adierazi data baliozkoak DD/MM/AAAA formatuan (adib: 15/09/2026):';
    } else if (lang === 'en') {
        header = '⚠️ *The following dates are not valid:*';
        footer = 'Please enter valid dates in DD/MM/YYYY format (e.g. 15/09/2026):';
    }

    const itemsStr = invalidList.map(item => `• *${item.date || ''}*: ${getConciseDateReason(item, lang)}`).join('\n');

    return `${savedSection}${header}\n${itemsStr}\n\n${footer}`;
}

function getDateValidationErrorMsg(validation, lang = 'es') {
    const d = validation?.date || '';
    const reasonText = getConciseDateReason(validation, lang);

    if (lang === 'eu') {
        return `⚠️ *${d}* data ez da baliozkoa (${reasonText}).\n\nMesedez, idatzi beste data bat (adibidez: 15/09/2026):`;
    } else if (lang === 'en') {
        return `⚠️ The date *${d}* is not valid (${reasonText}).\n\nPlease enter another date (example: 15/09/2026):`;
    } else {
        return `⚠️ La fecha *${d}* no es válida (${reasonText}).\n\nPor favor, indica otra fecha (ejemplo: 15/09/2026):`;
    }
}

module.exports = {
    parseAndValidateDates,
    getDayOfWeekFromDateStr,
    getClosedDateDetails,
    checkRestaurantClosedDate,
    isValidEmail,
    getInvalidEmailMsg,
    formatModificationDetail,
    validateAndParseModShifts,
    isValidPersonName,
    getInvalidNameMsg,
    validateSingleDate,
    getDateValidationErrorMsg,
    getConciseDateReason,
    formatCombinedDateErrorMsg,
    isWithin24Hours
};
