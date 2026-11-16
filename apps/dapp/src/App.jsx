import { useCallback, useEffect, useState } from 'react';
import {
  FaArrowDown,
  FaArrowUp,
  FaClock,
  FaCopy,
  FaCog,
  FaExternalLinkAlt,
  FaHome,
  FaPaperPlane,
  FaWallet,
} from 'react-icons/fa';
import {
  CHAIN,
  createBrowserWallet,
  downloadWalletBackup,
  estimateCydTransfer,
  formatCydUnits,
  formatEthUnits,
  getCydBalance,
  getEthBalance,
  getBrowserWalletAddresses,
  getIndexedHistory,
  importBrowserWallet,
  importBrowserWalletFromPhrase,
  sendCyd,
  shorten,
  unlockBrowserWallet,
} from '../../../src/shared/sepolia.js';
import { createCydPaymentUrl } from '../../../src/shared/payment-request.js';

function App() {
  const paymentParams = new URLSearchParams(window.location.search);
  const [wallet, setWallet] = useState(null);
  const [account, setAccount] = useState('');
  const [balance, setBalance] = useState('');
  const [ethBalance, setEthBalance] = useState('');
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyError, setHistoryError] = useState('');
  const [recipient, setRecipient] = useState(paymentParams.get('to') || '');
  const [amount, setAmount] = useState(paymentParams.get('amount') || '');
  const [requestAmount, setRequestAmount] = useState('');
  const [paymentRequest, setPaymentRequest] = useState('');
  const [walletView, setWalletView] = useState('home');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [transferReview, setTransferReview] = useState(null);
  const [fee, setFee] = useState('');
  const [feeError, setFeeError] = useState('');
  const [savedWalletAddresses, setSavedWalletAddresses] = useState(getBrowserWalletAddresses);
  const [selectedWalletAddress, setSelectedWalletAddress] = useState(
    () => getBrowserWalletAddresses()[0] || '',
  );
  const [walletMode, setWalletMode] = useState(
    () => getBrowserWalletAddresses().length ? 'unlock' : 'create',
  );
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [keystoreFile, setKeystoreFile] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async (address = account) => {
    if (!address) return;
    const [balanceResult, ethResult, historyResult] = await Promise.allSettled([
      getCydBalance(address),
      getEthBalance(address),
      getIndexedHistory({ scope: 'wallet', address, limit: 50 }),
    ]);
    if (balanceResult.status === 'rejected') throw balanceResult.reason;
    setBalance(formatCydUnits(balanceResult.value, 4));
    if (ethResult.status === 'fulfilled') {
      setEthBalance(formatEthUnits(ethResult.value));
    } else {
      setEthBalance('');
    }
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
      `Portefeuille connecté et solde actualisé. Historique temporairement indisponible : ${historyResult.reason?.message || 'indexeur indisponible.'}`,
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
        if (!cancelled) setFee(formatEthUnits(estimate.fee));
      } catch (estimateError) {
        if (!cancelled) setFeeError(estimateError.message || 'Impossible d’estimer les frais réseau.');
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [wallet, recipient, amount]);

  async function activateWallet(openWallet, successMessage, showRecoveryPhrase = false) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const connectedWallet = await openWallet();
      const address = connectedWallet.address;
      setSavedWalletAddresses(getBrowserWalletAddresses());
      setSelectedWalletAddress(address);
      setWallet(connectedWallet);
      setAccount(address);
      setPassword('');
      setPasswordConfirmation('');
      setRecoveryInput('');
      setKeystoreFile('');
      setRecoveryPhrase(showRecoveryPhrase ? connectedWallet.mnemonic?.phrase || '' : '');
      setRecoveryConfirmed(!showRecoveryPhrase);
      if (CHAIN.tokenAddress && CHAIN.deploymentBlock > 0) {
        await refresh(address);
        setNotice(successMessage);
      } else {
        setBalance('0');
        setEthBalance('');
        setHistory([]);
        setHistoryTotal(0);
        setHistoryError('');
        setNotice(`${successMessage} Le contrat CYD reste à déployer sur le réseau Claydecoin.`);
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
        true,
      );
    }
    if (walletMode === 'import') {
      return activateWallet(
        () => importBrowserWallet(keystoreFile, password),
        'Portefeuille chiffré importé et déverrouillé.',
      );
    }
    if (walletMode === 'phrase') {
      return activateWallet(
        () => importBrowserWalletFromPhrase(recoveryInput, password),
        'Phrase de récupération importée et chiffrée dans ce navigateur.',
      );
    }
    return activateWallet(
      () => unlockBrowserWallet(password, selectedWalletAddress),
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
    setEthBalance('');
    setHistory([]);
    setHistoryTotal(0);
    setHistoryError('');
    setRecoveryPhrase('');
    setRecoveryConfirmed(false);
    setTransferReview(null);
    setPaymentRequest('');
    setFee('');
    setFeeError('');
    setPassword('');
    setPasswordConfirmation('');
    setRecoveryInput('');
    setKeystoreFile('');
    setWalletView('home');
    const addresses = getBrowserWalletAddresses();
    setSavedWalletAddresses(addresses);
    setSelectedWalletAddress(addresses[0] || '');
    setWalletMode(addresses.length ? 'unlock' : 'create');
    setNotice('Portefeuille verrouillé dans cette page.');
  }

  function backupWallet() {
    try {
      downloadWalletBackup(account);
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
    setFeeError('');
    if (!wallet) {
      setError('Déverrouillez votre portefeuille avant le transfert.');
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient.trim())) {
      setError('Saisissez une adresse de portefeuille valide.');
      return;
    }
    if (!/^\d+([.,]\d{1,18})?$/.test(amount.trim()) || Number(amount.replace(',', '.')) <= 0) {
      setError('Saisissez un montant positif avec au maximum 18 décimales.');
      return;
    }

    try {
      const estimate = await estimateCydTransfer(wallet, recipient.trim(), amount);
      setFee(formatEthUnits(estimate.fee));
      setTransferReview({ recipient: recipient.trim(), amount: amount.trim(), fee: estimate.fee });
    } catch (reviewError) {
      setError(reviewError.message || 'Impossible de préparer le transfert.');
    }
  }

  async function confirmTransfer() {
    if (!wallet || !transferReview || (recoveryPhrase && !recoveryConfirmed)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const transaction = await sendCyd(wallet, transferReview.recipient, transferReview.amount);
      setTransferReview(null);
      setNotice(`Transaction envoyée ${shorten(transaction.hash)}. En attente de confirmation sur Claydecoin…`);
      const receipt = await transaction.wait(1);
      if (receipt.status !== 1) throw new Error('La transaction a été incluse, mais elle a échoué.');
      setRecipient('');
      setAmount('');
      setNotice(`Transfert confirmé : ${transaction.hash}. Frais : ${formatEthUnits(receipt.fee)} ETH.`);
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

  function createPaymentRequest(event) {
    event.preventDefault();
    if (!account) return;
    try {
      setPaymentRequest(createCydPaymentUrl(CHAIN.dappUrl, account, requestAmount, window.location.origin));
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Impossible de créer le lien de paiement.');
    }
  }

  async function copyText(value, successMessage) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(successMessage);
    } catch {
      setError('Impossible de copier automatiquement. Sélectionnez puis copiez le texte.');
    }
  }

  function openTransfer() {
    setTransferReview(null);
    setWalletView('send');
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
      setHistoryError(`Historique temporairement indisponible : ${historyError.message || 'indexeur indisponible.'}`);
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div className="wallet-shell">
      <aside className="wallet-sidebar">
        <a className="wallet-brand" href={CHAIN.dappUrl}><span className="brand-mark">C</span><span>CLAYDE<small>WALLET</small></span></a>
        <nav className="wallet-nav">
          <button className={walletView === 'home' ? 'active' : ''} onClick={() => setWalletView('home')}><FaHome />Aperçu</button>
          <button className={walletView === 'send' ? 'active' : ''} onClick={openTransfer}><FaPaperPlane />Envoyer</button>
          <button className={walletView === 'receive' ? 'active' : ''} onClick={() => setWalletView('receive')}><FaArrowDown />Recevoir</button>
          <button className={walletView === 'activity' ? 'active' : ''} onClick={() => setWalletView('activity')}><FaClock />Activité</button>
          {wallet && <button className={walletView === 'settings' ? 'active' : ''} onClick={() => setWalletView('settings')}><FaWallet />Paramètres</button>}
          <a href={CHAIN.explorerUrl}><FaExternalLinkAlt />Explorer</a>
        </nav>
        <div className="wallet-sidebar-footer">
          <span className="wallet-network"><span className={wallet ? 'online-dot' : 'offline-dot'} />{wallet ? 'Claydecoin · connecté' : 'Claydecoin'}</span>
          <a href={CHAIN.blockchainUrl}>Tableau de bord <FaExternalLinkAlt /></a>
        </div>
      </aside>

      <main className="wallet-main">
        <header className="wallet-topbar">
          <div><span className="eyebrow">CLAYDECOIN · RÉSEAU DE DÉMONSTRATION</span><h1>{walletView === 'send' ? 'Envoyer des CYD' : walletView === 'receive' ? 'Recevoir des CYD' : walletView === 'activity' ? 'Activité' : walletView === 'settings' ? 'Paramètres' : 'Mon portefeuille'}</h1></div>
          {wallet
            ? <button className="account-chip" onClick={copyAddress} title="Copier l’adresse">{shorten(account, 7, 5)} <FaCopy /></button>
            : <span className="network-chip"><span className="network-dot" />Claydecoin</span>}
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
          recoveryInput={recoveryInput}
          setRecoveryInput={setRecoveryInput}
          keystoreFile={keystoreFile}
          onFileChange={readKeystoreFile}
          onSubmit={submitWallet}
          busy={busy}
          savedWalletAddresses={savedWalletAddresses}
          selectedWalletAddress={selectedWalletAddress}
          setSelectedWalletAddress={setSelectedWalletAddress}
        />}

        {wallet && recoveryPhrase && !recoveryConfirmed && <section className="recovery-card" aria-labelledby="recovery-title">
          <div className="recovery-heading"><span className="recovery-icon"><FaWallet /></span><span><h2 id="recovery-title">Sauvegardez votre phrase de récupération</h2><p>Elle permet de restaurer ce portefeuille. Écrivez-la hors ligne et ne la partagez jamais.</p></span></div>
          <ol className="recovery-words">{recoveryPhrase.split(' ').map((word, index) => <li key={`${word}-${index}`}><span>{index + 1}</span>{word}</li>)}</ol>
          <label className="recovery-confirm"><input type="checkbox" checked={recoveryConfirmed} onChange={(event) => { setRecoveryConfirmed(event.target.checked); if (event.target.checked) setRecoveryPhrase(''); }} />J’ai sauvegardé ma phrase en lieu sûr.</label>
          <p className="security-warning">Réseau de démonstration uniquement : une application web ne fournit pas le niveau d’isolation d’un portefeuille matériel.</p>
        </section>}

        {wallet && recoveryConfirmed && walletView === 'home' && <>
          <section className="wallet-hero">
            <div className="wallet-hero-copy"><span>ACTIFS DU PORTEFEUILLE</span><h2>Votre espace CYD</h2><p>Les soldes sont lus sur le réseau de démonstration Claydecoin. Les frais de transaction sont payés en ETH.</p></div>
            <span className="testnet-badge"><span className="online-dot" />Démo</span>
          </section>
          <section className="asset-grid" aria-label="Actifs du portefeuille">
            <article className="asset-card asset-primary">
              <span className="asset-symbol cyd-symbol">C</span><span className="asset-meta">Clayde · CYD<small>Contrat · {shorten(CHAIN.tokenAddress, 7, 5)}</small></span>
              <strong>{balance || '…'} <small>CYD</small></strong><a href={`${CHAIN.explorerUrl}?search=${CHAIN.tokenAddress}`} target="_blank" rel="noreferrer">Voir le token <FaExternalLinkAlt /></a>
            </article>
            <article className="asset-card">
              <span className="asset-symbol eth-symbol">Ξ</span><span className="asset-meta">ETH de démonstration<small>Frais de réseau</small></span>
              <div className="asset-balance-row">
                <strong>{ethBalance || '…'} <small>ETH</small></strong>
                <a
                  className="faucet-link"
                  href="https://sepolia-faucet.pk910.de/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Obtenir des ETH de test avec le faucet Sepolia PoW de PK910"
                >
                  Obtenir des ETH de test <FaExternalLinkAlt />
                </a>
              </div>
              <a href={`${CHAIN.explorerUrl}?search=${account}`} target="_blank" rel="noreferrer">Voir l’adresse <FaExternalLinkAlt /></a>
            </article>
          </section>
          <section className="wallet-actions" aria-label="Actions du portefeuille">
            <button onClick={openTransfer}><FaArrowUp />Envoyer</button>
            <button onClick={() => setWalletView('receive')}><FaArrowDown />Recevoir</button>
            <button onClick={() => setWalletView('activity')}><FaClock />Activité</button>
          </section>
          <HistoryPanel
            account={account}
            history={history.slice(0, 5)}
            historyTotal={historyTotal}
            historyError={historyError}
            historyLoading={historyLoading}
            onLoadMore={loadMoreHistory}
          />
        </>}

        {wallet && recoveryConfirmed && walletView === 'send' && <section className="panel send-card">
          <div className="section-intro"><span className="section-icon"><FaPaperPlane /></span><div><h2>Envoyer des CYD</h2><p>Vérifiez l’adresse et les frais avant de signer la transaction.</p></div></div>
          <form className="send-form" onSubmit={submitTransfer}>
            <label htmlFor="recipient">Adresse du bénéficiaire</label>
            <input id="recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" autoComplete="off" disabled={busy} required />
            <label htmlFor="amount">Montant à envoyer</label>
            <div className="wallet-amount-input"><input id="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" disabled={busy} required /><span>CYD</span></div>
            <div className="fee-summary"><span>Solde disponible</span><strong>{balance || '0'} CYD</strong><span>Frais estimés</span><strong>{fee ? `${fee} ETH` : 'Calculés avant signature'}</strong><small>Frais réglés en ETH de démonstration · solde ETH : {ethBalance || '…'} ETH</small></div>
            {feeError && <small className="fee-error" role="alert">{feeError}</small>}
            <button className="primary-button" disabled={busy} type="submit">Vérifier le transfert</button>
          </form>
          {transferReview && <div className="transfer-review" role="region" aria-label="Vérification du transfert">
            <h3>Confirmer les détails</h3><dl><dt>Réseau</dt><dd>Claydecoin · démonstration</dd><dt>Destinataire</dt><dd className="mono">{transferReview.recipient}</dd><dt>Montant</dt><dd>{transferReview.amount} CYD</dd><dt>Frais estimés</dt><dd>{formatEthUnits(transferReview.fee)} ETH</dd></dl>
            <div className="review-actions"><button className="secondary-button" onClick={() => setTransferReview(null)} disabled={busy}>Modifier</button><button className="primary-button" onClick={confirmTransfer} disabled={busy}>{busy ? 'En attente…' : 'Confirmer et envoyer'}</button></div>
          </div>}
        </section>}

        {wallet && recoveryConfirmed && walletView === 'receive' && <section className="panel receive-card">
          <span className="receive-icon"><FaArrowDown /></span><h2>Recevoir des CYD</h2>
          <p>Partagez cette adresse pour recevoir des tokens sur le réseau de démonstration Claydecoin.</p>
          <div className="receive-address mono">{account}</div>
          <button className="secondary-button" onClick={copyAddress}><FaCopy />Copier mon adresse</button>
          <form className="payment-request-form" onSubmit={createPaymentRequest}>
            <label htmlFor="request-amount">Demander un montant précis (facultatif)</label>
            <div className="wallet-amount-input"><input id="request-amount" inputMode="decimal" value={requestAmount} onChange={(event) => setRequestAmount(event.target.value)} placeholder="Ex. 25" /><span>CYD</span></div>
            <button className="primary-button" type="submit">Créer une demande de paiement</button>
          </form>
          {paymentRequest && <div className="payment-link"><span>Lien de paiement</span><input aria-label="Lien de paiement" readOnly value={paymentRequest} onFocus={(event) => event.target.select()} /><button className="secondary-button" onClick={() => copyText(paymentRequest, 'Lien de paiement copié.') }><FaCopy />Copier le lien</button><small>Le lien ouvre la DApp avec le destinataire et le montant préremplis.</small></div>}
        </section>}

        {wallet && recoveryConfirmed && walletView === 'activity' && <HistoryPanel
          account={account}
          history={history}
          historyTotal={historyTotal}
          historyError={historyError}
          historyLoading={historyLoading}
          onLoadMore={loadMoreHistory}
        />}

        {wallet && recoveryConfirmed && walletView === 'settings' && <section className="panel settings-card">
          <h2>Paramètres du portefeuille</h2>
          <dl><dt>Réseau</dt><dd>Claydecoin · environnement de démonstration</dd><dt>Contrat CYD</dt><dd className="mono">{CHAIN.tokenAddress || 'À configurer après déploiement'}</dd><dt>Frais</dt><dd>ETH de démonstration</dd><dt>Adresse</dt><dd className="mono">{account}</dd></dl>
          <p>Le keystore est chiffré dans le stockage local de ce navigateur. Gardez une sauvegarde et ne partagez jamais votre phrase de récupération.</p>
          <div className="settings-actions"><button className="secondary-button" onClick={backupWallet}><FaWallet />Télécharger le keystore chiffré</button><button className="secondary-button" onClick={lockWallet}>Verrouiller le portefeuille</button></div>
          <p className="security-warning">Ce prototype fonctionne sur un réseau de démonstration et ne doit pas servir à conserver des actifs réels.</p>
        </section>}

        {wallet && <nav className="wallet-bottom-nav" aria-label="Navigation du portefeuille">
          <button className={walletView === 'home' ? 'active' : ''} onClick={() => setWalletView('home')}><FaHome />Accueil</button>
          <button className={walletView === 'send' ? 'active' : ''} onClick={openTransfer}><FaPaperPlane />Envoyer</button>
          <button className={walletView === 'receive' ? 'active' : ''} onClick={() => setWalletView('receive')}><FaArrowDown />Recevoir</button>
          <button className={walletView === 'activity' ? 'active' : ''} onClick={() => setWalletView('activity')}><FaClock />Activité</button>
          <button className={walletView === 'settings' ? 'active' : ''} onClick={() => setWalletView('settings')}><FaCog />Réglages</button>
        </nav>}

        <footer className="wallet-footer">CYD · Réseau Claydecoin · <a href={CHAIN.explorerUrl}>Explorer les transactions</a></footer>
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
  recoveryInput,
  setRecoveryInput,
  keystoreFile,
  onFileChange,
  onSubmit,
  busy,
  savedWalletAddresses,
  selectedWalletAddress,
  setSelectedWalletAddress,
}) {
  const label = mode === 'create' ? 'Créer mon portefeuille'
    : mode === 'import' ? 'Importer le keystore'
      : mode === 'phrase' ? 'Restaurer avec la phrase' : 'Déverrouiller le portefeuille';
  const passwordLabel = mode === 'create' || mode === 'phrase'
    ? 'Nouveau mot de passe de ce navigateur'
    : mode === 'import' ? 'Mot de passe du keystore' : 'Mot de passe du portefeuille';
  return (
    <section className="panel wallet-unlock">
      <div className="receive-icon"><FaWallet /></div>
      <h2>Votre portefeuille autonome</h2>
      <p>Créez un portefeuille de démonstration ou restaurez le vôtre. La clé reste dans le navigateur et les frais sont payés en ETH.</p>
      <div className="wallet-mode-tabs" role="tablist" aria-label="Gestion du portefeuille">
        {savedWalletAddresses.length > 0 && <button type="button" className={mode === 'unlock' ? 'active' : ''} onClick={() => setMode('unlock')}>Ouvrir</button>}
        <button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Créer</button>
        <button type="button" className={mode === 'phrase' ? 'active' : ''} onClick={() => setMode('phrase')}>Phrase secrète</button>
        <button type="button" className={mode === 'import' ? 'active' : ''} onClick={() => setMode('import')}>Keystore JSON</button>
      </div>
      <form className="send-form" onSubmit={onSubmit}>
        {mode === 'unlock' && <>
          <label htmlFor="saved-wallet">Portefeuille à ouvrir</label>
          <select id="saved-wallet" value={selectedWalletAddress} onChange={(event) => setSelectedWalletAddress(event.target.value)} required>
            {savedWalletAddresses.map((address) => <option key={address} value={address}>{shorten(address, 10, 8)}</option>)}
          </select>
        </>}
        {mode === 'import' && <>
          <label htmlFor="wallet-keystore">Fichier JSON chiffré du portefeuille</label>
          <input id="wallet-keystore" type="file" accept=".json,application/json" onChange={onFileChange} />
          {keystoreFile && <small>Fichier chargé. Son mot de passe sera vérifié localement.</small>}
        </>}
        {mode === 'phrase' && <>
          <label htmlFor="wallet-recovery">Phrase de récupération</label>
          <textarea id="wallet-recovery" rows="3" autoComplete="off" spellCheck="false" value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value)} placeholder="Saisissez les 12 ou 24 mots, séparés par des espaces" required />
          <small>La phrase est convertie localement en keystore chiffré. Choisissez un nouveau mot de passe pour ce navigateur.</small>
        </>}
        <label htmlFor="wallet-password">{passwordLabel}</label>
        <input id="wallet-password" type="password" autoComplete={mode === 'create' || mode === 'phrase' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required />
        {mode === 'create' && <>
          <label htmlFor="wallet-password-confirm">Confirmez le mot de passe</label>
          <input id="wallet-password-confirm" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required />
          <small>12 caractères minimum. Chaque wallet reste enregistré chiffré dans ce navigateur. Téléchargez sa sauvegarde et conservez son mot de passe.</small>
        </>}
        <button className="primary-button" disabled={busy || !password || (mode === 'unlock' && !selectedWalletAddress) || (mode === 'import' && !keystoreFile) || (mode === 'phrase' && !recoveryInput.trim())} type="submit">{busy ? 'Traitement…' : label}</button>
      </form>
      <p className="security-warning">Prototype uniquement. Ne l’utilisez pas pour stocker des actifs réels.</p>
    </section>
  );
}

function HistoryPanel({ account, history, historyTotal, historyError, historyLoading, onLoadMore }) {
  return (
    <section className="panel history-panel">
      <div className="history-heading"><h2>Activité CYD</h2><span>{history.length} / {historyTotal}</span></div>
      {historyError && <div className="history-warning" role="status">{historyError}</div>}
      {history.length === 0 && !historyError && <div className="empty-state">Aucun transfert CYD trouvé pour cette adresse.</div>}
      {history.length > 0 && <div className="table-wrap"><table><thead><tr><th>Activité</th><th>Adresse</th><th>Montant</th><th>Transaction</th></tr></thead><tbody>
        {history.map((item) => {
          const outgoing = item.from.toLowerCase() === account.toLowerCase();
          return <tr key={`${item.hash}-${item.logIndex}`}>
            <td><span className={`tx-type ${outgoing ? 'sent' : 'received'}`}>{outgoing ? 'Envoyé' : 'Reçu'}</span><small className="activity-date">{new Date(item.timestamp * 1000).toLocaleString('fr-FR')}</small></td>
            <td className="mono">{shorten(outgoing ? item.to : item.from, 7, 5)}</td>
            <td className={outgoing ? 'amount-out' : 'amount-in'}>{outgoing ? '−' : '+'}{formatCydUnits(BigInt(item.tokenTransfers[0].value), 4)} CYD</td>
            <td><a className="mono link-button" href={`${CHAIN.explorerUrl}?search=${item.hash}`} target="_blank" rel="noreferrer" aria-label={`Voir la transaction ${item.hash} dans l’explorateur`}>{shorten(item.hash, 7, 5)} <FaExternalLinkAlt /></a></td>
          </tr>;
        })}
      </tbody></table></div>}
      {history.length < historyTotal && <button className="history-more" onClick={onLoadMore} disabled={historyLoading}>{historyLoading ? 'Chargement…' : 'Voir les activités précédentes'}</button>}
    </section>
  );
}

export default App;
