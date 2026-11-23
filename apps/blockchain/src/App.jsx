import { useCallback, useEffect, useState } from 'react';
import { FaCube, FaExchangeAlt, FaUsers, FaCoins, FaThLarge, FaCog, FaInfoCircle, FaSyncAlt, FaCopy } from 'react-icons/fa';
import { CHAIN, formatCyd, getChainSnapshot, shorten } from '../../../src/shared/sepolia.js';

const NAV = [
  { label: 'Vue d’ensemble', icon: FaThLarge, href: CHAIN.blockchainUrl },
  { label: 'Blocs', icon: FaCube, href: `${CHAIN.explorerUrl}?tab=blocks` },
  { label: 'Transactions', icon: FaExchangeAlt, href: `${CHAIN.explorerUrl}?tab=transactions` },
  { label: 'DApp Wallet', icon: FaCoins, href: CHAIN.dappUrl },
  { label: 'Paramètres', icon: FaCog, href: '#settings' },
  { label: 'À propos', icon: FaInfoCircle, href: '#about' },
];

function App() {
  const [page, setPage] = useState(() => window.location.hash.slice(1) || 'dashboard');
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(true);
  const [settingsMessage, setSettingsMessage] = useState('');

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getChainSnapshot(20);
      setSnapshot(data);
      setUpdatedAt(new Date());
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Impossible de joindre le réseau Claydecoin.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    function syncPage() {
      const requestedPage = window.location.hash.slice(1);
      setPage(['settings', 'about'].includes(requestedPage) ? requestedPage : 'dashboard');
    }
    window.addEventListener('hashchange', syncPage);
    return () => window.removeEventListener('hashchange', syncPage);
  }, []);

  const transactions = snapshot?.transfers ?? [];
  const blocks = snapshot?.blocks ?? [];

  async function copyContractAddress() {
    try {
      await navigator.clipboard.writeText(CHAIN.tokenAddress);
      setSettingsMessage('Adresse du contrat CYD copiée.');
    } catch {
      setSettingsMessage('Copie automatique impossible. Sélectionnez l’adresse pour la copier.');
    }
  }

  return (
    <div className="app-shell">
      <header className="chain-header">
        <a className="chain-brand" href={CHAIN.blockchainUrl}>
          <span className="brand-mark">C</span>
          <span>CLAYDE<span>CHAIN</span><small>BLOCKCHAIN · SEPOLIA</small></span>
        </a>
        <nav className="chain-nav" aria-label="Navigation principale">
          {NAV.map(({ label, icon: Icon, href }) => (
            <a key={label} className={
              (label === 'Vue d’ensemble' && page === 'dashboard')
              || (label === 'Paramètres' && page === 'settings')
              || (label === 'À propos' && page === 'about') ? 'active' : ''
            } href={href}><Icon />{label}</a>
          ))}
        </nav>
        <div className={`status-pill ${snapshot ? 'success' : 'error'}`}>
          <span className={snapshot ? 'online-dot' : 'offline-dot'} />
          {snapshot ? 'Réseau en ligne' : 'Hors ligne'}
        </div>
      </header>

      <main className="main-area">
        {page === 'settings' ? (
          <section className="standalone-page" id="settings">
            <header className="page-header">
              <div><h1>Paramètres Claydecoin</h1><p>État du réseau et informations du token CYD</p></div>
              <a className="secondary-button" href={CHAIN.blockchainUrl}>Retour au tableau de bord</a>
            </header>
            {error && <div className="error-banner" role="alert">{error}<br />Vérifiez la connexion réseau et la configuration du contrat CYD.</div>}
            <article className="panel">
              <div className="panel-heading"><h2>Réseau Claydecoin</h2><span>{snapshot ? 'Connecté' : 'Déconnecté'}</span></div>
              <div className="panel-content dashboard-settings-content">
                <dl className="dashboard-settings-list">
                  <div><dt>Réseau actif</dt><dd>Claydecoin · environnement de démonstration</dd></div>
                  <div><dt>Contrat CYD</dt><dd className="mono">{CHAIN.tokenAddress || 'À configurer'}</dd></div>
                  <div><dt>Dernière actualisation</dt><dd>{updatedAt?.toLocaleTimeString('fr-FR') ?? 'En attente'}</dd></div>
                </dl>
                <div className="dashboard-settings-actions">
                  <button className="secondary-button" onClick={() => void refresh()} disabled={refreshing}>
                    <FaSyncAlt /> {refreshing ? 'Actualisation…' : 'Actualiser maintenant'}
                  </button>
                  <button className="secondary-button" onClick={copyContractAddress} disabled={!CHAIN.tokenAddress}>
                    <FaCopy /> Copier l’adresse CYD
                  </button>
                </div>
                {settingsMessage && <p className="dashboard-settings-feedback" role="status" aria-live="polite">{settingsMessage}</p>}
              </div>
            </article>
          </section>
        ) : page === 'about' ? (
          <section className="standalone-page" id="about">
            <header className="page-header">
              <div><h1>À propos de Claydecoin</h1><p>Une plateforme pour explorer et utiliser le token CYD</p></div>
              <a className="secondary-button" href={CHAIN.blockchainUrl}>Retour au tableau de bord</a>
            </header>
            <article className="panel">
              <div className="panel-heading"><h2>L’écosystème Claydecoin</h2></div>
              <div className="panel-content dashboard-about-content">
                <p>Claydecoin réunit un tableau de bord blockchain, ClaydeScan et un portefeuille pour consulter l’activité et effectuer des opérations avec le token CYD.</p>
                <p className="dashboard-demo-note">Version de démonstration : les actifs affichés ne représentent pas une valeur réelle.</p>
              </div>
            </article>
          </section>
        ) : (
        <>
        <header className="page-header">
          <div><h1>Réseau Claydecoin</h1><p>Vue d’ensemble et activité récente du token CYD</p></div>
        </header>

        {error && <div className="error-banner" role="alert">{error}<br />Vérifiez la connexion réseau et la configuration du contrat CYD.</div>}

        <section className="stats-grid" aria-label="Statistiques blockchain">
          <Stat icon={FaCube} tone="blue" label="Blocs Claydecoin" value={snapshot?.latestBlock !== undefined ? (snapshot.latestBlock + 1).toLocaleString('fr-FR') : '—'} />
          <Stat icon={FaExchangeAlt} tone="green" label="Transferts CYD" value={transactions.length.toLocaleString('fr-FR')} hint={`${snapshot?.indexedBlocks ?? 0} derniers blocs`} />
          <Stat icon={FaUsers} tone="purple" label="Adresses actives" value={snapshot?.activeAddresses.toLocaleString('fr-FR') ?? '—'} hint="Fenêtre des blocs affichés" />
          <Stat icon={FaCoins} tone="orange" label="Offre fixe du token" value={`${formatCyd(CHAIN.fundedSupply)} CYD`} />
        </section>

        <section className="data-grid">
          <Panel title="Derniers blocs" link={`${CHAIN.explorerUrl}?tab=blocks`}>
            <table><thead><tr><th>#</th><th>Hash</th><th>Transactions</th><th>Date</th><th>Statut</th></tr></thead>
              <tbody>{blocks.slice(0, 5).map((block) => (
                <tr key={block.hash}>
                  <td>{block.number.toLocaleString('fr-FR')}</td><td className="mono"><a href={`${CHAIN.explorerUrl}?search=${block.number}`}>{shorten(block.hash)}</a></td>
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
                  <td className="mono"><a href={`${CHAIN.explorerUrl}?search=${transaction.hash}`}>{shorten(transaction.hash)}</a></td><td className="mono">{shorten(transaction.from, 7, 4)}</td>
                  <td className="mono">{shorten(transaction.to, 7, 4)}</td><td>{formatCyd(transaction.amount)} CYD</td>
                  <td><span className="tag success">Confirmée</span></td>
                </tr>
              ))}</tbody>
            </table>
            {transactions.length === 0 && <div className="empty-state">Aucun transfert CYD récent pour le moment.</div>}
          </Panel>
        </section>

        </>
        )}
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
