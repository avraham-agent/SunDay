/**
 * SunDay v3.0 - App Main Controller
 * אתחול, ניווט, ניהול מסדי נתונים
 * שינוי 8: ביצועים - debounce, cache invalidation
 */

// שינוי 8: Debounce utility
function debounce(fn, delay = 150) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

const App = {
    currentSection: 'dashboard',
    attendanceDirty: false,  // set when attendance data changes, cleared after schedule recalc

    async init() {
        // Load XLSX
        await XLSXLoader.load();

        // Init database
        const currentDb = AttendanceData.getCurrentDbName();
        AttendanceData.setCurrentDb(currentDb);
        const list = AttendanceData.getDbList();
        if (list.indexOf(currentDb) === -1) {
            list.push(currentDb);
            AttendanceData.saveDbList(list);
        }

        // Init DB selector
        this.initDatabaseSelector();

        // Init UI modules
        AttendanceUI.buildPlatoonTabs();
        AttendanceUI.loadSettingsUI();
        AttendanceUI.setDefaultDates();

        // Init assignment
        AssignmentData.init();

        // Set schedule start date
        const startDateEl = document.getElementById('asgnScheduleStartDate');
        if (startDateEl) startDateEl.value = new Date().toISOString().split('T')[0];

        // Load saved assignment schedule
        this._loadSavedAssignmentSchedule();

        // Init company module
        AsgnCompany.init();

        // Dashboard
        document.getElementById('dashDate').value = new Date().toISOString().split('T')[0];
        Dashboard.refresh();

        // Settings UI
        SettingsUI.init();

        // Clock
        this.startClock();

        // System status
        this.updateSystemStatus();

        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                document.getElementById('dialogOverlay').style.display = 'none';
                document.getElementById('soldierCardOverlay').style.display = 'none';
            }
        });

        console.log('☀️ SunDay v3.0 מוכנה!');

        // Dismiss splash screen after init completes
        setTimeout(() => {
            const splash = document.getElementById('splashScreen');
            if (splash) {
                splash.classList.add('splash-hide');
                setTimeout(() => splash.remove(), 800);
            }
        }, 1700);
    },

    // ==================== NAVIGATION ====================
    switchSection(sectionName) {
        this.currentSection = sectionName;

        // Update nav buttons
        document.querySelectorAll('.main-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.section === sectionName);
        });

        // Update section panes
        document.querySelectorAll('.section-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === 'section-' + sectionName);
        });

        // Refresh on switch
        if (sectionName === 'dashboard') Dashboard.refresh();
        if (sectionName === 'attendance') AttendanceUI.refreshDashboard();
        if (sectionName === 'assignment') {
            AssignmentUI.refreshCurrentTab();
            // Auto-recalculate schedule if attendance changed since last generation
            if (this.attendanceDirty) {
                this.attendanceDirty = false;
                const sd = AssignmentData.loadSchedule();
                if (sd?.startDate) {
                    Toast.show('🔄 מעדכן שיבוץ לאור שינויי נוכחות...', 'info');
                    setTimeout(() => AssignmentUI._recalculateSchedule(), 200);
                }
            }
        }
        if (sectionName === 'settings') SettingsUI.refresh();
    },

    switchSubTab(section, subtabId) {
        // Find section's sub-content
        const sectionEl = document.getElementById('section-' + section);
        if (!sectionEl) return;

        // Update sub-tab buttons
        sectionEl.querySelectorAll('.sub-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.subtab === subtabId);
        });

        // Update sub-panes
        sectionEl.querySelectorAll('.sub-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === 'subtab-' + subtabId);
        });

        // Refresh specific tabs
        if (subtabId === 'att-dashboard') AttendanceUI.refreshDashboard();
        if (subtabId === 'asgn-soldiers') AssignmentUI.refreshSoldiers();
        if (subtabId === 'asgn-positions') AssignmentUI.refreshPositions();
        if (subtabId === 'asgn-workload') AssignmentUI.refreshWorkload();
    },

    // ==================== DATABASE ====================
    initDatabaseSelector() {
        const list = AttendanceData.getDbList();
        const current = AttendanceData.getCurrentDbName();
        const sel = document.getElementById('dbSelector');
        sel.innerHTML = '';
        list.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = AttendanceData.getDbDisplayName(p);
            if (p === current) opt.selected = true;
            sel.appendChild(opt);
        });
    },

    switchDatabase() {
        // שינוי 8: ניקוי מטמון בעת מעבר בין מסדי נתונים
        AttendanceData._invalidateCache();
        AssignmentData._cache = {};
        AttendanceData.setCurrentDb(document.getElementById('dbSelector').value);
        location.reload();
    },

    createNewDatabase() {
        const name = prompt('שם למסד החדש:');
        if (!name || !name.trim()) return;
        AttendanceData.setCurrentDb(AttendanceData.createDatabase(name.trim()));
        location.reload();
    },

    renameDatabase() {
        const current = AttendanceData.getCurrentDbName();
        const name = prompt('שם חדש:', AttendanceData.getDbDisplayName(current));
        if (!name || !name.trim()) return;
        const newPrefix = 'sunday_' + name.trim().replace(/\s+/g, '_');
        const keysToMove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(current + '_')) keysToMove.push(k);
        }
        keysToMove.forEach(k => {
            localStorage.setItem(k.replace(current, newPrefix), localStorage.getItem(k));
            localStorage.removeItem(k);
        });
        AttendanceData.saveDbList(AttendanceData.getDbList().map(p => p === current ? newPrefix : p));
        AttendanceData.setCurrentDb(newPrefix);
        location.reload();
    },

    deleteCurrentDatabase() {
        const list = AttendanceData.getDbList();
        if (list.length <= 1) { Toast.show('לא ניתן למחוק מסד יחיד!', 'error'); return; }
        if (!confirm('למחוק את מסד הנתונים הנוכחי?')) return;
        const current = AttendanceData.getCurrentDbName();
        AttendanceData.deleteDatabase(current);
        AttendanceData.setCurrentDb(AttendanceData.getDbList()[0] || 'sunday_default');
        location.reload();
    },

    // ==================== BACKUP / RESTORE ====================
    exportAllData() {
        const data = {
            sunday_version: '1.0',
            attendance: {
                platoons: AttendanceData.loadPlatoons(),
                soldiers: AttendanceData.loadSoldiers(),
                leaves: AttendanceData.loadLeaves(),
                settings: AttendanceData.loadSettings()
            },
            assignment: {
                soldiers: AssignmentData.loadSoldiers(),
                positions: AssignmentData.loadPositions(),
                schedule: AssignmentData.loadSchedule(),
                settings: AssignmentData.loadSettings(),
                company: AssignmentData.loadCompanyData()
            },
            exportDate: new Date().toISOString(),
            dbName: AttendanceData.getCurrentDbName()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sunday_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        Toast.show('📤 גיבוי כל המערכת הורד בהצלחה', 'success');
    },

    importAllData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (data.attendance) {
                        if (data.attendance.platoons) AttendanceData.savePlatoons(data.attendance.platoons);
                        if (data.attendance.soldiers) AttendanceData.saveSoldiers(data.attendance.soldiers);
                        if (data.attendance.leaves) AttendanceData.saveLeaves(data.attendance.leaves);
                        if (data.attendance.settings) AttendanceData.saveSettings(data.attendance.settings);
                    }
                    if (data.assignment) {
                        if (data.assignment.soldiers) AssignmentData.saveSoldiers(data.assignment.soldiers);
                        if (data.assignment.positions) AssignmentData.savePositions(data.assignment.positions);
                        if (data.assignment.schedule) AssignmentData.saveSchedule(data.assignment.schedule);
                        if (data.assignment.settings) AssignmentData.saveSettings(data.assignment.settings);
                        if (data.assignment.company) AssignmentData.saveCompanyData(data.assignment.company);
                    }
                    Toast.show('✅ נתונים שוחזרו - טוען מחדש...', 'success');
                    setTimeout(() => location.reload(), 1000);
                } catch (err) {
                    Toast.show('שגיאה בקובץ: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    },

    resetAllData() {
        if (!confirm('⚠️ למחוק את כל הנתונים במערכת?\nלא ניתן לשחזר!')) return;
        if (!confirm('❗ בטוח בטוח? אין דרך חזרה!')) return;

        // Clear attendance
        const prefix = AttendanceData.getCurrentDbName();
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.startsWith(prefix + '_')) localStorage.removeItem(k);
        }

        // Clear assignment
        AssignmentData.clearAll();

        Toast.show('💣 כל הנתונים נמחקו - טוען מחדש...', 'warning');
        setTimeout(() => location.reload(), 1200);
    },

    // ==================== LOAD SAVED SCHEDULE ====================
    _loadSavedAssignmentSchedule() {
        const saved = AssignmentData.loadSchedule();
        if (saved?.data) {
            if (saved.soldierTotalHours) Scheduler.soldierTotalHours = saved.soldierTotalHours;
            Scheduler.soldierShifts = {};
            Scheduler.positionHistory = {};

            const soldiers = AssignmentData.getActiveSoldiers();
            soldiers.forEach(s => {
                Scheduler.soldierShifts[s.name] = [];
                Scheduler.positionHistory[s.name] = {};
            });

            const positions = AssignmentData.getActivePositions();
            for (const dateStr of Object.keys(saved.data)) {
                for (const hourStr of Object.keys(saved.data[dateStr])) {
                    for (const posName of Object.keys(saved.data[dateStr][hourStr])) {
                        const pd = saved.data[dateStr][hourStr][posName];
                        if (!pd?.soldiers) continue;
                        const pos = positions.find(p => p.name === posName);
                        const dur = pd.duration || pos?.shift_duration_hours || 4;
                        const dp = dateStr.split('/');
                        const start = new Date(parseInt(dp[2]), parseInt(dp[1]) - 1, parseInt(dp[0]), parseInt(hourStr));
                        const end = new Date(start);
                        end.setHours(end.getHours() + dur);
                        pd.soldiers.forEach(name => {
                            if (!Scheduler.soldierShifts[name]) Scheduler.soldierShifts[name] = [];
                            Scheduler.soldierShifts[name].push({ start, end, position: posName });
                            if (!Scheduler.positionHistory[name]) Scheduler.positionHistory[name] = {};
                            Scheduler.positionHistory[name][posName] = (Scheduler.positionHistory[name][posName] || 0) + 1;
                        });
                    }
                }
            }
            if (saved.pattern) Scheduler.pattern = saved.pattern;
        }
    },

    // ==================== DIALOG ====================
    closeDialog(event) {
        if (event && event.target !== event.currentTarget) return;
        document.getElementById('dialogOverlay').style.display = 'none';
    },

    openDialog(html) {
        document.getElementById('dialogContent').innerHTML = html;
        document.getElementById('dialogOverlay').style.display = 'flex';
    },

    // ==================== CLOCK ====================
    startClock() {
        const update = () => {
            const now = new Date();
            const d = now.getDate().toString().padStart(2, '0');
            const m = (now.getMonth() + 1).toString().padStart(2, '0');
            const y = now.getFullYear().toString().slice(2);
            const day = AttendanceData.getDayName(now);
            const h = now.getHours().toString().padStart(2, '0');
            const min = now.getMinutes().toString().padStart(2, '0');
            const sec = now.getSeconds().toString().padStart(2, '0');
            document.getElementById('headerClock').textContent = `${day} | ${d}/${m}/${y} | ${h}:${min}:${sec}`;
        };
        update();
        setInterval(update, 1000);

        // Mission info
        const mission = AttendanceData.getMissionRange();
        const mi = document.getElementById('missionInfo');
        if (mi && mission.start && mission.end) {
            mi.textContent = `${AttendanceData.formatDisplay(mission.start)} - ${AttendanceData.formatDisplay(mission.end)} (${AttendanceData.countMissionDays(mission.start, mission.end)} ימים)`;
        }
    },

    // ==================== SYSTEM STATUS ====================
    updateSystemStatus() {
        const el = document.getElementById('systemStatus');
        if (!el) return;
        const attSoldiers = AttendanceData.loadSoldiers().length;
        const attLeaves = AttendanceData.loadLeaves().length;
        const asgnSoldiers = AssignmentData.loadSoldiers().length;
        const asgnPositions = AssignmentData.loadPositions().length;
        const asgnSchedule = AssignmentData.loadSchedule() ? '✅' : '❌';
        const xlsx = typeof XLSX !== 'undefined' ? '✅' : '❌';
        const platoons = AttendanceData.loadPlatoons().length;
        const companyPlatoons = AssignmentData.loadCompanyData().platoons?.length || 0;

        el.innerHTML = `
            <div class="system-status-row"><span>📂 מסד נתונים:</span><strong>${AttendanceData.getDbDisplayName(AttendanceData.getCurrentDbName())}</strong></div>
            <div class="system-status-row"><span>👥 חיילים (נוכחות):</span><strong>${attSoldiers}</strong></div>
            <div class="system-status-row"><span>🏖️ היעדרויות:</span><strong>${attLeaves}</strong></div>
            <div class="system-status-row"><span>🏗️ מחלקות:</span><strong>${platoons}</strong></div>
            <div class="system-status-row"><span>👥 חיילים (שיבוץ):</span><strong>${asgnSoldiers}</strong></div>
            <div class="system-status-row"><span>📍 עמדות:</span><strong>${asgnPositions}</strong></div>
            <div class="system-status-row"><span>📋 שיבוץ:</span><strong>${asgnSchedule}</strong></div>
            <div class="system-status-row"><span>🏛️ מחלקות פלוגתיות (שיבוץ):</span><strong>${companyPlatoons}</strong></div>
            <div class="system-status-row"><span>📊 ספריית אקסל:</span><strong>${xlsx}</strong></div>`;
    }
};

/**
 * Toast - הודעות קופצות
 */
const Toast = {
    show(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) { alert(message); return; }
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 3200);
    }
};

// Init on load
document.addEventListener('DOMContentLoaded', () => App.init());