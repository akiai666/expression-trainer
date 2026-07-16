'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

test('screen report CSS prevents horizontal overflow', () => {
  assert.match(css, /\.report\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.report \.transcript\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*overflow-x:\s*hidden/s);
  assert.match(css, /\.report \.vocabulary\s*\{[^}]*table-layout:\s*fixed/s);
});

test('screen metrics use at most four responsive columns', () => {
  assert.match(css, /\.metrics\s*\{[^}]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /@media\s*\(max-width:\s*720px\)[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
});

test('report modal and actions can shrink and wrap', () => {
  assert.match(css, /\.modal-content\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.modal-header-actions\s*\{[^}]*flex-wrap:\s*wrap/s);
});

test('renderer IPC returns and consumes a dedicated fragment', () => {
  assert.ok(main.includes('fragmentHtml: renderReportFragment(report, context)'));
  assert.ok(app.includes('this.reportBody.innerHTML = rendered.fragmentHtml'));
});
