const fs = require('fs');
const path = require('path');
const {
  FILLER_WORDS,
  HEDGE_WORDS,
  VAGUE_TO_PRECISE,
  BLOCKED_SUGGESTION_TERMS
} = require('../lib/lexicon');

const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data');
const webDir = path.join(root, 'web');
const categoryMap = {
  PA: '乐', PE: '乐', PD: '好', PH: '好', PG: '好', PB: '好', PK: '好',
  NA: '怒', NB: '哀', NJ: '哀', NH: '哀', PF: '哀', NI: '惧', NC: '惧', NG: '惧',
  NE: '恶', ND: '恶', NN: '恶', NK: '恶', NL: '恶', PC: '惊'
};
const parts = new Set(['adj', 'adv', 'idiom', 'noun', 'nw', 'prep', 'verb']);
const blocked = new Set(BLOCKED_SUGGESTION_TERMS);

function readJson(filename, fallback = {}) {
  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clean(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))]
    .filter(value => !blocked.has(value));
}

function mergeMap(target, source) {
  Object.entries(source || {}).forEach(([word, values]) => {
    const merged = clean([...(target[word] || []), ...values]);
    if (merged.length) target[word] = merged;
  });
}

function parseDlut() {
  const dlutPath = path.join(dataDir, 'dlut-emotion-ontology.csv');
  if (!fs.existsSync(dlutPath)) {
    throw new Error('未找到本地 DLUT CSV。请先运行 npm run setup:dlut');
  }
  const emotions = {};
  const rows = fs.readFileSync(dlutPath, 'utf8').split(/\r?\n/).slice(1);
  rows.forEach(line => {
    const columns = line.split(',').map(value => value.trim());
    const pos = columns.findIndex((value, index) => index > 0 && parts.has(value));
    if (pos < 1) return;
    const word = columns.slice(0, pos).join(',');
    const subcategory = columns[pos + 3];
    if (!word || !categoryMap[subcategory] || emotions[word]) return;
    emotions[word] = {
      category: categoryMap[subcategory],
      subcategory,
      intensity: Number(columns[pos + 4]) || 0,
      polarity: Number(columns[pos + 5]) || 0
    };
  });
  return emotions;
}

function buildLexicon(includeDlut = false) {
  const curated = includeDlut ? readJson('emotion-lexicon.json') : {};
  const tiered = includeDlut ? readJson('tiered-lexicon.json') : {};
  const emotions = includeDlut ? parseDlut() : {};
  if (includeDlut) Object.entries(curated.emotions || {}).forEach(([word, value]) => {
    if (!emotions[word]) emotions[word] = {
      category: value.category || '未知',
      subcategory: value.subcategory || '',
      intensity: Number(value.intensity) || 0,
      polarity: value.polarity === 'negative' ? 2 : value.polarity === 'positive' ? 1 : Number(value.polarity) || 0
    };
  });
  const vagueToPrecise = Object.fromEntries(Object.entries(VAGUE_TO_PRECISE).map(([word, values]) => [word, clean(values)]));
  if (includeDlut) {
    mergeMap(vagueToPrecise, curated.vagueToPrecise || curated.vagueToPresice || {});
    Object.values(tiered || {}).forEach(group => mergeMap(vagueToPrecise, group));
  }
  return {
    version: includeDlut ? (curated._meta?.version || 'dlut-local') : 'public-oral-1.0',
    fillers: [...new Set([...FILLER_WORDS, ...(curated.fillerWords || [])])],
    hedges: [...new Set([...HEDGE_WORDS, ...(curated.hedgeWords || [])])],
    vagueToPrecise,
    emotions
  };
}

function buildRenderer() {
  const source = fs.readFileSync(path.join(root, 'lib', 'report-renderer.js'), 'utf8');
  return source.replace('module.exports = {', 'globalThis.ReportRenderer = {');
}

const includeDlut = process.argv.includes('--with-dlut');
const lexiconTarget = includeDlut ? 'lexicon-data.local.json' : 'lexicon-data.json';
fs.writeFileSync(path.join(webDir, lexiconTarget), JSON.stringify(buildLexicon(includeDlut)));
fs.writeFileSync(path.join(webDir, 'report-renderer.js'), buildRenderer());
console.log(`Built ${includeDlut ? 'local DLUT' : 'public oral'} web lexicon and report renderer`);
