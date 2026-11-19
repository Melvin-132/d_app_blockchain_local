import assert from 'node:assert/strict';
import test from 'node:test';
import { getRetryLogRangeEnd } from '../src/shared/rpc-log-range.js';

test('clamps a log query to the RPC node head when its backend is behind', () => {
  const error = {
    error: {
      message: 'block range extends beyond current head: requested 12154571, head 12154569',
    },
  };
  assert.equal(getRetryLogRangeEnd(error, 12154547, 12154571), 12154569);
});

test('does not retry unrelated RPC errors or invalid log ranges', () => {
  assert.equal(getRetryLogRangeEnd(new Error('network unavailable'), 10, 20), null);
  assert.equal(getRetryLogRangeEnd({
    error: { message: 'block range extends beyond current head: requested 10, head 5' },
  }, 6, 10), null);
});
