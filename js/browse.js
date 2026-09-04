export const browse = {
    async renderFiltered(type) {
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg">LOADING SECTORS...</div>';
        try {
            const [popData, topData, actData, horData, sciData] = await Promise.all([
                this.getJson(type + '/popular'),
                this.getJson(type + '/top_rated'),
                this.getJson('discover/' + type + '?with_genres=' + (type === 'movie' ? '28' : '10759')),
                this.getJson(type === 'movie' ? 'discover/movie?with_genres=27' : 'discover/tv?with_keywords=315058'),
                this.getJson('discover/' + type + '?with_genres=' + (type === 'movie' ? '878' : '10765'))
            ]);
            if (token !== this._renderToken) return;

            const featured = popData.results?.[0];
            const heroBackdrop = featured?.backdrop_path ? this.imageUrl(featured.backdrop_path, 'original') : '';
            const isMovie = type === 'movie';

            this.main.innerHTML = `
                <section class="filtered-view">
                    <div class="hero-featured" style="--hero-image: url('${heroBackdrop}')">
                        <div class="featured-content">
                            <span class="trending-badge">${isMovie ? 'FEATURED MOVIE' : 'FEATURED SHOW'}</span>
                            <h1>${this.escapeHtml(featured ? (featured.title || featured.name) : (isMovie ? 'MOVIES' : 'TV SHOWS'))}</h1>
                            <p>${this.escapeHtml(featured?.overview || 'Explore popular movies and TV shows.')}</p>
                            <div class="category-hero-actions">
                                ${featured ? `<button class="btn-primary btn-play" onclick="Alexandria.playContent(${featured.id}, '${type}')"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> WATCH NOW</button>
                                <button class="btn-secondary" onclick="window.location.hash = '#details/${type}/${featured.id}'">DETAILS</button>` : ''}
                            </div>
                        </div>
                        <div class="sector-widget">
                            <div class="sector-widget-content">
                                <span class="sector-label">${isMovie ? 'POPULAR MOVIES' : 'POPULAR SHOWS'}</span>
                                <h4>${isMovie ? 'Browse Movies' : 'Browse TV Shows'}</h4>
                                <p>${isMovie ? 'Blockbusters, Classics & Indies' : 'Full Seasons & Popular Series'}</p>
                            </div>
                        </div>
                    </div>
                    <div class="view-section"><h3>Popular Now</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="pop-results"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Top Rated</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="top-results"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Action & Adventure</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="action-results"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Horror Archives</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="horror-results"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Sci-Fi & Fantasy</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="sci-results"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                </section>`;
            
            this.renderResults(popData.results, 'pop-results');
            this.renderResults(topData.results, 'top-results');
            this.renderResults(actData.results, 'action-results');
            this.renderResults(horData.results, 'horror-results');
            this.renderResults(sciData.results, 'sci-results');
        } catch (error) {
            console.error("Alexandria Protocol: Filter Scout Failed -", error);
            if (token === this._renderToken) this.renderError('This section could not load', error.message, this.state.view);
        }
    },

    async renderAnime() {
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg">SCANNING ANIME FREQUENCIES...</div>';
        try {
            const [sData, seData, fData, dData] = await Promise.all([
                this.getJson('discover/tv?with_genres=16&with_keywords=210024&sort_by=popularity.desc'),
                this.getJson('discover/tv?with_genres=16&with_keywords=210024&vote_average.gte=8'),
                this.getJson('discover/tv?with_genres=16,14&with_keywords=210024'),
                this.getJson('discover/tv?with_genres=16,18&with_keywords=210024')
            ]);
            if (token !== this._renderToken) return;

            const featured = sData.results?.[0];
            const heroBackdrop = featured?.backdrop_path ? this.imageUrl(featured.backdrop_path, 'original') : '';

            this.main.innerHTML = `
                <section class="filtered-view">
                    <div class="hero-featured" style="--hero-image: url('${heroBackdrop}')">
                        <div class="featured-content">
                            <span class="trending-badge">FEATURED ANIME</span>
                            <h1>${this.escapeHtml(featured ? (featured.name || featured.title) : 'ANIME VAULT')}</h1>
                            <p>${this.escapeHtml(featured?.overview || 'Explore Japanese animation, fantasy sagas, and action series.')}</p>
                            <div class="category-hero-actions">
                                ${featured ? `<button class="btn-primary btn-play" onclick="Alexandria.playContent(${featured.id}, 'tv')"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> WATCH NOW</button>
                                <button class="btn-secondary" onclick="window.location.hash = '#details/tv/${featured.id}'">DETAILS</button>` : ''}
                            </div>
                        </div>
                        <div class="sector-widget">
                            <div class="sector-widget-content">
                                <span class="sector-label">ANIME VAULT</span>
                                <h4>Browse Anime</h4>
                                <p>Subbed & Dubbed Series</p>
                            </div>
                        </div>
                    </div>
                    <div class="view-section"><h3>Trending Anime</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="anime-trending"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Top Rated Masterpieces</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="anime-top"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Epic Fantasy Anime</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="anime-fantasy"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Intense Drama Anime</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="anime-drama"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                </section>`;
            
            this.renderResults(sData.results, 'anime-trending');
            this.renderResults(seData.results, 'anime-top');
            this.renderResults(fData.results, 'anime-fantasy');
            this.renderResults(dData.results, 'anime-drama');
        } catch (error) {
            console.error("Alexandria Protocol: Anime Scout Failed -", error);
            if (token === this._renderToken) this.renderError('Anime frequencies are unavailable', error.message, 'anime');
        }
    },


};
