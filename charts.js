/* ==========================================================================
   ViewCast — chart renderers
   Hand-rolled inline SVG / CSS bars, no external chart library.
   Mark specs follow the dataviz skill: 2px lines, >=8px end markers, 4px
   rounded bar ends, hairline gridlines, one shared tooltip, direct labels
   used sparingly (endpoint + the milestone the story is about).
   ========================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgNode(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

/* ---------- formatting ---------- */
function formatCompact(n) {
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n >= 1e9) return sign + trimZero((n / 1e9).toFixed(n >= 1e10 ? 0 : 1)) + 'B';
  if (n >= 1e6) return sign + trimZero((n / 1e6).toFixed(n >= 1e7 ? 0 : 1)) + 'M';
  if (n >= 1e3) return sign + trimZero((n / 1e3).toFixed(n >= 1e4 ? 0 : 1)) + 'K';
  return sign + Math.round(n).toLocaleString();
}
function trimZero(s) { return s.replace(/\.0$/, ''); }
function formatPercent(x, digits = 1) { return (x * 100).toFixed(digits) + '%'; }
function formatDateShort(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ---------- shared tooltip ---------- */
function getTooltipEl() {
  let t = document.getElementById('chart-tooltip');
  if (!t) {
    t = document.createElement('div');
    t.id = 'chart-tooltip';
    t.className = 'chart-tooltip';
    document.body.appendChild(t);
  }
  return t;
}
function showTooltip(x, y, html) {
  const t = getTooltipEl();
  t.innerHTML = html;
  t.style.left = (x + 14) + 'px';
  t.style.top = (y + 14) + 'px';
  t.classList.add('show');
}
function hideTooltip() { getTooltipEl().classList.remove('show'); }

/* ---------- scale helper ---------- */
function scaleLinear(domain, range) {
  const [d0, d1] = domain, [r0, r1] = range;
  return (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
}

/* ==========================================================================
   Growth chart: single-series (views) line + confidence band across
   checkpoints, evenly spaced on x (these are fixed named checkpoints, not
   a continuous time axis).
   ========================================================================== */
function renderGrowthChart(container, checkpoints, opts = {}) {
  container.innerHTML = '';
  const w = opts.width || 640, h = opts.height || 260;
  const pad = { l: 46, r: 16, t: 16, b: 28 };
  const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
  const color = opts.color || getComputedStyle(document.documentElement).getPropertyValue('--series-views').trim() || '#2a78d6';

  const maxY = Math.max(...checkpoints.map(c => c.high)) * 1.06;
  const x = scaleLinear([0, checkpoints.length - 1], [pad.l, pad.l + plotW]);
  const y = scaleLinear([0, maxY], [pad.t + plotH, pad.t]);

  const svg = svgNode('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', height: h, role: 'img', 'aria-label': 'Predicted view growth over time' });

  // gridlines (4 horizontal ticks)
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const val = (maxY / ticks) * i;
    const gy = y(val);
    svg.appendChild(svgNode('line', { x1: pad.l, x2: pad.l + plotW, y1: gy, y2: gy, stroke: 'var(--hairline)', 'stroke-width': 1 }));
    const label = svgNode('text', { x: pad.l - 8, y: gy + 4, 'text-anchor': 'end', 'font-size': 10.5, fill: 'var(--muted)' });
    label.textContent = formatCompact(val);
    svg.appendChild(label);
  }

  // confidence band
  const topPts = checkpoints.map((c, i) => `${x(i)},${y(c.high)}`).join(' ');
  const botPts = checkpoints.slice().reverse().map((c, i) => `${x(checkpoints.length - 1 - i)},${y(c.low)}`).join(' ');
  svg.appendChild(svgNode('polygon', { points: `${topPts} ${botPts}`, fill: 'var(--band-fill)', stroke: 'none' }));

  // main line
  const linePts = checkpoints.map((c, i) => `${x(i)},${y(c.views)}`).join(' ');
  svg.appendChild(svgNode('polyline', { points: linePts, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  // x-axis labels + markers
  checkpoints.forEach((c, i) => {
    const cx = x(i), cy = y(c.views);
    const label = svgNode('text', { x: cx, y: h - 6, 'text-anchor': 'middle', 'font-size': 10.5, fill: 'var(--muted)' });
    label.textContent = c.label;
    svg.appendChild(label);

    const isMilestone = c.label === '7d' || i === checkpoints.length - 1;
    const r = isMilestone ? 5 : 4;
    const dot = svgNode('circle', { cx, cy, r, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 });
    svg.appendChild(dot);

    if (isMilestone) {
      const vlabel = svgNode('text', {
        x: cx, y: cy - 12, 'text-anchor': i === checkpoints.length - 1 ? 'end' : 'middle',
        'font-size': 11.5, 'font-weight': 650, fill: 'var(--ink)',
      });
      vlabel.textContent = formatCompact(c.views);
      svg.appendChild(vlabel);
    }

    // hit target for hover
    const hit = svgNode('circle', { cx, cy, r: 12, fill: 'transparent', style: 'cursor:pointer' });
    hit.addEventListener('mousemove', (e) => {
      showTooltip(e.clientX, e.clientY,
        `<strong>${c.label}</strong> since publish<br>${formatCompact(c.views)} views (range ${formatCompact(c.low)}–${formatCompact(c.high)})<br>${formatCompact(c.likes)} likes · ${formatCompact(c.comments)} comments`);
    });
    hit.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(hit);
  });

  container.appendChild(svg);
}

/* ==========================================================================
   Sparkline: small single-series trend line for stat tiles.
   ========================================================================== */
function renderSparkline(container, points, color, opts = {}) {
  container.innerHTML = '';
  const w = opts.width || 120, h = opts.height || 34;
  const maxY = Math.max(...points) * 1.08 || 1;
  const x = scaleLinear([0, points.length - 1], [2, w - 2]);
  const y = scaleLinear([0, maxY], [h - 3, 3]);
  const svg = svgNode('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h });
  const pts = points.map((p, i) => `${x(i)},${y(p)}`).join(' ');
  svg.appendChild(svgNode('polyline', { points: pts, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const lastX = x(points.length - 1), lastY = y(points[points.length - 1]);
  svg.appendChild(svgNode('circle', { cx: lastX, cy: lastY, r: 4, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 }));
  container.appendChild(svg);
}

/* ==========================================================================
   Score gauge: circular arc 0-100, colored by evaluative tone (status
   palette — this is a state, not a series identity).
   ========================================================================== */
function toneColor(tone) {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--' + tone).trim();
  return v || '#0ca30c';
}
function renderGauge(container, score, tone, opts = {}) {
  container.innerHTML = '';
  const size = opts.size || 108;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, score / 100));
  const svg = svgNode('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': `Performance score ${score} of 100` });
  svg.appendChild(svgNode('circle', { cx, cy, r, fill: 'none', stroke: 'var(--hairline)', 'stroke-width': stroke }));
  const arc = svgNode('circle', {
    cx, cy, r, fill: 'none', stroke: toneColor(tone), 'stroke-width': stroke,
    'stroke-linecap': 'round',
    'stroke-dasharray': `${circumference * frac} ${circumference}`,
    transform: `rotate(-90 ${cx} ${cy})`,
  });
  svg.appendChild(arc);
  container.appendChild(svg);
}

/* ==========================================================================
   Bar-compare: "this video" vs benchmark rows, plain HTML/CSS bars.
   rows: [{ label, value, display, accent }]
   ========================================================================== */
function renderBarCompare(container, rows, opts = {}) {
  container.innerHTML = '';
  const max = Math.max(...rows.map(r => r.value)) * 1.15 || 1;
  rows.forEach((row) => {
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '12px';
    const top = document.createElement('div');
    top.style.cssText = 'display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;';
    top.innerHTML = `<span style="color:var(--ink-2)">${row.label}</span><span style="font-weight:650;color:var(--ink)">${row.display}</span>`;
    wrap.appendChild(top);
    const track = document.createElement('div');
    track.style.cssText = 'height:10px;border-radius:6px;background:var(--surface-2);overflow:hidden;';
    const fill = document.createElement('div');
    const pct = Math.max(2, (row.value / max) * 100);
    fill.style.cssText = `height:100%;width:${pct}%;border-radius:6px;background:${row.accent ? 'var(--series-views)' : 'var(--baseline)'};`;
    track.appendChild(fill);
    wrap.appendChild(track);
    container.appendChild(wrap);
  });
}

/* ==========================================================================
   Multi-series growth overlay (History "compare selected"). Capped at 3
   series by the caller — the categorical palette's first 3 slots are the
   ones validated for all-pairs CVD separation.
   ========================================================================== */
function renderMultiGrowthChart(container, series, opts = {}) {
  container.innerHTML = '';
  const w = opts.width || 640, h = opts.height || 260;
  const pad = { l: 46, r: 16, t: 16, b: 28 };
  const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
  const n = series[0].checkpoints.length;
  const maxY = Math.max(...series.flatMap(s => s.checkpoints.map(c => c.views))) * 1.08;
  const x = scaleLinear([0, n - 1], [pad.l, pad.l + plotW]);
  const y = scaleLinear([0, maxY], [pad.t + plotH, pad.t]);

  const svg = svgNode('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', height: h });
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const val = (maxY / ticks) * i;
    const gy = y(val);
    svg.appendChild(svgNode('line', { x1: pad.l, x2: pad.l + plotW, y1: gy, y2: gy, stroke: 'var(--hairline)', 'stroke-width': 1 }));
    const label = svgNode('text', { x: pad.l - 8, y: gy + 4, 'text-anchor': 'end', 'font-size': 10.5, fill: 'var(--muted)' });
    label.textContent = formatCompact(val);
    svg.appendChild(label);
  }
  series[0].checkpoints.forEach((c, i) => {
    const label = svgNode('text', { x: x(i), y: h - 6, 'text-anchor': 'middle', 'font-size': 10.5, fill: 'var(--muted)' });
    label.textContent = c.label;
    svg.appendChild(label);
  });

  series.forEach((s) => {
    const pts = s.checkpoints.map((c, i) => `${x(i)},${y(c.views)}`).join(' ');
    svg.appendChild(svgNode('polyline', { points: pts, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    s.checkpoints.forEach((c, i) => {
      const cx = x(i), cy = y(c.views);
      const dot = svgNode('circle', { cx, cy, r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2 });
      const hit = svgNode('circle', { cx, cy, r: 10, fill: 'transparent', style: 'cursor:pointer' });
      hit.addEventListener('mousemove', (e) => showTooltip(e.clientX, e.clientY, `<strong>${s.label}</strong><br>${c.label}: ${formatCompact(c.views)} views`));
      hit.addEventListener('mouseleave', hideTooltip);
      svg.appendChild(dot);
      svg.appendChild(hit);
    });
  });

  container.appendChild(svg);
}

/* ==========================================================================
   Histogram: score distribution across prediction history (single hue,
   sequential — magnitude, not identity).
   ========================================================================== */
function renderHistogram(container, values, opts = {}) {
  container.innerHTML = '';
  const w = opts.width || 640, h = opts.height || 180;
  const pad = { l: 34, r: 10, t: 12, b: 26 };
  const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
  const binSize = 10;
  const bins = new Array(10).fill(0); // 0-10,...,90-100
  values.forEach(v => { const idx = Math.min(9, Math.floor(v / binSize)); bins[idx]++; });
  const maxCount = Math.max(...bins, 1);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--series-views').trim() || '#2a78d6';

  const svg = svgNode('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', height: h });
  const barW = Math.min(30, plotW / bins.length - 6);
  const x = scaleLinear([0, bins.length], [pad.l, pad.l + plotW]);
  const y = scaleLinear([0, maxCount], [pad.t + plotH, pad.t]);

  svg.appendChild(svgNode('line', { x1: pad.l, x2: pad.l + plotW, y1: pad.t + plotH, y2: pad.t + plotH, stroke: 'var(--baseline)', 'stroke-width': 1 }));

  bins.forEach((count, i) => {
    const slotCenter = x(i) + (plotW / bins.length) / 2;
    const bx = slotCenter - barW / 2;
    const by = y(count);
    const bh = (pad.t + plotH) - by;
    if (count > 0) {
      const rect = svgNode('rect', { x: bx, y: by, width: barW, height: Math.max(bh, 2), rx: 4, fill: color });
      rect.addEventListener('mousemove', (e) => showTooltip(e.clientX, e.clientY, `<strong>${i * 10}-${i * 10 + 9}</strong> score<br>${count} video${count === 1 ? '' : 's'}`));
      rect.addEventListener('mouseleave', hideTooltip);
      svg.appendChild(rect);
    }
    if (i % 2 === 0) {
      const label = svgNode('text', { x: slotCenter, y: h - 8, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--muted)' });
      label.textContent = i * 10;
      svg.appendChild(label);
    }
  });

  container.appendChild(svg);
}
