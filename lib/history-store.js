'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INDEX_VERSION = 1;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertSafeId(id) {
  if (typeof id !== 'string' || !SAFE_ID.test(id)) {
    throw new TypeError('Invalid history record id');
  }
  return id;
}

function createId(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${stamp}-${crypto.randomBytes(4).toString('hex')}`;
}

function validIsoDate(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function atomicWriteJson(filePath, value) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  );

  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    });
    fs.renameSync(tempPath, filePath);
  } finally {
    try { fs.unlinkSync(tempPath); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

function toSummary(record) {
  const stats = isPlainObject(record.stats) ? record.stats : {};
  return {
    id: record.id,
    createdAt: record.createdAt,
    source: typeof record.source === 'string' ? record.source : 'recording',
    title: typeof record.title === 'string' ? record.title : '',
    duration: Number.isFinite(stats.duration) ? stats.duration : 0,
    charCount: Number.isFinite(stats.charCount)
      ? stats.charCount
      : (typeof record.transcript === 'string' ? [...record.transcript.replace(/\s/g, '')].length : 0),
    score: Number.isFinite(record.score) ? record.score : null,
    summary: typeof record.summary === 'string' ? record.summary : '',
    hasReport: Boolean(record.report)
  };
}

class HistoryStore {
  /**
   * @param {string} userDataDir Electron app.getPath('userData') directory.
   */
  constructor(userDataDir) {
    if (typeof userDataDir !== 'string' || userDataDir.length === 0) {
      throw new TypeError('userDataDir is required');
    }
    this.historyDir = path.resolve(userDataDir, 'history');
    this.indexPath = path.join(this.historyDir, 'index.json');
  }

  init() {
    fs.mkdirSync(this.historyDir, { recursive: true });
    if (!fs.existsSync(this.indexPath)) this._writeIndex([]);
    return this;
  }

  list() {
    this.init();
    const indexed = this._readIndex();
    const candidateIds = new Set(indexed.map(item => item && item.id).filter(id => SAFE_ID.test(id || '')));

    // Include records left behind if a process stopped after writing the record but
    // before updating index.json. index.json itself is deliberately excluded.
    for (const filename of fs.readdirSync(this.historyDir)) {
      if (filename === 'index.json' || !filename.endsWith('.json')) continue;
      const id = filename.slice(0, -5);
      if (SAFE_ID.test(id)) candidateIds.add(id);
    }

    const records = [];
    for (const id of candidateIds) {
      const record = this._readRecord(id);
      if (record) records.push(toSummary(record));
    }
    records.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));

    // Rewriting also repairs a malformed/stale index and removes corrupt entries.
    this._writeIndex(records);
    return records;
  }

  get(id) {
    this.init();
    return this._readRecord(assertSafeId(id));
  }

  save(input) {
    this.init();
    if (!isPlainObject(input)) throw new TypeError('History record must be an object');

    const id = input.id == null ? createId() : assertSafeId(input.id);
    const previous = this._readRecord(id) || {};
    const createdAt = validIsoDate(input.createdAt)
      || validIsoDate(previous.createdAt)
      || new Date().toISOString();
    const record = {
      ...previous,
      ...input,
      id,
      createdAt,
      updatedAt: new Date().toISOString()
    };

    // JSON serialization is both validation and a guard against values that cannot
    // be persisted consistently (for example circular report objects).
    JSON.stringify(record);
    atomicWriteJson(this._recordPath(id), record);

    const summaries = this._readIndex().filter(item => item && item.id !== id);
    summaries.push(toSummary(record));
    summaries.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
    this._writeIndex(summaries);
    return record;
  }

  delete(id) {
    this.init();
    const safeId = assertSafeId(id);
    let existed = false;
    try {
      fs.unlinkSync(this._recordPath(safeId));
      existed = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    this._writeIndex(this._readIndex().filter(item => item && item.id !== safeId));
    return existed;
  }

  _recordPath(id) {
    return path.join(this.historyDir, `${assertSafeId(id)}.json`);
  }

  _readRecord(id) {
    const value = readJson(this._recordPath(id));
    if (!isPlainObject(value) || value.id !== id || !validIsoDate(value.createdAt)) return null;
    return value;
  }

  _readIndex() {
    const value = readJson(this.indexPath);
    if (!isPlainObject(value) || !Array.isArray(value.records)) return [];
    return value.records;
  }

  _writeIndex(records) {
    atomicWriteJson(this.indexPath, { version: INDEX_VERSION, records });
  }
}

function createHistoryStore(userDataDir) {
  return new HistoryStore(userDataDir).init();
}

module.exports = {
  HistoryStore,
  createHistoryStore,
  createId
};
