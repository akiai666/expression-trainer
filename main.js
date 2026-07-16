const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { initASR, feedAudio, stopRecognition } = require('./lib/asr');
const { loadLexicon, analyzeText } = require('./lib/lexicon');
const { sendFeedback, sendReport } = require('./lib/ai-feedback');
const { normalizeReport, renderReportFragment, renderReportHtml, renderReportMarkdown } = require('./lib/report-renderer');
const { createHistoryStore } = require('./lib/history-store');

const runtimeDir = path.join(__dirname, '.runtime-data');
const userDataDir = path.join(runtimeDir, 'user-data');
const sessionDataDir = path.join(runtimeDir, 'session-data');
fs.mkdirSync(userDataDir, { recursive: true });
fs.mkdirSync(sessionDataDir, { recursive: true });
app.setPath('userData', userDataDir);
app.setPath('sessionData', sessionDataDir);
const historyStore = createHistoryStore(userDataDir);

let mainWindow;
let settingsWindow;
let promptEditorWindow;
let asrReady = false;

// Custom prompt 文件路径
function getCustomPromptPath() {
  return path.join(app.getPath('userData'), 'custom-prompt.json');
}

function loadCustomPrompt() {
  const p = getCustomPromptPath();
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch(e) { return null; }
  }
  return null;
}

function saveCustomPrompt(data) {
  fs.writeFileSync(getCustomPromptPath(), JSON.stringify(data, null, 2));
}

// 设置文件路径
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  }
  return {
    provider: 'groq',
    apiKey: '',
    model: 'llama-3.3-70b-versatile',
    ollamaUrl: 'http://localhost:11434',
    customEndpoint: '',
    customModel: ''
  };
}

function saveSettings(settings) {
  const settingsPath = getSettingsPath();
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#000000',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.setFullScreenable(true);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createPromptEditorWindow() {
  if (promptEditorWindow) {
    promptEditorWindow.focus();
    return;
  }

  promptEditorWindow = new BrowserWindow({
    width: 720,
    height: 700,
    resizable: true,
    backgroundColor: '#1a1a1a',
    titleBarStyle: 'hiddenInset',
    parent: mainWindow,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  promptEditorWindow.loadFile(path.join(__dirname, 'src', 'prompt-editor.html'));

  promptEditorWindow.on('closed', () => {
    promptEditorWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    backgroundColor: '#1a1a1a',
    titleBarStyle: 'hiddenInset',
    parent: mainWindow,
    modal: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'src', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  // 加载词库
  loadLexicon();

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// 设置相关
ipcMain.handle('get-settings', () => {
  return loadSettings();
});

ipcMain.handle('save-settings', (event, settings) => {
  saveSettings(settings);
  return { success: true };
});

ipcMain.handle('open-settings', () => {
  createSettingsWindow();
});

// Prompt编辑器相关
ipcMain.handle('open-prompt-editor', () => {
  createPromptEditorWindow();
});

ipcMain.handle('get-custom-prompt', () => {
  return loadCustomPrompt();
});

ipcMain.handle('save-custom-prompt', (event, data) => {
  saveCustomPrompt(data);
  return { success: true };
});

ipcMain.handle('close-current-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

// 语音识别相关 - Web Audio方案
ipcMain.handle('init-asr', async () => {
  try {
    await initASR();
    asrReady = true;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 接收渲染进程发来的音频数据
ipcMain.handle('feed-audio', (event, samplesArray) => {
  if (!asrReady) return null;
  const samples = new Float32Array(samplesArray);
  const result = feedAudio(samples);
  return result; // { text, isFinal } or null
});

ipcMain.handle('stop-asr', () => {
  const finalText = stopRecognition();
  asrReady = false;
  return { success: true, finalText };
});

// 词库分析
ipcMain.handle('analyze-text', (event, text) => {
  return analyzeText(text);
});

// 文件保存
ipcMain.handle('save-file', async (event, content, filename, format = 'md') => {
  const { dialog } = require('electron');
  const isHtml = format === 'html' || String(filename).toLowerCase().endsWith('.html');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存报告',
    defaultPath: path.join(app.getPath('desktop'), filename),
    filters: isHtml
      ? [{ name: 'HTML 文件', extensions: ['html'] }]
      : [{ name: 'Markdown 文件', extensions: ['md'] }]
  });

  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

// AI反馈（传入customPrompt）
ipcMain.handle('get-realtime-feedback', async (event, text) => {
  const settings = loadSettings();
  const customPrompt = loadCustomPrompt();
  try {
    const feedback = await sendFeedback(text, settings, customPrompt);
    return { success: true, feedback };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-final-report', async (event, { fullText, stats }) => {
  const settings = loadSettings();
  const customPrompt = loadCustomPrompt();
  try {
    const report = await sendReport(fullText, stats, settings, customPrompt);
    return { success: true, report };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 报告渲染：统一在主进程完成清洗和导出，渲染层不直接接触未经处理的 AI 文本。
ipcMain.handle('render-report', (event, { report, fullText, stats }) => {
  const context = { fullText, stats, title: '表达训练报告' };
  const model = normalizeReport(report, context);
  return {
    model,
    fragmentHtml: renderReportFragment(report, context),
    html: renderReportHtml(report, context),
    markdown: renderReportMarkdown(report, context)
  };
});

// 训练历史：仅保存在当前设备的 userData/history 目录。
ipcMain.handle('history-list', () => {
  try {
    return { success: true, records: historyStore.list() };
  } catch (error) {
    return { success: false, records: [], error: error.message };
  }
});

ipcMain.handle('history-get', (event, id) => {
  try {
    const record = historyStore.get(id);
    return record
      ? { success: true, record }
      : { success: false, error: '历史记录不存在' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('history-save', (event, record) => {
  try {
    return { success: true, record: historyStore.save(record) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('history-delete', (event, id) => {
  try {
    return { success: true, deleted: historyStore.delete(id) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
