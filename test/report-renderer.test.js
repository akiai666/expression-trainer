'use strict';

const assert = require('assert');
const renderer = require('../lib/report-renderer');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('normalizes fenced structured JSON and maps desktop stats', () => {
  const report = renderer.normalizeReport('```json\n' + JSON.stringify({
    schemaVersion: 1,
    summary: '表达清楚',
    strengths: ['开头有结论'],
    vocabulary: [{ word: '很好', alternatives: ['具体', '无敌'] }],
    nextPractice: [{ text: '先说结论' }]
  }) + '\n```', {
    fullText: '我觉得很好',
    stats: { duration: 20, totalWords: 6, fillers: 1, hedges: 2, vagueWords: 1 }
  });

  assert.strictEqual(report.isStructured, true);
  assert.strictEqual(report.metrics.durationSec, 20);
  assert.strictEqual(report.metrics.totalChars, 5);
  assert.deepStrictEqual(report.nextPractice, ['先说结论']);
  assert.deepStrictEqual(report.vocabulary[0].alternatives, ['具体']);
  assert.strictEqual(report.transcript, '我觉得很好');
});

test('escapes HTML and blocks dangerous Markdown links', () => {
  const html = renderer.renderReportHtml({ summary: '<b>原文</b>', transcript: '<img src=x onerror=alert(1)>' });
  assert.strictEqual(/<script/i.test(html), false);
  assert.strictEqual(/<img/i.test(html), false);
  assert.strictEqual(/javascript:/i.test(html), false);
  assert.ok(html.includes('&lt;b&gt;原文&lt;/b&gt;'));
  const fallback = renderer.renderReportHtml('# 标题\n\n[危险](javascript:alert(1)) [安全](https://example.com)');
  assert.strictEqual(/javascript:/i.test(fallback), false);
  assert.ok(fallback.includes('https://example.com'));
});

test('renders a standalone structured HTML report with inline CSS', () => {
  const html = renderer.renderReportHtml({
    title: '表达训练报告',
    generatedAt: '2026-01-01T00:00:00.000Z',
    summary: '总结',
    metrics: { durationSec: 12, totalChars: 100, fillers: 2, hedges: 1, vagueWords: 3, density: 94 },
    strengths: [{ quote: '先说结论', reason: '听众容易跟上' }],
    findings: [{ original: '可能吧', suggestion: '我判断', reason: '明确立场' }],
    vocabulary: [{ word: '很多', alternatives: ['数量超过三成'], reason: '给出数字' }],
    transcript: '很多人 < 都这样做',
    nextPractice: ['每段先说结论']
  });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<style>'));
  assert.ok(html.includes('完整逐字稿'));
  assert.ok(html.includes('数量超过三成'));
  assert.ok(html.includes('很多人 &lt; 都这样做')); // transcript is escaped when it contains markup
});

test('exports structured reports as Markdown', () => {
  const markdown = renderer.renderReportMarkdown({
    summary: '总结',
    metrics: { totalChars: 20 },
    vocabulary: [{ word: '很多', alternatives: ['三成'], reason: '精确' }],
    transcript: '原文'
  });
  assert.ok(markdown.startsWith('# 表达训练报告'));
  assert.ok(markdown.includes('| 原词 | 精准替代 | 说明 |'));
  assert.ok(markdown.includes('## 完整逐字稿'));
});

test('keeps the original transcript in legacy Markdown fallback exports', () => {
  const context = { fullText: '原始逐字稿 <内容>' };
  const html = renderer.renderReportHtml('## 总评\n\n旧格式报告', context);
  const markdown = renderer.renderReportMarkdown('## 总评\n\n旧格式报告', context);
  assert.ok(html.includes('完整逐字稿'));
  assert.ok(html.includes('原始逐字稿 &lt;内容&gt;'));
  assert.ok(markdown.includes('## 完整逐字稿'));
  assert.ok(markdown.includes('原始逐字稿'));
  assert.strictEqual(markdown.includes('<内容>'), false);
});

test('normalizes schema v2 behavior analysis and optimized transcript', () => {
  const report = renderer.normalizeReport({
    schemaVersion: 2,
    behaviorAnalysis: [
      { dimension: '直接性', analysis: '立场出现较晚', examples: ['我觉得可能'], suggestion: '先给结论' }
    ],
    optimizedTranscript: '先说结论，再解释原因。'
  }, { fullText: '我觉得可能先解释一下。' });

  assert.strictEqual(report.schemaVersion, 2);
  assert.deepStrictEqual(report.behaviorAnalysis, [{
    dimension: '直接性',
    analysis: '立场出现较晚',
    examples: ['我觉得可能'],
    suggestion: '先给结论'
  }]);
  assert.strictEqual(report.optimizedTranscript, '先说结论，再解释原因。');
  assert.strictEqual(report.transcript, '我觉得可能先解释一下。');
});

test('preserves paragraph breaks in optimized transcript', () => {
  const report = renderer.normalizeReport({
    schemaVersion: 2,
    optimizedTranscript: '第一段结论。\n\n第二段解释。'
  });
  assert.strictEqual(report.optimizedTranscript, '第一段结论。\n\n第二段解释。');
});

test('renders screen fragment without duplicate report header', () => {
  const fragment = renderer.renderReportFragment({
    summary: '总结',
    behaviorAnalysis: [{ dimension: '填充词模式', analysis: '集中在转场处' }],
    optimizedTranscript: '这是优化后的完整表达。'
  }, { fullText: '这是原始表达。' });

  assert.ok(fragment.startsWith('<div class="report">'));
  assert.strictEqual(fragment.includes('report-header'), false);
  assert.ok(fragment.includes('行为模式分析'));
  assert.ok(fragment.includes('优化版完整逐字稿'));
  assert.ok(fragment.includes('完整逐字稿'));
});

test('rounds percentage metrics and prevents long values from leaking into output', () => {
  const html = renderer.renderReportHtml({
    summary: '总结',
    metrics: { density: 97.5961538461, directness: 82.49, fillerRate: 3.96 }
  });

  assert.ok(html.includes('98%'));
  assert.ok(html.includes('82%'));
  assert.ok(html.includes('4.0 次/分钟'));
  assert.strictEqual(html.includes('97.5961538461'), false);
});

test('exports restored report sections and optimized transcript to Markdown', () => {
  const markdown = renderer.renderReportMarkdown({
    schemaVersion: 2,
    summary: '总结',
    findings: [{ original: '可能吧', suggestion: '我判断', reason: '明确立场' }],
    behaviorAnalysis: [{ dimension: '直接性', analysis: '表达偏绕', suggestion: '先给结论' }],
    optimizedTranscript: '我判断这个方案可行。'
  }, { fullText: '我觉得可能可行吧。' });

  assert.ok(markdown.includes('## 逐句编辑'));
  assert.ok(markdown.includes('## 行为模式分析'));
  assert.ok(markdown.includes('## 原始完整逐字稿'));
  assert.ok(markdown.includes('## 优化版完整逐字稿'));
});

test('standalone report CSS constrains long text, tables, and metric cards', () => {
  const html = renderer.renderReportHtml({ summary: '总结', transcript: '连续长文本'.repeat(100) });
  assert.ok(html.includes('overflow-wrap: anywhere'));
  assert.ok(html.includes('minmax(0, 1fr)'));
  assert.ok(html.includes('table-layout: fixed'));
});

test('repairs a structured report missing only closing brackets', () => {
  const complete = JSON.stringify({
    schemaVersion: 2,
    summary: '报告完整内容',
    behaviorAnalysis: [{ dimension: '直接性', analysis: '表达偏绕' }],
    optimizedTranscript: '先说结论。'
  });
  const truncated = complete.slice(0, -1);
  const report = renderer.normalizeReport(truncated, { fullText: '原文' });

  assert.strictEqual(report.isStructured, true);
  assert.strictEqual(report.summary, '报告完整内容');
  assert.strictEqual(report.optimizedTranscript, '先说结论。');
});

test('never exposes unrecoverable raw JSON as report content', () => {
  const broken = '{"schemaVersion":2,"summary":"内容在字符串中途截断';
  const report = renderer.normalizeReport(broken, { fullText: '原文' });
  const fragment = renderer.renderReportFragment(broken, { fullText: '原文' });

  assert.strictEqual(report.isStructured, false);
  assert.ok(report.fallbackMarkdown.includes('报告内容不完整'));
  assert.strictEqual(report.fallbackMarkdown.includes('schemaVersion'), false);
  assert.strictEqual(fragment.includes('schemaVersion'), false);
});
