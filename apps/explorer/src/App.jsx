import { useCallback, useEffect, useState } from 'react';
import { FaArrowRight, FaCube, FaExchangeAlt, FaSearch, FaShieldAlt, FaUsers, FaCoins } from 'react-icons/fa';
import { CHAIN, formatCydUnits, getChainSnapshot, getIndexedHistory, searchChain, shorten } from '../../../src/shared/sepolia.js';

const TRANSFER_PAGE_SIZE = 25;

function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [transferHistory, setTransferHistory] = useState(null);
  const [transferRecords, setTransferRecords] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [query, setQuery] = useState(new URLSearchParams(location.search).get('search') || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [chainSnapshot, history] = await Promise.all([
        getChainSnapshot(20),
        getIndexedHistory({ scope: 'transfers', limit: TRANSFER_PAGE_SIZE }),
      ]);
      setSnapshot(chainSnapshot);
      setTransferHistory(history);
      setTransferRecords((current) => [
        ...history.records,
        ...current.slice(TRANSFER_PAGE_SIZE).filter((record) =>
          !history.records.some(({ hash }) => hash === record.hash)),
      ]);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Impossible de joindre le RPC Sepolia.');
    } finally {
      setLoading(false);
    }
  }, []);

  async function loadMoreTransfers() {
    if (historyLoading || transferRecords.length >= (transferHistory?.total ?? 0)) return;
    setHistoryLoading(true);
    try {
      const history = await getIndexedHistory({
        scope: 'transfers',
        offset: transferRecords.length,
        limit: TRANSFER_PAGE_SIZE,
      });
      setTransferRecords((current) => {
        const existingHashes = new Set(current.map(({ hash }) => hash));
        return [...current, ...history.records.filter(({ hash }) => !existingHashes.has(hash))];
      });
      setTransferHistory(history);
    } catch (historyError) {
      setError(historyError.message || 'Impossible de charger l’historique des transferts CYD.');
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const initialSearch = new URLSearchParams(location.search).get('search');
    if (!initialSearch) return;
    setQuery(initialSearch);
    void searchChain(initialSearch)
      .then(setResult)
      .catch((lookupError) => setSearchError(lookupError.message || 'Recherche impossible.'));
  }, []);

  async function onSearch(event) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    setSearchError('');
    setResult(null);
    window.history.replaceState(null, '', `?search=${encodeURIComponent(value)}`);
    try {
      setResult(await searchChain(value));
    } catch (lookupError) {
      setSearchError(lookupError.message || 'Recherche impossible.');
    }
  }

  const transfers = transferRecords;
  const blocks = snapshot?.blocks ?? [];

  return (
    <div className="explorer-page">
      <header className="explorer-header">
        <a className="explorer-brand" href={CHAIN.explorerUrl}><span className="brand-mark">C</span><span>CLAYDE<span>SCAN</span><small>EXPLORATEUR DE BLOCS</small></span></a>
        <nav><a href={CHAIN.blockchainUrl}>Blockchain</a><a className="active" href={CHAIN.explorerUrl}>Explorer</a><a href={CHAIN.dappUrl}>DApp CYD</a></nav>
        <span className={`status-pill ${snapshot ? 'success' : 'error'}`}><span className={snapshot ? 'online-dot' : 'offline-dot'} />{snapshot ? 'Réseau en ligne' : 'Hors ligne'}</span>
      </header>

      <main>
        <section className="explorer-hero">
          <div className="hero-glow" />
          <p className="explorer-kicker"><FaShieldAlt /> EXPLORATEUR CLAYDE · SEPOLIA</p>
          <h1>Chaque bloc.<br /><span>Chaque transaction CYD.</span></h1>
          <p className="hero-copy">Explorez les transferts du jeton CYD ERC‑20 sur le réseau de test Sepolia.</p>
          <form className="search-box explorer-search" onSubmit={onSearch}>
            <FaSearch /><input aria-label="Rechercher un bloc, une transaction ou une adresse" placeholder="Rechercher un bloc, une transaction ou une adresse…" value={query} onChange={(event) => setQuery(event.target.value)} />
            <button className="primary-button" type="submit">Rechercher</button>
          </form>
          {searchError && <p className="search-error" role="alert">{searchError}</p>}
        </section>

        <section className="explorer-content">
          {error && <div className="error-banner" role="alert">{error} — vérifiez la configuration du contrat CYD et la disponibilité du RPC Sepolia.</div>}
          <div className="stats-grid">
            <Stat icon={FaCube} tone="blue" label="Blocs" value={snapshot ? (snapshot.latestBlock + 1).toLocaleString('fr-FR') : '—'} />
            <Stat icon={FaExchangeAlt} tone="green" label="Transferts CYD" value={(transferHistory?.total ?? 0).toLocaleString('fr-FR')} />
            <Stat icon={FaUsers} tone="purple" label="Adresses actives" value={snapshot?.activeAddresses.toLocaleString('fr-FR') ?? '—'} />
            <Stat icon={FaCoins} tone="orange" label="Token ERC-20" value="CYD" />
          </div>

          {result && <SearchResult result={result} onClose={() => {
            setResult(null);
            setQuery('');
            window.history.replaceState(null, '', window.location.pathname);
          }} />}

          <div className="data-grid explorer-tables">
            <section className="panel"><div className="panel-heading"><h2><FaCube /> Derniers blocs</h2><span>Voir les derniers</span></div>
              <div className="panel-content table-wrap"><table><thead><tr><th>Bloc</th><th>Hash</th><th>Transactions</th><th>Horodatage</th></tr></thead>
                <tbody>{blocks.slice(0, 10).map((block) => <tr key={block.hash}>
                  <td><button className="link-button" onClick={() => { setQuery(String(block.number)); void searchChain(String(block.number)).then(setResult).catch((err) => setSearchError(err.message)); }}>#{block.number.toLocaleString('fr-FR')}</button></td>
                  <td className="mono">{shorten(block.hash)}</td><td>{block.transactions}</td><td>{new Date(block.timestamp * 1000).toLocaleString('fr-FR')}</td>
                </tr>)}</tbody></table>
                {loading && <div className="empty-state">Lecture de Sepolia…</div>}
                {!loading && blocks.length === 0 && <div className="empty-state">Aucun bloc récent disponible.</div>}
              </div>
            </section>

            <section className="panel"><div className="panel-heading"><h2><FaExchangeAlt /> Historique des transferts CYD</h2><span>{transferHistory?.total ?? 0} trouvé(s)</span></div>
              {transferHistory && !transferHistory.complete && <div className="history-sync" role="status">Indexation historique : bloc {Math.max(0, transferHistory.indexedThrough)} / {transferHistory.latestBlock}.</div>}
              {transferHistory?.error && <div className="error-banner" role="alert">{transferHistory.error}</div>}
              <div className="panel-content table-wrap history-index-table"><table><thead><tr><th>Hash</th><th>Bloc</th><th>De</th><th>Vers</th><th>Montant CYD</th><th>Frais réseau</th><th>Statut</th></tr></thead>
                <tbody>{transfers.slice(0, Math.max(10, transferRecords.length)).map((transaction) => <tr key={`${transaction.hash}-${transaction.logIndex}`}>
                  <td><a className="link-button mono" href={`?search=${transaction.hash}`}>{shorten(transaction.hash)}</a></td>
                  <td>{transaction.blockNumber}</td>
                  <td className="mono">{shorten(transaction.from, 7, 4)}</td>
                  <td className="mono">{transaction.to ? shorten(transaction.to, 7, 4) : 'Création'}</td>
                  <td>{formatCydUnits(BigInt(transaction.tokenTransfers[0]?.value ?? 0n), 4)} CYD</td>
                  <td>{transaction.fee ? `${formatCydUnits(BigInt(transaction.fee))} ETH` : 'Voir sur Etherscan'}</td>
                  <td><span className={`tag ${transaction.status === 1 ? 'success' : transaction.status === 0 ? 'error' : ''}`}>{transaction.status === 1 ? 'Confirmée' : transaction.status === 0 ? 'Échouée' : 'En attente'}</span></td>
                </tr>)}</tbody></table>
                {!loading && transfers.length === 0 && <div className="empty-state">Aucun transfert CYD trouvé pour le moment.</div>}
                {transfers.length < (transferHistory?.total ?? 0) && <button className="history-more" onClick={loadMoreTransfers} disabled={historyLoading}>{historyLoading ? 'Chargement…' : 'Charger les transactions précédentes'}</button>}
              </div>
            </section>
          </div>

          <section className="explorer-promo"><div><strong>Clayde Chain Explorer</strong><p>Une vision transparente de Clayde Chain.</p></div><a href={CHAIN.blockchainUrl}>Tableau de bord <FaArrowRight /></a></section>
          <footer className="footer-note">Sepolia · Chain ID {CHAIN.id.toString()} · CYD ERC‑20 {CHAIN.tokenAddress ? shorten(CHAIN.tokenAddress) : 'à configurer'} · <a href="https://sepolia.etherscan.io" target="_blank" rel="noreferrer">Sepolia Etherscan</a></footer>
        </section>
      </main>
    </div>
  );
}

function Stat({ icon: Icon, tone, label, value }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`}><Icon /></span><span><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong></span></article>;
}

function SearchResult({ result, onClose }) {
  const [addressHistory, setAddressHistory] = useState(
    result.type === 'address' ? result.history : null,
  );
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    setAddressHistory(result.type === 'address' ? result.history : null);
  }, [result]);

  useEffect(() => {
    if (result.type !== 'address' || addressHistory?.complete) return undefined;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const latest = await getIndexedHistory({
          scope: 'wallet',
          address: result.address,
          limit: 100,
        });
        if (!cancelled) {
          setAddressHistory((current) => ({
            ...latest,
            records: [
              ...latest.records,
              ...(current?.records ?? []).slice(100).filter((record) =>
                !latest.records.some(({ hash }) => hash === record.hash)),
            ],
          }));
        }
      } catch {
        if (!cancelled) setAddressHistory((current) => ({
          ...current,
          error: 'Impossible d’actualiser l’historique de cette adresse.',
        }));
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [result, addressHistory?.complete]);

  async function loadMoreAddressHistory() {
    if (!addressHistory || historyLoading) return;
    setHistoryLoading(true);
    try {
      const next = await getIndexedHistory({
        scope: 'wallet',
        address: result.address,
        offset: addressHistory.records.length,
        limit: 100,
      });
      setAddressHistory((current) => {
        const existingHashes = new Set(current.records.map(({ hash }) => hash));
        return {
          ...next,
          records: [...current.records, ...next.records.filter(({ hash }) => !existingHashes.has(hash))],
        };
      });
    } catch {
      setAddressHistory((current) => ({
        ...current,
        error: 'Impossible de charger la suite de l’historique de cette adresse.',
      }));
    } finally {
      setHistoryLoading(false);
    }
  }

  let title = '';
  let lines = [];
  if (result.type === 'block') {
    title = `Bloc #${result.block.number}`;
    lines = [['Hash', result.block.hash], ['Date', new Date(result.block.timestamp * 1000).toLocaleString('fr-FR')], ['Transferts CYD', String(result.transfers.length)]];
  } else if (result.type === 'transaction') {
    title = `Transaction ${shorten(result.transaction.hash)}`;
    const tokenAmount = result.tokenTransfers.reduce((sum, transfer) => sum + transfer.value, 0n);
    lines = [
      ['De', result.transaction.from],
      ['Vers', result.transaction.to || 'Création de contrat'],
      ['Montant CYD', `${formatCydUnits(tokenAmount, 4)} CYD`],
      ['Frais', result.receipt ? `${formatCydUnits(result.receipt.fee, 6)} ETH` : '—'],
      ['Statut', result.receipt?.status === 1 ? 'Confirmée' : result.receipt?.status === 0 ? 'Échec' : 'En attente'],
    ];
  } else {
    title = `Adresse ${shorten(result.address)}`;
    lines = [
      ['Transactions trouvées', String(addressHistory?.total ?? 0)],
      ['Historique indexé jusqu’au bloc', String(Math.max(0, addressHistory?.indexedThrough ?? -1))],
      ['Dernier bloc de la chaîne', String(addressHistory?.latestBlock ?? 0)],
    ];
  }
  return <section className="panel search-result"><div className="panel-heading"><h2>{title}</h2><button onClick={onClose}>Fermer</button></div><dl>{lines.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={value.startsWith?.('0x') ? 'mono' : ''}>{value}</dd></div>)}</dl>
    {result.type === 'address' && addressHistory && !addressHistory.complete && <div className="history-sync">L’indexation continue; l’historique peut encore s’enrichir.</div>}
    {result.type === 'address' && addressHistory?.error && <div className="error-banner" role="alert">{addressHistory.error}</div>}
    {result.type === 'address' && addressHistory?.records.length > 0 && <div className="panel-content table-wrap history-index-table"><table><thead><tr><th>Hash</th><th>Bloc</th><th>Type</th><th>CYD</th><th>Statut</th></tr></thead><tbody>
      {addressHistory.records.map((transaction) => <tr key={transaction.hash}>
        <td><a className="link-button mono" href={`?search=${transaction.hash}`}>{shorten(transaction.hash)}</a></td>
        <td>{transaction.blockNumber}</td>
        <td>{transaction.tokenTransfers.length ? 'Événement token' : BigInt(transaction.value) > 0n ? 'Transfert CYD' : 'Appel de contrat'}</td>
        <td>{BigInt(transaction.value) > 0n ? `${formatCydUnits(BigInt(transaction.value), 4)} CYD` : '—'}</td>
        <td>{transaction.status === 1 ? 'Confirmée' : transaction.status === 0 ? 'Échouée' : 'En attente'}</td>
      </tr>)}
    </tbody></table>
      {addressHistory.records.length < addressHistory.total && <button className="history-more" onClick={loadMoreAddressHistory} disabled={historyLoading}>{historyLoading ? 'Chargement…' : 'Charger les transactions précédentes'}</button>}
    </div>}
  </section>;
}

export default App;
