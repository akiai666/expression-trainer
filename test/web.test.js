const assert = require('assert');
const fs = require('fs');
const path = require('path');

function test(name, fn) {
  Promise.resolve().then(fn).then(() => console.log(`PASS ${name}`)).catch(error => {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  });
}

const root = path.join(__dirname, '..');

test('web lexicon returns non-overlapping realtime spans and emotion feedback', () => {
  const { createAnalyzer } = require('../web/lexicon');
  const analyze = createAnalyzer({
    fillers: ['就是', '然后'],
    hedges: ['我觉得', '可能'],
    vagueToPrecise: { 很好: ['出色', '清晰', '具体'] },
    emotions: { 示例词: { category: '示例', subcategory: 'XX', intensity: 9 } }
  });
  const result = analyze('我觉得就是然后很好可能示例词');
  assert.strictEqual(result.fillers.length, 2);
  assert.strictEqual(result.hedges.length, 2);
  assert.strictEqual(result.vagueWords.length, 1);
  assert.strictEqual(result.emotionWords.length, 1);
  assert.ok(result.suggestions.some(item => item.type === 'emotion' && item.message.includes('示例词')));
  assert.ok(result.spans.every((span, index, spans) => index === 0 || spans[index - 1].end <= span.start));
});

test('web lexicon filters exaggerated alternatives', () => {
  const { createAnalyzer } = require('../web/lexicon');
  const analyze = createAnalyzer({ fillers: [], hedges: [], vagueToPrecise: { 厉害: ['清晰', '无敌', '碾压级'] }, emotions: {} });
  assert.deepStrictEqual(analyze('厉害').vagueWords[0].alternatives, ['清晰']);
});

test('web lexicon falls back when the server returns an HTML shell for the missing local asset', async () => {
  const { load } = require('../web/lexicon');
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async url => {
    calls.push(url);
    if (url === 'lexicon-data.local.json') {
      return { ok: true, json: async () => { throw new SyntaxError('Unexpected token <'); } };
    }
    return { ok: true, json: async () => ({ fillers: ['就是'], hedges: [], vagueToPrecise: {}, emotions: {} }) };
  };
  try {
    const analyze = await load();
    assert.strictEqual(analyze('就是').fillers.length, 1);
    assert.deepStrictEqual(calls, ['lexicon-data.local.json', 'lexicon-data.json']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('web history stores newest records and updates by id', () => {
  const { createHistoryStore } = require('../web/history');
  const data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  const history = createHistoryStore(storage, 'test-history');
  const first = history.save({ title: '第一次', transcript: '一' });
  history.save({ id: first.id, createdAt: first.createdAt, title: '第一次更新', transcript: '一二' });
  const second = history.save({ title: '第二次', transcript: '二' });
  assert.strictEqual(history.list()[0].id, second.id);
  assert.strictEqual(history.get(first.id).title, '第一次更新');
  assert.strictEqual(history.delete(first.id), true);
  assert.strictEqual(history.get(first.id), null);
});

test('web UI exposes personal history and structured exports without upstream tracking', () => {
  const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.match(html, /训练历史/);
  assert.match(html, /情绪词（本地可选）/);
  assert.match(html, /ir\.dlut\.edu\.cn\/info\/1013\/1142\.htm/);
  assert.match(html, /导出 HTML/);
  assert.match(html, /report-renderer\.js/);
  assert.doesNotMatch(html + app, /posthog|cola-dispatch|宇宙无敌|fxy2311-youyou/i);
  assert.match(app, /webkitSpeechRecognition/);
  assert.match(app, /analyzeCurrentSentence/);
  assert.match(app, /saveCurrentTraining/);
});
