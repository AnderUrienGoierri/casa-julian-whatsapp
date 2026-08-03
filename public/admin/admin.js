document.addEventListener('DOMContentLoaded', () => {
    let adminToken = localStorage.getItem('casa_julian_admin_token') || '';
    let currentStructure = null;
    let currentLang = 'es';
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

    // SIMULADOR DOM
    const btnStartTest = document.getElementById('btn-start-test');
    const btnResetTest = document.getElementById('btn-reset-test');
    const simInputForm = document.getElementById('sim-input-form');
    const simUserInput = document.getElementById('sim-user-input');
    const singlePreviewBubble = document.getElementById('single-preview-bubble');
    const liveChatStream = document.getElementById('live-chat-stream');
    const whatsappScreen = document.getElementById('whatsapp-screen');

    // VERIFICAR AUTENTICACIÓN INICIAL
    if (adminToken) {
        initDashboard();
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
                initDashboard();
            } else {
                loginError.textContent = data.error || 'Contraseña incorrecta.';
                loginError.style.display = 'block';
            }
        } catch (err) {
            loginError.textContent = 'Error de conexión con el servidor.';
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
            document.getElementById(tabId).classList.add('active');
        });
    });

    // INICIALIZAR DASHBOARD Y CARGAR ESTRUCTURA
    async function initDashboard() {
        hideLoginModal();
        try {
            const res = await fetch('/api/admin/structure', {
                headers: { 'x-admin-token': adminToken }
            });

            if (res.status === 401) {
                localStorage.removeItem('casa_julian_admin_token');
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
                updateLiveSimulator('welcomeMessage');
            }
        } catch (err) {
            console.error('Error cargando estructura del bot:', err);
        }
    }

    // CLASIFICACIÓN DE COLORES POR TIPO DE ETIQUETA
    function getBadgeColorClass(key) {
        if (key.startsWith('btn') || key.startsWith('loc') || key.includes('Btn')) return 'badge-button';
        if (key.startsWith('faq')) return 'badge-faq';
        if (key.startsWith('menuTrad') || key.startsWith('regalar')) return 'badge-tradicion';
        if (key.startsWith('waitlist') || key.startsWith('reserva') || key.startsWith('mod') || key.startsWith('cancel')) return 'badge-reserva';
        if (key.startsWith('welcome') || key.startsWith('mainMenu') || key.startsWith('selectLocation')) return 'badge-header';
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
                keysBadges += `<span class="key-jump-badge ${colorClass}" data-key="${k}" title="Editar ${k}">${k}</span>`;
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

    // 2. RENDERIZAR GRID DE TEXTOS Y FILTRAR POR CATEGORÍA (TAB 2)
    function renderTextsGrid() {
        const container = document.getElementById('texts-list-container');
        if (!container || !currentStructure) return;

        const langTexts = currentStructure.staticTranslations[currentLang] || {};
        const dynamicLangTexts = (currentStructure.dynamicTexts && currentStructure.dynamicTexts[currentLang]) || {};
        const categoryMap = currentStructure.categoryMap || {};

        container.innerHTML = '';
        
        Object.keys(langTexts).forEach(key => {
            const staticVal = langTexts[key];
            const currentVal = dynamicLangTexts[key] !== undefined ? dynamicLangTexts[key] : staticVal;
            const category = categoryMap[key] || 'main';
            const colorClass = getBadgeColorClass(key);

            const card = document.createElement('div');
            card.className = 'text-card';
            card.id = `text-card-${key}`;
            card.setAttribute('data-category', category);

            card.innerHTML = `
                <div class="text-card-header">
                    <span class="key-title ${colorClass}" style="padding:2px 6px; border-radius:4px;">${key}</span>
                    <span class="flow-badge">${category.toUpperCase()}</span>
                </div>
                <textarea data-key="${key}">${currentVal}</textarea>
                <div class="text-card-footer">
                    <span class="char-counter">${currentVal.length} caracteres</span>
                    <button class="btn-primary btn-save-text" data-key="${key}">💾 Guardar</button>
                </div>
            `;

            const textarea = card.querySelector('textarea');
            textarea.addEventListener('input', (e) => {
                const val = e.target.value;
                card.querySelector('.char-counter').textContent = `${val.length} caracteres`;
                if (!isTestMode) updateLiveSimulator(key, val);
            });

            textarea.addEventListener('focus', () => {
                if (!isTestMode) updateLiveSimulator(key, textarea.value);
            });

            card.querySelector('.btn-save-text').addEventListener('click', () => {
                saveText(key, textarea.value);
            });

            container.appendChild(card);
        });

        filterTexts();
    }

    // FILTRO DE CATEGORÍAS (Filtros Menú Principal, Reservas, Menú Tradición, FAQs)
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentCategoryFilter = chip.getAttribute('data-cat');
            filterTexts();
        });
    });

    function filterTexts() {
        const query = (document.getElementById('search-text-input')?.value || '').toLowerCase();
        
        document.querySelectorAll('.text-card').forEach(card => {
            const key = card.id.replace('text-card-', '').toLowerCase();
            const txt = card.querySelector('textarea').value.toLowerCase();
            const cardCat = card.getAttribute('data-category');

            const matchesCategory = (currentCategoryFilter === 'all' || cardCat === currentCategoryFilter);
            const matchesSearch = (key.includes(query) || txt.includes(query));

            if (matchesCategory && matchesSearch) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    }

    const searchInput = document.getElementById('search-text-input');
    if (searchInput) {
        searchInput.addEventListener('input', filterTexts);
    }

    // GUARDAR TEXTO EN SERVIDOR
    async function saveText(key, text) {
        try {
            const res = await fetch('/api/admin/update-text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ lang: currentLang, key, text })
            });

            const data = await res.json();
            if (data.success) {
                if (!currentStructure.dynamicTexts[currentLang]) {
                    currentStructure.dynamicTexts[currentLang] = {};
                }
                currentStructure.dynamicTexts[currentLang][key] = text;
                alert(`✅ Guardado correctamente para [${currentLang.toUpperCase()}]: ${key}`);
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
        currentStructure.menuItems.forEach((item, index) => {
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
                    alert('✅ Carta y precios guardados correctamente. Ficha "Ver carta" actualizada de inmediato.');
                    initDashboard();
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
        const dynamicLangTexts = (currentStructure.dynamicTexts && currentStructure.dynamicTexts[currentLang]) || {};

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
            const titleVal = dynamicLangTexts[faqItem.titleKey] || langTexts[faqItem.titleKey] || `Opción ${faqItem.num}`;
            const msgVal = dynamicLangTexts[faqItem.msgKey] || langTexts[faqItem.msgKey] || '';

            const card = document.createElement('div');
            card.className = 'text-card';
            card.innerHTML = `
                <div class="text-card-header">
                    <span class="key-title badge-faq" style="padding:2px 6px; border-radius:4px;">FAQ ${faqItem.num}: ${titleVal}</span>
                </div>
                <label style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;">Título de opción:</label>
                <input type="text" value="${titleVal}" class="faq-title-input" style="margin-bottom:12px;">
                <label style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;">Mensaje de respuesta:</label>
                <textarea class="faq-msg-input" style="height:110px;">${msgVal}</textarea>
                <div class="text-card-footer" style="margin-top:10px;">
                    <button class="btn-primary btn-save-faq">💾 Guardar FAQ ${faqItem.num}</button>
                </div>
            `;

            card.querySelector('.btn-save-faq').addEventListener('click', async () => {
                const newTitle = card.querySelector('.faq-title-input').value;
                const newMsg = card.querySelector('.faq-msg-input').value;

                await saveText(faqItem.titleKey, newTitle);
                await saveText(faqItem.msgKey, newMsg);
            });

            container.appendChild(card);
        });
    }

    // 5. PREVISUALIZACIÓN ESTÁTICA WHATSAPP
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
        } else if (key === 'selectLocationBody') {
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

    // 6. MODALIDAD TEST INTERACTIVO EN VIVO
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
});
