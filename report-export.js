/**
 * ReportExport - מודול ייצוא דוח נוכחות
 * SunDay v4.0 Local
 * 
 * פורמט: WhatsApp-ready text / קובץ TXT
 * קבוצות: נוכחים, חסרים, חולים, יוצאים היום, חוזרים היום
 * הגדרת ספירה: יוצא/חוזר נספר כנוכח או חסר
 */
const ReportExport = {

    // ==================== הגדרות ברירת מחדל ====================
    DEFAULT_SETTINGS: {
        companyName: 'פלוגה',
        leavingCountsAs: 'absent',   // 'present' | 'absent'
        returningCountsAs: 'present' // 'present' | 'absent'
    },

    // ==================== טעינת/שמירת הגדרות ====================
    loadSettings() {
        const saved = localStorage.getItem('sunday_report_settings');
        return saved ? { ...this.DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...this.DEFAULT_SETTINGS };
    },

    saveSetting(key, value) {
        const s = this.loadSettings();
        s[key] = value;
        localStorage.setItem('sunday_report_settings', JSON.stringify(s));
    },

    loadCompanyName() {
        return this.loadSettings().companyName;
    },

    saveCompanyName(name) {
        this.saveSetting('companyName', name);
    },

    // ==================== ייצור דוח ====================

    /**
     * generateReport - מייצר אובייקט דוח
     * @param {Object} options
     *   - date: string (ISO) - יום בודד
     *   - startDate / endDate: string (ISO) - טווח
     *   - platoonIds: string[] - מזהי מחלקות (ריק = כולן)
     *   - includeAll: boolean - כל המחלקות
     * @returns {Object} reportData
     */
    generateReport(options = {}) {
        const platoons = AttendanceData.loadPlatoons();
        const allSoldiers = AttendanceData.getActiveSoldiers();
        const settings = this.loadSettings();

        // תאריכים
        let dates = [];
        if (options.date) {
            dates = [options.date];
        } else if (options.startDate && options.endDate) {
            dates = AttendanceData.getDateRange(options.startDate, options.endDate)
                .map(d => AttendanceData.formatISO(d));
        } else {
            dates = [AttendanceData.formatISO(new Date())];
        }

        // מחלקות
        let selectedPlatoons = platoons;
        if (!options.includeAll && options.platoonIds && options.platoonIds.length > 0) {
            selectedPlatoons = platoons.filter(p => options.platoonIds.includes(p.id));
        }

        const report = {
            companyName: settings.companyName,
            leavingCountsAs: settings.leavingCountsAs,
            returningCountsAs: settings.returningCountsAs,
            days: [],
            generatedAt: new Date().toISOString()
        };

        for (const dateStr of dates) {
            const dayReport = {
                date: dateStr,
                displayDate: AttendanceData.formatDisplay(dateStr),
                dayName: this._getDayName(dateStr),
                platoons: [],
                totals: { total: 0, present: 0, absent: 0 }
            };

            for (const pl of selectedPlatoons) {
                const soldiers = allSoldiers.filter(s => s.platoon_id === pl.id);
                const plReport = {
                    id: pl.id,
                    name: pl.name,
                    total: soldiers.length,
                    presentList: [],   // נוכחים
                    absentList: [],    // חסרים - באמצע העדרות (כבר בבית)
                    sickList: [],      // חולים
                    leavingList: [],   // יוצאים היום (start_date)
                    returningList: [], // חוזרים היום (end_date)
                    customGroups: {},  // סטטוסים מותאמים
                    present: 0,
                    absent: 0
                };

                // בדיקת העדרויות ישירות מרשומות ההיעדרות (לא דרך isSoldierAbsentOnDate)
                const allLeaves = AttendanceData.loadLeaves();

                for (const s of soldiers) {
                    // מצא את ההיעדרות הרלוונטית לחייל בתאריך
                    const soldierLeaves = allLeaves.filter(l =>
                        l.soldier_id === s.id && dateStr >= l.start_date && dateStr <= l.end_date
                    );

                    if (soldierLeaves.length === 0) {
                        // אין היעדרות - החייל נוכח
                        plReport.presentList.push(s.name);
                        continue;
                    }

                    const leave = soldierLeaves[0];
                    const reason = (leave.reason || '').trim();
                    const isSingleDay = leave.start_date === leave.end_date;

                    // סיווג לפי מצב ההיעדרות:
                    if (this._isSickReason(reason)) {
                        // מחלה - תמיד בנפרד
                        plReport.sickList.push(s.name);
                    }
                    else if (!isSingleDay && dateStr === leave.start_date) {
                        // יוצא היום - מתחיל העדרות
                        plReport.leavingList.push(s.name);
                    }
                    else if (!isSingleDay && dateStr === leave.end_date) {
                        // חוזר היום - מסיים העדרות
                        plReport.returningList.push(s.name);
                    }
                    else if (reason && this._findCustomGroup(reason)) {
                        // סטטוס מותאם
                        const grp = this._findCustomGroup(reason);
                        if (!plReport.customGroups[grp]) plReport.customGroups[grp] = [];
                        plReport.customGroups[grp].push(s.name);
                    }
                    else {
                        // חסר - באמצע העדרות, כבר בבית
                        plReport.absentList.push(s.name);
                    }
                }

                // ==================== שקלול סופי ====================
                // נוכחים = מי שבאמת נמצא
                let presentCount = plReport.presentList.length;
                // נעדרים = חסרים + חולים + סטטוסים מותאמים
                let absentCount = plReport.absentList.length + plReport.sickList.length;

                // סטטוסים מותאמים - נספרים כנעדרים
                for (const names of Object.values(plReport.customGroups)) {
                    absentCount += names.length;
                }

                // יוצאים היום - לפי הגדרת המשתמש
                if (settings.leavingCountsAs === 'present') {
                    presentCount += plReport.leavingList.length;
                } else {
                    absentCount += plReport.leavingList.length;
                }

                // חוזרים היום - לפי הגדרת המשתמש
                if (settings.returningCountsAs === 'present') {
                    presentCount += plReport.returningList.length;
                } else {
                    absentCount += plReport.returningList.length;
                }

                plReport.present = presentCount;
                plReport.absent = absentCount;

                dayReport.totals.total += plReport.total;
                dayReport.totals.present += presentCount;
                dayReport.totals.absent += absentCount;
                dayReport.platoons.push(plReport);
            }

            report.days.push(dayReport);
        }

        return report;
    },

    // ==================== פורמט WhatsApp ====================

    formatWhatsApp(report) {
        let text = '';

        for (const day of report.days) {
            text += `${report.companyName} ${day.dayName} ${day.displayDate}:\n\n`;

            for (const pl of day.platoons) {
                text += `*${pl.name}:*\n\n`;

                // נוכחים
                if (pl.presentList.length > 0) {
                    text += `*נוכחים (${pl.presentList.length}):*\n`;
                    pl.presentList.forEach(n => { text += `${n}\n`; });
                    text += `\n`;
                }

                // חסרים
                if (pl.absentList.length > 0) {
                    text += `*חסרים (${pl.absentList.length}):*\n`;
                    pl.absentList.forEach(n => { text += `${n}\n`; });
                    text += `\n`;
                }

                // חולים
                if (pl.sickList.length > 0) {
                    text += `*חולים (${pl.sickList.length}):*\n`;
                    pl.sickList.forEach(n => { text += `🤒 ${n}\n`; });
                    text += `\n`;
                }

                // יוצאים היום
                if (pl.leavingList.length > 0) {
                    text += `*יוצאים היום (${pl.leavingList.length}):*\n`;
                    pl.leavingList.forEach(n => { text += `${n}\n`; });
                    text += `\n`;
                }

                // חוזרים היום
                if (pl.returningList.length > 0) {
                    text += `*חוזרים היום (${pl.returningList.length}):*\n`;
                    pl.returningList.forEach(n => { text += `${n}\n`; });
                    text += `\n`;
                }

                // סטטוסים מותאמים
                for (const [grp, names] of Object.entries(pl.customGroups)) {
                    if (names.length === 0) continue;
                    text += `*${grp} (${names.length}):*\n`;
                    names.forEach(n => { text += `${n}\n`; });
                    text += `\n`;
                }

                text += `*סה"כ ${pl.name}:* ${pl.present}/${pl.total}\n`;
                text += `───────────────\n\n`;
            }

            // סיכום כללי
            if (day.platoons.length > 1) {
                text += `═══════════════\n`;
                text += `*סה"כ ${report.companyName}:* ${day.totals.present}/${day.totals.total}\n`;
            }
            text += `\n`;
        }

        return text.trim();
    },

    // ==================== פורמט TXT (מעוצב) ====================

    formatTXT(report) {
        const W = 50;
        const line = '═'.repeat(W);
        const thin = '─'.repeat(W);
        let text = '';

        for (const day of report.days) {
            text += `╔${line}╗\n`;
            text += `║  ☀️ SunDay - דוח נוכחות${' '.repeat(Math.max(0, W - 26))}║\n`;
            text += `║  ${report.companyName} | ${day.dayName} ${day.displayDate}${' '.repeat(Math.max(0, W - 30))}║\n`;
            text += `╠${line}╣\n`;

            for (const pl of day.platoons) {
                text += `║  📋 ${pl.name}${' '.repeat(Math.max(0, W - pl.name.length - 6))}║\n`;
                text += `╟${thin}╢\n`;

                const groups = [
                    { label: '✅ נוכחים', list: pl.presentList },
                    { label: '❌ חסרים', list: pl.absentList },
                    { label: '🤒 חולים', list: pl.sickList },
                    { label: '🏠 יוצאים היום', list: pl.leavingList },
                    { label: '🔙 חוזרים היום', list: pl.returningList },
                ];

                for (const [grp, names] of Object.entries(pl.customGroups)) {
                    groups.push({ label: `📌 ${grp}`, list: names });
                }

                for (const g of groups) {
                    if (g.list.length === 0) continue;
                    text += `║  ${g.label} (${g.list.length}):${' '.repeat(Math.max(0, W - g.label.length - 8))}║\n`;
                    g.list.forEach(n => {
                        text += `║     ${n}${' '.repeat(Math.max(0, W - n.length - 6))}║\n`;
                    });
                    text += `║${' '.repeat(W)}║\n`;
                }

                text += `║  📊 סה"כ: ${pl.present}/${pl.total}${' '.repeat(Math.max(0, W - 18))}║\n`;
                text += `╠${line}╣\n`;
            }

            if (day.platoons.length > 1) {
                text += `║  📊 סה"כ ${report.companyName}: ${day.totals.present}/${day.totals.total}${' '.repeat(Math.max(0, W - 30))}║\n`;
            }
            text += `╚${line}╝\n\n`;
        }

        return text.trim();
    },

    // ==================== פעולות ייצוא ====================

    async exportToClipboard(options = {}) {
        const report = this.generateReport(options);
        const text = this.formatWhatsApp(report);

        try {
            await navigator.clipboard.writeText(text);
            Toast.show('📋 הדוח הועתק ללוח! הדבק בוואטסאפ', 'success');
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            Toast.show('📋 הדוח הועתק ללוח!', 'success');
        }
        return text;
    },

    exportToFile(options = {}) {
        const report = this.generateReport(options);
        const text = this.formatTXT(report);
        const dateStr = report.days[0]?.displayDate?.replace(/\//g, '-') || 'report';

        const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `SunDay_דוח_${report.companyName}_${dateStr}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);

        Toast.show('📥 קובץ דוח הורד בהצלחה', 'success');
        return text;
    },

    previewWhatsApp(options = {}) {
        return this.formatWhatsApp(this.generateReport(options));
    },

    previewTXT(options = {}) {
        return this.formatTXT(this.generateReport(options));
    },

    // ==================== UI - דיאלוג ====================

    openExportDialog() {
        const platoons = AttendanceData.loadPlatoons();
        const today = AttendanceData.formatISO(new Date());
        const settings = this.loadSettings();

        let platoonCBs = '';
        platoons.forEach(pl => {
            platoonCBs += `<label class="report-checkbox"><input type="checkbox" value="${pl.id}" checked> ${pl.name}</label>\n`;
        });

        const html = `
        <h2>📄 ייצוא דוח נוכחות</h2>
        
        <div class="report-form">
            <div class="report-section">
                <h3>🏢 שם פלוגה</h3>
                <input type="text" id="reportCompanyName" value="${settings.companyName}" 
                    placeholder="פלוגה ג'" onchange="ReportExport.saveCompanyName(this.value)">
            </div>

            <div class="report-section">
                <h3>📅 תאריך / טווח</h3>
                <div class="report-date-mode">
                    <label class="report-radio"><input type="radio" name="reportDateMode" value="single" checked onchange="ReportExport._toggleDateMode()"> יום בודד</label>
                    <label class="report-radio"><input type="radio" name="reportDateMode" value="range" onchange="ReportExport._toggleDateMode()"> טווח ימים</label>
                </div>
                <div id="reportDateSingle">
                    <input type="date" id="reportDate" value="${today}">
                </div>
                <div id="reportDateRange" style="display:none;">
                    <label>מ: <input type="date" id="reportStartDate" value="${today}"></label>
                    <label>עד: <input type="date" id="reportEndDate" value="${today}"></label>
                </div>
            </div>

            <div class="report-section">
                <h3>🏗️ מחלקות</h3>
                <label class="report-checkbox report-checkbox-all">
                    <input type="checkbox" id="reportAllPlatoons" checked onchange="ReportExport._toggleAllPlatoons(this.checked)"> 
                    כל המחלקות
                </label>
                <div id="reportPlatoonList" class="report-platoon-list">
                    ${platoonCBs}
                </div>
            </div>

            <div class="report-section">
                <h3>⚙️ הגדרות ספירה</h3>
                <div class="report-count-settings">
                    <div class="report-count-row">
                        <span>🏠 יוצא היום נספר כ:</span>
                        <select id="reportLeavingCounts" onchange="ReportExport.saveSetting('leavingCountsAs', this.value)">
                            <option value="absent" ${settings.leavingCountsAs === 'absent' ? 'selected' : ''}>חסר</option>
                            <option value="present" ${settings.leavingCountsAs === 'present' ? 'selected' : ''}>נוכח</option>
                        </select>
                    </div>
                    <div class="report-count-row">
                        <span>🔙 חוזר היום נספר כ:</span>
                        <select id="reportReturningCounts" onchange="ReportExport.saveSetting('returningCountsAs', this.value)">
                            <option value="present" ${settings.returningCountsAs === 'present' ? 'selected' : ''}>נוכח</option>
                            <option value="absent" ${settings.returningCountsAs === 'absent' ? 'selected' : ''}>חסר</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="report-section">
                <h3>👁️ תצוגה מקדימה</h3>
                <div class="report-preview-tabs">
                    <button class="btn btn-sm btn-purple" onclick="ReportExport._showPreview('whatsapp')">📱 וואטסאפ</button>
                    <button class="btn btn-sm btn-purple-light" onclick="ReportExport._showPreview('txt')">📄 טקסט מעוצב</button>
                </div>
                <pre id="reportPreview" class="report-preview" dir="rtl"></pre>
            </div>

            <div class="report-actions">
                <button class="btn btn-success" onclick="ReportExport._exportFromDialog('clipboard')">
                    📋 העתק לוואטסאפ
                </button>
                <button class="btn btn-purple" onclick="ReportExport._exportFromDialog('file')">
                    📥 הורד קובץ TXT
                </button>
                <button class="btn btn-purple-light" onclick="App.closeDialog()">
                    ❌ סגור
                </button>
            </div>
        </div>`;

        App.openDialog(html);
    },

    // ==================== UI Helpers ====================

    _toggleDateMode() {
        const mode = document.querySelector('input[name="reportDateMode"]:checked')?.value;
        document.getElementById('reportDateSingle').style.display = mode === 'single' ? 'block' : 'none';
        document.getElementById('reportDateRange').style.display = mode === 'range' ? 'flex' : 'none';
    },

    _toggleAllPlatoons(checked) {
        document.querySelectorAll('#reportPlatoonList input[type="checkbox"]').forEach(cb => cb.checked = checked);
    },

    _getOptionsFromDialog() {
        const mode = document.querySelector('input[name="reportDateMode"]:checked')?.value;
        const options = { includeAll: document.getElementById('reportAllPlatoons').checked };

        if (mode === 'single') {
            options.date = document.getElementById('reportDate').value;
        } else {
            options.startDate = document.getElementById('reportStartDate').value;
            options.endDate = document.getElementById('reportEndDate').value;
        }

        if (!options.includeAll) {
            options.platoonIds = [];
            document.querySelectorAll('#reportPlatoonList input[type="checkbox"]:checked').forEach(cb => {
                options.platoonIds.push(cb.value);
            });
        }

        // שמור הגדרות מהדיאלוג
        const name = document.getElementById('reportCompanyName')?.value;
        if (name) this.saveCompanyName(name);

        const lc = document.getElementById('reportLeavingCounts')?.value;
        if (lc) this.saveSetting('leavingCountsAs', lc);
        const rc = document.getElementById('reportReturningCounts')?.value;
        if (rc) this.saveSetting('returningCountsAs', rc);

        return options;
    },

    _showPreview(format) {
        const options = this._getOptionsFromDialog();
        const preview = document.getElementById('reportPreview');
        preview.textContent = format === 'whatsapp'
            ? this.previewWhatsApp(options)
            : this.previewTXT(options);
    },

    _exportFromDialog(type) {
        const options = this._getOptionsFromDialog();
        if (type === 'clipboard') {
            this.exportToClipboard(options);
        } else {
            this.exportToFile(options);
        }
    },

    // ==================== עזר ====================

    /**
     * האם סיבת ההיעדרות היא מחלה?
     */
    _isSickReason(reason) {
        if (!reason) return false;
        const r = reason.toLowerCase();
        return r.includes('מחלה') || r.includes('חולה') || r.includes('sick')
            || r.includes('רפואי') || r.includes('בריאות');
    },

    /**
     * חפש סטטוס מותאם לפי סיבת ההיעדרות
     * מחזיר את שם הקבוצה או null
     */
    _findCustomGroup(reason) {
        const customGroups = this._loadCustomGroups();
        for (const grp of customGroups) {
            if (grp.label === reason || reason.includes(grp.label)) return grp.label;
        }
        return null;
    },

    _loadCustomGroups() {
        const saved = localStorage.getItem('sunday_report_custom_groups');
        return saved ? JSON.parse(saved) : [];
    },

    _saveCustomGroups(groups) {
        localStorage.setItem('sunday_report_custom_groups', JSON.stringify(groups));
    },

    addCustomGroup(label) {
        const groups = this._loadCustomGroups();
        if (groups.find(g => g.label === label)) return;
        groups.push({ label });
        this._saveCustomGroups(groups);
    },

    removeCustomGroup(label) {
        this._saveCustomGroups(this._loadCustomGroups().filter(g => g.label !== label));
    },

    _getDayName(dateStr) {
        const d = new Date(dateStr);
        const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        return 'יום ' + days[d.getDay()];
    }
};
