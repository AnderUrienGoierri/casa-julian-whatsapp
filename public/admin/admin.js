document.addEventListener('DOMContentLoaded', () => {
    let adminToken = localStorage.getItem('casa_julian_admin_token') || '';
    let currentStructure = null;
    let currentLang = 'es';
    let currentLangFilter = 'es';
    let currentCategoryFilter = 'all';
    let isTestMode = false;

    // ELEMENTOS DOM
    const loginModal = document.getElementById('login-modal');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const appContainer = document.getElementById('app-container');
    const logoutBtn = document.getElementById('logout-btn');
    const currentLangSelect = document.getElementById('current-lang-select');
    
    // TAB BUTTONS
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // INBOX & SOLICITUDES DOM & STATE
    let allSolicitudes = [];
    let currentInboxCatFilter = 'all';
    let currentInboxStatusFilter = 'all';
    let currentInboxSearch = '';
    let activeReplySolicitud = null;
    let inboxPollingInterval = null;

    const refreshInboxBtn = document.getElementById('refresh-inbox-btn');
    const searchInboxInput = document.getElementById('search-inbox-input');
    const inboxCardsContainer = document.getElementById('inbox-cards-container');
    const inboxCountBadge = document.getElementById('inbox-count-badge');
    const replyModal = document.getElementById('reply-modal');
    const closeReplyModalBtn = document.getElementById('close-reply-modal-btn');
    const cancelReplyBtn = document.getElementById('cancel-reply-btn');
    const replyForm = document.getElementById('reply-form');
    const replyClientName = document.getElementById('reply-client-name');
    const replyClientPhone = document.getElementById('reply-client-phone');
    const replySolicitudSummary = document.getElementById('reply-solicitud-summary');
    const replySolicitudId = document.getElementById('reply-solicitud-id');
    const replyMessageText = document.getElementById('reply-message-text');
    const replyErrorMsg = document.getElementById('reply-error-msg');

    // SIMULADOR DOM
    const btnStartTest = document.getElementById('btn-start-test');
    const btnResetTest = document.getElementById('btn-reset-test');
    const simInputForm = document.getElementById('sim-input-form');
    const simUserInput = document.getElementById('sim-user-input');
    const singlePreviewBubble = document.getElementById('single-preview-bubble');
    const liveChatStream = document.getElementById('live-chat-stream');
    const whatsappScreen = document.getElementById('whatsapp-screen');

    // MODAL AÑADIR MENSAJE DOM
    const addTextBtn = document.getElementById('add-text-btn');
    const textModal = document.getElementById('text-modal');
    const closeTextModalBtn = document.getElementById('close-text-modal');
    const saveNewTextBtn = document.getElementById('save-new-text-btn');
    const newKeyNameInput = document.getElementById('new-key-name-input');
    const newKeyCatSelect = document.getElementById('new-key-cat-select');
    const newKeyTextInput = document.getElementById('new-key-text-input');

    // REGLAS DINÁMICAS POR PALABRA CLAVE DOM
    const customRuleForm = document.getElementById('custom-rule-form');
    const ruleIdInput = document.getElementById('rule-id-input');
    const ruleKeywordInput = document.getElementById('rule-keyword-input');
    const ruleCatSelect = document.getElementById('rule-cat-select');
    const ruleResponseInput = document.getElementById('rule-response-input');
    const customRulesBody = document.getElementById('custom-rules-body');

    // VERIFICAR AUTENTICACIÓN INICIAL - validar el token guardado con la API
    if (adminToken) {
        // Validar token contra el servidor antes de arrancar el dashboard
        fetch('/api/admin/solicitudes', { headers: { 'x-admin-token': adminToken } })
            .then(res => {
                if (res.status === 401) {
                    // Token inválido o caducado → limpiar y mostrar login
                    localStorage.removeItem('casa_julian_admin_token');
                    localStorage.removeItem('casa_julian_user_role');
                    adminToken = '';
                    showLoginModal();
                } else {
                    initDashboard();
                }
            })
            .catch(() => {
                // Error de red → mostrar login igual
                showLoginModal();
            });
    } else {
        showLoginModal();
    }

    function showLoginModal() {
        loginModal.style.display = 'flex';
        appContainer.style.display = 'none';
    }

    function hideLoginModal() {
        loginModal.style.display = 'none';
        appContainer.style.display = 'block';
    }

    // FORMULARIO LOGIN
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('admin-password').value;
        loginError.style.display = 'none';

        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await res.json();

            if (data.success && data.token) {
                adminToken = data.token;
                localStorage.setItem('casa_julian_admin_token', adminToken);
                localStorage.setItem('casa_julian_user_role', data.role || 'admin');
                try {
                    await initDashboard();
                } catch (dashErr) {
                    console.error("⚠️ Error inicializando dashboard:", dashErr);
                }
            } else {
                loginError.textContent = data.error || 'Contraseña incorrecta.';
                loginError.style.display = 'block';
            }
        } catch (err) {
            console.error("⚠️ Error en petición de login:", err);
            loginError.textContent = err.message || 'Error de conexión con el servidor.';
            loginError.style.display = 'block';
        }
    });

    // CERRAR SESIÓN
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('casa_julian_admin_token');
        adminToken = '';
        showLoginModal();
    });

    // CAMBIO DE IDIOMA
    currentLangSelect.addEventListener('change', (e) => {
        currentLang = e.target.value;
        if (currentStructure) {
            renderTextsGrid();
            renderFaqsList();
        }
    });

    // PESTAÑAS
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            const targetEl = document.getElementById(tabId);
            if (targetEl) targetEl.classList.add('active');

            if (tabId === 'tab-inbox') fetchSolicitudes();
            if (tabId === 'tab-flow') renderUseCasesFlow();
            if (tabId === 'tab-texts') renderTextsGrid();
            if (tabId === 'tab-menu') renderMenuTable();
            if (tabId === 'tab-faqs') renderFaqsList();
            if (tabId === 'tab-rules') renderCustomRulesTable();
            if (tabId === 'tab-publish') renderDraftChangesTable();
        });
    });

    // INICIALIZAR DASHBOARD Y CARGAR ESTRUCTURA
    async function initDashboard() {
        hideLoginModal();

        // Aplicar restricciones visuales por rol de usuario
        const role = localStorage.getItem('casa_julian_user_role') || 'admin';
        if (role === 'recepcion') {
            // RECEPCIÓN: Solo Buzón de Solicitudes → ocultar todas las demás pestañas
            document.querySelectorAll('.tabs-nav .tab-btn').forEach(btn => {
                btn.style.display = (btn.getAttribute('data-tab') === 'tab-inbox') ? 'inline-block' : 'none';
            });
            // Ocultar el simulador de móvil (no necesario para recepción)
            document.body.classList.add('mode-recepcion');
            // Activar la pestaña inbox directamente
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const inboxContent = document.getElementById('tab-inbox');
            if (inboxContent) inboxContent.classList.add('active');
            // Cargar solicitudes y empezar polling
            await fetchSolicitudes();
            if (!inboxPollingInterval) {
                inboxPollingInterval = setInterval(fetchSolicitudes, 15000);
            }
            // No cargar estructura del bot (no necesaria para recepción)
            return;
        }

        // ADMINISTRACIÓN: Todas las pestañas EXCEPTO Buzón de Recepción
        document.querySelectorAll('.tabs-nav .tab-btn').forEach(btn => {
            btn.style.display = (btn.getAttribute('data-tab') === 'tab-inbox') ? 'none' : 'inline-block';
        });
        // Activar primera pestaña visible (tab-flow)
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const flowContent = document.getElementById('tab-flow');
        if (flowContent) flowContent.classList.add('active');
        const flowTabBtn = document.querySelector('.tabs-nav .tab-btn[data-tab="tab-flow"]');
        if (flowTabBtn) { flowTabBtn.classList.add('active'); }

        try {
            const res = await fetch('/api/admin/structure', {
                headers: { 'x-admin-token': adminToken }
            });

            if (res.status === 401) {
                localStorage.removeItem('casa_julian_admin_token');
                localStorage.removeItem('casa_julian_user_role');
                showLoginModal();
                return;
            }

            const data = await res.json();
            if (data.success) {
                currentStructure = data;
                renderUseCasesFlow();
                renderTextsGrid();
                renderMenuTable();
                renderFaqsList();
                renderCustomRulesTable();
                renderDraftChangesTable();
                updateLiveSimulator('welcomeMessage');
            }
        } catch (err) {
            console.error('Error cargando estructura del bot:', err);
        }
    }

    function getCategoryForKey(key) {
        if (!key) return 'main';
        if (key.startsWith('welcome') || key.startsWith('lang_') || key.includes('Language')) {
            return 'welcome';
        }
        if (key.startsWith('selectLocation') || key.startsWith('loc') || key === 'madridMsg') {
            return 'location';
        }
        if (key.startsWith('thanks') || key.includes('Closing') || key.includes('Despedida')) {
            return 'closing';
        }
        if (key.startsWith('faq')) {
            return 'faq';
        }
        if (key.startsWith('menuTrad') || key.startsWith('regalar') || key.includes('Gift')) {
            return 'tradicion';
        }
        if (key.startsWith('mod')) {
            return 'mod';
        }
        if (key.startsWith('cancel')) {
            return 'cancel';
        }
        if (key.startsWith('waitlist') || key.startsWith('reserva') || key.startsWith('day')) {
            return 'reserva';
        }
        if (key.startsWith('mainMenu') || key.startsWith('menu') || key.startsWith('opt')) {
            return 'main';
        }
        return (currentStructure && currentStructure.categoryMap && currentStructure.categoryMap[key]) || 'main';
    }

    // CLASIFICACIÓN DE COLORES POR TIPO DE ETIQUETA
    function getBadgeColorClass(key) {
        if (key.startsWith('welcome') || key.startsWith('lang_') || key.includes('Language')) return 'badge-header';
        if (key.startsWith('selectLocation') || key.startsWith('loc') || key === 'madridMsg') return 'badge-button';
        if (key.startsWith('thanks') || key.includes('Closing')) return 'badge-closing';
        if (key.startsWith('btn') || key.includes('Btn')) return 'badge-button';
        if (key.startsWith('faq')) return 'badge-faq';
        if (key.startsWith('menuTrad') || key.startsWith('regalar')) return 'badge-tradicion';
        if (key.startsWith('waitlist') || key.startsWith('reserva') || key.startsWith('mod') || key.startsWith('cancel') || key.startsWith('day')) return 'badge-reserva';
        return 'badge-main';
    }

    // 1. RENDERIZAR CASOS DE USO Y FLUJO SECUENCIAL (TAB 1)
    function renderUseCasesFlow() {
        const container = document.getElementById('flow-tree-container');
        if (!container || !currentStructure) return;

        container.innerHTML = '';
        const useCases = currentStructure.useCases || [];

        useCases.forEach(uc => {
            const nodeDiv = document.createElement('div');
            nodeDiv.className = 'flow-node';
            nodeDiv.style.flexDirection = 'column';
            nodeDiv.style.alignItems = 'flex-start';
            nodeDiv.style.gap = '8px';

            let keysBadges = '';
            uc.keys.forEach(k => {
                const colorClass = getBadgeColorClass(k);
                const isDisabled = !!(currentStructure.disabledKeys && currentStructure.disabledKeys[k]);
                const statusTag = isDisabled ? `<span style="font-size:0.65rem; color:#f87171; margin-left:2px;">[SILENCIADO]</span>` : '';
                keysBadges += `<span class="key-jump-badge ${colorClass}" data-key="${k}" title="Editar ${k}">${k}${statusTag}</span>`;
            });

            nodeDiv.innerHTML = `
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                    <div class="flow-node-title" style="color:var(--accent-gold); font-weight:700;">
                        <span class="flow-badge" style="background:var(--accent-gold); color:#fff; font-weight:bold; margin-right:8px;">Paso ${uc.order}</span>
                        ${uc.title}
                    </div>
                </div>
                <div style="font-size:0.85rem; color:#e9edef; background:#181b22; padding:8px 12px; border-radius:6px; width:100%; border-left:3px solid var(--accent-blue); box-sizing:border-box;">
                    🤖 <strong>Acción del Chatbot:</strong> ${uc.botAction}
                </div>
                <div style="font-size:0.85rem; color:#e9edef; background:#181b22; padding:8px 12px; border-radius:6px; width:100%; border-left:3px solid var(--accent-green); box-sizing:border-box;">
                    👤 <strong>Respuesta Esperada del Cliente / Interacción:</strong> ${uc.expectedCustomerInput}
                </div>
                <div style="margin-top:6px; display:flex; flex-direction:column; gap:6px; width:100%; box-sizing:border-box;">
                    <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Mensajes configurables (${uc.keys.length}):</span>
                    <div class="key-badges-container">
                        ${keysBadges}
                    </div>
                </div>
            `;

            nodeDiv.querySelectorAll('.key-jump-badge').forEach(badge => {
                badge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const targetKey = badge.getAttribute('data-key');
                    document.querySelector('[data-tab="tab-texts"]').click();
                    const allChip = document.querySelector('.filter-chip[data-cat="all"]');
                    if (allChip) allChip.click();
                    const targetCard = document.getElementById(`text-card-${targetKey}`);
                    if (targetCard) {
                        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        targetCard.style.border = '2px solid var(--accent-gold)';
                        setTimeout(() => targetCard.style.border = '1px solid var(--border-color)', 2500);
                        updateLiveSimulator(targetKey);
                    }
                });
            });

            container.appendChild(nodeDiv);
        });
    }

    function getEffectiveAttachment(key, attachments = {}) {
        if (attachments && attachments[key] && attachments[key].mediaUrl) {
            return { ...attachments[key], isCustom: true };
        }
        const baseUrl = window.location.origin;
        if (key === 'welcomeImageUrl') {
            return {
                mediaType: 'image',
                mediaUrl: `${baseUrl}/public/casa_julian_erretegia.jpg`,
                caption: 'Imagen de Bienvenida Predeterminado (Parrilla Casa Julián)',
                isDefault: true
            };
        }
        if (key === 'welcomeStickerUrl') {
            return {
                mediaType: 'sticker',
                mediaUrl: `${baseUrl}/public/casa_julian_sticker.webp`,
                caption: 'Sticker Animado de Bienvenida Predeterminado',
                isDefault: true
            };
        }
        if (key === 'regalarMenuMsg' || key === 'menuTradicionTitle') {
            return {
                mediaType: 'image',
                mediaUrl: `${baseUrl}/public/casa_julian_menu_tradicion.jpg`,
                caption: 'Ficha Menú Tradición Predeterminada',
                isDefault: true
            };
        }
        return null;
    }

    function renderMediaPreviewHtml(key, att) {
        if (!att || !att.mediaUrl) return '';

        const mediaType = (att.mediaType || 'image').toLowerCase();
        const isCustom = att.isCustom;
        const badgeText = isCustom ? '📌 ADJUNTO PERSONALIZADO' : '⭐ ARCHIVO PREDETERMINADO EN USO';
        const badgeColor = isCustom ? '#10b981' : '#f59e0b';
        const mediaIcon = mediaType === 'image' ? '🖼️' : mediaType === 'video' ? '🎬' : mediaType === 'audio' ? '🔊' : mediaType === 'sticker' ? '🎭' : mediaType === 'document' ? '📄' : '📁';

        let mediaElementHtml = '';
        if (mediaType === 'image' || mediaType === 'sticker') {
            mediaElementHtml = `
                <div style="margin-top:6px; text-align:center;">
                    <img src="${att.mediaUrl}" alt="Media Preview" style="max-width:100%; max-height:150px; border-radius:8px; object-fit:contain; border:1px solid rgba(255,255,255,0.15); background:#0d0f12; padding:4px;">
                </div>
            `;
        } else if (mediaType === 'video') {
            mediaElementHtml = `
                <div style="margin-top:6px;">
                    <video src="${att.mediaUrl}" controls style="max-width:100%; max-height:160px; border-radius:8px; width:100%; border:1px solid rgba(255,255,255,0.15);"></video>
                </div>
            `;
        } else if (mediaType === 'audio') {
            mediaElementHtml = `
                <div style="margin-top:6px;">
                    <audio src="${att.mediaUrl}" controls style="width:100%; height:40px; margin-top:4px;"></audio>
                </div>
            `;
        } else {
            mediaElementHtml = `
                <div style="margin-top:6px; background:#111827; padding:10px; border-radius:6px; border:1px dashed var(--accent-gold); display:flex; align-items:center; justify-content:space-between;">
                    <span style="font-size:0.82rem; color:#f3f4f6; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%;">
                        📄 <strong>${att.filename || 'Documento PDF/Adjunto'}</strong>
                    </span>
                    <a href="${att.mediaUrl}" target="_blank" style="background:var(--accent-gold); color:#000; font-weight:700; padding:4px 10px; border-radius:4px; font-size:0.75rem; text-decoration:none;">📥 Abrir Archivo</a>
                </div>
            `;
        }

        return `
            <div class="attachment-preview-card" style="background:#14171d; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:10px; margin-top:10px; position:relative;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:0.75rem; font-weight:700; color:${badgeColor}; background:rgba(0,0,0,0.4); padding:2px 8px; border-radius:4px; border:1px solid ${badgeColor};">
                        ${mediaIcon} ${badgeText}
                    </span>
                    ${isCustom ? `<button class="btn-danger btn-remove-attachment" data-key="${key}" style="padding:2px 8px; font-size:0.72rem;">🗑️ Quitar Adjunto</button>` : ''}
                </div>
                ${mediaElementHtml}
                ${att.caption ? `<div style="font-size:0.78rem; color:var(--text-muted); margin-top:6px; font-style:italic;">💬 ${att.caption}</div>` : ''}
            </div>
        `;
    }

    // 2. RENDERIZAR GRID DE TEXTOS CON BOTONES DESACTIVAR / OCULTAR / ELIMINAR + ADJUNTOS (TAB 2)
    // 2. RENDERIZAR GRID DE TEXTOS CON BOTONES DESACTIVAR / OCULTAR / ELIMINAR + ADJUNTOS (TAB 2)
    function renderTextsGrid() {
        const container = document.getElementById('texts-list-container');
        if (!container || !currentStructure) return;

        const categoryMap = currentStructure.categoryMap || {};
        const disabledKeys = currentStructure.disabledKeys || {};
        const attachments = currentStructure.attachments || {};
        const staticEsTexts = currentStructure.staticTranslations['es'] || {};

        container.innerHTML = '';
        
        const allKeys = [...new Set([
            ...Object.keys(staticEsTexts),
            ...Object.keys((currentStructure.staticTranslations && currentStructure.staticTranslations['eu']) || {}),
            ...Object.keys((currentStructure.staticTranslations && currentStructure.staticTranslations['en']) || {}),
            ...Object.keys((currentStructure.dynamicTexts && currentStructure.dynamicTexts['es']) || {}),
            ...Object.keys((currentStructure.dynamicTexts && currentStructure.dynamicTexts['eu']) || {}),
            ...Object.keys((currentStructure.dynamicTexts && currentStructure.dynamicTexts['en']) || {})
        ])];

        // Añadir claves especiales de medios (imagen bienvenida, sticker) si no están ya
        const specialMediaKeys = [
            { key: 'welcomeImageUrl', label: '🖼️ Imagen de Bienvenida', category: 'welcome', mediaOnly: false },
            { key: 'welcomeStickerUrl', label: '🎭 Sticker Animado de Bienvenida', category: 'welcome', mediaOnly: true }
        ];

        specialMediaKeys.forEach(smk => {
            if (!allKeys.includes(smk.key)) allKeys.unshift(smk.key);
            if (!categoryMap[smk.key]) categoryMap[smk.key] = smk.category;
        });

        // Orden de prioridad secuencial (sólo idiomas soportados: es, eu, en)
        const keyOrderPriority = [
            'welcomeImageUrl',
            'welcomeStickerUrl',
            'welcomeMessage',
            'welcomeLanguageBtn',
            'welcomeLanguagePrompt',
            'lang_es', 'lang_eu', 'lang_en',
            'selectLocationTitle',
            'selectLocationBody',
            'locPaisVasco',
            'locMadrid',
            'madridMsg',
            'mainMenuHeader',
            'menuButtonText',
            'opt1Title', 'opt1Desc',
            'opt2Title', 'opt2Desc',
            'opt3Title', 'opt3Desc',
            'optConsultaAbiertaTitle', 'optConsultaAbiertaDesc',
            'opt5Title', 'opt5Desc',
            'thanksClosingMsg'
        ];

        allKeys.sort((a, b) => {
            const indexA = keyOrderPriority.indexOf(a);
            const indexB = keyOrderPriority.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return 0;
        });

        allKeys.forEach(key => {
            const specialMedia = specialMediaKeys.find(s => s.key === key);
            const isMediaOnly = specialMedia && specialMedia.mediaOnly;
            const category = getCategoryForKey(key);
            const colorClass = getBadgeColorClass(key);
            const isDisabled = !!disabledKeys[key];
            const isCustomKey = !(key in staticEsTexts) && !isMediaOnly;

            const card = document.createElement('div');
            card.className = `text-card ${isDisabled ? 'card-disabled' : ''}`;
            card.id = `text-card-${key}`;
            card.setAttribute('data-category', category);

            const att = getEffectiveAttachment(key, attachments);
            const attachmentPreviewHtml = renderMediaPreviewHtml(key, att);
            const displayTitle = specialMedia ? specialMedia.label : key;

            let bodyHtml = '';
            if (isMediaOnly) {
                bodyHtml = `<div style="padding:8px; font-size:0.82rem; color:var(--text-muted); background:#181b22; border-radius:6px;">Este campo es exclusivamente multimedia. Usa <strong>📎 Añadir Adjunto</strong> para configurar el medio en este paso.</div>`;
            } else if (currentLangFilter === 'all') {
                // Modo comparativo (ES, EU, EN)
                const languages = [
                    { code: 'es', flag: '🇪🇸', name: 'Español' },
                    { code: 'eu', flag: '🇪🇺', name: 'Euskara' },
                    { code: 'en', flag: '🇬🇧', name: 'English' }
                ];
                
                bodyHtml = `<div class="comparative-lang-box" style="display:flex; flex-direction:column; gap:12px; margin-top:8px;">`;
                languages.forEach(l => {
                    const lStatic = (currentStructure.staticTranslations[l.code] && currentStructure.staticTranslations[l.code][key]) || staticEsTexts[key] || '';
                    const lDyn = (currentStructure.dynamicTexts[l.code] && currentStructure.dynamicTexts[l.code][key]);
                    const lVal = lDyn !== undefined ? lDyn : lStatic;
                    
                    bodyHtml += `
                        <div class="lang-field-row" style="background: rgba(255,255,255,0.02); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <span style="font-weight:600; font-size:0.85rem; color:var(--accent-gold);">${l.flag} ${l.name} (${l.code.toUpperCase()})</span>
                                <span class="char-counter-${l.code}" style="font-size:0.75rem; color:var(--text-muted);">${lVal.length} caracteres</span>
                            </div>
                            <textarea data-key="${key}" data-lang="${l.code}" style="width:100%; min-height:60px;">${lVal}</textarea>
                            <div style="text-align:right; margin-top:4px;">
                                <button class="btn-primary btn-save-lang-text" data-key="${key}" data-lang="${l.code}" style="padding: 3px 10px; font-size: 0.78rem;">💾 Guardar ${l.code.toUpperCase()}</button>
                            </div>
                        </div>
                    `;
                });
                bodyHtml += `</div>`;
            } else {
                // Modo idioma único (es, eu, en)
                const activeLang = currentLangFilter;
                const staticVal = (currentStructure.staticTranslations[activeLang] && currentStructure.staticTranslations[activeLang][key]) || staticEsTexts[key] || '';
                const currentVal = (currentStructure.dynamicTexts && currentStructure.dynamicTexts[activeLang] && currentStructure.dynamicTexts[activeLang][key] !== undefined)
                    ? currentStructure.dynamicTexts[activeLang][key]
                    : staticVal;

                bodyHtml = `<textarea data-key="${key}" data-lang="${activeLang}">${currentVal}</textarea>`;
            }

            const activeLangSingle = currentLangFilter === 'all' ? 'es' : currentLangFilter;
            const currentValSingle = (currentStructure.dynamicTexts && currentStructure.dynamicTexts[activeLangSingle] && currentStructure.dynamicTexts[activeLangSingle][key] !== undefined)
                ? currentStructure.dynamicTexts[activeLangSingle][key]
                : ((currentStructure.staticTranslations[activeLangSingle] && currentStructure.staticTranslations[activeLangSingle][key]) || staticEsTexts[key] || '');

            card.innerHTML = `
                <div class="text-card-header" style="align-items:center;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span class="key-title ${colorClass}" style="padding:2px 6px; border-radius:4px;">${displayTitle}</span>
                        <span class="flow-badge">${category.toUpperCase()}</span>
                        <span class="status-badge ${isDisabled ? 'badge-off' : 'badge-on'}">${isDisabled ? '🔴 SILENCIADO / OCULTO' : '🟢 ACTIVO'}</span>
                        <span class="flow-badge" style="background:#2b3245; border: 1px solid rgba(212,175,55,0.3); color: var(--accent-gold);">${currentLangFilter === 'all' ? '🌐 VISTA COMPARATIVA (ES/EU/EN)' : (currentLangFilter === 'es' ? '🇪🇸 ESPAÑOL' : (currentLangFilter === 'eu' ? '🇪🇺 EUSKARA' : '🇬🇧 ENGLISH'))}</span>
                    </div>
                </div>
                ${bodyHtml}
                ${attachmentPreviewHtml}
                <div class="text-card-footer" style="margin-top:8px;">
                    ${isMediaOnly || currentLangFilter === 'all' ? '<span></span>' : `<span class="char-counter">${currentValSingle.length} caracteres</span>`}
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button class="btn-attachment btn-add-attachment" data-key="${key}" title="Añadir o cambiar adjunto multimedia">📎 Añadir Adjunto</button>
                        <button class="btn-secondary btn-toggle-status" data-key="${key}" title="${isDisabled ? 'Activar este mensaje en el bot' : 'Ocultar/Silenciar este mensaje en el bot'}">
                            ${isDisabled ? '👁️ Activar' : '🙈 Ocultar'}
                        </button>
                        ${isCustomKey ? `<button class="btn-danger btn-delete-key" data-key="${key}" title="Eliminar clave personalizada">🗑️ Eliminar</button>` : ''}
                        ${(!isMediaOnly && currentLangFilter !== 'all') ? `<button class="btn-primary btn-save-text" data-key="${key}">💾 Guardar [${currentLangFilter.toUpperCase()}]</button>` : ''}
                    </div>
                </div>
            `;

            if (!isMediaOnly) {
                if (currentLangFilter === 'all') {
                    card.querySelectorAll('textarea').forEach(ta => {
                        const lCode = ta.getAttribute('data-lang');
                        ta.addEventListener('input', (e) => {
                            const val = e.target.value;
                            const counter = card.querySelector(`.char-counter-${lCode}`);
                            if (counter) counter.textContent = `${val.length} caracteres`;
                        });
                    });

                    card.querySelectorAll('.btn-save-lang-text').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const lCode = btn.getAttribute('data-lang');
                            const ta = card.querySelector(`textarea[data-lang="${lCode}"]`);
                            if (ta) saveText(key, ta.value, category, lCode);
                        });
                    });
                } else {
                    const textarea = card.querySelector('textarea');
                    if (textarea) {
                        textarea.addEventListener('input', (e) => {
                            const val = e.target.value;
                            const charCounter = card.querySelector('.char-counter');
                            if (charCounter) charCounter.textContent = `${val.length} caracteres`;
                            if (!isTestMode) updateLiveSimulator(key, val);
                        });

                        textarea.addEventListener('focus', () => {
                            if (!isTestMode) updateLiveSimulator(key, textarea.value);
                        });

                        const saveBtn = card.querySelector('.btn-save-text');
                        if (saveBtn) {
                            saveBtn.addEventListener('click', () => {
                                saveText(key, textarea.value, category, currentLangFilter);
                            });
                        }
                    }
                }
            }

            // Ocultar / Silenciar / Activar clave
            card.querySelector('.btn-toggle-status').addEventListener('click', async () => {
                await toggleKeyStatus(key, !isDisabled, displayTitle || key);
            });

            // Eliminar clave personalizada
            const deleteBtn = card.querySelector('.btn-delete-key');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async () => {
                    if (confirm(`¿Estás seguro de eliminar el mensaje personalizado "${key}"?`)) {
                        await deleteCustomKey(key);
                    }
                });
            }

            // Añadir adjunto
            card.querySelector('.btn-add-attachment').addEventListener('click', () => {
                openAttachmentModal(key);
            });

            // Eliminar adjunto existente
            const removeAttBtn = card.querySelector('.btn-remove-attachment');
            if (removeAttBtn) {
                removeAttBtn.addEventListener('click', async () => {
                    if (confirm(`¿Eliminar el adjunto multimedia de "${key}"?`)) {
                        await deleteAttachment(key);
                    }
                });
            }

            container.appendChild(card);
        });

        filterTexts();
    }

    function filterTexts() {
        const searchInput = document.getElementById('search-text-input');
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const cards = document.querySelectorAll('#texts-list-container .text-card');

        cards.forEach(card => {
            const cardCategory = (card.getAttribute('data-category') || 'main').toLowerCase();
            const cardKey = (card.id || '').replace('text-card-', '').toLowerCase();
            const textareas = card.querySelectorAll('textarea');
            let cardText = '';
            textareas.forEach(ta => { cardText += ' ' + ta.value.toLowerCase(); });
            const cardTitle = (card.querySelector('.key-title') ? card.querySelector('.key-title').textContent : '').toLowerCase();

            const matchesCategory = (currentCategoryFilter === 'all') || (cardCategory === currentCategoryFilter.toLowerCase());
            const matchesQuery = !query || cardKey.includes(query) || cardText.includes(query) || cardTitle.includes(query);

            if (matchesCategory && matchesQuery) {
                card.classList.remove('hidden-card');
                card.style.setProperty('display', 'flex', 'important');
            } else {
                card.classList.add('hidden-card');
                card.style.setProperty('display', 'none', 'important');
            }
        });
    }

    // Event listeners para los chips de filtro de categoría
    const categoryFiltersContainer = document.getElementById('category-filters');
    if (categoryFiltersContainer) {
        categoryFiltersContainer.addEventListener('click', (e) => {
            const chip = e.target.closest('.filter-chip');
            if (!chip) return;

            categoryFiltersContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            currentCategoryFilter = chip.getAttribute('data-cat') || 'all';
            filterTexts();
        });
    }

    // Event listeners para los chips de filtro de idioma
    const langFiltersContainer = document.getElementById('lang-filters');
    if (langFiltersContainer) {
        langFiltersContainer.addEventListener('click', (e) => {
            const chip = e.target.closest('.filter-chip');
            if (!chip) return;

            langFiltersContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            currentLangFilter = chip.getAttribute('data-lang-filter') || 'es';
            if (currentLangFilter !== 'all') {
                currentLang = currentLangFilter;
                if (currentLangSelect) currentLangSelect.value = currentLang;
            }
            renderTextsGrid();
        });
    }

    // Event listener para el campo de búsqueda por texto
    const searchTextInput = document.getElementById('search-text-input');
    if (searchTextInput) {
        searchTextInput.addEventListener('input', () => {
            filterTexts();
        });
    }

    // MODAL ADJUNTO MULTIMEDIA
    function openAttachmentModal(keyName) {
        let modal = document.getElementById('attachment-modal');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'attachment-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:520px;">
                <h3 style="margin-bottom:12px;">📎 Adjuntar Multimedia a <span style="color:var(--accent-gold);">"${keyName}"</span></h3>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <label style="font-size:0.85rem; color:var(--text-muted);">Tipo de archivo:</label>
                    <select id="att-media-type" class="input-dark" style="width:100%;">
                        <option value="image">🖼️ Imagen (JPG, PNG, WebP)</option>
                        <option value="video">🎬 Vídeo (MP4)</option>
                        <option value="audio">🔊 Audio (MP3, OGG)</option>
                        <option value="document">📎 Documento (PDF, Word)</option>
                        <option value="sticker">🎭 Sticker (WebP animado)</option>
                    </select>
                    <label style="font-size:0.85rem; color:var(--text-muted);">URL pública del archivo:</label>
                    <input type="url" id="att-media-url" class="input-dark" placeholder="https://ejemplo.com/imagen.jpg" style="width:100%;">
                    <label style="font-size:0.85rem; color:var(--text-muted);">Pie de foto / Descripción (opcional):</label>
                    <input type="text" id="att-caption" class="input-dark" placeholder="Descripción del adjunto..." style="width:100%;">
                    <label style="font-size:0.85rem; color:var(--text-muted);">Nombre del archivo (solo documentos):</label>
                    <input type="text" id="att-filename" class="input-dark" placeholder="carta_menu.pdf" style="width:100%;">
                </div>
                <div style="display:flex; gap:10px; margin-top:16px; justify-content:flex-end;">
                    <button id="att-cancel-btn" class="btn-secondary">Cancelar</button>
                    <button id="att-save-btn" class="btn-primary">💾 Guardar Adjunto</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Pre-fill if attachment exists
        const existing = (currentStructure.attachments || {})[keyName];
        if (existing) {
            modal.querySelector('#att-media-type').value = existing.mediaType || 'image';
            modal.querySelector('#att-media-url').value = existing.mediaUrl || '';
            modal.querySelector('#att-caption').value = existing.caption || '';
            modal.querySelector('#att-filename').value = existing.filename || '';
        }

        modal.querySelector('#att-cancel-btn').addEventListener('click', () => modal.remove());
        modal.querySelector('#att-save-btn').addEventListener('click', async () => {
            const mediaType = modal.querySelector('#att-media-type').value;
            const mediaUrl = modal.querySelector('#att-media-url').value.trim();
            const caption = modal.querySelector('#att-caption').value.trim();
            const filename = modal.querySelector('#att-filename').value.trim();

            if (!mediaUrl) {
                alert('Por favor, introduce la URL del archivo multimedia.');
                return;
            }

            await saveAttachment(keyName, mediaType, mediaUrl, caption, filename);
            modal.remove();
        });
    }

    // GUARDAR ADJUNTO EN SERVIDOR
    async function saveAttachment(keyName, mediaType, mediaUrl, caption, filename) {
        try {
            const res = await fetch('/api/admin/save-attachment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ key_name: keyName, media_type: mediaType, media_url: mediaUrl, caption, filename })
            });
            const data = await res.json();
            if (data.success) {
                if (!currentStructure.attachments) currentStructure.attachments = {};
                currentStructure.attachments[keyName] = data.attachment;
                await reloadStructureData();
                renderTextsGrid();
                renderUseCasesFlow();
                alert(`✅ Adjunto guardado para "${keyName}".`);
            } else {
                alert(`❌ Error: ${data.error}`);
            }
        } catch (err) {
            alert('❌ Error de conexión al guardar adjunto.');
        }
    }

    // ELIMINAR ADJUNTO DEL SERVIDOR
    async function deleteAttachment(keyName) {
        try {
            const res = await fetch('/api/admin/delete-attachment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ key_name: keyName })
            });
            const data = await res.json();
            if (data.success) {
                if (currentStructure.attachments) delete currentStructure.attachments[keyName];
                await reloadStructureData();
                renderTextsGrid();
                renderUseCasesFlow();
            } else {
                alert(`❌ Error: ${data.error}`);
            }
        } catch (err) {
            alert('❌ Error de conexión al eliminar adjunto.');
        }
    }

    // MODAL AÑADIR MENSAJE PERSONALIZADO
    if (addTextBtn) {
        addTextBtn.addEventListener('click', () => {
            newKeyNameInput.value = '';
            newKeyTextInput.value = '';
            textModal.style.display = 'flex';
        });
    }

    if (closeTextModalBtn) {
        closeTextModalBtn.addEventListener('click', () => {
            textModal.style.display = 'none';
        });
    }

    if (saveNewTextBtn) {
        saveNewTextBtn.addEventListener('click', async () => {
            const keyName = newKeyNameInput.value.trim();
            const cat = newKeyCatSelect.value;
            const textVal = newKeyTextInput.value.trim();

            if (!keyName) {
                alert('Por favor, introduce el nombre de la clave del mensaje.');
                return;
            }
            if (!textVal) {
                alert('Por favor, introduce el texto del mensaje.');
                return;
            }

            await saveText(keyName, textVal, cat);
            if (!currentStructure.categoryMap) currentStructure.categoryMap = {};
            currentStructure.categoryMap[keyName] = cat;
            
            textModal.style.display = 'none';
            renderTextsGrid();
        });
    }

    // ALTERNAR ESTADO OCULTO / ACTIVO DE CLAVE
    async function toggleKeyStatus(key, isDisabled, keyTitle = null) {
        const targetStateText = isDisabled ? 'SILENCIAR / OCULTAR' : 'ACTIVAR';
        const displayLabel = keyTitle || key;
        const confirmMsg = `¿Estás seguro de que deseas cambiar el estado a "${targetStateText}" para el mensaje "${displayLabel}" en el chatbot?`;
        
        if (!confirm(confirmMsg)) {
            return;
        }

        try {
            const res = await fetch('/api/admin/toggle-key-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ key, isDisabled })
            });
            const data = await res.json();
            if (data.success) {
                if (!currentStructure.disabledKeys) currentStructure.disabledKeys = {};
                currentStructure.disabledKeys[key] = isDisabled;
                
                // Recargar estructura para actualizar borrador
                await reloadStructureData();
                renderTextsGrid();
                renderUseCasesFlow();
            } else {
                alert(`Error al modificar estado: ${data.error}`);
            }
        } catch (err) {
            alert('Error de conexión al modificar estado.');
        }
    }

    // ELIMINAR CLAVE PERSONALIZADA
    async function deleteCustomKey(key) {
        try {
            const res = await fetch('/api/admin/delete-custom-key', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ lang: currentLang, key })
            });
            const data = await res.json();
            if (data.success) {
                if (currentStructure.dynamicTexts && currentStructure.dynamicTexts[currentLang]) {
                    delete currentStructure.dynamicTexts[currentLang][key];
                }
                await reloadStructureData();
                renderTextsGrid();
            } else {
                alert(`Error al eliminar: ${data.error}`);
            }
        } catch (err) {
            alert('Error de conexión al eliminar.');
        }
    }

    // GUARDAR TEXTO EN SERVIDOR
    async function saveText(key, text, category = 'general', targetLang = currentLangFilter) {
        const langToUse = (targetLang && targetLang !== 'all') ? targetLang : currentLang;
        try {
            const res = await fetch('/api/admin/update-text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ lang: langToUse, key, text, category })
            });

            const data = await res.json();
            if (data.success) {
                if (!currentStructure.dynamicTexts[langToUse]) {
                    currentStructure.dynamicTexts[langToUse] = {};
                }
                currentStructure.dynamicTexts[langToUse][key] = text;
                await reloadStructureData();
                alert(`✅ Guardado correctamente para [${langToUse.toUpperCase()}]: ${key}`);
            } else {
                alert(`❌ Error guardando texto: ${data.error}`);
            }
        } catch (err) {
            alert('❌ Error de conexión al guardar.');
        }
    }

    // 3. RENDERIZAR TABLA DE CARTA & PRECIOS (TAB 3)
    function renderMenuTable() {
        const body = document.getElementById('menu-items-body');
        if (!body || !currentStructure) return;

        body.innerHTML = '';
        const items = (currentStructure.menuItems && Array.isArray(currentStructure.menuItems) && currentStructure.menuItems.length > 0)
            ? currentStructure.menuItems
            : [
                { id: 1, category: 'ENTRANTES Y CHARCUTERÍA', name: 'Jamón Ibérico', price: 32, currency: '€', sort_order: 1 },
                { id: 2, category: 'ENTRANTES Y CHARCUTERÍA', name: 'Cecina', price: 36, currency: '€', sort_order: 2 },
                { id: 3, category: 'ENTRANTES Y CHARCUTERÍA', name: 'Charcutería', price: 34, currency: '€', sort_order: 3 },
                { id: 4, category: 'ENTRANTES Y CHARCUTERÍA', name: 'Txuleta Tartar', price: 32, currency: '€', sort_order: 4 },
                { id: 5, category: 'VERDURAS Y ENTRANTES CALIENTES', name: 'Puerro', price: 18, currency: '€', sort_order: 5 },
                { id: 6, category: 'VERDURAS Y ENTRANTES CALIENTES', name: 'Espárrago', price: 18, currency: '€', sort_order: 6 },
                { id: 7, category: 'VERDURAS Y ENTRANTES CALIENTES', name: 'Pimientos del Piquillo', price: 18, currency: '€', sort_order: 7 },
                { id: 8, category: 'VERDURAS Y ENTRANTES CALIENTES', name: 'Ensalada', price: 4, currency: '€', sort_order: 8 },
                { id: 9, category: 'NUESTRA ESPECIALIDAD', name: 'Txuleta', price: 100, currency: '€ / kg', sort_order: 9 },
                { id: 10, category: 'POSTRES', name: 'Flan', price: 9, currency: '€', sort_order: 10 },
                { id: 11, category: 'POSTRES', name: 'Tarta de Queso', price: 10, currency: '€', sort_order: 11 },
                { id: 12, category: 'POSTRES', name: 'Fresa', price: 8, currency: '€', sort_order: 12 }
            ];

        currentStructure.menuItems = items;

        items.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="text" class="table-input item-cat" value="${item.category}"></td>
                <td><input type="text" class="table-input item-name" value="${item.name}"></td>
                <td><input type="number" step="0.5" class="table-input item-price" value="${item.price}"></td>
                <td><input type="text" class="table-input item-unit" value="${item.currency || '€'}"></td>
                <td><button class="btn-danger btn-delete-item" data-index="${index}">🗑️ Eliminar</button></td>
            `;

            tr.querySelector('.btn-delete-item').addEventListener('click', () => {
                currentStructure.menuItems.splice(index, 1);
                renderMenuTable();
            });

            body.appendChild(tr);
        });
    }

    const addDishBtn = document.getElementById('add-dish-btn');
    if (addDishBtn) {
        addDishBtn.addEventListener('click', () => {
            if (!currentStructure.menuItems) currentStructure.menuItems = [];
            currentStructure.menuItems.push({
                id: currentStructure.menuItems.length + 1,
                category: 'NUEVA CATEGORÍA',
                name: 'Nuevo Plato',
                price: 15,
                currency: '€',
                sort_order: currentStructure.menuItems.length + 1
            });
            renderMenuTable();
        });
    }

    // GUARDAR CAMBIOS EN LA CARTA
    const saveMenuBtn = document.getElementById('save-menu-btn');
    if (saveMenuBtn) {
        saveMenuBtn.addEventListener('click', async () => {
            const rows = document.querySelectorAll('#menu-items-body tr');
            const items = [];

            rows.forEach((tr, idx) => {
                items.push({
                    id: idx + 1,
                    category: tr.querySelector('.item-cat').value,
                    name: tr.querySelector('.item-name').value,
                    price: parseFloat(tr.querySelector('.item-price').value) || 0,
                    currency: tr.querySelector('.item-unit').value,
                    sort_order: idx + 1
                });
            });

            try {
                const res = await fetch('/api/admin/update-menu', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': adminToken
                    },
                    body: JSON.stringify({ items })
                });

                const data = await res.json();
                if (data.success) {
                    currentStructure.menuItems = items;
                    await reloadStructureData();
                    alert('✅ Carta y precios guardados correctamente.');
                } else {
                    alert(`❌ Error al guardar carta: ${data.error}`);
                }
            } catch (err) {
                alert('❌ Error de conexión al guardar carta.');
            }
        });
    }

    // 4. RENDERIZAR PREGUNTAS FRECUENTES (TAB 4)
    function renderFaqsList() {
        const container = document.getElementById('faqs-list-container');
        if (!container || !currentStructure) return;

        const langTexts = currentStructure.staticTranslations[currentLang] || {};
        const staticEsTexts = currentStructure.staticTranslations['es'] || {};
        const dynamicLangTexts = (currentStructure.dynamicTexts && currentStructure.dynamicTexts[currentLang]) || {};
        const attachments = currentStructure.attachments || {};
        const disabledKeys = currentStructure.disabledKeys || {};

        container.innerHTML = '';

        const faqListDef = [
            { num: 1, titleKey: 'faq12Title', descKey: 'faq12Desc', msgKey: 'faq12Msg' },
            { num: 2, titleKey: 'faq1Title', descKey: 'faq1Desc', msgKey: 'faq1Msg' },
            { num: 3, titleKey: 'faq2Title', descKey: 'faq2Desc', msgKey: 'faq2Msg' },
            { num: 4, titleKey: 'faq3Title', descKey: 'faq3Desc', msgKey: 'faq3Msg' },
            { num: 5, titleKey: 'faq4Title', descKey: 'faq4Desc', msgKey: 'faq4Msg' },
            { num: 6, titleKey: 'faq5Title', descKey: 'faq5Desc', msgKey: 'faq5Msg' },
            { num: 7, titleKey: 'faq6Title', descKey: 'faq6Desc', msgKey: 'faq6Msg' },
            { num: 8, titleKey: 'faq7Title', descKey: 'faq7Desc', msgKey: 'faq7Msg' },
            { num: 9, titleKey: 'faq8Title', descKey: 'faq8Desc', msgKey: 'faq8Msg' },
            { num: 10, titleKey: 'faq9Title', descKey: 'faq9Desc', msgKey: 'faq9Msg' }
        ];

        faqListDef.forEach(faqItem => {
            const titleVal = dynamicLangTexts[faqItem.titleKey] || langTexts[faqItem.titleKey] || staticEsTexts[faqItem.titleKey] || `Opción ${faqItem.num}`;
            const msgVal = dynamicLangTexts[faqItem.msgKey] || langTexts[faqItem.msgKey] || staticEsTexts[faqItem.msgKey] || '';
            const isDisabled = !!disabledKeys[faqItem.msgKey];
            const att = attachments[faqItem.msgKey];

            let attachmentPreviewHtml = '';
            if (att && att.mediaUrl) {
                const mediaIcon = att.mediaType === 'image' ? '🖼️' : att.mediaType === 'video' ? '🎬' : att.mediaType === 'audio' ? '🔊' : att.mediaType === 'sticker' ? '🎭' : att.mediaType === 'document' ? '📎' : '📁';
                attachmentPreviewHtml = `
                    <div class="attachment-preview" style="display:flex; align-items:center; gap:10px; background:#181b22; padding:8px 10px; border-radius:6px; margin:6px 0; border-left:3px solid var(--accent-gold);">
                        <span>${mediaIcon} <strong>${att.mediaType.toUpperCase()}</strong>: <a href="${att.mediaUrl}" target="_blank" style="color:var(--accent-gold);">${att.filename || 'Ver adjunto'}</a></span>
                        <button class="btn-danger btn-remove-faq-att" data-key="${faqItem.msgKey}" style="padding:3px 8px; font-size:0.72rem;">🗑️ Quitar</button>
                    </div>
                `;
            }

            const card = document.createElement('div');
            card.className = `text-card ${isDisabled ? 'card-disabled' : ''}`;
            card.style.marginBottom = '16px';
            card.innerHTML = `
                <div class="text-card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span class="key-title badge-faq" style="padding:4px 8px; border-radius:4px; font-weight:700;">FAQ ${faqItem.num}: ${titleVal}</span>
                    <span class="status-badge ${isDisabled ? 'badge-off' : 'badge-on'}" style="font-size:0.75rem;">${isDisabled ? '🔴 Oculta' : '🟢 Activa'}</span>
                </div>
                <label style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px; display:block;">Título de opción desplegable:</label>
                <input type="text" value="${titleVal}" class="faq-title-input" style="width:100%; margin-bottom:12px; padding:8px; border-radius:6px; background:#1e222a; color:#fff; border:1px solid #333;">
                <label style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px; display:block;">Mensaje de respuesta del Chatbot:</label>
                <textarea class="faq-msg-input" style="width:100%; height:100px; padding:8px; border-radius:6px; background:#1e222a; color:#fff; border:1px solid #333; resize:vertical;">${msgVal}</textarea>
                ${attachmentPreviewHtml}
                <div class="text-card-footer" style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
                    <button class="btn-attachment btn-add-faq-att" data-key="${faqItem.msgKey}" style="padding:6px 12px; font-size:0.8rem;">📎 Añadir Adjunto</button>
                    <button class="btn-warning btn-toggle-faq" data-key="${faqItem.msgKey}" style="padding:6px 12px; font-size:0.8rem;">${isDisabled ? '👁️ Mostrar' : '👁️ Ocultar'}</button>
                    <button class="btn-primary btn-save-faq" style="padding:6px 14px; font-size:0.8rem; font-weight:600;">💾 Guardar FAQ ${faqItem.num}</button>
                </div>
            `;

            card.querySelector('.btn-save-faq').addEventListener('click', async () => {
                const newTitle = card.querySelector('.faq-title-input').value;
                const newMsg = card.querySelector('.faq-msg-input').value;
                await saveText(faqItem.titleKey, newTitle, 'faq');
                await saveText(faqItem.msgKey, newMsg, 'faq');
            });

            card.querySelector('.btn-toggle-faq').addEventListener('click', async () => {
                await toggleKeyStatus(faqItem.msgKey, !isDisabled, titleVal || faqItem.msgKey);
            });

            card.querySelector('.btn-add-faq-att').addEventListener('click', () => {
                openAttachmentModal(faqItem.msgKey);
            });

            const removeAttBtn = card.querySelector('.btn-remove-faq-att');
            if (removeAttBtn) {
                removeAttBtn.addEventListener('click', async () => {
                    if (confirm(`¿Eliminar adjunto multimedia de FAQ ${faqItem.num}?`)) {
                        await deleteAttachment(faqItem.msgKey);
                    }
                });
            }

            container.appendChild(card);
        });
    }

    // 5. RENDERIZAR Y CONFIGURAR REGLAS DINÁMICAS POR PALABRA CLAVE (TAB 5)
    function renderCustomRulesTable() {
        if (!customRulesBody || !currentStructure) return;
        customRulesBody.innerHTML = '';
        const rules = currentStructure.customRules || [];

        rules.forEach(rule => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:600; color:var(--accent-gold); font-family:monospace;">"${rule.keyword}"</td>
                <td><span class="flow-badge">${(rule.category || 'general').toUpperCase()}</span></td>
                <td style="max-width:260px; word-break:break-word; font-size:0.82rem;">${rule.responseText}</td>
                <td><span class="status-badge ${rule.isActive ? 'badge-on' : 'badge-off'}">${rule.isActive ? '🟢 ACTIVA' : '🔴 INACTIVA'}</span></td>
                <td>
                    <div style="display:flex; gap:6px;">
                        <button class="btn-secondary btn-edit-rule" style="padding:4px 8px; font-size:0.75rem;">✏️ Editar</button>
                        <button class="btn-danger btn-delete-rule" style="padding:4px 8px; font-size:0.75rem;">🗑️ Eliminar</button>
                    </div>
                </td>
            `;

            tr.querySelector('.btn-edit-rule').addEventListener('click', () => {
                ruleIdInput.value = rule.id;
                ruleKeywordInput.value = rule.keyword;
                ruleCatSelect.value = rule.category || 'general';
                ruleResponseInput.value = rule.responseText;
                document.querySelector('#custom-rule-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
            });

            tr.querySelector('.btn-delete-rule').addEventListener('click', async () => {
                if (confirm(`¿Estás seguro de eliminar la regla para la palabra clave "${rule.keyword}"?`)) {
                    await deleteCustomRule(rule.id);
                }
            });

            customRulesBody.appendChild(tr);
        });
    }

    if (customRuleForm) {
        customRuleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = ruleIdInput.value;
            const keyword = ruleKeywordInput.value.trim();
            const category = ruleCatSelect.value;
            const responseText = ruleResponseInput.value.trim();

            if (!keyword || !responseText) {
                alert('Debes indicar la palabra clave y la respuesta automática.');
                return;
            }

            try {
                const res = await fetch('/api/admin/update-custom-rule', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': adminToken
                    },
                    body: JSON.stringify({ id, keyword, category, responseText, isActive: true })
                });
                const data = await res.json();
                if (data.success && data.rule) {
                    ruleIdInput.value = '';
                    ruleKeywordInput.value = '';
                    ruleResponseInput.value = '';
                    await reloadStructureData();
                    renderCustomRulesTable();
                    alert(`✅ Regla automática guardada para la palabra clave "${keyword}".`);
                } else {
                    alert(`Error guardando regla: ${data.error}`);
                }
            } catch (err) {
                alert('Error de conexión al guardar regla.');
            }
        });
    }

    async function deleteCustomRule(id) {
        try {
            const res = await fetch('/api/admin/delete-custom-rule', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ id })
            });
            const data = await res.json();
            if (data.success) {
                await reloadStructureData();
                renderCustomRulesTable();
            } else {
                alert(`Error al eliminar regla: ${data.error}`);
            }
        } catch (err) {
            alert('Error de conexión al eliminar regla.');
        }
    }

    // 6. RENDERIZAR TABLA DE CAMBIOS EN BORRADOR & PUBLICACIÓN A PRODUCCIÓN (TAB 6)
    function renderDraftChangesTable() {
        const draftBody = document.getElementById('draft-changes-body');
        const draftBadge = document.getElementById('draft-count-badge');
        const pendingCountEl = document.getElementById('pending-changes-count');
        const lastPublishDateEl = document.getElementById('last-publish-date');
        
        if (!currentStructure) return;

        const drafts = currentStructure.draftChanges || [];
        
        if (draftBadge) {
            if (drafts.length > 0) {
                draftBadge.textContent = drafts.length;
                draftBadge.style.display = 'inline-block';
            } else {
                draftBadge.style.display = 'none';
            }
        }

        if (pendingCountEl) pendingCountEl.textContent = drafts.length;

        if (lastPublishDateEl && currentStructure.lastPublishTimestamp) {
            const d = new Date(currentStructure.lastPublishTimestamp);
            lastPublishDateEl.textContent = d.toLocaleString();
        }

        if (!draftBody) return;
        draftBody.innerHTML = '';

        if (drafts.length === 0) {
            draftBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">
                        ✅ No hay modificaciones pendientes en el borrador. Todos los cambios están publicados en producción.
                    </td>
                </tr>
            `;
            return;
        }

        drafts.forEach((draft, idx) => {
            const tr = document.createElement('tr');
            const dateStr = draft.createdAt ? new Date(draft.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            tr.innerHTML = `
                <td style="font-weight:600; color:var(--text-muted);">${idx + 1}</td>
                <td><span class="status-badge badge-on" style="background:rgba(59, 130, 246, 0.2); color:#60a5fa; border:1px solid rgba(59, 130, 246, 0.4);">${draft.changeType}</span></td>
                <td style="font-weight:600; color:var(--accent-gold); font-family:monospace;">${draft.sequenceLocation}</td>
                <td style="font-size:0.85rem; color:#e9edef;">${draft.details}</td>
                <td style="font-size:0.8rem; color:var(--text-muted);">${dateStr}</td>
                <td>
                    <button class="btn-danger btn-discard-single" data-id="${draft.id}" style="padding:4px 8px; font-size:0.75rem;">🗑️ Descartar</button>
                </td>
            `;

            tr.querySelector('.btn-discard-single').addEventListener('click', async () => {
                await discardDraft(draft.id);
            });

            draftBody.appendChild(tr);
        });
    }

    // BOTÓN: SUBIR A PRODUCCIÓN
    const publishBtn = document.getElementById('publish-to-prod-btn');
    if (publishBtn) {
        publishBtn.addEventListener('click', async () => {
            const drafts = currentStructure ? (currentStructure.draftChanges || []) : [];
            const count = drafts.length;

            const confirmMsg = count > 0
                ? `🚀 ¿Confirmas SUBIR ${count} MODIFICACIONES A PRODUCCIÓN?\n\nLos usuarios reales de WhatsApp en vivo comenzarán a interactuar con los nuevos textos y reglas de inmediato.`
                : `🚀 ¿Deseas verificar la versión de producción actual?\n\nNo hay cambios pendientes en borrador.`;

            if (confirm(confirmMsg)) {
                try {
                    const res = await fetch('/api/admin/publish', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-admin-token': adminToken
                        }
                    });
                    const data = await res.json();
                    if (data.success) {
                        if (currentStructure) {
                            currentStructure.draftChanges = [];
                            currentStructure.lastPublishTimestamp = data.timestamp;
                        }
                        renderDraftChangesTable();
                        renderUseCasesFlow();
                        alert(`🎉 ${data.message}`);
                    } else {
                        alert(`❌ Error al subir a producción: ${data.error}`);
                    }
                } catch (err) {
                    alert('❌ Error de conexión al subir a producción.');
                }
            }
        });
    }

    // BOTÓN: DESCARTAR TODOS LOS CAMBIOS
    const discardAllBtn = document.getElementById('discard-all-drafts-btn');
    if (discardAllBtn) {
        discardAllBtn.addEventListener('click', async () => {
            if (confirm('⚠️ ¿Estás seguro de descartar TODOS los cambios pendientes del borrador? Esta acción restablecerá el estado.')) {
                await discardDraft(null, true);
            }
        });
    }

    async function discardDraft(draftId, all = false) {
        try {
            const res = await fetch('/api/admin/discard-draft', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ draftId, all })
            });
            const data = await res.json();
            if (data.success) {
                await reloadStructureData();
            }
        } catch (err) {
            console.error('Error descartando borrador:', err);
        }
    }

    async function reloadStructureData() {
        try {
            const res = await fetch('/api/admin/structure', {
                headers: { 'x-admin-token': adminToken }
            });
            const data = await res.json();
            if (data.success) {
                currentStructure = data;
                renderDraftChangesTable();
            }
        } catch (e) {
            console.error('Error recargando estructura:', e);
        }
    }

    // 7. PREVISUALIZACIÓN ESTÁTICA WHATSAPP
    function updateLiveSimulator(key, customText = null) {
        if (isTestMode) return;

        const simBody = document.getElementById('sim-body');
        const simButtons = document.getElementById('sim-buttons');
        const simListTrigger = document.getElementById('sim-list-trigger');
        const metaAlertBox = document.getElementById('meta-limits-alert');
        const metaAlertList = document.getElementById('meta-alert-list');

        if (!currentStructure) return;

        const langTexts = currentStructure.staticTranslations[currentLang] || {};
        const dynamicLangTexts = (currentStructure.dynamicTexts && currentStructure.dynamicTexts[currentLang]) || {};

        let textVal = customText !== null ? customText : (dynamicLangTexts[key] !== undefined ? dynamicLangTexts[key] : langTexts[key]);
        if (!textVal) textVal = `[Clave ${key} sin texto]`;

        simBody.textContent = textVal;
        simButtons.innerHTML = '';
        simListTrigger.style.display = 'none';
        metaAlertBox.style.display = 'none';
        metaAlertList.innerHTML = '';

        const alerts = [];

        if (key === 'welcomeMessage') {
            simListTrigger.style.display = 'block';
            document.getElementById('sim-list-btn-text').textContent = '🌐 Seleccionar Idioma';
        } else if (key === 'selectLocationTitle' || key === 'selectLocationBody') {
            const titleText = dynamicLangTexts['selectLocationTitle'] || langTexts['selectLocationTitle'] || '📍 *Seleccionar restaurante*';
            const bodyText = dynamicLangTexts['selectLocationBody'] || langTexts['selectLocationBody'] || '¿En cuál de nuestros restaurantes estás interesado?';
            simBody.textContent = `${titleText}\n\n${bodyText}`;

            const b1 = dynamicLangTexts['locPaisVasco'] || langTexts['locPaisVasco'] || 'Tolosa (Euskadi)';
            const b2 = dynamicLangTexts['locMadrid'] || langTexts['locMadrid'] || 'Madrid';

            [b1, b2].forEach(b => {
                const btnDiv = document.createElement('div');
                btnDiv.className = 'sim-btn';
                btnDiv.textContent = b;
                if (b.length > 20) {
                    alerts.push(`El botón "${b}" supera el límite de 20 caracteres de Meta (${b.length} caracteres).`);
                }
                simButtons.appendChild(btnDiv);
            });
        } else if (key === 'mainMenuHeader') {
            simListTrigger.style.display = 'block';
            document.getElementById('sim-list-btn-text').textContent = '📋 Ver Opciones';
        }

        if (alerts.length > 0) {
            metaAlertBox.style.display = 'block';
            alerts.forEach(alertText => {
                const li = document.createElement('li');
                li.textContent = alertText;
                metaAlertList.appendChild(li);
            });
        }
    }

    // 8. MODALIDAD TEST INTERACTIVO EN VIVO
    if (btnStartTest) {
        btnStartTest.addEventListener('click', () => {
            startInteractiveTest();
        });
    }

    if (btnResetTest) {
        btnResetTest.addEventListener('click', () => {
            resetInteractiveTest();
        });
    }

    if (simInputForm) {
        simInputForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const val = simUserInput.value.trim();
            if (!val) return;

            simUserInput.value = '';
            if (!isTestMode) {
                isTestMode = true;
                singlePreviewBubble.style.display = 'none';
                liveChatStream.style.display = 'flex';
            }

            appendUserBubble(val);
            await sendSimPayload({ text: val });
        });
    }

    async function startInteractiveTest() {
        isTestMode = true;
        singlePreviewBubble.style.display = 'none';
        liveChatStream.style.display = 'flex';
        liveChatStream.innerHTML = '';

        await sendSimPayload({ action: 'reset' });
    }

    function resetInteractiveTest() {
        isTestMode = false;
        singlePreviewBubble.style.display = 'block';
        liveChatStream.style.display = 'none';
        liveChatStream.innerHTML = '';
        simUserInput.value = '';
        updateLiveSimulator('welcomeMessage');
    }

    async function sendSimPayload(payload) {
        try {
            const res = await fetch('/api/admin/simulate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success && Array.isArray(data.messages)) {
                renderLiveChatMessages(data.messages);
            }
        } catch (err) {
            console.error('Error en simulación interactiva:', err);
        }
    }

    function appendUserBubble(text) {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-bubble';
        userDiv.textContent = text;
        liveChatStream.appendChild(userDiv);
        scrollSimToBottom();
    }

    function renderLiveChatMessages(messages) {
        liveChatStream.innerHTML = '';
        messages.forEach(msg => {
            if (msg.type === 'text') {
                const b = document.createElement('div');
                b.className = 'bot-bubble';
                b.textContent = msg.text;
                liveChatStream.appendChild(b);
            } else if (msg.type === 'button') {
                const b = document.createElement('div');
                b.className = 'bot-bubble';
                b.textContent = msg.text;

                if (Array.isArray(msg.buttons)) {
                    const btnsDiv = document.createElement('div');
                    btnsDiv.className = 'sim-buttons';
                    msg.buttons.forEach(btn => {
                        const btnEl = document.createElement('div');
                        btnEl.className = 'sim-interactive-btn';
                        btnEl.textContent = btn.title || btn.id;
                        btnEl.addEventListener('click', async () => {
                            appendUserBubble(btn.title || btn.id);
                            await sendSimPayload({ buttonId: btn.id });
                        });
                        btnsDiv.appendChild(btnEl);
                    });
                    b.appendChild(btnsDiv);
                }
                liveChatStream.appendChild(b);
            } else if (msg.type === 'list') {
                const b = document.createElement('div');
                b.className = 'bot-bubble';
                b.textContent = msg.text;

                if (Array.isArray(msg.sections)) {
                    msg.sections.forEach(sec => {
                        if (Array.isArray(sec.rows)) {
                            sec.rows.forEach(row => {
                                const rowEl = document.createElement('div');
                                rowEl.className = 'sim-interactive-btn';
                                rowEl.textContent = `${row.title} - ${row.description || ''}`;
                                rowEl.addEventListener('click', async () => {
                                    appendUserBubble(row.title);
                                    await sendSimPayload({ listId: row.id });
                                });
                                b.appendChild(rowEl);
                            });
                        }
                    });
                }
                liveChatStream.appendChild(b);
            }
        });

        scrollSimToBottom();
    }

    function scrollSimToBottom() {
        setTimeout(() => {
            whatsappScreen.scrollTop = whatsappScreen.scrollHeight;
        }, 50);
    }

    // =========================================================================
    // LÓGICA DE BANDEJA DE RECEPCIÓN Y SOLICITUDES EN TIEMPO REAL (INBOX)
    // =========================================================================

    // Cargar Solicitudes desde Backend
    async function fetchSolicitudes() {
        if (!adminToken) return;
        try {
            const res = await fetch('/api/admin/solicitudes', {
                headers: { 'x-admin-token': adminToken }
            });
            if (res.status === 401) return;
            const data = await res.json();
            if (data.success && Array.isArray(data.solicitudes)) {
                allSolicitudes = data.solicitudes;
                renderInboxCards();
            }
        } catch (err) {
            console.error("⚠️ Error cargando solicitudes del buzón:", err);
        }
    }

    // Filtrar y Renderizar Tarjetas de Solicitudes
    function renderInboxCards() {
        if (!inboxCardsContainer) return;

        let filtered = [...allSolicitudes];

        // 1. Filtrar por categoría
        if (currentInboxCatFilter !== 'all') {
            filtered = filtered.filter(s => s.categoria === currentInboxCatFilter);
        }

        // 2. Filtrar por estado
        if (currentInboxStatusFilter !== 'all') {
            filtered = filtered.filter(s => s.estado === currentInboxStatusFilter);
        }

        // 3. Filtrar por texto de búsqueda
        if (currentInboxSearch.trim()) {
            const q = currentInboxSearch.toLowerCase().trim();
            filtered = filtered.filter(s => 
                (s.nombreCliente || '').toLowerCase().includes(q) ||
                (s.telefonoCliente || '').toLowerCase().includes(q) ||
                (s.telefonoReserva || '').toLowerCase().includes(q) ||
                (s.datosDetallados || '').toLowerCase().includes(q) ||
                (s.tipoAccion || '').toLowerCase().includes(q)
            );
        }

        // Actualizar Badge de Contador Pendientes
        const pendingCount = allSolicitudes.filter(s => s.estado === 'PENDIENTE').length;
        if (inboxCountBadge) {
            inboxCountBadge.textContent = pendingCount;
            inboxCountBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
        }

        if (filtered.length === 0) {
            inboxCardsContainer.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 50px 20px; background: rgba(15, 23, 42, 0.4); border: 1px dashed rgba(255,255,255,0.1); border-radius: 12px;">
                    <div style="font-size: 2.5rem; margin-bottom: 8px;">📥</div>
                    <div style="font-size: 1.1rem; font-weight: 600; color: #fff;">No hay solicitudes que coincidan con los filtros</div>
                    <p style="font-size: 0.85rem; margin-top: 4px;">Las nuevas peticiones enviadas por los clientes desde WhatsApp aparecerán aquí automáticamente.</p>
                </div>
            `;
            return;
        }

        let html = '';
        filtered.forEach(sol => {
            const dateStr = sol.created_at ? new Date(sol.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'Reciente';
            
            // Badge de Categoría
            let catTagHtml = `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #38bdf8; border: 1px solid rgba(59, 130, 246, 0.3); font-weight: 700; padding: 3px 10px; border-radius: 16px; font-size: 0.78rem;">📌 ${sol.categoriaLabel || sol.tipoAccion || 'Solicitud'}</span>`;
            if (sol.categoria === 'reservas_menu_tradicion') {
                catTagHtml = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 700; padding: 3px 10px; border-radius: 16px; font-size: 0.78rem;">🎁 Reservas Menú Tradición</span>`;
            } else if (sol.categoria === 'mod_comensales') {
                catTagHtml = `<span class="badge" style="background: rgba(6, 182, 212, 0.15); color: #06b6d4; border: 1px solid rgba(6, 182, 212, 0.3); font-weight: 700; padding: 3px 10px; border-radius: 16px; font-size: 0.78rem;">👥 Mod. Comensales</span>`;
            } else if (sol.categoria === 'mod_dia') {
                catTagHtml = `<span class="badge" style="background: rgba(99, 102, 241, 0.15); color: #6366f1; border: 1px solid rgba(99, 102, 241, 0.3); font-weight: 700; padding: 3px 10px; border-radius: 16px; font-size: 0.78rem;">📅 Mod. Día</span>`;
            } else if (sol.categoria === 'mod_hora') {
                catTagHtml = `<span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.3); font-weight: 700; padding: 3px 10px; border-radius: 16px; font-size: 0.78rem;">🕐 Mod. Hora</span>`;
            } else if (sol.categoria === 'cancelacion') {
                catTagHtml = `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 700; padding: 3px 10px; border-radius: 16px; font-size: 0.78rem;">❌ Cancelaciones</span>`;
            } else if (sol.categoria === 'consulta_abierta') {
                catTagHtml = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-weight: 700; padding: 3px 10px; border-radius: 16px; font-size: 0.78rem;">💬 Consultas Abiertas</span>`;
            }

            // Badge de Estado
            let statusBadgeHtml = `<span style="background: rgba(234, 179, 8, 0.2); color: #fde047; padding: 3px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 700;">⏳ PENDIENTE</span>`;
            if (sol.estado === 'RESPONDIDA') {
                statusBadgeHtml = `<span style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 3px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 700;">💬 RESPONDIDA</span>`;
            } else if (sol.estado === 'CONFIRMADA') {
                statusBadgeHtml = `<span style="background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 3px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 700;">✅ CONFIRMADA</span>`;
            } else if (sol.estado === 'RECHAZADA') {
                statusBadgeHtml = `<span style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; padding: 3px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 700;">🚫 RECHAZADA</span>`;
            }

            const phoneFormatted = sol.telefonoCliente || sol.telefonoReserva || 'Desconocido';
            const isHandoverActive = sol.enAtencionHumana !== false && sol.estado !== 'CONFIRMADA' && sol.estado !== 'RECHAZADA';
            const handoverBadgeHtml = isHandoverActive
                ? `<span style="background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700;">🟢 Modo Humano</span>`
                : `<span style="background: rgba(100, 116, 139, 0.18); color: #94a3b8; border: 1px solid rgba(100, 116, 139, 0.3); padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 600;">⚪ Bot Activo</span>`;

            const msgList = Array.isArray(sol.mensajes) ? sol.mensajes : [];
            const msgCountStr = msgList.length > 0 ? `💬 ${msgList.length} ${msgList.length === 1 ? 'mensaje' : 'mensajes'}` : '💬 1 mensaje';

            // Tarjeta compacta profesional estilo WhatsApp Web (sin desplegar todo el resumen)
            html += `
                <div class="whatsapp-inbox-card solicitud-card" data-id="${sol.id}">
                    <div class="card-top-header">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            ${catTagHtml}
                            ${statusBadgeHtml}
                            ${handoverBadgeHtml}
                        </div>
                        <span style="font-size: 0.78rem; color: #94a3b8;">⏰ ${dateStr}</span>
                    </div>

                    <div class="card-main-content">
                        <div class="card-user-info">
                            <div class="card-avatar">👤</div>
                            <div>
                                <div class="card-client-name">${sol.nombreCliente || 'Cliente'}</div>
                                <div class="card-client-phone">📞 WhatsApp: +${phoneFormatted}</div>
                            </div>
                        </div>

                        <div class="card-badges-right">
                            <span class="msg-count-chip">${msgCountStr}</span>
                            <button class="btn-danger btn-delete-solicitud" data-id="${sol.id}" style="background: rgba(100, 116, 139, 0.2); color: #cbd5e1; border: 1px solid rgba(100, 116, 139, 0.4); font-size: 0.8rem; padding: 5px 8px; border-radius: 6px;" title="Eliminar solicitud">🗑️</button>
                        </div>
                    </div>
                </div>
            `;
        });

        inboxCardsContainer.innerHTML = html;

        // Registrar Event Listeners: Al hacer click en cualquier parte de la tarjeta, abrir el modal
        document.querySelectorAll('.solicitud-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Si pulsó eliminar, no abrir el modal
                if (e.target.closest('.btn-delete-solicitud')) return;
                const solId = card.getAttribute('data-id');
                const sol = allSolicitudes.find(s => s.id === solId);
                if (sol) openReplyModal(sol);
            });
        });

        document.querySelectorAll('.btn-delete-solicitud').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const solId = btn.getAttribute('data-id');
                if (confirm("¿Seguro que deseas eliminar este registro de solicitud?")) {
                    try {
                        await fetch(`/api/admin/solicitudes/${solId}`, {
                            method: 'DELETE',
                            headers: { 'x-admin-token': adminToken }
                        });
                        await fetchSolicitudes();
                    } catch (e) {
                        alert("Error al eliminar solicitud: " + e.message);
                    }
                }
            });
        });
    }

    // Abrir Modal de Respuesta Manual y Chat
    function openReplyModal(sol, prefilledText = '', targetStatus = 'EN_GESTION') {
        activeReplySolicitud = sol;
        replySolicitudId.value = sol.id;
        replyClientName.textContent = `Cliente: ${sol.nombreCliente || 'Cliente Casa Julián'}`;
        replyClientPhone.textContent = `📞 WhatsApp: +${sol.telefonoCliente || sol.telefonoReserva || ''}`;
        
        // Badge de Categoría en Modal
        const catBadgeEl = document.getElementById('reply-category-badge');
        if (catBadgeEl) {
            catBadgeEl.textContent = sol.categoriaLabel || sol.tipoAccion || '📌 Solicitud';
            if (sol.categoria === 'reservas_menu_tradicion') {
                catBadgeEl.textContent = '🎁 Reservas Menú Tradición';
                catBadgeEl.style.color = '#34d399';
                catBadgeEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            } else if (sol.categoria === 'cancelacion') {
                catBadgeEl.textContent = '❌ Cancelación';
                catBadgeEl.style.color = '#f87171';
                catBadgeEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
            }
        }

        // Estado del Modo Humano
        const handoverStatusEl = document.getElementById('reply-handover-status');
        const isHandoverActive = sol.enAtencionHumana !== false && sol.estado !== 'CONFIRMADA' && sol.estado !== 'RECHAZADA';
        if (handoverStatusEl) {
            handoverStatusEl.textContent = isHandoverActive ? '🟢 Modo Humano (Bot Pausado)' : '⚪ Bot Activo';
            handoverStatusEl.style.background = isHandoverActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)';
            handoverStatusEl.style.color = isHandoverActive ? '#34d399' : '#94a3b8';
            handoverStatusEl.style.borderColor = isHandoverActive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(100, 116, 139, 0.3)';
        }

        // Resumen estructurado en la barra lateral izquierda
        const summaryEl = document.getElementById('reply-solicitud-summary');
        const dateEl = document.getElementById('reply-solicitud-date');
        if (summaryEl) {
            summaryEl.textContent = sol.datosDetallados || 'Sin detalles de solicitud.';
        }
        if (dateEl) {
            dateEl.textContent = sol.created_at ? new Date(sol.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'Reciente';
        }

        // Renderizar Hilo de Mensajes con estilo WhatsApp
        const threadContainer = document.getElementById('reply-chat-thread');
        const msgCountEl = document.getElementById('thread-msg-count');
        const msgList = Array.isArray(sol.mensajes) && sol.mensajes.length > 0 
            ? sol.mensajes 
            : [{ emisor: 'cliente', texto: sol.datosDetallados || 'Solicitud inicial.', fecha: sol.created_at }];

        if (msgCountEl) msgCountEl.textContent = `${msgList.length} ${msgList.length === 1 ? 'mensaje' : 'mensajes'}`;

        if (threadContainer) {
            threadContainer.innerHTML = '';
            msgList.forEach(m => {
                const isClient = m.emisor === 'cliente';
                const timeStr = m.fecha ? new Date(m.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '';
                
                const bubble = document.createElement('div');
                bubble.style.cssText = `
                    max-width: 80%;
                    align-self: ${isClient ? 'flex-start' : 'flex-end'};
                    background: ${isClient ? '#005c4b' : '#025144'};
                    color: #e9edef;
                    padding: 10px 14px;
                    border-radius: ${isClient ? '0 12px 12px 12px' : '12px 0 12px 12px'};
                    font-size: 0.88rem;
                    line-height: 1.45;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.25);
                    word-break: break-word;
                    border: 1px solid rgba(255,255,255,0.05);
                `;
                bubble.innerHTML = `
                    <div style="font-size: 0.74rem; font-weight: 700; color: ${isClient ? '#53bdeb' : '#25d366'}; margin-bottom: 3px;">
                        ${isClient ? '👤 ' + (sol.nombreCliente || 'Cliente') : '👩‍💼 Recepción Casa Julián'}
                    </div>
                    <div style="white-space: pre-wrap;">${m.texto}</div>
                    <div style="text-align: right; font-size: 0.68rem; color: #8696a0; margin-top: 4px;">${timeStr}</div>
                `;
                threadContainer.appendChild(bubble);
            });

            setTimeout(() => { threadContainer.scrollTop = threadContainer.scrollHeight; }, 60);
        }

        replyMessageText.value = prefilledText || '';
        replyErrorMsg.style.display = 'none';
        replyModal.setAttribute('data-target-status', targetStatus);
        replyModal.style.display = 'flex';

        // Ocultar widget minimizado si estaba visible
        const miniWidget = document.getElementById('minimized-chat-widget');
        if (miniWidget) miniWidget.style.display = 'none';
    }

    function closeReplyModal() {
        replyModal.style.display = 'none';
        activeReplySolicitud = null;
        const miniWidget = document.getElementById('minimized-chat-widget');
        if (miniWidget) miniWidget.style.display = 'none';
    }

    function minimizeReplyModal() {
        if (!activeReplySolicitud) return;
        replyModal.style.display = 'none';
        const miniWidget = document.getElementById('minimized-chat-widget');
        const miniName = document.getElementById('minimized-client-name');
        const miniPhone = document.getElementById('minimized-client-phone');
        if (miniWidget) {
            if (miniName) miniName.textContent = `Cliente: ${activeReplySolicitud.nombreCliente || 'Cliente'}`;
            if (miniPhone) miniPhone.textContent = `📞 WhatsApp: +${activeReplySolicitud.telefonoCliente || activeReplySolicitud.telefonoReserva || ''}`;
            miniWidget.style.display = 'flex';
        }
    }

    function toggleMaximizeModal() {
        const modalBox = document.querySelector('.whatsapp-modal-container');
        const maxBtn = document.getElementById('maximize-reply-modal-btn');
        if (modalBox) {
            modalBox.classList.toggle('fullscreen');
            const isFull = modalBox.classList.contains('fullscreen');
            if (maxBtn) maxBtn.textContent = isFull ? '🗗' : '🗖';
            if (maxBtn) maxBtn.title = isFull ? 'Restaurar tamaño normal' : 'Maximizar / Pantalla Completa';
        }
    }

    const minimizeBtn = document.getElementById('minimize-reply-modal-btn');
    const maximizeBtn = document.getElementById('maximize-reply-modal-btn');
    const restoreChatBtn = document.getElementById('restore-chat-btn');
    const closeMiniBtn = document.getElementById('close-minimized-chat-btn');
    const miniWidgetEl = document.getElementById('minimized-chat-widget');

    if (minimizeBtn) minimizeBtn.addEventListener('click', minimizeReplyModal);
    if (maximizeBtn) maximizeBtn.addEventListener('click', toggleMaximizeModal);
    if (restoreChatBtn) {
        restoreChatBtn.addEventListener('click', () => {
            if (activeReplySolicitud) {
                if (miniWidgetEl) miniWidgetEl.style.display = 'none';
                replyModal.style.display = 'flex';
            }
        });
    }
    if (miniWidgetEl) {
        miniWidgetEl.addEventListener('click', (e) => {
            if (e.target.closest('#close-minimized-chat-btn')) return;
            if (activeReplySolicitud) {
                miniWidgetEl.style.display = 'none';
                replyModal.style.display = 'flex';
            }
        });
    }
    if (closeMiniBtn) {
        closeMiniBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (miniWidgetEl) miniWidgetEl.style.display = 'none';
            activeReplySolicitud = null;
        });
    }

    if (closeReplyModalBtn) closeReplyModalBtn.addEventListener('click', closeReplyModal);
    if (cancelReplyBtn) cancelReplyBtn.addEventListener('click', closeReplyModal);
    if (refreshInboxBtn) refreshInboxBtn.addEventListener('click', fetchSolicitudes);

    // Eventos de Filtrado en Toolbar Inbox
    document.querySelectorAll('#inbox-category-filters .filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#inbox-category-filters .filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentInboxCatFilter = chip.getAttribute('data-inbox-cat');
            renderInboxCards();
        });
    });

    document.querySelectorAll('#inbox-status-filters .filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#inbox-status-filters .filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentInboxStatusFilter = chip.getAttribute('data-inbox-status');
            renderInboxCards();
        });
    });

    if (searchInboxInput) {
        searchInboxInput.addEventListener('input', (e) => {
            currentInboxSearch = e.target.value;
            renderInboxCards();
        });
    }

    // Plantillas de Respuesta Rápida
    document.querySelectorAll('.template-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!activeReplySolicitud) return;
            const tType = btn.getAttribute('data-template');
            const name = activeReplySolicitud.nombreCliente || '';
            if (tType === 'confirm') {
                replyMessageText.value = `✅ Hola ${name}, tu solicitud para Asador Casa Julián de Tolosa ha sido CONFIRMADA. ¡Esperamos darte la bienvenida pronto!`;
            } else if (tType === 'alt_time') {
                replyMessageText.value = `🕐 Hola ${name}, para la fecha solicitada no disponemos de mesa en ese turno, pero sí tendríamos disponibilidad en el siguiente turno. ¿Te vendría bien esa opción?`;
            } else if (tType === 'reject') {
                replyMessageText.value = `🚫 Hola ${name}, lamentamos comunicarte que tenemos el restaurante completo para la fecha/turno solicitados y no podemos aceptar más reservas en ese servicio.`;
            }
        });
    });

    // Botón Concluir Gestión & Reactivar Bot
    const btnConcluirGestion = document.getElementById('btn-concluir-gestion');
    if (btnConcluirGestion) {
        btnConcluirGestion.addEventListener('click', async () => {
            if (!activeReplySolicitud) return;
            const solId = activeReplySolicitud.id;
            const text = replyMessageText.value.trim();

            if (confirm("¿Deseas concluir esta gestión y reactivar el bot automático para este cliente?")) {
                btnConcluirGestion.disabled = true;
                try {
                    const res = await fetch(`/api/admin/solicitudes/${solId}/concluir`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-admin-token': adminToken
                        },
                        body: JSON.stringify({
                            estadoFinal: 'CONFIRMADA',
                            mensajeCierre: text || null
                        })
                    });

                    const data = await res.json();
                    if (data.success) {
                        closeReplyModal();
                        alert(data.message || "✅ Gestión concluida y bot reactivado.");
                        await fetchSolicitudes();
                    } else {
                        replyErrorMsg.textContent = data.error || "Error al concluir gestión.";
                        replyErrorMsg.style.display = 'block';
                    }
                } catch (err) {
                    replyErrorMsg.textContent = "Error de conexión: " + err.message;
                    replyErrorMsg.style.display = 'block';
                } finally {
                    btnConcluirGestion.disabled = false;
                }
            }
        });
    }

    // Envío del Formulario de Respuesta por WhatsApp (Mantiene chat abierto)
    if (replyForm) {
        replyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const solId = replySolicitudId.value;
            const text = replyMessageText.value.trim();

            if (!solId || !text) {
                replyErrorMsg.textContent = "Por favor escribe un mensaje de respuesta.";
                replyErrorMsg.style.display = 'block';
                return;
            }

            const submitBtn = document.getElementById('send-reply-submit-btn');
            if (submitBtn) submitBtn.disabled = true;

            try {
                const res = await fetch(`/api/admin/solicitudes/${solId}/responder`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': adminToken
                    },
                    body: JSON.stringify({
                        respuestaText: text,
                        nuevoEstado: 'EN_GESTION'
                    })
                });

                const data = await res.json();
                if (data.success) {
                    replyMessageText.value = '';
                    await fetchSolicitudes();
                    // Actualizar el hilo en el modal abierto
                    const updatedSol = allSolicitudes.find(s => s.id === solId);
                    if (updatedSol) {
                        openReplyModal(updatedSol);
                    } else {
                        closeReplyModal();
                    }
                } else {
                    replyErrorMsg.textContent = data.error || "Error al enviar WhatsApp al cliente.";
                    replyErrorMsg.style.display = 'block';
                }
            } catch (err) {
                replyErrorMsg.textContent = "Error de conexión: " + err.message;
                replyErrorMsg.style.display = 'block';
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }
});
