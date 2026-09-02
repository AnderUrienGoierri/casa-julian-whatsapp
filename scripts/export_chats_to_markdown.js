const fs = require('fs');
const path = require('path');
const { pool } = require('../db/connection');
const { getAllSilencedNumbers } = require('../db/silencedNumbers');
const { getInboxSettings } = require('../db/inboxSettings');

// Helper para formatear teléfonos
function formatPhoneWithPrefix(phone) {
    if (!phone) return '';
    const str = String(phone).trim();
    if (str.startsWith('group_')) return str;
    const clean = str.replace(/\D/g, '');
    if (!clean) return phone;

    if (clean.startsWith('1') && clean.length >= 11) {
        return `+1 ${clean.slice(1)}`;
    }
    const threeDigitPrefixes = ['351', '352', '353', '354', '358', '376', '502', '503', '504', '505', '506', '507', '591', '593', '595', '598', '971'];
    for (const p of threeDigitPrefixes) {
        if (clean.startsWith(p) && clean.length > p.length) {
            return `+${p} ${clean.slice(p.length)}`;
        }
    }
    if (clean.length >= 10) {
        const prefix2 = clean.slice(0, 2);
        return `+${prefix2} ${clean.slice(2)}`;
    }
    if (clean.length === 9) {
        return `+34 ${clean}`;
    }
    return `+${clean}`;
}

// Formateo de fecha en timezone de Madrid
function formatMadridDateTime(dateStr) {
    if (!dateStr) return 'Sin fecha';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(d);
}

// Clave de carpeta diaria: DD_MM_YYYY
function getDayFolderKey(dateStr) {
    if (!dateStr) return 'sin_fecha';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'sin_fecha';
    const formatter = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(d);
    const day = parts.find(p => p.type === 'day')?.value || '01';
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const year = parts.find(p => p.type === 'year')?.value || '2026';
    return `${day}_${month}_${year}`;
}

// Sanitizar nombres de archivo para Windows/Linux
function sanitizeFilename(str) {
    return (str || 'chat')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 100);
}

// Extraer etiquetas del chatbot (solo si la fecha es >= 30/08/2026)
function getChatbotTags(allTexts, lastDateStr) {
    if (!lastDateStr) return [];
    const d = new Date(lastDateStr);
    if (isNaN(d.getTime()) || d < new Date('2026-08-30T00:00:00')) {
        return [];
    }
    const combined = (allTexts || '').toLowerCase();
    const tags = [];
    if (/tarjeta\s*regalo|tarjeta_regalo|men[uú]\s*tradici[oó]n|menu_tradicion|opari[\s\-]txartel|gift\s*card|bono\s*regalo|reserva\s*men[uú]\s*tradici[oó]n|btn_reserva_con_tarjeta|opt_regalar_menu_tradicion|opt_menu_tradicion/i.test(combined)) {
        tags.push('OT');
    }
    if (/no\s*tengo\s*tarjeta|sin\s*tarjeta|no\s*dispongo\s*de\s*tarjeta|reserva\s*online|erreserba\s*online|book\s*a\s*table|casajulian\.eus|btn_reserva_sin_tarjeta|btn_reserva_web|btn_solicitar_reserva|no\s*tengo\s*c[oó]digo|sin\s*c[oó]digo|deseas realizar alguna otra gestión o finalizar la conversación|erreserba egin nahi duzu|do you want to make another reservation|no\s*tengo|ez\s*daukat|i\s*don'?t\s*have/i.test(combined)) {
        tags.push('NO OT');
    }
    if (/modifi|cambiar\s*hora|cambiar\s*fecha|cambiar\s*personas|cambiar\s*comensales|what\s*modification|aldatu\s*nahi\s*duzu|mod_comensales|mod_dia|mod_hora|opt_modificacion|btn_go_modificacion/i.test(combined)) {
        tags.push('MODIF');
    }
    if (/cancel|anul|cancel\s*request|erreserba\s*bertan\s*behera|no\s*podremos\s*asistir|no\s*podemos\s*ir|opt_cancelacion|btn_go_cancelacion/i.test(combined)) {
        tags.push('CANCEL');
    }
    if (/consulta\s*abierta|casu[ií]stica|inquiry\s*successfully\s*sent|duda\s*o\s*consulta|necesidad\s*especial|embarazada|mascota|submit\s*request|bidali\s*eskaera|enviar\s*solicitud|opt_consulta_abierta|btn_consulta_enviar/i.test(combined)) {
        tags.push('OTRAS');
    }
    if (/otras\s*cuestiones|preguntas\s*frecuentes|faq|horario|donde\s*aparcar|d[oó]nde\s*aparcar|c[oó]mo\s*llegar|como\s*llegar|ubicaci[oó]n|ubicacion|direcci[oó]n|direccion|ver\s*carta|ikusi\s*karta|view\s*menu|other\s*questions|beste\s*gai\s*batzuk|opt_otras_cuestiones|faq_/i.test(combined)) {
        tags.push('FAQs');
    }
    return tags;
}

// Obtener nombre display conocido
function getKnownDisplayName(cleanPhone, silencedMap, rawName) {
    if (cleanPhone === 'group_taxi_casa_julian') return 'Taxi Casa Julián';
    if (cleanPhone === '34670426540') return 'Taxi Iguaran';
    if (cleanPhone === '34670449858') return 'Taxi Tolosa';
    if (cleanPhone === '34636979092') return 'Taxi Lexus';
    if (cleanPhone === '34943671417') return 'Casa Julián Tolosa';
    if (cleanPhone === '34664037707' || cleanPhone === '3466407707') return 'Ander Informatico';
    if (cleanPhone === '34645747754') return 'Xabi Gorrotxategi';
    if (cleanPhone === '34623476521') return 'Ricardo Entretiempo Studio';

    if (silencedMap && silencedMap.has(cleanPhone)) {
        const s = silencedMap.get(cleanPhone);
        if (s.nombre) return s.nombre;
    }

    if (rawName && typeof rawName === 'string') {
        const trimmed = rawName.trim();
        const low = trimmed.toLowerCase();
        if (trimmed && !low.startsWith('cliente wa') && !low.startsWith('cliente ') && low !== 'cliente' && low !== 'usuario' && !low.startsWith('+')) {
            return trimmed;
        }
    }

    return formatPhoneWithPrefix(cleanPhone);
}

// Obtener categoría
function getCategory(cleanPhone, silencedMap, customCategory) {
    if (cleanPhone === 'group_taxi_casa_julian') return 'taxi';
    if (['34670426540', '34670449858', '34636979092'].includes(cleanPhone)) return 'taxi';
    if (['34664037707', '3466407707', '34645747754'].includes(cleanPhone)) return 'personal';
    if (cleanPhone === '34623476521') return 'proveedor';
    if (cleanPhone === '34943671417') return 'restaurante';

    if (silencedMap && silencedMap.has(cleanPhone)) {
        const s = silencedMap.get(cleanPhone);
        if (s.categoria) return s.categoria;
    }

    if (customCategory) return customCategory;
    return 'cliente';
}

async function runExport() {
    console.log("🚀 Iniciando exportación de chats a Markdown clasificados por fecha...");

    const rootDir = path.join(__dirname, '..');
    const targetDirs = [
        path.join(rootDir, 'chats_whatsapp'),
        path.join(rootDir, 'chats_whastapp')
    ];

    targetDirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    // 1. Cargar metadatos
    const silencedList = await getAllSilencedNumbers();
    const silencedMap = new Map();
    silencedList.forEach(s => {
        const clean = (s.telefono || '').replace(/\D/g, '');
        if (clean) silencedMap.set(clean, s);
    });

    const inboxSettings = await getInboxSettings();
    const chatTagsMap = inboxSettings.chatTags || {};
    const pinnedMap = inboxSettings.pinnedChats || {};
    const deletedChats = inboxSettings.deletedChats || {};

    // 2. Cargar todos los mensajes de bot_chat_history
    let allMessages = [];
    if (pool) {
        try {
            const res = await pool.query(`SELECT * FROM bot_chat_history ORDER BY telefono, created_at ASC, id ASC`);
            allMessages = res.rows || [];
        } catch(e) {
            console.error("Error leyendo bot_chat_history en Postgres:", e.message);
        }
    }

    if (allMessages.length === 0) {
        const dbPath = path.join(rootDir, 'db.json');
        if (fs.existsSync(dbPath)) {
            const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
            allMessages = db.bot_chat_history || [];
        }
    }

    console.log(`📊 Total de mensajes cargados: ${allMessages.length}`);

    // 3. Agrupar mensajes por teléfono
    const chatsMap = new Map();
    allMessages.forEach(msg => {
        const tel = String(msg.telefono || '').trim();
        if (!tel) return;
        if (deletedChats[tel]) return; // Ignorar eliminados

        if (!chatsMap.has(tel)) {
            chatsMap.set(tel, []);
        }
        chatsMap.get(tel).push(msg);
    });

    console.log(`💬 Total de conversaciones activas: ${chatsMap.size}`);

    // 4. Procesar cada chat y clasificar por día del último mensaje
    const daysMap = new Map(); // dayKey -> array de objetos chat

    chatsMap.forEach((messages, telefono) => {
        const cleanPhone = telefono.startsWith('group_') ? telefono : telefono.replace(/\D/g, '');
        const lastMsg = messages[messages.length - 1];
        const firstMsg = messages[0];
        const lastDateStr = lastMsg?.created_at || new Date().toISOString();
        const firstDateStr = firstMsg?.created_at || lastDateStr;
        const dayKey = getDayFolderKey(lastDateStr);

        let rawClientName = '';
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            let meta = {};
            try {
                meta = typeof m.metadata === 'object' ? (m.metadata || {}) : JSON.parse(m.metadata || '{}');
            } catch(e) {}
            if (meta.nombreCliente) {
                rawClientName = meta.nombreCliente;
                break;
            }
        }

        const displayName = getKnownDisplayName(cleanPhone, silencedMap, rawClientName);
        const category = getCategory(cleanPhone, silencedMap, null);
        const allTexts = messages.map(m => m.texto || '').join(' ___ ');
        
        // Etiquetas
        const customTags = chatTagsMap[cleanPhone] || [];
        const botTags = getChatbotTags(allTexts, lastDateStr);
        const combinedTags = [...new Set([...customTags, ...botTags])];
        if (category === 'personal' && !combinedTags.includes('Personal')) combinedTags.push('Personal');
        if (category === 'proveedor' && !combinedTags.includes('Proveedores')) combinedTags.push('Proveedores');
        if (category === 'taxi' && !combinedTags.includes('Taxis')) combinedTags.push('Taxis');
        if (cleanPhone === 'group_taxi_casa_julian' && !combinedTags.includes('GRUPO')) combinedTags.push('GRUPO');

        const isPinned = !!pinnedMap[cleanPhone];

        const chatObj = {
            telefono: cleanPhone,
            displayName,
            category,
            tags: combinedTags,
            isPinned,
            messagesCount: messages.length,
            firstDateStr,
            lastDateStr,
            dayKey,
            messages
        };

        if (!daysMap.has(dayKey)) {
            daysMap.set(dayKey, []);
        }
        daysMap.get(dayKey).push(chatObj);
    });

    // 5. Ordenar los días cronológicamente descendente (más recientes primero)
    const sortedDays = Array.from(daysMap.keys()).sort((a, b) => {
        const [d1, m1, y1] = a.split('_').map(Number);
        const [d2, m2, y2] = b.split('_').map(Number);
        return new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1);
    });

    console.log(`📁 Creando carpetas para ${sortedDays.length} días...`);

    let totalExportedFiles = 0;

    // Generar carpetas y archivos Markdown
    for (const targetDir of targetDirs) {
        for (const dayKey of sortedDays) {
            const dayDir = path.join(targetDir, dayKey);
            if (!fs.existsSync(dayDir)) {
                fs.mkdirSync(dayDir, { recursive: true });
            }

            const chatsInDay = daysMap.get(dayKey);
            // Ordenar dentro del día: fijados primero, luego más reciente
            chatsInDay.sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return new Date(b.lastDateStr) - new Date(a.lastDateStr);
            });

            for (const chat of chatsInDay) {
                const safeName = sanitizeFilename(chat.displayName);
                const filename = `chat_${chat.telefono}_${safeName}.md`;
                const filePath = path.join(dayDir, filename);

                // Construir contenido Markdown
                let md = `# Conversación de WhatsApp: ${chat.displayName}\n\n`;
                md += `| Metadato | Detalle |\n`;
                md += `| :--- | :--- |\n`;
                md += `| **Contacto / Cliente** | **${chat.displayName}** |\n`;
                md += `| **Número de Teléfono** | \`${formatPhoneWithPrefix(chat.telefono)}\` (\`${chat.telefono}\`) |\n`;
                md += `| **Categoría** | \`${chat.category.toUpperCase()}\` |\n`;
                md += `| **Etiquetas** | ${chat.tags.length > 0 ? chat.tags.map(t => `\`${t}\``).join(' ') : '*Ninguna*'} |\n`;
                md += `| **Fijado en Panel** | ${chat.isPinned ? '📌 Sí' : 'No'} |\n`;
                md += `| **Total de Mensajes** | **${chat.messagesCount}** |\n`;
                md += `| **Primer Mensaje** | ${formatMadridDateTime(chat.firstDateStr)} |\n`;
                md += `| **Último Mensaje** | ${formatMadridDateTime(chat.lastDateStr)} |\n`;
                md += `| **Carpeta del Día** | \`${chat.dayKey}\` |\n\n`;
                md += `---\n\n`;
                md += `## 📜 Historial Completo de Mensajes\n\n`;

                chat.messages.forEach((m, idx) => {
                    const time = formatMadridDateTime(m.created_at);
                    let emisorLabel = '👤 Cliente';
                    if (m.emisor === 'bot') emisorLabel = '🤖 Chatbot';
                    else if (['staff', 'humano', 'recepcion', 'admin', 'restaurante'].includes(m.emisor)) {
                        emisorLabel = '🏢 Recepción / Staff';
                    }

                    let meta = {};
                    try {
                        meta = typeof m.metadata === 'object' ? (m.metadata || {}) : JSON.parse(m.metadata || '{}');
                    } catch(e) {}

                    let typeLabel = '';
                    if (m.tipo === 'interactive_list') typeLabel = ' *(Lista de opciones)*';
                    else if (m.tipo === 'interactive_buttons') typeLabel = ' *(Botones interactivos)*';
                    else if (m.tipo === 'interactive') typeLabel = ' *(Opción seleccionada)*';
                    else if (m.tipo === 'image') typeLabel = ' *(Imagen)*';

                    const cleanText = (m.texto || '').replace(/\r\n/g, '\n');

                    md += `### ${idx + 1}. ${emisorLabel}${typeLabel} \`[${time}]\`\n`;
                    md += `> ${cleanText.split('\n').join('\n> ')}\n\n`;

                    // Si hay opciones en metadata, documentarlas
                    if (meta.sections && Array.isArray(meta.sections)) {
                        const rows = meta.sections.flatMap(s => s.rows || []);
                        if (rows.length > 0) {
                            const rowTitles = rows.map(r => (typeof r === 'object' ? (r.title || r.id || '') : r)).filter(Boolean);
                            if (rowTitles.length > 0) {
                                md += `*Opciones mostradas:* ${rowTitles.map(t => `\`${t}\``).join(' • ')}\n\n`;
                            }
                        }
                    } else if (meta.buttons && Array.isArray(meta.buttons)) {
                        const buttonTitles = meta.buttons.map(b => (typeof b === 'object' ? (b.title || b.reply?.title || b.id || '') : b)).filter(Boolean);
                        if (buttonTitles.length > 0) {
                            md += `*Botones mostrados:* ${buttonTitles.map(t => `\`${t}\``).join(' • ')}\n\n`;
                        }
                    }
                });

                fs.writeFileSync(filePath, md, 'utf8');
                totalExportedFiles++;
            }
        }

        // 6. Generar README.md índice maestro
        let readme = `# 📂 Histórico de Conversaciones de WhatsApp - Casa Julián de Tolosa\n\n`;
        readme += `Este directorio contiene todas las conversaciones de WhatsApp del restaurante exportadas y organizadas cronológicamente por el día del **último mensaje enviado o recibido** en cada chat.\n\n`;
        readme += `### 📊 Resumen General\n`;
        readme += `- **Total de Días Registrados:** ${sortedDays.length}\n`;
        readme += `- **Total de Chats Exportados:** ${chatsMap.size}\n`;
        readme += `- **Total de Mensajes Documentados:** ${allMessages.length}\n`;
        readme += `- **Zona Horaria de Clasificación:** Europe/Madrid (España)\n\n`;
        readme += `---\n\n`;
        readme += `### 📅 Índice de Carpetas por Día\n\n`;
        readme += `| Fecha | Carpeta | Total Chats | Ejemplo de Chats |\n`;
        readme += `| :--- | :--- | :--- | :--- |\n`;

        sortedDays.forEach(dayKey => {
            const list = daysMap.get(dayKey);
            const sample = list.slice(0, 3).map(c => `\`${c.displayName}\``).join(', ') + (list.length > 3 ? ` *(+${list.length - 3} más)*` : '');
            const [d, m, y] = dayKey.split('_');
            readme += `| ${d}/${m}/${y} | [📁 \`${dayKey}/\`](./${dayKey}/) | **${list.length}** | ${sample} |\n`;
        });

        fs.writeFileSync(path.join(targetDir, 'README.md'), readme, 'utf8');
    }

    console.log(`✅ Exportación finalizada con éxito!`);
    console.log(`📂 Se han generado ${totalExportedFiles / 2} archivos .md clasificados en ${sortedDays.length} carpetas diarias.`);
}

runExport().then(() => process.exit(0)).catch(err => {
    console.error("❌ Error en runExport:", err);
    process.exit(1);
});
