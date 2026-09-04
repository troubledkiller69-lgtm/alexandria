-- Franchise archive definitions as data. The client loads these from the
-- table and falls back to js/franchise-data.js when Supabase is unreachable.

create table if not exists public.franchises (
  id text primary key,
  name text not null,
  subtitle text,
  genre text,
  accent text not null default '#8a0303',
  collection_id integer,
  movie_ids jsonb,
  tv_ids jsonb,
  sort_order integer not null default 0
);

alter table public.franchises enable row level security;

create policy "franchises public read" on public.franchises for select using (true);

insert into public.franchises (id, name, subtitle, genre, accent, collection_id, movie_ids, tv_ids, sort_order) values
('mcu', 'Marvel Cinematic Universe', 'The Infinity Saga & Beyond', 'Superhero', '#e23636', null, '[1726,1724,10138,10195,1771,24428,68721,76338,100402,118340,99861,102899,271110,284052,283995,315635,284053,284054,299536,363088,299537,299534,429617,497698,566525,524434,634649,453395,616037,505642,640146,447365,609681,533535]'::jsonb, null, 1),
('transformers', 'Transformers', 'More Than Meets the Eye', 'Action', '#0070f3', null, '[1858,8373,38356,91314,335988,424783,667538,698687]'::jsonb, null, 2),
('star-wars', 'Star Wars', 'A Galaxy Far, Far Away', 'Sci-Fi', '#FFE81F', 10, null, null, 3),
('harry-potter', 'Harry Potter', 'The Wizarding World', 'Fantasy', '#946B2D', 1241, null, null, 4),
('lotr', 'The Lord of the Rings', 'One Ring to Rule Them All', 'Fantasy', '#C9A84C', 119, null, null, 5),
('dc', 'DC Extended Universe', 'Gods Among Us', 'Superhero', '#0078D7', null, '[49521,209112,297761,297762,141052,297802,287947,460465,464052,791373,436969,436270,594767,298618,565770,572802]'::jsonb, null, 6),
('twd', 'The Walking Dead Universe', 'Fight the Dead. Fear the Living.', 'Horror', '#4a7c3f', null, null, '[1402,62286,94305,194583,211684,206586]'::jsonb, 7),
('fast-furious', 'Fast & Furious', 'Family. No Matter What.', 'Action', '#FF6B00', 9485, null, null, 8),
('jurassic', 'Jurassic Park', 'Life Finds a Way', 'Sci-Fi', '#2E8B57', 328, null, null, 9),
('hunger-games', 'The Hunger Games', 'May The Odds Be Ever In Your Favor', 'Sci-Fi', '#C4151C', 131635, null, null, 10),
('pirates', 'Pirates of the Caribbean', 'Not All Treasure Is Silver and Gold', 'Adventure', '#8B6914', 295, null, null, 11),
('conjuring', 'The Conjuring Universe', 'Based on the True Case Files of the Warrens', 'Horror', '#7a1f1f', 313086, null, null, 12),
('saw', 'Saw', 'Live or Die, Make Your Choice', 'Horror', '#8d9aa6', 656, null, null, 13),
('scream', 'Scream', 'What''s Your Favorite Scary Movie?', 'Horror', '#ff1744', 2602, null, null, 14),
('halloween', 'Halloween', 'The Night He Came Home', 'Horror', '#ff8f00', 91361, null, null, 15),
('friday-13th', 'Friday the 13th', 'Welcome to Crystal Lake', 'Horror', '#1b5e20', 9735, null, null, 16),
('elm-street', 'A Nightmare on Elm Street', 'One, Two, Freddy''s Coming for You', 'Horror', '#8e24aa', 8581, null, null, 17),
('evil-dead', 'The Evil Dead', 'Dead by Dawn', 'Horror', '#795548', 1960, null, null, 18),
('alien', 'Alien', 'In Space No One Can Hear You Scream', 'Sci-Fi', '#00c853', 8091, null, null, 19),
('predator', 'Predator', 'If It Bleeds, We Can Kill It', 'Sci-Fi', '#ffb300', 399, null, null, 20),
('final-destination', 'Final Destination', 'You Can''t Cheat Death', 'Horror', '#546e7a', 8864, null, null, 21),
('paranormal', 'Paranormal Activity', 'What Happens When You Sleep?', 'Horror', '#283593', 41437, null, null, 22),
('insidious', 'Insidious', 'It''s Not the House That''s Haunted', 'Horror', '#d32f2f', 228446, null, null, 23),
('matrix', 'The Matrix', 'There Is No Spoon', 'Sci-Fi', '#00e676', 2344, null, null, 24),
('mi', 'Mission: Impossible', 'Your Mission, Should You Choose to Accept It', 'Action', '#1e88e5', 87359, null, null, 25),
('john-wick', 'John Wick', 'With Pencil. With a Fucking Pencil.', 'Action', '#e5c27e', 404609, null, null, 26),
('bond', 'James Bond', 'Licensed to Kill', 'Action', '#aeb6bf', 645, null, null, 27),
('indiana-jones', 'Indiana Jones', 'Snakes. Why Did It Have to Be Snakes?', 'Adventure', '#8b5a2b', 84, null, null, 28),
('dune', 'Dune', 'Fear Is the Mind-Killer', 'Sci-Fi', '#d4a33c', 726871, null, null, 29),
('mad-max', 'Mad Max', 'Witness Me!', 'Action', '#e0662e', 8945, null, null, 30),
('breaking-bad', 'Breaking Bad Universe', 'I Am the One Who Knocks', 'Crime', '#1b7f3a', null, null, '[1396,60059]'::jsonb, 31),
('witcher', 'The Witcher', 'Toss a Coin to Your Witcher', 'Fantasy', '#8e6b3f', null, null, '[71912,106541]'::jsonb, 32),
('boys', 'The Boys', 'Fuck the Seven. Fuck Homelander.', 'Superhero', '#4a4a6a', null, null, '[76479,205715]'::jsonb, 33)
on conflict (id) do update set
  name = excluded.name,
  subtitle = excluded.subtitle,
  genre = excluded.genre,
  accent = excluded.accent,
  collection_id = excluded.collection_id,
  movie_ids = excluded.movie_ids,
  tv_ids = excluded.tv_ids,
  sort_order = excluded.sort_order;
