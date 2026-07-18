/**
 * 语音识别模块 - 基于 sherpa-onnx-node
 * 使用 streaming recognizer 实现实时中文语音识别
 * 录音通过 Electron 渲染进程的 Web Audio API 采集，音频数据通过 IPC 传入
 */

const path = require('path');
const fs = require('fs');

let recognizer = null;
let stream = null;
let isRunning = false;

const MODEL_SUBDIR = 'sherpa-onnx-streaming-paraformer-bilingual-zh-en';
const MODEL_FILES = ['encoder.int8.onnx', 'decoder.int8.onnx', 'tokens.txt'];

function resolveModelDir(options = {}) {
  const configuredDir = options.modelsDir || process.env.EXPRESSION_TRAINER_MODELS_DIR;
  const roots = [
    configuredDir,
    path.join(__dirname, '..', 'models'),
    process.resourcesPath && path.join(process.resourcesPath, 'models')
  ].filter(Boolean);
  const candidates = [];

  for (const root of roots) {
    for (const candidate of [root, path.join(root, MODEL_SUBDIR)]) {
      if (!candidates.includes(candidate)) candidates.push(candidate);
    }
  }

  const modelDir = candidates.find(candidate => MODEL_FILES.every(file => fs.existsSync(path.join(candidate, file))));
  if (modelDir) return modelDir;

  throw new Error(
    `语音识别模型文件未找到。请下载 ${MODEL_SUBDIR}，` +
    '放入项目 models/ 目录，或设置 EXPRESSION_TRAINER_MODELS_DIR 指向模型目录。'
  );
}

/**
 * 初始化 ASR 引擎
 */
async function initASR() {
  if (recognizer) {
    // 已初始化，重置stream即可
    stream = recognizer.createStream();
    isRunning = true;
    console.log('[ASR] 重用已有引擎，创建新stream');
    return;
  }

  const sherpa = require('sherpa-onnx-node');
  const modelDir = resolveModelDir();

  const config = {
    featConfig: {
      sampleRate: 16000,
      featureDim: 80
    },
    modelConfig: {
      paraformer: {
        encoder: path.join(modelDir, 'encoder.int8.onnx'),
        decoder: path.join(modelDir, 'decoder.int8.onnx'),
      },
      tokens: path.join(modelDir, 'tokens.txt'),
      numThreads: 2,
      provider: 'cpu',
      debug: false
    },
    decodingMethod: 'greedy_search',
    maxActivePaths: 4,
    enableEndpoint: true,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20
  };

  recognizer = new sherpa.OnlineRecognizer(config);
  stream = recognizer.createStream();
  isRunning = true;

  console.log('[ASR] 识别引擎初始化完成');
}

/**
 * 接收渲染进程发来的音频数据进行识别
 * @param {Float32Array} samples - 16kHz 单声道音频采样
 * @returns {{ text: string, isFinal: boolean } | null}
 */
function feedAudio(samples) {
  if (!isRunning || !stream || !recognizer) return null;

  // sherpa-onnx-node API: acceptWaveform({ samples, sampleRate })
  stream.acceptWaveform({ samples, sampleRate: 16000 });

  while (recognizer.isReady(stream)) {
    recognizer.decode(stream);
  }

  const result = recognizer.getResult(stream);
  const text = (result.text || '').trim();
  const isEndpoint = recognizer.isEndpoint(stream);

  if (isEndpoint && text) {
    recognizer.reset(stream);
    return { text, isFinal: true };
  } else if (text) {
    return { text, isFinal: false };
  }

  return null;
}

/**
 * 停止识别
 * @returns {string} 最后的未确认文本
 */
function stopRecognition() {
  isRunning = false;

  let finalText = '';
  if (stream && recognizer) {
    stream.inputFinished();
    while (recognizer.isReady(stream)) {
      recognizer.decode(stream);
    }
    const result = recognizer.getResult(stream);
    finalText = (result.text || '').trim();
    stream = null;
  }

  console.log('[ASR] 停止录制');
  return finalText;
}

module.exports = { initASR, feedAudio, stopRecognition, resolveModelDir };
