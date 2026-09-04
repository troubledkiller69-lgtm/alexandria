export const profiles = {
    async fetchProfile(uid) {
        if (!uid) return null;
        this._profileCache = this._profileCache || {};
        if (this._profileCache[uid]) return this._profileCache[uid];
        if (!this.supabase) return null;
        try {
            const { data, error } = await this.supabase
                .from('profiles')
                .select('id, username, username_lower, nickname, bio, fav_genres, avatar_id, created_at')
                .eq('id', uid)
                .maybeSingle();
            if (error && error.code !== 'PGRST116') console.warn("Supabase profile fetch:", error);
            if (data) this._profileCache[uid] = data;
            return data || null;
        } catch {
            return null;
        }
    },

    async fetchProfilesBulk(uids) {
        const byId = {};
        const unique = [...new Set((uids || []).filter(Boolean))];
        if (!unique.length || !this.supabase) return byId;
        this._profileCache = this._profileCache || {};
        const missing = [];
        for (const uid of unique) {
            if (this._profileCache[uid]) byId[uid] = this._profileCache[uid];
            else missing.push(uid);
        }
        try {
            for (let i = 0; i < missing.length; i += 100) {
                const chunk = missing.slice(i, i + 100);
                const { data, error } = await this.supabase
                    .from('profiles')
                    .select('id, username, username_lower, nickname, bio, fav_genres, avatar_id, created_at')
                    .in('id', chunk);
                if (error) console.warn("Supabase profile batch fetch:", error);
                for (const row of data || []) {
                    this._profileCache[row.id] = row;
                    byId[row.id] = row;
                }
            }
        } catch {
            /* fall through with whatever resolved */
        }
        return byId;
    },

    logActivity(kind, opts = {}) {
        if (!this.supabase || !this.state.authUser) return;
        const { contentId, contentType, title, posterPath, meta } = opts;
        this.supabase.from('activity').insert({
            user_id: this.state.authUser.id,
            kind,
            content_id: contentId ?? null,
            content_type: contentType ?? null,
            title: title ?? null,
            poster_path: posterPath ?? null,
            meta: meta ?? null
        }).then().catch(() => {});
    },

    pruneOldActivity() {
        if (!this.supabase || !this.supabase.from) return;
        // Keep stats-critical rows (watching/rated/reviewed feed the watch
        // hours, streaks, and heatmap); drop everything else after 24h so the
        // community feed stays fresh without losing anyone's numbers.
        const cutoff = new Date(Date.now() - 86400000).toISOString();
        this.supabase
            .from('activity')
            .delete()
            .lt('created_at', cutoff)
            .not('kind', 'in', '("watching","rated","reviewed")')
            .then(res => {
                if (res && res.error) console.warn("Alexandria Protocol: Activity prune failed", res.error);
            })
            .catch(() => {});
    },

    async renderProfile(uid) {
        const targetUid = uid || this.state.activeProfileId;
        if (!targetUid) {
            this.renderError('This profile is unavailable', 'No user id was supplied.', 'home');
            return;
        }
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING PROFILE...</div>';

        const safeQuery = promise => Promise.resolve(promise).catch(() => ({ data: [] }));

        try {
            const me = this.state.authUser?.id;
            const [profile, activityRes, ratingsRes, commentsRes, listsRes] = await Promise.all([
                this.fetchProfile(targetUid),
                this.supabase ? safeQuery(this.supabase.from('activity').select('*').eq('user_id', targetUid).gte('created_at', new Date(Date.now() - 86400000).toISOString()).order('created_at', { ascending: false }).limit(20)) : Promise.resolve({ data: [] }),
                this.supabase ? safeQuery(this.supabase.from('ratings').select('*').eq('user_id', targetUid).order('created_at', { ascending: false }).limit(50)) : Promise.resolve({ data: [] }),
                this.supabase ? safeQuery(this.supabase.from('comments').select('*').eq('user_id', targetUid).order('created_at', { ascending: false }).limit(50)) : Promise.resolve({ data: [] }),
                this.supabase ? safeQuery(this.supabase.from('movie_night_lists').select('*').eq('owner_id', targetUid).order('created_at', { ascending: false })) : Promise.resolve({ data: [] })
            ]);
            if (token !== this._renderToken) return;

            const [followersRes, followingRes, myFollowRes] = this.supabase
                ? await Promise.all([
                    safeQuery(this.supabase.from('follows').select('follower_id').eq('followee_id', targetUid)),
                    safeQuery(this.supabase.from('follows').select('followee_id').eq('follower_id', targetUid)),
                    (me && me !== targetUid)
                        ? Promise.resolve(this.supabase.from('follows').select('follower_id').eq('follower_id', me).eq('followee_id', targetUid).maybeSingle()).catch(() => ({ data: null }))
                        : Promise.resolve({ data: null })
                ])
                : [{ data: [] }, { data: [] }, { data: null }];
            if (token !== this._renderToken) return;

            if (!profile) {
                this.main.innerHTML = '<div class="placeholder-msg">This profile could not be found.</div>';
                return;
            }

            const activity = activityRes.data || [];
            const ratings = ratingsRes.data || [];
            const comments = commentsRes.data || [];
            const lists = listsRes.data || [];
            const followers = (followersRes.data || []).length;
            const following = (followingRes.data || []).length;
            const isFollowing = Boolean(myFollowRes.data);

            this.state.profileData = { profile, activity, ratings, comments, lists, followers, following, isFollowing };

            const displayName = profile.nickname || profile.username || 'Member';
            const isMe = Boolean(me && me === targetUid);
            const followBtn = (me && !isMe)
                ? `<button type="button" id="profile-follow-btn" class="follow-btn ${isFollowing ? 'following' : ''}" onclick="Alexandria.toggleFollow('${this.escapeHtml(targetUid)}')">${isFollowing ? 'FOLLOWING' : 'FOLLOW'}</button>`
                : '';
            const editBtn = isMe
                ? '<button type="button" class="btn-secondary" onclick="Alexandria.editProfileModal(true)">EDIT PROFILE</button>'
                : '';
            const genreChips = (profile.fav_genres || '')
                .split(',').map(s => s.trim()).filter(Boolean)
                .map(gid => {
                    const g = this.GENRES.find(genre => String(genre.id) === gid);
                    return g ? `<span class="genre-chip">${this.escapeHtml(g.name)}</span>` : '';
                }).join('');
            const tab = ['reviews', 'lists'].includes(this.state.profileTab) ? this.state.profileTab : 'activity';
            this.state.profileTab = tab;

            this.main.innerHTML = `
                <section class="profile-page">
                    <div class="profile-hero">
                        ${this.avatarHtml(profile, 96)}
                        <div class="profile-hero-info">
                            <h1>${this.escapeHtml(displayName)}</h1>
                            ${profile.username ? `<p class="profile-handle">@${this.escapeHtml(profile.username)}</p>` : ''}
                            ${profile.bio ? `<p class="profile-bio">${this.escapeHtml(profile.bio)}</p>` : ''}
                            <div class="profile-stats">
                                <span class="profile-stat"><strong>${activity.length}</strong>Activity</span>
                                <span class="profile-stat"><strong>${ratings.length + comments.length}</strong>Reviews &amp; Comments</span>
                                <span class="profile-stat"><strong>${lists.length}</strong>Lists</span>
                                <span class="profile-stat"><strong id="profile-followers-count">${followers}</strong>Followers</span>
                                <span class="profile-stat"><strong>${following}</strong>Following</span>
                            </div>
                            ${genreChips ? `<div class="profile-genres">${genreChips}</div>` : ''}
                        </div>
                        <div class="profile-hero-actions">
                            ${followBtn}
                            <button type="button" class="btn-secondary" onclick="Alexandria.shareCurrent('${this.escapeHtml(displayName)} on Alexandria')">SHARE</button>
                            ${editBtn}
                        </div>
                    </div>
                    <div class="profile-pulse" id="profile-pulse">
                        <div class="placeholder-msg pulse-loading"><span class="pulse-dot"></span> CALCULATING WATCH STATS...</div>
                    </div>
                    <div class="profile-tabs">
                        <button type="button" class="profile-tab ${tab === 'activity' ? 'active' : ''}" data-tab="activity" onclick="Alexandria.setProfileTab('activity')">ACTIVITY</button>
                        <button type="button" class="profile-tab ${tab === 'reviews' ? 'active' : ''}" data-tab="reviews" onclick="Alexandria.setProfileTab('reviews')">REVIEWS &amp; COMMENTS</button>
                        <button type="button" class="profile-tab ${tab === 'lists' ? 'active' : ''}" data-tab="lists" onclick="Alexandria.setProfileTab('lists')">LISTS</button>
                    </div>
                    <div id="profile-section"></div>
                </section>
            `;
            this.renderProfileSection();
            this.renderProfilePulse(targetUid);
        } catch (e) {
            console.error("Alexandria Protocol: Profile Render Failed", e);
            if (token === this._renderToken) this.renderError('This profile is unavailable', e.message || 'Something went wrong.', 'profile');
        }
    },

    // Pulse — watch-time stats, streaks, heatmap and badges. All derived
    // from public activity/ratings/comments/lists, so anyone can view them.
    async renderProfilePulse(uid) {
        const container = document.getElementById('profile-pulse');
        if (!container) return;
        if (!this.supabase) { container.innerHTML = ''; return; }
        const token = this._renderToken;
        const safeQuery = promise => Promise.resolve(promise).catch(() => ({ data: [] }));
        try {
            const [actRes, ratingRes, commentRes] = await Promise.all([
                safeQuery(this.supabase.from('activity').select('kind, content_id, content_type, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(1000)),
                safeQuery(this.supabase.from('ratings').select('rating').eq('user_id', uid).limit(1000)),
                safeQuery(this.supabase.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', uid))
            ]);
            if (token !== this._renderToken) return;

            const activity = (actRes.data || []).filter(a => a.kind && a.created_at);
            const ratings = ratingRes.data || [];
            const commentCount = Number(commentRes.count) || 0;

            // Day buckets, per-title watch counts, badges input
            const dayCounts = {};
            const dayKeys = [];
            const perTitle = {};
            const tvPerDay = {};
            const moviePerDay = {};
            let nightOwl = false;
            for (const a of activity) {
                const d = this.localDayKey(a.created_at);
                if (!d) continue;
                if (!(d in dayCounts)) dayKeys.push(d);
                dayCounts[d] = (dayCounts[d] || 0) + 1;
                if (a.kind === 'watching') {
                    if (a.content_type === 'tv') tvPerDay[d] = (tvPerDay[d] || 0) + 1;
                    else if (a.content_type === 'movie') moviePerDay[d] = (moviePerDay[d] || 0) + 1;
                    if (a.content_id != null && (a.content_type === 'movie' || a.content_type === 'tv')) {
                        const k = a.content_type + '_' + a.content_id;
                        perTitle[k] = (perTitle[k] || 0) + 1;
                    }
                    const h = new Date(a.created_at).getHours();
                    if (h < 5) nightOwl = true;
                }
            }
            dayKeys.sort();

            // Streaks
            const daySet = new Set(dayKeys);
            const today = this.todayKey();
            let longest = 0, run = 0, prev = null;
            for (const k of dayKeys) {
                run = (prev && this.dayKeyOffset(prev, 1) === k) ? run + 1 : 1;
                if (run > longest) longest = run;
                prev = k;
            }
            let current = 0;
            let cursor = daySet.has(today) ? today : this.dayKeyOffset(today, -1);
            while (daySet.has(cursor)) { current++; cursor = this.dayKeyOffset(cursor, -1); }

            // Approx hours: per watch event, movie runtime / avg episode runtime
            let hours = 0;
            const titleKeys = Object.keys(perTitle);
            if (titleKeys.length > 0) {
                const targets = titleKeys.map(k => {
                    const i = k.indexOf('_');
                    return { key: k, type: k.slice(0, i), id: Number(k.slice(i + 1)) };
                });
                await this.mapWithConcurrency(targets, 4, async t => {
                    const rt = await this.runtimeFor(t.type, t.id);
                    hours += (rt / 60) * perTitle[t.key];
                });
            }
            if (token !== this._renderToken) return;

            const episodes = Object.values(tvPerDay).reduce((s, n) => s + n, 0);
            const titles = titleKeys.length;

            // Heatmap: 16 weeks x 7 days ending today
            const heatStart = new Date();
            heatStart.setDate(heatStart.getDate() - 111);
            heatStart.setHours(0, 0, 0, 0);
            const heatCells = [];
            for (let i = 0; i < 112; i++) {
                const dt = new Date(heatStart);
                dt.setDate(heatStart.getDate() + i);
                const k = this.localDayKey(dt);
                const count = dayCounts[k] || 0;
                const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
                heatCells.push(`<span class="pulse-heat-cell heat-${level}" title="${k} — ${count} event${count === 1 ? '' : 's'}"></span>`);
            }
            let heatHtml = '';
            for (let c = 0; c < 16; c++) {
                heatHtml += `<div class="pulse-heat-col">${heatCells.slice(c * 7, c * 7 + 7).join('')}</div>`;
            }

            // Badges
            const { lists = [], followers = 0, following = 0 } = this.state.profileData || {};
            const maxTvDay = Object.keys(tvPerDay).length ? Math.max(...Object.values(tvPerDay)) : 0;
            const maxMovieDay = Object.keys(moviePerDay).length ? Math.max(...Object.values(moviePerDay)) : 0;
            const icon = p => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
            const badges = [];
            if (titles > 0) badges.push(['FIRST BLOOD', 'Watched your first title', icon('<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>')]);
            if (maxTvDay >= 5) badges.push(['BINGE LORD', '5+ episodes in a single day', icon('<polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline>')]);
            if (maxMovieDay >= 3) badges.push(['MARATHON MAN', '3+ movies in a single day', icon('<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line>')]);
            if (nightOwl) badges.push(['NIGHT OWL', 'Watching after midnight', icon('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>')]);
            if (ratings.length >= 5) badges.push(['CRITIC', '5+ ratings given', icon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>')]);
            if (commentCount >= 10) badges.push(['TALKER', '10+ comments posted', icon('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>')]);
            if (longest >= 7) badges.push(['ON FIRE', '7-day watch streak', icon('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>')]);
            if (longest >= 30) badges.push(['UNSTOPPABLE', '30-day watch streak', icon('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>')]);
            if (lists.length >= 3) badges.push(['CURATOR', '3+ lists created', icon('<polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line>')]);
            if (followers + following >= 3) badges.push(['CONNECTED', '3+ followers or following', icon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>')]);

            const hoursText = hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1);
            container.innerHTML = `
                <div class="pulse-stats-grid">
                    <div class="pulse-stat-card"><span class="pulse-stat-value">${hoursText}</span><span class="pulse-stat-label">HRS WATCHED <span class="pulse-stat-sub">APPROX</span></span></div>
                    <div class="pulse-stat-card"><span class="pulse-stat-value">${episodes}</span><span class="pulse-stat-label">EPISODES</span></div>
                    <div class="pulse-stat-card"><span class="pulse-stat-value">${titles}</span><span class="pulse-stat-label">TITLES</span></div>
                    <div class="pulse-stat-card"><span class="pulse-stat-value">${current}</span><span class="pulse-stat-label">DAY STREAK${longest > current ? ` <span class="pulse-stat-sub">LONGEST ${longest}</span>` : ''}</span></div>
                </div>
                <div class="pulse-heat-wrap">
                    <div class="pulse-heatmap">${heatHtml}</div>
                    <div class="pulse-heat-legend">LESS <span class="pulse-heat-cell heat-1"></span><span class="pulse-heat-cell heat-2"></span><span class="pulse-heat-cell heat-3"></span><span class="pulse-heat-cell heat-4"></span> MORE</div>
                </div>
                ${badges.length ? `<div class="pulse-badges"><span class="pulse-badge-title">BADGES</span>${badges.map(([name, desc, badgeIcon]) => `<span class="pulse-badge" data-desc="${this.escapeHtml(desc)}">${badgeIcon}${this.escapeHtml(name)}</span>`).join('')}</div>` : '<p class="pulse-empty">Start watching to earn badges.</p>'}
            `;
        } catch (e) {
            console.warn("Alexandria Protocol: Pulse stats failed", e);
            if (token === this._renderToken) container.innerHTML = '';
        }
    },

    localDayKey(dateOrIso) {
        const d = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
        if (isNaN(d.getTime())) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    dayKeyOffset(key, delta) {
        const [y, m, d] = key.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() + delta);
        return this.localDayKey(dt);
    },

    todayKey() {
        return this.localDayKey(new Date());
    },

    async runtimeFor(type, id) {
        const k = type + '_' + id;
        if (!this._runtimeCache) this._runtimeCache = {};
        if (this._runtimeCache[k] !== undefined) return this._runtimeCache[k];
        try {
            const data = await this.getJson(type + '/' + id);
            let rt = 0;
            if (type === 'movie') rt = Number(data?.runtime) || 0;
            else if (type === 'tv') {
                rt = (Array.isArray(data?.episode_run_time) && Number(data?.episode_run_time[0]))
                    ? Number(data.episode_run_time[0]) : 45;
            }
            this._runtimeCache[k] = rt;
            return rt;
        } catch {
            this._runtimeCache[k] = type === 'tv' ? 45 : 0;
            return this._runtimeCache[k];
        }
    },

    setProfileTab(tab) {
        if (!['activity', 'reviews', 'lists'].includes(tab)) tab = 'activity';
        this.state.profileTab = tab;
        document.querySelectorAll('.profile-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        this.renderProfileSection();
    },

    renderProfileSection() {
        const container = document.getElementById('profile-section');
        const data = this.state.profileData;
        if (!container || !data) return;
        const { profile, activity, ratings, comments, lists } = data;
        const targetUid = this.state.activeProfileId || profile.id;
        const displayName = profile.nickname || profile.username || 'Member';
        const avatar = size => `<a class="profile-avatar-link" href="#profile/${this.escapeHtml(targetUid)}">${this.avatarHtml(profile, size)}</a>`;
        const nameLink = `<a href="#profile/${this.escapeHtml(targetUid)}">${this.escapeHtml(displayName)}</a>`;
        const titleLink = item => {
            if (item.content_id && (item.content_type === 'movie' || item.content_type === 'tv')) {
                const ctx = this.episodeContext(item);
                if (ctx) {
                    return `<a href="#tv/${this.escapeHtml(item.content_id)}/s/${ctx.season}/e/${ctx.episode}">${this.escapeHtml(item.title || 'this title')} S${ctx.season}E${ctx.episode}</a>`;
                }
                return `<a href="#details/${this.escapeHtml(item.content_type)}/${this.escapeHtml(item.content_id)}">${this.escapeHtml(item.title || 'this title')}</a>`;
            }
            return item.title ? this.escapeHtml(item.title) : '';
        };

        if (this.state.profileTab === 'reviews') {
            container.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING REVIEWS & COMMENTS...</div>';
            this.renderProfileReviews(container, profile, ratings, comments, targetUid);
            return;
        }

        if (this.state.profileTab === 'lists') {
            container.innerHTML = lists.length ? lists.map(l => `
                <div class="profile-section-item">
                    ${avatar(36)}
                    <div class="profile-section-body">
                        <div class="profile-section-line">
                            <span class="profile-verb">list</span>
                            <a href="#list/${this.escapeHtml(l.id)}">${this.escapeHtml(l.title || 'Untitled list')}</a>
                        </div>
                        ${l.description ? `<p class="profile-list-desc">${this.escapeHtml(l.description)}</p>` : ''}
                    </div>
                    <span class="profile-timeago">${this.timeago(l.created_at)}</span>
                </div>
            `).join('') : '<div class="profile-empty">No lists yet.</div>';
            return;
        }

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
        container.innerHTML = activity.length ? activity.map(a => {
            const verb = verbs[a.kind] || 'was active on';
            return `
                <div class="profile-section-item">
                    ${avatar(36)}
                    <div class="profile-section-body">
                        <div class="profile-section-line">
                            ${nameLink}
                            <span class="profile-verb">${verb}</span>
                            ${titleLink(a)}
                        </div>
                    </div>
                    <span class="profile-timeago">${this.timeago(a.created_at)}</span>
                </div>
            `;
        }).join('') : '<div class="profile-empty">No activity yet.</div>';
    },

    // Profile reviews tab: merge written reviews with comments, newest first.
    // Neither table stores display titles, so unique content ids are resolved
    // lazily through the TMDB cache; per-episode comment keys carry the S/E
    // badge and deep-link into the player.
    async renderProfileReviews(container, profile, ratings, comments, targetUid) {
        const displayName = profile.nickname || profile.username || 'Member';
        const avatar = size => `<a class="profile-avatar-link" href="#profile/${this.escapeHtml(targetUid)}">${this.avatarHtml(profile, size)}</a>`;
        const nameLink = `<a href="#profile/${this.escapeHtml(targetUid)}">${this.escapeHtml(displayName)}</a>`;

        // Written reviews are also posted as series-wide comments with the same
        // text; keep the richer review row and skip the duplicate comment.
        const reviewTexts = new Set();
        (ratings || []).forEach(r => {
            if (r.review && r.content_id != null) reviewTexts.add(`${r.content_type}_${r.content_id}_${r.review}`);
        });
        const parsedComments = (comments || [])
            .map(c => {
                const key = c.comment_key || '';
                const perEp = /^tv_(\d+)_s(\d+)_e(\d+)$/.exec(key);
                const series = /^tv_(\d+)$/.exec(key);
                const movie = /^movie_(\d+)$/.exec(key);
                if (perEp) return { kind: 'commented', ts: c.created_at, type: 'tv', id: Number(perEp[1]), season: Number(perEp[2]), episode: Number(perEp[3]), text: c.content, spoiler: !!c.spoiler };
                if (series) return { kind: 'commented', ts: c.created_at, type: 'tv', id: Number(series[1]), season: null, episode: null, text: c.content, spoiler: !!c.spoiler };
                if (movie) return { kind: 'commented', ts: c.created_at, type: 'movie', id: Number(movie[1]), season: null, episode: null, text: c.content, spoiler: !!c.spoiler };
                return null;
            })
            .filter(Boolean)
            .filter(c => !reviewTexts.has(`${c.type}_${c.id}_${c.text}`));

        const merged = [
            ...(ratings || [])
                .filter(r => r.content_id != null && (r.content_type === 'movie' || r.content_type === 'tv'))
                .map(r => ({
                    kind: 'reviewed', ts: r.created_at, type: r.content_type, id: Number(r.content_id),
                    season: null, episode: null, rating: Number(r.rating) || 0, text: r.review || '', spoiler: !!r.spoiler
                })),
            ...parsedComments
        ].sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0)).slice(0, 50);

        if (!merged.length) {
            container.innerHTML = '<div class="profile-empty">No reviews or comments yet.</div>';
            return;
        }

        // Resolve display titles for every unique content id, cached per session.
        if (!this._titleCache) this._titleCache = {};
        const missing = [...new Set(merged.map(i => i.type + '_' + i.id))].filter(k => !(k in this._titleCache));
        await this.mapWithConcurrency(missing, 6, async (key) => {
            const type = key.split('_')[0];
            const id = Number(key.split('_')[1]);
            try {
                const d = await this.getJson(type + '/' + id);
                this._titleCache[key] = d?.name || d?.title || null;
            } catch {
                this._titleCache[key] = null;
            }
        });
        // The user may have switched tabs while titles were resolving.
        if (this.state.profileTab !== 'reviews' || document.getElementById('profile-section') !== container) return;

        const titleFor = item => {
            const t = this._titleCache[item.type + '_' + item.id];
            const perEp = item.season != null && item.episode != null;
            const badge = perEp ? ` <span class="comments-scope-badge">S${item.season}E${item.episode}</span>` : '';
            const href = perEp ? `#tv/${item.id}/s/${item.season}/e/${item.episode}` : `#details/${item.type}/${item.id}`;
            return `<a href="${href}">${this.escapeHtml(t || 'this title')}</a>${badge}`;
        };

        container.innerHTML = merged.map(item => {
            const n = Math.max(1, Math.min(5, Math.round(item.rating)));
            const stars = item.kind === 'reviewed' ? `<div class="profile-review-stars">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</div>` : '';
            return `
                <div class="profile-section-item">
                    ${avatar(36)}
                    <div class="profile-section-body">
                        <div class="profile-section-line">
                            ${nameLink}
                            <span class="profile-verb">${item.kind === 'reviewed' ? 'reviewed' : 'commented on'}</span>
                            ${titleFor(item)}
                        </div>
                        ${stars}
                        ${item.text ? `<p class="profile-review-text">${item.spoiler ? this.spoilerHtml(this.escapeHtml(item.text)) : this.escapeHtml(item.text)}</p>` : ''}
                    </div>
                    <span class="profile-timeago">${this.timeago(item.ts)}</span>
                </div>`;
        }).join('');
    },

    async toggleFollow(uid) {
        if (!uid) return;
        if (!this.supabase || !this.state.authUser) {
            this.toggleAuthModal(true, 'login');
            this.showToast('Sign in to follow');
            return;
        }
        const me = this.state.authUser.id;
        if (me === uid) return;
        try {
            const { data: existing } = await this.supabase
                .from('follows')
                .select('follower_id')
                .eq('follower_id', me)
                .eq('followee_id', uid)
                .maybeSingle();
            const nowFollowing = !existing;
            if (existing) {
                await this.supabase.from('follows').delete().eq('follower_id', me).eq('followee_id', uid);
            } else {
                await this.supabase.from('follows').insert({ follower_id: me, followee_id: uid });
            }
            if (nowFollowing) {
                this.logActivity('followed', { meta: JSON.stringify({ followee: uid }) });
            }
            const btn = document.getElementById('profile-follow-btn');
            if (btn) {
                btn.textContent = nowFollowing ? 'FOLLOWING' : 'FOLLOW';
                btn.classList.toggle('following', nowFollowing);
            }
            const countEl = document.getElementById('profile-followers-count');
            if (countEl) {
                const current = Number(countEl.textContent) || 0;
                countEl.textContent = String(current + (nowFollowing ? 1 : -1));
            }
            this.showToast(nowFollowing ? 'Following' : 'Unfollowed');
        } catch (err) {
            console.warn('Follow toggle failed:', err);
            this.showToast('Could not update follow status');
        }
    },

};
