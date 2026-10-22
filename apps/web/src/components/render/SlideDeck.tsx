'use client';

import { Children, useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import s from './render.module.css';

const noop = () => () => undefined;

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
 */
export function SlideDeck({ label, previous, next, positions, hint, children }: { label: string; previous: string; next: string; positions: string[]; hint: string; children: ReactNode }) {
  const slides = Children.toArray(children);
  const total = slides.length;
  const enhanced = useSyncExternalStore(noop, () => true, () => false);
  const [index, setIndex] = useState(0);
  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(i, total - 1))), [total]);

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
    <div className={s.deck} role="group" aria-roledescription={label} aria-label={label} data-enhanced={enhanced ? 'true' : 'false'}>
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
        </div>
      ) : null}
    </div>
  );
}
