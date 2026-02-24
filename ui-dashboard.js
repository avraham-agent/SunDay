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