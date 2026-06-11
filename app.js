/* ============================================================
   ТРЕКЕР ПИТАНИЯ — логика приложения
   Совместим с данными прошлых версий (localStorage v7).
   ============================================================ */

/* ===== ГЛОБАЛЬНОЕ СОСТОЯНИЕ ===== */
let appState = null;
const STORAGE_KEY = 'family_nutrition_tracker_v7';
let charts = { calories: null, macros: null };
let activeViewId = 'diary';
let currentDate = new Date().toISOString().split('T')[0];
let editContext = null;          // редактируемая запись дневника
let addMealType = 'breakfast';   // приём пищи в окне добавления
let pickedFood = null;           // выбранный в поиске продукт (панель порции)
let pendingQuickSlot = null;     // слот быстрых продуктов, ожидающий выбора
let weekStart = null;
let loadedMenuData = null;       // меню, загруженные из CSV (на время сессии)

const RING_CIRC = 2 * Math.PI * 52;

const mealTypes = [
    { id: 'breakfast', title: 'Завтрак', emoji: '🌅' },
    { id: 'lunch',     title: 'Обед',    emoji: '☀️' },
    { id: 'dinner',    title: 'Ужин',    emoji: '🌙' },
    { id: 'snack',     title: 'Перекус', emoji: '🍎' }
];
const mealTitle = id => {
    const m = mealTypes.find(x => x.id === id);
    return m ? `${m.emoji} ${m.title}` : id;
};

/* ===== УТИЛИТЫ ===== */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const utils = {
    z2: n => String(n).padStart(2, '0'),
    todayStr: (d = new Date()) => `${d.getFullYear()}-${utils.z2(d.getMonth() + 1)}-${utils.z2(d.getDate())}`,
    shiftDate: (ds, delta) => {
        const d = new Date(ds);
        d.setDate(d.getDate() + delta);
        return utils.todayStr(d);
    },
    mondayOf: (ds) => {
        const d = new Date(ds);
        const day = (d.getDay() + 6) % 7;
        d.setDate(d.getDate() - day);
        return utils.todayStr(d);
    },
    fmtNum: n => (Math.round((n || 0) * 10) / 10).toString().replace('.', ','),
    fmtDateHuman: (ds) => {
        const d = new Date(ds);
        return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
    },
    clamp01: x => Math.max(0, Math.min(1, x)),
    esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    showNotif: (text, isError = false) => {
        const wrap = $('#toasts');
        const div = document.createElement('div');
        div.className = 'notif' + (isError ? ' error' : '');
        div.textContent = text;
        wrap.appendChild(div);
        setTimeout(() => div.remove(), 2600);
    },
    download: (filename, content, mime = 'application/json') => {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    },
    parseCSV: (text) => {
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const values = [];
            let current = '';
            let inQuotes = false;
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                if (char === '"') inQuotes = !inQuotes;
                else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
                else current += char;
            }
            values.push(current.trim());
            if (values.length === headers.length) {
                const row = {};
                headers.forEach((h, idx) => { row[h] = values[idx]; });
                rows.push(row);
            }
        }
        return { headers, rows };
    }
};

/* ===== МОДАЛЬНЫЕ ОКНА ===== */
const modals = {
    open: id => $('#' + id).classList.add('active'),
    close: el => {
        const m = typeof el === 'string' ? $('#' + el) : el;
        if (!m) return;
        m.classList.remove('active');
        if (m.id === 'editMealModal' || m.id === 'fullEditModal') editContext = null;
        if (m.id === 'editQuickProductModal') quickProductsManager.editingSlotIndex = null;
    },
    setupGlobal: () => {
        document.addEventListener('click', (e) => {
            if (e.target.classList && e.target.classList.contains('modal')) modals.close(e.target);
            const closeBtn = e.target.closest('[data-close-modal]');
            if (closeBtn) modals.close(closeBtn.closest('.modal'));
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') $$('.modal.active').forEach(m => modals.close(m));
        });
    }
};

/* ===== ХРАНИЛИЩЕ ===== */
const storage = {
    saveTimer: null,
    loadState: () => {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            appState = JSON.parse(JSON.stringify(defaultState));
            storage.saveState(true);
            return;
        }
        try {
            appState = JSON.parse(raw);
            storage.migrateIfNeeded();
        } catch (e) {
            console.warn('Storage corrupted', e);
            appState = JSON.parse(JSON.stringify(defaultState));
            storage.saveState(true);
        }
    },
    saveState: (immediate = false) => {
        const doSave = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
        if (immediate) { doSave(); return; }
        clearTimeout(storage.saveTimer);
        storage.saveTimer = setTimeout(doSave, 200);
    },
    migrateIfNeeded: () => {
        if (!appState.version) appState.version = 1;
        if (appState.version < 6) {
            appState.profiles.forEach(p => {
                if (!p.quickProducts) p.quickProducts = { breakfast: [], lunch: [], dinner: [], snack: [] };
                if (!p.goalsMicros) p.goalsMicros = { fiber: 25, sugar: 50, sodium: 2300 };
                if (!p.liquid) {
                    p.liquid = {
                        totalGoal: 2000,
                        items: [
                            { type: 'water', enabled: true, goal: 1500, consumed: 0, color: '#06b6d4' },
                            { type: 'coffee', enabled: false, goal: 300, consumed: 0, color: '#8B4513' },
                            { type: 'juice', enabled: false, goal: 200, consumed: 0, color: '#FFA500' },
                            { type: 'tea', enabled: false, goal: 300, consumed: 0, color: '#D2691E' }
                        ]
                    };
                }
            });
            if (!appState.settings) {
                appState.settings = {
                    modules: { water: false, recipes: false, micros: false, goalsCalc: false, weekPlanner: false, shopping: false },
                    theme: 'light'
                };
            }
            appState.userFoods = appState.userFoods || [];
            appState.recipes = appState.recipes || [];
            appState.favorites = appState.favorites || [];
            appState.weekPlan = appState.weekPlan || {};
            appState.currentMenu = appState.currentMenu || null;
            appState.shoppingHistory = appState.shoppingHistory || [];
            appState.version = 6;
        }
        if (appState.version < 7) {
            appState.profiles.forEach(p => {
                if (!p.goalsMicros) p.goalsMicros = { fiber: 25, sugar: 50, sodium: 2300 };
                if (!Array.isArray(p.allergies)) p.allergies = [];
            });
            appState.version = 7;
        }
        appState.shoppingHistory = appState.shoppingHistory || [];
    }
};

/* ===== ТЕМА ===== */
const themeManager = {
    systemDarkMql: window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null,
    resolveTheme: (mode) => {
        if (mode === 'system') return (themeManager.systemDarkMql && themeManager.systemDarkMql.matches) ? 'dark' : 'light';
        return mode === 'dark' ? 'dark' : 'light';
    },
    applyTheme: (mode) => {
        document.body.setAttribute('data-theme', themeManager.resolveTheme(mode));
        if (activeViewId === 'analytics') analyticsManager.renderAnalytics();
    },
    bindSystemThemeListener: () => {
        if (!themeManager.systemDarkMql) return;
        themeManager.systemDarkMql.onchange = () => {
            if ((appState?.settings?.theme || 'light') === 'system') themeManager.applyTheme('system');
        };
    }
};

/* ===== ПРОФИЛИ ===== */
const profileManager = {
    activeProfile: () => appState.profiles.find(p => p.id === appState.activeProfileId) || appState.profiles[0],
    buildUserSelector: () => {
        const box = $('#userSelector');
        box.innerHTML = '';
        appState.profiles.forEach(p => {
            const div = document.createElement('button');
            div.className = 'user-chip' + (p.id === appState.activeProfileId ? ' active' : '');
            div.textContent = `${p.emoji} ${p.name}`;
            div.addEventListener('click', () => {
                appState.activeProfileId = p.id;
                storage.saveState();
                profileManager.buildUserSelector();
                app.renderView(activeViewId);
            });
            box.appendChild(div);
        });
    }
};

/* ===== НАВИГАЦИЯ ===== */
const navManager = {
    allViews: () => {
        const v = [
            { id: 'diary', title: 'Дневник', icon: '📅' },
            { id: 'menu', title: 'Меню городов', icon: '🌍' },
            { id: 'products', title: 'Продукты', icon: '📚' }
        ];
        if (appState.settings.modules.recipes) v.push({ id: 'recipes', title: 'Рецепты', icon: '👨‍🍳' });
        if (appState.settings.modules.weekPlanner) v.push({ id: 'week', title: 'План недели', icon: '🗓' });
        v.push({ id: 'analytics', title: 'Аналитика', icon: '📊' });
        if (appState.settings.modules.shopping) v.push({ id: 'shopping', title: 'Покупки', icon: '🛒' });
        if (appState.settings.modules.water) v.push({ id: 'water', title: 'Вода', icon: '💧' });
        v.push({ id: 'settings', title: 'Настройки', icon: '⚙️' });
        return v;
    },
    build: () => {
        const views = navManager.allViews();
        ['#sideNav', '#mobileNav'].forEach(sel => {
            const box = $(sel);
            box.innerHTML = '';
            views.forEach(v => {
                const btn = document.createElement('button');
                btn.className = 'nav-item' + (v.id === activeViewId ? ' active' : '');
                btn.innerHTML = `<span class="nav-ico">${v.icon}</span><span>${v.title}</span>`;
                btn.addEventListener('click', () => navManager.switchView(v.id));
                box.appendChild(btn);
            });
        });
        const cur = views.find(v => v.id === activeViewId);
        $('#topbarTitle').textContent = cur ? cur.title : '';
    },
    switchView: (id) => {
        activeViewId = id;
        $$('.view').forEach(el => el.classList.remove('active'));
        const view = $('#view-' + id);
        if (view) view.classList.add('active');
        navManager.build();
        app.renderView(id);
        window.scrollTo({ top: 0 });
    }
};

/* ===== ДНЕВНИК: ДАННЫЕ ===== */
const diaryManager = {
    // Чтение без создания записи в хранилище
    readDay: (ds, pid) => {
        const d = appState.diary?.[ds]?.[pid];
        return d || { meals: { breakfast: [], lunch: [], dinner: [], snack: [] }, liquid: null };
    },
    // Создаёт запись при необходимости (для модификаций)
    dayObj: (ds, pid) => {
        appState.diary[ds] = appState.diary[ds] || {};
        if (!appState.diary[ds][pid]) {
            appState.diary[ds][pid] = { meals: { breakfast: [], lunch: [], dinner: [], snack: [] }, liquid: null };
        }
        return appState.diary[ds][pid];
    },

    itemHasAllergen: (item, profile) => {
        if (!profile || !Array.isArray(profile.allergies) || profile.allergies.length === 0) return false;
        const allergens = item.allergens || [];
        return Array.isArray(allergens) && allergens.some(a => profile.allergies.includes(a));
    },

    addMealItem: (pid, ds, mt, item) => {
        const profile = appState.profiles.find(p => p.id === pid);
        if (diaryManager.itemHasAllergen(item, profile)) {
            utils.showNotif('⚠️ Блюдо содержит ваши аллергены!', true);
        }
        const d = diaryManager.dayObj(ds, pid);
        d.meals[mt].push({
            ...item,
            fiber: item.fiber || 0,
            sugar: item.sugar || 0,
            sodium: item.sodium || 0,
            allergens: item.allergens || [],
            vitamins: item.vitamins || ''
        });
        storage.saveState();
        if (activeViewId === 'diary') diaryManager.renderDiary();
    },

    removeMealItem: (pid, ds, mt, idx) => {
        diaryManager.dayObj(ds, pid).meals[mt].splice(idx, 1);
        storage.saveState();
        diaryManager.renderDiary();
    },

    updateMealItem: (pid, ds, mt, idx, newItem) => {
        diaryManager.dayObj(ds, pid).meals[mt][idx] = newItem;
        storage.saveState();
        diaryManager.renderDiary();
    },

    totalsForDay: (pid, ds) => {
        const d = diaryManager.readDay(ds, pid);
        const all = [...d.meals.breakfast, ...d.meals.lunch, ...d.meals.dinner, ...d.meals.snack];
        const sum = key => all.reduce((a, x) => a + (x[key] || 0), 0);
        return { cal: sum('cal'), pr: sum('pr'), fat: sum('fat'), carb: sum('carb'), fiber: sum('fiber'), sugar: sum('sugar'), sodium: sum('sodium') };
    },

    toggleFavorite: (itemName) => {
        const idx = appState.favorites.indexOf(itemName);
        if (idx === -1) appState.favorites.push(itemName);
        else appState.favorites.splice(idx, 1);
        storage.saveState();
    },

    /* ===== ДНЕВНИК: ОТРИСОВКА ===== */
    renderDiary: () => {
        diaryManager.renderDateBar();
        diaryManager.renderSummary();
        diaryManager.renderMeals();
        diaryManager.renderWaterMini();
    },

    renderDateBar: () => {
        const t = utils.todayStr();
        let lbl = utils.fmtDateHuman(currentDate);
        if (currentDate === t) lbl = 'Сегодня, ' + lbl;
        else if (currentDate === utils.shiftDate(t, -1)) lbl = 'Вчера, ' + lbl;
        else if (currentDate === utils.shiftDate(t, 1)) lbl = 'Завтра, ' + lbl;
        $('#currentDateLbl').textContent = lbl;
        $('#datePicker').value = currentDate;
        $('#todayBtn').style.visibility = currentDate === t ? 'hidden' : 'visible';
    },

    renderSummary: () => {
        const p = profileManager.activeProfile();
        const totals = diaryManager.totalsForDay(p.id, currentDate);
        const g = p.goals;

        // Кольцо калорий
        const remaining = Math.round(g.cal - totals.cal);
        const pct = g.cal > 0 ? utils.clamp01(totals.cal / g.cal) : 0;
        const ring = $('#calRingFill');
        ring.style.strokeDashoffset = RING_CIRC * (1 - pct);
        ring.classList.toggle('over', remaining < 0);
        const remEl = $('#calRemaining');
        remEl.textContent = Math.abs(remaining);
        remEl.classList.toggle('over', remaining < 0);
        $('#calRemainingLbl').textContent = remaining < 0 ? 'ккал сверх цели' : 'осталось ккал';
        $('#calEaten').textContent = Math.round(totals.cal);
        $('#calGoal').textContent = Math.round(g.cal);

        // Полосы БЖУ
        const bars = [
            { key: 'pr', label: 'Белки', cls: 'protein' },
            { key: 'fat', label: 'Жиры', cls: 'fat' },
            { key: 'carb', label: 'Углеводы', cls: 'carb' }
        ];
        $('#macroBars').innerHTML = bars.map(b => {
            const val = totals[b.key] || 0;
            const goal = g[b.key] || 0;
            const w = goal > 0 ? Math.round(utils.clamp01(val / goal) * 100) : 0;
            const over = goal > 0 && val > goal;
            const rest = Math.round(goal - val);
            return `
                <div class="macro-bar-group">
                    <div class="macro-label">
                        <span>${b.label}</span>
                        <span class="macro-rest">${utils.fmtNum(val)} / ${goal} г${over ? '' : ` · ост. ${rest} г`}</span>
                    </div>
                    <div class="progress-track"><div class="progress-fill ${b.cls}${over ? ' over' : ''}" style="width:${w}%"></div></div>
                </div>`;
        }).join('');

        // Микронутриенты (если включён модуль)
        const microBox = $('#microSummary');
        if (appState.settings.modules.micros) {
            const gm = p.goalsMicros || { fiber: 25, sugar: 50, sodium: 2300 };
            microBox.innerHTML = [
                { label: 'Клетчатка', val: totals.fiber, goal: gm.fiber, unit: 'г' },
                { label: 'Сахар', val: totals.sugar, goal: gm.sugar, unit: 'г' },
                { label: 'Натрий', val: totals.sodium, goal: gm.sodium, unit: 'мг' }
            ].map(r => `<div class="micro-summary-row"><span>${r.label}</span><span>${utils.fmtNum(r.val)} / ${r.goal} ${r.unit}</span></div>`).join('');
        } else {
            microBox.innerHTML = '';
        }
    },

    renderMeals: () => {
        const p = profileManager.activeProfile();
        const wrap = $('#mealsWrap');
        const d = diaryManager.readDay(currentDate, p.id);
        wrap.innerHTML = '';

        mealTypes.forEach(mt => {
            const arr = d.meals[mt.id] || [];
            const sub = arr.reduce((a, x) => a + (x.cal || 0), 0);
            const card = document.createElement('div');
            card.className = 'card meal-card';

            let itemsHtml;
            if (arr.length === 0) {
                itemsHtml = `<div class="meal-empty">Пока пусто — нажмите «Добавить»</div>`;
            } else {
                itemsHtml = arr.map((item, idx) => {
                    const fav = appState.favorites.includes(item.name) ? '<span class="badge-fav">⭐</span>' : '';
                    const allerg = diaryManager.itemHasAllergen(item, p) ? '<span class="badge-allergen">аллерген</span>' : '';
                    const portion = item.portion ? `<span class="meal-portion">${Math.round(item.portion)} г</span>` : '';
                    return `
                        <div class="meal-entry" data-meal="${mt.id}" data-idx="${idx}">
                            <div class="meal-info">
                                <div class="meal-title">${item.emoji || '🍽️'} ${utils.esc(item.name)} ${portion} ${fav} ${allerg}</div>
                                <div class="meal-details">Б ${utils.fmtNum(item.pr)} · Ж ${utils.fmtNum(item.fat)} · У ${utils.fmtNum(item.carb)}</div>
                            </div>
                            <div class="meal-entry-kcal">${Math.round(item.cal || 0)} ккал</div>
                        </div>`;
                }).join('');
            }

            card.innerHTML = `
                <div class="meal-head">
                    <div class="meal-head-title"><span class="meal-emoji">${mt.emoji}</span>${mt.title}
                        <span class="meal-kcal">${arr.length ? Math.round(sub) + ' ккал' : ''}</span>
                    </div>
                    <button class="meal-add-btn" data-add-to="${mt.id}">+ Добавить</button>
                </div>
                <div class="list">${itemsHtml}</div>`;
            wrap.appendChild(card);
        });

        const totals = diaryManager.totalsForDay(p.id, currentDate);
        const totalRow = document.createElement('div');
        totalRow.className = 'day-total-row';
        totalRow.innerHTML = `<span>Итого за день</span>
            <span><b>${Math.round(totals.cal)} ккал</b> · Б ${utils.fmtNum(totals.pr)} · Ж ${utils.fmtNum(totals.fat)} · У ${utils.fmtNum(totals.carb)}</span>`;
        wrap.appendChild(totalRow);
    },

    renderWaterMini: () => {
        const card = $('#waterSummary');
        if (!appState.settings.modules.water) { card.hidden = true; return; }
        card.hidden = false;
        const p = profileManager.activeProfile();
        const items = liquidManager.liquidForDay(p.id, currentDate);
        let goal = 0, cons = 0;
        items.forEach(it => {
            const f = it.hydrationFactor || 1;
            if (it.enabled) { goal += (it.goal || 0) * f; cons += (it.consumed || 0) * f; }
        });
        $('#waterMiniLabel').textContent = `${Math.round(cons)} / ${Math.round(goal)} мл`;
        const pct = goal > 0 ? Math.min(100, Math.round(cons / goal * 100)) : 0;
        $('#waterMiniBar').style.width = pct + '%';
    },

    /* ===== РЕДАКТИРОВАНИЕ ЗАПИСИ ===== */
    openEditMeal: (pid, ds, mt, idx, item) => {
        editContext = { pid, ds, mt, idx, item };
        const content = $('#editMealContent');
        const currentPortion = Math.round(item.portion || 100);
        const isFavorite = appState.favorites.includes(item.name);

        content.innerHTML = `
            <div class="mb12"><b>${item.emoji || '🍽️'} ${utils.esc(item.name)}</b></div>
            <label>Порция (г)</label>
            <div class="row">
                <input type="range" id="portionSlider" min="10" max="500" step="5" value="${currentPortion}" style="flex:1">
                <input type="number" id="portionNum" value="${currentPortion}" min="1" style="width:90px">
            </div>
            <div class="muted small mt8" id="portionMacrosEdit"></div>
            <div class="divider"></div>
            <div class="row wrap">
                <button id="savePortionBtn">Сохранить</button>
                <button class="secondary" id="editFullBtn">Все поля</button>
                <button class="secondary" id="toggleFavBtn">${isFavorite ? '★ Из избранного' : '☆ В избранное'}</button>
                <button class="danger ghost" id="deleteItemBtn">Удалить</button>
            </div>`;

        const slider = $('#portionSlider');
        const num = $('#portionNum');
        const macros = $('#portionMacrosEdit');
        const basePortion = item.portion || 100;

        const updateDisplay = (val) => {
            const mult = val / basePortion;
            macros.textContent = `${Math.round((item.cal || 0) * mult)} ккал · Б ${utils.fmtNum((item.pr || 0) * mult)} · Ж ${utils.fmtNum((item.fat || 0) * mult)} · У ${utils.fmtNum((item.carb || 0) * mult)}`;
        };
        slider.addEventListener('input', () => { num.value = slider.value; updateDisplay(+slider.value); });
        num.addEventListener('input', () => { slider.value = num.value; updateDisplay(+num.value || basePortion); });
        updateDisplay(currentPortion);

        $('#savePortionBtn').addEventListener('click', () => {
            const newPortion = Math.max(1, parseInt(num.value) || basePortion);
            const mult = newPortion / basePortion;
            diaryManager.updateMealItem(pid, ds, mt, idx, {
                ...item,
                portion: newPortion,
                cal: (item.cal || 0) * mult,
                pr: (item.pr || 0) * mult,
                fat: (item.fat || 0) * mult,
                carb: (item.carb || 0) * mult,
                fiber: (item.fiber || 0) * mult,
                sugar: (item.sugar || 0) * mult,
                sodium: (item.sodium || 0) * mult
            });
            modals.close('editMealModal');
            utils.showNotif('Порция обновлена');
        });

        $('#editFullBtn').addEventListener('click', () => {
            $('#editMealModal').classList.remove('active');
            diaryManager.openFullEditModal({ pid, ds, mt, idx, item });
        });

        $('#deleteItemBtn').addEventListener('click', () => {
            if (confirm('Удалить это блюдо?')) {
                diaryManager.removeMealItem(pid, ds, mt, idx);
                modals.close('editMealModal');
                utils.showNotif('Блюдо удалено');
            }
        });

        $('#toggleFavBtn').addEventListener('click', () => {
            diaryManager.toggleFavorite(item.name);
            modals.close('editMealModal');
            diaryManager.renderDiary();
            utils.showNotif(isFavorite ? 'Убрано из избранного' : 'Добавлено в избранное');
        });

        modals.open('editMealModal');
    },

    openFullEditModal: (ctx) => {
        editContext = ctx;
        const { item } = ctx;
        $('#editName').value = item.name || '';
        $('#editPortion').value = Math.round(item.portion || 100);
        $('#editCal').value = Math.round(item.cal || 0);
        $('#editPr').value = Math.round((item.pr || 0) * 10) / 10;
        $('#editFat').value = Math.round((item.fat || 0) * 10) / 10;
        $('#editCarb').value = Math.round((item.carb || 0) * 10) / 10;
        $('#editFiber').value = Math.round((item.fiber || 0) * 10) / 10;
        $('#editSugar').value = Math.round((item.sugar || 0) * 10) / 10;
        $('#editSodium').value = Math.round(item.sodium || 0);
        modals.open('fullEditModal');
    },

    setupDiaryEvents: () => {
        $('#prevDayBtn').addEventListener('click', () => { currentDate = utils.shiftDate(currentDate, -1); diaryManager.renderDiary(); });
        $('#nextDayBtn').addEventListener('click', () => { currentDate = utils.shiftDate(currentDate, 1); diaryManager.renderDiary(); });
        $('#todayBtn').addEventListener('click', () => { currentDate = utils.todayStr(); diaryManager.renderDiary(); });
        $('#datePicker').addEventListener('change', (e) => {
            if (e.target.value) { currentDate = e.target.value; diaryManager.renderDiary(); }
        });

        // Делегирование кликов по приёмам пищи
        $('#mealsWrap').addEventListener('click', (e) => {
            const addBtn = e.target.closest('[data-add-to]');
            if (addBtn) { addModal.openFor(addBtn.dataset.addTo); return; }
            const entry = e.target.closest('.meal-entry');
            if (entry) {
                const p = profileManager.activeProfile();
                const mt = entry.dataset.meal;
                const idx = +entry.dataset.idx;
                const item = diaryManager.readDay(currentDate, p.id).meals[mt][idx];
                if (item) diaryManager.openEditMeal(p.id, currentDate, mt, idx, item);
            }
        });

        $('#saveFullEditBtn').addEventListener('click', () => {
            if (!editContext) return;
            const { pid, ds, mt, idx, item } = editContext;
            diaryManager.updateMealItem(pid, ds, mt, idx, {
                ...item,
                name: $('#editName').value.trim() || item.name,
                portion: parseFloat($('#editPortion').value) || 100,
                cal: parseFloat($('#editCal').value) || 0,
                pr: parseFloat($('#editPr').value) || 0,
                fat: parseFloat($('#editFat').value) || 0,
                carb: parseFloat($('#editCarb').value) || 0,
                fiber: parseFloat($('#editFiber').value) || 0,
                sugar: parseFloat($('#editSugar').value) || 0,
                sodium: parseFloat($('#editSodium').value) || 0
            });
            modals.close('fullEditModal');
            utils.showNotif('Изменения сохранены');
        });

        // Мини-виджет воды
        $('#waterQuickAdd').addEventListener('click', () => {
            liquidManager.addLiquid('water', 250);
            diaryManager.renderWaterMini();
        });
        $('#waterGoTo').addEventListener('click', () => navManager.switchView('water'));
    }
};

/* ===== ОКНО «ДОБАВИТЬ ЕДУ» ===== */
const addModal = {
    openFor: (meal) => {
        addMealType = meal || 'breakfast';
        pickedFood = null;
        $('#portionPanel').hidden = true;
        addModal.renderMealChips();
        addModal.switchTab('search');
        $('#foodSearchInput').value = '';
        addModal.renderSearch('');
        addModal.renderQuickGrid();
        addModal.renderRecent();
        modals.open('addModal');
        setTimeout(() => $('#foodSearchInput').focus(), 60);
    },

    renderMealChips: () => {
        const box = $('#addMealChips');
        box.innerHTML = '';
        mealTypes.forEach(mt => {
            const b = document.createElement('button');
            b.className = addMealType === mt.id ? 'active' : '';
            b.textContent = `${mt.emoji} ${mt.title}`;
            b.addEventListener('click', () => {
                addMealType = mt.id;
                addModal.renderMealChips();
                addModal.renderQuickGrid();
            });
            box.appendChild(b);
        });
    },

    switchTab: (tab) => {
        $$('#addTabs button').forEach(b => b.classList.toggle('active', b.dataset.addtab === tab));
        $$('.add-panel').forEach(p => p.classList.toggle('active', p.id === 'addPanel-' + tab));
        $('#portionPanel').hidden = true;
        pickedFood = null;
    },

    allSearchables: () => {
        const map = new Map();
        [...foodDatabase, ...(appState.userFoods || [])].forEach(x => { if (!map.has(x.name)) map.set(x.name, x); });
        return [...map.values()];
    },

    resultRow: (x) => {
        const isFav = appState.favorites.includes(x.name);
        return `
            <div class="search-item" data-name="${utils.esc(x.name)}">
                <div class="search-item-main">
                    <div class="search-item-name">${x.emoji || '🍽️'} ${utils.esc(x.name)}</div>
                    <div class="search-item-details">${Math.round(x.cal)} ккал · Б ${utils.fmtNum(x.pr)} · Ж ${utils.fmtNum(x.fat)} · У ${utils.fmtNum(x.carb)} (на 100 г)</div>
                </div>
                <button class="fav-toggle${isFav ? ' on' : ''}" data-fav="${utils.esc(x.name)}" title="В избранное">${isFav ? '★' : '☆'}</button>
            </div>`;
    },

    renderSearch: (query) => {
        const box = $('#foodSearchResults');
        const q = (query || '').trim().toLowerCase();
        const all = addModal.allSearchables();

        if (q.length >= 2) {
            const items = all.filter(x => x.name.toLowerCase().includes(q)).slice(0, 30);
            box.innerHTML = items.length
                ? items.map(addModal.resultRow).join('')
                : '<div class="empty-state">Ничего не нашлось. Добавьте через «Вручную» — продукт можно сохранить в свои.</div>';
            return;
        }

        // Пустой запрос — обзор: избранное, свои продукты, категории
        let html = '';
        const favs = all.filter(x => appState.favorites.includes(x.name));
        if (favs.length) html += `<div class="add-group-title">⭐ Избранное</div>` + favs.map(addModal.resultRow).join('');
        const mine = (appState.userFoods || []);
        if (mine.length) html += `<div class="add-group-title">📚 Мои продукты</div>` + mine.map(addModal.resultRow).join('');
        Object.entries(foodCategories).forEach(([cat, names]) => {
            const items = names.map(n => all.find(x => x.name === n)).filter(Boolean);
            if (items.length) html += `<div class="add-group-title">${cat}</div>` + items.map(addModal.resultRow).join('');
        });
        box.innerHTML = html || '<div class="empty-state">База продуктов пуста</div>';
    },

    pickFood: (food) => {
        pickedFood = food;
        const base = Math.round(food.portion || 100);
        $('#portionFoodName').textContent = `${food.emoji || '🍽️'} ${food.name}`;
        $('#portionGrams').value = base;
        $('#portionSliderAdd').value = Math.min(500, base);
        addModal.updatePortionMacros();
        $('#portionPanel').hidden = false;
        $('#portionPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },

    updatePortionMacros: () => {
        if (!pickedFood) return;
        const grams = Math.max(1, parseInt($('#portionGrams').value) || 100);
        const base = pickedFood.portion || 100;
        const m = grams / base;
        $('#portionMacros').textContent =
            `${Math.round((pickedFood.cal || 0) * m)} ккал · Б ${utils.fmtNum((pickedFood.pr || 0) * m)} · Ж ${utils.fmtNum((pickedFood.fat || 0) * m)} · У ${utils.fmtNum((pickedFood.carb || 0) * m)}`;
    },

    addPicked: () => {
        if (!pickedFood) return;
        const grams = Math.max(1, parseInt($('#portionGrams').value) || 100);
        const base = pickedFood.portion || 100;
        const m = grams / base;
        const item = {
            name: pickedFood.name,
            emoji: pickedFood.emoji || '🍽️',
            portion: grams,
            cal: (pickedFood.cal || 0) * m,
            pr: (pickedFood.pr || 0) * m,
            fat: (pickedFood.fat || 0) * m,
            carb: (pickedFood.carb || 0) * m,
            fiber: (pickedFood.fiber || 0) * m,
            sugar: (pickedFood.sugar || 0) * m,
            sodium: (pickedFood.sodium || 0) * m,
            allergens: pickedFood.allergens || [],
            vitamins: pickedFood.vitamins || ''
        };
        diaryManager.addMealItem(profileManager.activeProfile().id, currentDate, addMealType, item);
        utils.showNotif(`Добавлено в «${mealTitle(addMealType)}»`);
        $('#portionPanel').hidden = true;
        pickedFood = null;
        $('#foodSearchInput').value = '';
        addModal.renderSearch('');
        addModal.renderRecent();
    },

    renderQuickGrid: () => {
        const grid = $('#quickAddGrid');
        const p = profileManager.activeProfile();
        const items = (p.quickProducts[addMealType] || []).filter(Boolean);
        grid.innerHTML = '';
        if (items.length === 0) {
            grid.innerHTML = '<div class="empty-state">Для этого приёма пищи быстрые продукты не настроены.<br>Раздел «Продукты» → «Быстрые продукты»</div>';
            return;
        }
        items.forEach(item => {
            const btn = document.createElement('div');
            btn.className = 'quick-add-btn';
            btn.innerHTML = `
                <div class="quick-add-icon">${item.emoji || '🍽️'}</div>
                <div class="quick-add-name">${utils.esc(item.name)}</div>
                <div class="quick-add-kcal">${Math.round(item.cal)} ккал · ${Math.round(item.portion || 100)} г</div>`;
            btn.addEventListener('click', () => {
                diaryManager.addMealItem(p.id, currentDate, addMealType, { ...item });
                utils.showNotif(`Добавлено в «${mealTitle(addMealType)}»`);
            });
            grid.appendChild(btn);
        });
    },

    computeRecents: () => {
        const p = profileManager.activeProfile();
        const seen = new Map();
        for (let i = 0; i < 60 && seen.size < 24; i++) {
            const ds = utils.shiftDate(currentDate, -i);
            const d = appState.diary?.[ds]?.[p.id];
            if (!d) continue;
            [...(d.meals.snack || []), ...(d.meals.dinner || []), ...(d.meals.lunch || []), ...(d.meals.breakfast || [])]
                .forEach(it => { if (it && it.name && !seen.has(it.name)) seen.set(it.name, it); });
        }
        return [...seen.values()];
    },

    renderRecent: () => {
        const box = $('#recentList');
        const items = addModal.computeRecents();
        if (items.length === 0) {
            box.innerHTML = '<div class="empty-state">Здесь появятся блюда, которые вы недавно добавляли</div>';
            return;
        }
        box.innerHTML = items.map(x => `
            <div class="search-item" data-recent="${utils.esc(x.name)}">
                <div class="search-item-main">
                    <div class="search-item-name">${x.emoji || '🍽️'} ${utils.esc(x.name)}</div>
                    <div class="search-item-details">${Math.round(x.cal)} ккал · ${Math.round(x.portion || 100)} г · Б ${utils.fmtNum(x.pr)} · Ж ${utils.fmtNum(x.fat)} · У ${utils.fmtNum(x.carb)}</div>
                </div>
                <span class="muted small">добавить</span>
            </div>`).join('');
    },

    setupEvents: () => {
        $('#addTabs').addEventListener('click', (e) => {
            const b = e.target.closest('button[data-addtab]');
            if (b) addModal.switchTab(b.dataset.addtab);
        });

        $('#foodSearchInput').addEventListener('input', (e) => addModal.renderSearch(e.target.value));

        $('#foodSearchResults').addEventListener('click', (e) => {
            const favBtn = e.target.closest('[data-fav]');
            if (favBtn) {
                diaryManager.toggleFavorite(favBtn.dataset.fav);
                addModal.renderSearch($('#foodSearchInput').value);
                return;
            }
            const row = e.target.closest('.search-item');
            if (row) {
                const food = addModal.allSearchables().find(x => x.name === row.dataset.name);
                if (food) addModal.pickFood(food);
            }
        });

        $('#recentList').addEventListener('click', (e) => {
            const row = e.target.closest('[data-recent]');
            if (!row) return;
            const item = addModal.computeRecents().find(x => x.name === row.dataset.recent);
            if (item) {
                diaryManager.addMealItem(profileManager.activeProfile().id, currentDate, addMealType, { ...item });
                utils.showNotif(`Добавлено в «${mealTitle(addMealType)}»`);
            }
        });

        // Панель порции
        $('#portionGrams').addEventListener('input', () => {
            $('#portionSliderAdd').value = Math.min(500, parseInt($('#portionGrams').value) || 100);
            addModal.updatePortionMacros();
        });
        $('#portionSliderAdd').addEventListener('input', () => {
            $('#portionGrams').value = $('#portionSliderAdd').value;
            addModal.updatePortionMacros();
        });
        $('#portionPanel').addEventListener('click', (e) => {
            const chip = e.target.closest('[data-portion]');
            if (chip) {
                $('#portionGrams').value = chip.dataset.portion;
                $('#portionSliderAdd').value = chip.dataset.portion;
                addModal.updatePortionMacros();
            }
        });
        $('#portionAddBtn').addEventListener('click', addModal.addPicked);
        $('#portionCancelBtn').addEventListener('click', () => { $('#portionPanel').hidden = true; pickedFood = null; });

        // Ручной ввод
        $('#addCustomBtn').addEventListener('click', () => {
            const item = addModal.readManualForm();
            if (!item) return;
            diaryManager.addMealItem(profileManager.activeProfile().id, currentDate, addMealType, item);
            utils.showNotif(`Добавлено в «${mealTitle(addMealType)}»`);
        });

        $('#saveAsMyProductBtn').addEventListener('click', () => {
            const item = addModal.readManualForm();
            if (!item) return;
            if ((appState.userFoods || []).find(x => x.name.toLowerCase() === item.name.toLowerCase())) {
                utils.showNotif('Такой продукт уже есть в ваших', true);
                return;
            }
            const { portion, ...product } = item;
            appState.userFoods.push(product);
            storage.saveState();
            utils.showNotif('Сохранено в мои продукты');
            if (activeViewId === 'products') myProductsManager.render();
        });
    },

    readManualForm: () => {
        const name = $('#customName').value.trim();
        if (!name) { utils.showNotif('Введите название', true); return null; }
        return {
            name,
            portion: +$('#customPortion').value || 100,
            cal: +$('#customCal').value || 0,
            pr: +$('#customPr').value || 0,
            fat: +$('#customFat').value || 0,
            carb: +$('#customCarb').value || 0,
            fiber: +$('#customFiber').value || 0,
            sugar: +$('#customSugar').value || 0,
            sodium: +$('#customSodium').value || 0,
            emoji: '🍽️'
        };
    }
};

/* ===== МЕНЮ ПО ГОРОДАМ ===== */
const cityMenuManager = {
    currentCity: 'Санкт-Петербург',
    currentDay: 1,

    allMenus: () => {
        const merged = {};
        Object.keys(cityMenus || {}).forEach(c => { merged[c] = cityMenus[c]; });
        Object.keys(loadedMenuData || {}).forEach(c => { merged[c] = loadedMenuData[c]; });
        return merged;
    },

    availableDays: (city) => {
        const menus = cityMenuManager.allMenus();
        const m = menus[city];
        if (!m) return [];
        return Object.keys(m).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
    },

    menuFor: (city, day) => {
        return (loadedMenuData && loadedMenuData[city]?.[day]) || (cityMenus && cityMenus[city]?.[day]) || null;
    },

    loadMenuFromCSV: (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const { rows } = utils.parseCSV(e.target.result);
                loadedMenuData = loadedMenuData || {};
                let added = 0;

                rows.forEach(row => {
                    const country = row['Страна'] || row['Country'];
                    const day = parseInt(row['День'] || row['Day']);
                    const mealType = row['Приём пищи'] || row['Meal'];
                    const dish = row['Блюдо'] || row['Dish'];
                    const cal = parseFloat(row['Калории (ккал)'] || row['Calories']) || 0;
                    const pr = parseFloat(row['Белки (г)'] || row['Protein']) || 0;
                    const fat = parseFloat(row['Жиры (г)'] || row['Fat']) || 0;
                    const carb = parseFloat(row['Углеводы (г)'] || row['Carbs']) || 0;
                    const vitamins = row['Ключевые витамины / нутриенты'] || '';
                    const allergensStr = row['Аллергены'] || row['Allergens'] || '';

                    if (!country || !day || !mealType || !dish) return;

                    if (!loadedMenuData[country]) loadedMenuData[country] = {};
                    if (!loadedMenuData[country][day]) loadedMenuData[country][day] = {};

                    let mealKey = 'breakfast';
                    const mtL = mealType.toLowerCase();
                    if (mtL.includes('обед') || mtL.includes('lunch')) mealKey = 'lunch';
                    else if (mtL.includes('ужин') || mtL.includes('dinner')) mealKey = 'dinner';
                    else if (mtL.includes('перекус') || mtL.includes('snack')) mealKey = 'snack';

                    // Микронутриенты: сначала из отдельных столбцов, затем из текста о витаминах
                    let fiber = parseFloat(row['клетчатка_г']) || 0;
                    let sugar = parseFloat(row['сахара_г']) || 0;
                    let sodium = parseFloat(row['натрий_мг']) || 0;
                    let additionalVitamins = [];
                    if (vitamins) {
                        if (!fiber) { const m = vitamins.match(/клетчатка[:\s]*(\d+\.?\d*)/i); if (m) fiber = parseFloat(m[1]); }
                        if (!sugar) { const m = vitamins.match(/сахар[:\s]*(\d+\.?\d*)/i); if (m) sugar = parseFloat(m[1]); }
                        if (!sodium) { const m = vitamins.match(/натрий[:\s]*(\d+\.?\d*)/i); if (m) sodium = parseFloat(m[1]); }
                        additionalVitamins = vitamins.split(',').map(v => v.trim())
                            .filter(v => v.length > 0 && !v.match(/клетчатка|сахар|натрий/i));
                    }
                    const allergens = allergensStr ? allergensStr.split(',').map(s => s.trim()).filter(Boolean) : [];
                    const emojiByMeal = { breakfast: '🥣', lunch: '🍲', dinner: '🍽️', snack: '🍎' };

                    loadedMenuData[country][day][mealKey] = {
                        name: dish, cal, pr, fat, carb, fiber, sugar, sodium,
                        vitamins: additionalVitamins.join(', '),
                        allergens,
                        emoji: emojiByMeal[mealKey]
                    };
                    added++;
                });

                if (!added) { utils.showNotif('В файле не нашлось блюд — проверьте формат CSV', true); return; }
                const cities = Object.keys(loadedMenuData);
                if (cities.length) cityMenuManager.currentCity = cities[cities.length - 1];
                cityMenuManager.currentDay = cityMenuManager.availableDays(cityMenuManager.currentCity)[0] || 1;
                cityMenuManager.renderAll();
                utils.showNotif(`Загружено блюд: ${added}`);
            } catch (err) {
                console.error('CSV parse error:', err);
                utils.showNotif('Ошибка загрузки CSV: ' + err.message, true);
            }
        };
        reader.readAsText(file, 'utf-8');
    },

    renderAll: () => {
        cityMenuManager.renderCityButtons();
        cityMenuManager.renderDayStrip();
        cityMenuManager.renderCityMenu();
    },

    renderCityButtons: () => {
        const container = $('#citiesButtons');
        container.innerHTML = '';
        const allCities = Object.keys(cityMenuManager.allMenus());
        if (!allCities.includes(cityMenuManager.currentCity)) cityMenuManager.currentCity = allCities[0];
        allCities.forEach(city => {
            const btn = document.createElement('button');
            btn.className = 'chip' + (city === cityMenuManager.currentCity ? ' active' : '');
            btn.textContent = city;
            btn.addEventListener('click', () => {
                cityMenuManager.currentCity = city;
                cityMenuManager.currentDay = cityMenuManager.availableDays(city)[0] || 1;
                cityMenuManager.renderAll();
            });
            container.appendChild(btn);
        });
    },

    renderDayStrip: () => {
        const container = $('#dayCalendar');
        container.innerHTML = '';
        const days = cityMenuManager.availableDays(cityMenuManager.currentCity);
        if (!days.includes(cityMenuManager.currentDay)) cityMenuManager.currentDay = days[0] || 1;
        days.forEach(i => {
            const btn = document.createElement('button');
            btn.className = 'day-btn' + (i === cityMenuManager.currentDay ? ' active' : '');
            btn.textContent = i;
            btn.addEventListener('click', () => {
                cityMenuManager.currentDay = i;
                cityMenuManager.renderDayStrip();
                cityMenuManager.renderCityMenu();
            });
            container.appendChild(btn);
        });
        if (!days.length) container.innerHTML = '<div class="muted small">Нет данных</div>';
    },

    renderCityMenu: () => {
        const city = cityMenuManager.currentCity;
        const day = cityMenuManager.currentDay;
        $('#cityMenuHeader').textContent = `${city} · день ${day}`;
        const display = $('#cityMenuDisplay');
        const totalsBox = $('#cityMenuTotals');
        const menu = cityMenuManager.menuFor(city, day);

        if (!menu) {
            display.innerHTML = '<div class="empty-state">Меню не найдено</div>';
            totalsBox.innerHTML = '';
            return;
        }

        const profile = profileManager.activeProfile();
        let html = '';
        const tot = { cal: 0, pr: 0, fat: 0, carb: 0 };
        mealTypes.forEach(meal => {
            const m = menu[meal.id];
            if (!m) return;
            tot.cal += m.cal || 0; tot.pr += m.pr || 0; tot.fat += m.fat || 0; tot.carb += m.carb || 0;
            const allergChips = (m.allergens || [])
                .map(a => `<span class="badge-allergen${profile.allergies?.includes(a) ? '' : ''}">${utils.esc(a)}</span>`).join(' ');
            html += `
                <div class="city-menu-meal">
                    <div class="city-menu-meal-title">${meal.emoji} ${meal.title}</div>
                    <div class="city-menu-meal-name">${utils.esc(m.name)}</div>
                    <div class="city-menu-meal-macros">${Math.round(m.cal)} ккал · Б ${utils.fmtNum(m.pr)} · Ж ${utils.fmtNum(m.fat)} · У ${utils.fmtNum(m.carb)}</div>
                    ${allergChips ? `<div class="menu-allergen-tags">${allergChips}</div>` : ''}
                    <button class="meal-add-btn" data-add-meal="${meal.id}">+ В дневник</button>
                </div>`;
        });
        display.innerHTML = html || '<div class="empty-state">Меню не найдено</div>';
        totalsBox.innerHTML = `<span>Итого за день:</span> <b>${Math.round(tot.cal)} ккал</b>
            <span>Б <b>${utils.fmtNum(tot.pr)}</b></span> <span>Ж <b>${utils.fmtNum(tot.fat)}</b></span> <span>У <b>${utils.fmtNum(tot.carb)}</b></span>`;
    },

    addMealToDiary: (mealKey) => {
        const menu = cityMenuManager.menuFor(cityMenuManager.currentCity, cityMenuManager.currentDay);
        if (!menu || !menu[mealKey]) { utils.showNotif('Блюдо не найдено', true); return; }
        diaryManager.addMealItem(profileManager.activeProfile().id, currentDate, mealKey, { ...menu[mealKey] });
        utils.showNotif(`«${mealTitle(mealKey)}» добавлен в дневник`);
    },

    addCityMenuToDiary: () => {
        const menu = cityMenuManager.menuFor(cityMenuManager.currentCity, cityMenuManager.currentDay);
        if (!menu) { utils.showNotif('Меню не найдено', true); return; }
        const p = profileManager.activeProfile();
        ['breakfast', 'lunch', 'dinner', 'snack'].forEach(mk => {
            if (menu[mk]) diaryManager.addMealItem(p.id, currentDate, mk, { ...menu[mk] });
        });
        utils.showNotif('Меню на день добавлено в дневник');
        navManager.switchView('diary');
    },

    setupEvents: () => {
        $('#addCityMenuToDiaryBtn').addEventListener('click', cityMenuManager.addCityMenuToDiary);
        $('#loadMenuCSVBtn').addEventListener('click', () => $('#menuCSVFileInput').click());
        $('#menuCSVFileInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) { cityMenuManager.loadMenuFromCSV(file); e.target.value = ''; }
        });
        $('#cityMenuDisplay').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-add-meal]');
            if (btn) cityMenuManager.addMealToDiary(btn.dataset.addMeal);
        });
    }
};

/* ===== МОИ ПРОДУКТЫ ===== */
const myProductsManager = {
    editingIndex: null,

    render: () => {
        const list = $('#myProductsList');
        const myProducts = appState.userFoods || [];
        if (myProducts.length === 0) {
            list.innerHTML = '<div class="empty-state">Пока нет своих продуктов. Создайте здесь или сохраните из окна добавления еды.</div>';
            return;
        }
        list.innerHTML = myProducts.map((product, index) => `
            <div class="my-product-item">
                <div class="my-product-icon">${product.emoji || '🍽️'}</div>
                <div class="my-product-info">
                    <div class="my-product-name">${utils.esc(product.name)}</div>
                    <div class="my-product-meta">${Math.round(product.cal)} ккал · Б ${utils.fmtNum(product.pr)} · Ж ${utils.fmtNum(product.fat)} · У ${utils.fmtNum(product.carb)} (на 100 г)</div>
                </div>
                <div class="my-product-actions">
                    <button class="mini-btn" data-edit-mp="${index}" title="Редактировать">✎</button>
                    <button class="mini-btn danger-text" data-del-mp="${index}" title="Удалить">🗑</button>
                </div>
            </div>`).join('');
    },

    openModal: (index = null) => {
        myProductsManager.editingIndex = index;
        const p = index !== null ? appState.userFoods[index] : null;
        $('#myProductModalTitle').textContent = p ? 'Редактировать продукт' : 'Новый продукт';
        $('#mpName').value = p?.name || '';
        $('#mpEmoji').value = p?.emoji || '';
        $('#mpCal').value = p?.cal ?? 0;
        $('#mpPr').value = p?.pr ?? 0;
        $('#mpFat').value = p?.fat ?? 0;
        $('#mpCarb').value = p?.carb ?? 0;
        $('#mpFiber').value = p?.fiber ?? 0;
        $('#mpSugar').value = p?.sugar ?? 0;
        $('#mpSodium').value = p?.sodium ?? 0;
        modals.open('myProductModal');
    },

    save: () => {
        const name = $('#mpName').value.trim();
        if (!name) { utils.showNotif('Введите название', true); return; }
        const idx = myProductsManager.editingIndex;
        const existing = (appState.userFoods || []).findIndex(x => x.name.toLowerCase() === name.toLowerCase());
        if (existing !== -1 && existing !== idx) { utils.showNotif('Такой продукт уже есть', true); return; }
        const obj = {
            name,
            emoji: $('#mpEmoji').value.trim() || '🍽️',
            cal: +$('#mpCal').value || 0,
            pr: +$('#mpPr').value || 0,
            fat: +$('#mpFat').value || 0,
            carb: +$('#mpCarb').value || 0,
            fiber: +$('#mpFiber').value || 0,
            sugar: +$('#mpSugar').value || 0,
            sodium: +$('#mpSodium').value || 0
        };
        if (idx !== null) appState.userFoods[idx] = { ...appState.userFoods[idx], ...obj };
        else appState.userFoods.push(obj);
        storage.saveState();
        modals.close('myProductModal');
        myProductsManager.render();
        quickProductsManager.renderFoodLibrary();
        utils.showNotif('Продукт сохранён');
    },

    setupEvents: () => {
        $('#newMyProductBtn').addEventListener('click', () => myProductsManager.openModal(null));
        $('#saveMyProductBtn').addEventListener('click', myProductsManager.save);
        $('#myProductsList').addEventListener('click', (e) => {
            const edit = e.target.closest('[data-edit-mp]');
            if (edit) { myProductsManager.openModal(+edit.dataset.editMp); return; }
            const del = e.target.closest('[data-del-mp]');
            if (del && confirm('Удалить этот продукт из библиотеки?')) {
                appState.userFoods.splice(+del.dataset.delMp, 1);
                storage.saveState();
                myProductsManager.render();
                quickProductsManager.renderFoodLibrary();
                utils.showNotif('Продукт удалён');
            }
        });
    }
};

/* ===== БЫСТРЫЕ ПРОДУКТЫ ===== */
const quickProductsManager = {
    currentMeal: 'breakfast',
    editingSlotIndex: null,

    selectedProfile: () => {
        const pid = $('#quickProfileSelect').value;
        return appState.profiles.find(p => p.id === pid);
    },

    fillProfileSelect: () => {
        const sel = $('#quickProfileSelect');
        const prev = sel.value;
        sel.innerHTML = '';
        appState.profiles.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.emoji} ${p.name}`;
            sel.appendChild(opt);
        });
        sel.value = (prev && appState.profiles.some(p => p.id === prev)) ? prev : profileManager.activeProfile().id;
    },

    renderSlots: () => {
        const profile = quickProductsManager.selectedProfile();
        if (!profile) return;
        const products = profile.quickProducts[quickProductsManager.currentMeal] || [];
        const grid = $('#quickSlotsGrid');
        grid.innerHTML = '';

        for (let i = 0; i < 8; i++) {
            const slot = document.createElement('div');
            slot.className = 'quick-slot';
            slot.dataset.slot = i;
            const item = products[i];
            if (item) {
                slot.classList.add('filled');
                slot.innerHTML = `
                    <div class="quick-slot-actions">
                        <button data-edit-slot="${i}" title="Редактировать">✎</button>
                        <button data-remove-slot="${i}" title="Убрать">×</button>
                    </div>
                    <div class="quick-slot-content">
                        <div class="quick-slot-emoji">${item.emoji || '🍽️'}</div>
                        <div class="quick-slot-name">${utils.esc(item.name)}</div>
                        <div class="quick-slot-macros">${Math.round(item.cal)} ккал</div>
                    </div>`;
            } else {
                slot.innerHTML = `<div class="quick-slot-placeholder">+ слот ${i + 1}</div>`;
            }

            slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('dragover'); });
            slot.addEventListener('dragleave', () => slot.classList.remove('dragover'));
            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                slot.classList.remove('dragover');
                try {
                    const foodData = JSON.parse(e.dataTransfer.getData('text/plain'));
                    quickProductsManager.addToSlot(i, foodData);
                } catch (err) { console.error('Drop error:', err); }
            });
            grid.appendChild(slot);
        }
    },

    addToSlot: (slotIndex, foodData) => {
        const profile = quickProductsManager.selectedProfile();
        if (!profile) return;
        if (!profile.quickProducts[quickProductsManager.currentMeal]) {
            profile.quickProducts[quickProductsManager.currentMeal] = [];
        }
        profile.quickProducts[quickProductsManager.currentMeal][slotIndex] = {
            name: foodData.name,
            emoji: foodData.emoji || '🍽️',
            portion: foodData.portion || 100,
            cal: foodData.cal || 0,
            pr: foodData.pr || 0,
            fat: foodData.fat || 0,
            carb: foodData.carb || 0,
            fiber: foodData.fiber || 0,
            sugar: foodData.sugar || 0,
            sodium: foodData.sodium || 0,
            allergens: Array.isArray(foodData.allergens) ? foodData.allergens : [],
            vitamins: foodData.vitamins || ''
        };
        storage.saveState();
        quickProductsManager.renderSlots();
        utils.showNotif('Продукт добавлен в быстрые');
    },

    addToFirstFreeSlot: (foodData) => {
        const profile = quickProductsManager.selectedProfile();
        if (!profile) return;
        const arr = profile.quickProducts[quickProductsManager.currentMeal] || [];
        let idx = pendingQuickSlot;
        if (idx === null || arr[idx]) {
            idx = 0;
            while (idx < 8 && arr[idx]) idx++;
        }
        if (idx >= 8) { utils.showNotif('Все 8 слотов заняты — освободите один', true); return; }
        pendingQuickSlot = null;
        quickProductsManager.addToSlot(idx, foodData);
    },

    removeFromSlot: (slotIndex) => {
        const profile = quickProductsManager.selectedProfile();
        if (!profile) return;
        const arr = profile.quickProducts[quickProductsManager.currentMeal] || [];
        arr[slotIndex] = null;
        profile.quickProducts[quickProductsManager.currentMeal] = arr.filter(x => x !== null && x !== undefined);
        storage.saveState();
        quickProductsManager.renderSlots();
        utils.showNotif('Продукт убран');
    },

    openEditModal: (slotIndex) => {
        const profile = quickProductsManager.selectedProfile();
        if (!profile) return;
        const item = (profile.quickProducts[quickProductsManager.currentMeal] || [])[slotIndex];
        if (!item) return;
        quickProductsManager.editingSlotIndex = slotIndex;
        $('#editQuickName').value = item.name || '';
        $('#editQuickPortion').value = item.portion || 100;
        $('#editQuickCal').value = item.cal || 0;
        $('#editQuickPr').value = item.pr || 0;
        $('#editQuickFat').value = item.fat || 0;
        $('#editQuickCarb').value = item.carb || 0;
        $('#editQuickFiber').value = item.fiber || 0;
        $('#editQuickSugar').value = item.sugar || 0;
        $('#editQuickSodium').value = item.sodium || 0;
        modals.open('editQuickProductModal');
    },

    saveEdited: () => {
        const profile = quickProductsManager.selectedProfile();
        const idx = quickProductsManager.editingSlotIndex;
        if (!profile || idx === null) return;
        const products = profile.quickProducts[quickProductsManager.currentMeal] || [];
        products[idx] = {
            ...products[idx],
            name: $('#editQuickName').value.trim() || products[idx].name,
            portion: parseFloat($('#editQuickPortion').value) || 100,
            cal: parseFloat($('#editQuickCal').value) || 0,
            pr: parseFloat($('#editQuickPr').value) || 0,
            fat: parseFloat($('#editQuickFat').value) || 0,
            carb: parseFloat($('#editQuickCarb').value) || 0,
            fiber: parseFloat($('#editQuickFiber').value) || 0,
            sugar: parseFloat($('#editQuickSugar').value) || 0,
            sodium: parseFloat($('#editQuickSodium').value) || 0,
            allergens: Array.isArray(products[idx].allergens) ? products[idx].allergens : [],
            vitamins: products[idx].vitamins || ''
        };
        storage.saveState();
        quickProductsManager.renderSlots();
        modals.close('editQuickProductModal');
        utils.showNotif('Быстрый продукт обновлён');
    },

    clearMeal: () => {
        const profile = quickProductsManager.selectedProfile();
        if (!profile) return;
        if (!confirm('Очистить все быстрые продукты для этого приёма пищи?')) return;
        profile.quickProducts[quickProductsManager.currentMeal] = [];
        storage.saveState();
        quickProductsManager.renderSlots();
        utils.showNotif('Слоты очищены');
    },

    renderFoodLibrary: () => {
        const library = $('#quickFoodLibrary');
        const query = ($('#quickFoodSearch').value || '').toLowerCase();
        const allFoods = [...foodDatabase, ...(appState.userFoods || [])];
        const filtered = query.length >= 2 ? allFoods.filter(f => f.name.toLowerCase().includes(query)) : allFoods;
        library.innerHTML = '';
        filtered.forEach(food => {
            const item = document.createElement('div');
            item.className = 'food-item';
            item.draggable = true;
            item.innerHTML = `
                <div>${food.emoji || '🍽️'} ${utils.esc(food.name)}</div>
                <div class="row">
                    <span class="food-kcal">${Math.round(food.cal)} ккал</span>
                    <button class="mini-btn" title="В выбранный слот">+</button>
                </div>`;
            item.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', JSON.stringify(food)));
            item.querySelector('.mini-btn').addEventListener('click', () => quickProductsManager.addToFirstFreeSlot(food));
            library.appendChild(item);
        });
        if (!filtered.length) library.innerHTML = '<div class="empty-state">Ничего не нашлось</div>';
    },

    loadFromJSON: (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data || !data.quickProducts) throw new Error('Неверный формат файла');
                const profile = quickProductsManager.selectedProfile();
                if (!profile) return;
                if (confirm(`Заменить все быстрые продукты для «${profile.name}»?`)) {
                    const qp = data.quickProducts;
                    ['breakfast', 'lunch', 'dinner', 'snack'].forEach(meal => {
                        qp[meal] = (qp[meal] || []).map(it => ({
                            ...it,
                            fiber: it.fiber || 0,
                            sugar: it.sugar || 0,
                            sodium: it.sodium || 0,
                            allergens: Array.isArray(it.allergens) ? it.allergens : [],
                            vitamins: it.vitamins || ''
                        }));
                    });
                    profile.quickProducts = qp;
                    storage.saveState();
                    quickProductsManager.renderSlots();
                    utils.showNotif('Быстрые продукты импортированы');
                }
            } catch (err) {
                utils.showNotif('Ошибка импорта: ' + err.message, true);
            }
        };
        reader.readAsText(file, 'utf-8');
    },

    exportToJSON: () => {
        const profile = quickProductsManager.selectedProfile();
        if (!profile) return;
        utils.download(`quick_products_${profile.name}.json`,
            JSON.stringify({ profile: profile.name, quickProducts: profile.quickProducts }, null, 2));
        utils.showNotif('Быстрые продукты экспортированы');
    },

    setupEvents: () => {
        $('#quickProfileSelect').addEventListener('change', quickProductsManager.renderSlots);
        $('#quickFoodSearch').addEventListener('input', quickProductsManager.renderFoodLibrary);
        $('#clearQuickProductsBtn').addEventListener('click', quickProductsManager.clearMeal);
        $('#saveEditQuickBtn').addEventListener('click', quickProductsManager.saveEdited);
        $('#loadQuickProductsJSONBtn').addEventListener('click', () => $('#quickProductsJSONInput').click());
        $('#exportQuickProductsJSONBtn').addEventListener('click', quickProductsManager.exportToJSON);
        $('#quickProductsJSONInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) { quickProductsManager.loadFromJSON(file); e.target.value = ''; }
        });

        $('#quickMealTabs').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-meal]');
            if (!btn) return;
            $$('#quickMealTabs button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            quickProductsManager.currentMeal = btn.dataset.meal;
            pendingQuickSlot = null;
            quickProductsManager.renderSlots();
        });

        $('#quickSlotsGrid').addEventListener('click', (e) => {
            const editBtn = e.target.closest('[data-edit-slot]');
            if (editBtn) { quickProductsManager.openEditModal(+editBtn.dataset.editSlot); return; }
            const removeBtn = e.target.closest('[data-remove-slot]');
            if (removeBtn) { quickProductsManager.removeFromSlot(+removeBtn.dataset.removeSlot); return; }
            const slot = e.target.closest('.quick-slot');
            if (slot && !slot.classList.contains('filled')) {
                pendingQuickSlot = +slot.dataset.slot;
                $('#quickFoodSearch').focus();
                utils.showNotif(`Слот ${pendingQuickSlot + 1} выбран — нажмите «+» у продукта в библиотеке`);
            }
        });
    }
};

/* ===== АНАЛИТИКА ===== */
const analyticsManager = {
    last7Dates: () => {
        const arr = [];
        for (let i = 6; i >= 0; i--) arr.push(utils.shiftDate(currentDate, -i));
        return arr;
    },

    chartColors: () => {
        const dark = document.body.getAttribute('data-theme') === 'dark';
        return {
            grid: dark ? 'rgba(148,163,184,.15)' : 'rgba(100,116,139,.15)',
            text: dark ? '#8b9bb0' : '#64748b'
        };
    },

    renderCaloriesChart: () => {
        const ctx = $('#caloriesChart');
        const fb = $('#caloriesChartFallback');
        if (typeof Chart === 'undefined') { ctx.style.display = 'none'; fb.hidden = false; return; }
        ctx.style.display = ''; fb.hidden = true;

        const p = profileManager.activeProfile();
        const dates = analyticsManager.last7Dates();
        const vals = dates.map(ds => Math.round(diaryManager.totalsForDay(p.id, ds).cal));
        const labels = dates.map(ds => new Date(ds).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' }));
        const c = analyticsManager.chartColors();

        if (charts.calories) charts.calories.destroy();
        charts.calories = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Калории',
                        data: vals,
                        backgroundColor: 'rgba(37, 99, 235, .75)',
                        borderRadius: 6
                    },
                    {
                        label: 'Цель',
                        data: dates.map(() => p.goals.cal),
                        type: 'line',
                        borderColor: 'rgba(239, 68, 68, .7)',
                        borderDash: [6, 5],
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: c.grid }, ticks: { color: c.text } },
                    x: { grid: { display: false }, ticks: { color: c.text } }
                }
            }
        });
    },

    renderMacrosChart: () => {
        const ctx = $('#macrosChart');
        const fb = $('#macrosChartFallback');
        const legend = $('#macrosLegend');
        const t = diaryManager.totalsForDay(profileManager.activeProfile().id, currentDate);
        const data = [
            { label: 'Белки', grams: t.pr || 0, cal: (t.pr || 0) * 4, color: '#6366f1' },
            { label: 'Жиры', grams: t.fat || 0, cal: (t.fat || 0) * 9, color: '#f59e0b' },
            { label: 'Углеводы', grams: t.carb || 0, cal: (t.carb || 0) * 4, color: '#10b981' }
        ];
        const totalCal = data.reduce((a, x) => a + x.cal, 0);

        legend.innerHTML = data.map(d => {
            const pct = totalCal > 0 ? Math.round(d.cal / totalCal * 100) : 0;
            return `<span><i class="legend-dot" style="background:${d.color}"></i>${d.label}: <b>${utils.fmtNum(d.grams)} г</b> (${pct}%)</span>`;
        }).join('');

        if (typeof Chart === 'undefined') { ctx.style.display = 'none'; fb.hidden = false; fb.textContent = 'Для диаграммы нужен интернет при первом открытии.'; return; }
        ctx.style.display = ''; fb.hidden = true;

        if (charts.macros) charts.macros.destroy();
        charts.macros = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.map(d => d.label),
                datasets: [{ data: data.map(d => d.cal), backgroundColor: data.map(d => d.color), borderWidth: 0 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: { legend: { display: false } }
            }
        });
    },

    renderVitamins: () => {
        const card = $('#vitaminsCard');
        if (!appState.settings.modules.micros) { card.hidden = true; return; }
        card.hidden = false;
        const p = profileManager.activeProfile();
        const t = diaryManager.totalsForDay(p.id, currentDate);
        const g = p.goalsMicros || { fiber: 25, sugar: 50, sodium: 2300 };

        const rows = [
            { name: '🌾 Клетчатка', val: t.fiber || 0, goal: g.fiber || 25, unit: 'г', cls: 'carb' },
            { name: '🍬 Сахар', val: t.sugar || 0, goal: g.sugar || 50, unit: 'г', cls: 'fat' },
            { name: '🧂 Натрий', val: t.sodium || 0, goal: g.sodium || 2300, unit: 'мг', cls: 'protein' }
        ];
        $('#microsWrap').innerHTML = rows.map(r => {
            const pct = r.goal > 0 ? Math.round(utils.clamp01(r.val / r.goal) * 100) : 0;
            const over = r.val > r.goal;
            return `
                <div class="macro-bar-group">
                    <div class="macro-label"><span>${r.name}</span><span class="macro-rest">${utils.fmtNum(r.val)} / ${r.goal} ${r.unit}</span></div>
                    <div class="progress-track"><div class="progress-fill ${over ? 'over' : r.cls}" style="width:${pct}%"></div></div>
                </div>`;
        }).join('');

        const dayObj = diaryManager.readDay(currentDate, p.id);
        const allMeals = [...dayObj.meals.breakfast, ...dayObj.meals.lunch, ...dayObj.meals.dinner, ...dayObj.meals.snack];
        const vitaminsSet = new Set();
        allMeals.forEach(it => {
            if (it.vitamins) it.vitamins.split(',').map(v => v.trim()).filter(Boolean).forEach(v => vitaminsSet.add(v));
        });
        const listEl = $('#vitaminsList');
        const arr = [...vitaminsSet];
        listEl.innerHTML = arr.length
            ? arr.map(v => `<span class="pill">${utils.esc(v)}</span>`).join('')
            : '<div class="muted small">Нет данных — витамины берутся из загруженных CSV-меню</div>';
    },

    renderStats: () => {
        const box = $('#monthStats');
        const p = profileManager.activeProfile();
        const data = [];
        for (let i = 29; i >= 0; i--) {
            const date = utils.shiftDate(currentDate, -i);
            data.push({ date, ...diaryManager.totalsForDay(p.id, date) });
        }
        const filled = data.filter(d => d.cal > 0);
        const avg = key => filled.length ? filled.reduce((s, d) => s + (d[key] || 0), 0) / filled.length : 0;
        const goalDays = data.filter(d => {
            const pc = (d.cal / (p.goals.cal || 1)) * 100;
            return pc >= 80 && pc <= 120;
        }).length;
        const bestDay = filled.length
            ? filled.reduce((best, d) => Math.abs(d.cal - p.goals.cal) < Math.abs(best.cal - p.goals.cal) ? d : best)
            : null;

        box.innerHTML = `
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-label">Заполненных дней</div>
                    <div class="stat-value">${filled.length} / 30</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Средние калории</div>
                    <div class="stat-value">${Math.round(avg('cal'))}</div>
                    <div class="stat-sub">цель ${p.goals.cal} ккал</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Дней в цели (80–120%)</div>
                    <div class="stat-value">${goalDays} / 30</div>
                    <div class="stat-sub">${Math.round(goalDays / 30 * 100)}% успеха</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Лучший день</div>
                    <div class="stat-value">${bestDay ? new Date(bestDay.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—'}</div>
                    <div class="stat-sub">${bestDay ? Math.round(bestDay.cal) + ' ккал' : 'нет данных'}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Средний баланс БЖУ</div>
                    <div class="stat-value">${Math.round(avg('pr'))} / ${Math.round(avg('fat'))} / ${Math.round(avg('carb'))}</div>
                    <div class="stat-sub">белки / жиры / углеводы, г</div>
                </div>
            </div>`;
    },

    renderAchievements: () => {
        const box = $('#achievements');
        const p = profileManager.activeProfile();
        const achievements = [];

        let streak = 0;
        for (let i = 0; i < 30; i++) {
            if (diaryManager.totalsForDay(p.id, utils.shiftDate(currentDate, -i)).cal > 0) streak++;
            else break;
        }
        if (streak >= 7) achievements.push({ icon: '🔥', title: `Серия ${streak} дней!`, desc: 'Ведёте дневник без пропусков' });

        const liquid = diaryManager.readDay(currentDate, p.id).liquid;
        if (Array.isArray(liquid)) {
            const waterItem = liquid.find(x => (x.id || x.type) === 'water');
            if (waterItem && waterItem.consumed >= waterItem.goal) {
                achievements.push({ icon: '💧', title: 'Водный баланс', desc: 'Выпита дневная норма воды' });
            }
        }

        const totals = diaryManager.totalsForDay(p.id, currentDate);
        const within = (val, goal) => goal > 0 && (val / goal * 100) >= 90 && (val / goal * 100) <= 110;
        if (within(totals.pr, p.goals.pr) && within(totals.fat, p.goals.fat) && within(totals.carb, p.goals.carb)) {
            achievements.push({ icon: '⚖️', title: 'Идеальный баланс', desc: 'БЖУ в пределах целей (±10%)' });
        }

        const dayObj = diaryManager.readDay(currentDate, p.id);
        const uniqueProducts = new Set(
            [...dayObj.meals.breakfast, ...dayObj.meals.lunch, ...dayObj.meals.dinner, ...dayObj.meals.snack].map(m => m.name)
        ).size;
        if (uniqueProducts >= 10) {
            achievements.push({ icon: '🌈', title: 'Разнообразие', desc: `${uniqueProducts} разных блюд за день` });
        }

        box.innerHTML = achievements.length === 0
            ? '<div class="empty-state">Ведите дневник каждый день — достижения появятся здесь</div>'
            : achievements.map(a => `
                <div class="achievement-card">
                    <div class="achievement-icon">${a.icon}</div>
                    <div>
                        <div class="achievement-title">${a.title}</div>
                        <div class="achievement-desc">${a.desc}</div>
                    </div>
                </div>`).join('');
    },

    renderAnalytics: () => {
        analyticsManager.renderCaloriesChart();
        analyticsManager.renderMacrosChart();
        analyticsManager.renderVitamins();
        analyticsManager.renderStats();
        analyticsManager.renderAchievements();
    }
};

/* ===== ПОКУПКИ ===== */
const shoppingManager = {
    items: [], // [{name, cnt, checked}]

    collectFromDiary: (days) => {
        const pid = profileManager.activeProfile().id;
        const map = new Map();
        for (let i = 0; i < days; i++) {
            const d = diaryManager.readDay(utils.shiftDate(currentDate, i), pid);
            [...d.meals.breakfast, ...d.meals.lunch, ...d.meals.dinner, ...d.meals.snack].forEach(x => {
                x.name.split(/[,+;]/).map(s => s.trim()).filter(Boolean)
                    .forEach(part => map.set(part, (map.get(part) || 0) + 1));
            });
        }
        return map;
    },

    collectFromMenu: (menuDays, map) => {
        const city = cityMenuManager.currentCity;
        const days = cityMenuManager.availableDays(city);
        if (!days.length) return map;
        for (let i = 0; i < menuDays; i++) {
            const menu = cityMenuManager.menuFor(city, days[i % days.length]);
            if (!menu) continue;
            Object.values(menu).forEach(meal => {
                if (!meal || !meal.name) return;
                meal.name.split(/[,+;]/).map(s => s.trim()).filter(Boolean)
                    .forEach(part => map.set(part, (map.get(part) || 0) + 1));
            });
        }
        return map;
    },

    generate: (smart = false) => {
        const days = +$('#shoppingDays').value || 1;
        const menuDays = +$('#shoppingMenuDays').value || 0;
        let map = shoppingManager.collectFromDiary(days);
        if (menuDays > 0) map = shoppingManager.collectFromMenu(menuDays, map);

        let entries = [...map.entries()];
        if (smart) entries = shoppingManager.smartCombine(entries);
        entries.sort((a, b) => b[1] - a[1]);
        shoppingManager.items = entries.map(([name, cnt]) => ({ name, cnt, checked: false }));

        // история для блока «часто покупаемое»
        const hist = new Map((appState.shoppingHistory || []).map(h => [h.name, h.cnt]));
        entries.forEach(([name, cnt]) => hist.set(name, (hist.get(name) || 0) + cnt));
        appState.shoppingHistory = [...hist.entries()].map(([name, cnt]) => ({ name, cnt }))
            .sort((a, b) => b.cnt - a.cnt).slice(0, 50);
        storage.saveState();

        shoppingManager.renderList();
        shoppingManager.renderFrequent();
        if (!shoppingManager.items.length) utils.showNotif('В дневнике и меню нет блюд для списка', true);
        else utils.showNotif(smart ? 'Умный список сформирован' : 'Список сформирован');
    },

    smartCombine: (items) => {
        const combined = new Map();
        items.forEach(([name, cnt]) => {
            let found = false;
            for (const [existing] of combined) {
                if (name.toLowerCase().includes(existing.toLowerCase()) ||
                    existing.toLowerCase().includes(name.toLowerCase())) {
                    combined.set(existing, combined.get(existing) + cnt);
                    found = true;
                    break;
                }
            }
            if (!found) combined.set(name, cnt);
        });
        return [...combined.entries()];
    },

    renderList: () => {
        const box = $('#shoppingListBox');
        if (!shoppingManager.items.length) {
            box.innerHTML = '<div class="empty-state">Список пуст — нажмите «Сформировать»</div>';
            shoppingManager.renderCategories();
            return;
        }
        box.innerHTML = shoppingManager.items.map((it, i) => `
            <label class="shopping-item${it.checked ? ' checked' : ''}">
                <input type="checkbox" data-ship="${i}" ${it.checked ? 'checked' : ''}>
                <span class="ship-name">${utils.esc(it.name)}</span>
                <span class="ship-count">×${it.cnt}</span>
            </label>`).join('');
        shoppingManager.renderCategories();
    },

    renderCategories: () => {
        const box = $('#shoppingCategories');
        if (!shoppingManager.items.length) {
            box.innerHTML = '<div class="empty-state">Список будет сгруппирован по категориям</div>';
            return;
        }
        const categorized = {};
        shoppingManager.items.forEach(it => {
            let category = 'Прочее';
            for (const [cat, foods] of Object.entries(foodCategories)) {
                if (foods.some(f => it.name.toLowerCase().includes(f.toLowerCase()))) { category = cat; break; }
            }
            (categorized[category] = categorized[category] || []).push(it);
        });
        box.innerHTML = Object.keys(categorized).sort().map(cat => `
            <div>
                <div class="shop-cat-title">${cat}</div>
                ${categorized[cat].map(it => `<div class="shop-cat-item">• ${utils.esc(it.name)} (${it.cnt})</div>`).join('')}
            </div>`).join('');
    },

    renderFrequent: () => {
        const box = $('#frequentItems');
        const hist = (appState.shoppingHistory || []).slice(0, 12);
        if (!hist.length) {
            box.innerHTML = '<div class="muted small">Появится после первых списков</div>';
            return;
        }
        box.innerHTML = '';
        hist.forEach(h => {
            const chip = document.createElement('button');
            chip.className = 'chip';
            chip.textContent = h.name;
            chip.title = 'Добавить в список';
            chip.addEventListener('click', () => {
                const ex = shoppingManager.items.find(i => i.name === h.name);
                if (ex) ex.cnt++;
                else shoppingManager.items.push({ name: h.name, cnt: 1, checked: false });
                shoppingManager.renderList();
            });
            box.appendChild(chip);
        });
    },

    setupEvents: () => {
        $('#genShoppingBtn').addEventListener('click', () => shoppingManager.generate(false));
        $('#smartShoppingBtn').addEventListener('click', () => shoppingManager.generate(true));

        $('#shoppingListBox').addEventListener('change', (e) => {
            const cb = e.target.closest('[data-ship]');
            if (!cb) return;
            shoppingManager.items[+cb.dataset.ship].checked = cb.checked;
            cb.closest('.shopping-item').classList.toggle('checked', cb.checked);
        });

        $('#checkAllBtn').addEventListener('click', () => {
            shoppingManager.items.forEach(i => i.checked = true);
            shoppingManager.renderList();
        });
        $('#uncheckAllBtn').addEventListener('click', () => {
            shoppingManager.items.forEach(i => i.checked = false);
            shoppingManager.renderList();
        });
        $('#clearCheckedBtn').addEventListener('click', () => {
            shoppingManager.items = shoppingManager.items.filter(i => !i.checked);
            shoppingManager.renderList();
            utils.showNotif('Отмеченные позиции удалены');
        });

        $('#exportShoppingBtn').addEventListener('click', () => {
            if (!shoppingManager.items.length) { utils.showNotif('Сначала сформируйте список', true); return; }
            const text = shoppingManager.items.map(i => `- ${i.name} ×${i.cnt}`).join('\n');
            utils.download(`shopping_${currentDate}.txt`, text, 'text/plain');
        });

        $('#printShoppingBtn').addEventListener('click', () => {
            if (!shoppingManager.items.length) { utils.showNotif('Сначала сформируйте список', true); return; }
            window.print();
        });
    }
};

/* ===== ВОДА ===== */
const liquidManager = {
    calendarState: { year: new Date().getFullYear(), month: new Date().getMonth() },

    getDefaultLiquidItems: () => ([
        { id: 'water', type: 'preset', name: 'Вода', emoji: '💧', enabled: true, goal: 1500, consumed: 0, color: '#06b6d4', hydrationFactor: 1.0 },
        { id: 'coffee', type: 'preset', name: 'Кофе', emoji: '☕', enabled: false, goal: 300, consumed: 0, color: '#8B4513', hydrationFactor: 0.7 },
        { id: 'juice', type: 'preset', name: 'Сок', emoji: '🧃', enabled: false, goal: 200, consumed: 0, color: '#FFA500', hydrationFactor: 0.8 },
        { id: 'tea', type: 'preset', name: 'Чай', emoji: '🍵', enabled: false, goal: 300, consumed: 0, color: '#D2691E', hydrationFactor: 0.9 }
    ]),

    profileTemplate: (profile) => {
        if (!profile.liquid || !Array.isArray(profile.liquid.items)) {
            profile.liquid = { totalGoal: 2000, items: liquidManager.getDefaultLiquidItems() };
        }
        return profile.liquid.items;
    },

    // Чтение данных дня без записи в дневник
    liquidForDay: (pid, ds) => {
        const day = appState.diary?.[ds]?.[pid];
        if (day && Array.isArray(day.liquid)) return day.liquid;
        const profile = appState.profiles.find(p => p.id === pid);
        return JSON.parse(JSON.stringify(liquidManager.profileTemplate(profile)));
    },

    // Получение с созданием записи (для изменений)
    getLiquidDay: (pid, ds) => {
        const day = diaryManager.dayObj(ds, pid);
        if (!Array.isArray(day.liquid)) {
            const profile = appState.profiles.find(p => p.id === pid);
            day.liquid = JSON.parse(JSON.stringify(liquidManager.profileTemplate(profile)));
        }
        return day.liquid;
    },

    drinkName: (item) => item.name || ({ water: 'Вода', coffee: 'Кофе', juice: 'Сок', tea: 'Чай' }[item.type] || item.type),
    drinkEmoji: (item) => item.emoji || ({ water: '💧', coffee: '☕', juice: '🧃', tea: '🍵' }[item.type] || '🥤'),

    addLiquid: (idOrType, ml) => {
        const p = profileManager.activeProfile();
        const current = liquidManager.getLiquidDay(p.id, currentDate);
        const item = current.find(x => (x.id || x.type) === idOrType);
        if (!item) { utils.showNotif('Тип напитка не найден', true); return; }
        if (!item.enabled) item.enabled = true;
        item.consumed += ml;
        storage.saveState();
        liquidManager.renderLiquid();
        utils.showNotif(`+${ml} мл · ${liquidManager.drinkName(item)}`);
    },

    resetLiquid: () => {
        const p = profileManager.activeProfile();
        const current = liquidManager.getLiquidDay(p.id, currentDate);
        current.forEach(item => { item.consumed = 0; });
        storage.saveState();
        liquidManager.renderLiquid();
        utils.showNotif('День сброшен');
    },

    renderLiquid: () => {
        if (!appState.settings.modules.water) return;
        const p = profileManager.activeProfile();
        const liquidData = liquidManager.liquidForDay(p.id, currentDate);
        liquidManager.updateProgressDisplay(liquidData);
        liquidManager.renderDrinkIndicators(liquidData);
        liquidManager.renderDrinkTypes(liquidData);
        liquidManager.renderDrinkSelect(liquidData);
        liquidManager.renderCalendar();
        if (activeViewId === 'diary') diaryManager.renderWaterMini();
    },

    updateProgressDisplay: (liquidData) => {
        let totalGoal = 0, totalConsumed = 0;
        liquidData.forEach(item => {
            if (!item || !item.enabled) return;
            const factor = item.hydrationFactor || 1;
            totalGoal += (item.goal || 0) * factor;
            totalConsumed += (item.consumed || 0) * factor;
        });
        $('#waterGoalLabel').textContent = Math.round(totalGoal);
        $('#waterConsumedLabel').textContent = Math.round(totalConsumed);
        const pct = totalGoal > 0 ? Math.min(100, Math.round((totalConsumed / totalGoal) * 100)) : 0;
        $('#waterProgressPct').textContent = pct + '%';
        const circle = $('#waterProgressCircle');
        circle.setAttribute('stroke-dasharray', `${pct},100`);
        let color = '#22c55e';
        if (pct < 34) color = '#ef4444';
        else if (pct < 67) color = '#f97316';
        else if (pct < 100) color = '#eab308';
        circle.style.stroke = color;
    },

    renderDrinkIndicators: (liquidData) => {
        const box = $('#drinkIndicators');
        box.innerHTML = '';
        liquidData.forEach(item => {
            if (!item) return;
            const pct = item.goal > 0 ? Math.min(100, (item.consumed || 0) / item.goal * 100) : 0;
            const row = document.createElement('div');
            row.className = 'drink-indicator' + (item.enabled ? '' : ' disabled');
            row.innerHTML = `
                <div class="drink-emoji">${liquidManager.drinkEmoji(item)}</div>
                <div class="drink-bar"><div class="drink-bar-fill" style="width:${pct}%;background:${item.color || '#06b6d4'}"></div></div>
                <div class="drink-amount">${item.consumed || 0} / ${item.goal || 0} мл</div>`;
            box.appendChild(row);
        });
    },

    syncProfileDrink: (pid, item, patch) => {
        // Поддерживаем профильные настройки в актуальном состоянии,
        // чтобы новые дни наследовали включённость и цели
        const profile = appState.profiles.find(p => p.id === pid);
        const tpl = liquidManager.profileTemplate(profile);
        const t = tpl.find(x => (x.id || x.type) === (item.id || item.type));
        if (t) Object.assign(t, patch);
    },

    renderDrinkTypes: (liquidData) => {
        const list = $('#waterTypesList');
        const p = profileManager.activeProfile();
        list.innerHTML = '';
        liquidData.forEach(item => {
            if (!item) return;
            const row = document.createElement('div');
            row.className = 'drink-type-row';
            row.innerHTML = `
                <div class="drink-type-color" style="background:${item.color || '#06b6d4'}"></div>
                <div class="drink-type-name">${liquidManager.drinkEmoji(item)} ${utils.esc(liquidManager.drinkName(item))}
                    <span class="drink-type-hf">×${item.hydrationFactor || 1}</span>
                </div>
                <input type="checkbox" ${item.enabled ? 'checked' : ''} title="Учитывать напиток">
                <input type="number" min="50" value="${item.goal || 0}" title="Цель, мл">`;
            const chk = row.querySelector('input[type="checkbox"]');
            chk.addEventListener('change', () => {
                const day = liquidManager.getLiquidDay(p.id, currentDate);
                const target = day.find(x => (x.id || x.type) === (item.id || item.type));
                if (target) target.enabled = chk.checked;
                liquidManager.syncProfileDrink(p.id, item, { enabled: chk.checked });
                storage.saveState();
                liquidManager.renderLiquid();
            });
            const goalInput = row.querySelector('input[type="number"]');
            goalInput.addEventListener('change', () => {
                const val = Math.max(1, parseInt(goalInput.value) || 0);
                const day = liquidManager.getLiquidDay(p.id, currentDate);
                const target = day.find(x => (x.id || x.type) === (item.id || item.type));
                if (target) target.goal = val;
                liquidManager.syncProfileDrink(p.id, item, { goal: val });
                storage.saveState();
                liquidManager.renderLiquid();
            });
            if (item.type === 'custom' || (item.id && String(item.id).startsWith('custom_'))) {
                const del = document.createElement('button');
                del.className = 'mini-btn danger-text';
                del.title = 'Удалить тип';
                del.textContent = '🗑';
                del.addEventListener('click', () => {
                    const drinkId = item.id || item.type;
                    if (p.liquid && Array.isArray(p.liquid.items)) {
                        p.liquid.items = p.liquid.items.filter(it => (it.id || it.type) !== drinkId);
                    }
                    const dayItems = liquidManager.getLiquidDay(p.id, currentDate);
                    const idx = dayItems.findIndex(it => (it.id || it.type) === drinkId);
                    if (idx >= 0) dayItems.splice(idx, 1);
                    storage.saveState();
                    liquidManager.renderLiquid();
                });
                row.appendChild(del);
            }
            list.appendChild(row);
        });
    },

    renderDrinkSelect: (liquidData) => {
        const sel = $('#waterDrinkSelect');
        const prev = sel.value;
        sel.innerHTML = '';
        liquidData.forEach(item => {
            if (!item || !item.enabled) return;
            const opt = document.createElement('option');
            opt.value = item.id || item.type;
            opt.textContent = `${liquidManager.drinkEmoji(item)} ${liquidManager.drinkName(item)}`;
            sel.appendChild(opt);
        });
        if (prev && sel.querySelector(`option[value="${prev}"]`)) sel.value = prev;
    },

    renderCalendar: () => {
        const cal = $('#waterCalendar');
        const { year, month } = liquidManager.calendarState;
        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        $('#waterCalendarTitle').textContent = `${monthNames[month]} ${year}`;
        cal.innerHTML = '';

        const firstDay = new Date(year, month, 1);
        const startWeekday = (firstDay.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();
        const p = profileManager.activeProfile();

        const dayColor = (ds) => {
            const dayItems = appState.diary?.[ds]?.[p.id]?.liquid;
            if (!Array.isArray(dayItems)) return '';
            let goal = 0, cons = 0;
            dayItems.forEach(it => {
                const factor = it.hydrationFactor || 1;
                if (it.enabled) { goal += (it.goal || 0) * factor; cons += (it.consumed || 0) * factor; }
            });
            if (goal <= 0 || cons <= 0) return '';
            const pcent = (cons / goal) * 100;
            if (pcent < 34) return 'red';
            if (pcent < 67) return 'orange';
            if (pcent < 100) return 'yellow';
            return 'green';
        };

        for (let i = 0; i < 42; i++) {
            const cell = document.createElement('div');
            cell.className = 'day';
            let dayNumber, dateStr;
            if (i < startWeekday) {
                dayNumber = prevMonthDays - startWeekday + i + 1;
                cell.classList.add('disabled');
                dateStr = utils.todayStr(new Date(year, month - 1, dayNumber));
            } else if (i >= startWeekday + daysInMonth) {
                dayNumber = i - (startWeekday + daysInMonth) + 1;
                cell.classList.add('disabled');
                dateStr = utils.todayStr(new Date(year, month + 1, dayNumber));
            } else {
                dayNumber = i - startWeekday + 1;
                dateStr = utils.todayStr(new Date(year, month, dayNumber));
                const c = dayColor(dateStr);
                if (c) cell.classList.add(c);
                if (dateStr === utils.todayStr()) cell.classList.add('today');
                cell.addEventListener('click', () => liquidManager.renderDayDetails(dateStr));
            }
            cell.textContent = dayNumber;
            cal.appendChild(cell);
        }
    },

    renderDayDetails: (ds) => {
        const detailBox = $('#waterDayDetails');
        const p = profileManager.activeProfile();
        const dayItems = liquidManager.liquidForDay(p.id, ds);
        let totalHydration = 0, totalGoal = 0;
        let rows = '';
        dayItems.forEach(item => {
            if (!item.enabled) return;
            const factor = item.hydrationFactor || 1;
            totalHydration += (item.consumed || 0) * factor;
            totalGoal += (item.goal || 0) * factor;
            rows += `
                <div class="drink-indicator">
                    <div class="drink-emoji">${liquidManager.drinkEmoji(item)}</div>
                    <div style="flex:1;font-size:13.5px">${utils.esc(liquidManager.drinkName(item))}</div>
                    <div class="drink-amount">${item.consumed || 0} мл</div>
                </div>`;
        });
        detailBox.innerHTML = `
            <h4>${utils.fmtDateHuman(ds)}</h4>
            ${rows || '<div class="muted small">Нет данных</div>'}
            <div class="mt8" style="font-weight:700">Гидратация: ${Math.round(totalHydration)} / ${Math.round(totalGoal)} мл</div>`;
    },

    changeCalendarMonth: (delta) => {
        let { year, month } = liquidManager.calendarState;
        month += delta;
        if (month < 0) { month = 11; year--; }
        else if (month > 11) { month = 0; year++; }
        liquidManager.calendarState = { year, month };
        liquidManager.renderCalendar();
    },

    setupEvents: () => {
        $('#waterVolumeSlider').addEventListener('input', (e) => {
            $('#waterVolumeDisplay').textContent = (parseInt(e.target.value) || 0) + ' мл';
        });
        $$('#view-water .preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const amount = parseInt(btn.dataset.amount) || 0;
                $('#waterVolumeSlider').value = amount;
                $('#waterVolumeDisplay').textContent = amount + ' мл';
            });
        });
        $('#waterSetCustomBtn').addEventListener('click', () => {
            const val = parseInt($('#waterCustomInput').value) || 0;
            if (val > 0) {
                $('#waterVolumeSlider').value = Math.min(1000, val);
                $('#waterVolumeDisplay').textContent = val + ' мл';
                $('#waterVolumeSlider').dataset.exact = val;
            }
        });
        $('#waterAddBtn').addEventListener('click', () => {
            const slider = $('#waterVolumeSlider');
            const exact = parseInt(slider.dataset.exact) || 0;
            const amount = exact > 0 ? exact : (parseInt(slider.value) || 0);
            slider.dataset.exact = '';
            const drinkId = $('#waterDrinkSelect').value;
            if (amount > 0 && drinkId) liquidManager.addLiquid(drinkId, amount);
        });
        $('#waterVolumeSlider').addEventListener('input', () => { $('#waterVolumeSlider').dataset.exact = ''; });

        $('#addDrinkTypeBtn').addEventListener('click', () => {
            const form = $('#newDrinkForm');
            form.hidden = !form.hidden;
        });
        $('#cancelNewDrinkBtn').addEventListener('click', () => { $('#newDrinkForm').hidden = true; });
        $('#saveNewDrinkBtn').addEventListener('click', () => {
            const name = $('#newDrinkName').value.trim();
            if (!name) { utils.showNotif('Введите название напитка', true); return; }
            const emoji = $('#newDrinkEmoji').value.trim() || '🥤';
            const color = $('#newDrinkColor').value || '#06b6d4';
            const goalVal = parseInt($('#newDrinkGoal').value) || 0;
            let hydration = parseFloat($('#newDrinkHydration').value);
            if (isNaN(hydration)) hydration = 0.7;
            hydration = Math.min(1.0, Math.max(0.3, hydration));

            const p = profileManager.activeProfile();
            liquidManager.profileTemplate(p);
            const newItem = {
                id: 'custom_' + Date.now(), type: 'custom',
                name, emoji, enabled: true,
                goal: goalVal > 0 ? goalVal : 200,
                consumed: 0, color, hydrationFactor: hydration
            };
            p.liquid.items.push(newItem);
            liquidManager.getLiquidDay(p.id, currentDate).push(JSON.parse(JSON.stringify(newItem)));
            storage.saveState();
            $('#newDrinkName').value = '';
            $('#newDrinkEmoji').value = '';
            $('#newDrinkForm').hidden = true;
            liquidManager.renderLiquid();
            utils.showNotif('Напиток добавлен');
        });

        $('#resetLiquidBtn').addEventListener('click', () => {
            if (confirm('Сбросить выпитое за выбранный день?')) liquidManager.resetLiquid();
        });
        $('#waterPrevMonth').addEventListener('click', () => liquidManager.changeCalendarMonth(-1));
        $('#waterNextMonth').addEventListener('click', () => liquidManager.changeCalendarMonth(1));
    }
};

/* ===== РЕЦЕПТЫ ===== */
const recipesManager = {
    builderIngredients: [],
    addingRecipeId: null,

    recomputeRecipePerServ: (rc) => {
        let sCal = 0, sPr = 0, sFat = 0, sCarb = 0;
        rc.ingredients.forEach(i => {
            const base = addModal.allSearchables().find(x => x.name === i.name);
            const k = (i.grams || 100) / 100;
            const src = base || i;
            sCal += (src.cal || 0) * k;
            sPr += (src.pr || 0) * k;
            sFat += (src.fat || 0) * k;
            sCarb += (src.carb || 0) * k;
        });
        const serv = Math.max(1, rc.servings || 1);
        rc.perServ = { cal: sCal / serv, pr: sPr / serv, fat: sFat / serv, carb: sCarb / serv };
    },

    renderRecipesList: () => {
        const box = $('#recipesList');
        if (appState.recipes.length === 0) {
            box.innerHTML = '<div class="empty-state">Пока нет рецептов — создайте первый в форме рядом</div>';
            return;
        }
        box.innerHTML = appState.recipes.map(rc => {
            const per = rc.perServ || { cal: 0, pr: 0, fat: 0, carb: 0 };
            return `
                <div class="recipe-item">
                    <div class="recipe-info">
                        <div class="recipe-name">👨‍🍳 ${utils.esc(rc.name)}</div>
                        <div class="recipe-meta">${rc.servings} порц. · на порцию: ${Math.round(per.cal)} ккал · Б ${utils.fmtNum(per.pr)} · Ж ${utils.fmtNum(per.fat)} · У ${utils.fmtNum(per.carb)}</div>
                    </div>
                    <button class="meal-add-btn" data-add-recipe="${rc.id}">+ В дневник</button>
                    <button class="mini-btn danger-text" data-del-rec="${rc.id}" title="Удалить">🗑</button>
                </div>`;
        }).join('');
    },

    renderBuilderIngredients: () => {
        const ingrBox = $('#recIngrBox');
        const ingr = recipesManager.builderIngredients;
        if (!ingr.length) {
            ingrBox.innerHTML = '<div class="empty-state">Найдите и добавьте ингредиенты</div>';
            recipesManager.renderBuilderSum();
            return;
        }
        ingrBox.innerHTML = ingr.map((it, i) => `
            <div class="ingr-row">
                <div class="ingr-name">${utils.esc(it.name)}</div>
                <input type="number" value="${it.grams || 100}" min="1" data-grams="${i}" title="Граммы"> г
                <button class="mini-btn danger-text" data-rem-ingr="${i}">×</button>
            </div>`).join('');
        recipesManager.renderBuilderSum();
    },

    renderBuilderSum: () => {
        const rc = { ingredients: recipesManager.builderIngredients, servings: +$('#recServings').value || 1 };
        recipesManager.recomputeRecipePerServ(rc);
        $('#recMacrosSum').textContent = recipesManager.builderIngredients.length
            ? `На порцию: ${Math.round(rc.perServ.cal)} ккал · Б ${utils.fmtNum(rc.perServ.pr)} · Ж ${utils.fmtNum(rc.perServ.fat)} · У ${utils.fmtNum(rc.perServ.carb)}`
            : '';
    },

    openAddToDiary: (recipeId) => {
        const rc = appState.recipes.find(r => r.id === recipeId);
        if (!rc) return;
        recipesManager.addingRecipeId = recipeId;
        $('#recipeAddName').textContent = `«${rc.name}» в дневник`;
        $('#addRecipeServings').value = 1;
        modals.open('recipeAddModal');
    },

    setupEvents: () => {
        $('#recipesList').addEventListener('click', (e) => {
            const addBtn = e.target.closest('[data-add-recipe]');
            if (addBtn) { recipesManager.openAddToDiary(addBtn.dataset.addRecipe); return; }
            const delBtn = e.target.closest('[data-del-rec]');
            if (delBtn && confirm('Удалить рецепт?')) {
                appState.recipes = appState.recipes.filter(r => r.id !== delBtn.dataset.delRec);
                storage.saveState();
                recipesManager.renderRecipesList();
                utils.showNotif('Рецепт удалён');
            }
        });

        $('#addRecipeToDiaryBtn').addEventListener('click', () => {
            const rc = appState.recipes.find(r => r.id === recipesManager.addingRecipeId);
            if (!rc) return;
            const mt = $('#addRecipeMeal').value;
            const s = Math.max(1, +$('#addRecipeServings').value || 1);
            diaryManager.addMealItem(profileManager.activeProfile().id, currentDate, mt, {
                name: rc.name + ' (рецепт)',
                cal: rc.perServ.cal * s,
                pr: rc.perServ.pr * s,
                fat: rc.perServ.fat * s,
                carb: rc.perServ.carb * s,
                emoji: '👨‍🍳'
            });
            modals.close('recipeAddModal');
            utils.showNotif('Рецепт добавлен в дневник');
        });

        // Конструктор рецепта
        const sInput = $('#recSearch');
        const resBox = $('#recSearchResults');
        sInput.addEventListener('input', () => {
            const q = sInput.value.trim().toLowerCase();
            if (q.length < 2) { resBox.classList.remove('active'); resBox.innerHTML = ''; return; }
            const items = addModal.allSearchables().filter(x => x.name.toLowerCase().includes(q)).slice(0, 20);
            resBox.innerHTML = items.map(x => `
                <div class="search-item" data-ingr="${utils.esc(x.name)}">
                    <div class="search-item-main">
                        <div class="search-item-name">${x.emoji || '🍽️'} ${utils.esc(x.name)}</div>
                        <div class="search-item-details">${Math.round(x.cal)} ккал на 100 г</div>
                    </div>
                </div>`).join('');
            resBox.classList.toggle('active', items.length > 0);
        });
        resBox.addEventListener('click', (e) => {
            const row = e.target.closest('[data-ingr]');
            if (!row) return;
            recipesManager.builderIngredients.push({ name: row.dataset.ingr, grams: 100 });
            resBox.classList.remove('active');
            sInput.value = '';
            recipesManager.renderBuilderIngredients();
        });
        document.addEventListener('click', (e) => {
            if (!resBox.contains(e.target) && e.target !== sInput) resBox.classList.remove('active');
        });

        $('#recIngrBox').addEventListener('click', (e) => {
            const rem = e.target.closest('[data-rem-ingr]');
            if (rem) {
                recipesManager.builderIngredients.splice(+rem.dataset.remIngr, 1);
                recipesManager.renderBuilderIngredients();
            }
        });
        $('#recIngrBox').addEventListener('change', (e) => {
            const inp = e.target.closest('[data-grams]');
            if (inp) {
                recipesManager.builderIngredients[+inp.dataset.grams].grams = Math.max(1, +inp.value || 100);
                recipesManager.renderBuilderSum();
            }
        });
        $('#recServings').addEventListener('change', recipesManager.renderBuilderSum);

        $('#saveRecipeBtn').addEventListener('click', () => {
            const name = $('#recName').value.trim();
            const servings = Math.max(1, +$('#recServings').value || 1);
            if (!name) { utils.showNotif('Введите название рецепта', true); return; }
            if (recipesManager.builderIngredients.length === 0) { utils.showNotif('Добавьте хотя бы один ингредиент', true); return; }
            const rc = {
                id: 'r' + Date.now(),
                name, servings,
                ingredients: JSON.parse(JSON.stringify(recipesManager.builderIngredients))
            };
            recipesManager.recomputeRecipePerServ(rc);
            appState.recipes.push(rc);
            storage.saveState();
            $('#recName').value = '';
            recipesManager.builderIngredients = [];
            recipesManager.renderBuilderIngredients();
            recipesManager.renderRecipesList();
            utils.showNotif('Рецепт сохранён');
        });
    }
};

/* ===== ПЛАН НЕДЕЛИ ===== */
const weekManager = {
    weekDates: (ws) => {
        const arr = [];
        for (let i = 0; i < 7; i++) arr.push(utils.shiftDate(ws, i));
        return arr;
    },

    buildWeekTable: () => {
        const wrap = $('#weekTableWrap');
        const rcList = appState.recipes;
        const days = weekManager.weekDates(weekStart);
        const fmt = ds => new Date(ds).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        $('#weekStartLbl').textContent = `${fmt(days[0])} — ${fmt(days[6])}`;

        if (!rcList.length) {
            wrap.innerHTML = `<div class="empty-state">Сначала создайте рецепты — план недели собирается из них.${appState.settings.modules.recipes ? '' : ' Включите модуль «Рецепты» в настройках.'}</div>`;
            return;
        }

        const wd = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        let html = '<table class="week"><thead><tr><th></th>';
        days.forEach((ds, i) => html += `<th><div class="wd-name">${wd[i]}</div><div class="wd-date">${fmt(ds)}</div></th>`);
        html += '</tr></thead><tbody>';

        ['breakfast', 'lunch', 'dinner'].forEach(mt => {
            html += `<tr><th>${mealTitle(mt)}</th>`;
            days.forEach(ds => {
                const cell = appState.weekPlan[ds]?.[mt] || { rid: '', serv: 1 };
                html += `<td>
                    <select data-w="${ds}:${mt}:rid">
                        <option value="">—</option>
                        ${rcList.map(r => `<option value="${r.id}" ${r.id === cell.rid ? 'selected' : ''}>${utils.esc(r.name)}</option>`).join('')}
                    </select>
                    <div class="serv-row">
                        <input type="number" min="1" data-w="${ds}:${mt}:serv" value="${cell.serv || 1}">
                        <span class="muted small">порц.</span>
                    </div>
                </td>`;
            });
            html += '</tr>';
        });
        wrap.innerHTML = html + '</tbody></table>';
    },

    setupEvents: () => {
        $('#prevWeekBtn').addEventListener('click', () => { weekStart = utils.shiftDate(weekStart, -7); weekManager.buildWeekTable(); });
        $('#nextWeekBtn').addEventListener('click', () => { weekStart = utils.shiftDate(weekStart, 7); weekManager.buildWeekTable(); });

        $('#saveWeekPlanBtn').addEventListener('click', () => {
            $$('#weekTableWrap select[data-w]').forEach(sel => {
                const [ds, mt] = sel.getAttribute('data-w').split(':');
                appState.weekPlan[ds] = appState.weekPlan[ds] || {};
                appState.weekPlan[ds][mt] = appState.weekPlan[ds][mt] || { rid: '', serv: 1 };
                appState.weekPlan[ds][mt].rid = sel.value || '';
            });
            $$('#weekTableWrap input[data-w]').forEach(inp => {
                const [ds, mt] = inp.getAttribute('data-w').split(':');
                appState.weekPlan[ds] = appState.weekPlan[ds] || {};
                appState.weekPlan[ds][mt] = appState.weekPlan[ds][mt] || { rid: '', serv: 1 };
                appState.weekPlan[ds][mt].serv = Math.max(1, +inp.value || 1);
            });
            storage.saveState();
            utils.showNotif('План недели сохранён');
        });

        $('#applyWeekPlanToDiaryBtn').addEventListener('click', () => {
            const pid = profileManager.activeProfile().id;
            let added = 0;
            weekManager.weekDates(weekStart).forEach(ds => {
                const day = appState.weekPlan[ds] || {};
                ['breakfast', 'lunch', 'dinner'].forEach(mt => {
                    const slot = day[mt];
                    if (!slot || !slot.rid) return;
                    const rc = appState.recipes.find(r => r.id === slot.rid);
                    if (!rc) return;
                    diaryManager.dayObj(ds, pid).meals[mt].push({
                        name: rc.name + ' (рецепт)',
                        cal: rc.perServ.cal * slot.serv,
                        pr: rc.perServ.pr * slot.serv,
                        fat: rc.perServ.fat * slot.serv,
                        carb: rc.perServ.carb * slot.serv,
                        emoji: '👨‍🍳'
                    });
                    added++;
                });
            });
            storage.saveState();
            utils.showNotif(added ? `В дневник добавлено блюд: ${added}` : 'В плане нет выбранных рецептов');
        });
    }
};

/* ===== НАСТРОЙКИ ===== */
const settingsManager = {
    renderProfiles: () => {
        const box = $('#profilesList');
        box.innerHTML = '';
        appState.profiles.forEach(p => {
            const isActive = p.id === appState.activeProfileId;
            const div = document.createElement('div');
            div.className = 'profile-row';
            div.innerHTML = `
                <div class="pr-name">${p.emoji} ${utils.esc(p.name)} ${isActive ? '<span class="badge-active">активен</span>' : ''}</div>
                ${isActive ? '' : `<button class="secondary" data-activate="${p.id}">Сделать активным</button>`}
                <button class="mini-btn danger-text" data-del-profile="${p.id}" title="Удалить">🗑</button>`;
            box.appendChild(div);
        });
    },

    renderGoals: () => {
        const box = $('#goalsBox');
        box.innerHTML = '';
        appState.profiles.forEach(p => {
            const card = document.createElement('div');
            card.className = 'goals-profile';
            card.innerHTML = `
                <h4>${p.emoji} ${utils.esc(p.name)}</h4>
                <div class="goals-grid">
                    <label>Ккал<input type="number" data-goal="${p.id}:cal" value="${p.goals.cal}"></label>
                    <label>Белки<input type="number" data-goal="${p.id}:pr" value="${p.goals.pr}"></label>
                    <label>Жиры<input type="number" data-goal="${p.id}:fat" value="${p.goals.fat}"></label>
                    <label>Углеводы<input type="number" data-goal="${p.id}:carb" value="${p.goals.carb}"></label>
                </div>`;
            box.appendChild(card);
        });
    },

    renderModules: () => {
        $('#modWater').checked = !!appState.settings.modules.water;
        $('#modRecipes').checked = !!appState.settings.modules.recipes;
        $('#modMicros').checked = !!appState.settings.modules.micros;
        $('#modGoalsCalc').checked = !!appState.settings.modules.goalsCalc;
        $('#modWeek').checked = !!appState.settings.modules.weekPlanner;
        $('#modShopping').checked = !!appState.settings.modules.shopping;
        $('#goalsCalcCard').hidden = !appState.settings.modules.goalsCalc;
        $('#microsGoalsCard').hidden = !appState.settings.modules.micros;
    },

    renderAppearance: () => {
        const mode = appState.settings.theme || 'light';
        $$('#themeSeg button').forEach(b => b.classList.toggle('active', b.dataset.themeOpt === mode));
    },

    renderMicrosGoals: () => {
        const box = $('#microsGoalsBox');
        if (!appState.settings.modules.micros) return;
        box.innerHTML = '';
        appState.profiles.forEach(p => {
            const row = document.createElement('div');
            row.className = 'goals-profile';
            row.innerHTML = `
                <h4>${p.emoji} ${utils.esc(p.name)}</h4>
                <div class="goals-grid" style="grid-template-columns:repeat(3,1fr)">
                    <label>Клетчатка, г<input type="number" data-micro="${p.id}:fiber" value="${p.goalsMicros.fiber}"></label>
                    <label>Сахар, г<input type="number" data-micro="${p.id}:sugar" value="${p.goalsMicros.sugar}"></label>
                    <label>Натрий, мг<input type="number" data-micro="${p.id}:sodium" value="${p.goalsMicros.sodium}"></label>
                </div>`;
            box.appendChild(row);
        });
    },

    fillAllergyProfileSelect: () => {
        const sel = $('#allergyProfileSelect');
        const prev = sel.value;
        sel.innerHTML = '';
        appState.profiles.forEach(p => {
            const o = document.createElement('option');
            o.value = p.id;
            o.textContent = `${p.emoji} ${p.name}`;
            sel.appendChild(o);
        });
        sel.value = (prev && appState.profiles.some(p => p.id === prev)) ? prev : appState.activeProfileId;
    },

    allergyProfile: () => {
        const pid = $('#allergyProfileSelect').value;
        return appState.profiles.find(p => p.id === pid) || profileManager.activeProfile();
    },

    renderAllergiesList: () => {
        const list = $('#allergiesList');
        const p = settingsManager.allergyProfile();
        if (!Array.isArray(p.allergies)) p.allergies = [];
        if (p.allergies.length === 0) {
            list.innerHTML = '<div class="muted small">Аллергены не указаны</div>';
            return;
        }
        list.innerHTML = p.allergies.map(a => `
            <span class="allergen-tag">${utils.esc(a)}<button data-rm-allergen="${utils.esc(a)}" title="Удалить">×</button></span>`).join('');
    },

    fillCalcProfiles: () => {
        const sel = $('#calcProfileSelect');
        sel.innerHTML = '';
        appState.profiles.forEach(p => {
            const o = document.createElement('option');
            o.value = p.id;
            o.textContent = `${p.emoji} ${p.name}`;
            sel.appendChild(o);
        });
        sel.value = profileManager.activeProfile().id;
    },

    renderSettings: () => {
        settingsManager.renderProfiles();
        settingsManager.renderGoals();
        settingsManager.renderModules();
        settingsManager.renderAppearance();
        settingsManager.fillAllergyProfileSelect();
        settingsManager.renderAllergiesList();
        settingsManager.renderMicrosGoals();
        settingsManager.fillCalcProfiles();
    },

    setupEvents: () => {
        // Профили
        $('#addProfileBtn').addEventListener('click', () => {
            const name = $('#newProfileName').value.trim();
            const emoji = $('#newProfileEmoji').value.trim() || '😊';
            if (!name) { utils.showNotif('Введите имя профиля', true); return; }
            appState.profiles.push({
                id: 'p' + Date.now(),
                name, emoji,
                goals: { cal: 2000, pr: 100, fat: 70, carb: 250 },
                goalsMicros: { fiber: 25, sugar: 50, sodium: 2300 },
                allergies: [],
                liquid: { totalGoal: 2000, items: liquidManager.getDefaultLiquidItems() },
                quickProducts: { breakfast: [], lunch: [], dinner: [], snack: [] }
            });
            storage.saveState();
            $('#newProfileName').value = '';
            $('#newProfileEmoji').value = '';
            profileManager.buildUserSelector();
            settingsManager.renderSettings();
            quickProductsManager.fillProfileSelect();
            utils.showNotif('Профиль добавлен');
        });

        $('#profilesList').addEventListener('click', (e) => {
            const act = e.target.closest('[data-activate]');
            if (act) {
                appState.activeProfileId = act.dataset.activate;
                storage.saveState();
                profileManager.buildUserSelector();
                settingsManager.renderSettings();
                utils.showNotif('Профиль активирован');
                return;
            }
            const del = e.target.closest('[data-del-profile]');
            if (del) {
                if (appState.profiles.length <= 1) { utils.showNotif('Нужен хотя бы один профиль', true); return; }
                if (!confirm('Удалить этот профиль? Его записи в дневнике останутся в данных.')) return;
                const id = del.dataset.delProfile;
                appState.profiles = appState.profiles.filter(p => p.id !== id);
                if (appState.activeProfileId === id) appState.activeProfileId = appState.profiles[0].id;
                storage.saveState();
                profileManager.buildUserSelector();
                settingsManager.renderSettings();
                quickProductsManager.fillProfileSelect();
                utils.showNotif('Профиль удалён');
            }
        });

        // Цели
        $('#goalsBox').addEventListener('change', (e) => {
            const inp = e.target.closest('[data-goal]');
            if (!inp) return;
            const [pid, key] = inp.dataset.goal.split(':');
            const profile = appState.profiles.find(p => p.id === pid);
            profile.goals[key] = Math.max(0, +inp.value || 0);
            storage.saveState();
            utils.showNotif('Цели обновлены');
        });

        $('#microsGoalsBox').addEventListener('change', (e) => {
            const inp = e.target.closest('[data-micro]');
            if (!inp) return;
            const [pid, key] = inp.dataset.micro.split(':');
            const profile = appState.profiles.find(p => p.id === pid);
            profile.goalsMicros[key] = Math.max(0, +inp.value || 0);
            storage.saveState();
        });

        // Модули
        const moduleToggle = (checkboxId, moduleKey, viewId) => {
            $(checkboxId).addEventListener('change', (e) => {
                appState.settings.modules[moduleKey] = e.target.checked;
                storage.saveState();
                navManager.build();
                settingsManager.renderModules();
                if (moduleKey === 'micros') settingsManager.renderMicrosGoals();
                if (e.target.checked && viewId) navManager.switchView(viewId);
            });
        };
        moduleToggle('#modWater', 'water', 'water');
        moduleToggle('#modRecipes', 'recipes', 'recipes');
        moduleToggle('#modMicros', 'micros', null);
        moduleToggle('#modGoalsCalc', 'goalsCalc', null);
        moduleToggle('#modWeek', 'weekPlanner', 'week');
        moduleToggle('#modShopping', 'shopping', 'shopping');

        // Тема
        $('#themeSeg').addEventListener('click', (e) => {
            const b = e.target.closest('[data-theme-opt]');
            if (!b) return;
            appState.settings.theme = b.dataset.themeOpt;
            storage.saveState();
            themeManager.applyTheme(appState.settings.theme);
            settingsManager.renderAppearance();
        });

        // Аллергены
        $('#allergyProfileSelect').addEventListener('change', settingsManager.renderAllergiesList);
        $('#addAllergenBtn').addEventListener('click', () => {
            const select = $('#newAllergenSelect');
            const allergen = (select.value || '').trim();
            if (!allergen) { utils.showNotif('Выберите аллерген', true); return; }
            const p = settingsManager.allergyProfile();
            if (!Array.isArray(p.allergies)) p.allergies = [];
            if (p.allergies.includes(allergen)) { utils.showNotif('Этот аллерген уже добавлен', true); return; }
            p.allergies.push(allergen);
            storage.saveState();
            settingsManager.renderAllergiesList();
            select.selectedIndex = 0;
            utils.showNotif('Аллерген добавлен');
        });
        $('#allergiesList').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-rm-allergen]');
            if (!btn) return;
            const p = settingsManager.allergyProfile();
            p.allergies = (p.allergies || []).filter(a => a !== btn.dataset.rmAllergen);
            storage.saveState();
            settingsManager.renderAllergiesList();
            utils.showNotif('Аллерген удалён');
        });

        // Калькулятор целей
        $('#calcDoBtn').addEventListener('click', () => {
            const pid = $('#calcProfileSelect').value;
            const sex = $('#calcSex').value;
            const age = +$('#calcAge').value || 30;
            const h = +$('#calcHeight').value || 170;
            const w = +$('#calcWeight').value || 70;
            const act = +$('#calcAct').value || 1.55;
            const goal = +$('#calcGoal').value || 0;

            const bmr = sex === 'm' ? (10 * w + 6.25 * h - 5 * age + 5) : (10 * w + 6.25 * h - 5 * age - 161);
            const cals = Math.round(bmr * act * (1 + goal));
            const protein = Math.round(1.6 * w);
            const fat = Math.round((cals * 0.25) / 9);
            const carbs = Math.max(0, Math.round((cals - protein * 4 - fat * 9) / 4));

            const p = appState.profiles.find(x => x.id === pid);
            p.goals = { cal: cals, pr: protein, fat, carb: carbs };
            storage.saveState();
            settingsManager.renderGoals();
            $('#calcOut').textContent = `${cals} ккал · Б ${protein} · Ж ${fat} · У ${carbs}`;
            utils.showNotif(`Цели для «${p.name}» обновлены`);
        });

        // Данные
        $('#exportAllBtn').addEventListener('click', () => {
            utils.download('family_nutrition_data.json', JSON.stringify(appState, null, 2));
            utils.showNotif('Данные экспортированы');
        });
        $('#importAllBtn').addEventListener('click', () => $('#importFileInput').click());
        $('#importFileInput').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const data = JSON.parse(await file.text());
                if (!data.version || !data.profiles) throw new Error('Неверный формат файла');
                if (confirm('Заменить все текущие данные данными из файла?')) {
                    appState = data;
                    storage.migrateIfNeeded();
                    storage.saveState(true);
                    themeManager.applyTheme(appState.settings.theme || 'light');
                    profileManager.buildUserSelector();
                    navManager.build();
                    app.renderView(activeViewId);
                    utils.showNotif('Данные импортированы');
                }
            } catch (err) {
                utils.showNotif('Ошибка импорта: ' + err.message, true);
            } finally {
                e.target.value = '';
            }
        });
        $('#clearAllBtn').addEventListener('click', () => {
            if (!confirm('Удалить ВСЕ данные приложения? Это действие необратимо.')) return;
            localStorage.removeItem(STORAGE_KEY);
            appState = JSON.parse(JSON.stringify(defaultState));
            storage.saveState(true);
            themeManager.applyTheme(appState.settings.theme || 'light');
            profileManager.buildUserSelector();
            navManager.build();
            navManager.switchView('diary');
            utils.showNotif('Все данные очищены');
        });
    }
};

/* ===== ПРИЛОЖЕНИЕ ===== */
const app = {
    init() {
        storage.loadState();
        weekStart = utils.mondayOf(currentDate);

        themeManager.bindSystemThemeListener();
        themeManager.applyTheme(appState.settings.theme || 'light');

        profileManager.buildUserSelector();
        modals.setupGlobal();

        diaryManager.setupDiaryEvents();
        addModal.setupEvents();
        cityMenuManager.setupEvents();
        myProductsManager.setupEvents();
        quickProductsManager.setupEvents();
        shoppingManager.setupEvents();
        liquidManager.setupEvents();
        recipesManager.setupEvents();
        weekManager.setupEvents();
        settingsManager.setupEvents();

        navManager.switchView('diary');
    },

    renderView(id) {
        switch (id) {
            case 'diary':
                diaryManager.renderDiary();
                break;
            case 'menu':
                cityMenuManager.renderAll();
                break;
            case 'products':
                myProductsManager.render();
                quickProductsManager.fillProfileSelect();
                quickProductsManager.renderSlots();
                quickProductsManager.renderFoodLibrary();
                break;
            case 'analytics':
                analyticsManager.renderAnalytics();
                break;
            case 'shopping':
                shoppingManager.renderList();
                shoppingManager.renderFrequent();
                break;
            case 'water':
                liquidManager.renderLiquid();
                break;
            case 'recipes':
                recipesManager.renderRecipesList();
                recipesManager.renderBuilderIngredients();
                break;
            case 'week':
                weekManager.buildWeekTable();
                break;
            case 'settings':
                settingsManager.renderSettings();
                break;
        }
    }
};

window.app = app;

document.addEventListener('DOMContentLoaded', () => app.init());
