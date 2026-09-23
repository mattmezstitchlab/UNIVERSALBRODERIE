import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, resizeGrid, setCell } from '../src/project.mjs';
import { renderGrid2D, assertGridViewMatchesProject } from '../src/grid-view.mjs';
import { calculateMetrics } from '../src/calculations.mjs';
import { serializeProject, parseProject } from '../src/io.mjs';
import { setProgress } from '../src/progress.mjs';

// DOM SVG minimal, sans dépendance ni navigateur : on teste les vraies fonctions de rendu.
class SVGNode {
  constructor(tag) { this.tag = tag; this.attributes = new Map(); this.children = []; this.content = ''; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  set textContent(value) { this.content = String(value); this.children = []; }
  get textContent() { return this.content + this.children.map(child => child.textContent).join(''); }
  appendChild(node) { this.children.push(node); return node; }
  querySelectorAll(selector) {
    const result = [];
    const walk = node => {
      for (const child of node.children) {
        if (selector === '[data-row][data-column]' && child.attributes.has('data-row') && child.attributes.has('data-column')) {
          result.push(child);
        } else if (selector.startsWith('.') && child.getAttribute('class')?.split(' ').includes(selector.slice(1))) {
          result.push(child);
        }
        walk(child);
      }
    };
    walk(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
globalThis.document = { createElementNS: (_, tag) => new SVGNode(tag) };

test('grille 2D = grille du projet = grille réimportée, case par case', () => {
  let project = createProject('heart', 36, 'display');
  let svg = renderGrid2D(project, { cellSize: 18, selected: { row: 0, column: 0 } });
  assert.equal(svg.getAttribute('data-positions'), '1296');
  assert.equal(svg.getAttribute('role'), 'grid');
  assert.equal(svg.querySelectorAll('[data-row][data-column]').length, 1296);
  assert.equal(assertGridViewMatchesProject(svg, project), true);
  const first = svg.querySelectorAll('[data-row][data-column]')[0];
  assert.equal(first.getAttribute('aria-selected'), 'true');
  assert.equal(first.getAttribute('data-thread-id'), '');
  assert.equal(first.getAttribute('data-symbol'), '');

  project = setCell(project, 0, 0, { threadId: 'thread-006', stitchType: 'cross' });
  svg = renderGrid2D(project, { selected: { row: 0, column: 0 }, showGrid: false });
  assert.equal(assertGridViewMatchesProject(svg, project), true);
  const changed = svg.querySelectorAll('[data-row][data-column]')[0];
  assert.equal(changed.getAttribute('data-thread-id'), 'thread-006');
  assert.equal(changed.getAttribute('data-stitch-type'), 'cross');
  assert.equal(changed.getAttribute('data-symbol'), '✦');
  assert.equal(changed.querySelector('.grid-cell').getAttribute('fill'), '#d8a94e');
  assert.equal(calculateMetrics(project).crossCount, 867);
  assert.deepEqual(parseProject(serializeProject(project)).grid[0][0], project.grid[0][0]);

  changed.setAttribute('data-symbol', 'symbole erroné');
  assert.throws(() => assertGridViewMatchesProject(svg, project), /Différence grille\/données/);
  project = setCell(project, 0, 0, null);
  svg = renderGrid2D(project);
  assert.equal(assertGridViewMatchesProject(svg, project), true);
  assert.equal(svg.querySelectorAll('[data-row][data-column]')[0].getAttribute('data-thread-id'), '');
  assert.equal(parseProject(serializeProject(project)).grid[0][0], null);
});

test('légende ciblée, états de réalisation et plages de vraies lignes sont des attributs de vue, pas des suppressions', () => {
  const project = setProgress(createProject('heart', 36, 'view-phase2'), 0, 5, 'done');
  const snapshot = JSON.stringify(project.grid);
  const svg = renderGrid2D(project, { cellSize: 12, highlightThreadId: project.grid[0][5].threadId,
    rowRange: { start: 0, end: 1 }, mode: 'stitch',
    region: { top: 0, bottom: 1, left: 5, right: 6 } });
  const cells = svg.querySelectorAll('[data-row][data-column]');
  const done = cells[5];
  assert.equal(done.getAttribute('data-progress'), 'done');
  assert.equal(done.getAttribute('data-symbol'), project.palette.find(thread => thread.threadId === done.getAttribute('data-thread-id')).symbol);
  assert.equal(done.getAttribute('data-in-reading-range'), 'true');
  assert.ok(done.getAttribute('class').includes('cell-done'));
  assert.ok(cells[4 * 36 + 8].getAttribute('class').includes('cell-outside-reading'));
  assert.ok(svg.querySelector('.region-selection'));
  assert.equal(svg.getAttribute('data-axis-step'), '5');
  assert.equal(svg.querySelectorAll('[data-row][data-column]').length, 1296);
  assert.equal(assertGridViewMatchesProject(svg, project), true);
  assert.equal(JSON.stringify(project.grid), snapshot);
  done.setAttribute('data-progress', 'todo');
  assert.throws(() => assertGridViewMatchesProject(svg, project), /Différence grille\/données/);
});

test('patron rectangulaire 100 × 80 rendu sans cellules manquantes ni hors grille', () => {
  const project = resizeGrid(createProject('moon', 36, 'rectangle-display'), 100, 80);
  const svg = renderGrid2D(project, { cellSize: 12 });
  assert.equal(svg.querySelectorAll('[data-row][data-column]').length, 8000);
  assert.equal(assertGridViewMatchesProject(svg, project), true);
  assert.equal(svg.querySelectorAll('[data-row][data-column]').at(-1).getAttribute('data-column'), '99');
  assert.equal(svg.querySelectorAll('[data-row][data-column]').at(-1).getAttribute('data-row'), '79');
});
