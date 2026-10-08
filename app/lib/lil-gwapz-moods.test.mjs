import assert from 'node:assert/strict';
import test from 'node:test';
import { getLilGwapzMood, LIL_GWAPZ_MOODS } from './lil-gwapz-moods.ts';

test('every canonical reaction is included in exactly one browse category', () => {
  const moods = new Set(LIL_GWAPZ_MOODS.filter(item => item.id !== 'all').map(item => item.id));
  for (let id = 1; id <= 76; id++) assert.ok(moods.has(getLilGwapzMood(id)), `Missing reaction ${id}`);
  assert.equal(getLilGwapzMood(0), null);
  assert.equal(getLilGwapzMood(77), null);
});
test('mood browsing sends representative reactions to their intended categories', () => {
  assert.equal(getLilGwapzMood(21), 'happy'); // Crying Laugh
  assert.equal(getLilGwapzMood(31), 'sassy'); // Side-Eye
  assert.equal(getLilGwapzMood(13), 'love'); // Much Love
  assert.equal(getLilGwapzMood(42), 'surprised'); // Ain’t No Way
  assert.equal(getLilGwapzMood(57), 'chill'); // Sleepy
  assert.equal(getLilGwapzMood(62), 'hype'); // Locked In
});
