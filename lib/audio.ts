"use client";

/**
 * Tout le son du plateau est SYNTHETISE ici, a la Web Audio API.
 *
 * Pourquoi : aucun fichier a telecharger, aucun jingle, aucune musique
 * protegee, aucune sonorite emprunee a une emission existante. Le buzzer, le
 * gong de faute, le vol, la fanfare de victoire et le lit musical de suspense
 * sont ecrits en notes ici meme. C'est 100 % original et 0 ko d'assets.
 *
 * Deux interrupteurs independants, comme demande : SON (effets) et MUSIQUE
 * (le lit d'ambiance).
 */

type Cue =
  | "ui"
  | "join"
  | "intro"
  | "faceoff"
  | "question"
  | "buzz"
  | "correct"
  | "reveal"
  | "wrong"
  | "strike"
  | "third"
  | "steal"
  | "stealWin"
  | "stealFail"
  | "tick"
  | "roundWin"
  | "finale"
  | "finaleReveal"
  | "victory"
  | "defeat";

const STORE_SFX = "tf-sfx";
const STORE_MUSIC = "tf-music";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicTimer: number | null = null;
let musicMood: Mood = null;

let sfxOn = true;
let musicOn = true;

/**
 * iOS et Safari ne demarrent un AudioContext que DANS un geste utilisateur,
 * et exigent qu'on y joue un son — meme silencieux — pour le debloquer.
 * Tant que ce n'est pas fait, tout appel a play() reste muet : c'est ce qui
 * aurait rendu le buzzer et la musique inaudibles sur iPhone.
 */
let unlocked = false;
let pendingMood: Mood = null;
let unlockInstalled = false;

type Mood = "lobby" | "play" | "tense" | "finale" | null;

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback; // navigation privee : on n'insiste pas
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    window.localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** A appeler sur le premier geste utilisateur : les navigateurs l'exigent. */
export function initAudio() {
  if (typeof window === "undefined") return;
  sfxOn = readFlag(STORE_SFX, true);
  musicOn = readFlag(STORE_MUSIC, true);
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);
}

/**
 * A appeler DANS un geste utilisateur. Joue un echantillon d'une image pour
 * que le systeme considere le contexte comme demarre, puis rattrape l'ambiance
 * musicale qui attendait.
 */
export function unlockAudio() {
  initAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  if (!unlocked) {
    try {
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      unlocked = true;
    } catch {
      /* on retentera au prochain geste */
    }
  }

  if (unlocked && pendingMood) {
    const m = pendingMood;
    pendingMood = null;
    musicMood = null; // force la reprise
    setMood(m);
  }
}

/**
 * Installe l'ecouteur qui debloque le son au premier geste, une seule fois
 * pour la page. Les trois evenements sont necessaires : `touchstart` pour
 * iOS, `pointerdown` pour le reste, `keydown` pour qui joue au clavier.
 */
export function installAudioUnlock() {
  if (typeof window === "undefined" || unlockInstalled) return;
  unlockInstalled = true;
  const once = () => {
    unlockAudio();
    if (unlocked) {
      for (const ev of ["pointerdown", "touchstart", "keydown"] as const) {
        window.removeEventListener(ev, once);
      }
    }
  };
  for (const ev of ["pointerdown", "touchstart", "keydown"] as const) {
    window.addEventListener(ev, once, { passive: true });
  }
}

export const isSfxOn = () => sfxOn;
export const isMusicOn = () => musicOn;
export const isAudioUnlocked = () => unlocked;

export function setSfx(on: boolean) {
  sfxOn = on;
  writeFlag(STORE_SFX, on);
  initAudio();
}

export function setMusic(on: boolean) {
  musicOn = on;
  writeFlag(STORE_MUSIC, on);
  initAudio();
  if (!on) {
    stopMusic();
  } else if (musicMood) {
    const m = musicMood;
    musicMood = null;
    setMood(m);
  }
}

/* ------------------------------------------------------------------ */
/*  Briques de synthese                                               */
/* ------------------------------------------------------------------ */

interface ToneOptions {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  at?: number;
  /** Glissando vers cette frequence (sirene, buzzer, chute). */
  to?: number;
  attack?: number;
  dest?: AudioNode;
}

function tone(o: ToneOptions) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + (o.at ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);

  const peak = o.gain ?? 0.2;
  const attack = o.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

  osc.connect(g);
  g.connect(o.dest ?? master);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

/** Bruit filtre : impacts, flashs de lumiere, confettis. */
function noise(dur: number, at = 0, gain = 0.15, hp = 800) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + at;
  const frames = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t0);
}

const NOTE: Record<string, number> = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, E6: 1318.5, G6: 1568.0,
};

function chord(names: string[], dur: number, at = 0, gain = 0.1, type: OscillatorType = "triangle") {
  names.forEach((n) => tone({ freq: NOTE[n] ?? 440, dur, at, gain, type }));
}

/* ------------------------------------------------------------------ */
/*  Les cues                                                          */
/* ------------------------------------------------------------------ */

export function play(cue: Cue) {
  if (!sfxOn) return;
  initAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  // Avant le premier geste, le systeme refuse de sortir le moindre son :
  // inutile d'en programmer, ils ne se joueraient pas.
  if (!unlocked && ctx.state !== "running") return;

  switch (cue) {
    case "ui":
      tone({ freq: 880, dur: 0.07, type: "triangle", gain: 0.07 });
      break;

    case "join":
      // Deux notes montantes : un joueur vient d'apparaitre sur le podium.
      tone({ freq: NOTE.E5, dur: 0.12, type: "triangle", gain: 0.12 });
      tone({ freq: NOTE.B5, dur: 0.18, at: 0.1, type: "triangle", gain: 0.1 });
      break;

    case "intro":
      // Fanfare d'ouverture : quinte, puis accord majeur qui s'ouvre.
      noise(0.5, 0, 0.1, 300);
      tone({ freq: NOTE.C3, dur: 1.6, type: "sawtooth", gain: 0.07 });
      chord(["C4", "G4"], 0.5, 0.05, 0.1);
      chord(["E4", "C5"], 0.5, 0.45, 0.1);
      chord(["G4", "C5", "E5"], 1.4, 0.85, 0.11);
      tone({ freq: NOTE.C6, dur: 1.2, at: 1.0, type: "triangle", gain: 0.08 });
      break;

    case "faceoff":
      // Deux coups secs qui se repondent : rouge, puis bleu.
      tone({ freq: NOTE.A3, dur: 0.22, type: "square", gain: 0.09 });
      tone({ freq: NOTE.E4, dur: 0.22, at: 0.26, type: "square", gain: 0.09 });
      noise(0.2, 0.5, 0.08, 1200);
      break;

    case "question":
      tone({ freq: NOTE.G4, dur: 0.14, type: "triangle", gain: 0.1 });
      tone({ freq: NOTE.C5, dur: 0.3, at: 0.12, type: "triangle", gain: 0.1 });
      break;

    case "buzz":
      // LE buzzer : sirene courte et grasse, ca doit faire sursauter.
      tone({ freq: 520, to: 180, dur: 0.42, type: "square", gain: 0.24 });
      tone({ freq: 261, to: 90, dur: 0.42, type: "sawtooth", gain: 0.16 });
      noise(0.18, 0, 0.12, 500);
      break;

    case "correct":
      // Accord majeur ascendant, ample.
      tone({ freq: NOTE.C5, dur: 0.16, type: "triangle", gain: 0.16 });
      tone({ freq: NOTE.E5, dur: 0.16, at: 0.1, type: "triangle", gain: 0.16 });
      tone({ freq: NOTE.G5, dur: 0.5, at: 0.2, type: "triangle", gain: 0.16 });
      tone({ freq: NOTE.C6, dur: 0.6, at: 0.28, type: "sine", gain: 0.12 });
      noise(0.3, 0.2, 0.1, 2200);
      break;

    case "reveal":
      // La case qui s'ouvre : un "clac" lumineux.
      noise(0.12, 0, 0.14, 1800);
      tone({ freq: NOTE.B5, dur: 0.2, type: "triangle", gain: 0.12 });
      tone({ freq: NOTE.E6, dur: 0.3, at: 0.06, type: "sine", gain: 0.09 });
      break;

    case "wrong":
      // Deux notes qui tombent. Sec, sans insister.
      tone({ freq: NOTE.A3, dur: 0.2, type: "square", gain: 0.14 });
      tone({ freq: NOTE.F3, dur: 0.38, at: 0.16, type: "square", gain: 0.14 });
      break;

    case "strike":
      // Le X : impact grave et court.
      tone({ freq: 220, to: 70, dur: 0.5, type: "sawtooth", gain: 0.2 });
      noise(0.22, 0, 0.14, 200);
      break;

    case "third":
      // Troisieme faute : trois impacts, puis un gong qui descend.
      for (let i = 0; i < 3; i++) {
        tone({ freq: 240, to: 80, dur: 0.3, at: i * 0.22, type: "sawtooth", gain: 0.2 });
        noise(0.16, i * 0.22, 0.13, 200);
      }
      tone({ freq: NOTE.C3, to: 55, dur: 1.6, at: 0.7, type: "triangle", gain: 0.18 });
      break;

    case "steal":
      // Suspense : basse qui pulse, aigu qui hesite.
      tone({ freq: NOTE.A3, dur: 1.8, type: "sine", gain: 0.1 });
      for (let i = 0; i < 6; i++) {
        tone({ freq: NOTE.E5, dur: 0.1, at: i * 0.3, type: "triangle", gain: 0.06 });
      }
      break;

    case "stealWin":
      // Le vol reussi : glissando montant + fanfare. Le moment le plus fort.
      tone({ freq: 200, to: 1400, dur: 0.6, type: "sawtooth", gain: 0.14 });
      chord(["C5", "E5", "G5"], 0.8, 0.5, 0.14);
      chord(["E5", "G5", "C6"], 1.1, 1.0, 0.14);
      noise(0.6, 0.5, 0.12, 1500);
      break;

    case "stealFail":
      tone({ freq: 400, to: 120, dur: 0.7, type: "square", gain: 0.16 });
      tone({ freq: NOTE.F3, dur: 0.9, at: 0.4, type: "triangle", gain: 0.12 });
      break;

    case "tick":
      tone({ freq: 1500, dur: 0.04, type: "square", gain: 0.05 });
      break;

    case "roundWin":
      chord(["C4", "E4", "G4"], 0.4, 0, 0.11);
      chord(["F4", "A4", "C5"], 0.4, 0.35, 0.11);
      chord(["G4", "C5", "E5"], 0.9, 0.7, 0.12);
      break;

    case "finale":
      // Montee dramatique en cinq paliers.
      ["C4", "E4", "G4", "B4", "E5"].forEach((n, i) =>
        tone({ freq: NOTE[n], dur: 0.5, at: i * 0.28, type: "triangle", gain: 0.12 })
      );
      tone({ freq: NOTE.C3, dur: 2.4, type: "sawtooth", gain: 0.08 });
      noise(0.8, 1.3, 0.1, 600);
      break;

    case "finaleReveal":
      tone({ freq: NOTE.E5, dur: 0.1, type: "square", gain: 0.1 });
      tone({ freq: NOTE.B5, dur: 0.3, at: 0.12, type: "triangle", gain: 0.12 });
      noise(0.14, 0.1, 0.09, 2000);
      break;

    case "victory":
      // Grande fanfare : trois accords + cascade + confettis.
      chord(["C4", "E4", "G4", "C5"], 0.55, 0, 0.13);
      chord(["F4", "A4", "C5", "F5"], 0.55, 0.5, 0.13);
      chord(["G4", "B4", "D5", "G5"], 0.5, 1.0, 0.13);
      chord(["C5", "E5", "G5", "C6"], 1.8, 1.45, 0.15);
      ["C5", "E5", "G5", "C6", "E6", "G6"].forEach((n, i) =>
        tone({ freq: NOTE[n], dur: 0.35, at: 1.5 + i * 0.09, type: "sine", gain: 0.1 })
      );
      noise(1.4, 1.45, 0.12, 1200);
      break;

    case "defeat":
      chord(["A3", "C4", "E4"], 0.6, 0, 0.11);
      chord(["F3", "A3", "C4"], 1.4, 0.55, 0.11);
      break;
  }
}

/* ------------------------------------------------------------------ */
/*  Le lit musical                                                    */
/* ------------------------------------------------------------------ */

/** Quatre ambiances, une par grand moment du show. */
const MOODS: Record<NonNullable<Mood>, { notes: string[]; step: number; type: OscillatorType; bass: string }> = {
  lobby:  { notes: ["C4", "E4", "G4", "E4"],       step: 0.42, type: "sine",     bass: "C3" },
  play:   { notes: ["C4", "G4", "A4", "G4", "E4"], step: 0.3,  type: "triangle", bass: "C3" },
  tense:  { notes: ["A3", "C4", "E4", "C4"],       step: 0.19, type: "square",   bass: "A3" },
  finale: { notes: ["E4", "G4", "B4", "E5", "B4"], step: 0.26, type: "triangle", bass: "E3" },
};

export function setMood(mood: Mood) {
  if (mood === musicMood) return;
  musicMood = mood;
  stopMusic();
  if (!mood || !musicOn) return;

  initAudio();
  if (!ctx || !musicGain) return;
  if (ctx.state === "suspended") void ctx.resume();

  // Pas encore de geste utilisateur : on retient l'ambiance, unlockAudio()
  // la lancera. Sans ca, le lit musical ne demarrait jamais sur iPhone.
  if (!unlocked && ctx.state !== "running") {
    pendingMood = mood;
    musicMood = null;
    return;
  }

  const cfg = MOODS[mood];
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.2);

  let i = 0;
  const beat = () => {
    if (!ctx || !musicGain || musicMood !== mood) return;
    tone({
      freq: NOTE[cfg.notes[i % cfg.notes.length]] ?? 440,
      dur: cfg.step * 1.7,
      type: cfg.type,
      gain: 0.035,
      dest: musicGain,
    });
    if (i % cfg.notes.length === 0) {
      tone({
        freq: NOTE[cfg.bass] ?? 130,
        dur: cfg.step * cfg.notes.length,
        type: "sine",
        gain: 0.05,
        dest: musicGain,
      });
    }
    i++;
  };
  beat();
  musicTimer = window.setInterval(beat, cfg.step * 1000);
}

function stopMusic() {
  if (musicTimer) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
  if (ctx && musicGain) {
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
  }
}
