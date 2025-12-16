/**
 * Personal Goal Tracker App (Lithuanian)
 * Uses localStorage for persistence.
 */

// --- Constants & Config ---
const STORAGE_KEY = 'manoTiksluAppData'; // STABLE KEY
const LEGACY_KEYS = ['manoTikslaiData', 'goalTrackerData']; // KEYS TO MIGRATE FROM

const DAYS = ['Sekmadienis', 'Pirmadienis', 'Antradienis', 'Trečiadienis', 'Ketvirtadienis', 'Penktadienis', 'Šeštadienis'];
const MONTHS = ['Sausio', 'Vasario', 'Kovo', 'Balandžio', 'Gegužės', 'Birželio', 'Liepos', 'Rugpjūčio', 'Rugsėjo', 'Spalio', 'Lapkričio', 'Gruodžio'];
const MONTH_NAMES_NOMINATIVE = ['Sausis', 'Vasaris', 'Kovas', 'Balandis', 'Gegužė', 'Birželis', 'Liepa', 'Rugpjūtis', 'Rugsėjis', 'Spalis', 'Lapkritis', 'Gruodis'];

const QUOTES = [
    "Kiekviena diena yra nauja pradžia.",
    "Maži žingsneliai veda į didelius pokyčius.",
    "Tikėk, kad gali, ir jau būsi pusiaukelėje.",
    "Sėkmė yra mažų pastangų, kartojamų kasdien, suma.",
    "Nedaryk to, kas lengva, daryk tai, kas teisinga.",
    "Tavo vienintelė riba yra tu pats.",
    "Siekis be plano yra tik svajonė.",
    "Geriausias laikas pradėti buvo vakar. Kitas geriausias – šiandien.",
    "Niekada nepasiduok, nes būtent tada prasideda stebuklai.",
    "Disciplina yra tiltas tarp tikslų ir pasiekimų.",
    "Būk geresnis nei buvai vakar."
];

// --- State Management ---
let appData = {
    goals: [], // Array of goal objects
    history: {} // Map of goalId -> { "YYYY-MM-DD": value }
};

let currentTab = 'daily'; // 'daily', 'weekly', 'monthly', 'overview', 'all'
let overviewState = {
    period: 'month', // 'month' or 'week'
    refDate: new Date() // Current reference date for overview
};
let saveTimeout = null;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadData(); // Migration happens here
    setupEventListeners();
    updateDateDisplay();
    updateDailyQuote();
    renderApp();
});

// --- Data Persistence & Migration ---
function loadData() {
    // 1. Try loading from the new stable key first
    let raw = localStorage.getItem(STORAGE_KEY);
    let migrated = false;

    // 2. If not found, try legacy keys
    if (!raw) {
        for (const oldKey of LEGACY_KEYS) {
            const oldRaw = localStorage.getItem(oldKey);
            if (oldRaw) {
                console.log(`[Migration] Found data in legacy key: ${oldKey}`);
                raw = oldRaw;
                migrated = true;
                break;
            }
        }
    }

    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            appData = { ...appData, ...parsed }; // Merge to ensure structure
            appData.goals = appData.goals || [];
            appData.history = appData.history || {};

            // If we just migrated, save immediately to the new key
            if (migrated) {
                saveData();
                console.log(`[Migration] Data saved to new key: ${STORAGE_KEY}`);
            }

        } catch (e) {
            console.error("[Load] Failed to parse local storage", e);
            alert("Įvyko klaida nuskaitant duomenis. Patikrinkite konsolę.");
        }
    } else {
        console.log("[Load] No data found. Starting fresh.");
    }
}

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
        updateProgressSummary();
    } catch (e) {
        console.error("[Save] Error saving data", e);
        alert("Nepavyko išsaugoti duomenų! Viršytas limitas arba diskas pilnas.");
    }
}

// --- Logic ---

function getTodayString() {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(d - offset)).toISOString().slice(0, 10);
    return localISOTime;
}

function getWeekDates(dateObj) {
    const current = new Date(dateObj);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(current.setDate(diff));

    const week = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const offset = d.getTimezoneOffset() * 60000;
        week.push((new Date(d - offset)).toISOString().slice(0, 10));
    }
    return week;
}

function getMonthDates(dateObj) {
    const y = dateObj.getFullYear();
    const m = dateObj.getMonth();
    const dates = [];
    const date = new Date(y, m, 1);

    while (date.getMonth() === m) {
        const offset = date.getTimezoneOffset() * 60000;
        dates.push((new Date(date - offset)).toISOString().slice(0, 10));
        date.setDate(date.getDate() + 1);
    }
    return dates;
}

function getOverviewRange(period, refDate) {
    if (period === 'month') {
        const y = refDate.getFullYear();
        const m = refDate.getMonth();
        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 0); // Last day of month
        const daysCount = end.getDate(); // 28-31
        const weeksCount = daysCount / 7;

        return {
            start: start,
            end: end,
            daysCount: daysCount,
            weeksCount: weeksCount,
            label: `${y} m. ${MONTH_NAMES_NOMINATIVE[m]}`
        };
    } else { // week
        const dates = getWeekDates(refDate);
        const start = new Date(dates[0]);
        const end = new Date(dates[6]);
        const startM = MONTHS[start.getMonth()];
        const endM = MONTHS[end.getMonth()];
        const label = `${startM} ${start.getDate()} - ${endM === startM ? '' : endM + ' '}${end.getDate()} d.`;

        return {
            start: start,
            end: end,
            daysCount: 7,
            weeksCount: 1,
            label: label
        };
    }
}

function getGoalProgress(goal) {
    const history = appData.history[goal.id] || {};
    const today = getTodayString();

    let current = 0;

    if (goal.period === 'daily') {
        current = history[today] || 0;
    } else if (goal.period === 'weekly') {
        const weekDates = getWeekDates(new Date());
        weekDates.forEach(d => {
            current += (history[d] || 0);
        });
    } else if (goal.period === 'monthly') {
        const monthDates = getMonthDates(new Date());
        monthDates.forEach(d => {
            current += (history[d] || 0);
        });
    }

    return current;
}

function isGoalCompleted(goal) {
    const progress = getGoalProgress(goal);
    return progress >= goal.target;
}

// --- UI Rendering ---

function updateDateDisplay() {
    const d = new Date();
    const dayName = DAYS[d.getDay()];
    const dayDate = d.getDate();
    const monthName = MONTHS[d.getMonth()];

    document.getElementById('currentDate').textContent = `${dayName}, ${monthName} ${dayDate} d.`;
}

function updateDailyQuote() {
    const d = new Date();
    const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const quoteIndex = dayOfYear % QUOTES.length;
    document.querySelector('.quote-text').textContent = `"${QUOTES[quoteIndex]}"`;
}

function updateProgressSummary() {
    let context = "";
    let collectionName = "";

    if (currentTab === 'overview') {
        document.getElementById('contextSummary').textContent = "Jūsų istorinė apžvalga";
        return;
    }

    if (currentTab === 'daily') {
        context = "Šiandien";
        collectionName = "dienos tikslų";
    } else if (currentTab === 'weekly') {
        context = "Šią savaitę";
        collectionName = "savaitės tikslų";
    } else if (currentTab === 'monthly') {
        context = "Šį mėnesį";
        collectionName = "mėnesio tikslų";
    } else {
        context = "Iš viso";
        collectionName = "tikslų";
    }

    let relevantGoals = appData.goals;
    if (currentTab !== 'all') {
        relevantGoals = appData.goals.filter(g => g.period === currentTab);
    }

    if (relevantGoals.length === 0) {
        document.getElementById('contextSummary').textContent = "Nėra tikslų šiam laikotarpiui.";
        return;
    }

    let completedCount = 0;
    relevantGoals.forEach(g => {
        if (isGoalCompleted(g)) completedCount++;
    });

    document.getElementById('contextSummary').textContent = `${context} – įveikta ${completedCount} iš ${relevantGoals.length} ${collectionName}`;
}

function renderApp() {
    renderGoals();
    updateProgressSummary();
    updateDateDisplay();
}

function renderGoals() {
    const list = document.getElementById('goalsList');
    list.innerHTML = '';

    if (currentTab === 'overview') {
        renderOverview(list);
        return;
    }

    const goalsToRender = currentTab === 'all'
        ? appData.goals
        : appData.goals.filter(g => g.period === currentTab);

    if (goalsToRender.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>Tuščia.</p>
                <div style="margin-top:20px;">
                    <button class="fab" style="position:static; margin:0 auto;" onclick="openModal()">+</button>
                </div>
            </div>
        `;
        return;
    }

    goalsToRender.forEach(goal => {
        const progress = getGoalProgress(goal);
        const target = goal.target;

        let unitText = goal.unit;
        if (goal.unit === 'times') unitText = 'kart.';
        if (goal.unit === 'units') unitText = 'vnt.';

        let periodLabel = "Planuota";
        if (goal.period === 'daily') periodLabel = "Šiandien planuota";
        if (goal.period === 'weekly') periodLabel = "Savaitei planuota";
        if (goal.period === 'monthly') periodLabel = "Mėnesiui planuota";

        const todayVal = (appData.history[goal.id] && appData.history[goal.id][getTodayString()]) || 0;
        const isManageMode = currentTab === 'all';

        const item = document.createElement('div');
        item.className = 'goal-item';

        item.innerHTML = `
            <div class="goal-header-group">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <span class="goal-title" onclick="openModal('${goal.id}')">${goal.title}</span>
                    ${isManageMode ? `<button class="icon-btn" onclick="deleteGoal('${goal.id}')" style="color:#d1d5db; padding:0;">×</button>` : ''}
                </div>
                <span class="goal-helper">${periodLabel}: ${target} ${unitText} ${goal.period !== 'daily' ? `(Viso: ${progress})` : ''}</span>
            </div>
            
            <div class="goal-input-wrapper">
                <input type="number" 
                    id="input-${goal.id}"
                    class="time-input" 
                    value="${todayVal > 0 ? todayVal : ''}" 
                    placeholder="Įrašykite šiandien..."
                    onfocus="this.select()"
                    oninput="handleInput('${goal.id}', this)"
                >
                <span class="unit-label">${unitText}</span>
                <span id="save-${goal.id}" class="save-status">Išsaugota</span>
            </div>
        `;
        list.appendChild(item);
    });
}

function renderOverview(container) {
    const nav = document.createElement('div');
    nav.className = 'overview-nav';
    nav.innerHTML = `
        <div class="overview-control">
            <button class="nav-btn" onclick="changeOverviewDate(-1)">❮</button>
            <button class="nav-btn" onclick="changeOverviewDate(1)">❯</button>
        </div>
        <div class="overview-label" id="overviewLabel">Loading...</div>
        <div class="overview-period-selector">
            <button class="period-btn ${overviewState.period === 'week' ? 'active' : ''}" onclick="setOverviewPeriod('week')">Sav.</button>
            <button class="period-btn ${overviewState.period === 'month' ? 'active' : ''}" onclick="setOverviewPeriod('month')">Mėn.</button>
        </div>
    `;
    container.appendChild(nav);

    const range = getOverviewRange(overviewState.period, overviewState.refDate);
    container.querySelector('#overviewLabel').textContent = range.label;

    if (appData.goals.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = "Nėra tikslų.";
        container.appendChild(empty);
        return;
    }

    appData.goals.forEach(goal => {
        let planned = 0;
        if (goal.period === 'daily') {
            planned = goal.target * range.daysCount;
        } else if (goal.period === 'weekly') {
            planned = goal.target * range.weeksCount;
        } else if (goal.period === 'monthly') {
            if (overviewState.period === 'month') {
                planned = goal.target;
            } else {
                planned = Math.round(goal.target * (range.daysCount / 30));
            }
        }
        planned = Math.round(planned);

        let actual = 0;
        const h = appData.history[goal.id] || {};

        const loopDate = new Date(range.start);
        while (loopDate <= range.end) {
            const offset = loopDate.getTimezoneOffset() * 60000;
            const iso = (new Date(loopDate - offset)).toISOString().slice(0, 10);
            if (h[iso]) actual += h[iso];
            loopDate.setDate(loopDate.getDate() + 1);
        }

        let unitText = goal.unit;
        if (goal.unit === 'times') unitText = 'kart.';
        if (goal.unit === 'units') unitText = 'vnt.';

        const percent = planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : 0;

        const card = document.createElement('div');
        card.className = 'goal-item';
        card.style.borderLeftColor = '#DDD6FE';

        card.innerHTML = `
            <div class="goal-header-group">
                <span class="goal-title">${goal.title}</span>
                <span class="goal-helper">Faktiškai atlikta: <strong style="color:var(--text-primary)">${actual}</strong> iš ${planned} ${unitText}</span>
            </div>
            
            <div class="overview-progress-track">
                <div class="overview-progress-fill" style="width: ${percent}%;"></div>
            </div>
            <span class="overview-stats">${percent}% įvykdymas</span>
        `;
        container.appendChild(card);
    });
}

function changeOverviewDate(direction) {
    const d = new Date(overviewState.refDate);
    if (overviewState.period === 'month') {
        d.setMonth(d.getMonth() + direction);
    } else {
        d.setDate(d.getDate() + (direction * 7));
    }
    overviewState.refDate = d;
    renderApp();
}

function setOverviewPeriod(p) {
    overviewState.period = p;
    renderApp();
}

// --- User Actions ---

function handleInput(goalId, inputEl) {
    const val = parseFloat(inputEl.value) || 0;
    const wrapper = inputEl.closest('.goal-input-wrapper');
    if (wrapper) wrapper.parentElement.classList.add('filter-active');

    const indicator = document.getElementById(`save-${goalId}`);
    if (indicator) indicator.classList.remove('visible');

    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(() => {
        const today = getTodayString();
        if (!appData.history[goalId]) appData.history[goalId] = {};

        appData.history[goalId][today] = val;
        saveData();

        if (indicator) {
            indicator.classList.add('visible');
            setTimeout(() => indicator.classList.remove('visible'), 2000);
        }

        updateProgressSummary();
    }, 600);
}

function deleteGoal(id) {
    if (!confirm("Ar tikrai norite ištrinti?")) return;
    appData.goals = appData.goals.filter(g => g.id !== id);
    delete appData.history[id];
    saveData();
    renderApp();
}

// --- Modal & Forms ---

function openModal(goalId = null) {
    const modal = document.getElementById('goalModal');
    const form = document.getElementById('goalForm');
    form.reset();
    document.getElementById('goalId').value = '';

    if (goalId) {
        const goal = appData.goals.find(g => g.id === goalId);
        if (goal) {
            document.getElementById('goalId').value = goal.id;
            document.getElementById('goalTitle').value = goal.title;
            document.getElementById('goalCategory').value = goal.category;
            document.getElementById('goalPeriod').value = goal.period || 'daily';
            document.getElementById('goalUnit').value = goal.unit || 'min';
            document.getElementById('goalTarget').value = goal.target;
            document.getElementById('goalDescription').value = goal.description || '';
        }
    } else {
        document.getElementById('goalPeriod').value = currentTab === 'all' || currentTab === 'overview' ? 'daily' : currentTab;
        document.getElementById('goalUnit').value = 'min';
        document.getElementById('goalTarget').value = 30;
    }

    updateTargetLabel(); // Update label based on initial or loaded value
    modal.classList.add('active');
}

function updateTargetLabel() {
    const unit = document.getElementById('goalUnit').value;
    const label = document.getElementById('targetLabel');
    if (unit === 'min') {
        label.textContent = 'Planuojama (min)';
        document.getElementById('goalTarget').placeholder = "Pvz: 30";
    } else if (unit === 'times') {
        label.textContent = 'Planuojama (kartai)';
        document.getElementById('goalTarget').placeholder = "Pvz: 1";
    } else if (unit === 'units') {
        label.textContent = 'Planuojama (vnt.)';
        document.getElementById('goalTarget').placeholder = "Pvz: 10";
    }
}

function closeModal() {
    document.getElementById('goalModal').classList.remove('active');
}

function handleFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('goalId').value;
    const title = document.getElementById('goalTitle').value;
    const category = document.getElementById('goalCategory').value;
    const period = document.getElementById('goalPeriod').value;
    const unit = document.getElementById('goalUnit').value;
    const target = parseFloat(document.getElementById('goalTarget').value);
    const description = document.getElementById('goalDescription').value;

    if (!title || !target) return;

    if (id) {
        const idx = appData.goals.findIndex(g => g.id === id);
        if (idx > -1) {
            appData.goals[idx] = { ...appData.goals[idx], title, category, period, unit, target, description };
        }
    } else {
        const newGoal = {
            id: Date.now().toString(),
            title, category, period, unit, target, description,
            created: Date.now()
        };
        appData.goals.push(newGoal);
    }

    saveData();
    closeModal();
    renderApp();
}

// --- Event Listeners ---

function setupEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTab = e.target.dataset.tab;
            renderApp();
        });
    });

    document.getElementById('goalForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('goalModal').addEventListener('click', (e) => {
        if (e.target.id === 'goalModal') closeModal();
    });

    document.getElementById('goalUnit').addEventListener('change', updateTargetLabel);
}
