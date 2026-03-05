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
                    is_commander: attS.is_commander || false,
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
                s.is_commander = attS.is_commander || false;
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
                        type: 'role',
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
                        type: 'role',
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