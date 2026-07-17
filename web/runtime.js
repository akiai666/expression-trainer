(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ExpressionRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getSpeechRecognition(scope) {
    return scope?.SpeechRecognition || scope?.webkitSpeechRecognition || null;
  }

  function getSpeechErrorMessage(code) {
    const messages = {
      'not-allowed': '麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试',
      'service-not-allowed': '浏览器语音识别服务不可用，请改用最新版 Chrome、Edge 或 Safari',
      'audio-capture': '没有检测到可用麦克风，请检查系统输入设备',
      'network': '语音识别网络连接失败，请检查网络后重试',
      'language-not-supported': '当前语言暂不受浏览器语音识别支持'
    };
    return messages[code] || `语音识别失败（${code || '未知错误'}），请重试`;
  }

  function getAIStatus(settings = {}) {
    if (String(settings.apiKey || '').trim()) return { enabled: true, message: '' };
    return {
      enabled: false,
      message: '本地实时反馈已开启；设置 API Key 可启用深度反馈和完整优化报告'
    };
  }

  function buildLocalFeedback(analysis = {}) {
    const feedback = [];
    (analysis.vagueWords || []).forEach(item => {
      const alternatives = (item.alternatives || []).slice(0, 3).join(' / ');
      if (alternatives) feedback.push({ type: 'vague', message: `「${item.word}」→ ${alternatives}` });
    });
    const fillers = [...new Set((analysis.fillers || []).map(item => item.word))].slice(0, 3);
    if (fillers.length) feedback.push({ type: 'filler', message: `填充词：${fillers.join('、')}——试试停顿` });
    const hedges = [...new Set((analysis.hedges || []).map(item => item.word))].slice(0, 2);
    if (hedges.length) feedback.push({ type: 'hedge', message: `「${hedges.join('」「')}」→ 直接说` });
    (analysis.suggestions || []).filter(item => item.type === 'emotion' && item.message)
      .forEach(item => feedback.push({ type: 'emotion', message: item.message }));
    return feedback;
  }

  return { getSpeechRecognition, getSpeechErrorMessage, getAIStatus, buildLocalFeedback };
});
