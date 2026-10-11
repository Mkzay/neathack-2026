import assert from 'node:assert/strict';
import test from 'node:test';
import { getSessionFromToken } from './session.js';

test('demo token produces a named session', () => {
  assert.deepEqual(getSessionFromToken('demo-token'), { userId: 'demo-user', displayName: 'Demo User' });
});

test('missing or unknown tokens do not authenticate', () => {
  assert.equal(getSessionFromToken(undefined), null);
  assert.equal(getSessionFromToken('other'), null);
});
