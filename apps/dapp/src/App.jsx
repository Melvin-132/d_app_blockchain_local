import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  FaArrowDown,
  FaArrowLeft,
  FaArrowUp,
  FaCheckCircle,
  FaChartLine,
  FaChevronRight,
  FaCopy,
  FaCog,
  FaCreditCard,
  FaEthereum,
  FaExternalLinkAlt,
  FaHome,
  FaPaperPlane,
  FaInfoCircle,
  FaPlus,
  FaShareAlt,
  FaWallet,
} from 'react-icons/fa';
import {
  CHAIN,
  ETHEREUM_MAINNET,
  connectMetaMaskWallet,
  createBrowserWallet,
  downloadWalletBackup,
  estimateCydTransfer,
  estimateEthTransfer,
  formatCydUnits,
  formatEthUnits,
  getCydBalance,
  getMainnetEthBalance,
  getRecentCydHistory,
  getSepoliaEthBalance,
  getBrowserWalletAddresses,
  getIndexedHistory,
  importBrowserWallet,
  importBrowserWalletFromPhrase,
  reconnectMetaMaskWallet,
  restoreBrowserWalletSession,
  sendEth,
  sendCyd,
  shorten,
  unlockBrowserWallet,
} from '../../../src/shared/sepolia.js';
import { createCydPaymentUrl } from '../../../src/shared/payment-request.js';
import {
  calculateIndicativeUsdValue,
  CYD_DEMO_PRICE_USD,
  fetchCryptoMarketQuotes,
  fetchStockMarketQuotes,
  MARKET_CRYPTO_FALLBACK_QUOTES,
} from '../../../src/shared/market-data.js';
import { mergeTransferHistory } from '../../../src/shared/transfer-history.js';
import { isValidRecoveryPhraseWordCount } from '../../../src/shared/recovery-phrase.js';
import {
  isStrongWalletPassword,
  WALLET_PASSWORD_POLICY_MESSAGE,
} from '../../../src/shared/wallet-password.js';
import {
  clearWalletSession,
  readWalletSession,
  saveWalletSession,
} from '../../../src/shared/wallet-session.js';
import {
  MIN_CYD_TRANSFER,
  parseCydTransferAmount,
  parseEthTransferAmount,
} from '../../../src/shared/transfer-amount.js';

const STOCK_QUOTES_ENDPOINT = import.meta.env.VITE_STOCK_QUOTES_URL
  || 'https://clayde-stock-quotes.kwwmelvin.workers.dev';

const ASSET_CATALOG = {
  CYD: {
    name: 'Claydecoin',
    network: 'Jeton · Ethereum Sepolia',
    logo: `${import.meta.env.BASE_URL}claydecoin-logo.png`,
  },
  ETH: {
    name: 'Ethereum',
    network: 'Actif natif · Ethereum Mainnet',
    icon: FaEthereum,
    logoClass: 'eth-symbol',
  },
};

const NFT_EXAMPLES = [
  { name: 'Aurore #001', collection: 'Clayde Genesis', art: 'aurora' },
  { name: 'Nébuleuse #017', collection: 'Celestial Artifacts', art: 'nebula' },
  { name: 'Gardien violet #004', collection: 'Clayde Sentinels', art: 'guardian' },
  { name: 'Jardin quantique #009', collection: 'Dreamscape', art: 'garden' },
  { name: 'Voyageur du néant #021', collection: 'Void Explorers', art: 'void' },
];

function App() {
  const paymentParams = new URLSearchParams(window.location.search);
  const requestedAsset = paymentParams.get('asset');
  const initialAsset = requestedAsset
    ? ['CYD', 'ETH'].includes(requestedAsset) ? requestedAsset : ''
    : paymentParams.has('to') ? 'CYD' : '';
  const initialWalletView = paymentParams.has('to') && initialAsset ? 'send' : 'home';
  const [wallet, setWallet] = useState(null);
  const [sessionRestoring, setSessionRestoring] = useState(true);
  const [walletSource, setWalletSource] = useState('');
  const [account, setAccount] = useState('');
  const [balance, setBalance] = useState('');
  const [ethBalance, setEthBalance] = useState('');
  const [sepoliaEthBalance, setSepoliaEthBalance] = useState('');
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyError, setHistoryError] = useState('');
  const [recipient, setRecipient] = useState(paymentParams.get('to') || '');
  const [amount, setAmount] = useState(paymentParams.get('amount') || '');
  const [selectedAsset, setSelectedAsset] = useState(initialAsset);
  const [walletView, setWalletView] = useState(initialWalletView);
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [phraseCopied, setPhraseCopied] = useState(false);
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [transferReview, setTransferReview] = useState(null);
  const [fee, setFee] = useState('');
  const [feeError, setFeeError] = useState('');
  const [feeLoading, setFeeLoading] = useState(false);
  const [marketQuotes, setMarketQuotes] = useState(MARKET_CRYPTO_FALLBACK_QUOTES);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState('');
  const [stockQuotes, setStockQuotes] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [receiveUrl, setReceiveUrl] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [buyDialogClosing, setBuyDialogClosing] = useState(false);
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false);
  const [aboutDialogClosing, setAboutDialogClosing] = useState(false);
  const [isAddingWallet, setIsAddingWallet] = useState(false);
  const [savedWalletAddresses, setSavedWalletAddresses] = useState(getBrowserWalletAddresses);
  const [selectedWalletAddress, setSelectedWalletAddress] = useState(
    () => getBrowserWalletAddresses()[0] || '',
  );
  const [walletMode, setWalletMode] = useState('welcome');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [keystoreFile, setKeystoreFile] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [transactionConfirmation, setTransactionConfirmation] = useState(null);
  const [secretPhraseDialog, setSecretPhraseDialog] = useState('');
  const [secretPhraseWarningAcknowledged, setSecretPhraseWarningAcknowledged] = useState(false);
  const [secretPhraseRevealAcknowledged, setSecretPhraseRevealAcknowledged] = useState(false);
  const [secretPhraseVisible, setSecretPhraseVisible] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState('');
  const navigationTimer = useRef(null);
  const noticeTimer = useRef(null);
  const sidebarRef = useRef(null);
  const walletRouteHistory = useRef([]);
  const walletRouteRef = useRef({ view: initialWalletView, asset: initialAsset });
  const buyDialogTimer = useRef(null);
  const aboutDialogTimer = useRef(null);
  const historySourcesAvailable = useRef({ rpc: false, indexer: false });
  const historyIndexerRequest = useRef(null);
  const historyIndexerOffset = useRef(0);
  const accountRef = useRef('');
  const activeAssetRef = useRef(initialAsset);
  const networkSwitchInProgress = useRef(false);
  const sessionRestoreStarted = useRef(false);
  const selectedBalanceText = selectedAsset === 'CYD' ? balance : ethBalance;
  const selectedAssetQuote = marketQuotes.find((quote) =>
    quote.walletAsset === selectedAsset || quote.symbol === selectedAsset);
  const selectedAssetUnitPriceUsd = selectedAsset === 'CYD'
    ? CYD_DEMO_PRICE_USD
    : selectedAssetQuote?.priceUsd;
  const balanceUsdValue = calculateIndicativeUsdValue(
    parseDisplayedBalance(selectedBalanceText),
    selectedAssetUnitPriceUsd,
  );

  useEffect(() => {
    if (sidebarRef.current) sidebarRef.current.inert = !sidebarOpen;
  }, [sidebarOpen, wallet]);

  const refreshMarketQuotes = useCallback(async () => {
    setMarketLoading(true);
    try {
      const quotes = await fetchCryptoMarketQuotes();
      if (quotes.length === 0) throw new Error('Aucun cours crypto valide n’a été renvoyé.');
      const liveQuoteIds = new Set(quotes.map(({ id }) => id));
      setMarketQuotes([
        ...quotes,
        ...MARKET_CRYPTO_FALLBACK_QUOTES.filter(({ id }) => !liveQuoteIds.has(id)),
      ]);
      setMarketError('');
    } catch (marketFetchError) {
      setMarketError(marketFetchError.message || 'Impossible de charger les cours crypto.');
    } finally {
      setMarketLoading(false);
    }
  }, []);

  const refreshStockQuotes = useCallback(async () => {
    setStockLoading(true);
    try {
      const result = await fetchStockMarketQuotes(STOCK_QUOTES_ENDPOINT);
      setStockQuotes(result.quotes);
      setStockError(result.unavailableSymbols.length
        ? `Cours temporairement indisponibles pour : ${result.unavailableSymbols.join(', ')}.`
        : '');
    } catch (stockFetchError) {
      setStockError(stockFetchError.message || 'Impossible de charger les cours boursiers.');
    } finally {
      setStockLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!wallet || !recoveryConfirmed) return undefined;
    void refreshMarketQuotes();
    const timer = window.setInterval(() => {
      void refreshMarketQuotes();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [wallet, recoveryConfirmed, refreshMarketQuotes]);

  useEffect(() => {
    if (!wallet || !recoveryConfirmed) return undefined;
    void refreshStockQuotes();
    if (!STOCK_QUOTES_ENDPOINT) return undefined;
    const timer = window.setInterval(() => {
      void refreshStockQuotes();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [wallet, recoveryConfirmed, refreshStockQuotes]);

  useEffect(() => () => {
    window.clearTimeout(navigationTimer.current);
    window.clearTimeout(noticeTimer.current);
    window.clearTimeout(buyDialogTimer.current);
    window.clearTimeout(aboutDialogTimer.current);
  }, []);

  function navigateToSite(event, url, label) {
    if (event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey) return;
    event.preventDefault();
    window.clearTimeout(navigationTimer.current);
    setNavigationTarget(label);
    navigationTimer.current = window.setTimeout(() => {
      window.location.assign(url);
    }, 240);
  }

  function closeBuyDialog() {
    if (!buyDialogOpen || buyDialogClosing) return;
    setBuyDialogClosing(true);
    window.clearTimeout(buyDialogTimer.current);
    buyDialogTimer.current = window.setTimeout(() => {
      setBuyDialogOpen(false);
      setBuyDialogClosing(false);
    }, 170);
  }

  function closeAboutDialog() {
    if (!aboutDialogOpen || aboutDialogClosing) return;
    setAboutDialogClosing(true);
    window.clearTimeout(aboutDialogTimer.current);
    aboutDialogTimer.current = window.setTimeout(() => {
      setAboutDialogOpen(false);
      setAboutDialogClosing(false);
    }, 170);
  }

  const refresh = useCallback(async (address = account, asset = selectedAsset) => {
    if (!address || !asset) return;

    const tasks = [];
    if (asset === 'CYD') {
      tasks.push(getCydBalance(address).then((value) => {
        if (accountRef.current.toLowerCase() !== address.toLowerCase()) return;
        const formattedBalance = formatCydUnits(value, 4);
        setBalance(formattedBalance);
        setTransactionConfirmation((current) => current
          && current.asset === 'CYD'
          && !current.balance
          ? { ...current, balance: formattedBalance }
          : current);
      }).catch((balanceError) => {
        if (accountRef.current.toLowerCase() !== address.toLowerCase()) return;
        setBalance('');
        throw balanceError;
      }));
      tasks.push(getSepoliaEthBalance(address).then((value) => {
        if (accountRef.current.toLowerCase() !== address.toLowerCase()) return;
        setSepoliaEthBalance(formatEthUnits(value));
      }).catch(() => {
        if (accountRef.current.toLowerCase() !== address.toLowerCase()) return;
        setSepoliaEthBalance('');
      }));
      setHistoryError('');
      const applyHistoryRecords = (records, total) => {
        if (accountRef.current.toLowerCase() !== address.toLowerCase()) return;
        setHistory((current) => mergeTransferHistory(current, records));
        setHistoryTotal((current) => Math.max(current, total, records.length));
      };

      tasks.push(getRecentCydHistory(address, 50).then(({ records }) => {
        if (accountRef.current.toLowerCase() !== address.toLowerCase()) return;
        historySourcesAvailable.current.rpc = true;
        setHistoryError('');
        applyHistoryRecords(records, records.length);
      }).catch(() => {
        if (accountRef.current.toLowerCase() !== address.toLowerCase()) return;
        historySourcesAvailable.current.rpc = false;
        if (!historySourcesAvailable.current.indexer) {
          setHistoryError('L’historique est momentanément indisponible. Les soldes restent accessibles ; vérifiez votre connexion ou réessayez plus tard.');
        }
      }));

      if (historyIndexerRequest.current?.address.toLowerCase() !== address.toLowerCase()) {
        const request = getIndexedHistory({ scope: 'wallet', address, limit: 50 });
        const activeRequest = { address, request };
        historyIndexerRequest.current = activeRequest;
        void request.then((historyResult) => {
          if (accountRef.current.toLowerCase() !== address.toLowerCase()) return;
          historySourcesAvailable.current.indexer = true;
          historyIndexerOffset.current = Math.max(
            historyIndexerOffset.current,
            historyResult.records.length,
          );
          setHistoryError('');
          applyHistoryRecords(historyResult.records, historyResult.total);
        }).catch(() => {
          if (accountRef.current.toLowerCase() !== address.toLowerCase()) return;
          historySourcesAvailable.current.indexer = false;
          if (!historySourcesAvailable.current.rpc) {
            setHistoryError('L’historique est momentanément indisponible. Les soldes restent accessibles ; vérifiez votre connexion ou réessayez plus tard.');
          }
        }).finally(() => {
          if (historyIndexerRequest.current === activeRequest) historyIndexerRequest.current = null;
        });
      }
    }

    if (asset === 'ETH') {
      tasks.push(getMainnetEthBalance(address).then((value) => {
        if (accountRef.current.toLowerCase() !== address.toLowerCase()) return;
        const formattedBalance = formatEthUnits(value);
        setEthBalance(formattedBalance);
        setTransactionConfirmation((current) => current
          && current.asset === 'ETH'
          && !current.balance
          ? { ...current, balance: formattedBalance }
          : current);
      }).catch((balanceError) => {
        setEthBalance('');
        throw balanceError;
      }));
    }
    await Promise.all(tasks);
  }, [account, selectedAsset]);

  useEffect(() => {
    if (sessionRestoreStarted.current) return;
    sessionRestoreStarted.current = true;
    let session;
    try {
      session = readWalletSession(window.sessionStorage);
    } catch (sessionError) {
      setError(`Impossible de lire la session de cet onglet : ${sessionError.message}`);
      setSessionRestoring(false);
      return;
    }
    if (!session) {
      setSessionRestoring(false);
      return;
    }

    setBusy(true);
    const restore = async () => {
      const restoredWallet = session.source === 'local'
        ? await restoreBrowserWalletSession(session.privateKey, session.address)
        : await reconnectMetaMaskWallet(session.selectedAsset || 'CYD');
      const restoredAddress = restoredWallet.address || await restoredWallet.getAddress();
      if (restoredAddress.toLowerCase() !== session.address.toLowerCase()) {
        throw new Error('Le compte actuellement connecté ne correspond pas à cette session.');
      }

      historySourcesAvailable.current = { rpc: false, indexer: false };
      historyIndexerRequest.current = null;
      historyIndexerOffset.current = 0;
      accountRef.current = restoredAddress;
      activeAssetRef.current = session.selectedAsset;
      setWallet(restoredWallet);
      setWalletSource(session.source);
      setAccount(restoredAddress);
      setSelectedWalletAddress(restoredAddress);
      setSavedWalletAddresses(getBrowserWalletAddresses());
      setSelectedAsset(session.selectedAsset);
      setWalletView(session.walletView);
      walletRouteHistory.current = [];
      walletRouteRef.current = { view: session.walletView, asset: session.selectedAsset };
      setRecoveryPhrase('');
      setRecoveryConfirmed(true);
      setTransactionConfirmation(null);
      setBalance('');
      setEthBalance('');
      setSepoliaEthBalance('');
      setHistory([]);
      setHistoryTotal(0);
      setHistoryError('');
      setWalletMode('welcome');
      if (session.selectedAsset) {
        void refresh(restoredAddress, session.selectedAsset).catch((refreshError) => {
          setError(refreshError.message || 'Impossible d’actualiser le portefeuille restauré.');
        });
      }
    };

    void restore().catch((restoreError) => {
      let cleanupError = '';
      try {
        clearWalletSession(window.sessionStorage);
      } catch (storageError) {
        cleanupError = ` La session temporaire n’a pas pu être effacée : ${storageError.message}`;
      }
      setWalletMode(session.source === 'local' ? 'unlock' : 'welcome');
      setError(`Impossible de restaurer la session de cet onglet. Reconnectez votre portefeuille : ${restoreError.message || restoreError}.${cleanupError}`);
    }).finally(() => {
      setBusy(false);
      setSessionRestoring(false);
    });
  }, [refresh]);

  useEffect(() => {
    if (!wallet || !recoveryConfirmed) return;
    try {
      saveWalletSession(window.sessionStorage, {
        address: account,
        source: walletSource,
        privateKey: walletSource === 'local' ? wallet.privateKey : '',
        selectedAsset,
        walletView,
      });
    } catch (sessionError) {
      setError(`Impossible de conserver la session dans cet onglet : ${sessionError.message}`);
    }
  }, [wallet, walletSource, account, selectedAsset, walletView, recoveryConfirmed]);

  useEffect(() => {
    if (!wallet || !selectedAsset) return undefined;
    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        await refresh();
      } catch (refreshError) {
        setError(refreshError.message || 'Impossible d’actualiser le solde.');
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, 15000);
      }
    };
    timer = window.setTimeout(poll, 15000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [wallet, selectedAsset, refresh]);

  useEffect(() => {
    let cancelled = false;
    if (!account || !selectedAsset) {
      setReceiveUrl('');
      setQrCode('');
      return () => {
        cancelled = true;
      };
    }

    try {
      const url = createCydPaymentUrl(CHAIN.dappUrl, account, '', window.location.origin, selectedAsset);
      setReceiveUrl(url);
      QRCode.toDataURL(url, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 240,
        color: { dark: '#11131b', light: '#ffffff' },
      }).then((dataUrl) => {
        if (!cancelled) setQrCode(dataUrl);
      }).catch((qrError) => {
        if (!cancelled) setError(qrError.message || 'Impossible de générer le code QR.');
      });
    } catch (qrError) {
      setError(qrError.message || 'Impossible de préparer le code QR de réception.');
    }

    return () => {
      cancelled = true;
    };
  }, [account, selectedAsset]);

  useEffect(() => {
    if (walletSource !== 'metamask') return undefined;
    const ethereum = window.ethereum;
    if (!ethereum?.on) return undefined;

    const handleAccountsChanged = (accounts) => {
      if (!accounts[0] || accounts[0].toLowerCase() !== account.toLowerCase()) {
        lockWallet();
        setError('Le compte MetaMask a changé. Reconnectez-vous pour continuer.');
      }
    };
    const handleChainChanged = (chainId) => {
      if (networkSwitchInProgress.current) return;
      const expectedChainId = activeAssetRef.current === 'ETH'
        ? ETHEREUM_MAINNET.hexId
        : CHAIN.hexId;
      if (chainId.toLowerCase() !== expectedChainId) {
        lockWallet();
        setError('Le réseau MetaMask ne correspond pas à l’actif sélectionné. Reconnectez-vous pour continuer.');
        return;
      }
      connectMetaMaskWallet(activeAssetRef.current || 'CYD')
        .then(async (connectedWallet) => {
          setWallet(connectedWallet);
          await refresh(account, activeAssetRef.current);
        })
        .catch((networkError) => setError(networkError.message || 'Impossible de reconnecter MetaMask au réseau sélectionné.'));
    };

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);
    return () => {
      ethereum.removeListener?.('accountsChanged', handleAccountsChanged);
      ethereum.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [walletSource, account, refresh]);

  useEffect(() => {
    let cancelled = false;
    setFee('');
    setFeeError('');
    setFeeLoading(false);
    if (!wallet || !selectedAsset || !/^0x[a-fA-F0-9]{40}$/.test(recipient.trim())
      || !/^\d+([.,]\d{1,18})?$/.test(amount.trim())
      || Number(amount.replace(',', '.')) <= 0) return undefined;

    setFeeLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const estimate = selectedAsset === 'ETH'
          ? await estimateEthTransfer(wallet, recipient.trim(), amount)
          : await estimateCydTransfer(wallet, recipient.trim(), amount);
        if (!cancelled) setFee(formatEthUnits(estimate.fee, 18));
      } catch (estimateError) {
        if (!cancelled) setFeeError(estimateError.message || 'Impossible d’estimer les frais réseau.');
      } finally {
        if (!cancelled) setFeeLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [wallet, recipient, amount, selectedAsset]);

  async function activateWallet(openWallet, successMessage, showRecoveryPhrase = false, source = 'local') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const connectedWallet = await openWallet();
      const address = connectedWallet.address || await connectedWallet.getAddress();
      clearWalletSession(window.sessionStorage);
      setIsAddingWallet(false);
      historySourcesAvailable.current = { rpc: false, indexer: false };
      historyIndexerRequest.current = null;
      historyIndexerOffset.current = 0;
      setTransactionConfirmation(null);
      setSavedWalletAddresses(getBrowserWalletAddresses());
      setSelectedWalletAddress(address);
      setWallet(connectedWallet);
      setWalletSource(source);
      setAccount(address);
      accountRef.current = address;
      historySourcesAvailable.current = { rpc: false, indexer: false };
      historyIndexerRequest.current = null;
      historyIndexerOffset.current = 0;
      activeAssetRef.current = selectedAsset;
      setBalance('');
      setEthBalance('');
      setSepoliaEthBalance('');
      setHistory([]);
      setHistoryTotal(0);
      setTransactionConfirmation(null);
      setHistoryError('');
      setPassword('');
      setPasswordConfirmation('');
      setRecoveryInput('');
      setKeystoreFile('');
      setRecoveryPhrase(showRecoveryPhrase ? connectedWallet.mnemonic?.phrase || '' : '');
      setRecoveryConfirmed(!showRecoveryPhrase);
      setPhraseCopied(false);
      setRecoverySaved(false);
      walletRouteHistory.current = [];
      walletRouteRef.current = { view: walletView, asset: selectedAsset };
      if (CHAIN.tokenAddress && CHAIN.deploymentBlock > 0) {
        setNotice(successMessage);
        setBusy(false);
        if (activeAssetRef.current) {
          void refresh(address, activeAssetRef.current).catch((refreshError) => {
            setError(refreshError.message || 'Impossible de charger les soldes du portefeuille.');
          });
        }
      } else {
        setBalance('0');
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
      if (!isStrongWalletPassword(password)) {
        setError(WALLET_PASSWORD_POLICY_MESSAGE);
        return;
      }
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
    if (walletMode === 'phrase') {
      if (!isStrongWalletPassword(password)) {
        setError(WALLET_PASSWORD_POLICY_MESSAGE);
        return;
      }
      if (password !== passwordConfirmation) {
        setError('Les mots de passe ne correspondent pas.');
        return;
      }
      return activateWallet(
        () => importBrowserWalletFromPhrase(recoveryInput, password),
        'Phrase de récupération importée et chiffrée dans ce navigateur.',
      );
    }
    if (walletMode === 'keystore') {
      return activateWallet(
        () => importBrowserWallet(keystoreFile, password),
        'Portefeuille chiffré importé et déverrouillé.',
      );
    }
    return activateWallet(
      () => unlockBrowserWallet(password, selectedWalletAddress),
      'Portefeuille déverrouillé. La clé reste dans ce navigateur.',
    );
  }

  function connectMetaMask() {
    return activateWallet(
      () => connectMetaMaskWallet(selectedAsset || 'CYD'),
      'MetaMask connecté. Les transactions seront confirmées dans son extension.',
      false,
      'metamask',
    );
  }

  async function copyRecoveryPhrase() {
    try {
      await navigator.clipboard.writeText(recoveryPhrase);
      setPhraseCopied(true);
      setNotice('Phrase copiée. Sauvegardez-la hors ligne : elle ne pourra pas être récupérée si vous la perdez.');
      setError('');
    } catch (copyError) {
      setError(copyError.message || 'Impossible de copier la phrase automatiquement. Vous pouvez la recopier sur papier.');
    }
  }

  function acknowledgeManualPhraseCopy() {
    setPhraseCopied(true);
    setError('');
    setNotice('Vous confirmez avoir recopié la phrase. Vérifiez que tous les mots sont conservés dans le bon ordre.');
  }

  function confirmRecoveryPhrase() {
    setRecoveryPhrase('');
    setRecoveryConfirmed(true);
    setPhraseCopied(false);
    setRecoverySaved(false);
    setNotice('Phrase confirmée et masquée. Gardez votre sauvegarde dans un lieu sûr.');
  }

  function closeSecretPhraseDialog() {
    setSecretPhraseDialog('');
    setSecretPhraseWarningAcknowledged(false);
    setSecretPhraseRevealAcknowledged(false);
    setSecretPhraseVisible(false);
  }

  function openSecretPhraseWarning() {
    if (!wallet?.mnemonic?.phrase) {
      setError(walletSource === 'metamask'
        ? 'MetaMask ne partage pas votre phrase secrète avec cette application. Consultez-la uniquement dans MetaMask.'
        : 'Aucune phrase secrète récupérable n’est disponible pour ce wallet. Le keystore ne permet pas de reconstruire les mots.');
      return;
    }
    setSecretPhraseWarningAcknowledged(false);
    setSecretPhraseRevealAcknowledged(false);
    setSecretPhraseVisible(false);
    setSecretPhraseDialog('warning');
  }

  function continueToSecretPhrase() {
    if (!secretPhraseWarningAcknowledged) return;
    setSecretPhraseDialog('reveal');
    setSecretPhraseRevealAcknowledged(false);
    setSecretPhraseVisible(false);
  }

  function revealSecretPhrase() {
    if (!secretPhraseRevealAcknowledged || !wallet?.mnemonic?.phrase) return;
    setSecretPhraseVisible(true);
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
    closeSecretPhraseDialog();
    setSidebarOpen(false);
    try {
      clearWalletSession(window.sessionStorage);
    } catch (sessionError) {
      setError(`Impossible d’effacer la session temporaire de cet onglet : ${sessionError.message}`);
    }
    setTransactionConfirmation(null);
    setWallet(null);
    setWalletSource('');
    setAccount('');
    accountRef.current = '';
    historySourcesAvailable.current = { rpc: false, indexer: false };
    historyIndexerRequest.current = null;
    historyIndexerOffset.current = 0;
    setBalance('');
    setEthBalance('');
    setSepoliaEthBalance('');
    setHistory([]);
    setHistoryTotal(0);
    setHistoryError('');
    setRecoveryPhrase('');
    setRecoveryConfirmed(false);
    setRecoverySaved(false);
    setTransferReview(null);
    setFee('');
    setFeeError('');
    setPassword('');
    setPasswordConfirmation('');
    setRecoveryInput('');
    setKeystoreFile('');
    setWalletView('home');
    walletRouteHistory.current = [];
    walletRouteRef.current = { view: 'home', asset: '' };
    const addresses = getBrowserWalletAddresses();
    setSavedWalletAddresses(addresses);
    setSelectedWalletAddress(addresses[0] || '');
    setWalletMode('welcome');
    setPhraseCopied(false);
    setNotice('Portefeuille verrouillé dans cette page.');
    setQrCode('');
    setReceiveUrl('');
    window.clearTimeout(buyDialogTimer.current);
    setBuyDialogOpen(false);
    setBuyDialogClosing(false);
    setSelectedAsset('');
    activeAssetRef.current = '';
  }

  function addWallet() {
    setAboutDialogOpen(false);
    setSidebarOpen(false);
    setWalletMode('welcome');
    setSelectedWalletAddress(savedWalletAddresses[0] || '');
    setPassword('');
    setPasswordConfirmation('');
    setRecoveryInput('');
    setKeystoreFile('');
    setError('');
    setNotice('');
    setIsAddingWallet(true);
  }

  function cancelAddWallet() {
    setIsAddingWallet(false);
    setWalletMode('welcome');
    setPassword('');
    setPasswordConfirmation('');
    setRecoveryInput('');
    setKeystoreFile('');
    setError('');
  }

  function openSavedWallet(address) {
    if (address.toLowerCase() === account.toLowerCase()) {
      setSidebarOpen(false);
      return;
    }
    setSelectedWalletAddress(address);
    setWalletMode('unlock');
    setPassword('');
    setError('');
    setSidebarOpen(false);
    setIsAddingWallet(true);
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
      const message = 'Adresse copiée.';
      window.clearTimeout(noticeTimer.current);
      setNotice(message);
      noticeTimer.current = window.setTimeout(() => {
        setNotice((current) => current === message ? '' : current);
      }, 2500);
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
    if (!selectedAsset) {
      setError('Choisissez un actif avant de préparer un transfert.');
      return;
    }
    try {
      if (selectedAsset === 'ETH') parseEthTransferAmount(amount);
      else parseCydTransferAmount(amount);
    } catch (amountError) {
      setError(amountError.message);
      return;
    }

    try {
      const estimate = selectedAsset === 'ETH'
        ? await estimateEthTransfer(wallet, recipient.trim(), amount)
        : await estimateCydTransfer(wallet, recipient.trim(), amount);
      setFee(formatEthUnits(estimate.fee, 18));
      setTransferReview({
        recipient: recipient.trim(),
        amount: amount.trim(),
        asset: selectedAsset,
        fee: estimate.fee,
      });
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
      const transaction = transferReview.asset === 'ETH'
        ? await sendEth(wallet, transferReview.recipient, transferReview.amount)
        : await sendCyd(wallet, transferReview.recipient, transferReview.amount);
      setTransferReview(null);
      const networkName = transferReview.asset === 'ETH' ? 'Ethereum Mainnet' : 'Ethereum Sepolia';
      setNotice(`Transaction envoyée ${shorten(transaction.hash)}. En attente de confirmation sur ${networkName}…`);
      const receipt = await transaction.wait(1);
      if (receipt.status !== 1) throw new Error('La transaction a été incluse, mais elle a échoué.');
      setRecipient('');
      setAmount('');
      setNotice('');
      const confirmation = {
        direction: 'sent',
        asset: transferReview.asset,
        amount: transferReview.asset === 'CYD'
          ? formatCydUnits(parseCydTransferAmount(transferReview.amount), 18)
          : formatEthUnits(parseEthTransferAmount(transferReview.amount), 18),
        from: account,
        to: transferReview.recipient,
        hash: transaction.hash,
        count: 1,
        fee: receipt.fee === null || receipt.fee === undefined
          ? ''
          : formatEthUnits(receipt.fee, 18),
      };
      try {
        const updatedBalance = transferReview.asset === 'CYD'
          ? await getCydBalance(account)
          : await getMainnetEthBalance(account);
        const formattedBalance = transferReview.asset === 'CYD'
          ? formatCydUnits(updatedBalance, 4)
          : formatEthUnits(updatedBalance, 18);
        if (accountRef.current.toLowerCase() !== account.toLowerCase()) return;
        if (transferReview.asset === 'CYD') {
          setBalance(formattedBalance);
        } else {
          setEthBalance(formattedBalance);
        }
        setTransactionConfirmation({ ...confirmation, balance: formattedBalance });
      } catch (refreshError) {
        if (accountRef.current.toLowerCase() === account.toLowerCase()) {
          setError(`Transaction confirmée, mais impossible d’actualiser le solde : ${refreshError.message || 'le RPC est momentanément indisponible.'}`);
          setTransactionConfirmation({ ...confirmation, balance: '' });
        }
      }
      void refresh(account, transferReview.asset).catch((refreshError) => {
        setError(refreshError.message || 'Impossible d’actualiser le solde et l’historique.');
      });
    } catch (transferError) {
      setError(transferError.message || 'Le transfert a échoué.');
    } finally {
      setBusy(false);
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

  async function shareReceiveAddress() {
    if (!receiveUrl) {
      setError('Le lien de réception n’est pas encore prêt.');
      return;
    }
    if (!navigator.share) {
      await copyText(receiveUrl, 'Lien de réception copié.');
      return;
    }
    try {
      await navigator.share({
        title: `Recevoir ${selectedAsset}`,
        text: `Envoyer ${selectedAsset} à ${account}`,
        url: receiveUrl,
      });
    } catch (shareError) {
      if (shareError.name !== 'AbortError') {
        setError(shareError.message || 'Impossible de partager le lien de réception.');
      }
    }
  }

  function openTransfer() {
    setSidebarOpen(false);
    if (!selectedAsset) {
      navigateWalletView('home');
      setError('Choisissez d’abord un actif à envoyer.');
      return;
    }
    setTransferReview(null);
    navigateWalletView('send');
  }

  function openReceive() {
    setSidebarOpen(false);
    if (!selectedAsset) {
      navigateWalletView('home');
      setError('Choisissez d’abord un actif à recevoir.');
      return;
    }
    navigateWalletView('receive');
  }

  async function chooseAsset(asset) {
    setAmount('');
    setTransferReview(null);
    setFee('');
    setError('');
    setNotice('');
    if (!asset || !wallet || walletSource !== 'metamask') {
      navigateWalletView('home', asset);
      if (asset && wallet) {
        void refresh(account, asset).catch((assetError) => {
          setError(assetError.message || 'Impossible de charger le solde de cet actif.');
        });
      }
      return;
    }

    const previousAsset = walletRouteRef.current.asset;
    activeAssetRef.current = asset;
    setBusy(true);
    let metaMaskNetworkReady = false;
    try {
      networkSwitchInProgress.current = true;
      const connectedWallet = await connectMetaMaskWallet(asset);
      const connectedAddress = connectedWallet.address || await connectedWallet.getAddress();
      if (connectedAddress.toLowerCase() !== account.toLowerCase()) {
        throw new Error('Le compte MetaMask actif ne correspond plus au wallet ouvert.');
      }
      setWallet(connectedWallet);
      metaMaskNetworkReady = true;
      navigateWalletView('home', asset);
      setBusy(false);
      void refresh(account, asset).catch((assetError) => {
        setError(assetError.message || 'Impossible de charger le solde de cet actif.');
      });
    } catch (assetError) {
      if (!metaMaskNetworkReady) {
        activeAssetRef.current = previousAsset;
      }
      setError(assetError.message || 'Impossible de connecter le wallet au réseau de cet actif.');
    } finally {
      networkSwitchInProgress.current = false;
      setBusy(false);
    }
  }

  function navigateWalletView(view, asset = walletRouteRef.current.asset) {
    const current = walletRouteRef.current;
    if (current.view === view && current.asset === asset) return;
    walletRouteHistory.current.push(current);
    walletRouteRef.current = { view, asset };
    setWalletView(view);
    if (current.asset !== asset) {
      activeAssetRef.current = asset;
      setSelectedAsset(asset);
    }
  }

  function goBackWalletView() {
    const current = walletRouteRef.current;
    const previous = walletRouteHistory.current.pop()
      || (current.view !== 'home'
        ? { view: 'home', asset: current.asset }
        : current.asset ? { view: 'home', asset: '' } : null);
    if (!previous) {
      lockWallet();
      return;
    }
    walletRouteRef.current = previous;
    setWalletView(previous.view);
    if (current.asset !== previous.asset) {
      activeAssetRef.current = previous.asset;
      setSelectedAsset(previous.asset);
      if (previous.asset) {
        void refresh(account, previous.asset).catch((assetError) => {
          setError(assetError.message || 'Impossible de charger le solde de cet actif.');
        });
      }
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
        offset: historyIndexerOffset.current,
        limit: 50,
      });
      historyIndexerOffset.current += result.records.length;
      setHistory((current) => mergeTransferHistory(current, result.records));
      setHistoryTotal((current) => Math.max(current, result.total));
    } catch (historyError) {
      setHistoryError(`Historique temporairement indisponible : ${historyError.message || 'indexeur indisponible.'}`);
    } finally {
      setHistoryLoading(false);
    }
  }

  const displayedWalletAddresses = walletSource === 'metamask'
    && account
    && !savedWalletAddresses.some((address) => address.toLowerCase() === account.toLowerCase())
    ? [account, ...savedWalletAddresses]
    : savedWalletAddresses;
  const walletAccessProps = {
    mode: walletMode,
    setMode: setWalletMode,
    password,
    setPassword,
    passwordConfirmation,
    setPasswordConfirmation,
    recoveryInput,
    setRecoveryInput,
    keystoreFile,
    onFileChange: readKeystoreFile,
    onSubmit: submitWallet,
    onConnectMetaMask: connectMetaMask,
    busy,
    savedWalletAddresses,
    selectedWalletAddress,
    setSelectedWalletAddress,
    onCancel: isAddingWallet ? cancelAddWallet : undefined,
  };

  return (
    <div className={`wallet-shell ${wallet ? 'wallet-connected-shell' : 'wallet-access-shell'} ${wallet && !selectedAsset && walletView === 'home' ? 'wallet-market-shell' : ''}`}>
      {wallet && sidebarOpen && <button className="wallet-sidebar-backdrop" type="button" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu" />}
      {wallet && <aside ref={sidebarRef} className={`wallet-sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-hidden={!sidebarOpen}>
        <BackButton className="sidebar-back-button" onClick={() => setSidebarOpen(false)} />
        <button className="wallet-brand" type="button" onClick={() => { navigateWalletView('home'); setSidebarOpen(false); }}><span className="brand-mark">C</span><span>CLAYDE</span></button>
        <nav className="wallet-nav">
          <button className={walletView === 'home' ? 'active' : ''} onClick={() => { navigateWalletView('home'); setSidebarOpen(false); }}><FaHome />Aperçu</button>
          <button className={walletView === 'send' ? 'active' : ''} onClick={openTransfer}><FaPaperPlane />Envoyer</button>
          <button className={walletView === 'receive' ? 'active' : ''} onClick={openReceive}><FaArrowDown />Recevoir</button>
          {wallet && <button className={walletView === 'settings' ? 'active' : ''} onClick={() => { navigateWalletView('settings'); setSidebarOpen(false); }}><FaWallet />Paramètres</button>}
          <button type="button" onClick={addWallet}><FaPlus />Ajouter un portefeuille</button>
        </nav>
        <div className="wallet-switcher" aria-label="Portefeuilles">
          <span className="wallet-switcher-heading">Mes portefeuilles</span>
          {displayedWalletAddresses.map((address) => (
            <button
              className={address.toLowerCase() === account.toLowerCase() ? 'is-active' : ''}
              type="button"
              key={address}
              onClick={() => openSavedWallet(address)}
              title={address}
            >
              <FaWallet />
              <span>{shorten(address, 7, 5)}</span>
              {address.toLowerCase() === account.toLowerCase() && <small>Actif</small>}
            </button>
          ))}
        </div>
        <div className="wallet-sidebar-footer">
          <span className="wallet-network"><span className={wallet ? 'online-dot' : 'offline-dot'} />
            {selectedAsset === 'ETH' ? 'Ethereum Mainnet' : selectedAsset === 'CYD' ? 'Ethereum Sepolia · CYD' : 'Réseau selon l’actif'}
          </span>
          <button type="button" onClick={() => { setAboutDialogOpen(true); setSidebarOpen(false); }}>À propos <FaInfoCircle /></button>
        </div>
      </aside>}

      <main className={wallet ? 'wallet-main' : 'wallet-main wallet-access-main'}>
        {wallet && <header className="wallet-topbar">
          <div className="wallet-topbar-brand">
            <BackButton className="wallet-route-back" onClick={goBackWalletView} disabled={busy} />
            <button className="brand-menu-toggle" type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? 'Fermer le menu Clayde' : 'Ouvrir le menu Clayde'}><span className="brand-mark">C</span></button>
            <h1>{selectedAsset ? 'Bienvenue sur Clayde' : 'Markets'}</h1>
          </div>
          {wallet
            ? <button className="account-chip" onClick={copyAddress} title="Copier l’adresse">{shorten(account, 7, 5)} <FaCopy /></button>
            : <span className="network-chip"><span className="network-dot" />Ethereum · Sepolia</span>}
        </header>}
        {error && <ErrorDialog error={error} onClose={() => setError('')} />}
        {notice && wallet && <div className="notice-banner" role="status">{notice}</div>}
        {wallet && transactionConfirmation && <TransactionConfirmationDialog
          transfer={transactionConfirmation}
          address={account}
          onClose={() => setTransactionConfirmation(null)}
        />}

        {!wallet && sessionRestoring && <div className="session-restoring" role="status">Restauration de votre session dans cet onglet…</div>}
        {!wallet && !sessionRestoring && <WalletAccess
          key={walletMode}
          {...walletAccessProps}
        />}
        {wallet && isAddingWallet && <div className="wallet-add-overlay" role="dialog" aria-modal="true" aria-label="Ajouter ou ouvrir un portefeuille">
          <WalletAccess key={`add-${walletMode}`} {...walletAccessProps} />
        </div>}

        {wallet && recoveryPhrase && !recoveryConfirmed && <RecoveryPhraseDialog
          phrase={recoveryPhrase}
          copied={phraseCopied}
          saved={recoverySaved}
          setSaved={setRecoverySaved}
          onCopy={copyRecoveryPhrase}
          onManualCopy={acknowledgeManualPhraseCopy}
          onConfirm={confirmRecoveryPhrase}
          onBack={lockWallet}
        />}

        {wallet && recoveryConfirmed && walletView === 'home' && <div className="wallet-view wallet-view-home" key={`home-${selectedAsset || 'choose'}`}>
          {!selectedAsset
            ? <MarketExplorer
              quotes={marketQuotes}
              stockQuotes={stockQuotes}
              loading={marketLoading}
              error={marketError}
              stockLoading={stockLoading}
              stockError={stockError}
              onRetry={refreshMarketQuotes}
              onRetryStocks={refreshStockQuotes}
              onSelectAsset={chooseAsset}
            />
            : <>
              <section className="wallet-hero">
                <div className="wallet-hero-copy">
                  <span>ACTIF SÉLECTIONNÉ · {selectedAsset}</span>
                  <h2>{selectedAsset === 'CYD' ? 'Votre espace CYD' : 'Votre espace Ethereum'}</h2>
                  {selectedAsset === 'CYD'
                    ? <>
                      <div className="wallet-supply"><strong>{Number(CHAIN.fundedSupply).toLocaleString('en-US')} CYD</strong><span>en circulation</span></div>
                      <p>1 CYD = $1,000 · taux indicatif de démonstration. Les frais réseau sont payés en ETH.</p>
                    </>
                    : <p>Solde ETH natif sur Ethereum Mainnet. Les transactions sont réelles, irréversibles et les frais sont payés en vrai ETH.</p>}
                  <button className="asset-switch" type="button" onClick={() => chooseAsset('')} disabled={busy}>Changer d’actif</button>
                </div>
                <AssetLogo
                  asset={selectedAsset}
                  className={`wallet-project-logo ${selectedAsset === 'ETH' ? 'eth-logo' : ''}`}
                />
              </section>
              <section className="asset-grid" aria-label={`Solde ${selectedAsset}`}>
                {selectedAsset === 'CYD'
                  ? <>
                    <article className="asset-card asset-primary">
                      <AssetLogo asset="CYD" className="asset-symbol cyd-logo" />
                      <span className="asset-meta">Solde<small>Valeur indicative : {balanceUsdValue === null ? 'Calcul en cours…' : formatIndicativeUsd(balanceUsdValue)}</small></span>
                      <strong>{balance || '…'} <small>CYD</small></strong>
                    </article>
                    <article className="asset-card">
                      <AssetLogo asset="ETH" className="asset-symbol eth-symbol" />
                      <span className="asset-meta">ETH pour les frais<small>Ethereum Sepolia · CYD</small></span>
                      <div className="asset-balance-row">
                        <strong>{sepoliaEthBalance || '…'} <small>ETH</small></strong>
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
                    </article>
                  </>
                  : <article className="asset-card asset-primary">
                    <AssetLogo asset="ETH" className="asset-symbol eth-symbol" />
                    <span className="asset-meta">
                      Solde ETH natif
                      <small>Ethereum Mainnet · Réseau réel</small>
                      <small>Valeur indicative : {balanceUsdValue === null
                        ? marketLoading ? 'Chargement du cours…' : 'Cours ETH indisponible'
                        : formatIndicativeUsd(balanceUsdValue)}</small>
                    </span>
                    <strong>{ethBalance || '…'} <small>ETH</small></strong>
                  </article>}
              </section>
              <section className="wallet-actions" aria-label={`Actions ${selectedAsset}`}>
                <button onClick={openTransfer}><FaArrowUp />Envoyer</button>
                <button onClick={openReceive}><FaArrowDown />Recevoir</button>
                <button onClick={() => { setBuyDialogClosing(false); setBuyDialogOpen(true); }}><FaCreditCard />Acheter</button>
              </section>
              {selectedAsset === 'CYD'
                ? <HistoryPanel
                  account={account}
                  history={history.slice(0, 5)}
                  historyTotal={historyTotal}
                  historyError={historyError}
                  historyLoading={historyLoading}
                  onViewAll={() => navigateWalletView('activity')}
                />
                : <section className="panel asset-history-note">
                  <h2>Historique ETH</h2>
                  <p>Les transferts ETH sont confirmés sur Ethereum Mainnet. Consultez l’activité de cette adresse sur Etherscan.</p>
                  <a href={`${ETHEREUM_MAINNET.explorerUrl}/address/${account}`} target="_blank" rel="noreferrer">Voir l’adresse sur Etherscan <FaExternalLinkAlt /></a>
                </section>}
              <MarketExplorer
                compact
                quotes={marketQuotes}
                stockQuotes={stockQuotes}
                loading={marketLoading}
                error={marketError}
                stockLoading={stockLoading}
                stockError={stockError}
                onRetry={refreshMarketQuotes}
                onRetryStocks={refreshStockQuotes}
                onSelectAsset={chooseAsset}
                selectedAsset={selectedAsset}
              />
            </>}
        </div>}

        {wallet && recoveryConfirmed && walletView === 'send' && <section className="panel send-card wallet-view wallet-view-send" key="send">
          <div className="section-intro"><span className="section-icon">{selectedAsset === 'ETH' ? <FaEthereum /> : <FaPaperPlane />}</span><div><h2>Envoyer {selectedAsset}</h2><p>Vérifiez l’adresse et les frais avant de signer la transaction sur {selectedAsset === 'ETH' ? 'Ethereum Mainnet' : 'Sepolia'}.</p></div></div>
          <form className="send-form" onSubmit={submitTransfer}>
            <label htmlFor="recipient">Adresse du bénéficiaire</label>
            <input id="recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" autoComplete="off" disabled={busy} required />
            <div className="amount-label-row">
              <label htmlFor="amount">Montant à envoyer</label>
              {walletSource !== 'metamask' && <button className="metamask-inline" type="button" onClick={connectMetaMask} disabled={busy}><span className="metamask-mark">M</span>Connecter MetaMask</button>}
            </div>
            <div className="wallet-amount-input"><input id="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" disabled={busy} required /><span>{selectedAsset}</span></div>
            {selectedAsset === 'CYD'
              ? <small className="minimum-amount">Montant minimum : {MIN_CYD_TRANSFER.replace('.', ',')} CYD.</small>
              : <small className="minimum-amount">Montant ETH Mainnet. Le solde doit couvrir le montant et les frais réels du réseau.</small>}
            <div className="fee-summary"><span>Solde disponible</span><strong>{selectedAsset === 'ETH' ? ethBalance || '0' : balance || '0'} {selectedAsset}</strong><span>Frais estimés</span><strong>{feeLoading ? 'Estimation…' : fee ? `${fee} ETH` : '—'}</strong><small>{selectedAsset === 'ETH' ? 'Frais réels Ethereum Mainnet' : `Frais Sepolia · solde ETH disponible : ${sepoliaEthBalance || '…'} ETH`}</small></div>
            {feeError && <small className="fee-error" role="alert">{feeError}</small>}
            <button className="primary-button" disabled={busy} type="submit">Vérifier le transfert</button>
          </form>
          {transferReview && <div className="transfer-review" role="region" aria-label="Vérification du transfert">
            <h3>Confirmer les détails</h3><dl><dt>Réseau</dt><dd>{transferReview.asset === 'ETH' ? 'Ethereum Mainnet · transaction réelle' : 'Ethereum Sepolia · CYD'}</dd><dt>Destinataire</dt><dd className="mono">{transferReview.recipient}</dd><dt>Montant</dt><dd>{transferReview.amount} {transferReview.asset}</dd><dt>Frais estimés</dt><dd>{formatEthUnits(transferReview.fee, 18)} ETH</dd></dl>
            <div className="review-actions"><button className="secondary-button" onClick={() => setTransferReview(null)} disabled={busy}>Modifier</button><button className="primary-button" onClick={confirmTransfer} disabled={busy}>{busy ? 'En attente…' : 'Confirmer et envoyer'}</button></div>
          </div>}
        </section>}

        {wallet && recoveryConfirmed && walletView === 'receive' && <section className="panel receive-card wallet-view wallet-view-receive" key="receive">
          <span className="receive-icon">{selectedAsset === 'ETH' ? <FaEthereum /> : <FaArrowDown />}</span><h2>Recevoir {selectedAsset}</h2>
          <p>Scannez ce code pour ouvrir l’écran d’envoi avec votre adresse et l’actif déjà renseignés.{selectedAsset === 'CYD' ? ` Montant minimum : ${MIN_CYD_TRANSFER.replace('.', ',')} CYD.` : ' L’expéditeur choisit le montant en ETH.'}</p>
          {qrCode
            ? <img className="receive-qr" src={qrCode} alt={`Code QR pour ouvrir l’envoi de ${selectedAsset} vers cette adresse`} />
            : <div className="receive-qr-placeholder" role="status">Génération du code QR…</div>}
          <div className="receive-address mono">{account}</div>
          <div className="receive-actions">
            <button className="secondary-button" onClick={copyAddress}><FaCopy />Copier l’adresse</button>
            <button className="secondary-button" onClick={shareReceiveAddress}><FaShareAlt />Partager</button>
          </div>
          <small className="receive-network-note">Réseau {selectedAsset === 'ETH' ? 'Ethereum Mainnet' : 'Sepolia'} · aucun montant n’est imposé au destinataire.</small>
        </section>}

        {wallet && recoveryConfirmed && walletView === 'activity' && selectedAsset === 'CYD' && <div className="wallet-view wallet-view-activity" key="activity">
          <HistoryPanel
            account={account}
            history={history}
            historyTotal={historyTotal}
            historyError={historyError}
            historyLoading={historyLoading}
            onLoadMore={loadMoreHistory}
          />
        </div>}

        {wallet && recoveryConfirmed && walletView === 'settings' && <section className="panel settings-card wallet-view wallet-view-settings" key="settings">
          <h2>Paramètres du portefeuille</h2>
          <dl><dt>Réseau actif</dt><dd>{selectedAsset === 'ETH' ? 'Ethereum Mainnet · transactions réelles' : selectedAsset === 'CYD' ? 'Ethereum Sepolia · CYD' : 'Selon l’actif choisi'}</dd><dt>Contrat CYD</dt><dd className="mono">{CHAIN.tokenAddress || 'À configurer après déploiement'}</dd><dt>Frais</dt><dd>{selectedAsset === 'ETH' ? 'ETH réel sur Ethereum Mainnet' : 'ETH de test sur Sepolia'}</dd><dt>Adresse</dt><dd className="mono">{account}</dd></dl>
          <p>{walletSource === 'metamask'
            ? 'Ce wallet est géré et signé par MetaMask. La phrase secrète ne quitte pas son extension.'
            : 'Le keystore est chiffré dans le stockage local de ce navigateur. Gardez une sauvegarde et ne partagez jamais votre phrase de récupération.'}</p>
          <div className="settings-actions">
            <button className="secret-phrase-button" type="button" onClick={openSecretPhraseWarning}>
              Afficher la phrase secrète
            </button>
            {walletSource === 'local' && <button className="secondary-button" onClick={backupWallet}><FaWallet />Télécharger le keystore chiffré</button>}
            <button className="secondary-button" onClick={lockWallet}>Verrouiller le portefeuille</button>
          </div>
          <p className="security-warning">CYD fonctionne sur Sepolia. Les transferts ETH utilisent Ethereum Mainnet et engagent de vrais actifs : ils sont irréversibles et doivent être vérifiés avant confirmation.</p>
        </section>}

        {wallet && <nav className="wallet-bottom-nav" aria-label="Navigation du portefeuille">
          <button className={walletView === 'home' ? 'active' : ''} onClick={() => navigateWalletView('home')}><FaHome />Accueil</button>
          <button className={walletView === 'send' ? 'active' : ''} onClick={openTransfer}><FaPaperPlane />Envoyer</button>
          <button className={walletView === 'receive' ? 'active' : ''} onClick={openReceive}><FaArrowDown />Recevoir</button>
          <button className={walletView === 'settings' ? 'active' : ''} onClick={() => navigateWalletView('settings')}><FaCog />Réglages</button>
        </nav>}

        {wallet && buyDialogOpen && <div className={`buy-overlay ${buyDialogClosing ? 'is-closing' : ''}`}>
          <section className="buy-dialog" role="dialog" aria-modal="true" aria-labelledby="buy-dialog-title">
            <BackButton className="dialog-back-button" onClick={closeBuyDialog} />
            <button className="buy-dialog-close" type="button" onClick={closeBuyDialog} aria-label="Fermer">×</button>
            <span className="buy-dialog-icon"><FaCreditCard /></span>
            <h2 id="buy-dialog-title">Acheter {selectedAsset}</h2>
            <p>Visa et Mastercard nécessitent un prestataire de paiement. Aucun achat par carte n’est encore disponible pour {selectedAsset}; ce bouton n’effectue aucune transaction.</p>
            <div className="card-payment-options"><span>VISA</span><span>Mastercard</span></div>
            <small>Aucune donnée bancaire n’est demandée ni enregistrée par cette application.</small>
            <button className="primary-button" type="button" onClick={closeBuyDialog}>Compris</button>
          </section>
        </div>}

        {wallet && aboutDialogOpen && <div className={`about-overlay ${aboutDialogClosing ? 'is-closing' : ''}`}>
          <section className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-dialog-title">
            <BackButton className="dialog-back-button" onClick={closeAboutDialog} />
            <button className="about-dialog-close" type="button" onClick={closeAboutDialog} aria-label="Fermer">×</button>
            <span className="about-dialog-mark">C</span>
            <p className="access-kicker">CLAYDE WALLET</p>
            <h2 id="about-dialog-title">À propos</h2>
            <section>
              <h3>Rôle de l’application</h3>
              <p>Clayde Wallet permet de gérer des actifs numériques, de consulter les soldes et l’activité, et d’envoyer ou recevoir des fonds. CYD est disponible sur Sepolia ; ETH est proposé sur Ethereum Mainnet.</p>
            </section>
            <section>
              <h3>Ce qui la distingue</h3>
              <p>Vous pouvez créer ou importer un portefeuille, ou vous connecter avec MetaMask. Les portefeuilles créés dans l’application sont chiffrés dans le stockage de ce navigateur. MetaMask garde la gestion et la signature de ses comptes dans son extension.</p>
            </section>
            <section>
              <h3>Politique de confidentialité — résumé</h3>
              <p>L’application ne crée pas de compte central et ne vous demande pas votre phrase secrète pour utiliser MetaMask. Pour afficher les soldes et l’historique, votre adresse publique est transmise aux fournisseurs RPC et à l’indexeur utilisés par le réseau ; ces services peuvent recevoir votre adresse IP et les détails techniques des requêtes. Les cours crypto sont demandés à CoinGecko sans transmettre l’adresse du portefeuille. Les symboles boursiers sont transmis à Finnhub par l’intermédiaire du Worker Cloudflare ; ni l’adresse ni le solde du portefeuille ne sont inclus dans cette demande. Les transactions inscrites sur une blockchain sont publiques.</p>
              <p>Pour restaurer un wallet local après actualisation, sa clé déchiffrée est conservée temporairement dans le stockage de session de cet onglet. Elle est effacée lorsque vous verrouillez le wallet ou fermez l’onglet. Évitez les appareils partagés ou non fiables.</p>
              <p>Le portefeuille local chiffré est conservé dans le navigateur : sauvegardez-le et gardez votre phrase de récupération hors ligne. La suppression des données du navigateur peut effacer ce portefeuille. Ne partagez jamais votre phrase secrète ou votre mot de passe.</p>
            </section>
            <button className="primary-button" type="button" onClick={closeAboutDialog}>Fermer</button>
          </section>
        </div>}

        {wallet && secretPhraseDialog && <SecretPhraseDialog
          key={secretPhraseDialog}
          phrase={wallet.mnemonic?.phrase || ''}
          step={secretPhraseDialog}
          warningAcknowledged={secretPhraseWarningAcknowledged}
          setWarningAcknowledged={setSecretPhraseWarningAcknowledged}
          revealAcknowledged={secretPhraseRevealAcknowledged}
          setRevealAcknowledged={setSecretPhraseRevealAcknowledged}
          visible={secretPhraseVisible}
          onContinue={continueToSecretPhrase}
          onReveal={revealSecretPhrase}
          onHide={() => {
            setSecretPhraseVisible(false);
            setSecretPhraseRevealAcknowledged(false);
          }}
          onClose={closeSecretPhraseDialog}
        />}

        {wallet && <footer className="wallet-footer">Clayde Wallet · réseau selon l’actif · <a href={selectedAsset === 'ETH' ? `${ETHEREUM_MAINNET.explorerUrl}/address/${account}` : CHAIN.explorerUrl} onClick={selectedAsset === 'ETH' ? undefined : (event) => navigateToSite(event, CHAIN.explorerUrl, 'ClaydeScan')}>Explorer les transactions</a></footer>}
      </main>
      {navigationTarget && <div className="navigation-transition" role="status" aria-live="polite">
        <span className="navigation-transition-mark">C</span>
        <strong>Ouverture de {navigationTarget}</strong>
        <small>Redirection en cours…</small>
      </div>}
    </div>
  );
}

function BackButton({ onClick, className = '', disabled = false }) {
  return (
    <button
      className={`app-back-button ${className}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Retour"
      title="Retour"
    >
      <FaArrowLeft aria-hidden="true" />
    </button>
  );
}

function TransactionConfirmationDialog({ transfer, address, onClose }) {
  const isCyd = transfer.asset === 'CYD';
  const explorerUrl = transfer.hash
    ? isCyd
      ? `${CHAIN.explorerUrl}?search=${transfer.hash}`
      : `${ETHEREUM_MAINNET.explorerUrl}/tx/${transfer.hash}`
    : isCyd
      ? `${CHAIN.explorerUrl}?search=${address}`
      : `${ETHEREUM_MAINNET.explorerUrl}/address/${address}`;

  return (
    <div className="incoming-transfer-overlay">
      <section
        className="incoming-transfer-dialog is-sent"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="incoming-transfer-title"
        aria-describedby="incoming-transfer-message"
      >
        <BackButton className="dialog-back-button" onClick={onClose} />
        <span className="incoming-transfer-icon"><FaCheckCircle /></span>
        <p className="incoming-transfer-kicker">TRANSACTION CONFIRMÉE</p>
        <h2 id="incoming-transfer-title">Votre envoi est confirmé</h2>
        <strong className="incoming-transfer-amount">
          −{transfer.amount} {transfer.asset}
        </strong>
        <p id="incoming-transfer-message">Le transfert est confirmé sur {isCyd ? 'Ethereum Sepolia' : 'Ethereum Mainnet'}.</p>
        {transfer.to && (
          <p className="incoming-transfer-sender">
            Vers : <span className="mono">{shorten(transfer.to, 8, 6)}</span>
          </p>
        )}
        {transfer.fee && <p className="incoming-transfer-sender">Frais réseau : {transfer.fee} ETH</p>}
        <p className="incoming-transfer-balance">
          Solde après transaction : <strong>{transfer.balance || 'mise à jour indisponible'}{transfer.balance ? ` ${transfer.asset}` : ''}</strong>
        </p>
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
          Voir la transaction sur l’explorateur <FaExternalLinkAlt />
        </a>
        <button className="primary-button" type="button" onClick={onClose}>Compris</button>
      </section>
    </div>
  );
}

function getFriendlyError(error) {
  const rawMessage = typeof error === 'string'
    ? error
    : error?.shortMessage || error?.message || '';
  const message = rawMessage.toLowerCase();
  const code = typeof error === 'object' && error ? String(error.code || '').toLowerCase() : '';

  if (/incorrect password|invalid password|could not decrypt|wrong password/.test(message)) {
    return {
      title: 'Mot de passe incorrect',
      message: 'Le mot de passe ne correspond pas à ce wallet ou à ce fichier keystore. Vérifiez-le, puis réessayez.',
    };
  }
  if (/mnemonic|recovery phrase|seed phrase|invalid .*phrase|word count|checksum/.test(message)) {
    return {
      title: 'Phrase de récupération invalide',
      message: 'Vérifiez l’orthographe des mots, leur ordre et le nombre de mots, puis saisissez à nouveau votre phrase.',
    };
  }
  if (/keystore|encrypted json|json wallet|invalid json/.test(message)) {
    return {
      title: 'Fichier keystore illisible',
      message: 'Choisissez un fichier JSON de wallet chiffré valide. Si le fichier est correct, vérifiez aussi son mot de passe.',
    };
  }
  if (/user rejected|user denied|action_rejected/.test(message) || code === '4001') {
    return {
      title: 'Action annulée',
      message: 'La demande a été refusée dans MetaMask. Ouvrez l’extension et confirmez la demande si vous souhaitez continuer.',
    };
  }
  if (/network|rpc|fetch failed|timeout|timed out|connection/.test(message)) {
    return {
      title: 'Connexion au réseau impossible',
      message: 'Vérifiez votre connexion Internet et le réseau sélectionné, puis réessayez dans quelques instants.',
    };
  }
  if (/invalid address|adresse .*valide/.test(message)) {
    return {
      title: 'Adresse invalide',
      message: 'Vérifiez l’adresse du portefeuille et réessayez.',
    };
  }
  if (/amount|montant|too many decimal|underflow/.test(message)) {
    return {
      title: 'Montant invalide',
      message: 'Vérifiez le montant saisi et le nombre de décimales autorisé pour cet actif.',
    };
  }
  if (/argument=|code=|version=|stack|exception|revert|call exception/.test(message)) {
    return {
      title: 'Action impossible',
      message: 'Vérifiez les informations saisies et votre connexion, puis réessayez. Si le problème continue, contactez la personne qui vous accompagne.',
    };
  }
  if (/^(le montant|montant|saisissez|choisissez|déverrouillez|aucun portefeuille|aucun wallet|le contrat|le bloc|l’adresse|adresse|phrase|portefeuille|impossible|le réseau|réseau|transfert|transaction)/.test(message)) {
    return { title: 'Vérifiez votre saisie', message: rawMessage };
  }
  return {
    title: 'Une erreur est survenue',
    message: 'L’action n’a pas pu aboutir. Vérifiez les informations saisies et votre connexion, puis réessayez.',
  };
}

function ErrorDialog({ error, onClose }) {
  const details = getFriendlyError(error);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef(null);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  function close() {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 170);
  }

  return (
    <div className={`error-overlay ${closing ? 'is-closing' : ''}`}>
      <section className="error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="error-dialog-title" aria-describedby="error-dialog-message">
        <BackButton className="dialog-back-button" onClick={close} />
        <span className="error-dialog-icon" aria-hidden="true">!</span>
        <h2 id="error-dialog-title">{details.title}</h2>
        <p id="error-dialog-message">{details.message}</p>
        <button className="primary-button" type="button" onClick={close} disabled={closing}>Compris</button>
      </section>
    </div>
  );
}

function SecretPhraseDialog({
  phrase,
  step,
  warningAcknowledged,
  setWarningAcknowledged,
  revealAcknowledged,
  setRevealAcknowledged,
  visible,
  onContinue,
  onReveal,
  onHide,
  onClose,
}) {
  const words = phrase.split(/\s+/).filter(Boolean);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef(null);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  function close() {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 170);
  }

  return (
    <div className={`secret-phrase-overlay ${closing ? 'is-closing' : ''}`}>
      <section className="secret-phrase-dialog" role="dialog" aria-modal="true" aria-labelledby="secret-phrase-title">
        <BackButton className="dialog-back-button" onClick={close} disabled={closing} />
        <button className="secret-phrase-close" type="button" onClick={close} disabled={closing} aria-label="Fermer">×</button>
        {step === 'warning'
          ? <>
            <p className="secret-phrase-kicker">AVERTISSEMENT DE SÉCURITÉ</p>
            <h2 id="secret-phrase-title">Protégez votre phrase secrète</h2>
            <p>Cette phrase donne un accès complet à votre wallet et à ses fonds. Toute personne qui la voit peut contrôler le portefeuille. Ne la partagez jamais, ne l’envoyez à personne et évitez les captures d’écran.</p>
            <p>Clayde ne peut pas récupérer la phrase si vous la perdez. Affichez-la uniquement dans un lieu privé et sûr.</p>
            <label className="secret-phrase-confirm">
              <input type="checkbox" checked={warningAcknowledged} onChange={(event) => setWarningAcknowledged(event.target.checked)} />
              <span>Oui, j’ai compris. Afficher quand même.</span>
            </label>
            <button className="primary-button" type="button" disabled={!warningAcknowledged} onClick={onContinue}>Continuer</button>
          </>
          : <>
            <p className="secret-phrase-kicker">DERNIÈRE ÉTAPE</p>
            <h2 id="secret-phrase-title">Votre phrase de récupération</h2>
            <p>Elle reste floutée jusqu’à votre confirmation. Assurez-vous que personne ne peut voir votre écran.</p>
            <ol className={`secret-phrase-words ${visible ? 'is-visible' : 'is-blurred'}`} aria-label={visible ? 'Phrase de récupération' : 'Phrase de récupération masquée'}>
              {words.map((word, index) => <li key={`${index}-${word}`}><span>{String(index + 1).padStart(2, '0')}</span>{word}</li>)}
            </ol>
            {!visible
              ? <>
                <label className="secret-phrase-confirm">
                  <input type="checkbox" checked={revealAcknowledged} onChange={(event) => setRevealAcknowledged(event.target.checked)} />
                  <span>Je comprends le risque. Afficher ma phrase maintenant.</span>
                </label>
                <button className="primary-button" type="button" disabled={!revealAcknowledged} onClick={onReveal}>Afficher les mots</button>
              </>
              : <button className="secret-phrase-hide" type="button" onClick={onHide}>Masquer la phrase</button>}
            <p className="secret-phrase-note">Ne copiez pas et ne partagez pas ces mots sur un appareil ou un site non fiable. Fermez cette fenêtre dès que vous avez terminé.</p>
          </>}
      </section>
    </div>
  );
}

function AssetLogo({ asset, className = '' }) {
  const details = ASSET_CATALOG[asset];
  if (!details) throw new Error(`L’actif ${asset} n’a pas de logo configuré.`);

  if (details.logo) {
    return <img className={`asset-logo ${className}`} src={details.logo} alt="" aria-hidden="true" />;
  }

  const Icon = details.icon;
  return <span className={`asset-logo ${details.logoClass || ''} ${className}`} aria-hidden="true"><Icon /></span>;
}

function formatIndicativeUsd(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(amount)
    : '—';
}

function parseDisplayedBalance(value) {
  if (!value) return null;
  const normalized = String(value).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function formatCompactUsd(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(value)
    : '—';
}

function formatMarketPrice(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumSignificantDigits: 6,
    }).format(value)
    : '—';
}

function MarketExplorer({
  quotes,
  stockQuotes,
  loading,
  error,
  stockLoading,
  stockError,
  onRetry,
  onRetryStocks,
  onSelectAsset,
  selectedAsset = '',
  compact = false,
}) {
  const [tab, setTab] = useState('crypto');
  const [expandedSections, setExpandedSections] = useState({});
  const [focusedAsset, setFocusedAsset] = useState(null);
  const [priceDirections, setPriceDirections] = useState({});
  const previousPrices = useRef(new Map());
  const animationTimer = useRef(null);
  const hasLiveQuotes = quotes.some(({ priceUsd }) => Number.isFinite(priceUsd));

  useEffect(() => {
    const directions = {};
    for (const quote of [...quotes, ...stockQuotes]) {
      if (!Number.isFinite(quote.priceUsd)) continue;
      const previousPrice = previousPrices.current.get(quote.id);
      if (Number.isFinite(previousPrice) && quote.priceUsd !== previousPrice) {
        directions[quote.id] = quote.priceUsd > previousPrice ? 'up' : 'down';
      }
      previousPrices.current.set(quote.id, quote.priceUsd);
    }
    if (Object.keys(directions).length) {
      setPriceDirections(directions);
      window.clearTimeout(animationTimer.current);
      animationTimer.current = window.setTimeout(() => setPriceDirections({}), 1200);
    }
  }, [quotes, stockQuotes]);

  useEffect(() => () => window.clearTimeout(animationTimer.current), []);

  const popular = quotes.filter(({ group }) => group === 'popular');
  const crypto = quotes.filter(({ group }) => group === 'crypto');
  const tokens = [
    {
      id: 'claydecoin',
      symbol: 'CYD',
      name: 'Claydecoin',
      group: 'tokens',
      walletAsset: 'CYD',
      image: `${import.meta.env.BASE_URL}claydecoin-logo.png`,
      priceUsd: CYD_DEMO_PRICE_USD,
      change24h: null,
      sparkline: [760, 805, 790, 865, 840, 930, 910, 975, 1000],
      marketStatus: 'Volume démo : 1,000,000 CYD',
      isDemonstration: true,
    },
    ...quotes.filter(({ group }) => group === 'tokens'),
  ];

  function chooseItem(item) {
    if (item.walletAsset) {
      if (item.walletAsset !== selectedAsset) onSelectAsset(item.walletAsset);
      return;
    }
    setFocusedAsset(item);
  }

  function toggleExpanded(section) {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  }

  return (
    <section className={`market-explorer ${compact ? 'is-compact' : 'is-picker'}`} aria-label="Marchés et actifs">
      <header className="market-heading">
        <div>
          <p className="market-kicker">{compact ? 'DÉCOUVRIR' : 'VOTRE PORTEFEUILLE'}</p>
          <h2>{compact ? 'Autres actifs' : 'Markets'}</h2>
        </div>
        <span className="market-currency"><FaChartLine /> USD</span>
      </header>

      <div className="market-tabs" role="tablist" aria-label="Catégories de marché">
        <button type="button" role="tab" aria-selected={tab === 'crypto'} className={tab === 'crypto' ? 'active' : ''} onClick={() => setTab('crypto')}>Crypto</button>
        <button type="button" role="tab" aria-selected={tab === 'stocks'} className={tab === 'stocks' ? 'active' : ''} onClick={() => setTab('stocks')}>Actions</button>
      </div>

      {loading && !hasLiveQuotes && <div className="market-loading" role="status">Chargement des cours crypto en USD…</div>}
      {error && <div className="market-status is-stale" role="status">
        <span>{hasLiveQuotes
          ? 'Mise à jour indisponible ; les derniers cours chargés restent visibles.'
          : 'Les cours en direct sont momentanément indisponibles. La liste des actifs reste affichée sans prix vérifiés.'}</span>
        <button type="button" onClick={onRetry} disabled={loading}>{loading ? 'Actualisation…' : 'Réessayer'}</button>
      </div>}

      {tab === 'crypto'
        ? <>
          <MarketSection
            title="Popular"
            items={popular}
            expanded={expandedSections.popular}
            onToggle={() => toggleExpanded('popular')}
            onSelect={chooseItem}
            selectedAsset={selectedAsset}
            priceDirections={priceDirections}
            loading={loading}
            compact={compact}
            popular
          />
          <MarketSection
            title="Crypto"
            items={crypto}
            expanded={expandedSections.crypto}
            onToggle={() => toggleExpanded('crypto')}
            onSelect={chooseItem}
            selectedAsset={selectedAsset}
            priceDirections={priceDirections}
            loading={loading}
            compact={compact}
          />
          <MarketSection
            title="Token"
            items={tokens}
            expanded={expandedSections.tokens}
            onToggle={() => toggleExpanded('tokens')}
            onSelect={chooseItem}
            selectedAsset={selectedAsset}
            priceDirections={priceDirections}
            loading={loading}
            compact={compact}
          />
          <section className="market-category">
            <div className="market-category-heading"><h3>NFT</h3></div>
            <div className="nft-example-grid">
              {NFT_EXAMPLES.map((nft) => <article className="nft-example-card" key={nft.name}>
                <div className={`nft-example-art art-${nft.art}`} aria-hidden="true"><span>◇</span></div>
                <div className="nft-example-info">
                  <strong>{nft.name}</strong>
                  <small>{nft.collection}</small>
                  <span>Exemple · non accessible</span>
                </div>
              </article>)}
            </div>
            <p className="market-category-note nft-example-note">Visuels de démonstration uniquement : ces NFT ne sont pas connectés à un contrat et ne peuvent pas être achetés ou transférés.</p>
          </section>
          <p className="market-disclaimer">Cours crypto fournis par CoinGecko, actualisés environ chaque minute. Ils ne représentent pas le solde de votre portefeuille. Pour CYD, 1 000 $ et 1 000 000 CYD sont des valeurs illustratives, pas un cours de marché.</p>
        </>
        : <>
          {stockError && <div className="market-status is-stale" role="status">
            <span>{stockError}</span>
            <button type="button" onClick={onRetryStocks} disabled={stockLoading}>
              {stockLoading ? 'Actualisation…' : 'Réessayer'}
            </button>
          </div>}
          {stockQuotes.length > 0 && <p className="market-category-note">Cours en USD fournis par Finnhub via un Worker sécurisé ; variation depuis la clôture précédente. Actualisation environ chaque minute.</p>}
          <MarketSection
            title="Actions"
            items={stockQuotes}
            expanded={expandedSections.stocks}
            onToggle={() => toggleExpanded('stocks')}
            onSelect={setFocusedAsset}
            selectedAsset={selectedAsset}
            priceDirections={priceDirections}
            loading={stockLoading}
            compact={compact}
          />
        </>}

      {focusedAsset && <MarketAssetDialog
        asset={focusedAsset}
        onClose={() => setFocusedAsset(null)}
      />}
    </section>
  );
}

function MarketSection({
  title,
  items,
  expanded,
  onToggle,
  onSelect,
  selectedAsset,
  priceDirections,
  loading,
  compact,
  popular = false,
}) {
  const limit = popular ? 2 : 4;
  const shown = expanded ? items : items.slice(0, limit);
  return (
    <section className={`market-category ${popular ? 'is-popular' : ''}`}>
      <div className="market-category-heading">
        <h3>{title}</h3>
        {items.length > limit && <button type="button" onClick={onToggle}>
          {expanded ? 'Réduire' : 'Afficher tous'} <FaChevronRight />
        </button>}
      </div>
      {!items.length && loading
        ? <div className="market-loading compact-loading" role="status">Chargement…</div>
        : <div className={popular ? 'market-popular-list' : 'market-asset-list'}>
          {shown.map((item) => (
            <MarketAssetRow
              key={item.id}
              asset={item}
              selected={item.walletAsset === selectedAsset}
              direction={priceDirections[item.id] || ''}
              onClick={() => onSelect(item)}
            />
          ))}
        </div>}
    </section>
  );
}

function MarketAssetRow({ asset, selected, direction, onClick }) {
  const hasQuote = Number.isFinite(asset.priceUsd);
  const subtitle = asset.marketStatus
    || (Number.isFinite(asset.volume24hUsd) ? `Vol. ${formatCompactUsd(asset.volume24hUsd)}` : asset.name);
  return (
    <button className={`market-asset-row ${selected ? 'is-selected' : ''} ${direction ? `price-${direction}` : ''}`} type="button" onClick={onClick}>
      {asset.image
        ? <img className="market-asset-icon" src={asset.image} alt="" aria-hidden="true" loading="lazy" />
        : <span className="market-asset-icon market-asset-initials" aria-hidden="true">{asset.symbol.slice(0, 3)}</span>}
      <span className="market-asset-name">
        <strong>{asset.symbol}</strong>
        <small>{subtitle}</small>
      </span>
      {hasQuote
        ? <MarketSparkline asset={asset} />
        : <span className="market-no-quote">{asset.marketStatus || 'Cours indisponible'}</span>}
      <span className="market-asset-value">
        <strong>{hasQuote ? formatMarketPrice(asset.priceUsd) : '—'}</strong>
        <small className={asset.change24h === null || asset.change24h === undefined
          ? ''
          : asset.change24h >= 0 ? 'is-positive' : 'is-negative'}>
          {asset.change24h === null || asset.change24h === undefined
            ? asset.walletAsset === 'CYD' ? 'Testnet' : hasQuote ? '—' : 'Cours indisponible'
            : `${asset.change24h > 0 ? '+' : ''}${asset.change24h.toFixed(2)}%`}
        </small>
      </span>
    </button>
  );
}

function MarketSparkline({ asset }) {
  const values = asset.sparkline.slice(-32);
  if (values.length < 2) return <span className="market-sparkline-empty" aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 31 - ((value - min) / range) * 27;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M ${points.join(' L ')}`;
  const color = asset.isDemonstration
    ? '#a58aff'
    : asset.change24h >= 0 ? '#44c78a' : '#fa6878';
  return (
    <svg className="market-sparkline" viewBox="0 0 100 36" role="img" aria-label={asset.isDemonstration ? `Graphique illustratif pour ${asset.name}` : `Tendance sur sept jours pour ${asset.name}`}>
      <path d={`${line} L 100,36 L 0,36 Z`} fill={color} opacity=".1" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={points[points.length - 1].split(',')[0]} cy={points[points.length - 1].split(',')[1]} r="2.4" fill={color} />
    </svg>
  );
}

function MarketAssetDialog({ asset, onClose }) {
  const hasQuote = Number.isFinite(asset.priceUsd);
  const supported = Boolean(asset.walletAsset);
  return (
    <div className="market-detail-overlay">
      <section className="market-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="market-detail-title">
        <BackButton className="dialog-back-button" onClick={onClose} />
        <button className="market-detail-close" type="button" onClick={onClose} aria-label="Fermer">×</button>
        <p className="market-kicker">DÉTAIL DE L’ACTIF</p>
        <h3 id="market-detail-title">{asset.name} <span>{asset.symbol}</span></h3>
        {hasQuote
          ? <><strong className="market-detail-price">{formatMarketPrice(asset.priceUsd)}</strong>
            <p className={asset.isDemonstration ? 'market-demo-note' : asset.change24h >= 0 ? 'is-positive' : 'is-negative'}>
              {asset.isDemonstration
                ? 'Valeur de démonstration ; aucune cotation réelle.'
                : asset.group === 'stocks'
                  ? `Variation depuis la clôture précédente : ${asset.change24h === null ? 'indisponible' : `${asset.change24h > 0 ? '+' : ''}${asset.change24h.toFixed(2)}%`}`
                  : asset.change24h === null ? 'Variation 24 h indisponible' : `${asset.change24h > 0 ? '+' : ''}${asset.change24h.toFixed(2)}% sur 24 h`}
            </p></>
          : <p>Aucune donnée de cours n’est disponible pour cet actif.</p>}
        <p className="market-detail-warning">
          {supported
            ? 'Cet actif est pris en charge par le portefeuille. Les transactions sont limitées à son réseau configuré.'
            : 'Les cours crypto sont fournis à titre informatif. Cet actif n’est pas encore connecté au portefeuille et aucune opération ne peut être effectuée ici.'}
        </p>
        <button className="primary-button" type="button" onClick={onClose}>Fermer</button>
      </section>
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
  onConnectMetaMask,
  busy,
  savedWalletAddresses,
  selectedWalletAddress,
  setSelectedWalletAddress,
  onCancel,
}) {
  const wordCount = recoveryInput.trim() ? recoveryInput.trim().split(/\s+/).length : 0;
  const validWordCount = isValidRecoveryPhraseWordCount(wordCount);
  const passwordStrong = isStrongWalletPassword(password);
  const goBack = () => setMode(mode === 'keystore' ? 'phrase' : 'welcome');

  if (mode === 'welcome') {
    return (
      <section className="welcome-card" aria-labelledby="welcome-title">
        {onCancel && <button className="access-back" type="button" onClick={onCancel} aria-label="Retour au portefeuille actif"><FaArrowLeft /></button>}
        <div className="welcome-brand-animation" aria-hidden="true">
          <span className="welcome-brand-orbit" />
          <span className="brand-mark welcome-brand-mark">C</span>
        </div>
        <h1 id="welcome-title">Bienvenue</h1>
        <p className="welcome-description">Connectez votre wallet pour accéder à l’application en toute sécurité</p>
        <div className="welcome-actions">
          <button className="welcome-action welcome-create" onClick={() => setMode('create')}>
            <span className="welcome-action-icon"><FaWallet /></span>
            <span><strong>Créer un wallet</strong><small>Générer un portefeuille et sa phrase secrète</small></span>
            <span className="welcome-arrow">→</span>
          </button>
          <button className="welcome-action welcome-import" onClick={() => setMode('phrase')}>
            <span className="welcome-action-icon"><FaArrowDown /></span>
            <span><strong>Importer un wallet</strong><small>Restaurer avec votre phrase de récupération</small></span>
            <span className="welcome-arrow">→</span>
          </button>
        </div>
        {savedWalletAddresses.length > 0 && (
          <button className="welcome-saved-link" onClick={() => setMode('unlock')}>
            Ouvrir un wallet déjà enregistré
          </button>
        )}
        <p className="welcome-privacy"><FaCog /> Vos clés restent sous votre contrôle.</p>
      </section>
    );
  }

  return (
    <section className="access-card" aria-labelledby="access-title">
      <button className="access-back" type="button" onClick={goBack} aria-label="Retour"><FaArrowLeft /></button>
      {mode === 'create' && <>
        <p className="access-kicker">NOUVEAU PORTEFEUILLE</p>
        <h1 id="access-title">Créer un wallet</h1>
        <p className="access-description">Choisissez un mot de passe pour chiffrer le portefeuille sur cet appareil.</p>
        <form className="access-form" onSubmit={onSubmit}>
          <label htmlFor="wallet-password">Mot de passe</label>
          <input id="wallet-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
          <label htmlFor="wallet-password-confirm">Confirmer le mot de passe</label>
          <input id="wallet-password-confirm" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} minLength={8} required />
          <small>8 caractères minimum, avec une majuscule, une minuscule, un chiffre et un symbole. Aucun espace. La phrase secrète apparaîtra une seule fois après la création.</small>
          <button className="access-primary" disabled={busy || !passwordStrong || password !== passwordConfirmation} type="submit">{busy ? 'Création…' : 'Créer mon wallet'}</button>
        </form>
      </>}

      {mode === 'phrase' && <>
        <p className="access-kicker">ACCÈS AU PORTEFEUILLE</p>
        <h1 id="access-title">Importer un wallet</h1>
        <p className="access-description">Saisissez votre phrase de récupération (12, 15, 18, 21 ou 24 mots). Elle est traitée localement dans votre navigateur.</p>
        <form className="access-form" onSubmit={onSubmit}>
          <label htmlFor="wallet-recovery">Phrase de récupération</label>
          <textarea id="wallet-recovery" rows="3" autoComplete="off" spellCheck="false" value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value)} placeholder="12, 15, 18, 21 ou 24 mots séparés par des espaces" required />
          <small className={validWordCount ? 'word-count valid' : 'word-count'}>{wordCount} mots · {validWordCount ? 'longueur valide' : '12, 15, 18, 21 ou 24 mots'}</small>
          <label htmlFor="wallet-password">Nouveau mot de passe pour ce navigateur</label>
          <input id="wallet-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
          <label htmlFor="wallet-password-confirm">Confirmer le mot de passe</label>
          <input id="wallet-password-confirm" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} minLength={8} required />
          <small>8 caractères minimum, avec une majuscule, une minuscule, un chiffre et un symbole. Aucun espace.</small>
          <button className="access-primary" disabled={busy || !validWordCount || !passwordStrong || password !== passwordConfirmation} type="submit">{busy ? 'Importation…' : 'Importer avec la phrase'}</button>
        </form>
        <div className="access-divider"><span />ou<span /></div>
        <button className="metamask-button" type="button" onClick={onConnectMetaMask} disabled={busy}>
          <span className="metamask-mark">M</span>{busy ? 'Connexion…' : 'Se connecter avec MetaMask'}
        </button>
        <button className="access-text-link" type="button" onClick={() => setMode('keystore')}>Importer plutôt un fichier keystore chiffré</button>
      </>}

      {mode === 'keystore' && <>
        <p className="access-kicker">SAUVEGARDE CHIFFRÉE</p>
        <h1 id="access-title">Importer un keystore</h1>
        <p className="access-description">Sélectionnez le fichier JSON de sauvegarde et saisissez son mot de passe.</p>
        <form className="access-form" onSubmit={onSubmit}>
          <label htmlFor="wallet-keystore">Fichier JSON</label>
          <input id="wallet-keystore" type="file" accept=".json,application/json" onChange={onFileChange} required />
          {keystoreFile && <small>Fichier chargé. Son contenu sera déchiffré localement.</small>}
          <label htmlFor="wallet-password">Mot de passe du keystore</label>
          <input id="wallet-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button className="access-primary" disabled={busy || !keystoreFile || !password} type="submit">{busy ? 'Importation…' : 'Importer le keystore'}</button>
        </form>
      </>}

      {mode === 'unlock' && <>
        <p className="access-kicker">PORTEFEUILLE ENREGISTRÉ</p>
        <h1 id="access-title">Ouvrir mon wallet</h1>
        <p className="access-description">Le portefeuille chiffré est conservé dans ce navigateur.</p>
        <form className="access-form" onSubmit={onSubmit}>
          <label htmlFor="saved-wallet">Adresse du portefeuille</label>
          <select id="saved-wallet" value={selectedWalletAddress} onChange={(event) => setSelectedWalletAddress(event.target.value)} required>
            {savedWalletAddresses.map((address) => <option key={address} value={address}>{shorten(address, 10, 8)}</option>)}
          </select>
          <label htmlFor="wallet-password">Mot de passe</label>
          <input id="wallet-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button className="access-primary" disabled={busy || !password || !selectedWalletAddress} type="submit">{busy ? 'Déverrouillage…' : 'Déverrouiller'}</button>
        </form>
      </>}

      <p className="access-security"><FaCog /> Ne partagez jamais votre phrase secrète ou votre mot de passe.</p>
    </section>
  );
}

function RecoveryPhraseDialog({
  phrase,
  copied,
  saved,
  setSaved,
  onCopy,
  onManualCopy,
  onConfirm: onConfirmRequest,
  onBack,
}) {
  const [closing, setClosing] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const closeTimer = useRef(null);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  function confirm() {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(onConfirmRequest, 170);
  }

  return (
    <div className={`recovery-overlay ${closing ? 'is-closing' : ''}`}>
      <section className="recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
        <BackButton className="dialog-back-button" onClick={() => setConfirmExit(true)} disabled={closing} />
        {confirmExit && <div className="recovery-exit-confirm" role="alertdialog" aria-label="Quitter la sauvegarde">
          <p>Quitter verrouillera le wallet et masquera cette phrase. Vérifiez que vous en avez conservé une copie sûre avant de continuer.</p>
          <div>
            <button type="button" onClick={() => setConfirmExit(false)}>Continuer la sauvegarde</button>
            <button type="button" onClick={onBack}>Quitter et verrouiller</button>
          </div>
        </div>}
        <div className="recovery-heading">
          <span className="recovery-icon"><FaWallet /></span>
          <span><p className="access-kicker">ÉTAPE DE SÉCURITÉ</p><h2 id="recovery-title">Sauvegardez votre phrase secrète</h2></span>
        </div>
        <p className="recovery-intro">C’est la seule façon de récupérer ce wallet. Notez ces mots dans l’ordre et conservez-les hors ligne.</p>
        <ol className="recovery-words">{phrase.split(' ').map((word, index) => <li key={`${word}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span>{word}</li>)}</ol>
        <button className="recovery-copy" type="button" onClick={onCopy} disabled={closing}><FaCopy />{copied ? 'Phrase copiée' : 'Copier la phrase secrète'}</button>
        {copied && <p className="recovery-copy-status" role="status">Phrase copiée. Collez-la dans un endroit sûr ou recopiez-la sur papier.</p>}
        {!copied && <button className="recovery-manual-copy" type="button" onClick={onManualCopy} disabled={closing}>Je l’ai recopiée manuellement</button>}
        <label className="recovery-confirm">
          <input type="checkbox" checked={saved} disabled={!copied || closing} onChange={(event) => setSaved(event.target.checked)} />
          <span>J’ai copié et sauvegardé ma phrase. Je comprends qu’elle est irrécupérable en cas de perte.</span>
        </label>
        <button className="access-primary" type="button" disabled={!copied || !saved || closing} onClick={confirm}>J’ai sauvegardé ma phrase</button>
        <p className="security-warning">Ne la partagez jamais. L’équipe Clayde ne vous la demandera jamais.</p>
      </section>
    </div>
  );
}

function HistoryPanel({
  account,
  history,
  historyTotal,
  historyError,
  historyLoading,
  onLoadMore,
  onViewAll,
}) {
  return (
    <section className="panel history-panel">
      <div className="history-heading">
        <h2>Activité CYD</h2>
        <div className="history-heading-actions">
          <span>{history.length} / {historyTotal}</span>
          {onViewAll && <button className="history-view-all" type="button" onClick={onViewAll}>Voir tout</button>}
        </div>
      </div>
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
      {onLoadMore && history.length < historyTotal && <button className="history-more" onClick={onLoadMore} disabled={historyLoading}>{historyLoading ? 'Chargement…' : 'Voir les activités précédentes'}</button>}
    </section>
  );
}

export default App;
