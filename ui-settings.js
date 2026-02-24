/**
 * SettingsUI - UI הגדרות (משולב) - SunDay v3.0
 * עדכונים: טווחי תאריכים פר מודול, ולידציות, saveModuleDates, resetModuleDates
 */
const SettingsUI = {
    init() {
        this.loadAttendanceSettings();
        this.loadAssignmentSettings();
        this.loadModuleDates();
    },

    refresh() {
        this.loadAttendanceSettings();
        this.loadAssignmentSettings();
        this.loadModuleDates();
        App.updateSystemStatus();
    },

    // ==================== MODULE DATE RANGES ====================

    /**
     * Load module-specific date ranges into UI fields
     */
    loadModuleDates() {
        const mission = AttendanceData.getMissionRange();

        // Attendance module range
        const attStartEl = document.getElementById('settingAttStart');
        const attEndEl = document.getElementById('settingAttEnd');
        if (attStartEl && attEndEl) {
            const attRange = AttendanceData.getAttendanceRange();
            attStartEl.value = attRange.start;
            attEndEl.value = attRange.end;
            // Set min/max to mission bounds
            attStartEl.min = mission.start;
            attStartEl.max = mission.end;
            attEndEl.min = mission.start;
            attEndEl.max = mission.end;
        }

        // Assignment module range
        const asgnStartEl = document.getElementById('settingAsgnStart');
        const asgnEndEl = document.getElementById('settingAsgnEnd');
        if (asgnStartEl && asgnEndEl) {
            const asgnRange = AssignmentData.getAssignmentRange();
            asgnStartEl.value = asgnRange.start;
            asgnEndEl.value = asgnRange.end;
            // Set min/max to mission bounds
            asgnStartEl.min = mission.start;
            asgnStartEl.max = mission.end;
            asgnEndEl.min = mission.start;
            asgnEndEl.max = mission.end;
        }
    },

    /**
     * Save module-specific date range
     * @param {string} module - 'attendance' or 'assignment'
     */
    saveModuleDates(module) {
        const mission = AttendanceData.getMissionRange();

        if (!mission.start || !mission.end) {
            Toast.show('⚠️ הגדר תחילה תאריכי משימה כלליים!', 'error');
            return;
        }

        if (module === 'attendance') {
            const start = document.getElementById('settingAttStart').value;
            const end = document.getElementById('settingAttEnd').value;

            if (!start || !end) {
                Toast.show('⚠️ חובה למלא שני תאריכים!', 'error');
                return;
            }

            // Validate within mission
            if (start < mission.start || end > mission.end) {
                Toast.show('⚠️ טווח חייב להיות בתוך תאריכי המשימה!', 'error');
                return;
            }

            if (end < start) {
                Toast.show('⚠️ תאריך סיום חייב להיות אחרי התחלה!', 'error');
                return;
            }

            const s = AttendanceData.loadSettings();
            s.attendanceStart = start;
            s.attendanceEnd = end;
            AttendanceData.saveSettings(s);

            // Refresh attendance UI dates
            AttendanceUI.setDefaultDates();
            AttendanceUI.refreshDashboard();

            Toast.show('✅ טווח נוכחות נשמר!', 'success');

        } else if (module === 'assignment') {
            const start = document.getElementById('settingAsgnStart').value;
            const end = document.getElementById('settingAsgnEnd').value;

            if (!start || !end) {
                Toast.show('⚠️ חובה למלא שני תאריכים!', 'error');
                return;
            }

            // Validate within mission
            if (start < mission.start || end > mission.end) {
                Toast.show('⚠️ טווח חייב להיות בתוך תאריכי המשימה!', 'error');
                return;
            }

            if (end < start) {
                Toast.show('⚠️ תאריך סיום חייב להיות אחרי התחלה!', 'error');
                return;
            }

            const s = AssignmentData.loadSettings();
            s.assignmentStart = start;
            s.assignmentEnd = end;
            AssignmentData.saveSettings(s);

            // Update assignment schedule date input min/max
            const startDateEl = document.getElementById('asgnScheduleStartDate');
            if (startDateEl) {
                startDateEl.min = start;
                startDateEl.max = end;
                // If current value is outside new range, adjust
                if (startDateEl.value < start) startDateEl.value = start;
                if (startDateEl.value > end) startDateEl.value = end;
            }

            Toast.show('✅ טווח שיבוץ נשמר!', 'success');
        }
    },

    /**
     * Reset module date range to full mission range
     * @param {string} module - 'attendance' or 'assignment'
     */
    resetModuleDates(module) {
        const mission = AttendanceData.getMissionRange();

        if (module === 'attendance') {
            const attStartEl = document.getElementById('settingAttStart');
            const attEndEl = document.getElementById('settingAttEnd');
            if (attStartEl) attStartEl.value = mission.start;
            if (attEndEl) attEndEl.value = mission.end;

            const s = AttendanceData.loadSettings();
            delete s.attendanceStart;
            delete s.attendanceEnd;
            AttendanceData.saveSettings(s);

            // Refresh attendance UI dates
            AttendanceUI.setDefaultDates();
            AttendanceUI.refreshDashboard();

        } else if (module === 'assignment') {
            const asgnStartEl = document.getElementById('settingAsgnStart');
            const asgnEndEl = document.getElementById('settingAsgnEnd');
            if (asgnStartEl) asgnStartEl.value = mission.start;
            if (asgnEndEl) asgnEndEl.value = mission.end;

            const s = AssignmentData.loadSettings();
            delete s.assignmentStart;
            delete s.assignmentEnd;
            AssignmentData.saveSettings(s);

            // Update assignment schedule date input
            const startDateEl = document.getElementById('asgnScheduleStartDate');
            if (startDateEl) {
                startDateEl.min = mission.start;
                startDateEl.max = mission.end;
            }
        }

        Toast.show('↩️ טווח אופס לכל המשימה', 'success');
    },

    // ==================== ATTENDANCE SETTINGS ====================
    loadAttendanceSettings() {
        const s = AttendanceData.loadSettings();
        const p = AttendanceData.loadPlatoons();
        const el = (id) => document.getElementById(id);

        if (el('settingThresholdCritical')) el('settingThresholdCritical').value = s.thresholdCritical || 50;
        if (el('settingThresholdWarning')) el('settingThresholdWarning').value = s.thresholdWarning || 60;
        if (el('settingDefaultLeaveTime')) el('settingDefaultLeaveTime').value = s.defaultLeaveTime || '14:00';
        if (el('settingDefaultReturnTime')) el('settingDefaultReturnTime').value = s.defaultReturnTime || '17:00';
        if (el('settingLeaveThreshold')) el('settingLeaveThreshold').value = s.leaveThreshold || '18:00';
        if (el('settingMissionStart')) el('settingMissionStart').value = s.missionStart || '';
        if (el('settingMissionEnd')) el('settingMissionEnd').value = s.missionEnd || '';
        if (el('settingMinCommanders')) el('settingMinCommanders').value = s.minCommanders || 1;
        if (el('settingCountLeaveDay')) el('settingCountLeaveDay').value = s.countLeaveDay || 'yes';
        if (el('settingCountReturnDay')) el('settingCountReturnDay').value = s.countReturnDay || 'yes';
        if (el('settingWeekendCount')) el('settingWeekendCount').value = s.weekendCount || 'two';
        if (el('settingNumPlatoons')) el('settingNumPlatoons').value = p.length;

        this.renderPlatoonNameSettings();
        this.renderRolesSettings();
    },

   renderPlatoonNameSettings() {
    const platoons = AttendanceData.loadPlatoons();
    const allSoldiers = AttendanceData.loadSoldiers();
    const numEl = document.getElementById('settingNumPlatoons');
    if (!numEl) return;
    const num = parseInt(numEl.value) || 3;
    const colors = ['#27ae60', '#3498db', '#e67e22', '#9b59b6', '#e74c3c'];
    const c = document.getElementById('platoonNamesSettings');
    if (!c) return;
    let html = '';
    for (let i = 0; i < num; i++) {
        const ex = platoons[i];
        const pid = ex ? ex.id : (i + 1).toString();
        const defName = "מחלקה " + String.fromCharCode(1488 + i) + "'";
        const isMaflag = ex ? (ex.is_maflag === true) : false;

        // Get soldiers of this platoon for commander dropdown
        const plSoldiers = allSoldiers.filter(s => s.platoon_id === pid && s.is_active !== false);

        let cmdOptions = `<option value="">-- בחר מפקד --</option>`;
        plSoldiers.forEach(s => {
            const sel = (ex && ex.commander === s.name) ? ' selected' : '';
            cmdOptions += `<option value="${s.name}"${sel}>${s.is_commander ? '🎖️ ' : ''}${s.name}</option>`;
        });

        let cmd2Options = `<option value="">-- ללא --</option>`;
        plSoldiers.forEach(s => {
            const sel = (ex && ex.commander2 === s.name) ? ' selected' : '';
            cmd2Options += `<option value="${s.name}"${sel}>${s.is_commander ? '🎖️ ' : ''}${s.name}</option>`;
        });

        html += `<div class="setting-group" style="padding:12px;background:var(--purple-surface);border-radius:8px;margin-bottom:8px;border-right:4px solid ${ex ? ex.color : (colors[i] || '#666')};">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                <label style="min-width:70px;font-weight:700;">מחלקה ${i + 1}:</label>
                <input type="text" id="pName_${i}" value="${ex ? ex.name : defName}" style="flex:1;">
                <input type="color" id="pColor_${i}" value="${ex ? ex.color : (colors[i] || '#666')}" style="width:40px;height:34px;border:none;cursor:pointer;">
                <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;background:${isMaflag ? '#ffd700' : '#eee'};padding:4px 8px;border-radius:6px;font-weight:700;">
                    <input type="checkbox" id="pMaflag_${i}" ${isMaflag ? 'checked' : ''} onchange="SettingsUI.onMaflagChange(${i}, ${num})">
                    🏛️ מפלג
                </label>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <label style="font-size:11px;min-width:80px;">מפקד מחלקה:</label>
                <select id="pCmd_${i}" style="flex:1;min-width:120px;">${cmdOptions}</select>
                <label style="font-size:11px;min-width:80px;">מפקד נוסף:</label>
                <select id="pCmd2_${i}" style="flex:1;min-width:120px;">${cmd2Options}</select>
            </div>
            ${isMaflag ? '<div style="margin-top:6px;font-size:10px;color:#856404;background:#fff3cd;padding:4px 8px;border-radius:4px;">⭐ מפקד מחלקה זו = מפקד הפלוגה</div>' : ''}
        </div>`;
    }
    c.innerHTML = html;
},

onMaflagChange(changedIndex, numPlatoons) {
    // Only one platoon can be maflag - uncheck others
    for (let i = 0; i < numPlatoons; i++) {
        if (i !== changedIndex) {
            const cb = document.getElementById('pMaflag_' + i);
            if (cb) cb.checked = false;
        }
    }
},

    renderRolesSettings() {
        const settings = AttendanceData.loadSettings();
        const roles = settings.roles || [];
        const c = document.getElementById('rolesSettingsList');
        if (!c) return;
        let html = '';
        roles.forEach((role, i) => {
            html += `<div class="role-setting-row" id="roleRow_${i}">
                <input type="text" id="roleName_${i}" value="${role.name}" placeholder="שם תפקיד">
                <select id="roleLevel_${i}"><option value="company"${role.level === 'company' ? ' selected' : ''}>פלוגתי</option><option value="platoon"${role.level === 'platoon' ? ' selected' : ''}>מחלקתי</option></select>
                <label style="font-size:11px;">מינימום:</label><input type="number" id="roleMin_${i}" value="${role.min}" min="0" max="20">
                <button class="btn btn-danger btn-xs" onclick="SettingsUI.removeRoleSetting(${i})">🗑️</button></div>`;
        });
        c.innerHTML = html;
    },

    addRoleSetting() {
        const s = AttendanceData.loadSettings();
        s.roles = s.roles || [];
        s.roles.push({ name: '', level: 'company', min: 1 });
        AttendanceData.saveSettings(s);
        this.renderRolesSettings();
    },

    removeRoleSetting(idx) {
        const s = AttendanceData.loadSettings();
        s.roles.splice(idx, 1);
        AttendanceData.saveSettings(s);
        this.renderRolesSettings();
    },

    saveMissionSettings() {
        const s = AttendanceData.loadSettings();
        const newStart = document.getElementById('settingMissionStart').value;
        const newEnd = document.getElementById('settingMissionEnd').value;

        if (!newStart || !newEnd) {
            Toast.show('⚠️ חובה למלא שני תאריכים!', 'error');
            return;
        }

        if (newEnd < newStart) {
            Toast.show('⚠️ תאריך סיום חייב להיות אחרי התחלה!', 'error');
            return;
        }

        s.missionStart = newStart;
        s.missionEnd = newEnd;

        // If module ranges exist, validate they're still within mission
        if (s.attendanceStart && s.attendanceStart < newStart) s.attendanceStart = newStart;
        if (s.attendanceEnd && s.attendanceEnd > newEnd) s.attendanceEnd = newEnd;

        AttendanceData.saveSettings(s);

        // Also validate assignment module range
        const asgnSettings = AssignmentData.loadSettings();
        let asgnChanged = false;
        if (asgnSettings.assignmentStart && asgnSettings.assignmentStart < newStart) {
            asgnSettings.assignmentStart = newStart;
            asgnChanged = true;
        }
        if (asgnSettings.assignmentEnd && asgnSettings.assignmentEnd > newEnd) {
            asgnSettings.assignmentEnd = newEnd;
            asgnChanged = true;
        }
        if (asgnChanged) AssignmentData.saveSettings(asgnSettings);

        Toast.show('✅ משימה נשמרה!', 'success');

        // Refresh all dependent UIs
        AttendanceUI.setDefaultDates();
        AttendanceUI.refreshDashboard();
        this.loadModuleDates();

        // Update assignment schedule date input
        const asgnRange = AssignmentData.getAssignmentRange();
        const startDateEl = document.getElementById('asgnScheduleStartDate');
        if (startDateEl) {
            startDateEl.min = asgnRange.start;
            startDateEl.max = asgnRange.end;
            if (startDateEl.value < asgnRange.start) startDateEl.value = asgnRange.start;
            if (startDateEl.value > asgnRange.end) startDateEl.value = asgnRange.end;
        }

        // Update mission info in header
        const mi = document.getElementById('missionInfo');
        if (mi && newStart && newEnd) {
            mi.textContent = `${AttendanceData.formatDisplay(newStart)} - ${AttendanceData.formatDisplay(newEnd)} (${AttendanceData.countMissionDays(newStart, newEnd)} ימים)`;
        }
    },

    savePlatoonSettings() {
    const num = parseInt(document.getElementById('settingNumPlatoons').value) || 3;
    const platoons = [];
    const existing = AttendanceData.loadPlatoons();
    for (let i = 0; i < num; i++) {
        const ex = existing[i];
        const commander = document.getElementById('pCmd_' + i).value.trim();
        const commander2 = document.getElementById('pCmd2_' + i).value.trim();
        const isMaflag = document.getElementById('pMaflag_' + i)?.checked || false;

        platoons.push({
            id: ex ? ex.id : (i + 1).toString(),
            name: document.getElementById('pName_' + i).value.trim() || ('מחלקה ' + (i + 1)),
            color: document.getElementById('pColor_' + i).value,
            commander: commander,
            commander2: commander2 || '',
            is_maflag: isMaflag
        });
    }

    // Auto-mark commanders in soldiers list
    const soldiers = AttendanceData.loadSoldiers();
    soldiers.forEach(s => {
        const pl = platoons.find(p => p.id === s.platoon_id);
        if (pl) {
            // If soldier is the platoon commander, mark as commander
            if (s.name === pl.commander || s.name === pl.commander2) {
                s.is_commander = true;
            }
        }
    });
    AttendanceData.saveSoldiers(soldiers);

    // Save company commander in settings
    const maflagPl = platoons.find(p => p.is_maflag);
    if (maflagPl && maflagPl.commander) {
        const settings = AttendanceData.loadSettings();
        settings.companyCommander = maflagPl.commander;
        settings.maflagPlatoonId = maflagPl.id;
        AttendanceData.saveSettings(settings);
    }

    AttendanceData.savePlatoons(platoons);
    Toast.show('נשמר! טוען...', 'success');
    setTimeout(() => location.reload(), 800);
},

    saveThresholdSettings() {
        const s = AttendanceData.loadSettings();
        s.thresholdCritical = parseInt(document.getElementById('settingThresholdCritical').value) || 50;
        s.thresholdWarning = parseInt(document.getElementById('settingThresholdWarning').value) || 60;
        AttendanceData.saveSettings(s);
        Toast.show('ספים נשמרו!', 'success');
    },

    saveCountingSettings() {
        const s = AttendanceData.loadSettings();
        s.countLeaveDay = document.getElementById('settingCountLeaveDay').value;
        s.countReturnDay = document.getElementById('settingCountReturnDay').value;
        s.weekendCount = document.getElementById('settingWeekendCount').value;
        AttendanceData.saveSettings(s);
        Toast.show('כללי ספירה נשמרו!', 'success');
    },

    saveTimeSettings() {
        const s = AttendanceData.loadSettings();
        s.defaultLeaveTime = document.getElementById('settingDefaultLeaveTime').value || '14:00';
        s.defaultReturnTime = document.getElementById('settingDefaultReturnTime').value || '17:00';
        s.leaveThreshold = document.getElementById('settingLeaveThreshold').value || '18:00';
        AttendanceData.saveSettings(s);
        Toast.show('שעות נשמרו!', 'success');
    },

    saveCommanderSettings() {
        const s = AttendanceData.loadSettings();
        s.minCommanders = parseInt(document.getElementById('settingMinCommanders').value) || 1;
        AttendanceData.saveSettings(s);
        Toast.show('מפקדים נשמר!', 'success');
    },

    saveRolesSettings() {
        const s = AttendanceData.loadSettings();
        const roles = [];
        let i = 0;
        while (document.getElementById('roleName_' + i)) {
            const name = document.getElementById('roleName_' + i).value.trim();
            if (name) {
                roles.push({
                    name, level: document.getElementById('roleLevel_' + i).value,
                    min: parseInt(document.getElementById('roleMin_' + i).value) || 1
                });
            }
            i++;
        }
        s.roles = roles;
        AttendanceData.saveSettings(s);
        Toast.show('תפקידים נשמרו!', 'success');
    },

    // ==================== ASSIGNMENT SETTINGS ====================
    loadAssignmentSettings() {
        const s = AssignmentData.loadSettings();
        const el = (id) => document.getElementById(id);
        if (el('settingMinRest')) el('settingMinRest').value = s.min_rest_hours || 8;
        if (el('settingDefaultDays')) el('settingDefaultDays').value = s.default_days || 7;
    },

    saveAssignmentSettings() {
        const current = AssignmentData.loadSettings();
        // Preserve module date ranges when saving other settings
        const preserved = {
            min_rest_hours: parseInt(document.getElementById('settingMinRest').value) || 8,
            default_days: parseInt(document.getElementById('settingDefaultDays').value) || 7
        };
        // Keep existing date range settings if they exist
        if (current.assignmentStart) preserved.assignmentStart = current.assignmentStart;
        if (current.assignmentEnd) preserved.assignmentEnd = current.assignmentEnd;

        AssignmentData.saveSettings(preserved);
        Toast.show('הגדרות שיבוץ נשמרו', 'success');
    }
};