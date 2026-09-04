export const settings = {
    renderSettings() {
        this.main.innerHTML = `
            <section class="settings-view">
                <div class="settings-header">
                    <p class="eyebrow">ARCHIVE CONFIGURATION</p>
                    <h1>SETTINGS</h1>
                    <p class="settings-sub">Everything here lives in this browser. Account fields stay on the profile page.</p>
                </div>

                <div class="settings-section">
                    <h3 class="settings-section-title">PLAYBACK</h3>

                    <div class="settings-row">
                        <div class="settings-row-text">
                            <span class="settings-row-label">DEFAULT MIRROR</span>
                            <span class="settings-row-note">Where the player starts for every title. You can still switch per-view with NEXT SERVER.</span>
                        </div>
                        <select id="setting-default-server" class="compact-select settings-control" onchange="Alexandria.saveDefaultServer(this.value)">
                            ${this.servers.map((s, i) => `<option value="${i}" ${Number(localStorage.getItem('alexandria_activeServer') || 0) === i ? 'selected' : ''}>${this.escapeHtml(s.name)}${s.animeOnly ? ' (ANIME)' : ''}</option>`).join('')}
                        </select>
                    </div>

                    <div class="settings-row">
                        <div class="settings-row-text">
                            <span class="settings-row-label">ANIME AUDIO DEFAULT</span>
                            <span class="settings-row-note">DUB or SUB when an anime mirror loads.</span>
                        </div>
                        <div class="settings-segmented" role="group" aria-label="Anime audio default">
                            <button type="button" class="setting-opt ${this.readAudioPref() === 'dub' ? 'active' : ''}" aria-pressed="${this.readAudioPref() === 'dub'}" onclick="Alexandria.setAudioSetting('dub', this)">DUB</button>
                            <button type="button" class="setting-opt ${this.readAudioPref() !== 'dub' ? 'active' : ''}" aria-pressed="${this.readAudioPref() !== 'dub'}" onclick="Alexandria.setAudioSetting('sub', this)">SUB</button>
                        </div>
                    </div>

                    <div class="settings-row">
                        <div class="settings-row-text">
                            <span class="settings-row-label">AUTO-ADVANCE EPISODES</span>
                            <span class="settings-row-note">When an episode ends, count down five seconds to the next one. Cancel anytime.</span>
                        </div>
                        <button type="button" class="setting-toggle ${this.getPref('autoadvance') !== false ? 'on' : ''}" role="switch" aria-checked="${this.getPref('autoadvance') !== false}" onclick="Alexandria.togglePref('autoadvance', this)">
                            <span class="setting-toggle-track"><span class="setting-toggle-knob"></span></span>
                        </button>
                    </div>
                </div>

                <div class="settings-section">
                    <h3 class="settings-section-title">APPEARANCE</h3>

                    <div class="settings-row">
                        <div class="settings-row-text">
                            <span class="settings-row-label">HOVER TRAILER PREVIEWS</span>
                            <span class="settings-row-note">Muted previews when the pointer rests on a poster. Desktop only.</span>
                        </div>
                        <button type="button" class="setting-toggle ${this.getPref('trailer_hover') !== false ? 'on' : ''}" role="switch" aria-checked="${this.getPref('trailer_hover') !== false}" onclick="Alexandria.togglePref('trailer_hover', this)">
                            <span class="setting-toggle-track"><span class="setting-toggle-knob"></span></span>
                        </button>
                    </div>

                    <div class="settings-row">
                        <div class="settings-row-text">
                            <span class="settings-row-label">BLUR SPOILERS BY DEFAULT</span>
                            <span class="settings-row-note">Tagged comments and reviews start blurred until tapped. Turn off to read everything raw.</span>
                        </div>
                        <button type="button" class="setting-toggle ${this.getPref('spoiler_blur') !== false ? 'on' : ''}" role="switch" aria-checked="${this.getPref('spoiler_blur') !== false}" onclick="Alexandria.togglePref('spoiler_blur', this)">
                            <span class="setting-toggle-track"><span class="setting-toggle-knob"></span></span>
                        </button>
                    </div>
                </div>

                <div class="settings-section">
                    <h3 class="settings-section-title">DATA</h3>

                    <div class="settings-row">
                        <div class="settings-row-text">
                            <span class="settings-row-label">CONTINUE WATCHING</span>
                            <span class="settings-row-note">Wipe the resume row and per-title progress. Watchlist and watched marks stay.</span>
                        </div>
                        <button type="button" class="btn-danger" onclick="Alexandria.clearContinueWatching()">CLEAR</button>
                    </div>

                    <div class="settings-row">
                        <div class="settings-row-text">
                            <span class="settings-row-label">SEARCH HISTORY</span>
                            <span class="settings-row-note">Forget the recent-searches dropdown.</span>
                        </div>
                        <button type="button" class="btn-danger" onclick="Alexandria.clearSearchHistory()">CLEAR</button>
                    </div>

                    <div class="settings-row">
                        <div class="settings-row-text">
                            <span class="settings-row-label">LOCAL CACHES</span>
                            <span class="settings-row-note">Mirror health snapshots and the API response cache. Safe to wipe anytime.</span>
                        </div>
                        <button type="button" class="btn-secondary" onclick="Alexandria.clearLocalCaches()">CLEAR</button>
                    </div>

                    <div class="settings-row">
                        <div class="settings-row-text">
                            <span class="settings-row-label">LIST TRANSFER</span>
                            <span class="settings-row-note">Export your watchlist and history as JSON, or import Alexandria JSON / Letterboxd CSV.</span>
                        </div>
                        <div class="settings-row-actions">
                            <button type="button" class="btn-secondary" onclick="Alexandria.exportLists()">EXPORT</button>
                            <button type="button" class="btn-secondary" onclick="Alexandria.openImportExplainer()">IMPORT</button>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h3 class="settings-section-title">SYSTEM</h3>

                    <div class="settings-row">
                        <div class="settings-row-text">
                            <span class="settings-row-label">MIRROR CHECK</span>
                            <span class="settings-row-note">Reachability-test every mirror now. Results steer NEXT SERVER preference.</span>
                        </div>
                        <button type="button" class="btn-secondary" id="mirror-check-btn" onclick="Alexandria.runMirrorCheck()">CHECK NOW</button>
                    </div>

                    <div class="settings-row">
                        <div class="settings-row-text">
                            <span class="settings-row-label">WHAT'S NEW</span>
                            <span class="settings-row-note">The in-app changelog, same list the bell opens.</span>
                        </div>
                        <button type="button" class="btn-secondary" onclick="Alexandria.toggleChangelogMenu()">CHANGELOG</button>
                    </div>
                </div>
            </section>`;
    },

    saveDefaultServer(value) {
        const idx = Number.parseInt(value, 10);
        if (!Number.isInteger(idx) || !this.servers[idx]) return;
        localStorage.setItem('alexandria_activeServer', String(idx));
        this.state.activeServer = idx;
        this.showToast(`Default mirror: ${this.servers[idx].name}`);
    },

    setAudioSetting(pref, btn) {
        this.writeAudioPref(pref);
        const group = btn.closest('.settings-segmented');
        if (group) group.querySelectorAll('.setting-opt').forEach(b => {
            b.classList.toggle('active', b === btn);
            b.setAttribute('aria-pressed', String(b === btn));
        });
    },

    togglePref(key, btn) {
        const next = this.getPref(key) === false;
        this.setPref(key, next);
        btn.classList.toggle('on', next);
        btn.setAttribute('aria-checked', String(next));
        this.showToast(next ? 'Enabled.' : 'Disabled.');
    },

    clearContinueWatching() {
        this.state.history = [];
        this.writeLocalList('alexandria_history', []);
        this.showToast('Continue watching cleared.');
    },

    clearLocalCaches() {
        try {
            localStorage.removeItem('alexandria_server_health');
            this._apiCache = new Map();
        } catch { /* ignore */ }
        this.showToast('Local caches cleared.');
    },

    async runMirrorCheck() {
        const btn = document.getElementById('mirror-check-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'CHECKING…';
        }
        try {
            localStorage.removeItem('alexandria_server_health');
            await this.fetchServerHealth();
            const health = this.state.serverHealth || {};
            const down = Object.values(health).filter(ok => !ok).length;
            this.showToast(down ? `Mirror check done — ${down} mirror${down === 1 ? '' : 's'} unresponsive.` : 'Mirror check done — all mirrors responding.');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'CHECK NOW';
            }
        }
    }
};
