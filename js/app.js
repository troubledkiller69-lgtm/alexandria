import { core } from './core.js';
import { router } from './router.js';
import { storage } from './storage.js';
import { views } from './views.js';
import { home } from './home.js';
import { browse } from './browse.js';
import { franchises } from './franchises.js';
import { search } from './search.js';
import { details } from './details.js';
import { profiles } from './profiles.js';
import { community } from './community.js';
import { player } from './player.js';
import { comments } from './comments.js';
import { auth } from './auth.js';
import { party } from './party.js';
import { sharedlists } from './sharedlists.js';
import { settings } from './settings.js';
import { ui } from './ui.js';

const Alexandria = Object.assign(
    {},
    core,
    router,
    storage,
    views,
    home,
    browse,
    franchises,
    search,
    details,
    profiles,
    community,
    player,
    comments,
    auth,
    party,
    sharedlists,
    settings,
    ui
);

window.Alexandria = Alexandria;
Alexandria.init();
