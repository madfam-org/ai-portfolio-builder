'use client';

import { Children, useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type * as TurnModuleNs from './page-turn/turn';
import s from './render.module.css';

const noop = () => () => undefined;

type TurnModule = typeof TurnModuleNs;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Keys that move a deck, and where to. */
export function nextIndex(key: string, shift: boolean, current: number, total: number): number | null {
  const last = total - 1;
  switch (key) {
    case 'ArrowRight':
    case 'PageDown':
      return Math.min(current + 1, last);
    case 'ArrowLeft':
    case 'PageUp':
      return Math.max(current - 1, 0);
    case ' ':
      return shift ? Math.max(current - 1, 0) : Math.min(current + 1, last);
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return null;
  }
}

/** A mouse grabs the leaf only near its fore-edge or spine (the outer 15 % each side), so selecting text still works. */
export const MOUSE_EDGE = 0.15;

/** A drag becomes a turn once it has moved this far sideways and more sideways than up or down. */
export const DRAG_SLOP = 10;

/** The window (ms) over which the release speed is measured. */
const RECENT_MS = 100;

const FIELDS = ['INPUT', 'TEXTAREA', 'SELECT'];
const ACTIVATES = ['BUTTON', 'A', 'SUMMARY'];

/** A key typed into a field never moves the deck; Space on a button or link keeps activating it. */
function ignored(key: string, target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || FIELDS.includes(target.tagName)) return true;
  return key === ' ' && ACTIVATES.includes(target.tagName);
}

/**
 * The presentation's only script (about 60 lines, under the nonce CSP's 'strict-dynamic'): one slide at a time with
 * ←/→, Space (Shift+Space back), PageUp/PageDown, Home/End and two buttons; the position is announced politely.
 * Without script every slide is shown in order (the server render), and print always shows every slide, one per page.
 *
 * W5-P phase 3: moving between slides plays a page turn baked with Pliego's paper engine (./page-turn/turn.ts, loaded
 * lazily and only for a deck of two or more slides when reduced motion is off). The slide changes and is announced at
 * once; the turn is a decorative, inert copy over it for about 0.8 s, then only real text remains. Reduced motion:
 * an instant change, and the module is never loaded.
 *
 * The leaf can also be turned by hand: a finger (or a mouse from the slide's outer edge) drags it, and the baked
 * Pliego frames follow the drag; released past a third of the width or flicked, the turn completes, otherwise the
 * leaf falls back and the slide returns. The destination is shown (and announced) when the drag starts, as with keys.
 */
export function SlideDeck({ label, previous, next, positions, hint, touchHint, children }: { label: string; previous: string; next: string; positions: string[]; hint: string; touchHint: string; children: ReactNode }) {
  const slides = Children.toArray(children);
  const total = slides.length;
  const enhanced = useSyncExternalStore(noop, () => true, () => false);
  const [index, setIndex] = useState(0);
  const deckRef = useRef<HTMLDivElement>(null);
  const turnRef = useRef<TurnModule | null>(null);
  const pending = useRef<{ from: Element; forward: boolean } | null>(null);
  const stopTurn = useRef<(() => void) | null>(null);
  const drag = useRef<{
    id: number;
    x0: number;
    y0: number;
    /** Recent pointer samples (the last ~100 ms), for the release velocity. */
    trail: { x: number; t: number }[];
    width: number;
    from: number;
    forward: boolean | null;
    turn: ReturnType<TurnModule['createTurn']> | null;
  } | null>(null);

  useEffect(() => {
    if (!enhanced || total < 2 || reducedMotion()) return;
    let live = true;
    void import('./page-turn/turn').then((m) => {
      if (live) turnRef.current = m;
    });
    return () => {
      live = false;
      stopTurn.current?.();
    };
  }, [enhanced, total]);

  const go = useCallback(
    (i: number) => {
      const to = Math.max(0, Math.min(i, total - 1));
      if (to === index) return;
      stopTurn.current?.();
      const shown = deckRef.current?.querySelector(`[data-slide-index="${index}"]`)?.firstElementChild;
      pending.current = turnRef.current && shown && !reducedMotion() ? { from: shown, forward: to > index } : null;
      setIndex(to);
    },
    [index, total],
  );

  // After the destination slide is shown (and announced), the turn plays over it.
  useEffect(() => {
    const turn = pending.current;
    pending.current = null;
    const deck = deckRef.current;
    const target = deck?.querySelector<HTMLElement>(`[data-slide-index="${index}"]`);
    if (!turn || !deck || !target || !turnRef.current) return;
    stopTurn.current = turnRef.current.playTurn({ deck, target, from: turn.from, forward: turn.forward });
  }, [index]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!enhanced || total < 2 || !turnRef.current || reducedMotion() || e.button !== 0 || drag.current) return;
    const el = e.target instanceof HTMLElement ? e.target : null;
    if (el?.closest('a, button, input, select, textarea, summary, [contenteditable="true"]')) return;
    const frame = deckRef.current?.querySelector<HTMLElement>(`[data-slide-index="${index}"]`);
    if (!frame) return;
    const box = frame.getBoundingClientRect();
    const at = (e.clientX - box.left) / box.width;
    if (e.pointerType === 'mouse' && at > MOUSE_EDGE && at < 1 - MOUSE_EDGE) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, trail: [{ x: e.clientX, t: e.timeStamp }], width: box.width, from: index, forward: null, turn: null };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const m = turnRef.current;
    if (!d || e.pointerId !== d.id || !m) return;
    const dx = e.clientX - d.x0;
    d.trail.push({ x: e.clientX, t: e.timeStamp });
    while (d.trail.length > 2 && e.timeStamp - d.trail[0]!.t > RECENT_MS) d.trail.shift();
    if (d.forward === null) {
      const dy = e.clientY - d.y0;
      if (Math.abs(dx) < DRAG_SLOP) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null; // a scroll, not a turn
        return;
      }
      const forward = dx < 0;
      const to = d.from + (forward ? 1 : -1);
      const deck = deckRef.current;
      const shown = deck?.querySelector(`[data-slide-index="${d.from}"]`)?.firstElementChild;
      if (!deck || !shown || to < 0 || to >= total) {
        drag.current = null;
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      stopTurn.current?.();
      flushSync(() => setIndex(to));
      const target = deck.querySelector<HTMLElement>(`[data-slide-index="${to}"]`);
      if (!target) {
        drag.current = null;
        return;
      }
      d.forward = forward;
      d.turn = m.createTurn({ deck, target, from: shown, forward });
      stopTurn.current = d.turn.end;
    }
    if (!d.turn) return;
    const progress = (d.forward ? -dx : dx) / d.width;
    d.turn.pose(m.dragFrame(progress, d.forward!));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const m = turnRef.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (!d.turn || !m || d.forward === null) return;
    const dx = e.clientX - d.x0;
    const progress = Math.max(0, (d.forward ? -dx : dx) / d.width);
    // Speed over the last moments only: a leaf held still and then let go is not a flick.
    const first = d.trail.find((p) => e.timeStamp - p.t <= RECENT_MS);
    const moved = first ? (d.forward ? first.x - e.clientX : e.clientX - first.x) : 0;
    const velocity = first ? Math.max(0, moved) / Math.max(16, e.timeStamp - first.t) : 0;
    const turn = d.turn;
    const at = m.dragFrame(progress, d.forward);
    const keep = e.type === 'pointerup' && m.commits(progress, velocity);
    if (keep) {
      turn.animate(at, d.forward ? turn.last : 0, turn.end);
      return;
    }
    // Falls back: the leaf returns to where it started, then the slide it came from is shown again.
    turn.animate(at, d.forward ? 0 : turn.last, () => {
      turn.end();
      setIndex(d.from);
    });
  };

  useEffect(() => {
    if (!enhanced) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      if (ignored(e.key, e.target)) return;
      const to = nextIndex(e.key, e.shiftKey, index, total);
      if (to === null) return;
      e.preventDefault();
      go(to);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enhanced, index, total, go]);

  return (
    <div
      ref={deckRef}
      className={s.deck}
      role="group"
      aria-roledescription={label}
      aria-label={label}
      data-enhanced={enhanced ? 'true' : 'false'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {slides.map((slide, i) => (
        <div key={i} className={s.slideFrame} hidden={enhanced && i !== index ? true : undefined} data-slide-index={i} data-active={!enhanced || i === index ? 'true' : 'false'}>
          {slide}
        </div>
      ))}
      {enhanced && total > 1 ? (
        <div className={s.deckControls}>
          <button type="button" className={s.deckButton} onClick={() => go(index - 1)} disabled={index === 0}>
            {previous}
          </button>
          <p className={s.deckPosition} aria-live="polite" data-testid="slide-position">
            {positions[index]}
          </p>
          <button type="button" className={s.deckButton} onClick={() => go(index + 1)} disabled={index === total - 1}>
            {next}
          </button>
          <p className={s.deckHint}>{hint}</p>
          <p className={s.deckTouchHint}>{touchHint}</p>
        </div>
      ) : null}
    </div>
  );
}
