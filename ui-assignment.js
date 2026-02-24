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

        let html = '<div class="table-container"><table class="data-table"><thead><tr><th>שם</th><th>מחלקה</th><th>דרגה</th><th>תפקידים</th><th>נוכח היום</th><th>ימים חסומים</th><th>עמדות מועדפות</th><th>פעולות</th></tr></thead><tbody>';

        sorted.forEach(s => {
            const status = statusMap[s.name];
            const availBadge = status
                ? (status.available ? '<span style="color:#27ae60;font-weight:700;">✅ נוכח</span>' : `<span style="color:#e74c3c;font-weight:700;">❌ ${status.reason || 'נעדר'}</span>`)
                : '<span style="color:#999;">—</span>';
            const blockedDaysStr = (s.blocked_days || []).join(', ') || '-';
            const prefStr = (s.preferred_positions || []).join(', ') || '-';
            const cmdIcon = s.is_commander ? '🎖️ ' : '';
            const cmdStyle = s.is_commander ? ' style="background:#fffbeb;"' : '';

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

        let html = '<div class="table-container"><table class="data-table"><thead><tr><th>שם עמדה</th><th>שיוך</th><th>מחלקה/רוטציה</th><th>מספר חיילים</th><th>אורך משמרת</th><th>שעות פעילות</th><th>ימים פעילים</th><th>עדיפות</th><th>פעילה</th><th>פעולות</th></tr></thead><tbody>';

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
        displayPositions.forEach(p => html += `<th>${p.name}</th>`);
        html += '<th>😴 במנוחה</th><th>🏠 בבית</th></tr></thead><tbody>';

        let rowIndex = 0;
        Object.keys(schedule).sort((a, b) => AssignmentData.parseDate(a) - AssignmentData.parseDate(b)).forEach(dateStr => {
            Object.keys(schedule[dateStr]).sort().forEach(hourStr => {
                const day = AssignmentData.getDayName(AssignmentData.parseDate(dateStr));
                html += `<tr><td class="info-cell">${dateStr}</td><td class="info-cell">${day}</td>`;

                let timeRange = hourStr;
                const fp = displayPositions.find(p => schedule[dateStr][hourStr][p.name]);
                if (fp) { const pd = schedule[dateStr][hourStr][fp.name]; if (pd) timeRange = `${pd.start_time}-${pd.end_time}`; }
                html += `<td class="info-cell">${timeRange}</td>`;

                const onDuty = new Set();
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
                    if (soldiers.length) {
                        soldiers.forEach(n => {
                            const asgnS = allSoldiers.find(s => s.name === n);
                            const cmdIcon = asgnS?.is_commander ? '🎖️' : '';
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
                const resting = [];
                const atHome = [];
                notOnDuty.forEach(n => {
                    const bridgeCheck = Bridge.isSoldierAvailable(n, shiftDate);
                    if (bridgeCheck.available) {
                        resting.push(n);
                    } else {
                        atHome.push(n);
                    }
                });

                // עמודת מנוחה - מקובצת לפי מחלקות (חיילים ניתנים לגרירה)
                html += '<td class="rest-cell">';
                html += this._renderSoldiersByPlatoon(resting, soldierPlatoon, platoonMap, platoons, rowIndex, 'rest', dateStr, hourStr);
                html += '</td>';

                // עמודת "בבית" - מקובצת לפי מחלקות
                html += '<td class="home-cell">';
                html += this._renderSoldiersByPlatoon(atHome, soldierPlatoon, platoonMap, platoons, rowIndex, 'home');
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
    _renderSoldiersByPlatoon(soldierList, soldierPlatoon, platoonMap, platoons, rowIndex, prefix, dateStr, hourStr) {
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
            { key: 'rest',     icon: '😴', label: 'זמני מנוחה',    cssClass: '' },
            { key: 'role',     icon: '👤', label: 'בעלי תפקידים',  cssClass: '' }
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
        this.clearHighlight(); if (!name) return;
        let count = 0;
        document.querySelectorAll('#asgnScheduleGrid .soldier-btn').forEach(btn => {
            if (btn.dataset.soldier === name) { btn.classList.add('highlighted'); count++; }
        });
        document.getElementById('asgnHighlightInfo').textContent = `${name} - ${count} משמרות`;
    },

    clearHighlight() {
        document.querySelectorAll('#asgnScheduleGrid .soldier-btn.highlighted').forEach(b => b.classList.remove('highlighted'));
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