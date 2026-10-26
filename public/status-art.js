// Small animated drawings for the status cards: a happy drop when all is well, a sad one when there is no water and a
// drop with a ticking clock while an outage is coming. They are plain SVG moved by CSS, so they stay sharp, cost almost
// nothing and stop moving for people who asked their device to reduce motion.
const DROP = 'M40 9C40 9 17 33 17 49a23 23 0 0 0 46 0C63 33 40 9 40 9z';
const SHINE = 'M40 9C40 9 17 33 17 49a23 23 0 0 0 4 13C21 40 40 9 40 9z';

const ART = {
  ok: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" class="art art-ok" aria-hidden="true">
  <g class="art-bob">
    <path d="${DROP}" fill="#2f9bff"/>
    <path d="${SHINE}" fill="#8fd3ff" opacity=".55"/>
    <circle cx="32" cy="48" r="3.2" fill="#0b2a4a"/><circle cx="48" cy="48" r="3.2" fill="#0b2a4a"/>
    <circle cx="31" cy="46.8" r="1" fill="#fff"/><circle cx="47" cy="46.8" r="1" fill="#fff"/>
    <path d="M31 56q9 9 18 0" fill="none" stroke="#0b2a4a" stroke-width="3" stroke-linecap="round"/>
    <circle cx="25.5" cy="55" r="3.6" fill="#ff8fa3" opacity=".65"/><circle cx="54.5" cy="55" r="3.6" fill="#ff8fa3" opacity=".65"/>
  </g>
  <circle class="bubble b1" cx="68" cy="58" r="3" fill="#8fd3ff"/>
  <circle class="bubble b2" cx="11" cy="52" r="2.2" fill="#8fd3ff"/>
  <circle class="bubble b3" cx="70" cy="40" r="1.8" fill="#8fd3ff"/>
  <path class="spark s1" d="M66 12l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="#ffd60a"/>
  <path class="spark s2" d="M12 20l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#ffd60a"/>
</svg>`,
  bad: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" class="art art-bad" aria-hidden="true">
  <g class="art-droop">
    <path d="${DROP}" fill="#b9c7da"/>
    <path d="${SHINE}" fill="#e3ebf5" opacity=".7"/>
    <path d="M25 44.5L35 41M55 44.5L45 41" stroke="#4a5568" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="32" cy="50" r="3.2" fill="#2d3748"/><circle cx="48" cy="50" r="3.2" fill="#2d3748"/>
    <path d="M32 63q8-7 16 0" fill="none" stroke="#2d3748" stroke-width="3" stroke-linecap="round"/>
  </g>
  <path class="tear" d="M27 54c0 0-3.6 4.6-3.6 7a3.6 3.6 0 0 0 7.2 0c0-2.4-3.6-7-3.6-7z" fill="#5ac8fa"/>
</svg>`,
  warn: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" class="art art-warn" aria-hidden="true">
  <g class="art-bob">
    <path d="${DROP}" fill="#6cb4ff"/>
    <path d="${SHINE}" fill="#b6dcff" opacity=".6"/>
    <circle cx="31" cy="47" r="3" fill="#0b2a4a"/><circle cx="46" cy="47" r="3" fill="#0b2a4a"/>
    <circle cx="32" cy="46" r="1" fill="#fff"/><circle cx="47" cy="46" r="1" fill="#fff"/>
    <path d="M30 57q6 3 12 0" fill="none" stroke="#0b2a4a" stroke-width="2.6" stroke-linecap="round"/>
  </g>
  <circle cx="60" cy="58" r="14" fill="#fff" stroke="#1d1d1f" stroke-width="2.6"/>
  <path d="M60 47.5v2.2M60 66.3v2.2M49.5 58h2.2M68.3 58h2.2" stroke="#1d1d1f" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M60 58l-4-3" stroke="#1d1d1f" stroke-width="2.4" stroke-linecap="round"/>
  <path class="hand" d="M60 58V49" stroke="#ff9500" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="60" cy="58" r="2" fill="#1d1d1f"/>
</svg>`,
};

export function statusArt(tone) {
  const markup = ART[tone] ?? ART.ok;
  const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  return document.importNode(svg, true);
}
