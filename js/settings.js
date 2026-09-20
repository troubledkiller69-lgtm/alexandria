export const settings = {
    renderSettings() {
        const tab = this._settingsTab || 'playback';
        const audioDub = this.readAudioPref() === 'dub';
        const activeServer = Number(localStorage.getItem('alexandria_activeServer') || 0);
        const tabs = [
            { id: 'playback', label: 'Playback', icon: '<polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none"></polygon>' },
            { id: 'appearance', label: 'Appearance', icon: '<circle cx="12" cy="12" r="9"></circle><path d="M12 3v9l6 3"></path>' },
            { id: 'library', label: 'Library', icon: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>' },
            { id: 'system', label: 'System', icon: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>' }
        ];
        this.main.innerHTML = `
            <section class="settings-view">
                <button type="button" class="set-back" onclick="window.location.hash = '#home'" aria-label="Back to home">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    Archive
                </button>
                <div class="settings-header">
                    <div>
                        <p class="eyebrow">Archive configuration</p>
                        <h1>Settings</h1>
                        <p class="settings-sub">Tuned for this browser. Nothing here leaves your device.</p>
                    </div>
                    <span class="set-local-badge"><span class="set-pulse"></span>Local only</span>
                </div>

                <div class="set-tabs" role="tablist" aria-label="Settings sections">
                    ${tabs.map(t => `
                        <button type="button" role="tab" aria-selected="${tab === t.id}" class="set-tab ${tab === t.id ? 'active' : ''}" onclick="Alexandria.switchSettingsTab('${t.id}', this)">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${t.icon}</svg>
                            ${t.label}
                        </button>`).join('')}
                </div>

                <div class="set-panel ${tab === 'playback' ? 'active' : ''}" id="set-panel-playback" role="tabpanel">
                    <div class="set-card">
                        <div class="set-card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg></div>
                        <div class="set-card-text">
                            <span class="set-card-title">Default mirror ${this.mirrorHealthDot(activeServer)}</span>
                            <span class="set-card-note">Where every title starts playing. You can still switch per title with Next Server.</span>
                        </div>
                        <select id="setting-default-server" class="compact-select settings-control" onchange="Alexandria.saveDefaultServer(this.value)" aria-label="Default mirror">
                            ${this.servers.map((s, i) => `<option value="${i}" ${activeServer === i ? 'selected' : ''}>${this.escapeHtml(s.name)}${s.animeOnly ? ' (anime)' : ''}</option>`).join('')}
                        </select>
                    </div>

                    <div class="set-card">
                        <div class="set-card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg></div>
                        <div class="set-card-text">
                            <span class="set-card-title">Anime audio</span>
                            <span class="set-card-note">Dub or sub when an anime mirror loads.</span>
                        </div>
                        <div class="settings-segmented" role="group" aria-label="Anime audio default">
                            <button type="button" class="setting-opt ${audioDub ? 'active' : ''}" aria-pressed="${audioDub}" onclick="Alexandria.setAudioSetting('dub', this)">Dub</button>
                            <button type="button" class="setting-opt ${!audioDub ? 'active' : ''}" aria-pressed="${!audioDub}" onclick="Alexandria.setAudioSetting('sub', this)">Sub</button>
                        </div>
                    </div>

                    <div class="set-card">
                        <div class="set-card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg></div>
                        <div class="set-card-text">
                            <span class="set-card-title">Auto-advance episodes</span>
                            <span class="set-card-note">When an episode ends, count down five seconds to the next one. Cancel anytime.</span>
                        </div>
                        <button type="button" class="setting-toggle ${this.getPref('autoadvance') !== false ? 'on' : ''}" role="switch" aria-checked="${this.getPref('autoadvance') !== false}" aria-label="Auto-advance episodes" onclick="Alexandria.togglePref('autoadvance', this)">
                            <span class="setting-toggle-track"><span class="setting-toggle-knob"></span></span>
                        </button>
                    </div>
                </div>

                <div class="set-panel ${tab === 'appearance' ? 'active' : ''}" id="set-panel-appearance" role="tabpanel">
                    <div class="set-card">
                        <div class="set-card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2"></rect></svg></div>
                        <div class="set-card-text">
                            <span class="set-card-title">Hover trailer previews</span>
                            <span class="set-card-note">Muted previews when the pointer rests on a poster. Desktop only.</span>
                        </div>
                        <button type="button" class="setting-toggle ${this.getPref('trailer_hover') !== false ? 'on' : ''}" role="switch" aria-checked="${this.getPref('trailer_hover') !== false}" aria-label="Hover trailer previews" onclick="Alexandria.togglePref('trailer_hover', this)">
                            <span class="setting-toggle-track"><span class="setting-toggle-knob"></span></span>
                        </button>
                    </div>

                    <div class="set-card">
                        <div class="set-card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></div>
                        <div class="set-card-text">
                            <span class="set-card-title">Blur spoilers</span>
                            <span class="set-card-note">Tagged comments and reviews start blurred until tapped. Turn off to read everything raw.</span>
                        </div>
                        <button type="button" class="setting-toggle ${this.getPref('spoiler_blur') !== false ? 'on' : ''}" role="switch" aria-checked="${this.getPref('spoiler_blur') !== false}" aria-label="Blur spoilers by default" onclick="Alexandria.togglePref('spoiler_blur', this)">
                            <span class="setting-toggle-track"><span class="setting-toggle-knob"></span></span>
                        </button>
                    </div>
                </div>

                <div class="set-panel ${tab === 'library' ? 'active' : ''}" id="set-panel-library" role="tabpanel">
                    ${this.storageMeterHtml()}
                    <div class="set-card">
                        <div class="set-card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></div>
                        <div class="set-card-text">
                            <span class="set-card-title">List transfer</span>
                            <span class="set-card-note">Export your watchlist and history as JSON, or import Alexandria JSON / Letterboxd CSV.</span>
                        </div>
                        <div class="settings-row-actions">
                            <button type="button" class="btn-secondary" onclick="Alexandria.exportLists()">Export</button>
                            <button type="button" class="btn-secondary" onclick="Alexandria.openImportExplainer()">Import</button>
                        </div>
                    </div>

                    <div class="set-danger">
                        <p class="set-danger-title">Danger zone</p>
                        <div class="set-card set-card-danger">
                            <div class="set-card-text">
                                <span class="set-card-title">Continue watching</span>
                                <span class="set-card-note">Wipe the resume row and per-title progress. Watchlist and watched marks stay.</span>
                            </div>
                            <button type="button" class="btn-danger" onclick="Alexandria.clearContinueWatching()">Clear</button>
                        </div>
                        <div class="set-card set-card-danger">
                            <div class="set-card-text">
                                <span class="set-card-title">Search history</span>
                                <span class="set-card-note">Forget the recent-searches dropdown.</span>
                            </div>
                            <button type="button" class="btn-danger" onclick="Alexandria.clearSearchHistory()">Clear</button>
                        </div>
                        <div class="set-card set-card-danger">
                            <div class="set-card-text">
                                <span class="set-card-title">Local caches</span>
                                <span class="set-card-note">Mirror health snapshots and the API response cache. Safe to wipe anytime.</span>
                            </div>
                            <button type="button" class="btn-secondary" onclick="Alexandria.clearLocalCaches()">Clear</button>
                        </div>
                    </div>
                </div>

                <div class="set-panel ${tab === 'system' ? 'active' : ''}" id="set-panel-system" role="tabpanel">
                    <div class="set-card">
                        <div class="set-card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg></div>
                        <div class="set-card-text">
                            <span class="set-card-title">Mirror check</span>
                            <span class="set-card-note">${this.escapeHtml(this.mirrorCheckNote())}</span>
                        </div>
                        <button type="button" class="btn-secondary" id="mirror-check-btn" onclick="Alexandria.runMirrorCheck()">Check now</button>
                    </div>

                    <div class="set-card">
                        <div class="set-card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg></div>
                        <div class="set-card-text">
                            <span class="set-card-title">What's new</span>
                            <span class="set-card-note">The in-app changelog, same list the bell opens.</span>
                        </div>
                        <button type="button" class="btn-secondary" onclick="Alexandria.toggleChangelogMenu()">Changelog</button>
                    </div>

                    <div class="set-card">
                        <div class="set-card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></div>
                        <div class="set-card-text">
                            <span class="set-card-title">Your profile</span>
                            <span class="set-card-note">Avatars, bios, and follows live on the profile page, not here.</span>
                        </div>
                        <button type="button" class="btn-secondary" onclick="Alexandria.toggleAccountMenu()">Account</button>
                    </div>
                </div>

                <p class="set-footnote">Settings sync per browser, never per account. Signed in on another device? Set it up there too.</p>
            </section>`;
    },

    switchSettingsTab(name, btn) {
        this._settingsTab = name;
        document.querySelectorAll('.set-tab').forEach(t => {
            const on = t === btn;
            t.classList.toggle('active', on);
            t.setAttribute('aria-selected', String(on));
        });
        document.querySelectorAll('.set-panel').forEach(p => {
            p.classList.toggle('active', p.id === `set-panel-${name}`);
        });
    },

    mirrorHealthDot(serverIdx) {
        try {
            const server = (this.servers || [])[Number(serverIdx)];
            if (!server) return '';
            const health = this.state.serverHealth || {};
            if (!(server.name in health)) return '<span class="set-health set-health-unknown" title="Not checked yet"></span>';
            const ok = health[server.name];
            return `<span class="set-health ${ok ? 'set-health-ok' : 'set-health-down'}" title="${ok ? 'Responding' : 'Unresponsive'}"></span>`;
        } catch { return ''; }
    },

    mirrorCheckNote() {
        try {
            const cached = this.readStorageJson(localStorage, 'alexandria_server_health', null);
            if (cached?.checkedAt) {
                const mins = Math.max(0, Math.round((Date.now() - cached.checkedAt) / 60000));
                const when = mins < 1 ? 'just now' : mins === 1 ? '1 min ago' : `${mins} min ago`;
                return `Last checked ${when}. Reachability-test every mirror now — results steer Next Server preference.`;
            }
        } catch { /* ignore */ }
        return 'Reachability-test every mirror now. Results steer Next Server preference.';
    },

    storageMeterHtml() {
        let bytes = 0;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('alexandria_')) {
                    bytes += (localStorage.getItem(k) || '').length * 2;
                }
            }
        } catch { /* ignore */ }
        const kb = bytes / 1024;
        const label = kb < 1 ? `${bytes} B` : kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(2)} MB`;
        const pct = Math.min(100, Math.round((bytes / (5 * 1024 * 1024)) * 100));
        return `
            <div class="set-card set-meter">
                <div class="set-card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg></div>
                <div class="set-card-text">
                    <span class="set-card-title">Browser storage <span class="set-meter-val">${this.escapeHtml(label)}</span></span>
                    <span class="set-card-note">Watchlist, history, and caches on this device.</span>
                    <span class="set-meter-bar" aria-hidden="true"><span style="width: ${pct}%"></span></span>
                </div>
            </div>`;
    },

    saveDefaultServer(value) {
        const idx = Number.parseInt(value, 10);
        if (!Number.isInteger(idx) || !this.servers[idx]) return;
        localStorage.setItem('alexandria_activeServer', String(idx));
        this.state.activeServer = idx;
        this.showToast(`Default mirror: ${this.servers[idx].name}`);
        this._settingsTab = 'playback';
        this.renderSettings();
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
