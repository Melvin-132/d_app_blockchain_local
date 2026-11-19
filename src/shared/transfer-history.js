export function mergeTransferHistory(current, incoming) {
  const records = new Map();
  for (const record of [...current, ...incoming]) {
    records.set(`${record.hash.toLowerCase()}-${record.logIndex}`, record);
  }
  return [...records.values()].sort((left, right) =>
    right.blockNumber - left.blockNumber || right.logIndex - left.logIndex);
}
