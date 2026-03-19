// ========== xlsx-loader.js ========== //
/**
 * XLSX Loader - טעינה אמינה של ספריית אקסל
 */
const XLSXLoader = {
    loaded: false,

    sources: [
        'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
        'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
        'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
    ],

    async load() {
        if (typeof XLSX !== 'undefined') { this.loaded = true; return true; }
        for (let i = 0; i < this.sources.length; i++) {
            try {
                await this.loadScript(this.sources[i]);
                if (typeof XLSX !== 'undefined') {
                    this.loaded = true;
                    console.log('✅ XLSX loaded from source ' + (i + 1));
                    return true;
                }
            } catch (e) {
                console.warn('❌ Source ' + (i + 1) + ' failed');
            }
        }
        this.loaded = false;
        return false;
    },

    loadScript(url) {
        return new Promise((resolve, reject) => {
            const old = document.querySelector('script[data-xlsx]');
            if (old) old.remove();
            const s = document.createElement('script');
            s.src = url;
            s.setAttribute('data-xlsx', '1');
            s.crossOrigin = 'anonymous';
            const timeout = setTimeout(() => { s.remove(); reject(new Error('timeout')); }, 8000);
            s.onload = () => { clearTimeout(timeout); resolve(); };
            s.onerror = () => { clearTimeout(timeout); s.remove(); reject(new Error('failed')); };
            document.head.appendChild(s);
        });
    },

    check(showAlert = true) {
        if (typeof XLSX !== 'undefined') return true;
        if (showAlert) Toast.show('ספריית אקסל לא נטענה - בדוק חיבור אינטרנט', 'error');
        return false;
    }
};

// ========== data-attendance.js ========== //
/**
 * AttendanceData - DataManager for SunDay (Attendance Module)
 * SunDay v3.0
 * Manages: platoons, soldiers, leaves, settings
 * localStorage prefix: dynamic (sunday_default, sunday_xxx...)
 * 
 * שינוי 3: הוספת getAttendanceRange() + getMissionRange() משופר
 * שינוי 8: מטמון נתונים לביצועים
 */
const AttendanceData = {
    _dbPrefix: 'sunday_default',
    _cache: {},  // שינוי 8: מטמון לביצועים
    DAYS_HEB: ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'],
    DAYS_HEB_SHORT: ['א','ב','ג','ד','ה','ו','ש'],
    LEAVE_REASONS: [
        {id:'חופשה', label:'חופשה', cls:'hm-leave', badge:'badge-leave'},
        {id:'קורס', label:'קורס', cls:'hm-course', badge:'badge-course'},
        {id:'מחלה', label:'מחלה', cls:'hm-sick', badge:'badge-sick'},
        {id:'מיוחד', label:'מיוחד', cls:'hm-special', badge:'badge-special'},
        {id:'אחר', label:'אחר', cls:'hm-absent', badge:'badge-active'}
    ],

    _key(name) { return this._dbPrefix + '_' + name; },

    // שינוי 8: Cache helpers
    _getFromCache(key) {
        const fullKey = this._key(key);
        if (this._cache[fullKey]) return this._cache[fullKey];
        const data = localStorage.getItem(fullKey);
        if (data) { this._cache[fullKey] = JSON.parse(data); return this._cache[fullKey]; }
        return null;
    },
    _saveToCache(key, value) {
        const fullKey = this._key(key);
        this._cache[fullKey] = value;
        localStorage.setItem(fullKey, JSON.stringify(value));
    },
    _invalidateCache(key) {
        if (key) { delete this._cache[this._key(key)]; }
        else { this._cache = {}; }
    },

    // ==================== DATABASE MANAGEMENT ====================
    getDbList() {
        const raw = localStorage.getItem('sunday_db_list');
        return raw ? JSON.parse(raw) : ['sunday_default'];
    },
    saveDbList(list) { localStorage.setItem('sunday_db_list', JSON.stringify(list)); },
    getCurrentDbName() { return localStorage.getItem('sunday_current_db') || 'sunday_default'; },
    setCurrentDb(prefix) { this._dbPrefix = prefix; localStorage.setItem('sunday_current_db', prefix); },
    createDatabase(name) {
        const prefix = 'sunday_' + name.replace(/\s+/g, '_');
        const list = this.getDbList();
        if (!list.includes(prefix)) { list.push(prefix); this.saveDbList(list); }
        return prefix;
    },
    deleteDatabase(prefix) {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix + '_')) keysToRemove.push(key);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        this.saveDbList(this.getDbList().filter(p => p !== prefix));
    },
    getDbDisplayName(prefix) { return prefix.replace('sunday_', '').replace(/_/g, ' ') || 'ברירת מחדל'; },

    // ==================== PLATOONS ====================
    loadPlatoons() {
        const cached = this._getFromCache('platoons');
        if (cached) return cached;
        const defaults = [
            { id: '1', name: "מחלקה א'", color: '#27ae60', commander: '' },
            { id: '2', name: "מחלקה ב'", color: '#3498db', commander: '' },
            { id: '3', name: "מחלקה ג'", color: '#e67e22', commander: '' }
        ];
        this.savePlatoons(defaults);
        return defaults;
    },
    savePlatoons(p) { this._saveToCache('platoons', p); },

    // ==================== SOLDIERS ====================
    loadSoldiers() {
        return this._getFromCache('soldiers') || [];
    },
    saveSoldiers(s) { this._saveToCache('soldiers', s); if (typeof App !== 'undefined') App.attendanceDirty = true; },
    addSoldier(soldier) {
        const soldiers = this.loadSoldiers();
        soldier.id = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4);
        soldier.is_active = true;
        soldier.is_commander = soldier.is_commander || ''; // 'commander' | 'vice_commander' | ''
        soldier.roles = soldier.roles || [];
        soldier.platoon_id = soldier.platoon_id || '1';
        soldiers.push(soldier);
        this.saveSoldiers(soldiers);
        return soldier;
    },
    updateSoldier(id, updates) {
        const soldiers = this.loadSoldiers();
        const i = soldiers.findIndex(s => s.id === id);
        if (i !== -1) { Object.assign(soldiers[i], updates); this.saveSoldiers(soldiers); }
    },
    deleteSoldier(id) {
        this.saveSoldiers(this.loadSoldiers().filter(s => s.id !== id));
        this.saveLeaves(this.loadLeaves().filter(l => l.soldier_id !== id));
    },
    getSoldiersByPlatoon(pid) {
        return this.loadSoldiers().filter(s => s.platoon_id === pid && s.is_active !== false);
    },
    getActiveSoldiers() {
        return this.loadSoldiers().filter(s => s.is_active !== false);
    },

    // ==================== LEAVES ====================
    loadLeaves() {
        return this._getFromCache('leaves') || [];
    },
    saveLeaves(l) { this._saveToCache('leaves', l); if (typeof App !== 'undefined') App.attendanceDirty = true; },
    addLeave(leave) {
        const leaves = this.loadLeaves();
        leave.id = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4);
        leaves.push(leave);
        this.saveLeaves(leaves);
        return leave;
    },
    updateLeave(id, updates) {
        const leaves = this.loadLeaves();
        const i = leaves.findIndex(l => l.id === id);
        if (i !== -1) { Object.assign(leaves[i], updates); this.saveLeaves(leaves); }
    },
    deleteLeave(id) {
        this.saveLeaves(this.loadLeaves().filter(l => l.id !== id));
    },
    deleteLeavesForPlatoon(platoonId) {
        const allSoldierIds = this.loadSoldiers().filter(s => s.platoon_id === platoonId).map(s => s.id);
        this.saveLeaves(this.loadLeaves().filter(l => !allSoldierIds.includes(l.soldier_id)));
    },

    isSoldierAbsentOnDate(soldierId, dateStr) {
        const settings = this.loadSettings();
        const threshold = settings.leaveThreshold || '18:00';
        const countLeaveDay = settings.countLeaveDay !== 'no';
        const countReturnDay = settings.countReturnDay !== 'no';
        const leaves = this.loadLeaves().filter(l => l.soldier_id === soldierId);
        for (let idx = 0; idx < leaves.length; idx++) {
            const leave = leaves[idx];
            if (dateStr < leave.start_date || dateStr > leave.end_date) continue;
            if (dateStr === leave.start_date && !countLeaveDay) continue;
            if (dateStr === leave.end_date && !countReturnDay) continue;
            if (dateStr === leave.start_date) {
                const lt = leave.start_time || settings.defaultLeaveTime || '14:00';
                if (lt >= threshold) continue;
            }
            return { absent: true, reason: leave.reason, leave: leave };
        }
        return { absent: false };
    },

    /**
     * Get soldier absence info for a specific date WITH time details
     * Used by Bridge for hourly availability
     */
    getSoldierAbsenceDetails(soldierId, dateStr) {
        const settings = this.loadSettings();
        const leaves = this.loadLeaves().filter(l => l.soldier_id === soldierId);
        const result = [];
        for (const leave of leaves) {
            if (dateStr < leave.start_date || dateStr > leave.end_date) continue;
            result.push({
                reason: leave.reason,
                start_date: leave.start_date,
                end_date: leave.end_date,
                start_time: leave.start_time || settings.defaultLeaveTime || '14:00',
                end_time: leave.end_time || settings.defaultReturnTime || '17:00',
                isStartDay: dateStr === leave.start_date,
                isEndDay: dateStr === leave.end_date
            });
        }
        return result;
    },

    // ==================== SETTINGS ====================
    loadSettings() {
        const data = localStorage.getItem(this._key('settings'));
        return data ? JSON.parse(data) : {
            thresholdCritical: 50,
            thresholdWarning: 60,
            defaultLeaveTime: '14:00',
            defaultReturnTime: '17:00',
            leaveThreshold: '18:00',
            missionStart: '',
            missionEnd: '',
            attendanceStart: '',
            attendanceEnd: '',
            minCommanders: 1,
            countLeaveDay: 'yes',
            countReturnDay: 'yes',
            weekendCount: 'two',
            roles: [
                { name: 'חובש', level: 'company', min: 1 },
                { name: 'רס"פ', level: 'platoon', min: 1 },
                { name: 'נהג', level: 'company', min: 3 }
            ]
        };
    },
    saveSettings(s) { localStorage.setItem(this._key('settings'), JSON.stringify(s)); },

    // ==================== MISSION & MODULE RANGES (שינוי 3) ====================

    /**
     * טווח תאריכי משימה כללי
     * אם לא הוגדר - מחזיר את החודש הנוכחי
     */
    getMissionRange() {
        const s = this.loadSettings();
        if (s.missionStart && s.missionEnd) return { start: s.missionStart, end: s.missionEnd };
        const now = new Date();
        const ms = new Date(now.getFullYear(), now.getMonth(), 1);
        const me = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { start: this.formatISO(ms), end: this.formatISO(me) };
    },

    /**
     * טווח תאריכים ספציפי למודול הנוכחות
     * אם לא הוגדר - מחזיר את טווח המשימה הכללי
     * אם הוגדר - מוודא שהוא בתוך טווח המשימה
     */
    getAttendanceRange() {
        const s = this.loadSettings();
        const mission = this.getMissionRange();
        if (s.attendanceStart && s.attendanceEnd) {
            // Clamp to mission range
            const start = s.attendanceStart < mission.start ? mission.start : s.attendanceStart;
            const end = s.attendanceEnd > mission.end ? mission.end : s.attendanceEnd;
            // Validate start <= end
            if (start > end) return mission;
            return { start, end };
        }
        return mission;
    },

    countMissionDays(startStr, endStr) {
        const settings = this.loadSettings();
        const weekendCount = settings.weekendCount || 'two';
        const dates = this.getDateRange(startStr, endStr);
        let count = 0, i = 0;
        while (i < dates.length) {
            const d = dates[i];
            if (d.getDay() === 5 && weekendCount === 'one') {
                count += 1;
                if (i + 1 < dates.length && dates[i + 1].getDay() === 6) i++;
            } else {
                count += 1;
            }
            i++;
        }
        return count;
    },

    countSoldierAbsentDays(soldierId, startStr, endStr) {
        const settings = this.loadSettings();
        const weekendCount = settings.weekendCount || 'two';
        const dates = this.getDateRange(startStr, endStr);
        let absentDays = 0;
        const reasons = {};
        let i = 0;
        while (i < dates.length) {
            const d = dates[i];
            const ds = this.formatISO(d);
            const r = this.isSoldierAbsentOnDate(soldierId, ds);
            if (d.getDay() === 5 && weekendCount === 'one') {
                let satAbsent = false;
                if (i + 1 < dates.length && dates[i + 1].getDay() === 6) {
                    const ds2 = this.formatISO(dates[i + 1]);
                    satAbsent = this.isSoldierAbsentOnDate(soldierId, ds2).absent;
                    i++;
                }
                if (r.absent || satAbsent) {
                    absentDays += 1;
                    const reason = r.absent ? r.reason : this.isSoldierAbsentOnDate(soldierId, this.formatISO(dates[i])).reason;
                    reasons[reason] = (reasons[reason] || 0) + 1;
                }
            } else {
                if (r.absent) {
                    absentDays += 1;
                    reasons[r.reason] = (reasons[r.reason] || 0) + 1;
                }
            }
            i++;
        }
        return { absentDays, reasons };
    },

    // ==================== DATE UTILITIES ====================
    formatISO(date) {
        const y = date.getFullYear();
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const d = date.getDate().toString().padStart(2, '0');
        return y + '-' + m + '-' + d;
    },
    formatDisplay(dateStr) {
        if (!dateStr) return '';
        const p = dateStr.split('-');
        return p[2] + '/' + p[1] + '/' + p[0].slice(2);
    },
    getDayName(date) { return this.DAYS_HEB[date.getDay()]; },
    getDateRange(startStr, endStr) {
        const dates = [];
        const cur = new Date(startStr);
        const end = new Date(endStr);
        while (cur <= end) { dates.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
        return dates;
    },
    isWeekend(date) { return date.getDay() === 5 || date.getDay() === 6; },
    parseExcelDate(val) {
        if (!val) return null;
        if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}$/)) return val;
        if (typeof val === 'string' && val.includes('/')) {
            const p = val.split('/');
            if (p.length === 3) {
                let yr = p[2]; if (yr.length === 2) yr = '20' + yr;
                return yr + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0');
            }
        }
        if (typeof val === 'number') {
            const d = new Date((val - 25569) * 86400 * 1000);
            return this.formatISO(d);
        }
        return null;
    },

    // ==================== EXCEL IMPORT ====================
    importSoldiersFromExcel(file, targetPlatoonId) {
        const self = this;
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const wb = XLSX.read(e.target.result, { type: 'binary' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                    const soldiers = self.loadSoldiers();
                    const platoons = self.loadPlatoons();
                    let added = 0;
                    rows.forEach(row => {
                        const name = (row['שם'] || row['name'] || row['Name'] || row['שם מלא'] || '').toString().trim();
                        if (!name) return;
                        if (soldiers.find(s => s.name === name)) return;
                        let pid = targetPlatoonId || '1';
                        if (!targetPlatoonId) {
                            const pn = (row['מחלקה'] || row['platoon'] || '').toString().trim();
                            if (pn) { const f = platoons.find(p => p.name.includes(pn) || pn.includes(p.name)); if (f) pid = f.id; }
                        }
                        const isCmd = (row['מפקד'] || row['commander'] || '').toString().trim();
                        const rolesStr = (row['תפקידים'] || row['roles'] || '').toString().trim();
                        const roles = rolesStr ? rolesStr.split(',').map(r => r.trim()).filter(r => r) : [];
                        soldiers.push({
                            id: Date.now().toString() + '_' + added + '_' + Math.random().toString(36).substr(2, 3),
                            name, phone: (row['טלפון'] || row['phone'] || '').toString().trim(),
                            rank: (row['דרגה'] || row['rank'] || '').toString().trim(),
                            platoon_id: pid, is_active: true,
                            is_commander: isCmd === 'כן' || isCmd === 'true' || isCmd === '1',
                            roles
                        });
                        added++;
                    });
                    self.saveSoldiers(soldiers);
                    resolve(added);
                } catch (err) { reject(err); }
            };
            reader.readAsBinaryString(file);
        });
    },

    importLeavesFromExcel(file) {
        const self = this;
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const wb = XLSX.read(e.target.result, { type: 'binary' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                    const soldiers = self.loadSoldiers();
                    const leaves = self.loadLeaves();
                    let added = 0;
                    rows.forEach(row => {
                        const soldierName = (row['חייל'] || row['שם'] || '').toString().trim();
                        if (!soldierName) return;
                        const soldier = soldiers.find(s => s.name === soldierName);
                        if (!soldier) return;
                        const sd = self.parseExcelDate(row['תאריך יציאה'] || row['start_date'] || row['מתאריך']);
                        const ed = self.parseExcelDate(row['תאריך חזרה'] || row['end_date'] || row['עד תאריך']);
                        if (!sd || !ed) return;
                        leaves.push({
                            id: Date.now().toString() + '_' + added + '_' + Math.random().toString(36).substr(2, 3),
                            soldier_id: soldier.id,
                            reason: (row['סיבה'] || row['reason'] || 'חופשה').toString().trim(),
                            start_date: sd, start_time: (row['שעת יציאה'] || row['start_time'] || '').toString().trim() || null,
                            end_date: ed, end_time: (row['שעת חזרה'] || row['end_time'] || '').toString().trim() || null,
                            notes: (row['הערות'] || '').toString().trim()
                        });
                        added++;
                    });
                    self.saveLeaves(leaves);
                    resolve(added);
                } catch (err) { reject(err); }
            };
            reader.readAsBinaryString(file);
        });
    }
};

// ========== data-assignment.js ========== //
/**
 * AssignmentData - DataManager for Assignment Module
 * SunDay v3.0
 * Manages: soldiers (assignment fields), positions, schedule, settings, company
 * localStorage prefix: shavzak_
 *
 * שינוי 2: מבנה שיבוץ מחלקתי
 * שינוי 3: הוספת getAssignmentRange()
 * שינוי 4: סנכרון תפקידים כמערך
 * שינוי 5: שיוך עמדות למחלקה/פלוגה + רוטציה
 * שינוי 8: מטמון נתונים לביצועים
 */
const AssignmentData = {
    KEYS: {
        SOLDIERS: 'shavzak_soldiers',
        POSITIONS: 'shavzak_positions',
        SCHEDULE: 'shavzak_schedule',
        SETTINGS: 'shavzak_settings',
        COMPANY: 'shavzak_company'
    },

    _cache: {},  // שינוי 8: מטמון לביצועים

    DAYS_HEB: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],

    init() {
        this._cache = {};
        if (this.loadSoldiers().length === 0) {
            this.syncSoldiersFromAttendance();
        }
    },

    // שינוי 8: Cache helpers
    _getFromCache(key) {
        if (this._cache[key]) return this._cache[key];
        try {
            const data = localStorage.getItem(key);
            if (data) { this._cache[key] = JSON.parse(data); return this._cache[key]; }
        } catch {}
        return null;
    },
    _saveToCache(key, value) {
        this._cache[key] = value;
        localStorage.setItem(key, JSON.stringify(value));
    },

    // ==================== SOLDIERS ====================
    loadSoldiers() {
        return this._getFromCache(this.KEYS.SOLDIERS) || [];
    },
    saveSoldiers(soldiers) {
        this._saveToCache(this.KEYS.SOLDIERS, soldiers);
    },
    getActiveSoldiers() {
        return this.loadSoldiers().filter(s => s.is_active !== false);
    },
    getActiveSoldiersByPlatoon(platoonId) {
        return this.getActiveSoldiers().filter(s => s.platoon_id === platoonId);
    },
    updateSoldier(id, updates) {
        const soldiers = this.loadSoldiers();
        const idx = soldiers.findIndex(s => s.id === id);
        if (idx !== -1) { soldiers[idx] = { ...soldiers[idx], ...updates }; this.saveSoldiers(soldiers); }
    },

    /**
     * Sync soldiers from attendance module
     * שינוי 4: שומר roles כמערך במקום טקסט שטוח
     */
    syncSoldiersFromAttendance() {
        const attSoldiers = AttendanceData.getActiveSoldiers();
        const platoons = AttendanceData.loadPlatoons();
        const existing = this.loadSoldiers();
        const existingNames = new Set(existing.map(s => s.name));

        let added = 0;
        attSoldiers.forEach(attS => {
            if (existingNames.has(attS.name)) return;
            const platoon = platoons.find(p => p.id === attS.platoon_id);
            existing.push({
                id: 'asgn_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4),
                name: attS.name,
                phone: attS.phone || '',
                rank: attS.rank || '',
                // שינוי 4: שמירה כמערך במקום join
                roles: attS.roles || [],
                is_commander: attS.is_commander || '',
                platoon_name: platoon ? platoon.name : '',
                platoon_id: attS.platoon_id,
                is_active: true,
                blocked_days: [],
                blocked_dates: [],
                preferred_positions: []
            });
            added++;
        });

        // Mark soldiers that no longer exist in attendance as inactive
        existing.forEach(s => {
            const stillExists = attSoldiers.find(a => a.name === s.name);
            if (!stillExists) s.is_active = false;
        });

        // Update platoon info + roles for existing soldiers
        existing.forEach(s => {
            const attS = attSoldiers.find(a => a.name === s.name);
            if (attS) {
                const platoon = platoons.find(p => p.id === attS.platoon_id);
                s.platoon_name = platoon ? platoon.name : '';
                s.platoon_id = attS.platoon_id;
                // שינוי 4: עדכון תפקידים כמערך
                s.roles = attS.roles || [];
                s.is_commander = attS.is_commander || '';
                if (!s.phone && attS.phone) s.phone = attS.phone;
                if (!s.rank && attS.rank) s.rank = attS.rank;
                // Reactivate if soldier is back in attendance
                if (s.is_active === false) s.is_active = true;
            }
        });

        this.saveSoldiers(existing);
        return added;
    },

    // ==================== POSITIONS (שינוי 5) ====================
    loadPositions() {
        return this._getFromCache(this.KEYS.POSITIONS) || [];
    },
    savePositions(positions) {
        this._saveToCache(this.KEYS.POSITIONS, positions);
    },
    addPosition(position) {
        const positions = this.loadPositions();
        position.id = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4);
        position.is_active = true;
        position.soldiers_required = position.soldiers_required || 1;
        position.shift_duration_hours = position.shift_duration_hours || 4;
        position.active_hours_start = position.active_hours_start || 0;
        position.active_hours_end = position.active_hours_end || 24;
        position.active_days = position.active_days || [0, 1, 2, 3, 4, 5, 6];
        position.priority = position.priority || 0;
        // שינוי 5: שדות חדשים לשיוך עמדה
        position.assignment_level = position.assignment_level || 'platoon'; // 'platoon' | 'company'
        position.platoon_id = position.platoon_id || null; // אם מחלקתית - ID המחלקה
        position.rotation = position.rotation || null; // אם פלוגתית - הגדרת רוטציה
        // שינוי 9: דגל מפקד בעמדה
        position.requires_commander = position.requires_commander || 'none'; // 'none' | 'commander' | 'vice_commander'
        position.required_commanders_count = parseInt(position.required_commanders_count) || 1; // כמה מפקדים נדרשים
        // שינוי 10: תפקיד נדרש בעמדה
        position.required_role = position.required_role || ''; // שם תפקיד מתוך הגדרות, או ריק
        position.required_role_count = parseInt(position.required_role_count) || 1; // כמה בעלי תפקיד נדרשים
        positions.push(position);
        this.savePositions(positions);
        return position;
    },
    updatePosition(id, updates) {
        const positions = this.loadPositions();
        const idx = positions.findIndex(p => p.id === id);
        if (idx !== -1) { positions[idx] = { ...positions[idx], ...updates }; this.savePositions(positions); }
    },
    deletePosition(id) {
        this.savePositions(this.loadPositions().filter(p => p.id !== id));
    },
    getActivePositions() {
        return this.loadPositions().filter(p => p.is_active !== false);
    },
    /**
     * שינוי 5: קבל עמדות פעילות לפי מחלקה
     * כולל עמדות מחלקתיות ששייכות למחלקה + עמדות פלוגתיות
     */
    getActivePositionsForPlatoon(platoonId) {
        return this.getActivePositions().filter(p => {
            if (p.assignment_level === 'platoon' && p.platoon_id === platoonId) return true;
            if (p.assignment_level === 'company') return true;
            return false;
        });
    },
    /**
     * שינוי 5: קבל עמדות מחלקתיות בלבד
     */
    getPlatoonPositions(platoonId) {
        return this.getActivePositions().filter(p => 
            p.assignment_level === 'platoon' && p.platoon_id === platoonId
        );
    },
    /**
     * שינוי 5: קבל עמדות פלוגתיות בלבד
     */
    getCompanyPositions() {
        return this.getActivePositions().filter(p => p.assignment_level === 'company');
    },
    /**
     * שינוי 5: בדוק איזו מחלקה אחראית על עמדה פלוגתית בזמן מסוים
     * @param {object} position - העמדה
     * @param {Date} dateTime - זמן לבדיקה
     * @returns {string|null} platoon_id האחראי, או null אם לא מוגדר
     */
    getResponsiblePlatoon(position, dateTime) {
        if (position.assignment_level !== 'company' || !position.rotation) return null;
        const rotation = position.rotation;

        if (rotation.type === 'hours') {
            // רוטציה לפי שעות ביום
            const hour = dateTime.getHours();
            const hourStr = hour.toString().padStart(2, '0') + ':00';
            for (const slot of rotation.schedule) {
                if (hourStr >= slot.start && hourStr < slot.end) {
                    return slot.platoon_id;
                }
            }
        } else if (rotation.type === 'days') {
            // רוטציה לפי ימים בשבוע
            const dayIdx = dateTime.getDay();
            for (const slot of rotation.schedule) {
                if (slot.days && slot.days.includes(dayIdx)) {
                    return slot.platoon_id;
                }
            }
        } else if (rotation.type === 'dates') {
            // רוטציה לפי תאריכים ספציפיים
            const dateStr = AttendanceData.formatISO(dateTime);
            for (const slot of rotation.schedule) {
                if (dateStr >= slot.start_date && dateStr <= slot.end_date) {
                    return slot.platoon_id;
                }
            }
        }

        // ברירת מחדל - מחלקה ראשונה ברוטציה
        if (rotation.schedule && rotation.schedule.length > 0) {
            return rotation.schedule[0].platoon_id;
        }
        return null;
    },

    // ==================== SCHEDULE ====================
    loadSchedule() {
        return this._getFromCache(this.KEYS.SCHEDULE) || null;
    },
    saveSchedule(schedule) {
        this._saveToCache(this.KEYS.SCHEDULE, schedule);
    },

    // ==================== COMPANY ====================
    loadCompanyData() {
        return this._getFromCache(this.KEYS.COMPANY) || { platoons: [], mergedSchedule: null };
    },
    saveCompanyData(data) {
        this._saveToCache(this.KEYS.COMPANY, data);
    },

    // ==================== SETTINGS (שינוי 3) ====================
    loadSettings() {
        const cached = this._getFromCache(this.KEYS.SETTINGS);
        if (cached) return cached;
        const defaults = {
            min_rest_hours: 8,
            default_days: 7,
            assignmentStart: '',
            assignmentEnd: ''
        };
        return defaults;
    },
    saveSettings(settings) {
        this._saveToCache(this.KEYS.SETTINGS, settings);
    },

    /**
     * שינוי 3: טווח תאריכים ספציפי למודול השיבוץ
     * אם לא הוגדר - מחזיר את טווח המשימה הכללי
     * אם הוגדר - מוודא שהוא בתוך טווח המשימה
     */
    getAssignmentRange() {
        const s = this.loadSettings();
        const mission = AttendanceData.getMissionRange();
        if (s.assignmentStart && s.assignmentEnd) {
            // Clamp to mission range
            const start = s.assignmentStart < mission.start ? mission.start : s.assignmentStart;
            const end = s.assignmentEnd > mission.end ? mission.end : s.assignmentEnd;
            // Validate start <= end
            if (start > end) return mission;
            return { start, end };
        }
        return mission;
    },

    // ==================== CLEAR ALL ====================
    clearAll() {
        Object.values(this.KEYS).forEach(key => localStorage.removeItem(key));
    },

    // ==================== IMPORT / EXPORT ====================
    importSoldiersFromExcel(file) {
        return new Promise((resolve, reject) => {
            if (!XLSXLoader.check()) { reject(new Error('XLSX לא זמין')); return; }
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const wb = XLSX.read(data, { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                    const soldiers = this.loadSoldiers();
                    const existingNames = new Set(soldiers.map(s => s.name.trim()));
                    const platoons = AttendanceData.loadPlatoons();
                    let added = 0, skipped = 0;

                    rows.forEach((row, idx) => {
                        const name = this._findField(row, ['שם', 'שם חייל', 'שם מלא', 'name', 'Name', 'soldier']).trim();
                        if (!name || name.length < 2 || name.length > 50 || /^\d+$/.test(name) || /^[^א-תa-zA-Z]/.test(name)) { skipped++; return; }
                        if (existingNames.has(name)) { skipped++; return; }
                        const phone = this._findField(row, ['טלפון', 'נייד', 'phone']).toString().trim();
                        const rank = this._findField(row, ['דרגה', 'rank']).toString().trim();
                        const blockedStr = this._findField(row, ['ימים חסומים', 'blocked_days', 'חסום']).toString().trim();
                        const prefStr = this._findField(row, ['עמדות מועדפות', 'preferred_positions']).toString().trim();
                        const rolesStr = this._findField(row, ['תפקידים', 'roles']).toString().trim();
                        const isCmdStr = this._findField(row, ['מפקד', 'commander']).toString().trim();

                        // Try to match platoon
                        let platoon_id = null;
                        let platoon_name = '';
                        const pn = this._findField(row, ['מחלקה', 'platoon']).toString().trim();
                        if (pn) {
                            const f = platoons.find(p => p.name.includes(pn) || pn.includes(p.name));
                            if (f) { platoon_id = f.id; platoon_name = f.name; }
                        }

                        soldiers.push({
                            id: Date.now().toString() + '_' + idx + '_' + Math.random().toString(36).substr(2, 3),
                            name, phone, rank,
                            // שינוי 4: שמירה כמערך
                            roles: rolesStr ? rolesStr.split(',').map(r => r.trim()).filter(r => r) : [],
                            is_commander: isCmdStr === 'כן' || isCmdStr === 'true' || isCmdStr === '1',
                            platoon_id: platoon_id,
                            platoon_name: platoon_name,
                            is_active: true,
                            blocked_days: blockedStr ? blockedStr.split(',').map(d => d.trim()).filter(d => d && this.DAYS_HEB.includes(d)) : [],
                            blocked_dates: [],
                            preferred_positions: prefStr ? prefStr.split(',').map(p => p.trim()).filter(p => p) : []
                        });
                        existingNames.add(name);
                        added++;
                    });
                    this.saveSoldiers(soldiers);
                    resolve({ added, skipped });
                } catch (err) { reject(err); }
            };
            reader.onerror = () => reject(new Error('שגיאה בקריאת הקובץ'));
            reader.readAsArrayBuffer(file);
        });
    },

    importPositionsFromExcel(file) {
        return new Promise((resolve, reject) => {
            if (!XLSXLoader.check()) { reject(new Error('XLSX לא זמין')); return; }
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const wb = XLSX.read(data, { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                    const positions = this.loadPositions();
                    const platoons = AttendanceData.loadPlatoons();
                    const existingNames = new Set(positions.map(p => p.name.trim()));
                    let added = 0;
                    rows.forEach((row, idx) => {
                        const name = this._findField(row, ['שם', 'שם עמדה', 'עמדה', 'name', 'position']).trim();
                        if (!name || name.length < 2 || existingNames.has(name) || /^\d+$/.test(name)) return;

                        // שינוי 5: שיוך עמדה
                        const levelStr = this._findField(row, ['שיוך', 'assignment_level', 'רמה']).toString().trim();
                        const platoonStr = this._findField(row, ['מחלקה', 'platoon']).toString().trim();
                        let assignment_level = 'platoon';
                        let platoon_id = null;
                        if (levelStr === 'פלוגתי' || levelStr === 'company') {
                            assignment_level = 'company';
                        } else if (platoonStr) {
                            const f = platoons.find(p => p.name.includes(platoonStr) || platoonStr.includes(p.name));
                            if (f) platoon_id = f.id;
                        }

                        positions.push({
                            id: Date.now().toString() + '_' + idx,
                            name,
                            soldiers_required: parseInt(this._findField(row, ['מספר חיילים', 'חיילים', 'soldiers_required'])) || 1,
                            shift_duration_hours: parseInt(this._findField(row, ['אורך משמרת', 'משמרת', 'shift_duration'])) || 4,
                            active_hours_start: parseInt(this._findField(row, ['שעת התחלה', 'התחלה'])) || 0,
                            active_hours_end: parseInt(this._findField(row, ['שעת סיום', 'סיום'])) || 24,
                            active_days: [0, 1, 2, 3, 4, 5, 6],
                            priority: parseInt(this._findField(row, ['עדיפות', 'priority'])) || 0,
                            is_active: true,
                            // שינוי 5
                            assignment_level: assignment_level,
                            platoon_id: platoon_id,
                            rotation: null,
                            // שינוי 9+10
                            requires_commander: 'none',
                            required_commanders_count: 1,
                            required_role: '',
                            required_role_count: 1
                        });
                        existingNames.add(name);
                        added++;
                    });
                    this.savePositions(positions);
                    resolve({ added });
                } catch (err) { reject(err); }
            };
            reader.onerror = () => reject(new Error('שגיאה'));
            reader.readAsArrayBuffer(file);
        });
    },

    importScheduleFromExcel(file) {
        return new Promise((resolve, reject) => {
            if (!XLSXLoader.check()) { reject(new Error('XLSX לא זמין')); return; }
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const wb = XLSX.read(data, { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                    if (rows.length === 0) { reject(new Error('גיליון ריק')); return; }
                    const keys = Object.keys(rows[0]);
                    const dateKey = keys.find(k => k.includes('תאריך') || k.toLowerCase().includes('date')) || keys[0];
                    const hoursKey = keys.find(k => k.includes('שעות') || k.includes('שעה'));
                    const restKey = keys.find(k => k.includes('מנוחה') || k.includes('במנוחה'));
                    const metaKeys = new Set([dateKey, keys.find(k => k.includes('יום')), hoursKey, restKey].filter(Boolean));
                    const positionKeys = keys.filter(k => !metaKeys.has(k));
                    const scheduleData = {};
                    const allSoldiers = new Set();
                    const soldierTotalHours = {};
                    rows.forEach(row => {
                        const dateVal = row[dateKey]?.toString().trim();
                        if (!dateVal) return;
                        let hourStr = '00:00';
                        if (hoursKey && row[hoursKey]) {
                            const parts = row[hoursKey].toString().split('-');
                            hourStr = parts[0].trim();
                            if (!hourStr.includes(':')) hourStr = hourStr.padStart(2, '0') + ':00';
                        }
                        if (!scheduleData[dateVal]) scheduleData[dateVal] = {};
                        if (!scheduleData[dateVal][hourStr]) scheduleData[dateVal][hourStr] = {};
                        for (const posKey of positionKeys) {
                            const val = (row[posKey] || '').toString().trim();
                            if (!val || val === '-') continue;
                            const soldiers = val.split(',').map(s => s.trim()).filter(s => s && s !== '-' && s.length >= 2);
                            soldiers.forEach(s => { allSoldiers.add(s); soldierTotalHours[s] = (soldierTotalHours[s] || 0) + 4; });
                            scheduleData[dateVal][hourStr][posKey] = { soldiers, start_time: hourStr, end_time: hourStr, duration: 4 };
                        }
                    });
                    resolve({
                        soldiers: Array.from(allSoldiers),
                        schedule: { data: scheduleData, warnings: [], soldierTotalHours },
                        positions: positionKeys.map(k => ({ id: Date.now() + '_' + k, name: k, is_active: true })),
                        soldierTotalHours
                    });
                } catch (err) { reject(err); }
            };
            reader.onerror = () => reject(new Error('שגיאה'));
            reader.readAsArrayBuffer(file);
        });
    },

    _findField(row, names) {
        for (const name of names) {
            if (row[name] !== undefined && row[name] !== null) return row[name];
        }
        return '';
    },

    // UTILITIES
    formatDate(date) {
        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    },
    parseDate(str) {
        const p = str.split('/');
        return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
    },
    getDayName(date) { return this.DAYS_HEB[date.getDay()]; },
    formatHour(h) { return h.toString().padStart(2, '0') + ':00'; }
};

// ========== calc.js ========== //
/**
 * Calc - חישובי נוכחות (מבוסס על SunDay scheduler.js)
 */
const Calc = {
    platoonDay(pid, dateStr) {
        const soldiers = AttendanceData.getSoldiersByPlatoon(pid);
        const total = soldiers.length;
        if (!total) return {total:0,present:0,absent:0,pct:100,details:[],presentList:[],absentList:[],commanders:{total:0,present:0,absent:0}};
        let absent = 0;
        const details = [], presentList = [], absentList = [];
        let cmdTotal = 0, cmdAbsent = 0;
        soldiers.forEach(s => {
            const r = AttendanceData.isSoldierAbsentOnDate(s.id, dateStr);
            if (s.is_commander) cmdTotal++;
            if (r.absent) {
                absent++;
                if (s.is_commander) cmdAbsent++;
                details.push({soldier:s,reason:r.reason,leave:r.leave});
                absentList.push({soldier:s,reason:r.reason,leave:r.leave});
            } else {
                presentList.push({soldier:s});
            }
        });
        return {
            total, present:total-absent, absent,
            pct: Math.round(((total-absent)/total)*100),
            details, presentList, absentList,
            commanders:{total:cmdTotal,present:cmdTotal-cmdAbsent,absent:cmdAbsent}
        };
    },

    companyDay(dateStr) {
        const platoons = AttendanceData.loadPlatoons();
        let tAll=0, pAll=0, cmdT=0, cmdP=0;
        const byPlatoon = {};
        platoons.forEach(pl => {
            const r = this.platoonDay(pl.id, dateStr);
            byPlatoon[pl.id] = r;
            tAll += r.total; pAll += r.present;
            cmdT += r.commanders.total; cmdP += r.commanders.present;
        });
        return {
            total:tAll, present:pAll, absent:tAll-pAll,
            pct: tAll>0 ? Math.round((pAll/tAll)*100) : 100,
            byPlatoon,
            commanders:{total:cmdT,present:cmdP,absent:cmdT-cmdP}
        };
    },

    roleStatusDay(dateStr) {
        const settings = AttendanceData.loadSettings();
        const roles = settings.roles || [];
        const platoons = AttendanceData.loadPlatoons();
        const allSoldiers = AttendanceData.getActiveSoldiers();
        const results = [];
        roles.forEach(role => {
            if (role.level === 'company') {
                let presentCount = 0;
                allSoldiers.forEach(s => {
                    if (s.roles && s.roles.includes(role.name)) {
                        const r = AttendanceData.isSoldierAbsentOnDate(s.id, dateStr);
                        if (!r.absent) presentCount++;
                    }
                });
                results.push({name:role.name,level:'company',min:role.min,present:presentCount,ok:presentCount>=role.min});
            } else {
                platoons.forEach(pl => {
                    const plSoldiers = AttendanceData.getSoldiersByPlatoon(pl.id);
                    let presentCount = 0;
                    plSoldiers.forEach(s => {
                        if (s.roles && s.roles.includes(role.name)) {
                            const r = AttendanceData.isSoldierAbsentOnDate(s.id, dateStr);
                            if (!r.absent) presentCount++;
                        }
                    });
                    results.push({name:role.name,level:'platoon',platoonId:pl.id,platoonName:pl.name,min:role.min,present:presentCount,ok:presentCount>=role.min});
                });
            }
        });
        return results;
    },

    commanderStatusDay(pid, dateStr) {
        const settings = AttendanceData.loadSettings();
        const minCmd = settings.minCommanders || 1;
        const soldiers = AttendanceData.getSoldiersByPlatoon(pid);
        let cmdTotal=0, cmdPresent=0;
        const presentCmds=[], absentCmds=[];
        soldiers.forEach(s => {
            if (!s.is_commander) return;
            cmdTotal++;
            const r = AttendanceData.isSoldierAbsentOnDate(s.id, dateStr);
            if (r.absent) absentCmds.push(s);
            else { cmdPresent++; presentCmds.push(s); }
        });
        return {total:cmdTotal,present:cmdPresent,min:minCmd,ok:cmdPresent>=minCmd,presentCmds,absentCmds};
    },

    rangeCompany(startDate, endDate) {
        return AttendanceData.getDateRange(startDate, endDate).map(date => {
            const ds = AttendanceData.formatISO(date);
            const result = this.companyDay(ds);
            result.date = date; result.dateStr = ds;
            result.day = date.getDate(); result.month = date.getMonth()+1;
            result.dayName = AttendanceData.getDayName(date);
            result.isWeekend = AttendanceData.isWeekend(date);
            return result;
        });
    },

    rangePlatoon(pid, startDate, endDate) {
        return AttendanceData.getDateRange(startDate, endDate).map(date => {
            const ds = AttendanceData.formatISO(date);
            const result = this.platoonDay(pid, ds);
            result.date = date; result.dateStr = ds;
            result.day = date.getDate(); result.month = date.getMonth()+1;
            result.dayName = AttendanceData.getDayName(date);
            result.isWeekend = AttendanceData.isWeekend(date);
            return result;
        });
    },

    heatmapData(pid, startDate, endDate) {
        const soldiers = AttendanceData.getSoldiersByPlatoon(pid);
        const mission = AttendanceData.getMissionRange();
        const dates = AttendanceData.getDateRange(startDate, endDate);
        const today = AttendanceData.formatISO(new Date());
        const sorted = soldiers.slice().sort((a,b) => {
            if (a.is_commander && !b.is_commander) return -1;
            if (!a.is_commander && b.is_commander) return 1;
            return 0;
        });
        const days = dates.map(d => {
            const ds = AttendanceData.formatISO(d);
            return {
                day:d.getDate(), month:d.getMonth()+1, date:d, dateStr:ds,
                dayName:AttendanceData.getDayName(d), isWeekend:AttendanceData.isWeekend(d),
                isFuture: ds > today, isToday: ds === today,
                outsideMission: ds < mission.start || ds > mission.end
            };
        });
        const cells = {};
        const dailyPct = [];
        const dailyCmd = [];
        days.forEach(di => {
            let pres = 0;
            sorted.forEach(s => {
                if (!cells[s.id]) cells[s.id] = {};
                const r = AttendanceData.isSoldierAbsentOnDate(s.id, di.dateStr);
                cells[s.id][di.dateStr] = {
                    present: !r.absent, reason: r.reason || null,
                    leave: r.leave || null, isFuture: di.isFuture,
                    isToday: di.isToday, outsideMission: di.outsideMission
                };
                if (!r.absent) pres++;
            });
            dailyPct.push({
                dateStr:di.dateStr, day:di.day,
                pct: sorted.length>0 ? Math.round((pres/sorted.length)*100) : 100,
                present:pres, total:sorted.length
            });
            dailyCmd.push(this.commanderStatusDay(pid, di.dateStr));
        });
        return {soldiers:sorted, days, cells, dailyPct, dailyCmd};
    },

    thresholdClass(pct) {
        const s = AttendanceData.loadSettings();
        if (pct < (s.thresholdCritical||50)) return 'pct-critical';
        if (pct < (s.thresholdWarning||60)) return 'pct-warning';
        return 'pct-normal';
    },

    thresholdLabel(pct) {
        const s = AttendanceData.loadSettings();
        if (pct < (s.thresholdCritical||50)) return 'קריטי';
        if (pct < (s.thresholdWarning||60)) return 'חריג';
        return 'תקין';
    },

    cellClass(cell) {
        if (cell.outsideMission) return 'hm-outside';
        if (cell.isFuture) return 'hm-future';
        if (!cell.present && cell.reason) {
            const r = AttendanceData.LEAVE_REASONS.find(x => x.id === cell.reason);
            return r ? r.cls : 'hm-absent';
        }
        if (!cell.present) return 'hm-absent';
        return 'hm-present';
    },

    reasonShort(reason) {
        if (!reason) return '';
        const map = {'חופשה':"חופ'",'קורס':'קורס','מחלה':"מח'",'מיוחד':"מיו'",'אחר':'אחר'};
        return map[reason] || 'אחר';
    },

    rangeStats(startDate, endDate) {
        const today = AttendanceData.formatISO(new Date());
        const settings = AttendanceData.loadSettings();
        let tsd=0, tpd=0, crit=0, low={pct:100,ds:''};
        AttendanceData.getDateRange(startDate, endDate).forEach(d => {
            const ds = AttendanceData.formatISO(d);
            if (ds > today) return;
            const r = this.companyDay(ds);
            tsd += r.total; tpd += r.present;
            if (r.pct < (settings.thresholdCritical||50)) crit++;
            if (r.pct < low.pct) low = {pct:r.pct, ds};
        });
        const todayData = this.companyDay(today);
        return {
            avgPct: tsd>0 ? Math.round((tpd/tsd)*100) : 100,
            criticalDays: crit, lowestDay: low,
            totalSoldiers: AttendanceData.getActiveSoldiers().length,
            currentAbsent: todayData.absent,
            currentCmdAbsent: todayData.commanders.absent,
            currentCmdTotal: todayData.commanders.total
        };
    },

    soldierMissionStats(soldierId) {
        const mission = AttendanceData.getMissionRange();
        const totalDays = AttendanceData.countMissionDays(mission.start, mission.end);
        const absentData = AttendanceData.countSoldierAbsentDays(soldierId, mission.start, mission.end);
        const presentDays = totalDays - absentData.absentDays;
        return {
            totalDays, presentDays,
            absentDays: absentData.absentDays,
            pct: totalDays > 0 ? Math.round((presentDays/totalDays)*100) : 100,
            reasons: absentData.reasons
        };
    }
};

// ========== bridge.js ========== //
/**
 * Bridge - הגשר בין מערכת הנוכחות למערכת השיבוץ
 * SunDay v3.0
 * 
 * שינוי 4: סנכרון תפקידים כמערך + is_commander
 * שינוי 5: תמיכה בסינון לפי מחלקה ורוטציה
 */
const Bridge = {

    /**
     * Check if a soldier is available for assignment at a specific date+hour
     * @param {string} soldierName - soldier name
     * @param {Date} dateTime - date and hour to check
     * @returns {object} { available: boolean, reason: string|null, returnsAt: string|null }
     */
    isSoldierAvailable(soldierName, dateTime) {
        const attSoldiers = AttendanceData.getActiveSoldiers();
        const attSoldier = attSoldiers.find(s => s.name === soldierName);

        if (!attSoldier) return { available: true, reason: null, returnsAt: null };

        const dateStr = AttendanceData.formatISO(dateTime);
        const currentHour = dateTime.getHours();

        const absences = AttendanceData.getSoldierAbsenceDetails(attSoldier.id, dateStr);

        if (absences.length === 0) {
            return { available: true, reason: null, returnsAt: null };
        }

        for (const absence of absences) {
            if (absence.isStartDay && !absence.isEndDay) {
                const leaveHour = parseInt(absence.start_time.split(':')[0]) || 14;
                if (currentHour < leaveHour) {
                    continue;
                } else {
                    return { available: false, reason: absence.reason, returnsAt: null };
                }
            }

            if (absence.isEndDay && !absence.isStartDay) {
                const returnHour = parseInt(absence.end_time.split(':')[0]) || 17;
                const availableFrom = returnHour + 1;
                if (currentHour >= availableFrom) {
                    continue;
                } else {
                    return { available: false, reason: absence.reason, returnsAt: absence.end_time };
                }
            }

            if (absence.isStartDay && absence.isEndDay) {
                const leaveHour = parseInt(absence.start_time.split(':')[0]) || 14;
                const returnHour = parseInt(absence.end_time.split(':')[0]) || 17;
                const availableFrom = returnHour + 1;

                if (currentHour < leaveHour) {
                    continue;
                } else if (currentHour >= availableFrom) {
                    continue;
                } else {
                    return { available: false, reason: absence.reason, returnsAt: absence.end_time };
                }
            }

            if (!absence.isStartDay && !absence.isEndDay) {
                return { available: false, reason: absence.reason, returnsAt: null };
            }
        }

        return { available: true, reason: null, returnsAt: null };
    },

    /**
     * Check if a soldier is available for an entire shift
     */
    isSoldierAvailableForShift(soldierName, shiftStart, durationHours) {
        for (let h = 0; h < durationHours; h++) {
            const checkTime = new Date(shiftStart);
            checkTime.setHours(checkTime.getHours() + h);

            const result = this.isSoldierAvailable(soldierName, checkTime);
            if (!result.available) {
                return {
                    available: false,
                    reason: result.reason,
                    conflictHour: checkTime.getHours(),
                    returnsAt: result.returnsAt
                };
            }
        }

        return { available: true, reason: null, conflictHour: null };
    },

    /**
     * Get list of available soldiers for a specific datetime
     * @param {Date} dateTime
     * @param {string|null} platoonId - optional: filter by platoon
     * @returns {Array} array of available soldier names
     */
    getAvailableSoldierNames(dateTime, platoonId) {
        let asgnSoldiers = AssignmentData.getActiveSoldiers();
        
        // שינוי 5: סינון לפי מחלקה אם צוין
        if (platoonId) {
            asgnSoldiers = asgnSoldiers.filter(s => s.platoon_id === platoonId);
        }
        
        const available = [];
        for (const soldier of asgnSoldiers) {
            const result = this.isSoldierAvailable(soldier.name, dateTime);
            if (result.available) {
                available.push(soldier.name);
            }
        }

        return available;
    },

    /**
     * Get availability status for all soldiers at a given date
     * @param {string} dateStr - ISO date string (YYYY-MM-DD)
     * @param {string|null} platoonId - optional: filter by platoon
     * @returns {Array} array of { name, available, reason, returnsAt, platoon_id, roles, is_commander }
     */
    getAllSoldiersStatus(dateStr, platoonId) {
        let asgnSoldiers = AssignmentData.getActiveSoldiers();
        
        if (platoonId) {
            asgnSoldiers = asgnSoldiers.filter(s => s.platoon_id === platoonId);
        }
        
        const dateTime = new Date(dateStr);
        dateTime.setHours(8, 0, 0, 0);

        return asgnSoldiers.map(soldier => {
            const result = this.isSoldierAvailable(soldier.name, dateTime);
            return {
                name: soldier.name,
                id: soldier.id,
                available: result.available,
                reason: result.reason,
                returnsAt: result.returnsAt,
                // שינוי 4: כולל תפקידים ומפקד
                platoon_id: soldier.platoon_id,
                platoon_name: soldier.platoon_name || '',
                roles: soldier.roles || [],
                is_commander: soldier.is_commander || false
            };
        });
    },

    /**
     * Get detailed availability for a soldier across all hours of a day
     */
    getSoldierDaySchedule(soldierName, dateStr) {
        const result = [];
        for (let h = 0; h < 24; h++) {
            const dt = new Date(dateStr);
            dt.setHours(h, 0, 0, 0);
            const check = this.isSoldierAvailable(soldierName, dt);
            result.push({
                hour: h,
                available: check.available,
                reason: check.reason
            });
        }
        return result;
    },

    /**
     * Sync soldiers from attendance to assignment module
     * שינוי 4: שומר roles כמערך + is_commander + עדכון תפקידים לקיימים
     * @returns {object} { added, deactivated, total }
     */
    syncSoldiers() {
        const attSoldiers = AttendanceData.getActiveSoldiers();
        const platoons = AttendanceData.loadPlatoons();
        const asgnSoldiers = AssignmentData.loadSoldiers();
        const existingNames = new Set(asgnSoldiers.map(s => s.name));

        let added = 0;
        let deactivated = 0;

        // Add new soldiers from attendance
        attSoldiers.forEach(attS => {
            if (!existingNames.has(attS.name)) {
                const platoon = platoons.find(p => p.id === attS.platoon_id);
                asgnSoldiers.push({
                    id: 'asgn_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4),
                    name: attS.name,
                    phone: attS.phone || '',
                    rank: attS.rank || '',
                    // שינוי 4: שמירה כמערך במקום join
                    roles: attS.roles || [],
                    is_commander: attS.is_commander || '',
                    platoon_name: platoon ? platoon.name : '',
                    platoon_id: attS.platoon_id,
                    is_active: true,
                    blocked_days: [],
                    blocked_dates: [],
                    preferred_positions: []
                });
                added++;
            }
        });

        // Deactivate soldiers no longer in attendance
        const attNames = new Set(attSoldiers.map(s => s.name));
        asgnSoldiers.forEach(s => {
            if (!attNames.has(s.name) && s.is_active !== false) {
                s.is_active = false;
                deactivated++;
            }
            // Reactivate if soldier is back in attendance
            if (attNames.has(s.name) && s.is_active === false) {
                s.is_active = true;
            }
        });

        // Update platoon info + roles for existing soldiers
        asgnSoldiers.forEach(s => {
            const attS = attSoldiers.find(a => a.name === s.name);
            if (attS) {
                const platoon = platoons.find(p => p.id === attS.platoon_id);
                s.platoon_name = platoon ? platoon.name : '';
                s.platoon_id = attS.platoon_id;
                // שינוי 4: עדכון תפקידים כמערך
                s.roles = attS.roles || [];
                s.is_commander = attS.is_commander || '';
                // Update phone/rank if empty
                if (!s.phone && attS.phone) s.phone = attS.phone;
                if (!s.rank && attS.rank) s.rank = attS.rank;
            }
        });

        AssignmentData.saveSoldiers(asgnSoldiers);

        return {
            added,
            deactivated,
            total: asgnSoldiers.filter(s => s.is_active !== false).length
        };
    },

    /**
     * שינוי 4: בדוק שיש מספיק בעלי תפקידים במשמרת
     * @param {Array} assignedNames - שמות החיילים שמשובצים
     * @param {string} dateStr - ISO date
     * @returns {Array} warnings array
     */
    checkRolesInShift(assignedNames, dateStr) {
        const settings = AttendanceData.loadSettings();
        const roles = settings.roles || [];
        const asgnSoldiers = AssignmentData.getActiveSoldiers();
        const warnings = [];

        roles.forEach(role => {
            if (role.level === 'company') {
                // Count role holders in the assigned list
                let count = 0;
                assignedNames.forEach(name => {
                    const soldier = asgnSoldiers.find(s => s.name === name);
                    if (soldier && soldier.roles && soldier.roles.includes(role.name)) {
                        count++;
                    }
                });
                if (count < role.min) {
                    warnings.push({
                        type: 'shift_role',
                        message: `⚠️ חסר ${role.name} (${count}/${role.min}) - רמה פלוגתית`
                    });
                }
            }
        });

        return warnings;
    },

    /**
     * שינוי 4: בדוק תפקידים במשמרת עבור מחלקה ספציפית
     * @param {Array} assignedNames - שמות החיילים
     * @param {string} platoonId - מזהה מחלקה
     * @returns {Array} warnings
     */
    checkRolesInPlatoonShift(assignedNames, platoonId) {
        const settings = AttendanceData.loadSettings();
        const roles = settings.roles || [];
        const asgnSoldiers = AssignmentData.getActiveSoldiers();
        const platoons = AttendanceData.loadPlatoons();
        const platoon = platoons.find(p => p.id === platoonId);
        const warnings = [];

        roles.forEach(role => {
            if (role.level === 'platoon') {
                let count = 0;
                assignedNames.forEach(name => {
                    const soldier = asgnSoldiers.find(s => s.name === name && s.platoon_id === platoonId);
                    if (soldier && soldier.roles && soldier.roles.includes(role.name)) {
                        count++;
                    }
                });
                if (count < role.min) {
                    warnings.push({
                        type: 'shift_role',
                        message: `⚠️ חסר ${role.name} ב${platoon ? platoon.name : 'מחלקה'} (${count}/${role.min})`
                    });
                }
            }
        });

        return warnings;
    },

    /**
     * שינוי 5: קבל את המחלקה האחראית על עמדה פלוגתית בזמן מסוים
     * @param {object} position - העמדה
     * @param {Date} dateTime - הזמן
     * @returns {string|null} platoon_id
     */
    getResponsiblePlatoonForPosition(position, dateTime) {
        return AssignmentData.getResponsiblePlatoon(position, dateTime);
    },

    /**
     * Get summary of attendance for dashboard
     */
    getDaySummary(dateStr) {
        const platoons = AttendanceData.loadPlatoons();
        const result = {
            total: 0,
            present: 0,
            absent: 0,
            pct: 100,
            byPlatoon: {},
            absentDetails: []
        };

        platoons.forEach(pl => {
            const soldiers = AttendanceData.getSoldiersByPlatoon(pl.id);
            let plPresent = 0;
            let plAbsent = 0;

            soldiers.forEach(s => {
                const r = AttendanceData.isSoldierAbsentOnDate(s.id, dateStr);
                result.total++;
                if (r.absent) {
                    plAbsent++;
                    result.absent++;
                    result.absentDetails.push({
                        name: s.name,
                        platoon: pl.name,
                        platoon_id: pl.id,
                        reason: r.reason,
                        leave: r.leave,
                        roles: s.roles || [],
                        is_commander: s.is_commander
                    });
                } else {
                    plPresent++;
                    result.present++;
                }
            });

            result.byPlatoon[pl.id] = {
                name: pl.name,
                color: pl.color,
                total: soldiers.length,
                present: plPresent,
                absent: plAbsent,
                pct: soldiers.length > 0 ? Math.round((plPresent / soldiers.length) * 100) : 100
            };
        });

        result.pct = result.total > 0 ? Math.round((result.present / result.total) * 100) : 100;
        return result;
    },

    /**
     * Get the schedule data for a specific date (for dashboard accordion)
     */
    getScheduleForDate(dateStr) {
        const schedule = AssignmentData.loadSchedule();
        if (!schedule?.data) return null;

        const parts = dateStr.split('-');
        const formatted = parts[2] + '/' + parts[1] + '/' + parts[0];

        if (schedule.data[formatted]) {
            return {
                dateStr: formatted,
                hours: schedule.data[formatted]
            };
        }

        return null;
    },

    /**
     * Convert ISO date (YYYY-MM-DD) to assignment format (DD/MM/YYYY)
     */
    isoToAssignment(isoStr) {
        if (!isoStr) return '';
        const p = isoStr.split('-');
        return p[2] + '/' + p[1] + '/' + p[0];
    },

    /**
     * Convert assignment format (DD/MM/YYYY) to ISO (YYYY-MM-DD)
     */
    assignmentToISO(asgStr) {
        if (!asgStr) return '';
        const p = asgStr.split('/');
        return p[2] + '-' + p[1] + '-' + p[0];
    }
};

// ========== scheduler.js ========== //
/**
 * Scheduler - אלגוריתם שיבוץ v3.2 + Bridge integration
 * SunDay v3.0
 *
 * שינוי 2: שיבוץ מחלקתי - סינון חיילים לפי מחלקה
 * שינוי 3: ולידציה שלא לשבץ מחוץ לטווח
 * שינוי 4: התחשבות בתפקידים בשיבוץ
 * שינוי 5: התחשבות בשיוך עמדות ורוטציה
 */
const Scheduler = {
    schedule: {},
    warnings: [],
    soldierShifts: {},
    soldierTotalHours: {},
    positionHistory: {},
    pattern: null,

    /**
     * Generate schedule
     * @param {Date} startDate
     * @param {number} numDays
     * @param {string|null} platoonId - אם מוגדר, שיבוץ רק עבור מחלקה ספציפית (שינוי 2)
     */
    generate(startDate, numDays, platoonId, lockedSlots) {
        const allSoldiers = AssignmentData.getActiveSoldiers();
        const allPositions = AssignmentData.getActivePositions();
        const settings = AssignmentData.loadSettings();
        const attSettings = AttendanceData.loadSettings();

        // lockedSlots: array of { dateStr, hourStr, posName, soldiers[] }
        const _locked = lockedSlots || [];
        const _lockedMap = {};  // key: dateStr|hourStr|posName => soldiers[]
        _locked.forEach(ls => {
            _lockedMap[`${ls.dateStr}|${ls.hourStr}|${ls.posName}`] = ls.soldiers;
        });

        // שינוי 2: סינון חיילים לפי מחלקה אם צוין
        let soldiers = allSoldiers;
        if (platoonId) {
            soldiers = allSoldiers.filter(s => s.platoon_id === platoonId);
        }

        // שינוי 5: סינון עמדות לפי מחלקה/פלוגה
        let positions = allPositions;
        if (platoonId) {
            positions = allPositions.filter(p => {
                if (p.assignment_level === 'platoon' && p.platoon_id === platoonId) return true;
                if (p.assignment_level === 'company') return true;
                return false;
            });
        }

        if (soldiers.length === 0) { Toast.show('אין חיילים פעילים!', 'error'); return null; }
        if (positions.length === 0) { Toast.show('אין עמדות פעילות!', 'error'); return null; }

        // שינוי 3: ולידציה מול טווח המשימה
        const asgnRange = AssignmentData.getAssignmentRange();
        const startStr = AttendanceData.formatISO(startDate);
        if (startStr < asgnRange.start) {
            Toast.show(`⚠️ תאריך התחלה לפני טווח השיבוץ (${AttendanceData.formatDisplay(asgnRange.start)})`, 'error');
            return null;
        }

        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + numDays - 1);
        const endStr = AttendanceData.formatISO(endDate);
        if (endStr > asgnRange.end) {
            const maxDays = Math.ceil((new Date(asgnRange.end) - startDate) / (1000 * 60 * 60 * 24)) + 1;
            if (maxDays <= 0) {
                Toast.show(`⚠️ תאריך מחוץ לטווח השיבוץ`, 'error');
                return null;
            }
            Toast.show(`⚠️ מוגבל ל-${maxDays} ימים בטווח השיבוץ`, 'warning');
            numDays = maxDays;
        }

        this.schedule = {};
        this.warnings = [];
        this.soldierShifts = {};
        this.soldierTotalHours = {};
        this.positionHistory = {};
        const minRest = settings.min_rest_hours || 8;

        soldiers.forEach(s => {
            this.soldierShifts[s.name] = [];
            this.soldierTotalHours[s.name] = 0;
            this.positionHistory[s.name] = {};
        });

        // Pre-fill locked slots into tracking so generate respects them
        _locked.forEach(ls => {
            const lDate = AssignmentData.parseDate(ls.dateStr);
            lDate.setHours(parseInt(ls.hourStr));
            const lPos = positions.find(p => p.name === ls.posName);
            const lDur = lPos ? (lPos.shift_duration_hours || 4) : 4;
            const lEnd = new Date(lDate.getTime() + lDur * 3600000);
            ls.soldiers.forEach(name => {
                if (!this.soldierShifts[name]) {
                    this.soldierShifts[name] = [];
                    this.soldierTotalHours[name] = 0;
                    this.positionHistory[name] = {};
                }
                this.soldierShifts[name].push({ start: lDate, end: lEnd, position: ls.posName });
                this.soldierTotalHours[name] += lDur;
                this.positionHistory[name][ls.posName] = (this.positionHistory[name][ls.posName] || 0) + 1;
            });
        });

        const sortedPos = [...positions].sort((a, b) => (b.priority || 0) - (a.priority || 0));

        // מעקב אחרי סוף המשמרת האחרונה לכל עמדה - מונע חפיפה בעמדות 5/7 שעות
        const posNextShiftEnd = {};

        const start = new Date(startDate);
        const end = new Date(start);
        end.setDate(end.getDate() + numDays);
        let cur = new Date(start);

        while (cur < end) {
            const dateStr = AssignmentData.formatDate(cur);
            const hourStr = AssignmentData.formatHour(cur.getHours());
            const dayIdx = cur.getDay();

            if (!this.schedule[dateStr]) this.schedule[dateStr] = {};

            for (const pos of sortedPos) {
                const sStart = pos.active_hours_start || 0;
                const sEnd = pos.active_hours_end || 24;
                const dur = pos.shift_duration_hours || 4;
                const h = cur.getHours();

                // בדיקת שעות פעילות
                if (sEnd > sStart) {
                    if (h < sStart || h >= sEnd) continue;
                } else {
                    if (h < sStart && h >= sEnd) continue;
                }

                // בדיקת ימי פעילות
                if (pos.active_days && !pos.active_days.includes(dayIdx)) continue;

                // === שרשור משמרות: מניעת חפיפה ===
                const curMs = cur.getTime();
                const lastEnd = posNextShiftEnd[pos.name];
                if (lastEnd !== undefined) {
                    if (curMs < lastEnd) {
                        // המשמרת הקודמת עוד לא נגמרה - דלג
                        continue;
                    } else if (curMs === lastEnd) {
                        // בדיוק בזמן - התחל משמרת חדשה
                    } else {
                        // עברנו את הזמן (למשל בגלל שעות לא פעילות) - יישר לפי מודולו
                        if ((h - sStart + 24) % 24 % dur !== 0) continue;
                    }
                } else {
                    // משמרת ראשונה - השתמש בנוסחת מודולו למציאת שעת התחלה
                    if ((h - sStart + 24) % 24 % dur !== 0) continue;
                }

                // שינוי 5: עמדה פלוגתית - בדוק איזו מחלקה אחראית
                let eligibleSoldiers = soldiers;
                if (pos.assignment_level === 'company' && pos.rotation && platoonId) {
                    const responsiblePlatoon = AssignmentData.getResponsiblePlatoon(pos, cur);
                    if (responsiblePlatoon && responsiblePlatoon !== platoonId) {
                        continue; // מחלקה אחרת אחראית בזמן הזה
                    }
                } else if (pos.assignment_level === 'company' && pos.rotation && !platoonId) {
                    // שיבוץ פלוגתי כללי - סנן חיילים לפי מחלקה אחראית
                    const responsiblePlatoon = AssignmentData.getResponsiblePlatoon(pos, cur);
                    if (responsiblePlatoon) {
                        eligibleSoldiers = soldiers.filter(s => s.platoon_id === responsiblePlatoon);
                    }
                } else if (pos.assignment_level === 'platoon' && pos.platoon_id) {
                    // עמדה מחלקתית - רק חיילים מאותה מחלקה
                    eligibleSoldiers = soldiers.filter(s => s.platoon_id === pos.platoon_id);
                }

                const needed = pos.soldiers_required || 1;
                const shiftEnd = new Date(cur);
                shiftEnd.setHours(shiftEnd.getHours() + dur);
                const endTimeStr = AssignmentData.formatHour(shiftEnd.getHours());

                // Check if this slot is locked
                const lockKey = `${dateStr}|${hourStr}|${pos.name}`;
                const lockedSoldiers = _lockedMap[lockKey];

                const assigned = [];
                if (lockedSoldiers && lockedSoldiers.length > 0) {
                    // Use locked soldiers - they were already pre-filled in tracking
                    assigned.push(...lockedSoldiers);
                } else {
                    // === שיבוץ אחיד עם אכיפת מינימום + מקסימום מפקדים/בע"ת ===
                    const reqCmd = (pos.requires_commander && pos.requires_commander !== 'none') ? pos.requires_commander : null;
                    const reqCmdCount = reqCmd ? Math.min(parseInt(pos.required_commanders_count) || 1, needed) : 0;
                    const reqRole = pos.required_role || '';
                    const reqRoleCount = reqRole ? Math.min(parseInt(pos.required_role_count) || 1, needed) : 0;

                    const _isCmdQualified = (s) => {
                        if (!reqCmd) return false;
                        if (reqCmd === 'commander') return s.is_commander === 'commander';
                        return s.is_commander === 'commander' || s.is_commander === 'vice_commander';
                    };
                    const _isRoleQualified = (s) => reqRole && s.roles && s.roles.includes(reqRole);

                    // שלב 1: ניקוד אחיד לכולם — ללא בונוסים
                    const avail = this._getAvailable(eligibleSoldiers, cur, dur, minRest, pos.name, 'none', '');
                    const candidates = avail.slice(0, Math.min(needed, avail.length));

                    // שלב 2: אכיפת מקסימום מפקדים — אם יותר מדי, החלף עודפים ברגילים
                    // מונע "שריפת" מפקדים על משמרת אחת כשנדרש רק 1
                    if (reqCmdCount > 0 && candidates.length > 0) {
                        let cmdCount = candidates.filter(s => _isCmdQualified(s)).length;
                        if (cmdCount > reqCmdCount) {
                            // יותר מדי מפקדים — החלף עודפים ברגילים מהפול
                            const spareRegulars = avail.filter(s => !candidates.includes(s) && !_isCmdQualified(s));
                            // מיין מפקדים ב-candidates לפי score (נמוך ביותר = הכי עמוס → יוחלף ראשון)
                            const cmdInCandidates = [];
                            for (let i = 0; i < candidates.length; i++) {
                                if (_isCmdQualified(candidates[i])) cmdInCandidates.push({ idx: i, score: candidates[i].score });
                            }
                            cmdInCandidates.sort((a, b) => a.score - b.score); // הכי עמוס ראשון
                            let excess = cmdCount - reqCmdCount;
                            for (const { idx } of cmdInCandidates) {
                                if (excess <= 0 || spareRegulars.length === 0) break;
                                candidates[idx] = spareRegulars.shift();
                                excess--;
                            }
                        }
                    }

                    // שלב 3: אכיפת מינימום מפקדים — אם חסרים, החלף רגיל עם הכי הרבה שעות
                    if (reqCmdCount > 0 && candidates.length > 0) {
                        let cmdCount = candidates.filter(s => _isCmdQualified(s)).length;
                        if (cmdCount < reqCmdCount) {
                            const spareCmds = avail.filter(s => !candidates.includes(s) && _isCmdQualified(s));
                            while (cmdCount < reqCmdCount && spareCmds.length > 0) {
                                let worstIdx = -1, worstScore = Infinity;
                                for (let i = 0; i < candidates.length; i++) {
                                    if (!_isCmdQualified(candidates[i]) && candidates[i].score < worstScore) {
                                        worstScore = candidates[i].score;
                                        worstIdx = i;
                                    }
                                }
                                if (worstIdx === -1) break;
                                candidates[worstIdx] = spareCmds.shift();
                                cmdCount++;
                            }
                        }
                    }

                    // שלב 4: אכיפת מקסימום + מינימום בעלי תפקיד — אותו רעיון
                    if (reqRoleCount > 0 && candidates.length > 0) {
                        // מקסימום
                        let roleCount = candidates.filter(s => _isRoleQualified(s)).length;
                        if (roleCount > reqRoleCount) {
                            const spareNonRole = avail.filter(s => !candidates.includes(s) && !_isRoleQualified(s) && !_isCmdQualified(s));
                            const roleInCandidates = [];
                            for (let i = 0; i < candidates.length; i++) {
                                if (_isRoleQualified(candidates[i]) && !_isCmdQualified(candidates[i])) {
                                    roleInCandidates.push({ idx: i, score: candidates[i].score });
                                }
                            }
                            roleInCandidates.sort((a, b) => a.score - b.score);
                            let excess = roleCount - reqRoleCount;
                            for (const { idx } of roleInCandidates) {
                                if (excess <= 0 || spareNonRole.length === 0) break;
                                candidates[idx] = spareNonRole.shift();
                                excess--;
                            }
                        }
                        // מינימום
                        roleCount = candidates.filter(s => _isRoleQualified(s)).length;
                        if (roleCount < reqRoleCount) {
                            const spareRoles = avail.filter(s => !candidates.includes(s) && _isRoleQualified(s));
                            while (roleCount < reqRoleCount && spareRoles.length > 0) {
                                let worstIdx = -1, worstScore = Infinity;
                                for (let i = 0; i < candidates.length; i++) {
                                    if (!_isRoleQualified(candidates[i]) && !_isCmdQualified(candidates[i]) && candidates[i].score < worstScore) {
                                        worstScore = candidates[i].score;
                                        worstIdx = i;
                                    }
                                }
                                if (worstIdx === -1) break;
                                candidates[worstIdx] = spareRoles.shift();
                                roleCount++;
                            }
                        }
                    }

                    // שלב 5: אם חסרים מפקדים — השאר מקום ריק + אזהרה
                    const finalCmdCount = reqCmdCount > 0 ? candidates.filter(s => _isCmdQualified(s)).length : 0;
                    const cmdMissing = Math.max(0, reqCmdCount - finalCmdCount);
                    if (cmdMissing > 0) {
                        let toRemove = cmdMissing;
                        for (let i = candidates.length - 1; i >= 0 && toRemove > 0; i--) {
                            if (!_isCmdQualified(candidates[i])) {
                                candidates.splice(i, 1);
                                toRemove--;
                            }
                        }
                    }

                    // Track all assignments
                    for (const s of candidates) {
                        assigned.push(s.name);
                        this.soldierShifts[s.name].push({ start: new Date(cur), end: new Date(shiftEnd), position: pos.name });
                        this.soldierTotalHours[s.name] += dur;
                        this.positionHistory[s.name][pos.name] = (this.positionHistory[s.name][pos.name] || 0) + 1;
                    }

                    // אזהרת חוסר חיילים
                    if (assigned.length < needed) {
                        this.warnings.push({
                            type: 'error',
                            message: `⚠️ ${dateStr} ${hourStr} - חסרים חיילים ל"${pos.name}" (חסרים ${needed - assigned.length})`
                        });
                    }
                }

                // שינוי 4: בדוק תפקידים בכל משמרת
                if (assigned.length > 0) {
                    const roleWarnings = Bridge.checkRolesInShift(assigned, dateStr);
                    roleWarnings.forEach(w => {
                        // Only add unique role warnings per shift
                        const key = `${dateStr}-${hourStr}-${w.message}`;
                        if (!this.warnings.find(x => x.message === w.message && x._key === key)) {
                            this.warnings.push({ ...w, _key: key });
                        }
                    });

                    // שינוי 9: בדוק דרישת מפקד בעמדה
                    if (pos.requires_commander && pos.requires_commander !== 'none') {
                        const cmdWarning = this._checkCommanderRequirement(assigned, pos, dateStr, hourStr);
                        if (cmdWarning) {
                            const key = `${dateStr}-${hourStr}-cmd-${pos.name}`;
                            if (!this.warnings.find(x => x._key === key)) {
                                this.warnings.push({ ...cmdWarning, _key: key });
                            }
                        }
                    }

                    // שינוי 10: בדוק דרישת תפקיד בעמדה
                    if (pos.required_role) {
                        const roleWarning = this._checkRoleRequirement(assigned, pos, dateStr, hourStr);
                        if (roleWarning) {
                            const key = `${dateStr}-${hourStr}-role-${pos.name}`;
                            if (!this.warnings.find(x => x._key === key)) {
                                this.warnings.push({ ...roleWarning, _key: key });
                            }
                        }
                    }

                    // שינוי 4: בדוק תפקידים ברמת מחלקה
                    if (platoonId) {
                        const platoonRoleWarnings = Bridge.checkRolesInPlatoonShift(assigned, platoonId);
                        platoonRoleWarnings.forEach(w => {
                            const key = `${dateStr}-${hourStr}-${w.message}`;
                            if (!this.warnings.find(x => x._key === key)) {
                                this.warnings.push({ ...w, _key: key });
                            }
                        });
                    }
                }

                if (!this.schedule[dateStr][hourStr]) this.schedule[dateStr][hourStr] = {};

                this.schedule[dateStr][hourStr][pos.name] = {
                    soldiers: assigned, start_time: hourStr, end_time: endTimeStr, duration: dur
                };

                // עדכון מעקב: המשמרת הבאה תתחיל כשהנוכחית נגמרת
                posNextShiftEnd[pos.name] = shiftEnd.getTime();
            }

            cur.setHours(cur.getHours() + 1);
        }

        this._checkRest(minRest, soldiers);
        this._calcPattern(soldiers);

        const scheduleData = {
            data: this.schedule, warnings: this.warnings,
            startDate: startDate.toISOString(), numDays,
            generatedAt: new Date().toISOString(),
            soldierTotalHours: this.soldierTotalHours,
            pattern: this.pattern,
            platoonId: platoonId || null, // שינוי 2: שמור לאיזו מחלקה השיבוץ
            lockedSlots: _locked  // preserve locked slots for future recalculations
        };

        AssignmentData.saveSchedule(scheduleData);

        return this.schedule;
    },

    _getAvailable(soldiers, currentTime, shiftDuration, minRestHours, positionName, reqCmd, reqRole) {
    const available = [];
    // reqCmd ו-reqRole מועברים כפרמטרים לפי שלב השיבוץ
    if (reqCmd === undefined) reqCmd = 'none';
    if (reqRole === undefined) reqRole = '';

    for (const soldier of soldiers) {
        // BRIDGE CHECK - attendance availability
        const bridgeResult = Bridge.isSoldierAvailableForShift(
            soldier.name, currentTime, shiftDuration
        );
        if (!bridgeResult.available) continue;

        // Blocked days
        const dayName = AssignmentData.getDayName(currentTime);
        if (soldier.blocked_days && soldier.blocked_days.includes(dayName)) continue;

        // Blocked dates
        const dateStr = AssignmentData.formatDate(currentTime);
        if (soldier.blocked_dates) {
            let blocked = false;
            for (const bd of soldier.blocked_dates) {
                if (bd.date === dateStr) {
                    const startH = parseInt(bd.start_hour || 0);
                    const endH = parseInt(bd.end_hour || 24);
                    const curH = currentTime.getHours();
                    if (curH >= startH && curH < endH) { blocked = true; break; }
                }
            }
            if (blocked) continue;
        }

        // In shift
        if (this._isInShift(soldier.name, currentTime)) continue;

        // Overlap
        const shiftEndTime = new Date(currentTime);
        shiftEndTime.setHours(shiftEndTime.getHours() + shiftDuration);
        if (this._hasOverlap(soldier.name, currentTime, shiftEndTime)) continue;

        // *** CHANGED: Do NOT skip soldiers with insufficient rest ***
        // Instead, calculate rest and use it for scoring (penalty)
        const lastShiftEnd = this._getLastShiftEnd(soldier.name, currentTime);
        let restHoursSinceLastShift = Infinity;
        if (lastShiftEnd) {
            restHoursSinceLastShift = (currentTime.getTime() - lastShiftEnd.getTime()) / (1000 * 60 * 60);
        }

        const score = this._calcScore(soldier, positionName, restHoursSinceLastShift, minRestHours, reqCmd, reqRole);
        available.push({ ...soldier, score, restHours: restHoursSinceLastShift });
    }

    available.sort((a, b) => b.score - a.score);
    return available;
},

_calcScore(soldier, positionName, restHours, minRestHours, reqCmd, reqRole) {
    const totalHours = this.soldierTotalHours[soldier.name] || 0;
    const workloadScore = (1000 - totalHours) * 1000;
    const restScore = Math.min(restHours, 48) * 100;

    // Heavy penalty for soldiers below minimum rest (but still assignable!)
    let restPenalty = 0;
    if (restHours < minRestHours) {
        restPenalty = -50000; // Strong penalty but not exclusion
    }
    // Even heavier penalty for critical rest (less than one shift duration)
    if (restHours < (minRestHours / 2)) {
        restPenalty = -100000;
    }

    const timesInPosition = (this.positionHistory[soldier.name] || {})[positionName] || 0;
    const diversityScore = (50 - Math.min(timesInPosition * 10, 50));
    const prefBonus = (soldier.preferred_positions && soldier.preferred_positions.includes(positionName)) ? 5 : 0;
    // שינוי 9: בונוס לדרג פיקוד כשנדרש
    let cmdBonus = 0;
    if (reqCmd === 'commander') {
        if (soldier.is_commander === 'commander') cmdBonus = 200000;
    } else if (reqCmd === 'vice_commander') {
        if (soldier.is_commander === 'commander') cmdBonus = 200000;
        else if (soldier.is_commander === 'vice_commander') cmdBonus = 150000;
    }
    // שינוי 10: בונוס לתפקיד נדרש
    let roleBonus = 0;
    if (reqRole && soldier.roles && soldier.roles.includes(reqRole)) {
        roleBonus = 180000;
    }
    return workloadScore + restScore + restPenalty + diversityScore + prefBonus + cmdBonus + roleBonus;
},

    /**
     * שינוי 9: בדוק אם עמדה מקיימת את דרישת דרג הפיקוד
     * בודק שמספר המפקדים המשובצים >= required_commanders_count
     */
    _checkCommanderRequirement(assignedNames, position, dateStr, hourStr) {
        const asgnSoldiers = AssignmentData.getActiveSoldiers();
        const req = position.requires_commander;
        const reqCount = parseInt(position.required_commanders_count) || 1;

        if (!req || req === 'none') return null;

        let qualifiedCount = 0;
        for (const name of assignedNames) {
            const soldier = asgnSoldiers.find(s => s.name === name);
            if (!soldier) continue;

            if (req === 'commander') {
                if (soldier.is_commander === 'commander') qualifiedCount++;
            } else if (req === 'vice_commander') {
                if (soldier.is_commander === 'commander' || soldier.is_commander === 'vice_commander') qualifiedCount++;
            }
        }

        if (qualifiedCount < reqCount) {
            const reqLabel = req === 'commander' ? 'מפקד' : 'מ"כ או מפקד';
            const countLabel = reqCount > 1 ? ` (${qualifiedCount}/${reqCount})` : '';
            return {
                type: 'commander',
                message: `🎖️ ${dateStr} ${hourStr} - "${position.name}" דורשת ${reqLabel}${countLabel} אך ${qualifiedCount === 0 ? 'אין משובץ בעל דרג מתאים' : `רק ${qualifiedCount} משובצים`}`
            };
        }

        return null;
    },

    /**
     * שינוי 10: בדוק אם עמדה מקיימת את דרישת התפקיד
     * בודק שמספר בעלי התפקיד המשובצים >= required_role_count
     */
    _checkRoleRequirement(assignedNames, position, dateStr, hourStr) {
        const asgnSoldiers = AssignmentData.getActiveSoldiers();
        const reqRole = position.required_role;
        const reqCount = parseInt(position.required_role_count) || 1;

        if (!reqRole) return null;

        let qualifiedCount = 0;
        for (const name of assignedNames) {
            const soldier = asgnSoldiers.find(s => s.name === name);
            if (!soldier) continue;
            if (soldier.roles && soldier.roles.includes(reqRole)) qualifiedCount++;
        }

        if (qualifiedCount < reqCount) {
            const countLabel = reqCount > 1 ? ` (${qualifiedCount}/${reqCount})` : '';
            return {
                type: 'role',
                message: `📌 ${dateStr} ${hourStr} - "${position.name}" דורשת ${reqRole}${countLabel} אך ${qualifiedCount === 0 ? 'אין משובץ בעל תפקיד מתאים' : `רק ${qualifiedCount} משובצים`}`
            };
        }

        return null;
    },

    _isInShift(soldierName, time) {
        const shifts = this.soldierShifts[soldierName] || [];
        for (const shift of shifts) {
            if (time >= shift.start && time < shift.end) return true;
        }
        return false;
    },

    _hasOverlap(soldierName, proposedStart, proposedEnd) {
        const shifts = this.soldierShifts[soldierName] || [];
        for (const shift of shifts) {
            if (proposedStart < shift.end && shift.start < proposedEnd) return true;
        }
        return false;
    },

    _getLastShiftEnd(soldierName, currentTime) {
        const shifts = this.soldierShifts[soldierName] || [];
        let latest = null;
        for (const shift of shifts) {
            if (shift.end <= currentTime) {
                if (!latest || shift.end > latest) latest = shift.end;
            }
        }
        return latest;
    },

_checkRest(minRest) {
    for (const s of AssignmentData.getActiveSoldiers()) {
        const shifts = this.soldierShifts[s.name] || [];
        if (shifts.length < 2) continue;
        const sorted = [...shifts].sort((a, b) => a.start - b.start);
        for (let i = 1; i < sorted.length; i++) {
            const restMs = sorted[i].start.getTime() - sorted[i - 1].end.getTime();
            const restHours = restMs / (1000 * 60 * 60);
            const shiftDur = (sorted[i].end - sorted[i].start) / (1000 * 60 * 60);

            if (restHours < shiftDur) {
                // CRITICAL: less than one shift duration of rest
                const dateStr = AssignmentData.formatDate(sorted[i].start);
                const hourStr = AssignmentData.formatHour(sorted[i].start.getHours());
                this.warnings.push({
                    type: 'critical',
                    message: `🔴 ${s.name} - רק ${Math.round(restHours * 10) / 10}h מנוחה לפני ${dateStr} ${hourStr} (פחות ממשמרת אחת!)`,
                    soldier: s.name,
                    date: dateStr,
                    hour: hourStr
                });
            } else if (restHours < minRest) {
                // WARNING: below minimum but not critical
                const dateStr = AssignmentData.formatDate(sorted[i].start);
                const hourStr = AssignmentData.formatHour(sorted[i].start.getHours());
                this.warnings.push({
                    type: 'rest',
                    message: `😴 ${s.name} - ${Math.round(restHours * 10) / 10}h מנוחה לפני ${dateStr} ${hourStr} (מינימום: ${minRest})`,
                    soldier: s.name,
                    date: dateStr,
                    hour: hourStr
                });
            }
        }
    }
},

    _calcPattern(soldiers) {
        const checkSoldiers = soldiers || AssignmentData.getActiveSoldiers();
        const rests = [], durs = [];
        for (const s of checkSoldiers) {
            const shifts = (this.soldierShifts[s.name] || []).sort((a, b) => a.start - b.start);
            for (let i = 0; i < shifts.length; i++) {
                const shiftDur = (shifts[i].end - shifts[i].start) / (1000 * 60 * 60);
                durs.push(Math.round(shiftDur));
                if (i > 0) {
                    const rest = (shifts[i].start - shifts[i - 1].end) / (1000 * 60 * 60);
                    if (rest > 0 && rest <= 48) rests.push(Math.round(rest));
                }
            }
        }
        const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
        this.pattern = {
            avgShift: avg(durs), avgRest: avg(rests),
            minRest: rests.length ? Math.min(...rests) : 0,
            maxRest: rests.length ? Math.max(...rests) : 0
        };
    },

    /**
     * Get workload balance
     * @param {string|null} platoonId - אם מוגדר, רק עבור מחלקה ספציפית
     */
    getWorkloadBalance(platoonId) {
        let soldiers = AssignmentData.getActiveSoldiers();
        if (platoonId) {
            soldiers = soldiers.filter(s => s.platoon_id === platoonId);
        }
        if (!AssignmentData.loadSchedule()) return [];
        const maxH = Math.max(...Object.values(this.soldierTotalHours || {}), 1);

        return soldiers.map(s => {
            const shifts = this.soldierShifts[s.name] || [];
            const hrs = this.soldierTotalHours[s.name] || 0;
            let totalRest = 0, minRestFound = Infinity;
            const sorted = [...shifts].sort((a, b) => a.start - b.start);
            for (let i = 1; i < sorted.length; i++) {
                const r = (sorted[i].start - sorted[i - 1].end) / (1000 * 60 * 60);
                if (r > 0 && r <= 48) { totalRest += r; if (r < minRestFound) minRestFound = r; }
            }
            return {
                name: s.name,
                platoon_id: s.platoon_id,
                platoon_name: s.platoon_name || '',
                roles: s.roles || [],
                is_commander: s.is_commander || false,
                hours: hrs,
                restHours: Math.round(totalRest),
                avgRest: shifts.length > 1 ? Math.round(totalRest / (shifts.length - 1)) : 0,
                minRest: minRestFound === Infinity ? 0 : Math.round(minRestFound),
                shifts: shifts.length,
                percentage: Math.round((hrs / maxH) * 100)
            };
        }).sort((a, b) => b.hours - a.hours);
    },

    getSoldierTimeline(name) {
        const shifts = (this.soldierShifts[name] || []).sort((a, b) => a.start - b.start);
        const tl = [];
        for (let i = 0; i < shifts.length; i++) {
            if (i > 0) {
                const restMs = shifts[i].start - shifts[i - 1].end;
                const restHours = restMs / (1000 * 60 * 60);
                if (restHours > 0 && restHours <= 48) {
                    tl.push({ type: 'rest', start: shifts[i - 1].end, end: shifts[i].start, hours: Math.round(restHours), position: '' });
                }
            }
            const shiftHours = (shifts[i].end - shifts[i].start) / (1000 * 60 * 60);
            tl.push({ type: 'shift', start: shifts[i].start, end: shifts[i].end, hours: Math.round(shiftHours), position: shifts[i].position });
        }
        return tl;
    },

    // ==================== שינוי 4: הזזת חייל ידנית ====================
    /**
     * Calculate consequences of moving a soldier to a different shift
     * @returns {Object} { before: {restBefore, restAfter}, after: {restBefore, restAfter}, affectedSoldiers: [] }
     */
    calcMoveConsequences(soldierName, fromDate, fromHour, fromPos, toDate, toHour, toPos) {
        const sd = AssignmentData.loadSchedule();
        if (!sd?.data) return null;

        const shifts = (this.soldierShifts[soldierName] || []).sort((a, b) => a.start - b.start);
        const settings = AssignmentData.loadSettings();
        const minRest = settings.min_rest_hours || 8;

        // Find the shift being moved
        const movedShift = shifts.find(s =>
            AssignmentData.formatDate(s.start) === fromDate &&
            AssignmentData.formatHour(s.start.getHours()) === fromHour &&
            s.position === fromPos
        );
        if (!movedShift) return null;

        // Calculate current rest before/after this shift
        const shiftIdx = shifts.indexOf(movedShift);
        const currentRestBefore = shiftIdx > 0
            ? Math.round((movedShift.start - shifts[shiftIdx - 1].end) / 3600000 * 10) / 10
            : null;
        const currentRestAfter = shiftIdx < shifts.length - 1
            ? Math.round((shifts[shiftIdx + 1].start - movedShift.end) / 3600000 * 10) / 10
            : null;

        // Simulate the new position
        const targetPosData = sd.data[toDate]?.[toHour]?.[toPos];
        if (!targetPosData) return null;

        const newStart = new Date(AssignmentData.parseDate(toDate));
        newStart.setHours(parseInt(toHour));
        const duration = (movedShift.end - movedShift.start);
        const newEnd = new Date(newStart.getTime() + duration);

        // Calculate new rest times
        const newShifts = shifts.filter(s => s !== movedShift);
        newShifts.push({ start: newStart, end: newEnd, position: toPos });
        newShifts.sort((a, b) => a.start - b.start);
        const newIdx = newShifts.findIndex(s => s.start === newStart);

        const newRestBefore = newIdx > 0
            ? Math.round((newStart - newShifts[newIdx - 1].end) / 3600000 * 10) / 10
            : null;
        const newRestAfter = newIdx < newShifts.length - 1
            ? Math.round((newShifts[newIdx + 1].start - newEnd) / 3600000 * 10) / 10
            : null;

        // Check who's currently in the target position and will be affected
        const affectedSoldiers = [];
        if (targetPosData.soldiers) {
            targetPosData.soldiers.forEach(name => {
                if (name !== soldierName) {
                    affectedSoldiers.push({ name, action: 'displaced' });
                }
            });
        }

        return {
            soldierName,
            before: { restBefore: currentRestBefore, restAfter: currentRestAfter },
            after: { restBefore: newRestBefore, restAfter: newRestAfter },
            minRest,
            violations: {
                restBeforeViolation: newRestBefore !== null && newRestBefore < minRest,
                restAfterViolation: newRestAfter !== null && newRestAfter < minRest
            },
            affectedSoldiers
        };
    },

    /**
     * Execute move: remove soldier from one shift, add to another
     */
    moveSoldier(soldierName, fromDate, fromHour, fromPos, toDate, toHour, toPos) {
        const sd = AssignmentData.loadSchedule();
        if (!sd?.data) return false;

        // Remove from source
        const srcSlot = sd.data[fromDate]?.[fromHour]?.[fromPos];
        if (srcSlot?.soldiers) {
            srcSlot.soldiers = srcSlot.soldiers.filter(n => n !== soldierName);
        }

        // Add to target
        if (!sd.data[toDate]) sd.data[toDate] = {};
        if (!sd.data[toDate][toHour]) sd.data[toDate][toHour] = {};
        if (!sd.data[toDate][toHour][toPos]) {
            sd.data[toDate][toHour][toPos] = { soldiers: [], start_time: toHour, end_time: toHour };
        }
        if (!sd.data[toDate][toHour][toPos].soldiers.includes(soldierName)) {
            sd.data[toDate][toHour][toPos].soldiers.push(soldierName);
        }

        // Cascade rebalance: if target is overstaffed, move excess soldier to fill source vacancy
        const targetSlot = sd.data[toDate][toHour][toPos];
        const targetPos = AssignmentData.getActivePositions().find(p => p.name === toPos);
        const sourcePos = AssignmentData.getActivePositions().find(p => p.name === fromPos);
        const targetNeeded = targetPos?.soldiers_required || 1;
        const sourceNeeded = sourcePos?.soldiers_required || 1;

        if (targetSlot.soldiers.length > targetNeeded && srcSlot && srcSlot.soldiers.length < sourceNeeded) {
            // Rebuild tracking to get fresh data for scoring
            this._rebuildTracking(sd.data);

            // Find best excess soldier from target to fill source
            const excessCandidates = targetSlot.soldiers.filter(n => n !== soldierName);
            if (excessCandidates.length > 0 && sourcePos) {
                const bestSwap = this._findBestReplacement(sd.data, soldierName, fromDate, fromHour, fromPos, sourcePos);
                // Only swap if the best candidate is one of the excess soldiers in target
                if (bestSwap && excessCandidates.includes(bestSwap)) {
                    targetSlot.soldiers = targetSlot.soldiers.filter(n => n !== bestSwap);
                    srcSlot.soldiers.push(bestSwap);
                    Toast.show(`🔄 ${bestSwap} הועבר חזרה ל-${fromPos} (איזון)`, 'info');
                } else if (excessCandidates.length > 0) {
                    // If best replacement isn't in excess, pick the least-loaded excess soldier
                    let minHours = Infinity;
                    let swapName = null;
                    excessCandidates.forEach(name => {
                        const hrs = this.soldierTotalHours[name] || 0;
                        if (hrs < minHours) { minHours = hrs; swapName = name; }
                    });
                    if (swapName) {
                        targetSlot.soldiers = targetSlot.soldiers.filter(n => n !== swapName);
                        srcSlot.soldiers.push(swapName);
                        Toast.show(`🔄 ${swapName} הועבר חזרה ל-${fromPos} (איזון)`, 'info');
                    }
                }
            }
        }

        AssignmentData.saveSchedule(sd);
        this._rebuildTracking(sd.data);
        return true;
    },

    // ==================== שינוי 5: מחיקת חייל ממשמרת ====================
    /**
     * Remove a soldier from a specific shift and optionally recalculate
     */
    removeSoldierFromShift(soldierName, dateStr, hourStr, positionName, recalculate) {
        const sd = AssignmentData.loadSchedule();
        if (!sd?.data) return false;

        const slot = sd.data[dateStr]?.[hourStr]?.[positionName];
        if (!slot?.soldiers) return false;

        slot.soldiers = slot.soldiers.filter(n => n !== soldierName);

        if (recalculate) {
            // Rebuild tracking BEFORE scoring so data is fresh
            this._rebuildTracking(sd.data);

            const pos = AssignmentData.getActivePositions().find(p => p.name === positionName);
            if (pos) {
                const needed = pos.soldiers_required || 1;
                const currentCount = slot.soldiers.length;
                if (currentCount < needed) {
                    const replacement = this._findBestReplacement(sd.data, soldierName, dateStr, hourStr, positionName, pos);
                    if (replacement) {
                        slot.soldiers.push(replacement);
                        Toast.show(`🔄 ${replacement} שובץ במקום ${soldierName}`, 'info');
                    } else {
                        Toast.show(`⚠️ לא נמצא מחליף ל-${soldierName}`, 'warning');
                    }
                }
            }
        }

        AssignmentData.saveSchedule(sd);
        this._rebuildTracking(sd.data);
        return true;
    },

    /**
     * Find the best replacement soldier for a slot
     * @returns {string|null} soldier name or null
     */
    _findBestReplacement(scheduleData, excludeName, dateStr, hourStr, posName, posObj) {
        const platoonId = posObj.assignment_level === 'platoon' ? posObj.platoon_id : null;
        const shiftDate = AssignmentData.parseDate(dateStr);
        shiftDate.setHours(parseInt(hourStr));
        const duration = posObj.shift_duration_hours || 4;

        // Get soldiers available on this date (not on leave)
        const available = Bridge.getAvailableSoldierNames(shiftDate, platoonId);
        const slotSoldiers = scheduleData[dateStr]?.[hourStr]?.[posName]?.soldiers || [];
        const candidates = available.filter(n => n !== excludeName && !slotSoldiers.includes(n));

        // Filter out soldiers who don't have enough rest
        const settings = AssignmentData.loadSettings();
        const minRest = settings.min_rest_hours || 8;
        const shiftStart = shiftDate.getTime();
        const shiftEnd = shiftStart + duration * 3600000;

        const validCandidates = candidates.filter(name => {
            const shifts = this.soldierShifts[name] || [];
            for (const s of shifts) {
                // Shift overlap check
                if (s.start.getTime() < shiftEnd && s.end.getTime() > shiftStart) return false;
                // Rest before check
                if (s.end.getTime() <= shiftStart && (shiftStart - s.end.getTime()) < minRest * 3600000) return false;
                // Rest after check
                if (s.start.getTime() >= shiftEnd && (s.start.getTime() - shiftEnd) < minRest * 3600000) return false;
            }
            return true;
        });

        if (validCandidates.length === 0) return null;

        // Score candidates: lower workload = better
        const maxH = Math.max(...Object.values(this.soldierTotalHours || {}), 1);
        let bestName = null;
        let bestScore = -Infinity;

        validCandidates.forEach(name => {
            const hrs = this.soldierTotalHours[name] || 0;
            const workloadScore = 100 - (hrs / maxH * 100);
            const posHistory = (this.positionHistory[name]?.[posName] || 0);
            const diversityScore = posHistory > 2 ? -20 : 20 - posHistory * 5;
            const score = workloadScore + diversityScore;
            if (score > bestScore) { bestScore = score; bestName = name; }
        });

        return bestName;
    },

    /**
     * Rebuild soldierShifts and soldierTotalHours from schedule data
     */
    _rebuildTracking(scheduleData) {
        this.soldierShifts = {};
        this.soldierTotalHours = {};
        this.positionHistory = {};

        AssignmentData.getActiveSoldiers().forEach(s => {
            this.soldierShifts[s.name] = [];
            this.soldierTotalHours[s.name] = 0;
            this.positionHistory[s.name] = {};
        });

        Object.entries(scheduleData).forEach(([dateStr, hours]) => {
            Object.entries(hours).forEach(([hourStr, positions]) => {
                Object.entries(positions).forEach(([posName, slotData]) => {
                    if (!slotData?.soldiers) return;
                    const start = AssignmentData.parseDate(dateStr);
                    start.setHours(parseInt(hourStr));
                    const duration = slotData.duration_hours || 4;
                    const end = new Date(start.getTime() + duration * 3600000);

                    slotData.soldiers.forEach(name => {
                        if (!this.soldierShifts[name]) {
                            this.soldierShifts[name] = [];
                            this.soldierTotalHours[name] = 0;
                            this.positionHistory[name] = {};
                        }
                        this.soldierShifts[name].push({ start, end, position: posName });
                        this.soldierTotalHours[name] += duration;
                        this.positionHistory[name][posName] = (this.positionHistory[name][posName] || 0) + 1;
                    });
                });
            });
        });

        this.warnings = [];
        const settings = AssignmentData.loadSettings();
        this._checkRest(settings.min_rest_hours || 8);
        this._calcPattern();
    }
};

// ========== company.js ========== //
/**
 * AsgnCompany - מודול פלוגתי שיבוץ
 * SunDay v3.0
 *
 * שינוי 2: סנכרון דו-כיווני בין שיבוץ מחלקתי לפלוגתי
 * שינוי 4: הצגת תפקידים בתצוגה פלוגתית
 */
const AsgnCompany = {
    PLATOON_COLORS: [
        { bg: '#5b2d8e', text: '#fff', light: '#e8daef' },
        { bg: '#1e8449', text: '#fff', light: '#d5f5e3' },
        { bg: '#d35400', text: '#fff', light: '#fdebd0' },
        { bg: '#2c3e50', text: '#fff', light: '#d5d8dc' },
        { bg: '#7d3c98', text: '#fff', light: '#ebdef0' },
        { bg: '#c0392b', text: '#fff', light: '#fadbd8' }
    ],

    platoons: [],
    mergedSchedule: null,
    soldierPlatoonMap: {},

    init() {
        const saved = AssignmentData.loadCompanyData();
        if (saved?.platoons) {
            this.platoons = saved.platoons;
            this.mergedSchedule = saved.mergedSchedule;
            this.rebuildMap();
            this.refreshDisplay();
        }
    },

    rebuildMap() {
        this.soldierPlatoonMap = {};
        this.platoons.forEach(p => (p.soldiers || []).forEach(s => this.soldierPlatoonMap[s] = p.name));
    },

    save() {
        AssignmentData.saveCompanyData({ platoons: this.platoons, mergedSchedule: this.mergedSchedule });
    },

    // ==================== IMPORT ====================
    openImportDialog() {
        let html = `<h2>📥 ייבוא מחלקה</h2>
            <div class="import-method-selector">
                <div class="import-method-btn" onclick="AsgnCompany.selectMethod('current',this)"><span class="method-icon">📋</span><span class="method-label">מערכת נוכחית</span></div>
                <div class="import-method-btn" onclick="AsgnCompany.selectMethod('json',this)"><span class="method-icon">📁</span><span class="method-label">קובץ JSON</span></div>
                <div class="import-method-btn" onclick="AsgnCompany.selectMethod('excel',this)"><span class="method-icon">📊</span><span class="method-label">קובץ אקסל</span></div>
                <div class="import-method-btn" onclick="AsgnCompany.selectMethod('platoon',this)"><span class="method-icon">🏗️</span><span class="method-label">ממחלקה קיימת</span></div>
            </div>
            <div id="asgnImportMethodContent"></div>
            <div class="form-actions"><button class="btn btn-purple-light" onclick="App.closeDialog()">❌ סגור</button></div>`;
        App.openDialog(html);
    },

    selectMethod(m, btn) {
        document.querySelectorAll('.import-method-btn').forEach(b => b.classList.remove('selected'));
        if (btn) btn.classList.add('selected');

        const c = document.getElementById('asgnImportMethodContent');
        const nameField = `<div class="form-group"><label>שם מחלקה:</label><input type="text" id="asgnPName" placeholder="מחלקה א'"></div>
            <div class="form-group"><label>מפקד:</label><input type="text" id="asgnPCmd" placeholder="שם מפקד"></div>`;

        if (m === 'current') {
            const schedule = AssignmentData.loadSchedule();
            const soldiers = AssignmentData.getActiveSoldiers();
            if (!schedule?.data) { c.innerHTML = '<div class="alert-item alert-warning"><span>⚠️ אין שיבוץ. צור קודם.</span></div>'; return; }
            c.innerHTML = `${nameField}<div class="alert-item alert-info"><span>ℹ️ ${soldiers.length} חיילים</span></div>
                <button class="btn btn-purple" onclick="AsgnCompany.importCurrent()">📥 ייבא</button>`;
        } else if (m === 'json') {
            c.innerHTML = `${nameField}<div class="drop-zone" onclick="document.getElementById('asgnJFile').click()"><span class="drop-icon">📁</span><span class="drop-text">לחץ לבחירת JSON</span></div>
                <input type="file" id="asgnJFile" accept=".json" style="display:none" onchange="AsgnCompany.handleJSON(event)">`;
        } else if (m === 'excel') {
            if (!XLSXLoader.check(false)) { c.innerHTML = `${nameField}<div class="alert-item alert-danger"><span>❌ ספריית אקסל לא נטענה</span></div>`; return; }
            c.innerHTML = `${nameField}<div class="drop-zone" onclick="document.getElementById('asgnEFile').click()"><span class="drop-icon">📊</span><span class="drop-text">לחץ לבחירת אקסל</span></div>
                <input type="file" id="asgnEFile" accept=".xlsx,.xls" style="display:none" onchange="AsgnCompany.handleExcel(event)">`;
        } else if (m === 'platoon') {
            // שינוי 2: ייבוא ממחלקה קיימת במודול הנוכחות
            const platoons = AttendanceData.loadPlatoons();
            let platoonOptions = '';
            platoons.forEach(p => {
                const soldiers = AttendanceData.getSoldiersByPlatoon(p.id);
                platoonOptions += `<option value="${p.id}">${p.name} (${soldiers.length} חיילים)</option>`;
            });
            c.innerHTML = `<div class="form-group"><label>בחר מחלקה:</label><select id="asgnImportPlatoonId">${platoonOptions}</select></div>
                ${nameField}
                <div class="alert-item alert-info"><span>ℹ️ ייבא שיבוץ מחלקתי מהמערכת. יש ליצור שיבוץ מחלקתי קודם.</span></div>
                <button class="btn btn-purple" onclick="AsgnCompany.importFromPlatoon()">📥 ייבא ממחלקה</button>`;
        }
    },

    _getInputs() {
        const name = document.getElementById('asgnPName')?.value.trim();
        const cmd = document.getElementById('asgnPCmd')?.value.trim();
        if (!name) { Toast.show('חובה שם מחלקה!', 'error'); return null; }
        if (this.platoons.find(p => p.name === name)) { Toast.show('שם כפול!', 'error'); return null; }
        return { name, cmd };
    },

    importCurrent() {
        const inp = this._getInputs(); if (!inp) return;
        const soldiers = AssignmentData.getActiveSoldiers().map(s => s.name);
        this.platoons.push({
            name: inp.name, commander: inp.cmd, soldiers,
            schedule: AssignmentData.loadSchedule(),
            positions: AssignmentData.getActivePositions(),
            soldierTotalHours: { ...Scheduler.soldierTotalHours },
            colorIndex: this.platoons.length % this.PLATOON_COLORS.length
        });
        this.rebuildMap(); this.save(); this.refreshDisplay();
        document.getElementById('dialogOverlay').style.display = 'none';
        Toast.show(`✅ "${inp.name}" יובאה (${soldiers.length} חיילים)`, 'success');
    },

    /**
     * שינוי 2: ייבוא ממחלקה קיימת
     */
    importFromPlatoon() {
        const inp = this._getInputs(); if (!inp) return;
        const platoonId = document.getElementById('asgnImportPlatoonId')?.value;
        if (!platoonId) { Toast.show('בחר מחלקה!', 'error'); return; }

        const platoon = AttendanceData.loadPlatoons().find(p => p.id === platoonId);
        const soldiers = AssignmentData.getActiveSoldiersByPlatoon(platoonId).map(s => s.name);
        const schedule = AssignmentData.loadSchedule();

        if (!schedule?.data) {
            Toast.show('אין שיבוץ. צור שיבוץ קודם.', 'error');
            return;
        }

        // Filter schedule to only include soldiers from this platoon
        const filteredSchedule = this._filterScheduleForSoldiers(schedule, soldiers);

        // Calculate hours for these soldiers only
        const soldierTotalHours = {};
        soldiers.forEach(name => {
            soldierTotalHours[name] = Scheduler.soldierTotalHours[name] || 0;
        });

        this.platoons.push({
            name: inp.name,
            commander: inp.cmd || (platoon ? platoon.commander : ''),
            soldiers,
            platoonId: platoonId,
            schedule: filteredSchedule,
            positions: AssignmentData.getActivePositionsForPlatoon(platoonId),
            soldierTotalHours,
            colorIndex: this.platoons.length % this.PLATOON_COLORS.length
        });
        this.rebuildMap(); this.save(); this.refreshDisplay();
        document.getElementById('dialogOverlay').style.display = 'none';
        Toast.show(`✅ "${inp.name}" יובאה (${soldiers.length} חיילים)`, 'success');
    },

    /**
     * שינוי 2: סנן שיבוץ רק לחיילים ספציפיים
     */
    _filterScheduleForSoldiers(schedule, soldierNames) {
        if (!schedule?.data) return schedule;
        const nameSet = new Set(soldierNames);
        const filtered = { ...schedule, data: {} };

        for (const dateStr of Object.keys(schedule.data)) {
            filtered.data[dateStr] = {};
            for (const hourStr of Object.keys(schedule.data[dateStr])) {
                filtered.data[dateStr][hourStr] = {};
                for (const posName of Object.keys(schedule.data[dateStr][hourStr])) {
                    const pd = schedule.data[dateStr][hourStr][posName];
                    if (!pd) continue;
                    const filteredSoldiers = (pd.soldiers || []).filter(s => nameSet.has(s));
                    if (filteredSoldiers.length > 0) {
                        filtered.data[dateStr][hourStr][posName] = {
                            ...pd,
                            soldiers: filteredSoldiers
                        };
                    }
                }
            }
        }
        return filtered;
    },

    handleJSON(e) {
        const file = e.target.files[0]; if (!file) return;
        const inp = this._getInputs(); if (!inp) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                const soldiers = (data.soldiers || []).filter(s => s.is_active !== false).map(s => s.name);
                if (!data.schedule?.data) { Toast.show('אין שיבוץ בקובץ', 'error'); return; }
                this.platoons.push({
                    name: inp.name, commander: inp.cmd, soldiers,
                    schedule: data.schedule, positions: data.positions || [],
                    soldierTotalHours: data.schedule.soldierTotalHours || {},
                    colorIndex: this.platoons.length % this.PLATOON_COLORS.length
                });
                this.rebuildMap(); this.save(); this.refreshDisplay();
                document.getElementById('dialogOverlay').style.display = 'none';
                Toast.show(`✅ "${inp.name}" יובאה (${soldiers.length})`, 'success');
            } catch (err) { Toast.show('שגיאה: ' + err.message, 'error'); }
        };
        reader.readAsText(file);
    },

    async handleExcel(e) {
        const file = e.target.files[0]; if (!file) return;
        const inp = this._getInputs(); if (!inp) return;
        try {
            const result = await AssignmentData.importScheduleFromExcel(file);
            this.platoons.push({
                name: inp.name, commander: inp.cmd, soldiers: result.soldiers,
                schedule: result.schedule, positions: result.positions,
                soldierTotalHours: result.soldierTotalHours,
                colorIndex: this.platoons.length % this.PLATOON_COLORS.length
            });
            this.rebuildMap(); this.save(); this.refreshDisplay();
            document.getElementById('dialogOverlay').style.display = 'none';
            Toast.show(`✅ "${inp.name}" יובאה מאקסל (${result.soldiers.length})`, 'success');
        } catch (err) { Toast.show('שגיאה: ' + err.message, 'error'); }
    },

    removePlatoon(i) {
        if (confirm(`למחוק "${this.platoons[i].name}"?`)) {
            this.platoons.splice(i, 1);
            this.platoons.forEach((p, j) => p.colorIndex = j % this.PLATOON_COLORS.length);
            this.rebuildMap(); this.mergedSchedule = null; this.save(); this.refreshDisplay();
        }
    },

    // ==================== MERGE ====================
    mergeSchedules() {
        if (!this.platoons.length) { Toast.show('אין מחלקות', 'warning'); return; }
        this.mergedSchedule = {};
        this.rebuildMap();
        const allPos = new Set();

        this.platoons.forEach(p => {
            if (!p.schedule?.data) return;
            for (const d of Object.keys(p.schedule.data)) {
                if (!this.mergedSchedule[d]) this.mergedSchedule[d] = {};
                for (const h of Object.keys(p.schedule.data[d])) {
                    if (!this.mergedSchedule[d][h]) this.mergedSchedule[d][h] = {};
                    for (const pos of Object.keys(p.schedule.data[d][h])) {
                        allPos.add(pos);
                        const pd = p.schedule.data[d][h][pos];
                        if (!pd) continue;
                        if (!this.mergedSchedule[d][h][pos]) {
                            this.mergedSchedule[d][h][pos] = { soldiers: [], start_time: pd.start_time, end_time: pd.end_time, duration: pd.duration };
                        }
                        (pd.soldiers || []).forEach(n => {
                            if (!this.mergedSchedule[d][h][pos].soldiers.includes(n)) {
                                this.mergedSchedule[d][h][pos].soldiers.push(n);
                            }
                        });
                    }
                }
            }
        });

        this.save(); this.refreshDisplay();
        Toast.show('✅ שיבוצים אוחדו!', 'success');
    },

    /**
     * שינוי 2: סנכרון מפלוגתי למחלקתי
     * כאשר מבצעים שינוי בתצוגה פלוגתית, מעדכנים את המחלקות
     */
    syncToplatoons() {
        if (!this.mergedSchedule) return;

        this.platoons.forEach(p => {
            if (!p.schedule) p.schedule = { data: {} };
            const soldierSet = new Set(p.soldiers);

            // Rebuild platoon schedule from merged
            const newData = {};
            for (const dateStr of Object.keys(this.mergedSchedule)) {
                newData[dateStr] = {};
                for (const hourStr of Object.keys(this.mergedSchedule[dateStr])) {
                    newData[hourStr] = {};
                    for (const posName of Object.keys(this.mergedSchedule[dateStr][hourStr])) {
                        const pd = this.mergedSchedule[dateStr][hourStr][posName];
                        if (!pd) continue;
                        const platoonSoldiers = (pd.soldiers || []).filter(s => soldierSet.has(s));
                        if (platoonSoldiers.length > 0) {
                            if (!newData[dateStr]) newData[dateStr] = {};
                            if (!newData[dateStr][hourStr]) newData[dateStr][hourStr] = {};
                            newData[dateStr][hourStr][posName] = { ...pd, soldiers: platoonSoldiers };
                        }
                    }
                }
            }
            p.schedule.data = newData;

            // Recalculate hours
            p.soldierTotalHours = {};
            p.soldiers.forEach(name => { p.soldierTotalHours[name] = 0; });
            for (const dateStr of Object.keys(newData)) {
                for (const hourStr of Object.keys(newData[dateStr])) {
                    for (const posName of Object.keys(newData[dateStr][hourStr])) {
                        const pd = newData[dateStr][hourStr][posName];
                        const dur = pd.duration || 4;
                        (pd.soldiers || []).forEach(name => {
                            if (p.soldierTotalHours[name] !== undefined) {
                                p.soldierTotalHours[name] += dur;
                            }
                        });
                    }
                }
            }
        });

        this.save();
    },

    // ==================== DISPLAY ====================
    refreshDisplay() {
        this.displayPlatoons();
        const countEl = document.getElementById('asgnPlatoonCount');
        if (countEl) countEl.textContent = this.platoons.length;

        if (this.mergedSchedule) {
            const allPos = new Set();
            this.platoons.forEach(p => {
                if (p.schedule?.data) {
                    Object.values(p.schedule.data).forEach(d =>
                        Object.values(d).forEach(h => Object.keys(h).forEach(pos => allPos.add(pos)))
                    );
                }
            });
            this.displayMerged(allPos);
            this.displayAnalytics();
        }
    },

    displayPlatoons() {
        const c = document.getElementById('asgnPlatoonsList');
        if (!c) return;
        if (!this.platoons.length) {
            c.innerHTML = '<div style="text-align:center;padding:40px;color:#666;grid-column:1/-1;"><p style="font-size:48px;">📋</p><p>אין מחלקות. לחץ "ייבוא מחלקה".</p></div>';
            return;
        }

        c.innerHTML = this.platoons.map((p, i) => {
            const color = this.PLATOON_COLORS[p.colorIndex];
            const totalH = Object.values(p.soldierTotalHours || {}).reduce((a, b) => a + b, 0);
            return `<div class="platoon-card" style="border-top-color:${color.bg}">
                <div class="platoon-card-header"><h4><span style="background:${color.bg};color:${color.text};padding:3px 10px;border-radius:6px;font-size:13px;">${p.name}</span></h4>
                <button class="btn btn-sm btn-danger" onclick="AsgnCompany.removePlatoon(${i})">🗑️</button></div>
                <div class="platoon-card-body">
                    <div class="platoon-stat-row"><span class="platoon-stat-label">מפקד:</span><span class="platoon-stat-value">${p.commander || '-'}</span></div>
                    <div class="platoon-stat-row"><span class="platoon-stat-label">חיילים:</span><span class="platoon-stat-value">${p.soldiers.length}</span></div>
                    <div class="platoon-stat-row"><span class="platoon-stat-label">שעות:</span><span class="platoon-stat-value">${totalH}</span></div>
                    ${p.platoonId ? `<div class="platoon-stat-row"><span class="platoon-stat-label">מזהה מחלקה:</span><span class="platoon-stat-value sync-status synced">🔗 מסונכרן</span></div>` : ''}
                    <div class="platoon-soldiers-preview">${p.soldiers.slice(0, 6).map(s => `<span class="platoon-soldier-chip" style="background:${color.bg}">${s}</span>`).join('')}${p.soldiers.length > 6 ? `<span class="platoon-soldier-chip" style="background:#999">+${p.soldiers.length - 6}</span>` : ''}</div>
                </div></div>`;
        }).join('');
    },

    displayMerged(allPositions) {
        if (!this.mergedSchedule) return;
        const posArr = Array.from(allPositions);
        const allSoldiers = [];
        this.platoons.forEach(p => p.soldiers.forEach(s => { if (!allSoldiers.includes(s)) allSoldiers.push(s); }));

        const filterSel = document.getElementById('asgnCompanyFilterPlatoon');
        if (filterSel) {
            filterSel.innerHTML = '<option value="all">הכל</option>' +
                this.platoons.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
        }

        const highlightSel = document.getElementById('asgnCompanyHighlightSoldier');
        if (highlightSel) {
            highlightSel.innerHTML = '<option value="">--</option>' +
                allSoldiers.map(n => `<option value="${n}">${n} (${this.soldierPlatoonMap[n] || ''})</option>`).join('');
        }

        let html = '<table><thead><tr><th>תאריך</th><th>יום</th><th>שעות</th>';
        posArr.forEach(p => html += `<th>${p}</th>`);
        html += '<th>😴 מנוחה</th></tr></thead><tbody>';

        let rowIndex = 0;
        Object.keys(this.mergedSchedule)
            .sort((a, b) => AssignmentData.parseDate(a) - AssignmentData.parseDate(b))
            .forEach(dateStr => {
                Object.keys(this.mergedSchedule[dateStr]).sort().forEach(hourStr => {
                    const day = AssignmentData.getDayName(AssignmentData.parseDate(dateStr));
                    html += `<tr><td class="info-cell">${dateStr}</td><td class="info-cell">${day}</td>`;

                    let tr = hourStr;
                    const fp = posArr.find(p => this.mergedSchedule[dateStr][hourStr][p]);
                    if (fp) { const pd = this.mergedSchedule[dateStr][hourStr][fp]; if (pd) tr = `${pd.start_time}-${pd.end_time}`; }
                    html += `<td class="info-cell">${tr}</td>`;

                    const onDuty = new Set();
                    posArr.forEach(posName => {
                        const pd = this.mergedSchedule[dateStr][hourStr][posName];
                        const soldiers = pd?.soldiers || [];
                        soldiers.forEach(s => onDuty.add(s));
                        html += '<td>';
                        if (soldiers.length) {
                            soldiers.forEach(n => {
                                const pn = this.soldierPlatoonMap[n] || '';
                                const pl = this.platoons.find(p => p.name === pn);
                                const col = pl ? this.PLATOON_COLORS[pl.colorIndex] : { bg: '#999', light: '#eee' };

                                // שינוי 4: הצגת תפקידים
                                const asgnSoldier = AssignmentData.getActiveSoldiers().find(s => s.name === n);
                                const rolesTip = asgnSoldier && asgnSoldier.roles && asgnSoldier.roles.length > 0
                                    ? ` [${asgnSoldier.roles.join(', ')}]` : '';
                                const cmdIcon = asgnSoldier && asgnSoldier.is_commander ? '🎖️' : '';

                                html += `<span class="soldier-btn company-soldier-btn" data-soldier="${n}" data-platoon="${pn}" style="background:${col.light};border:2px solid ${col.bg};" title="${n} - ${pn}${rolesTip}" onclick="CompanyView.highlightSoldierByName('${n}')">${cmdIcon}${n}</span>`;
                            });
                        } else { html += '<span class="empty-cell">—</span>'; }
                        html += '</td>';
                    });

                    // Rest cell with accordion
                    html += '<td class="rest-cell">';
                    const restingSoldiers = allSoldiers.filter(s => !onDuty.has(s));
                    const restByPlatoon = {};
                    restingSoldiers.forEach(n => {
                        const pName = this.soldierPlatoonMap[n] || 'ללא';
                        if (!restByPlatoon[pName]) restByPlatoon[pName] = [];
                        restByPlatoon[pName].push(n);
                    });

                    this.platoons.forEach(p => {
                        if (!restByPlatoon[p.name] || restByPlatoon[p.name].length === 0) return;
                        const col = this.PLATOON_COLORS[p.colorIndex];
                        const soldiers = restByPlatoon[p.name];
                        const accId = `racc-${rowIndex}-${p.name.replace(/\s+/g, '_')}`;
                        html += `<div class="rest-platoon-group"><div class="rest-platoon-header" onclick="AsgnCompany.toggleRestAccordion('${accId}')" style="background:${col.bg};color:${col.text};padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:5px;user-select:none;"><span class="rest-accordion-arrow" id="arrow-${accId}">◀</span> ${p.name} (${soldiers.length})</div>`;
                        html += `<div class="rest-platoon-soldiers" id="${accId}" style="display:none;margin-top:3px;margin-right:8px;padding:4px;border-right:3px solid ${col.bg};background:${col.light};border-radius:4px;">`;
                        soldiers.forEach(n => { html += `<span class="resting-item" style="font-size:11px;margin:1px;" title="${n}">${n}</span> `; });
                        html += `</div></div>`;
                    });
                    html += '</td></tr>';
                    rowIndex++;
                });
            });

        html += '</tbody></table>';
        const grid = document.getElementById('asgnCompanyScheduleGrid');
        if (grid) grid.innerHTML = html;
        const section = document.getElementById('asgnCompanyScheduleSection');
        if (section) section.style.display = 'block';

        // Legend
        const legendEl = document.getElementById('asgnCompanyLegend');
        if (legendEl) {
            legendEl.style.display = 'block';
            legendEl.innerHTML = `<h4>🎨 מקרא</h4><div class="legend-items">${this.platoons.map(p => {
                const c = this.PLATOON_COLORS[p.colorIndex];
                return `<div class="legend-item"><div class="legend-color" style="background:${c.bg}"></div><span>${p.name} (${p.soldiers.length})</span></div>`;
            }).join('')}</div>`;
        }
    },

    toggleRestAccordion(id) {
        const el = document.getElementById(id);
        const arrow = document.getElementById('arrow-' + id);
        if (!el) return;
        if (el.style.display === 'none') {
            el.style.display = 'block';
            if (arrow) arrow.textContent = '▼';
        } else {
            el.style.display = 'none';
            if (arrow) arrow.textContent = '◀';
        }
    },

    displayAnalytics() {
        if (!this.platoons.length) return;
        const analyticsEl = document.getElementById('asgnCompanyAnalytics');
        if (!analyticsEl) return;
        analyticsEl.style.display = 'block';

        let totalS = 0, totalH = 0;
        this.platoons.forEach(p => {
            totalS += p.soldiers.length;
            totalH += Object.values(p.soldierTotalHours || {}).reduce((a, b) => a + b, 0);
        });

        analyticsEl.innerHTML = `
            <h3 style="font-size:18px;margin-bottom:15px;padding-bottom:8px;border-bottom:3px solid var(--purple-mid);">📊 אנליזה פלוגתית</h3>
            <div class="company-summary-cards">
                <div class="company-stat-card" style="border-top-color:var(--purple-mid);"><div class="stat-icon">🏛️</div><div class="stat-value" style="color:var(--purple-mid);">${this.platoons.length}</div><div class="stat-label">מחלקות</div></div>
                <div class="company-stat-card" style="border-top-color:#3498db;"><div class="stat-icon">👥</div><div class="stat-value" style="color:#3498db;">${totalS}</div><div class="stat-label">חיילים</div></div>
                <div class="company-stat-card" style="border-top-color:#e74c3c;"><div class="stat-icon">⏱️</div><div class="stat-value" style="color:#e74c3c;">${totalH}</div><div class="stat-label">שעות</div></div>
                <div class="company-stat-card" style="border-top-color:#27ae60;"><div class="stat-icon">📊</div><div class="stat-value" style="color:#27ae60;">${totalS ? Math.round(totalH / totalS) : 0}</div><div class="stat-label">ממוצע</div></div>
            </div>
            <div style="overflow-x:auto;margin-top:15px;">
                <table class="comparison-table"><thead><tr><th>מחלקה</th><th>מפקד</th><th>חיילים</th><th>שעות</th><th>ממוצע</th><th>מקס</th><th>מין</th></tr></thead><tbody>
                ${this.platoons.map(p => {
                    const h = Object.values(p.soldierTotalHours || {});
                    const t = h.reduce((a, b) => a + b, 0);
                    return `<tr><td><span style="background:${this.PLATOON_COLORS[p.colorIndex].bg};color:white;padding:3px 8px;border-radius:6px;font-size:12px;">${p.name}</span></td><td>${p.commander || '-'}</td><td>${p.soldiers.length}</td><td>${t}</td><td>${h.length ? Math.round(t / h.length) : 0}</td><td style="color:#e74c3c">${h.length ? Math.max(...h) : 0}</td><td style="color:#27ae60">${h.length ? Math.min(...h) : 0}</td></tr>`;
                }).join('')}
                </tbody></table>
            </div>`;
    },

    // ==================== FILTERS ====================
    filterDisplay() {
        const f = document.getElementById('asgnCompanyFilterPlatoon').value;
        document.querySelectorAll('.company-soldier-btn').forEach(btn => {
            btn.style.opacity = (f === 'all' || btn.dataset.platoon === f) ? '1' : '0.3';
        });
    },

    highlightSoldier() {
        const n = document.getElementById('asgnCompanyHighlightSoldier').value;
        this.highlightSoldierByName(n);
    },

    highlightSoldierByName(n) {
        this.clearHighlight(); if (!n) return;
        const sel = document.getElementById('asgnCompanyHighlightSoldier');
        if (sel) sel.value = n;
        let c = 0;
        document.querySelectorAll('#asgnCompanyScheduleGrid .company-soldier-btn').forEach(btn => {
            if (btn.dataset.soldier === n) { btn.classList.add('highlighted'); c++; }
            else { btn.classList.add('dimmed'); }
        });
        const info = document.getElementById('asgnCompanyHighlightInfo');
        if (info) info.textContent = `${n} (${this.soldierPlatoonMap[n] || ''}) - ${c} משמרות`;
    },

    clearHighlight() {
        document.querySelectorAll('#asgnCompanyScheduleGrid .company-soldier-btn.highlighted').forEach(b => b.classList.remove('highlighted'));
        document.querySelectorAll('#asgnCompanyScheduleGrid .company-soldier-btn.dimmed').forEach(b => b.classList.remove('dimmed'));
        const info = document.getElementById('asgnCompanyHighlightInfo');
        if (info) info.textContent = '';
        const sel = document.getElementById('asgnCompanyHighlightSoldier');
        if (sel) sel.value = '';
    },

    // ==================== EXPORT ====================
    exportCompanyExcel() {
        if (!XLSXLoader.check()) return;
        if (!this.mergedSchedule) { Toast.show('אחד שיבוצים קודם', 'warning'); return; }
        const wb = XLSX.utils.book_new();
        const allPos = new Set();
        Object.values(this.mergedSchedule).forEach(d => Object.values(d).forEach(h => Object.keys(h).forEach(p => allPos.add(p))));
        const posArr = Array.from(allPos);
        const allSoldiers = [];
        this.platoons.forEach(p => p.soldiers.forEach(s => { if (!allSoldiers.includes(s)) allSoldiers.push(s); }));

        const headers = ['תאריך', 'יום', 'שעות', ...posArr, 'במנוחה'];
        const rows = [headers];
        Object.keys(this.mergedSchedule).sort((a, b) => AssignmentData.parseDate(a) - AssignmentData.parseDate(b)).forEach(dateStr => {
            Object.keys(this.mergedSchedule[dateStr]).sort().forEach(hourStr => {
                const row = [dateStr, AssignmentData.getDayName(AssignmentData.parseDate(dateStr))];
                let tr = hourStr;
                const fp = posArr.find(p => this.mergedSchedule[dateStr][hourStr][p]);
                if (fp) { const pd = this.mergedSchedule[dateStr][hourStr][fp]; if (pd) tr = `${pd.start_time}-${pd.end_time}`; }
                row.push(tr);
                const onDuty = new Set();
                posArr.forEach(posName => {
                    const pd = this.mergedSchedule[dateStr][hourStr][posName];
                    const soldiers = pd?.soldiers || [];
                    soldiers.forEach(s => onDuty.add(s));
                    row.push(soldiers.map(n => `${n} [${this.soldierPlatoonMap[n] || ''}]`).join(', ') || '-');
                });
                row.push(allSoldiers.filter(s => !onDuty.has(s)).map(n => `${n} [${this.soldierPlatoonMap[n] || ''}]`).join(', '));
                rows.push(row);
            });
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = headers.map((_, i) => ({ wch: i <= 2 ? 14 : 30 }));
        XLSX.utils.book_append_sheet(wb, ws, 'פלוגתי');

        const comp = [['מחלקה', 'מפקד', 'חיילים', 'שעות', 'ממוצע']];
        this.platoons.forEach(p => {
            const h = Object.values(p.soldierTotalHours || {});
            comp.push([p.name, p.commander || '', p.soldiers.length, h.reduce((a, b) => a + b, 0), h.length ? Math.round(h.reduce((a, b) => a + b, 0) / h.length) : 0]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(comp), 'השוואה');
        XLSX.writeFile(wb, `sunday_פלוגתי_${new Date().toISOString().split('T')[0]}.xlsx`);
        Toast.show('ייצוא פלוגתי הצליח', 'success');
    }
};

// ========== ui-dashboard.js ========== //
/**
 * Dashboard - לוח בקרה ראשי של SunDay
 */
const Dashboard = {
    refresh() {
        const dateEl = document.getElementById('dashDate');
        if (!dateEl || !dateEl.value) return;
        const dateStr = dateEl.value;

        this._renderSummaryCards(dateStr);
        this._renderPresenceTable(dateStr);
        this._renderPlatoonCards(dateStr);
        this._renderScheduleAccordion(dateStr);
    },

    setToday() {
        document.getElementById('dashDate').value = new Date().toISOString().split('T')[0];
        this.refresh();
    },

    toggleSchedule() {
        const body = document.getElementById('dashScheduleContent');
        const arrow = document.getElementById('accordionArrow');
        if (body.style.display === 'none') {
            body.style.display = 'block';
            arrow.classList.add('open');
        } else {
            body.style.display = 'none';
            arrow.classList.remove('open');
        }
    },

    _renderSummaryCards(dateStr) {
        const summary = Bridge.getDaySummary(dateStr);
        const settings = AttendanceData.loadSettings();
        const thCls = Calc.thresholdClass(summary.pct);
        const colorMap = {'pct-normal':'card-green','pct-warning':'card-orange','pct-critical':'card-red'};
        const dayName = AttendanceData.getDayName(new Date(dateStr));

        const c = document.getElementById('dashSummary');
        c.innerHTML = `
            <div class="summary-card card-purple"><div class="label">📅 ${dayName} ${AttendanceData.formatDisplay(dateStr)}</div><div class="value" style="font-size:18px;">יום נבחר</div></div>
            <div class="summary-card ${colorMap[thCls]||'card-green'}"><div class="label">נוכחות כללית</div><div class="value">${summary.pct}%</div></div>
            <div class="summary-card card-blue"><div class="label">סה"כ חיילים</div><div class="value">${summary.total}</div></div>
            <div class="summary-card card-green"><div class="label">נוכחים</div><div class="value">${summary.present}</div></div>
            <div class="summary-card card-red"><div class="label">נעדרים</div><div class="value">${summary.absent}</div></div>`;
    },

    _renderPresenceTable(dateStr) {
        const platoons = AttendanceData.loadPlatoons();
        const c = document.getElementById('dashPresenceTable');

        let html = '<table class="data-table"><thead><tr><th>מחלקה</th><th>סה"כ</th><th>נוכחים</th><th>נעדרים</th><th>נוכחות</th><th>מפקדים</th></tr></thead><tbody>';

        let totalAll=0, presentAll=0;
        platoons.forEach(pl => {
            const r = Calc.platoonDay(pl.id, dateStr);
            const thCls = Calc.thresholdClass(r.pct);
            const cmd = Calc.commanderStatusDay(pl.id, dateStr);
            totalAll += r.total; presentAll += r.present;
            html += `<tr>
                <td style="font-weight:700;color:${pl.color};">${pl.name}</td>
                <td>${r.total}</td>
                <td style="color:#27ae60;font-weight:700;">${r.present}</td>
                <td style="color:#e74c3c;font-weight:700;">${r.absent}</td>
                <td class="${thCls}" style="font-weight:800;">${r.pct}%</td>
                <td><span class="role-indicator ${cmd.ok?'role-ok':'role-bad'}" style="font-size:10px;">${cmd.ok?'✅':'❌'} ${cmd.present}/${cmd.min}</span></td>
            </tr>`;
        });

        const totalPct = totalAll > 0 ? Math.round((presentAll/totalAll)*100) : 100;
        html += `<tr style="background:var(--purple-surface);font-weight:800;">
            <td>🏛️ פלוגה</td><td>${totalAll}</td><td>${presentAll}</td><td>${totalAll-presentAll}</td>
            <td class="${Calc.thresholdClass(totalPct)}">${totalPct}%</td><td>-</td></tr>`;
        html += '</tbody></table>';
        c.innerHTML = html;
    },

    _renderPlatoonCards(dateStr) {
        const platoons = AttendanceData.loadPlatoons();
        const c = document.getElementById('dashPlatoonCards');
        c.innerHTML = '';

        platoons.forEach(pl => {
            const r = Calc.platoonDay(pl.id, dateStr);
            const thCls = Calc.thresholdClass(r.pct);
            const color = thCls==='pct-critical'?'#e74c3c':thCls==='pct-warning'?'#f39c12':'#27ae60';
            const cmd = Calc.commanderStatusDay(pl.id, dateStr);

            const card = document.createElement('div');
            card.className = 'card';
            card.style.borderTop = '4px solid ' + pl.color;

            let rolesHTML = '';
            const cmdCls = cmd.ok ? 'role-ok' : 'role-bad';
            rolesHTML += `<div class="role-indicator ${cmdCls}" style="margin:2px;">🎖️ מפקדים: ${cmd.ok?'✅':'❌'} (${cmd.present}/${cmd.min})</div>`;

            // Absent list mini
            let absentHTML = '';
            if (r.absentList.length > 0) {
                absentHTML = '<div style="margin-top:8px;font-size:11px;"><strong>נעדרים:</strong><br>';
                r.absentList.slice(0,5).forEach(item => {
                    const rc = AttendanceData.LEAVE_REASONS.find(x => x.id === item.reason);
                    absentHTML += `<span style="margin:1px;display:inline-block;">${item.soldier.name} <span class="badge ${rc?rc.badge:'badge-active'}" style="font-size:9px;">${item.reason}</span></span> `;
                });
                if (r.absentList.length > 5) absentHTML += `<span style="color:#999;">+${r.absentList.length-5} נוספים</span>`;
                absentHTML += '</div>';
            }

            card.innerHTML = `
                <h3 class="card-title" style="border-bottom-color:${pl.color}">${pl.name}</h3>
                <div style="text-align:center;margin-bottom:10px;">
                    <div style="font-size:36px;font-weight:900;color:${color};">${r.pct}%</div>
                    <div style="font-size:12px;color:var(--text-light);">נוכחות</div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;text-align:center;font-size:13px;">
                    <div><div style="font-size:18px;font-weight:800;color:#27ae60;">${r.present}</div><div style="font-size:10px;color:#999;">נוכחים</div></div>
                    <div><div style="font-size:18px;font-weight:800;color:#e74c3c;">${r.absent}</div><div style="font-size:10px;color:#999;">נעדרים</div></div>
                    <div><div style="font-size:18px;font-weight:800;color:#3498db;">${r.total}</div><div style="font-size:10px;color:#999;">סה"כ</div></div>
                </div>
                <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">${rolesHTML}</div>
                ${absentHTML}`;
            c.appendChild(card);
        });
    },

    _renderScheduleAccordion(dateStr) {
        const scheduleDay = Bridge.getScheduleForDate(dateStr);
        const grid = document.getElementById('dashScheduleGrid');

        if (!scheduleDay) {
            grid.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-light);">📋 אין שיבוץ ליום זה</div>';
            return;
        }

        const positions = AssignmentData.getActivePositions();
        const allSoldiers = AssignmentData.getActiveSoldiers().map(s => s.name);

        let html = '<table><thead><tr><th>שעות</th>';
        positions.forEach(p => html += `<th>${p.name}</th>`);
        html += '<th>😴 במנוחה</th></tr></thead><tbody>';

        Object.keys(scheduleDay.hours).sort().forEach(hourStr => {
            let timeRange = hourStr;
            const fp = positions.find(p => scheduleDay.hours[hourStr][p.name]);
            if (fp) {
                const pd = scheduleDay.hours[hourStr][fp.name];
                if (pd) timeRange = `${pd.start_time}-${pd.end_time}`;
            }

            html += `<tr><td class="info-cell">${timeRange}</td>`;
            const onDuty = new Set();

            positions.forEach(pos => {
                const pd = scheduleDay.hours[hourStr][pos.name];
                const soldiers = pd?.soldiers || [];
                soldiers.forEach(s => onDuty.add(s));
                html += '<td>';
                if (soldiers.length) {
                    soldiers.forEach(n => {
                        // Check if absent from attendance
                        const dt = new Date(dateStr);
                        dt.setHours(parseInt(hourStr), 0, 0, 0);
                        const avail = Bridge.isSoldierAvailable(n, dt);
                        const style = avail.available ? '' : 'opacity:0.4;text-decoration:line-through;';
                        html += `<span class="soldier-btn" style="${style}" title="${n}">${n}</span>`;
                    });
                } else {
                    html += '<span class="empty-cell">—</span>';
                }
                html += '</td>';
            });

            html += '<td class="rest-cell">';
            const resting = allSoldiers.filter(s => !onDuty.has(s));
            if (resting.length > 10) {
                html += `<span style="font-size:11px;color:var(--text-light);">${resting.length} חיילים במנוחה</span>`;
            } else {
                resting.forEach(n => html += `<span class="resting-item">${n}</span> `);
            }
            html += '</td></tr>';
        });

        html += '</tbody></table>';
        grid.innerHTML = html;
    }
};

// ========== ui-attendance.js ========== //
/**
 * AttendanceUI - UI מודול נוכחות
 * SunDay v3.0
 *
 * שינוי 3: שימוש ב-getAttendanceRange()
 * שינוי 6: תצוגת היעדרויות שמית עם אקורדיון
 * שינוי 7: הדגשת עמודת יום במפת נוכחות
 */
const AttendanceUI = {

    // שינוי 7: מעקב אחר עמודה מודגשת
    _highlightedCol: {},  // { platoonId: colIndex }

    // ==================== BUILD TABS ====================
    buildPlatoonTabs() {
        const platoons = AttendanceData.loadPlatoons();
        const tabsC = document.getElementById('attendancePlatoonTabs');
        const panesC = document.getElementById('attendancePlatoonPanes');
        tabsC.innerHTML = '';
        panesC.innerHTML = '';

        platoons.forEach(pl => {
            const btn = document.createElement('button');
            btn.className = 'sub-tab';
            btn.dataset.subtab = 'att-pl-' + pl.id;
            btn.innerHTML = `<span class="platoon-dot" style="background:${pl.color}"></span>${pl.name}`;
            btn.onclick = () => {
                App.switchSubTab('attendance', 'att-pl-' + pl.id);
                this.refreshPlatoonTab(pl.id);
            };
            tabsC.appendChild(btn);

            const pane = document.createElement('div');
            pane.id = 'subtab-att-pl-' + pl.id;
            pane.className = 'sub-pane';
            pane.innerHTML = this._platoonPaneHTML(pl);
            panesC.appendChild(pane);
        });
    },

    _platoonPaneHTML(pl) {
        const cmdBadge = pl.commander ? `<span class="badge badge-commander">🎖️ ${pl.commander}</span>` : '';
        return `
        <div class="section-header">
            <h2 style="border-right:4px solid ${pl.color};padding-right:10px;">${pl.name} ${cmdBadge}</h2>
            <div class="date-range-controls">
                <label>מ: <input type="date" class="pl-start" data-pl="${pl.id}"></label>
                <label>עד: <input type="date" class="pl-end" data-pl="${pl.id}"></label>
                <button class="btn btn-sm btn-purple-light" onclick="AttendanceUI.resetPlDates('${pl.id}')">↩️ כל המשימה</button>
                <button class="btn btn-purple btn-sm" onclick="AttendanceUI.refreshPlatoonTab('${pl.id}')">🔄</button>
                <button class="btn btn-success btn-sm" onclick="AttExport.exportPlatoonReport('${pl.id}')">📊 דוח</button>
            </div>
        </div>
        <div id="plSummary-${pl.id}" class="summary-grid" style="margin-bottom:12px;"></div>
        <div id="plRolesAlert-${pl.id}" class="roles-alert-bar" style="margin-bottom:12px;"></div>
        <div id="plPresenceLists-${pl.id}" style="margin-bottom:12px;"></div>
        <div class="card" style="margin-bottom:12px;">
            <div class="section-header" style="margin-bottom:8px;">
                <h3 class="card-title" style="margin-bottom:0;">👥 חיילים - ${pl.name}</h3>
                <div class="btn-group">
                    <button class="btn btn-purple btn-sm" onclick="AttendanceUI.openAddSoldierDialog('${pl.id}')">➕ חייל</button>
                    <button class="btn btn-purple-light btn-sm" onclick="AttendanceUI.importSoldiersForPlatoon('${pl.id}')">📂 ייבוא</button>
                    <button class="btn btn-success btn-sm" onclick="AttExport.exportPlatoonSoldiersExcel('${pl.id}')">📊 ייצוא</button>
                    <button class="btn btn-danger btn-xs" onclick="AttendanceUI.resetPlatoonSoldiers('${pl.id}')">🗑️</button>
                </div>
            </div>
            <div id="plSoldiers-${pl.id}" class="table-container-inner"></div>
        </div>
        <div class="card" style="margin-bottom:12px;">
            <div class="section-header" style="margin-bottom:8px;">
                <h3 class="card-title" style="margin-bottom:0;">📋 היעדרויות - ${pl.name}</h3>
                <div class="btn-group">
                    <button class="btn btn-purple btn-sm" onclick="AttendanceUI.openAddLeaveDialog(null,null,'${pl.id}')">➕ היעדרות</button>
                    <button class="btn btn-warning btn-sm" onclick="AttendanceUI.openBulkLeaveDialog('${pl.id}')">📋 קבוצתי</button>
                    <button class="btn btn-danger btn-xs" onclick="AttendanceUI.resetPlatoonLeaves('${pl.id}')">🗑️</button>
                </div>
            </div>
            <div id="plLeaves-${pl.id}" class="table-container-inner"></div>
        </div>
        <div class="legend">
            <div class="legend-item"><div class="legend-box" style="background:#d4edda"></div>בבסיס</div>
            <div class="legend-item"><div class="legend-box" style="background:#fff3cd"></div>חופשה</div>
            <div class="legend-item"><div class="legend-box" style="background:#d1ecf1"></div>קורס</div>
            <div class="legend-item"><div class="legend-box" style="background:#fde2cc"></div>מחלה</div>
            <div class="legend-item"><div class="legend-box" style="background:#e8d5f5"></div>מיוחד</div>
            <div class="legend-item"><div class="legend-box" style="background:#f8d7da"></div>אחר</div>
            <div class="legend-item"><div class="legend-box" style="background:#fff3cd;border:2px solid var(--purple-dark)"></div>מפקד</div>
            <div class="legend-item"><div class="legend-box" style="background:#e8e8e8"></div>מחוץ למשימה</div>
        </div>
        <div class="card"><h3 class="card-title">🗓️ מפת נוכחות - ${pl.name}</h3>
            <div id="plHeatmap-${pl.id}" class="heatmap-wrapper"></div></div>`;
    },

    // ==================== DATES (שינוי 3) ====================
    setDefaultDates() {
        const mission = AttendanceData.getMissionRange();
        const attRange = AttendanceData.getAttendanceRange();

        const ds = document.getElementById('attDashStartDate');
        const de = document.getElementById('attDashEndDate');
        if (ds) { ds.value = attRange.start; ds.min = mission.start; ds.max = mission.end; }
        if (de) { de.value = attRange.end; de.min = mission.start; de.max = mission.end; }

        document.querySelectorAll('.pl-start').forEach(i => {
            i.value = attRange.start;
            i.min = mission.start;
            i.max = mission.end;
        });
        document.querySelectorAll('.pl-end').forEach(i => {
            i.value = attRange.end;
            i.min = mission.start;
            i.max = mission.end;
        });
    },

    resetDashDates() {
        const attRange = AttendanceData.getAttendanceRange();
        document.getElementById('attDashStartDate').value = attRange.start;
        document.getElementById('attDashEndDate').value = attRange.end;
        this.refreshDashboard();
    },

    resetPlDates(pid) {
        const attRange = AttendanceData.getAttendanceRange();
        const s = document.querySelector(`.pl-start[data-pl="${pid}"]`);
        const e = document.querySelector(`.pl-end[data-pl="${pid}"]`);
        if (s) s.value = attRange.start;
        if (e) e.value = attRange.end;
        this.refreshPlatoonTab(pid);
    },

    getDashRange() {
        return {
            start: document.getElementById('attDashStartDate')?.value,
            end: document.getElementById('attDashEndDate')?.value
        };
    },

    getPlRange(pid) {
        const s = document.querySelector(`.pl-start[data-pl="${pid}"]`);
        const e = document.querySelector(`.pl-end[data-pl="${pid}"]`);
        return { start: s?.value, end: e?.value };
    },

    // ==================== DASHBOARD ====================
    refreshDashboard() {
        const range = this.getDashRange();
        if (!range.start || !range.end) return;
        this._renderCompanySummary(range.start, range.end);
        this._renderCompanyRolesAlert();
        this._renderCompanyPresenceTable(range.start, range.end);
        this._renderPlatoonCards(range.start, range.end);
    },

    _renderCompanySummary(s, e) {
        const stats = Calc.rangeStats(s, e);
        const c = document.getElementById('attCompanySummary');
        if (!c) return;
        const thCls = Calc.thresholdClass(stats.avgPct);
        const colorMap = { 'pct-normal': 'card-green', 'pct-warning': 'card-orange', 'pct-critical': 'card-red' };
        const mission = AttendanceData.getMissionRange();
        const mDays = AttendanceData.countMissionDays(mission.start, mission.end);
        c.innerHTML = `
            <div class="summary-card ${colorMap[thCls] || 'card-green'}"><div class="label">ממוצע נוכחות</div><div class="value">${stats.avgPct}%</div></div>
            <div class="summary-card card-blue"><div class="label">סה"כ חיילים</div><div class="value">${stats.totalSoldiers}</div></div>
            <div class="summary-card card-red"><div class="label">נעדרים כרגע</div><div class="value">${stats.currentAbsent}</div></div>
            <div class="summary-card card-orange"><div class="label">ימים קריטיים</div><div class="value">${stats.criticalDays}</div></div>
            <div class="summary-card card-purple"><div class="label">🎖️ מפקדים נעדרים</div><div class="value">${stats.currentCmdAbsent}/${stats.currentCmdTotal}</div></div>
            <div class="summary-card" style="border-top-color:#9b59b6;"><div class="label">ימי משימה</div><div class="value" style="color:#9b59b6;">${mDays}</div></div>`;
    },

    _renderCompanyRolesAlert() {
        const today = AttendanceData.formatISO(new Date());
        const roleStatus = Calc.roleStatusDay(today);
        const platoons = AttendanceData.loadPlatoons();
        const c = document.getElementById('attCompanyRolesAlert');
        if (!c) return;
        let html = '';
        platoons.forEach(pl => {
            const cmd = Calc.commanderStatusDay(pl.id, today);
            html += `<div class="role-indicator ${cmd.ok ? 'role-ok' : 'role-bad'}">🎖️ מפקדים ${pl.name}: ${cmd.ok ? '✅' : '❌'} (${cmd.present}/${cmd.min})</div>`;
        });
        roleStatus.forEach(rs => {
            const label = rs.level === 'platoon' ? `${rs.name} (${rs.platoonName})` : `${rs.name} (פלוגה)`;
            html += `<div class="role-indicator ${rs.ok ? 'role-ok' : 'role-bad'}">${label}: ${rs.ok ? '✅' : '❌'} (${rs.present}/${rs.min})</div>`;
        });
        c.innerHTML = html;
    },

    _renderCompanyPresenceTable(s, e) {
        const platoons = AttendanceData.loadPlatoons();
        const dates = AttendanceData.getDateRange(s, e);
        const today = AttendanceData.formatISO(new Date());
        const c = document.getElementById('attCompanyPresenceTable');
        if (!c) return;

        let html = '<table class="data-table"><thead><tr><th>מחלקה</th>';
        dates.forEach(d => {
            const ds = AttendanceData.formatISO(d);
            const cls = ds === today ? ' style="background:var(--purple-mid);color:#fff;"' : '';
            html += `<th${cls}>${d.getDate()}/${d.getMonth() + 1}</th>`;
        });
        html += '<th>ממוצע</th></tr></thead><tbody>';

        platoons.forEach(pl => {
            html += `<tr><td style="font-weight:700;color:${pl.color};">${pl.name}</td>`;
            let sum = 0, cnt = 0;
            dates.forEach(d => {
                const ds = AttendanceData.formatISO(d);
                const r = Calc.platoonDay(pl.id, ds);
                const cls = Calc.thresholdClass(r.pct);
                html += `<td class="${cls} clickable-cell" onclick="AttendanceUI.openDaySummaryDialog('${ds}','${pl.id}')">${r.pct}%</td>`;
                if (ds <= today) { sum += r.pct; cnt++; }
            });
            const avg = cnt > 0 ? Math.round(sum / cnt) : 100;
            html += `<td style="font-weight:800;">${avg}%</td></tr>`;
        });

        html += '<tr style="background:var(--purple-surface);font-weight:800;"><td>פלוגה</td>';
        let cSum = 0, cCnt = 0;
        dates.forEach(d => {
            const ds = AttendanceData.formatISO(d);
            const r = Calc.companyDay(ds);
            const cls = Calc.thresholdClass(r.pct);
            html += `<td class="${cls} clickable-cell" onclick="AttendanceUI.openDaySummaryDialog('${ds}')">${r.pct}%</td>`;
            if (ds <= today) { cSum += r.pct; cCnt++; }
        });
        html += `<td>${cCnt > 0 ? Math.round(cSum / cCnt) : 100}%</td></tr></tbody></table>`;
        c.innerHTML = html;
    },

    _renderPlatoonCards(s, e) {
        const platoons = AttendanceData.loadPlatoons();
        const today = AttendanceData.formatISO(new Date());
        const c = document.getElementById('attPlatoonOverview');
        if (!c) return;
        c.innerHTML = '';

        platoons.forEach(pl => {
            const r = Calc.platoonDay(pl.id, today);
            const thCls = Calc.thresholdClass(r.pct);
            const color = thCls === 'pct-critical' ? '#e74c3c' : thCls === 'pct-warning' ? '#f39c12' : '#27ae60';
            const cmd = Calc.commanderStatusDay(pl.id, today);
            const roleStatus = Calc.roleStatusDay(today);

            const card = document.createElement('div');
            card.className = 'card';
            card.style.borderTop = '4px solid ' + pl.color;

            let rolesHTML = `<div class="role-indicator ${cmd.ok ? 'role-ok' : 'role-bad'}" style="margin:2px;">🎖️ מפקדים: ${cmd.ok ? '✅' : '❌'} (${cmd.present}/${cmd.min})</div>`;
            roleStatus.forEach(rs => {
                if (rs.level === 'platoon' && rs.platoonId === pl.id) {
                    rolesHTML += `<div class="role-indicator ${rs.ok ? 'role-ok' : 'role-bad'}" style="margin:2px;">${rs.name}: ${rs.ok ? '✅' : '❌'} (${rs.present}/${rs.min})</div>`;
                }
            });

            card.innerHTML = `
                <h3 class="card-title" style="border-bottom-color:${pl.color}">${pl.name}</h3>
                <div style="text-align:center;margin-bottom:10px;">
                    <div style="font-size:36px;font-weight:900;color:${color};">${r.pct}%</div>
                    <div style="font-size:12px;color:var(--text-light);">נוכחות היום</div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;text-align:center;font-size:13px;">
                    <div><div style="font-size:18px;font-weight:800;color:#27ae60;">${r.present}</div><div style="font-size:10px;color:#999;">נוכחים</div></div>
                    <div><div style="font-size:18px;font-weight:800;color:#e74c3c;">${r.absent}</div><div style="font-size:10px;color:#999;">נעדרים</div></div>
                    <div><div style="font-size:18px;font-weight:800;color:#3498db;">${r.total}</div><div style="font-size:10px;color:#999;">סה"כ</div></div>
                </div>
                <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">${rolesHTML}</div>`;
            c.appendChild(card);
        });
    },

    // ==================== DAY SUMMARY DIALOG ====================
    openDaySummaryDialog(dateStr, platoonId) {
        const platoons = AttendanceData.loadPlatoons();
        const dayName = AttendanceData.getDayName(new Date(dateStr));
        let html = `<h2>📋 סיכום נוכחות - ${dayName} ${AttendanceData.formatDisplay(dateStr)}</h2>`;
        const targetPlatoons = platoonId ? platoons.filter(p => p.id === platoonId) : platoons;

        targetPlatoons.forEach(pl => {
            const r = Calc.platoonDay(pl.id, dateStr);
            const cmd = Calc.commanderStatusDay(pl.id, dateStr);
            html += `<div class="card" style="margin-bottom:12px;border-top:4px solid ${pl.color};">`;
            html += `<h3 class="card-title" style="border-bottom-color:${pl.color}">${pl.name} - ${r.pct}% (${r.present}/${r.total})</h3>`;
            html += `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">`;
            html += `<div class="role-indicator ${cmd.ok ? 'role-ok' : 'role-bad'}">🎖️ מפקדים: ${cmd.ok ? '✅' : '❌'} (${cmd.present}/${cmd.min})</div></div>`;

            html += '<div class="presence-lists">';
            html += `<div class="presence-list" style="border-color:#d4edda;"><h4 style="color:#27ae60;">✅ נוכחים (${r.presentList.length})</h4>`;
            r.presentList.forEach(item => {
                let tags = '';
                if (item.soldier.is_commander === 'commander') tags += '<span class="role-tag tag-commander">🎖️ מפקד</span>';
                else if (item.soldier.is_commander === 'vice_commander') tags += '<span class="role-tag tag-commander">⭐ מ"כ</span>';
                (item.soldier.roles || []).forEach(role => { tags += `<span class="role-tag tag-role">${role}</span>`; });
                html += `<div class="presence-list-item"><span>${item.soldier.name}</span><div class="soldier-roles">${tags}</div></div>`;
            });
            html += '</div>';

            html += `<div class="presence-list" style="border-color:#f8d7da;"><h4 style="color:#e74c3c;">❌ נעדרים (${r.absentList.length})</h4>`;
            r.absentList.forEach(item => {
                let tags = '';
                if (item.soldier.is_commander === 'commander') tags += '<span class="role-tag tag-commander">🎖️ מפקד</span>';
                else if (item.soldier.is_commander === 'vice_commander') tags += '<span class="role-tag tag-commander">⭐ מ"כ</span>';
                (item.soldier.roles || []).forEach(role => { tags += `<span class="role-tag tag-role">${role}</span>`; });
                const rc = AttendanceData.LEAVE_REASONS.find(x => x.id === item.reason);
                html += `<div class="presence-list-item"><span>${item.soldier.name} <span class="badge ${rc ? rc.badge : 'badge-active'}">${item.reason}</span></span><div class="soldier-roles">${tags}</div></div>`;
            });
            html += '</div></div></div>';
        });

        html += '<div class="form-actions"><button class="btn btn-purple-light" onclick="App.closeDialog()">סגור</button></div>';
        App.openDialog(html);
    },

    // ==================== PLATOON TAB ====================
    refreshPlatoonTab(pid) {
        const range = this.getPlRange(pid);
        if (!range.start || !range.end) return;
        this._renderPlSummary(pid, range.start, range.end);
        this._renderPlRolesAlert(pid);
        this._renderPlPresenceLists(pid);
        this._renderPlSoldiers(pid);
        this._renderPlLeaves(pid);
        this._renderPlHeatmap(pid, range.start, range.end);
    },

    _renderPlSummary(pid, s, e) {
        const c = document.getElementById('plSummary-' + pid);
        if (!c) return;
        const today = AttendanceData.formatISO(new Date());
        const r = Calc.platoonDay(pid, today);
        const range = Calc.rangePlatoon(pid, s, e);
        const past = range.filter(d => d.dateStr <= today);
        const avg = past.length > 0 ? Math.round(past.reduce((sum, d) => sum + d.pct, 0) / past.length) : 100;
        const soldiers = AttendanceData.getSoldiersByPlatoon(pid);
        c.innerHTML = `
            <div class="summary-card card-blue"><div class="label">חיילים</div><div class="value">${soldiers.length}</div></div>
            <div class="summary-card card-green"><div class="label">נוכחות היום</div><div class="value">${r.pct}%</div></div>
            <div class="summary-card card-orange"><div class="label">ממוצע לתקופה</div><div class="value">${avg}%</div></div>
            <div class="summary-card card-purple"><div class="label">🎖️ מפקדים</div><div class="value">${r.commanders.present}/${r.commanders.total}</div></div>`;
    },

    _renderPlRolesAlert(pid) {
        const today = AttendanceData.formatISO(new Date());
        const c = document.getElementById('plRolesAlert-' + pid);
        if (!c) return;
        const cmd = Calc.commanderStatusDay(pid, today);
        const roleStatus = Calc.roleStatusDay(today);
        let html = `<div class="role-indicator ${cmd.ok ? 'role-ok' : 'role-bad'}">🎖️ מפקדים: ${cmd.ok ? '✅' : '❌'} (${cmd.present}/${cmd.min})</div>`;
        roleStatus.forEach(rs => {
            if (rs.level === 'platoon' && rs.platoonId === pid) {
                html += `<div class="role-indicator ${rs.ok ? 'role-ok' : 'role-bad'}">${rs.name}: ${rs.ok ? '✅' : '❌'} (${rs.present}/${rs.min})</div>`;
            }
            if (rs.level === 'company') {
                html += `<div class="role-indicator ${rs.ok ? 'role-ok' : 'role-bad'}">${rs.name} (פלוגה): ${rs.ok ? '✅' : '❌'} (${rs.present}/${rs.min})</div>`;
            }
        });
        c.innerHTML = html;
    },

    _renderPlPresenceLists(pid) {
        const today = AttendanceData.formatISO(new Date());
        const r = Calc.platoonDay(pid, today);
        const c = document.getElementById('plPresenceLists-' + pid);
        if (!c) return;

        let html = '<div class="presence-lists">';
        html += `<div class="presence-list" style="border-color:#d4edda;"><h4 style="color:#27ae60;">✅ נוכחים (${r.presentList.length})</h4>`;
        r.presentList.forEach(item => {
            let tags = '';
            if (item.soldier.is_commander === 'commander') tags += '<span class="role-tag tag-commander">🎖️ מפקד</span>';
            else if (item.soldier.is_commander === 'vice_commander') tags += '<span class="role-tag tag-commander">⭐ מ"כ</span>';
            (item.soldier.roles || []).forEach(role => { tags += `<span class="role-tag tag-role">${role}</span>`; });
            html += `<div class="presence-list-item"><span>${item.soldier.name}</span><div class="soldier-roles">${tags}</div></div>`;
        });
        html += '</div>';
        html += `<div class="presence-list" style="border-color:#f8d7da;"><h4 style="color:#e74c3c;">❌ נעדרים (${r.absentList.length})</h4>`;
        r.absentList.forEach(item => {
            let tags = '';
            if (item.soldier.is_commander === 'commander') tags += '<span class="role-tag tag-commander">🎖️ מפקד</span>';
            else if (item.soldier.is_commander === 'vice_commander') tags += '<span class="role-tag tag-commander">⭐ מ"כ</span>';
            (item.soldier.roles || []).forEach(role => { tags += `<span class="role-tag tag-role">${role}</span>`; });
            const rc = AttendanceData.LEAVE_REASONS.find(x => x.id === item.reason);
            html += `<div class="presence-list-item"><span>${item.soldier.name} <span class="badge ${rc ? rc.badge : 'badge-active'}">${item.reason}</span></span><div class="soldier-roles">${tags}</div></div>`;
        });
        html += '</div></div>';
        c.innerHTML = html;
    },

    _renderPlSoldiers(pid) {
        const allS = AttendanceData.loadSoldiers().filter(s => s.platoon_id === pid);
        const c = document.getElementById('plSoldiers-' + pid);
        if (!c) return;
        if (allS.length === 0) { c.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">אין חיילים</p>'; return; }
        const sorted = allS.slice().sort((a, b) => (b.is_commander ? 1 : 0) - (a.is_commander ? 1 : 0));

        // שינוי 7: רשימת חיילים כאקורדיון
        let html = `<div class="accordion">
            <div class="accordion-header" onclick="AttendanceUI._toggleAccordion(this)">
                <span>👥 רשימת חיילים (${allS.length})</span>
                <span class="accordion-arrow">◀</span>
            </div>
            <div class="accordion-body" style="display:none;">`;

        html += '<table class="data-table"><thead><tr><th>שם</th><th>טלפון</th><th>דרגה</th><th>מפקד</th><th>תפקידים</th><th>נוכחות</th><th>פעיל</th><th>פעולות</th></tr></thead><tbody>';
        sorted.forEach(s => {
            const stats = Calc.soldierMissionStats(s.id);
            const pctCls = Calc.thresholdClass(stats.pct);
            const inactiveClass = s.is_active === false ? ' inactive-row' : '';
            const cmdStyle = s.is_commander ? ' style="background:#fffbeb;"' : '';
            const cmdIcon = s.is_commander === 'commander' ? '🎖️ ' : s.is_commander === 'vice_commander' ? '⭐ ' : '';
            const cmdLevelLabel = s.is_commander === 'commander' ? '<span class="cmd-level-badge cmd-commander">🎖️ מפקד</span>' : s.is_commander === 'vice_commander' ? '<span class="cmd-level-badge cmd-vice">⭐ מ"כ</span>' : '<span style="color:#999;">חייל</span>';
            html += `<tr class="${inactiveClass}"${cmdStyle}>
                <td style="cursor:pointer;" onclick="AttendanceUI.openSoldierCalendarDialog('${s.id}')"><strong>${cmdIcon}${s.name}</strong></td>
                <td style="direction:ltr;">${s.phone || '-'}</td>
                <td>${s.rank || '-'}</td>
                <td>${cmdLevelLabel}</td>
                <td style="font-size:10px;">${(s.roles || []).join(', ') || '-'}</td>
                <td class="${pctCls}" style="font-weight:700;">${stats.pct}% <span style="font-size:9px;font-weight:400;">(${stats.presentDays}/${stats.totalDays})</span></td>
                <td><button class="btn-icon" onclick="AttendanceUI.toggleActive('${s.id}')">${s.is_active !== false ? '✅' : '❌'}</button></td>
                <td>
                    <button class="btn-icon" onclick="AttendanceUI.openEditSoldierDialog('${s.id}')">✏️</button>
                    <button class="btn-icon" onclick="AttendanceUI.deleteSoldier('${s.id}')">🗑️</button>
                    <button class="btn-icon" onclick="AttendanceUI.openAddLeaveDialog('${s.id}')" title="חופשה">🏖️</button>
                    <button class="btn-icon" onclick="AttendanceUI.openSoldierLeavesDialog('${s.id}')" title="חופשות">📋</button>
                    <button class="btn-icon" onclick="AttExport.exportSoldierReport('${s.id}')" title="דוח">📄</button>
                </td></tr>`;
        });
        html += '</tbody></table>';
        html += '</div></div>'; // close accordion-body and accordion
        c.innerHTML = html;
    },

    // שינוי 7: toggle accordion helper
    _toggleAccordion(header) {
        const body = header.nextElementSibling;
        const arrow = header.querySelector('.accordion-arrow');
        if (body.style.display === 'none') {
            body.style.display = 'block';
            arrow.classList.add('open');
        } else {
            body.style.display = 'none';
            arrow.classList.remove('open');
        }
    },

    // ==================== שינוי 6+7: היעדרויות שמיות עם אקורדיון ====================
    _renderPlLeaves(pid) {
        const soldiers = AttendanceData.loadSoldiers().filter(s => s.platoon_id === pid);
        const sIds = soldiers.map(s => s.id);
        const leaves = AttendanceData.loadLeaves().filter(l => sIds.includes(l.soldier_id));
        const today = AttendanceData.formatISO(new Date());
        const c = document.getElementById('plLeaves-' + pid);
        if (!c) return;

        if (leaves.length === 0) {
            c.innerHTML = '<p class="leaves-no-data">אין היעדרויות</p>';
            return;
        }

        // שינוי 7: עטיפת היעדרויות באקורדיון
        let outerHtml = `<div class="accordion">
            <div class="accordion-header" onclick="AttendanceUI._toggleAccordion(this)">
                <span>📋 היעדרויות (${leaves.length})</span>
                <span class="accordion-arrow">◀</span>
            </div>
            <div class="accordion-body" style="display:none;">`;

        // קיבוץ לפי חייל
        const bySoldier = {};
        leaves.forEach(l => {
            if (!bySoldier[l.soldier_id]) bySoldier[l.soldier_id] = [];
            bySoldier[l.soldier_id].push(l);
        });

        // מיון היעדרויות בתוך כל חייל
        Object.values(bySoldier).forEach(arr => {
            arr.sort((a, b) => b.start_date.localeCompare(a.start_date));
        });

        let html = '<div class="leaves-accordion">';

        // מיון חיילים - מפקדים קודם
        const sortedSoldierIds = Object.keys(bySoldier).sort((a, b) => {
            const sA = soldiers.find(s => s.id === a);
            const sB = soldiers.find(s => s.id === b);
            if (sA?.is_commander && !sB?.is_commander) return -1;
            if (!sA?.is_commander && sB?.is_commander) return 1;
            return (sA?.name || '').localeCompare(sB?.name || '');
        });

        sortedSoldierIds.forEach(soldierId => {
            const s = soldiers.find(x => x.id === soldierId);
            if (!s) return;
            const soldierLeaves = bySoldier[soldierId];
            const hasActive = soldierLeaves.some(l => today >= l.start_date && today <= l.end_date);
            const cmdIcon = s.is_commander === 'commander' ? '<span class="commander-icon">🎖️</span>' : s.is_commander === 'vice_commander' ? '<span class="commander-icon">⭐</span>' : '';
            const countBadgeCls = hasActive ? 'leaves-count-badge has-active' : 'leaves-count-badge';

            // Reason summary tags
            const reasonCounts = {};
            soldierLeaves.forEach(l => { reasonCounts[l.reason] = (reasonCounts[l.reason] || 0) + 1; });
            let reasonTags = '<div class="leaves-reason-tags">';
            Object.keys(reasonCounts).forEach(reason => {
                const rc = AttendanceData.LEAVE_REASONS.find(x => x.id === reason);
                reasonTags += `<span class="leaves-reason-tag badge ${rc ? rc.badge : 'badge-active'}">${reason}(${reasonCounts[reason]})</span>`;
            });
            reasonTags += '</div>';

            const accId = `leaves-acc-${pid}-${soldierId}`;

            html += `<div class="leaves-soldier-row" onclick="AttendanceUI.toggleLeavesAccordion('${accId}')">
                <div class="leaves-soldier-name">${cmdIcon}${s.name} ${reasonTags}</div>
                <div class="leaves-soldier-meta">
                    <span class="${countBadgeCls}">${soldierLeaves.length}</span>
                    <span class="leaves-arrow" id="arrow-${accId}">◀</span>
                </div>
            </div>`;

            html += `<div class="leaves-soldier-details" id="${accId}">`;
            html += `<table class="leaves-detail-table"><thead><tr>
                <th>סיבה</th><th>יציאה</th><th>שעה</th><th>חזרה</th><th>שעה</th><th>סטטוס</th><th>פעולות</th>
            </tr></thead><tbody>`;

            soldierLeaves.forEach(l => {
                let status, sCls;
                if (today < l.start_date) { status = 'עתידי'; sCls = 'badge-upcoming'; }
                else if (today > l.end_date) { status = 'הסתיים'; sCls = 'badge-completed'; }
                else { status = 'פעיל'; sCls = 'badge-active'; }
                const rc = AttendanceData.LEAVE_REASONS.find(x => x.id === l.reason);

                html += `<tr>
                    <td><span class="badge ${rc ? rc.badge : 'badge-active'}">${l.reason}</span></td>
                    <td style="direction:ltr;">${AttendanceData.formatDisplay(l.start_date)}</td>
                    <td style="direction:ltr;">${l.start_time || '-'}</td>
                    <td style="direction:ltr;">${AttendanceData.formatDisplay(l.end_date)}</td>
                    <td style="direction:ltr;">${l.end_time || '-'}</td>
                    <td><span class="badge ${sCls}">${status}</span></td>
                    <td class="leave-actions">
                        <button class="btn-icon" onclick="event.stopPropagation();AttendanceUI.openEditLeaveDialog('${l.id}')">✏️</button>
                        <button class="btn-icon" onclick="event.stopPropagation();AttendanceUI.deleteLeave('${l.id}','${pid}')">🗑️</button>
                    </td>
                </tr>`;
            });

            html += '</tbody></table>';
            html += `<button class="leaves-add-btn" onclick="event.stopPropagation();AttendanceUI.openAddLeaveDialog('${soldierId}')">➕ הוסף היעדרות</button>`;
            html += '<div style="clear:both;"></div>';
            html += '</div>';
        });

        html += '</div>';
        html += '</div></div>'; // close accordion-body and outer accordion
        c.innerHTML = outerHtml + html;
    },

    toggleLeavesAccordion(accId) {
        const el = document.getElementById(accId);
        const arrow = document.getElementById('arrow-' + accId);
        const row = el?.previousElementSibling;
        if (!el) return;

        if (el.classList.contains('open')) {
            el.classList.remove('open');
            if (arrow) arrow.classList.remove('open');
            if (row) row.classList.remove('open');
        } else {
            el.classList.add('open');
            if (arrow) arrow.classList.add('open');
            if (row) row.classList.add('open');
        }
    },

    // ==================== שינוי 7: מפת נוכחות עם הדגשת עמודה ====================
    _renderPlHeatmap(pid, s, e) {
        const c = document.getElementById('plHeatmap-' + pid);
        if (!c) return;
        const data = Calc.heatmapData(pid, s, e);
        if (data.soldiers.length === 0) { c.innerHTML = '<p style="text-align:center;color:#999;padding:30px;">אין חיילים</p>'; return; }
        const settings = AttendanceData.loadSettings();

        let html = '<table class="heatmap-table"><thead><tr><th class="name-hdr">חייל</th>';
        data.days.forEach((d, colIdx) => {
            const todayS = d.isToday ? ' style="background:var(--purple-mid);color:#fff;cursor:pointer;"' : ' style="cursor:pointer;"';
            const weekS = d.isWeekend && !d.isToday ? ' style="color:#f39c12;cursor:pointer;"' : '';
            const styleAttr = d.isToday ? todayS : (d.isWeekend ? weekS : ' style="cursor:pointer;"');
            html += `<th class="day-hdr" data-col-index="${colIdx}" data-date-str="${d.dateStr}" onclick="AttendanceUI.toggleHeatmapColumn('${pid}', ${colIdx})"${styleAttr}><div>${d.dayName.substr(0, 2)}</div><div>${d.day}/${d.month}</div></th>`;
        });
        html += '</tr></thead><tbody>';

        data.soldiers.forEach(sol => {
            const cmdCls = sol.is_commander ? ' commander-row' : '';
            const cmdIcon = sol.is_commander === 'commander' ? '🎖️ ' : sol.is_commander === 'vice_commander' ? '⭐ ' : '';
            html += `<tr><td class="name-cell${cmdCls}" style="cursor:pointer;" onclick="AttendanceUI.openSoldierCalendarDialog('${sol.id}')">${cmdIcon}${sol.name}</td>`;
            data.days.forEach((d, colIdx) => {
                const cell = data.cells[sol.id][d.dateStr];
                const cls = Calc.cellClass(cell);
                const todayCls = cell.isToday ? ' hm-today' : '';
                const short = cell.present ? '' : Calc.reasonShort(cell.reason);
                const tip = cell.present ? sol.name + ' - בבסיס' : sol.name + ' - ' + (cell.reason || 'נעדר');
                html += `<td class="hm-cell ${cls}${todayCls}" data-col-index="${colIdx}" title="${tip}" onclick="AttendanceUI.onHeatmapClick('${sol.id}','${d.dateStr}','${pid}')">${short}</td>`;
            });
            html += '</tr>';
        });

        // Pct row
        html += '<tr class="pct-row"><td class="name-cell" style="font-size:10px;font-weight:700;">%</td>';
        data.dailyPct.forEach((dp, colIdx) => { html += `<td data-col-index="${colIdx}" class="${Calc.thresholdClass(dp.pct)}" title="${dp.present}/${dp.total}">${dp.pct}%</td>`; });
        html += '</tr>';

        // Cmd row
        html += '<tr class="cmd-row"><td class="name-cell" style="font-size:10px;font-weight:700;">🎖️</td>';
        data.dailyCmd.forEach((dc, colIdx) => { html += `<td data-col-index="${colIdx}" class="${dc.ok ? 'pct-normal' : 'pct-critical'}">${dc.ok ? '✅' : '❌'}</td>`; });
        html += '</tr>';

        // Roles rows
        (settings.roles || []).forEach(role => {
            if (role.level === 'platoon') {
                html += `<tr class="roles-row"><td class="name-cell" style="font-size:9px;font-weight:700;">${role.name}</td>`;
                data.days.forEach((d, colIdx) => {
                    const plSoldiers = AttendanceData.getSoldiersByPlatoon(pid);
                    let presentCount = 0;
                    plSoldiers.forEach(sol => {
                        if (sol.roles && sol.roles.includes(role.name)) {
                            const r = AttendanceData.isSoldierAbsentOnDate(sol.id, d.dateStr);
                            if (!r.absent) presentCount++;
                        }
                    });
                    html += `<td data-col-index="${colIdx}" class="${presentCount >= role.min ? 'pct-normal' : 'pct-critical'}">${presentCount >= role.min ? '✅' : '❌'}</td>`;
                });
                html += '</tr>';
            }
        });

        html += '</tbody></table>';
        c.innerHTML = html;
    },

    /**
     * שינוי 7: הדגשת/ביטול הדגשת עמודת יום
     */
    toggleHeatmapColumn(pid, colIdx) {
        const wrapper = document.getElementById('plHeatmap-' + pid);
        if (!wrapper) return;

        const isCurrentlyHighlighted = this._highlightedCol[pid] === colIdx;

        // Remove all highlights in this heatmap
        wrapper.querySelectorAll('.col-highlighted').forEach(el => {
            el.classList.remove('col-highlighted');
        });

        if (isCurrentlyHighlighted) {
            // Toggle off
            delete this._highlightedCol[pid];
        } else {
            // Highlight new column
            this._highlightedCol[pid] = colIdx;
            wrapper.querySelectorAll(`[data-col-index="${colIdx}"]`).forEach(el => {
                el.classList.add('col-highlighted');
            });
        }
    },

    onHeatmapClick(sid, dateStr, pid) {
        const s = AttendanceData.loadSoldiers().find(x => x.id === sid);
        if (!s) return;
        const r = AttendanceData.isSoldierAbsentOnDate(sid, dateStr);
        if (r.absent && r.leave) {
            if (confirm(`${s.name} - ${r.reason}\nמ: ${AttendanceData.formatDisplay(r.leave.start_date)}\nעד: ${AttendanceData.formatDisplay(r.leave.end_date)}\n\nלמחוק?`)) {
                AttendanceData.deleteLeave(r.leave.id);
                Toast.show('נמחק', 'success');
                this.refreshPlatoonTab(pid);
            }
        } else {
            this.openAddLeaveDialog(sid, dateStr);
        }
    },

    // ==================== SOLDIER CALENDAR DIALOG ====================
    openSoldierCalendarDialog(soldierId) {
        const s = AttendanceData.loadSoldiers().find(x => x.id === soldierId);
        if (!s) return;
        const stats = Calc.soldierMissionStats(soldierId);
        const mission = AttendanceData.getMissionRange();
        const leaves = AttendanceData.loadLeaves().filter(l => l.soldier_id === soldierId);
        const pctCls = Calc.thresholdClass(stats.pct);

        let html = `<h2>📅 ${s.is_commander === 'commander' ? '🎖️ ' : s.is_commander === 'vice_commander' ? '⭐ ' : ''}${s.name}</h2>`;
        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:15px;">';
        html += `<div class="summary-card card-blue" style="padding:10px;"><div class="label">ימי משימה</div><div class="value" style="font-size:22px;">${stats.totalDays}</div></div>`;
        html += `<div class="summary-card card-green" style="padding:10px;"><div class="label">ימי נוכחות</div><div class="value" style="font-size:22px;">${stats.presentDays}</div></div>`;
        html += `<div class="summary-card card-red" style="padding:10px;"><div class="label">ימי היעדרות</div><div class="value" style="font-size:22px;">${stats.absentDays}</div></div>`;
        html += '</div>';
        html += `<div style="text-align:center;margin-bottom:12px;"><span class="${pctCls}" style="font-size:24px;font-weight:900;padding:4px 12px;border-radius:8px;">${stats.pct}% נוכחות</span></div>`;

        if (Object.keys(stats.reasons).length > 0) {
            html += '<div style="margin-bottom:12px;font-size:12px;"><strong>פירוט:</strong> ';
            Object.keys(stats.reasons).forEach(reason => { html += `${reason}: ${stats.reasons[reason]} ימים, `; });
            html = html.slice(0, -2) + '</div>';
        }

        html += '<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;">';
        const startDate = new Date(mission.start);
        const endDate = new Date(mission.end);
        let curMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        while (curMonth <= endDate) {
            html += this._renderMiniCalendar(soldierId, curMonth.getFullYear(), curMonth.getMonth(), mission.start, mission.end);
            curMonth.setMonth(curMonth.getMonth() + 1);
        }
        html += '</div>';

        if (leaves.length > 0) {
            html += '<div style="margin-top:12px;"><strong style="font-size:12px;">רשימת היעדרויות:</strong>';
            html += '<div class="soldier-leaves-mini">';
            leaves.sort((a, b) => a.start_date.localeCompare(b.start_date));
            leaves.forEach(l => {
                html += `<div class="mini-leave-item"><span>${l.reason} | ${AttendanceData.formatDisplay(l.start_date)} - ${AttendanceData.formatDisplay(l.end_date)}</span></div>`;
            });
            html += '</div></div>';
        }

        html += '<div class="form-actions"><button class="btn btn-purple-light" onclick="App.closeDialog()">סגור</button></div>';
        App.openDialog(html);
    },

    _renderMiniCalendar(soldierId, year, month, missionStart, missionEnd) {
        const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
        let html = '<div class="mini-calendar">';
        html += `<div class="cal-month-title">${monthNames[month]} ${year}</div>`;
        html += '<table><thead><tr>';
        AttendanceData.DAYS_HEB_SHORT.forEach(d => { html += `<th>${d}</th>`; });
        html += '</tr></thead><tbody><tr>';
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = AttendanceData.formatISO(new Date());
        for (let i = 0; i < firstDay; i++) html += '<td></td>';
        for (let d = 1; d <= daysInMonth; d++) {
            const ds = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
            const inMission = ds >= missionStart && ds <= missionEnd;
            let bgColor = '#fff', textColor = '#333';
            if (inMission) {
                const r = AttendanceData.isSoldierAbsentOnDate(soldierId, ds);
                if (r.absent) {
                    const rc = AttendanceData.LEAVE_REASONS.find(x => x.id === r.reason);
                    const colorMap = { 'hm-leave': '#fff3cd', 'hm-course': '#d1ecf1', 'hm-sick': '#fde2cc', 'hm-special': '#e8d5f5', 'hm-absent': '#f8d7da' };
                    bgColor = rc ? (colorMap[rc.cls] || '#f8d7da') : '#f8d7da';
                    textColor = '#721c24';
                } else { bgColor = '#d4edda'; textColor = '#155724'; }
            } else { bgColor = '#f0f0f0'; textColor = '#bbb'; }
            const todayBorder = ds === today ? 'border:2px solid var(--purple-mid);' : '';
            html += `<td style="background:${bgColor};color:${textColor};${todayBorder}">${d}</td>`;
            if ((firstDay + d) % 7 === 0 && d < daysInMonth) html += '</tr><tr>';
        }
        const remaining = (firstDay + daysInMonth) % 7;
        if (remaining > 0) for (let j = remaining; j < 7; j++) html += '<td></td>';
        html += '</tr></tbody></table></div>';
        return html;
    },

    // ==================== SOLDIER DIALOGS ====================
    openAddSoldierDialog(platoonId) { this._soldierBatchDialog(platoonId); },
    openEditSoldierDialog(id) { const s = AttendanceData.loadSoldiers().find(x => x.id === id); if (s) this._soldierEditDialog(s); },

    /* ---- BATCH ADD (spreadsheet-style rows) ---- */
    _batchMeta: null,

    _soldierBatchDialog(presetPlatoon) {
        const platoons = AttendanceData.loadPlatoons();
        let platoonOptions = '';
        platoons.forEach(p => {
            const sel = presetPlatoon === p.id ? ' selected' : '';
            platoonOptions += `<option value="${p.id}"${sel}>${p.name}</option>`;
        });
        this._batchMeta = { platoonOptions, rowCount: 0 };

        const html = `<h2>➕ הוספת חיילים</h2>
            <p style="color:#666;font-size:13px;margin-bottom:12px;">מלא שם בשורה ולחץ על השורה הבאה להוספה נוספת</p>
            <div class="batch-table-wrap">
                <table class="batch-add-table">
                    <thead><tr>
                        <th class="batch-th-num">#</th>
                        <th>שם *</th>
                        <th>טלפון</th>
                        <th>דרגה</th>
                        <th>מחלקה</th>
                        <th class="batch-th-cmd">דרג פיקוד</th>
                        <th class="batch-th-del"></th>
                    </tr></thead>
                    <tbody id="batchSoldierRows"></tbody>
                </table>
            </div>
            <div class="batch-summary" id="batchSummary">0 חיילים להוספה</div>
            <div class="form-actions">
                <button class="btn btn-purple" onclick="AttendanceUI.saveBatchSoldiers()">💾 הוסף הכל</button>
                <button class="btn btn-purple-light" onclick="App.closeDialog()">❌ ביטול</button>
            </div>`;
        App.openDialog(html);
        this._addBatchRow(true);
        this._addBatchRow(false);
    },

    _addBatchRow(active) {
        const tbody = document.getElementById('batchSoldierRows');
        if (!tbody) return;
        const idx = this._batchMeta.rowCount++;
        const tr = document.createElement('tr');
        tr.id = `batchRow_${idx}`;
        tr.dataset.idx = idx;
        tr.className = active ? 'batch-row batch-row-active' : 'batch-row batch-row-ghost';
        tr.innerHTML = `
            <td class="batch-num">${idx + 1}</td>
            <td><input type="text" class="batch-input" data-field="name" placeholder="שם חייל" ${active ? '' : 'disabled'}></td>
            <td><input type="text" class="batch-input batch-input-sm" data-field="phone" placeholder="טלפון" ${active ? '' : 'disabled'}></td>
            <td><input type="text" class="batch-input batch-input-sm" data-field="rank" placeholder="דרגה" ${active ? '' : 'disabled'}></td>
            <td><select class="batch-select" data-field="platoon" ${active ? '' : 'disabled'}>${this._batchMeta.platoonOptions}</select></td>
            <td class="batch-center"><select class="batch-select" data-field="commandLevel" style="font-size:11px;min-width:70px;" ${active ? '' : 'disabled'}><option value="">חייל</option><option value="vice_commander">מ"כ</option><option value="commander">מפקד</option></select></td>
            <td class="batch-center">${active ? '<button class="batch-del-btn" title="הסר שורה">🗑️</button>' : ''}</td>`;
        tbody.appendChild(tr);

        if (active) {
            const nameInput = tr.querySelector('input[data-field="name"]');
            nameInput.focus();
            nameInput.addEventListener('input', () => this._updateBatchSummary());
            tr.querySelector('.batch-del-btn').addEventListener('click', () => this._removeBatchRow(tr));
        } else {
            tr.addEventListener('click', () => this._activateBatchRow(tr), { once: true });
        }
    },

    _activateBatchRow(tr) {
        if (tr.classList.contains('batch-row-active')) return;
        // Validate previous row has name
        const prev = tr.previousElementSibling;
        if (prev && prev.classList.contains('batch-row-active')) {
            const prevName = prev.querySelector('input[data-field="name"]').value.trim();
            if (!prevName) {
                Toast.show('מלא שם בשורה הקודמת', 'error');
                tr.addEventListener('click', () => this._activateBatchRow(tr), { once: true });
                return;
            }
        }
        tr.classList.remove('batch-row-ghost');
        tr.classList.add('batch-row-active');
        tr.querySelectorAll('input, select').forEach(el => el.disabled = false);
        const lastTd = tr.querySelector('td:last-child');
        lastTd.innerHTML = '<button class="batch-del-btn" title="הסר שורה">🗑️</button>';
        lastTd.querySelector('.batch-del-btn').addEventListener('click', () => this._removeBatchRow(tr));
        const nameInput = tr.querySelector('input[data-field="name"]');
        nameInput.addEventListener('input', () => this._updateBatchSummary());
        nameInput.focus();
        this._addBatchRow(false);
        this._updateBatchSummary();
    },

    _removeBatchRow(tr) {
        tr.remove();
        this._renumberBatchRows();
        this._updateBatchSummary();
    },

    _renumberBatchRows() {
        const all = document.querySelectorAll('#batchSoldierRows tr.batch-row');
        all.forEach((row, i) => { row.querySelector('.batch-num').textContent = i + 1; });
    },

    _updateBatchSummary() {
        let count = 0;
        document.querySelectorAll('#batchSoldierRows tr.batch-row-active').forEach(row => {
            if (row.querySelector('input[data-field="name"]').value.trim()) count++;
        });
        const el = document.getElementById('batchSummary');
        if (el) el.textContent = `${count} חיילים להוספה`;
    },

    saveBatchSoldiers() {
        const rows = document.querySelectorAll('#batchSoldierRows tr.batch-row-active');
        const toAdd = [];
        rows.forEach(row => {
            const name = row.querySelector('input[data-field="name"]').value.trim();
            if (!name) return;
            const cmdLevel = row.querySelector('select[data-field="commandLevel"]')?.value || '';
            toAdd.push({
                name,
                phone: row.querySelector('input[data-field="phone"]').value.trim(),
                rank: row.querySelector('input[data-field="rank"]').value.trim(),
                platoon_id: row.querySelector('select[data-field="platoon"]').value,
                is_commander: cmdLevel,
                roles: []
            });
        });
        if (toAdd.length === 0) { Toast.show('לא הוזנו חיילים', 'error'); return; }
        toAdd.forEach(s => AttendanceData.addSoldier(s));
        Toast.show(`✅ ${toAdd.length} חיילים נוספו`, 'success');
        this._refreshAllPlatoons();
        document.getElementById('dialogOverlay').style.display = 'none';
    },

    /* ---- EDIT single soldier (full dialog with roles) ---- */
    _soldierEditDialog(soldier) {
        const platoons = AttendanceData.loadPlatoons();
        const settings = AttendanceData.loadSettings();
        const allRoles = (settings.roles || []).map(r => r.name);
        const soldierRoles = soldier.roles || [];
        let platoonOptions = '';
        platoons.forEach(p => {
            const sel = soldier.platoon_id === p.id ? ' selected' : '';
            platoonOptions += `<option value="${p.id}"${sel}>${p.name}</option>`;
        });
        let rolesCheckboxes = '';
        allRoles.forEach(role => {
            rolesCheckboxes += `<label style="display:inline-flex;align-items:center;gap:4px;margin-left:12px;font-size:12px;cursor:pointer;"><input type="checkbox" name="soldierRoles" value="${role}"${soldierRoles.includes(role) ? ' checked' : ''}> ${role}</label>`;
        });

        const html = `<h2>✏️ עריכת חייל</h2>
            <div class="form-group"><label>שם:</label><input type="text" id="dlgSName" value="${soldier.name}"></div>
            <div class="form-row">
                <div class="form-group"><label>טלפון:</label><input type="text" id="dlgSPhone" value="${soldier.phone || ''}"></div>
                <div class="form-group"><label>דרגה:</label><input type="text" id="dlgSRank" value="${soldier.rank || ''}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>מחלקה:</label><select id="dlgSPlatoon">${platoonOptions}</select></div>
                <div class="form-group"><label>מפקד:</label><select id="dlgSCommander">
                    <option value=""${!soldier.is_commander ? ' selected' : ''}>חייל רגיל</option>
                    <option value="vice_commander"${soldier.is_commander === 'vice_commander' ? ' selected' : ''}>⭐ מ"כ</option>
                    <option value="commander"${soldier.is_commander === 'commander' ? ' selected' : ''}>🎖️ מפקד</option></select></div>
            </div>
            <div class="form-group"><label>תפקידים:</label><div style="padding:8px;border:2px solid #ddd;border-radius:8px;">${rolesCheckboxes || '<span style="color:#999;font-size:12px;">לא הוגדרו</span>'}</div></div>
            <div class="form-actions">
                <button class="btn btn-purple" onclick="AttendanceUI.saveSoldier('${soldier.id}')">💾 שמור</button>
                <button class="btn btn-purple-light" onclick="App.closeDialog()">❌ ביטול</button></div>`;
        App.openDialog(html);
    },

    saveSoldier(id) {
        const name = document.getElementById('dlgSName').value.trim();
        if (!name) { Toast.show('חובה שם!', 'error'); return; }
        const roles = [...document.querySelectorAll('input[name=soldierRoles]:checked')].map(c => c.value);
        const data = {
            name, phone: document.getElementById('dlgSPhone').value.trim(),
            rank: document.getElementById('dlgSRank').value.trim(),
            platoon_id: document.getElementById('dlgSPlatoon').value,
            is_commander: document.getElementById('dlgSCommander').value,
            roles
        };
        AttendanceData.updateSoldier(id, data);
        Toast.show('עודכן', 'success');
        this._refreshAllPlatoons();
        document.getElementById('dialogOverlay').style.display = 'none';
    },

    toggleActive(id) {
        const s = AttendanceData.loadSoldiers().find(x => x.id === id);
        if (s) { AttendanceData.updateSoldier(id, { is_active: s.is_active === false }); this._refreshAllPlatoons(); }
    },
    toggleCommander(id) {
        const s = AttendanceData.loadSoldiers().find(x => x.id === id);
        if (s) { AttendanceData.updateSoldier(id, { is_commander: s.is_commander ? '' : 'commander' }); this._refreshAllPlatoons(); }
    },
    deleteSoldier(id) {
        if (confirm('למחוק חייל + חופשות?')) { AttendanceData.deleteSoldier(id); Toast.show('נמחק', 'warning'); this._refreshAllPlatoons(); }
    },

    // ==================== LEAVE DIALOGS ====================
    openAddLeaveDialog(soldierId, dateStr, platoonId) { this._leaveDialog(null, soldierId, dateStr, platoonId); },
    openEditLeaveDialog(id) { const l = AttendanceData.loadLeaves().find(x => x.id === id); if (l) this._leaveDialog(l); },

    _leaveDialog(leave, presetSid, presetDate, presetPid) {
        const isEdit = !!leave;
        const soldiers = AttendanceData.getActiveSoldiers();
        const platoons = AttendanceData.loadPlatoons();
        const settings = AttendanceData.loadSettings();
        const today = AttendanceData.formatISO(new Date());
        let soldierOptions = '<option value="">-- בחר --</option>';
        platoons.forEach(p => {
            const ps = soldiers.filter(s => s.platoon_id === p.id);
            if (!ps.length) return;
            soldierOptions += `<optgroup label="${p.name}">`;
            ps.forEach(s => {
                const sel = (leave && leave.soldier_id === s.id) || (presetSid === s.id) ? ' selected' : '';
                soldierOptions += `<option value="${s.id}"${sel}>${s.is_commander ? '🎖️' : ''}${s.name}</option>`;
            });
            soldierOptions += '</optgroup>';
        });
        let reasonOptions = '';
        AttendanceData.LEAVE_REASONS.forEach(r => {
            const sel = leave && leave.reason === r.id ? ' selected' : '';
            reasonOptions += `<option value="${r.id}"${sel}>${r.label}</option>`;
        });
        const startDate = (leave ? leave.start_date : presetDate) || today;
        const endDate = (leave ? leave.end_date : presetDate) || today;
        const startTime = (leave ? leave.start_time : null) || settings.defaultLeaveTime || '14:00';
        const endTime = (leave ? leave.end_time : null) || settings.defaultReturnTime || '17:00';

        const html = `<h2>${isEdit ? '✏️ עריכת היעדרות' : '➕ הוספת היעדרות'}</h2>
            <div class="form-group"><label>חייל:</label><select id="dlgLSoldier"${isEdit ? ' disabled' : ''}>${soldierOptions}</select></div>
            <div class="form-group"><label>סיבה:</label><select id="dlgLReason">${reasonOptions}</select></div>
            <div class="form-row">
                <div class="form-group"><label>תאריך יציאה:</label><input type="date" id="dlgLStart" value="${startDate}"></div>
                <div class="form-group"><label>שעת יציאה:</label><input type="time" id="dlgLStartTime" value="${startTime}"></div>
            </div><div class="form-row">
                <div class="form-group"><label>תאריך חזרה:</label><input type="date" id="dlgLEnd" value="${endDate}"></div>
                <div class="form-group"><label>שעת חזרה:</label><input type="time" id="dlgLEndTime" value="${endTime}"></div>
            </div>
            <div class="form-group"><label>הערות:</label><textarea id="dlgLNotes" rows="2">${leave ? (leave.notes || '') : ''}</textarea></div>
            <div class="form-actions">
                <button class="btn btn-purple" onclick="AttendanceUI.saveLeave('${leave ? leave.id : ''}')">💾 שמור</button>
                <button class="btn btn-purple-light" onclick="App.closeDialog()">❌ ביטול</button></div>`;
        App.openDialog(html);
        setTimeout(() => {
            const dlgLStartEl = document.getElementById('dlgLStart');
            const dlgLEndEl = document.getElementById('dlgLEnd');
            if (dlgLStartEl && dlgLEndEl) {
                dlgLStartEl.addEventListener('change', () => {
                    dlgLEndEl.value = dlgLStartEl.value;
                    setTimeout(() => { dlgLEndEl.focus(); if (dlgLEndEl.showPicker) dlgLEndEl.showPicker(); }, 100);
                });
            }
        }, 50);
    },

    saveLeave(id) {
        const sid = document.getElementById('dlgLSoldier').value;
        if (!sid) { Toast.show('בחר חייל!', 'error'); return; }
        const sd = document.getElementById('dlgLStart').value;
        const ed = document.getElementById('dlgLEnd').value;
        if (!sd || !ed) { Toast.show('חובה תאריכים!', 'error'); return; }
        if (ed < sd) { Toast.show('תאריך חזרה אחרי יציאה!', 'error'); return; }
        const data = {
            soldier_id: sid, reason: document.getElementById('dlgLReason').value,
            start_date: sd, start_time: document.getElementById('dlgLStartTime').value || null,
            end_date: ed, end_time: document.getElementById('dlgLEndTime').value || null,
            notes: document.getElementById('dlgLNotes').value.trim()
        };
        if (id) { AttendanceData.updateLeave(id, data); Toast.show('עודכן', 'success'); }
        else { AttendanceData.addLeave(data); Toast.show('נוסף', 'success'); }
        document.getElementById('dialogOverlay').style.display = 'none';
        this._refreshAllPlatoons();
        this.refreshDashboard();
    },

    deleteLeave(id, pid) {
        if (confirm('למחוק?')) {
            AttendanceData.deleteLeave(id);
            Toast.show('נמחק', 'success');
            this._refreshAllPlatoons();
            this.refreshDashboard();
        }
    },

    openSoldierLeavesDialog(soldierId) {
        const s = AttendanceData.loadSoldiers().find(x => x.id === soldierId);
        if (!s) return;
        const leaves = AttendanceData.loadLeaves().filter(l => l.soldier_id === soldierId);
        const today = AttendanceData.formatISO(new Date());
        const settings = AttendanceData.loadSettings();
        let leavesHTML = '';
        if (leaves.length === 0) { leavesHTML = '<p style="color:#999;text-align:center;padding:15px;">אין</p>'; }
        else {
            leaves.sort((a, b) => b.start_date.localeCompare(a.start_date));
            leavesHTML = '<div class="soldier-leaves-mini">';
            leaves.forEach(l => {
                let status;
                if (today < l.start_date) status = '🔵 עתידי';
                else if (today > l.end_date) status = '✅ הסתיים';
                else status = '🔴 פעיל';
                leavesHTML += `<div class="mini-leave-item"><span>${status} ${l.reason} | ${AttendanceData.formatDisplay(l.start_date)} - ${AttendanceData.formatDisplay(l.end_date)}</span>
                    <span><button class="btn-icon btn-xs" onclick="AttendanceUI.openEditLeaveDialog('${l.id}')">✏️</button>
                    <button class="btn-icon btn-xs" onclick="AttendanceUI.deleteLeaveAndRefreshDialog('${l.id}','${soldierId}')">🗑️</button></span></div>`;
            });
            leavesHTML += '</div>';
        }
        let reasonOptions = '';
        AttendanceData.LEAVE_REASONS.forEach(r => { reasonOptions += `<option value="${r.id}">${r.label}</option>`; });

        const html = `<h2>📋 חופשות - ${s.is_commander ? '🎖️ ' : ''}${s.name}</h2>${leavesHTML}
            <hr style="margin:15px 0;border-color:#eee;">
            <h3 style="font-size:14px;margin-bottom:10px;">➕ הוספה מהירה</h3>
            <div class="form-group"><label>סיבה:</label><select id="qlReason">${reasonOptions}</select></div>
            <div class="form-row">
                <div class="form-group"><label>מתאריך:</label><input type="date" id="qlStart" value="${today}"></div>
                <div class="form-group"><label>שעת יציאה:</label><input type="time" id="qlStartTime" value="${settings.defaultLeaveTime || '14:00'}"></div>
            </div><div class="form-row">
                <div class="form-group"><label>עד תאריך:</label><input type="date" id="qlEnd" value="${today}"></div>
                <div class="form-group"><label>שעת חזרה:</label><input type="time" id="qlEndTime" value="${settings.defaultReturnTime || '17:00'}"></div>
            </div>
            <div class="form-actions">
                <button class="btn btn-purple" onclick="AttendanceUI.quickAddLeave('${soldierId}')">💾 הוסף</button>
                <button class="btn btn-purple-light" onclick="App.closeDialog()">סגור</button></div>`;
        App.openDialog(html);
        setTimeout(() => {
            const qlStartEl = document.getElementById('qlStart');
            const qlEndEl = document.getElementById('qlEnd');
            if (qlStartEl && qlEndEl) {
                qlStartEl.addEventListener('change', () => { qlEndEl.value = qlStartEl.value; qlEndEl.focus(); if (qlEndEl.showPicker) qlEndEl.showPicker(); });
            }
        }, 50);
    },

    quickAddLeave(soldierId) {
        const sd = document.getElementById('qlStart').value;
        const ed = document.getElementById('qlEnd').value;
        if (!sd || !ed) { Toast.show('חובה תאריכים', 'error'); return; }
        if (ed < sd) { Toast.show('חזרה אחרי יציאה!', 'error'); return; }
        AttendanceData.addLeave({
            soldier_id: soldierId, reason: document.getElementById('qlReason').value,
            start_date: sd, start_time: document.getElementById('qlStartTime').value || null,
            end_date: ed, end_time: document.getElementById('qlEndTime').value || null, notes: ''
        });
        Toast.show('נוסף', 'success');
        this.openSoldierLeavesDialog(soldierId);
    },

    deleteLeaveAndRefreshDialog(leaveId, soldierId) {
        AttendanceData.deleteLeave(leaveId);
        this.openSoldierLeavesDialog(soldierId);
    },

    openBulkLeaveDialog(platoonId) {
        const soldiers = AttendanceData.getSoldiersByPlatoon(platoonId);
        const settings = AttendanceData.loadSettings();
        const today = AttendanceData.formatISO(new Date());
        let soldiersCheckboxes = '';
        soldiers.forEach(s => { soldiersCheckboxes += `<label style="display:block;font-size:12px;padding:2px 0;cursor:pointer;"><input type="checkbox" name="bulkS" value="${s.id}"> ${s.is_commander ? '🎖️' : ''}${s.name}</label>`; });
        let reasonOptions = '';
        AttendanceData.LEAVE_REASONS.forEach(r => { reasonOptions += `<option value="${r.id}">${r.label}</option>`; });

        const html = `<h2>📋 היעדרות קבוצתית</h2>
            <div class="form-group"><label>בחר חיילים:</label>
                <div style="max-height:200px;overflow-y:auto;border:2px solid #ddd;border-radius:8px;padding:8px;">
                    <label style="font-weight:700;cursor:pointer;margin-bottom:5px;display:block;">
                        <input type="checkbox" id="bulkSelectAll" onchange="document.querySelectorAll('input[name=bulkS]').forEach(c=>c.checked=document.getElementById('bulkSelectAll').checked)"> בחר הכל</label>
                    ${soldiersCheckboxes}</div></div>
            <div class="form-group"><label>סיבה:</label><select id="dlgBReason">${reasonOptions}</select></div>
            <div class="form-row">
                <div class="form-group"><label>מתאריך:</label><input type="date" id="dlgBStart" value="${today}"></div>
                <div class="form-group"><label>שעת יציאה:</label><input type="time" id="dlgBStartTime" value="${settings.defaultLeaveTime || '14:00'}"></div>
            </div><div class="form-row">
                <div class="form-group"><label>עד תאריך:</label><input type="date" id="dlgBEnd" value="${today}"></div>
                <div class="form-group"><label>שעת חזרה:</label><input type="time" id="dlgBEndTime" value="${settings.defaultReturnTime || '17:00'}"></div>
            </div>
            <div class="form-actions"><button class="btn btn-purple" onclick="AttendanceUI.saveBulkLeave()">💾 שמור</button>
                <button class="btn btn-purple-light" onclick="App.closeDialog()">❌ ביטול</button></div>`;
        App.openDialog(html);
    },

    saveBulkLeave() {
        const selected = [...document.querySelectorAll('input[name=bulkS]:checked')].map(c => c.value);
        if (!selected.length) { Toast.show('בחר חיילים!', 'error'); return; }
        const sd = document.getElementById('dlgBStart').value;
        const ed = document.getElementById('dlgBEnd').value;
        if (!sd || !ed) { Toast.show('חובה תאריכים!', 'error'); return; }
        const reason = document.getElementById('dlgBReason').value;
        const st = document.getElementById('dlgBStartTime').value || null;
        const et = document.getElementById('dlgBEndTime').value || null;
        selected.forEach(sid => { AttendanceData.addLeave({ soldier_id: sid, reason, start_date: sd, start_time: st, end_date: ed, end_time: et, notes: '' }); });
        Toast.show(`${selected.length} היעדרויות נוספו`, 'success');
        document.getElementById('dialogOverlay').style.display = 'none';
        this._refreshAllPlatoons();
        this.refreshDashboard();
    },

    // ==================== IMPORT ====================
    importSoldiersForPlatoon(pid) {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.xlsx,.xls,.csv';
        input.onchange = e => {
            AttendanceData.importSoldiersFromExcel(e.target.files[0], pid)
                .then(count => { Toast.show(`יובאו ${count} חיילים`, 'success'); this._refreshAllPlatoons(); })
                .catch(err => { Toast.show('שגיאה: ' + err.message, 'error'); });
        };
        input.click();
    },

    // ==================== RESETS ====================
    resetPlatoonSoldiers(pid) {
        const pl = AttendanceData.loadPlatoons().find(p => p.id === pid);
        if (!confirm(`למחוק כל חיילי ${pl ? pl.name : ''}?`)) return;
        const sIds = AttendanceData.loadSoldiers().filter(s => s.platoon_id === pid).map(s => s.id);
        AttendanceData.saveSoldiers(AttendanceData.loadSoldiers().filter(s => s.platoon_id !== pid));
        AttendanceData.saveLeaves(AttendanceData.loadLeaves().filter(l => !sIds.includes(l.soldier_id)));
        Toast.show('נמחקו', 'warning');
        this._refreshAllPlatoons();
    },

    resetPlatoonLeaves(pid) {
        const pl = AttendanceData.loadPlatoons().find(p => p.id === pid);
        if (!confirm(`למחוק חופשות ${pl ? pl.name : ''}?`)) return;
        AttendanceData.deleteLeavesForPlatoon(pid);
        Toast.show('נמחקו', 'warning');
        this._refreshAllPlatoons();
    },

    // ==================== HELPERS ====================
    _refreshAllPlatoons() {
        AttendanceData.loadPlatoons().forEach(pl => {
            const range = this.getPlRange(pl.id);
            if (range.start && range.end) this.refreshPlatoonTab(pl.id);
        });
    },

    loadSettingsUI() {
        // Handled by SettingsUI module
    }
};

// ========== ui-assignment.js ========== //
/**
 * AssignmentUI - UI מודול שיבוץ
 * SunDay v3.0
 *
 * שינוי 1: תצוגה מחלקתית עם טאבים פנימיים
 * שינוי 2: שיבוץ מחלקתי + סנכרון
 * שינוי 3: ולידציה טווח תאריכים
 * שינוי 4: סנכרון תפקידים + תצוגת תגי תפקידים
 * שינוי 5: שיוך עמדות למחלקה/פלוגה + רוטציה
 */
const AssignmentUI = {

    _currentInnerTab: {
        soldiers: null,
        positions: null,
        schedule: null,
        workload: null
    },

    refreshCurrentTab() {
        this.refreshSoldiers();
        this.refreshPositions();
    },

    // ==================== INNER PLATOON TABS (שינוי 1) ====================
    buildInnerPlatoonTabs(containerId, panesContainerId, section, options) {
        const platoons = AttendanceData.loadPlatoons();
        const tabsC = document.getElementById(containerId);
        const panesC = document.getElementById(panesContainerId);
        if (!tabsC) return;

        let tabsHTML = '';
        const showCompany = options?.showCompany !== false;

        platoons.forEach((pl, idx) => {
            const activeClass = idx === 0 ? ' active' : '';
            tabsHTML += `<button class="inner-platoon-tab${activeClass}" data-platoon-id="${pl.id}" data-section="${section}" onclick="AssignmentUI.switchInnerPlatoonTab('${section}','${pl.id}')"><span class="platoon-dot" style="background:${pl.color}"></span>${pl.name}</button>`;
        });

        if (showCompany) {
            tabsHTML += `<button class="inner-platoon-tab tab-company" data-platoon-id="company" data-section="${section}" onclick="AssignmentUI.switchInnerPlatoonTab('${section}','company')">🏛️ פלוגתי</button>`;
        }

        tabsC.innerHTML = tabsHTML;

        if (!this._currentInnerTab[section]) {
            this._currentInnerTab[section] = platoons.length > 0 ? platoons[0].id : null;
        }
    },

    switchInnerPlatoonTab(section, platoonId) {
        this._currentInnerTab[section] = platoonId;

        const sectionMap = {
            soldiers: 'asgnSoldiersPlatoonTabs',
            positions: 'asgnPositionsPlatoonTabs',
            schedule: 'asgnSchedulePlatoonTabs',
            workload: 'asgnWorkloadPlatoonTabs'
        };

        const containerId = sectionMap[section];
        if (containerId) {
            const container = document.getElementById(containerId);
            if (container) {
                container.querySelectorAll('.inner-platoon-tab').forEach(tab => {
                    tab.classList.toggle('active', tab.dataset.platoonId === platoonId);
                });
            }
        }

        if (section === 'soldiers') this._renderSoldiersForPlatoon(platoonId);
        if (section === 'positions') this._renderPositionsForPlatoon(platoonId);
        if (section === 'schedule') this._renderScheduleForPlatoon(platoonId);
        if (section === 'workload') this._renderWorkloadForPlatoon(platoonId);
    },

    // ==================== SYNC ====================
    syncFromAttendance() {
        const result = Bridge.syncSoldiers();
        Toast.show(`🔄 סנכרון: +${result.added} חדשים, -${result.deactivated} הוסרו (סה"כ ${result.total})`, 'success');
        this.refreshSoldiers();
    },

    // ==================== SOLDIERS (שינוי 1,4) ====================
    refreshSoldiers() {
        this.buildInnerPlatoonTabs('asgnSoldiersPlatoonTabs', 'asgnSoldiersPlatoonPanes', 'soldiers', { showCompany: true });
        const currentPl = this._currentInnerTab.soldiers;
        if (currentPl) this._renderSoldiersForPlatoon(currentPl);
    },

    _renderSoldiersForPlatoon(platoonId) {
        const panesC = document.getElementById('asgnSoldiersPlatoonPanes');
        if (!panesC) return;

        const allSoldiers = AssignmentData.loadSoldiers();
        let soldiers;
        if (platoonId === 'company') {
            soldiers = allSoldiers.filter(s => s.is_active !== false);
        } else {
            soldiers = allSoldiers.filter(s => s.platoon_id === platoonId && s.is_active !== false);
        }

        const today = new Date().toISOString().split('T')[0];
        const statusList = Bridge.getAllSoldiersStatus(today, platoonId === 'company' ? null : platoonId);
        const statusMap = {};
        statusList.forEach(s => { statusMap[s.name] = s; });

        const info = document.getElementById('asgnSoldiersInfo');
        if (info) {
            info.classList.add('visible');
            info.textContent = `ℹ️ ${soldiers.length} חיילים פעילים. שדות שיבוץ (ימים חסומים, עמדות מועדפות) נערכים כאן.`;
        }

        if (soldiers.length === 0) {
            panesC.innerHTML = '<p style="text-align:center;color:#999;padding:30px;">אין חיילים. לחץ "סנכרן מנוכחות".</p>';
            return;
        }

        const sorted = soldiers.slice().sort((a, b) => {
            if (a.is_commander && !b.is_commander) return -1;
            if (!a.is_commander && b.is_commander) return 1;
            return (a.name || '').localeCompare(b.name || '');
        });

        let html = '<div class="table-container"><table class="data-table"><thead><tr><th>שם</th><th>מחלקה</th><th>דרגה</th><th>מפקד</th><th>תפקידים</th><th>נוכח היום</th><th>ימים חסומים</th><th>עמדות מועדפות</th><th>פעולות</th></tr></thead><tbody>';

        sorted.forEach(s => {
            const status = statusMap[s.name];
            const availBadge = status
                ? (status.available ? '<span style="color:#27ae60;font-weight:700;">✅ נוכח</span>' : `<span style="color:#e74c3c;font-weight:700;">❌ ${status.reason || 'נעדר'}</span>`)
                : '<span style="color:#999;">—</span>';
            const blockedDaysStr = (s.blocked_days || []).join(', ') || '-';
            const prefStr = (s.preferred_positions || []).join(', ') || '-';
            const cmdIcon = s.is_commander === 'commander' ? '🎖️ ' : s.is_commander === 'vice_commander' ? '⭐ ' : '';
            const cmdStyle = s.is_commander ? ' style="background:#fffbeb;"' : '';

            // שינוי 9: תצוגת מפקד
            let cmdLevelHtml = '';
            if (s.is_commander === 'commander') {
                cmdLevelHtml = '<span class="cmd-level-badge cmd-commander">🎖️ מפקד</span>';
            } else if (s.is_commander === 'vice_commander') {
                cmdLevelHtml = '<span class="cmd-level-badge cmd-vice">⭐ מ"כ</span>';
            } else {
                cmdLevelHtml = '<span style="color:#999;">חייל</span>';
            }

            // שינוי 4: תגי תפקידים
            let rolesHtml = '';
            if (s.roles && s.roles.length > 0) {
                rolesHtml = '<div class="role-tags-cell">';
                s.roles.forEach(role => {
                    rolesHtml += `<span class="role-tag tag-role">${role}</span>`;
                });
                if (s.is_commander) rolesHtml += '<span class="role-tag tag-commander">🎖️ מפקד</span>';
                rolesHtml += '</div>';
            } else if (s.is_commander) {
                rolesHtml = '<span class="role-tag tag-commander">🎖️ מפקד</span>';
            } else {
                rolesHtml = '-';
            }

            html += `<tr${cmdStyle}>
                <td><strong>${cmdIcon}${s.name}</strong></td>
                <td style="font-size:11px;">${s.platoon_name || '-'}</td>
                <td>${s.rank || '-'}</td>
                <td>${cmdLevelHtml}</td>
                <td>${rolesHtml}</td>
                <td>${availBadge}</td>
                <td style="font-size:11px;">${blockedDaysStr}</td>
                <td style="font-size:11px;">${prefStr}</td>
                <td><button class="btn-icon" onclick="AssignmentUI.openEditAsgnSoldierDialog('${s.id}')">✏️</button></td></tr>`;
        });

        html += '</tbody></table></div>';
        panesC.innerHTML = html;
    },

    openEditAsgnSoldierDialog(id) {
        const soldier = AssignmentData.loadSoldiers().find(s => s.id === id);
        if (!soldier) return;
        const positions = AssignmentData.loadPositions();
        const days = AssignmentData.DAYS_HEB;

        let blockedHTML = '';
        (soldier.blocked_dates || []).forEach((bd, i) => {
            blockedHTML += `<div class="blocked-date-item" id="abd-${i}"><span>${bd.date} ${bd.start_hour || '0'}:00-${bd.end_hour || '24'}:00</span><button onclick="document.getElementById('abd-${i}').remove()">✕</button></div>`;
        });

        const html = `<h2>✏️ עריכת שדות שיבוץ - ${soldier.name}</h2>
            <div class="form-group"><label>ימים חסומים:</label>
                <div class="day-checkboxes">${days.map(d => `<label class="day-checkbox"><input type="checkbox" name="asgnBlockedDay" value="${d}" ${(soldier.blocked_days || []).includes(d) ? 'checked' : ''}>${d}</label>`).join('')}</div></div>
            <div class="form-group"><label>תאריכים חסומים:</label>
                <div class="blocked-dates-list" id="asgnBlockedDatesList">${blockedHTML}</div>
                <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
                    <input type="date" id="asgnNewBDate" style="width:auto;">
                    <input type="number" id="asgnNewBStart" placeholder="שעה מ" min="0" max="23" style="width:80px;">
                    <input type="number" id="asgnNewBEnd" placeholder="שעה עד" min="0" max="24" style="width:80px;">
                    <button class="btn btn-sm btn-warning" onclick="AssignmentUI.addAsgnBlockedDate()">➕</button>
                </div></div>
            <div class="form-group"><label>עמדות מועדפות:</label>
                <div class="day-checkboxes">${positions.map(p => `<label class="day-checkbox"><input type="checkbox" name="asgnPrefPos" value="${p.name}" ${(soldier.preferred_positions || []).includes(p.name) ? 'checked' : ''}>${p.name}</label>`).join('')}</div></div>
            <div class="form-actions">
                <button class="btn btn-purple" onclick="AssignmentUI.saveAsgnSoldier('${soldier.id}')">💾 שמור</button>
                <button class="btn btn-purple-light" onclick="App.closeDialog()">❌ ביטול</button></div>`;
        App.openDialog(html);
    },

    addAsgnBlockedDate() {
        const d = document.getElementById('asgnNewBDate');
        if (!d.value) { Toast.show('בחר תאריך', 'warning'); return; }
        const p = d.value.split('-');
        const dateStr = `${p[2]}/${p[1]}/${p[0]}`;
        const s = document.getElementById('asgnNewBStart').value || '0';
        const e = document.getElementById('asgnNewBEnd').value || '24';
        const list = document.getElementById('asgnBlockedDatesList');
        const idx = list.children.length;
        const div = document.createElement('div');
        div.className = 'blocked-date-item'; div.id = `abd-${idx}`;
        div.innerHTML = `<span>${dateStr} ${s}:00-${e}:00</span><button onclick="this.parentElement.remove()">✕</button>`;
        list.appendChild(div);
        d.value = '';
    },

    saveAsgnSoldier(id) {
        const blockedDays = [...document.querySelectorAll('input[name="asgnBlockedDay"]:checked')].map(c => c.value);
        const prefPositions = [...document.querySelectorAll('input[name="asgnPrefPos"]:checked')].map(c => c.value);
        const blockedDates = [...document.querySelectorAll('#asgnBlockedDatesList .blocked-date-item span')].map(span => {
            const parts = span.textContent.trim().split(' ');
            const times = parts[1] ? parts[1].split('-') : ['0:00', '24:00'];
            return { date: parts[0], start_hour: parseInt(times[0]), end_hour: parseInt(times[1]) };
        });
        AssignmentData.updateSoldier(id, { blocked_days: blockedDays, blocked_dates: blockedDates, preferred_positions: prefPositions });
        document.getElementById('dialogOverlay').style.display = 'none';
        this.refreshSoldiers();
        Toast.show('שדות שיבוץ עודכנו', 'success');
    },

    // ==================== POSITIONS (שינוי 1,5) ====================
    refreshPositions() {
        this.buildInnerPlatoonTabs('asgnPositionsPlatoonTabs', 'asgnPositionsPlatoonPanes', 'positions', { showCompany: true });
        const currentPl = this._currentInnerTab.positions;
        if (currentPl) this._renderPositionsForPlatoon(currentPl);
    },

    _renderPositionsForPlatoon(platoonId) {
        const panesC = document.getElementById('asgnPositionsPlatoonPanes');
        if (!panesC) return;
        const allPositions = AssignmentData.loadPositions();
        const platoons = AttendanceData.loadPlatoons();

        let positions;
        if (platoonId === 'company') {
            positions = allPositions;
        } else {
            positions = allPositions.filter(p => {
                if (p.assignment_level === 'platoon' && p.platoon_id === platoonId) return true;
                if (p.assignment_level === 'company') return true;
                if (!p.assignment_level && !p.platoon_id) return true;
                return false;
            });
        }

        if (positions.length === 0) {
            panesC.innerHTML = '<div class="table-container"><p style="text-align:center;color:#999;padding:30px;">אין עמדות.</p></div>';
            return;
        }

        let html = '<div class="table-container"><table class="data-table"><thead><tr><th>שם עמדה</th><th>שיוך</th><th>מחלקה/רוטציה</th><th>מספר חיילים</th><th>אורך משמרת</th><th>שעות פעילות</th><th>ימים פעילים</th><th>דרישות</th><th>עדיפות</th><th>פעילה</th><th>פעולות</th></tr></thead><tbody>';

        positions.forEach(pos => {
            const inactiveClass = pos.is_active === false ? ' class="inactive-row"' : '';
            const h = `${AssignmentData.formatHour(pos.active_hours_start || 0)}-${AssignmentData.formatHour(pos.active_hours_end || 24)}`;
            const d = (pos.active_days || [0, 1, 2, 3, 4, 5, 6]).map(x => AssignmentData.DAYS_HEB[x]).join(', ');

            // שיוך - inline editable only in company view, read-only badge in platoon view
            const level = pos.assignment_level || 'platoon';
            const isCompanyView = platoonId === 'company';
            let levelCell, platoonInfo;

            if (isCompanyView) {
                levelCell = `<select class="inline-select level-select" data-pos-id="${pos.id}" onchange="AssignmentUI._inlineChangeLevel('${pos.id}', this.value)">
                    <option value="platoon"${level === 'platoon' ? ' selected' : ''}>📍 מחלקתי</option>
                    <option value="company"${level === 'company' ? ' selected' : ''}>🏛️ פלוגתי</option>
                </select>`;

                if (level === 'platoon') {
                    let platoonSelect = `<select class="inline-select platoon-select" data-pos-id="${pos.id}" onchange="AssignmentUI._inlineChangePlatoon('${pos.id}', this.value)">`;
                    platoonSelect += `<option value="">-- בחר --</option>`;
                    platoons.forEach(p => {
                        const sel = pos.platoon_id === p.id ? ' selected' : '';
                        platoonSelect += `<option value="${p.id}"${sel} style="color:${p.color};">${p.name}</option>`;
                    });
                    platoonSelect += `</select>`;
                    platoonInfo = platoonSelect;
                } else if (level === 'company' && pos.rotation) {
                    const rotType = pos.rotation.type === 'hours' ? 'שעות' : pos.rotation.type === 'days' ? 'ימים' : 'תאריכים';
                    platoonInfo = `<div class="rotation-info">רוטציה לפי ${rotType}</div>`;
                    if (pos.rotation.schedule) {
                        platoonInfo += '<div class="rotation-schedule-mini">';
                        pos.rotation.schedule.slice(0, 3).forEach(slot => {
                            const pl = platoons.find(p => p.id === slot.platoon_id);
                            const plName = pl ? pl.name : '?';
                            const plColor = pl ? pl.color : '#999';
                            let label = plName;
                            if (pos.rotation.type === 'hours') label = `${slot.start}-${slot.end}`;
                            if (pos.rotation.type === 'days') label = (slot.days || []).map(d => AssignmentData.DAYS_HEB[d]?.substr(0, 1)).join('');
                            platoonInfo += `<span class="rotation-chip" style="background:${plColor}22;color:${plColor};border-color:${plColor}">${label}: ${plName}</span>`;
                        });
                        platoonInfo += '</div>';
                    }
                } else {
                    platoonInfo = `<span style="color:#999;font-size:11px;">ללא רוטציה</span>`;
                }
            } else {
                // Platoon view - read-only badges
                levelCell = level === 'company'
                    ? '<span class="pos-level-badge level-company">🏛️ פלוגתי</span>'
                    : '<span class="pos-level-badge level-platoon">📍 מחלקתי</span>';

                if (level === 'platoon' && pos.platoon_id) {
                    const pl = platoons.find(p => p.id === pos.platoon_id);
                    platoonInfo = pl ? `<span style="color:${pl.color};font-weight:700;">${pl.name}</span>` : pos.platoon_id;
                } else if (level === 'company') {
                    platoonInfo = '<span style="color:#999;font-size:11px;">פלוגתי</span>';
                } else {
                    platoonInfo = '-';
                }
            }

            html += `<tr${inactiveClass}>
                <td><strong>${pos.name}</strong></td>
                <td class="pos-assignment-cell">${levelCell}</td>
                <td class="pos-rotation-cell">${platoonInfo}</td>
                <td>${pos.soldiers_required}</td>
                <td>${pos.shift_duration_hours}h</td>
                <td>${h}</td>
                <td style="font-size:11px;">${d}</td>
                <td>${(() => {
                    const cmdCount = pos.required_commanders_count || 1;
                    const roleCount = pos.required_role_count || 1;
                    let cmdBadge = '';
                    if (pos.requires_commander === 'commander') cmdBadge = `<span class="cmd-req-badge cmd-req-commander">🎖️ מפקד${cmdCount > 1 ? ' ×' + cmdCount : ''}</span>`;
                    else if (pos.requires_commander === 'vice_commander') cmdBadge = `<span class="cmd-req-badge cmd-req-vice">⭐ מ"כ+${cmdCount > 1 ? ' ×' + cmdCount : ''}</span>`;
                    let roleBadge = pos.required_role ? `<span class="role-req-badge">📌 ${pos.required_role}${roleCount > 1 ? ' ×' + roleCount : ''}</span>` : '';
                    return cmdBadge + roleBadge || '<span style="color:#999;">-</span>';
                })()}</td>
                <td>${pos.priority || 0}</td>
                <td><button class="btn-toggle ${pos.is_active !== false ? 'active' : 'inactive'}" onclick="AssignmentUI.togglePosition('${pos.id}')">${pos.is_active !== false ? '✅' : '❌'}</button></td>
                <td>
                    <button class="btn-icon" onclick="AssignmentUI.openEditPositionDialog('${pos.id}')">✏️</button>
                    <button class="btn-icon" onclick="AssignmentUI.deletePosition('${pos.id}')">🗑️</button>
                </td></tr>`;
        });

        html += '</tbody></table></div>';
        panesC.innerHTML = html;
    },

    togglePosition(id) {
        const p = AssignmentData.loadPositions().find(x => x.id === id);
        if (p) { AssignmentData.updatePosition(id, { is_active: p.is_active === false }); this.refreshPositions(); }
    },

    deletePosition(id) {
        if (confirm('למחוק עמדה?')) { AssignmentData.deletePosition(id); this.refreshPositions(); }
    },

    /**
     * Inline change assignment level from positions table
     */
    _inlineChangeLevel(posId, newLevel) {
        const updates = { assignment_level: newLevel };
        if (newLevel === 'company') {
            updates.platoon_id = null;
        }
        AssignmentData.updatePosition(posId, updates);
        this.refreshPositions();
        Toast.show(`שיוך עודכן ל-${newLevel === 'company' ? 'פלוגתי' : 'מחלקתי'}`, 'info');
    },

    /**
     * Inline change platoon assignment from positions table
     */
    _inlineChangePlatoon(posId, platoonId) {
        AssignmentData.updatePosition(posId, { platoon_id: platoonId || null });
        const pl = AttendanceData.loadPlatoons().find(p => p.id === platoonId);
        Toast.show(`עמדה שויכה ל-${pl ? pl.name : 'ללא'}`, 'info');
    },

    openAddPositionDialog() { this._positionDialog(null); },
    openEditPositionDialog(id) { const p = AssignmentData.loadPositions().find(x => x.id === id); if (p) this._positionDialog(p); },

    _positionDialog(pos) {
        const isEdit = !!pos;
        const days = AssignmentData.DAYS_HEB;
        const platoons = AttendanceData.loadPlatoons();
        const ad = pos ? (pos.active_days || [0, 1, 2, 3, 4, 5, 6]) : [0, 1, 2, 3, 4, 5, 6];
        const level = pos ? (pos.assignment_level || 'platoon') : 'platoon';

        let platoonOptions = '<option value="">-- בחר --</option>';
        platoons.forEach(p => {
            const sel = pos && pos.platoon_id === p.id ? ' selected' : '';
            platoonOptions += `<option value="${p.id}"${sel}>${p.name}</option>`;
        });

        // Rotation HTML
        let rotationHTML = '';
        if (pos && pos.rotation && pos.rotation.schedule) {
            pos.rotation.schedule.forEach((slot, idx) => {
                const pl = platoons.find(p => p.id === slot.platoon_id);
                rotationHTML += `<div class="rotation-row" id="rotRow_${idx}">
                    <span class="platoon-label">${pl ? pl.name : '?'}</span>`;
                if (pos.rotation.type === 'hours') {
                    rotationHTML += `<input type="time" value="${slot.start || '00:00'}"> - <input type="time" value="${slot.end || '08:00'}">`;
                } else if (pos.rotation.type === 'days') {
                    rotationHTML += (slot.days || []).map(d => AssignmentData.DAYS_HEB[d]).join(', ');
                }
                rotationHTML += '</div>';
            });
        }

        const html = `<h2>${isEdit ? '✏️ עריכת עמדה' : '➕ הוספת עמדה'}</h2>
            <div class="form-group"><label>שם:</label><input type="text" id="dlgPosName" value="${pos?.name || ''}"></div>
            <div class="form-row">
                <div class="form-group"><label>חיילים:</label><input type="number" id="dlgPosSoldiers" value="${pos?.soldiers_required || 1}" min="1"></div>
                <div class="form-group"><label>אורך משמרת (שעות):</label><input type="number" id="dlgPosDur" value="${pos?.shift_duration_hours || 4}" min="1" max="24"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>שעת התחלה:</label><input type="number" id="dlgPosStart" value="${pos?.active_hours_start || 0}" min="0" max="23"></div>
                <div class="form-group"><label>שעת סיום:</label><input type="number" id="dlgPosEnd" value="${pos?.active_hours_end || 24}" min="0" max="24"></div>
            </div>
            <div class="form-group"><label>ימים פעילים:</label>
                <div class="day-checkboxes">${days.map((d, i) => `<label class="day-checkbox"><input type="checkbox" name="asgnActiveDay" value="${i}" ${ad.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div></div>
            <div class="form-group"><label>עדיפות:</label><input type="number" id="dlgPosPri" value="${pos?.priority || 0}" min="0"></div>

            <!-- שינוי 9: דרישת מפקד בעמדה -->
            <div class="form-group"><label>🎖️ דרישת דרג פיקוד:</label>
                <select id="dlgPosReqCmd" onchange="AssignmentUI.onReqCmdChange()">
                    <option value="none"${(pos?.requires_commander || 'none') === 'none' ? ' selected' : ''}>ללא דרישה</option>
                    <option value="commander"${pos?.requires_commander === 'commander' ? ' selected' : ''}>🎖️ מפקד (חובה)</option>
                    <option value="vice_commander"${pos?.requires_commander === 'vice_commander' ? ' selected' : ''}>⭐ מ"כ או מפקד (חובה)</option>
                </select></div>
            <div class="form-group" id="dlgPosReqCmdCountWrap" style="${(pos?.requires_commander && pos?.requires_commander !== 'none') ? '' : 'display:none;'}"><label>🎖️ כמה נדרשים:</label>
                <input type="number" id="dlgPosReqCmdCount" value="${pos?.required_commanders_count || 1}" min="1" max="20"></div>

            <!-- שינוי 10: דרישת תפקיד בעמדה -->
            <div class="form-group"><label>📌 תפקיד נדרש:</label>
                <select id="dlgPosReqRole" onchange="AssignmentUI.onReqRoleChange()">
                    <option value=""${ !pos?.required_role ? ' selected' : ''}>ללא דרישה</option>
                    ${(() => { const settings = AttendanceData.loadSettings(); return (settings.roles || []).map(r => `<option value="${r.name}"${pos?.required_role === r.name ? ' selected' : ''}>📌 ${r.name}</option>`).join(''); })()}
                </select></div>
            <div class="form-group" id="dlgPosReqRoleCountWrap" style="${pos?.required_role ? '' : 'display:none;'}"><label>📌 כמה נדרשים:</label>
                <input type="number" id="dlgPosReqRoleCount" value="${pos?.required_role_count || 1}" min="1" max="20"></div>

            <!-- שינוי 5: שיוך עמדה -->
            <div class="form-group"><label>שיוך עמדה:</label>
                <select id="dlgPosLevel" onchange="AssignmentUI.onPositionLevelChange()">
                    <option value="platoon"${level === 'platoon' ? ' selected' : ''}>📍 מחלקתי</option>
                    <option value="company"${level === 'company' ? ' selected' : ''}>🏛️ פלוגתי</option>
                </select></div>

            <div id="dlgPosPlatoonSection" style="${level === 'platoon' ? '' : 'display:none;'}">
                <div class="form-group"><label>מחלקה:</label><select id="dlgPosPlatoon">${platoonOptions}</select></div>
            </div>

            <div id="dlgPosRotationSection" class="rotation-section" style="${level === 'company' ? '' : 'display:none;'}">
                <h4>🔄 הגדרת רוטציה</h4>
                <div class="form-group"><label>סוג רוטציה:</label>
                    <div class="rotation-type-selector">
                        <div class="rotation-type-btn${pos?.rotation?.type === 'hours' || !pos?.rotation ? ' selected' : ''}" onclick="AssignmentUI.selectRotationType('hours',this)" data-type="hours">⏰ שעות</div>
                        <div class="rotation-type-btn${pos?.rotation?.type === 'days' ? ' selected' : ''}" onclick="AssignmentUI.selectRotationType('days',this)" data-type="days">📅 ימים</div>
                        <div class="rotation-type-btn${pos?.rotation?.type === 'dates' ? ' selected' : ''}" onclick="AssignmentUI.selectRotationType('dates',this)" data-type="dates">🗓️ תאריכים</div>
                    </div></div>
                <div id="dlgPosRotationSchedule" class="rotation-schedule-editor">
                    ${rotationHTML || '<p style="color:#999;font-size:12px;">בחר סוג רוטציה ולחץ "הוסף" להגדרת חלוקה</p>'}
                </div>
                <button class="btn btn-sm btn-purple-light" onclick="AssignmentUI.addRotationSlot()" style="margin-top:8px;">➕ הוסף חלוקה</button>
            </div>

            <div class="form-actions">
                <button class="btn btn-purple" onclick="AssignmentUI.savePosition('${pos?.id || ''}')">💾 שמור</button>
                ${!isEdit ? '<button class="btn btn-success" onclick="AssignmentUI.savePosition(\'\', true)">➕ שמור והוסף עוד</button>' : ''}
                <button class="btn btn-purple-light" onclick="App.closeDialog()">❌ ביטול</button></div>`;
        App.openDialog(html);
    },

    onPositionLevelChange() {
        const level = document.getElementById('dlgPosLevel').value;
        document.getElementById('dlgPosPlatoonSection').style.display = level === 'platoon' ? '' : 'none';
        document.getElementById('dlgPosRotationSection').style.display = level === 'company' ? '' : 'none';
    },

    onReqCmdChange() {
        const val = document.getElementById('dlgPosReqCmd').value;
        document.getElementById('dlgPosReqCmdCountWrap').style.display = (val && val !== 'none') ? '' : 'none';
    },

    onReqRoleChange() {
        const val = document.getElementById('dlgPosReqRole').value;
        document.getElementById('dlgPosReqRoleCountWrap').style.display = val ? '' : 'none';
    },

    selectRotationType(type, btn) {
        document.querySelectorAll('.rotation-type-btn').forEach(b => b.classList.remove('selected'));
        if (btn) btn.classList.add('selected');
        document.getElementById('dlgPosRotationSchedule').innerHTML = '<p style="color:#999;font-size:12px;">לחץ "הוסף חלוקה" להגדרת רוטציה</p>';
    },

    addRotationSlot() {
        const platoons = AttendanceData.loadPlatoons();
        const container = document.getElementById('dlgPosRotationSchedule');
        if (container.querySelector('p')) container.innerHTML = '';
        const typeBtn = document.querySelector('.rotation-type-btn.selected');
        const type = typeBtn ? typeBtn.dataset.type : 'hours';
        const idx = container.children.length;

        let platoonSelect = `<select name="rotPlatoon_${idx}">`;
        platoons.forEach(p => { platoonSelect += `<option value="${p.id}">${p.name}</option>`; });
        platoonSelect += '</select>';

        let fields = '';
        if (type === 'hours') {
            fields = `<input type="time" name="rotStart_${idx}" value="00:00"> - <input type="time" name="rotEnd_${idx}" value="08:00">`;
        } else if (type === 'days') {
            fields = AssignmentData.DAYS_HEB.map((d, i) => `<label style="font-size:10px;"><input type="checkbox" name="rotDays_${idx}" value="${i}"> ${d.substr(0, 2)}</label>`).join(' ');
        } else {
            fields = `<input type="date" name="rotDateStart_${idx}"> - <input type="date" name="rotDateEnd_${idx}">`;
        }

        const row = document.createElement('div');
        row.className = 'rotation-row';
        row.innerHTML = `${platoonSelect} ${fields} <button class="btn btn-danger btn-xs" onclick="this.parentElement.remove()">✕</button>`;
        container.appendChild(row);
    },

    savePosition(id, addAnother) {
        const name = document.getElementById('dlgPosName').value.trim();
        if (!name) { Toast.show('חובה שם!', 'error'); return; }
        const activeDays = [...document.querySelectorAll('input[name="asgnActiveDay"]:checked')].map(c => parseInt(c.value));
        const level = document.getElementById('dlgPosLevel').value;

        const data = {
            name,
            soldiers_required: parseInt(document.getElementById('dlgPosSoldiers').value) || 1,
            shift_duration_hours: parseInt(document.getElementById('dlgPosDur').value) || 4,
            active_hours_start: parseInt(document.getElementById('dlgPosStart').value) || 0,
            active_hours_end: parseInt(document.getElementById('dlgPosEnd').value) || 24,
            active_days: activeDays,
            priority: parseInt(document.getElementById('dlgPosPri').value) || 0,
            assignment_level: level,
            platoon_id: level === 'platoon' ? (document.getElementById('dlgPosPlatoon').value || null) : null,
            requires_commander: document.getElementById('dlgPosReqCmd').value || 'none',
            required_commanders_count: parseInt(document.getElementById('dlgPosReqCmdCount').value) || 1,
            required_role: document.getElementById('dlgPosReqRole').value || '',
            required_role_count: parseInt(document.getElementById('dlgPosReqRoleCount').value) || 1,
            rotation: null
        };

        // שינוי 5: שמירת רוטציה
        if (level === 'company') {
            const typeBtn = document.querySelector('.rotation-type-btn.selected');
            const rotType = typeBtn ? typeBtn.dataset.type : 'hours';
            const schedule = [];
            const container = document.getElementById('dlgPosRotationSchedule');
            const rows = container.querySelectorAll('.rotation-row');

            rows.forEach((row, idx) => {
                const platoonSel = row.querySelector(`[name="rotPlatoon_${idx}"]`);
                const platoonId = platoonSel ? platoonSel.value : null;
                if (!platoonId) return;

                if (rotType === 'hours') {
                    const start = row.querySelector(`[name="rotStart_${idx}"]`)?.value || '00:00';
                    const end = row.querySelector(`[name="rotEnd_${idx}"]`)?.value || '08:00';
                    schedule.push({ platoon_id: platoonId, start, end });
                } else if (rotType === 'days') {
                    const dayChecks = row.querySelectorAll(`[name="rotDays_${idx}"]:checked`);
                    const days = [...dayChecks].map(c => parseInt(c.value));
                    schedule.push({ platoon_id: platoonId, days });
                } else if (rotType === 'dates') {
                    const startDate = row.querySelector(`[name="rotDateStart_${idx}"]`)?.value || '';
                    const endDate = row.querySelector(`[name="rotDateEnd_${idx}"]`)?.value || '';
                    schedule.push({ platoon_id: platoonId, start_date: startDate, end_date: endDate });
                }
            });

            if (schedule.length > 0) {
                data.rotation = { type: rotType, schedule };
            }
        }

        if (id) AssignmentData.updatePosition(id, data); else AssignmentData.addPosition(data);

        if (addAnother && !id) {
            // Clear fields for next entry, keep dialog open
            document.getElementById('dlgPosName').value = '';
            document.getElementById('dlgPosSoldiers').value = '1';
            document.getElementById('dlgPosPri').value = '0';
            document.getElementById('dlgPosName').focus();
            this.refreshPositions();
            Toast.show(`✅ ${name} נוספה`, 'success');
        } else {
            document.getElementById('dialogOverlay').style.display = 'none';
            this.refreshPositions();
            Toast.show(id ? 'עמדה עודכנה' : 'עמדה נוספה', 'success');
        }
    },

    importPositionsFromFile() {
        if (!XLSXLoader.check()) return;
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.xlsx,.xls,.csv';
        input.onchange = async (e) => {
            try {
                const result = await AssignmentData.importPositionsFromExcel(e.target.files[0]);
                Toast.show(`✅ יובאו ${result.added} עמדות`, 'success');
                this.refreshPositions();
            } catch (err) { Toast.show('שגיאה: ' + err.message, 'error'); }
        };
        input.click();
    },

    // ==================== SCHEDULE (שינוי 2,3) ====================
    generateSchedule() {
        const dateInput = document.getElementById('asgnScheduleStartDate');
        if (!dateInput.value) { Toast.show('בחר תאריך!', 'warning'); return; }

        // שינוי 3: ולידציה
        const asgnRange = AssignmentData.getAssignmentRange();
        if (dateInput.value < asgnRange.start || dateInput.value > asgnRange.end) {
            Toast.show(`⚠️ תאריך חייב להיות בטווח ${AttendanceData.formatDisplay(asgnRange.start)} - ${AttendanceData.formatDisplay(asgnRange.end)}`, 'error');
            return;
        }

        Bridge.syncSoldiers();

        let numDays = parseInt(document.getElementById('asgnScheduleDays').value) || 7;

        // שינוי 2: שיבוץ מחלקתי - אם יש טאב מחלקתי פעיל
        const currentPl = this._currentInnerTab.schedule;
        const platoonId = (currentPl && currentPl !== 'company') ? currentPl : null;

        const result = Scheduler.generate(new Date(dateInput.value), numDays, platoonId);
        if (result) {
            this.buildInnerPlatoonTabs('asgnSchedulePlatoonTabs', null, 'schedule', { showCompany: true });
            this.displaySchedule();
            this.displayWarnings();
            this.displayPattern();
            this.refreshWorkload();
            Toast.show(platoonId ? `שיבוץ מחלקתי נוצר!` : 'שיבוץ נוצר בהצלחה!', 'success');
        }
    },

    _renderScheduleForPlatoon(platoonId) {
        this.displaySchedule(platoonId);
    },

    displaySchedule(filterPlatoonId) {
        const sd = AssignmentData.loadSchedule();
        if (!sd?.data) return;
        const schedule = sd.data;
        const positions = AssignmentData.getActivePositions();
        let allSoldiers = AssignmentData.getActiveSoldiers();

        // Load platoon color map
        const platoons = AttendanceData.loadPlatoons();
        const platoonMap = {};
        platoons.forEach(pl => { platoonMap[pl.id] = pl; });

        if (filterPlatoonId && filterPlatoonId !== 'company') {
            allSoldiers = allSoldiers.filter(s => s.platoon_id === filterPlatoonId);
        }

        const soldierNames = allSoldiers.map(s => s.name);
        // Build soldier -> platoon lookup
        const soldierPlatoon = {};
        allSoldiers.forEach(s => { soldierPlatoon[s.name] = s.platoon_id; });

        const select = document.getElementById('asgnHighlightSoldierSelect');
        if (select) {
            select.innerHTML = '<option value="">-- בחר --</option>';
            soldierNames.forEach(n => select.innerHTML += `<option value="${n}">${n}</option>`);
        }

        const grid = document.getElementById('asgnScheduleGrid');
        if (!grid) return;

        // Filter positions for this platoon + cross-platoon positions where platoon soldiers appear
        let displayPositions = positions;
        if (filterPlatoonId && filterPlatoonId !== 'company') {
            // Collect positions where this platoon's soldiers are assigned
            const crossPlatoonPosNames = new Set();
            Object.values(schedule).forEach(hours => {
                Object.values(hours).forEach(posSlots => {
                    Object.entries(posSlots).forEach(([posName, slotData]) => {
                        if (slotData?.soldiers?.some(n => soldierNames.includes(n))) {
                            crossPlatoonPosNames.add(posName);
                        }
                    });
                });
            });

            displayPositions = positions.filter(p => {
                if (p.assignment_level === 'platoon' && p.platoon_id === filterPlatoonId) return true;
                if (p.assignment_level === 'company') return true;
                if (!p.assignment_level) return true;
                if (crossPlatoonPosNames.has(p.name)) return true;
                return false;
            });
        }

        let html = '<table><thead><tr><th>תאריך</th><th>יום</th><th>שעות</th>';
        displayPositions.forEach(p => {
            const cmdCount = p.required_commanders_count || 1;
            const cmdReq = p.requires_commander === 'commander' ? ` 🎖️${cmdCount > 1 ? '×' + cmdCount : ''}` : p.requires_commander === 'vice_commander' ? ` ⭐${cmdCount > 1 ? '×' + cmdCount : ''}` : '';
            const roleCount = p.required_role_count || 1;
            const roleReq = p.required_role ? ` 📌${roleCount > 1 ? '×' + roleCount : ''}` : '';
            html += `<th>${p.name}${cmdReq}${roleReq}</th>`;
        });
        html += '<th>😴 במנוחה</th><th>🏠 בבית</th></tr></thead><tbody>';

        let rowIndex = 0;
        Object.keys(schedule).sort((a, b) => AssignmentData.parseDate(a) - AssignmentData.parseDate(b)).forEach(dateStr => {
            Object.keys(schedule[dateStr]).sort().forEach(hourStr => {
                const day = AssignmentData.getDayName(AssignmentData.parseDate(dateStr));
                html += `<tr><td class="info-cell">${dateStr}</td><td class="info-cell">${day}</td>`;

                // חישוב טווח שעות - אם יש עמדות עם משך שונה, הצג את כולן
                let timeRange = hourStr;
                const endTimes = new Set();
                displayPositions.forEach(p => {
                    const pd = schedule[dateStr][hourStr][p.name];
                    if (pd && pd.end_time) endTimes.add(pd.end_time);
                });
                if (endTimes.size === 1) {
                    timeRange = `${hourStr}-${[...endTimes][0]}`;
                } else if (endTimes.size > 1) {
                    // מספר משכי זמן שונים - הצג טווח מקסימלי
                    const sorted = [...endTimes].sort();
                    timeRange = `${hourStr}-${sorted[sorted.length - 1]}`;
                }
                html += `<td class="info-cell">${timeRange}</td>`;

                const onDuty = new Set();
                // בדוק אם יש עמדות עם משכי זמן שונים (לסימון בתא)
                const maxEndTime = endTimes.size > 0 ? [...endTimes].sort().pop() : null;

                displayPositions.forEach(pos => {
                    const pd = schedule[dateStr][hourStr][pos.name];
                    let soldiers = pd?.soldiers || [];

                    // Filter soldiers for this platoon view
                    if (filterPlatoonId && filterPlatoonId !== 'company') {
                        soldiers = soldiers.filter(n => soldierNames.includes(n));
                    }

                    soldiers.forEach(s => onDuty.add(s));
                    // תאי שיבוץ עם drag & drop
                    html += `<td class="schedule-drop-zone" data-date="${dateStr}" data-hour="${hourStr}" data-pos="${pos.name}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="AssignmentUI._handleDrop(event, this)">`;

                    // הצג זמן סיום ספציפי אם שונה משאר העמדות בשורה
                    if (pd && endTimes.size > 1 && pd.end_time !== maxEndTime) {
                        html += `<div class="cell-time-badge">עד ${pd.end_time}</div>`;
                    }

                    if (soldiers.length) {
                        soldiers.forEach(n => {
                            const asgnS = allSoldiers.find(s => s.name === n);
                            const cmdIcon = asgnS?.is_commander === 'commander' ? '🎖️' : asgnS?.is_commander === 'vice_commander' ? '⭐' : '';
                            const plId = soldierPlatoon[n];
                            const pl = plId ? platoonMap[plId] : null;
                            const plColor = pl?.color || '#999';
                            const plLight = this._lightenColor(plColor);
                            html += `<span class="soldier-btn" draggable="true" data-soldier="${n}" data-date="${dateStr}" data-hour="${hourStr}" data-pos="${pos.name}" style="background:${plLight};border:2px solid ${plColor};" title="${n} - ${pl?.name || ''}" onclick="AssignmentUI._onSoldierClick(event,'${n}','${dateStr}','${hourStr}','${pos.name}')" ondragstart="AssignmentUI._handleDragStart(event,'${n}','${dateStr}','${hourStr}','${pos.name}')">${cmdIcon}${n}</span>`;
                        });
                    } else {
                        html += '<span class="empty-cell">—</span>';
                    }
                    html += '</td>';
                });

                // שינוי 1: פיצול לנוכחים (מנוחה) ונעדרים (בבית)
                const notOnDuty = soldierNames.filter(s => !onDuty.has(s));
                const shiftDate = AssignmentData.parseDate(dateStr);
                shiftDate.setHours(parseInt(hourStr)); // שינוי 9: תיקון - בדיקת זמינות לפי שעה ולא רק תאריך
                const resting = [];
                const atHome = [];
                const atHomeReasons = {};
                notOnDuty.forEach(n => {
                    const bridgeCheck = Bridge.isSoldierAvailable(n, shiftDate);
                    if (bridgeCheck.available) {
                        resting.push(n);
                    } else {
                        atHome.push(n);
                        atHomeReasons[n] = bridgeCheck.reason || 'נעדר';
                    }
                });

                // עמודת מנוחה - מקובצת לפי מחלקות (חיילים ניתנים לגרירה)
                html += '<td class="rest-cell">';
                html += this._renderSoldiersByPlatoon(resting, soldierPlatoon, platoonMap, platoons, rowIndex, 'rest', dateStr, hourStr);
                html += '</td>';

                // עמודת "בבית" - מקובצת לפי מחלקות + סיבה
                html += '<td class="home-cell">';
                html += this._renderSoldiersByPlatoon(atHome, soldierPlatoon, platoonMap, platoons, rowIndex, 'home', null, null, atHomeReasons);
                html += '</td></tr>';
                rowIndex++;
            });
        });

        html += '</tbody></table>';
        grid.innerHTML = html;
    },

    /**
     * Render a list of soldiers grouped by platoon with accordions
     */
    _renderSoldiersByPlatoon(soldierList, soldierPlatoon, platoonMap, platoons, rowIndex, prefix, dateStr, hourStr, reasons) {
        if (soldierList.length === 0) return '<span class="empty-cell">—</span>';
        const isDraggableRest = (prefix === 'rest' && dateStr && hourStr);

        // Group by platoon
        const byPlatoon = {};
        soldierList.forEach(n => {
            const plId = soldierPlatoon[n] || '_none';
            if (!byPlatoon[plId]) byPlatoon[plId] = [];
            byPlatoon[plId].push(n);
        });

        let html = '';
        platoons.forEach(pl => {
            const soldiers = byPlatoon[pl.id];
            if (!soldiers || soldiers.length === 0) return;
            const accId = `${prefix}acc-${rowIndex}-${pl.id}`;
            const plColor = pl.color || '#999';
            const plLight = this._lightenColor(plColor);
            html += `<div class="rest-platoon-group">`;
            html += `<div class="rest-platoon-header" onclick="AssignmentUI._togglePlatoonAccordion('${accId}')" style="background:${plColor};color:#fff;padding:3px 8px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;user-select:none;margin:1px 0;">`;
            html += `<span class="rest-accordion-arrow" id="arrow-${accId}">◀</span> ${pl.name} (${soldiers.length})</div>`;
            html += `<div class="rest-platoon-soldiers" id="${accId}" style="display:none;margin-top:2px;margin-right:6px;padding:3px;border-right:3px solid ${plColor};background:${plLight};border-radius:4px;">`;
            soldiers.forEach(n => {
                if (isDraggableRest) {
                    html += `<span class="resting-item resting-draggable" style="font-size:11px;margin:1px;cursor:grab;" draggable="true" title="גרור למשמרת" ondragstart="AssignmentUI._handleRestDragStart(event,'${n}','${dateStr}','${hourStr}')">${n}</span> `;
                } else if (prefix === 'home' && reasons && reasons[n]) {
                    const reasonLabel = reasons[n];
                    const reasonCls = AssignmentUI._getReasonBadgeClass(reasonLabel);
                    html += `<span class="home-item" style="font-size:11px;margin:1px;cursor:pointer;" onclick="AssignmentUI.openSoldierCard('${n}')" title="${n} - ${reasonLabel}">${n} <span class="home-reason-badge ${reasonCls}">${reasonLabel}</span></span> `;
                } else {
                    html += `<span class="${prefix === 'home' ? 'home-item' : 'resting-item'}" style="font-size:11px;margin:1px;cursor:pointer;" onclick="AssignmentUI.openSoldierCard('${n}')" title="${n}">${n}</span> `;
                }
            });
            html += `</div></div>`;
        });

        // Unassigned platoon soldiers
        if (byPlatoon['_none']?.length) {
            const soldiers = byPlatoon['_none'];
            html += `<div class="rest-platoon-group"><span style="font-size:11px;color:#999;">`;
            soldiers.forEach(n => {
                if (isDraggableRest) {
                    html += `<span class="resting-item resting-draggable" style="font-size:11px;margin:1px;cursor:grab;" draggable="true" title="גרור למשמרת" ondragstart="AssignmentUI._handleRestDragStart(event,'${n}','${dateStr}','${hourStr}')">${n}</span> `;
                } else if (prefix === 'home' && reasons && reasons[n]) {
                    const reasonLabel = reasons[n];
                    const reasonCls = AssignmentUI._getReasonBadgeClass(reasonLabel);
                    html += `<span class="home-item" style="font-size:11px;margin:1px;cursor:pointer;" onclick="AssignmentUI.openSoldierCard('${n}')" title="${n} - ${reasonLabel}">${n} <span class="home-reason-badge ${reasonCls}">${reasonLabel}</span></span> `;
                } else {
                    html += `<span class="${prefix === 'home' ? 'home-item' : 'resting-item'}" style="font-size:11px;margin:1px;" onclick="AssignmentUI.openSoldierCard('${n}')">${n}</span> `;
                }
            });
            html += `</span></div>`;
        }
        return html;
    },

    /**
     * Toggle platoon accordion in rest/home columns
     */
    _togglePlatoonAccordion(id) {
        const el = document.getElementById(id);
        const arrow = document.getElementById('arrow-' + id);
        if (!el) return;
        if (el.style.display === 'none') {
            el.style.display = 'block';
            if (arrow) arrow.textContent = '▼';
        } else {
            el.style.display = 'none';
            if (arrow) arrow.textContent = '◀';
        }
    },

    /**
     * Get CSS class for absence reason badge in "at home" column
     */
    _getReasonBadgeClass(reason) {
        if (!reason) return 'reason-other';
        if (reason.includes('חופשה')) return 'reason-leave';
        if (reason.includes('מחלה')) return 'reason-sick';
        if (reason.includes('קורס')) return 'reason-course';
        if (reason.includes('מיוחד')) return 'reason-special';
        return 'reason-other';
    },

    /**
     * Get command level label for display
     */
    _getCommandLevelLabel(level) {
        if (level === 'commander') return '🎖️ מפקד';
        if (level === 'vice_commander') return '⭐ מ"כ';
        return '';
    },

    /**
     * Lighten a hex color for backgrounds
     */
    _lightenColor(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},0.12)`;
    },

    displayWarnings() {
        const c = document.getElementById('asgnScheduleWarnings');
        if (!c) return;
        const w = Scheduler.warnings || [];
        if (!w.length) { c.style.display = 'none'; return; }
        c.style.display = 'block';

        // קיבוץ אזהרות לפי קטגוריה
        const categories = [
            { key: 'critical', icon: '🔴', label: 'מנוחה קריטית', cssClass: 'error' },
            { key: 'error',    icon: '⚠️', label: 'חוסר בכוח אדם', cssClass: 'error' },
            { key: 'commander', icon: '🎖️', label: 'דרישת דרג פיקוד', cssClass: 'error' },
            { key: 'role',     icon: '📌', label: 'תפקיד נדרש בעמדה', cssClass: 'error' },
            { key: 'rest',     icon: '😴', label: 'זמני מנוחה',    cssClass: '' },
            { key: 'shift_role', icon: '👤', label: 'בעלי תפקידים', cssClass: '' }
        ];
        const grouped = {};
        w.forEach(x => {
            const cat = x.type || 'other';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(x);
        });

        const errCount = (grouped.critical?.length || 0) + (grouped.error?.length || 0);
        let html = `<div class="warnings-accordion-header" onclick="AssignmentUI._toggleWarnings(this)">
            <span>⚠️ אזהרות (${w.length}${errCount ? ' | 🔴 ' + errCount + ' שגיאות' : ''})</span>
            <span class="accordion-arrow">◀</span>
        </div>
        <div class="accordion-body" style="display:none;">`;

        categories.forEach(cat => {
            const items = grouped[cat.key];
            if (!items || items.length === 0) return;
            const itemClass = cat.cssClass ? ` ${cat.cssClass}` : '';
            html += `<div class="warning-group">
                <div class="warning-group-header" onclick="AssignmentUI._toggleWarningGroup(this)">
                    <span>${cat.icon} ${cat.label} (${items.length})</span><span class="accordion-arrow">◀</span>
                </div>
                <div class="warning-group-body" style="display:none;">
                    ${items.map(x => `<div class="warning-item${itemClass}">${x.message}</div>`).join('')}
                </div></div>`;
        });

        // קטגוריות שלא הוגדרו מפורשות
        const knownKeys = new Set(categories.map(c => c.key));
        Object.keys(grouped).forEach(key => {
            if (knownKeys.has(key)) return;
            const items = grouped[key];
            html += `<div class="warning-group">
                <div class="warning-group-header" onclick="AssignmentUI._toggleWarningGroup(this)">
                    <span>ℹ️ ${key} (${items.length})</span><span class="accordion-arrow">◀</span>
                </div>
                <div class="warning-group-body" style="display:none;">
                    ${items.map(x => `<div class="warning-item">${x.message}</div>`).join('')}
                </div></div>`;
        });

        html += '</div>';
        c.innerHTML = html;
    },

    _toggleWarnings(header) {
        const body = header.nextElementSibling;
        const arrow = header.querySelector('.accordion-arrow');
        if (body.style.display === 'none') {
            body.style.display = 'block';
            arrow.classList.add('open');
        } else {
            body.style.display = 'none';
            arrow.classList.remove('open');
        }
    },

    _toggleWarningGroup(header) {
        const body = header.nextElementSibling;
        const arrow = header.querySelector('.accordion-arrow');
        if (body.style.display === 'none') {
            body.style.display = 'block';
            arrow.classList.add('open');
        } else {
            body.style.display = 'none';
            arrow.classList.remove('open');
        }
    },

    displayPattern() {
        const c = document.getElementById('asgnWorkloadPattern');
        if (!c) return;
        const p = Scheduler.pattern;
        if (!p?.avgShift) { c.style.display = 'none'; return; }
        c.style.display = 'block';
        c.innerHTML = `📊 ${p.avgShift} שעות שמירה, ${p.minRest}-${p.maxRest} שעות מנוחה (ממוצע: ${p.avgRest})`;
    },

    highlightSoldier() {
        const name = document.getElementById('asgnHighlightSoldierSelect').value;
        this.highlightSoldierByName(name);
    },

    highlightSoldierByName(name) {
        this.clearHighlight(); if (!name) return;
        const sel = document.getElementById('asgnHighlightSoldierSelect');
        if (sel) sel.value = name;
        let count = 0;
        document.querySelectorAll('#asgnScheduleGrid .soldier-btn').forEach(btn => {
            if (btn.dataset.soldier === name) { btn.classList.add('highlighted'); count++; }
            else { btn.classList.add('dimmed'); }
        });
        document.getElementById('asgnHighlightInfo').textContent = `${name} - ${count} משמרות`;
    },

    clearHighlight() {
        document.querySelectorAll('#asgnScheduleGrid .soldier-btn.highlighted').forEach(b => b.classList.remove('highlighted'));
        document.querySelectorAll('#asgnScheduleGrid .soldier-btn.dimmed').forEach(b => b.classList.remove('dimmed'));
        const info = document.getElementById('asgnHighlightInfo');
        if (info) info.textContent = '';
        const sel = document.getElementById('asgnHighlightSoldierSelect');
        if (sel) sel.value = '';
    },

    // ==================== SOLDIER CARD ====================
    openSoldierCard(soldierName) {
        const soldier = AssignmentData.loadSoldiers().find(s => s.name === soldierName);
        if (!soldier) return;

        const sel = document.getElementById('asgnHighlightSoldierSelect');
        if (sel) { sel.value = soldierName; this.highlightSoldier(); }

        const hrs = Scheduler.soldierTotalHours[soldierName] || 0;
        const shifts = Scheduler.soldierShifts[soldierName] || [];
        const tl = Scheduler.getSoldierTimeline(soldierName);
        let totalRest = 0;
        tl.forEach(t => { if (t.type === 'rest') totalRest += t.hours; });

        const today = new Date().toISOString().split('T')[0];
        const bridgeStatus = Bridge.isSoldierAvailable(soldierName, new Date());
        const attStatus = bridgeStatus.available
            ? '<span style="color:#27ae60;font-weight:700;">✅ נוכח</span>'
            : `<span style="color:#e74c3c;font-weight:700;">❌ ${bridgeStatus.reason || 'נעדר'}${bridgeStatus.returnsAt ? ' (חוזר ' + bridgeStatus.returnsAt + ')' : ''}</span>`;

        // שינוי 4: תגי תפקידים
        let rolesHtml = '';
        if (soldier.roles && soldier.roles.length > 0) {
            rolesHtml = soldier.roles.map(r => `<span class="role-tag tag-role">${r}</span>`).join(' ');
        }
        if (soldier.is_commander) rolesHtml += ' <span class="role-tag tag-commander">🎖️ מפקד</span>';

        let html = `
            <div class="card-header"><h2>👤 ${soldier.is_commander ? '🎖️ ' : ''}${soldierName}</h2><button class="close-btn" onclick="AssignmentUI.closeSoldierCard()">✕</button></div>
            <div class="card-body">
                <div class="card-section"><h3>📋 פרטים</h3>
                    <div class="card-info-grid">
                        <div class="card-info-item"><strong>מחלקה:</strong> ${soldier.platoon_name || '-'}</div>
                        <div class="card-info-item"><strong>דרגה:</strong> ${soldier.rank || '-'}</div>
                        <div class="card-info-item"><strong>סטטוס נוכחות:</strong> ${attStatus}</div>
                        <div class="card-info-item"><strong>תפקידים:</strong> ${rolesHtml || '-'}</div>
                    </div></div>
                <div class="card-section"><h3>📊 עומס</h3>
                    <div class="card-stats">
                        <div class="stat-box work"><div class="stat-value">${hrs}</div><div class="stat-label">שעות שמירה</div></div>
                        <div class="stat-box rest"><div class="stat-value">${totalRest}</div><div class="stat-label">שעות מנוחה</div></div>
                        <div class="stat-box shifts"><div class="stat-value">${shifts.length}</div><div class="stat-label">משמרות</div></div>
                    </div></div>
                <div class="card-section"><h3>📅 לוח זמנים</h3>
                    <div style="max-height:250px;overflow-y:auto;">
                        <table class="timeline-table"><thead><tr><th>סוג</th><th>תאריך</th><th>התחלה</th><th>סיום</th><th>שעות</th><th>עמדה</th></tr></thead><tbody>`;

        tl.forEach(t => {
            const s = new Date(t.start), e = new Date(t.end);
            html += `<tr class="${t.type === 'shift' ? 'shift-row' : 'rest-row'}"><td>${t.type === 'shift' ? '🔴 שמירה' : '😴 מנוחה'}</td><td>${AssignmentData.formatDate(s)}</td><td>${AssignmentData.formatHour(s.getHours())}</td><td>${AssignmentData.formatHour(e.getHours())}</td><td>${t.hours}</td><td>${t.position || '-'}</td></tr>`;
        });

        html += `</tbody></table></div></div></div>
            <div class="card-actions">
                <button class="btn btn-purple" onclick="AssignmentUI.openEditAsgnSoldierDialog('${soldier.id}');AssignmentUI.closeSoldierCard();">✏️ ערוך שיבוץ</button>
                <button class="btn btn-success" onclick="AssignExport.exportSoldierReport('${soldierName}')">📄 דוח</button>
                <button class="btn btn-purple-light" onclick="AssignmentUI.closeSoldierCard()">סגור</button></div>`;

        document.getElementById('soldierCardContent').innerHTML = html;
        document.getElementById('soldierCardOverlay').style.display = 'flex';
    },

    closeSoldierCard(event) {
        if (event && event.target !== event.currentTarget) return;
        document.getElementById('soldierCardOverlay').style.display = 'none';
    },

    // ==================== שינוי 6: תפריט לחיצה + גרירה ====================

    _dragData: null,

    _onSoldierClick(event, soldierName, dateStr, hourStr, posName) {
        event.stopPropagation();
        this._closeContextMenu();

        // Build swap soldier list from same platoon
        const soldier = AssignmentData.getActiveSoldiers().find(s => s.name === soldierName);
        const platoonId = soldier?.platoon_id;
        let swapOptions = '';
        if (platoonId) {
            const platoonSoldiers = AssignmentData.getActiveSoldiers()
                .filter(s => s.platoon_id === platoonId && s.name !== soldierName);
            if (platoonSoldiers.length > 0) {
                swapOptions = `<div class="ctx-menu-separator"></div>
                    <div class="ctx-menu-sub-header">🔀 החלף עם:</div>
                    <div class="ctx-swap-list" style="max-height:150px;overflow-y:auto;">
                    ${platoonSoldiers.map(s => 
                        `<button class="ctx-swap-btn" onclick="AssignmentUI._swapSoldiers('${soldierName}','${s.name}','${dateStr}','${hourStr}','${posName}')">${s.is_commander ? '🎖️ ' : ''}${s.name}</button>`
                    ).join('')}
                    </div>`;
            }
        }

        const menu = document.createElement('div');
        menu.className = 'soldier-context-menu';
        menu.innerHTML = `
            <div class="ctx-menu-header">${soldierName}</div>
            <button onclick="AssignmentUI.openSoldierCard('${soldierName}');AssignmentUI._closeContextMenu()">👤 כרטיס חייל</button>
            <button onclick="AssignmentUI.highlightSoldierByName('${soldierName}');AssignmentUI._closeContextMenu()">🔦 הדגש חייל</button>
            <button onclick="AssignmentUI._startMoveDialog('${soldierName}','${dateStr}','${hourStr}','${posName}')">🔄 העבר למשמרת אחרת</button>
            <button onclick="AssignmentUI._deleteSoldierFromShift('${soldierName}','${dateStr}','${hourStr}','${posName}')">🗑️ הסר ממשמרת</button>
            <button onclick="AssignmentUI._deleteSoldierWithRecalc('${soldierName}','${dateStr}','${hourStr}','${posName}')">♻️ הסר + חשב מחדש</button>
            ${swapOptions}
        `;
        menu.style.position = 'fixed';
        menu.style.left = event.clientX + 'px';
        menu.style.top = event.clientY + 'px';
        menu.style.zIndex = '3000';
        document.body.appendChild(menu);

        // Ensure menu doesn't overflow viewport
        requestAnimationFrame(() => {
            const rect = menu.getBoundingClientRect();
            if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
            if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
        });

        setTimeout(() => {
            document.addEventListener('click', this._closeContextMenu, { once: true });
        }, 10);
    },

    _closeContextMenu() {
        const existing = document.querySelector('.soldier-context-menu');
        if (existing) existing.remove();
    },

    // שינוי 4: דיאלוג העברה עם משמעויות
    _startMoveDialog(soldierName, fromDate, fromHour, fromPos) {
        this._closeContextMenu();
        const sd = AssignmentData.loadSchedule();
        if (!sd?.data) return;

        // Build list of available slots
        const positions = AssignmentData.getActivePositions();
        let slotsHtml = '';
        const sortedDates = Object.keys(sd.data).sort();

        sortedDates.forEach(dateStr => {
            Object.keys(sd.data[dateStr]).sort().forEach(hourStr => {
                positions.forEach(pos => {
                    if (dateStr === fromDate && hourStr === fromHour && pos.name === fromPos) return;
                    const slot = sd.data[dateStr][hourStr][pos.name];
                    if (slot) {
                        const soldiers = slot.soldiers?.join(', ') || 'ריק';
                        slotsHtml += `<option value="${dateStr}|${hourStr}|${pos.name}">${dateStr} ${hourStr} - ${pos.name} (${soldiers})</option>`;
                    }
                });
            });
        });

        const html = `
            <h2>🔄 העברת ${soldierName}</h2>
            <p style="margin-bottom:12px;">ממשמרת: <strong>${fromDate} ${fromHour} - ${fromPos}</strong></p>
            <div class="form-group">
                <label>יעד:</label>
                <select id="moveTargetSelect" style="width:100%;padding:8px;border:2px solid #ddd;border-radius:8px;">
                    ${slotsHtml}
                </select>
            </div>
            <div id="moveConsequences" style="margin-top:12px;"></div>
            <div class="form-actions">
                <button class="btn btn-purple" onclick="AssignmentUI._previewMoveConsequences('${soldierName}','${fromDate}','${fromHour}','${fromPos}')">👁️ הצג משמעויות</button>
                <button class="btn btn-success" onclick="AssignmentUI._executeMove('${soldierName}','${fromDate}','${fromHour}','${fromPos}')">✅ בצע העברה</button>
                <button class="btn btn-purple-light" onclick="App.closeDialog()">ביטול</button>
            </div>`;

        document.getElementById('dialogContent').innerHTML = html;
        document.getElementById('dialogOverlay').style.display = 'flex';
    },

    _previewMoveConsequences(soldierName, fromDate, fromHour, fromPos) {
        const sel = document.getElementById('moveTargetSelect');
        if (!sel?.value) return;
        const [toDate, toHour, toPos] = sel.value.split('|');

        const consequences = Scheduler.calcMoveConsequences(soldierName, fromDate, fromHour, fromPos, toDate, toHour, toPos);
        const div = document.getElementById('moveConsequences');
        if (!consequences) {
            div.innerHTML = '<div class="alert-item alert-warning">❌ לא ניתן לחשב משמעויות</div>';
            return;
        }

        let html = '<div style="background:var(--purple-surface);padding:12px;border-radius:8px;margin-top:8px;">';
        html += '<h3 style="margin-bottom:8px;">📊 משמעויות ההעברה:</h3>';

        if (consequences.before.restBefore !== null) {
            html += `<div class="alert-item ${consequences.violations.restBeforeViolation ? 'alert-danger' : 'alert-info'}">
                מנוחה לפני: ${consequences.before.restBefore}h → ${consequences.after.restBefore}h
                ${consequences.violations.restBeforeViolation ? ` ⚠️ מתחת למינימום (${consequences.minRest}h)` : ''}
            </div>`;
        }
        if (consequences.before.restAfter !== null) {
            html += `<div class="alert-item ${consequences.violations.restAfterViolation ? 'alert-danger' : 'alert-info'}">
                מנוחה אחרי: ${consequences.before.restAfter}h → ${consequences.after.restAfter}h
                ${consequences.violations.restAfterViolation ? ` ⚠️ מתחת למינימום (${consequences.minRest}h)` : ''}
            </div>`;
        }
        if (consequences.affectedSoldiers.length) {
            html += `<div class="alert-item alert-warning">🔄 חיילים מושפעים: ${consequences.affectedSoldiers.map(s => s.name).join(', ')}</div>`;
        }
        if (!consequences.violations.restBeforeViolation && !consequences.violations.restAfterViolation) {
            html += `<div class="alert-item alert-success">✅ אין בעיות מנוחה</div>`;
        }

        html += '</div>';
        div.innerHTML = html;
    },

    _executeMove(soldierName, fromDate, fromHour, fromPos) {
        const sel = document.getElementById('moveTargetSelect');
        if (!sel?.value) { Toast.show('בחר יעד!', 'warning'); return; }
        const [toDate, toHour, toPos] = sel.value.split('|');

        const success = Scheduler.moveSoldier(soldierName, fromDate, fromHour, fromPos, toDate, toHour, toPos);
        if (success) {
            // Lock the target slot so recalculation preserves the move
            this._lockSlot(toDate, toHour, toPos);
            App.closeDialog();
            this._afterScheduleChange(`✅ ${soldierName} הועבר ל-${toDate} ${toHour} ${toPos}`);
        } else {
            Toast.show('❌ שגיאה בהעברה', 'error');
        }
    },

    // שינוי 5: מחיקת חייל ממשמרת
    _deleteSoldierFromShift(soldierName, dateStr, hourStr, posName) {
        this._closeContextMenu();
        if (!confirm(`להסיר את ${soldierName} מ-${dateStr} ${hourStr} ${posName}?`)) return;

        const success = Scheduler.removeSoldierFromShift(soldierName, dateStr, hourStr, posName, false);
        if (success) {
            this._afterScheduleChange(`✅ ${soldierName} הוסר מהמשמרת`);
        }
    },

    _deleteSoldierWithRecalc(soldierName, dateStr, hourStr, posName) {
        this._closeContextMenu();
        if (!confirm(`להסיר את ${soldierName} מ-${dateStr} ${hourStr} ${posName} ולשבץ מחליף?`)) return;

        const success = Scheduler.removeSoldierFromShift(soldierName, dateStr, hourStr, posName, true);
        if (success) {
            // Lock this slot so the replacement survives recalculation
            this._lockSlot(dateStr, hourStr, posName);
            this._afterScheduleChange(`✅ ${soldierName} הוסר ומחליף שובץ`);
        }
    },

    // Drag & Drop handlers
    _handleDragStart(event, soldierName, dateStr, hourStr, posName) {
        this._dragData = { soldierName, dateStr, hourStr, posName, fromRest: false };
        event.dataTransfer.setData('text/plain', soldierName);
        event.dataTransfer.effectAllowed = 'move';
        event.target.style.opacity = '0.5';
    },

    _handleRestDragStart(event, soldierName, dateStr, hourStr) {
        this._dragData = { soldierName, dateStr, hourStr, posName: null, fromRest: true };
        event.dataTransfer.setData('text/plain', soldierName);
        event.dataTransfer.effectAllowed = 'move';
        event.target.style.opacity = '0.5';
    },

    _handleDrop(event, targetCell) {
        event.preventDefault();
        targetCell.classList.remove('drag-over');

        if (!this._dragData) return;
        const { soldierName, dateStr: fromDate, hourStr: fromHour, posName: fromPos, fromRest } = this._dragData;
        const toDate = targetCell.dataset.date;
        const toHour = targetCell.dataset.hour;
        const toPos = targetCell.dataset.pos;

        if (!fromRest && fromDate === toDate && fromHour === toHour && fromPos === toPos) {
            this._dragData = null;
            return;
        }

        if (fromRest) {
            // Dragging a resting soldier into a shift slot
            this._handleRestDrop(soldierName, toDate, toHour, toPos);
            this._dragData = null;
            document.querySelectorAll('.resting-draggable').forEach(el => el.style.opacity = '');
            return;
        }

        // Show consequences before executing
        const consequences = Scheduler.calcMoveConsequences(soldierName, fromDate, fromHour, fromPos, toDate, toHour, toPos);

        let msg = `להעביר את ${soldierName} ל-${toDate} ${toHour} ${toPos}?`;
        if (consequences) {
            if (consequences.violations.restBeforeViolation || consequences.violations.restAfterViolation) {
                msg += `\n\n⚠️ אזהרה: זמן מנוחה מתחת למינימום!`;
            }
            if (consequences.after.restBefore !== null) {
                msg += `\nמנוחה לפני: ${consequences.after.restBefore}h`;
            }
            if (consequences.after.restAfter !== null) {
                msg += `\nמנוחה אחרי: ${consequences.after.restAfter}h`;
            }
        }

        if (confirm(msg)) {
            const success = Scheduler.moveSoldier(soldierName, fromDate, fromHour, fromPos, toDate, toHour, toPos);
            if (success) {
                // Lock the target slot so recalculation preserves the drag
                this._lockSlot(toDate, toHour, toPos);
                this._afterScheduleChange(`✅ ${soldierName} הועבר`);
            }
        }

        this._dragData = null;
        document.querySelectorAll('.soldier-btn').forEach(el => el.style.opacity = '');
    },

    /**
     * Handle dropping a resting soldier into a shift slot.
     * Adds the resting soldier and removes the soldier with the most hours.
     */
    _handleRestDrop(soldierName, toDate, toHour, toPos) {
        const sd = AssignmentData.loadSchedule();
        if (!sd?.data) return;

        const slot = sd.data[toDate]?.[toHour]?.[toPos];
        if (!slot) { Toast.show('משבצת לא נמצאה', 'error'); return; }

        // Check if soldier is already in this slot
        if (slot.soldiers?.includes(soldierName)) {
            Toast.show(`${soldierName} כבר נמצא במשמרת זו`, 'warning');
            return;
        }

        const pos = AssignmentData.getActivePositions().find(p => p.name === toPos);
        const needed = pos?.soldiers_required || 1;
        const currentSoldiers = slot.soldiers || [];

        // If slot is already full, find the soldier with most total hours to kick out
        let kickedSoldier = null;
        if (currentSoldiers.length >= needed) {
            Scheduler._rebuildTracking(sd.data);
            let maxHours = -1;
            currentSoldiers.forEach(n => {
                const hrs = Scheduler.soldierTotalHours[n] || 0;
                if (hrs > maxHours) { maxHours = hrs; kickedSoldier = n; }
            });
        }

        const kickMsg = kickedSoldier
            ? `\n${kickedSoldier} (הכי הרבה שעות) יוצא למנוחה`
            : '';
        if (!confirm(`להכניס את ${soldierName} ל-${toPos} ${toDate} ${toHour}?${kickMsg}`)) return;

        // Remove kicked soldier if needed
        if (kickedSoldier) {
            slot.soldiers = slot.soldiers.filter(n => n !== kickedSoldier);
        }

        // Add resting soldier
        if (!slot.soldiers) slot.soldiers = [];
        slot.soldiers.push(soldierName);

        AssignmentData.saveSchedule(sd);
        this._lockSlot(toDate, toHour, toPos);
        Scheduler._rebuildTracking(sd.data);

        const msg = kickedSoldier
            ? `🔀 ${soldierName} נכנס, ${kickedSoldier} יצא למנוחה ב-${toPos}`
            : `✅ ${soldierName} נכנס ל-${toPos}`;
        this._afterScheduleChange(msg);
    },

    /**
     * Swap two soldiers in a specific shift slot
     */
    _swapSoldiers(currentName, newName, dateStr, hourStr, posName) {
        this._closeContextMenu();

        const sd = AssignmentData.loadSchedule();
        if (!sd?.data) return;

        const slot = sd.data[dateStr]?.[hourStr]?.[posName];
        if (!slot?.soldiers) return;

        // Replace current with new in this slot
        const idx = slot.soldiers.indexOf(currentName);
        if (idx === -1) return;
        slot.soldiers[idx] = newName;

        // If new soldier is in another slot in same time, swap back
        Object.entries(sd.data[dateStr]?.[hourStr] || {}).forEach(([otherPos, otherSlot]) => {
            if (otherPos === posName) return;
            if (otherSlot?.soldiers?.includes(newName)) {
                otherSlot.soldiers = otherSlot.soldiers.map(n => n === newName ? currentName : n);
                // Lock the other slot too (it now has currentName instead of newName)
                if (!sd.lockedSlots) sd.lockedSlots = [];
                const otherKey = `${dateStr}|${hourStr}|${otherPos}`;
                sd.lockedSlots = sd.lockedSlots.filter(l => `${l.dateStr}|${l.hourStr}|${l.posName}` !== otherKey);
                sd.lockedSlots.push({ dateStr, hourStr, posName: otherPos, soldiers: [...otherSlot.soldiers] });
            }
        });

        // Lock this slot so recalculation preserves the swap
        if (!sd.lockedSlots) sd.lockedSlots = [];
        const lockKey = `${dateStr}|${hourStr}|${posName}`;
        sd.lockedSlots = sd.lockedSlots.filter(l => `${l.dateStr}|${l.hourStr}|${l.posName}` !== lockKey);
        sd.lockedSlots.push({ dateStr, hourStr, posName, soldiers: [...slot.soldiers] });

        AssignmentData.saveSchedule(sd);
        Scheduler._rebuildTracking(sd.data);
        this._afterScheduleChange(`🔀 ${currentName} ↔ ${newName} ב-${posName}`);
    },

    /**
     * Lock a slot in the saved schedule so recalculation preserves it.
     * Reads the current soldiers from the schedule data.
     */
    _lockSlot(dateStr, hourStr, posName) {
        const sd = AssignmentData.loadSchedule();
        if (!sd?.data) return;
        const slot = sd.data[dateStr]?.[hourStr]?.[posName];
        if (!slot?.soldiers || slot.soldiers.length === 0) return;
        if (!sd.lockedSlots) sd.lockedSlots = [];
        const lockKey = `${dateStr}|${hourStr}|${posName}`;
        sd.lockedSlots = sd.lockedSlots.filter(l => `${l.dateStr}|${l.hourStr}|${l.posName}` !== lockKey);
        sd.lockedSlots.push({ dateStr, hourStr, posName, soldiers: [...slot.soldiers] });
        AssignmentData.saveSchedule(sd);
    },

    /**
     * Central handler after any schedule change - refresh display and offer recalculation
     */
    _afterScheduleChange(toastMsg) {
        this.displaySchedule(this._currentInnerTab.schedule);
        this.displayWarnings();
        this.refreshWorkload();
        Toast.show(toastMsg, 'success');

        // Offer to recalculate the full schedule
        if (Scheduler.warnings.length > 0) {
            setTimeout(() => {
                if (confirm(`🔄 יש ${Scheduler.warnings.length} אזהרות בשיבוץ. לבצע שיבוץ מחדש?`)) {
                    this._recalculateSchedule();
                }
            }, 300);
        }
    },

    /**
     * Recalculate schedule preserving manual changes where possible
     */
    _recalculateSchedule() {
        const dateInput = document.getElementById('asgnScheduleStartDate');
        const sd = AssignmentData.loadSchedule();
        if (!sd?.startDate) { Toast.show('אין שיבוץ קיים לחישוב מחדש', 'warning'); return; }

        const startDate = new Date(sd.startDate);
        const numDays = sd.numDays || 7;
        const platoonId = sd.platoonId || null;

        // Extract locked slots from the current schedule
        const lockedSlots = sd.lockedSlots || [];

        Bridge.syncSoldiers();
        const result = Scheduler.generate(startDate, numDays, platoonId, lockedSlots);
        if (result) {
            this.displaySchedule(this._currentInnerTab.schedule);
            this.displayWarnings();
            this.displayPattern();
            this.refreshWorkload();
            const lockCount = lockedSlots.length;
            Toast.show(`✅ שיבוץ חושב מחדש${lockCount ? ` (${lockCount} משבצות נעולות נשמרו)` : ''}`, 'success');
        }
    },

    // ==================== WORKLOAD (שינוי 1) ====================
    refreshWorkload() {
        this.buildInnerPlatoonTabs('asgnWorkloadPlatoonTabs', null, 'workload', { showCompany: true });
        const currentPl = this._currentInnerTab.workload;
        if (currentPl) this._renderWorkloadForPlatoon(currentPl);
    },

    _renderWorkloadForPlatoon(platoonId) {
        const filterPl = (platoonId && platoonId !== 'company') ? platoonId : null;
        const balance = Scheduler.getWorkloadBalance(filterPl);
        const sumDiv = document.getElementById('asgnWorkloadSummary');
        const detDiv = document.getElementById('asgnWorkloadTable');
        if (!sumDiv || !detDiv) return;

        if (!balance.length) {
            sumDiv.innerHTML = '<p style="text-align:center;color:#666;padding:40px;">אין נתוני שיבוץ.</p>';
            detDiv.innerHTML = '';
            return;
        }

        const totalW = balance.reduce((s, b) => s + b.hours, 0);
        const totalR = balance.reduce((s, b) => s + b.restHours, 0);
        const avgW = Math.round(totalW / balance.length);
        const avgR = Math.round(totalR / balance.length);

        sumDiv.innerHTML = `
            <div class="summary-card card-red"><div class="label">שעות עבודה</div><div class="value">${totalW}</div></div>
            <div class="summary-card card-green"><div class="label">שעות מנוחה</div><div class="value">${totalR}</div></div>
            <div class="summary-card card-orange"><div class="label">ממוצע עבודה</div><div class="value">${avgW}</div></div>
            <div class="summary-card card-blue"><div class="label">ממוצע מנוחה</div><div class="value">${avgR}</div></div>`;

        let html = '<div class="workload-row header"><div>חייל</div><div>עומס</div><div>עבודה</div><div>מנוחה</div><div>ממוצע</div><div>משמרות</div></div>';
        balance.forEach(b => {
            const lvl = b.percentage > 80 ? 'high' : b.percentage > 50 ? 'medium' : 'low';
            const rc = b.avgRest >= 8 ? 'rest-good' : b.avgRest >= 6 ? 'rest-ok' : 'rest-bad';
            const cmdIcon = b.is_commander ? '🎖️ ' : '';
            const rolesStr = (b.roles && b.roles.length > 0) ? ` [${b.roles.join(',')}]` : '';
            html += `<div class="workload-row"><div><strong>${cmdIcon}${b.name}</strong><span style="font-size:9px;color:#999;">${rolesStr}</span></div><div><div class="workload-bar-container"><div class="workload-bar ${lvl}" style="width:${b.percentage}%">${b.hours}h</div></div></div><div>${b.hours}h</div><div>${b.restHours}h</div><div class="rest-indicator ${rc}">${b.avgRest}h</div><div>${b.shifts}</div></div>`;
        });
        detDiv.innerHTML = html;
    }
};

/**
 * AssignReset - איפוס מודולי שיבוץ
 */
const AssignReset = {
    resetModule(module) {
        const names = { soldiers: 'חיילי שיבוץ', positions: 'עמדות', schedule: 'שיבוץ', company: 'פלוגתי שיבוץ' };
        if (!confirm(`לאפס "${names[module] || module}"?`)) return;

        switch (module) {
            case 'soldiers':
                localStorage.removeItem(AssignmentData.KEYS.SOLDIERS);
                AssignmentUI.refreshSoldiers();
                break;
            case 'positions':
                localStorage.removeItem(AssignmentData.KEYS.POSITIONS);
                AssignmentUI.refreshPositions();
                break;
            case 'schedule':
                localStorage.removeItem(AssignmentData.KEYS.SCHEDULE);
                Scheduler.schedule = {};
                Scheduler.soldierShifts = {};
                Scheduler.soldierTotalHours = {};
                Scheduler.warnings = [];
                const grid = document.getElementById('asgnScheduleGrid');
                if (grid) grid.innerHTML = '';
                const warn = document.getElementById('asgnScheduleWarnings');
                if (warn) warn.style.display = 'none';
                const pat = document.getElementById('asgnWorkloadPattern');
                if (pat) pat.style.display = 'none';
                AssignmentUI.refreshWorkload();
                break;
            case 'company':
                localStorage.removeItem(AssignmentData.KEYS.COMPANY);
                AsgnCompany.platoons = [];
                AsgnCompany.mergedSchedule = null;
                AsgnCompany.soldierPlatoonMap = {};
                AsgnCompany.refreshDisplay();
                break;
        }
        Toast.show(`✅ ${names[module] || module} אופס`, 'success');
        App.updateSystemStatus();
    }
};

// ========== ui-settings.js ========== //
/**
 * SettingsUI - UI הגדרות (משולב) - SunDay v3.0
 * עדכונים: טווחי תאריכים פר מודול, ולידציות, saveModuleDates, resetModuleDates
 */
const SettingsUI = {
    init() {
        this.loadAttendanceSettings();
        this.loadAssignmentSettings();
        this.loadModuleDates();
    },

    refresh() {
        this.loadAttendanceSettings();
        this.loadAssignmentSettings();
        this.loadModuleDates();
        App.updateSystemStatus();
    },

    // ==================== MODULE DATE RANGES ====================

    /**
     * Load module-specific date ranges into UI fields
     */
    loadModuleDates() {
        const mission = AttendanceData.getMissionRange();

        // Attendance module range
        const attStartEl = document.getElementById('settingAttStart');
        const attEndEl = document.getElementById('settingAttEnd');
        if (attStartEl && attEndEl) {
            const attRange = AttendanceData.getAttendanceRange();
            attStartEl.value = attRange.start;
            attEndEl.value = attRange.end;
            // Set min/max to mission bounds
            attStartEl.min = mission.start;
            attStartEl.max = mission.end;
            attEndEl.min = mission.start;
            attEndEl.max = mission.end;
        }

        // Assignment module range
        const asgnStartEl = document.getElementById('settingAsgnStart');
        const asgnEndEl = document.getElementById('settingAsgnEnd');
        if (asgnStartEl && asgnEndEl) {
            const asgnRange = AssignmentData.getAssignmentRange();
            asgnStartEl.value = asgnRange.start;
            asgnEndEl.value = asgnRange.end;
            // Set min/max to mission bounds
            asgnStartEl.min = mission.start;
            asgnStartEl.max = mission.end;
            asgnEndEl.min = mission.start;
            asgnEndEl.max = mission.end;
        }
    },

    /**
     * Save module-specific date range
     * @param {string} module - 'attendance' or 'assignment'
     */
    saveModuleDates(module) {
        const mission = AttendanceData.getMissionRange();

        if (!mission.start || !mission.end) {
            Toast.show('⚠️ הגדר תחילה תאריכי משימה כלליים!', 'error');
            return;
        }

        if (module === 'attendance') {
            const start = document.getElementById('settingAttStart').value;
            const end = document.getElementById('settingAttEnd').value;

            if (!start || !end) {
                Toast.show('⚠️ חובה למלא שני תאריכים!', 'error');
                return;
            }

            // Validate within mission
            if (start < mission.start || end > mission.end) {
                Toast.show('⚠️ טווח חייב להיות בתוך תאריכי המשימה!', 'error');
                return;
            }

            if (end < start) {
                Toast.show('⚠️ תאריך סיום חייב להיות אחרי התחלה!', 'error');
                return;
            }

            const s = AttendanceData.loadSettings();
            s.attendanceStart = start;
            s.attendanceEnd = end;
            AttendanceData.saveSettings(s);

            // Refresh attendance UI dates
            AttendanceUI.setDefaultDates();
            AttendanceUI.refreshDashboard();

            Toast.show('✅ טווח נוכחות נשמר!', 'success');

        } else if (module === 'assignment') {
            const start = document.getElementById('settingAsgnStart').value;
            const end = document.getElementById('settingAsgnEnd').value;

            if (!start || !end) {
                Toast.show('⚠️ חובה למלא שני תאריכים!', 'error');
                return;
            }

            // Validate within mission
            if (start < mission.start || end > mission.end) {
                Toast.show('⚠️ טווח חייב להיות בתוך תאריכי המשימה!', 'error');
                return;
            }

            if (end < start) {
                Toast.show('⚠️ תאריך סיום חייב להיות אחרי התחלה!', 'error');
                return;
            }

            const s = AssignmentData.loadSettings();
            s.assignmentStart = start;
            s.assignmentEnd = end;
            AssignmentData.saveSettings(s);

            // Update assignment schedule date input min/max
            const startDateEl = document.getElementById('asgnScheduleStartDate');
            if (startDateEl) {
                startDateEl.min = start;
                startDateEl.max = end;
                // If current value is outside new range, adjust
                if (startDateEl.value < start) startDateEl.value = start;
                if (startDateEl.value > end) startDateEl.value = end;
            }

            Toast.show('✅ טווח שיבוץ נשמר!', 'success');
        }
    },

    /**
     * Reset module date range to full mission range
     * @param {string} module - 'attendance' or 'assignment'
     */
    resetModuleDates(module) {
        const mission = AttendanceData.getMissionRange();

        if (module === 'attendance') {
            const attStartEl = document.getElementById('settingAttStart');
            const attEndEl = document.getElementById('settingAttEnd');
            if (attStartEl) attStartEl.value = mission.start;
            if (attEndEl) attEndEl.value = mission.end;

            const s = AttendanceData.loadSettings();
            delete s.attendanceStart;
            delete s.attendanceEnd;
            AttendanceData.saveSettings(s);

            // Refresh attendance UI dates
            AttendanceUI.setDefaultDates();
            AttendanceUI.refreshDashboard();

        } else if (module === 'assignment') {
            const asgnStartEl = document.getElementById('settingAsgnStart');
            const asgnEndEl = document.getElementById('settingAsgnEnd');
            if (asgnStartEl) asgnStartEl.value = mission.start;
            if (asgnEndEl) asgnEndEl.value = mission.end;

            const s = AssignmentData.loadSettings();
            delete s.assignmentStart;
            delete s.assignmentEnd;
            AssignmentData.saveSettings(s);

            // Update assignment schedule date input
            const startDateEl = document.getElementById('asgnScheduleStartDate');
            if (startDateEl) {
                startDateEl.min = mission.start;
                startDateEl.max = mission.end;
            }
        }

        Toast.show('↩️ טווח אופס לכל המשימה', 'success');
    },

    // ==================== ATTENDANCE SETTINGS ====================
    loadAttendanceSettings() {
        const s = AttendanceData.loadSettings();
        const p = AttendanceData.loadPlatoons();
        const el = (id) => document.getElementById(id);

        if (el('settingThresholdCritical')) el('settingThresholdCritical').value = s.thresholdCritical || 50;
        if (el('settingThresholdWarning')) el('settingThresholdWarning').value = s.thresholdWarning || 60;
        if (el('settingDefaultLeaveTime')) el('settingDefaultLeaveTime').value = s.defaultLeaveTime || '14:00';
        if (el('settingDefaultReturnTime')) el('settingDefaultReturnTime').value = s.defaultReturnTime || '17:00';
        if (el('settingLeaveThreshold')) el('settingLeaveThreshold').value = s.leaveThreshold || '18:00';
        if (el('settingMissionStart')) el('settingMissionStart').value = s.missionStart || '';
        if (el('settingMissionEnd')) el('settingMissionEnd').value = s.missionEnd || '';
        if (el('settingMinCommanders')) el('settingMinCommanders').value = s.minCommanders || 1;
        if (el('settingCountLeaveDay')) el('settingCountLeaveDay').value = s.countLeaveDay || 'yes';
        if (el('settingCountReturnDay')) el('settingCountReturnDay').value = s.countReturnDay || 'yes';
        if (el('settingWeekendCount')) el('settingWeekendCount').value = s.weekendCount || 'two';
        if (el('settingNumPlatoons')) el('settingNumPlatoons').value = p.length;

        this.renderPlatoonNameSettings();
        this.renderRolesSettings();
    },

   renderPlatoonNameSettings() {
    const platoons = AttendanceData.loadPlatoons();
    const allSoldiers = AttendanceData.loadSoldiers();
    const numEl = document.getElementById('settingNumPlatoons');
    if (!numEl) return;
    const num = parseInt(numEl.value) || 3;
    const colors = ['#27ae60', '#3498db', '#e67e22', '#9b59b6', '#e74c3c'];
    const c = document.getElementById('platoonNamesSettings');
    if (!c) return;
    let html = '';
    for (let i = 0; i < num; i++) {
        const ex = platoons[i];
        const pid = ex ? ex.id : (i + 1).toString();
        const defName = "מחלקה " + String.fromCharCode(1488 + i) + "'";
        const isMaflag = ex ? (ex.is_maflag === true) : false;

        // Get soldiers of this platoon for commander dropdown
        const plSoldiers = allSoldiers.filter(s => s.platoon_id === pid && s.is_active !== false);

        let cmdOptions = `<option value="">-- בחר מפקד --</option>`;
        plSoldiers.forEach(s => {
            const sel = (ex && ex.commander === s.name) ? ' selected' : '';
            cmdOptions += `<option value="${s.name}"${sel}>${s.is_commander ? '🎖️ ' : ''}${s.name}</option>`;
        });

        let cmd2Options = `<option value="">-- ללא --</option>`;
        plSoldiers.forEach(s => {
            const sel = (ex && ex.commander2 === s.name) ? ' selected' : '';
            cmd2Options += `<option value="${s.name}"${sel}>${s.is_commander ? '🎖️ ' : ''}${s.name}</option>`;
        });

        html += `<div class="setting-group" style="padding:12px;background:var(--purple-surface);border-radius:8px;margin-bottom:8px;border-right:4px solid ${ex ? ex.color : (colors[i] || '#666')};">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                <label style="min-width:70px;font-weight:700;">מחלקה ${i + 1}:</label>
                <input type="text" id="pName_${i}" value="${ex ? ex.name : defName}" style="flex:1;">
                <input type="color" id="pColor_${i}" value="${ex ? ex.color : (colors[i] || '#666')}" style="width:40px;height:34px;border:none;cursor:pointer;">
                <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;background:${isMaflag ? '#ffd700' : '#eee'};padding:4px 8px;border-radius:6px;font-weight:700;">
                    <input type="checkbox" id="pMaflag_${i}" ${isMaflag ? 'checked' : ''} onchange="SettingsUI.onMaflagChange(${i}, ${num})">
                    🏛️ מפלג
                </label>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <label style="font-size:11px;min-width:80px;">מפקד מחלקה:</label>
                <select id="pCmd_${i}" style="flex:1;min-width:120px;">${cmdOptions}</select>
                <label style="font-size:11px;min-width:80px;">מפקד נוסף:</label>
                <select id="pCmd2_${i}" style="flex:1;min-width:120px;">${cmd2Options}</select>
            </div>
            ${isMaflag ? '<div style="margin-top:6px;font-size:10px;color:#856404;background:#fff3cd;padding:4px 8px;border-radius:4px;">⭐ מפקד מחלקה זו = מפקד הפלוגה</div>' : ''}
        </div>`;
    }
    c.innerHTML = html;
},

onMaflagChange(changedIndex, numPlatoons) {
    // Only one platoon can be maflag - uncheck others
    for (let i = 0; i < numPlatoons; i++) {
        if (i !== changedIndex) {
            const cb = document.getElementById('pMaflag_' + i);
            if (cb) cb.checked = false;
        }
    }
},

    renderRolesSettings() {
        const settings = AttendanceData.loadSettings();
        const roles = settings.roles || [];
        const c = document.getElementById('rolesSettingsList');
        if (!c) return;
        let html = '';
        roles.forEach((role, i) => {
            html += `<div class="role-setting-row" id="roleRow_${i}">
                <input type="text" id="roleName_${i}" value="${role.name}" placeholder="שם תפקיד">
                <select id="roleLevel_${i}"><option value="company"${role.level === 'company' ? ' selected' : ''}>פלוגתי</option><option value="platoon"${role.level === 'platoon' ? ' selected' : ''}>מחלקתי</option></select>
                <label style="font-size:11px;">מינימום:</label><input type="number" id="roleMin_${i}" value="${role.min}" min="0" max="20">
                <button class="btn btn-danger btn-xs" onclick="SettingsUI.removeRoleSetting(${i})">🗑️</button></div>`;
        });
        c.innerHTML = html;
    },

    addRoleSetting() {
        const s = AttendanceData.loadSettings();
        s.roles = s.roles || [];
        s.roles.push({ name: '', level: 'company', min: 1 });
        AttendanceData.saveSettings(s);
        this.renderRolesSettings();
    },

    removeRoleSetting(idx) {
        const s = AttendanceData.loadSettings();
        s.roles.splice(idx, 1);
        AttendanceData.saveSettings(s);
        this.renderRolesSettings();
    },

    saveMissionSettings() {
        const s = AttendanceData.loadSettings();
        const newStart = document.getElementById('settingMissionStart').value;
        const newEnd = document.getElementById('settingMissionEnd').value;

        if (!newStart || !newEnd) {
            Toast.show('⚠️ חובה למלא שני תאריכים!', 'error');
            return;
        }

        if (newEnd < newStart) {
            Toast.show('⚠️ תאריך סיום חייב להיות אחרי התחלה!', 'error');
            return;
        }

        s.missionStart = newStart;
        s.missionEnd = newEnd;

        // If module ranges exist, validate they're still within mission
        if (s.attendanceStart && s.attendanceStart < newStart) s.attendanceStart = newStart;
        if (s.attendanceEnd && s.attendanceEnd > newEnd) s.attendanceEnd = newEnd;

        AttendanceData.saveSettings(s);

        // Also validate assignment module range
        const asgnSettings = AssignmentData.loadSettings();
        let asgnChanged = false;
        if (asgnSettings.assignmentStart && asgnSettings.assignmentStart < newStart) {
            asgnSettings.assignmentStart = newStart;
            asgnChanged = true;
        }
        if (asgnSettings.assignmentEnd && asgnSettings.assignmentEnd > newEnd) {
            asgnSettings.assignmentEnd = newEnd;
            asgnChanged = true;
        }
        if (asgnChanged) AssignmentData.saveSettings(asgnSettings);

        Toast.show('✅ משימה נשמרה!', 'success');

        // Refresh all dependent UIs
        AttendanceUI.setDefaultDates();
        AttendanceUI.refreshDashboard();
        this.loadModuleDates();

        // Update assignment schedule date input
        const asgnRange = AssignmentData.getAssignmentRange();
        const startDateEl = document.getElementById('asgnScheduleStartDate');
        if (startDateEl) {
            startDateEl.min = asgnRange.start;
            startDateEl.max = asgnRange.end;
            if (startDateEl.value < asgnRange.start) startDateEl.value = asgnRange.start;
            if (startDateEl.value > asgnRange.end) startDateEl.value = asgnRange.end;
        }

        // Update mission info in header
        const mi = document.getElementById('missionInfo');
        if (mi && newStart && newEnd) {
            mi.textContent = `${AttendanceData.formatDisplay(newStart)} - ${AttendanceData.formatDisplay(newEnd)} (${AttendanceData.countMissionDays(newStart, newEnd)} ימים)`;
        }
    },

    savePlatoonSettings() {
    const num = parseInt(document.getElementById('settingNumPlatoons').value) || 3;
    const platoons = [];
    const existing = AttendanceData.loadPlatoons();
    for (let i = 0; i < num; i++) {
        const ex = existing[i];
        const commander = document.getElementById('pCmd_' + i).value.trim();
        const commander2 = document.getElementById('pCmd2_' + i).value.trim();
        const isMaflag = document.getElementById('pMaflag_' + i)?.checked || false;

        platoons.push({
            id: ex ? ex.id : (i + 1).toString(),
            name: document.getElementById('pName_' + i).value.trim() || ('מחלקה ' + (i + 1)),
            color: document.getElementById('pColor_' + i).value,
            commander: commander,
            commander2: commander2 || '',
            is_maflag: isMaflag
        });
    }

    // Auto-mark commanders in soldiers list
    const soldiers = AttendanceData.loadSoldiers();
    soldiers.forEach(s => {
        const pl = platoons.find(p => p.id === s.platoon_id);
        if (pl) {
            // If soldier is the platoon commander, mark as commander
            if (s.name === pl.commander || s.name === pl.commander2) {
                s.is_commander = true;
            }
        }
    });
    AttendanceData.saveSoldiers(soldiers);

    // Save company commander in settings
    const maflagPl = platoons.find(p => p.is_maflag);
    if (maflagPl && maflagPl.commander) {
        const settings = AttendanceData.loadSettings();
        settings.companyCommander = maflagPl.commander;
        settings.maflagPlatoonId = maflagPl.id;
        AttendanceData.saveSettings(settings);
    }

    AttendanceData.savePlatoons(platoons);
    Toast.show('נשמר! טוען...', 'success');
    setTimeout(() => location.reload(), 800);
},

    saveThresholdSettings() {
        const s = AttendanceData.loadSettings();
        s.thresholdCritical = parseInt(document.getElementById('settingThresholdCritical').value) || 50;
        s.thresholdWarning = parseInt(document.getElementById('settingThresholdWarning').value) || 60;
        AttendanceData.saveSettings(s);
        Toast.show('ספים נשמרו!', 'success');
    },

    saveCountingSettings() {
        const s = AttendanceData.loadSettings();
        s.countLeaveDay = document.getElementById('settingCountLeaveDay').value;
        s.countReturnDay = document.getElementById('settingCountReturnDay').value;
        s.weekendCount = document.getElementById('settingWeekendCount').value;
        AttendanceData.saveSettings(s);
        Toast.show('כללי ספירה נשמרו!', 'success');
    },

    saveTimeSettings() {
        const s = AttendanceData.loadSettings();
        s.defaultLeaveTime = document.getElementById('settingDefaultLeaveTime').value || '14:00';
        s.defaultReturnTime = document.getElementById('settingDefaultReturnTime').value || '17:00';
        s.leaveThreshold = document.getElementById('settingLeaveThreshold').value || '18:00';
        AttendanceData.saveSettings(s);
        Toast.show('שעות נשמרו!', 'success');
    },

    saveCommanderSettings() {
        const s = AttendanceData.loadSettings();
        s.minCommanders = parseInt(document.getElementById('settingMinCommanders').value) || 1;
        AttendanceData.saveSettings(s);
        Toast.show('מפקדים נשמר!', 'success');
    },

    saveRolesSettings() {
        const s = AttendanceData.loadSettings();
        const roles = [];
        let i = 0;
        while (document.getElementById('roleName_' + i)) {
            const name = document.getElementById('roleName_' + i).value.trim();
            if (name) {
                roles.push({
                    name, level: document.getElementById('roleLevel_' + i).value,
                    min: parseInt(document.getElementById('roleMin_' + i).value) || 1
                });
            }
            i++;
        }
        s.roles = roles;
        AttendanceData.saveSettings(s);
        Toast.show('תפקידים נשמרו!', 'success');
    },

    // ==================== ASSIGNMENT SETTINGS ====================
    loadAssignmentSettings() {
        const s = AssignmentData.loadSettings();
        const el = (id) => document.getElementById(id);
        if (el('settingMinRest')) el('settingMinRest').value = s.min_rest_hours || 8;
        if (el('settingDefaultDays')) el('settingDefaultDays').value = s.default_days || 7;
    },

    saveAssignmentSettings() {
        const current = AssignmentData.loadSettings();
        // Preserve module date ranges when saving other settings
        const preserved = {
            min_rest_hours: parseInt(document.getElementById('settingMinRest').value) || 8,
            default_days: parseInt(document.getElementById('settingDefaultDays').value) || 7
        };
        // Keep existing date range settings if they exist
        if (current.assignmentStart) preserved.assignmentStart = current.assignmentStart;
        if (current.assignmentEnd) preserved.assignmentEnd = current.assignmentEnd;

        AssignmentData.saveSettings(preserved);
        Toast.show('הגדרות שיבוץ נשמרו', 'success');
    }
};

// ========== export.js ========== //
/**
 * Export modules for both attendance and assignment
 */
const AttExport = {
    exportSoldierReport(soldierId) {
        if (!XLSXLoader.check()) return;
        const s = AttendanceData.loadSoldiers().find(x => x.id === soldierId);
        if (!s) return;
        const pl = AttendanceData.loadPlatoons().find(p => p.id === s.platoon_id);
        const stats = Calc.soldierMissionStats(soldierId);
        const leaves = AttendanceData.loadLeaves().filter(l => l.soldier_id === soldierId);
        const wb = XLSX.utils.book_new();
        const rows = [['☀️ SunDay - דוח אישי נוכחות'], [],
            ['שם', s.name], ['טלפון', s.phone || '-'], ['דרגה', s.rank || '-'],
            ['מחלקה', pl ? pl.name : '-'], ['מפקד', s.is_commander ? 'כן' : 'לא'],
            ['תפקידים', (s.roles || []).join(', ') || 'אין'], [],
            ['--- נוכחות ---'], ['ימי משימה', stats.totalDays], ['ימי נוכחות', stats.presentDays],
            ['ימי היעדרות', stats.absentDays], ['אחוז נוכחות', stats.pct + '%'], [],
            ['--- היעדרויות ---'], ['סיבה', 'תאריך יציאה', 'שעת יציאה', 'תאריך חזרה', 'שעת חזרה', 'הערות']];
        leaves.forEach(l => rows.push([l.reason, AttendanceData.formatDisplay(l.start_date), l.start_time || '', AttendanceData.formatDisplay(l.end_date), l.end_time || '', l.notes || '']));
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws, 'דוח');
        XLSX.writeFile(wb, `sunday_דוח_${s.name}.xlsx`);
        Toast.show('דוח יוצא', 'success');
    },

    exportPlatoonReport(pid) {
        if (!XLSXLoader.check()) return;
        const pl = AttendanceData.loadPlatoons().find(p => p.id === pid);
        if (!pl) return;
        const range = AttendanceUI.getPlRange(pid);
        if (!range.start || !range.end) { Toast.show('בחר תאריכים', 'error'); return; }
        const hm = Calc.heatmapData(pid, range.start, range.end);
        const wb = XLSX.utils.book_new();
        const headers = ['חייל', 'מפקד', 'תפקידים'];
        hm.days.forEach(d => headers.push(d.day + '/' + d.month));
        headers.push('ימי היעדרות');
        const rows = [headers];
        hm.soldiers.forEach(s => {
            const row = [s.name, s.is_commander ? 'כן' : '', (s.roles || []).join(',')];
            let absent = 0;
            hm.days.forEach(d => { const cell = hm.cells[s.id][d.dateStr]; if (cell.present) row.push('✓'); else { row.push(cell.reason || 'X'); absent++; } });
            row.push(absent); rows.push(row);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'מפת נוכחות');
        XLSX.writeFile(wb, `sunday_${pl.name}_${range.start}.xlsx`);
        Toast.show('דוח ' + pl.name + ' יוצא', 'success');
    },

    exportCompanyReport() {
        if (!XLSXLoader.check()) return;
        const range = AttendanceUI.getDashRange();
        if (!range.start || !range.end) { Toast.show('בחר תאריכים', 'error'); return; }
        const platoons = AttendanceData.loadPlatoons();
        const wb = XLSX.utils.book_new();
        const dates = AttendanceData.getDateRange(range.start, range.end);
        const today = AttendanceData.formatISO(new Date());
        const headers = ['מחלקה'];
        dates.forEach(d => headers.push(d.getDate() + '/' + (d.getMonth() + 1)));
        headers.push('ממוצע');
        const rows = [headers];
        platoons.forEach(pl => {
            const row = [pl.name]; let sum = 0, cnt = 0;
            dates.forEach(d => { const ds = AttendanceData.formatISO(d); const r = Calc.platoonDay(pl.id, ds); row.push(r.pct + '%'); if (ds <= today) { sum += r.pct; cnt++; } });
            row.push(cnt > 0 ? Math.round(sum / cnt) + '%' : ''); rows.push(row);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'נוכחות פלוגתית');
        XLSX.writeFile(wb, `sunday_דוח_פלוגתי_${range.start}.xlsx`);
        Toast.show('דוח פלוגתי יוצא', 'success');
    },

    exportPlatoonSoldiersExcel(pid) {
        if (!XLSXLoader.check()) return;
        const pl = AttendanceData.loadPlatoons().find(p => p.id === pid);
        const soldiers = AttendanceData.loadSoldiers().filter(s => s.platoon_id === pid);
        const rows = [['שם', 'טלפון', 'דרגה', 'מפקד', 'תפקידים', 'פעיל']];
        soldiers.forEach(s => rows.push([s.name, s.phone || '', s.rank || '', s.is_commander ? 'כן' : '', (s.roles || []).join(','), s.is_active !== false ? 'כן' : 'לא']));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'חיילים');
        XLSX.writeFile(wb, `sunday_חיילים_${pl ? pl.name : pid}.xlsx`);
    },

    exportAllDataExcel() {
        if (!XLSXLoader.check()) return;
        const wb = XLSX.utils.book_new();
        const soldiers = AttendanceData.loadSoldiers();
        const platoons = AttendanceData.loadPlatoons();
        const leaves = AttendanceData.loadLeaves();
        const settings = AttendanceData.loadSettings();

        const pRows = [['שם', 'צבע', 'מפקד']];
        platoons.forEach(p => pRows.push([p.name, p.color, p.commander || '']));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pRows), 'מחלקות');

        const sRows = [['שם', 'טלפון', 'דרגה', 'מחלקה', 'מפקד', 'תפקידים', 'פעיל']];
        soldiers.forEach(s => { const pl = platoons.find(p => p.id === s.platoon_id); sRows.push([s.name, s.phone || '', s.rank || '', pl ? pl.name : '', s.is_commander ? 'כן' : '', (s.roles || []).join(','), s.is_active !== false ? 'כן' : 'לא']); });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sRows), 'חיילים');

        const lRows = [['חייל', 'סיבה', 'תאריך יציאה', 'שעת יציאה', 'תאריך חזרה', 'שעת חזרה', 'הערות']];
        leaves.forEach(l => { const s = soldiers.find(x => x.id === l.soldier_id); lRows.push([s ? s.name : '', l.reason, l.start_date, l.start_time || '', l.end_date, l.end_time || '', l.notes || '']); });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lRows), 'היעדרויות');

        XLSX.writeFile(wb, `sunday_גיבוי_נוכחות_${AttendanceData.formatISO(new Date())}.xlsx`);
        Toast.show('גיבוי נוכחות יוצא!', 'success');
    },

    importAllDataExcel() {
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.xlsx,.xls';
        input.onchange = (e) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const wb = XLSX.read(ev.target.result, { type: 'binary' });
                    if (wb.SheetNames.includes('מחלקות')) {
                        const rows = XLSX.utils.sheet_to_json(wb.Sheets['מחלקות'], { defval: '' });
                        const platoons = rows.map((r, i) => ({ id: (i + 1).toString(), name: r['שם'] || ('מחלקה ' + (i + 1)), color: r['צבע'] || '#666', commander: r['מפקד'] || '' }));
                        if (platoons.length) AttendanceData.savePlatoons(platoons);
                    }
                    if (wb.SheetNames.includes('חיילים')) {
                        const sRows = XLSX.utils.sheet_to_json(wb.Sheets['חיילים'], { defval: '' });
                        const pls = AttendanceData.loadPlatoons();
                        const soldiers = sRows.map((r, i) => {
                            let pid = '1'; const pn = (r['מחלקה'] || '').toString().trim();
                            if (pn) { const f = pls.find(p => p.name === pn || p.name.includes(pn)); if (f) pid = f.id; }
                            const rolesStr = (r['תפקידים'] || '').toString().trim();
                            return { id: Date.now().toString() + '_' + i, name: (r['שם'] || '').toString().trim(), phone: (r['טלפון'] || '').toString().trim(), rank: (r['דרגה'] || '').toString().trim(), platoon_id: pid, is_active: r['פעיל'] !== 'לא', is_commander: r['מפקד'] === 'כן', roles: rolesStr ? rolesStr.split(',').map(x => x.trim()).filter(x => x) : [] };
                        }).filter(s => s.name);
                        if (soldiers.length) AttendanceData.saveSoldiers(soldiers);
                    }
                    if (wb.SheetNames.includes('היעדרויות')) {
                        const lRows = XLSX.utils.sheet_to_json(wb.Sheets['היעדרויות'], { defval: '' });
                        const allSoldiers = AttendanceData.loadSoldiers();
                        const leaves = [];
                        lRows.forEach((r, i) => {
                            const sn = (r['חייל'] || '').toString().trim();
                            const sol = allSoldiers.find(x => x.name === sn); if (!sol) return;
                            const sd = AttendanceData.parseExcelDate(r['תאריך יציאה']); const ed = AttendanceData.parseExcelDate(r['תאריך חזרה']);
                            if (!sd || !ed) return;
                            leaves.push({ id: Date.now().toString() + '_l_' + i, soldier_id: sol.id, reason: (r['סיבה'] || 'חופשה').toString().trim(), start_date: sd, start_time: (r['שעת יציאה'] || '').toString().trim() || null, end_date: ed, end_time: (r['שעת חזרה'] || '').toString().trim() || null, notes: (r['הערות'] || '').toString().trim() });
                        });
                        if (leaves.length) AttendanceData.saveLeaves(leaves);
                    }
                    Toast.show('יובא! טוען...', 'success');
                    setTimeout(() => location.reload(), 800);
                } catch (err) { Toast.show('שגיאה: ' + err.message, 'error'); }
            };
            reader.readAsBinaryString(e.target.files[0]);
        };
        input.click();
    }
};

const AssignExport = {
    exportScheduleExcel() {
        if (!XLSXLoader.check()) return;
        const schedule = AssignmentData.loadSchedule();
        if (!schedule?.data) { Toast.show('אין שיבוץ', 'warning'); return; }
        const positions = AssignmentData.getActivePositions();
        const allSoldiers = AssignmentData.getActiveSoldiers().map(s => s.name);
        const wb = XLSX.utils.book_new();
        const headers = ['תאריך', 'יום', 'שעות', ...positions.map(p => p.name), 'במנוחה'];
        const rows = [headers];
        Object.keys(schedule.data).sort((a, b) => AssignmentData.parseDate(a) - AssignmentData.parseDate(b)).forEach(dateStr => {
            Object.keys(schedule.data[dateStr]).sort().forEach(hourStr => {
                const day = AssignmentData.getDayName(AssignmentData.parseDate(dateStr));
                const row = [dateStr, day];
                let tr = hourStr; const fp = positions.find(p => schedule.data[dateStr][hourStr][p.name]); if (fp) { const pd = schedule.data[dateStr][hourStr][fp.name]; if (pd) tr = `${pd.start_time}-${pd.end_time}`; }
                row.push(tr);
                const onDuty = new Set();
                positions.forEach(pos => { const pd = schedule.data[dateStr][hourStr][pos.name]; const soldiers = pd?.soldiers || []; soldiers.forEach(s => onDuty.add(s)); row.push(soldiers.join(', ') || '-'); });
                row.push(allSoldiers.filter(s => !onDuty.has(s)).join(', '));
                rows.push(row);
            });
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = headers.map(() => ({ wch: 20 }));
        XLSX.utils.book_append_sheet(wb, ws, 'שיבוץ');
        XLSX.writeFile(wb, `sunday_שיבוץ_${new Date().toISOString().split('T')[0]}.xlsx`);
        Toast.show('שיבוץ יוצא', 'success');
    },

    exportSoldiersExcel() {
        if (!XLSXLoader.check()) return;
        const soldiers = AssignmentData.loadSoldiers();
        const rows = [['שם', 'מחלקה', 'דרגה', 'ימים חסומים', 'עמדות מועדפות', 'פעיל']];
        soldiers.forEach(s => rows.push([s.name, s.platoon_name || '', s.rank || '', (s.blocked_days || []).join(', '), (s.preferred_positions || []).join(', '), s.is_active !== false ? 'כן' : 'לא']));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'חיילים');
        XLSX.writeFile(wb, 'sunday_חיילי_שיבוץ.xlsx');
    },

    exportPositionsExcel() {
        if (!XLSXLoader.check()) return;
        const positions = AssignmentData.loadPositions();
        const rows = [['שם עמדה', 'חיילים', 'משמרת', 'התחלה', 'סיום', 'עדיפות', 'פעילה']];
        positions.forEach(p => rows.push([p.name, p.soldiers_required, p.shift_duration_hours, p.active_hours_start || 0, p.active_hours_end || 24, p.priority || 0, p.is_active !== false ? 'כן' : 'לא']));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'עמדות');
        XLSX.writeFile(wb, 'sunday_עמדות.xlsx');
    },

    exportSoldierReport(name) {
        if (!XLSXLoader.check()) return;
        const soldier = AssignmentData.loadSoldiers().find(s => s.name === name);
        if (!soldier) return;
        const tl = Scheduler.getSoldierTimeline(name);
        const rows = [['☀️ SunDay - דוח שיבוץ'], [], ['שם', name], ['שעות', Scheduler.soldierTotalHours[name] || 0], ['משמרות', (Scheduler.soldierShifts[name] || []).length], [], ['סוג', 'תאריך', 'התחלה', 'סיום', 'שעות', 'עמדה']];
        tl.forEach(t => {
            const s = new Date(t.start), e = new Date(t.end);
            rows.push([t.type === 'shift' ? 'שמירה' : 'מנוחה', AssignmentData.formatDate(s), AssignmentData.formatHour(s.getHours()), AssignmentData.formatHour(e.getHours()), t.hours, t.position || '']);
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'דוח');
        XLSX.writeFile(wb, `sunday_דוח_${name}.xlsx`);
    }
};

// ========== report-export.js ========== //
/**
 * ReportExport - מודול ייצוא דוח נוכחות
 * SunDay v4.0 Local
 * 
 * פורמט: WhatsApp-ready text / קובץ TXT
 * קבוצות: נוכחים, חסרים, חולים, יוצאים היום, חוזרים היום
 * הגדרת ספירה: יוצא/חוזר נספר כנוכח או חסר
 */
const ReportExport = {

    // ==================== הגדרות ברירת מחדל ====================
    DEFAULT_SETTINGS: {
        companyName: 'פלוגה',
        leavingCountsAs: 'absent',   // 'present' | 'absent'
        returningCountsAs: 'present' // 'present' | 'absent'
    },

    // ==================== טעינת/שמירת הגדרות ====================
    loadSettings() {
        const saved = localStorage.getItem('sunday_report_settings');
        return saved ? { ...this.DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...this.DEFAULT_SETTINGS };
    },

    saveSetting(key, value) {
        const s = this.loadSettings();
        s[key] = value;
        localStorage.setItem('sunday_report_settings', JSON.stringify(s));
    },

    loadCompanyName() {
        return this.loadSettings().companyName;
    },

    saveCompanyName(name) {
        this.saveSetting('companyName', name);
    },

    // ==================== ייצור דוח ====================

    /**
     * generateReport - מייצר אובייקט דוח
     * @param {Object} options
     *   - date: string (ISO) - יום בודד
     *   - startDate / endDate: string (ISO) - טווח
     *   - platoonIds: string[] - מזהי מחלקות (ריק = כולן)
     *   - includeAll: boolean - כל המחלקות
     * @returns {Object} reportData
     */
    generateReport(options = {}) {
        const platoons = AttendanceData.loadPlatoons();
        const allSoldiers = AttendanceData.getActiveSoldiers();
        const settings = this.loadSettings();

        // תאריכים
        let dates = [];
        if (options.date) {
            dates = [options.date];
        } else if (options.startDate && options.endDate) {
            dates = AttendanceData.getDateRange(options.startDate, options.endDate)
                .map(d => AttendanceData.formatISO(d));
        } else {
            dates = [AttendanceData.formatISO(new Date())];
        }

        // מחלקות
        let selectedPlatoons = platoons;
        if (!options.includeAll && options.platoonIds && options.platoonIds.length > 0) {
            selectedPlatoons = platoons.filter(p => options.platoonIds.includes(p.id));
        }

        const report = {
            companyName: settings.companyName,
            leavingCountsAs: settings.leavingCountsAs,
            returningCountsAs: settings.returningCountsAs,
            days: [],
            generatedAt: new Date().toISOString()
        };

        for (const dateStr of dates) {
            const dayReport = {
                date: dateStr,
                displayDate: AttendanceData.formatDisplay(dateStr),
                dayName: this._getDayName(dateStr),
                platoons: [],
                totals: { total: 0, present: 0, absent: 0 }
            };

            for (const pl of selectedPlatoons) {
                const soldiers = allSoldiers.filter(s => s.platoon_id === pl.id);
                const plReport = {
                    id: pl.id,
                    name: pl.name,
                    total: soldiers.length,
                    presentList: [],   // נוכחים
                    absentList: [],    // חסרים - באמצע העדרות (כבר בבית)
                    sickList: [],      // חולים
                    leavingList: [],   // יוצאים היום (start_date)
                    returningList: [], // חוזרים היום (end_date)
                    customGroups: {},  // סטטוסים מותאמים
                    present: 0,
                    absent: 0
                };

                // בדיקת העדרויות ישירות מרשומות ההיעדרות (לא דרך isSoldierAbsentOnDate)
                const allLeaves = AttendanceData.loadLeaves();

                for (const s of soldiers) {
                    // מצא את ההיעדרות הרלוונטית לחייל בתאריך
                    const soldierLeaves = allLeaves.filter(l =>
                        l.soldier_id === s.id && dateStr >= l.start_date && dateStr <= l.end_date
                    );

                    if (soldierLeaves.length === 0) {
                        // אין היעדרות - החייל נוכח
                        plReport.presentList.push(s.name);
                        continue;
                    }

                    const leave = soldierLeaves[0];
                    const reason = (leave.reason || '').trim();
                    const isSingleDay = leave.start_date === leave.end_date;

                    // סיווג לפי מצב ההיעדרות:
                    if (this._isSickReason(reason)) {
                        // מחלה - תמיד בנפרד
                        plReport.sickList.push(s.name);
                    }
                    else if (!isSingleDay && dateStr === leave.start_date) {
                        // יוצא היום - מתחיל העדרות
                        plReport.leavingList.push(s.name);
                    }
                    else if (!isSingleDay && dateStr === leave.end_date) {
                        // חוזר היום - מסיים העדרות
                        plReport.returningList.push(s.name);
                    }
                    else if (reason && this._findCustomGroup(reason)) {
                        // סטטוס מותאם
                        const grp = this._findCustomGroup(reason);
                        if (!plReport.customGroups[grp]) plReport.customGroups[grp] = [];
                        plReport.customGroups[grp].push(s.name);
                    }
                    else {
                        // חסר - באמצע העדרות, כבר בבית
                        plReport.absentList.push(s.name);
                    }
                }

                // ==================== שקלול סופי ====================
                // נוכחים = מי שבאמת נמצא
                let presentCount = plReport.presentList.length;
                // נעדרים = חסרים + חולים + סטטוסים מותאמים
                let absentCount = plReport.absentList.length + plReport.sickList.length;

                // סטטוסים מותאמים - נספרים כנעדרים
                for (const names of Object.values(plReport.customGroups)) {
                    absentCount += names.length;
                }

                // יוצאים היום - לפי הגדרת המשתמש
                if (settings.leavingCountsAs === 'present') {
                    presentCount += plReport.leavingList.length;
                } else {
                    absentCount += plReport.leavingList.length;
                }

                // חוזרים היום - לפי הגדרת המשתמש
                if (settings.returningCountsAs === 'present') {
                    presentCount += plReport.returningList.length;
                } else {
                    absentCount += plReport.returningList.length;
                }

                plReport.present = presentCount;
                plReport.absent = absentCount;

                dayReport.totals.total += plReport.total;
                dayReport.totals.present += presentCount;
                dayReport.totals.absent += absentCount;
                dayReport.platoons.push(plReport);
            }

            report.days.push(dayReport);
        }

        return report;
    },

    // ==================== פורמט WhatsApp ====================

    formatWhatsApp(report) {
        let text = '';

        for (const day of report.days) {
            text += `${report.companyName} ${day.dayName} ${day.displayDate}:\n\n`;

            for (const pl of day.platoons) {
                text += `*${pl.name}:*\n\n`;

                // נוכחים
                if (pl.presentList.length > 0) {
                    text += `*נוכחים (${pl.presentList.length}):*\n`;
                    pl.presentList.forEach(n => { text += `${n}\n`; });
                    text += `\n`;
                }

                // חסרים
                if (pl.absentList.length > 0) {
                    text += `*חסרים (${pl.absentList.length}):*\n`;
                    pl.absentList.forEach(n => { text += `${n}\n`; });
                    text += `\n`;
                }

                // חולים
                if (pl.sickList.length > 0) {
                    text += `*חולים (${pl.sickList.length}):*\n`;
                    pl.sickList.forEach(n => { text += `🤒 ${n}\n`; });
                    text += `\n`;
                }

                // יוצאים היום
                if (pl.leavingList.length > 0) {
                    text += `*יוצאים היום (${pl.leavingList.length}):*\n`;
                    pl.leavingList.forEach(n => { text += `${n}\n`; });
                    text += `\n`;
                }

                // חוזרים היום
                if (pl.returningList.length > 0) {
                    text += `*חוזרים היום (${pl.returningList.length}):*\n`;
                    pl.returningList.forEach(n => { text += `${n}\n`; });
                    text += `\n`;
                }

                // סטטוסים מותאמים
                for (const [grp, names] of Object.entries(pl.customGroups)) {
                    if (names.length === 0) continue;
                    text += `*${grp} (${names.length}):*\n`;
                    names.forEach(n => { text += `${n}\n`; });
                    text += `\n`;
                }

                text += `*סה"כ ${pl.name}:* ${pl.present}/${pl.total}\n`;
                text += `───────────────\n\n`;
            }

            // סיכום כללי
            if (day.platoons.length > 1) {
                text += `═══════════════\n`;
                text += `*סה"כ ${report.companyName}:* ${day.totals.present}/${day.totals.total}\n`;
            }
            text += `\n`;
        }

        return text.trim();
    },

    // ==================== פורמט TXT (מעוצב) ====================

    formatTXT(report) {
        const W = 50;
        const line = '═'.repeat(W);
        const thin = '─'.repeat(W);
        let text = '';

        for (const day of report.days) {
            text += `╔${line}╗\n`;
            text += `║  ☀️ SunDay - דוח נוכחות${' '.repeat(Math.max(0, W - 26))}║\n`;
            text += `║  ${report.companyName} | ${day.dayName} ${day.displayDate}${' '.repeat(Math.max(0, W - 30))}║\n`;
            text += `╠${line}╣\n`;

            for (const pl of day.platoons) {
                text += `║  📋 ${pl.name}${' '.repeat(Math.max(0, W - pl.name.length - 6))}║\n`;
                text += `╟${thin}╢\n`;

                const groups = [
                    { label: '✅ נוכחים', list: pl.presentList },
                    { label: '❌ חסרים', list: pl.absentList },
                    { label: '🤒 חולים', list: pl.sickList },
                    { label: '🏠 יוצאים היום', list: pl.leavingList },
                    { label: '🔙 חוזרים היום', list: pl.returningList },
                ];

                for (const [grp, names] of Object.entries(pl.customGroups)) {
                    groups.push({ label: `📌 ${grp}`, list: names });
                }

                for (const g of groups) {
                    if (g.list.length === 0) continue;
                    text += `║  ${g.label} (${g.list.length}):${' '.repeat(Math.max(0, W - g.label.length - 8))}║\n`;
                    g.list.forEach(n => {
                        text += `║     ${n}${' '.repeat(Math.max(0, W - n.length - 6))}║\n`;
                    });
                    text += `║${' '.repeat(W)}║\n`;
                }

                text += `║  📊 סה"כ: ${pl.present}/${pl.total}${' '.repeat(Math.max(0, W - 18))}║\n`;
                text += `╠${line}╣\n`;
            }

            if (day.platoons.length > 1) {
                text += `║  📊 סה"כ ${report.companyName}: ${day.totals.present}/${day.totals.total}${' '.repeat(Math.max(0, W - 30))}║\n`;
            }
            text += `╚${line}╝\n\n`;
        }

        return text.trim();
    },

    // ==================== פעולות ייצוא ====================

    async exportToClipboard(options = {}) {
        const report = this.generateReport(options);
        const text = this.formatWhatsApp(report);

        try {
            await navigator.clipboard.writeText(text);
            Toast.show('📋 הדוח הועתק ללוח! הדבק בוואטסאפ', 'success');
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            Toast.show('📋 הדוח הועתק ללוח!', 'success');
        }
        return text;
    },

    exportToFile(options = {}) {
        const report = this.generateReport(options);
        const text = this.formatTXT(report);
        const dateStr = report.days[0]?.displayDate?.replace(/\//g, '-') || 'report';

        const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `SunDay_דוח_${report.companyName}_${dateStr}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);

        Toast.show('📥 קובץ דוח הורד בהצלחה', 'success');
        return text;
    },

    previewWhatsApp(options = {}) {
        return this.formatWhatsApp(this.generateReport(options));
    },

    previewTXT(options = {}) {
        return this.formatTXT(this.generateReport(options));
    },

    // ==================== UI - דיאלוג ====================

    openExportDialog() {
        const platoons = AttendanceData.loadPlatoons();
        const today = AttendanceData.formatISO(new Date());
        const settings = this.loadSettings();

        let platoonCBs = '';
        platoons.forEach(pl => {
            platoonCBs += `<label class="report-checkbox"><input type="checkbox" value="${pl.id}" checked> ${pl.name}</label>\n`;
        });

        const html = `
        <h2>📄 ייצוא דוח נוכחות</h2>
        
        <div class="report-form">
            <div class="report-section">
                <h3>🏢 שם פלוגה</h3>
                <input type="text" id="reportCompanyName" value="${settings.companyName}" 
                    placeholder="פלוגה ג'" onchange="ReportExport.saveCompanyName(this.value)">
            </div>

            <div class="report-section">
                <h3>📅 תאריך / טווח</h3>
                <div class="report-date-mode">
                    <label class="report-radio"><input type="radio" name="reportDateMode" value="single" checked onchange="ReportExport._toggleDateMode()"> יום בודד</label>
                    <label class="report-radio"><input type="radio" name="reportDateMode" value="range" onchange="ReportExport._toggleDateMode()"> טווח ימים</label>
                </div>
                <div id="reportDateSingle">
                    <input type="date" id="reportDate" value="${today}">
                </div>
                <div id="reportDateRange" style="display:none;">
                    <label>מ: <input type="date" id="reportStartDate" value="${today}"></label>
                    <label>עד: <input type="date" id="reportEndDate" value="${today}"></label>
                </div>
            </div>

            <div class="report-section">
                <h3>🏗️ מחלקות</h3>
                <label class="report-checkbox report-checkbox-all">
                    <input type="checkbox" id="reportAllPlatoons" checked onchange="ReportExport._toggleAllPlatoons(this.checked)"> 
                    כל המחלקות
                </label>
                <div id="reportPlatoonList" class="report-platoon-list">
                    ${platoonCBs}
                </div>
            </div>

            <div class="report-section">
                <h3>⚙️ הגדרות ספירה</h3>
                <div class="report-count-settings">
                    <div class="report-count-row">
                        <span>🏠 יוצא היום נספר כ:</span>
                        <select id="reportLeavingCounts" onchange="ReportExport.saveSetting('leavingCountsAs', this.value)">
                            <option value="absent" ${settings.leavingCountsAs === 'absent' ? 'selected' : ''}>חסר</option>
                            <option value="present" ${settings.leavingCountsAs === 'present' ? 'selected' : ''}>נוכח</option>
                        </select>
                    </div>
                    <div class="report-count-row">
                        <span>🔙 חוזר היום נספר כ:</span>
                        <select id="reportReturningCounts" onchange="ReportExport.saveSetting('returningCountsAs', this.value)">
                            <option value="present" ${settings.returningCountsAs === 'present' ? 'selected' : ''}>נוכח</option>
                            <option value="absent" ${settings.returningCountsAs === 'absent' ? 'selected' : ''}>חסר</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="report-section">
                <h3>👁️ תצוגה מקדימה</h3>
                <div class="report-preview-tabs">
                    <button class="btn btn-sm btn-purple" onclick="ReportExport._showPreview('whatsapp')">📱 וואטסאפ</button>
                    <button class="btn btn-sm btn-purple-light" onclick="ReportExport._showPreview('txt')">📄 טקסט מעוצב</button>
                </div>
                <pre id="reportPreview" class="report-preview" dir="rtl"></pre>
            </div>

            <div class="report-actions">
                <button class="btn btn-success" onclick="ReportExport._exportFromDialog('clipboard')">
                    📋 העתק לוואטסאפ
                </button>
                <button class="btn btn-purple" onclick="ReportExport._exportFromDialog('file')">
                    📥 הורד קובץ TXT
                </button>
                <button class="btn btn-purple-light" onclick="App.closeDialog()">
                    ❌ סגור
                </button>
            </div>
        </div>`;

        App.openDialog(html);
    },

    // ==================== UI Helpers ====================

    _toggleDateMode() {
        const mode = document.querySelector('input[name="reportDateMode"]:checked')?.value;
        document.getElementById('reportDateSingle').style.display = mode === 'single' ? 'block' : 'none';
        document.getElementById('reportDateRange').style.display = mode === 'range' ? 'flex' : 'none';
    },

    _toggleAllPlatoons(checked) {
        document.querySelectorAll('#reportPlatoonList input[type="checkbox"]').forEach(cb => cb.checked = checked);
    },

    _getOptionsFromDialog() {
        const mode = document.querySelector('input[name="reportDateMode"]:checked')?.value;
        const options = { includeAll: document.getElementById('reportAllPlatoons').checked };

        if (mode === 'single') {
            options.date = document.getElementById('reportDate').value;
        } else {
            options.startDate = document.getElementById('reportStartDate').value;
            options.endDate = document.getElementById('reportEndDate').value;
        }

        if (!options.includeAll) {
            options.platoonIds = [];
            document.querySelectorAll('#reportPlatoonList input[type="checkbox"]:checked').forEach(cb => {
                options.platoonIds.push(cb.value);
            });
        }

        // שמור הגדרות מהדיאלוג
        const name = document.getElementById('reportCompanyName')?.value;
        if (name) this.saveCompanyName(name);

        const lc = document.getElementById('reportLeavingCounts')?.value;
        if (lc) this.saveSetting('leavingCountsAs', lc);
        const rc = document.getElementById('reportReturningCounts')?.value;
        if (rc) this.saveSetting('returningCountsAs', rc);

        return options;
    },

    _showPreview(format) {
        const options = this._getOptionsFromDialog();
        const preview = document.getElementById('reportPreview');
        preview.textContent = format === 'whatsapp'
            ? this.previewWhatsApp(options)
            : this.previewTXT(options);
    },

    _exportFromDialog(type) {
        const options = this._getOptionsFromDialog();
        if (type === 'clipboard') {
            this.exportToClipboard(options);
        } else {
            this.exportToFile(options);
        }
    },

    // ==================== עזר ====================

    /**
     * האם סיבת ההיעדרות היא מחלה?
     */
    _isSickReason(reason) {
        if (!reason) return false;
        const r = reason.toLowerCase();
        return r.includes('מחלה') || r.includes('חולה') || r.includes('sick')
            || r.includes('רפואי') || r.includes('בריאות');
    },

    /**
     * חפש סטטוס מותאם לפי סיבת ההיעדרות
     * מחזיר את שם הקבוצה או null
     */
    _findCustomGroup(reason) {
        const customGroups = this._loadCustomGroups();
        for (const grp of customGroups) {
            if (grp.label === reason || reason.includes(grp.label)) return grp.label;
        }
        return null;
    },

    _loadCustomGroups() {
        const saved = localStorage.getItem('sunday_report_custom_groups');
        return saved ? JSON.parse(saved) : [];
    },

    _saveCustomGroups(groups) {
        localStorage.setItem('sunday_report_custom_groups', JSON.stringify(groups));
    },

    addCustomGroup(label) {
        const groups = this._loadCustomGroups();
        if (groups.find(g => g.label === label)) return;
        groups.push({ label });
        this._saveCustomGroups(groups);
    },

    removeCustomGroup(label) {
        this._saveCustomGroups(this._loadCustomGroups().filter(g => g.label !== label));
    },

    _getDayName(dateStr) {
        const d = new Date(dateStr);
        const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        return 'יום ' + days[d.getDay()];
    }
};


// ========== app.js ========== //
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

        console.log('☀️ SunDay v4.0 Local מוכנה!');

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
        if (sectionName === 'reports') {
            const nameInput = document.getElementById('reportCompanyNameQuick');
            if (nameInput) nameInput.value = ReportExport.loadCompanyName();
        }
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

