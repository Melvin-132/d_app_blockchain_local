import { useCallback, useEffect, useState } from 'react';
import { FaWallet } from 'react-icons/fa';
import {
  CHAIN,
  createBrowserWallet,
  downloadWalletBackup,
  estimateCydTransfer,
  formatCydUnits,
  getCydBalance,
  getIndexedHistory,
  hasBrowserWallet,
  importBrowserWallet,
  sendCyd,
  shorten,
  unlockBrowserWallet,
} from '../../../src/shared/sepolia.js';

function App() {
  const [wallet, setWallet] = useState(null);
  const [account, setAccount] = useState('');
  const [balance, setBalance] = useState('');
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyError, setHistoryError] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('');
  const [feeError, setFeeError] = useState('');
  const [walletMode, setWalletMode] = useState(() => hasBrowserWallet() ? 'unlock' : 'create');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [keystoreFile, setKeystoreFile] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async (address = account) => {
    if (!address) return;
    const [balanceResult, historyResult] = await Promise.allSettled([
      getCydBalance(address),
      getIndexedHistory({ scope: 'wallet', address, limit: 50 }),
    ]);
    if (balanceResult.status === 'rejected') throw balanceResult.reason;
    setBalance(formatCydUnits(balanceResult.value, 4));
    if (historyResult.status === 'fulfilled') {
      setHistoryError('');
      setHistory((current) => [
        ...historyResult.value.records,
        ...current.slice(50).filter((record) =>
          !historyResult.value.records.some(({ hash, logIndex }) => hash === record.hash && logIndex === record.logIndex)),
      ]);
      setHistoryTotal(historyResult.value.total);
      return;
    }

    setHistoryError(
      `Portefeuille connecté et solde actualisé. Historique temporairement indisponible : ${historyResult.reason?.message || 'indexeur Sepolia indisponible.'}`,
    );
  }, [account]);

  useEffect(() => {
    if (!wallet) return undefined;
    const timer = window.setInterval(() => {
      refresh().catch((refreshError) => setError(refreshError.message || 'Impossible d’actualiser le portefeuille.'));
    }, 15000);
    return () => window.clearInterval(timer);
  }, [wallet, refresh]);

  useEffect(() => {
    let cancelled = false;
    setFee('');
    setFeeError('');
    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(recipient.trim())
      || !/^\d+([.,]\d{1,18})?$/.test(amount.trim())
      || Number(amount.replace(',', '.')) <= 0) return undefined;

    const timer = window.setTimeout(async () => {
      try {
        const estimate = await estimateCydTransfer(wallet, recipient.trim(), amount);
        if (!cancelled) setFee(formatCydUnits(estimate.fee, 6));
      } catch (estimateError) {
        if (!cancelled) setFeeError(estimateError.message || 'Impossible d’estimer les frais Sepolia.');
      }
    }, 300);
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
      const address = connectedWallet.address;
      setWallet(connectedWallet);
      setAccount(address);
      setPassword('');
      setPasswordConfirmation('');
      setKeystoreFile('');
      if (CHAIN.tokenAddress && CHAIN.deploymentBlock > 0) {
        await refresh(address);
        setNotice(successMessage);
      } else {
        setBalance('0');
        setHistory([]);
        setHistoryTotal(0);
        setHistoryError('');
        setNotice(`${successMessage} Le contrat CYD reste à déployer sur Sepolia.`);
      }
    } catch (walletError) {
      setError(walletError.message || 'Impossible d’ouvrir ce portefeuille.');
    } finally {
      setBusy(false);
    }
  }

  function submitWallet(event) {
    event.preventDefault();
    if (walletMode === 'create') {
      if (password !== passwordConfirmation) {
        setError('Les mots de passe ne correspondent pas.');
        return;
      }
      return activateWallet(
        () => createBrowserWallet(password),
        'Portefeuille créé et chiffré dans ce navigateur. Téléchargez une sauvegarde dans Paramètres.',
      );
    }
    if (walletMode === 'import') {
      return activateWallet(
        () => importBrowserWallet(keystoreFile, password),
        'Portefeuille chiffré importé et déverrouillé.',
      );
    }
    return activateWallet(
      () => unlockBrowserWallet(password),
      'Portefeuille déverrouillé. La clé reste dans ce navigateur.',
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
      setError(fileError.message || 'Impossible de lire ce fichier.');
    }
  }

  function lockWallet() {
    setWallet(null);
    setAccount('');
    setBalance('');
    setHistory([]);
    setHistoryTotal(0);
    setFee('');
    setFeeError('');
    setWalletMode('unlock');
    setNotice('Portefeuille verrouillé dans cette page.');
  }

  function backupWallet() {
    try {
      downloadWalletBackup();
      setNotice('Sauvegarde chiffrée téléchargée. Conservez-la avec son mot de passe.');
    } catch (backupError) {
      setError(backupError.message || 'Impossible de télécharger la sauvegarde.');
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

  async function submitTransfer(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!wallet) {
      setError('Déverrouillez votre portefeuille avant le transfert.');
      return;
    }
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
      const transaction = await sendCyd(wallet, recipient.trim(), amount);
      setNotice(`Transaction envoyée ${shorten(transaction.hash)}. En attente de confirmation sur Sepolia…`);
      const receipt = await transaction.wait(1);
      if (receipt.status !== 1) throw new Error('La transaction a été incluse, mais elle a échoué.');
      setRecipient('');
      setAmount('');
      setNotice(`Transfert confirmé sur Sepolia : ${transaction.hash}. Frais : ${formatCydUnits(receipt.fee, 6)} ETH.`);
      try {
        await refresh(account);
      } catch (refreshError) {
        setError(`Transaction confirmée, mais impossible d’actualiser le solde : ${refreshError.message}`);
      }
    } catch (transferError) {
      setError(transferError.message || 'Le transfert a échoué.');
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreHistory() {
    if (!account || historyLoading) return;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const result = await getIndexedHistory({
        scope: 'wallet',
        address: account,
        offset: history.length,
        limit: 50,
      });
      setHistory((current) => {
        const existing = new Set(current.map(({ hash, logIndex }) => `${hash}-${logIndex}`));
        return [...current, ...result.records.filter(({ hash, logIndex }) => !existing.has(`${hash}-${logIndex}`))];
      });
      setHistoryTotal(result.total);
    } catch (historyError) {
      setHistoryError(`Historique temporairement indisponible : ${historyError.message || 'indexeur Sepolia indisponible.'}`);
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div className="wallet-shell">
      <aside className="wallet-sidebar">
        <a className="wallet-brand" href={CHAIN.dappUrl}><span className="brand-mark">C</span><span>CLAYDE<small>WALLET · SEPOLIA</small></span></a>
        <nav className="wallet-nav">
          <a href={CHAIN.blockchainUrl}>Blockchain</a>
          <a href={CHAIN.explorerUrl}>Explorer</a>
          <a className="active" href={CHAIN.dappUrl}>DApp CYD</a>
        </nav>
        <div className="wallet-network"><span className={wallet ? 'online-dot' : 'offline-dot'} />{wallet ? 'Sepolia · Portefeuille ouvert' : 'Portefeuille verrouillé'}</div>
      </aside>

      <main className="wallet-main">
        <header className="wallet-topbar">
          <div><span className="eyebrow">JETON ERC-20 · RÉSEAU DE TEST</span><h1>Portefeuille CYD</h1></div>
          {wallet
            ? <button className="secondary-button connect-button" onClick={lockWallet}><FaWallet />Verrouiller · {shorten(account, 7, 5)}</button>
            : <span className="wallet-mode">Wallet local chiffré</span>}
        </header>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {notice && <div className="notice-banner" role="status">{notice}</div>}

        {!wallet && <WalletAccess
          mode={walletMode}
          setMode={setWalletMode}
          password={password}
          setPassword={setPassword}
          passwordConfirmation={passwordConfirmation}
          setPasswordConfirmation={setPasswordConfirmation}
          keystoreFile={keystoreFile}
          onFileChange={readKeystoreFile}
          onSubmit={submitWallet}
          busy={busy}
          hasWallet={hasBrowserWallet()}
        />}

        <section className="balance-banner">
          <div className="coin-emblem">C</div>
          <div><span>Solde CYD</span><strong>{wallet ? `${balance || '…'} CYD` : '— CYD'}</strong><small>Token de test sur Sepolia</small></div>
          {wallet && <button className="secondary-button" onClick={copyAddress}>{shorten(account)} · Copier</button>}
        </section>

        <section className="panel send-card">
          <div className="history-heading"><h2>Envoyer des CYD</h2><span>Frais payés en Sepolia ETH</span></div>
          <form className="send-form" onSubmit={submitTransfer}>
            {!wallet && <p className="wallet-lock-hint" role="status">Ouvrez ou créez votre portefeuille pour activer les transferts.</p>}
            <label htmlFor="recipient">Adresse du bénéficiaire</label>
            <input id="recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" autoComplete="off" disabled={!wallet || busy} />
            <label htmlFor="amount">Montant à envoyer</label>
            <div className="wallet-amount-input"><input id="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" disabled={!wallet || busy} /><span>CYD</span></div>
            <div className="fee-summary"><span>Solde CYD</span><strong>{balance || '0'} CYD</strong><span>Frais estimés</span><strong>{fee ? `${fee} ETH` : '—'}</strong><small>Les frais nécessitent un solde Sepolia ETH dans ce portefeuille.</small></div>
            {feeError && <small className="fee-error" role="alert">{feeError}</small>}
            <button className="primary-button" disabled={!wallet || busy} type="submit">{busy ? 'Transaction en cours…' : 'Confirmer le transfert'}</button>
          </form>
        </section>

        <section className="panel history-panel">
          <div className="history-heading"><h2>Historique CYD de cette adresse</h2><span>{history.length} / {historyTotal}</span></div>
          {historyError && <div className="history-warning" role="status">{historyError}</div>}
          {!wallet && <div className="empty-state">Ouvrez le portefeuille pour filtrer les transferts de cette adresse.</div>}
          {wallet && history.length === 0 && !historyError && <div className="empty-state">Aucun transfert CYD trouvé pour cette adresse.</div>}
          {history.length > 0 && <div className="table-wrap"><table><thead><tr><th>Date</th><th>De</th><th>Vers</th><th>Montant</th><th>Transaction</th></tr></thead><tbody>
            {history.map((item) => <tr key={`${item.hash}-${item.logIndex}`}>
              <td>{new Date(item.timestamp * 1000).toLocaleString('fr-FR')}</td>
              <td className="mono">{shorten(item.from, 7, 5)}</td>
              <td className="mono">{shorten(item.to, 7, 5)}</td>
              <td>{formatCydUnits(BigInt(item.tokenTransfers[0].value), 4)} CYD</td>
              <td><a className="mono link-button" href={`https://sepolia.etherscan.io/tx/${item.hash}`} target="_blank" rel="noreferrer">{shorten(item.hash, 7, 5)}</a></td>
            </tr>)}
          </tbody></table></div>}
          {wallet && history.length < historyTotal && <button className="history-more" onClick={loadMoreHistory} disabled={historyLoading}>{historyLoading ? 'Chargement…' : 'Charger les transferts précédents'}</button>}
        </section>

        <section className="panel settings-card">
          <h2>Réseau et sécurité</h2>
          <dl><dt>Réseau</dt><dd>Sepolia · Chain ID {CHAIN.id.toString()}</dd><dt>Contrat CYD</dt><dd className="mono">{CHAIN.tokenAddress || 'À configurer après déploiement'}</dd><dt>Frais</dt><dd>Sepolia ETH</dd><dt>Wallet</dt><dd>Créé ou déchiffré localement; aucun compte MetaMask requis</dd></dl>
          <p>Ne partagez jamais votre mot de passe ni votre fichier de sauvegarde. N’entrez pas de phrase secrète ou de clé privée en clair dans l’application.</p>
          <button className="secondary-button" onClick={backupWallet} disabled={!hasBrowserWallet()}><FaWallet />Télécharger la sauvegarde chiffrée</button>
        </section>
        <footer className="wallet-footer">Sepolia · Chain ID {CHAIN.id.toString()} · <a href={CHAIN.blockchainUrl}>Tableau de bord</a> · <a href={CHAIN.explorerUrl}>Explorateur</a></footer>
      </main>
    </div>
  );
}

function WalletAccess({
  mode,
  setMode,
  password,
  setPassword,
  passwordConfirmation,
  setPasswordConfirmation,
  keystoreFile,
  onFileChange,
  onSubmit,
  busy,
  hasWallet,
}) {
  const label = mode === 'create' ? 'Créer mon portefeuille'
    : mode === 'import' ? 'Importer le portefeuille' : 'Déverrouiller le portefeuille';
  return (
    <section className="panel wallet-unlock">
      <div className="receive-icon"><FaWallet /></div>
      <h2>Votre portefeuille autonome</h2>
      <p>La DApp signe les transferts avec un portefeuille chiffré sur cet appareil. MetaMask n’est pas requis; aucun secret en clair n’est demandé.</p>
      <div className="wallet-mode-tabs" role="tablist" aria-label="Gestion du portefeuille">
        <button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Créer</button>
        <button type="button" className={mode === 'import' ? 'active' : ''} onClick={() => setMode('import')}>Importer JSON</button>
        {hasWallet && <button type="button" className={mode === 'unlock' ? 'active' : ''} onClick={() => setMode('unlock')}>Ouvrir</button>}
      </div>
      <form className="send-form" onSubmit={onSubmit}>
        {mode === 'import' && <>
          <label htmlFor="wallet-keystore">Fichier JSON chiffré du portefeuille</label>
          <input id="wallet-keystore" type="file" accept=".json,application/json" onChange={onFileChange} />
          {keystoreFile && <small>Fichier chargé. Son mot de passe sera vérifié localement.</small>}
        </>}
        <label htmlFor="wallet-password">Mot de passe du fichier</label>
        <input id="wallet-password" type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required />
        {mode === 'create' && <>
          <label htmlFor="wallet-password-confirm">Confirmez le mot de passe</label>
          <input id="wallet-password-confirm" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required />
          <small>12 caractères minimum. Téléchargez la sauvegarde et conservez le mot de passe : sans eux, le wallet est irrécupérable.</small>
        </>}
        <button className="primary-button" disabled={busy || !password || (mode === 'import' && !keystoreFile)} type="submit">{busy ? 'Traitement…' : label}</button>
      </form>
    </section>
  );
}

export default App;
