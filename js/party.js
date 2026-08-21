export const party = {
    async renderParty() {
        if (!this.state.authUser) {
            this.showToast('Watch Party requires an account. Please sign in or create an account.');
            window.location.hash = '#home';
            this.toggleAuthModal(true, 'signup');
            return;
        }
        const { id, type, season, episode } = this.state.activeContent;
        const roomId = this.state.partyRoomId;
        const sameRoom = this.partyChannel && this.state.partyRoomId === roomId;

        // Prefer an API-capable EmbedMaster mirror so play/pause can sync.
        if (!this.servers[this.state.activeServer]?.supportsApi) {
            const alexIdx = this.servers.findIndex(s => s.name === 'Alexandria' && s.supportsApi);
            this.state.activeServer = alexIdx !== -1 ? alexIdx : Math.max(0, this.servers.findIndex(s => s.supportsApi));
        }
        const embedUrl = this.buildEmbedUrl(this.state.activeServer);
        const apiServerOptions = this.servers
            .map((s, i) => ({ ...s, index: i }))
            .filter(s => s.supportsApi)
            .map(s => `<option value="${s.index}" ${s.index === this.state.activeServer ? 'selected' : ''}>${this.escapeHtml(s.name)}</option>`)
            .join('');

        // Creator is host immediately — don't wait for presence (fixes play/pause never broadcasting).
        const isCreator = sessionStorage.getItem('alexandria_party_creator_' + roomId) === '1';
        this.isHost = isCreator || this.isHost;

        const roleLabel = this.isHost ? 'Host' : 'Guest';
        const roleClass = this.isHost ? 'party-role is-host' : 'party-role';

        this.main.innerHTML = `
            <section class="party-layout">
                <div class="party-stage">
                    <header class="party-topbar">
                        <h2 class="party-title">${this.escapeHtml(roomId)}</h2>
                        <span id="party-role-badge" class="${roleClass}">${roleLabel}</span>
                        <span id="party-users-count" class="party-users">1 here</span>
                        <label class="party-server-label">Server
                            <select id="party-server-selector" ${this.isHost ? '' : 'disabled'} onchange="Alexandria.handlePartyServerChange(this.value)">
                                ${apiServerOptions}
                            </select>
                        </label>
                        <button type="button" id="party-sync-clock" class="party-clock" title="Click to set sync time (e.g. 16:57)" onclick="Alexandria.partyEditSyncClock()" style="display: ${this.isHost ? 'inline-flex' : 'none'};">0:00</button>
                        <button type="button" id="party-play-toggle" class="btn-secondary party-play-toggle" style="display: ${this.isHost ? 'inline-flex' : 'none'};" title="Play/pause the whole room" onclick="Alexandria.partyHostCommand(Alexandria.isPartyPaused() ? 'play' : 'pause')">PAUSE</button>
                        <button type="button" id="party-guest-sync" class="party-sync-link" onclick="Alexandria.partyGuestSync()" style="display: ${this.isHost ? 'none' : 'inline-flex'};">Sync</button>
                        <span id="party-sync-clock-guest" class="party-clock party-clock--static" style="display: ${this.isHost ? 'none' : 'inline-flex'};">0:00</span>
                        <button type="button" class="btn-secondary party-invite" onclick="Alexandria.copyPartyLink()">Invite</button>
                    </header>

                    <div class="party-screen">
                        <iframe id="embedmaster_iframe" title="Watch Party" src="${embedUrl}" ${this.playerIframeFlags()}></iframe>
                        <div id="party-spectate-veil" class="party-hint" style="display: ${this.isHost ? 'none' : 'block'};">
                            Hit <strong>Play Now</strong> in the player, then Sync if needed
                        </div>
                    </div>

                    ${type === 'tv' ? `
                    <div class="party-episodes-wrap">
                        <div class="party-episode-bar">
                            <label>Season
                                <select id="party-season-selector" ${this.isHost ? '' : 'disabled'} onchange="Alexandria.partyChangeSeason(this.value)"></select>
                            </label>
                            <span id="party-ep-label" class="party-ep-now">S${season} · E${episode}</span>
                        </div>
                        <div id="party-episodes" class="party-episodes"></div>
                    </div>
                    ` : ''}
                </div>

                <aside class="party-rail">
                    <div class="party-rail-head">People</div>
                    <div class="party-people" id="party-people">
                        <div class="party-person"><span class="party-person-dot" aria-hidden="true"></span><span class="party-person-name">You</span><span class="party-person-tag party-person-tag--you">YOU</span></div>
                    </div>
                    <div class="party-rail-head">Chat</div>
                    <div class="party-chat-messages" id="party-chat-messages">
                        <div class="party-chat-msg system">You’re in.</div>
                    </div>
                    <div class="party-chat-compose">
                        <input type="text" id="party-chat-input" placeholder="Message…" maxlength="280" onkeypress="if(event.key === 'Enter') Alexandria.sendPartyChatMessage()">
                        <button type="button" class="btn-primary" onclick="Alexandria.sendPartyChatMessage()">Send</button>
                    </div>
                </aside>
            </section>`;

        if (!this.readStorage(sessionStorage, 'alexandria_nickname')) {
            let nickname = '';
            try {
                nickname = prompt('Enter a nickname for the Watch Party:') || '';
            } catch {
                nickname = '';
            }
            if (!nickname.trim()) nickname = 'Guest_' + Math.floor(Math.random() * 1000);
            this.writeStorage(sessionStorage, 'alexandria_nickname', nickname.trim().slice(0, 24));
        }
        if (!this.readStorage(sessionStorage, 'alexandria_party_uid')) {
            this.writeStorage(
                sessionStorage,
                'alexandria_party_uid',
                (typeof crypto !== 'undefined' && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : `uid_${Date.now()}_${Math.random().toString(36).slice(2)}`
            );
        }

        if (type === 'tv') {
            this.initPartyEpisodeUI(id, season, episode);
        }

        const partyFrame = document.getElementById('embedmaster_iframe');
        this.bindPartyFrame(partyFrame);
        this.scheduleEmbedTheme(partyFrame);

        if (sameRoom) {
            this.updatePartyRoleUI();
            return;
        }
        this.initPartySync(roomId);
    },

    async initPartyEpisodeUI(id, activeSeason, activeEpisode) {
        try {
            const show = await this.getJson('tv/' + id);
            const selector = document.getElementById('party-season-selector');
            if (selector && show?.seasons) {
                selector.innerHTML = show.seasons
                    .filter(s => s.season_number > 0)
                    .map(s => `<option value="${s.season_number}" ${s.season_number == activeSeason ? 'selected' : ''}>Season ${s.season_number}</option>`)
                    .join('');
                selector.disabled = !this.isHost;
            }
            await this.loadPartyEpisodes(id, activeSeason, activeEpisode);
        } catch (e) {
            console.error('Alexandria Protocol: Party episode UI failed -', e);
        }
    },

    async loadPartyEpisodes(id, season, activeEpisode) {
        this._partyEpisodesLoadedKey = `${id}|${season || 1}|${activeEpisode || 1}`;
        try {
            const data = await this.getJson('tv/' + id + '/season/' + season);
            const container = document.getElementById('party-episodes');
            if (!container) return;
            this._currentSeasonEpisodes = data.episodes || [];
            const canPick = this.isHost;
            container.innerHTML = this._currentSeasonEpisodes.map(ep => `
                <div class="episode-item ${activeEpisode == ep.episode_number ? 'active' : ''}" role="button" tabindex="0"
                     ${canPick ? `onclick="Alexandria.partySelectEpisode(${ep.episode_number})"` : 'style="cursor:default;opacity:0.7"'}>
                    <span class="ep-num">EP ${ep.episode_number}</span>
                    <span class="ep-name">${this.escapeHtml(ep.name || 'Untitled')}</span>
                </div>`).join('');
        } catch (e) {
            const container = document.getElementById('party-episodes');
            if (container) container.innerHTML = '<div class="placeholder-msg">Episodes unavailable.</div>';
        }
    },

    partyChangeSeason(newSeason) {
        if (!this.isHost) return;
        const season = Number.parseInt(newSeason, 10);
        if (!Number.isInteger(season) || season < 1) return;
        this.partySetContent({ season, episode: 1 });
    },

    partySelectEpisode(episode) {
        if (!this.isHost) return;
        const ep = Number.parseInt(episode, 10);
        if (!Number.isInteger(ep) || ep < 1) return;
        this.partySetContent({ episode: ep });
    },

    partySetContent({ season, episode } = {}) {
        if (!this.isHost || !this.partyChannel) return;
        const content = this.state.activeContent;
        if (season != null) content.season = season;
        if (episode != null) content.episode = episode;

        const { id, type } = content;
        const s = content.season || 1;
        const e = content.episode || 1;
        const frame = document.getElementById('embedmaster_iframe');
        if (frame && type === 'tv') {
            this._partyFrameReloading = true;
            frame.src = this.buildEmbedUrl(this.state.activeServer, content);
            this.bindPartyFrame(frame);
            this.armPartyEmbedWatch();
            this.scheduleHostPartyResync();
        }

        const hash = type === 'tv'
            ? `#party/${this.state.partyRoomId}/${type}/${id}/s/${s}/e/${e}`
            : `#party/${this.state.partyRoomId}/${type}/${id}`;
        history.replaceState(null, '', hash);

        const label = document.getElementById('party-ep-label');
        if (label) label.textContent = `S${s} · E${e}`;
        if (type === 'tv') this.loadPartyEpisodes(id, s, e);

        this.broadcastPartyContent();
        this.appendChatMessage('System', `Host switched to S${s}E${e}`);
    },

    broadcastPartyContent() {
        if (!this.partyChannel || !this.isHost) return;
        const { id, type, season, episode } = this.state.activeContent;
        const raw = Number(this._partyLastTime) || 0;
        this.partyChannel.send({
            type: 'broadcast',
            event: 'content_sync',
            payload: {
                type,
                id,
                season: season || 1,
                episode: episode || 1,
                serverIndex: Number(this.state.activeServer),
                time: raw,
                clock: raw,
                paused: this.isPartyPaused()
            }
        });
    },

    applyPartyContent(payload) {
        if (!payload || this.isHost) return;
        const { type, id, season, episode, time, paused, serverIndex } = payload;
        if (!type || !id) return;

        // Coerce — Realtime payloads sometimes arrive with stringified numbers.
        const idx = this.normalizeServerIndex(serverIndex);
        const serverChanged = idx != null
            && this.servers[idx]?.supportsApi
            && idx !== Number(this.state.activeServer);

        if (serverChanged) {
            this.state.activeServer = idx;
            const partySelector = document.getElementById('party-server-selector');
            if (partySelector) partySelector.value = String(idx);
        }

        const prev = this.state.activeContent;
        const changed = serverChanged
            || prev.type !== type || String(prev.id) !== String(id)
            || Number(prev.season) !== Number(season || 1)
            || Number(prev.episode) !== Number(episode || 1);

        this.state.activeContent = {
            ...prev,
            type,
            id,
            season: season || 1,
            episode: episode || 1
        };

        if (changed) {
            this._partyGuestUnlocked = false;
            this._partyFrameReloading = true;
            this._partyEmbedHealthy = false;
            const frame = document.getElementById('embedmaster_iframe');
            if (frame) {
                const nextUrl = this.buildEmbedUrl(this.state.activeServer, this.state.activeContent);
                // Force a reload even if the browser thinks the URL is unchanged.
                if (frame.src === nextUrl) frame.src = 'about:blank';
                frame.src = nextUrl;
                this.bindPartyFrame(frame);
                this.scheduleEmbedTheme(frame);
                this.armPartyEmbedWatch();
            }
            const hash = type === 'tv'
                ? `#party/${this.state.partyRoomId}/${type}/${id}/s/${season || 1}/e/${episode || 1}`
                : `#party/${this.state.partyRoomId}/${type}/${id}`;
            history.replaceState(null, '', hash);

            const label = document.getElementById('party-ep-label');
            if (label) label.textContent = `S${season || 1} · E${episode || 1}`;
            if (type === 'tv') {
                const sel = document.getElementById('party-season-selector');
                if (sel) sel.value = String(season || 1);
                this.loadPartyEpisodes(id, season || 1, episode || 1);
            }
            this.appendChatMessage('System', serverChanged
                ? 'Host switched server — reloading the same mirror…'
                : `Host switched to ${type === 'tv' ? `S${season || 1}E${episode || 1}` : 'a new title'}`);
            this.updatePartyRoleUI();
        }

        const nextAction = paused ? 'pause' : 'play';
        this._partyRemotePaused = !!paused;
        // content_sync sends raw host time (no seek lead).
        const t = this.normalizePlayerTime(time);
        const clock = payload.clock != null ? this.normalizePlayerTime(payload.clock) : t;
        this._pendingPartySync = { action: nextAction, time: t, clock, paused: !!paused, at: Date.now() };
        if (changed) {
            this.scheduleGuestPartyResync();
        } else if (this._partyGuestUnlocked && !this._partyFrameReloading) {
            setTimeout(() => this.applyRemotePlayerAction(nextAction, t, { force: true, clock }), 800);
        }
    },

    updatePartyRoleUI() {
        const badge = document.getElementById('party-role-badge');
        const veil = document.getElementById('party-spectate-veil');
        const seasonSel = document.getElementById('party-season-selector');
        const hostClock = document.getElementById('party-sync-clock');
        const guestSync = document.getElementById('party-guest-sync');
        const guestClock = document.getElementById('party-sync-clock-guest');

        if (badge) {
            badge.className = 'party-role';
            if (this.isHost) {
                badge.textContent = 'Host';
                badge.classList.add('is-host');
            } else if (this._partyGuestUnlocked) {
                badge.textContent = 'Synced';
                badge.classList.add('is-synced');
            } else {
                badge.textContent = 'Guest';
            }
        }
        if (veil) {
            veil.style.display = this.isHost ? 'none' : 'block';
            veil.innerHTML = this._partyGuestUnlocked
                ? 'Following host'
                : 'Hit <strong>Play Now</strong> in the player, then Sync if needed';
        }
        if (seasonSel) seasonSel.disabled = !this.isHost;
        const partyServerSel = document.getElementById('party-server-selector');
        if (partyServerSel) {
            partyServerSel.disabled = !this.isHost;
            partyServerSel.value = String(this.state.activeServer);
        }
        if (hostClock) hostClock.style.display = this.isHost ? 'inline-flex' : 'none';
        if (guestSync) guestSync.style.display = this.isHost ? 'none' : 'inline-flex';
        if (guestClock) guestClock.style.display = this.isHost ? 'none' : 'inline-flex';
        const playToggle = document.getElementById('party-play-toggle');
        if (playToggle) {
            playToggle.style.display = this.isHost ? 'inline-flex' : 'none';
            playToggle.textContent = this.isPartyPaused() ? 'PLAY' : 'PAUSE';
        }

        const { id, type, season, episode } = this.state.activeContent;
        if (type === 'tv' && id) {
            const key = `${id}|${season || 1}|${episode || 1}`;
            if (this._partyEpisodesLoadedKey !== key) {
                this._partyEpisodesLoadedKey = key;
                this.loadPartyEpisodes(id, season, episode);
            }
        }
    },

    renderPartyPeople(hostKey) {
        const container = document.getElementById('party-people');
        if (!container || !this.partyChannel) return;
        const uid = sessionStorage.getItem('alexandria_party_uid');
        const state = this.partyChannel.presenceState();
        const keys = Object.keys(state);
        const rows = keys.map((key) => {
            const p = state[key]?.[0];
            const name = p?.nickname || 'Guest';
            const isHost = key === hostKey;
            const isYou = key === uid;
            return `<div class="party-person">
                <span class="party-person-dot${isHost ? ' is-host' : ''}" aria-hidden="true"></span>
                <span class="party-person-name">${this.escapeHtml(name)}</span>
                ${isHost ? '<span class="party-person-tag">HOST</span>' : ''}
                ${isYou && !isHost ? '<span class="party-person-tag party-person-tag--you">YOU</span>' : ''}
            </div>`;
        }).join('');
        container.innerHTML = rows || '<div class="party-person"><span class="party-person-name">Just you</span></div>';
    },

    partyHostCommand(action) {
        if (!this.isHost) return;
        // Collect the best player timestamp BEFORE pausing (pause often stops time events).
        this.collectHostTime(action === 'pause' ? 1000 : 700).then((time) => {
            const frame = document.getElementById('embedmaster_iframe');
            this._suppressHostBroadcastUntil = Date.now() + 1500;

            const safeTime = typeof time === 'number' ? time : 0;
            // Never seek the room to ~0 while the host is clearly mid-watch.
            const canSeekRoom = safeTime >= 5;

            if (action === 'play') {
                this.postToEmbed(frame, 'play');
                this.setPartyPaused(false);
                this._partyLastTimeAt = Date.now();
                this.sendPlayerSync('play', canSeekRoom ? safeTime : this.getHostPlaybackTime(), {
                    force: true,
                    noSeek: !canSeekRoom
                });
            } else if (action === 'pause') {
                this.postToEmbed(frame, 'pause');
                this.setPartyPaused(true);
                if (canSeekRoom) this.notePartyTime(safeTime);
                this.sendPlayerSync('pause', canSeekRoom ? safeTime : this.getHostPlaybackTime(), {
                    force: true,
                    noSeek: !canSeekRoom
                });
            }

            const stamp = this.formatTime(Math.floor(canSeekRoom ? safeTime : this.getHostPlaybackTime()));
            this.showToast(`${action === 'play' ? 'Play' : 'Pause'} @ ${stamp}`);
            if (!canSeekRoom) {
                this.showToast('Sync time looks wrong — click the clock and type what the player shows (e.g. 16:57)');
            }
            this.tickPartyClock();
        });
    },

    partyEditSyncClock() {
        if (!this.isHost) return;
        const current = this.formatTime(Math.floor(this.getHostPlaybackTime() || 0));
        let raw = '';
        try {
            raw = prompt('Enter the time showing on the player (e.g. 16:57 or 1:05:30):', current) || '';
        } catch {
            return;
        }
        const seconds = this.parseTimestampInput(raw);
        if (seconds == null) {
            this.showToast('Could not read that time');
            return;
        }
        this.notePartyTime(seconds, { force: true });
        this.tickPartyClock();
        if (this.isHost && this.partyChannel) {
            const action = this.isPartyPaused() ? 'pause' : 'sync';
            this.sendPlayerSync(action, seconds, { force: true });
        }
        this.showToast(`Sync position set to ${this.formatTime(Math.floor(seconds))}`);
    },

    parseTimestampInput(value) {
        if (value == null) return null;
        const text = String(value).trim();
        if (!text) return null;
        if (/^\d+(\.\d+)?$/.test(text)) {
            const n = Number(text);
            return Number.isFinite(n) && n >= 0 ? n : null;
        }
        const parts = text.split(':').map(p => Number(p));
        if (parts.length < 2 || parts.length > 3 || parts.some(p => !Number.isFinite(p) || p < 0)) return null;
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    },

    partyGuestSync() {
        if (this.isHost) return;
        this._partyGuestUnlocked = true;
        this.updatePartyRoleUI();

        const frame = document.getElementById('embedmaster_iframe');
        this.postToEmbed(frame, 'play');

        if (this.partyChannel) {
            const fromUid = sessionStorage.getItem('alexandria_party_uid');
            this.partyChannel.send({
                type: 'broadcast',
                event: 'sync_request',
                payload: { fromUid }
            });
        }

        const pending = this._pendingPartySync;
        if (pending && pending.time >= 1) {
            this.applyRemotePlayerAction(pending.action, pending.time, {
                force: true,
                clock: pending.clock
            });
            this.showToast(`Syncing @ ${this.formatTime(Math.floor(pending.clock ?? pending.time))}…`);
        } else {
            this.showToast('Asking host for timestamp…');
        }
    },

    normalizePlayerTime(t) {
        let n = typeof t === 'number' ? t : Number(t);
        if (!Number.isFinite(n) || n < 0) return 0;
        // Some builds report milliseconds.
        if (n > 36000) n = n / 1000;
        return n;
    },

    notePartyTime(t, opts = {}) {
        const n = this.normalizePlayerTime(t);
        if (!Number.isFinite(n) || n < 0) return false;

        // Critical: never let 0:00 poll replies wipe a real mid-movie clock.
        const known = Number(this._partyLastTime) || 0;
        if (n < 1 && known >= 1 && !opts.force) {
            // #region agent log
            this._dbg('B', 'script.js:notePartyTime', 'reject near-zero wipe', { n, known, force: !!opts.force });
            // #endregion
            return false;
        }

        // Reject absurd forward jumps (duration / buffer mistaken as currentTime).
        if (!opts.force && known >= 5) {
            const elapsed = (!this.isPartyPaused() && this._partyLastTimeAt)
                ? (Date.now() - this._partyLastTimeAt) / 1000
                : 0;
            if (n > known + elapsed + 12) {
                // #region agent log
                this._dbg('B', 'script.js:notePartyTime', 'reject absurd jump', { n, known, elapsed, force: !!opts.force });
                // #endregion
                return false;
            }
        }

        this._partyLastTime = n;
        // Only refresh the wall-clock anchor while actually playing.
        if (!this.isPartyPaused()) this._partyLastTimeAt = Date.now();
        this.tickPartyClock();
        return true;
    },

    isPartyPaused() {
        if (this.isHost) {
            return this._partyPaused === true || this._partyLastAction === 'pause';
        }
        return this._partyRemotePaused === true
            || this._pendingPartySync?.action === 'pause'
            || this._pendingPartySync?.paused === true;
    },

    setPartyPaused(paused, opts = {}) {
        const next = !!paused;
        this._partyPaused = next;
        if (next) {
            this._partyLastAction = 'pause';
            this._partyPausedViaStall = !!opts.viaStall;
            this._partyLastTimeAt = Date.now();
        } else {
            this._partyPausedViaStall = false;
            if (this._partyLastAction === 'pause' || !this._partyLastAction) {
                this._partyLastAction = 'play';
            }
            this._partyLastTimeAt = Date.now();
        }
        this.updatePartyPlayToggle();
    },

    updatePartyPlayToggle() {
        const btn = document.getElementById('party-play-toggle');
        if (btn) btn.textContent = this.isPartyPaused() ? 'PLAY' : 'PAUSE';
    },

    getHostPlaybackTime() {
        let t = Number(this._partyLastTime) || 0;
        // Frozen while paused — do not invent progress from wall time.
        if (!this.isPartyPaused() && this._partyLastTimeAt) {
            t += (Date.now() - this._partyLastTimeAt) / 1000;
        }
        return Math.max(0, t);
    },

    tickPartyClock() {
        const hostEl = document.getElementById('party-sync-clock');
        const guestEl = document.getElementById('party-sync-clock-guest');
        let t;
        if (this.isHost) {
            t = this.getHostPlaybackTime();
        } else {
            const pending = this._pendingPartySync;
            // Prefer clock (raw host time) — never the seek-lead time.
            t = Number(pending?.clock);
            if (!Number.isFinite(t)) {
                t = Number(pending?.time) || 0;
                if (pending && pending.action !== 'pause' && !pending.paused) {
                    t = Math.max(0, t - this._PARTY_SYNC_LEAD_SEC);
                }
            }
            if (pending && !this.isPartyPaused() && pending.at) {
                t += (Date.now() - pending.at) / 1000;
            }
        }
        const label = this.formatTime(Math.floor(Math.max(0, t || 0)));
        if (hostEl) hostEl.textContent = label;
        if (guestEl) guestEl.textContent = label;
        // #region agent log
        const now = Date.now();
        if (!this._dbgLastClockLog || now - this._dbgLastClockLog > 2000) {
            this._dbgLastClockLog = now;
            const pending = this._pendingPartySync;
            this._dbg('A', 'script.js:tickPartyClock', 'clock tick', {
                displaySec: Math.floor(t || 0),
                label,
                lastTime: this._partyLastTime,
                lastTimeAtAgeMs: this._partyLastTimeAt ? now - this._partyLastTimeAt : null,
                pendingClock: pending?.clock,
                pendingTime: pending?.time,
                pendingAction: pending?.action,
                lead: this._PARTY_SYNC_LEAD_SEC
            });
        }
        // #endregion
    },

    harvestEmbedTimes(data, depth = 0, out = [], keyHint = '') {
        if (depth > 6 || data == null) return out;
        if (typeof data === 'number' && Number.isFinite(data)) {
            const n = this.normalizePlayerTime(data);
            // Skip tiny / absurd values; duration-like huge jumps filtered later.
            if (n >= 1 && n < 43200) out.push({ t: n, key: keyHint });
            return out;
        }
        if (typeof data === 'string') {
            const asNum = Number(data);
            if (Number.isFinite(asNum)) return this.harvestEmbedTimes(asNum, depth + 1, out, keyHint);
            try { return this.harvestEmbedTimes(JSON.parse(data), depth + 1, out, keyHint); } catch { return out; }
        }
        if (typeof data !== 'object') return out;

        // Prefer playhead keys; avoid duration/buffer fields.
        for (const [key, value] of Object.entries(data)) {
            if (/duration|buffered|seekable|length|total/i.test(key)) continue;
            if (/^(time|currentTime|current|position|seconds|sec|answer)$/i.test(key)
                || (/time|current|position/i.test(key) && !/duration|buffer/i.test(key))) {
                this.harvestEmbedTimes(value, depth + 1, out, key);
            } else if (value && typeof value === 'object') {
                this.harvestEmbedTimes(value, depth + 1, out, keyHint);
            }
        }
        return out;
    },

    pickBestEmbedTime(samples) {
        if (!samples?.length) return null;
        const times = samples.map(s => (typeof s === 'number' ? s : s.t)).filter(t => Number.isFinite(t));
        if (!times.length) return null;

        const known = Number(this._partyLastTime) || 0;
        if (known >= 5) {
            const near = times.filter(t => Math.abs(t - known) <= 90);
            if (near.length) {
                return near.reduce((a, b) => (Math.abs(a - known) <= Math.abs(b - known) ? a : b));
            }
        }

        // Prefer explicit playhead keys over generic "answer"/nested junk.
        const preferred = samples.filter(s => s && /^(time|currentTime|current|position)$/i.test(s.key || ''));
        if (preferred.length) {
            const pts = preferred.map(s => s.t).filter(Number.isFinite).sort((a, b) => a - b);
            if (pts.length) return pts[Math.floor(pts.length / 2)];
        }

        // Median avoids grabbing an outlier duration that slipped through.
        const sorted = [...times].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    },

    ingestEmbedTimePayload(data) {
        // PlayerJS paused replies: { answer: true/false } paired with recent paused request,
        // or explicit paused fields in EmbedMaster payloads.
        if (data && typeof data === 'object') {
            const pausedHint = data.paused ?? data.isPaused ?? data.data?.paused;
            if (typeof pausedHint === 'boolean' && this.isHost) {
                this.setPartyPaused(pausedHint);
            }
            // PlayerJS often returns { api: 'paused', answer: true }
            if ((data.api === 'paused' || data.api === 'getPaused') && typeof data.answer === 'boolean') {
                if (this.isHost) this.setPartyPaused(data.answer);
            }
            // Standard PlayerJS getter replies: { event: 'getPaused', value/answer: bool }
            if (data.event === 'getPaused' || data.event === 'paused') {
                const v = typeof data.value === 'boolean' ? data.value : (typeof data.answer === 'boolean' ? data.answer : undefined);
                if (typeof v === 'boolean' && this.isHost) this.setPartyPaused(v);
            }
        }

        const samples = this.harvestEmbedTimes(data);
        const best = this.pickBestEmbedTime(samples);
        // #region agent log
        const _nowIngest = Date.now();
        if (samples.length && (!this._dbgLastIngestLog || _nowIngest - this._dbgLastIngestLog > 2500)) {
            this._dbgLastIngestLog = _nowIngest;
            this._dbg('A', 'script.js:ingestEmbedTimePayload', 'embed time harvest', {
                sampleCount: samples.length,
                samples: samples.slice(0, 8),
                best,
                prev: this._partyLastTime,
                api: data?.api,
                event: data?.event,
                source: data?.source
            });
        }
        // #endregion
        if (best != null && best >= 1) {
            const prev = Number(this._partyLastTime) || 0;
            this.notePartyTime(best);

            // Stall detection: same stamp repeatedly mid-watch ⇒ player is paused
            // (some shows like Z Nation never fire a pause event).
            if (prev >= 5 && Math.abs(best - prev) < 0.4) {
                this._partyTimeStallCount = (this._partyTimeStallCount || 0) + 1;
                if (this._partyTimeStallCount >= 2) this.setPartyPaused(true, { viaStall: true });
            } else if (best > prev + 0.6) {
                this._partyTimeStallCount = 0;
                // Only auto-resume the clock if pause was inferred from a stall.
                if (this._partyPausedViaStall) this.setPartyPaused(false);
            }
            return best;
        }
        return null;
    },

    // PlayerJS time REQUEST only — never send EmbedMaster command "time"
    // (that can be treated like seek/set and zero the clock).
    requestPlayerTime(frame) {
        if (!frame?.contentWindow) return;
        const win = frame.contentWindow;
        // Standard PlayerJS getter — needs the `context` field or a strict
        // player ignores it. `time`/`getTime`/bare `{api:...}` all returned nothing.
        win.postMessage({ context: 'player.js', version: '0.0.10', method: 'getCurrentTime', listener: 'alexandria_time' }, '*');
        win.postMessage({ api: 'getCurrentTime' }, '*');
        win.postMessage({ method: 'getCurrentTime' }, '*');
    },

    requestPlayerPaused(frame) {
        if (!frame?.contentWindow) return;
        const win = frame.contentWindow;
        win.postMessage({ context: 'player.js', version: '0.0.10', method: 'getPaused', listener: 'alexandria_paused' }, '*');
        win.postMessage({ api: 'getPaused' }, '*');
        win.postMessage({ method: 'getPaused' }, '*');
    },

    // PlayerJS only fires events after the parent subscribes (except play/pause,
    // which EmbedMaster emits on its own). Subscribe so `timeupdate`/`progress`
    // actually fire — without them the host clock never gets a real timestamp.
    subscribeToPlayerEvents(frame) {
        if (!frame?.contentWindow) return;
        const win = frame.contentWindow;
        const events = ['timeupdate', 'progress', 'play', 'pause', 'seek', 'ended'];
        for (const name of events) {
            win.postMessage({ context: 'player.js', version: '0.0.10', method: 'addEventListener', value: name }, '*');
            win.postMessage({ api: 'addEventListener', set: name }, '*');
        }
    },

    collectHostTime(ms = 900) {
        return new Promise((resolve) => {
            const frame = document.getElementById('embedmaster_iframe');
            let best = this.getHostPlaybackTime();

            const onMsg = (event) => {
                const originOk = this.isTrustedEmbedOrigin(event.origin);
                const em = event.data?.source === 'embedmaster_player';
                const pjs = event.data?.answer !== undefined;
                if (!originOk && !em && !pjs) return;
                const got = this.ingestEmbedTimePayload(event.data);
                if (typeof got === 'number' && got > best) best = got;
            };

            window.addEventListener('message', onMsg);
            const iv = setInterval(() => this.requestPlayerTime(frame), 120);
            this.requestPlayerTime(frame);

            setTimeout(() => {
                clearInterval(iv);
                window.removeEventListener('message', onMsg);
                if (best >= 1) this.notePartyTime(best);
                resolve(best);
            }, ms);
        });
    },

    queryEmbedTime(timeoutMs = 700) {
        return this.collectHostTime(timeoutMs).then((t) => (t >= 1 ? t : null));
    },

    async resolveHostTime() {
        const estimated = this.getHostPlaybackTime();
        const polled = await this.collectHostTime(800);
        if (typeof polled === 'number' && polled >= 5) {
            if (polled >= estimated - 2) return polled;
        }
        return estimated >= 1 ? estimated : (polled || 0);
    },

    // Try to recolor EmbedMaster/PlayerJS UI (play button etc.) to Alexandria red.
    themeEmbedPlayer(frame) {
        if (!frame?.contentWindow) return;
        const win = frame.contentWindow;
        const red = '#8a0303';
        for (const key of ['color1', 'color2', 'color3']) {
            win.postMessage({ api: key, set: red }, '*');
            win.postMessage({ source: 'embedmaster_player_command', command: key, value: red }, '*');
        }
    },

    scheduleEmbedTheme(frame) {
        if (!frame) return;
        const paint = () => {
            this.themeEmbedPlayer(frame);
            this.subscribeToPlayerEvents(frame);
        };
        paint();
        setTimeout(paint, 400);
        setTimeout(paint, 1200);
        setTimeout(paint, 2500);
        frame.addEventListener('load', paint, { once: true });
    },

    postToEmbed(frame, command, value) {
        if (!frame?.contentWindow) return;
        if (command === 'time' && value === undefined) {
            this.requestPlayerTime(frame);
            return;
        }
        const win = frame.contentWindow;

        const em = { source: 'embedmaster_player_command', command };
        if (value !== undefined) em.value = value;
        win.postMessage(em, '*');

        // PlayerJS iframe API uses api + set (not value).
        const pjs = { api: command };
        if (value !== undefined) pjs.set = value;
        win.postMessage(pjs, '*');
    },

    applyRemotePlayerAction(action, time, opts = {}) {
        const frame = document.getElementById('embedmaster_iframe');
        if (!frame?.contentWindow) return;

        this._partyGuestUnlocked = true;
        const t = this.normalizePlayerTime(time);
        const lead = this._PARTY_SYNC_LEAD_SEC;
        const clock = typeof opts.clock === 'number'
            ? this.normalizePlayerTime(opts.clock)
            : (action === 'pause' ? t : Math.max(0, t - lead));
        this._pendingPartySync = {
            action,
            time: t,
            clock,
            paused: action === 'pause',
            at: Date.now()
        };
        if (action === 'pause') this._partyRemotePaused = true;
        if (action === 'play') this._partyRemotePaused = false;

        const force = !!opts.force;
        const noSeek = !!opts.noSeek;
        const now = Date.now();
        const last = this._lastAppliedPartySync;
        // Skip spam that re-triggers EmbedMaster buffering / loading loops.
        if (!force && last && last.action === action && (now - last.at) < 2500) {
            if (Math.abs((last.time || 0) - t) < 3) return;
        }
        if (this._applyingRemoteSync && !force) return;

        this._lastAppliedPartySync = { action, time: t, at: now };
        this.updatePartyRoleUI();

        this._applyingRemoteSync = true;
        const finish = () => {
            clearTimeout(this._partyApplyLockTimer);
            this._partyApplyLockTimer = setTimeout(() => {
                this._applyingRemoteSync = false;
                // Flush the newest host sync that arrived while we were locked.
                if (this.isHost || this.state.view !== 'party') return;
                const pending = this._pendingPartySync;
                const last = this._lastAppliedPartySync;
                if (!pending || !pending.action) return;
                if (last && last.action === pending.action && Math.abs((last.time || 0) - (pending.time || 0)) < 0.5) {
                    return;
                }
                this.applyRemotePlayerAction(pending.action, pending.time, {
                    force: true,
                    clock: pending.clock
                });
            }, 800);
        };

        const seekTo = Math.max(0, Math.floor(t));
        // Never seek to ~0 on a bad stamp — that yeets guests back to the intro.
        const shouldSeek = !noSeek
            && seekTo >= 5
            && (force || !last || Math.abs((last.time || 0) - t) >= 1.25);

        const run = (cmd) => {
            if (shouldSeek) {
                this.postToEmbed(frame, 'seek', seekTo);
                setTimeout(() => {
                    this.postToEmbed(frame, cmd);
                    finish();
                }, 120);
            } else {
                this.postToEmbed(frame, cmd);
                finish();
            }
        };

        if (action === 'play') {
            run('play');
        } else if (action === 'pause') {
            run('pause');
        } else if (action === 'seek') {
            if (shouldSeek) this.postToEmbed(frame, 'seek', seekTo);
            finish();
        } else if (action === 'sync') {
            run(this._partyRemotePaused ? 'pause' : 'play');
        } else {
            finish();
        }
    },

    parseEmbedPlayerEvent(raw) {
        let data = raw;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch { return null; }
        }
        if (!data || typeof data !== 'object') return null;

        const asNum = (v) => {
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
            return undefined;
        };

        // PlayerJS request replies: { event: 'time', answer: 12.5 }
        if (data.event && data.answer !== undefined && data.source !== 'embedmaster_player') {
            const ev = String(data.event).toLowerCase();
            const answer = data.answer;
            const time = asNum(answer) ?? asNum(answer?.time);
            return { event: ev, time };
        }

        let eventName = data.event || null;
        const trustedSource = data.source === 'embedmaster_player';
        if (!trustedSource && !eventName) return null;
        if (!eventName) return null;

        eventName = String(eventName).toLowerCase();
        if (eventName === 'userplay' || eventName === 'playing' || eventName === 'resume') eventName = 'play';
        if (eventName === 'userpause' || eventName === 'paused' || eventName === 'stop') eventName = 'pause';
        if (eventName === 'userseek' || eventName === 'seeked') eventName = 'seek';
        if (eventName === 'start') eventName = 'play';

        const info = data.info;
        const val = data.value;
        const time = asNum(info)
            ?? asNum(info?.time)
            ?? asNum(info?.seconds)
            ?? asNum(info?.currentTime)
            ?? asNum(data.time)
            ?? asNum(data.data)
            ?? asNum(data.data?.time)
            ?? asNum(val)
            ?? asNum(val?.time)
            ?? asNum(val?.seconds)
            ?? asNum(val?.currentTime)
            ?? asNum(data.answer);

        return { event: eventName, time };
    },

    sendPlayerSync(action, time, opts = {}) {
        if (!this.partyChannel || !this.isHost) return;
        let t = this.normalizePlayerTime(typeof time === 'number' ? time : this.getHostPlaybackTime());
        const force = !!opts.force;
        const noSeek = !!opts.noSeek;
        const now = Date.now();
        const rawBeforeLead = t;

        // Play/sync: aim guests slightly ahead so the ~1s lag feels matched.
        if (!noSeek && (action === 'play' || (action === 'sync' && !opts.paused))) {
            t += this._PARTY_SYNC_LEAD_SEC;
        }
        // #region agent log
        this._dbg('D', 'script.js:sendPlayerSync', 'host broadcast', {
            action, rawBeforeLead, seekTime: t, force, noSeek, leadApplied: t !== rawBeforeLead
        });
        // #endregion

        // Debounce duplicate host broadcasts (player echoes + presence noise).
        if (!force && this._lastSentPartySync) {
            const last = this._lastSentPartySync;
            if (last.action === action && (now - last.at) < 1200 && Math.abs((last.time || 0) - t) < 2) {
                return;
            }
        }

        this._lastSentPartySync = { action, time: t, at: now };
        this._partyLastAction = action;
        this.setPartyPaused(action === 'pause');
        // Store the real host time (without lead) for the local clock.
        const raw = this.normalizePlayerTime(typeof time === 'number' ? time : this.getHostPlaybackTime());
        if (raw >= 1) this.notePartyTime(raw);
        if (action === 'play') this._partyLastTimeAt = Date.now();

        this.partyChannel.send({
            type: 'broadcast',
            event: 'player_sync',
            payload: {
                action,
                time: t,
                clock: raw,
                paused: action === 'pause',
                force,
                noSeek,
                at: Date.now()
            }
        });
    },

    initPartySync(roomId) {
        if (!this.supabase) {
            this.showToast('Supabase is not configured. Watch Party requires cloud sync.');
            return;
        }

        this.teardownParty();
        this.state.partyRoomId = roomId;

        const nickname = sessionStorage.getItem('alexandria_nickname');
        const uid = sessionStorage.getItem('alexandria_party_uid');
        const isCreator = sessionStorage.getItem('alexandria_party_creator_' + roomId) === '1';

        // Host immediately if you created the room — presence only re-elects if creator leaves.
        this.isHost = isCreator;
        this.notifiedHost = false;
        this._partyGuestHinted = false;
        this._partyLastAction = null;
        this._partyLastTime = 0;
        this._partyLastTimeAt = 0;
        this._partyPaused = false;
        this._partyPausedViaStall = false;
        this._partyTimeStallCount = 0;
        this._lastHostHeartbeat = 0;
        this._partyRemotePaused = false;
        this._partyGuestUnlocked = isCreator;
        this._pendingPartySync = null;
        this._lastAppliedPartySync = null;
        this._lastSentPartySync = null;
        this._suppressHostBroadcastUntil = 0;
        this._partyFrameReloading = false;
        this._partyEmbedHealthy = false;
        this._partyEpisodesLoadedKey = null;
        this.clearPartyEmbedWatch();
        this.clearHostPartyResyncTimers();
        this.clearGuestPartyResyncTimers();

        this.partyChannel = this.supabase.channel(`party_${roomId}`, {
            config: { presence: { key: uid } }
        });

        this.partyChannel
            .on('presence', { event: 'sync' }, () => {
                const state = this.partyChannel.presenceState();
                const users = Object.keys(state);
                const countEl = document.getElementById('party-users-count');
                if (countEl) {
                    countEl.textContent = `${users.length} here`;
                }

                if (users.length === 0) return;

                let hostKey = null;
                let earliestTime = Infinity;

                for (const key of users) {
                    const p = state[key]?.[0];
                    if (p?.isCreator) {
                        hostKey = key;
                        break;
                    }
                }

                if (!hostKey) {
                    for (const key of users) {
                        const p = state[key]?.[0];
                        if (p?.online_at) {
                            const time = new Date(p.online_at).getTime();
                            if (time < earliestTime) {
                                earliestTime = time;
                                hostKey = key;
                            }
                        }
                    }
                }
                if (!hostKey) hostKey = users[0];

                this.renderPartyPeople(hostKey);

                const wasHost = this.isHost;
                // Room creator stays host while present; otherwise earliest joiner.
                this.isHost = isCreator ? true : (hostKey === uid);
                if (this.isHost) this._partyGuestUnlocked = true;

                this.updatePartyRoleUI();

                // Guest promoted to host (creator left): seed our clock from the
                // last sync we received, then poll our own embed for the live stamp.
                if (this.isHost && !wasHost) {
                    const pending = this._pendingPartySync;
                    if (!(Number(this._partyLastTime) >= 1) && pending && typeof pending.time === 'number' && pending.time >= 1) {
                        this._partyLastTime = pending.time;
                        this._partyLastTimeAt = Date.now();
                        this.setPartyPaused(!!pending.paused || pending.action === 'pause');
                    }
                    this.notifiedHost = true;
                    this.appendChatMessage('System', 'You’re the host now — friends follow you.');
                    this.scheduleHostPartyResync();
                }

                if (this.isHost && !this.notifiedHost) {
                    this.notifiedHost = true;
                    this.appendChatMessage('System', 'You’re the host — use the player controls. Friends follow you.');
                } else if (!this.isHost && wasHost) {
                    this.appendChatMessage('System', 'Host left — new host elected.');
                } else if (!this.isHost && !this._partyGuestHinted) {
                    this._partyGuestHinted = true;
                    this.appendChatMessage('System', 'Hit Play Now in the player, then Sync if you’re off.');
                }

                if (this.isHost) {
                    // Only push content metadata on presence — not seek spam (that caused loading loops).
                    clearTimeout(this._partyPresenceResyncTimer);
                    this._partyPresenceResyncTimer = setTimeout(() => {
                        if (!this.isHost || !this.partyChannel) return;
                        this.broadcastPartyContent();
                    }, 500);
                }
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                if (this.state.view !== 'party' || !this.partyChannel) return;
                const name = newPresences?.[0]?.nickname;
                if (name && key !== uid) this.appendChatMessage('System', `${name} joined`);
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                if (this.state.view !== 'party' || !this.partyChannel) return;
                const name = leftPresences?.[0]?.nickname;
                if (name && key !== uid) this.appendChatMessage('System', `${name} left`);
            })
            .on('broadcast', { event: 'player_sync' }, (payload) => {
                if (this.isHost) return;
                const { action, time, paused, force, noSeek, clock } = payload.payload || {};
                if (typeof paused === 'boolean') this._partyRemotePaused = paused;
                if (action === 'pause') this._partyRemotePaused = true;
                if (action === 'play') this._partyRemotePaused = false;
                const t = typeof time === 'number' ? this.normalizePlayerTime(time) : 0;
                const lead = this._PARTY_SYNC_LEAD_SEC;
                const clockVal = typeof clock === 'number'
                    ? this.normalizePlayerTime(clock)
                    : (action === 'pause' ? t : Math.max(0, t - lead));
                this._pendingPartySync = {
                    action,
                    time: t,
                    clock: clockVal,
                    paused: this._partyRemotePaused,
                    at: Date.now()
                };
                this.tickPartyClock();
                // Queue while applying or reloading — finish() / ready flush will catch up.
                if (this._applyingRemoteSync || this._partyFrameReloading) return;
                this.applyRemotePlayerAction(action, time, {
                    force: !!force,
                    noSeek: !!noSeek,
                    clock: clockVal
                });
            })
            .on('broadcast', { event: 'sync_request' }, async (payload) => {
                if (!this.isHost) return;
                const fromUid = payload.payload?.fromUid;
                if (fromUid && fromUid === uid) return;
                this.broadcastPartyContent();
                const action = this._partyLastAction || 'play';
                const time = await this.resolveHostTime();
                this.sendPlayerSync(action, time, { force: true });
            })
            .on('broadcast', { event: 'content_sync' }, (payload) => {
                if (this.isHost) return;
                this.applyPartyContent(payload.payload);
            })
            .on('broadcast', { event: 'chat_msg' }, (payload) => {
                const { sender, msg, fromUid } = payload.payload;
                if (fromUid === uid) return;
                this.appendChatMessage(sender, msg);
            })
            .on('system', { event: 'reconnected' }, () => {
                if (this.state.view !== 'party' || !this.partyChannel) return;
                this.appendChatMessage('System', 'Reconnected — re-syncing…');
                if (this.isHost) {
                    this.scheduleHostPartyResync();
                } else {
                    this.partyChannel.send({ type: 'broadcast', event: 'sync_request', payload: { fromUid: uid } });
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await this.partyChannel.track({
                        online_at: new Date().toISOString(),
                        nickname,
                        isCreator
                    });
                    if (this.isHost) {
                        this.broadcastPartyContent();
                    }
                }
            });

        if (!this._embedListener) {
            this._embedListener = this.handleEmbedMasterMessage.bind(this);
            window.addEventListener('message', this._embedListener);
        }

        // Smooth UI clock (~4fps); separate from slower poll/heartbeat.
        if (this._partyClockTimer) clearInterval(this._partyClockTimer);
        this._partyClockTimer = setInterval(() => {
            if (this.state.view !== 'party') return;
            this.tickPartyClock();
        }, 250);

        // Host: poll time + pause state, heartbeat sync for stubborn embeds.
        if (this._partySyncTimer) clearInterval(this._partySyncTimer);
        this._partySyncTimer = setInterval(() => {
            if (this.state.view !== 'party') return;
            if (!this.isHost) return;
            const frame = document.getElementById('embedmaster_iframe');
            this.requestPlayerTime(frame);
            this.requestPlayerPaused(frame);

            // Periodic soft sync so guests stay lined up even when play/pause
            // events never fire (seen on some titles like Z Nation).
            if (!this.isPartyPaused()) {
                if (this._partyFrameReloading) return;
                if (Date.now() < (this._suppressHostBroadcastUntil || 0)) return;
                const now = Date.now();
                const t = this.getHostPlaybackTime();
                if (t >= 5 && (!this._lastHostHeartbeat || now - this._lastHostHeartbeat > 4000)) {
                    this._lastHostHeartbeat = now;
                    this.sendPlayerSync('sync', t, { force: false });
                }
            }
        }, 2000);

        this.updatePartyRoleUI();
    },

    handleEmbedMasterMessage(event) {
        if (this.state.view !== 'party' || !this.partyChannel) return;

        const originOk = this.isTrustedEmbedOrigin(event.origin);
        if (!originOk) return;

        // Always harvest timestamps from any player traffic — don’t depend on one event shape.
        if (this.isHost) {
            this.ingestEmbedTimePayload(event.data);
        }

        const parsed = this.parseEmbedPlayerEvent(event.data);
        if (!parsed) return;

        const { event: ev, time } = parsed;

        if (ev === 'ready' || ev === 'init' || ev === 'start') {
            this.markPartyEmbedHealthy();
            const readyFrame = document.getElementById('embedmaster_iframe');
            this.themeEmbedPlayer(readyFrame);
            this.subscribeToPlayerEvents(readyFrame);
            if (this.isHost) this.resyncPartyAfterPlayerReady();
        }

        // Guests: unlock + flush queued host sync when the player actually starts talking.
        if (!this.isHost) {
            if (this._applyingRemoteSync) return;
            if (ev === 'ready' || ev === 'play' || ev === 'time' || ev === 'timeupdate' || ev === 'click') {
                this.markPartyEmbedHealthy();
                const wasLocked = !this._partyGuestUnlocked;
                const wasReloading = !!this._partyFrameReloading;
                this._partyGuestUnlocked = true;
                this._partyFrameReloading = false;
                if (wasLocked) {
                    this.updatePartyRoleUI();
                    this.appendChatMessage('System', 'Player unlocked — syncing with host.');
                }
                // Only flush on unlock/reload — re-applying on every echoed
                // `play`/`timeupdate` from our own seek was the sync loop.
                if (this._pendingPartySync && (wasLocked || wasReloading)) {
                    const pending = this._pendingPartySync;
                    clearTimeout(this._partyGuestFlushTimer);
                    this._partyGuestFlushTimer = setTimeout(() => {
                        this.applyRemotePlayerAction(pending.action, pending.time, {
                            force: true,
                            clock: pending.clock,
                            noSeek: (pending.time || 0) < 5
                        });
                    }, (wasLocked || wasReloading) ? 400 : 0);
                }
            }
            return;
        }

        if (ev === 'play' || ev === 'time' || ev === 'timeupdate') {
            this.markPartyEmbedHealthy();
        }

        if (this._applyingRemoteSync) return;
        if (Date.now() < (this._suppressHostBroadcastUntil || 0)) return;

        if (typeof time === 'number' && time >= 1) {
            this.notePartyTime(time);
        }

        if (ev === 'play' || ev === 'pause') {
            this.setPartyPaused(ev === 'pause');

            // Prefer the player's reported time; fall back to our running clock.
            const fromEvent = (typeof time === 'number' && time >= 5) ? this.normalizePlayerTime(time) : null;
            const stamp = fromEvent ?? this.getHostPlaybackTime();
            this.sendPlayerSync(ev, stamp, {
                force: true,
                noSeek: stamp < 5
            });
            this.tickPartyClock();
        } else if (ev === 'seek' || ev === 'userseek') {
            const stamp = (typeof time === 'number' && time >= 5)
                ? this.normalizePlayerTime(time)
                : this.getHostPlaybackTime();
            if (stamp >= 5) this.sendPlayerSync('seek', stamp, { force: true });
            this.tickPartyClock();
        }
    },

    sendPartyChatMessage() {
        const input = document.getElementById('party-chat-input');
        const msg = input.value.trim();
        if (!msg || !this.partyChannel) return;

        const nickname = sessionStorage.getItem('alexandria_nickname');
        const fromUid = sessionStorage.getItem('alexandria_party_uid');

        this.partyChannel.send({
            type: 'broadcast',
            event: 'chat_msg',
            payload: { sender: nickname, msg, fromUid }
        });

        this.appendChatMessage(nickname, msg);
        input.value = '';
    },

    appendChatMessage(sender, msg) {
        const container = document.getElementById('party-chat-messages');
        if (!container) return;
        const div = document.createElement('div');
        if (sender === 'System') {
            div.className = 'party-chat-msg system';
            div.textContent = msg;
        } else {
            div.className = 'party-chat-msg';
            div.innerHTML = `<strong>${this.escapeHtml(sender)}</strong> ${this.escapeHtml(msg)}`;
        }
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    async copyPartyLink() {
        const url = window.location.href;
        if (await this.copyText(url)) this.showToast('Invite link copied to clipboard!');
        else this.showToast('Could not copy link. Copy from the address bar.');
    },

};
