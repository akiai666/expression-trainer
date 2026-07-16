// 表达训练桌面版

class ExpressionTrainer {
  constructor() {
    this.isRecording = false;
    this.isPaused = false;
    this.startTime = null;
    this.pausedTime = 0;
    this.pauseStart = null;
    this.timerInterval = null;
    this.fullText = '';
    this.sentences = [];
    this.stats = { fillers: 0, hedges: 0, vagueWords: 0, totalWords: 0, tokenCount: 0, charCount: 0, duration: 0 };
    this.lastFeedbackText = '';
    this.lastReport = '';
    this.reportExport = null;
    this.vocabularyHits = [];
    this.feedbackRequest = null;
    this.feedbackRequestQueued = false;
    this.currentHistoryId = null;
    this.currentHistoryCreatedAt = null;
    this.currentSource = 'recording';
    this.historyEntries = [];

    this.initElements();
    this.bindEvents();
    this.loadHistoryList();
  }

  initElements() {
    this.btnStart = document.getElementById('btn-start');
    this.btnPaste = document.getElementById('btn-paste');
    this.btnPause = document.getElementById('btn-pause');
    this.btnResume = document.getElementById('btn-resume');
    this.btnStop = document.getElementById('btn-stop');
    this.btnReport = document.getElementById('btn-report');
    this.btnSettings = document.getElementById('btn-settings');
    this.btnCloseReport = document.getElementById('btn-close-report');
    this.btnClosePaste = document.getElementById('btn-close-paste');
    this.btnAnalyzePaste = document.getElementById('btn-analyze-paste');
    this.btnCopyText = document.getElementById('btn-copy-text');
    this.btnSaveText = document.getElementById('btn-save-text');
    this.btnClear = document.getElementById('btn-clear');
    this.btnCopyReport = document.getElementById('btn-copy-report');
    this.btnExportHtml = document.getElementById('btn-export-html');
    this.btnExportMarkdown = document.getElementById('btn-export-markdown');
    this.pasteModal = document.getElementById('paste-modal');
    this.pasteTextarea = document.getElementById('paste-textarea');
    this.timer = document.getElementById('timer');
    this.subtitleScroll = document.getElementById('subtitle-scroll');
    this.subtitleContainer = document.getElementById('subtitle-container');
    this.feedbackContent = document.getElementById('feedback-content');
    this.reportModal = document.getElementById('report-modal');
    this.reportBody = document.getElementById('report-body');
    this.statFillers = document.getElementById('stat-fillers');
    this.statHedges = document.getElementById('stat-hedges');
    this.statVague = document.getElementById('stat-vague');
    this.statDensity = document.getElementById('stat-density');
    this.tabAnalysis = document.getElementById('tab-analysis');
    this.tabHistory = document.getElementById('tab-history');
    this.analysisPanel = document.getElementById('analysis-panel');
    this.historyPanel = document.getElementById('history-panel');
    this.historyList = document.getElementById('history-list');
    this.historyEmpty = document.getElementById('history-empty');
  }

  bindEvents() {
    this.btnStart.addEventListener('click', () => this.startRecording());
    this.btnPaste.addEventListener('click', () => this.openPasteModal());
    this.btnPause.addEventListener('click', () => this.pauseRecording());
    this.btnResume.addEventListener('click', () => this.resumeRecording());
    this.btnStop.addEventListener('click', () => this.stopRecording());
    this.btnReport.addEventListener('click', () => this.generateReport());
    this.btnSettings.addEventListener('click', () => window.api.openSettings());
    document.getElementById('btn-prompt-editor').addEventListener('click', () => window.api.openPromptEditor());
    this.btnCloseReport.addEventListener('click', () => this.reportModal.classList.add('hidden'));
    this.btnCopyReport.addEventListener('click', () => {
      const reportText = this.reportBody.innerText;
      navigator.clipboard.writeText(reportText).then(() => {
        this.btnCopyReport.textContent = '✅ 已复制';
        setTimeout(() => { this.btnCopyReport.textContent = '📋 复制全文'; }, 2000);
      });
    });
    this.btnExportHtml.addEventListener('click', () => this.exportReport('html'));
    this.btnExportMarkdown.addEventListener('click', () => this.exportReport('markdown'));
    this.btnClosePaste.addEventListener('click', () => this.pasteModal.classList.add('hidden'));
    this.btnAnalyzePaste.addEventListener('click', () => this.analyzePastedText());
    this.btnCopyText.addEventListener('click', () => this.copyOriginalText());
    this.btnSaveText.addEventListener('click', () => this.saveOriginalText());
    this.btnClear.addEventListener('click', () => this.clearAll());
    this.tabAnalysis.addEventListener('click', () => this.showLeftTab('analysis'));
    this.tabHistory.addEventListener('click', () => this.showLeftTab('history'));
  }

  // ===== 左栏 / 训练历史 =====

  showLeftTab(tab) {
    if (tab === 'history' && this.tabHistory.disabled) return;
    const showHistory = tab === 'history';
    this.tabAnalysis.classList.toggle('active', !showHistory);
    this.tabHistory.classList.toggle('active', showHistory);
    this.tabAnalysis.setAttribute('aria-selected', String(!showHistory));
    this.tabHistory.setAttribute('aria-selected', String(showHistory));
    this.analysisPanel.classList.toggle('hidden', showHistory);
    this.historyPanel.classList.toggle('hidden', !showHistory);
    if (showHistory) this.loadHistoryList();
  }

  setHistoryEnabled(enabled) {
    this.tabHistory.disabled = !enabled;
    if (!enabled) this.showLeftTab('analysis');
  }

  async loadHistoryList() {
    try {
      const result = await window.api.listHistory();
      this.historyEntries = result.success ? result.records : [];
      this.renderHistoryList();
    } catch (error) {
      this.historyEntries = [];
      this.renderHistoryList(`历史记录读取失败：${error.message}`);
    }
  }

  renderHistoryList(errorMessage = '') {
    this.historyList.textContent = '';
    this.historyEmpty.textContent = errorMessage || '还没有训练记录';
    this.historyEmpty.classList.toggle('hidden', this.historyEntries.length > 0 && !errorMessage);
    if (errorMessage || !this.historyEntries.length) return;

    this.historyEntries.forEach(record => {
      const row = document.createElement('div');
      row.className = 'history-row';

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'history-item';
      openButton.title = '查看训练报告';

      const title = document.createElement('span');
      title.className = 'history-title';
      title.textContent = record.title || '未命名训练';
      const time = document.createElement('span');
      time.className = 'history-time';
      time.textContent = this.formatHistoryTime(record.createdAt);
      const meta = document.createElement('span');
      meta.className = 'history-meta';
      const source = record.source === 'paste' ? '粘贴文本' : `${record.duration || 0}秒`;
      const score = record.score === null || record.score === undefined || record.score === '' ? '--' : record.score;
      meta.textContent = `${source} · ${record.charCount || 0}字 · `;
      const scoreNode = document.createElement('span');
      scoreNode.className = 'history-score';
      scoreNode.textContent = `${score}分`;
      meta.appendChild(scoreNode);
      const badge = document.createElement('span');
      badge.className = 'history-badge';
      badge.textContent = record.hasReport ? '报告' : '本地';
      meta.appendChild(badge);

      openButton.append(title, time, meta);
      openButton.addEventListener('click', () => this.openHistoryRecord(record.id));

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'history-delete';
      deleteButton.title = '删除记录';
      deleteButton.setAttribute('aria-label', `删除 ${record.title || '训练记录'}`);
      deleteButton.textContent = '×';
      deleteButton.addEventListener('click', () => this.deleteHistoryRecord(record.id, record.title));

      row.append(openButton, deleteButton);
      this.historyList.appendChild(row);
    });
  }

  formatHistoryTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    });
  }

  async openHistoryRecord(id) {
    const result = await window.api.getHistory(id);
    if (!result.success || !result.record) {
      this.showError(result.error || '历史记录不存在');
      await this.loadHistoryList();
      return;
    }
    const record = result.record;
    const report = record.report || this.buildLocalReport('', {
      stats: record.stats,
      vocabularyHits: record.vocabularyHits || []
    });
    this.lastReport = report;
    this.reportBody.textContent = '正在打开历史报告...';
    this.reportModal.classList.remove('hidden');
    await this.renderReport(report, { fullText: record.transcript || '', stats: record.stats || {} });
  }

  async deleteHistoryRecord(id, title) {
    if (!window.confirm(`删除“${title || '这条训练记录'}”？此操作无法撤销。`)) return;
    const result = await window.api.deleteHistory(id);
    if (!result.success) {
      this.showError(result.error || '删除历史记录失败');
      return;
    }
    if (this.currentHistoryId === id) {
      this.currentHistoryId = null;
      this.currentHistoryCreatedAt = null;
    }
    await this.loadHistoryList();
  }

  // ===== 录制控制 =====

  async startRecording() {
    const initResult = await window.api.initASR();
    if (!initResult.success) {
      this.showError(`语音识别启动失败: ${initResult.error}`);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(stream);
      this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.audioProcessor.onaudioprocess = async (e) => {
        if (!this.isRecording || this.isPaused) return;
        const samples = e.inputBuffer.getChannelData(0);
        const result = await window.api.feedAudio(samples);
        if (result) this.handleASRResult(result);
      };
      source.connect(this.audioProcessor);
      this.audioProcessor.connect(this.audioContext.destination);
      this.mediaStream = stream;
    } catch (err) {
      this.showError(`麦克风访问失败: ${err.message}`);
      return;
    }

    this.isRecording = true;
    this.isPaused = false;
    this.startTime = Date.now();
    this.pausedTime = 0;
    this.pauseStart = null;
    this.fullText = '';
    this.sentences = [];
    this.lastFeedbackText = '';
    this.lastReport = '';
    this.currentHistoryId = null;
    this.currentHistoryCreatedAt = null;
    this.currentSource = 'recording';
    this.setHistoryEnabled(false);
    this.resetStats();
    this.subtitleContainer.innerHTML = '';

    // UI
    this.btnStart.classList.add('hidden');
    this.btnPause.classList.remove('hidden');
    this.btnStop.classList.remove('hidden');
    this.btnReport.classList.add('hidden');
    this.btnResume.classList.add('hidden');
    this.timer.classList.add('active');

    this.timerInterval = setInterval(() => this.updateTimer(), 1000);
  }

  pauseRecording() {
    this.isPaused = true;
    this.pauseStart = Date.now();
    this.btnPause.classList.add('hidden');
    this.btnResume.classList.remove('hidden');
    this.timer.classList.remove('active');
  }

  resumeRecording() {
    this.isPaused = false;
    this.pausedTime += Date.now() - this.pauseStart;
    this.pauseStart = null;
    this.btnResume.classList.add('hidden');
    this.btnPause.classList.remove('hidden');
    this.timer.classList.add('active');
  }

  async stopRecording() {
    if (this.audioProcessor) { this.audioProcessor.disconnect(); this.audioProcessor = null; }
    if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
    if (this.mediaStream) { this.mediaStream.getTracks().forEach(t => t.stop()); this.mediaStream = null; }
    const stopResult = await window.api.stopASR();
    // endpoint 未触发时，最后一段文本只会从 stop-asr 返回，必须补进逐字稿。
    if (stopResult && stopResult.finalText) {
      await this.handleASRResult({ text: stopResult.finalText, isFinal: true });
    }
    this.isRecording = false;
    this.isPaused = false;

    clearInterval(this.timerInterval);
    let totalPaused = this.pausedTime;
    if (this.pauseStart) totalPaused += Date.now() - this.pauseStart;
    this.stats.duration = Math.floor((Date.now() - this.startTime - totalPaused) / 1000);

    // UI：显示生成报告按钮，可翻阅字幕
    this.btnStop.classList.add('hidden');
    this.btnPause.classList.add('hidden');
    this.btnResume.classList.add('hidden');
    this.btnStart.classList.remove('hidden');
    this.timer.classList.remove('active');

    if (this.fullText.trim()) {
      this.btnReport.classList.remove('hidden');
      this.btnCopyText.classList.remove('hidden');
      this.btnSaveText.classList.remove('hidden');
      this.btnClear.classList.remove('hidden');
      await this.saveCurrentTraining('recording');
    }
    this.setHistoryEnabled(true);
  }

  // ===== ASR结果处理 =====

  async handleASRResult({ text, isFinal }) {
    if (isFinal) {
      this.sentences.push(text);
      this.fullText += text;
      const analysis = await this.analyzeCurrentSentence(text);

      // 每30字触发一次AI反馈（语境化精准词建议）
      if (this.fullText.length - this.lastFeedbackText.length >= 30) {
        this.requestRealtimeFeedback();
      }
      this.renderSubtitle(text, true, analysis);
      return;
    }
    this.renderSubtitle(text, isFinal);
  }

  renderSubtitle(currentText, isFinal, analysis = null) {
    if (isFinal) {
      // 移除interim
      const interim = this.subtitleContainer.querySelector('.interim-line');
      if (interim) interim.remove();

      // 旧行变灰
      this.subtitleContainer.querySelectorAll('.subtitle-line:not(.old)').forEach(el => {
        el.classList.add('old');
      });

      // 新行
      const line = document.createElement('div');
      line.className = 'subtitle-line';
      line.innerHTML = this.highlightText(currentText, analysis);
      this.subtitleContainer.appendChild(line);
    } else {
      let interim = this.subtitleContainer.querySelector('.interim-line');
      if (!interim) {
        interim = document.createElement('div');
        interim.className = 'subtitle-line interim-line';
        this.subtitleContainer.appendChild(interim);
      }
      interim.textContent = currentText;
    }

    // 自动滚到底
    this.subtitleScroll.scrollTop = this.subtitleScroll.scrollHeight;
  }

  highlightText(text, analysis = null) {
    const escapeHtml = value => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const spans = (analysis && Array.isArray(analysis.spans) ? analysis.spans : [])
      .filter(span => Number.isInteger(span.start) && Number.isInteger(span.end) && span.end > span.start)
      .sort((a, b) => a.start - b.start);
    if (!spans.length) return escapeHtml(text);

    let result = '';
    let cursor = 0;
    spans.forEach(span => {
      if (span.start < cursor) return;
      result += escapeHtml(text.slice(cursor, span.start));
      result += `<span class="${escapeHtml(span.type || 'emotion')}">${escapeHtml(text.slice(span.start, span.end))}</span>`;
      cursor = span.end;
    });
    return result + escapeHtml(text.slice(cursor));
  }

  // ===== 分析 =====

  async analyzeCurrentSentence(text) {
    const analysis = await window.api.analyzeText(text);
    if (analysis) {
      this.stats.fillers += analysis.fillers.length;
      this.stats.hedges += analysis.hedges.length;
      this.stats.vagueWords += analysis.vagueWords.length;
      this.stats.totalWords += analysis.totalWords;
      this.stats.tokenCount += analysis.tokenCount || analysis.totalWords || 0;
      this.stats.charCount += analysis.charCount || 0;
      analysis.vagueWords.forEach(item => {
        const key = `${item.word}:${item.alternatives.join('|')}`;
        if (!this.vocabularyHits.some(hit => hit.key === key)) {
          this.vocabularyHits.push({ key, word: item.word, alternatives: item.alternatives.slice(0, 3) });
        }
      });
      this.updateStatsDisplay();
      // 碰到笼统词 → 立刻在反馈栏弹出替换建议
      if (analysis.vagueWords && analysis.vagueWords.length > 0) {
        analysis.vagueWords.forEach(item => {
          const alts = item.alternatives.slice(0, 3).join(' / ');
          this.addFeedbackItem(`「${item.word}」→ ${alts}`, 'vague');
        });
      }
      // 碰到填充词 → 弹提醒
      if (analysis.fillers && analysis.fillers.length >= 2) {
        const uniqueFillers = [...new Set(analysis.fillers.map(f => f.word))].slice(0, 3);
        this.addFeedbackItem(`填充词：${uniqueFillers.join('、')}——试试停顿`, 'filler');
      }
      // 碰到犹豫词 → 弹提醒
      if (analysis.hedges && analysis.hedges.length >= 1) {
        const uniqueHedges = [...new Set(analysis.hedges.map(h => h.word))].slice(0, 2);
        this.addFeedbackItem(`「${uniqueHedges.join('」「')}」→ 直接说`, 'hedge');
      }
      analysis.suggestions
        .filter(item => item.type === 'emotion')
        .forEach(item => this.addFeedbackItem(item.message, 'emotion'));
    }
    return analysis;
  }

  updateStatsDisplay() {
    this.statFillers.textContent = this.stats.fillers;
    this.statHedges.textContent = this.stats.hedges;
    this.statVague.textContent = this.stats.vagueWords;
    if (this.stats.tokenCount > 0 || this.stats.totalWords > 0) {
      const tokens = this.stats.tokenCount || this.stats.totalWords;
      const density = ((tokens - this.stats.fillers - this.stats.hedges) / tokens * 100).toFixed(0);
      this.statDensity.textContent = density + '%';
    }
  }

  // ===== 实时反馈 =====

  requestRealtimeFeedback() {
    this.feedbackRequestQueued = true;
    if (this.feedbackRequest) return this.feedbackRequest;
    this.feedbackRequest = (async () => {
      while (this.feedbackRequestQueued) {
        this.feedbackRequestQueued = false;
        const textSnapshot = this.fullText;
        this.lastFeedbackText = textSnapshot;
        const result = await window.api.getRealtimeFeedback(textSnapshot);
        if (result.success && result.feedback) {
          const lines = result.feedback.split('\n').filter(l => l.trim());
          lines.forEach(line => {
            const type = this.classifyFeedback(line.trim());
            this.addFeedbackItem(line.trim(), type);
          });
        } else if (result.error && this.isRecording) {
          this.addFeedbackItem(`AI反馈暂不可用：${result.error}`, 'ai');
        }
      }
    })().finally(() => {
      this.feedbackRequest = null;
    });
    return this.feedbackRequest;
  }

  classifyFeedback(text) {
    if (text === '✓' || text.includes('✓')) return 'good';
    // 填充词相关
    const fillerKeywords = ['嗯','啊','呃','那个','就是','然后','这个','对吧','是吧','反正','基本上','所以说'];
    if (fillerKeywords.some(w => text.includes(`「${w}」`))) return 'filler';
    // 犹豫词相关
    const hedgeKeywords = ['可能','也许','大概','应该','我觉得','好像','似乎','感觉','或许'];
    if (hedgeKeywords.some(w => text.includes(`「${w}」`))) return 'hedge';
    // 其他精准词替换
    if (text.includes('→')) return 'vague';
    return 'ai';
  }

  addFeedbackItem(text, type = 'ai') {
    // 去重：如果前3条已经有相同内容，跳过
    const existing = Array.from(this.feedbackContent.children).slice(0, 3);
    if (existing.some(el => el.textContent === text)) return;

    const item = document.createElement('div');
    item.className = `feedback-item type-${type}`;
    item.textContent = text;
    this.feedbackContent.insertBefore(item, this.feedbackContent.firstChild);
    while (this.feedbackContent.children.length > 12) {
      this.feedbackContent.removeChild(this.feedbackContent.lastChild);
    }
  }

  // ===== 报告 =====

  async generateReport() {
    this.reportBody.textContent = '';
    const loading = document.createElement('p');
    loading.textContent = '正在生成报告...';
    loading.style.cssText = 'text-align:center;color:#666;padding:40px;';
    this.reportBody.appendChild(loading);
    this.reportModal.classList.remove('hidden');

    const result = await window.api.getFinalReport({
      fullText: this.fullText,
      stats: this.stats
    });

    if (result.success) {
      this.lastReport = result.report;
      await this.renderReport(result.report);
    } else {
      // AI 不可用时仍生成可导出的本地词库报告。
      this.lastReport = this.buildLocalReport(result.error);
      await this.renderReport(this.lastReport);
      this.addFeedbackItem(`AI报告未生成，已展示本地分析：${result.error}`, 'ai');
    }
    await this.saveCurrentTraining(this.currentSource, this.lastReport);
  }

  buildLocalReport(errorMessage = '', context = {}) {
    const stats = context.stats || this.stats;
    const vocabularyHits = context.vocabularyHits || this.vocabularyHits;
    const findings = [];
    if (stats.fillers) findings.push({ type: 'flow', text: `检测到 ${stats.fillers} 次填充词，建议用短暂停顿替代。` });
    if (stats.hedges) findings.push({ type: 'style', text: `检测到 ${stats.hedges} 次犹豫表达，建议先给结论再补充理由。` });
    if (stats.vagueWords) findings.push({ type: 'clarity', text: `检测到 ${stats.vagueWords} 个笼统词，报告中已列出替代表达。` });
    return {
      schemaVersion: 2,
      title: '表达训练报告',
      summary: errorMessage ? `本次已完成本地词库分析；AI 反馈暂不可用（${errorMessage}）。` : '本次已完成本地词库分析。',
      metrics: {
        durationSec: stats.duration,
        charCount: stats.charCount,
        tokenCount: stats.tokenCount || stats.totalWords,
        fillers: stats.fillers,
        hedges: stats.hedges,
        vagueWords: stats.vagueWords,
        density: stats.tokenCount ? Math.round(((stats.tokenCount - stats.fillers - stats.hedges) / stats.tokenCount) * 100) : 0
      },
      strengths: [],
      findings,
      vocabulary: vocabularyHits.map(hit => ({ original: hit.word, alternatives: hit.alternatives, reason: '来自本地口语词库' })),
      behaviorAnalysis: [],
      optimizedTranscript: '',
      nextPractice: stats.fillers || stats.hedges ? ['先说结论，再补充理由；遇到停顿时不要用填充词代替。'] : ['继续保持具体表达，并为关键观点补充例子。']
    };
  }

  async renderReport(report, context = {}) {
    try {
      const rendered = await window.api.renderReport({
        report,
        fullText: context.fullText ?? this.fullText,
        stats: context.stats || this.stats
      });
      this.reportExport = rendered;
      this.reportBody.style.color = '';
      this.reportBody.innerHTML = rendered.fragmentHtml;
    } catch (error) {
      this.reportBody.textContent = `报告渲染失败：${error.message}`;
      this.reportBody.style.color = '#ff6b6b';
    }
  }

  async saveCurrentTraining(source = this.currentSource, report = null) {
    if (!this.fullText.trim()) return;
    const normalized = this.reportExport && this.reportExport.model;
    const rawScore = normalized ? normalized.score : null;
    const numericScore = Number(rawScore);
    const titleText = this.fullText.replace(/\s+/g, ' ').trim();
    const titleChars = Array.from(titleText);
    const payload = {
      id: this.currentHistoryId || undefined,
      createdAt: this.currentHistoryCreatedAt || undefined,
      source,
      title: titleChars.length > 20 ? `${titleChars.slice(0, 20).join('')}…` : titleText,
      transcript: this.fullText,
      stats: { ...this.stats },
      vocabularyHits: this.vocabularyHits.map(hit => ({ ...hit, alternatives: [...hit.alternatives] })),
      report: report || this.buildLocalReport(),
      score: rawScore !== null && rawScore !== '' && Number.isFinite(numericScore) ? numericScore : null,
      summary: normalized && normalized.summary ? normalized.summary : '本次已完成本地词库分析。'
    };

    try {
      const result = await window.api.saveHistory(payload);
      if (!result.success || !result.record) {
        this.addFeedbackItem(`训练历史保存失败：${result.error || '未知错误'}`, 'ai');
        return;
      }
      this.currentHistoryId = result.record.id;
      this.currentHistoryCreatedAt = result.record.createdAt;
      await this.loadHistoryList();
    } catch (error) {
      this.addFeedbackItem(`训练历史保存失败：${error.message}`, 'ai');
    }
  }

  async exportReport(format) {
    if (!this.lastReport || !this.reportExport) return;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
    const isHtml = format === 'html';
    const content = isHtml ? this.reportExport.html : this.reportExport.markdown;
    const filename = `表达训练-${dateStr}-${timeStr}.${isHtml ? 'html' : 'md'}`;

    try {
      const result = await window.api.saveFile(content, filename, isHtml ? 'html' : 'md');
      if (result.success) {
        const btn = isHtml ? this.btnExportHtml : this.btnExportMarkdown;
        const original = btn.textContent;
        btn.textContent = '✓ 已保存';
        setTimeout(() => { btn.textContent = original; }, 2000);
      }
    } catch (e) {
      alert('保存失败: ' + e.message);
    }
  }

  // ===== 工具 =====

  updateTimer() {
    let totalPaused = this.pausedTime;
    if (this.pauseStart) totalPaused += Date.now() - this.pauseStart;
    const elapsed = Math.floor((Date.now() - this.startTime - totalPaused) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    this.timer.textContent = `${minutes}:${seconds}`;
  }

  resetStats() {
    this.stats = { fillers: 0, hedges: 0, vagueWords: 0, totalWords: 0, tokenCount: 0, charCount: 0, duration: 0 };
    this.reportExport = null;
    this.vocabularyHits = [];
    this.updateStatsDisplay();
    this.feedbackContent.innerHTML = '';
  }

  showError(msg) {
    const line = document.createElement('div');
    line.className = 'subtitle-line';
    line.style.color = '#ff6b6b';
    line.textContent = msg;
    this.subtitleContainer.appendChild(line);
  }

  // ===== 复制 & 保存原文 & 清空 =====

  copyOriginalText() {
    if (!this.fullText.trim()) return;
    navigator.clipboard.writeText(this.fullText).then(() => {
      this.btnCopyText.querySelector('.btn-label').textContent = '✓ 已复制';
      setTimeout(() => { this.btnCopyText.querySelector('.btn-label').textContent = '复制原文'; }, 1500);
    });
  }

  async saveOriginalText() {
    if (!this.fullText.trim()) return;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
    const markdown = `# 表达训练原文\n\n**日期**: ${dateStr}\n\n---\n\n${this.fullText}`;
    const filename = `原文-${dateStr}-${timeStr}.md`;

    try {
      const result = await window.api.saveFile(markdown, filename);
      if (result.success) {
        this.btnSaveText.querySelector('.btn-label').textContent = '✓ 已保存';
        setTimeout(() => { this.btnSaveText.querySelector('.btn-label').textContent = '保存原文'; }, 2000);
      }
    } catch (e) {
      alert('保存失败: ' + e.message);
    }
  }

  clearAll() {
    this.fullText = '';
    this.sentences = [];
    this.lastReport = '';
    this.currentHistoryId = null;
    this.currentHistoryCreatedAt = null;
    this.currentSource = 'recording';
    this.vocabularyHits = [];
    this.feedbackRequestQueued = false;
    this.subtitleContainer.innerHTML = '<div class="subtitle-line hint">点击下方按钮开始说话</div>';
    this.feedbackContent.innerHTML = '';
    this.resetStats();
    this.timer.textContent = '00:00';
    this.timer.classList.remove('active');
    this.btnReport.classList.add('hidden');
    this.btnCopyText.classList.add('hidden');
    this.btnSaveText.classList.add('hidden');
    this.btnClear.classList.add('hidden');
  }

  // ===== 粘贴逐字稿分析 =====

  openPasteModal() {
    this.pasteTextarea.value = '';
    this.pasteModal.classList.remove('hidden');
    this.pasteTextarea.focus();
  }

  async analyzePastedText() {
    const text = this.pasteTextarea.value.trim();
    if (!text) return;

    // 关闭粘贴弹窗
    this.pasteModal.classList.add('hidden');

    // 把文本显示到字幕区（高亮标记）
    this.subtitleContainer.innerHTML = '';
    this.fullText = text;
    this.lastFeedbackText = '';
    this.lastReport = '';
    this.currentHistoryId = null;
    this.currentHistoryCreatedAt = null;
    this.currentSource = 'paste';
    this.setHistoryEnabled(false);
    this.resetStats();

    // 按句号/问号/感叹号/换行分句
    const sentences = text.split(/(?<=[。！？\n])/g).filter(s => s.trim());
    this.sentences = sentences;

    for (const sentence of sentences) {
      const analysis = await this.analyzeCurrentSentence(sentence.trim());
      const line = document.createElement('div');
      line.className = 'subtitle-line';
      line.innerHTML = this.highlightText(sentence.trim(), analysis);
      this.subtitleContainer.appendChild(line);
    }

    this.stats.duration = 0; // 粘贴模式没有时长
    this.updateStatsDisplay();

    // 显示操作按钮
    this.btnReport.classList.remove('hidden');
    this.btnCopyText.classList.remove('hidden');
    this.btnSaveText.classList.remove('hidden');
    this.btnClear.classList.remove('hidden');

    await this.saveCurrentTraining('paste');
    this.setHistoryEnabled(true);

    // 请求AI语境化反馈
    this.requestRealtimeFeedback();
  }
}

document.addEventListener('DOMContentLoaded', () => { new ExpressionTrainer(); });
