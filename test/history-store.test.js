'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHistoryStore } = require('../lib/history-store');

function withStore(fn) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expression-history-'));
  try {
    fn(createHistoryStore(directory), directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('creates an index and stores each full record in a separate JSON file', () => {
  withStore((store, root) => {
    const saved = store.save({
      id: 'training-1',
      createdAt: '2026-07-16T02:00:00.000Z',
      source: 'recording',
      transcript: '我觉得这个方案很好',
      stats: { duration: 30, charCount: 9 },
      report: { summary: '表达清楚' },
      summary: '表达清楚'
    });

    assert.strictEqual(saved.id, 'training-1');
    assert.ok(fs.existsSync(path.join(root, 'history', 'training-1.json')));
    const index = JSON.parse(fs.readFileSync(path.join(root, 'history', 'index.json'), 'utf8'));
    assert.strictEqual(index.version, 1);
    assert.strictEqual(index.records.length, 1);
    assert.strictEqual(index.records[0].hasReport, true);
    assert.strictEqual(Object.hasOwn(index.records[0], 'transcript'), false);
    assert.strictEqual(Object.hasOwn(index.records[0], 'report'), false);
  });
});

test('lists newest records first and updates an existing training in place', () => {
  withStore(store => {
    store.save({ id: 'older', createdAt: '2026-07-15T01:00:00.000Z', transcript: '旧记录' });
    store.save({ id: 'newer', createdAt: '2026-07-16T01:00:00.000Z', transcript: '新记录' });
    store.save({ id: 'older', report: { summary: '后来生成的报告' }, score: 82 });

    assert.deepStrictEqual(store.list().map(item => item.id), ['newer', 'older']);
    assert.strictEqual(store.get('older').transcript, '旧记录');
    assert.strictEqual(store.get('older').report.summary, '后来生成的报告');
    assert.strictEqual(store.list()[1].score, 82);
  });
});

test('deletes records and reports whether a record existed', () => {
  withStore(store => {
    store.save({ id: 'remove-me', transcript: '待删除' });
    assert.strictEqual(store.delete('remove-me'), true);
    assert.strictEqual(store.delete('remove-me'), false);
    assert.strictEqual(store.get('remove-me'), null);
    assert.deepStrictEqual(store.list(), []);
  });
});

test('ignores a corrupt record and repairs a corrupt index from valid files', () => {
  withStore((store, root) => {
    store.save({ id: 'valid-one', createdAt: '2026-07-16T03:00:00.000Z', transcript: '有效' });
    store.save({ id: 'broken-one', createdAt: '2026-07-16T04:00:00.000Z', transcript: '将损坏' });
    fs.writeFileSync(path.join(root, 'history', 'broken-one.json'), '{bad json', 'utf8');
    fs.writeFileSync(path.join(root, 'history', 'index.json'), '{bad index', 'utf8');

    assert.deepStrictEqual(store.list().map(item => item.id), ['valid-one']);
    assert.strictEqual(store.get('broken-one'), null);
    const repaired = JSON.parse(fs.readFileSync(path.join(root, 'history', 'index.json'), 'utf8'));
    assert.deepStrictEqual(repaired.records.map(item => item.id), ['valid-one']);
  });
});

test('rejects unsafe ids and never writes outside the history directory', () => {
  withStore((store, root) => {
    for (const id of ['../escape', '/tmp/escape', 'a/b', '', '.']) {
      assert.throws(() => store.save({ id, transcript: 'x' }), /Invalid history record id/);
      assert.throws(() => store.get(id), /Invalid history record id/);
      assert.throws(() => store.delete(id), /Invalid history record id/);
    }
    assert.strictEqual(fs.existsSync(path.join(root, 'escape.json')), false);
  });
});

test('atomic writes leave no temporary files behind', () => {
  withStore((store, root) => {
    store.save({ id: 'atomic-record', transcript: '完整内容' });
    const files = fs.readdirSync(path.join(root, 'history'));
    assert.strictEqual(files.some(file => file.endsWith('.tmp')), false);
  });
});
