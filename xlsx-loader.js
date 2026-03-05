/**
 * XLSX Loader - טעינה אמינה של ספריית אקסל
 */
const XLSXLoader = {
    loaded: false,

    sources: [
        'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
        'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
        'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
    ],

    async load() {
        if (typeof XLSX !== 'undefined') { this.loaded = true; return true; }
        for (let i = 0; i < this.sources.length; i++) {
            try {
                await this.loadScript(this.sources[i]);
                if (typeof XLSX !== 'undefined') {
                    this.loaded = true;
                    console.log('✅ XLSX loaded from source ' + (i + 1));
                    return true;
                }
            } catch (e) {
                console.warn('❌ Source ' + (i + 1) + ' failed');
            }
        }
        this.loaded = false;
        return false;
    },

    loadScript(url) {
        return new Promise((resolve, reject) => {
            const old = document.querySelector('script[data-xlsx]');
            if (old) old.remove();
            const s = document.createElement('script');
            s.src = url;
            s.setAttribute('data-xlsx', '1');
            s.crossOrigin = 'anonymous';
            const timeout = setTimeout(() => { s.remove(); reject(new Error('timeout')); }, 8000);
            s.onload = () => { clearTimeout(timeout); resolve(); };
            s.onerror = () => { clearTimeout(timeout); s.remove(); reject(new Error('failed')); };
            document.head.appendChild(s);
        });
    },

    check(showAlert = true) {
        if (typeof XLSX !== 'undefined') return true;
        if (showAlert) Toast.show('ספריית אקסל לא נטענה - בדוק חיבור אינטרנט', 'error');
        return false;
    }
};