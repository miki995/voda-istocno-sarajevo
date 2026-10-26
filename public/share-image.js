const WIDTH = 1080;
const HEIGHT = 1350;
const MARGIN = 64;
const LABEL_WIDTH = 210;
const GAP = 14;
const FONT = '"SF Pro Display", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let shortened = text;
  while (shortened.length > 1 && ctx.measureText(`${shortened}…`).width > maxWidth) shortened = shortened.slice(0, -1);
  return `${shortened.trimEnd()}…`;
}

// The week grid (one row per day, one column per zone) as a picture for a story or a group chat.
export function renderWeekImage({ title, heading, heads, rows, footer }) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  const columnWidth = (WIDTH - MARGIN * 2 - LABEL_WIDTH - GAP * heads.length) / heads.length;

  const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  background.addColorStop(0, '#e8f2ff');
  background.addColorStop(1, '#ffffff');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#0071e3';
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText(fit(ctx, title.toUpperCase(), WIDTH - MARGIN * 2), MARGIN, 118);
  ctx.fillStyle = '#1d1d1f';
  ctx.font = `700 78px ${FONT}`;
  ctx.fillText(fit(ctx, heading, WIDTH - MARGIN * 2), MARGIN, 214);

  const headTop = 262;
  heads.forEach((head, index) => {
    const x = MARGIN + LABEL_WIDTH + GAP + index * (columnWidth + GAP);
    ctx.fillStyle = head.color;
    roundRect(ctx, x, headTop, columnWidth, 64, 18);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 34px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(head.label, x + columnWidth / 2, headTop + 44);
    ctx.textAlign = 'left';
  });

  const top = headTop + 64 + GAP;
  const bottom = HEIGHT - 140;
  const rowHeight = (bottom - top - GAP * (rows.length - 1)) / rows.length;
  rows.forEach((row, rowIndex) => {
    const y = top + rowIndex * (rowHeight + GAP);
    ctx.fillStyle = '#1d1d1f';
    ctx.font = `700 32px ${FONT}`;
    ctx.fillText(fit(ctx, row.day, LABEL_WIDTH - 12), MARGIN, y + rowHeight / 2 - 2);
    ctx.fillStyle = '#86868b';
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(row.date, MARGIN, y + rowHeight / 2 + 34);

    row.cells.forEach((windows, index) => {
      const x = MARGIN + LABEL_WIDTH + GAP + index * (columnWidth + GAP);
      ctx.fillStyle = windows.length > 0 ? '#ffffff' : 'rgba(0, 0, 0, 0.05)';
      ctx.shadowColor = windows.length > 0 ? 'rgba(0, 0, 0, 0.10)' : 'transparent';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;
      roundRect(ctx, x, y, columnWidth, rowHeight, 22);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.textAlign = 'center';
      ctx.fillStyle = windows.length > 0 ? '#1d1d1f' : '#86868b';
      ctx.font = `${windows.length > 0 ? 600 : 400} ${windows.length > 1 ? 29 : 31}px ${FONT}`;
      const lines = windows.length > 0 ? windows : ['–'];
      const lineHeight = 38;
      const firstLine = y + rowHeight / 2 - ((lines.length - 1) * lineHeight) / 2 + 11;
      lines.forEach((line, lineIndex) => ctx.fillText(line, x + columnWidth / 2, firstLine + lineIndex * lineHeight));
      ctx.textAlign = 'left';
    });
  });

  ctx.fillStyle = '#86868b';
  ctx.font = `500 34px ${FONT}`;
  ctx.fillText(fit(ctx, footer, WIDTH - MARGIN * 2), MARGIN, HEIGHT - 66);

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
