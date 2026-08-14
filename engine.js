/* ==========================================================================
   ViewCast — synthetic prediction engine
   ----------------------------------------------------------------------
   This is the ONE seam meant to be swapped for the real model later.
   Everything downstream (UI, charts, storage) consumes the plain object
   shape returned by getSyntheticPrediction() — keep that shape stable and
   point it at a real API response when the XGBoost model is ready.
   ========================================================================== */

/* ---------- Seeded RNG ---------- */
// FNV-1a style string hash -> 32-bit seed
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 PRNG — deterministic, fast, good-enough distribution for mock data
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function rngRange(rng, min, max) { return min + rng() * (max - min); }
function rngPick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function rngShuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- YouTube URL parsing ---------- */
function extractVideoId(input) {
  if (!input) return null;
  const s = input.trim();
  // bare 11-char id (YouTube ids are base64url-ish, 11 chars)
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const url = new URL(s.includes('://') ? s : 'https://' + s);
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.replace('/', '').split('/')[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    if (url.hostname.includes('youtube.com')) {
      if (url.searchParams.get('v') && /^[a-zA-Z0-9_-]{11}$/.test(url.searchParams.get('v'))) {
        return url.searchParams.get('v');
      }
      const parts = url.pathname.split('/').filter(Boolean);
      const markers = ['shorts', 'embed', 'live', 'v'];
      for (let i = 0; i < parts.length; i++) {
        if (markers.includes(parts[i]) && parts[i + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[i + 1])) {
          return parts[i + 1];
        }
      }
    }
  } catch (e) { /* not a URL, fall through */ }
  // last resort: pull any 11-char token out of the string
  const m = s.match(/[a-zA-Z0-9_-]{11}/);
  return m ? m[0] : null;
}

/* ---------- Metadata (real via oEmbed, synthetic fallback) ---------- */
const FAKE_TITLE_TEMPLATES = [
  'I Tried {X} For 30 Days — Here\'s What Happened',
  'The Truth About {X} Nobody Tells You',
  'How I {X} in Under a Week',
  '{X}: What I Wish I Knew Sooner',
  'Ranking Every {X} (Tier List)',
  'This {X} Changed Everything',
  '{X} Gone Wrong... Again',
  'Testing Viral {X} Hacks So You Don\'t Have To',
];
const FAKE_TOPICS = ['Budget Gear', 'Morning Routine', 'Side Hustle', 'Home Workout', 'Travel Hack',
  'Meal Prep', 'Study Method', 'Gaming Setup', 'Editing Trick', 'Productivity App'];
const FAKE_CHANNELS = ['Weekend Projects', 'North Star Studio', 'Everyday Uplift', 'The Sidebar', 'Clearview Media'];

function placeholderMeta(videoId) {
  const rng = mulberry32(hashSeed(videoId + '::meta'));
  const template = rngPick(rng, FAKE_TITLE_TEMPLATES);
  const topic = rngPick(rng, FAKE_TOPICS);
  return {
    title: template.replace('{X}', topic),
    author: rngPick(rng, FAKE_CHANNELS),
    thumbnail: null,
    real: false,
  };
}

async function fetchVideoMeta(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}&format=json`,
      { mode: 'cors' }
    );
    if (!res.ok) throw new Error('oEmbed ' + res.status);
    const data = await res.json();
    return {
      title: data.title || placeholderMeta(videoId).title,
      author: data.author_name || placeholderMeta(videoId).author,
      thumbnail: data.thumbnail_url || null,
      real: true,
    };
  } catch (e) {
    return placeholderMeta(videoId);
  }
}

/* ---------- Checkpoints ---------- */
const CHECKPOINTS = [
  { hours: 1, label: '1h' }, { hours: 3, label: '3h' }, { hours: 6, label: '6h' },
  { hours: 12, label: '12h' }, { hours: 24, label: '1d' }, { hours: 72, label: '3d' },
  { hours: 168, label: '7d' }, { hours: 336, label: '14d' }, { hours: 720, label: '30d' },
];

const TIP_POOL = [
  { icon: '🕒', text: 'Publishing between 5-8pm local time on Thu/Fri tends to catch the biggest slice of your audience online.' },
  { icon: '🏷️', text: 'Your title is missing a concrete number or outcome — specifics ("in 7 days", "5 mistakes") tend to lift click-through.' },
  { icon: '🖼️', text: 'Try a higher-contrast thumbnail — faces with clear expression and a 2-3 color palette read fastest at small sizes.' },
  { icon: '📌', text: 'Pin a comment in the first hour to seed engagement — early comment velocity is a strong early ranking signal.' },
  { icon: '🔁', text: 'Cross-post a short clip to Shorts/Reels in the first 24h — it compounds discovery while the algorithm is still evaluating the long-form.' },
  { icon: '✂️', text: 'Your first 15 seconds matters most for retention — consider trimming the intro before the hook lands.' },
  { icon: '🔗', text: 'Add end-screen links to your 2 best-performing related videos to lift session watch time.' },
  { icon: '💬', text: 'Ask a direct question in the outro — videos that end on a question see a measurable comment-rate lift.' },
  { icon: '🎯', text: 'Tighten your tags to 3-5 highly specific terms rather than broad category tags — specificity outperforms volume.' },
  { icon: '📊', text: 'Consider an A/B thumbnail test in the first 48h while view velocity is highest and signal arrives fastest.' },
  { icon: '📅', text: 'This topic tends to have a second growth wave around day 5-7 as it gets picked up by suggested/browse — don\'t judge day-1 numbers alone.' },
  { icon: '🗣️', text: 'Videos in this category with an on-camera cold open (no branded intro) show stronger day-1 retention in similar samples.' },
];

const SIMILAR_TITLE_TEMPLATES = [
  '{X}: My Honest Review After 30 Days',
  'I Tested {X} So You Don\'t Have To',
  'The {X} Setup That Actually Works',
  '{X} — Before vs After',
  'Why Everyone\'s Talking About {X}',
];

const CATEGORIES = [
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'education', label: 'Education' },
  { id: 'lifestyle', label: 'Lifestyle & Vlogs' },
  { id: 'tech', label: 'Tech Reviews' },
  { id: 'music', label: 'Music' },
];

/* ---------- Core generator ---------- */
function getSyntheticPrediction(videoId, opts = {}) {
  const category = opts.category || 'entertainment';
  const rng = mulberry32(hashSeed(videoId + '::predict::' + category));

  const baseVirality = rng();                          // 0-1, drives everything
  const magnitude = 2.9 + baseVirality * 4.3 + (rng() - 0.5) * 0.9; // ~log10 asymptotic views
  const vInf = Math.pow(10, magnitude);                 // ~800 .. ~40M
  const tau = 18 + (1 - baseVirality) * 90;             // hours to saturate; viral = faster

  const likeRate = rngRange(rng, 0.012, 0.062);
  const commentRate = rngRange(rng, 0.0006, 0.0048);

  const checkpoints = CHECKPOINTS.map((cp) => {
    const raw = vInf * (1 - Math.exp(-cp.hours / tau));
    const views = Math.max(1, Math.round(raw));
    const bandFrac = Math.min(0.55, 0.05 + 0.5 * (cp.hours / 720));
    const low = Math.round(views * (1 - bandFrac * 0.6));
    const high = Math.round(views * (1 + bandFrac));
    const likes = Math.round(views * likeRate);
    const comments = Math.round(views * commentRate);
    return { hours: cp.hours, label: cp.label, views, low, high, likes, comments };
  });

  const likeRateScore = Math.min(1, Math.max(0, (likeRate - 0.012) / (0.062 - 0.012)));
  const commentRateScore = Math.min(1, Math.max(0, (commentRate - 0.0006) / (0.0048 - 0.0006)));
  const score = Math.round(100 * Math.min(1, (0.62 * baseVirality + 0.24 * likeRateScore + 0.14 * commentRateScore)));

  let verdict, verdictTone;
  if (score >= 78) { verdict = 'Breakout potential — strong viral signals'; verdictTone = 'good'; }
  else if (score >= 58) { verdict = 'Solid performer — above-average trajectory'; verdictTone = 'good'; }
  else if (score >= 38) { verdict = 'Steady grower — typical trajectory'; verdictTone = 'warning'; }
  else if (score >= 20) { verdict = 'Slow burn — modest early signals'; verdictTone = 'serious'; }
  else { verdict = 'Niche reach — limited breakout signals'; verdictTone = 'critical'; }

  // engagement benchmarks
  const channelAvgLikeRate = rngRange(rng, 0.018, 0.038);
  const categoryAvgLikeRate = rngRange(rng, 0.02, 0.034);
  const channelAvgCommentRate = rngRange(rng, 0.0009, 0.0022);
  const categoryAvgCommentRate = rngRange(rng, 0.001, 0.002);

  // title / thumbnail checklist
  const titleLen = opts.titleLength || Math.round(rngRange(rng, 28, 82));
  const titleChecks = [];
  if (titleLen >= 40 && titleLen <= 70) {
    titleChecks.push({ state: 'good', label: 'Title length', detail: `${titleLen} characters — sits in the optimal 40-70 range.` });
  } else if (titleLen < 40) {
    titleChecks.push({ state: 'warn', label: 'Title length', detail: `${titleLen} characters — a little short, may be under-communicating the hook.` });
  } else {
    titleChecks.push({ state: 'warn', label: 'Title length', detail: `${titleLen} characters — risks truncation on mobile search results.` });
  }
  const thumbContrast = rngPick(rng, ['high', 'high', 'medium', 'low']);
  titleChecks.push({
    state: thumbContrast === 'high' ? 'good' : thumbContrast === 'medium' ? 'warn' : 'bad',
    label: 'Thumbnail contrast',
    detail: thumbContrast === 'high' ? 'Strong subject-to-background contrast — reads well at small sizes.'
      : thumbContrast === 'medium' ? 'Moderate contrast — consider brightening the focal subject.'
      : 'Low contrast — subject may blend into the background at thumbnail scale.',
  });
  const uploadTiming = rngPick(rng, ['good', 'good', 'warn']);
  titleChecks.push({
    state: uploadTiming,
    label: 'Upload timing',
    detail: uploadTiming === 'good' ? 'Publish window overlaps peak audience activity for this channel.'
      : 'Publish window is slightly outside this channel\'s typical peak-activity hours.',
  });
  const hookStrength = rngPick(rng, ['good', 'warn', 'good']);
  titleChecks.push({
    state: hookStrength,
    label: 'Opening hook (first 15s)',
    detail: hookStrength === 'good' ? 'Cold-open pacing detected — tends to correlate with stronger day-1 retention.'
      : 'Consider trimming any intro/branding before the hook to reduce early drop-off.',
  });

  // similar videos
  const similar = Array.from({ length: 4 }).map(() => {
    const t = rngPick(rng, SIMILAR_TITLE_TEMPLATES).replace('{X}', rngPick(rng, FAKE_TOPICS));
    const factor = rngRange(rng, 0.4, 1.8);
    return {
      title: t,
      category: rngPick(rng, CATEGORIES).label,
      views7d: Math.round(vInf * (1 - Math.exp(-168 / tau)) * factor),
    };
  }).sort((a, b) => b.views7d - a.views7d);

  const tips = rngShuffle(rng, TIP_POOL).slice(0, 4);

  return {
    videoId,
    category,
    generatedAt: new Date().toISOString(),
    baseVirality,
    score,
    verdict,
    verdictTone,
    checkpoints,
    engagement: {
      likeRate, commentRate,
      channelAvgLikeRate, categoryAvgLikeRate,
      channelAvgCommentRate, categoryAvgCommentRate,
    },
    checklist: titleChecks,
    similar,
    tips,
  };
}

const ENGINE = {
  hashSeed, mulberry32, rngRange, rngPick, rngShuffle,
  extractVideoId, fetchVideoMeta, placeholderMeta,
  getSyntheticPrediction, CHECKPOINTS, CATEGORIES,
};
