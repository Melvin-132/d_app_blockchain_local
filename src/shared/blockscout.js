const API_BASE_URL = 'https://eth-sepolia.blockscout.com/api/v2';

export async function fetchContractTransferLogs(address, transferTopic, fetchImpl = fetch) {
  let url = new URL(`${API_BASE_URL}/addresses/${address}/logs`);
  const visitedPages = new Set();
  const logs = [];

  while (url) {
    const pageUrl = url.toString();
    if (visitedPages.has(pageUrl)) {
      throw new Error('L’indexeur Sepolia a renvoyé un curseur de pagination répétitif.');
    }
    visitedPages.add(pageUrl);

    const response = await fetchImpl(pageUrl, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`L’indexeur Sepolia a répondu avec le statut HTTP ${response.status}.`);
    }

    const page = await response.json();
    if (!Array.isArray(page.items)) {
      throw new Error('La réponse de l’indexeur Sepolia ne contient pas une liste de journaux valide.');
    }

    for (const item of page.items) {
      if (item.topics?.[0]?.toLowerCase() !== transferTopic.toLowerCase()) continue;
      const timestamp = Math.floor(Date.parse(item.block_timestamp) / 1000);
      if (!Number.isSafeInteger(item.block_number) || !Number.isSafeInteger(item.index)
        || !Number.isFinite(timestamp) || !item.transaction_hash || !item.data
        || !Array.isArray(item.topics)) {
        throw new Error('L’indexeur Sepolia a renvoyé un journal de transfert incomplet.');
      }
      logs.push({
        blockNumber: item.block_number,
        transactionHash: item.transaction_hash,
        index: item.index,
        timestamp,
        topics: item.topics.filter((topic) => typeof topic === 'string'),
        data: item.data,
      });
    }

    if (page.next_page_params == null) {
      url = null;
      continue;
    }
    if (typeof page.next_page_params !== 'object' || Array.isArray(page.next_page_params)) {
      throw new Error('L’indexeur Sepolia a renvoyé un curseur de pagination invalide.');
    }
    url = new URL(pageUrl);
    for (const [key, value] of Object.entries(page.next_page_params)) {
      url.searchParams.set(key, String(value));
    }
  }

  return logs;
}
