(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ExpressionHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_KEY = 'aki_expression_training_history_v2';

  function createHistoryStore(storage, key = DEFAULT_KEY, limit = 100) {
    function read() {
      try {
        const records = JSON.parse(storage.getItem(key) || '[]');
        return Array.isArray(records) ? records : [];
      } catch {
        return [];
      }
    }

    function write(records) {
      storage.setItem(key, JSON.stringify(records.slice(0, limit)));
    }

    function list() {
      return read().sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
    }

    function get(id) {
      return read().find(record => record.id === id) || null;
    }

    function save(value) {
      const records = read();
      const now = new Date().toISOString();
      const record = {
        ...value,
        id: String(value.id || `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).replace(/[^a-zA-Z0-9_-]/g, ''),
        createdAt: value.createdAt || now,
        updatedAt: now
      };
      const index = records.findIndex(item => item.id === record.id);
      if (index >= 0) records[index] = record;
      else records.unshift(record);
      write(records.sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || ''))));
      return record;
    }

    function remove(id) {
      const records = read();
      const next = records.filter(record => record.id !== id);
      if (next.length === records.length) return false;
      write(next);
      return true;
    }

    return { list, get, save, delete: remove };
  }

  return { DEFAULT_KEY, createHistoryStore };
});
