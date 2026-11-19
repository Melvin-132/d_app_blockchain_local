export function getUnseenIncomingTransfers(records, address, observedTransactionIds) {
  const walletAddress = address.toLowerCase();
  return records.filter((record) =>
    record.to.toLowerCase() === walletAddress
    && record.from.toLowerCase() !== walletAddress
    && !observedTransactionIds.has(`${record.hash}-${record.logIndex}`));
}

export function summarizeIncomingTransfers(records) {
  if (records.length === 0) return null;
  const senders = new Set(records.map(({ from }) => from.toLowerCase()));
  return {
    amount: records.reduce((total, record) => total + BigInt(record.tokenTransfers[0].value), 0n),
    count: records.length,
    from: senders.size === 1 ? records[0].from : '',
    hash: records[0].hash,
    blockNumber: Math.max(...records.map(({ blockNumber }) => blockNumber)),
  };
}
