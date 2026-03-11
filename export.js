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