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
                is_commander: attS.is_commander || false,
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
                s.is_commander = attS.is_commander || false;
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
                            rotation: null
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