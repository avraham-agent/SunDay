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
                    const avail = this._getAvailable(eligibleSoldiers, cur, dur, minRest, pos.name);
                    for (let i = 0; i < needed; i++) {
                        if (avail.length > 0) {
                            const s = avail.shift();
                            assigned.push(s.name);
                            this.soldierShifts[s.name].push({
                                start: new Date(cur), end: new Date(shiftEnd), position: pos.name
                            });
                            this.soldierTotalHours[s.name] += dur;
                            this.positionHistory[s.name][pos.name] = (this.positionHistory[s.name][pos.name] || 0) + 1;
                        } else {
                            this.warnings.push({
                                type: 'error',
                                message: `⚠️ ${dateStr} ${hourStr} - חסרים חיילים ל"${pos.name}" (חסרים ${needed - assigned.length})`
                            });
                        }
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

    _getAvailable(soldiers, currentTime, shiftDuration, minRestHours, positionName) {
    const available = [];

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

        const score = this._calcScore(soldier, positionName, restHoursSinceLastShift, minRestHours);
        available.push({ ...soldier, score, restHours: restHoursSinceLastShift });
    }

    available.sort((a, b) => b.score - a.score);
    return available;
},

_calcScore(soldier, positionName, restHours, minRestHours) {
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
    return workloadScore + restScore + restPenalty + diversityScore + prefBonus;
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