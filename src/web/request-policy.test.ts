import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptsLocalRequest } from './request-policy';

test('local mutation accepts only a matching origin', () => {
  assert.equal(acceptsLocalRequest(new Request('http://127.0.0.1:3000/api/investigations', { method: 'POST', headers: { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' } }), true), true);
  assert.equal(acceptsLocalRequest(new Request('http://localhost:3000/api/investigations', { method: 'POST', headers: { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' } }), true), true);
  assert.equal(acceptsLocalRequest(new Request('http://127.0.0.1:3000/api/investigations', { method: 'POST', headers: { origin: 'https://attacker.example', host: '127.0.0.1:3000' } }), true), false);
  assert.equal(acceptsLocalRequest(new Request('http://example.com/api/investigations', { method: 'POST', headers: { origin: 'http://example.com', host: 'example.com' } }), true), false);
});
