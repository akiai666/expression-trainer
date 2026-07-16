const assert = require('assert');
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

lexicon.loadLexicon();

test('loads the complete DLUT emotion ontology', () => {
  assert.strictEqual(typeof lexicon.getLexiconStats, 'function');
  const stats = lexicon.getLexiconStats();
  assert.ok(stats.emotionWords >= 27315);
  assert.strictEqual(stats.malformedRows, 0);
  assert.ok(stats.fillerWords >= 25);
  assert.ok(stats.hedgeWords >= 19);
});

test('detects a DLUT word missing from the curated subset', () => {
  const result = lexicon.analyzeText('他面对困难时无所畏惧');
  const item = result.emotionWords.find(entry => entry.word === '无所畏惧');
  assert.ok(item);
  assert.strictEqual(item.category, '好');
  assert.strictEqual(item.subcategory, 'PH');
  assert.strictEqual(item.intensity, 7);
  assert.strictEqual(item.polarity, 1);
});

test('creates visible feedback for detected emotion words', () => {
  const result = lexicon.analyzeText('他面对困难时无所畏惧');
  const suggestion = result.suggestions.find(entry => entry.type === 'emotion' && entry.word === '无所畏惧');
  assert.ok(suggestion);
  assert.strictEqual(suggestion.message, '情绪词：「无所畏惧」好/PH · 强度7');
});

test('preserves DLUT entries whose source word contains a comma', () => {
  const result = lexicon.analyzeText('眉头一皱,计上心头');
  assert.ok(result.emotionWords.some(entry => entry.word === '眉头一皱,计上心头'));
});

test('merges the tiered oral vocabulary and filters exaggerated alternatives', () => {
  const result = lexicon.analyzeText('这个方案很好，超级厉害');
  const vague = result.vagueWords.find(entry => entry.word === '超级');
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
