const assert = require('assert');
const { createLatestOnlyRunner } = require('../web/runtime');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

(async () => {
  const first = deferred();
  const second = deferred();
  const applied = [];
  const runner = createLatestOnlyRunner(
    text => text === '旧文本' ? first.promise : second.promise,
    (text, result) => applied.push({ text, result })
  );

  const oldRun = runner.run('旧文本');
  const newRun = runner.run('新文本');
  second.resolve({ spans: [{ start: 0, end: 1, type: 'filler' }] });
  await newRun;
  first.resolve({ spans: [] });
  await oldRun;
  assert.deepStrictEqual(applied, [{
    text: '新文本',
    result: { spans: [{ start: 0, end: 1, type: 'filler' }] }
  }]);

  const pending = deferred();
  const ignored = [];
  const invalidated = createLatestOnlyRunner(() => pending.promise, value => ignored.push(value));
  const run = invalidated.run('停止前文本');
  invalidated.invalidate();
  pending.resolve({ spans: [] });
  await run;
  assert.deepStrictEqual(ignored, []);

  console.log('PASS web preview only applies the latest analysis result');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
