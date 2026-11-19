export function getRetryLogRangeEnd(error, fromBlock, toBlock) {
  const messages = [
    error?.error?.message,
    error?.info?.error?.message,
    error?.message,
  ];
  const message = messages.find((candidate) =>
    typeof candidate === 'string' && candidate.toLowerCase().includes('block range extends beyond current head'));
  if (!message) return null;

  const match = message.match(/requested\s+(\d+)\s*,\s*head\s+(\d+)/i);
  if (!match) return null;

  const requestedBlock = Number(match[1]);
  const currentHead = Number(match[2]);
  if (!Number.isSafeInteger(requestedBlock) || !Number.isSafeInteger(currentHead)
    || requestedBlock <= currentHead || currentHead < fromBlock || currentHead >= toBlock) {
    return null;
  }
  return currentHead;
}
