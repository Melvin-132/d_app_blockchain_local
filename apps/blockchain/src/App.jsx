import { useCallback, useEffect, useState } from 'react';
import { FaCube, FaExchangeAlt, FaUsers, FaCoins, FaThLarge, FaCog, FaInfoCircle } from 'react-icons/fa';
import { CHAIN, formatCyd, getChainSnapshot, shorten } from '../../../src/shared/sepolia.js';

const NAV = [
  { label: 'Vue d’ensemble', icon: FaThLarge, href: CHAIN.blockchainUrl, active: true },
  { label: 'Blocs', icon: FaCube, href: `${CHAIN.explorerUrl}?tab=blocks` },
  { label: 'Transactions', icon: FaExchangeAlt, href: `${CHAIN.explorerUrl}?tab=transactions` },
  { label: 'Token CYD', icon: FaCoins, href: CHAIN.dappUrl },
  { label: 'Paramètres', icon: FaCog, href: '#network' },
  { label: 'À propos', icon: FaInfoCircle, href: '#about' },
];

function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getChainSnapshot(20);
      setSnapshot(data);
      setUpdatedAt(new Date());
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Impossible de joindre le RPC Sepolia.');
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const transactions = snapshot?.transfers ?? [];
  const blocks = snapshot?.blocks ?? [];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href={CHAIN.blockchainUrl}>
          <span className="brand-mark">C</span><span>CLAYDE CHAIN<small>Build · Innovate · Grow</small></span>
        </a>
        <nav className="side-nav">
          {NAV.map(({ label, icon: Icon, href, active }) => (
            <a key={label} className={active ? 'active' : ''} href={href}><Icon />{label}</a>
          ))}
        </nav>
        <div className="sidebar-bottom"><span className={snapshot ? 'online-dot' : 'offline-dot'} />Réseau : {snapshot ? 'En ligne' : 'Hors ligne'}</div>
      </aside>

      <main className="main-area">
        <header className="page-header">
          <div><h1>Clayde Chain</h1><p>Jeton CYD ERC-20 déployé sur le réseau de test Sepolia</p></div>
          <div className={`status-pill ${snapshot ? 'success' : 'error'}`}>
            <span className={snapshot ? 'online-dot' : 'offline-dot'} />
            {snapshot ? 'Synchronisé' : 'RPC indisponible'}
          </div>
        </header>

        {error && <div className="error-banner" role="alert">{error}<br />Vérifiez le RPC Sepolia et la configuration du contrat CYD.</div>}

        <section className="stats-grid" aria-label="Statistiques blockchain">
          <Stat icon={FaCube} tone="blue" label="Total des blocs" value={snapshot?.latestBlock !== undefined ? (snapshot.latestBlock + 1).toLocaleString('fr-FR') : '—'} />
          <Stat icon={FaExchangeAlt} tone="green" label="Transferts CYD" value={transactions.length.toLocaleString('fr-FR')} hint={`${snapshot?.indexedBlocks ?? 0} derniers blocs`} />
          <Stat icon={FaUsers} tone="purple" label="Adresses actives" value={snapshot?.activeAddresses.toLocaleString('fr-FR') ?? '—'} hint="Dans les blocs indexés" />
          <Stat icon={FaCoins} tone="orange" label="Offre fixe du token" value={`${formatCyd(CHAIN.fundedSupply)} CYD`} />
        </section>

        <section className="data-grid">
          <Panel title="Derniers blocs" link={`${CHAIN.explorerUrl}?tab=blocks`}>
            <table><thead><tr><th>#</th><th>Hash</th><th>Transactions</th><th>Date</th><th>Statut</th></tr></thead>
              <tbody>{blocks.slice(0, 5).map((block) => (
                <tr key={block.hash}>
                  <td>{block.number.toLocaleString('fr-FR')}</td><td className="mono">{shorten(block.hash)}</td>
                  <td>{block.transactions}</td><td>{new Date(block.timestamp * 1000).toLocaleTimeString('fr-FR')}</td>
                  <td><span className="tag success">Validé</span></td>
                </tr>
              ))}</tbody>
            </table>
            {blocks.length === 0 && <div className="empty-state">Aucun bloc récent disponible.</div>}
          </Panel>

          <Panel title="Dernières transactions" link={`${CHAIN.explorerUrl}?tab=transactions`}>
            <table><thead><tr><th>Hash</th><th>De</th><th>Vers</th><th>Montant</th><th>Statut</th></tr></thead>
              <tbody>{transactions.slice(0, 5).map((transaction) => (
                <tr key={transaction.hash}>
                  <td className="mono">{shorten(transaction.hash)}</td><td className="mono">{shorten(transaction.from, 7, 4)}</td>
                  <td className="mono">{shorten(transaction.to, 7, 4)}</td><td>{formatCyd(transaction.amount)} CYD</td>
                  <td><span className="tag success">Confirmée</span></td>
                </tr>
              ))}</tbody>
            </table>
            {transactions.length === 0 && <div className="empty-state">Aucun transfert CYD récent pour le moment.</div>}
          </Panel>
        </section>

        <div className="footer-note" id="network">
          Sepolia · Chain ID {CHAIN.id.toString()} · Token {CHAIN.tokenAddress || 'à configurer'} · Actualisation {updatedAt?.toLocaleTimeString('fr-FR') ?? 'en attente'}
          <span id="about"> · Réseau de test, CYD sans valeur réelle</span>
        </div>
      </main>
    </div>
  );
}

function Stat({ icon: Icon, tone, label, value, hint }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`}><Icon /></span><span><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong>{hint && <small className="stat-hint">{hint}</small>}</span></article>;
}

function Panel({ title, link, children }) {
  return <article className="panel"><div className="panel-heading"><h2>{title}</h2><a href={link}>Voir tout →</a></div><div className="panel-content"><div className="table-wrap">{children}</div></div></article>;
}

export default App;
