const assert = require('assert');
const {
  getSpeechRecognition,
  getSpeechErrorMessage,
  getAIStatus,
  buildLocalFeedback
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

console.log('PASS web runtime reports speech and AI availability clearly');
