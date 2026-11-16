'use client';

import { useEffect, useRef, useState } from 'react';
import { PAPER_COPY } from '@/lib/copy/paper';
import { anglesAt, type LetterFoldView } from '@/lib/pliego/paper';
import type { Locale } from '@/lib/routing';
import css from './paper.module.css';

/** Pixels per millimetre of the small page (a Carta sheet is about 162 × 210 px). */
const SCALE = 0.75;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Pliego's own fold program for this page, played on a small sheet: the tuck (bottom) panel turns in first, then the
 * cover (top) panel over it, each a valley fold at the angles and pace of the cartridge's steps, captioned with
 * Pliego's instruction for the step. Transforms are set through the CSSOM (nonce CSP). Reduced motion: no animation,
 * one press per fold. Screen only, decorative except the caption, which is announced.
 */
export function FoldMotion({ locale, fold }: { locale: Locale; fold: LetterFoldView }) {
  const t = PAPER_COPY[locale];
  const { program } = fold;
  const [top, middle, bottom] = fold.panelsMm;
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const [step, setStep] = useState(0); // whole steps done
  const [playing, setPlaying] = useState(false);

  const pose = (done: number, frac: number) => {
    const a = anglesAt(program, done, frac);
    // Valleys: the bottom panel swings up towards the reader about its top edge, the top panel down about its bottom
    // edge. The small Z offsets keep the folded layers in Pliego's order (tuck under cover) without z-fighting.
    if (bottomRef.current) bottomRef.current.style.transform = `rotateX(${a.bottom.toFixed(2)}deg) translateZ(-1px)`;
    if (topRef.current) topRef.current.style.transform = `rotateX(${(-a.top).toFixed(2)}deg) translateZ(-2px)`;
  };

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.style.width = `${(fold.pageMm.width * SCALE).toFixed(1)}px`;
    sheet.style.height = `${(middle * SCALE).toFixed(1)}px`;
    sheet.style.marginTop = `${(top * SCALE).toFixed(1)}px`;
    sheet.style.marginBottom = `${(bottom * SCALE).toFixed(1)}px`;
    if (topRef.current) topRef.current.style.height = `${(top * SCALE).toFixed(1)}px`;
    if (bottomRef.current) bottomRef.current.style.height = `${(bottom * SCALE).toFixed(1)}px`;
    pose(0, 0);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the sheet is laid out once per page size and stock
  }, [fold.paper, fold.stock]);

  const play = () => {
    cancelAnimationFrame(raf.current);
    if (reducedMotion()) {
      // One press = one whole fold (all of that panel's steps), no motion in between.
      let done = step >= program.length ? 0 : step;
      const panel = program[done]?.panel;
      while (done < program.length && program[done]!.panel === panel) done++;
      setStep(done);
      pose(done, 0);
      return;
    }
    setPlaying(true);
    setStep(0);
    pose(0, 0);
    let done = 0;
    let start = performance.now();
    const tick = (now: number) => {
      const s = program[done];
      if (!s) {
        setPlaying(false);
        return;
      }
      const frac = (now - start) / s.ms;
      if (frac >= 1) {
        done += 1;
        start = now;
        setStep(done);
        pose(done, 0);
      } else pose(done, frac);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const finished = step >= program.length;
  // While playing: the step in motion. At rest: the fold just made (or the flat sheet, or the folded letter).
  const caption = playing
    ? program[Math.min(step, program.length - 1)]!.label[locale]
    : step === 0
      ? t.foldRest
      : finished
        ? t.foldDone
        : program[step - 1]!.label[locale];
  const label = reducedMotion() && step > 0 && !finished ? t.foldNext : finished ? t.foldReplay : t.foldPlay;

  return (
    <figure className={css.motion} data-fold-step={finished ? 'done' : String(step)}>
      <div className={css.motionStage} aria-hidden="true">
        <div ref={sheetRef} className={css.motionMiddle}>
          <div ref={topRef} className={`${css.motionPanel} ${css.motionTop}`} />
          <div ref={bottomRef} className={`${css.motionPanel} ${css.motionBottom}`} />
        </div>
      </div>
      <figcaption className={css.motionCaption}>
        <span aria-live="polite" data-testid="fold-caption">
          {caption}
        </span>
        <button type="button" className={css.motionButton} onClick={play} disabled={playing}>
          {label}
        </button>
      </figcaption>
    </figure>
  );
}
