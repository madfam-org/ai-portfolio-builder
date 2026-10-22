/**
 * Decorative illustration (a CV page becoming a portfolio card), inline SVG with presentation attributes
 * only: no script, no style attribute, nothing the CSP has to allow. Hidden from assistive technology.
 */
export function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 360 260" aria-hidden="true" focusable="false">
      <rect x="20" y="30" width="130" height="180" rx="10" className="art-paper" />
      <rect x="38" y="52" width="70" height="10" rx="5" className="art-ink" />
      <rect x="38" y="74" width="94" height="6" rx="3" className="art-line" />
      <rect x="38" y="88" width="80" height="6" rx="3" className="art-line" />
      <rect x="38" y="102" width="88" height="6" rx="3" className="art-line" />
      <rect x="38" y="126" width="56" height="8" rx="4" className="art-ink" />
      <rect x="38" y="144" width="94" height="6" rx="3" className="art-line" />
      <rect x="38" y="158" width="72" height="6" rx="3" className="art-line" />
      <rect x="38" y="172" width="86" height="6" rx="3" className="art-line" />
      <path d="M158 124 C 168 108, 178 104, 190 112" className="art-arrow" />
      <path d="M180 104 l11 8 -11 6" className="art-arrow" />
      <rect x="200" y="56" width="140" height="170" rx="14" className="art-card" />
      <circle cx="238" cy="96" r="18" className="art-accent" />
      <rect x="264" y="84" width="58" height="9" rx="4.5" className="art-ink-light" />
      <rect x="264" y="100" width="42" height="6" rx="3" className="art-line-light" />
      <rect x="218" y="130" width="54" height="40" rx="6" className="art-tile" />
      <rect x="278" y="130" width="46" height="40" rx="6" className="art-tile" />
      <rect x="218" y="178" width="106" height="8" rx="4" className="art-line-light" />
      <rect x="218" y="194" width="76" height="8" rx="4" className="art-line-light" />
    </svg>
  );
}
