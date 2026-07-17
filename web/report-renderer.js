'use strict';

/**
 * Report normalization and rendering helpers.
 *
 * This module intentionally has no runtime dependencies. It is safe to use in
 * both Electron's main process and a renderer process. None of the generated
 * HTML contains unescaped report data, and Markdown fallback content is
 * rendered through the small, allow-list based renderer below.
 */

const DEFAULT_TITLE = '表达训练报告';

const ABSOLUTE_LANGUAGE = [
  '宇宙无敌',
  '无敌',
  '最强',
  '碾压级',
  '毁灭性',
  '史诗级',
  '爆炸级',
  '天花板',
  '封神'
];

const REPORT_CSS = `
:root {
  color-scheme: light;
  --accent: #e5007e;
  --ink: #1f2430;
  --muted: #687184;
  --line: #e7e9ef;
  --surface: #ffffff;
  --surface-alt: #f7f8fb;
  --positive: #267a4b;
  --warning: #a66500;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 32px 18px 64px;
  color: var(--ink);
  background: #f2f3f7;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.65;
}
.report { width: min(920px, 100%); min-width: 0; margin: 0 auto; padding: 28px 30px; overflow-wrap: anywhere; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
.report-header { padding-bottom: 20px; border-bottom: 1px solid var(--line); }
.report-header h1 { margin: 0 0 7px; font-size: 28px; letter-spacing: .02em; }
.report-meta { color: var(--muted); font-size: 13px; }
.summary-card { padding: 18px 20px; margin: 18px 0 16px; background: var(--surface-alt); border-radius: 10px; }
.summary-card h2 { margin-top: 0; }
.report-section { min-width: 0; padding: 24px 0; border-top: 1px solid var(--line); }
.report-section h2 { margin: 0 0 14px; font-size: 19px; }
.metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 16px 0 24px; }
.metric { min-width: 0; min-height: 82px; padding: 13px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.metric-label { display: block; color: var(--muted); font-size: 12px; }
.metric-value { display: block; margin-top: 3px; overflow-wrap: anywhere; font-size: 22px; font-weight: 700; }
.report-list { margin: 0; padding-left: 23px; }
.report-list li + li { margin-top: 8px; }
.finding { padding: 13px 15px; border-left: 3px solid var(--accent); background: var(--surface-alt); border-radius: 0 8px 8px 0; }
.finding + .finding { margin-top: 10px; }
.finding p { margin: 4px 0; }
.finding-label { color: var(--muted); font-size: 12px; }
.behavior-item + .behavior-item { margin-top: 18px; }
.behavior-item h3 { margin: 0 0 6px; font-size: 16px; }
.behavior-item p { margin: 5px 0; }
.vocabulary { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 14px; }
.vocabulary th, .vocabulary td { padding: 9px 10px; overflow-wrap: anywhere; word-break: break-word; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
.vocabulary th { color: var(--muted); background: var(--surface-alt); font-weight: 600; }
.transcript { width: 100%; max-width: 100%; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; margin: 0; padding: 16px; overflow-x: hidden; border-radius: 9px; background: #20232b; color: #f5f7fa; font: 14px/1.8 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.optimized-transcript { background: var(--surface-alt); color: var(--ink); font-family: inherit; }
.fallback-markdown { overflow-wrap: anywhere; }
.fallback-markdown pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 13px; border-radius: 8px; background: var(--surface-alt); }
.fallback-markdown table { width: 100%; border-collapse: collapse; }
.fallback-markdown th, .fallback-markdown td { padding: 7px 9px; border: 1px solid var(--line); text-align: left; }
.fallback-markdown blockquote { margin: 10px 0; padding: 4px 15px; border-left: 3px solid var(--accent); color: var(--muted); }
.fallback-markdown a { color: #8f0050; }
.muted { color: var(--muted); }
@media print {
  body { padding: 0; background: white; }
  .report, .report-header, .report-section, .summary-card { box-shadow: none; break-inside: avoid; }
}
@media (max-width: 720px) {
  body { padding: 12px; }
  .report { padding: 20px 18px; }
  .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 430px) {
  .metrics { grid-template-columns: minmax(0, 1fr); }
}
`;

function asText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return String(value);
}

function firstValue(object, keys, fallback = '') {
  if (!object || typeof object !== 'object') return fallback;
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) return object[key];
  }
  return fallback;
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'string') value = value.replace(/[%％,，\s]/g, '');
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stripJsonFence(value) {
  const text = asText(value).replace(/^\uFEFF/, '');
  const match = text.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i);
  return match ? match[1] : text;
}

function repairMissingClosers(source) {
  const stack = [];
  let inString = false;
  let escaped = false;

  for (const character of source) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{' || character === '[') stack.push(character);
    if (character === '}' || character === ']') {
      const expected = character === '}' ? '{' : '[';
      if (stack.pop() !== expected) return null;
    }
  }

  if (inString || escaped || !stack.length) return null;
  const closers = stack.reverse().map(character => character === '{' ? '}' : ']').join('');
  return source.trimEnd() + closers;
}

function parseStructuredReport(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) return input;
  if (typeof input !== 'string') return null;
  const source = stripJsonFence(input);
  if (!source || (source[0] !== '{' && source[0] !== '[')) return null;
  try {
    const parsed = JSON.parse(source);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    const repaired = repairMissingClosers(source);
    if (!repaired) return null;
    try {
      const parsed = JSON.parse(repaired);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }
}

function normalizeList(value) {
  if (!Array.isArray(value)) {
    if (!value) return [];
    return [value];
  }
  return value.filter(item => item !== null && item !== undefined && asText(item).trim() !== '');
}

function normalizeStrength(item) {
  if (typeof item === 'string' || typeof item === 'number') return { text: asText(item) };
  const value = item || {};
  return {
    text: asText(firstValue(value, ['text', 'comment', 'reason', 'description', '内容'])),
    quote: asText(firstValue(value, ['quote', 'original', '原文', 'excerpt'])),
    reason: asText(firstValue(value, ['reason', 'comment', 'why', '点评', '说明']))
  };
}

function normalizeFinding(item) {
  if (typeof item === 'string' || typeof item === 'number') return { text: asText(item) };
  const value = item || {};
  return {
    text: asText(firstValue(value, ['text', 'description', '内容', 'finding'])),
    original: asText(firstValue(value, ['original', 'quote', '原文', 'source'])),
    suggestion: asText(firstValue(value, ['suggestion', 'suggested', '建议', 'direct'])),
    reason: asText(firstValue(value, ['reason', 'why', '原因', 'comment'])),
    dimension: asText(firstValue(value, ['dimension', 'type', '维度']))
  };
}

function normalizeVocabulary(item) {
  if (typeof item === 'string' || typeof item === 'number') {
    return { word: asText(item), alternatives: [], reason: '', category: '' };
  }
  const value = item || {};
  let alternatives = firstValue(value, ['alternatives', 'replacements', 'replacement', 'suggestions', '可替换为'], []);
  if (!Array.isArray(alternatives)) alternatives = alternatives ? [alternatives] : [];
  alternatives = alternatives
    .map(entry => typeof entry === 'object' ? firstValue(entry, ['text', 'word', 'value', '表达']) : entry)
    .map(asText)
    .filter(Boolean);
  return {
    word: asText(firstValue(value, ['word', 'original', '原词', 'source', 'text'])),
    alternatives,
    reason: asText(firstValue(value, ['reason', 'why', '原因', '说明'])),
    category: asText(firstValue(value, ['category', 'type', '类别']))
  };
}

function normalizeBehavior(item) {
  if (typeof item === 'string' || typeof item === 'number') {
    return { dimension: '', analysis: sanitizeAbsoluteLanguage(item), examples: [], suggestion: '' };
  }
  const value = item || {};
  let examples = firstValue(value, ['examples', 'quotes', '例子', '原文'], []);
  if (!Array.isArray(examples)) examples = examples ? [examples] : [];
  return {
    dimension: sanitizeAbsoluteLanguage(firstValue(value, ['dimension', 'type', '维度', 'title'])),
    analysis: sanitizeAbsoluteLanguage(firstValue(value, ['analysis', 'text', 'description', '分析', '内容'])),
    examples: examples.map(entry => asText(typeof entry === 'object' ? firstValue(entry, ['text', 'quote', '原文']) : entry)).filter(Boolean),
    suggestion: sanitizeAbsoluteLanguage(firstValue(value, ['suggestion', 'advice', '建议', 'practice']))
  };
}

function normalizeMetrics(report, context) {
  const source = (report && report.metrics) || {};
  const stats = (context && context.stats) || {};
  const contextText = asText(firstValue(context, ['fullText', 'transcript'], ''));
  const durationSec = toNumber(firstValue(source, ['durationSec', 'duration', '时长'], firstValue(stats, ['durationSec', 'duration'], 0)));
  const totalChars = toNumber(firstValue(source, ['totalChars', 'chars', 'charCount', '总字数'], firstValue(stats, ['totalChars', 'charCount'], contextText.length || firstValue(stats, ['totalWords'], 0))));
  const totalWords = toNumber(firstValue(source, ['totalWords', 'tokenCount'], firstValue(stats, ['totalWords'], totalChars)));
  const fillers = toNumber(firstValue(source, ['fillers', 'fillerCount', '填充词'], firstValue(stats, ['fillers'], 0)));
  const hedges = toNumber(firstValue(source, ['hedges', 'hedgeCount', '犹豫词'], firstValue(stats, ['hedges'], 0)));
  const vagueWords = toNumber(firstValue(source, ['vagueWords', 'vague', 'vagueCount', '笼统词'], firstValue(stats, ['vagueWords'], 0)));
  const calculatedDensity = totalChars > 0 ? ((totalChars - fillers - hedges) / totalChars) * 100 : 0;
  const density = toNumber(firstValue(source, ['density', 'expressionDensity', '表达密度'], calculatedDensity));
  const fillerRate = toNumber(firstValue(source, ['fillerRate', 'fillerFrequency', '填充词频率'], durationSec > 0 ? fillers / (durationSec / 60) : 0));
  const hedgeRate = toNumber(firstValue(source, ['hedgeRate', 'hedgeRatio', '犹豫词占比'], totalChars > 0 ? (hedges / totalChars) * 100 : 0));
  const directness = firstValue(source, ['directness', 'directnessScore', '直接性评分'], null);
  return {
    durationSec,
    totalChars,
    totalWords,
    fillers,
    hedges,
    vagueWords,
    density,
    fillerRate,
    hedgeRate,
    directness: directness === null || directness === '' ? null : toNumber(directness, null)
  };
}

function sanitizeAbsoluteLanguage(value) {
  // Product-facing suggestions should not reintroduce the removed hype words.
  // Do not apply this to the transcript: it is the user's original wording.
  let text = asText(value);
  ABSOLUTE_LANGUAGE.forEach(word => { text = text.split(word).join(''); });
  return text.replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * Turn either the new JSON response or the legacy Markdown response into one
 * predictable shape. `fallbackMarkdown` is kept so callers can show the old
 * response when a provider does not return JSON.
 */
function normalizeReport(input, context = {}) {
  const parsed = parseStructuredReport(input);
  const source = parsed || {};
  const stats = (context && context.stats) || {};
  const transcript = asText(firstValue(source, ['transcript', 'fullText', 'originalText', '逐字稿'], firstValue(context, ['fullText', 'transcript'], '')));
  // Legacy providers may still return the former opening slogan. Remove
  // product-facing hype from that response while leaving the user's original
  // transcript untouched.
  const rawInput = asText(input);
  const looksLikeBrokenJson = !parsed && /^[\[{]/.test(stripJsonFence(rawInput).trimStart());
  const fallbackMarkdown = parsed
    ? ''
    : (looksLikeBrokenJson ? '报告内容不完整，请重新生成报告。' : sanitizeAbsoluteLanguage(sanitizeMarkdown(rawInput)));
  const rawStrengths = firstValue(source, ['strengths', 'highlights', '亮点'], []);
  const rawFindings = firstValue(source, ['findings', 'improvements', 'edits', '逐句编辑', '问题'], []);
  const rawVocabulary = firstValue(source, ['vocabulary', 'replacements', 'precision', '用词精准度'], []);
  const rawBehavior = firstValue(source, ['behaviorAnalysis', 'behavior', 'communicationPatterns', '行为模式分析'], []);
  const summary = sanitizeAbsoluteLanguage(firstValue(source, ['summary', 'overview', '总评', '总评摘要'], ''));
  const report = {
    schemaVersion: toNumber(firstValue(source, ['schemaVersion', 'version'], 1), 1),
    title: sanitizeAbsoluteLanguage(asText(firstValue(source, ['title'], context.title || DEFAULT_TITLE))) || DEFAULT_TITLE,
    generatedAt: firstValue(source, ['generatedAt', 'date', '日期'], context.generatedAt || new Date().toISOString()),
    summary,
    score: firstValue(source, ['score', 'totalScore', '评分'], null),
    metrics: normalizeMetrics(source, context),
    strengths: normalizeList(rawStrengths).map(normalizeStrength).filter(item => item.text || item.quote || item.reason),
    findings: normalizeList(rawFindings).map(normalizeFinding).filter(item => item.text || item.original || item.suggestion || item.reason),
    vocabulary: normalizeList(rawVocabulary).map(normalizeVocabulary)
      .map(item => ({ ...item, alternatives: item.alternatives.map(sanitizeAbsoluteLanguage).filter(Boolean) }))
      .filter(item => item.word || item.alternatives.length || item.reason),
    behaviorAnalysis: normalizeList(rawBehavior).map(normalizeBehavior)
      .filter(item => item.dimension || item.analysis || item.examples.length || item.suggestion),
    optimizedTranscript: sanitizeAbsoluteLanguage(firstValue(source, ['optimizedTranscript', 'rewrittenTranscript', 'improvedTranscript', '优化版完整逐字稿', '优化稿'], '')),
    nextPractice: normalizeList(firstValue(source, ['nextPractice', 'nextSteps', 'practice', '下次练习重点'], []))
      .map(item => sanitizeAbsoluteLanguage(typeof item === 'object' ? firstValue(item, ['text', 'description', '内容', 'step'], '') : item))
      .filter(Boolean),
    transcript,
    fallbackMarkdown,
    // Expose this for consumers that need to distinguish JSON vs legacy output.
    isStructured: Boolean(parsed)
  };
  // Some providers put the complete transcript under `userText`.
  if (!report.transcript) report.transcript = asText(firstValue(source, ['userText'], firstValue(stats, ['fullText'], '')));
  return report;
}

function escapeHtml(value) {
  return asText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function safeUrl(value) {
  const url = asText(value).replace(/[\u0000-\u001f\u007f]/g, '');
  if (/^(?:https?:\/\/|mailto:)/i.test(url)) return url;
  return '';
}

function stripDangerousMarkdownHtml(value) {
  return asText(value)
    .replace(/<\s*(?:script|style|iframe|object|embed|form|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*(?:script|style|iframe|object|embed|form|svg|math)\s*>/gi, '')
    .replace(/<[^>]*>/g, '');
}

/** Remove active HTML and dangerous links while retaining ordinary Markdown. */
function sanitizeMarkdown(value) {
  let source = stripDangerousMarkdownHtml(value).replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
  // A dangerous Markdown link is reduced to its visible label.
  source = source.replace(/\[([^\]]+)\]\(\s*([^\s)]+)(?:\s+"[^"]*")?\s*\)/g, (match, label, url) => {
    return safeUrl(url) ? `[${label}](${url})` : label;
  });
  // Also neutralize protocol-looking text left behind by malformed links or
  // raw HTML attributes. It is harmless as prose and avoids creating a
  // dangerous token if a later consumer renders the Markdown differently.
  source = source.replace(/\b(?:javascript|vbscript|data)\s*:/gi, '');
  return source;
}

function renderInlineMarkdown(value) {
  let source = stripDangerousMarkdownHtml(value);
  const tokens = [];
  const stash = html => `\u0001${tokens.push(html) - 1}\u0002`;

  // Stash constructs before escaping their delimiters. Labels and code are
  // escaped independently, so report content can never become markup.
  source = source.replace(/!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+"[^"]*")?\s*\)/g, (match, alt) => escapeHtml(alt));
  source = source.replace(/\[([^\]]+)\]\(\s*([^\s)]+)(?:\s+"[^"]*")?\s*\)/g, (match, label, url) => {
    const href = safeUrl(url);
    return href ? stash(`<a href="${escapeAttribute(href)}" rel="noreferrer noopener">${escapeHtml(label)}</a>`) : escapeHtml(label);
  });
  source = source.replace(/`([^`\n]+)`/g, (match, code) => stash(`<code>${escapeHtml(code)}</code>`));
  source = source.replace(/\*\*([^*\n]+)\*\*/g, (match, text) => stash(`<strong>${escapeHtml(text)}</strong>`));
  source = source.replace(/__([^_\n]+)__/g, (match, text) => stash(`<strong>${escapeHtml(text)}</strong>`));
  source = source.replace(/\*([^*\n]+)\*/g, (match, text) => stash(`<em>${escapeHtml(text)}</em>`));
  source = source.replace(/_([^_\n]+)_/g, (match, text) => stash(`<em>${escapeHtml(text)}</em>`));
  let escaped = escapeHtml(source);
  escaped = escaped.replace(/\u0001(\d+)\u0002/g, (match, index) => tokens[Number(index)] || '');
  return escaped;
}

function isTableSeparator(line) {
  const cells = line.trim().replace(/^\||\|$/g, '').split('|');
  return cells.length > 0 && cells.every(cell => /^\s*:?-{3,}:?\s*$/.test(cell));
}

function splitTableRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
}

/**
 * Small allow-list Markdown renderer. Unsupported syntax is emitted as text;
 * raw HTML is removed before escaping. This is deliberately conservative.
 */
function markdownToHtml(markdown) {
  const source = sanitizeMarkdown(markdown);
  if (!source.trim()) return '';
  const lines = source.split('\n');
  const output = [];
  let paragraph = [];
  let list = null;
  let code = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${paragraph.map(renderInlineMarkdown).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const tag = list.ordered ? 'ol' : 'ul';
    output.push(`<${tag} class="report-list">${list.items.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${tag}>`);
    list = null;
  };
  const flushCode = () => {
    if (code === null) return;
    output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    code = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      flushParagraph();
      flushList();
      if (code === null) code = [];
      else flushCode();
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const tableNext = lines[index + 1];
    if (/^\s*\|?.+\|.+\|?\s*$/.test(line) && tableNext && isTableSeparator(tableNext)) {
      flushParagraph();
      flushList();
      const header = splitTableRow(line);
      index += 1;
      const rows = [];
      while (index + 1 < lines.length && /^\s*\|?.+\|.+\|?\s*$/.test(lines[index + 1]) && !isTableSeparator(lines[index + 1])) {
        index += 1;
        rows.push(splitTableRow(lines[index]));
      }
      const headHtml = header.map(cell => `<th>${renderInlineMarkdown(cell)}</th>`).join('');
      const bodyHtml = rows.map(row => {
        const cells = header.map((_, col) => `<td>${renderInlineMarkdown(row[col] || '')}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      output.push(`<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`);
      continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*(?:---+|___+|\*\s*\*\s*\*+)\s*$/.test(line)) {
      flushParagraph();
      flushList();
      output.push('<hr>');
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      output.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    const listItem = line.match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      const ordered = /^\d/.test(listItem[1]);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(listItem[2]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushCode();
  flushParagraph();
  flushList();
  return output.join('\n');
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return asText(value) || '';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatMetricValue(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (key === 'durationSec') return `${Number.isFinite(number) ? Math.round(number) : value} 秒`;
  if (key === 'density' || key === 'hedgeRate' || key === 'directness') {
    return Number.isFinite(number) ? `${Math.round(Math.max(0, Math.min(100, number)))}%` : '—';
  }
  if (key === 'fillerRate') return Number.isFinite(number) ? `${number.toFixed(1)} 次/分钟` : '—';
  return asText(value);
}

function metricEntries(metrics) {
  return [
    ['durationSec', '录音时长'],
    ['totalChars', '总字数'],
    ['fillers', '填充词'],
    ['hedges', '犹豫词'],
    ['vagueWords', '笼统词'],
    ['density', '表达密度'],
    ['fillerRate', '填充词频率'],
    ['directness', '直接性评分']
  ].map(([key, label]) => ({ key, label, value: formatMetricValue(key, metrics[key]) }));
}

function renderStrengthHtml(item) {
  const parts = [];
  if (item.quote) parts.push(`<strong>“${escapeHtml(item.quote)}”</strong>`);
  if (item.text) parts.push(escapeHtml(item.text));
  if (item.reason && item.reason !== item.text) parts.push(`<span class="muted">${escapeHtml(item.reason)}</span>`);
  return `<li>${parts.join(' — ')}</li>`;
}

function renderFindingHtml(item) {
  const content = [];
  if (item.dimension) content.push(`<span class="finding-label">${escapeHtml(item.dimension)}</span>`);
  if (item.original) content.push(`<p><span class="finding-label">原文</span>：${escapeHtml(item.original)}</p>`);
  if (item.suggestion) content.push(`<p><span class="finding-label">建议</span>：${escapeHtml(item.suggestion)}</p>`);
  if (item.text) content.push(`<p>${escapeHtml(item.text)}</p>`);
  if (item.reason) content.push(`<p><span class="finding-label">原因</span>：${escapeHtml(item.reason)}</p>`);
  return `<article class="finding">${content.join('')}</article>`;
}

function renderBehaviorHtml(item) {
  const content = [`<h3>${escapeHtml(item.dimension || '行为观察')}</h3>`];
  if (item.analysis) content.push(`<p>${escapeHtml(item.analysis)}</p>`);
  if (item.examples.length) content.push(`<p><span class="finding-label">原文例子</span>：${item.examples.map(example => `“${escapeHtml(example)}”`).join('；')}</p>`);
  if (item.suggestion) content.push(`<p><span class="finding-label">改进方式</span>：${escapeHtml(item.suggestion)}</p>`);
  return `<article class="behavior-item">${content.join('')}</article>`;
}

function renderStructuredHtml(report) {
  const sections = [];
  if (report.summary || report.score !== null) {
    const score = report.score === null || report.score === undefined ? '' : `<span class="muted">评分：${escapeHtml(report.score)}</span>`;
    sections.push(`<section class="summary-card"><h2>总评 ${score}</h2><p>${escapeHtml(report.summary || '暂无总结')}</p></section>`);
  }
  const metrics = metricEntries(report.metrics);
  sections.push(`<section class="metrics" aria-label="数据指标">${metrics.map(metric => `<div class="metric"><span class="metric-label">${metric.label}</span><span class="metric-value">${escapeHtml(metric.value)}</span></div>`).join('')}</section>`);
  if (report.strengths.length) sections.push(`<section class="report-section"><h2>亮点</h2><ul class="report-list">${report.strengths.map(renderStrengthHtml).join('')}</ul></section>`);
  if (report.findings.length) sections.push(`<section class="report-section"><h2>逐句编辑</h2>${report.findings.map(renderFindingHtml).join('')}</section>`);
  if (report.vocabulary.length) {
    const rows = report.vocabulary.map(item => `<tr><td>${escapeHtml(item.word)}</td><td>${item.alternatives.map(escapeHtml).join(' / ') || '—'}</td><td>${escapeHtml(item.reason || item.category)}</td></tr>`).join('');
    sections.push(`<section class="report-section"><h2>用词精准度</h2><table class="vocabulary"><thead><tr><th>原词</th><th>精准替代</th><th>说明</th></tr></thead><tbody>${rows}</tbody></table></section>`);
  }
  if (report.behaviorAnalysis.length) sections.push(`<section class="report-section"><h2>行为模式分析</h2>${report.behaviorAnalysis.map(renderBehaviorHtml).join('')}</section>`);
  if (report.transcript) sections.push(`<section class="report-section"><h2>原始完整逐字稿</h2><pre class="transcript">${escapeHtml(report.transcript)}</pre></section>`);
  if (report.optimizedTranscript) sections.push(`<section class="report-section"><h2>优化版完整逐字稿</h2><pre class="transcript optimized-transcript">${escapeHtml(report.optimizedTranscript)}</pre></section>`);
  if (report.nextPractice.length) sections.push(`<section class="report-section"><h2>下次练习重点</h2><ul class="report-list">${report.nextPractice.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`);
  return sections.join('\n');
}

function renderReportBody(input, context = {}) {
  const report = normalizeReport(input, context);
  if (report.isStructured) return renderStructuredHtml(report);
  const analysis = `<section class="report-section fallback-markdown"><h2>分析内容</h2>${markdownToHtml(report.fallbackMarkdown)}</section>`;
  const transcript = report.transcript
    ? `<section class="report-section"><h2>原始完整逐字稿</h2><pre class="transcript">${escapeHtml(report.transcript)}</pre></section>`
    : '';
  return `${analysis}${transcript}`;
}

function renderReportFragment(input, context = {}) {
  return `<div class="report">${renderReportBody(input, context)}</div>`;
}

function renderReportHtml(input, context = {}) {
  const report = normalizeReport(input, context);
  const title = escapeHtml(report.title || DEFAULT_TITLE);
  const meta = [`日期：${formatDate(report.generatedAt)}`];
  if (report.isStructured) meta.push('结构化报告');
  else meta.push('兼容 Markdown 报告');
  const body = renderReportBody(input, context);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${REPORT_CSS}</style>
</head>
<body><main class="report">
<header class="report-header"><h1>${title}</h1><div class="report-meta">${meta.map(escapeHtml).join(' · ')}</div></header>
${body}
</main></body>
</html>`;
}

function listMarkdown(title, values) {
  if (!values.length) return '';
  return `## ${title}\n\n${values.map(item => `- ${item}`).join('\n')}\n`;
}

function renderReportMarkdown(input, context = {}) {
  const report = normalizeReport(input, context);
  if (!report.isStructured) {
    const fallback = sanitizeMarkdown(report.fallbackMarkdown);
    return report.transcript
      ? `${fallback}${fallback ? '\n\n' : ''}## 完整逐字稿\n\n${sanitizeMarkdown(report.transcript)}\n`
      : fallback;
  }
  const lines = [`# ${report.title || DEFAULT_TITLE}`, '', `**日期**: ${formatDate(report.generatedAt)}`, ''];
  if (report.score !== null && report.score !== undefined) lines.push(`**评分**: ${asText(report.score)}`, '');
  lines.push('## 总评', '', report.summary || '暂无总结', '');
  lines.push('## 数据', '', '| 指标 | 数值 |', '| --- | --- |');
  metricEntries(report.metrics).forEach(metric => lines.push(`| ${metric.label} | ${metric.value} |`));
  lines.push('');
  if (report.strengths.length) {
    lines.push('## 亮点', '');
    report.strengths.forEach(item => {
      const quote = item.quote ? `“${item.quote}”` : '';
      const text = item.text || item.reason;
      lines.push(`- ${[quote, text].filter(Boolean).join(' — ')}`);
    });
    lines.push('');
  }
  if (report.findings.length) {
    lines.push('## 逐句编辑', '');
    report.findings.forEach(item => {
      if (item.original) lines.push(`> 原文：${item.original}`, '>');
      if (item.suggestion) lines.push(`> 建议：${item.suggestion}`, '>');
      if (item.reason || item.text) lines.push(`> 原因：${item.reason || item.text}`, '>');
      lines.push('');
    });
  }
  if (report.vocabulary.length) {
    lines.push('## 用词精准度', '', '| 原词 | 精准替代 | 说明 |', '| --- | --- | --- |');
    report.vocabulary.forEach(item => lines.push(`| ${item.word} | ${item.alternatives.join(' / ') || '—'} | ${item.reason || item.category || ''} |`));
    lines.push('');
  }
  if (report.behaviorAnalysis.length) {
    lines.push('## 行为模式分析', '');
    report.behaviorAnalysis.forEach(item => {
      lines.push(`### ${item.dimension || '行为观察'}`, '');
      if (item.analysis) lines.push(item.analysis, '');
      if (item.examples.length) lines.push(`**原文例子**：${item.examples.map(example => `“${example}”`).join('；')}`, '');
      if (item.suggestion) lines.push(`**改进方式**：${item.suggestion}`, '');
    });
  }
  if (report.transcript) lines.push(`## ${report.schemaVersion >= 2 ? '原始完整逐字稿' : '完整逐字稿'}`, '', report.transcript, '');
  if (report.optimizedTranscript) lines.push('## 优化版完整逐字稿', '', report.optimizedTranscript, '');
  if (report.nextPractice.length) lines.push(listMarkdown('下次练习重点', report.nextPractice));
  return sanitizeMarkdown(lines.join('\n'));
}

globalThis.ReportRenderer = {
  DEFAULT_TITLE,
  REPORT_CSS,
  ABSOLUTE_LANGUAGE,
  escapeHtml,
  sanitizeMarkdown,
  markdownToHtml,
  normalizeReport,
  renderReportFragment,
  renderReportHtml,
  renderReportMarkdown
};
