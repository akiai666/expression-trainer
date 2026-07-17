const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
const forbidden = [
  'data/dlut-emotion-ontology.csv',
  'data/emotion-lexicon.json',
  'data/tiered-lexicon.json',
  'web/lexicon-data.local.json'
];

forbidden.forEach(file => {
  assert.ok(!tracked.includes(file), `${file} 不应被 Git 跟踪`);
});

const readme = read('README.md');
assert.match(readme, /代码：MIT License/);
assert.match(readme, /仅供科研及教学使用，不包含在 MIT 授权范围内/);
assert.match(readme, /徐琳宏, 林鸿飞, 潘宇, 任惠, 陈建美/);

const dataLicense = read('DATA_LICENSE.md');
const notices = read('THIRD_PARTY_NOTICES.md');
assert.match(dataLicense, /不属于 MIT License/);
assert.match(notices, /https:\/\/ir\.dlut\.edu\.cn\/info\/1013\/1142\.htm/);

const publicLexicon = JSON.parse(read('web/lexicon-data.json'));
assert.deepStrictEqual(publicLexicon.emotions, {});
assert.ok(Buffer.byteLength(JSON.stringify(publicLexicon)) < 200000);

console.log('PASS public repository excludes DLUT source and derivative datasets');
