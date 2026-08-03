document.addEventListener('DOMContentLoaded', () => {
    let adminToken = localStorage.getItem('casa_julian_admin_token') || '';
    let currentStructure = null;
    let currentLang = 'es';
    let currentCategoryFilter = 'all';

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
                renderFlowTree();
                renderTextsGrid();
                renderMenuTable();
                renderFaqsList();
                updateLiveSimulator('welcomeMessage');
            }
        } catch (err) {
            console.error('Error cargando estructura del bot:', err);
        }
    }

    // 1. RENDERIZAR ÁRBOL DE FLUJOS (TAB 1)
    function renderFlowTree() {
        const container = document.getElementById('flow-tree-container');
        if (!container || !currentStructure) return;

        container.innerHTML = '';
        currentStructure.flowTree.forEach(node => {
            const nodeDiv = document.createElement('div');
            nodeDiv.className = 'flow-node';
            nodeDiv.innerHTML = `
                <div>
                    <div class="flow-node-title">${node.title}</div>
                    <div class="flow-node-desc">${node.description}</div>
                </div>
                <div class="flow-badge">Clave: ${node.messageKey || 'Sistema'}</div>
            `;
            nodeDiv.addEventListener('click', () => {
                // Cambiar a pestaña de textos y filtrar por la clave
                document.querySelector('[data-tab="tab-texts"]').click();
                if (node.messageKey) {
                    updateLiveSimulator(node.messageKey);
                }
            });
            container.appendChild(nodeDiv);
        });
    }

    // 2. RENDERIZAR GRID DE TEXTOS (TAB 2)
    function renderTextsGrid() {
        const container = document.getElementById('texts-list-container');
        if (!container || !currentStructure) return;

        const langTexts = currentStructure.staticTranslations[currentLang] || {};
        const dynamicLangTexts = (currentStructure.dynamicTexts && currentStructure.dynamicTexts[currentLang]) || {};

        container.innerHTML = '';
        
        Object.keys(langTexts).forEach(key => {
            const staticVal = langTexts[key];
            const currentVal = dynamicLangTexts[key] !== undefined ? dynamicLangTexts[key] : staticVal;

            const card = document.createElement('div');
            card.className = 'text-card';
            card.id = `text-card-${key}`;

            card.innerHTML = `
                <div class="text-card-header">
                    <span class="key-title">${key}</span>
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
                updateLiveSimulator(key, val);
            });

            textarea.addEventListener('focus', () => {
                updateLiveSimulator(key, textarea.value);
            });

            card.querySelector('.btn-save-text').addEventListener('click', () => {
                saveText(key, textarea.value);
            });

            container.appendChild(card);
        });
    }

    // BUSCADOR Y FILTROS DE TEXTO
    const searchInput = document.getElementById('search-text-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.text-card').forEach(card => {
                const key = card.id.replace('text-card-', '').toLowerCase();
                const txt = card.querySelector('textarea').value.toLowerCase();
                if (key.includes(query) || txt.includes(query)) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }

    // GUARDAR TEXTO EN SERVIDORES
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

    // MODAL AÑADIR DISH
    const addDishBtn = document.getElementById('add-dish-btn');
    const dishModal = document.getElementById('dish-modal');
    const closeDishModal = document.getElementById('close-dish-modal');
    const saveDishBtn = document.getElementById('save-dish-btn');

    if (addDishBtn) addDishBtn.addEventListener('click', () => dishModal.style.display = 'flex');
    if (closeDishModal) closeDishModal.addEventListener('click', () => dishModal.style.display = 'none');

    if (saveDishBtn) {
        saveDishBtn.addEventListener('click', () => {
            const cat = document.getElementById('dish-cat-input').value;
            const name = document.getElementById('dish-name-input').value;
            const price = parseFloat(document.getElementById('dish-price-input').value) || 0;
            const unit = document.getElementById('dish-unit-input').value || '€';

            if (!name) {
                alert('Por favor introduce el nombre del plato.');
                return;
            }

            currentStructure.menuItems.push({
                id: currentStructure.menuItems.length + 1,
                category: cat,
                name: name,
                price: price,
                currency: unit,
                sort_order: currentStructure.menuItems.length + 1
            });

            renderMenuTable();
            dishModal.style.display = 'none';
        });
    }

    // 4. RENDERIZAR PREGUNTAS FRECUENTES (TAB 4)
    function renderFaqsList() {
        const container = document.getElementById('faqs-list-container');
        if (!container || !currentStructure) return;

        const langTexts = currentStructure.staticTranslations[currentLang] || {};
        const dynamicLangTexts = (currentStructure.dynamicTexts && currentStructure.dynamicTexts[currentLang]) || {};

        container.innerHTML = '';

        for (let i = 1; i <= 10; i++) {
            const titleKey = i === 1 ? 'faq12Title' : (i === 2 ? 'faq1Title' : (i === 3 ? 'faq2Title' : `faq${i-1}Title`));
            const msgKey = i === 1 ? 'faq12Msg' : (i === 2 ? 'faq1Msg' : (i === 3 ? 'faq2Msg' : `faq${i-1}Msg`));

            const titleVal = dynamicLangTexts[titleKey] || langTexts[titleKey] || `Opción ${i}`;
            const msgVal = dynamicLangTexts[msgKey] || langTexts[msgKey] || '';

            const card = document.createElement('div');
            card.className = 'text-card';
            card.innerHTML = `
                <div class="text-card-header">
                    <span class="key-title">FAQ ${i}: ${titleVal}</span>
                </div>
                <label style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;">Título de opción:</label>
                <input type="text" value="${titleVal}" class="faq-title-input" style="margin-bottom:12px;">
                <label style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;">Mensaje de respuesta:</label>
                <textarea class="faq-msg-input" style="height:100px;">${msgVal}</textarea>
                <div class="text-card-footer" style="margin-top:10px;">
                    <button class="btn-primary btn-save-faq" data-title-key="${titleKey}" data-msg-key="${msgKey}">💾 Guardar FAQ ${i}</button>
                </div>
            `;

            card.querySelector('.btn-save-faq').addEventListener('click', async () => {
                const newTitle = card.querySelector('.faq-title-input').value;
                const newMsg = card.querySelector('.faq-msg-input').value;

                await saveText(titleKey, newTitle);
                await saveText(msgKey, newMsg);
            });

            container.appendChild(card);
        }
    }

    // 5. SIMULADOR EN TIEMPO REAL WHATSAPP
    function updateLiveSimulator(key, customText = null) {
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

        // Si la clave tiene botones o lista interactiva asociada
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
});
