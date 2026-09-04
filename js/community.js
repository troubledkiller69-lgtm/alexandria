export const community = {
    async renderCommunity() {
        this.state.communityTab = this.state.communityTab || 'all';
        const token = this._renderToken;
        const tab = this.state.communityTab;

        this.main.innerHTML = `
            <section class="filtered-view community-view">
                <div class="view-section">
                    <h3>COMMUNITY</h3>
                    <p class="community-sub">Last 24 hours of archive activity, live as it happens.</p>
                    <div class="feed-tabs">
                        <button type="button" class="feed-tab ${tab === 'all' ? 'active' : ''}" data-tab="all" aria-pressed="${tab === 'all'}" onclick="Alexandria.setCommunityTab('all')">ALL</button>
                        <button type="button" class="feed-tab ${tab === 'following' ? 'active' : ''}" data-tab="following" aria-pressed="${tab === 'following'}" onclick="Alexandria.setCommunityTab('following')">FOLLOWING</button>
                    </div>
                </div>
                <div class="leaderboard-section">
                    <h3>TOP WATCHERS THIS WEEK <span class="leaderboard-window">7-DAY TALLY</span></h3>
                    <div id="leaderboard-list"><div class="placeholder-msg"><span class="pulse-dot"></span> LOADING LEADERBOARD...</div></div>
                </div>
                <div id="feed-list"><div class="placeholder-msg"><span class="pulse-dot"></span> LOADING COMMUNITY FEED...</div></div>
            </section>
        `;

        this.initFeedRealtime();
        this.renderLeaderboard();
        await this.fetchFeed();
        if (token !== this._renderToken) return;
    },

    async renderLeaderboard() {
        const container = document.getElementById('leaderboard-list');
        if (!container || !this.supabase) return;
        const token = this._renderToken;
        const safeQuery = promise => Promise.resolve(promise).catch(() => ({ data: [] }));
        try {
            const since = new Date(Date.now() - 7 * 86400000).toISOString();
            const res = await safeQuery(this.supabase
                .from('activity')
                .select('user_id, kind, content_type')
                .gte('created_at', since)
                .order('created_at', { ascending: false })
                .limit(2000));
            if (token !== this._renderToken) return;

            const tally = {};
            (res.data || []).forEach(a => {
                if (a.kind === 'watching' && a.user_id) {
                    tally[a.user_id] = (tally[a.user_id] || 0) + 1;
                }
            });
            const ranked = Object.entries(tally)
                .map(([uid, score]) => ({ uid, score }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);
            if (token !== this._renderToken) return;

            if (ranked.length === 0) {
                container.innerHTML = '<div class="feed-empty">No watches logged this week yet. Be the first!</div>';
                return;
            }
            await this.fetchProfilesBulk(ranked.map(r => r.uid));
            if (token !== this._renderToken) return;

            const max = ranked[0].score;
            const me = this.state.authUser?.id;
            container.innerHTML = ranked.map((r, i) => {
                const p = this._profileCache?.[r.uid] || null;
                const name = p ? (p.nickname || p.username || 'Member') : 'Member';
                const isMe = me === r.uid;
                return `
                    <a class="leaderboard-row rank-${i + 1} ${isMe ? 'is-me' : ''}" href="#profile/${this.escapeHtml(r.uid)}">
                        <span class="leaderboard-rank">${i + 1}</span>
                        ${this.avatarHtml(p, 36)}
                        <span class="leaderboard-name">${this.escapeHtml(name)}${isMe ? ' <em>(you)</em>' : ''}</span>
                        <span class="leaderboard-count"><strong>${r.score}</strong><span>${r.score === 1 ? 'WATCH' : 'WATCHES'}</span></span>
                        <span class="leaderboard-bar"><span class="leaderboard-bar-fill" style="width:${Math.max(6, Math.round(r.score / max * 100))}%"></span></span>
                    </a>`;
            }).join('');
        } catch (e) {
            console.warn("Alexandria Protocol: Leaderboard failed", e);
            if (token === this._renderToken) container.innerHTML = '<div class="feed-empty">Leaderboard unavailable right now.</div>';
        }
    },

    setCommunityTab(tab) {
        if (!['all', 'following'].includes(tab)) tab = 'all';
        this.state.communityTab = tab;
        document.querySelectorAll('.feed-tab').forEach(btn => {
            const active = btn.dataset.tab === tab;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
        this.fetchFeed();
    },

    async fetchFeed() {
        const container = document.getElementById('feed-list');
        if (!container) return;
        const tab = this.state.communityTab || 'all';
        container.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING COMMUNITY FEED...</div>';

        if (!this.supabase) {
            container.innerHTML = '<div class="feed-empty">The community feed is unavailable right now.</div>';
            return;
        }

        const safeQuery = promise => Promise.resolve(promise).catch(() => ({ data: [] }));
        const since = new Date(Date.now() - 86400000).toISOString();
        try {
            let rows = [];
            if (tab === 'all') {
                const res = await safeQuery(this.supabase.from('activity').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(60));
                rows = res.data || [];
            } else {
                const me = this.state.authUser?.id;
                if (!me) {
                    container.innerHTML = `
                        <div class="feed-empty">
                            <p>Sign in to follow people</p>
                            <button type="button" class="btn-primary" onclick="Alexandria.toggleAuthModal(true, 'login')">SIGN IN</button>
                        </div>`;
                    return;
                }
                const followsRes = await safeQuery(this.supabase.from('follows').select('followee_id').eq('follower_id', me));
                const ids = Array.from(new Set((followsRes.data || []).map(f => f.followee_id).filter(Boolean)));
                this._followingIds = ids;
                if (ids.length === 0) {
                    container.innerHTML = '<div class="feed-empty">You are not following anyone yet. Visit a profile and hit FOLLOW.</div>';
                    return;
                }
                const res = await safeQuery(this.supabase.from('activity').select('*').in('user_id', ids).gte('created_at', since).order('created_at', { ascending: false }).limit(60));
                rows = res.data || [];
            }

            const distinctUsers = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean)));
            await this.fetchProfilesBulk(distinctUsers);

            if (document.getElementById('feed-list') !== container) return;
            if (this.state.communityTab !== tab) return;
            container.innerHTML = rows.length
                ? rows.map(row => this.feedItemHtml(row)).join('')
                : '<div class="feed-empty">THE ARCHIVE IS QUIET — nothing in the last 24 hours.</div>';
        } catch (err) {
            console.warn('Community feed fetch failed:', err);
            container.innerHTML = '<div class="feed-empty">Could not load the community feed.</div>';
        }
    },

    feedItemHtml(row) {
        const profile = this._profileCache?.[row.user_id] || null;
        const displayName = profile ? (profile.nickname || profile.username || 'Member') : 'Member';
        const verbs = {
            watching: 'started watching',
            rated: 'rated',
            reviewed: 'wrote a review of',
            watchlist: 'added to watchlist',
            list_created: 'created the list',
            list_added: 'added a title to a list',
            followed: 'started following someone',
            comment: 'commented on'
        };
        const chips = {
            watching: 'WATCHING',
            rated: 'RATED',
            reviewed: 'REVIEW',
            watchlist: 'WATCHLIST',
            list_created: 'LIST',
            list_added: 'LIST',
            followed: 'FOLLOW',
            comment: 'COMMENT'
        };
        const kind = row.kind || 'activity';
        const verb = verbs[kind] || 'was active on';
        const chip = chips[kind] || 'ACTIVITY';
        let titleHtml = '';
        if (row.content_id && (row.content_type === 'movie' || row.content_type === 'tv')) {
            const ctx = this.episodeContext(row);
            if (ctx) {
                titleHtml = `<a class="feed-item-title" href="#tv/${this.escapeHtml(row.content_id)}/s/${ctx.season}/e/${ctx.episode}">${this.escapeHtml(row.title || 'this title')} S${ctx.season}E${ctx.episode}</a>`;
            } else {
                titleHtml = `<a class="feed-item-title" href="#details/${this.escapeHtml(row.content_type)}/${this.escapeHtml(row.content_id)}">${this.escapeHtml(row.title || 'this title')}</a>`;
            }
        } else if (row.title) {
            titleHtml = `<span class="feed-item-title">${this.escapeHtml(row.title)}</span>`;
        }
        const poster = (row.content_type === 'movie' || row.content_type === 'tv') && row.poster_path
            ? `<img class="feed-poster-thumb" src="${this.imageUrl(row.poster_path, 'w92')}" alt="" loading="lazy" decoding="async">`
            : '';
        return `
            <div class="feed-item feed-kind-${this.escapeHtml(kind)}">
                <a class="feed-item-avatar" href="#profile/${this.escapeHtml(row.user_id)}" aria-label="${this.escapeHtml(displayName)}">${this.avatarHtml(profile, 40)}</a>
                <div class="feed-item-body">
                    <div class="feed-item-line">
                        <a class="feed-item-user" href="#profile/${this.escapeHtml(row.user_id)}">${this.escapeHtml(displayName)}</a>
                        <span class="profile-verb">${this.escapeHtml(verb)}</span>
                        ${titleHtml}
                    </div>
                    <div class="feed-item-meta">
                        <span class="feed-kind-chip feed-kind-${this.escapeHtml(kind)}">${this.escapeHtml(chip)}</span>
                        <span class="feed-item-time">${this.escapeHtml(this.timeago(row.created_at))}</span>
                    </div>
                </div>
                ${poster}
            </div>`;
    },

    initFeedRealtime() {
        if (!this.supabase) return;
        if (this.feedChannel) {
            this.supabase.removeChannel(this.feedChannel);
            this.feedChannel = null;
        }
        this.feedChannel = this.supabase.channel('community_feed');
        this.feedChannel
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, async (payload) => {
                if (this.state.view !== 'community') return;
                const row = payload.new;
                if (!row || !row.user_id) return;
                if (this.state.communityTab === 'following' && !(Array.isArray(this._followingIds) && this._followingIds.includes(row.user_id))) return;
                await this.fetchProfile(row.user_id);
                if (this.state.view !== 'community') return;
                const list = document.getElementById('feed-list');
                if (!list) return;
                const empty = list.querySelector('.feed-empty');
                if (empty) empty.remove();
                list.insertAdjacentHTML('afterbegin', this.feedItemHtml(row));
                while (list.children.length > 60) list.removeChild(list.lastElementChild);
            })
            .subscribe();
    },

    editProfileModal(open) {
        let modal = document.getElementById('profile-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'profile-modal';
            modal.className = 'profile-modal-overlay';
            modal.setAttribute('hidden', '');
            modal.innerHTML = `
                <div class="profile-modal-card">
                    <button class="auth-close-btn" type="button" aria-label="Close" onclick="Alexandria.editProfileModal(false)">✕</button>
                    <h3 class="profile-modal-title">EDIT PROFILE</h3>
                    <div class="auth-field">
                        <label>Username (@)</label>
                        <input type="text" id="profile-username-input" placeholder="Your unique @ handle" minlength="3" maxlength="20" autocomplete="off">
                    </div>
                    <div class="auth-field">
                        <label>Nickname</label>
                        <input type="text" id="profile-nickname-input" placeholder="Your display name" maxlength="40">
                    </div>
                    <div class="auth-field">
                        <label>Bio</label>
                        <textarea id="profile-bio-input" rows="4" placeholder="Tell the archive about yourself" maxlength="500"></textarea>
                    </div>
                    <span class="profile-modal-label">Avatar</span>
                    <div class="avatar-picker" id="avatar-picker"></div>
                    <span class="profile-modal-label">Favorite Genres</span>
                    <div class="genre-picker" id="genre-picker"></div>
                    <div class="profile-modal-actions">
                        <button type="button" class="btn-secondary" onclick="Alexandria.editProfileModal(false)">CANCEL</button>
                        <button type="button" class="btn-primary" onclick="Alexandria.saveProfile()">SAVE</button>
                    </div>
                </div>
            `;
            modal.addEventListener('click', e => { if (e.target === modal) this.editProfileModal(false); });
            document.body.appendChild(modal);
        }
        const show = open !== undefined ? Boolean(open) : modal.hasAttribute('hidden');
        if (show) {
            modal.removeAttribute('hidden');
            this.prefillProfileModal();
        } else {
            modal.setAttribute('hidden', '');
        }
    },

    async prefillProfileModal() {
        const me = this.state.authUser?.id;
        if (!me) return;
        const nicknameInput = document.getElementById('profile-nickname-input');
        if (nicknameInput) {
            nicknameInput.value = this.state.authUser?.user_metadata?.username
                || sessionStorage.getItem('alexandria_nickname')
                || localStorage.getItem('alexandria_username')
                || '';
        }
        const profile = await this.fetchProfile(me);
        const modal = document.getElementById('profile-modal');
        if (!profile || !modal || modal.hasAttribute('hidden')) return;
        const usernameInput = document.getElementById('profile-username-input');
        if (usernameInput) usernameInput.value = profile.username || '';
        if (nicknameInput && profile.nickname) nicknameInput.value = profile.nickname;
        const bioInput = document.getElementById('profile-bio-input');
        if (bioInput) bioInput.value = profile.bio || '';
        this.state.profileAvatarSelection = profile.avatar_id || 'python';
        const picker = document.getElementById('avatar-picker');
        if (picker) {
            picker.innerHTML = this.AVATAR_PRESETS.map((p, i) => {
                const prev = this.AVATAR_PRESETS[i - 1];
                const label = p.group && prev?.group !== p.group
                    ? `<span class="avatar-picker-label">${this.escapeHtml(p.group)}</span>`
                    : '';
                const body = p.img
                    ? `<img src="${p.local ? p.img : this.imageUrl(p.img, 'w185')}" alt="" loading="lazy" decoding="async">`
                    : p.emoji;
                return `${label}<button type="button" class="avatar-picker-btn ${profile.avatar_id === p.id ? 'selected' : ''}" data-avatar="${p.id}" aria-label="${p.id}" onclick="Alexandria.selectProfileAvatar('${p.id}', this)">${body}</button>`;
            }).join('');
        }
        this.state.profileGenreSelection = new Set(
            (profile.fav_genres || '').split(',').map(s => s.trim()).filter(Boolean)
        );
        const genrePicker = document.getElementById('genre-picker');
        if (genrePicker) {
            genrePicker.innerHTML = this.GENRES.map(g => `
                <button type="button" class="genre-chip genre-chip-btn ${this.state.profileGenreSelection.has(String(g.id)) ? 'selected' : ''}" data-genre="${g.id}" onclick="Alexandria.toggleProfileGenre(${g.id}, this)">${this.escapeHtml(g.name)}</button>
            `).join('');
        }
    },

    selectProfileAvatar(id, btn) {
        this.state.profileAvatarSelection = id;
        document.querySelectorAll('.avatar-picker-btn').forEach(b => b.classList.toggle('selected', b === btn));
    },

    toggleProfileGenre(genreId, btn) {
        const set = this.state.profileGenreSelection || new Set();
        const key = String(genreId);
        if (set.has(key)) set.delete(key); else set.add(key);
        this.state.profileGenreSelection = set;
        if (btn) btn.classList.toggle('selected', set.has(key));
    },

    async saveProfile() {
        const me = this.state.authUser?.id;
        if (!me) return;
        const username = (document.getElementById('profile-username-input')?.value || '').trim();
        const nickname = (document.getElementById('profile-nickname-input')?.value || '').trim();
        const bio = (document.getElementById('profile-bio-input')?.value || '').trim();
        if (!username) {
            this.showToast('Username (@handle) is required');
            return;
        }
        if (username.length < 3 || username.length > 20) {
            this.showToast('Username must be 3-20 characters');
            return;
        }
        if (!nickname) {
            this.showToast('Nickname is required');
            return;
        }
        if (!this.supabase) {
            this.showToast('Supabase cloud required for profiles.');
            return;
        }
        const usernameLower = username.toLowerCase();
        const profile = await this.fetchProfile(me).catch(() => null);
        const usernameChanged = !profile || (profile.username || '').toLowerCase() !== usernameLower;
        if (usernameChanged) {
            const isUnique = await this.checkUsernameUnique(username, me);
            if (!isUnique) {
                this.showToast(`@${username} is already taken. Try another.`);
                document.getElementById('profile-username-input')?.focus();
                return;
            }
        }
        const genres = this.state.profileGenreSelection ? [...this.state.profileGenreSelection] : [];
        const avatarId = this.state.profileAvatarSelection || 'python';
        try {
            await this.supabase.from('profiles').update({
                username,
                username_lower: usernameLower,
                nickname,
                bio,
                fav_genres: genres.join(','),
                avatar_id: avatarId
            }).eq('id', me);
            if (usernameChanged) {
                try {
                    await this.supabase.auth.updateUser({ data: { username } });
                } catch { /* metadata sync is best-effort */ }
                localStorage.setItem('alexandria_username', username);
            }
            sessionStorage.setItem('alexandria_nickname', nickname);
            this._profileCache = this._profileCache || {};
            delete this._profileCache[me];
            this.showToast('Profile saved');
            this.editProfileModal(false);
            this.updateAuthUI();
            if (this.state.view === 'profile') {
                this.state.profileTab = 'activity';
                this.renderProfile();
            }
        } catch (err) {
            console.warn('Profile save failed:', err);
            // 23505 = unique_violation: someone grabbed this @ between our
            // uniqueness check and the update (DB constraint is the backstop).
            if (err && (err.code === '23505' || /duplicate key/.test(err.message || ''))) {
                this.showToast(`@${username} is already taken. Try another.`);
                document.getElementById('profile-username-input')?.focus();
            } else {
                this.showToast('Could not save profile');
            }
        }
    },
    // #endregion

};
