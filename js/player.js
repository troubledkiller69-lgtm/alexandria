export const player = {
    async renderPlayer() {
        const { id, type, season, episode, isAnime } = this.state.activeContent;
        const animeMode = type === 'tv' && Boolean(isAnime);
        // Anime-only mirrors make no sense outside anime playback.
        if (!animeMode && this.servers[this.state.activeServer]?.animeOnly) {
            this.state.activeServer = this.servers.findIndex(s => !s.animeOnly);
            if (this.state.activeServer < 0) this.state.activeServer = 0;
        }
        if (!this.servers[this.state.activeServer]) this.state.activeServer = 0;
        const server = this.servers[this.state.activeServer];
        const needsResolve = animeMode && Boolean(server?.animeOnly);
        const embedUrl = needsResolve ? '' : this.buildEmbedUrl(this.state.activeServer);
        const dub = this.readAudioPref() === 'dub';

        this._triedServers = new Set([this.state.activeServer]);
        this._serverHealthy = false;
        this._currentSeasonEpisodes = [];
        this._animeFallbackUsed = false;

        this.main.innerHTML = `
            <section class="player-page-container">
                <div class="player-stage-grid ${type === 'tv' ? 'has-sidebar' : 'no-sidebar'}">
                    <div class="player-main">
                        <div class="server-controls">
                            <label class="server-label" for="server-selector">SERVER <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></label>
                            <select id="server-selector" class="server-select-dropdown" onchange="Alexandria.handleServerChange(this.value)">
                                ${this.servers.map((s, i) => (type === 'tv' || !s.animeOnly)
                                    ? `<option value="${i}" ${i === this.state.activeServer ? 'selected' : ''}>${s.name}</option>`
                                    : '').join('')}
                            </select>
                            <button type="button" class="btn-secondary server-next-btn" onclick="Alexandria.failoverToNextServer(true)" title="Try the next mirror">NEXT SERVER</button>
                            ${animeMode ? `
                            <div class="audio-pill" id="audio-pill" role="group" aria-label="Audio track">
                                <button type="button" class="audio-opt ${dub ? 'active' : ''}" aria-pressed="${dub}" onclick="Alexandria.setAudioPref(true)">DUB</button>
                                <button type="button" class="audio-opt ${dub ? '' : 'active'}" aria-pressed="${!dub}" onclick="Alexandria.setAudioPref(false)">SUB</button>
                            </div>` : ''}
                            <span id="server-status" class="server-status" aria-live="polite">Connecting to ${this.escapeHtml(server.name)}…</span>
                        </div>
                        <div class="player-frame-container">
                            <iframe id="video-iframe" title="Alexandria video player" src="${embedUrl || 'about:blank'}" width="100%" height="100%" scrolling="no" ${this.playerIframeFlags()}></iframe>
                        </div>
                    </div>
                    ${type === 'tv' ? `
                        <div class="episode-sidebar">
                            <div class="sidebar-top">
                                <h3 id="sidebar-title">DATA LINK</h3>
                                <div class="season-picker" id="season-picker">
                                    <button type="button" id="season-selector-btn" class="season-select" aria-haspopup="listbox" aria-expanded="false" aria-controls="season-menu" onclick="Alexandria.toggleSeasonMenu(event)">SEASON 1</button>
                                    <ul id="season-menu" class="season-menu" role="listbox" hidden></ul>
                                </div>
                            </div>
                            <div class="episode-list" id="sidebar-episodes">
                                <div class="placeholder-msg">DECRYPTING EPISODES...</div>
                            </div>
                        </div>` : ''}
                </div>
                <div class="player-below-stage">
                    <section class="comments-section-container" id="comments-section-container"></section>
                </div>
            </section>`;

        this.bindSoloPlayerEvents();
        this.prepareResumeSeek();
        this.armFailoverWatch(server);
        this.scheduleEmbedTheme(document.getElementById('video-iframe'));
        if (needsResolve) this.setServerStatus(`Reading title metadata · ${server.name}…`);
        this.renderComments();

        try {
            const data = await this.getJson(type + '/' + id);
            const title = type === 'movie' ? data.title : data.name;
            // Hint consumed by browser-side AniList resolution (MegaPlay etc).
            this._playerMeta = {
                title: data.name || data.title || '',
                originalTitle: data.original_name || data.original_title || '',
                year: Number((data.first_air_date || data.release_date || '').slice(0, 4)) || null,
                isMovie: type === 'movie'
            };
            // Anime detection happens here because the router can't know it at
            // parse time: Animation genre + Japanese origin language.
            const detectedAnime = type === 'tv'
                && (data.genres || []).some(g => Number(g.id) === 16)
                && data.original_language === 'ja';
            if (detectedAnime && !this.state.activeContent.isAnime) {
                this.state.activeContent.isAnime = true;
                if (token === this._renderToken) this.refreshAnimeControls();
            }
            if (title) {
                const existing = this.state.history.find(h => String(h.id) === String(id) && h.type === type);
                const keepProgress = type === 'tv'
                    && Number(existing?.season) === Number(season)
                    && Number(existing?.episode) === Number(episode)
                    ? (existing?.progress || 0)
                    : (type === 'movie' ? (existing?.progress || 0) : 0);
                this.addToHistory({
                    id, type, title, poster_path: data.poster_path, season, episode, isAnime,
                    progress: keepProgress
                });
            }
            if (type === 'tv') {
                this.populateSeasonSelector(data, season);
                await this.loadEpisodes(id, season);
            }
            // Metadata (hint) is in place — now resolve the AniList id.
            if (needsResolve && token === this._renderToken) await this.hydrateAnimeEmbed();
        } catch (e) {
            console.error("Alexandria: Player metadata failed", e);
            if (needsResolve && !this._animeFallbackUsed) {
                // No metadata means no AniList hint — hop to a TMDB-native mirror.
                const fallbackIdx = this.servers.findIndex(s => s.name === 'VidCore');
                if (fallbackIdx >= 0) {
                    this._animeFallbackUsed = true;
                    this.showToast('Anime lookup unavailable — switched to VidCore.');
                    this.applyServer(fallbackIdx, { resetTried: true });
                    return;
                }
            }
            if (type === 'tv') {
                await this.initSeasonSelector(id, season);
                await this.loadEpisodes(id, season);
            }
        }

    },

    setServerStatus(message) {
        const el = document.getElementById('server-status');
        if (el) el.textContent = message;
    },

    // Called once TMDB metadata confirms anime playback: reveal the anime
    // mirrors in the server dropdown and mount the DUB/SUB pill.
    refreshAnimeControls() {
        const sel = document.getElementById('server-selector');
        if (sel) {
            sel.innerHTML = this.servers.map((s, i) =>
                `<option value="${i}" ${i === this.state.activeServer ? 'selected' : ''}>${s.name}</option>`
            ).join('');
        }
        if (!document.getElementById('audio-pill')) {
            const nextBtn = document.querySelector('.server-controls .server-next-btn');
            if (!nextBtn) return;
            const dub = this.readAudioPref() === 'dub';
            const wrap = document.createElement('div');
            wrap.className = 'audio-pill';
            wrap.id = 'audio-pill';
            wrap.setAttribute('role', 'group');
            wrap.setAttribute('aria-label', 'Audio track');
            wrap.innerHTML = `
                <button type="button" class="audio-opt ${dub ? 'active' : ''}" aria-pressed="${dub}" onclick="Alexandria.setAudioPref(true)">DUB</button>
                <button type="button" class="audio-opt ${dub ? '' : 'active'}" aria-pressed="${!dub}" onclick="Alexandria.setAudioPref(false)">SUB</button>`;
            nextBtn.after(wrap);
        }
    },

    clearFailoverWatch() {
        if (this._failoverTimer) {
            clearTimeout(this._failoverTimer);
            this._failoverTimer = null;
        }
    },

    armFailoverWatch(server) {
        this.clearFailoverWatch();
        this._serverHealthy = false;
        this._failoverGraceUsed = false;
        const name = server?.name || 'server';
        this.setServerStatus(`Connecting to ${name}…`);

        const iframe = document.getElementById('video-iframe');
        if (iframe) {
            iframe.addEventListener('load', () => {
                if (this.state.view !== 'player' || this._serverHealthy) return;
                this._failoverGraceUsed = true;
                this.setServerStatus(`Loaded · ${name} · use NEXT if blank`);
            }, { once: true });
        }

        // Auto-failover disabled. It was yanking working Alexandria streams mid-watch
        // whenever EmbedMaster skipped postMessage "ready". Manual NEXT SERVER only.
    },

    markServerHealthy() {
        if (this._serverHealthy) return;
        this._serverHealthy = true;
        this.clearFailoverWatch();
        const server = this.servers[this.state.activeServer];
        this.setServerStatus(server ? `Live · ${server.name}` : 'Live');
    },

    failoverToNextServer(manual = false) {
        if (this.state.view !== 'player') return;
        if (!this._triedServers) this._triedServers = new Set([this.state.activeServer]);

        const total = this.servers.length;
        if (total < 2) {
            this.setServerStatus('No backup servers configured.');
            return;
        }

        // Auto-timeout stays on EmbedMaster mirrors only (supportsApi).
        // Manual NEXT SERVER can still hop to any other visible mirror.
        const preferApiOnly = !manual;
        const isAnimeMode = this.state.view === 'player'
            && this.state.activeContent?.type === 'tv'
            && Boolean(this.state.activeContent?.isAnime);
        let next = (this.state.activeServer + 1) % total;
        let hops = 0;
        while (hops < total) {
            const candidate = this.servers[next];
            const visible = !candidate.animeOnly || isAnimeMode;
            const allowed = visible && (!preferApiOnly || candidate.supportsApi);
            if (allowed && !this._triedServers.has(next)) break;
            next = (next + 1) % total;
            hops += 1;
        }

        const nextServer = this.servers[next];
        const nextAllowed = (!nextServer.animeOnly || isAnimeMode) && (!preferApiOnly || nextServer.supportsApi);
        if (!nextAllowed || this._triedServers.has(next) || hops >= total) {
            this.clearFailoverWatch();
            if (preferApiOnly) {
                this.setServerStatus('EmbedMaster mirrors timed out. Pick a server manually.');
                this.showToast('Alexandria / EmbedMaster timed out. Use NEXT SERVER or pick a mirror.');
            } else {
                this.setServerStatus('All servers tried. Pick one manually.');
                this.showToast('All mirrors were tried. Choose a server from the list.');
            }
            this._triedServers = new Set();
            return;
        }

        const label = nextServer?.name || `Server ${next + 1}`;
        this.showToast(manual ? `Switching to ${label}…` : `${this.servers[this.state.activeServer]?.name || 'Server'} timed out. Trying ${label}…`);
        this.applyServer(next, { resetTried: false });
    },

    normalizeServerIndex(value) {
        const idx = Number.parseInt(value, 10);
        if (!Number.isInteger(idx) || !this.servers[idx]) return null;
        return idx;
    },

    // ---- Anime mirrors (AniList-backed) ----

    async hydrateAnimeEmbed() {
        const server = this.servers[this.state.activeServer];
        const { id, season, episode } = this.state.activeContent || {};
        if (!server?.animeOnly) return;
        // The DUB/SUB pill must exist the moment an anime server is active —
        // not only when genre detection fires. Without it a manual server pick
        // locks the user to sub with no way to switch.
        this.refreshAnimeControls();
        this.setServerStatus(`Resolving AniList ID · ${server.name}…`);
        try {
            // Season-aware: sequel seasons are separate AniList entries, and
            // some TMDB shows pack every season into one giant "Season 1" —
            // the resolver walks the sequel chain for both cases. Hint comes
            // from the metadata already fetched above (browser-side lookup).
            const meta = this._playerMeta || {};
            const info = await this.resolveAnime(id, Number(season) || 1, Number(episode) || null, {
                title: meta.title,
                originalTitle: meta.originalTitle,
                year: meta.year,
                isMovie: meta.isMovie
            });
            const dub = this.readAudioPref() === 'dub';
            const externalId = server.animeSource === 'anilist' ? info.anilistId : id;
            const epForUrl = server.animeSource === 'anilist'
                ? (info.requestedEpisode || Number(episode) || 1)
                : (Number(episode) || 1);
            const url = server.getAnime(externalId, epForUrl, dub);
            if (this.state.view !== 'player') return;
            const live = document.getElementById('video-iframe');
            if (live) {
                live.src = url;
                this.scheduleEmbedTheme(live);
            }
            const dubNote = dub && info.dubAvailable === false ? ' · no dub on mirror, playing sub' : '';
            this.setServerStatus(
                `${server.name}${dubNote || (dub ? ' · DUB' : '')}`.trim()
            );
        } catch (e) {
            if (this.state.view !== 'player') return;
            // AniList down or throttled? Playback must not die with it — hop
            // to a TMDB-native mirror that needs no resolution at all.
            const fallbackIdx = this.servers.findIndex(s => !s.animeOnly && s.name === 'VidCore');
            const alreadyFallback = this._animeFallbackUsed;
            if (fallbackIdx >= 0 && !alreadyFallback) {
                this._animeFallbackUsed = true;
                this.showToast('Anime lookup failed — switched to VidCore (no AniList needed).');
                this.applyServer(fallbackIdx, { resetTried: true });
                return;
            }
            this.setServerStatus('Anime lookup failed.');
            this.showToast(e.message || 'Could not resolve this anime — try another server.');
        }
    },

    async setAudioPref(dub) {
        this.writeAudioPref(dub ? 'dub' : 'sub');
        document.querySelectorAll('#audio-pill .audio-opt').forEach(btn => {
            const isDubBtn = btn.textContent.trim() === 'DUB';
            btn.classList.toggle('active', isDubBtn === dub);
            btn.setAttribute('aria-pressed', String(isDubBtn === dub));
        });
        const server = this.servers[this.state.activeServer];
        if (server?.animeOnly) {
            await this.hydrateAnimeEmbed();
        } else if (this.state.activeContent?.isAnime) {
            this.showToast(dub ? 'DUB saved — switch to an Anime server to use it.' : 'SUB saved — switch to an Anime server to use it.');
        }
    },

    // Host + guest must share the exact same embed URL for a given content + serverIndex.
    buildEmbedUrl(serverIndex = this.state.activeServer, content = this.state.activeContent) {
        const idx = this.normalizeServerIndex(serverIndex);
        const server = this.servers[idx != null ? idx : this.state.activeServer];
        if (!server || content?.id == null) return '';
        const { id, type, season, episode } = content;
        return type === 'movie'
            ? server.getMovie(id)
            : server.getTv(id, season || 1, episode || 1);
    },

    applyServer(serverIndex, { resetTried = true } = {}) {
        const idx = this.normalizeServerIndex(serverIndex);
        if (idx == null) return;
        serverIndex = idx;

        // A deliberate pick of an anime mirror earns a fresh fallback budget.
        if (this.servers[serverIndex]?.animeOnly) this._animeFallbackUsed = false;

        // Watch Party play/pause sync needs EmbedMaster postMessage API.
        if (this.state.view === 'party' && !this.servers[serverIndex].supportsApi) {
            this.showToast('That mirror can’t sync in Watch Party. Use Alexandria or EmbedMaster.');
            const selector = document.getElementById('party-server-selector') || document.getElementById('server-selector');
            if (selector) selector.value = String(this.state.activeServer);
            return;
        }

        this.state.activeServer = serverIndex;
        try {
            localStorage.setItem('alexandria_activeServer', String(serverIndex));
        } catch { /* ignore */ }

        if (resetTried) this._triedServers = new Set([serverIndex]);
        else this._triedServers?.add(serverIndex);

        const server = this.servers[this.state.activeServer];
        // Anime mirrors resolve asynchronously — the iframe waits on about:blank.
        const embedUrl = (server.animeOnly && this.state.view === 'player')
            ? ''
            : this.buildEmbedUrl(serverIndex);

        const selector = document.getElementById('server-selector');
        if (selector) selector.value = String(serverIndex);
        const partySelector = document.getElementById('party-server-selector');
        if (partySelector) partySelector.value = String(serverIndex);

        const iframe = document.getElementById('video-iframe') || document.getElementById('embedmaster_iframe');
        if (this.state.view === 'party') {
            this._partyFrameReloading = true;
            this._partyEmbedHealthy = false;
        }
        if (iframe) iframe.src = embedUrl || 'about:blank';

        if (this.state.view === 'player') {
            this.prepareResumeSeek();
            this.armFailoverWatch(server);
            if (!embedUrl) this.hydrateAnimeEmbed();
        } else if (this.state.view === 'party') {
            this.onPartyServerSwitched(server);
        } else {
            this.setServerStatus(`Using ${server.name}`);
        }
    },

    handlePartyServerChange(newServerIndex) {
        if (!this.isHost) return;
        const serverIndex = this.normalizeServerIndex(newServerIndex);
        if (serverIndex == null) return;
        this.applyServer(serverIndex, { resetTried: true });
    },

    onPartyServerSwitched(server) {
        const frame = document.getElementById('embedmaster_iframe');
        this._suppressHostBroadcastUntil = Date.now() + 2800;
        this._partyTimeStallCount = 0;
        this._partyFrameReloading = true;
        this._partyEmbedHealthy = false;
        if (!this.isHost) this._partyGuestUnlocked = false;
        this.bindPartyFrame(frame);
        this.scheduleEmbedTheme(frame);
        this.armPartyEmbedWatch();
        this.updatePartyRoleUI();
        // #region agent log
        this._dbg('E', 'script.js:onPartyServerSwitched', 'server switch', {
            serverName: server?.name,
            embedSrc: frame?.src || '',
            referrerPolicy: frame?.referrerPolicy || frame?.getAttribute?.('referrerpolicy') || null,
            activeServer: this.state.activeServer,
            contentId: this.state.activeContent?.id,
            contentType: this.state.activeContent?.type
        });
        // #endregion
        // Broadcast new serverIndex immediately so guests rebuild the same embed URL.
        if (this.isHost && this.partyChannel) {
            this.broadcastPartyContent();
            this.appendChatMessage('System', `Host switched server to ${server?.name || 'another mirror'}. Re-syncing…`);
            this.scheduleHostPartyResync();
        } else {
            this.appendChatMessage('System', 'Player reloading — hit Play Now if sync stalls.');
            this.scheduleGuestPartyResync();
        }
    },

    clearPartyEmbedWatch() {
        if (this._partyEmbedWatchTimer) {
            clearTimeout(this._partyEmbedWatchTimer);
            this._partyEmbedWatchTimer = null;
        }
    },

    armPartyEmbedWatch() {
        this.clearPartyEmbedWatch();
        this._partyEmbedHealthy = false;
        this._partyEmbedWatchTimer = setTimeout(() => {
            if (this.state.view !== 'party' || this._partyEmbedHealthy) return;
            const name = this.servers[this.state.activeServer]?.name || 'Server';
            this._suppressHostBroadcastUntil = 0;
            this._partyFrameReloading = false;
            // #region agent log
            const frame = document.getElementById('embedmaster_iframe');
            this._dbg('E', 'script.js:armPartyEmbedWatch', 'embed load timeout', {
                serverName: name,
                embedSrc: frame?.src || '',
                referrerPolicy: frame?.referrerPolicy || frame?.getAttribute?.('referrerpolicy') || null
            });
            // #endregion
            this.showToast(`${name} didn’t load. Switch server — sync stays connected.`);
            this.appendChatMessage('System', `${name} timed out. Pick another mirror to recover.`);
        }, 12000);
    },

    markPartyEmbedHealthy() {
        if (this._partyEmbedHealthy) return;
        this._partyEmbedHealthy = true;
        this.clearPartyEmbedWatch();
        // #region agent log
        const frame = document.getElementById('embedmaster_iframe');
        this._dbg('E', 'script.js:markPartyEmbedHealthy', 'embed healthy/ready', {
            embedSrc: frame?.src || '',
            referrerPolicy: frame?.referrerPolicy || frame?.getAttribute?.('referrerpolicy') || null
        });
        // #endregion
    },

    clearHostPartyResyncTimers() {
        if (this._partyHostResyncTimers?.length) {
            this._partyHostResyncTimers.forEach(clearTimeout);
        }
        this._partyHostResyncTimers = [];
        if (this._partyReadyResyncTimer) {
            clearTimeout(this._partyReadyResyncTimer);
            this._partyReadyResyncTimer = null;
        }
        if (this._partyFrameLoadTimer) {
            clearTimeout(this._partyFrameLoadTimer);
            this._partyFrameLoadTimer = null;
        }
    },

    clearGuestPartyResyncTimers() {
        if (this._partyGuestResyncTimers?.length) {
            this._partyGuestResyncTimers.forEach(clearTimeout);
        }
        this._partyGuestResyncTimers = [];
    },

    scheduleHostPartyResync() {
        if (this.state.view !== 'party' || !this.isHost || !this.partyChannel) return;
        const now = Date.now();
        // Repeated ready/load echoes were stacking a dozen force syncs — that was
        // the "constantly syncing" hammer. Collapse them into one calm burst.
        if (this._lastHostResyncAt && now - this._lastHostResyncAt < 1500) return;
        this._lastHostResyncAt = now;
        this.clearHostPartyResyncTimers();
        const delays = [600, 2200];
        this._partyHostResyncTimers = delays.map((ms) => setTimeout(async () => {
            if (this.state.view !== 'party' || !this.isHost || !this.partyChannel) return;
            this._suppressHostBroadcastUntil = 0;
            this._partyFrameReloading = false;
            const time = ms >= 1000
                ? await this.resolveHostTime()
                : this.getHostPlaybackTime();
            const action = this.isPartyPaused()
                ? 'pause'
                : (this._partyLastAction === 'pause' ? 'pause' : 'play');
            this.sendPlayerSync(action, time, { force: true, noSeek: time < 5 });
            this.tickPartyClock();
        }, ms));
    },

    scheduleGuestPartyResync() {
        if (this.state.view !== 'party' || this.isHost) return;
        this.clearGuestPartyResyncTimers();
        const delays = [900, 2200, 4500];
        this._partyGuestResyncTimers = delays.map((ms) => setTimeout(() => {
            if (this.state.view !== 'party' || this.isHost) return;
            const pending = this._pendingPartySync;
            if (!pending) return;
            this._partyFrameReloading = false;
            this.applyRemotePlayerAction(pending.action, pending.time, {
                force: true,
                clock: pending.clock,
                noSeek: (pending.time || 0) < 5
            });
        }, ms));
    },

    bindPartyFrame(frame) {
        if (!frame) return;
        // Always re-attach: iframe nodes are recreated on renderParty, and src swaps need a live load hook.
        if (frame._partyLoadHandler) {
            frame.removeEventListener('load', frame._partyLoadHandler);
        }
        frame._partyLoadHandler = () => this.onPartyFrameLoad();
        frame.addEventListener('load', frame._partyLoadHandler);
        frame.dataset.partyBound = '1';
    },

    onPartyFrameLoad() {
        if (this.state.view !== 'party') return;
        const frame = document.getElementById('embedmaster_iframe');
        this.scheduleEmbedTheme(frame);

        if (!this.isHost) {
            this._partyGuestUnlocked = false;
            this.updatePartyRoleUI();
            this.scheduleGuestPartyResync();
            return;
        }

        // New mirror finished loading — push current play/pause + time to guests.
        this.scheduleHostPartyResync();
    },

    resyncPartyAfterPlayerReady() {
        this.markPartyEmbedHealthy();
        if (this.state.view !== 'party' || !this.isHost || !this.partyChannel) return;
        this._partyFrameReloading = false;
        this.scheduleHostPartyResync();
    },

    formatTime(seconds) {
        const total = Math.max(0, Math.floor(Number(seconds) || 0));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
    },

    getSavedProgress() {
        const { id, type, season, episode } = this.state.activeContent;
        const item = this.state.history.find(h => String(h.id) === String(id) && h.type === type);
        if (!item || typeof item.progress !== 'number') return 0;
        if (item.progress < 5) return 0;
        if (type === 'tv') {
            if (Number(item.season) !== Number(season) || Number(item.episode) !== Number(episode)) return 0;
        }
        return item.progress;
    },

    prepareResumeSeek() {
        this._resumeSeekDone = false;
        this._pendingResumeTime = this.getSavedProgress();
        this._resumeIgnoreUntil = 0;
        if (this._pendingResumeTime > 0) {
            this.setServerStatus(`Will resume at ${this.formatTime(this._pendingResumeTime)}`);
        }
    },

    tryResumeSeek() {
        if (this._resumeSeekDone || this.state.view !== 'player') return;
        const server = this.servers[this.state.activeServer];
        if (!server?.supportsApi) {
            this._resumeSeekDone = true;
            return;
        }
        const time = this._pendingResumeTime || this.getSavedProgress();
        if (!time || time < 5) {
            this._resumeSeekDone = true;
            return;
        }
        const frame = document.getElementById('video-iframe');
        if (!frame?.contentWindow) return;

        this.postToEmbed(frame, 'seek', time);
        this._resumeSeekDone = true;
        this._resumeIgnoreUntil = Date.now() + 2500;
        this._pendingResumeTime = 0;
        this.showToast(`Resumed at ${this.formatTime(time)}`);
        this.setServerStatus(`Live · ${server.name} · ${this.formatTime(time)}`);
    },

    persistProgress(t, force = false) {
        if (typeof t !== 'number' || Number.isNaN(t)) return;
        if (!force && Date.now() < this._resumeIgnoreUntil) return;
        if (!force && Date.now() - this._lastProgressWrite < this._PROGRESS_WRITE_MS) return;

        const { id, type, season, episode } = this.state.activeContent;
        const existing = this.state.history.find(h => String(h.id) === String(id) && h.type === type);
        if (!existing) return;
        existing.progress = t;
        existing.season = season;
        existing.episode = episode;
        this._lastProgressWrite = Date.now();
        this.writeLocalList('alexandria_history', this.state.history);
    },

    async advanceEpisode() {
        const { id, season, episode } = this.state.activeContent;
        this.markEpisodeWatched(id, season, episode, true);
        const eps = this._currentSeasonEpisodes || [];
        const numbers = eps.map(e => e.episode_number).filter(n => Number.isFinite(n));
        const maxEp = numbers.length ? Math.max(...numbers) : episode;

        if (episode < maxEp) {
            window.location.hash = `#tv/${id}/s/${season || 1}/e/${episode + 1}`;
            return;
        }

        try {
            const show = await this.getJson('tv/' + id);
            const seasons = (show.seasons || []).filter(s => s.season_number > 0);
            const nextSeason = seasons.find(s => s.season_number === (season || 1) + 1);
            if (nextSeason) {
                this.showToast(`Season ${season} complete. Loading season ${nextSeason.season_number}…`);
                window.location.hash = `#tv/${id}/s/${nextSeason.season_number}/e/1`;
                return;
            }
        } catch { /* ignore */ }

        this.showToast('End of available episodes.');
        this.persistProgress(0, true);
    },

    bindSoloPlayerEvents() {
        if (this._soloEmbedListener) return;
        this._soloEmbedListener = (event) => {
            if (this.state.view !== 'player') return;
            // Only accept messages from our own embed frame — payload shape
            // alone is spoofable by any other window on the page.
            const frame = document.getElementById('video-iframe');
            if (frame?.contentWindow && event.source !== frame.contentWindow) return;
            const data = event.data;
            if (!data || typeof data !== 'object') return;

            const originOk = this.isTrustedEmbedOrigin(event.origin);
            const looksLikeEmbedMaster = data.source === 'embedmaster_player';
            // Private player sometimes posts from a sibling host; still accept its payload.
            const looksLikePlayerJs = originOk && data.answer !== undefined;
            if (!looksLikeEmbedMaster && !looksLikePlayerJs) return;

            this.markServerHealthy();
            if (!looksLikeEmbedMaster) return;

            if (data.event === 'ready') {
                this.themeEmbedPlayer(document.getElementById('video-iframe'));
                this.tryResumeSeek();
            } else if (!this._resumeSeekDone && this._pendingResumeTime > 0 && (data.event === 'play' || data.event === 'time')) {
                this.tryResumeSeek();
            }

            if (data.event === 'time' || data.event === 'seek' || data.event === 'timeupdate' || data.event === 'play' || data.event === 'pause') {
                // EmbedMaster sometimes skips postMessage "ready" (see
                // armFailoverWatch), which would lock fresh sessions (no saved
                // progress) out of the _resumeSeekDone gate forever — tracking
                // never starts. Unlock on the first playhead event; tryResumeSeek
                // still honors _pendingResumeTime for real resumes.
                if (!this._resumeSeekDone) this.tryResumeSeek();
                const t = data.info?.time;
                if (typeof t === 'number' && this._resumeSeekDone) {
                    this.persistProgress(t, data.event === 'pause' || data.event === 'seek');
                }
            }

            if (data.event === 'finish' || data.event === 'ended' || data.event === 'complete') {
                if (this.state.activeContent.type === 'tv') this.advanceEpisode();
            }
        };
        window.addEventListener('message', this._soloEmbedListener);
    },

    populateSeasonSelector(data, activeSeason) {
        const btn = document.getElementById('season-selector-btn');
        const menu = document.getElementById('season-menu');
        if (!btn || !menu || !data?.seasons) return;

        const seasons = data.seasons.filter(s => s.season_number > 0);
        const active = Number(activeSeason) || seasons[0]?.season_number || 1;
        btn.textContent = `SEASON ${active}`;
        btn.setAttribute('aria-expanded', 'false');
        menu.hidden = true;
        menu.innerHTML = seasons.map(s => `
            <li role="option" class="season-menu-item${s.season_number == active ? ' is-active' : ''}"
                data-season="${s.season_number}"
                aria-selected="${s.season_number == active ? 'true' : 'false'}"
                tabindex="-1"
                onclick="Alexandria.handleSeasonChange(${s.season_number})">
                SEASON ${s.season_number}
            </li>`).join('');

        const title = document.getElementById('sidebar-title');
        if (title && data.name) title.textContent = data.name.toUpperCase();
    },

    toggleSeasonMenu(event) {
        event?.stopPropagation?.();
        const btn = document.getElementById('season-selector-btn');
        const menu = document.getElementById('season-menu');
        if (!btn || !menu) return;
        const open = menu.hidden;
        menu.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            const close = (e) => {
                if (e.target.closest?.('#season-picker')) return;
                menu.hidden = true;
                btn.setAttribute('aria-expanded', 'false');
                document.removeEventListener('click', close);
            };
            setTimeout(() => document.addEventListener('click', close), 0);
        }
    },

    async initSeasonSelector(id, activeSeason) {
        try {
            const data = await this.getJson('tv/' + id);
            this.populateSeasonSelector(data, activeSeason);
        } catch (e) {
            console.error("Alexandria Protocol: Season Init Failed -", e);
            const title = document.getElementById('sidebar-title');
            if (title) title.textContent = 'EPISODE DATA UNAVAILABLE';
        }
    },

    handleSeasonChange(newSeason) {
        const season = Number.parseInt(newSeason, 10);
        if (!Number.isInteger(season) || season < 1) return;
        const menu = document.getElementById('season-menu');
        const btn = document.getElementById('season-selector-btn');
        if (menu) menu.hidden = true;
        if (btn) btn.setAttribute('aria-expanded', 'false');
        window.location.hash = `#tv/${this.state.activeContent.id}/s/${season}/e/1`;
    },

    handleServerChange(newServerIndex) {
        const serverIndex = this.normalizeServerIndex(newServerIndex);
        if (serverIndex == null) return;
        this.applyServer(serverIndex, { resetTried: true });
    },

    async loadEpisodes(id, season) {
        try {
            const data = await this.getJson('tv/' + id + '/season/' + season);
            const container = document.getElementById('sidebar-episodes');
            if (!container) return;
            this._currentSeasonEpisodes = data.episodes || [];

            container.innerHTML = this._currentSeasonEpisodes.map(ep => {
                const watched = !!this.state.watchedEpisodes[`${id}_s${season}e${ep.episode_number}`];
                const still = ep.still_path ? this.imageUrl(ep.still_path, 'w300') : '';
                const overview = ep.overview ? this.escapeHtml(ep.overview) : 'No description on file.';
                return `
                <div class="episode-item ${this.state.activeContent.episode == ep.episode_number ? 'active' : ''}" role="link" tabindex="0"
                     aria-label="Episode ${ep.episode_number}: ${this.escapeHtml(ep.name || 'Untitled episode')}"
                     onclick="window.location.hash = '#tv/${id}/s/${season}/e/${ep.episode_number}'">
                    <div class="ep-card-media">
                        ${still ? `<img src="${still}" alt="" loading="lazy" decoding="async">` : '<div class="ep-card-fallback" aria-hidden="true"></div>'}
                        <span class="ep-num">EP ${ep.episode_number}</span>
                        <div class="ep-card-overlay">
                            <span class="ep-name">${this.escapeHtml(ep.name || 'Untitled episode')}</span>
                            <span class="ep-overview">${overview}</span>
                        </div>
                    </div>
                    <button class="ep-watched-btn ${watched ? 'active' : ''}" type="button" title="Mark episode watched" aria-label="Mark episode ${ep.episode_number} watched" aria-pressed="${watched}"
                        data-show="${id}" data-season="${season}" data-episode="${ep.episode_number}"
                        onclick="event.stopPropagation(); event.preventDefault(); Alexandria.markEpisodeWatched(${id}, ${season}, ${ep.episode_number}, !this.classList.contains('active'))">✓</button>
                </div>`;
            }).join('');
            if (this.state.view === 'player') {
                this.renderComments();
            }
        } catch (error) {
            console.error("Alexandria: Failed to load episodes", error);
            const container = document.getElementById('sidebar-episodes');
            if (container) container.innerHTML = '<div class="placeholder-msg">EPISODES UNREACHABLE</div>';
        }
    },

    // Comments Engine Methods
    // series=true: series-wide key ("tv_123") for the details page; the player
    // keeps per-episode keys ("tv_123_s2_e5") so episode comments stay scoped.
};
