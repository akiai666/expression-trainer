const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lexicon = require('../lib/lexicon');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const safeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expression-safe-lexicon-'));
lexicon.loadLexicon({ dataDir: safeDataDir });

test('loads the public oral rules without restricted data', () => {
  assert.strictEqual(typeof lexicon.getLexiconStats, 'function');
  const stats = lexicon.getLexiconStats();
  assert.strictEqual(stats.emotionWords, 0);
  assert.strictEqual(stats.dlutLoaded, false);
  assert.strictEqual(stats.malformedRows, 0);
  assert.ok(stats.fillerWords > 0);
  assert.ok(stats.hedgeWords > 0);
});

test('filters exaggerated alternatives from the built-in oral vocabulary', () => {
  const result = lexicon.analyzeText('这个方案很好');
  const vague = result.vagueWords.find(entry => entry.word === '很好');
  assert.ok(vague);
  assert.ok(vague.alternatives.length > 0);
  assert.ok(!vague.alternatives.some(word => ['无敌', '碾压级', '毁灭性', '史诗级'].includes(word)));
});

test('returns character counts and non-overlapping highlight spans', () => {
  const result = lexicon.analyzeText('我觉得这个方案很好');
  assert.strictEqual(result.charCount, 9);
  assert.ok(result.tokenCount > 0);
  for (let i = 1; i < result.spans.length; i += 1) {
    assert.ok(result.spans[i - 1].end <= result.spans[i].start);
  }
});
