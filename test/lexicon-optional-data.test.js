const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lexicon = require('../lib/lexicon');

const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expression-lexicon-empty-'));
lexicon.loadLexicon({ dataDir: emptyDir });
let stats = lexicon.getLexiconStats();
assert.strictEqual(stats.emotionWords, 0);
assert.strictEqual(stats.dlutLoaded, false);
assert.ok(stats.fillerWords > 0);
assert.ok(lexicon.analyzeText('我觉得这个方案很好').vagueWords.length > 0);

const localDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expression-lexicon-local-'));
fs.writeFileSync(path.join(localDir, 'dlut-emotion-ontology.csv'), [
  '词语,词性种类,词义数,词义序号,情感分类,强度,极性,辅助情感分类,强度,极性',
  '测试情绪词,adj,1,1,PH,7,1,,,',
  '示例短语,带逗号,idiom,1,1,PH,7,1,,,'
].join('\n'));

lexicon.loadLexicon({ dataDir: localDir });
stats = lexicon.getLexiconStats();
assert.strictEqual(stats.emotionWords, 2);
assert.strictEqual(stats.dlutLoaded, true);
assert.ok(lexicon.analyzeText('这是测试情绪词').emotionWords.some(item => item.word === '测试情绪词'));
assert.ok(lexicon.analyzeText('示例短语,带逗号').emotionWords.some(item => item.word === '示例短语,带逗号'));

console.log('PASS DLUT data is optional and only loaded from a local file');
