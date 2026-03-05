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