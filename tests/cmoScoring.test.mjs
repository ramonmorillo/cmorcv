import test from 'node:test';
import assert from 'node:assert/strict';
import { createCmoScoringEngine, defaultThresholds } from '../scoring/cmoScoring.js';

const variables = [
  {
    id: 'a',
    label: 'Variable A',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'yes', label: 'Yes', points: 10 },
    ],
  },
  {
    id: 'b',
    label: 'Variable B',
    options: [
      { value: 'low', label: 'Low', points: 17 },
      { value: 'high', label: 'High', points: 27 },
    ],
  },
];

const engine = createCmoScoringEngine({
  version: 'cmorcvtesis-v1',
  variableDefinitions: variables,
  thresholds: defaultThresholds,
});

test('returns level 3 for score <= 26', () => {
  const result = engine.evaluate({ a: 'yes', b: 'nope' });
  assert.equal(result.score, 10);
  assert.equal(result.level, 3);
  assert.equal(result.label, 'Level 3 Basal');
});

test('returns level 2 for score 27-36', () => {
  const result = engine.evaluate({ b: 'high' });
  assert.equal(result.score, 27);
  assert.equal(result.level, 2);
  assert.equal(result.label, 'Level 2 Intermediate');
});

test('returns level 1 for score >= 37', () => {
  const result = engine.evaluate({ a: 'yes', b: 'high' });
  assert.equal(result.score, 37);
  assert.equal(result.level, 1);
  assert.equal(result.label, 'Level 1 Priority');
  assert.equal(result.matchedVariables.length, 2);
  assert.match(result.explanation, /score 37/);
});
