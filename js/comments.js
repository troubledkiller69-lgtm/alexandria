export const comments = {
    getCommentKey(content = this.state.activeContent, series = false) {
        const { id, type, season, episode } = content || {};
        if (!id || !type) return null;
        if (type === 'tv' && !series) {
            const s = season || 1;
            const e = episode || 1;
            return `tv_${id}_s${s}_e${e}`;
        }
        if (type === 'tv') return `tv_${id}`;
        return `movie_${id}`;
    },

    // Re-render whichever community surface is on screen (details merged section or player comments).
    refreshCommunity() {
        const { type, id } = this.state.activeContent || {};
        if (this.state.view === 'details' && type && id) {
            this.renderCommunitySection(type, id);
        } else {
            this.renderComments();
        }
    },

    getComments(commentKey, series = false) {
        if (!commentKey) return Promise.resolve([]);
        const localComments = () => {
            try {
                const allComments = this.readStorageJson(localStorage, 'alexandria_comments', {}) || {};
                if (!series) return allComments[commentKey] || [];
                // Series view: gather the series key plus every per-episode key under it.
                const prefix = commentKey + '_';
                const out = [];
                for (const [k, v] of Object.entries(allComments)) {
                    if (k === commentKey || k.startsWith(prefix)) {
                        if (Array.isArray(v)) out.push(...v);
                    }
                }
                return out;
            } catch {
                return [];
            }
        };
        if (!this.supabase) return Promise.resolve(localComments());
        let query = this.supabase
            .from('comments')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
        if (series) {
            query = query.or(`comment_key.eq.${commentKey},comment_key.like.${commentKey}_%`);
        } else {
            query = query.eq('comment_key', commentKey);
        }
        return query
            .then(({ data, error }) => {
                if (error) throw error;
                const rows = (data || []).map(row => ({
                    id: row.id,
                    author: row.author,
                    text: row.content,
                    createdAt: row.created_at,
                    userId: row.user_id,
                    isMine: row.user_id === this.state.authUser?.id,
                    spoiler: !!row.spoiler,
                    parentId: row.parent_id || null
                }));
                // Pull any pre-auth localStorage comments up into the cloud once.
                this.migrateLocalComments(commentKey).catch(() => {});
                return rows;
            })
            .catch(e => {
                console.warn("Alexandria: Cloud comments unavailable, using local", e);
                return localComments();
            });
    },

    async migrateLocalComments(key) {
        if (!this.supabase || !this.state.authUser || !key) return;
        if (this._migratedCommentKeys.has(key)) return;
        this._migratedCommentKeys.add(key);
        let entries = [];
        try {
            const all = this.readStorageJson(localStorage, 'alexandria_comments', {}) || {};
            entries = Array.isArray(all[key]) ? all[key].filter(e => e && e.text) : [];
        } catch {
            return;
        }
        if (!entries.length) return;
        const userId = this.state.authUser.id;
        let failed = false;
        for (const entry of entries) {
            try {
                // author is derived server-side by the comments_set_author trigger.
                const { error } = await this.supabase.from('comments').insert({
                    comment_key: key,
                    content: entry.text,
                    user_id: userId,
                    spoiler: !!entry.spoiler
                });
                if (error) failed = true;
            } catch {
                failed = true;
            }
        }
        if (!failed) {
            try {
                const all = this.readStorageJson(localStorage, 'alexandria_comments', {}) || {};
                if (all[key]) {
                    delete all[key];
                    localStorage.setItem('alexandria_comments', JSON.stringify(all));
                }
            } catch { /* swallow */ }
        }
    },

    async saveComment(commentKey, commentObj) {
        if (!commentKey || !commentObj) return null;
        if (this.supabase && this.state.authUser) {
            try {
                const { data, error } = await this.supabase
                    .from('comments')
                    .insert({
                        comment_key: commentKey,
                        content: commentObj.text,
                        user_id: this.state.authUser.id,
                        spoiler: !!commentObj.spoiler,
                        parent_id: commentObj.parentId || null
                    })
                    .select();
                if (!error && data && data.length) {
                    const row = data[0];
                    return {
                        id: row.id,
                        author: row.author,
                        text: row.content,
                        createdAt: row.created_at,
                        userId: row.user_id,
                        isMine: true,
                        cloud: true,
                        spoiler: !!row.spoiler,
                        parentId: row.parent_id || null
                    };
                }
            } catch (e) {
                console.warn("Alexandria: Cloud comment insert failed, using local", e);
            }
        }
        try {
            const allComments = this.readStorageJson(localStorage, 'alexandria_comments', {}) || {};
            if (!allComments[commentKey]) allComments[commentKey] = [];
            allComments[commentKey].unshift(commentObj);
            localStorage.setItem('alexandria_comments', JSON.stringify(allComments));
        } catch (e) {
            console.error("Alexandria: Failed to save comment", e);
        }
        return commentObj;
    },

    async deleteComment(commentKey, commentId) {
        if (!commentKey || !commentId) return;
        const isLegacyLocal = String(commentId).startsWith('c_');
        if (isLegacyLocal || !this.supabase || !this.state.authUser) {
            try {
                const allComments = this.readStorageJson(localStorage, 'alexandria_comments', {}) || {};
                if (allComments[commentKey]) {
                    allComments[commentKey] = allComments[commentKey].filter(c => c.id !== commentId);
                    localStorage.setItem('alexandria_comments', JSON.stringify(allComments));
                }
            } catch (e) {
                console.error("Alexandria: Failed to delete comment", e);
            }
        } else {
            try {
                const { error } = await this.supabase.from('comments').delete().eq('id', commentId);
                if (error) throw error;
            } catch (e) {
                console.warn("Alexandria: Cloud comment delete failed", e);
                this.showToast('Could not delete comment');
                return;
            }
        }
        this.refreshCommunity();
        this.showToast('Comment deleted');
    },

    // Emoji reactions (ghost / fire) on cloud comments. One reaction per user
    // per comment; tapping the same emoji again removes it, tapping the other
    // switches it. Local pre-auth comments (c_ ids) can't carry reactions.
    async fetchReactions(commentIds) {
        if (!this.supabase || !Array.isArray(commentIds) || !commentIds.length) return {};
        if (this._reactionsUnavailable) return {};
        try {
            const { data, error } = await this.supabase
                .from('comment_reactions')
                .select('comment_id, user_id, emoji')
                .in('comment_id', commentIds);
            if (error) {
                if (error.code === 'PGRST205' || error.code === '42P01') {
                    this._reactionsUnavailable = true;
                    return {};
                }
                throw error;
            }
            const map = {};
            (data || []).forEach(r => {
                (map[r.comment_id] = map[r.comment_id] || []).push(r);
            });
            return map;
        } catch (e) {
            this._reactionsUnavailable = true;
            console.warn("Alexandria: Comment reactions unavailable", e);
            return {};
        }
    },

    async toggleReaction(commentId, emoji) {
        if (!this.supabase || !this.state.authUser) {
            this.showToast('Sign in to react to comments.');
            this.toggleAuthModal(true, 'signup');
            return;
        }
        if (!commentId || String(commentId).startsWith('c_')) return;
        const me = this.state.authUser.id;
        const key = this.getCommentKey(this.state.activeContent);
        try {
            const { data: existing } = await this.supabase
                .from('comment_reactions')
                .select('emoji')
                .eq('comment_id', commentId)
                .eq('user_id', me)
                .maybeSingle();
            if (existing) {
                if (existing.emoji === emoji) {
                    await this.supabase.from('comment_reactions').delete().eq('comment_id', commentId).eq('user_id', me);
                } else {
                    await this.supabase.from('comment_reactions').update({ emoji }).eq('comment_id', commentId).eq('user_id', me);
                }
            } else {
                await this.supabase.from('comment_reactions').insert({ comment_id: commentId, user_id: me, emoji, comment_key: key || '' });
            }
            this.refreshCommunityQuiet();
        } catch (e) {
            console.warn("Alexandria: Reaction toggle failed", e);
            this.showToast('Could not save reaction');
        }
    },

    prepareReply(commentId, authorName) {
        if (!this.state.authUser) {
            this.showToast('Sign in to reply to comments.');
            this.toggleAuthModal(true, 'signup');
            return;
        }
        if (!commentId || String(commentId).startsWith('c_')) return;
        this.state._replyTo = { id: commentId, author: authorName || 'comment' };
        this.updateComposerReplyUI();
        const input = document.getElementById('comment-input');
        if (input) input.focus();
    },

    cancelReply() {
        this.state._replyTo = null;
        this.updateComposerReplyUI();
    },

    updateComposerReplyUI() {
        const pill = document.getElementById('reply-to-pill');
        const label = document.getElementById('reply-to-label');
        if (!pill || !label) return;
        if (this.state._replyTo) {
            label.textContent = 'Replying to ' + (this.state._replyTo.author || 'comment');
            pill.removeAttribute('hidden');
        } else {
            pill.setAttribute('hidden', '');
        }
    },

    refreshCommunityQuiet() {
        const { type, id } = this.state.activeContent || {};
        if (this.state.view === 'details' && type && id) {
            this.renderCommunitySection(type, id, { quiet: true });
        } else {
            this.renderComments({ quiet: true });
        }
    },

    reactionRowHtml(c, reactionsMap, authorName) {
        const me = this.state.authUser?.id;
        const isCloud = !String(c.id).startsWith('c_');
        if (!isCloud) return '';
        const rx = reactionsMap[c.id] || [];
        const ghosts = rx.filter(r => r.emoji === 'ghost').length;
        const fires = rx.filter(r => r.emoji === 'fire').length;
        const mine = rx.find(r => r.user_id === me);
        const safeId = this.escapeHtml(c.id);
        return `
            <div class="comment-reactions-row">
                <button type="button" class="react-btn ${mine?.emoji === 'ghost' ? 'active' : ''}" aria-pressed="${mine?.emoji === 'ghost'}" title="Haunting" onclick="Alexandria.toggleReaction('${safeId}', 'ghost')">👻 <span class="react-count">${ghosts || ''}</span></button>
                <button type="button" class="react-btn ${mine?.emoji === 'fire' ? 'active' : ''}" aria-pressed="${mine?.emoji === 'fire'}" title="Heat" onclick="Alexandria.toggleReaction('${safeId}', 'fire')">🔥 <span class="react-count">${fires || ''}</span></button>
                ${this.state.authUser ? `<button type="button" class="comment-reply-btn" onclick="Alexandria.prepareReply('${safeId}', '${this.escapeHtml(authorName)}')">REPLY</button>` : ''}
            </div>`;
    },

    commentCardHtml(c, profileById, safeKey, reactionsMap) {
        const profile = c.userId ? profileById[c.userId] : null;
        const authorName = profile ? (profile.nickname || profile.username || c.author || 'Member') : (c.author || 'Member');
        const initial = (c.author || 'G').charAt(0).toUpperCase();
        const safeId = this.escapeHtml(c.id);
        const avatar = c.userId && profile
            ? `<a class="comment-avatar-link" href="#profile/${this.escapeHtml(c.userId)}" aria-label="${this.escapeHtml(authorName)}">${this.avatarHtml(profile, 38)}</a>`
            : `<div class="comment-avatar" aria-hidden="true">${initial}</div>`;
        const authorNode = c.userId
            ? `<a class="comment-author comment-author-link" href="#profile/${this.escapeHtml(c.userId)}">${this.escapeHtml(authorName)}</a>`
            : `<span class="comment-author">${this.escapeHtml(authorName)}</span>`;
        return `
            <div class="comment-card">
                ${avatar}
                <div class="comment-body">
                    <div class="comment-meta">
                        ${authorNode}
                        <span class="comment-time">${this.escapeHtml(this.timeago(c.createdAt))}</span>
                        ${c.isMine ? `
                            <button type="button" class="comment-delete-btn" aria-label="Delete comment" title="Delete comment" data-key="${safeKey}" data-id="${safeId}" onclick="Alexandria.deleteComment('${safeKey}', '${safeId}')">✕</button>
                        ` : ''}
                    </div>
                    <p class="comment-text">${c.spoiler ? this.spoilerHtml(this.escapeHtml(c.text)) : this.escapeHtml(c.text)}</p>
                    ${this.reactionRowHtml(c, reactionsMap, authorName)}
                </div>
            </div>`;
    },

    // Threads: top-level comments render flat; replies nest one level under
    // their parent (deeper replies flatten into the same indent so threads
    // never ladder off-screen). Returns {ts, html} entries for time-sorting
    // with ratings in the merged community list.
    threadEntries(comments, profileById, safeKey, reactionsMap) {
        const byId = new Map((comments || []).map(c => [String(c.id), c]));
        const top = (comments || []).filter(c => !c.parentId || !byId.has(String(c.parentId)));
        const topSet = new Set(top.map(c => String(c.id)));
        const anchorOf = new Map();
        (comments || []).forEach(c => {
            if (!c.parentId || topSet.has(String(c.id))) return;
            let p = String(c.parentId);
            const guard = new Set();
            while (!topSet.has(p) && byId.has(p) && !guard.has(p)) {
                guard.add(p);
                const parent = byId.get(p);
                p = parent.parentId ? String(parent.parentId) : p;
            }
            anchorOf.set(String(c.id), topSet.has(p) ? p : null);
        });
        const childrenOf = new Map();
        (comments || []).forEach(c => {
            if (!c.parentId || topSet.has(String(c.id))) return;
            const anchor = anchorOf.get(String(c.id));
            if (!anchor) return;
            const arr = childrenOf.get(anchor) || [];
            arr.push(c);
            childrenOf.set(anchor, arr);
        });
        return top.map(c => {
            const replies = (childrenOf.get(String(c.id)) || [])
                .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            let html = this.commentCardHtml(c, profileById, safeKey, reactionsMap);
            if (replies.length) {
                html = `<div class="comment-thread">${html}<div class="comment-replies">${replies.map(r => this.commentCardHtml(r, profileById, safeKey, reactionsMap)).join('')}</div></div>`;
            }
            return { ts: new Date(c.createdAt || 0).getTime(), html };
        });
    },

    threadHtml(comments, profileById, safeKey, reactionsMap) {
        return this.threadEntries(comments, profileById, safeKey, reactionsMap).map(e => e.html).join('');
    },

    async addComment() {
        if (!this.state.authUser) {
            this.showToast('Please sign in or create an account to post comments.');
            this.toggleAuthModal(true, 'signup');
            return;
        }
        const input = document.getElementById('comment-input');
        const text = input?.value?.trim();
        if (!text) return;

        const content = this.state.activeContent;
        const key = this.getCommentKey(content);
        if (!key) return;

        const u = this.state.authUser;
        const nickname = u.user_metadata?.username || u.email?.split('@')[0] || sessionStorage.getItem('alexandria_nickname') || 'Member';

        const spoilerBox = document.getElementById('comment-spoiler');
        const replyTo = this.state._replyTo || null;
        const commentObj = {
            id: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            key,
            author: nickname,
            text,
            createdAt: new Date().toISOString(),
            isMine: true,
            spoiler: spoilerBox ? spoilerBox.checked : false,
            parentId: replyTo ? replyTo.id : null
        };

        let cloudPosted = false;
        let savedLocally = false;
        try {
            if (this.supabase) {
                await this.migrateLocalComments(key);
                const profile = await this.fetchProfile(u.id);
                const saved = await this.saveComment(key, { ...commentObj, author: profile?.nickname || nickname });
                cloudPosted = !!(saved && saved.cloud);
                savedLocally = !cloudPosted; // saveComment already fell back to localStorage
            }
        } catch (e) {
            console.warn("Alexandria: Cloud comment post failed", e);
        }
        if (!cloudPosted && !savedLocally) {
            this.saveComment(key, commentObj);
        }

        input.value = '';
        this.state._replyTo = null;
        this.updateComposerReplyUI();
        this.refreshCommunity();
        this.showToast(replyTo ? 'Reply posted!' : 'Comment posted!');

        if (cloudPosted) {
            const tvMatch = /^tv_([0-9]+)/.exec(key);
            const movieMatch = /^movie_([0-9]+)/.exec(key);
            const match = tvMatch || movieMatch;
            this.logActivity('comment', {
                contentId: match ? parseInt(match[1], 10) : null,
                contentType: tvMatch ? 'tv' : (movieMatch ? 'movie' : null),
                title: this.state.detailsTitle || this.state.activeContent?.title || '',
                meta: JSON.stringify({ commentKey: key })
            });
        }
    },

    editNickname() {
        const current = sessionStorage.getItem('alexandria_nickname') || 'Guest';
        const name = prompt('Change your display nickname:', current);
        if (name && name.trim()) {
            const clean = name.trim().slice(0, 24);
            sessionStorage.setItem('alexandria_nickname', clean);
            localStorage.setItem('alexandria_username', clean);
            this.refreshCommunity();
            this.showToast(`Nickname updated to "${clean}"`);
        }
    },

    async renderComments(opts = {}) {
        const container = document.getElementById('comments-section-container');
        if (!container) return;

        const content = this.state.activeContent;
        if (!content || !content.id) {
            container.innerHTML = '';
            this.teardownCommentsRealtime();
            return;
        }

        const key = this.getCommentKey(content);
        if (!key) {
            container.innerHTML = '';
            this.teardownCommentsRealtime();
            return;
        }

        this.setupCommentsRealtime(key);

        const token = this._renderToken;
        if (!opts.quiet) {
            container.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING COMMENTS...</div>';
        }
        const draft = opts.quiet ? this.captureCommentDraft() : null;

        const comments = await this.getComments(key);
        if (token !== this._renderToken) return;

        const uids = [...new Set((comments || []).map(c => c.userId).filter(Boolean))];
        const profiles = await Promise.all(uids.map(uid => this.fetchProfile(uid).catch(() => null)));
        if (token !== this._renderToken) return;
        const profileById = {};
        uids.forEach((uid, i) => { if (profiles[i]) profileById[uid] = profiles[i]; });

        const me = this.state.authUser?.id;
        const myProfile = me ? await this.fetchProfile(me).catch(() => null) : null;
        if (token !== this._renderToken) return;

        const isLoggedIn = !!this.state.authUser;
        const nickname = myProfile?.nickname
            || this.state.authUser?.user_metadata?.username
            || sessionStorage.getItem('alexandria_nickname')
            || 'Member';
        const scopeBadge = content.type === 'tv'
            ? `S${content.season || 1}:E${content.episode || 1}`
            : 'MOVIE';

        const safeKey = this.escapeHtml(key);
        let reactionsMap = {};
        if (this.supabase) {
            const cloudIds = (comments || []).filter(c => !String(c.id).startsWith('c_')).map(c => c.id);
            reactionsMap = await this.fetchReactions(cloudIds);
            if (token !== this._renderToken) return;
        }
        const rowsHtml = comments.length > 0 ? this.threadHtml(comments, profileById, safeKey, reactionsMap) : `
            <div class="placeholder-msg comments-empty">No comments yet. Be the first to start the discussion for ${scopeBadge}!</div>
        `;

        container.innerHTML = `
            <div class="comments-widget">
                <div class="comments-header">
                    <h3>DISCUSSION & REVIEWS (${comments.length}) <span class="comments-scope-badge">${scopeBadge}</span></h3>
                    ${isLoggedIn ? `
                        <div class="comments-user-badge">
                            ${this.avatarHtml(myProfile, 28)}
                            <span>Posting as <strong>${this.escapeHtml(nickname)}</strong></span>
                            <button type="button" class="btn-text-link" onclick="Alexandria.editNickname()">CHANGE</button>
                        </div>
                    ` : ''}
                </div>

                ${isLoggedIn ? `
                    <div class="comments-composer">
                        <div class="reply-to-pill" id="reply-to-pill" hidden>
                            <span id="reply-to-label"></span>
                            <button type="button" class="reply-to-cancel" aria-label="Cancel reply" onclick="Alexandria.cancelReply()">✕</button>
                        </div>
                        <textarea id="comment-input" placeholder="Share your thoughts on this episode or movie..." maxlength="500" rows="3"></textarea>
                        <div class="comments-composer-footer">
                            <label class="spoiler-toggle" title="Blurs the comment until someone clicks it">
                                <input type="checkbox" id="comment-spoiler">
                                <span class="spoiler-toggle-text">Spoiler</span>
                            </label>
                            <span class="char-count">Up to 500 characters</span>
                            <button type="button" class="btn-primary" onclick="Alexandria.addComment()">POST COMMENT</button>
                        </div>
                    </div>
                ` : `
                    <div class="comments-locked-banner">
                        <div class="comments-locked-content">
                            <span class="comments-locked-icon">🔒</span>
                            <div class="comments-locked-text">
                                <strong>Join the Discussion</strong>
                                <p>Sign in or create a free account to post comments on this ${content.type === 'tv' ? 'episode' : 'movie'}.</p>
                            </div>
                        </div>
                        <button type="button" class="btn-primary" onclick="Alexandria.toggleAuthModal(true, 'signup')">CREATE ACCOUNT / SIGN IN</button>
                    </div>
                `}

                <div class="comments-list">
                    ${rowsHtml}
                </div>
            </div>
        `;
        if (draft) this.restoreCommentDraft(draft);
        this.updateComposerReplyUI();
    },

    setupCommentsRealtime(key) {
        if (!this.supabase || !key) return;
        if (this._commentsChannelKey === key && this.commentsChannel) return;
        if (this.commentsChannel) {
            this.supabase.removeChannel(this.commentsChannel);
            this.commentsChannel = null;
        }
        if (this.reactionsChannel) {
            this.supabase.removeChannel(this.reactionsChannel);
            this.reactionsChannel = null;
        }
        this.commentsChannel = this.supabase.channel('comments_' + key);
        this.commentsChannel
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'comments',
                filter: 'comment_key=eq.' + key
            }, payload => {
                if (payload.new && payload.new.user_id !== this.state.authUser?.id) {
                    const { type, id } = this.state.activeContent || {};
                    if (this.state.view === 'details' && type && id) {
                        this.renderCommunitySection(type, id, { quiet: true });
                    } else {
                        this.renderComments({ quiet: true });
                    }
                }
            })
            .subscribe();
        this.reactionsChannel = this.supabase.channel('reactions_' + key);
        const onReaction = payload => {
            const row = payload.new || payload.old;
            if (!row || !row.comment_key) return;
            if (row.comment_key !== key && !row.comment_key.startsWith(key + '_')) return;
            this.refreshCommunityQuiet();
        };
        this.reactionsChannel
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comment_reactions' }, onReaction)
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comment_reactions' }, onReaction)
            .subscribe();
        this._commentsChannelKey = key;
    },

    teardownCommentsRealtime() {
        if (this.commentsChannel && this.supabase) {
            this.supabase.removeChannel(this.commentsChannel);
        }
        this.commentsChannel = null;
        this._commentsChannelKey = null;
        if (this.reactionsChannel && this.supabase) {
            this.supabase.removeChannel(this.reactionsChannel);
        }
        this.reactionsChannel = null;
    },

    // Cipher — spoiler tags. text is expected to be already escaped.
    spoilerHtml(text) {
        return `<span class="spoiler-block" tabindex="0" role="button" aria-label="Spoiler — click to reveal" title="Spoiler — click to reveal" onclick="Alexandria.revealSpoiler(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();Alexandria.revealSpoiler(this)}"><span class="spoiler-chip">SPOILER</span><span class="spoiler-blur">${text}</span></span>`;
    },

    revealSpoiler(el) {
        const block = el.closest('.spoiler-block');
        if (!block) return;
        const revealed = block.classList.toggle('revealed');
        block.setAttribute('aria-label', revealed ? 'Spoiler revealed' : 'Spoiler — click to reveal');
        if (revealed) block.removeAttribute('title');
    },

    captureCommentDraft(inputId = 'comment-input') {
        const input = document.getElementById(inputId);
        if (!input) return null;
        return {
            value: input.value,
            start: input.selectionStart,
            end: input.selectionEnd,
            focused: document.activeElement === input
        };
    },

    restoreCommentDraft(draft, inputId = 'comment-input') {
        if (!draft) return;
        const input = document.getElementById(inputId);
        if (!input) return;
        input.value = draft.value;
        try { input.setSelectionRange(draft.start, draft.end); } catch { /* ignore */ }
        if (draft.focused) input.focus();
    },

    // Community Ratings & Reviews Engine
    async renderCommunitySection(type, id, opts = {}) {
        const container = document.getElementById('community-section');
        if (!container) return;
        const token = this._renderToken;
        if (!opts.quiet) {
            container.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING COMMUNITY...</div>';
        }
        const reviewDraft = opts.quiet ? this.captureCommentDraft('review-input') : null;

        let rows = [];
        let ownRow = null;
        if (this.supabase) {
            try {
                const { data } = await this.supabase
                    .from('ratings')
                    .select('*')
                    .eq('content_id', Number(id))
                    .eq('content_type', type)
                    .order('created_at', { ascending: false })
                    .limit(50);
                if (token !== this._renderToken) return;
                rows = data || [];
                ownRow = rows.find(r => r.user_id === this.state.authUser?.id) || null;
                this.state._ownRatingRow = ownRow || null;
            } catch (e) {
                console.warn("Alexandria: Ratings fetch failed", e);
            }
        }
        if (token !== this._renderToken) return;

        const key = this.getCommentKey(this.state.activeContent, true);
        this.setupCommentsRealtime(key);

        // Series community only — per-episode player comments stay in the player (exact-key match).
        const comments = key ? await this.getComments(key) : [];
        if (token !== this._renderToken) return;

        const profileById = {};
        if (this.supabase) {
            const uids = [...new Set([
                ...rows.map(r => r.user_id).filter(Boolean),
                ...(comments || []).map(c => c.userId).filter(Boolean)
            ])];
            const profiles = await Promise.all(uids.map(uid => this.fetchProfile(uid).catch(() => null)));
            uids.forEach((uid, i) => { if (profiles[i]) profileById[uid] = profiles[i]; });
        }
        if (token !== this._renderToken) return;

        const avg = rows.length ? rows.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / rows.length : 0;

        const badge = document.getElementById('details-avg-badge');
        if (badge) {
            if (rows.length) {
                badge.textContent = 'COMMUNITY ★ ' + avg.toFixed(1);
                badge.removeAttribute('hidden');
            } else {
                badge.setAttribute('hidden', '');
            }
        }

        const displayName = uid => {
            const p = profileById[uid];
            return p ? (p.nickname || p.username || 'Member') : 'Member';
        };
        const nameNode = uid => {
            const name = displayName(uid);
            return uid
                ? `<a class="review-author" href="#profile/${this.escapeHtml(uid)}">${this.escapeHtml(name)}</a>`
                : `<span class="review-author">${this.escapeHtml(name)}</span>`;
        };

        if (!opts.quiet) {
            this.state._ratingDraft = Math.max(0, Math.min(5, Math.round(Number(ownRow?.rating) || 0)));
        }
        const ownReview = this.state._suppressReviewPrefill ? '' : (ownRow?.review || '');
        if (this.state._suppressReviewPrefill) this.state._suppressReviewPrefill = false;

        const composer = this.state.authUser ? `
            <div class="ratings-composer" id="ratings-composer">
                <div class="rate-stars-row">
                    ${Array.from({ length: 5 }, (_, i) => i + 1).map(n => `
                        <span class="rate-star ${n <= this.state._ratingDraft ? 'filled' : ''}" data-rating="${n}" onclick="Alexandria.setRatingDraft(${n})" role="button" tabindex="0" aria-label="Rate ${n} of 5">${n <= this.state._ratingDraft ? '★' : '☆'}</span>
                    `).join('')}
                </div>
                <textarea id="review-input" placeholder="Write your review or comment..." maxlength="1000" rows="4">${this.escapeHtml(ownReview)}</textarea>
                <div class="ratings-composer-footer">
                    <label class="spoiler-toggle" title="Blurs the review until someone clicks it">
                        <input type="checkbox" id="review-spoiler" ${ownRow?.spoiler ? 'checked' : ''}>
                        <span class="spoiler-toggle-text">Spoiler</span>
                    </label>
                    <button type="button" class="btn-primary" onclick="Alexandria.submitRating('${type}', ${id})">${ownRow ? 'UPDATE REVIEW' : 'SUBMIT'}</button>
                    ${ownRow ? `<button type="button" class="btn-secondary" onclick="Alexandria.deleteRating('${ownRow.id}')">DELETE MY REVIEW</button>` : ''}
                </div>
            </div>
        ` : `
            <div class="ratings-locked-banner">
                <span class="ratings-locked-text">SIGN IN to rate and review this title.</span>
                <button type="button" class="btn-primary" onclick="Alexandria.toggleAuthModal(true, 'signup')">SIGN IN / CREATE ACCOUNT</button>
            </div>
        `;

        const safeKey = this.escapeHtml(key || '');
        const ratingEntries = rows.map(r => {
            const n = Math.max(0, Math.min(5, Math.round(Number(r.rating) || 0)));
            const isMine = Boolean(this.state.authUser && r.user_id === this.state.authUser.id);
            return {
                ts: new Date(r.created_at || 0).getTime(),
                html: `
                <div class="review-card">
                    ${r.user_id ? `<a class="review-avatar-link" href="#profile/${this.escapeHtml(r.user_id)}">${this.avatarHtml(profileById[r.user_id], 36)}</a>` : this.avatarHtml(null, 36)}
                    <div class="review-body">
                        <div class="review-meta">
                            ${nameNode(r.user_id)}
                            <span class="review-stars" aria-label="Rated ${n} of 5">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>
                            <span class="review-time">${this.escapeHtml(this.timeago(r.created_at))}</span>
                        </div>
                        ${r.review ? `<p class="review-text">${r.spoiler ? this.spoilerHtml(this.escapeHtml(r.review)) : this.escapeHtml(r.review)}</p>` : ''}
                    </div>
                    ${isMine ? `
                        <div class="review-actions">
                            <button type="button" class="btn-text-link" onclick="Alexandria.deleteRating('${r.id}')">DELETE</button>
                        </div>
                    ` : ''}
                </div>
            `};
        });

        // Reviews are ratings; legacy versions also mirrored the text into a
        // comment. Skip comment cards that duplicate the author's own review
        // so the community list shows each review once.
        const reviewByUser = new Set();
        rows.forEach(r => {
            if (r.review && r.user_id) reviewByUser.add(r.user_id + '\u0000' + r.review);
        });
        const dedupedComments = (comments || []).filter(c => !c.userId || !reviewByUser.has(c.userId + '\u0000' + c.text));

        let reactionsMap = {};
        if (this.supabase) {
            const cloudIds = dedupedComments.filter(c => !String(c.id).startsWith('c_')).map(c => c.id);
            reactionsMap = await this.fetchReactions(cloudIds);
            if (token !== this._renderToken) return;
        }

        const commentEntries = this.threadEntries(dedupedComments, profileById, safeKey, reactionsMap);

        const mergedHtml = [...ratingEntries, ...commentEntries]
            .sort((a, b) => b.ts - a.ts)
            .map(e => e.html)
            .join('');

        const scopeBadge = type === 'tv' ? 'SERIES' : 'MOVIE';

        container.innerHTML = `
            <div class="community-section">
                <div class="ratings-header">
                    <h3>COMMUNITY <span class="comments-scope-badge">${scopeBadge}</span></h3>
                    <span class="ratings-average">${rows.length ? `★ ${avg.toFixed(1)} · ${rows.length} RATING${rows.length === 1 ? '' : 'S'}` : 'NO RATINGS YET — be the first'}</span>
                </div>
                ${composer}
                <div class="community-list">
                    ${mergedHtml || '<div class="placeholder-msg comments-empty">No ratings or comments yet. Be the first to rate and start the discussion!</div>'}
                </div>
            </div>
        `;
        if (reviewDraft) this.restoreCommentDraft(reviewDraft, 'review-input');
    },

    setRatingDraft(n, scrollToComposer = false) {
        const val = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
        this.state._ratingDraft = (this.state._ratingDraft === val) ? 0 : val;
        document.querySelectorAll('.rate-star').forEach(star => {
            const rating = Number(star.dataset.rating);
            star.classList.toggle('filled', rating <= this.state._ratingDraft);
            star.textContent = rating <= this.state._ratingDraft ? '★' : '☆';
        });
        if (scrollToComposer) {
            const composer = document.getElementById('ratings-composer');
            if (composer) composer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    async submitRating(type, id) {
        const rating = this.state._ratingDraft;
        if (!rating || rating < 1) {
            this.showToast('Pick a star rating first');
            return;
        }
        if (!this.supabase || !this.state.authUser) {
            this.showToast('Please sign in or create an account to rate titles.');
            this.toggleAuthModal(true, 'signup');
            return;
        }
        const input = document.getElementById('review-input');
        const review = (input?.value || '').trim();
        const spoilerBox = document.getElementById('review-spoiler');
        const spoiler = spoilerBox ? spoilerBox.checked : false;
        const existing = this.state._ownRatingRow;
        try {
            const { error } = await this.supabase.from('ratings').upsert({
                user_id: this.state.authUser.id,
                content_id: Number(id),
                content_type: type,
                rating,
                review,
                spoiler,
                created_at: existing ? existing.created_at : new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,content_id,content_type' });
            if (error) {
                this.showToast('Could not save your rating.');
                return;
            }
        } catch {
            this.showToast('Could not save your rating.');
            return;
        }

        // Reviews live in the ratings table; the community list merges review
        // cards and comments, so mirroring the text into a comment showed the
        // same review twice. Legacy versions did post that mirror — sweep up
        // the old comment when an existing review is edited (old text) so it
        // doesn't resurface as an orphan.
        if (existing && existing.review) {
            await this.deleteAutoReviewComment(type, id, existing.review);
        }

        this.showToast(review ? 'Review posted!' : 'Rating saved!');
        if (input) input.value = '';
        this.state._suppressReviewPrefill = true;
        this.renderCommunitySection(type, id);
        this.logActivity(review ? 'reviewed' : 'rated', {
            contentId: id,
            contentType: type,
            title: this.state.detailsTitle,
            posterPath: this.state.detailsPoster,
            meta: JSON.stringify({ rating })
        });
    },

    async deleteRating(rowId) {
        if (!this.supabase || !this.state.authUser) return;
        try {
            const { error } = await this.supabase.from('ratings').delete().eq('id', rowId);
            if (error) {
                this.showToast('Could not delete your review.');
                return;
            }
        } catch {
            this.showToast('Could not delete your review.');
            return;
        }
        // Legacy review submissions mirrored the text into a series comment;
        // delete that mirror with the review so it can't resurface as an orphan.
        const oldRow = this.state._ownRatingRow;
        const { id, type } = this.state.activeContent;
        if (oldRow && oldRow.id === rowId) {
            await this.deleteAutoReviewComment(type, id, oldRow.review);
        }
        this.showToast('Review deleted');
        this.state._ratingDraft = 0;
        this.renderCommunitySection(type, id);
    },

    // Removes the auto-comment that legacy review submissions mirrored into
    // the comment thread (series-wide key for TV). Best-effort cleanup.
    async deleteAutoReviewComment(type, id, text) {
        if (!this.supabase || !this.state.authUser || !text) return;
        const key = type === 'tv' ? 'tv_' + id : 'movie_' + id;
        try {
            await this.supabase.from('comments').delete()
                .eq('comment_key', key)
                .eq('user_id', this.state.authUser.id)
                .eq('content', text);
        } catch (e) {
            console.warn('Alexandria: Auto-comment cleanup failed', e);
        }
    },

    // User Auth & Unique Username Engine
};
