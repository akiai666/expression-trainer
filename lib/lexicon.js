/**
 * 词库匹配模块
 *
 * 词库分成两层：DLUT 情感本体作为底库，口语训练词库作为高优先级规则。
 * 运行时只加载一次，并向渲染层返回带字符区间的命中结果，保证字幕、反馈和报告使用同一份分析数据。
 */

const fs = require('fs');
const path = require('path');

let lexiconData = { emotions: {} };
let maxWordLength = 6;
let malformedRows = 0;

const CATEGORY_MAP = {
  PA: '乐', PE: '乐',
  PD: '好', PH: '好', PG: '好', PB: '好', PK: '好',
  NA: '怒',
  NB: '哀', NJ: '哀', NH: '哀', PF: '哀',
  NI: '惧', NC: '惧', NG: '惧',
  NE: '恶', ND: '恶', NN: '恶', NK: '恶', NL: '恶',
  PC: '惊'
};

const FILLER_WORDS = [
  '嗯', '啊', '呃', '额', '那个', '就是', '然后',
  '这个', '对吧', '是吧', '你知道', '怎么说呢',
  '反正', '基本上', '总之', '所以说'
];

const HEDGE_WORDS = [
  '可能', '也许', '大概', '应该', '我觉得', '好像',
  '似乎', '或许', '不一定', '差不多', '算是',
  '某种程度上', '一般来说', '感觉'
];

const VAGUE_TO_PRECISE = {
  '开心': ['欣喜', '雀跃', '兴奋', '欣慰', '畅快', '满足'],
  '难过': ['心酸', '失落', '委屈', '心疼', '沮丧', '低落'],
  '害怕': ['恐惧', '焦虑', '不安', '慌张', '胆怯', '忐忑'],
  '生气': ['愤怒', '恼火', '窝火', '气愤', '不满', '暴躁'],
  '不舒服': ['压抑', '烦躁', '憋屈', '窒息', '煎熬', '疲惫'],
  '很好': ['出色', '精彩', '优秀', '惊艳', '完美', '理想'],
  '很多': ['大量', '海量', '充裕', '丰富', '密集', '可观'],
  '很快': ['迅速', '飞速', '立刻', '瞬间', '即刻', '火速'],
  '很大': ['巨大', '庞大', '显著', '惊人', '可观', '壮观'],
  '很小': ['微小', '细微', '轻微', '渺小', '微不足道', '些许'],
  '好看': ['精致', '优雅', '绚丽', '惊艳', '别致', '夺目'],
  '不好': ['糟糕', '恶劣', '拙劣', '不堪', '惨淡', '低劣'],
  '喜欢': ['热爱', '痴迷', '着迷', '钟爱', '倾心', '沉醉'],
  '讨厌': ['厌恶', '反感', '排斥', '憎恨', '鄙视', '嫌弃'],
  '觉得': ['认为', '判断', '确信', '推断', '意识到', '发现'],
  '想': ['渴望', '期待', '向往', '盼望', '企图', '打算'],
  '做': ['执行', '落实', '推进', '完成', '实施', '操作'],
  '看': ['审视', '观察', '注视', '打量', '端详', '凝视'],
  '说': ['表达', '阐述', '强调', '指出', '坦言', '声明'],
  '想想': ['反思', '回顾', '审视', '复盘', '琢磨', '斟酌']
};

// 产品不主动推荐夸张或绝对化措辞，但原始情感本体中的词仍然保留。
const BLOCKED_SUGGESTION_TERMS = [
  '无敌', '最强', '第一', '绝对', '100%', '百分之百', '必然',
  '碾压级', '毁灭性', '史诗级', '爆炸级', '天花板', '封神'
];

const DLUT_POS = new Set(['adj', 'adv', 'idiom', 'noun', 'nw', 'prep', 'verb']);
const SENSE_KEYS = ['partOfSpeech', 'senseCount', 'senseIndex', 'category', 'subcategory', 'intensity', 'polarity'];

let runtimeRules = {
  fillers: new Set(FILLER_WORDS),
  hedges: new Set(HEDGE_WORDS),
  vagueToPrecise: cloneMap(VAGUE_TO_PRECISE),
  blockedSuggestionTerms: new Set(BLOCKED_SUGGESTION_TERMS)
};

function cloneMap(source) {
  return Object.fromEntries(Object.entries(source).map(([key, values]) => [key, [...values]]));
}

function cleanWordList(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))];
}

function filterAlternatives(values) {
  return cleanWordList(values).filter(value => !runtimeRules.blockedSuggestionTerms.has(value));
}

function mergeAlternative(map, word, alternatives) {
  if (!word || !Array.isArray(alternatives)) return;
  const merged = filterAlternatives([...(map[word] || []), ...alternatives]);
  if (merged.length) map[word] = merged;
}

function toPolarity(value) {
  if (typeof value === 'number') return value;
  if (value === 'positive') return 1;
  if (value === 'negative') return 2;
  return 0;
}

function normalizeCuratedSense(word, value) {
  if (!value || typeof value !== 'object') return null;
  return {
    partOfSpeech: value.partOfSpeech || '',
    senseCount: Number(value.senseCount || 1),
    senseIndex: Number(value.senseIndex || 1),
    category: value.category || '未知',
    subcategory: value.subcategory || '',
    intensity: Number(value.intensity || 0),
    polarity: toPolarity(value.polarity),
    source: 'curated',
    word
  };
}

function sameSense(left, right) {
  return SENSE_KEYS.every(key => String(left[key] ?? '') === String(right[key] ?? ''));
}

function addSense(emotions, word, sense) {
  if (!word || !sense) return;
  if (!emotions[word]) emotions[word] = { ...sense, senses: [] };
  if (!emotions[word].senses.some(existing => sameSense(existing, sense))) {
    emotions[word].senses.push(sense);
  }
  const primary = emotions[word].senses[0] || sense;
  emotions[word] = { ...primary, senses: emotions[word].senses };
}

/**
 * 解析 DLUT 行。源文件中有少量成语自身包含未转义逗号，不能简单取 columns[0]。
 */
function parseDlutLine(line) {
  const columns = line.split(',').map(value => value.trim());
  const posIndex = columns.findIndex((value, index) => index > 0 && DLUT_POS.has(value));
  if (posIndex < 1) return null;

  const word = columns.slice(0, posIndex).join(',');
  const fields = columns.slice(posIndex);
  const [partOfSpeech, senseCount, senseIndex, subcategory, intensity, polarity,
    auxiliarySubcategory, auxiliaryIntensity, auxiliaryPolarity] = fields;

  if (!word || !subcategory || !/^[A-Z]{2}$/.test(subcategory)) return null;

  const sense = {
    partOfSpeech,
    senseCount: Number(senseCount),
    senseIndex: Number(senseIndex),
    category: CATEGORY_MAP[subcategory] || '未知',
    subcategory,
    intensity: Number(intensity),
    polarity: Number(polarity),
    source: 'dlut'
  };

  if (auxiliarySubcategory && /^[A-Z]{2}$/.test(auxiliarySubcategory)) {
    sense.auxiliary = {
      category: CATEGORY_MAP[auxiliarySubcategory] || '未知',
      subcategory: auxiliarySubcategory,
      intensity: Number(auxiliaryIntensity),
      polarity: Number(auxiliaryPolarity)
    };
  }

  return { word, sense };
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    console.warn(`[词库] 无法读取 ${path.basename(filePath)}: ${error.message}`);
    return fallback;
  }
}

/**
 * 加载并合并词库。
 */
function loadLexicon() {
  const dataDir = path.join(__dirname, '..', 'data');
  const curated = readJson(path.join(dataDir, 'emotion-lexicon.json'), { emotions: {} });
  const tiered = readJson(path.join(dataDir, 'tiered-lexicon.json'), {});
  const emotions = {};
  malformedRows = 0;

  const dlutPath = path.join(dataDir, 'dlut-emotion-ontology.csv');
  if (fs.existsSync(dlutPath)) {
    const rows = fs.readFileSync(dlutPath, 'utf-8').split(/\r?\n/).slice(1);
    rows.forEach(line => {
      if (!line.trim()) return;
      const parsed = parseDlutLine(line);
      if (!parsed) {
        malformedRows += 1;
        return;
      }
      addSense(emotions, parsed.word, parsed.sense);
    });
  }

  // 手工词库补充元数据，但不覆盖 DLUT 已有的多义 sense。
  Object.entries(curated.emotions || {}).forEach(([word, value]) => {
    addSense(emotions, word, normalizeCuratedSense(word, value));
  });

  const fillers = new Set([
    ...FILLER_WORDS,
    ...cleanWordList(curated.fillerWords)
  ]);
  const hedges = new Set([
    ...HEDGE_WORDS,
    ...cleanWordList(curated.hedgeWords)
  ]);
  const vagueToPrecise = cloneMap(VAGUE_TO_PRECISE);
  const curatedVague = curated.vagueToPrecise || curated.vagueToPresice || {};
  Object.entries(curatedVague).forEach(([word, alternatives]) => mergeAlternative(vagueToPrecise, word, alternatives));

  // tiered-lexicon 的各分组都是“第一层词 -> 替代池”。
  Object.values(tiered).forEach(group => {
    if (!group || typeof group !== 'object' || Array.isArray(group)) return;
    Object.entries(group).forEach(([word, alternatives]) => mergeAlternative(vagueToPrecise, word, alternatives));
  });

  runtimeRules = {
    fillers,
    hedges,
    vagueToPrecise,
    blockedSuggestionTerms: new Set(BLOCKED_SUGGESTION_TERMS)
  };

  lexiconData = {
    version: curated?._meta?.version || '1.0',
    emotions,
    rules: {
      fillers: [...fillers],
      hedges: [...hedges],
      vagueToPrecise
    }
  };

  const dictionaryWords = [
    ...Object.keys(emotions),
    ...fillers,
    ...hedges,
    ...Object.keys(vagueToPrecise)
  ];
  maxWordLength = Math.max(1, ...dictionaryWords.map(word => word.length));
  console.log(`[词库] 加载完成，共 ${Object.keys(emotions).length} 个情感词，${fillers.size} 个填充词，${hedges.size} 个犹豫词，${Object.keys(vagueToPrecise).length} 个口语替换词`);
  if (malformedRows) console.warn(`[词库] 跳过 ${malformedRows} 条无法解析的词库行`);
}

function ensureLoaded() {
  if (!lexiconData || !lexiconData.emotions) loadLexicon();
}

/**
 * 最大正向匹配，返回带字符区间的 token。
 */
function segmentText(text) {
  ensureLoaded();
  const tokens = [];
  const dictionary = new Set([
    ...runtimeRules.fillers,
    ...runtimeRules.hedges,
    ...Object.keys(runtimeRules.vagueToPrecise),
    ...Object.keys(lexiconData.emotions || {})
  ]);

  let i = 0;
  let position = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i += 1;
      continue;
    }

    let matched = false;
    for (let length = Math.min(maxWordLength, text.length - i); length >= 2; length -= 1) {
      const word = text.substring(i, i + length);
      if (dictionary.has(word)) {
        tokens.push({ word, position, start: i, end: i + length });
        position += 1;
        i += length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      tokens.push({ word: text[i], position, start: i, end: i + 1 });
      position += 1;
      i += 1;
    }
  }

  return tokens;
}

function makeMatch(token, type, extra = {}) {
  return {
    word: token.word,
    position: token.position,
    start: token.start,
    end: token.end,
    type,
    ...extra
  };
}

function buildSpans(matches) {
  const priority = { filler: 1, hedge: 2, vague: 3, emotion: 4 };
  const sorted = [...matches].sort((a, b) => a.start - b.start || priority[a.type] - priority[b.type] || b.end - a.end);
  const spans = [];
  sorted.forEach(match => {
    const overlaps = spans.some(span => match.start < span.end && match.end > span.start);
    if (!overlaps) spans.push(match);
  });
  return spans.sort((a, b) => a.start - b.start);
}

function analyzeText(text) {
  ensureLoaded();
  if (!text || !text.trim()) return null;

  const tokens = segmentText(text);
  const fillers = [];
  const hedges = [];
  const vagueWords = [];
  const emotionWords = [];

  tokens.forEach(token => {
    if (runtimeRules.fillers.has(token.word)) fillers.push(makeMatch(token, 'filler'));
    if (runtimeRules.hedges.has(token.word)) hedges.push(makeMatch(token, 'hedge'));
    if (runtimeRules.vagueToPrecise[token.word]) {
      vagueWords.push(makeMatch(token, 'vague', {
        alternatives: filterAlternatives(runtimeRules.vagueToPrecise[token.word])
      }));
    }
    if (lexiconData.emotions[token.word]) {
      const emotion = lexiconData.emotions[token.word];
      emotionWords.push(makeMatch(token, 'emotion', {
        ...emotion,
        alternatives: []
      }));
    }
  });

  const charCount = [...text].filter(char => !/\s/.test(char)).length;
  const tokenCount = tokens.length;
  const meaningfulTokens = Math.max(0, tokenCount - fillers.length - hedges.length);
  const density = tokenCount ? Math.round((meaningfulTokens / tokenCount) * 100) : 100;
  const matches = [...fillers, ...hedges, ...vagueWords, ...emotionWords];

  return {
    charCount,
    tokenCount,
    // 兼容当前 UI 和旧报告字段，后续统一使用 tokenCount。
    totalWords: tokenCount,
    fillers,
    hedges,
    vagueWords,
    emotionWords,
    spans: buildSpans(matches),
    density,
    lexiconVersion: lexiconData.version,
    suggestions: generateSuggestions(vagueWords, fillers, hedges, emotionWords)
  };
}

function generateSuggestions(vagueWords, fillers, hedges, emotionWords) {
  const suggestions = [];

  emotionWords.forEach(item => {
    const primary = item.senses?.[0] || item;
    // DLUT 是底库，不把每个低强度书面词都弹到实时反馈栏；高强度词仍保留可见提示。
    if (Number(primary.intensity) < 7) return;
    suggestions.push({
      type: 'emotion',
      word: item.word,
      category: primary.category,
      subcategory: primary.subcategory,
      intensity: primary.intensity,
      message: `情绪词：「${item.word}」${primary.category}/${primary.subcategory} · 强度${primary.intensity}`
    });
  });

  vagueWords.forEach(item => {
    const alternatives = filterAlternatives(item.alternatives).slice(0, 3);
    if (!alternatives.length) return;
    suggestions.push({
      type: 'vague',
      original: item.word,
      alternatives,
      message: `「${item.word}」→ 试试更精准的：${alternatives.join('、')}`
    });
  });

  if (fillers.length >= 3) {
    const topFillers = [...new Set(fillers.map(item => item.word))].slice(0, 3);
    suggestions.push({
      type: 'filler',
      message: `填充词偏多（${fillers.length}次）：${topFillers.join('、')}。试试用停顿替代`
    });
  }

  if (hedges.length >= 2) {
    suggestions.push({
      type: 'hedge',
      message: `犹豫表达较多（${hedges.length}次）。试试把「我觉得」改成直接陈述`
    });
  }

  return suggestions;
}

function getLexiconStats() {
  ensureLoaded();
  return {
    emotionWords: Object.keys(lexiconData.emotions || {}).length,
    fillerWords: runtimeRules.fillers.size,
    hedgeWords: runtimeRules.hedges.size,
    vagueWords: Object.keys(runtimeRules.vagueToPrecise).length,
    maxWordLength,
    malformedRows,
    version: lexiconData.version
  };
}

module.exports = {
  loadLexicon,
  analyzeText,
  segmentText,
  getLexiconStats,
  VAGUE_TO_PRECISE,
  FILLER_WORDS,
  HEDGE_WORDS,
  BLOCKED_SUGGESTION_TERMS
};
