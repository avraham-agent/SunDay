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

                                html += `<span class="soldier-btn company-soldier-btn" data-soldier="${n}" data-platoon="${pn}" style="background:${col.light};border:2px solid ${col.bg};" title="${n} - ${pn}${rolesTip}">${cmdIcon}${n}</span>`;
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
        this.clearHighlight(); if (!n) return;
        let c = 0;
        document.querySelectorAll('#asgnCompanyScheduleGrid .company-soldier-btn').forEach(btn => {
            if (btn.dataset.soldier === n) { btn.classList.add('highlighted'); c++; }
        });
        const info = document.getElementById('asgnCompanyHighlightInfo');
        if (info) info.textContent = `${n} (${this.soldierPlatoonMap[n] || ''}) - ${c} משמרות`;
    },

    clearHighlight() {
        document.querySelectorAll('#asgnCompanyScheduleGrid .company-soldier-btn.highlighted').forEach(b => b.classList.remove('highlighted'));
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