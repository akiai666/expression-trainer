const assert = require('assert');
const {
  getSpeechRecognition,
  getSpeechErrorMessage,
  getAIStatus,
  buildLocalFeedback,
  createSpeechController
} = require('../web/runtime');

function FakeRecognition() {}

assert.strictEqual(getSpeechRecognition({ webkitSpeechRecognition: FakeRecognition }), FakeRecognition);
assert.strictEqual(getSpeechRecognition({}), null);
assert.match(getSpeechErrorMessage('not-allowed'), /麦克风权限/);
assert.match(getSpeechErrorMessage('audio-capture'), /麦克风/);
assert.match(getSpeechErrorMessage('network'), /网络/);
assert.match(getSpeechErrorMessage('service-not-allowed'), /语音识别服务/);
assert.match(getSpeechErrorMessage('unknown'), /unknown/);

assert.deepStrictEqual(getAIStatus({ apiKey: '' }), {
  enabled: false,
  message: '本地实时反馈已开启；设置 API Key 可启用深度反馈和完整优化报告'
});
assert.deepStrictEqual(getAIStatus({ apiKey: 'configured' }), { enabled: true, message: '' });

assert.deepStrictEqual(buildLocalFeedback({
  fillers: [{ word: '就是' }],
  hedges: [{ word: '我覺得' }],
  vagueWords: [{ word: '很好', alternatives: ['具体', '清晰'] }],
  suggestions: [{ type: 'emotion', message: '情绪词提示' }]
}), [
  { type: 'vague', message: '「很好」→ 具体 / 清晰' },
  { type: 'filler', message: '填充词：就是——试试停顿' },
  { type: 'hedge', message: '「我覺得」→ 直接说' },
  { type: 'emotion', message: '情绪词提示' }
]);

function createClock() {
  let now = 0;
  let nextId = 1;
  const tasks = [];
  return {
    setTimeout(fn, delay) {
      const id = nextId++;
      tasks.push({ id, at: now + delay, fn });
      return id;
    },
    clearTimeout(id) {
      const index = tasks.findIndex(task => task.id === id);
      if (index >= 0) tasks.splice(index, 1);
    },
    tick(ms) {
      const target = now + ms;
      while (true) {
        tasks.sort((left, right) => left.at - right.at);
        const task = tasks[0];
        if (!task || task.at > target) break;
        tasks.shift();
        now = task.at;
        task.fn();
      }
      now = target;
    }
  };
}

function createFakeRecognition() {
  const instances = [];
  class Recognition {
    constructor() {
      this.startCalls = 0;
      this.stopCalls = 0;
      this.abortCalls = 0;
      instances.push(this);
    }
    start() { this.startCalls += 1; }
    stop() { this.stopCalls += 1; }
    abort() { this.abortCalls += 1; }
    result(text, isFinal) {
      const result = [{ transcript: text }];
      result.isFinal = isFinal;
      this.onresult?.({ resultIndex: 0, results: [result] });
    }
    error(code) { this.onerror?.({ error: code }); }
    end() { this.onend?.(); }
  }
  return { Recognition, instances };
}

{
  const clock = createClock();
  const { Recognition, instances } = createFakeRecognition();
  const interim = [];
  const final = [];
  const statuses = [];
  const controller = createSpeechController({
    Recognition,
    lang: 'zh-CN',
    timers: clock,
    onInterim: text => interim.push(text),
    onFinal: text => final.push(text),
    onStatus: status => statuses.push(status)
  });

  controller.start();
  assert.strictEqual(instances.length, 1);
  assert.strictEqual(instances[0].startCalls, 1);
  assert.strictEqual(instances[0].continuous, true);
  assert.strictEqual(instances[0].interimResults, true);
  instances[0].result('我觉得', false);
  instances[0].result('可以开始', true);
  assert.deepStrictEqual(interim, ['我觉得']);
  assert.deepStrictEqual(final, ['可以开始']);
  assert.ok(statuses.includes('listening'));
}

{
  const clock = createClock();
  const { Recognition, instances } = createFakeRecognition();
  const statuses = [];
  const controller = createSpeechController({ Recognition, timers: clock, onStatus: status => statuses.push(status) });
  controller.start();
  instances[0].error('network');
  instances[0].end();
  assert.strictEqual(controller.getState(), 'recording');
  assert.ok(statuses.includes('recovering'));
  clock.tick(249);
  assert.strictEqual(instances.length, 1);
  clock.tick(1);
  assert.strictEqual(instances.length, 2);
  assert.strictEqual(instances[1].startCalls, 1);
}

{
  const clock = createClock();
  const { Recognition, instances } = createFakeRecognition();
  const errors = [];
  const controller = createSpeechController({ Recognition, timers: clock, onError: error => errors.push(error) });
  controller.start();
  instances[0].error('not-allowed');
  instances[0].end();
  clock.tick(5000);
  assert.strictEqual(controller.getState(), 'idle');
  assert.deepStrictEqual(errors, ['not-allowed']);
  assert.strictEqual(instances.length, 1);
}

{
  const clock = createClock();
  const { Recognition, instances } = createFakeRecognition();
  const final = [];
  const controller = createSpeechController({ Recognition, timers: clock, onFinal: text => final.push(text) });
  controller.start();
  const first = instances[0];
  first.end();
  clock.tick(250);
  assert.strictEqual(instances.length, 2);
  first.result('过期结果', true);
  instances[1].result('新结果', true);
  assert.deepStrictEqual(final, ['新结果']);
  controller.pause();
  instances[1].end();
  clock.tick(5000);
  assert.strictEqual(controller.getState(), 'paused');
  assert.strictEqual(instances.length, 2);
}

{
  const clock = createClock();
  const { Recognition, instances } = createFakeRecognition();
  const statuses = [];
  const controller = createSpeechController({ Recognition, timers: clock, inactivityMs: 15000, onStatus: status => statuses.push(status) });
  controller.start();
  clock.tick(15000);
  assert.strictEqual(instances[0].abortCalls, 1);
  assert.ok(statuses.includes('recovering'));
  clock.tick(250);
  assert.strictEqual(instances.length, 2);
}

{
  const clock = createClock();
  const { Recognition, instances } = createFakeRecognition();
  const final = [];
  const settled = [];
  const controller = createSpeechController({
    Recognition,
    timers: clock,
    finalizationMs: 500,
    onFinal: text => final.push(text),
    onSettled: state => settled.push(state)
  });
  controller.start();
  instances[0].result('最后一句临时文本', false);
  controller.stop();
  assert.strictEqual(instances[0].stopCalls, 1);
  clock.tick(499);
  assert.deepStrictEqual(final, []);
  clock.tick(1);
  assert.deepStrictEqual(final, ['最后一句临时文本']);
  assert.deepStrictEqual(settled, ['idle']);
}

{
  const clock = createClock();
  const { Recognition, instances } = createFakeRecognition();
  const final = [];
  const controller = createSpeechController({ Recognition, timers: clock, finalizationMs: 500, onFinal: text => final.push(text) });
  controller.start();
  instances[0].result('可能变化', false);
  controller.pause();
  instances[0].result('最终版本', true);
  instances[0].end();
  clock.tick(500);
  assert.deepStrictEqual(final, ['最终版本']);
  assert.strictEqual(controller.getState(), 'paused');
}

{
  const clock = createClock();
  const errors = [];
  class PermissionDeniedRecognition {
    start() {
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';
      throw error;
    }
    abort() {}
  }
  const controller = createSpeechController({
    Recognition: PermissionDeniedRecognition,
    timers: clock,
    onError: code => errors.push(code)
  });
  const started = controller.start();
  clock.tick(10000);
  assert.strictEqual(started, false);
  assert.strictEqual(controller.getState(), 'idle');
  assert.deepStrictEqual(errors, ['not-allowed']);
}

{
  const clock = createClock();
  const { Recognition, instances } = createFakeRecognition();
  const controller = createSpeechController({ Recognition, timers: clock });
  controller.start();
  instances[0].end();
  clock.tick(250);
  instances[1].end();
  clock.tick(499);
  assert.strictEqual(instances.length, 2);
  clock.tick(1);
  assert.strictEqual(instances.length, 3);
  instances[2].result('恢复成功', true);
  instances[2].end();
  clock.tick(250);
  assert.strictEqual(instances.length, 4);
}

{
  const clock = createClock();
  const { Recognition, instances } = createFakeRecognition();
  const controller = createSpeechController({ Recognition, timers: clock, inactivityMs: 15000 });
  controller.start();
  [250, 500, 1000, 2000, 5000].forEach(delay => {
    clock.tick(15000);
    clock.tick(delay);
  });
  assert.strictEqual(controller.getState(), 'recording');
  assert.strictEqual(instances.length, 6);
  assert.strictEqual(instances.filter(instance => instance.abortCalls === 1).length, 5);
}

console.log('PASS web runtime reports speech and AI availability clearly');
