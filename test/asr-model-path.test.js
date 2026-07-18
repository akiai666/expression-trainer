const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveModelDir } = require('../lib/asr');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'expression-trainer-models-'));
const modelDir = path.join(root, 'sherpa-onnx-streaming-paraformer-bilingual-zh-en');
fs.mkdirSync(modelDir, { recursive: true });
['encoder.int8.onnx', 'decoder.int8.onnx', 'tokens.txt'].forEach(file => {
  fs.writeFileSync(path.join(modelDir, file), 'test');
});
const previousModelsDir = process.env.EXPRESSION_TRAINER_MODELS_DIR;

try {
  process.env.EXPRESSION_TRAINER_MODELS_DIR = root;
  assert.strictEqual(typeof resolveModelDir, 'function');
  assert.strictEqual(resolveModelDir(), modelDir);
} finally {
  if (previousModelsDir === undefined) delete process.env.EXPRESSION_TRAINER_MODELS_DIR;
  else process.env.EXPRESSION_TRAINER_MODELS_DIR = previousModelsDir;
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('PASS desktop ASR accepts an external model directory');
