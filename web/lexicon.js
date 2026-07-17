(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ExpressionLexicon = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const blockedTerms = new Set([
    '无敌', '最强', '第一', '绝对', '100%', '百分之百', '必然',
    '碾压级', '毁灭性', '史诗级', '爆炸级', '天花板', '封神'
  ]);
  const traditionalCharacterMap = {
    '額': '额', '個': '个', '後': '后', '這': '这', '對': '对',
    '總': '总', '說': '说', '許': '许', '應': '应', '覺': '觉',
    '種': '种', '來': '来', '開': '开', '難': '难', '過': '过',
    '氣': '气', '歡': '欢', '討': '讨', '厭': '厌'
  };

  function normalizeForAnalysis(value) {
    return Array.from(String(value || ''), character => traditionalCharacterMap[character] || character).join('');
  }

  function uniqueWords(values) {
    return [...new Set((Array.isArray(values) ? values : [])
      .filter(value => typeof value === 'string' && value.trim())
      .map(value => value.trim()))];
  }

  function cleanAlternatives(values) {
    return uniqueWords(values).filter(value => !blockedTerms.has(value));
  }

  function createAnalyzer(source = {}) {
    const fillers = new Set(uniqueWords(source.fillers).map(normalizeForAnalysis));
    const hedges = new Set(uniqueWords(source.hedges).map(normalizeForAnalysis));
    const vagueToPrecise = Object.fromEntries(Object.entries(source.vagueToPrecise || {})
      .map(([word, values]) => [normalizeForAnalysis(word), cleanAlternatives(values)])
      .filter(([, values]) => values.length));
    const emotions = Object.fromEntries(Object.entries(source.emotions || {})
      .map(([word, details]) => [normalizeForAnalysis(word), details]));
    const dictionary = new Set([
      ...fillers,
      ...hedges,
      ...Object.keys(vagueToPrecise),
      ...Object.keys(emotions)
    ]);
    const maxWordLength = Math.max(1, ...[...dictionary].map(word => word.length));

    function segment(text) {
      const normalizedText = normalizeForAnalysis(text);
      const tokens = [];
      let index = 0;
      while (index < normalizedText.length) {
        let match = '';
        for (let length = Math.min(maxWordLength, normalizedText.length - index); length > 0; length -= 1) {
          const candidate = normalizedText.slice(index, index + length);
          if (dictionary.has(candidate)) {
            match = candidate;
            break;
          }
        }
        const normalizedWord = match || normalizedText[index];
        const end = index + normalizedWord.length;
        tokens.push({ word: text.slice(index, end), normalizedWord, start: index, end });
        index = end;
      }
      return tokens;
    }

    return function analyzeText(value) {
      const text = String(value || '');
      const tokens = segment(text);
      const fillerHits = tokens.filter(token => fillers.has(token.normalizedWord));
      const hedgeHits = tokens.filter(token => hedges.has(token.normalizedWord));
      const vagueWords = tokens.filter(token => vagueToPrecise[token.normalizedWord]).map(token => ({
        ...token,
        alternatives: [...vagueToPrecise[token.normalizedWord]]
      }));
      const emotionWords = tokens.filter(token => emotions[token.normalizedWord]).map(token => ({
        ...token,
        ...emotions[token.normalizedWord]
      }));
      const spans = tokens.flatMap(token => {
        if (fillers.has(token.normalizedWord)) return [{ ...token, type: 'filler' }];
        if (hedges.has(token.normalizedWord)) return [{ ...token, type: 'hedge' }];
        if (vagueToPrecise[token.normalizedWord]) return [{ ...token, type: 'vague' }];
        if (emotions[token.normalizedWord]) return [{ ...token, type: 'emotion' }];
        return [];
      });
      const suggestions = [];
      emotionWords.forEach(item => {
        if (Number(item.intensity || 0) < 7) return;
        suggestions.push({
          type: 'emotion',
          word: item.word,
          message: `情绪词：「${item.word}」${item.category || '未知'}/${item.subcategory || ''} · 强度${Number(item.intensity || 0)}`
        });
      });
      const tokenCount = tokens.filter(token => token.word.trim()).length;
      const density = tokenCount
        ? Math.max(0, Math.round(((tokenCount - fillerHits.length - hedgeHits.length) / tokenCount) * 100))
        : 0;
      return {
        totalWords: tokenCount,
        tokenCount,
        charCount: Array.from(text).length,
        fillers: fillerHits,
        hedges: hedgeHits,
        vagueWords,
        emotionWords,
        spans,
        density,
        suggestions
      };
    };
  }

  async function load(urls = ['lexicon-data.local.json', 'lexicon-data.json']) {
    const candidates = Array.isArray(urls) ? urls : [urls];
    for (const url of candidates) {
      try {
        const response = await fetch(url, { cache: 'no-cache' });
        if (response.ok) return createAnalyzer(await response.json());
      } catch (_) {
        // 静态服务器可能对缺失文件返回 HTML 入口页，继续尝试公开词库。
      }
    }
    throw new Error('词库加载失败');
  }

  return { blockedTerms, cleanAlternatives, normalizeForAnalysis, createAnalyzer, load };
});
