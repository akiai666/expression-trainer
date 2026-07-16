'use strict';

const assert = require('assert');
const { getReportPrompt } = require('../lib/prompts');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('report prompt restores original coaching capabilities in schema v2', () => {
  const prompt = getReportPrompt('我觉得这个方案可能很好。', {
    duration: 12,
    charCount: 14,
    fillers: 0,
    hedges: 2,
    vagueWords: 1
  });

  assert.ok(prompt.system.includes('"schemaVersion": 2'));
  assert.ok(prompt.system.includes('逐句编辑'));
  assert.ok(prompt.system.includes('全量替换'));
  assert.ok(prompt.system.includes('行为模式'));
  assert.ok(prompt.system.includes('直接性'));
  assert.ok(prompt.system.includes('说服力与结构'));
  assert.ok(prompt.system.includes('optimizedTranscript'));
  assert.ok(prompt.system.includes('不虚构'));
  assert.strictEqual(prompt.system.includes('宇宙无敌少女'), false);
});

test('report prompt keeps custom coaching preferences', () => {
  const prompt = getReportPrompt('内容', {
    duration: 1,
    charCount: 2,
    fillers: 0,
    hedges: 0,
    vagueWords: 0
  }, {
    goals: '先说结论',
    styleRef: '简洁直接',
    customWords: '然后呢'
  });

  assert.ok(prompt.system.includes('先说结论'));
  assert.ok(prompt.system.includes('简洁直接'));
  assert.ok(prompt.system.includes('然后呢'));
});
