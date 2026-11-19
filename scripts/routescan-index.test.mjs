import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchContractTransferLogs,
  fetchWalletTokenTransfers,
  normalizeWalletTokenTransfers,
} from '../src/shared/routescan.js';

const walletAddress = '0x1234567890123456789012345678901234567890';
const contractAddress = '0xd01a59dca065605b2e4d1a3de116e1782916e68a';

function tokenTransfer(overrides = {}) {
  return {
    blockNumber: '12111726',
    timeStamp: '1794399816',
    hash: `0x${'ab'.repeat(32)}`,
    transactionIndex: '120',
    from: '0x0000000000000000000000000000000000000000',
    to: walletAddress,
    contractAddress,
    value: '1000000000000000000000000',
    tokenDecimal: '18',
    tokenSymbol: 'CYD',
    ...overrides,
  };
}

function contractTransferLog(overrides = {}) {
  return {
    address: contractAddress,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      `0x${'0'.repeat(64)}`,
      `0x${'0'.repeat(24)}${walletAddress.slice(2)}`,
    ],
    data: `0x${'0'.repeat(63)}1`,
    blockNumber: '0xb8cf6e',
    timeStamp: '0x6af45e48',
    logIndex: '0x130',
    transactionHash: `0x${'ab'.repeat(32)}`,
    ...overrides,
  };
}

test('loads global CYD contract logs from Routescan with pagination', async () => {
  const requests = [];
  const fetchMock = async (url) => {
    requests.push(new URL(url));
    const result = requests.length === 1
      ? Array.from({ length: 1000 }, (_, index) =>
        contractTransferLog({ transactionHash: `0x${String(index + 1).padStart(64, '0')}` }))
      : [contractTransferLog({ blockNumber: '0xb8d05a' })];
    return { ok: true, async json() { return { status: '1', result }; } };
  };

  const logs = await fetchContractTransferLogs(contractAddress, 12111726, fetchMock);

  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get('module'), 'logs');
  assert.equal(requests[0].searchParams.get('action'), 'getLogs');
  assert.equal(requests[0].searchParams.get('address'), contractAddress);
  assert.equal(requests[0].searchParams.get('fromBlock'), '12111726');
  assert.equal(requests[0].searchParams.get('toBlock'), 'latest');
  assert.equal(requests[0].searchParams.get('topic0'), contractTransferLog().topics[0]);
  assert.equal(requests[1].searchParams.get('page'), '2');
  assert.equal(logs.length, 1001);
  assert.equal(logs[0].blockNumber, 12111726);
  assert.equal(logs[0].timestamp, 1794399816);
  assert.equal(logs[0].index, 304);
});

test('returns an empty global history when Routescan reports no contract logs', async () => {
  const logs = await fetchContractTransferLogs(contractAddress, 12111726, async () => ({
    ok: true,
    async json() {
      return { status: '0', message: 'No records found', result: 'No records found' };
    },
  }));
  assert.deepEqual(logs, []);
});

test('loads wallet-filtered CYD transfers from Routescan with pagination', async () => {
  const requests = [];
  const fetchMock = async (url) => {
    requests.push(new URL(url));
    if (requests.length === 1) {
      return {
        ok: true,
        async json() {
          return {
            status: '1',
            message: 'OK',
            result: Array.from({ length: 100 }, (_, index) =>
              tokenTransfer({ hash: `0x${String(index + 1).padStart(64, '0')}` })),
          };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { status: '1', message: 'OK', result: [tokenTransfer({ blockNumber: '12111725' })] };
      },
    };
  };

  const transfers = await fetchWalletTokenTransfers(walletAddress, contractAddress, fetchMock);
  const [record] = normalizeWalletTokenTransfers([transfers[0]], contractAddress);

  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get('module'), 'account');
  assert.equal(requests[0].searchParams.get('action'), 'tokentx');
  assert.equal(requests[0].searchParams.get('address'), walletAddress);
  assert.equal(requests[0].searchParams.get('contractaddress'), contractAddress);
  assert.equal(requests[1].searchParams.get('page'), '2');
  assert.equal(transfers.length, 101);
  assert.equal(record.tokenTransfers[0].value, 1000000000000000000000000n);
  assert.equal(record.amount, '1000000.0');
  assert.equal(record.timestamp, 1794399816);
});

test('returns an empty history when Routescan reports no token transfers', async () => {
  const transfers = await fetchWalletTokenTransfers(walletAddress, contractAddress, async () => ({
    ok: true,
    async json() {
      return { status: '0', message: 'No transactions found', result: 'No transactions found' };
    },
  }));
  assert.deepEqual(transfers, []);
});

test('surfaces indexer HTTP errors and malformed transfer responses', async () => {
  await assert.rejects(
    fetchWalletTokenTransfers(walletAddress, contractAddress, async () => ({ ok: false, status: 503 })),
    /HTTP 503/,
  );
  await assert.rejects(
    fetchWalletTokenTransfers(walletAddress, contractAddress, async () => ({
      ok: true,
      async json() {
        return { status: '1', result: 'invalid' };
      },
    })),
    /historique de transferts invalide/,
  );
});
