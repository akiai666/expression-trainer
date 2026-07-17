const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { OFFICIAL_PAGE, validateDlutCsv, installDlutCsv } = require('../scripts/setup-dlut-data');

assert.strictEqual(OFFICIAL_PAGE, 'https://ir.dlut.edu.cn/info/1013/1142.htm');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dlut-setup-'));
const valid = path.join(temp, 'source.csv');
fs.writeFileSync(valid, [
  '词语,词性种类,词义数,词义序号,情感分类,强度,极性',
  '测试词,adj,1,1,PA,5,1'
].join('\n'));
assert.deepStrictEqual(validateDlutCsv(valid), { rows: 1 });

const target = path.join(temp, 'data', 'dlut-emotion-ontology.csv');
assert.strictEqual(installDlutCsv(valid, target), target);
assert.strictEqual(fs.readFileSync(target, 'utf8'), fs.readFileSync(valid, 'utf8'));
assert.strictEqual(installDlutCsv(target, target), target);

const invalid = path.join(temp, 'invalid.csv');
fs.writeFileSync(invalid, 'word,value\nfoo,bar');
assert.throws(() => validateDlutCsv(invalid), /格式不符合/);

console.log('PASS setup script validates a user-downloaded official CSV');
