export const auth = {
    toggleAuthModal(open, tab = 'login') {
        const modal = document.getElementById('auth-modal');
        if (!modal) return;
        const show = open !== undefined ? Boolean(open) : modal.hasAttribute('hidden');
        if (show) {
            modal.removeAttribute('hidden');
            this.renderAuthModal(tab);
        } else {
            modal.setAttribute('hidden', '');
        }
    },

    toggleAccountMenu() {
        this.closeChangelogMenu();
        const menu = document.getElementById('account-menu');
        if (!menu) return;
        if (!menu.hasAttribute('hidden')) {
            this.closeAccountMenu();
            return;
        }
        const signedIn = Boolean(this.state.authUser);
        menu.innerHTML = `
            <a href="#community" class="account-menu-item" onclick="Alexandria.closeAccountMenu()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                Community
            </a>
            ${signedIn ? `
                <button type="button" class="account-menu-item" onclick="Alexandria.closeAccountMenu(); window.location.hash = '#profile/${this.escapeHtml(this.state.authUser.id)}'">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    My Profile
                </button>
            ` : ''}
            <button type="button" class="account-menu-item" onclick="Alexandria.closeAccountMenu(); window.location.hash = '#settings'">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                Settings
            </button>
            <div class="account-menu-divider"></div>
            ${signedIn
                ? `<button type="button" class="account-menu-item" onclick="Alexandria.signOut()">Sign Out</button>`
                : `<button type="button" class="account-menu-item" onclick="Alexandria.closeAccountMenu(); Alexandria.toggleAuthModal(true, 'login')">Sign In / Create Account</button>`}
        `;
        menu.removeAttribute('hidden');
    },

    closeAccountMenu() {
        const menu = document.getElementById('account-menu');
        if (menu) menu.setAttribute('hidden', '');
    },

    // ============ WHAT'S NEW — changelog bell ============
    // Kept short on purpose: latest release plus the four before it.
    // Older entries are cut — the bell is a "what changed lately" list,
    // not an archive.
    CHANGELOG: [
        {
            key: 'v1.12.0',
            date: 'Sep 21, 2026',
            title: 'Watchlist Diary & Settings Rebuild',
            items: [
                'Watchlist goes diary-style: your own 5-star ratings with halves, reviews, and a log modal that stamps date + shelf + review in one save',
                'List view joins the watchlist — dense rows with your stars, review snippets, and a status pill that advances on click',
                'Watched-but-unrated titles get a gold "needs a verdict" nudge banner so nothing goes unjudged',
                'Details pages grow a YOUR TAKE block: rate inline, read your review, jump to the diary',
                'Settings rebuilt as tabs (Playback / Appearance / Library / System) with a live mirror health dot, storage meter, and a danger zone',
                'Home hero rotates the top 5 trending titles with autoplay, dots, and preloading'
            ]
        },
        {
            key: 'v1.11.0',
            date: 'Sep 3, 2026',
            title: 'Mirror Watch & Live Archives',
            items: [
                'Server picker now prefers mirrors that answered a health check, so you spend less time staring at blank players',
                'Franchise archives moved into a live database — new universes and fixes roll out without a redeploy',
                'Continue watching posters show a red RESUME strip with your exact timestamp',
                'Under the hood: comments and feeds load in one batch query instead of one per person, the home airing row fetches only shows that actually air this week, and TV episodes no longer double-fetch their comments'
            ]
        },
        {
            key: 'v1.10.0',
            date: 'Aug 23, 2026',
            title: 'Anime Mirrors & Share Everything',
            items: [
                'Dedicated anime servers — MegaPlay (AniList-powered) and VidSrc Anime appear automatically when you open an anime, with a DUB/SUB toggle in the player bar that sticks across sessions',
                'Details pages for anime show DUB AVAILABLE / SUB ONLY badges',
                'Roulette gains a WATCHLIST mode — spin your own queue when you cannot pick',
                'Profiles and Movie Night lists get real share cards — links unfurl with name, stats, and posters on Discord & Telegram',
                'Import from AniList: hit the new AniList button in the sidebar, enter your username, and your list plus scores land here',
                'SHARE buttons rebuilt — instant clipboard copy with confirmation, native share sheet on phones',
                'Faster boots (no more fake loading gate), batched imports, parallel cloud sync',
                'Alexandria is now installable — manifest added for home-screen / app use'
            ]
        },
        {
            key: 'v1.9.7',
            date: 'Aug 21, 2026',
            title: 'Party Play/Pause Control',
            items: [
                'Hosts get a PAUSE/PLAY button in the watch party bar — one click pauses or resumes the whole room, since the embed never reports its own play/pause events to us',
                'Guests follow the host toggle automatically, with the sync clock holding the right timestamp'
            ]
        },
        {
            key: 'v1.9.6',
            date: 'Aug 21, 2026',
            title: 'Letterboxd Import & Netflix-Style Search',
            items: [
                'Import your Letterboxd export CSV (watched.csv or watchlist.csv) through the sidebar Import Lists button — titles are matched against TMDB, watchlist and ratings sync to your account',
                'Search page rebuilt: full-width flush search bar, underline type tabs, TRENDING NOW / RESULTS headers',
                'Recent searches appear as chips on the search page — click to re-run, ✕ to forget, CLEAR to wipe',
                'Roulette got a gold pill treatment in the search toolbar'
            ]
        },
        {
            key: 'v1.9.5',
            date: 'Aug 21, 2026',
            title: 'Share Cards',
            items: [
                'Sharing a title now copies an alexandr1a.vercel.app/share/movie/123 link instead of a raw hash URL',
                'Discord and Telegram unfurls show the poster, title, year, and description — plus Twitter large-image cards',
                'People clicking a shared link land directly on the title page'
            ]
        }
    ],

    updateChangelogDot() {
        const dot = document.getElementById('changelog-dot');
        if (!dot) return;
        const latest = this.CHANGELOG[0];
        const seen = localStorage.getItem('alexandria_changelog_seen');
        dot.hidden = !(latest && seen !== latest.key);
    },

    toggleChangelogMenu() {
        this.closeAccountMenu();
        const menu = document.getElementById('changelog-menu');
        if (!menu) return;
        if (!menu.hasAttribute('hidden')) {
            this.closeChangelogMenu();
            return;
        }
        // "NEW" badge only while the latest release is unread — same state the dot tracks.
        const latestSeen = localStorage.getItem('alexandria_changelog_seen');
        menu.innerHTML = `
            <div class="changelog-menu-head">
                <h3>What's New</h3>
                <span class="changelog-date">${this.escapeHtml(this.CHANGELOG[0].date || '')}</span>
            </div>
        ` + this.CHANGELOG.map((entry, i) => `
            <div class="changelog-entry">
                <div class="changelog-entry-head">
                    <span class="changelog-version">${this.escapeHtml(entry.key)}${i === 0 && latestSeen !== entry.key ? ' <em class="changelog-new">NEW</em>' : ''}</span>
                    ${entry.date ? `<span class="changelog-date">${this.escapeHtml(entry.date)}</span>` : ''}
                </div>
                <h4 class="changelog-title">${this.escapeHtml(entry.title)}</h4>
                <ul class="changelog-items">
                    ${entry.items.map(item => `<li>${this.escapeHtml(item)}</li>`).join('')}
                </ul>
            </div>
        `).join('');
        menu.removeAttribute('hidden');
        // Opening marks the latest release as seen.
        const latest = this.CHANGELOG[0];
        if (latest) this.writeStorage(localStorage, 'alexandria_changelog_seen', latest.key);
        this.updateChangelogDot();
    },

    closeChangelogMenu() {
        const menu = document.getElementById('changelog-menu');
        if (menu) menu.setAttribute('hidden', '');
    },

    signOut() {
        this.closeAccountMenu();
        this.handleSignOut();
    },

    renderAuthModal(tab = 'login') {
        const body = document.getElementById('auth-modal-body');
        if (!body) return;

        if (this.state.authUser) {
            const u = this.state.authUser;
            const name = u.user_metadata?.username || u.email || 'User';
            const initial = name.charAt(0).toUpperCase();
            const profileHash = '#profile/' + encodeURIComponent(u.id);
            body.innerHTML = `
                <div class="auth-profile-card">
                    <div class="auth-profile-avatar">${this.escapeHtml(initial)}</div>
                    <div class="auth-profile-info">
                        <h3>${this.escapeHtml(name)}</h3>
                        <p>${this.escapeHtml(u.email || 'Verified Account')}</p>
                    </div>
                    <button type="button" class="btn-primary btn-block" onclick="Alexandria.toggleAuthModal(false); window.location.hash = '${profileHash}'">VIEW PROFILE</button>
                    <button type="button" class="btn-quiet btn-block" onclick="Alexandria.toggleAuthModal(false); window.location.hash = '#settings'">SETTINGS</button>
                    <button type="button" class="btn-quiet btn-block" onclick="Alexandria.editProfileModal(true)">EDIT PROFILE</button>
                    <button type="button" class="btn-danger btn-block" onclick="Alexandria.handleSignOut()">LOG OUT</button>
                </div>
            `;
            return;
        }

        body.innerHTML = `
            <div class="auth-tabs">
                <button type="button" class="auth-tab-btn ${tab === 'login' ? 'active' : ''}" onclick="Alexandria.renderAuthModal('login')">SIGN IN</button>
                <button type="button" class="auth-tab-btn ${tab === 'signup' ? 'active' : ''}" onclick="Alexandria.renderAuthModal('signup')">CREATE ACCOUNT</button>
            </div>

            ${tab === 'login' ? `
                <form class="auth-form" onsubmit="Alexandria.handleSignIn(event)">
                    <div class="auth-field">
                        <label>Email Address</label>
                        <input type="email" id="auth-email" placeholder="name@example.com" required>
                    </div>
                    <div class="auth-field">
                        <label>Password</label>
                        <input type="password" id="auth-password" placeholder="••••••••" required>
                    </div>
                    <button type="submit" class="btn-primary btn-block">SIGN IN</button>
                </form>
            ` : `
                <form class="auth-form" onsubmit="Alexandria.handleSignUp(event)">
                    <div class="auth-field">
                        <label>Unique Username</label>
                        <input type="text" id="auth-username" placeholder="Pick a unique handle" required minlength="3" maxlength="20">
                    </div>
                    <div class="auth-field">
                        <label>Email Address</label>
                        <input type="email" id="auth-email" placeholder="name@example.com" required>
                    </div>
                    <div class="auth-field">
                        <label>Password</label>
                        <input type="password" id="auth-password" placeholder="Min 6 characters" required minlength="6">
                    </div>
                    <button type="submit" class="btn-primary btn-block">CREATE ACCOUNT</button>
                </form>
                <details class="auth-perks">
                    <summary>Why create an account?</summary>
                    <ul>
                        <li><b>Take your library anywhere</b> — watchlist, episode progress, and history sync across every device.</li>
                        <li><b>Watch together</b> — host or join Watch Party rooms with synced playback.</li>
                        <li><b>Join the conversation</b> — comment, reply, and react with your name on it.</li>
                        <li><b>Your profile</b> — avatar, stats, streaks, badges, and follows.</li>
                        <li><b>Movie nights</b> — build shared lists and plan with friends.</li>
                        <li><b>Bring your taste</b> — import Letterboxd and AniList lists straight into your account.</li>
                    </ul>
                    <p class="auth-perks-note">No account needed to watch, save, or rate — that stuff always works in this browser.</p>
                </details>
            `}
            <button type="button" class="btn-arrow" style="align-self: center; margin-top: 0.5rem;" onclick="Alexandria.toggleAuthModal(false); window.location.hash = '#settings'">SETTINGS</button>
        `;
    },

    async checkUsernameUnique(username, excludeId = null) {
        const clean = username.trim().toLowerCase();
        if (!this.supabase) {
            const usedNames = this.readStorageJson(localStorage, 'alexandria_claimed_usernames', []) || [];
            return !usedNames.includes(clean);
        }
        try {
            let query = this.supabase
                .from('profiles')
                .select('username')
                .eq('username_lower', clean);
            if (excludeId) query = query.neq('id', excludeId);
            const { data, error } = await query.maybeSingle();
            if (error && error.code !== 'PGRST116') console.warn("Supabase username check:", error);
            return !data;
        } catch {
            return true;
        }
    },

    async handleSignUp(e) {
        if (e) e.preventDefault();
        const usernameInput = document.getElementById('auth-username');
        const emailInput = document.getElementById('auth-email');
        const passwordInput = document.getElementById('auth-password');

        const username = usernameInput?.value?.trim();
        const email = emailInput?.value?.trim();
        const password = passwordInput?.value;

        if (!username || !email || !password) return;

        const isUnique = await this.checkUsernameUnique(username);
        if (!isUnique) {
            this.showToast(`Username "${username}" is already taken! Try another.`);
            usernameInput.focus();
            return;
        }

        if (this.supabase) {
            try {
                const redirectUrl = window.location.origin + window.location.pathname;
                const { data, error } = await this.supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: redirectUrl,
                        data: { username }
                    }
                });

                if (error) {
                    this.showToast(`Sign up failed: ${error.message}`);
                    return;
                }

                if (data?.session && data?.user) {
                    // Email verification disabled or auto-confirmed
                    await this.ensureUserProfile(data.user, username);
                    this.writeStorage(sessionStorage, 'alexandria_nickname', username);
                    this.writeStorage(localStorage, 'alexandria_username', username);
                    this.state.authUser = data.user;
                    this.updateAuthUI();
                    this.toggleAuthModal(false);
                    this.showToast(`Account created! Welcome, ${username}.`);
                } else if (data?.user) {
                    // Email verification required by Supabase settings
                    this.toggleAuthModal(false);
                    this.showToast("Account created! Please check your email to verify your account.");
                }
            } catch (err) {
                console.error("Sign up error:", err);
                this.showToast("Registration error. Check network connection.");
            }
        } else {
            const usedNames = this.readStorageJson(localStorage, 'alexandria_claimed_usernames', []) || [];
            usedNames.push(username.toLowerCase());
            try { localStorage.setItem('alexandria_claimed_usernames', JSON.stringify(usedNames)); } catch { /* quota */ }
            this.writeStorage(sessionStorage, 'alexandria_nickname', username);
            this.writeStorage(localStorage, 'alexandria_username', username);
            this.updateAuthUI();
            this.toggleAuthModal(false);
            this.showToast(`Profile saved! Hello, ${username}.`);
        }
    },

    async handleSignIn(e) {
        if (e) e.preventDefault();
        const emailInput = document.getElementById('auth-email');
        const passwordInput = document.getElementById('auth-password');
        const email = emailInput?.value?.trim();
        const password = passwordInput?.value;

        if (!email || !password) return;

        if (this.supabase) {
            try {
                const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
                if (error) {
                    this.showToast(`Sign in failed: ${error.message}`);
                    return;
                }
                const username = data.user?.user_metadata?.username || email.split('@')[0];
                // Self-heal: users who signed up under email verification have no
                // profile row (signup returned no session, so the client could not
                // insert one). Ensure it exists now that we have a session.
                await this.ensureUserProfile(data.user, username);
                this.writeStorage(sessionStorage, 'alexandria_nickname', username);
                this.writeStorage(localStorage, 'alexandria_username', username);
                this.state.authUser = data.user;
                this.updateAuthUI();
                this.toggleAuthModal(false);
                this.showToast(`Welcome back, ${username}!`);
            } catch (err) {
                console.error("Sign in error:", err);
                this.showToast("Sign in failed. Check credentials.");
            }
        } else {
            this.showToast("Supabase cloud required for authentication.");
        }
    },

    async handleSignOut() {
        if (this.supabase) {
            await this.supabase.auth.signOut();
        }
        this.state.authUser = null;
        try { sessionStorage.removeItem('alexandria_nickname'); } catch { /* ignore */ }
        try { localStorage.removeItem('alexandria_username'); } catch { /* ignore */ }
        try {
            for (let i = sessionStorage.length - 1; i >= 0; i--) {
                const k = sessionStorage.key(i);
                if (k && (k.startsWith('alexandria_party_creator_') || k === 'alexandria_party_uid')) {
                    sessionStorage.removeItem(k);
                }
            }
        } catch { /* ignore */ }
        this.updateAuthUI();
        this.toggleAuthModal(false);
        if (this.state.view === 'details' || this.state.view === 'player') {
            this.refreshCommunity();
        }
        this.showToast("Logged out successfully.");
    },

    updateAuthUI() {
        const btnLabel = document.getElementById('auth-btn-label');
        if (!btnLabel) return;

        if (this.state.authUser) {
            const fallback = this.state.authUser.user_metadata?.username
                || sessionStorage.getItem('alexandria_nickname')
                || localStorage.getItem('alexandria_username')
                || this.state.authUser.email?.split('@')[0]
                || 'Account';
            btnLabel.textContent = fallback;
            this.fetchProfile(this.state.authUser.id).then(profile => {
                const current = document.getElementById('auth-btn-label');
                if (current && this.state.authUser && profile?.nickname) {
                    current.textContent = profile.nickname;
                }
            }).catch(() => {});
        } else {
            btnLabel.textContent = 'Account';
        }
    },

    async ensureUserProfile(user, preferredUsername) {
        if (!this.supabase || !user) return;
        const base = preferredUsername || user.user_metadata?.username || user.email?.split('@')[0] || 'User';
        for (let attempt = 0; attempt < 3; attempt++) {
            const username = attempt === 0 ? base : `${base}${attempt + 1}`;
            try {
                await this.supabase.from('profiles').upsert({
                    id: user.id,
                    username,
                    username_lower: username.toLowerCase(),
                    nickname: username,
                    created_at: new Date().toISOString()
                }, { onConflict: 'id' });
                return;
            } catch (err) {
                // 23505 = unique_violation: this @ is taken (someone raced the
                // signup). Retry with a numbered suffix rather than silently
                // failing to create the profile.
                const isDuplicate = err && (err.code === '23505' || /duplicate key/.test(err.message || ''));
                if (!isDuplicate) {
                    console.warn("Profile sync note:", err);
                    return;
                }
            }
        }
    },

    async bindAuthListeners() {
        if (!this.supabase) return;
        try {
            const { data } = await this.supabase.auth.getSession();
            if (data?.session?.user) {
                this.state.authUser = data.session.user;
                const username = data.session.user.user_metadata?.username || data.session.user.email?.split('@')[0];
                if (username) {
                    this.writeStorage(sessionStorage, 'alexandria_nickname', username);
                    this.writeStorage(localStorage, 'alexandria_username', username);
                }
                this.ensureUserProfile(data.session.user, username);
            } else {
                this.state.authUser = null;
            }
        } catch (err) {
            console.warn("Session restore note:", err);
            this.state.authUser = null;
        }

        this.updateAuthUI();

        this.supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                this.state.authUser = session.user;
                const username = session.user.user_metadata?.username || session.user.email?.split('@')[0];
                if (username) {
                    this.writeStorage(sessionStorage, 'alexandria_nickname', username);
                    this.writeStorage(localStorage, 'alexandria_username', username);
                }
                this.ensureUserProfile(session.user, username);
                if (event === 'SIGNED_IN') {
                    this.showToast(`Welcome back, ${username || 'user'}!`);
                }
            } else {
                this.state.authUser = null;
                try { sessionStorage.removeItem('alexandria_nickname'); } catch { /* ignore */ }
                try { localStorage.removeItem('alexandria_username'); } catch { /* ignore */ }
            }
            this.updateAuthUI();
            await this.syncFromCloud();
            if (this.state.view === 'details' || this.state.view === 'player') {
                this.refreshCommunity();
            }
        });
    },

};
