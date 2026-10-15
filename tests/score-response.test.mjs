import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScoringResponse } from '../score-response.mjs';

test('reads a scoring array even with code fences and trailing model commentary', () => {
  const response = '```json\n[{"n":1,"score":8,"summary":"Includes [technical] PM work"}]\n```\nChecked one job.';
  assert.deepEqual(parseScoringResponse(response), [{ n: 1, score: 8, summary: 'Includes [technical] PM work' }]);
});

test('rejects a response without job records', () => {
  assert.throws(() => parseScoringResponse('No results [yet].'));
});
