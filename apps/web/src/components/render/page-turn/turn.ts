/**
 * The deck's page turn (W5-P phase 3), loaded lazily by SlideDeck only when a deck has more than one slide and the
 * reader has not asked for reduced motion.
 *
 * The motion is Pliego's: `@pliego/engine` (Tier C, a compliant leaf of bond 80 with its real bending stiffness,
 * gravity and air drag) turned the kernel's `page-turn` leaf at build time, and lib/pliego/generated/page-turn-deck.json
 * keeps the leaf's mid-height cross-section for each 60 Hz frame (scripts/pliego-page-turn.ts). This module only plays
 * those frames: the leaf is cut into vertical strips, and each strip is placed and tilted with a CSS 3-D transform to
 * follow the curve. No canvas, no WebGL, no physics at runtime.
 *
 * What turns is a CLONE of the slide, inert and hidden from assistive technology, and it exists only for the
 * transition: the real slide underneath is already the new one (the position is announced at once), and at rest
 * there is only real DOM text. Transforms and sizes are set through the CSSOM (allowed by the nonce CSP; never a
 * style attribute in server markup). Print never sees the layer.
 */
import bake from '../../../lib/pliego/generated/page-turn-deck.json' with { type: 'json' };
import css from './page-turn.module.css';

const FRAMES = bake.frames as number[][];
const SAMPLES = bake.samples;
const SCALE = bake.scale;
const FPS = bake.fps;
const DRIVE = bake.driveFrames;
export const TURN_MS = Math.round(((FRAMES.length - 1) / FPS) * 1000);

/** The leaf's cross-section at a (fractional) frame: [x, depth] per sample, as fractions of the leaf's width. */
export function sectionAt(frame: number): [number, number][] {
  const f = Math.max(0, Math.min(FRAMES.length - 1, frame));
  const a = FRAMES[Math.floor(f)]!;
  const b = FRAMES[Math.min(FRAMES.length - 1, Math.floor(f) + 1)]!;
  const t = f - Math.floor(f);
  const out: [number, number][] = [];
  for (let k = 0; k < SAMPLES; k++) {
    out.push([(a[2 * k]! + (b[2 * k]! - a[2 * k]!) * t) / SCALE, (a[2 * k + 1]! + (b[2 * k + 1]! - a[2 * k + 1]!) * t) / SCALE]);
  }
  return out;
}

/** One strip's placement: where its spine-side edge goes and how far it tilts (radians, 0 = flat, π = turned over). */
export function stripPose(section: [number, number][], k: number): { dx: number; depth: number; angle: number } {
  const [x0, y0] = section[k]!;
  const [x1, y1] = section[k + 1]!;
  return { dx: x0 - k / (SAMPLES - 1), depth: y0, angle: Math.atan2(y1 - y0, x1 - x0) };
}

function inertClone(node: Element): HTMLElement {
  const copy = node.cloneNode(true) as HTMLElement;
  for (const el of [copy, ...Array.from(copy.querySelectorAll('[id]'))]) el.removeAttribute('id');
  return copy;
}

export interface TurnRequest {
  /** The deck element (positioned); the layer is placed over `target`'s box inside it. */
  deck: HTMLElement;
  /** The slide frame now shown (the destination). */
  target: HTMLElement;
  /** The content of the slide that was shown before. */
  from: Element;
  forward: boolean;
}

/** A built turn layer: pose it at any frame (a finger scrubbing it), animate between frames, or end it. */
export interface Turn {
  /** Frames 0…`drive` are the leaf turning; `drive`…`last` it settles. */
  readonly drive: number;
  readonly last: number;
  pose(frame: number): void;
  /** Plays from one frame to another at the bake's own 60 Hz, then calls `done` (unless ended first). */
  animate(from: number, to: number, done?: () => void): void;
  end(): void;
}

/**
 * Builds the layer for one turn without playing it. Forward: the previous slide is the leaf, lifting from its
 * fore-edge and turning over the spine to uncover the new one. Backward: the new slide is the leaf, coming back over
 * the spine onto the previous one (frame `last` = turned over, frame 0 = at rest on the deck).
 */
export function createTurn({ deck, target, from, forward }: TurnRequest): Turn {
  const box = target.getBoundingClientRect();
  const origin = deck.getBoundingClientRect();
  const width = box.width;
  const layer = document.createElement('div');
  layer.className = css.layer!;
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('data-page-turn', forward ? 'forward' : 'backward');
  layer.inert = true;
  const ls = layer.style;
  ls.left = `${box.left - origin.left}px`;
  ls.top = `${box.top - origin.top}px`;
  ls.width = `${width}px`;
  ls.height = `${box.height}px`;
  ls.perspective = `${Math.round(width * 2.5)}px`;
  ls.setProperty('--page-turn-verso', bake.verso);

  // Backward, the previous slide stays visible under the incoming leaf until it is covered.
  if (!forward) {
    const under = document.createElement('div');
    under.className = css.under!;
    under.append(inertClone(from));
    layer.append(under);
  }
  const leafSource = forward ? from : target.firstElementChild ?? target;
  const strips: { el: HTMLElement; shade: HTMLElement }[] = [];
  const step = width / (SAMPLES - 1);
  for (let k = 0; k < SAMPLES - 1; k++) {
    const strip = document.createElement('div');
    strip.className = css.strip!;
    const left = k * step;
    strip.style.left = `${left}px`;
    strip.style.width = `${step + 1.5}px`;
    const front = document.createElement('div');
    front.className = css.front!;
    const content = inertClone(leafSource);
    content.classList.add(css.content!);
    content.style.left = `${-left}px`;
    content.style.width = `${width}px`;
    content.style.height = `${box.height}px`;
    const shade = document.createElement('i');
    shade.className = css.shade!;
    front.append(content, shade);
    const back = document.createElement('div');
    back.className = css.back!;
    strip.append(front, back);
    layer.append(strip);
    strips.push({ el: strip, shade });
  }
  deck.append(layer);

  const last = FRAMES.length - 1;
  let raf = 0;
  let done = false;
  const pose = (frame: number) => {
    if (done) return;
    const section = sectionAt(frame);
    for (let k = 0; k < strips.length; k++) {
      const { dx, depth, angle } = stripPose(section, k);
      const s = strips[k]!;
      s.el.style.transform = `translate3d(${(dx * width).toFixed(2)}px, 0, ${(depth * width).toFixed(2)}px) rotateY(${(-angle).toFixed(4)}rad)`;
      s.shade.style.opacity = (0.22 * Math.min(1, Math.abs(Math.sin(angle)))).toFixed(3);
    }
  };
  const end = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    layer.remove();
  };
  const animate = (a: number, b: number, then?: () => void) => {
    cancelAnimationFrame(raf);
    const span = Math.abs(b - a);
    const sign = b >= a ? 1 : -1;
    const start = performance.now();
    const tick = (now: number) => {
      if (done) return;
      const f = ((now - start) / 1000) * FPS;
      if (f >= span) {
        pose(b);
        then?.();
        return;
      }
      pose(a + sign * f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };
  pose(forward ? 0 : last);
  return { drive: DRIVE, last, pose, animate, end };
}

/** Plays one whole turn (keys and buttons). Returns a function that ends it now. */
export function playTurn(req: TurnRequest): () => void {
  const turn = createTurn(req);
  if (req.forward) turn.animate(0, turn.last, turn.end);
  else turn.animate(turn.last, 0, turn.end);
  return turn.end;
}

/**
 * Where a finger dragging the leaf puts it: `progress` 0 (not moved) … 1 (a full slide's width). Forward the leaf
 * lifts from rest (frame 0); backward it starts turned over (frame `drive`) and comes back. Only the drive frames are
 * scrubbed; the settle frames play on release.
 */
export function dragFrame(progress: number, forward: boolean): number {
  const p = Math.max(0, Math.min(1, progress));
  return forward ? p * DRIVE : DRIVE * (1 - p);
}

/** On release: complete the turn past a third of the width, or on a quick flick (px/ms) in the turn's direction. */
export function commits(progress: number, velocity: number): boolean {
  return progress > 1 / 3 || velocity > 0.45;
}
