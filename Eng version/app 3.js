

/* ===== GLOBAL VARIABLES ===== */
let appState = null;
// Updated storage key for version 7. When changing data structure
// change the postfix to avoid conflicts with old schema.
const STORAGE_KEY = 'family_nutrition_tracker_v7';
let charts = {calories: null, macros: null, vitamins: null, liquid: null};
let activeTabId = 'diary';
let currentDate = new Date().toISOString().split('T')[0];
let editContext = null;
let addMealType = 'breakfast';
let currentQuickMeal = 'breakfast';
let editingQuickIndex = null;
let weekStart = null;
let loadedMenuData = null; // Storage for loaded menu

/* ===== UTILITIES ===== */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const utils = {
    z2: n => String(n).padStart(2, '0'),
    todayStr: (d = new Date()) => `${d.getFullYear()}-${utils.z2(d.getMonth()+1)}-${utils.z2(d.getDate())}`,
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
    fmtNum: n => (Math.round(n * 10) / 10).toString().replace('.', ','),
    clamp01: x => Math.max(0, Math.min(1, x)),
    showNotif: (text, isError = false) => {
        const div = document.createElement('div');
        div.className = 'notif' + (isError ? ' error' : '');
        div.textContent = text;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 2500);
    },
    download: (filename, content, mime = 'application/json') => {
        const blob = new Blob([content], {type: mime});
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
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    values.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            values.push(current.trim());
            
            if (values.length === headers.length) {
                const row = {};
                headers.forEach((h, idx) => {
                    row[h] = values[idx];
                });
                rows.push(row);
            }
        }
        
        return {headers, rows};
    }
};

/* ===== STORAGE ===== */
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
        } catch(e) {
            console.warn('Storage corrupted', e);
            appState = JSON.parse(JSON.stringify(defaultState));
            storage.saveState(true);
        }
    },
    
    saveState: (immediate = false) => {
        const doSave = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
        if (immediate) {
            doSave();
            return;
        }
        clearTimeout(storage.saveTimer);
        storage.saveTimer = setTimeout(doSave, 200);
    },
    
    migrateIfNeeded: () => {
        if (!appState.version) appState.version = 1;
        if (appState.version < 6) {
            appState.profiles.forEach(p => {
                if (!p.quickProducts) {
                    p.quickProducts = {breakfast: [], lunch: [], dinner: [], snack: []};
                }
                if (!p.goalsMicros) {
                    p.goalsMicros = {fiber:25, sugar:50, sodium:2300};
                }
                if (!p.liquid) {
                    p.liquid = {
                        totalGoal: 2000,
                        items: [
                            {type: 'water', enabled: true, goal: 1500, consumed: 0, color: '#06b6d4'},
                            {type: 'coffee', enabled: false, goal: 300, consumed: 0, color: '#8B4513'},
                            {type: 'juice', enabled: false, goal: 200, consumed: 0, color: '#FFA500'},
                            {type: 'tea', enabled: false, goal: 300, consumed: 0, color: '#D2691E'}
                        ]
                    };
                }
            });
            if (!appState.settings) {
                appState.settings = {
                    modules: {water:false, recipes:false, micros:false, goalsCalc:false, weekPlanner:false, shopping:false},
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

        // Migration to version 7: adding allergies array and micronutrient goals
        if (appState.version < 7) {
            appState.profiles.forEach(p => {
                if (!p.goalsMicros) {
                    p.goalsMicros = {fiber: 25, sugar: 50, sodium: 2300};
                }
                if (!Array.isArray(p.allergies)) {
                    p.allergies = [];
                }
            });
            appState.version = 7;
        }
    }
};

/* ===== THEMES ===== */
const themeManager = {
    systemDarkMql: window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null,
    
    resolveTheme: (mode) => {
        if (mode === 'system') {
            return (themeManager.systemDarkMql && themeManager.systemDarkMql.matches) ? 'dark' : 'light';
        }
        return mode === 'dark' ? 'dark' : 'light';
    },
    
    applyTheme: (mode) => {
        const eff = themeManager.resolveTheme(mode);
        document.body.setAttribute('data-theme', eff === 'dark' ? 'dark' : 'light');
    },
    
    bindSystemThemeListener: () => {
        if (!themeManager.systemDarkMql) return;
        themeManager.systemDarkMql.onchange = () => {
            if ((appState?.settings?.theme || 'light') === 'system') {
                themeManager.applyTheme('system');
            }
        };
    }
};

/* ===== PROFILES ===== */
const profileManager = {
    activeProfile: () => {
        return appState.profiles.find(p => p.id === appState.activeProfileId) || appState.profiles[0];
    },
    
    buildUserSelector: () => {
        const box = $('#userSelector');
        box.innerHTML = '';
        appState.profiles.forEach(p => {
            const div = document.createElement('div');
            div.className = 'user-chip' + (p.id === appState.activeProfileId ? ' active' : '');
            div.textContent = `${p.emoji} ${p.name}`;
            div.addEventListener('click', () => {
                appState.activeProfileId = p.id;
                storage.saveState();
                profileManager.buildUserSelector();
                app.renderAll();
            });
            box.appendChild(div);
        });
    }
};

/* ===== TABS ===== */
const tabManager = {
    currentTabs: () => {
        const t = [
            {id: 'diary', title: '📅 Diary'},
            {id: 'add', title: '➕ Add'},
            {id: 'menu', title: '📋 Menu'},
            {id: 'analytics', title: '📊 Analytics'},
            {id: 'settings', title: '⚙️ Settings'}
        ];
        
        if (appState.settings.modules.water) t.splice(5, 0, {id: 'water', title: '💧 Water'});
        if (appState.settings.modules.recipes) t.splice(3, 0, {id: 'recipes', title: '👨‍🍳 Recipes'});
        if (appState.settings.modules.weekPlanner) t.splice(4, 0, {id: 'week', title: '🗓️ Week'});
        if (appState.settings.modules.shopping) t.splice(5, 0, {id: 'shopping', title: '🛒 Shopping'});
        
        return t;
    },
    
    buildTabs: () => {
        const wrap = $('#tabs');
        wrap.innerHTML = '';
        
        tabManager.currentTabs().forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'tab' + (t.id === activeTabId ? ' active' : '');
            btn.textContent = t.title;
            btn.addEventListener('click', () => tabManager.switchTab(t.id));
            wrap.appendChild(btn);
        });
        
        $$('.tab-content').forEach(el => el.classList.remove('active'));
        const tc = $('#tab-' + activeTabId);
        if (tc) tc.classList.add('active');
    },
    
    switchTab: (id) => {
        activeTabId = id;
        tabManager.buildTabs();
        app.renderTab(id);
    }
};

/* ===== DIARY ===== */
const mealTypes = [
    {id: 'breakfast', title: '🌅 Breakfast'},
    {id: 'lunch', title: '☀️ Lunch'},
    {id: 'dinner', title: '🌙 Dinner'},
    {id: 'snack', title: '🎃 Snack'}
];

const diaryManager = {
    dayObj: (ds, pid) => {
        appState.diary[ds] = appState.diary[ds] || {};
        if (!appState.diary[ds][pid]) {
            appState.diary[ds][pid] = {
                meals: {breakfast: [], lunch: [], dinner: [], snack: []},
                liquid: null
            };
        }
        return appState.diary[ds][pid];
    },
    
    addMealItem: (pid, ds, mt, item) => {
        // Check for allergens and notify user
        try {
            const profile = appState.profiles.find(p => p.id === pid);
            if (profile && Array.isArray(profile.allergies) && profile.allergies.length > 0) {
                const allergens = item.allergens || [];
                if (Array.isArray(allergens) && allergens.some(a => profile.allergies.includes(a))) {
                    utils.showNotif('⚠️ Dish contains your allergens!', true);
                }
            }
        } catch (err) {
            console.warn('Allergy check error', err);
        }
        const d = diaryManager.dayObj(ds, pid);
        // Ensure all micronutrients and properties are present
        const fullItem = {
            ...item,
            fiber: item.fiber || 0,
            sugar: item.sugar || 0,
            sodium: item.sodium || 0,
            allergens: item.allergens || [],
            vitamins: item.vitamins || ''
        };
        d.meals[mt].push(fullItem);
        storage.saveState();
        diaryManager.renderDiary();
    },
    
    removeMealItem: (pid, ds, mt, idx) => {
        const d = diaryManager.dayObj(ds, pid);
        d.meals[mt].splice(idx, 1);
        storage.saveState();
        diaryManager.renderDiary();
    },
    
    updateMealItem: (pid, ds, mt, idx, newItem) => {
        const d = diaryManager.dayObj(ds, pid);
        d.meals[mt][idx] = newItem;
        storage.saveState();
        diaryManager.renderDiary();
    },
    
    totalsForDay: (pid, ds) => {
        const d = diaryManager.dayObj(ds, pid);
        const all = [...d.meals.breakfast, ...d.meals.lunch, ...d.meals.dinner, ...d.meals.snack];
        const sum = key => all.map(x => x[key] || 0).reduce((a, b) => a + b, 0);
        return {
            cal: sum('cal'),
            pr: sum('pr'),
            fat: sum('fat'),
            carb: sum('carb'),
            fiber: sum('fiber'),
            sugar: sum('sugar'),
            sodium: sum('sodium')
        };
    },
    
    openEditMeal: (pid, ds, mt, idx, item) => {
        editContext = {pid, ds, mt, idx, item};
        const modal = $('#editMealModal');
        const content = $('#editMealContent');
        const currentPortion = item.portion || 100;
        const isFavorite = appState.favorites.includes(item.name);
        
        content.innerHTML = `
            <div class="mb8"><strong>${item.emoji||'🍽️'} ${item.name}</strong></div>
            <label>Change portion (g)</label>
            <input type="range" id="portionSlider" min="50" max="500" step="10" value="${currentPortion}">
            <div class="portion-display" id="portionDisplay">${currentPortion}g</div>
            <div class="small muted mb8" id="portionMacros"></div>
            <div class="divider"></div>
            <div class="row">
                <button id="savePortionBtn">Save</button>
                <button class="secondary" id="editFullBtn">Full edit</button>
                <button class="danger" id="deleteItemBtn">Delete</button>
                <button class="secondary" id="toggleFavBtn">${isFavorite?'★ Remove':'☆ Add to favorites'}</button>
            </div>
        `;
        
        const slider = $('#portionSlider');
        const display = $('#portionDisplay');
        const macros = $('#portionMacros');
        
        function updateDisplay() {
            const p = parseInt(slider.value);
            display.textContent = p + 'g';
            const basePortion = item.portion || 100;
            const mult = p / basePortion;
            macros.textContent = `${Math.round((item.cal||0)*mult)} cal • P ${utils.fmtNum((item.pr||0)*mult)}g • F ${utils.fmtNum((item.fat||0)*mult)}g • C ${utils.fmtNum((item.carb||0)*mult)}g`;
        }
        
        slider.addEventListener('input', updateDisplay);
        updateDisplay();
        
        $('#savePortionBtn').addEventListener('click', () => {
            const newPortion = parseInt(slider.value);
            const basePortion = item.portion || 100;
            const mult = newPortion / basePortion;
            const updatedItem = {
                ...item,
                portion: newPortion,
                cal: (item.cal||0) * mult,
                pr: (item.pr||0) * mult,
                fat: (item.fat||0) * mult,
                carb: (item.carb||0) * mult,
                fiber: (item.fiber||0) * mult,
                sugar: (item.sugar||0) * mult,
                sodium: (item.sodium||0) * mult
            };
            diaryManager.updateMealItem(pid, ds, mt, idx, updatedItem);
            modal.classList.remove('active');
            utils.showNotif('Portion updated');
        });
        
        $('#editFullBtn').addEventListener('click', () => {
            modal.classList.remove('active');
            diaryManager.openFullEditModal();
        });
        
        $('#deleteItemBtn').addEventListener('click', () => {
            if (confirm('Delete this dish?')) {
                diaryManager.removeMealItem(pid, ds, mt, idx);
                modal.classList.remove('active');
                utils.showNotif('Dish deleted');
            }
        });
        
        $('#toggleFavBtn').addEventListener('click', () => {
            diaryManager.toggleFavorite(item.name);
            modal.classList.remove('active');
            utils.showNotif(isFavorite ? 'Removed from favorites' : 'Added to favorites');
        });
        
        modal.classList.add('active');
    },
    
    openFullEditModal: () => {
        if (!editContext) return;
        const {pid, ds, mt, idx, item} = editContext;
        const modal = $('#fullEditModal');
        
        $('#editName').value = item.name || '';
        $('#editPortion').value = item.portion || 100;
        $('#editCal').value = Math.round(item.cal || 0);
        $('#editPr').value = utils.fmtNum(item.pr || 0).replace(',', '.');
        $('#editFat').value = utils.fmtNum(item.fat || 0).replace(',', '.');
        $('#editCarb').value = utils.fmtNum(item.carb || 0).replace(',', '.');
        $('#editFiber').value = utils.fmtNum(item.fiber || 0).replace(',', '.');
        $('#editSugar').value = utils.fmtNum(item.sugar || 0).replace(',', '.');
        $('#editSodium').value = Math.round(item.sodium || 0);
        
        $('#saveFullEditBtn').onclick = () => {
            const updatedItem = {
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
            };
            diaryManager.updateMealItem(pid, ds, mt, idx, updatedItem);
            modal.classList.remove('active');
            editContext = null;
            utils.showNotif('Changes saved');
        };
        
        modal.classList.add('active');
    },
    
    toggleFavorite: (itemName) => {
        const idx = appState.favorites.indexOf(itemName);
        if (idx === -1) appState.favorites.push(itemName);
        else appState.favorites.splice(idx, 1);
        storage.saveState();
        diaryManager.renderDiary();
    },
    
    renderDiary: () => {
        const t = utils.todayStr();
        let lbl = currentDate;
        if (currentDate === t) lbl = 'Today';
        else if (currentDate === utils.shiftDate(t, -1)) lbl = 'Yesterday';
        else if (currentDate === utils.shiftDate(t, 1)) lbl = 'Tomorrow';
        
        $('#currentDateLbl').textContent = lbl;
        
        const p = profileManager.activeProfile();
        const totals = diaryManager.totalsForDay(p.id, currentDate);
        const g = p.goals;
        
        const updateProgress = (valEl, progEl, txtEl, val, goal) => {
            $(valEl).textContent = Math.round(val);
            const pct = goal > 0 ? Math.round(utils.clamp01(val / goal) * 100) : 0;
            $(progEl).style.width = pct + '%';
            $(txtEl).textContent = pct + '%';
        };
        
        updateProgress('#calVal', '#calProg', '#calProgTxt', totals.cal, g.cal);
        updateProgress('#prVal', '#prProg', '#prProgTxt', totals.pr, g.pr);
        updateProgress('#fatVal', '#fatProg', '#fatProgTxt', totals.fat, g.fat);
        updateProgress('#carbVal', '#carbProg', '#carbProgTxt', totals.carb, g.carb);
        
        const wrap = $('#mealsWrap');
        wrap.innerHTML = '';
        
        mealTypes.forEach(mt => {
            const card = document.createElement('div');
            card.className = 'card';
            
            const head = document.createElement('h3');
            head.textContent = mt.title;
            card.appendChild(head);
            
            const list = document.createElement('div');
            list.className = 'list mt8';
            
            const d = diaryManager.dayObj(currentDate, p.id);
            const arr = d.meals[mt.id];
            
            if (arr.length === 0) {
                list.innerHTML = '<div class="muted">Empty</div>';
            } else {
                arr.forEach((item, idx) => {
                    const el = document.createElement('div');
                    el.className = 'meal-entry';
                    if (appState.favorites.includes(item.name)) el.classList.add('favorite');
                    // Add class for allergens if dish contains allergen from profile
                    try {
                        if (Array.isArray(p.allergies) && p.allergies.length > 0 && Array.isArray(item.allergens) && item.allergens.some(a => p.allergies.includes(a))) {
                            el.classList.add('has-allergen');
                        }
                    } catch(err) {
                        console.warn('Highlight allergen error', err);
                    }
                    el.innerHTML = `
                        <div class="meal-info">
                            <div class="meal-title">
                                ${item.emoji || '🍽️'} ${item.name}
                                <span class="meal-portion">${item.portion || 100}g</span>
                            </div>
                            <div class="meal-details">
                                ${Math.round(item.cal)} cal • P ${utils.fmtNum(item.pr)} • F ${utils.fmtNum(item.fat)} • C ${utils.fmtNum(item.carb)}
                            </div>
                        </div>
                    `;
                    el.addEventListener('click', () => diaryManager.openEditMeal(p.id, currentDate, mt.id, idx, item));
                    list.appendChild(el);
                });
            }
            
            card.appendChild(list);
            wrap.appendChild(card);
        });
    }
};

/* ===== ADD ===== */
const addManager = {
    buildMealChips: () => {
        const box = $('#mealTypeChips');
        box.innerHTML = '';
        
        mealTypes.forEach(mt => {
            const chip = document.createElement('div');
            chip.className = 'meal-chip' + (addMealType === mt.id ? ' active' : '');
            chip.textContent = mt.title;
            chip.addEventListener('click', () => {
                addMealType = mt.id;
                addManager.buildMealChips();
                addManager.renderQuickAddGrid();
            });
            box.appendChild(chip);
        });
    },
    
    renderQuickAddGrid: () => {
        const grid = $('#quickAddGrid');
        const p = profileManager.activeProfile();
        const items = p.quickProducts[addMealType] || [];
        
        grid.innerHTML = '';
        
        if (items.length === 0) {
            grid.innerHTML = '<div class="empty-state">Add quick products in "Menu" tab</div>';
            return;
        }
        
        items.forEach(item => {
            const btn = document.createElement('div');
            btn.className = 'quick-add-btn';
            btn.innerHTML = `
                <div class="quick-add-icon">${item.emoji || '🍽️'}</div>
                <div class="quick-add-name">${item.name}</div>
            `;
            
            btn.addEventListener('click', () => {
                diaryManager.addMealItem(p.id, currentDate, addMealType, {...item});
                utils.showNotif('Added to diary');
            });
            
            grid.appendChild(btn);
        });
    },
    
    allSearchables: () => {
        const uf = appState.userFoods || [];
        const map = new Map();
        [...foodDatabase, ...uf].forEach(x => {
            if (!map.has(x.name)) map.set(x.name, x);
        });
        return [...map.values()];
    },
    
    setupSearch: () => {
        const input = $('#foodSearchInput');
        const box = $('#foodSearchResults');
        
        function renderResults(val) {
            const q = val.trim().toLowerCase();
            if (q.length < 2) {
                box.classList.remove('active');
                box.innerHTML = '';
                return;
            }
            
            const items = addManager.allSearchables().filter(x => 
                x.name.toLowerCase().includes(q)).slice(0, 20);
            
            if (items.length === 0) {
                box.classList.remove('active');
                box.innerHTML = '';
                return;
            }
            
            box.innerHTML = items.map(x => `
                <div class="search-item" data-name="${x.name}">
                    <div class="search-item-name">${x.emoji||'🍽️'} ${x.name}</div>
                    <div class="search-item-details">${Math.round(x.cal)} cal • P ${utils.fmtNum(x.pr)} • F ${utils.fmtNum(x.fat)} • C ${utils.fmtNum(x.carb)}</div>
                </div>
            `).join('');
            
            box.classList.add('active');
            
            box.querySelectorAll('.search-item').forEach(el => {
                el.addEventListener('click', () => {
                    const name = el.getAttribute('data-name');
                    const it = addManager.allSearchables().find(a => a.name === name);
                    diaryManager.addMealItem(profileManager.activeProfile().id, currentDate, addMealType, {...it});
                    box.classList.remove('active');
                    input.value = '';
                    utils.showNotif('Added to diary');
                });
            });
        }
        
        input.addEventListener('input', () => renderResults(input.value));
        document.addEventListener('click', (e) => {
            if (!box.contains(e.target) && e.target !== input) {
                box.classList.remove('active');
            }
        });
    },
    
    setupCustomInput: () => {
        $('#addCustomBtn').addEventListener('click', () => {
            const name = $('#customName').value.trim();
            const portion = +$('#customPortion').value || 100;
            
            if (!name) {
                utils.showNotif('Enter name', true);
                return;
            }
            
            const item = {
                name,
                portion,
                cal: +$('#customCal').value || 0,
                pr: +$('#customPr').value || 0,
                fat: +$('#customFat').value || 0,
                carb: +$('#customCarb').value || 0,
                fiber: +$('#customFiber').value || 0,
                sugar: +$('#customSugar').value || 0,
                sodium: +$('#customSodium').value || 0,
                emoji: '🍽️'
            };
            
            diaryManager.addMealItem(profileManager.activeProfile().id, currentDate, addMealType, item);
            utils.showNotif('Added to diary');
        });
        
        $('#saveAsMyProductBtn').addEventListener('click', () => {
            const name = $('#customName').value.trim();
            
            if (!name) {
                utils.showNotif('Enter name', true);
                return;
            }
            
            const obj = {
                name,
                cal: +$('#customCal').value || 0,
                pr: +$('#customPr').value || 0,
                fat: +$('#customFat').value || 0,
                carb: +$('#customCarb').value || 0,
                fiber: +$('#customFiber').value || 0,
                sugar: +$('#customSugar').value || 0,
                sodium: +$('#customSodium').value || 0,
                emoji: '🍽️'
            };
            
            if ((appState.userFoods || []).find(x => x.name.toLowerCase() === name.toLowerCase())) {
                utils.showNotif('Product already exists', true);
                return;
            }
            
            appState.userFoods.push(obj);
            storage.saveState();
            utils.showNotif('Saved to my products');
        });
    }
};

/* ===== CITY MENU ===== */
const cityMenuManager = {
    currentCity: 'Saint Petersburg',
    currentDay: 1,
    // Maximum number of days in menu
    maxDays: 30,
    
    loadMenuFromCSV: (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const {rows} = utils.parseCSV(text);
                
                // Convert CSV data to menu structure
                loadedMenuData = {};
                
                rows.forEach(row => {
                    const country = row['Country'] || row['Country'];
                    const day = parseInt(row['Day'] || row['Day']);
                    const mealType = row['Meal'] || row['Meal'];
                    const dish = row['Dish'] || row['Dish'];
                    const cal = parseFloat(row['Calories'] || row['Calories']) || 0;
                    const pr = parseFloat(row['Protein'] || row['Protein']) || 0;
                    const fat = parseFloat(row['Fat'] || row['Fat']) || 0;
                    const carb = parseFloat(row['Carbs'] || row['Carbs']) || 0;
                    const vitamins = row['Key vitamins / nutrients'] || '';
                    // Allergens from CSV if present (column "Allergens" or "Allergens")
                    const allergensStr = row['Allergens'] || row['Allergens'] || '';
                    
                    if (!country || !day || !mealType || !dish) return;
                    
                    if (!loadedMenuData[country]) loadedMenuData[country] = {};
                    if (!loadedMenuData[country][day]) loadedMenuData[country][day] = {};
                    
                    // Determine meal type
                    let mealKey = 'breakfast';
                    if (mealType.toLowerCase().includes('lunch') || mealType.toLowerCase().includes('lunch')) {
                        mealKey = 'lunch';
                    } else if (mealType.toLowerCase().includes('dinner') || mealType.toLowerCase().includes('dinner')) {
                        mealKey = 'dinner';
                    }
                    
                    // Extract micronutrients and vitamin names from vitamins string
                    let fiber = 0, sugar = 0, sodium = 0;
                    let additionalVitamins = [];
                    if (vitamins) {
                        // Parse numeric values
                        const fiberMatch = vitamins.match(/fiber[:\s]*(\d+\.?\d*)/i);
                        const sugarMatch = vitamins.match(/sugar[:\s]*(\d+\.?\d*)/i);
                        const sodiumMatch = vitamins.match(/sodium[:\s]*(\d+\.?\d*)/i);
                        if (fiberMatch) fiber = parseFloat(fiberMatch[1]);
                        if (sugarMatch) sugar = parseFloat(sugarMatch[1]);
                        if (sodiumMatch) sodium = parseFloat(sodiumMatch[1]);
                        // Extract vitamin names
                        const vitaminNames = vitamins
                            .split(',')
                            .map(v => v.trim())
                            .filter(v => !v.match(/fiber|sugar|sodium/i))
                            .filter(v => v.length > 0);
                        additionalVitamins = vitaminNames;
                    }

                    // Process allergens: split by comma and trim spaces
                    let allergens = [];
                    if (allergensStr) {
                        allergens = allergensStr.split(',').map(s => s.trim()).filter(Boolean);
                    }
                    
                    loadedMenuData[country][day][mealKey] = {
                        name: dish,
                        cal,
                        pr,
                        fat,
                        carb,
                        fiber,
                        sugar,
                        sodium,
                        vitamins: additionalVitamins.join(', '),
                        // save allergens array (can be empty)
                        allergens,
                        emoji: '🍽️'
                    };
                });
                // After loading update city buttons and calendar and render menu
                cityMenuManager.renderCityButtons();
                cityMenuManager.renderDayCalendar();
                cityMenuManager.renderCityMenu();
                utils.showNotif('Menu loaded from CSV');
            } catch (err) {
                console.error('CSV parse error:', err);
                utils.showNotif('CSV load error: ' + err.message, true);
            }
        };
        reader.readAsText(file, 'utf-8');
    },
    
    // Render city selection panel
    renderCityButtons: () => {
        const container = $('#citiesButtons');
        if (!container) return;
        container.innerHTML = '';
        // Collect list of all available cities
        const builtInCities = cityMenus ? Object.keys(cityMenus) : [];
        const loadedCities = loadedMenuData ? Object.keys(loadedMenuData) : [];
        const allCities = [...builtInCities, ...loadedCities.filter(c => !builtInCities.includes(c))];
        if (allCities.length === 0) return;
        // If current city not in list, select first one
        if (!allCities.includes(cityMenuManager.currentCity)) {
            cityMenuManager.currentCity = allCities[0];
        }
        allCities.forEach(city => {
            const btn = document.createElement('button');
            btn.className = 'city-btn' + (city === cityMenuManager.currentCity ? ' active' : '');
            btn.textContent = city;
            btn.setAttribute('data-city', city);
            btn.addEventListener('click', () => {
                cityMenuManager.currentCity = city;
                // When changing city reset current day to 1
                cityMenuManager.currentDay = 1;
                cityMenuManager.renderCityButtons();
                cityMenuManager.renderDayCalendar();
                cityMenuManager.renderCityMenu();
            });
            container.appendChild(btn);
        });
    },
    
    // Render day calendar
    renderDayCalendar: () => {
        const container = $('#dayCalendar');
        if (!container) return;
        container.innerHTML = '';
        const max = cityMenuManager.maxDays;
        for (let i = 1; i <= max; i++) {
            const btn = document.createElement('button');
            btn.className = 'day-btn' + (i === cityMenuManager.currentDay ? ' active' : '');
            btn.textContent = i;
            btn.setAttribute('data-day', i);
            btn.addEventListener('click', () => {
                cityMenuManager.currentDay = i;
                cityMenuManager.renderDayCalendar();
                cityMenuManager.renderCityMenu();
            });
            container.appendChild(btn);
        }
    },
    
    renderCityMenu: () => {
        const city = cityMenuManager.currentCity;
        const day = cityMenuManager.currentDay;
        const headerEl = $('#cityMenuHeader');
        if (headerEl) {
            headerEl.textContent = `${city} • Day ${day}`;
        }
        const display = $('#cityMenuDisplay');
        if (!display) return;
        // Search menu first in loaded, then in built-in
        const menu = (loadedMenuData && loadedMenuData[city]?.[day]) || (cityMenus && cityMenus[city]?.[day]);
        if (!menu) {
            display.innerHTML = '<div class="empty-state">Menu not found</div>';
            return;
        }
        let html = '<div class="city-menu-display">';
        const meals = [
            {key: 'breakfast', title: '🌅 Breakfast'},
            {key: 'lunch', title: '☀️ Lunch'},
            {key: 'dinner', title: '🌙 Dinner'}
        ];
        meals.forEach(meal => {
            if (menu[meal.key]) {
                const m = menu[meal.key];
                html += `
                    <div class="city-menu-meal">
                        <div class="city-menu-meal-title">${meal.title}</div>
                        <div class="city-menu-meal-name">${m.emoji || '🍽️'} ${m.name}</div>
                        <div class="city-menu-meal-macros">
                            ${Math.round(m.cal)} cal • P ${utils.fmtNum(m.pr)} • F ${utils.fmtNum(m.fat)} • C ${utils.fmtNum(m.carb)}
                        </div>
                        <button class="secondary mt8" data-add-meal="${meal.key}">➕ Add only ${meal.title.split(' ')[1]}</button>
                    </div>
                `;
            }
        });
        html += '</div>';
        display.innerHTML = html;
        // Add handlers for add individual meal buttons
        display.querySelectorAll('[data-add-meal]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mealType = btn.getAttribute('data-add-meal');
                cityMenuManager.addMealToDiary(mealType);
            });
        });
    },
    
    addMealToDiary: (mealType) => {
        const city = cityMenuManager.currentCity;
        const day = cityMenuManager.currentDay;
        const menu = (loadedMenuData && loadedMenuData[city]?.[day]) || (cityMenus && cityMenus[city]?.[day]);
        
        if (!menu || !menu[mealType]) {
            utils.showNotif('Dish not found', true);
            return;
        }
        
        const p = profileManager.activeProfile();
        diaryManager.addMealItem(p.id, currentDate, mealType, {...menu[mealType]});
        
        const mealNames = {breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner'};
        utils.showNotif(`${mealNames[mealType]} added to diary`);
    },
    
    addCityMenuToDiary: () => {
        const city = cityMenuManager.currentCity;
        const day = cityMenuManager.currentDay;
        const menu = (loadedMenuData && loadedMenuData[city]?.[day]) || (cityMenus && cityMenus[city]?.[day]);
        
        if (!menu) {
            utils.showNotif('Menu not found', true);
            return;
        }
        
        const p = profileManager.activeProfile();
        const meals = ['breakfast', 'lunch', 'dinner'];
        
        meals.forEach(mealType => {
            if (menu[mealType]) {
                diaryManager.addMealItem(p.id, currentDate, mealType, {...menu[mealType]});
            }
        });
        
        utils.showNotif('Menu added to diary');
        tabManager.switchTab('diary');
    },
    
    setupCityMenuEvents: () => {
        // Button to add menu to diary
        $('#addCityMenuToDiaryBtn')?.addEventListener('click', cityMenuManager.addCityMenuToDiary);
        // CSV load
        $('#loadMenuCSVBtn')?.addEventListener('click', () => {
            $('#menuCSVFileInput')?.click();
        });
        $('#menuCSVFileInput')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                cityMenuManager.loadMenuFromCSV(file);
                e.target.value = '';
            }
        });
        // Initial render of buttons and calendar
        cityMenuManager.renderCityButtons();
        cityMenuManager.renderDayCalendar();
        cityMenuManager.renderCityMenu();
    }
};

/* ===== QUICK PRODUCTS ===== */
const quickProductsManager = {
    currentMeal: 'breakfast',
    editingSlotIndex: null,
    
    fillQuickProfileSelect: () => {
        const sel = $('#quickProfileSelect');
        if (!sel) return;
        sel.innerHTML = '';
        
        appState.profiles.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.emoji} ${p.name}`;
            sel.appendChild(opt);
        });
        
        sel.value = profileManager.activeProfile().id;
    },
    
    setupQuickMealTabs: () => {
        const tabs = $$('#quickMealTabs button');
        tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                tabs.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                quickProductsManager.currentMeal = btn.dataset.meal;
                quickProductsManager.renderQuickSlots();
            });
        });
    },
    
    renderQuickSlots: () => {
        const pid = $('#quickProfileSelect')?.value;
        if (!pid) return;
        
        const profile = appState.profiles.find(p => p.id === pid);
        if (!profile) return;
        
        const products = profile.quickProducts[quickProductsManager.currentMeal] || [];
        const grid = $('#quickSlotsGrid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        for (let i = 0; i < 8; i++) {
            const slot = document.createElement('div');
            slot.className = 'quick-slot';
            slot.setAttribute('data-slot', i);
            
            if (products[i]) {
                slot.classList.add('filled');
                const item = products[i];
                slot.innerHTML = `
                    <div class="quick-slot-number">${i + 1}</div>
                    <button class="quick-slot-remove" data-remove="${i}">×</button>
                    <button class="quick-slot-edit" data-edit="${i}">✎</button>
                    <div class="quick-slot-content">
                        <div class="quick-slot-emoji">${item.emoji || '🍽️'}</div>
                        <div class="quick-slot-name">${item.name}</div>
                        <div class="quick-slot-macros">${Math.round(item.cal)}cal</div>
                    </div>
                `;
            } else {
                slot.innerHTML = `
                    <div class="quick-slot-number">${i + 1}</div>
                    <div class="quick-slot-placeholder">Empty</div>
                `;
            }
            
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                slot.classList.add('dragover');
            });
            
            slot.addEventListener('dragleave', () => {
                slot.classList.remove('dragover');
            });
            
            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                slot.classList.remove('dragover');
                
                try {
                    const foodData = JSON.parse(e.dataTransfer.getData('text/plain'));
                    const slotIndex = parseInt(slot.getAttribute('data-slot'));
                    quickProductsManager.addToSlot(slotIndex, foodData);
                } catch(err) {
                    console.error('Drop error:', err);
                }
            });
            
            grid.appendChild(slot);
        }
        
        // Handlers for delete buttons
        $$('[data-remove]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.getAttribute('data-remove'));
                quickProductsManager.removeFromSlot(idx);
            });
        });
        
        // Handlers for edit buttons
        $$('[data-edit]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.getAttribute('data-edit'));
                quickProductsManager.openEditModal(idx);
            });
        });
    },
    
    openEditModal: (slotIndex) => {
        const pid = $('#quickProfileSelect')?.value;
        if (!pid) return;
        
        const profile = appState.profiles.find(p => p.id === pid);
        if (!profile) return;
        
        const products = profile.quickProducts[quickProductsManager.currentMeal] || [];
        const item = products[slotIndex];
        if (!item) return;
        
        quickProductsManager.editingSlotIndex = slotIndex;
        
        const modal = $('#editQuickProductModal');
        $('#editQuickName').value = item.name || '';
        $('#editQuickPortion').value = item.portion || 100;
        $('#editQuickCal').value = item.cal || 0;
        $('#editQuickPr').value = item.pr || 0;
        $('#editQuickFat').value = item.fat || 0;
        $('#editQuickCarb').value = item.carb || 0;
        $('#editQuickFiber').value = item.fiber || 0;
        $('#editQuickSugar').value = item.sugar || 0;
        $('#editQuickSodium').value = item.sodium || 0;
        
        modal.classList.add('active');
    },
    
    saveEditedQuickProduct: () => {
        const pid = $('#quickProfileSelect')?.value;
        if (!pid || quickProductsManager.editingSlotIndex === null) return;
        
        const profile = appState.profiles.find(p => p.id === pid);
        if (!profile) return;
        
        const products = profile.quickProducts[quickProductsManager.currentMeal] || [];
        const idx = quickProductsManager.editingSlotIndex;
        
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
        quickProductsManager.renderQuickSlots();
        addManager.renderQuickAddGrid();
        
        $('#editQuickProductModal').classList.remove('active');
        quickProductsManager.editingSlotIndex = null;
        utils.showNotif('Quick product updated');
    },
    
    clearQuickProducts: () => {
        const pid = $('#quickProfileSelect')?.value;
        if (!pid) return;
        
        if (!confirm('Clear all quick products for this meal?')) return;
        
        const profile = appState.profiles.find(p => p.id === pid);
        if (!profile) return;
        
        profile.quickProducts[quickProductsManager.currentMeal] = [];
        storage.saveState();
        quickProductsManager.renderQuickSlots();
        addManager.renderQuickAddGrid();
        utils.showNotif('Quick products cleared');
    },
    
    addToSlot: (slotIndex, foodData) => {
        const pid = $('#quickProfileSelect')?.value;
        if (!pid) return;
        
        const profile = appState.profiles.find(p => p.id === pid);
        if (!profile) return;
        
        if (!profile.quickProducts[quickProductsManager.currentMeal]) {
            profile.quickProducts[quickProductsManager.currentMeal] = [];
        }
        
        profile.quickProducts[quickProductsManager.currentMeal][slotIndex] = {
            name: foodData.name,
            emoji: foodData.emoji || '🍽️',
            portion: 100,
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
        quickProductsManager.renderQuickSlots();
        addManager.renderQuickAddGrid();
        utils.showNotif('Product added');
    },
    
    removeFromSlot: (slotIndex) => {
        const pid = $('#quickProfileSelect')?.value;
        if (!pid) return;
        
        const profile = appState.profiles.find(p => p.id === pid);
        if (!profile) return;
        
        profile.quickProducts[quickProductsManager.currentMeal][slotIndex] = null;
        profile.quickProducts[quickProductsManager.currentMeal] = 
            profile.quickProducts[quickProductsManager.currentMeal].filter(x => x !== null);
        
        storage.saveState();
        quickProductsManager.renderQuickSlots();
        addManager.renderQuickAddGrid();
        utils.showNotif('Product removed');
    },

    /**
     * Load quick products from JSON file
     * Expected format: { profile: string, quickProducts: {breakfast:[], lunch:[], dinner:[], snack:[]} }
     */
    loadQuickProductsFromJSON: (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data || !data.quickProducts) {
                    throw new Error('Invalid file format');
                }
                const pid = $('#quickProfileSelect')?.value;
                if (!pid) return;
                const profile = appState.profiles.find(p => p.id === pid);
                if (!profile) return;
                if (confirm(`Replace all quick products for ${profile.name}?`)) {
                    // When replacing guarantee allergens and vitamins in elements
                    const qp = data.quickProducts;
                    ['breakfast','lunch','dinner','snack'].forEach(meal => {
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
                    quickProductsManager.renderQuickSlots();
                    addManager.renderQuickAddGrid();
                    utils.showNotif('Quick products imported');
                }
            } catch (err) {
                utils.showNotif('Import error: ' + err.message, true);
            }
        };
        reader.readAsText(file, 'utf-8');
    },

    /**
     * Export quick products to JSON file
     */
    exportQuickProductsToJSON: () => {
        const pid = $('#quickProfileSelect')?.value;
        if (!pid) return;
        const profile = appState.profiles.find(p => p.id === pid);
        if (!profile) return;
        const data = {
            profile: profile.name,
            quickProducts: profile.quickProducts
        };
        utils.download(`quick_products_${profile.name}.json`, JSON.stringify(data, null, 2), 'application/json');
        utils.showNotif('Quick products exported');
    },

    /**
     * Renders list of user saved products.
     * If list is empty, shows empty state.
     */
    renderMyProducts: () => {
        const list = document.getElementById('myProductsList');
        if (!list) return;
        const myProducts = appState.userFoods || [];
        if (myProducts.length === 0) {
            list.innerHTML = '<div class="empty-state">You have no saved products</div>';
            return;
        }
        list.innerHTML = myProducts.map((product, index) => `
            <div class="my-product-item">
                <div class="my-product-icon">${product.emoji || '🍽️'}</div>
                <div class="my-product-info">
                    <div class="my-product-name">${product.name}</div>
                    <div class="my-product-meta">
                        ${product.cal} cal | 
                        P: ${product.pr}g | 
                        F: ${product.fat}g | 
                        C: ${product.carb}g
                    </div>
                </div>
                <div class="my-product-actions">
                    <button class="icon-btn" onclick="quickProductsManager.editMyProduct(${index})" title="Edit">
                        ✏️
                    </button>
                    <button class="icon-btn danger" onclick="quickProductsManager.deleteMyProduct(${index})" title="Delete">
                        🗑️
                    </button>
                </div>
            </div>
        `).join('');
    },

    /**
     * Deletes product from user library.
     * Shows confirmation and updates UI.
     */
    deleteMyProduct: (index) => {
        if (!confirm('Delete this product from library?')) return;
        if (!Array.isArray(appState.userFoods)) return;
        appState.userFoods.splice(index, 1);
        storage.saveState();
        quickProductsManager.renderMyProducts();
        quickProductsManager.renderFoodLibrary();
        utils.showNotif('Product deleted from library');
    },

    /**
     * Edits product in user library.
     * Moves data to manual input form and deletes original record.
     */
    editMyProduct: (index) => {
        const product = (appState.userFoods || [])[index];
        if (!product) return;
        // Fill manual input form
        const nameInput = document.getElementById('customName');
        const portionInput = document.getElementById('customPortion');
        const calInput = document.getElementById('customCal');
        const prInput = document.getElementById('customPr');
        const fatInput = document.getElementById('customFat');
        const carbInput = document.getElementById('customCarb');
        const fiberInput = document.getElementById('customFiber');
        const sugarInput = document.getElementById('customSugar');
        const sodiumInput = document.getElementById('customSodium');
        if (nameInput) nameInput.value = product.name || '';
        if (portionInput) portionInput.value = 100;
        if (calInput) calInput.value = product.cal || 0;
        if (prInput) prInput.value = product.pr || 0;
        if (fatInput) fatInput.value = product.fat || 0;
        if (carbInput) carbInput.value = product.carb || 0;
        if (fiberInput) fiberInput.value = product.fiber || 0;
        if (sugarInput) sugarInput.value = product.sugar || 0;
        if (sodiumInput) sodiumInput.value = product.sodium || 0;
        // Delete old product
        appState.userFoods.splice(index, 1);
        storage.saveState();
        quickProductsManager.renderMyProducts();
        // Switch to diary tab and scroll to form
        tabManager.switchTab('diary');
        setTimeout(() => {
            document.getElementById('customName')?.scrollIntoView({behavior: 'smooth', block: 'center'});
        }, 100);
        utils.showNotif('Edit product and click \"Save product\"');
    },
    
    renderFoodLibrary: () => {
        const library = $('#quickFoodLibrary');
        if (!library) return;
        
        const search = $('#quickFoodSearch');
        const allFoods = [...foodDatabase, ...(appState.userFoods || [])];
        
        const query = search?.value?.toLowerCase() || '';
        const filtered = query.length >= 2 ? 
            allFoods.filter(f => f.name.toLowerCase().includes(query)) : 
            allFoods;
        
        library.innerHTML = '';
        
        filtered.forEach(food => {
            const item = document.createElement('div');
            item.className = 'food-item';
            item.draggable = true;
            item.innerHTML = `
                <div>${food.emoji || '🍽️'} ${food.name}</div>
                <div class="small muted">${food.cal} cal</div>
            `;
            
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify(food));
            });
            
            library.appendChild(item);
        });
    },
    
    setupQuickProductsEvents: () => {
        const profileSel = $('#quickProfileSelect');
        if (profileSel) {
            profileSel.addEventListener('change', () => {
                quickProductsManager.renderQuickSlots();
            });
        }
        
        const searchInput = $('#quickFoodSearch');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                quickProductsManager.renderFoodLibrary();
            });
        }
        
        const clearBtn = $('#clearQuickProductsBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                quickProductsManager.clearQuickProducts();
            });
        }
        
        $('#saveEditQuickBtn')?.addEventListener('click', () => {
            quickProductsManager.saveEditedQuickProduct();
        });
        
        $('#closeEditQuickModalBtn')?.addEventListener('click', () => {
            $('#editQuickProductModal').classList.remove('active');
            quickProductsManager.editingSlotIndex = null;
        });
        
        $('#cancelEditQuickBtn')?.addEventListener('click', () => {
            $('#editQuickProductModal').classList.remove('active');
            quickProductsManager.editingSlotIndex = null;
        });
        
        // JSON export/import button
        const loadBtn = $('#loadQuickProductsJSONBtn');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => {
                $('#quickProductsJSONInput')?.click();
            });
        }
        const exportBtn2 = $('#exportQuickProductsJSONBtn');
        if (exportBtn2) {
            exportBtn2.addEventListener('click', () => {
                quickProductsManager.exportQuickProductsToJSON();
            });
        }
        const jsonInput = $('#quickProductsJSONInput');
        if (jsonInput) {
            jsonInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    quickProductsManager.loadQuickProductsFromJSON(file);
                    e.target.value = '';
                }
            });
        }
    }
};
/* ===== ANALYTICS ===== */
const analyticsManager = {
    last7Dates: () => {
        const arr = [];
        let d = new Date(currentDate);
        for (let i = 6; i >= 0; i--) {
            const di = new Date(d);
            di.setDate(d.getDate() - i);
            arr.push(utils.todayStr(di));
        }
        return arr;
    },
    
    destroyCharts: () => {
        Object.keys(charts).forEach(key => {
            if (charts[key]) {
                charts[key].destroy();
                charts[key] = null;
            }
        });
    },
    
    renderCaloriesChart: () => {
        const ctx = $('#caloriesChart');
        if (!ctx) return;
        
        const pid = profileManager.activeProfile().id;
        const dates = analyticsManager.last7Dates();
        const vals = dates.map(ds => diaryManager.totalsForDay(pid, ds).cal);
        const labels = dates.map(ds => {
            const d = new Date(ds);
            return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
        });
        
        if (charts.calories) charts.calories.destroy();
        
        charts.calories = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Calories',
                    data: vals,
                    backgroundColor: 'rgba(37, 99, 235, 0.8)',
                    borderColor: 'rgba(37, 99, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value + ' cal';
                            }
                        }
                    }
                }
            }
        });
    },
    
    renderMacrosChart: () => {
        const ctx = $('#macrosChart');
        if (!ctx) return;
        
        const t = diaryManager.totalsForDay(profileManager.activeProfile().id, currentDate);
        const proteinCal = (t.pr || 0) * 4;
        const fatCal = (t.fat || 0) * 9;
        const carbCal = (t.carb || 0) * 4;
        
        if (charts.macros) charts.macros.destroy();
        
        charts.macros = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Protein', 'Fat', 'Carbs'],
                datasets: [{
                    data: [proteinCal, fatCal, carbCal],
                    backgroundColor: [
                        'rgba(37, 99, 235, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(16, 185, 129, 0.8)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    },
    
    // Display micronutrients and vitamins for current day
    renderVitamins: () => {
        // Destroy old vitamins chart if exists
        if (charts.vitamins) {
            charts.vitamins.destroy();
            charts.vitamins = null;
        }
        const card = $('#vitaminsCard');
        if (!card) return;
        // Show card only if micronutrients module is enabled
        if (!appState.settings.modules.micros) {
            card.style.display = 'none';
            return;
        }
        card.style.display = 'block';
        const p = profileManager.activeProfile();
        const t = diaryManager.totalsForDay(p.id, currentDate);
        const g = p.goalsMicros || {fiber:25, sugar:50, sodium:2300};
        // Update values and progress bars
        const update = (val, goal, barId, valId, unit) => {
            const pct = goal > 0 ? Math.min(100, Math.round(utils.clamp01(val / goal) * 100)) : 0;
            const bar = document.getElementById(barId);
            const valEl = document.getElementById(valId);
            if (bar) bar.style.width = pct + '%';
            if (valEl) valEl.textContent = `${utils.fmtNum(val)} / ${goal} ${unit}`;
        };
        update(t.fiber || 0, g.fiber || 25, 'fiberBar', 'fiberValue', 'g');
        update(t.sugar || 0, g.sugar || 50, 'sugarBar', 'sugarValue', 'g');
        update(t.sodium || 0, g.sodium || 2300, 'sodiumBar', 'sodiumValue', 'mg');
        // Collect vitamins list from all meals of the day
        const dayObj = diaryManager.dayObj(currentDate, p.id);
        const allMeals = [...dayObj.meals.breakfast, ...dayObj.meals.lunch, ...dayObj.meals.dinner, ...dayObj.meals.snack];
        const vitaminsSet = new Set();
        allMeals.forEach(it => {
            if (it.vitamins) {
                it.vitamins.split(',').map(v => v.trim()).filter(Boolean).forEach(v => vitaminsSet.add(v));
            }
        });
        const listEl = document.getElementById('vitaminsList');
        if (listEl) {
            listEl.innerHTML = '';
            const arr = [...vitaminsSet].filter(v => v.length > 0);
            if (arr.length === 0) {
                listEl.innerHTML = '<div class="muted">No vitamin data</div>';
            } else {
                arr.forEach(v => {
                    const span = document.createElement('span');
                    span.className = 'pill';
                    span.textContent = v;
                    listEl.appendChild(span);
                });
            }
        }
    },

    // Old function kept for compatibility: calls new render
    renderVitaminsChart: () => {
        analyticsManager.renderVitamins();
    },
    
    renderMonthStats: () => {
        const pid = profileManager.activeProfile().id;
        const now = new Date(currentDate);
        let days = 0, calSum = 0;
        
        for (let i = 0; i < 30; i++) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const ds = utils.todayStr(d);
            const has = appState.diary[ds] && appState.diary[ds][pid] &&
                Object.values(appState.diary[ds][pid].meals).some(a => a.length > 0);
            
            if (has) {
                days++;
                calSum += diaryManager.totalsForDay(pid, ds).cal;
            }
        }
        
        $('#monthStats').innerHTML = `
            <div>Filled days (30d): <b>${days}</b></div>
            <div>Average calories: <b>${days ? Math.round(calSum / days) : 0} cal</b></div>
        `;
    },
    
    /**
     * Renders extended statistics for last 30 days.
     * Shows averages, number of days with goal achieved,
     * best and worst day, and PFC balance.
     */
    renderStats: () => {
        const box = document.getElementById('monthStats');
        if (!box) return;
        const p = profileManager.activeProfile();
        // Collect last 30 days
        const last30Days = [];
        for (let i = 29; i >= 0; i--) {
            const date = utils.shiftDate(currentDate, -i);
            last30Days.push(date);
        }
        const data = last30Days.map(date => {
            const totals = diaryManager.totalsForDay(p.id, date);
            return {date, ...totals};
        });
        // Averages
        const avgCal = data.reduce((sum, d) => sum + (d.cal || 0), 0) / data.length;
        const avgPr = data.reduce((sum, d) => sum + (d.pr || 0), 0) / data.length;
        const avgFat = data.reduce((sum, d) => sum + (d.fat || 0), 0) / data.length;
        const avgCarb = data.reduce((sum, d) => sum + (d.carb || 0), 0) / data.length;
        // Number of days with calorie goal achieved (80%-120%)
        const goalDays = data.filter(d => {
            const calGoal = p.goals.cal || 1;
            const calPercent = (d.cal / calGoal) * 100;
            return calPercent >= 80 && calPercent <= 120;
        }).length;
        // Best and worst day by calorie goal deviation
        const bestDay = data.reduce((best, d) => {
            const calGoal = p.goals.cal || 1;
            return Math.abs((d.cal || 0) - calGoal) < Math.abs((best.cal || 0) - calGoal) ? d : best;
        });
        const worstDay = data.reduce((worst, d) => {
            const calGoal = p.goals.cal || 1;
            return Math.abs((d.cal || 0) - calGoal) > Math.abs((worst.cal || 0) - calGoal) ? d : worst;
        });
        // Generate HTML
        box.innerHTML = `
            <div class="stats-summary">
                <h4>📊 30-day Statistics</h4>
                <div class="stat-grid">
                    <div class="stat-item">
                        <div class="stat-label">Average Calories</div>
                        <div class="stat-value">${Math.round(avgCal)} cal</div>
                        <div class="stat-sub">Goal: ${p.goals.cal} cal</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Average Protein</div>
                        <div class="stat-value">${Math.round(avgPr)} g</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Days with Goal Achieved</div>
                        <div class="stat-value">${goalDays} / 30</div>
                        <div class="stat-sub">${Math.round(goalDays / 30 * 100)}% success</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Best Day</div>
                        <div class="stat-value">${bestDay.date}</div>
                        <div class="stat-sub">${Math.round(bestDay.cal)} cal</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">PFC Balance</div>
                        <div class="stat-value">
                            P: ${Math.round(avgPr)}g / 
                            F: ${Math.round(avgFat)}g / 
                            C: ${Math.round(avgCarb)}g
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renders extended achievements for current profile.
     * Checks diary filling streaks, water norm, PFC balance and diet variety.
     */
    renderAchievements: () => {
        const box = document.getElementById('achievements');
        if (!box) return;
        const p = profileManager.activeProfile();
        const achievements = [];
        // Check consecutive filled days streak (up to 30 days ago)
        let streak = 0;
        for (let i = 0; i < 30; i++) {
            const date = utils.shiftDate(currentDate, -i);
            const totals = diaryManager.totalsForDay(p.id, date);
            if (totals.cal > 0) streak++;
            else break;
        }
        if (streak >= 7) {
            achievements.push({
                icon: '🔥',
                title: `${streak} Day Streak!`,
                desc: 'Keeping diary without gaps'
            });
        }
        // Check water norm for today
        const todayObj = diaryManager.dayObj(currentDate, p.id);
        if (todayObj.liquid) {
            const waterItem = todayObj.liquid.find(x => x.type === 'water');
            if (waterItem && waterItem.consumed >= waterItem.goal) {
                achievements.push({
                    icon: '💧',
                    title: 'Water Balance',
                    desc: 'Drank daily water norm'
                });
            }
        }
        // Check PFC balance for today
        const totals = diaryManager.totalsForDay(p.id, currentDate);
        const prPercent = (totals.pr || 0) / (p.goals.pr || 1) * 100;
        const fatPercent = (totals.fat || 0) / (p.goals.fat || 1) * 100;
        const carbPercent = (totals.carb || 0) / (p.goals.carb || 1) * 100;
        if (
            prPercent >= 90 && prPercent <= 110 &&
            fatPercent >= 90 && fatPercent <= 110 &&
            carbPercent >= 90 && carbPercent <= 110
        ) {
            achievements.push({
                icon: '⚖️',
                title: 'Perfect Balance',
                desc: 'PFC within goals'
            });
        }
        // Check diet variety for today
        const allMeals = [
            ...todayObj.meals.breakfast,
            ...todayObj.meals.lunch,
            ...todayObj.meals.dinner,
            ...todayObj.meals.snack
        ];
        const uniqueProducts = new Set(allMeals.map(m => m.name)).size;
        if (uniqueProducts >= 10) {
            achievements.push({
                icon: '🌈',
                title: 'Variety',
                desc: `${uniqueProducts} different products today`
            });
        }
        // Show achievements or empty state message
        box.innerHTML = achievements.length === 0
            ? '<div class="empty-state">Continue keeping diary to get achievements!</div>'
            : achievements.map(a => `
                <div class="achievement-card">
                    <div class="achievement-icon">${a.icon}</div>
                    <div class="achievement-info">
                        <div class="achievement-title">${a.title}</div>
                        <div class="achievement-desc">${a.desc}</div>
                    </div>
                </div>
            `).join('');
    },
    
    renderMicrosCard: () => {
        const card = $('#microsCard');
        card.style.display = appState.settings.modules.micros ? 'block' : 'none';
        if (!appState.settings.modules.micros) return;
        
        const p = profileManager.activeProfile();
        const t = diaryManager.totalsForDay(p.id, currentDate);
        const g = p.goalsMicros || {fiber:25, sugar:50, sodium:2300};
        
        const rows = [
            {name:'Fiber', val:t.fiber||0, goal:g.fiber||25, unit:'g'},
            {name:'Sugar', val:t.sugar||0, goal:g.sugar||50, unit:'g'},
            {name:'Sodium', val:t.sodium||0, goal:g.sodium||2300, unit:'mg'}
        ];
        
        const box = $('#microsWrap');
        box.innerHTML = '';
        
        rows.forEach(r => {
            const pct = r.goal > 0 ? Math.round(utils.clamp01(r.val / r.goal) * 100) : 0;
            const div = document.createElement('div');
            div.className = 'mt8';
            div.innerHTML = `
                <div class="stat-label">${r.name}: <b>${utils.fmtNum(r.val)}</b> / ${r.goal} ${r.unit}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${pct}%">
                        <span class="progress-text">${pct}%</span>
                    </div>
                </div>
            `;
            box.appendChild(div);
        });
    },
    
    renderAnalytics: () => {
        analyticsManager.destroyCharts();
        analyticsManager.renderCaloriesChart();
        analyticsManager.renderMacrosChart();
        analyticsManager.renderVitaminsChart();
        // New extended 30-day statistics
        analyticsManager.renderStats();
        // New achievements
        analyticsManager.renderAchievements();
        analyticsManager.renderMicrosCard();
    }
};

/* ===== SHOPPING ===== */
const shoppingManager = {
    generateShopping: (days, useMenu = false, menuDays = 0) => {
        const pid = profileManager.activeProfile().id;
        const map = new Map();
        
        for (let i = 0; i < days; i++) {
            const ds = utils.shiftDate(currentDate, i);
            const d = diaryManager.dayObj(ds, pid);
            const all = [...d.meals.breakfast, ...d.meals.lunch, ...d.meals.dinner, ...d.meals.snack];
            
            all.forEach(x => {
                const parts = x.name.split(/[,+]/).map(s => s.trim()).filter(Boolean);
                parts.forEach(p => map.set(p, (map.get(p) || 0) + 1));
            });
        }
        
        if (useMenu && appState.currentMenu) {
            for (let i = 0; i < menuDays; i++) {
                const day = (i % Object.keys(appState.currentMenu.days).length) + 1;
                const dayMenu = appState.currentMenu.days[day];
                if (dayMenu) {
                    Object.values(dayMenu).forEach(meal => {
                        const parts = meal.name.split(/[,+]/).map(s => s.trim()).filter(Boolean);
                        parts.forEach(p => map.set(p, (map.get(p) || 0) + 1));
                    });
                }
            }
        }
        
        const items = [...map.entries()].sort((a, b) => b[1] - a[1]);
        shoppingManager.renderShoppingList(items);
        return items;
    },
    
    renderShoppingList: (items) => {
        const box = $('#shoppingListBox');
        box.innerHTML = '';
        
        if (items.length === 0) {
            box.innerHTML = '<div class="muted">List is empty</div>';
            return;
        }
        
        items.forEach(([name, cnt]) => {
            const div = document.createElement('div');
            div.className = 'meal-entry';
            div.innerHTML = `
                <div class="meal-info">
                    <div class="meal-title">
                        <input type="checkbox" class="shopping-checkbox" data-item="${name}">
                        • ${name}
                    </div>
                    <div class="meal-details">quantity: ${cnt}</div>
                </div>
            `;
            box.appendChild(div);
        });
        
        shoppingManager.renderShoppingCategories(items);
    },
    
    renderShoppingCategories: (items) => {
        const box = $('#shoppingCategories');
        box.innerHTML = '';
        
        const categorized = {};
        items.forEach(([name, cnt]) => {
            let category = 'Other';
            for (const [cat, foods] of Object.entries(foodCategories)) {
                if (foods.some(f => name.includes(f))) {
                    category = cat;
                    break;
                }
            }
            if (!categorized[category]) categorized[category] = [];
            categorized[category].push({name, cnt});
        });
        
        Object.keys(categorized).sort().forEach(cat => {
            const categoryDiv = document.createElement('div');
            categoryDiv.innerHTML = `<h4>${cat}</h4>`;
            categorized[cat].forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'small';
                itemDiv.textContent = `• ${item.name} (${item.cnt})`;
                categoryDiv.appendChild(itemDiv);
            });
            box.appendChild(categoryDiv);
        });
    },
    
    setupShoppingEvents: () => {
        $('#genShoppingBtn')?.addEventListener('click', () => {
            const d = +$('#shoppingDays').value || 1;
            const useMenu = +$('#shoppingMenuDays').value > 0;
            const menuDays = +$('#shoppingMenuDays').value;
            shoppingManager.generateShopping(d, useMenu, menuDays);
        });
        
        $('#smartShoppingBtn')?.addEventListener('click', () => {
            const d = +$('#shoppingDays').value || 1;
            const items = shoppingManager.generateShopping(d);
            const smartItems = shoppingManager.smartCombine(items);
            shoppingManager.renderShoppingList(smartItems);
            utils.showNotif('Smart list generated');
        });
        
        $('#exportShoppingBtn')?.addEventListener('click', () => {
            const d = +$('#shoppingDays').value || 1;
            const items = shoppingManager.generateShopping(d) || [];
            const text = items.map(([n, c]) => `- ${n} ×${c}`).join('\n');
            utils.download(`shopping_${currentDate}_${d}d.txt`, text, 'text/plain');
        });
        
        $('#checkAllBtn')?.addEventListener('click', () => {
            $$('.shopping-checkbox').forEach(cb => cb.checked = true);
        });
        
        $('#uncheckAllBtn')?.addEventListener('click', () => {
            $$('.shopping-checkbox').forEach(cb => cb.checked = false);
        });
        
        $('#clearCheckedBtn')?.addEventListener('click', () => {
            const checked = $$('.shopping-checkbox:checked');
            checked.forEach(cb => {
                const item = cb.closest('.meal-entry');
                item.remove();
            });
            utils.showNotif('Checked items removed');
        });
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
            if (!found) {
                combined.set(name, cnt);
            }
        });
        return [...combined.entries()].sort((a, b) => b[1] - a[1]);
    }
};

/* REMAINING MANAGERS (liquid, recipes, week, settings) remain unchanged from previous version */
/* To be continued... */

/* ===== MAIN APPLICATION ===== */
const app = {
    init() {
        storage.loadState();
        profileManager.buildUserSelector();
        themeManager.bindSystemThemeListener();
        themeManager.applyTheme(appState.settings.theme || 'light');
        tabManager.buildTabs();
        
        app.setupEventListeners();
        
        cityMenuManager.setupCityMenuEvents();
        quickProductsManager.setupQuickProductsEvents();
        addManager.setupCustomInput();
        shoppingManager.setupShoppingEvents();
        liquidManager.setupLiquidEvents();
        recipesManager.setupRecipesEvents();
        weekManager.setupWeekEvents();
        settingsManager.setupSettingsEvents();
        
        app.renderAll();
        weekStart = utils.mondayOf(currentDate);
    },
    
    setupEventListeners() {
        $('#prevDayBtn').addEventListener('click', () => {
            currentDate = utils.shiftDate(currentDate, -1);
            diaryManager.renderDiary();
        });
        
        $('#nextDayBtn').addEventListener('click', () => {
            currentDate = utils.shiftDate(currentDate, 1);
            diaryManager.renderDiary();
        });
        
        $('#closeEditModalBtn').addEventListener('click', () => {
            $('#editMealModal').classList.remove('active');
            editContext = null;
        });
        
        $('#closeFullEditModalBtn').addEventListener('click', () => {
            $('#fullEditModal').classList.remove('active');
            editContext = null;
        });
        
        $('#cancelFullEditBtn').addEventListener('click', () => {
            $('#fullEditModal').classList.remove('active');
            editContext = null;
        });
        
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('active');
                if (e.target.id === 'editMealModal') editContext = null;
                if (e.target.id === 'editQuickProductModal') quickProductsManager.editingSlotIndex = null;
            }
        });
    },
    
    renderAll() {
        app.renderTab(activeTabId);
    },
    
    renderTab(id) {
        switch(id) {
            case 'diary':
                diaryManager.renderDiary();
                break;
            case 'add':
                addManager.buildMealChips();
                addManager.renderQuickAddGrid();
                addManager.setupSearch();
                break;
            case 'menu':
                cityMenuManager.renderCityMenu();
                quickProductsManager.fillQuickProfileSelect();
                quickProductsManager.setupQuickMealTabs();
                quickProductsManager.renderQuickSlots();
                quickProductsManager.renderFoodLibrary();
                // Show user saved products list in menu section
                quickProductsManager.renderMyProducts();
                break;
            case 'analytics':
                analyticsManager.renderAnalytics();
                break;
            case 'shopping':
                // shoppingManager already set up via events
                break;
            case 'water':
                liquidManager.renderLiquid();
                break;
            case 'recipes':
                recipesManager.renderRecipesList();
                recipesManager.fillRecipesSelect();
                recipesManager.setupRecipeBuilder();
                break;
            case 'week':
                weekManager.buildWeekTable();
                break;
            case 'settings':
                settingsManager.renderProfiles();
                settingsManager.renderGoals();
                settingsManager.renderModules();
                // Render allergies list and set up handlers for adding/removing
                settingsManager.renderAllergiesList();
                settingsManager.setupAllergenEvents();
                settingsManager.renderMicrosGoals();
                settingsManager.fillCalcProfiles();
                settingsManager.renderAppearance();
                break;
        }
    }
};

/* ===== LIQUIDS ===== */
const liquidManager = {
    // Calendar state for water module: current year and month
    calendarState: {year: new Date().getFullYear(), month: new Date().getMonth()},
    getLiquidDay: (pid, ds) => {
        const day = diaryManager.dayObj(ds, pid);
        if (!day.liquid) {
            const profile = appState.profiles.find(p => p.id === pid);
            day.liquid = JSON.parse(JSON.stringify(profile.liquid?.items || liquidManager.getDefaultLiquidItems()));
        }
        return day.liquid;
    },

    getDefaultLiquidItems: () => {
        // Predefined drinks include id, name, emoji and hydration factor.
        // If name/emoji fields are not used in saved state, code will use type as name.
        return [
            {
                id: 'water',
                type: 'preset',
                name: 'Water',
                emoji: '💧',
                enabled: true,
                goal: 1500,
                consumed: 0,
                color: '#06b6d4',
                hydrationFactor: 1.0
            },
            {
                id: 'coffee',
                type: 'preset',
                name: 'Coffee',
                emoji: '☕',
                enabled: false,
                goal: 300,
                consumed: 0,
                color: '#8B4513',
                hydrationFactor: 0.7
            },
            {
                id: 'juice',
                type: 'preset',
                name: 'Juice',
                emoji: '🧃',
                enabled: false,
                goal: 200,
                consumed: 0,
                color: '#FFA500',
                hydrationFactor: 0.8
            },
            {
                id: 'tea',
                type: 'preset',
                name: 'Tea',
                emoji: '🍵',
                enabled: false,
                goal: 300,
                consumed: 0,
                color: '#D2691E',
                hydrationFactor: 0.9
            }
        ];
    },

    setLiquidDay: (pid, ds, liquidData) => {
        const day = diaryManager.dayObj(ds, pid);
        day.liquid = liquidData;
        storage.saveState();
        liquidManager.renderLiquid();
    },

    addLiquid: (type, ml) => {
        const p = profileManager.activeProfile();
        const current = liquidManager.getLiquidDay(p.id, currentDate);
        const item = current.find(x => x.type === type);
        if (item) {
            // Automatically enable type if it was disabled
            if (!item.enabled) {
                item.enabled = true;
            }
            // Increase consumed volume
            item.consumed += ml;
            // Save state and redraw chart
            liquidManager.setLiquidDay(p.id, currentDate, current);
            utils.showNotif(`Added ${ml}ml ${liquidManager.getLiquidTypeName(type)}`);
        } else {
            // If drink type not found, show error notification
            utils.showNotif('Drink type not found', true);
        }
    },

    getLiquidTypeName: (type) => {
        const names = {water: 'Water', coffee: 'Coffee', juice: 'Juice', tea: 'Tea'};
        return names[type] || type;
    },

    resetLiquid: () => {
        const p = profileManager.activeProfile();
        const current = liquidManager.getLiquidDay(p.id, currentDate);
        current.forEach(item => {
            item.consumed = 0;
        });
        liquidManager.setLiquidDay(p.id, currentDate, current);
        utils.showNotif('Reset');
    },

    saveLiquidGoals: () => {
        // Function to save settings for water module.
        // New version doesn't use separate input elements for settings,
        // so just save current profile state and notify user.
        storage.saveState();
        utils.showNotif('Settings saved');
    },

    renderLiquid: () => {
        // Don't render if water module is disabled
        if (!appState.settings.modules.water) return;

        const p = profileManager.activeProfile();
        const liquidData = liquidManager.getLiquidDay(p.id, currentDate);

        // Update main progress panel, indicators, types list, drink selector and calendar
        liquidManager.updateProgressDisplay(liquidData);
        liquidManager.renderDrinkIndicators(liquidData);
        liquidManager.renderDrinkTypes(liquidData);
        liquidManager.renderDrinkSelect(liquidData);
        liquidManager.renderCalendar();

        // Update tooltips for old quick add drink buttons if they exist
        document.querySelectorAll('.liquid-btn').forEach(btn => {
            const btnType = btn.dataset.type;
            const item = liquidData.find(x => (x.id || x.type) === btnType);
            if (item && !item.enabled) {
                btn.classList.add('liquid-disabled');
                btn.setAttribute('title', 'Type disabled. Click to enable and add.');
            } else {
                btn.classList.remove('liquid-disabled');
                btn.removeAttribute('title');
            }
        });
    },

    renderLiquidChart: () => {
        const ctx = $('#liquidChart');
        if (!ctx) return;

        const p = profileManager.activeProfile();
        const liquidData = liquidManager.getLiquidDay(p.id, currentDate).filter(x => x.enabled);

        if (liquidData.length === 0) {
            ctx.innerHTML = '<div class="empty-state">Enable drink types in settings</div>';
            if (charts.liquid) {
                charts.liquid.destroy();
                charts.liquid = null;
            }
            return;
        }

        const labels = liquidData.map(x => {
            const types = {water: 'Water', coffee: 'Coffee', juice: 'Juice', tea: 'Tea'};
            return types[x.type] || x.type;
        });

        const consumed = liquidData.map(x => x.consumed);
        const goals = liquidData.map(x => x.goal);
        const colors = liquidData.map(x => x.color);

        if (charts.liquid) charts.liquid.destroy();

        charts.liquid = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Drank (ml)',
                        data: consumed,
                        backgroundColor: colors,
                        borderColor: colors,
                        borderWidth: 1
                    },
                    {
                        label: 'Goal (ml)',
                        data: goals,
                        backgroundColor: colors.map(c => c + '20'),
                        borderColor: colors,
                        borderWidth: 1,
                        type: 'line',
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'ml' }
                    }
                }
            }
        });
    },

    setupLiquidEvents: () => {
        // Input handler for volume slider: updates selected amount display
        document.addEventListener('input', (e) => {
            if (e.target && e.target.id === 'waterVolumeSlider') {
                const val = parseInt(e.target.value) || 0;
                const disp = $('#waterVolumeDisplay');
                if (disp) disp.textContent = val + ' ml';
            }
        });

        // Delegate clicks for water module elements
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (!target) return;
            // Quick presets: set slider value and display
            if (target.classList.contains('preset-btn')) {
                const amount = parseInt(target.dataset.amount) || 0;
                const slider = $('#waterVolumeSlider');
                if (slider) {
                    slider.value = amount;
                    const disp = $('#waterVolumeDisplay');
                    if (disp) disp.textContent = amount + ' ml';
                }
            }
            // Set custom amount via button
            else if (target.id === 'waterSetCustomBtn') {
                const input = $('#waterCustomInput');
                const val = parseInt(input?.value) || 0;
                const slider = $('#waterVolumeSlider');
                if (val > 0 && slider) {
                    slider.value = val;
                    const disp = $('#waterVolumeDisplay');
                    if (disp) disp.textContent = val + ' ml';
                }
            }
            // Add drink by selected type and amount
            else if (target.id === 'waterAddBtn') {
                const amount = parseInt($('#waterVolumeSlider')?.value) || 0;
                const drinkId = $('#waterDrinkSelect')?.value;
                if (amount > 0 && drinkId) {
                    liquidManager.addLiquid(drinkId, amount);
                }
            }
            // Toggle display of new drink type form
            else if (target.id === 'addDrinkTypeBtn') {
                const form = $('#newDrinkForm');
                if (form) {
                    form.style.display = (form.style.display === 'none' || form.style.display === '') ? 'block' : 'none';
                }
            }
            // Cancel new drink creation
            else if (target.id === 'cancelNewDrinkBtn') {
                const form = $('#newDrinkForm');
                if (form) form.style.display = 'none';
            }
            // Save new drink
            else if (target.id === 'saveNewDrinkBtn') {
                const nameEl = $('#newDrinkName');
                const emojiEl = $('#newDrinkEmoji');
                const colorEl = $('#newDrinkColor');
                const goalEl = $('#newDrinkGoal');
                const hydrateEl = $('#newDrinkHydration');
                const name = nameEl?.value.trim();
                const emoji = (emojiEl?.value.trim()) || '🥤';
                const color = colorEl?.value || '#06b6d4';
                const goalVal = parseInt(goalEl?.value) || 0;
                let hydration = parseFloat(hydrateEl?.value);
                if (isNaN(hydration)) hydration = 0.7;
                if (hydration < 0.3) hydration = 0.3;
                if (hydration > 1.0) hydration = 1.0;
                if (name) {
                    const p = profileManager.activeProfile();
                    if (!p.liquid || !Array.isArray(p.liquid.items)) {
                        p.liquid = {totalGoal: 2000, items: []};
                    }
                    const id = 'custom_' + Date.now();
                    const newItem = {
                        id: id,
                        type: 'custom',
                        name: name,
                        emoji: emoji,
                        enabled: true,
                        goal: goalVal > 0 ? goalVal : 200,
                        consumed: 0,
                        color: color,
                        hydrationFactor: hydration
                    };
                    p.liquid.items.push(newItem);
                    // Add copy to current day
                    const dayItems = liquidManager.getLiquidDay(p.id, currentDate);
                    dayItems.push(JSON.parse(JSON.stringify(newItem)));
                    storage.saveState();
                    // Clear form and hide
                    if (nameEl) nameEl.value = '';
                    if (emojiEl) emojiEl.value = '';
                    if (goalEl) goalEl.value = '';
                    if (hydrateEl) hydrateEl.value = '0.7';
                    const form2 = $('#newDrinkForm');
                    if (form2) form2.style.display = 'none';
                    liquidManager.renderLiquid();
                }
            }
            // Delete custom drink via button
            else if (target.classList.contains('drink-remove-btn')) {
                const drinkId = target.dataset.id;
                const p = profileManager.activeProfile();
                if (p.liquid && Array.isArray(p.liquid.items)) {
                    p.liquid.items = p.liquid.items.filter(it => (it.id || it.type) !== drinkId);
                }
                // Remove from current day
                const dayItems2 = liquidManager.getLiquidDay(p.id, currentDate);
                const idx = dayItems2.findIndex(it => (it.id || it.type) === drinkId);
                if (idx >= 0) dayItems2.splice(idx, 1);
                storage.saveState();
                liquidManager.renderLiquid();
            }
            // Calendar navigation
            else if (target.id === 'waterPrevMonth') {
                liquidManager.changeCalendarMonth(-1);
            }
            else if (target.id === 'waterNextMonth') {
                liquidManager.changeCalendarMonth(1);
            }
        });

        // Bind reset button
        $('#resetLiquidBtn')?.addEventListener('click', () => {
            liquidManager.resetLiquid();
        });
        // Bind save settings button
        $('#saveLiquidGoalsBtn')?.addEventListener('click', () => {
            liquidManager.saveLiquidGoals();
        });

        const p = profileManager.activeProfile();
        // Initialize liquids object if it doesn't exist
        if (!p.liquid) {
            p.liquid = {
                totalGoal: 2000,
                items: liquidManager.getDefaultLiquidItems()
            };
            storage.saveState();
        }
        // Render water module after initialization
        liquidManager.renderLiquid();
    },

    /**
     * Updates main progress: circle, percentages and color indication.
     * @param {Array} liquidData List of drink objects for current day.
     */
    updateProgressDisplay: function(liquidData) {
        const goalLbl = $('#waterGoalLabel');
        const consLbl = $('#waterConsumedLabel');
        const pctLbl = $('#waterProgressPct');
        const circle = $('#waterProgressCircle');

        let totalGoal = 0;
        let totalConsumed = 0;
        liquidData.forEach(item => {
            if (!item) return;
            const factor = item.hydrationFactor || 1;
            if (item.enabled) {
                totalGoal += (item.goal || 0) * factor;
                totalConsumed += (item.consumed || 0) * factor;
            }
        });
        // Update text labels
        if (goalLbl) goalLbl.textContent = Math.round(totalGoal);
        if (consLbl) consLbl.textContent = Math.round(totalConsumed);
        const pct = totalGoal > 0 ? Math.min(100, Math.round((totalConsumed / totalGoal) * 100)) : 0;
        if (pctLbl) pctLbl.textContent = pct + '%';
        // Update circular progress
        if (circle) {
            circle.setAttribute('stroke-dasharray', `${pct},100`);
            // Color selection by levels
            let color = '#22c55e'; // green by default
            if (pct < 34) color = '#ef4444';
            else if (pct < 67) color = '#f97316';
            else if (pct < 100) color = '#eab308';
            circle.style.stroke = color;
        }
    },

    /**
     * Displays mini-indicators for each drink.
     * Shows emoji, progress bar and amount.
     * @param {Array} liquidData
     */
    renderDrinkIndicators: function(liquidData) {
        const box = $('#drinkIndicators');
        if (!box) return;
        box.innerHTML = '';
        liquidData.forEach(item => {
            if (!item) return;
            const row = document.createElement('div');
            row.className = 'drink-indicator' + (item.enabled ? '' : ' disabled');
            // emoji
            const emojiDiv = document.createElement('div');
            emojiDiv.className = 'drink-emoji';
            emojiDiv.textContent = item.emoji || '';
            row.appendChild(emojiDiv);
            // bar
            const bar = document.createElement('div');
            bar.className = 'drink-bar';
            const barFill = document.createElement('div');
            barFill.className = 'drink-bar-fill';
            const pct = item.goal > 0 ? Math.min(100, (item.consumed || 0) / item.goal * 100) : 0;
            barFill.style.width = pct + '%';
            barFill.style.background = item.color || '#06b6d4';
            bar.appendChild(barFill);
            row.appendChild(bar);
            // amount
            const amountDiv = document.createElement('div');
            amountDiv.className = 'drink-amount';
            amountDiv.textContent = `${item.consumed || 0} / ${item.goal || 0} ml`;
            row.appendChild(amountDiv);
            box.appendChild(row);
        });
    },

    /**
     * Renders drink types list with enable/disable and goal change capability.
     * @param {Array} liquidData
     */
    renderDrinkTypes: function(liquidData) {
        const list = $('#waterTypesList');
        if (!list) return;
        list.innerHTML = '';
        liquidData.forEach(item => {
            if (!item) return;
            const row = document.createElement('div');
            row.className = 'drink-type-row';
            // colored circle
            const dot = document.createElement('div');
            dot.className = 'drink-type-color';
            dot.style.background = item.color || '#06b6d4';
            row.appendChild(dot);
            // emoji + name
            const nameSpan = document.createElement('div');
            nameSpan.style.display = 'flex';
            nameSpan.style.alignItems = 'center';
            nameSpan.style.gap = '4px';
            const emojiSpan = document.createElement('span');
            emojiSpan.textContent = item.emoji || '';
            const textSpan = document.createElement('span');
            textSpan.textContent = item.name || item.type;
            nameSpan.appendChild(emojiSpan);
            nameSpan.appendChild(textSpan);
            row.appendChild(nameSpan);
            // enabled toggle
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = !!item.enabled;
            chk.style.marginLeft = 'auto';
            chk.dataset.id = item.id || item.type;
            chk.addEventListener('change', () => {
                item.enabled = chk.checked;
                storage.saveState();
                liquidManager.renderLiquid();
            });
            row.appendChild(chk);
            // goal field
            const goalInput = document.createElement('input');
            goalInput.type = 'number';
            goalInput.min = 50;
            goalInput.value = item.goal || 0;
            goalInput.style.maxWidth = '80px';
            goalInput.addEventListener('change', () => {
                item.goal = Math.max(1, parseInt(goalInput.value) || 0);
                storage.saveState();
                liquidManager.renderLiquid();
            });
            row.appendChild(goalInput);
            // delete button for custom drinks
            if (item.type === 'custom' || (item.id && item.id.startsWith('custom_'))) {
                const del = document.createElement('button');
                del.className = 'xbtn drink-remove-btn';
                del.textContent = 'Delete';
                del.dataset.id = item.id || item.type;
                del.addEventListener('click', () => {
                    const p = profileManager.activeProfile();
                    // remove from profile
                    if (p.liquid && Array.isArray(p.liquid.items)) {
                        p.liquid.items = p.liquid.items.filter(it => (it.id || it.type) !== (item.id || item.type));
                    }
                    // remove from day
                    const dItems = liquidManager.getLiquidDay(p.id, currentDate);
                    const idx = dItems.findIndex(it => (it.id || it.type) === (item.id || item.type));
                    if (idx >= 0) dItems.splice(idx, 1);
                    storage.saveState();
                    liquidManager.renderLiquid();
                });
                row.appendChild(del);
            }
            list.appendChild(row);
        });
    },

    /**
     * Fills drink selector, showing only enabled types.
     * @param {Array} liquidData
     */
    renderDrinkSelect: function(liquidData) {
        const sel = $('#waterDrinkSelect');
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '';
        liquidData.forEach(item => {
            if (!item || !item.enabled) return;
            const opt = document.createElement('option');
            opt.value = item.id || item.type;
            const name = item.name || item.type;
            opt.textContent = `${item.emoji || ''} ${name}`;
            sel.appendChild(opt);
        });
        if (prev && sel.querySelector(`option[value="${prev}"]`)) {
            sel.value = prev;
        }
    },

    /**
     * Draws calendar for current month using color progress indication.
     */
    renderCalendar: function() {
        const cal = $('#waterCalendar');
        if (!cal) return;
        const title = $('#waterCalendarTitle');
        const {year, month} = liquidManager.calendarState;
        // Month names in English
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        if (title) {
            title.textContent = `${monthNames[month]} ${year}`;
        }
        cal.innerHTML = '';
        // calculate first day and number of days in month
        const firstDay = new Date(year, month, 1);
        const startWeekday = (firstDay.getDay() + 6) % 7; // 0=Monday
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();

        // Helper function for day color
        const dayColor = (ds) => {
            const p = profileManager.activeProfile();
            const dayItems = liquidManager.getLiquidDay(p.id, ds);
            let goal = 0;
            let cons = 0;
            dayItems.forEach(it => {
                const factor = it.hydrationFactor || 1;
                if (it.enabled) {
                    goal += (it.goal || 0) * factor;
                    cons += (it.consumed || 0) * factor;
                }
            });
            if (goal <= 0) return '';
            const pcent = (cons / goal) * 100;
            if (pcent < 34) return 'red';
            if (pcent < 67) return 'orange';
            if (pcent < 100) return 'yellow';
            return 'green';
        };

        // Calendar cells – 6 weeks × 7 days
        const totalCells = 42;
        for (let i = 0; i < totalCells; i++) {
            const cell = document.createElement('div');
            cell.className = 'day';
            let dayNumber;
            let dateStr;
            if (i < startWeekday) {
                // previous month days
                dayNumber = prevMonthDays - startWeekday + i + 1;
                cell.classList.add('disabled');
                const prevDate = new Date(year, month - 1, dayNumber);
                dateStr = utils.todayStr(prevDate);
            } else if (i >= startWeekday + daysInMonth) {
                // next month days
                dayNumber = i - (startWeekday + daysInMonth) + 1;
                cell.classList.add('disabled');
                const nextDate = new Date(year, month + 1, dayNumber);
                dateStr = utils.todayStr(nextDate);
            } else {
                dayNumber = i - startWeekday + 1;
                const thisDate = new Date(year, month, dayNumber);
                dateStr = utils.todayStr(thisDate);
                // color
                const c = dayColor(dateStr);
                if (c) cell.classList.add(c);
                // highlight today
                if (dateStr === utils.todayStr()) {
                    cell.style.fontWeight = '600';
                    cell.style.textDecoration = 'underline';
                }
                cell.addEventListener('click', () => {
                    liquidManager.renderDayDetails(dateStr);
                });
            }
            cell.textContent = dayNumber;
            cell.dataset.date = dateStr;
            cal.appendChild(cell);
        }
    },

    /**
     * Shifts displayed calendar month and redraws it.
     * @param {number} delta -1 for previous month, +1 for next
     */
    changeCalendarMonth: function(delta) {
        let {year, month} = liquidManager.calendarState;
        month += delta;
        if (month < 0) {
            month = 11;
            year -= 1;
        } else if (month > 11) {
            month = 0;
            year += 1;
        }
        liquidManager.calendarState.year = year;
        liquidManager.calendarState.month = month;
        liquidManager.renderCalendar();
    },

    /**
     * Renders consumption details for selected day.
     * @param {string} ds - date string YYYY-MM-DD
     */
    renderDayDetails: function(ds) {
        const detailBox = $('#waterDayDetails');
        if (!detailBox) return;
        const p = profileManager.activeProfile();
        const dayItems = liquidManager.getLiquidDay(p.id, ds);
        let html = `<h4>Details ${ds}</h4>`;
        let totalHydration = 0;
        let totalGoal = 0;
        dayItems.forEach(item => {
            const factor = item.hydrationFactor || 1;
            if (item.enabled) {
                const itemHydr = (item.consumed || 0) * factor;
                const itemGoal = (item.goal || 0) * factor;
                totalHydration += itemHydr;
                totalGoal += itemGoal;
                html += `<div class="row" style="gap:4px; align-items:center; margin-bottom:4px;">
                    <div style="font-size:20px;">${item.emoji || ''}</div>
                    <div style="flex:1;">${item.name || item.type}</div>
                    <div>${item.consumed || 0} ml</div>
                    <div style="font-size:12px;color:var(--gray-600)">${Math.round(itemHydr)}/${Math.round(itemGoal)} ml h.</div>
                </div>`;
            }
        });
        html += `<div class="mt8" style="font-weight:600;">Total: ${Math.round(totalHydration)} / ${Math.round(totalGoal)} ml hydration</div>`;
        detailBox.innerHTML = html;
    }
};

/* ===== RECIPES ===== */
const recipesManager = {
    recomputeRecipePerServ: (rc) => {
        let sCal = 0, sPr = 0, sFat = 0, sCarb = 0;
        
        rc.ingredients.forEach(i => {
            const base = addManager.allSearchables().find(x => x.name === i.name);
            const k = (i.grams || 100) / 100;
            
            if (base) {
                sCal += (base.cal || 0) * k;
                sPr += (base.pr || 0) * k;
                sFat += (base.fat || 0) * k;
                sCarb += (base.carb || 0) * k;
            } else {
                sCal += (i.cal || 0) * k;
                sPr += (i.pr || 0) * k;
                sFat += (i.fat || 0) * k;
                sCarb += (i.carb || 0) * k;
            }
        });
        
        const serv = Math.max(1, rc.servings || 1);
        rc.perServ = {cal: sCal / serv, pr: sPr / serv, fat: sFat / serv, carb: sCarb / serv};
    },
    
    renderRecipesList: () => {
        const box = $('#recipesList');
        if (!box) return;
        box.innerHTML = '';
        
        if (appState.recipes.length === 0) {
            box.innerHTML = '<div class="muted">No recipes yet</div>';
            return;
        }
        
        appState.recipes.forEach(rc => {
            const per = rc.perServ || {cal:0, pr:0, fat:0, carb:0};
            const div = document.createElement('div');
            div.className = 'meal-entry';
            div.innerHTML = `
                <div class="meal-info">
                    <div class="meal-title">👨‍🍳 ${rc.name}</div>
                    <div class="meal-details">
                        Servings: ${rc.servings} • Per serving: ${Math.round(per.cal)} cal •
                        P ${utils.fmtNum(per.pr)} • F ${utils.fmtNum(per.fat)} • C ${utils.fmtNum(per.carb)}
                    </div>
                </div>
                <button class="xbtn" data-del-rec="${rc.id}">Delete</button>
            `;
            box.appendChild(div);
        });
        
        box.querySelectorAll('[data-del-rec]').forEach(b => {
            b.addEventListener('click', () => {
                const id = b.getAttribute('data-del-rec');
                appState.recipes = appState.recipes.filter(r => r.id !== id);
                storage.saveState();
                recipesManager.renderRecipesList();
                recipesManager.fillRecipesSelect();
                utils.showNotif('Recipe deleted');
            });
        });
    },
    
    fillRecipesSelect: () => {
        const sel = $('#addRecipeSelect');
        if (!sel) return;
        
        sel.innerHTML = '';
        appState.recipes.forEach(rc => {
            const opt = document.createElement('option');
            opt.value = rc.id;
            opt.textContent = rc.name;
            sel.appendChild(opt);
        });
    },
    
    setupRecipeBuilder: () => {
        const sInput = $('#recSearch');
        const resBox = $('#recSearchResults');
        const ingrBox = $('#recIngrBox');
        const sumBox = $('#recMacrosSum');
        if (!sInput || !resBox || !ingrBox || !sumBox) return;
        
        const ingr = [];
        
        function renderIngr() {
            ingrBox.innerHTML = '';
            
            ingr.forEach((it, i) => {
                const row = document.createElement('div');
                row.className = 'row';
                row.innerHTML = `
                    <div class="pill" style="flex:1">${it.name}</div>
                    <input type="number" value="${it.grams||100}" data-g="${i}" style="max-width:120px">
                    <button class="xbtn" data-rem="${i}">Delete</button>
                `;
                ingrBox.appendChild(row);
            });
            
            ingrBox.querySelectorAll('[data-rem]').forEach(b => {
                b.addEventListener('click', () => {
                    ingr.splice(+b.getAttribute('data-rem'), 1);
                    renderIngr();
                    renderSum();
                });
            });
            
            ingrBox.querySelectorAll('input[type="number"][data-g]').forEach(inp => {
                inp.addEventListener('change', () => {
                    const i = +inp.getAttribute('data-g');
                    ingr[i].grams = Math.max(1, +inp.value || 100);
                    renderSum();
                });
            });
        }
        
        function renderSum() {
            const rc = {ingredients: ingr, servings: +$('#recServings').value || 1};
            recipesManager.recomputeRecipePerServ(rc);
            sumBox.textContent = `Per serving: ${Math.round(rc.perServ.cal)} cal • P ${utils.fmtNum(rc.perServ.pr)} • F ${utils.fmtNum(rc.perServ.fat)} • C ${utils.fmtNum(rc.perServ.carb)}`;
        }
        
        sInput.addEventListener('input', () => {
            const q = sInput.value.trim().toLowerCase();
            if (q.length < 2) {
                resBox.style.display = 'none';
                resBox.innerHTML = '';
                return;
            }
            
            const items = addManager.allSearchables().filter(x => 
                x.name.toLowerCase().includes(q)).slice(0, 20);
            
            resBox.innerHTML = items.map(x => `
                <div class="search-item" data-name="${x.name}">
                    <div class="search-item-name">${x.emoji||'🍽️'} ${x.name}</div>
                    <div class="search-item-details">${Math.round(x.cal)} cal • P ${utils.fmtNum(x.pr)} • F ${utils.fmtNum(x.fat)} • C ${utils.fmtNum(x.carb)}</div>
                </div>
            `).join('');
            
            resBox.style.display = items.length ? 'block' : 'none';
            
            resBox.querySelectorAll('.search-item').forEach(el => {
                el.addEventListener('click', () => {
                    const name = el.getAttribute('data-name');
                    ingr.push({name, grams: 100});
                    resBox.style.display = 'none';
                    sInput.value = '';
                    renderIngr();
                    renderSum();
                });
            });
        });
        
        $('#recServings')?.addEventListener('change', renderSum);
        
        $('#saveRecipeBtn')?.addEventListener('click', () => {
            const name = $('#recName').value.trim();
            const servings = Math.max(1, +$('#recServings').value || 1);
            
            if (!name) {
                utils.showNotif('Enter recipe name', true);
                return;
            }
            
            if (ingr.length === 0) {
                utils.showNotif('Add at least 1 ingredient', true);
                return;
            }
            
            const rc = {
                id: 'r' + Date.now(),
                name,
                servings,
                ingredients: JSON.parse(JSON.stringify(ingr))
            };
            
            recipesManager.recomputeRecipePerServ(rc);
            appState.recipes.push(rc);
            storage.saveState();
            
            $('#recName').value = '';
            ingr.length = 0;
            renderIngr();
            renderSum();
            recipesManager.renderRecipesList();
            recipesManager.fillRecipesSelect();
            utils.showNotif('Recipe saved');
        });
    },
    
    setupRecipesEvents: () => {
        $('#addRecipeToDiaryBtn')?.addEventListener('click', () => {
            const id = $('#addRecipeSelect').value;
            const mt = $('#addRecipeMeal').value;
            const s = Math.max(1, +$('#addRecipeServings').value || 1);
            const rc = appState.recipes.find(r => r.id === id);
            
            if (!rc) {
                utils.showNotif('Select recipe', true);
                return;
            }
            
            const it = {
                name: rc.name + ' (recipe)',
                cal: rc.perServ.cal * s,
                pr: rc.perServ.pr * s,
                fat: rc.perServ.fat * s,
                carb: rc.perServ.carb * s,
                emoji: '🍽️'
            };
            
            diaryManager.addMealItem(profileManager.activeProfile().id, currentDate, mt, it);
            utils.showNotif('Recipe added');
        });
    }
};

/* ===== WEEK ===== */
const weekManager = {
    weekDates: (ws) => {
        const arr = [];
        for (let i = 0; i < 7; i++) arr.push(utils.shiftDate(ws, i));
        return arr;
    },
    
    buildWeekTable: () => {
        if (!appState.settings.modules.weekPlanner) return;
        
        const wrap = $('#weekTableWrap');
        if (!wrap) return;
        
        const rcList = appState.recipes;
        const ws = weekStart;
        
        $('#weekStartLbl').textContent = ws + ' --- ' + utils.shiftDate(ws, 6);
        
        const days = weekManager.weekDates(ws);
        let html = '<table class="week"><thead><tr><th>Meal/Day</th>';
        
        days.forEach(ds => html += `<th>${ds}</th>`);
        html += '</tr></thead><tbody>';
        
        ['breakfast', 'lunch', 'dinner'].forEach(mt => {
            html += `<tr><th>${mt==='breakfast'?'🌅 Breakfast':mt==='lunch'?'☀️ Lunch':'🌙 Dinner'}</th>`;
            
            days.forEach(ds => {
                const cell = appState.weekPlan[ds]?.[mt] || {rid:'', serv:1};
                html += `<td>
                    <select data-w="${ds}:${mt}:rid">
                        <option value="">--- recipe ---</option>
                        ${rcList.map(r => `<option value="${r.id}" ${r.id===cell.rid?'selected':''}>${r.name}</option>`).join('')}
                    </select>
                    <div class="row mt8">
                        <input type="number" data-w="${ds}:${mt}:serv" value="${cell.serv||1}" style="max-width:100px">
                        <span class="small muted">serv.</span>
                    </div>
                </td>`;
            });
            
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        wrap.innerHTML = html;
    },
    
    setupWeekEvents: () => {
        $('#prevWeekBtn')?.addEventListener('click', () => {
            weekStart = utils.shiftDate(weekStart, -7);
            weekManager.buildWeekTable();
        });
        
        $('#nextWeekBtn')?.addEventListener('click', () => {
            weekStart = utils.shiftDate(weekStart, 7);
            weekManager.buildWeekTable();
        });
        
        $('#saveWeekPlanBtn')?.addEventListener('click', () => {
            const selects = $$('#weekTableWrap select[data-w]');
            selects.forEach(sel => {
                const [ds, mt, field] = sel.getAttribute('data-w').split(':');
                appState.weekPlan[ds] = appState.weekPlan[ds] || {};
                appState.weekPlan[ds][mt] = appState.weekPlan[ds][mt] || {rid:'', serv:1};
                appState.weekPlan[ds][mt].rid = sel.value || '';
            });
            
            const inputs = $$('#weekTableWrap input[data-w]');
            inputs.forEach(inp => {
                const [ds, mt, field] = inp.getAttribute('data-w').split(':');
                appState.weekPlan[ds] = appState.weekPlan[ds] || {};
                appState.weekPlan[ds][mt] = appState.weekPlan[ds][mt] || {rid:'', serv:1};
                appState.weekPlan[ds][mt].serv = Math.max(1, +inp.value || 1);
            });
            
            storage.saveState();
            utils.showNotif('Week plan saved');
        });
        
        $('#applyWeekPlanToDiaryBtn')?.addEventListener('click', () => {
            const pid = profileManager.activeProfile().id;
            const days = weekManager.weekDates(weekStart);
            
            days.forEach(ds => {
                const day = appState.weekPlan[ds] || {};
                ['breakfast', 'lunch', 'dinner'].forEach(mt => {
                    const slot = day[mt];
                    if (!slot || !slot.rid) return;
                    
                    const rc = appState.recipes.find(r => r.id === slot.rid);
                    if (!rc) return;
                    
                    const it = {
                        name: rc.name + ' (recipe)',
                        cal: rc.perServ.cal * slot.serv,
                        pr: rc.perServ.pr * slot.serv,
                        fat: rc.perServ.fat * slot.serv,
                        carb: rc.perServ.carb * slot.serv,
                        emoji: '🍽️'
                    };
                    
                    const d = diaryManager.dayObj(ds, pid);
                    d.meals[mt].push(it);
                });
            });
            
            storage.saveState();
            utils.showNotif('Plan added to diary');
        });
    }
};

/* ===== SETTINGS ===== */
const settingsManager = {
    renderProfiles: () => {
        const box = $('#profilesList');
        if (!box) return;
        box.innerHTML = '';
        
        appState.profiles.forEach(p => {
            const div = document.createElement('div');
            div.className = 'row';
            div.innerHTML = `
                <div class="pill" style="flex:1">${p.emoji} ${p.name}</div>
                <button class="secondary" onclick="settingsManager.setActiveProfile('${p.id}')">Active</button>
                <button class="danger" onclick="settingsManager.deleteProfile('${p.id}')">Delete</button>
            `;
            box.appendChild(div);
        });
    },
    
    setActiveProfile: (id) => {
        appState.activeProfileId = id;
        storage.saveState();
        profileManager.buildUserSelector();
        app.renderAll();
        utils.showNotif('Profile activated');

        // Update allergies field for selected profile
        const allergiesInput = document.getElementById('allergiesInput');
        if (allergiesInput) {
            const p = profileManager.activeProfile();
            allergiesInput.value = (p.allergies || []).join(', ');
        }
    },
    
    deleteProfile: (id) => {
        if (appState.profiles.length <= 1) {
            utils.showNotif('Need at least one profile', true);
            return;
        }
        
        if (!confirm('Delete this profile?')) return;
        
        appState.profiles = appState.profiles.filter(p => p.id !== id);
        if (appState.activeProfileId === id) {
            appState.activeProfileId = appState.profiles[0].id;
        }
        
        storage.saveState();
        profileManager.buildUserSelector();
        app.renderAll();
        utils.showNotif('Profile deleted');
    },
    
    renderGoals: () => {
        const box = $('#goalsBox');
        if (!box) return;
        box.innerHTML = '';
        
        appState.profiles.forEach(p => {
            const card = document.createElement('div');
            card.style.marginBottom = '12px';
            card.innerHTML = `
                <h4>${p.emoji} ${p.name}</h4>
                <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px">
                    <div><label>Cal</label><input type="number" data-goal="${p.id}:cal" value="${p.goals.cal}"></div>
                    <div><label>Protein</label><input type="number" data-goal="${p.id}:pr" value="${p.goals.pr}"></div>
                    <div><label>Fat</label><input type="number" data-goal="${p.id}:fat" value="${p.goals.fat}"></div>
                    <div><label>Carbs</label><input type="number" data-goal="${p.id}:carb" value="${p.goals.carb}"></div>
                </div>
            `;
            box.appendChild(card);
        });
        
        $$('[data-goal]').forEach(inp => {
            inp.addEventListener('change', (e) => {
                const [pid, key] = e.target.dataset.goal.split(':');
                const profile = appState.profiles.find(p => p.id === pid);
                profile.goals[key] = Math.max(0, +e.target.value || 0);
                storage.saveState();
                diaryManager.renderDiary();
                analyticsManager.renderAnalytics();
            });
        });
    },
    
    renderModules: () => {
        $('#modWater').checked = !!appState.settings.modules.water;
        $('#modRecipes').checked = !!appState.settings.modules.recipes;
        $('#modMicros').checked = !!appState.settings.modules.micros;
        $('#modGoalsCalc').checked = !!appState.settings.modules.goalsCalc;
        $('#modWeek').checked = !!appState.settings.modules.weekPlanner;
        $('#modShopping').checked = !!appState.settings.modules.shopping;
        
        $('#goalsCalcCard').style.display = appState.settings.modules.goalsCalc ? 'block' : 'none';
        $('#microsGoalsCard').style.display = appState.settings.modules.micros ? 'block' : 'none';
    },
    
    renderAppearance: () => {
        const mode = appState.settings.theme || 'light';
        $('#themeLight').checked = mode === 'light';
        $('#themeDark').checked = mode === 'dark';
        $('#themeSystem').checked = mode === 'system';
        
        const radios = $$('input[name="theme"]');
        radios.forEach(r => {
            r.addEventListener('change', () => {
                const val = document.querySelector('input[name="theme"]:checked').value;
                appState.settings.theme = val;
                storage.saveState();
                themeManager.applyTheme(val);
            });
        });
        
        themeManager.applyTheme(mode);
    },
    
    renderMicrosGoals: () => {
        const card = $('#microsGoalsCard');
        if (!card) return;
        card.style.display = appState.settings.modules.micros ? 'block' : 'none';
        if (!appState.settings.modules.micros) return;
        
        const box = $('#microsGoalsBox');
        if (!box) return;
        box.innerHTML = '';
        
        appState.profiles.forEach(p => {
            const row = document.createElement('div');
            row.className = 'grid';
            row.style.gridTemplateColumns = 'repeat(4,1fr)';
            row.innerHTML = `
                <div class="pill" style="grid-column:1/-1">${p.emoji} ${p.name}</div>
                <div><label>Fiber (g)</label><input type="number" data-mf="${p.id}" value="${p.goalsMicros.fiber}"></div>
                <div><label>Sugar (g)</label><input type="number" data-ms="${p.id}" value="${p.goalsMicros.sugar}"></div>
                <div><label>Sodium (mg)</label><input type="number" data-mn="${p.id}" value="${p.goalsMicros.sodium}"></div>
            `;
            box.appendChild(row);
        });
        
        $$('[data-mf]').forEach(inp => {
            inp.addEventListener('change', e => {
                const p = appState.profiles.find(x => x.id === e.target.getAttribute('data-mf'));
                p.goalsMicros.fiber = Math.max(0, +e.target.value || 0);
                storage.saveState();
                analyticsManager.renderAnalytics();
            });
        });
        
        $$('[data-ms]').forEach(inp => {
            inp.addEventListener('change', e => {
                const p = appState.profiles.find(x => x.id === e.target.getAttribute('data-ms'));
                p.goalsMicros.sugar = Math.max(0, +e.target.value || 0);
                storage.saveState();
                analyticsManager.renderAnalytics();
            });
        });
        
        $$('[data-mn]').forEach(inp => {
            inp.addEventListener('change', e => {
                const p = appState.profiles.find(x => x.id === e.target.getAttribute('data-mn'));
                p.goalsMicros.sodium = Math.max(0, +e.target.value || 0);
                storage.saveState();
                analyticsManager.renderAnalytics();
            });
        });
    },

    /**
     * Displays allergies list for active profile.
     * Shows tags with delete buttons. Shows empty state if no allergies.
     */
    renderAllergiesList: () => {
        const list = document.getElementById('allergiesList');
        if (!list) return;
        const p = profileManager.activeProfile();
        // initialize allergies array if absent
        if (!Array.isArray(p.allergies)) {
            p.allergies = [];
        }
        // if list is empty, show empty state
        if (p.allergies.length === 0) {
            list.innerHTML = '<div class="empty-state">No allergies specified</div>';
            return;
        }
        // else generate tags with delete buttons
        list.innerHTML = p.allergies.map(allergen => `
            <div class="allergen-tag">
                <span>${allergen}</span>
                <button class="allergen-remove" onclick="settingsManager.removeAllergen('${allergen}')">×</button>
            </div>
        `).join('');
    },

    /**
     * Adds new allergen to current profile's list.
     * Checks for empty and duplicates.
     */
    addAllergen: () => {
        const select = document.getElementById('newAllergenSelect');
        if (!select) return;
        const allergen = (select.value || '').trim();
        if (!allergen) {
            utils.showNotif('Select allergen', true);
            return;
        }
        const p = profileManager.activeProfile();
        if (!Array.isArray(p.allergies)) {
            p.allergies = [];
        }
        if (p.allergies.includes(allergen)) {
            utils.showNotif('This allergen already added', true);
            return;
        }
        p.allergies.push(allergen);
        storage.saveState();
        settingsManager.renderAllergiesList();
        diaryManager.renderDiary();
        // reset selection
        select.selectedIndex = 0;
        utils.showNotif('Allergen added');
    },

    /**
     * Removes allergen from current profile's list.
     */
    removeAllergen: (allergen) => {
        const p = profileManager.activeProfile();
        if (!Array.isArray(p.allergies)) return;
        p.allergies = p.allergies.filter(a => a !== allergen);
        storage.saveState();
        settingsManager.renderAllergiesList();
        diaryManager.renderDiary();
        utils.showNotif('Allergen removed');
    },

    /**
     * Sets up handlers for allergen form: only button.
     */
    setupAllergenEvents: () => {
        const addBtn = document.getElementById('addAllergenBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                settingsManager.addAllergen();
            });
        }
        // dropdown list doesn't need additional handlers
    },
    
    fillCalcProfiles: () => {
        const sel = $('#calcProfileSelect');
        if (!sel) return;
        
        sel.innerHTML = '';
        appState.profiles.forEach(p => {
            const o = document.createElement('option');
            o.value = p.id;
            o.textContent = `${p.emoji} ${p.name}`;
            sel.appendChild(o);
        });
        
        sel.value = profileManager.activeProfile().id;
    },
    
    setupSettingsEvents: () => {
        $('#addProfileBtn')?.addEventListener('click', () => {
            const name = $('#newProfileName').value.trim();
            const emoji = $('#newProfileEmoji').value.trim() || '😊';
            
            if (!name) {
                utils.showNotif('Enter profile name', true);
                return;
            }
            
            const id = 'p' + Date.now();
            appState.profiles.push({
                id,
                name,
                emoji,
                goals: {cal: 2000, pr: 100, fat: 70, carb: 250},
                goalsMicros: {fiber: 25, sugar: 50, sodium: 2300},
                allergies: [],
                liquid: {
                    totalGoal: 2000,
                    items: [
                        {type: 'water', enabled: true, goal: 1500, consumed: 0, color: '#06b6d4'},
                        {type: 'coffee', enabled: false, goal: 300, consumed: 0, color: '#8B4513'},
                        {type: 'juice', enabled: false, goal: 200, consumed: 0, color: '#FFA500'},
                        {type: 'tea', enabled: false, goal: 300, consumed: 0, color: '#D2691E'}
                    ]
                },
                // Note: allergen management is done through settingsManager. Profile object
                // doesn't have methods _renderAllergiesList, _addAllergen,
                // _removeAllergen and _setupAllergenEvents.
                quickProducts: {breakfast: [], lunch: [], dinner: [], snack: []}
            });
            
            storage.saveState();
            $('#newProfileName').value = '';
            $('#newProfileEmoji').value = '';
            settingsManager.renderProfiles();
            settingsManager.renderGoals();
            quickProductsManager.fillQuickProfileSelect();
            profileManager.buildUserSelector();
            settingsManager.fillCalcProfiles();
            settingsManager.renderMicrosGoals();
            utils.showNotif('Profile added');
        });
        
        $('#modWater')?.addEventListener('change', e => {
            appState.settings.modules.water = e.target.checked;
            storage.saveState();
            if (e.target.checked) activeTabId = 'water';
            tabManager.buildTabs();
            app.renderAll();
        });
        
        $('#modRecipes')?.addEventListener('change', e => {
            appState.settings.modules.recipes = e.target.checked;
            storage.saveState();
            if (e.target.checked) activeTabId = 'recipes';
            tabManager.buildTabs();
            app.renderAll();
        });
        
        $('#modMicros')?.addEventListener('change', e => {
            appState.settings.modules.micros = e.target.checked;
            storage.saveState();
            analyticsManager.renderAnalytics();
            settingsManager.renderModules();
            settingsManager.renderMicrosGoals();
        });
        
        $('#modGoalsCalc')?.addEventListener('change', e => {
            appState.settings.modules.goalsCalc = e.target.checked;
            storage.saveState();
            settingsManager.renderModules();
        });
        
        $('#modWeek')?.addEventListener('change', e => {
            appState.settings.modules.weekPlanner = e.target.checked;
            storage.saveState();
            if (e.target.checked) activeTabId = 'week';
            tabManager.buildTabs();
            app.renderAll();
            if (e.target.checked) weekManager.buildWeekTable();
        });
        
        $('#modShopping')?.addEventListener('change', e => {
            appState.settings.modules.shopping = e.target.checked;
            storage.saveState();
            if (e.target.checked) activeTabId = 'shopping';
            tabManager.buildTabs();
            app.renderAll();
        });
        
        $('#calcDoBtn')?.addEventListener('click', () => {
            const pid = $('#calcProfileSelect').value;
            const sex = $('#calcSex').value;
            const age = +$('#calcAge').value || 30;
            const h = +$('#calcHeight').value || 170;
            const w = +$('#calcWeight').value || 70;
            const act = +$('#calcAct').value || 1.55;
            const goal = +$('#calcGoal').value || 0;
            
            const bmr = sex === 'm' ? (10*w + 6.25*h - 5*age + 5) : (10*w + 6.25*h - 5*age - 161);
            let cals = bmr * act * (1 + goal);
            cals = Math.round(cals);
            
            const protein = Math.round(1.6 * w);
            const fat = Math.round((cals * 0.25) / 9);
            const carbs = Math.round((cals - protein * 4 - fat * 9) / 4);
            
            const p = appState.profiles.find(x => x.id === pid);
            p.goals = {cal: cals, pr: protein, fat: fat, carb: Math.max(0, carbs)};
            storage.saveState();
            
            settingsManager.renderGoals();
            diaryManager.renderDiary();
            analyticsManager.renderAnalytics();
            
            $('#calcOut').textContent = `${cals} cal • P ${protein} • F ${fat} • C ${Math.max(0, carbs)}`;
        });
        
        $('#exportAllBtn')?.addEventListener('click', () => {
            const json = JSON.stringify(appState, null, 2);
            utils.download('family_nutrition_data.json', json);
            utils.showNotif('Data exported');
        });
        
        $('#importAllBtn')?.addEventListener('click', () => {
            $('#importFileInput').click();
        });
        
        $('#importFileInput')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                if (!data.version || !data.profiles) {
                    throw new Error('Invalid file format');
                }
                
                if (confirm('Replace all data?')) {
                    appState = data;
                    storage.migrateIfNeeded();
                    storage.saveState(true);
                    profileManager.buildUserSelector();
                    tabManager.buildTabs();
                    app.renderAll();
                    utils.showNotif('Data imported');
                }
            } catch (err) {
                utils.showNotif('Import error: ' + err.message, true);
            } finally {
                e.target.value = '';
            }
        });
        
        $('#clearAllBtn')?.addEventListener('click', () => {
            if (!confirm('Delete ALL data?')) return;
            
            localStorage.removeItem(STORAGE_KEY);
            appState = JSON.parse(JSON.stringify(defaultState));
            storage.saveState(true);
            profileManager.buildUserSelector();
            tabManager.buildTabs();
            app.renderAll();
            utils.showNotif('All data cleared');
        });

        // Allergies input setup
        const allergiesInput = document.getElementById('allergiesInput');
        if (allergiesInput) {
            // Set current value for active profile
            const act = profileManager.activeProfile();
            allergiesInput.value = (act.allergies || []).join(', ');
            allergiesInput.addEventListener('input', () => {
                const p = profileManager.activeProfile();
                const arr = allergiesInput.value.split(',').map(s => s.trim()).filter(Boolean);
                p.allergies = arr;
                storage.saveState();
                diaryManager.renderDiary();
            });
        }
    }
};


/* ===== WINDOW EXPORT ===== */
// Export managers to window for access from HTML
window.quickProductsManager = quickProductsManager;
window.settingsManager = settingsManager;
window.app = app;

/* ===== INITIALIZATION ===== */
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
