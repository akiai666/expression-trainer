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

  function createSpeechController(options = {}) {
    const Recognition = options.Recognition;
    const timers = options.timers || globalThis;
    const backoffMs = options.backoffMs || [250, 500, 1000, 2000, 5000];
    const inactivityMs = options.inactivityMs || 15000;
    const finalizationMs = options.finalizationMs || 500;
    const onInterim = options.onInterim || (() => {});
    const onFinal = options.onFinal || (() => {});
    const onStatus = options.onStatus || (() => {});
    const onError = options.onError || (() => {});
    const onSettled = options.onSettled || (() => {});
    const fatalErrors = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']);
    let state = 'idle';
    let current = null;
    let generation = 0;
    let retryIndex = 0;
    let restartTimer = null;
    let inactivityTimer = null;
    let finalizationTimer = null;
    let settlingTarget = null;
    let latestInterim = '';

    function clearTimer(name) {
      const timer = name === 'restart' ? restartTimer : inactivityTimer;
      if (timer !== null) timers.clearTimeout(timer);
      if (name === 'restart') restartTimer = null;
      else inactivityTimer = null;
    }

    function clearTimers() {
      clearTimer('restart');
      clearTimer('inactivity');
      if (finalizationTimer !== null) timers.clearTimeout(finalizationTimer);
      finalizationTimer = null;
    }

    function detachCurrent(method) {
      const recognition = current;
      current = null;
      generation += 1;
      if (!recognition) return;
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      if (method && typeof recognition[method] === 'function') {
        try { recognition[method](); } catch (error) { /* already ended */ }
      }
    }

    function scheduleWatchdog() {
      clearTimer('inactivity');
      if (state !== 'recording' || inactivityMs <= 0) return;
      inactivityTimer = timers.setTimeout(() => {
        inactivityTimer = null;
        if (state !== 'recording') return;
        onStatus('recovering');
        detachCurrent('abort');
        scheduleRestart();
      }, inactivityMs);
    }

    function flushInterim() {
      if (!latestInterim) return;
      const text = latestInterim;
      latestInterim = '';
      onFinal(text);
      onInterim('');
    }

    function finishSettling() {
      if (!settlingTarget) return;
      const target = settlingTarget;
      settlingTarget = null;
      if (finalizationTimer !== null) timers.clearTimeout(finalizationTimer);
      finalizationTimer = null;
      flushInterim();
      detachCurrent();
      onSettled(target);
    }

    function beginSettling(target) {
      state = target;
      clearTimer('restart');
      clearTimer('inactivity');
      settlingTarget = target;
      onStatus(target);
      if (!current) {
        finishSettling();
        return;
      }
      try { current.stop(); } catch (error) { finishSettling(); return; }
      finalizationTimer = timers.setTimeout(finishSettling, finalizationMs);
    }

    function scheduleRestart() {
      if (state !== 'recording' || restartTimer !== null) return;
      clearTimer('inactivity');
      onStatus('recovering');
      const delay = backoffMs[Math.min(retryIndex, backoffMs.length - 1)];
      retryIndex += 1;
      restartTimer = timers.setTimeout(() => {
        restartTimer = null;
        if (state === 'recording') createRecognition();
      }, delay);
    }

    function recover(method) {
      if (state !== 'recording') return;
      flushInterim();
      detachCurrent(method);
      scheduleRestart();
    }

    function createRecognition() {
      if (state !== 'recording') return;
      const token = ++generation;
      const recognition = new Recognition();
      current = recognition;
      recognition.lang = options.lang || 'zh-CN';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = event => {
        if (token !== generation || recognition !== current || (state !== 'recording' && !settlingTarget)) return;
        let interimTranscript = '';
        let finalTranscript = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result?.[0]?.transcript || '';
          if (result?.isFinal) finalTranscript += transcript;
          else interimTranscript += transcript;
        }
        if (state === 'recording') {
          retryIndex = 0;
          scheduleWatchdog();
        }
        if (finalTranscript) {
          latestInterim = '';
          onFinal(finalTranscript);
        }
        if (interimTranscript) {
          latestInterim = interimTranscript;
          onInterim(interimTranscript);
        }
      };
      recognition.onerror = event => {
        if (token !== generation || recognition !== current) return;
        const code = event?.error || 'unknown';
        if (fatalErrors.has(code)) {
          state = 'idle';
          clearTimers();
          flushInterim();
          detachCurrent();
          onError(code);
          onStatus('error');
          onSettled('idle');
          return;
        }
        if (state === 'recording') recover('abort');
      };
      recognition.onend = () => {
        if (token !== generation || recognition !== current) return;
        if (settlingTarget) {
          finishSettling();
          return;
        }
        if (state === 'recording') recover();
      };
      try {
        recognition.start();
        onStatus('listening');
        scheduleWatchdog();
      } catch (error) {
        if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
          state = 'idle';
          clearTimers();
          detachCurrent();
          onError('not-allowed');
          onStatus('error');
          onSettled('idle');
          return;
        }
        recover('abort');
      }
    }

    return {
      start() {
        if (!Recognition || state === 'recording') return false;
        if (settlingTarget) finishSettling();
        clearTimers();
        retryIndex = 0;
        latestInterim = '';
        state = 'recording';
        createRecognition();
        return state === 'recording';
      },
      pause() {
        if (state !== 'recording') return false;
        beginSettling('paused');
        return true;
      },
      resume() {
        if (state !== 'paused') return false;
        if (settlingTarget) finishSettling();
        retryIndex = 0;
        state = 'recording';
        createRecognition();
        return true;
      },
      stop() {
        if (state === 'idle') return false;
        beginSettling('idle');
        return true;
      },
      getState() { return state; }
    };
  }

  function createLatestOnlyRunner(worker, onResult, onError = () => {}) {
    let revision = 0;
    return {
      run(value) {
        const currentRevision = ++revision;
        return Promise.resolve()
          .then(() => worker(value))
          .then(result => {
            if (currentRevision !== revision) return false;
            onResult(value, result);
            return true;
          })
          .catch(error => {
            if (currentRevision === revision) onError(error);
            return false;
          });
      },
      invalidate() { revision += 1; }
    };
  }

  return {
    getSpeechRecognition,
    getSpeechErrorMessage,
    getAIStatus,
    buildLocalFeedback,
    createSpeechController,
    createLatestOnlyRunner
  };
});
