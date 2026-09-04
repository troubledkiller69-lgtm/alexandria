export const sharedlists = {
    async renderList() {
        const listId = this.state.activeListId;
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING LIST...</div>';
        if (!this.supabase) {
            if (token === this._renderToken) this.renderError('Lists unavailable', 'Supabase cloud is required for shared lists.', 'home');
            return;
        }
        try {
            const { data: list } = await this.supabase
                .from('movie_night_lists')
                .select('*')
                .eq('id', listId)
                .maybeSingle();
            if (token !== this._renderToken) return;
            if (!list) {
                this.renderError('LIST NOT FOUND', 'It may have been deleted.', 'home');
                return;
            }
            const owner = await this.fetchProfile(list.owner_id);
            if (token !== this._renderToken) return;
            this._listRow = list;
            this._listOwnerId = list.owner_id;
            const me = this.state.authUser?.id;
            const isOwner = Boolean(me && me === list.owner_id);
            const ownerName = owner ? (owner.nickname || owner.username || 'Member') : 'Member';

            this.main.innerHTML = `
                <section class="list-page">
                    <div class="list-hero">
                        <div class="list-hero-info">
                            <h1>${this.escapeHtml(list.title || 'Untitled list')}</h1>
                            ${list.description ? `<p class="list-desc">${this.escapeHtml(list.description)}</p>` : ''}
                            <div class="list-owner-line">
                                <a class="list-owner-link" href="#profile/${this.escapeHtml(list.owner_id)}">${this.avatarHtml(owner, 30)} <span>${this.escapeHtml(ownerName)}</span></a>
                            </div>
                        </div>
                        <div class="list-hero-actions">
                            <button type="button" class="btn-secondary" onclick="Alexandria.copyListLink()">SHARE LIST</button>
                            ${isOwner ? `
                            <button type="button" class="btn-secondary" onclick="Alexandria.editListMode()">EDIT</button>
                            <button type="button" class="btn-secondary list-delete-btn" onclick="Alexandria.deleteCurrentList()">DELETE LIST</button>` : ''}
                        </div>
                    </div>
                    <section class="list-add-box">
                        ${this.state.authUser ? `
                        <div class="list-add-search-wrap">
                            <input type="text" id="list-add-search" placeholder="Search movies & shows to add…" autocomplete="off" aria-label="Search titles to add">
                            <div class="list-add-results" id="list-add-results" hidden></div>
                        </div>` : `
                        <div class="list-guest-hint">SIGN IN to add titles to this list.</div>`}
                    </section>
                    <div class="list-items" id="list-items">
                        <div class="placeholder-msg"><span class="pulse-dot"></span> LOADING TITLES...</div>
                    </div>
                </section>
            `;

            const input = document.getElementById('list-add-search');
            if (input) {
                input.addEventListener('input', () => {
                    clearTimeout(this._listSearchTimer);
                    const q = input.value;
                    this._listSearchTimer = setTimeout(() => this.searchListAdd(q), 400);
                });
            }
            this.initListRealtime(listId);
            this.renderListItems();
        } catch (e) {
            console.error("Alexandria Protocol: List Render Failed", e);
            if (token === this._renderToken) this.renderError('This list could not be loaded', e.message || 'Something went wrong.', 'home');
        }
    },

    initListRealtime(listId) {
        if (!this.supabase) return;
        if (this.listChannel) {
            this.supabase.removeChannel(this.listChannel);
            this.listChannel = null;
        }
        const channelName = 'list_' + String(listId).replace(/[^a-zA-Z0-9_-]/g, '_');
        this.listChannel = this.supabase.channel(channelName);
        this.listChannel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'movie_night_items', filter: 'list_id=eq.' + listId }, () => {
                if (this.state.view !== 'list') return;
                clearTimeout(this._listRefreshTimer);
                this._listRefreshTimer = setTimeout(() => this.renderListItems(), 300);
            })
            .subscribe();
    },

    renderListItems() {
        const container = document.getElementById('list-items');
        if (!container || !this.supabase) return;
        const listId = this.state.activeListId;
        const me = this.state.authUser?.id;
        const token = this._renderToken;
        this.supabase.from('movie_night_items')
            .select('*')
            .eq('list_id', listId)
            .order('created_at', { ascending: true })
            .then(async ({ data: items }) => {
                if (token !== this._renderToken) return;
                const rows = Array.isArray(items) ? items : [];
                const adderUids = [...new Set(rows.map(i => i.added_by).filter(Boolean))];
                const adders = await this.fetchProfilesBulk(adderUids);
                if (token !== this._renderToken) return;
                const current = document.getElementById('list-items');
                if (!current) return;
                if (!rows.length) {
                    current.innerHTML = '<div class="list-empty">No titles on this list yet.</div>';
                    return;
                }
                current.innerHTML = rows.map(item => {
                    const poster = this.imageUrl(item.poster_path, 'w342');
                    const adder = adders[item.added_by];
                    const adderName = adder ? (adder.nickname || adder.username || 'Member') : 'Member';
                    const canRemove = Boolean(me && (item.added_by === me || this._listOwnerId === me));
                    return `
                    <article class="list-item-card">
                        <a class="list-item-poster" href="#details/${this.escapeHtml(item.content_type)}/${Number(item.content_id)}" aria-label="${this.escapeHtml(item.title || 'this title')}">
                            ${poster ? `<img src="${poster}" alt="${this.escapeHtml(item.title || '')}" loading="lazy" decoding="async">` : '<span class="list-item-poster-ph" aria-hidden="true">A</span>'}
                        </a>
                        <div class="list-item-body">
                            <a class="list-item-title" href="#details/${this.escapeHtml(item.content_type)}/${Number(item.content_id)}">${this.escapeHtml(item.title || 'Untitled')}</a>
                            <span class="list-item-meta">${this.escapeHtml(item.content_type === 'tv' ? 'TV' : 'MOVIE')}</span>
                            <span class="list-item-added">
                                <a href="#profile/${this.escapeHtml(item.added_by || '')}">${this.avatarHtml(adder, 22)} ${this.escapeHtml(adderName)}</a>
                                · ${this.timeago(item.created_at)}
                            </span>
                        </div>
                        ${canRemove ? `<button type="button" class="list-item-remove" aria-label="Remove from list" onclick="Alexandria.removeListItem('${this.escapeHtml(item.id)}')">✕</button>` : ''}
                    </article>`;
                }).join('');
            })
            .catch(() => {
                if (token !== this._renderToken) return;
                const current = document.getElementById('list-items');
                if (current) current.innerHTML = '<div class="list-empty">Could not load list items.</div>';
            });
    },

    async searchListAdd(q) {
        const query = String(q || '').trim();
        const box = document.getElementById('list-add-results');
        if (!box) return;
        if (query.length < 2) {
            box.hidden = true;
            box.innerHTML = '';
            return;
        }
        const seq = (this._listSearchSeq = (this._listSearchSeq || 0) + 1);
        try {
            const data = await this.getJson('search/multi?query=' + encodeURIComponent(query));
            if (seq !== this._listSearchSeq) return;
            const current = document.getElementById('list-add-results');
            if (!current) return;
            const results = (data.results || [])
                .filter(r => (r.media_type === 'movie' || r.media_type === 'tv') && r.id)
                .slice(0, 6);
            if (!results.length) {
                current.innerHTML = '<div class="list-add-empty">No titles found.</div>';
                current.hidden = false;
                return;
            }
            this._listSearchResults = results;
            current.innerHTML = results.map((r, i) => {
                const rTitle = r.title || r.name || 'Untitled';
                const year = (r.release_date || r.first_air_date || '').slice(0, 4);
                const poster = this.imageUrl(r.poster_path, 'w92');
                return `
                <button type="button" class="list-add-result" onclick="Alexandria.addListItemFromSearch(${i})">
                    ${poster ? `<img src="${poster}" alt="" loading="lazy" decoding="async">` : '<span class="list-add-result-ph" aria-hidden="true">A</span>'}
                    <span class="list-add-result-info">
                        <span class="list-add-result-title">${this.escapeHtml(rTitle)}</span>
                        <span class="list-add-result-meta">${r.media_type === 'tv' ? 'TV' : 'MOVIE'}${year ? ' • ' + this.escapeHtml(year) : ''}</span>
                    </span>
                </button>`;
            }).join('');
            current.hidden = false;
        } catch {
            if (seq !== this._listSearchSeq) return;
            const current = document.getElementById('list-add-results');
            if (!current) return;
            current.innerHTML = '<div class="list-add-empty">Search failed. Try again.</div>';
            current.hidden = false;
        }
    },

    addListItemFromSearch(idx) {
        const r = this._listSearchResults && this._listSearchResults[idx];
        if (!r) return;
        this.addListItem(
            this.state.activeListId,
            r.media_type,
            Number(r.id),
            r.title || r.name || 'Untitled',
            r.poster_path || ''
        );
    },

    async addListItem(listId, type, id, title, poster) {
        const numId = Number(id);
        if (!this.supabase || !this.state.authUser) {
            this.toggleAuthModal(true, 'login');
            this.showToast('Sign in to add titles');
            return;
        }
        if (!listId || !type || !Number.isInteger(numId) || numId < 1) return;
        try {
            const { data: existing } = await this.supabase
                .from('movie_night_items')
                .select('id')
                .eq('list_id', listId)
                .eq('content_id', numId)
                .eq('content_type', type)
                .maybeSingle();
            if (existing) {
                this.showToast('Already on this list');
                return;
            }
            await this.supabase.from('movie_night_items').insert({
                list_id: listId,
                content_id: numId,
                content_type: type,
                title: title || '',
                poster_path: poster || null,
                added_by: this.state.authUser.id
            });
            const input = document.getElementById('list-add-search');
            if (input) input.value = '';
            const box = document.getElementById('list-add-results');
            if (box) { box.hidden = true; box.innerHTML = ''; }
            this.showToast('Added');
            this.renderListItems();
            this.logActivity('list_added', {
                contentId: numId,
                contentType: type,
                title: title || null,
                posterPath: poster || null,
                meta: JSON.stringify({ listId })
            });
        } catch {
            this.showToast('Could not add that title');
        }
    },

    async removeListItem(itemId) {
        if (!this.supabase || !this.state.authUser || !itemId) return;
        try {
            await this.supabase.from('movie_night_items').delete().eq('id', itemId);
            this.showToast('Removed from list');
            this.renderListItems();
        } catch {
            this.showToast('Could not remove that title');
        }
    },

    async copyListLink() {
        // Shares the pretty /share/list/... card link (OG tags for Discord &
        // Telegram unfurls) with the raw hash URL as fallback.
        const listId = this.state.activeListId;
        const url = (listId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(listId))
            ? this.shareUrlFor('list', listId)
            : window.location.href;
        if (await this.copyText(url)) this.showToast('Link copied');
        else this.showToast('Copy the address bar URL');
    },

    editListMode() {
        const hero = document.querySelector('.list-hero-info');
        const list = this._listRow;
        if (!hero || !list) return;
        hero.innerHTML = `
            <div class="auth-field">
                <label>List title</label>
                <input type="text" id="list-edit-title" maxlength="120" value="${this.escapeHtml(list.title || '')}">
            </div>
            <div class="auth-field">
                <label>Description</label>
                <textarea id="list-edit-desc" rows="3" maxlength="500">${this.escapeHtml(list.description || '')}</textarea>
            </div>
            <div class="profile-modal-actions">
                <button type="button" class="btn-secondary" onclick="Alexandria.renderList()">CANCEL</button>
                <button type="button" class="btn-primary" onclick="Alexandria.saveListEdit()">SAVE</button>
            </div>
        `;
    },

    async saveListEdit() {
        const titleInput = document.getElementById('list-edit-title');
        if (!titleInput || !this.supabase) return;
        const title = titleInput.value.trim();
        if (!title) {
            this.showToast('Title is required');
            return;
        }
        const descInput = document.getElementById('list-edit-desc');
        try {
            await this.supabase.from('movie_night_lists')
                .update({
                    title,
                    description: descInput ? descInput.value.trim() : '',
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.state.activeListId);
            this.showToast('List updated');
            this.renderList();
        } catch {
            this.showToast('Could not save changes');
        }
    },

    async deleteCurrentList() {
        const listId = this.state.activeListId;
        if (!this.supabase || !listId) return;
        try {
            await this.supabase.from('movie_night_lists').delete().eq('id', listId);
            this.showToast('List deleted');
            window.location.hash = '#home';
        } catch {
            this.showToast('Could not delete the list');
        }
    },

    async addToListModal(id, type) {
        if (!this.supabase || !this.state.authUser) {
            this.toggleAuthModal(true, 'login');
            this.showToast('Sign in to add titles to lists');
            return;
        }
        const me = this.state.authUser.id;
        let modal = document.getElementById('list-picker-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'list-picker-modal';
            modal.className = 'list-picker-modal-overlay';
            modal.setAttribute('hidden', '');
            modal.innerHTML = `
                <div class="list-picker-modal-card">
                    <button class="auth-close-btn" type="button" aria-label="Close" onclick="Alexandria.closeListPicker()">✕</button>
                    <h3 class="profile-modal-title">ADD TO LIST</h3>
                    <div id="list-picker-lists"><div class="list-picker-empty">Loading your lists…</div></div>
                    <span class="profile-modal-label">NEW LIST</span>
                    <div class="auth-field">
                        <input type="text" id="list-picker-new-title" placeholder="List title" maxlength="120">
                    </div>
                    <div class="profile-modal-actions">
                        <button type="button" class="btn-primary" onclick="Alexandria.createListFromPicker()">CREATE</button>
                    </div>
                </div>
            `;
            modal.addEventListener('click', e => { if (e.target === modal) this.closeListPicker(); });
            document.body.appendChild(modal);
        }
        this._pickerItem = { id, type, title: this.state.detailsTitle, poster: this.state.detailsPoster || null };
        modal.removeAttribute('hidden');
        try {
            const { data: lists } = await this.supabase
                .from('movie_night_lists')
                .select('*')
                .eq('owner_id', me)
                .order('created_at', { ascending: false });
            const container = document.getElementById('list-picker-lists');
            if (!container) return;
            container.innerHTML = (Array.isArray(lists) && lists.length)
                ? lists.map(l => `
                    <div class="list-picker-row">
                        <div class="list-picker-row-info">
                            <span class="list-picker-row-title">${this.escapeHtml(l.title || 'Untitled list')}</span>
                            ${l.description ? `<span class="list-picker-row-desc">${this.escapeHtml(l.description)}</span>` : ''}
                        </div>
                        <button type="button" class="btn-secondary" onclick="Alexandria.pickListAdd('${this.escapeHtml(l.id)}')">ADD</button>
                    </div>`).join('')
                : '<div class="list-picker-empty">No lists yet</div>';
        } catch {
            const container = document.getElementById('list-picker-lists');
            if (container) container.innerHTML = '<div class="list-picker-empty">Could not load your lists.</div>';
        }
    },

    closeListPicker() {
        const modal = document.getElementById('list-picker-modal');
        if (modal) modal.setAttribute('hidden', '');
        this._pickerItem = null;
    },

    pickListAdd(listId) {
        const item = this._pickerItem;
        if (!item) return;
        this.closeListPicker();
        this.addListItem(listId, item.type, item.id, item.title, item.poster);
    },

    async createListFromPicker() {
        const input = document.getElementById('list-picker-new-title');
        const item = this._pickerItem;
        if (!input || !item || !this.supabase || !this.state.authUser) return;
        const title = input.value.trim();
        if (!title) {
            this.showToast('List title is required');
            return;
        }
        try {
            const { data: list } = await this.supabase.from('movie_night_lists')
                .insert({ owner_id: this.state.authUser.id, title, description: '' })
                .select()
                .maybeSingle();
            if (!list) {
                this.showToast('Could not create the list');
                return;
            }
            this.logActivity('list_created', { meta: JSON.stringify({ listId: list.id, listTitle: title }) });
            await this.addListItem(list.id, item.type, item.id, item.title, item.poster);
            this.closeListPicker();
        } catch {
            this.showToast('Could not create the list');
        }
    },

};
