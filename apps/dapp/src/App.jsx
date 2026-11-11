import { useCallback, useEffect, useState } from 'react';
import { FaArrowDown, FaArrowUp, FaCopy, FaHistory, FaHome, FaQrcode, FaWallet, FaCog } from 'react-icons/fa';
import {
  CHAIN,
  createBrowserWallet,
  downloadWalletBackup,
  estimateCydTransfer,
  formatCyd,
  formatCydUnits,
  getChainProvider,
  getIndexedHistory,
  importBrowserWallet,
  sendCyd,
  shorten,
  unlockBrowserWallet,
} from '../../../src/shared/chain.js';

const HISTORY_PAGE_SIZE = 50;

function App() {
  const [account, setAccount] = useState('');
  const [wallet, setWallet] = useState(null);
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [walletMode, setWalletMode] = useState('unlock');
  const [keystoreFile, setKeystoreFile] = useState('');
  const [balance, setBalance] = useState('');
  const [feeEstimate, setFeeEstimate] = useState('');
  const [totalEstimate, setTotalEstimate] = useState('');
  const [feeError, setFeeError] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyStatus, setHistoryStatus] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async (walletAddress = account) => {
    if (!walletAddress) return;
    const provider = getChainProvider();
    const [nativeBalance, history] = await Promise.all([
      provider.getBalance(walletAddress),
      getIndexedHistory({ scope: 'wallet', address: walletAddress, limit: HISTORY_PAGE_SIZE }),
    ]);
    setBalance(formatCydUnits(nativeBalance, 4));
    setTransactions(history.records);
    setHistoryTotal(history.total);
    setHistoryStatus(history);
  }, [account]);

  const refreshHistory = useCallback(async () => {
    if (!account) return;
    try {
      const history = await getIndexedHistory({
        scope: 'wallet',
        address: account,
        limit: HISTORY_PAGE_SIZE,
      });
      setTransactions((current) => {
        const latestHashes = new Set(history.records.map(({ hash }) => hash));
        return [
          ...history.records,
          ...current.slice(HISTORY_PAGE_SIZE).filter(({ hash }) => !latestHashes.has(hash)),
        ];
      });
      setHistoryTotal(history.total);
      setHistoryStatus(history);
    } catch (historyError) {
      setError(historyError.message || 'Impossible d’actualiser l’historique.');
    }
  }, [account]);

  useEffect(() => {
    if (!wallet) return undefined;
    const timer = window.setInterval(refreshHistory, 5000);
    return () => window.clearInterval(timer);
  }, [wallet, refreshHistory]);

  useEffect(() => {
    let cancelled = false;
    setFeeEstimate('');
    setTotalEstimate('');
    setFeeError('');
    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(recipient.trim())
      || !/^\d+([.,]\d{1,18})?$/.test(amount.trim())
      || Number(amount.replace(',', '.')) <= 0) return undefined;

    const timer = window.setTimeout(async () => {
      try {
        const estimate = await estimateCydTransfer(wallet, recipient.trim(), amount);
        if (!cancelled) {
          setFeeEstimate(formatCydUnits(estimate.fee));
          setTotalEstimate(formatCydUnits(estimate.total));
        }
      } catch (estimateError) {
        if (!cancelled) setFeeError(estimateError.message || 'Impossible d’estimer les frais CYD.');
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [wallet, recipient, amount]);

  async function activateWallet(openWallet, successMessage) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const connectedWallet = await openWallet();
      const connected = connectedWallet.address;
      setWallet(connectedWallet);
      setAccount(connected);
      setPassword('');
      setPasswordConfirmation('');
      setKeystoreFile('');
      await refresh(connected);
      setNotice(successMessage);
    } catch (walletError) {
      setError(walletError.message || 'Déverrouillage du portefeuille impossible.');
    } finally {
      setBusy(false);
    }
  }

  function connect() {
    return activateWallet(() => unlockBrowserWallet(password), 'Portefeuille déverrouillé. Les frais sont payés en CYD.');
  }

  function createWallet() {
    if (password !== passwordConfirmation) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    return activateWallet(
      () => createBrowserWallet(password),
      'Portefeuille créé dans ce navigateur. Sauvegardez son fichier chiffré dans Paramètres.',
    );
  }

  function importWallet() {
    return activateWallet(
      () => importBrowserWallet(keystoreFile, password),
      'Portefeuille importé et enregistré dans ce navigateur.',
    );
  }

  async function readKeystoreFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError('Le fichier de portefeuille dépasse la taille maximale de 1 Mo.');
      event.target.value = '';
      return;
    }
    try {
      setKeystoreFile(await file.text());
      setError('');
    } catch (fileError) {
      setError(fileError.message || 'Impossible de lire le fichier de portefeuille.');
    }
  }

  function saveWalletBackup() {
    try {
      downloadWalletBackup();
      setNotice('Sauvegarde chiffrée téléchargée. Conservez-la avec votre mot de passe.');
    } catch (backupError) {
      setError(backupError.message || 'Impossible de télécharger la sauvegarde du portefeuille.');
    }
  }

  function lockWallet() {
    setWallet(null);
    setAccount('');
    setBalance('');
    setTransactions([]);
    setHistoryTotal(0);
    setHistoryStatus(null);
    setHistoryLoading(false);
    setFeeEstimate('');
    setTotalEstimate('');
    setFeeError('');
    setError('');
    setNotice('Portefeuille verrouillé.');
  }

  async function submitTransfer(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient.trim())) {
      setError('Saisissez une adresse Ethereum valide.');
      return;
    }
    if (!/^\d+([.,]\d{1,18})?$/.test(amount.trim()) || Number(amount.replace(',', '.')) <= 0) {
      setError('Saisissez un montant positif avec au maximum 18 décimales.');
      return;
    }
    setBusy(true);
    try {
      if (!wallet) throw new Error('Déverrouillez votre portefeuille avant le transfert.');
      const tx = await sendCyd(wallet, recipient.trim(), amount);
      setNotice(`Transaction envoyée ${shorten(tx.hash)}. En attente de confirmation…`);
      const receipt = await tx.wait(1);
      setRecipient('');
      setAmount('');
      await refresh(account);
      const actualFee = receipt?.fee
        ? ` Frais réels : ${formatCydUnits(receipt.fee)} CYD.`
        : '';
      setNotice(`Transfert confirmé : ${tx.hash}.${actualFee}`);
    } catch (transferError) {
      setError(transferError.message || 'Le transfert a échoué.');
    } finally {
      setBusy(false);
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(account);
      setNotice('Adresse copiée.');
    } catch {
      setError('Impossible de copier l’adresse automatiquement.');
    }
  }

  async function loadMoreHistory() {
    if (!account || historyLoading || transactions.length >= historyTotal) return;
    setHistoryLoading(true);
    try {
      const history = await getIndexedHistory({
        scope: 'wallet',
        address: account,
        offset: transactions.length,
        limit: HISTORY_PAGE_SIZE,
      });
      setTransactions((current) => {
        const existingHashes = new Set(current.map(({ hash }) => hash));
        return [...current, ...history.records.filter(({ hash }) => !existingHashes.has(hash))];
      });
      setHistoryTotal(history.total);
      setHistoryStatus(history);
    } catch (historyError) {
      setError(historyError.message || 'Impossible de charger la suite de l’historique.');
    } finally {
      setHistoryLoading(false);
    }
  }

  const nav = [
    { id: 'dashboard', label: 'Tableau de bord', icon: FaHome },
    { id: 'send', label: 'Envoyer des CYD', icon: FaArrowUp },
    { id: 'receive', label: 'Recevoir des CYD', icon: FaArrowDown },
    { id: 'history', label: 'Historique', icon: FaHistory },
    { id: 'settings', label: 'Paramètres', icon: FaCog },
  ];

  return (
    <div className="wallet-shell">
      <aside className="wallet-sidebar">
        <a className="wallet-brand" href="#dashboard"><span className="brand-mark">C</span><span>CLAYDE<small>WALLET</small></span></a>
        <nav className="wallet-nav">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}><Icon />{label}</button>)}</nav>
        <div className="wallet-network"><span className={account ? 'online-dot' : 'offline-dot'} />{account ? 'Clayde Chain · Déverrouillé' : 'Portefeuille verrouillé'}</div>
      </aside>

      <main className="wallet-main">
        <header className="wallet-topbar"><div><span className="eyebrow">DAPP · CYD NATIF</span><h1>{nav.find((item) => item.id === activeTab)?.label}</h1></div>
          {wallet
            ? <button className="secondary-button connect-button" onClick={lockWallet}><FaWallet />Verrouiller · {shorten(account, 7, 5)}</button>
            : <span className="wallet-mode">Portefeuille chiffré</span>}
        </header>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {notice && <div className="notice-banner" role="status">{notice}</div>}
        {!wallet && activeTab === 'dashboard' && <WalletUnlock
          password={password}
          setPassword={setPassword}
          passwordConfirmation={passwordConfirmation}
          setPasswordConfirmation={setPasswordConfirmation}
          mode={walletMode}
          setMode={setWalletMode}
          keystoreFile={keystoreFile}
          onFileChange={readKeystoreFile}
          onUnlock={connect}
          onCreate={createWallet}
          onImport={importWallet}
          busy={busy}
        />}
        {activeTab === 'dashboard' && (wallet
          ? <Dashboard account={account} balance={balance} transactions={transactions} historyTotal={historyTotal} copyAddress={copyAddress} onSend={() => setActiveTab('send')} onReceive={() => setActiveTab('receive')} />
          : null)}
        {activeTab === 'send' && <SendForm recipient={recipient} setRecipient={setRecipient} amount={amount} setAmount={setAmount} onSubmit={submitTransfer} disabled={!wallet || busy} busy={busy} feeEstimate={feeEstimate} totalEstimate={totalEstimate} feeError={feeError} balance={balance} locked={!wallet} />}
        {activeTab === 'receive' && <ReceivePanel account={account} onCopy={copyAddress} />}
        {activeTab === 'history' && <HistoryPanel transactions={transactions} account={account} total={historyTotal} status={historyStatus} loading={historyLoading} onLoadMore={loadMoreHistory} />}
        {activeTab === 'settings' && <SettingsPanel onBackup={saveWalletBackup} />}
        <footer className="wallet-footer">Chain ID {CHAIN.id.toString()} · RPC {CHAIN.rpcUrl} · CYD est la monnaie native de ce réseau de démonstration.</footer>
      </main>
    </div>
  );
}

function WalletUnlock({
  password,
  setPassword,
  passwordConfirmation,
  setPasswordConfirmation,
  mode,
  setMode,
  keystoreFile,
  onFileChange,
  onUnlock,
  onCreate,
  onImport,
  busy,
}) {
  const submit = mode === 'create' ? onCreate : mode === 'import' ? onImport : onUnlock;
  const submitLabel = mode === 'create' ? 'Créer mon portefeuille'
    : mode === 'import' ? 'Importer le portefeuille' : 'Déverrouiller le portefeuille';
  return <section className="panel wallet-unlock">
    <div className="receive-icon"><FaWallet /></div>
    <h2>Votre portefeuille Clayde</h2>
    <p>Créez un portefeuille indépendant ou importez une sauvegarde chiffrée. Votre clé reste dans ce navigateur; aucun faucet automatique n’est activé.</p>
    <div className="wallet-mode-tabs" role="tablist" aria-label="Gestion du portefeuille">
      <button type="button" className={mode === 'unlock' ? 'active' : ''} onClick={() => setMode('unlock')}>Ouvrir</button>
      <button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Créer</button>
      <button type="button" className={mode === 'import' ? 'active' : ''} onClick={() => setMode('import')}>Importer</button>
    </div>
    <form className="send-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {mode === 'import' && <>
        <label htmlFor="wallet-keystore">Fichier de portefeuille chiffré</label>
        <input id="wallet-keystore" type="file" accept=".json,application/json" onChange={onFileChange} />
        {keystoreFile && <small>Fichier prêt à être importé.</small>}
      </>}
      <label htmlFor="wallet-password">Mot de passe du portefeuille</label>
      <input id="wallet-password" type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required />
      {mode === 'create' && <>
        <label htmlFor="wallet-password-confirm">Confirmez le mot de passe</label>
        <input id="wallet-password-confirm" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required />
        <small>Utilisez au moins 12 caractères. Le mot de passe ne peut pas être récupéré.</small>
      </>}
      <button className="primary-button" disabled={busy || !password || (mode === 'import' && !keystoreFile)} type="submit">{busy ? 'Traitement…' : submitLabel}</button>
    </form>
  </section>;
}

function Dashboard({ account, balance, transactions, historyTotal, copyAddress, onSend, onReceive }) {
  return <>
    <section className="balance-banner">
      <div className="coin-emblem">C</div>
      <div><span>Solde actuel</span><strong>{account ? `${balance || '…'} CYD` : '— CYD'}</strong><small>Réseau Clayde Chain</small></div>
      <div className="balance-chart">↗</div>
    </section>
    {account && <button className="address-chip" onClick={copyAddress}>{shorten(account)} <FaCopy /></button>}
    <div className="action-row"><button className="send-action" onClick={onSend}><FaArrowUp /> Envoyer</button><button className="receive-action" onClick={onReceive}><FaArrowDown /> Recevoir</button></div>
    <section className="panel history-panel"><div className="history-heading"><h2>Historique de vos transactions</h2><span>{transactions.length} / {historyTotal}</span></div><HistoryTable transactions={transactions.slice(0, 6)} account={account} /></section>
  </>;
}

function SendForm({ recipient, setRecipient, amount, setAmount, onSubmit, disabled, busy, feeEstimate, totalEstimate, feeError, balance, locked }) {
  return <section className="panel send-card"><div className="history-heading"><h2>Envoyer des CYD</h2><span>Les frais sont payés en CYD</span></div><form className="send-form" onSubmit={onSubmit}>
    {locked && <p className="wallet-lock-hint" role="status">Déverrouillez votre portefeuille depuis « Tableau de bord » pour activer l’envoi.</p>}
    <label htmlFor="recipient">Adresse du destinataire</label><input id="recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" autoComplete="off" disabled={disabled} />
    <label htmlFor="amount">Montant à envoyer</label><div className="wallet-amount-input"><input id="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" disabled={disabled} /><span>CYD</span></div>
    <div className="fee-summary"><span>Solde</span><strong>{balance || '0'} CYD</strong><span>Frais estimés</span><strong>{feeEstimate ? `${feeEstimate} CYD` : '—'}</strong><span>Total estimé débité</span><strong>{totalEstimate ? `${totalEstimate} CYD` : '—'}</strong><small>Les frais réels sont débités du solde CYD après confirmation.</small></div>
    {feeError && <small className="fee-error" role="alert">{feeError}</small>}
    <button className="primary-button" disabled={disabled} type="submit">{busy ? 'Transaction en cours…' : 'Confirmer l’envoi'}</button>
    {!disabled && <small>La transaction est signée par votre portefeuille dans le navigateur.</small>}
  </form></section>;
}

function ReceivePanel({ account, onCopy }) {
  return <section className="panel receive-card"><div className="receive-icon"><FaQrcode /></div><h2>Recevoir des CYD</h2><p>Partagez votre adresse Clayde Chain pour recevoir des tokens natifs.</p>
    {account ? <><div className="receive-address mono">{account}</div><button className="secondary-button" onClick={onCopy}><FaCopy /> Copier l’adresse</button></> : <p className="muted">Déverrouillez votre portefeuille pour afficher votre adresse de réception.</p>}
  </section>;
}

function HistoryPanel({ transactions, account, total, status, loading, onLoadMore }) {
  const synchronizing = status && !status.complete;
  return <section className="panel history-panel">
    <div className="history-heading"><h2>Historique complet du portefeuille</h2><span>{transactions.length} / {total} transaction(s)</span></div>
    {synchronizing && <div className="history-sync" role="status">Indexation de l’historique : bloc {Math.max(0, status.indexedThrough)} / {status.latestBlock}. Les résultats se complètent automatiquement.</div>}
    {status?.error && <div className="error-banner" role="alert">{status.error}</div>}
    <HistoryTable transactions={transactions} account={account} />
    {transactions.length < total && <button className="history-more" onClick={onLoadMore} disabled={loading}>{loading ? 'Chargement…' : 'Charger les transactions précédentes'}</button>}
  </section>;
}

function HistoryTable({ transactions, account }) {
  if (!account) return <div className="empty-state">Déverrouillez votre portefeuille pour afficher votre historique.</div>;
  if (!transactions.length) return <div className="empty-state">Aucune transaction trouvée pour ce portefeuille.</div>;
  return <div className="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Hash</th><th>De / vers</th><th>Montant</th><th>Frais</th><th>Statut</th></tr></thead><tbody>
    {transactions.map((transaction) => {
      const outgoing = transaction.from.toLowerCase() === account.toLowerCase();
      const tokenActivity = transaction.tokenTransfers.length > 0;
      const type = tokenActivity
        ? `Événement token (${transaction.tokenTransfers.length})`
        : BigInt(transaction.value) > 0n ? 'Transfert CYD'
          : transaction.input !== '0x' ? 'Appel de contrat' : 'Transaction';
      const counterparty = outgoing ? transaction.to : transaction.from;
      const value = BigInt(transaction.value) > 0n
        ? `${outgoing ? '−' : '+'}${formatCydUnits(BigInt(transaction.value), 4)} CYD`
        : tokenActivity ? 'Token(s), voir détails on-chain' : '—';
      const status = transaction.status === 1 ? 'Confirmée'
        : transaction.status === 0 ? 'Échouée' : 'En attente';
      return <tr key={transaction.hash}>
        <td>{new Date(transaction.timestamp * 1000).toLocaleString('fr-FR')}</td>
        <td><span className={`tx-type ${outgoing ? 'sent' : 'received'}`}>{type}</span></td>
        <td><a className="mono link-button" href={`${CHAIN.explorerUrl}/?search=${transaction.hash}`}>{shorten(transaction.hash, 7, 5)}</a></td>
        <td className="mono">{counterparty ? shorten(counterparty, 7, 5) : 'Création de contrat'}</td>
        <td className={outgoing ? 'amount-out' : 'amount-in'}>{value}</td>
        <td>{transaction.fee ? `${formatCydUnits(BigInt(transaction.fee))} CYD` : '—'}</td>
        <td><span className={`tag ${transaction.status === 1 ? 'success' : transaction.status === 0 ? 'error' : ''}`}>{status}</span></td>
      </tr>;
    })}
  </tbody></table></div>;
}

function SettingsPanel({ onBackup }) {
  return <section className="panel settings-card"><h2>Réseau connecté</h2><dl><dt>Nom</dt><dd>{CHAIN.name}</dd><dt>Chain ID</dt><dd>{CHAIN.id.toString()}</dd><dt>RPC</dt><dd className="mono">{CHAIN.rpcUrl}</dd><dt>Monnaie native</dt><dd>ClaydeCoin (CYD), 18 décimales</dd><dt>Bloc QBFT</dt><dd>Environ toutes les 15 secondes, même sans transaction</dd><dt>Portefeuille</dt><dd>Personnel, chiffré dans ce navigateur</dd></dl><p>Le gas est payé en CYD natif. Aucun fonds n’est attribué automatiquement : vous devez recevoir des CYD d’une adresse déjà financée avant de pouvoir envoyer.</p><button className="secondary-button" onClick={onBackup}><FaWallet />Télécharger la sauvegarde chiffrée</button></section>;
}

export default App;
