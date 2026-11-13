import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchContractTransferLogs } from '../src/shared/blockscout.js';

const transferTopic = `0x${'ab'.repeat(32)}`;
const contractAddress = '0x1234567890123456789012345678901234567890';

function transferLog(blockNumber, index) {
  return {
    block_number: blockNumber,
    block_timestamp: '2026-11-12T10:00:00.000000Z',
    data: '0x01',
    index,
    topics: [transferTopic, `0x${'00'.repeat(32)}`, `0x${'11'.repeat(32)}`, null],
    transaction_hash: `0x${String(blockNumber).padStart(64, '0')}`,
  };
}

test('loads paginated CYD transfer logs from Blockscout and ignores other events', async () => {
  const requests = [];
  const fetchMock = async (url) => {
    requests.push(new URL(url));
    if (requests.length === 1) {
      return {
        ok: true,
        async json() {
          return {
            items: [
              transferLog(12, 4),
              { ...transferLog(11, 3), topics: [`0x${'cd'.repeat(32)}`] },
            ],
            next_page_params: { block_number: 11, index: 3, items_count: 50 },
          };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { items: [transferLog(10, 2)], next_page_params: null };
      },
    };
  };

  const logs = await fetchContractTransferLogs(contractAddress, transferTopic, fetchMock);

  assert.equal(requests.length, 2);
  assert.equal(requests[0].pathname, `/api/v2/addresses/${contractAddress}/logs`);
  assert.equal(requests[1].searchParams.get('block_number'), '11');
  assert.equal(logs.length, 2);
  assert.equal(logs[0].blockNumber, 12);
  assert.equal(logs[0].timestamp, Math.floor(Date.parse('2026-11-12T10:00:00.000000Z') / 1000));
  assert.equal(logs[0].topics.length, 3);
});

test('reports indexer HTTP errors instead of returning a success-shaped empty history', async () => {
  await assert.rejects(
    fetchContractTransferLogs(contractAddress, transferTopic, async () => ({ ok: false, status: 503 })),
    /HTTP 503/,
  );
});
