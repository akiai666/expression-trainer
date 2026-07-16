'use strict';

const assert = require('assert');
const { REPORT_MAX_TOKENS, REPORT_TIMEOUT_MS } = require('../lib/ai-feedback');

assert.ok(REPORT_MAX_TOKENS >= 8192, '报告输出预算应至少为 8192 tokens');
assert.ok(REPORT_TIMEOUT_MS >= 60000, '完整报告请求应允许至少 60 秒');
console.log('PASS report requests reserve enough output tokens for the full schema');
