export const router = {
    handleRouting() {
        const hash = window.location.hash || '#home';
        const path = hash.replace('#', '');
        
        // Deep Link Parsing
        if (path.startsWith('movie/')) {
            const id = Number.parseInt(path.split('/')[1], 10);
            if (!Number.isInteger(id) || id < 1) { this.setView('home'); return; }
            this.state.activeContent = { id, type: 'movie', isAnime: false, season: 1, episode: 1 };
            this.setView('player');
        } else if (path.startsWith('tv/')) {
            const parts = path.split('/');
            const id = Number.parseInt(parts[1], 10);
            if (!Number.isInteger(id) || id < 1) { this.setView('home'); return; }
            const sIndex = parts.indexOf('s');
            const eIndex = parts.indexOf('e');
            const season = Math.max(1, sIndex !== -1 ? parseInt(parts[sIndex+1], 10) || 1 : 1);
            const episode = Math.max(1, eIndex !== -1 ? parseInt(parts[eIndex+1], 10) || 1 : 1);
            this.state.activeContent = { id, type: 'tv', isAnime: false, season, episode };
            this.setView('player');
        } else if (path.startsWith('party/')) {
            const parts = path.split('/');
            const roomId = parts[1];
            const type = parts[2];
            const id = Number.parseInt(parts[3], 10);
            if (!roomId || (type !== 'movie' && type !== 'tv') || !Number.isInteger(id) || id < 1) {
                this.setView('home');
                return;
            }
            
            let season = 1;
            let episode = 1;
            if (type === 'tv') {
                const sIndex = parts.indexOf('s');
                const eIndex = parts.indexOf('e');
                season = Math.max(1, sIndex !== -1 ? parseInt(parts[sIndex+1], 10) || 1 : 1);
                episode = Math.max(1, eIndex !== -1 ? parseInt(parts[eIndex+1], 10) || 1 : 1);
            }
            this.state.activeContent = { id, type, isAnime: false, season, episode };
            this.state.partyRoomId = roomId;
            this.setView('party');
        } else if (path.startsWith('search/')) {
            try {
                this.state.searchQuery = decodeURIComponent(path.replace('search/', ''));
            } catch {
                this.state.searchQuery = '';
            }
            this.setView('search');
        } else if (path.startsWith('details/')) {
            const parts = path.split('/');
            const id = Number.parseInt(parts[2], 10);
            const type = parts[1];
            if (!Number.isInteger(id) || id < 1 || !['movie', 'tv'].includes(type)) { this.setView('home'); return; }
            this.state.activeContent = { id, type, isAnime: false, season: 1, episode: 1 };
            this.setView('details');
        } else if (path.startsWith('person/')) {
            const id = Number.parseInt(path.split('/')[1], 10);
            if (!Number.isInteger(id) || id < 1) { this.setView('home'); return; }
            this.state.activeContent = { id, type: 'person' };
            this.setView('person');
        } else if (path.startsWith('profile/')) {
            let uid = '';
            try {
                uid = decodeURIComponent(path.split('/').slice(1).join('/')).trim();
            } catch {
                uid = path.split('/').slice(1).join('/').trim();
            }
            if (!uid) { this.setView('home'); return; }
            this.state.activeProfileId = uid;
            this.state.profileTab = 'activity';
            this.state.profileData = null;
            this.setView('profile');
        } else if (path.startsWith('list/')) {
            const listId = path.split('/').slice(1).join('/').trim();
            if (!listId) { this.setView('home'); return; }
            this.state.activeListId = listId;
            this.setView('list');
        } else if (path === 'roulette') {
            this.openRouletteModal();
            return;
        } else {
            const allowedViews = new Set(['home', 'movies', 'tv', 'anime', 'franchises', 'search', 'history', 'watchlist', 'community']);
            this.setView(allowedViews.has(path) ? path : 'home');
        }
    },

    bindEvents() {
        // Sidebar Toggle Logic
        const sidebar = document.querySelector('.cyber-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const toggleBtn = document.getElementById('sidebar-toggle');
        const closeBtn = document.getElementById('sidebar-close');

        const toggleSidebar = (force) => {
            const willOpen = typeof force === 'boolean' ? force : !sidebar?.classList.contains('open');
            if (typeof force === 'boolean') {
                sidebar?.classList.toggle('open', force);
                overlay?.classList.toggle('active', force);
            } else {
                sidebar?.classList.toggle('open');
                overlay?.classList.toggle('active');
            }
            toggleBtn?.setAttribute('aria-expanded', String(willOpen));
            if (sidebar) {
                try { sidebar.inert = !willOpen; } catch { /* older browsers */ }
                sidebar.classList.toggle('is-inert', !willOpen);
                if (willOpen) sidebar.removeAttribute('inert');
                else sidebar.setAttribute('inert', '');
            }
            overlay?.setAttribute('aria-hidden', String(!willOpen));
            document.body.classList.toggle('sidebar-open', willOpen);
            if (willOpen) closeBtn?.focus();
            else if (force === false && document.activeElement === closeBtn) toggleBtn?.focus();
        };

        toggleBtn?.addEventListener('click', toggleSidebar);
        closeBtn?.addEventListener('click', () => toggleSidebar(false));
        overlay?.addEventListener('click', () => toggleSidebar(false));
        
        // Auto-close sidebar on nav clicks
        document.querySelectorAll('.nav-link, .sidebar-brand, .header-brand').forEach(el => {
            el.addEventListener('click', () => toggleSidebar(false));
        });

        document.querySelectorAll('.brand-button').forEach(button => {
            button.addEventListener('click', () => { window.location.hash = '#home'; });
        });

        document.addEventListener('click', (e) => {
            const wrapper = document.getElementById('genre-dropdown-wrapper');
            if (wrapper && !wrapper.contains(e.target)) {
                wrapper.classList.remove('open');
            }
        });

        document.addEventListener('click', (e) => {
            const menu = document.getElementById('account-menu');
            const trigger = document.getElementById('auth-trigger');
            if (menu && !menu.hasAttribute('hidden') && !menu.contains(e.target) && !trigger?.contains(e.target)) {
                menu.setAttribute('hidden', '');
            }
        });

        document.addEventListener('click', (e) => {
            const menu = document.getElementById('changelog-menu');
            const trigger = document.getElementById('changelog-trigger');
            if (menu && !menu.hasAttribute('hidden') && !menu.contains(e.target) && !trigger?.contains(e.target)) {
                menu.setAttribute('hidden', '');
            }
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && sidebar?.classList.contains('open')) toggleSidebar(false);
            if (event.key === 'Escape') { this.closeAccountMenu(); this.closeChangelogMenu(); }
            const keyEl = this.eventElement(event.target);
            if ((event.key === 'Enter' || event.key === ' ') && keyEl?.matches('.cast-card, .episode-item, .resume-widget, .person-result-card')) {
                event.preventDefault();
                keyEl.click();
            }
        });

        const backToTop = document.getElementById('back-to-top');
        window.addEventListener('scroll', () => {
            const visible = window.scrollY > 500;
            backToTop?.classList.toggle('visible', visible);
            backToTop?.setAttribute('aria-hidden', String(!visible));
            if (backToTop) backToTop.tabIndex = visible ? 0 : -1;
        }, { passive: true });
        backToTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

        const enhanceContent = () => {
            this.main?.querySelectorAll('button:not([type])').forEach(button => { button.type = 'button'; });
            this.main?.querySelectorAll('.carousel-arrow').forEach(button => {
                button.setAttribute('aria-label', button.classList.contains('left') ? 'Scroll backward' : 'Scroll forward');
            });
        };
        new MutationObserver(enhanceContent).observe(this.main, { childList: true, subtree: true });
        enhanceContent();

        // Global click listener
        document.addEventListener('click', async (e) => {
            const logBtn = e.target.classList.contains('log-btn') ? e.target : e.target.closest('.log-btn');
            const searchTrigger = e.target.id === 'search-trigger' || e.target.closest('#search-trigger');
            const retryButton = e.target.closest('[data-retry-view]');
            const searchRetry = e.target.closest('[data-search-retry]');

            if (searchRetry) {
                this.executeSearch(this.state.searchQuery);
            } else if (retryButton) {
                this.setView(retryButton.dataset.retryView || 'home');
            } else if (logBtn) {
                e.preventDefault();
                const item = {
                    id: logBtn.dataset.id,
                    type: logBtn.dataset.type,
                    title: logBtn.dataset.title,
                    poster_path: logBtn.dataset.poster || ''
                };
                await this.toggleWatchlist(item);
            } else if (searchTrigger) {
                window.location.hash = '#search';
            } else {
                const card = e.target.classList.contains('movie-card') ? e.target : e.target.closest('.movie-card');
                if (card) {
                    if (card.classList.contains('person-result-card') || card.dataset.type === 'person') {
                        const personId = card.dataset.id;
                        if (personId) window.location.hash = `#person/${personId}`;
                        return;
                    }
                    const season = parseInt(card.dataset.season, 10);
                    const episode = parseInt(card.dataset.episode, 10);

                    if (season && episode) {
                        window.location.hash = `#tv/${card.dataset.id}/s/${season}/e/${episode}`;
                    } else if (card.dataset.type && card.dataset.id) {
                        window.location.hash = `#details/${card.dataset.type}/${card.dataset.id}`;
                    }
                }
            }
        });

        // Trailer previews on poster hover (desktop only, hover-intent)
        this.main.addEventListener('mouseover', (e) => {
            const w = e.target.closest('.poster-wrapper[data-trailer]');
            if (!w) return;
            if (!window.matchMedia('(hover: hover)').matches) return;
            if (window.innerWidth < 900) return;
            if (!this._trailerTimers) this._trailerTimers = new Map();
            if (this._trailerTimers.has(w)) return;
            if (w.querySelector('.trailer-preview')) return;
            this._trailerTimers.set(w, setTimeout(() => {
                this._trailerTimers.delete(w);
                if (!w.isConnected || !w.matches(':hover')) return;
                this.loadTrailerPreview(w);
            }, 650));
        });

        this.main.addEventListener('mouseout', (e) => {
            const w = e.target.closest('.poster-wrapper[data-trailer]');
            if (!w) return;
            if (e.relatedTarget && w.contains(e.relatedTarget)) return;
            const t = this._trailerTimers.get(w);
            if (t) { clearTimeout(t); this._trailerTimers.delete(w); }
            const f = w.querySelector('.trailer-preview');
            if (f) f.remove();
            w.classList.remove('trailer-playing');
        });

        // Scrolling moves cards under a stationary pointer without firing
        // mouseout, so previews kept playing after you scrolled away. Sweep
        // previews (and pending hover timers) whose card is no longer under
        // the pointer on any scroll, including inner carousels (capture).
        window.addEventListener('scroll', () => {
            clearTimeout(this._scrollPreviewCleanup);
            this._scrollPreviewCleanup = setTimeout(() => {
                this.main.querySelectorAll('.trailer-preview').forEach(f => {
                    const w = f.closest('.poster-wrapper');
                    if (w && !w.matches(':hover')) {
                        f.remove();
                        w.classList.remove('trailer-playing');
                    }
                });
                if (this._trailerTimers) {
                    this._trailerTimers.forEach((t, w) => {
                        if (!w.isConnected || !w.matches(':hover')) {
                            clearTimeout(t);
                            this._trailerTimers.delete(w);
                        }
                    });
                }
            }, 120);
        }, { capture: true, passive: true });

    },

    teardownParty() {
        if (this._partySyncTimer) {
            clearInterval(this._partySyncTimer);
            this._partySyncTimer = null;
        }
        if (this._partyClockTimer) {
            clearInterval(this._partyClockTimer);
            this._partyClockTimer = null;
        }
        if (this._partyPresenceResyncTimer) {
            clearTimeout(this._partyPresenceResyncTimer);
            this._partyPresenceResyncTimer = null;
        }
        if (this._partyGuestFlushTimer) {
            clearTimeout(this._partyGuestFlushTimer);
            this._partyGuestFlushTimer = null;
        }
        if (this._partyApplyLockTimer) {
            clearTimeout(this._partyApplyLockTimer);
            this._partyApplyLockTimer = null;
        }
        if (this._partyFrameLoadTimer) {
            clearTimeout(this._partyFrameLoadTimer);
            this._partyFrameLoadTimer = null;
        }
        if (this._partyReadyResyncTimer) {
            clearTimeout(this._partyReadyResyncTimer);
            this._partyReadyResyncTimer = null;
        }
        this.clearPartyEmbedWatch();
        this.clearHostPartyResyncTimers();
        this.clearGuestPartyResyncTimers();
        this._partyFrameReloading = false;
        this._partyEmbedHealthy = false;
        if (this.partyChannel && this.supabase) {
            this.supabase.removeChannel(this.partyChannel);
            this.partyChannel = null;
        }
        this.isHost = false;
        this.notifiedHost = false;
        this._partyGuestHinted = false;
        this._partyLastAction = null;
        this._partyLastTime = 0;
        this._applyingRemoteSync = false;
        this._partyGuestUnlocked = false;
        this._pendingPartySync = null;
        this._partyEpisodesLoadedKey = null;
        this.state.partyRoomId = null;
    },

    setView(view) {
        if (this.state.view === 'party' && view !== 'party') {
            this.teardownParty();
        }
        if (view !== 'community' && this.feedChannel && this.supabase) {
            this.supabase.removeChannel(this.feedChannel);
            this.feedChannel = null;
        }
        if (this.commentsChannel && this.supabase) {
            this.supabase.removeChannel(this.commentsChannel);
            this.commentsChannel = null;
        }
        this._commentsChannelKey = null;
        if (this.listChannel && this.supabase) {
            this.supabase.removeChannel(this.listChannel);
            this.listChannel = null;
        }
        clearTimeout(this._listRefreshTimer);
        this._listRefreshTimer = null;
        if (this.state.view === 'player' && view !== 'player') {
            this.writeLocalList('alexandria_history', this.state.history);
        }
        if (view !== 'player') this.clearFailoverWatch();
        this.state.view = view;
        this._renderToken += 1;
        if (this._autoNextTimer) { clearInterval(this._autoNextTimer); this._autoNextTimer = null; }
        this.render();
        window.scrollTo({ top: 0, behavior: 'auto' });
    },

    dedupeItems(list) {
        if (!Array.isArray(list)) return [];
        const seen = new Set();
        const result = [];
        for (const item of list) {
            if (!item || item.id == null || !item.type) continue;
            const key = `${String(item.id)}_${item.type}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push(item);
            }
        }
        return result;
    },

};
