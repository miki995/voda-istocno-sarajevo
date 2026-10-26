const WIDTH = 1080;
const HEIGHT = 1350;
const MARGIN = 64;
const FONT = '"SF Pro Display", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MAX_AREAS = 3;

function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let shortened = text;
  while (shortened.length > 1 && ctx.measureText(`${shortened}…`).width > maxWidth) shortened = shortened.slice(0, -1);
  return `${shortened.trimEnd()}…`;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

// Draws the plan of one day as a picture that can be posted on a story or in a group chat.
export function renderPlanImage({ title, day, items, footer, more }) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  const inner = WIDTH - MARGIN * 2;

  const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  background.addColorStop(0, '#e8f2ff');
  background.addColorStop(1, '#ffffff');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#0071e3';
  ctx.font = `600 38px ${FONT}`;
  ctx.fillText(title.toUpperCase(), MARGIN, 120);
  ctx.fillStyle = '#1d1d1f';
  ctx.font = `700 78px ${FONT}`;
  ctx.fillText(fit(ctx, day, inner), MARGIN, 216);

  const footerHeight = 150;
  const gap = 24;
  let y = 276;
  const available = HEIGHT - footerHeight - y;
  const rows = items.map(item => ({ item, areas: item.areas.slice(0, MAX_AREAS), extra: Math.max(0, item.areas.length - MAX_AREAS) }));
  const natural = rows.map(row => 150 + (row.areas.length + (row.extra ? 1 : 0)) * 46);
  const scale = Math.min(1, (available - gap * (rows.length - 1)) / natural.reduce((total, height) => total + height, 0));

  rows.forEach((row, index) => {
    const height = natural[index] * scale;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.10)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, MARGIN, y, inner, height, 36);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = row.item.color;
    roundRect(ctx, MARGIN, y, 18, height, 9);
    ctx.fill();

    ctx.fillStyle = '#1d1d1f';
    ctx.font = `700 ${Math.round(52 * Math.max(scale, 0.8))}px ${FONT}`;
    ctx.fillText(row.item.zone, MARGIN + 54, y + 74 * Math.max(scale, 0.8));
    ctx.textAlign = 'right';
    ctx.fillStyle = row.item.color;
    ctx.fillText(fit(ctx, row.item.window, inner * 0.6), MARGIN + inner - 40, y + 74 * Math.max(scale, 0.8));
    ctx.textAlign = 'left';

    ctx.fillStyle = '#515154';
    ctx.font = `400 ${Math.round(32 * Math.max(scale, 0.85))}px ${FONT}`;
    let lineY = y + 128 * Math.max(scale, 0.8);
    for (const area of row.areas) {
      ctx.fillText(fit(ctx, area, inner - 110), MARGIN + 54, lineY);
      lineY += 46 * Math.max(scale, 0.85);
    }
    if (row.extra) {
      ctx.fillStyle = '#86868b';
      ctx.fillText(more(row.extra), MARGIN + 54, lineY);
    }
    y += height + gap;
  });

  ctx.fillStyle = '#86868b';
  ctx.font = `500 34px ${FONT}`;
  ctx.fillText(fit(ctx, footer, inner), MARGIN, HEIGHT - 70);

  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('no image'))), 'image/png'));
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
