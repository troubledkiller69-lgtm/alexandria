// Curated director data for the Directors tab. No build step: this is served as-is.
// TMDB person and film IDs were checked against their themoviedb.org pages.
// Technique notes describe recurring tendencies, not inventions or exclusive trademarks.
export const DIRECTORS = [
    {
        id: 2636,
        name: 'Alfred Hitchcock',
        tagline: 'The architect of suspense.',
        technique: 'Subjective camera and controlled withholding: we see from a character\'s viewpoint, then wait for the cut. The dolly zoom, developed for Vertigo by cameraman Irmin Roberts, makes that anxiety physical.',
        description: 'Hitchcock turned ordinary rooms into traps and made the audience complicit in what the camera sees. His thrillers run on voyeuristic framing, precise montage, and violence arriving from just outside the frame.',
        examples: [
            { id: 539, title: 'Psycho', note: 'The shower scene packs 78 setups and 52 cuts into 45 seconds; BFI singles out its jump-cuts and 180-degree breaks.' },
            { id: 426, title: 'Vertigo', note: 'The bell-tower stairwell is the dolly zoom\'s most famous early use, designed to make Scottie\'s vertigo visible; Irmin Roberts is credited with the effect.' }
        ],
        sources: [
            { label: 'The Conversation: the dolly zoom in Vertigo', url: 'https://theconversation.com/how-hitchcocks-vertigo-gave-us-the-dolly-zoom-one-of-cinemas-trippiest-visual-effects-282059' },
            { label: 'BFI: the Psycho shower scene', url: 'https://www.bfi.org.uk/interviews/psycho-shower-scene-alfred-hitchcock' }
        ]
    },
    {
        id: 240,
        name: 'Stanley Kubrick',
        tagline: 'Control at cosmic scale.',
        technique: 'Painterly composition and slow, deliberate camera movement; architecture and available light do much of the acting. The frame is engineered before anyone steps into it.',
        description: 'Kubrick treated film as an engineered object: lens, light and composition calibrated to the millimetre. The camera\'s calm movement makes dread feel inevitable.',
        examples: [
            { id: 62, title: '2001: A Space Odyssey', note: 'American Cinematographer credits the film with pioneering front-projection effects, matched to Kubrick\'s precise, painterly staging.' },
            { id: 3175, title: 'Barry Lyndon', note: 'Shot largely by candlelight with ultra-fast f/0.7 lenses; American Cinematographer describes each composition as "like a painting by one of the Old Masters."' }
        ],
        sources: [
            { label: 'American Cinematographer: photographing Barry Lyndon', url: 'https://theasc.com/article/flashback-barry-lyndon/' },
            { label: 'BFI: The Shining archive review', url: 'https://www.bfi.org.uk/sight-and-sound/reviews/shining-archive-review-whole-new-kubrick' }
        ]
    },
    {
        id: 5026,
        name: 'Akira Kurosawa',
        tagline: 'The elements are characters.',
        technique: 'Weather as dramaturgy: rain, fog, heat and mud carry the emotional state, while action is staged in depth and shot from multiple camera angles.',
        description: 'Kurosawa moves between stillness and eruption. He stages action in dynamic, readable compositions, then lets rain, fog and heat do the emotional work.',
        examples: [
            { id: 346, title: 'Seven Samurai', note: 'The final battle unfolds in real rain and mud, with the camera thrust into the chaos; BFI calls the downpour a heightening of tension.' },
            { id: 3777, title: 'Throne of Blood', note: 'BFI reads the film\'s omnipresent fog as Washizu\'s inner turmoil and as a way to conceal the forces steering his fate.' }
        ],
        sources: [
            { label: 'BFI: how Akira Kurosawa films command the weather', url: 'https://www.bfi.org.uk/features/how-akira-kurosawa-films-command-weather' }
        ]
    },
    {
        id: 488,
        name: 'Steven Spielberg',
        tagline: 'The blockbuster, made personal.',
        technique: 'The long take, or "oner": the camera reframes through blocking instead of cutting, often in a single push-in or pan. He also uses the dolly zoom for moments of sudden recognition.',
        description: 'Spielberg\'s camera is a storyteller, not a spectator. He hides cuts inside movement, uses foreground depth to steer the eye, and saves the showiest gesture for an emotional turn.',
        examples: [
            { id: 85, title: 'Raiders of the Lost Ark', note: 'The drinking contest is a 1:26 oner: a wide pushes into singles, pans to Marion, finds an insert, and lands the punchline without a cut.' },
            { id: 578, title: 'Jaws', note: 'Brody\'s beach realization uses a dolly zoom, the push-pull effect associated with Vertigo, to register the shock.' }
        ],
        sources: [
            { label: 'No Film School: the Raiders oner', url: 'https://nofilmschool.com/spielberg-oner-raiders' },
            { label: 'The Conversation: the dolly zoom in Vertigo and Jaws', url: 'https://theconversation.com/how-hitchcocks-vertigo-gave-us-the-dolly-zoom-one-of-cinemas-trippiest-visual-effects-282059' }
        ]
    },
    {
        id: 1032,
        name: 'Martin Scorsese',
        tagline: 'The camera never stands still.',
        technique: 'Restless, choreographed Steadicam movement: long takes that follow characters through real spaces in something close to real time, with cuts saved for impact.',
        description: 'Scorsese\'s films move like memory: fluid, propulsive, crowded with incidental detail. The long take is not a stunt; it is how he makes a character\'s world feel inevitable.',
        examples: [
            { id: 769, title: 'Goodfellas', note: 'The Copa shot is a single Steadicam take of just under three minutes, following Henry and Karen from the street, through the kitchen, and into the club.' },
            { id: 10843, title: 'After Hours', note: 'Larry McConkey\'s Steadicam work on this nocturnal SoHo comedy impressed Scorsese enough to hire him for Goodfellas.' }
        ],
        sources: [
            { label: 'BBC Culture: the making of the Goodfellas Copa shot', url: 'https://www.bbc.com/culture/article/20200918-goodfellas-at-30-the-making-of-one-of-films-greatest-shots' }
        ]
    },
    {
        id: 5655,
        name: 'Wes Anderson',
        tagline: 'Every frame a diorama.',
        technique: 'Planimetric staging: frontal, perpendicular compositions, bilateral symmetry, and actors stacked in layers like a group portrait. The result is a world seen from a distance, like a dollhouse or a stage.',
        description: 'Anderson arranges his worlds with the precision of a dollhouse. Frontal framing, flat planes and deadpan symmetry turn feeling into geometry, and somehow make it more moving rather than less.',
        examples: [
            { id: 120467, title: 'The Grand Budapest Hotel', note: 'David Bordwell reads its 4:3 frames as an extension of Anderson\'s planimetric style, with perpendicular backgrounds and symmetry governing the image.' },
            { id: 9428, title: 'The Royal Tenenbaums', note: 'Bordwell points to its crowded, over-posed group shots as examples of Anderson\'s layered, yearbook-like portraiture.' }
        ],
        sources: [
            { label: 'David Bordwell: Wes Anderson takes the 4:3 challenge', url: 'https://www.davidbordwell.net/blog/2014/03/26/the-grand-budapest-hotel-wes-anderson-takes-the-43-challenge/' },
            { label: 'BFI: 10 great films set in hotels', url: 'https://www.bfi.org.uk/lists/10-great-films-set-hotels' }
        ]
    },
    {
        id: 12453,
        name: 'Wong Kar-wai',
        tagline: 'Desire, held at a distance.',
        technique: 'Frames within frames and compressed urban space: doorways, corridors and stairwells box characters in, while saturated colour and step-printed motion stretch time.',
        description: 'Wong\'s romances are built from glances, missed timing and rooms that keep people apart. His camera lingers in corridors and doorways; the city presses in, and the music does the rest.',
        examples: [
            { id: 843, title: 'In the Mood for Love', note: 'Criterion describes its "winding streets and throbbing corridors and pulsing stairways," shot by Christopher Doyle and Mark Lee Ping-bin, as the stage for a love that never quite happens.' },
            { id: 11104, title: 'Chungking Express', note: 'The opening chase is one of Wong\'s signature step-printed sequences, racing through the corridors and blind alleys of Chungking Mansions.' }
        ],
        sources: [
            { label: 'Criterion: In the Mood for Love, Haunted Heart', url: 'https://www.criterion.com/current/posts/2494-in-the-mood-for-love-haunted-heart' },
            { label: 'Criterion: Chungking Express, Electric Youth', url: 'https://www.criterion.com/current/posts/766-chungking-express-electric-youth' }
        ]
    },
    {
        id: 6817,
        name: 'Agnès Varda',
        tagline: 'The personal is cinematic.',
        technique: 'Cinécriture, or "cine-writing": every choice, from framing and location to the mix of professional and non-professional actors, belongs to the writing. Fiction and documentary share one authorial language.',
        description: 'Varda treated the camera as a pen and the street as a studio. Her films blur documentary and fiction, portrait and self-portrait, without losing their warm, inquisitive gaze.',
        examples: [
            { id: 499, title: 'Cléo from 5 to 7', note: 'BFI links its photographic texture to Varda\'s still-life and documentary work, and reads Cléo as a woman finding her sense of self in Paris.' },
            { id: 44018, title: 'Vagabond', note: 'Sandrine Bonnaire\'s Mona is one of Varda\'s great character portraits, and the film exemplifies her documentary-inflected fiction.' }
        ],
        sources: [
            { label: 'BFI: seven facets of Agnès Varda', url: 'https://www.bfi.org.uk/sight-and-sound/features/seven-facets-agnes-varda' }
        ]
    },
    {
        id: 138,
        name: 'Quentin Tarantino',
        tagline: 'Talk first. Then the knife.',
        technique: 'Chaptered, time-shuffled storytelling and dialogue as action: long, digressive conversations carry the tension while chronology is rearranged to put the audience ahead of the characters.',
        description: 'Tarantino\'s cinema is built out of other cinema and driven by voices. His characters argue about pop culture while the plot waits, then the violence arrives with a jolt.',
        examples: [
            { id: 680, title: 'Pulp Fiction', note: 'Three interconnected stories unfold in a nonlinear structure; BFI notes the film\'s quotable dialogue and pop-culture references as part of its texture.' },
            { id: 500, title: 'Reservoir Dogs', note: 'The heist is never shown. BFI calls its discreet, novelistic chapters a device that puts the audience in a God-like position.' }
        ],
        sources: [
            { label: 'BFI: Pulp Fiction (1994)', url: 'https://www.bfi.org.uk/film/bd809f0e-d695-558b-bba3-cbdfbda41820/pulp-fiction' },
            { label: 'BFI: Reservoir Dogs at 30', url: 'https://www.bfi.org.uk/features/reservoir-dogs-quentin-tarantino' }
        ]
    },
    {
        id: 136495,
        name: 'Damien Chazelle',
        tagline: 'Cut to the beat.',
        technique: 'Music-first cutting: performance scenes are edited to the pulse of the music with swift, precise, sometimes brutal cuts; quieter scenes switch to classical, invisible coverage.',
        description: 'Chazelle makes films about people who give everything to a craft, and his editing follows suit: the rhythm of the music becomes the rhythm of the scene, then of a life.',
        examples: [
            { id: 244786, title: 'Whiplash', note: 'Tom Cross says Chazelle wanted the music scenes to feel like the boxing scenes in Raging Bull: fast, jarring smash cuts and short inserts, "almost as if the character of Fletcher was editing the film."' },
            { id: 313369, title: 'La La Land', note: 'Cross describes shaping the opening "Another Day of Sun" number so the film declares its musical rules immediately; the numbers carry emotion rather than stand apart as spectacle.' }
        ],
        sources: [
            { label: 'ProVideo Coalition: Tom Cross on editing Whiplash', url: 'https://www.provideocoalition.com/art-cut-tom-cross-ace-whiplash-joy-la-la-land/' },
            { label: 'ProVideo Coalition: Tom Cross on editing La La Land', url: 'https://www.provideocoalition.com/art-of-the-cut-tom-cross-la-la-land/' }
        ]
    },
    {
        id: 525,
        name: 'Christopher Nolan',
        tagline: 'Time as a mechanism.',
        technique: 'Parallel timelines cut against each other so past, present and dream share one clock; large-format film and practical action keep impossible scale physically heavy. Exposition is staged as movement, never as a pause.',
        description: 'Nolan treats structure as the subject: memory that rewrites itself, dreams that nest, time that runs backwards. Restraint in performance lets score, scale and the edit carry the feeling.',
        examples: [
            { id: 77, title: 'Memento', note: 'The film runs two timelines in opposite directions and meets in the middle; BFI reads its reversed structure as a way of making the audience share the protagonist\'s broken memory.' },
            { id: 27205, title: 'Inception', note: 'Nested dream levels are cross-cut on a single escalating clock, so four locations resolve at once; BFI discusses the film\'s layered structure as its real subject.' }
        ],
        sources: [
            { label: 'BFI: Christopher Nolan, a guide to his films', url: 'https://www.bfi.org.uk/features/christopher-nolan-guide-films' }
        ]
    },
    {
        id: 137427,
        name: 'Denis Villeneuve',
        tagline: 'Scale with silence.',
        technique: 'Wide, patient frames and negative space; monolithic production design and low-frequency sound carry dread before anyone speaks. Faces are held long enough to read as landscape.',
        description: 'Villeneuve builds atmosphere first and plot second. His science fiction keeps the awe but strips the comfort, leaving rooms, deserts and rain that feel older than the characters in them.',
        examples: [
            { id: 329865, title: 'Arrival', note: 'Villeneuve describes shaping the film around communication rather than combat, with the alien language and Louise\'s memory structure designed to converge in the final act.' },
            { id: 335984, title: 'Blade Runner 2049', note: 'He talks about building the world from Roger Deakins\'s light and fog rather than nostalgia, letting long, quiet frames hold the scale of the city.' }
        ],
        sources: [
            { label: 'Interview Magazine: Denis Villeneuve', url: 'https://www.interviewmagazine.com/film/denis-villeneuve' }
        ]
    },
    {
        id: 45400,
        name: 'Greta Gerwig',
        tagline: 'Coming of age, out loud.',
        technique: 'Overlapping, conversational dialogue and warm framing that follows the actors instead of leading them; literary or chronological structure is broken into episodic memory, then reassembled around a feeling.',
        description: 'Gerwig writes people who talk too much and mean all of it. Her films let humor and humiliation sit in the same scene, and the camera stays close enough that neither gets away.',
        examples: [
            { id: 391713, title: 'Lady Bird', note: 'Gerwig describes writing the mother-daughter arguments from lived rhythm, letting the actors\' overlapping timing carry the love underneath the fight.' },
            { id: 331482, title: 'Little Women', note: 'She restructures the novel\'s chronology around memory and authorship, so the sisters\' timelines comment on each other rather than simply follow the book.' }
        ],
        sources: [
            { label: 'Film Independent: Greta Gerwig on Lady Bird', url: 'https://www.filmindependent.org/blog/greta-gerwig-on-lady-bird/' }
        ]
    },
    {
        id: 21684,
        name: 'Bong Joon Ho',
        tagline: 'Genre as a pressure cooker.',
        technique: 'Tonal pivots inside single scenes; wide-angle compositions and vertical staging — stairs, basements, hills — map class onto geography. Comedy, horror and melodrama share the frame until one wins.',
        description: 'Bong builds machines that switch genre mid-scene without losing the thread. The absurdity is funny until the architecture of the story reveals what it has been holding down.',
        examples: [
            { id: 496243, title: 'Parasite', note: 'Bong describes designing the two houses so that stairs and sightlines encode class before dialogue does, then letting the tone slide from comedy to horror in the same space.' },
            { id: 110415, title: 'Snowpiercer', note: 'The train\'s linear, vertical geography is the social order; Bong stages each carriage as a different genre until the structure itself becomes the antagonist.' }
        ],
        sources: [
            { label: 'Walker Art Center: Bong Joon Ho in conversation', url: 'https://walkerart.org/magazine/bong-joon-ho-parasite-conversation' }
        ]
    }
];
