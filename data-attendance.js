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
        soldier.is_commander = soldier.is_commander || false;
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