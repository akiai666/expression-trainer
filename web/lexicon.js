(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ExpressionLexicon = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const blockedTerms = new Set([
    '无敌', '最强', '第一', '绝对', '100%', '百分之百', '必然',
    '碾压级', '毁灭性', '史诗级', '爆炸级', '天花板', '封神'
  ]);

  function uniqueWords(values) {
    return [...new Set((Array.isArray(values) ? values : [])
      .filter(value => typeof value === 'string' && value.trim())
      .map(value => value.trim()))];
  }

  function cleanAlternatives(values) {
    return uniqueWords(values).filter(value => !blockedTerms.has(value));
  }

  function createAnalyzer(source = {}) {
    const fillers = new Set(uniqueWords(source.fillers));
    const hedges = new Set(uniqueWords(source.hedges));
    const vagueToPrecise = Object.fromEntries(Object.entries(source.vagueToPrecise || {})
      .map(([word, values]) => [word, cleanAlternatives(values)])
      .filter(([, values]) => values.length));
    const emotions = source.emotions || {};
    const dictionary = new Set([
      ...fillers,
      ...hedges,
      ...Object.keys(vagueToPrecise),
      ...Object.keys(emotions)
    ]);
    const maxWordLength = Math.max(1, ...[...dictionary].map(word => word.length));

    function segment(text) {
      const tokens = [];
      let index = 0;
      while (index < text.length) {
        let match = '';
        for (let length = Math.min(maxWordLength, text.length - index); length > 0; length -= 1) {
          const candidate = text.slice(index, index + length);
          if (dictionary.has(candidate)) {
            match = candidate;
            break;
          }
        }
        const word = match || text[index];
        tokens.push({ word, start: index, end: index + word.length });
        index += word.length;
      }
      return tokens;
    }

    return function analyzeText(value) {
      const text = String(value || '');
      const tokens = segment(text);
      const fillerHits = tokens.filter(token => fillers.has(token.word));
      const hedgeHits = tokens.filter(token => hedges.has(token.word));
      const vagueWords = tokens.filter(token => vagueToPrecise[token.word]).map(token => ({
        ...token,
        alternatives: [...vagueToPrecise[token.word]]
      }));
      const emotionWords = tokens.filter(token => emotions[token.word]).map(token => ({
        ...token,
        ...emotions[token.word]
      }));
      const spans = tokens.flatMap(token => {
        if (fillers.has(token.word)) return [{ ...token, type: 'filler' }];
        if (hedges.has(token.word)) return [{ ...token, type: 'hedge' }];
        if (vagueToPrecise[token.word]) return [{ ...token, type: 'vague' }];
        if (emotions[token.word]) return [{ ...token, type: 'emotion' }];
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

  async function load(url = 'lexicon-data.json') {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`词库加载失败（${response.status}）`);
    return createAnalyzer(await response.json());
  }

  return { blockedTerms, cleanAlternatives, createAnalyzer, load };
});
