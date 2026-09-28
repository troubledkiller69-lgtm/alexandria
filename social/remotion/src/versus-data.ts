export const FPS = 30;
export const SCENE_LEN = 90; // 3s per matchup
export const W = 1080;
export const H = 1920;

export type Matchup = {
  id: string;
  left: { title: string; year: string; poster: string; accent: string };
  right: { title: string; year: string; poster: string; accent: string };
  winner?: string;
};

export const HOOK = {
  kicker: "HORROR EDITION",
  lines: ["THIS OR THAT", "PICK ONE"],
  sub: "There's a wrong answer. Choose wisely.",
};

export const MATCHUPS: Matchup[] = [
  {
    id: "alien-vs-predator",
    left: { title: "ALIEN", year: "1979", poster: "posters/alien.jpg", accent: "#00d4aa" },
    right: { title: "PREDATOR", year: "1987", poster: "posters/predator.jpg", accent: "#ff6b35" },
  },
  {
    id: "freddy-vs-jason",
    left: { title: "NIGHTMARE ON ELM STREET", year: "1984", poster: "posters/Nightmare.jpg", accent: "#ff4444" },
    right: { title: "FRIDAY THE 13TH", year: "1980", poster: "posters/Friday13.jpg", accent: "#3b82f6" },
  },
  {
    id: "shining-vs-it",
    left: { title: "THE SHINING", year: "1980", poster: "posters/Shining.jpg", accent: "#f5c518" },
    right: { title: "IT", year: "2017", poster: "posters/IT2017.jpg", accent: "#ff3b30" },
  },
  {
    id: "conjuring-vs-hereditary",
    left: { title: "THE CONJURING", year: "2013", poster: "posters/Conjuring.jpg", accent: "#8b5cf6" },
    right: { title: "HEREDITARY", year: "2018", poster: "posters/Hereditary.jpg", accent: "#ef4444" },
  },
  {
    id: "thing-vs-fly",
    left: { title: "THE THING", year: "1982", poster: "posters/Thing.jpg", accent: "#06b6d4" },
    right: { title: "THE FLY", year: "1986", poster: "posters/Fly.jpg", accent: "#a855f7" },
  },
];

export const OUTRO = {
  kicker: "You survived",
  lines: ["LOG YOUR PICKS", "ON ALEXANDRIA"],
  sub: "Link in bio. Which matchup was hardest?",
};

export const TOTAL_FRAMES = (MATCHUPS.length + 2) * SCENE_LEN;

export const DISPLAY = "'Arial Black', Impact, 'Segoe UI', sans-serif";
export const BODY = "'Segoe UI', system-ui, sans-serif";
export const GOLD = "#f5c518";