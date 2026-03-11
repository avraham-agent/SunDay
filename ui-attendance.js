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
                if (item.soldier.is_commander) tags += '<span class="role-tag tag-commander">🎖️ מפקד</span>';
                (item.soldier.roles || []).forEach(role => { tags += `<span class="role-tag tag-role">${role}</span>`; });
                html += `<div class="presence-list-item"><span>${item.soldier.name}</span><div class="soldier-roles">${tags}</div></div>`;
            });
            html += '</div>';

            html += `<div class="presence-list" style="border-color:#f8d7da;"><h4 style="color:#e74c3c;">❌ נעדרים (${r.absentList.length})</h4>`;
            r.absentList.forEach(item => {
                let tags = '';
                if (item.soldier.is_commander) tags += '<span class="role-tag tag-commander">🎖️ מפקד</span>';
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
            if (item.soldier.is_commander) tags += '<span class="role-tag tag-commander">🎖️ מפקד</span>';
            (item.soldier.roles || []).forEach(role => { tags += `<span class="role-tag tag-role">${role}</span>`; });
            html += `<div class="presence-list-item"><span>${item.soldier.name}</span><div class="soldier-roles">${tags}</div></div>`;
        });
        html += '</div>';
        html += `<div class="presence-list" style="border-color:#f8d7da;"><h4 style="color:#e74c3c;">❌ נעדרים (${r.absentList.length})</h4>`;
        r.absentList.forEach(item => {
            let tags = '';
            if (item.soldier.is_commander) tags += '<span class="role-tag tag-commander">🎖️ מפקד</span>';
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
            const cmdIcon = s.is_commander ? '🎖️ ' : '';
            html += `<tr class="${inactiveClass}"${cmdStyle}>
                <td style="cursor:pointer;" onclick="AttendanceUI.openSoldierCalendarDialog('${s.id}')"><strong>${cmdIcon}${s.name}</strong></td>
                <td style="direction:ltr;">${s.phone || '-'}</td>
                <td>${s.rank || '-'}</td>
                <td><button class="btn-icon" onclick="AttendanceUI.toggleCommander('${s.id}')">${s.is_commander ? '🎖️' : '👤'}</button></td>
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
            const cmdIcon = s.is_commander ? '<span class="commander-icon">🎖️</span>' : '';
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
            const cmdIcon = sol.is_commander ? '🎖️ ' : '';
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

        let html = `<h2>📅 ${s.is_commander ? '🎖️ ' : ''}${s.name}</h2>`;
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
                        <th class="batch-th-cmd">מפקד</th>
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
            <td class="batch-center"><input type="checkbox" data-field="commander" ${active ? '' : 'disabled'}></td>
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
            toAdd.push({
                name,
                phone: row.querySelector('input[data-field="phone"]').value.trim(),
                rank: row.querySelector('input[data-field="rank"]').value.trim(),
                platoon_id: row.querySelector('select[data-field="platoon"]').value,
                is_commander: row.querySelector('input[data-field="commander"]').checked,
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
                    <option value="false"${soldier.is_commander ? '' : ' selected'}>חייל רגיל</option>
                    <option value="true"${soldier.is_commander ? ' selected' : ''}>מפקד 🎖️</option></select></div>
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
            is_commander: document.getElementById('dlgSCommander').value === 'true',
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
        if (s) { AttendanceData.updateSoldier(id, { is_commander: !s.is_commander }); this._refreshAllPlatoons(); }
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