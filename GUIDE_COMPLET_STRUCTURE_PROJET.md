# Guide complet de la structure du projet Clayde Chain

**Version du guide : 16 novembre 2026**
**Projet décrit : `d_app_blockchain_local`**

Ce document explique l’organisation du dépôt, le rôle de ses fichiers, les dépendances, les échanges avec la blockchain et les commandes utiles. Il sert de carte pour savoir où chercher avant de modifier le projet.

> **À retenir :** les trois interfaces publiées actuellement utilisent le contrat CYD sur **Ethereum Sepolia**. Le nom « Claydecoin » est la marque de l’application; il ne signifie pas que le navigateur utilise le réseau Besu local. Les scripts Besu conservés dans le dépôt concernent une ancienne version locale et sont identifiés comme tels plus loin.

## 1. Vue d’ensemble

Le dépôt contient trois applications web séparées, mais organisées dans un seul projet :

| Interface | Dossier source | Fonction |
|---|---|---|
| Tableau de bord | `apps/blockchain/` | Affiche l’état du réseau, des blocs récents, des transferts CYD et les liens vers les autres interfaces. |
| Explorateur | `apps/explorer/` | Recherche des numéros de blocs, des transactions et des adresses; affiche des transferts CYD et leur historique. |
| Portefeuille DApp | `apps/dapp/` | Crée, ouvre, restaure et importe des portefeuilles; lit les soldes et peut signer des transferts CYD dans le navigateur. |

Les trois applications réutilisent des fonctions de `src/shared/`. Chaque interface possède sa propre page HTML, son point d’entrée React, ses styles et sa configuration Vite.

### Chemin des données dans la version publiée

1. Le navigateur charge l’une des trois interfaces statiques hébergées par GitHub Pages.
2. Les fonctions de `src/shared/sepolia.js` utilisent `ethers` pour lire les blocs, les soldes et le contrat CYD sur Sepolia via un RPC public.
3. Les journaux d’événements `Transfer` et une partie des données d’historique sont récupérés auprès de l’API publique Blockscout Sepolia, par `src/shared/blockscout.js`.
4. Le portefeuille chiffre les sauvegardes côté navigateur. Le fichier keystore chiffré est conservé dans le stockage local du profil de navigateur; il n’est pas stocké dans GitHub.
5. Pour envoyer des CYD, le navigateur fait estimer les frais, demande une confirmation, signe avec le portefeuille déverrouillé et envoie la transaction au RPC. Les frais de transaction sont payés en Sepolia ETH.

GitHub Pages héberge les fichiers statiques; il ne fait pas tourner un nœud de blockchain ni une base de données pour le portefeuille.

## 2. Arborescence du dépôt

```text
d_app_blockchain_local/
├── apps/
│   ├── blockchain/                 # Tableau de bord
│   ├── explorer/                   # Explorateur
│   └── dapp/                       # Portefeuille DApp et assets statiques
├── contracts/                      # Contrat CYD et configuration de déploiement
├── cloudflare/stock-quotes/         # Proxy Cloudflare des cours boursiers
├── network/besu/                   # Configuration de l’ancien réseau local Besu
├── scripts/                        # Démarrage, déploiement, serveur historique et tests
├── src/shared/                     # Fonctions et styles réutilisés
├── .devcontainer/                  # Configuration de l’environnement Codespaces/devcontainer
├── .github/workflows/              # Automatisation GitHub Actions / Pages
├── package.json                    # Dépendances et commandes npm
├── package-lock.json               # Versions exactes installées par npm
├── README.md                       # Guide de démarrage et de publication
├── GUIDE_COMPLET_STRUCTURE_PROJET.md # Le présent guide
└── fichiers de configuration à la racine
```

`node_modules/`, `apps/*/dist/`, `_site/` et `.besu/` contiennent des dépendances installées, des sorties de compilation ou des données locales. À l’inverse, `apps/dapp/public/claydecoin-logo.png` est un asset source statique copié dans le build.

## 3. Les trois applications

Chaque sous-dossier d’application suit le même principe :

- `index.html` est la page HTML minimale chargée par le navigateur.
- `src/main.jsx` démarre React et charge l’application et ses feuilles de style.
- `src/App.jsx` contient les écrans et le comportement de l’interface.
- `src/style.css` contient les styles propres à cette interface.
- `vite.config.js` règle la compilation, les chemins de publication et le serveur de développement.

### `apps/blockchain/` — tableau de bord

- `apps/blockchain/index.html` : titre, langue, métadonnées et élément `#root` dans lequel React affiche l’interface.
- `apps/blockchain/src/main.jsx` : monte le composant `App` dans le DOM avec `createRoot` et `React.StrictMode`; importe les styles partagés et le CSS du tableau de bord.
- `apps/blockchain/src/App.jsx` : écran principal, statistiques CYD, tableaux de blocs et transferts, liens vers l’explorateur et le portefeuille, et pages Paramètres/À propos. Il récupère régulièrement un instantané au moyen de `getChainSnapshot` depuis `sepolia.js`.
- `apps/blockchain/src/style.css` : ajustements visuels particuliers au tableau de bord et à ses vues Paramètres/À propos.
- `apps/blockchain/vite.config.js` : configuration Vite de cette application. Le cache Vite est isolé dans `node_modules/.vite/blockchain`; le chemin de base peut être réglé par `VITE_BASE_PATH`; les fichiers d’environnement sont lus à la racine.

### `apps/explorer/` — explorateur

- `apps/explorer/index.html` : métadonnées HTML et conteneur React de l’explorateur.
- `apps/explorer/src/main.jsx` : démarre React et importe les feuilles de style communes et propres à l’explorateur.
- `apps/explorer/src/App.jsx` : recherche un bloc, un hash de transaction ou une adresse; affiche les résultats, les blocs récents, les transferts CYD et la pagination de l’historique. Il coordonne les appels à `sepolia.js` et les états de chargement/erreur.
- `apps/explorer/src/style.css` : présentation du bandeau de recherche, des résultats et des tableaux de l’explorateur.
- `apps/explorer/vite.config.js` : configuration Vite avec son cache séparé dans `node_modules/.vite/explorer`.

### `apps/dapp/` — portefeuille

- `apps/dapp/index.html` : métadonnées HTML et conteneur React du portefeuille.
- `apps/dapp/src/main.jsx` : point de démarrage React; charge les styles communs et ceux de la DApp.
- `apps/dapp/src/App.jsx` : interface et orchestration du portefeuille : accueil animé, création avec confirmation de sauvegarde de la phrase, import BIP-39 de 12/15/18/21/24 mots, connexion MetaMask, ouverture d’un wallet enregistré, import de keystore JSON, verrouillage, choix des actifs, soldes, QR de réception, estimation des frais et confirmation des transferts. CYD utilise Sepolia (ETH de test pour ses frais); ETH utilise Ethereum Mainnet (vrais soldes, transactions et frais). Les opérations blockchain sont déléguées à `sepolia.js`; les liens de partage sont fabriqués par `payment-request.js`.
- `apps/dapp/src/style.css` : styles du portefeuille, de son écran d’accès, des formulaires d’envoi/réception, des historiques, des avertissements et de la navigation mobile.
- `apps/dapp/public/claydecoin-logo.png` : logo Claydecoin/CYD en PNG avec transparence circulaire, utilisé dans le sélecteur d’actifs et les soldes.
- `apps/dapp/vite.config.js` : configuration Vite propre à la DApp. Son cache est séparé dans `node_modules/.vite/dapp`; le découpage du bundle isole `ethers` dans un paquet chargé séparément.

Les trois configurations Vite séparent leurs caches. Cette séparation évite qu’un serveur de développement réutilise par erreur des dépendances mises en cache par une autre interface.

## 4. Code partagé : `src/shared/`

### Modules JavaScript

- `src/shared/sepolia.js` — **module blockchain principal des interfaces.** Il configure `ethers` pour Sepolia et Ethereum Mainnet, et fournit notamment :
  - les informations de chaîne et les URL entre interfaces (`CHAIN`);
  - la création, l’import, le déverrouillage et la sauvegarde de wallets chiffrés;
  - la lecture du solde CYD et de l’ETH Sepolia pour le gas CYD, et la lecture du vrai solde ETH sur Mainnet;
  - la lecture des blocs et des événements du token;
  - la recherche d’un bloc, d’une transaction ou d’une adresse;
  - l’estimation des frais et l’envoi de CYD sur Sepolia (minimum 0,10 CYD) et d’ETH sur Ethereum Mainnet;
  - le rafraîchissement de l’historique incluant les événements des derniers blocs pour limiter la latence des notifications.
  - la connexion à MetaMask, la demande de compte, et le changement/ajout de Sepolia ou Mainnet selon l’actif sélectionné.

  CYD utilise le chain ID `11155111` (Sepolia); ETH utilise le chain ID `1` (Ethereum Mainnet). L’adresse et le bloc de déploiement CYD viennent de `contracts/sepolia-deployment.json`; les variables `VITE_CYD_TOKEN_ADDRESS`, `VITE_CYD_DEPLOYMENT_BLOCK`, `VITE_SEPOLIA_RPC_URL` et `VITE_ETHEREUM_MAINNET_RPC_URL` peuvent fournir des valeurs de remplacement. Les opérations ETH Mainnet sont réelles et irréversibles.

- `src/shared/blockscout.js` — client HTTP pour l’API Blockscout Sepolia. Il parcourt les pages de journaux du contrat et ne conserve que les événements `Transfer` correspondant au sujet demandé. Il signale les erreurs HTTP, les réponses mal formées et les curseurs répétés au lieu de présenter ces erreurs comme un historique vide.

- `src/shared/market-data.js` — catalogue crypto/actions et normalisation des cours CoinGecko et du Worker Cloudflare. Il refuse les cours absents ou invalides au lieu d’en fabriquer.

- `src/shared/wallet-storage.js` — stockage des keystores chiffrés dans `localStorage`, indexés par adresse. Il supporte plusieurs wallets dans le même profil de navigateur, valide les adresses et les entrées, met à jour un wallet existant sans le dupliquer et migre l’ancien format de stockage `clayde.wallet.keystore` vers `clayde.wallet.keystores`.

- `src/shared/payment-request.js` — construit un lien de réception vers la DApp avec le destinataire, l’actif CYD ou ETH et, facultativement, le montant. Il vérifie le format de l’adresse et refuse un montant invalide, nul ou ayant plus de 18 décimales.

- `src/shared/transfer-amount.js` — convertit les montants CYD et ETH en unités exactes `bigint`, applique le minimum de 0,10 CYD et refuse les montants ETH nuls.

- `src/shared/recovery-phrase.js` — normalise une phrase de récupération et accepte les longueurs BIP-39 standards de 12, 15, 18, 21 ou 24 mots; `ethers` vérifie ensuite le checksum BIP-39 et dérive l’adresse.

- `src/shared/wallet-network.js` — change MetaMask vers le réseau demandé (Sepolia pour CYD, Ethereum Mainnet pour ETH), ajoute le réseau s’il est absent et vérifie le chain ID actif avant de poursuivre.

- `src/shared/chain.js` — ancien module d’accès au réseau Besu local, avec le chain ID `20261110`, ses anciennes URL RPC/API et une logique de transferts natifs. **Aucune des trois interfaces actuelles ne l’importe**; la version publiée utilise `sepolia.js`. Le fichier est conservé avec les anciens scripts et ne doit pas être confondu avec la configuration active de Sepolia.

### Feuilles de style partagées

- `src/shared/layout.css` — styles de base partagés : mise en page, panneaux, tableaux, boutons, statuts, messages d’erreur et règles adaptatives pour les petits écrans.
- `src/shared/theme.css` — palette et personnalisations communes du thème visuel. Dans les points d’entrée, il est importé après le CSS de l’application, donc ses règles peuvent redéfinir certains styles communs.

## 5. Contrat CYD : `contracts/`

- `contracts/ClaydeToken.sol` — contrat Solidity basé sur `ERC20` d’OpenZeppelin. Il crée le token nommé `Clayde`, symbole `CYD`, et attribue une offre initiale fixe de `1 000 000` CYD au compte qui déploie le contrat. Le contrat ne définit pas de fonction d’émission additionnelle.
- `contracts/sepolia-deployment.json` — adresse publique du contrat déployé et numéro du bloc de déploiement. Ce fichier n’est pas une clé privée; les interfaces et le workflow GitHub Pages s’en servent pour savoir quel contrat lire.

Le token CYD est un ERC-20 de démonstration déployé sur Sepolia; ses frais sont dus en ETH de test. L’actif ETH de l’application est sur Ethereum Mainnet : les transactions et frais utilisent de vrais ETH.

## 6. Scripts : `scripts/`

### Démarrage, compilation et déploiement

- `scripts/dev-sepolia.mjs` — démarre trois serveurs Vite sur `127.0.0.1:5173`, `:5174` et `:5175` pour tester les interfaces actuelles. Il ne démarre pas Besu; les interfaces se connectent à Sepolia. Il demande également à Vite d’ouvrir le portefeuille dans le navigateur.
- `scripts/dev.mjs` — ancien lanceur local, disponible avec `npm run dev:besu` : prépare Besu, démarre Docker Compose, attend le RPC local, démarre l’indexeur d’historique et les serveurs Vite. C’est une voie historique liée au réseau local Besu, et non le démarrage recommandé de la version Sepolia.
- `scripts/deploy-cyd.mjs` — compile `ClaydeToken.sol` avec `solc`, lit un fichier wallet JSON chiffré, demande son mot de passe sans l’afficher, vérifie le chain ID Sepolia et exige la saisie de `DEPLOY` avant d’envoyer le déploiement. Après confirmation, écrit l’adresse et le bloc du contrat dans `contracts/sepolia-deployment.json`. La clé privée déchiffrée reste en mémoire pendant l’opération; ne publiez jamais le fichier keystore ou son mot de passe.
- `scripts/wallet-create.mjs` — ancien utilitaire qui crée un wallet chiffré pour le Genesis du réseau Besu local sous `.besu/generated/`. Il ne crée pas le wallet utilisé par la DApp publiée.
- `scripts/build-vercel.mjs` — construit les trois interfaces avec des chemins Vercel et les assemble dans le dossier généré `public/`; crée aussi une page d’entrée vers la DApp.
- `scripts/codespaces-demo.mjs` — ancienne automatisation Docker pour une démo Codespaces sur le port 10000. Elle construit et lance un conteneur, puis vérifie `/health`; le README indique que cette démo Codespaces a été abandonnée au profit de GitHub Pages.
- `scripts/render-server.mjs` — serveur Node utilisé par l’ancien déploiement Docker/Render. Il sert les fichiers compilés, expose `/health` et des routes d’historique, démarre Besu et fournit un proxy RPC limité à une liste de méthodes. Ce chemin est distinct de GitHub Pages et ne constitue pas le backend de l’application publiée sur Pages.
- `scripts/history-index.mjs` — indexeur de l’ancienne chaîne Besu. Il parcourt les blocs et reçus, normalise les transactions natives et les transferts de tokens, conserve les transactions dans un fichier JSONL et un fichier d’état, puis permet de consulter des historiques paginés. Il est lancé par les anciens serveurs locaux/Render; l’historique public Sepolia utilise plutôt RPC et Blockscout.

### Tests automatisés

- `scripts/blockscout-index.test.mjs` — vérifie la pagination Blockscout, le filtrage des événements CYD et le signalement d’une erreur HTTP.
- `scripts/cyd-amount.test.mjs` — vérifie le montant minimum CYD, les décimales françaises et le rejet d’une précision invalide.
- `scripts/history-index.test.mjs` — vérifie l’indexation persistante et la pagination des historiques natifs et de wallets sur l’ancien indexeur.
- `scripts/payment-request.test.mjs` — vérifie la création des liens de paiement ainsi que le rejet des adresses et montants invalides.
- `scripts/recovery-phrase.test.mjs` — vérifie la normalisation et les longueurs de phrase BIP-39 acceptées, dont 24 mots.
- `scripts/render-deploy.test.mjs` — vérifie que le Genesis peut être construit pour un déploiement hébergé à un validateur sans modifier le paramétrage local QBFT à quatre validateurs.
- `scripts/wallet-network.test.mjs` — vérifie le basculement MetaMask Mainnet/Sepolia, l’ajout de Sepolia et le signalement d’un changement réseau refusé.
- `scripts/wallet-storage.test.mjs` — vérifie la migration de l’ancien stockage, la coexistence de plusieurs wallets, la mise à jour sans doublon et l’erreur explicite quand les données enregistrées sont mal formées.

`npm test` exécute ces tests avec le test runner intégré à Node.js (`node --test`). Ce sont des tests de modules et de comportements ciblés, pas un test end-to-end automatisé de chaque clic de l’interface.

## 7. Ancien réseau local Besu : `network/besu/`

Cette partie est séparée du chemin actuel Sepolia/GitHub Pages.

- `network/besu/genesis.js` — fabrique le fichier Genesis pour une chaîne privée QBFT. Il définit le chain ID local `20261110`, vérifie l’adresse financée et le nombre de validateurs, encode la liste des validateurs et attribue le solde de départ au compte Genesis.
- `network/besu/setup.js` — prépare les fichiers ignorés par Git dans `.besu/generated/`: clés des validateurs, `genesis.json`, URL des bootnodes et état du réseau. Il vérifie que les données persistantes existantes correspondent au chain ID et à l’adresse financée avant de continuer.
- `network/besu/compose.yaml` — définit quatre validateurs Besu, leur réseau Docker et leurs volumes nommés `validator1-data` à `validator4-data`. Les volumes gardent les données de la chaîne entre les arrêts des conteneurs. `npm run network:down` arrête les conteneurs sans supprimer ces volumes.

Les clés, fichiers Genesis générés et bases de données Besu restent dans `.besu/` ou dans Docker. Ils sont des données locales; ils ne doivent pas être ajoutés au dépôt public. Ne supprimez pas les volumes Docker si vous devez conserver la chaîne locale.

## 8. Configuration et publication

### Fichiers à la racine

- `package.json` — nom du projet, version, plage de Node.js, dépendances et commandes npm décrites à la section 9.
- `package-lock.json` — verrouille la résolution des dépendances. `npm ci` installe les versions du verrou, ce qui aide à obtenir la même installation sur un autre ordinateur.
- `README.md` — instructions de démarrage Sepolia, avertissements du wallet, commandes de build et procédures de publication; décrit aussi les éléments Besu historiques.
- `index.html` — page d’entrée racine qui redirige vers `./dapp/`. Les trois applications ont aussi leur propre `index.html`.
- `.env.example` — modèle des variables d’environnement locales. Copier ce modèle vers `.env` est une étape locale; ne jamais publier `.env`.
- `.gitignore` — exclut notamment les dépendances, builds, `.env`, `.besu`, sauvegardes et sorties générées.
- `.dockerignore` — exclut les dépendances, builds, données privées/locales et fichiers d’environnement du contexte de construction Docker.
- `.devcontainer/devcontainer.json` — image Node 22 pour Codespaces/devcontainers, fonctionnalité Docker, port 10000 transféré et `npm ci` après création.
- `.github/workflows/deploy-pages.yml` — workflow GitHub Actions déclenché par un push sur `main` ou manuellement. Il installe Node, vérifie la configuration du contrat, construit les trois interfaces dans `_site/`, puis publie l’artefact avec GitHub Pages.
- `cloudflare/stock-quotes/src/index.js` et `cloudflare/stock-quotes/wrangler.toml` — Worker Cloudflare limité aux cours de six symboles Finnhub, avec CORS limité au site GitHub Pages et au développement local. La clé `FINNHUB_API_KEY` doit être enregistrée comme secret Wrangler; elle ne doit jamais être mise dans `VITE_*` ou dans le dépôt.
- `Dockerfile` — construction multi-étape de l’ancien mode conteneurisé : construit les interfaces Vite, récupère Besu puis lance `scripts/render-server.mjs` sous Node. Ce n’est pas le workflow de déploiement GitHub Pages.
- `render.yaml` — configuration de l’ancien service Docker Render, avec une variable `BESU_GENESIS_ADDRESS`.
- `vercel.json` — configuration de l’ancien build Vercel : commande `build:vercel`, dossier de sortie `public/` et réécritures vers les trois routes.

### Variables d’environnement de `.env.example`

- `BESU_GENESIS_ADDRESS` — adresse publique préfinancée pour l’ancien Genesis Besu. Ce n’est pas une clé privée.
- `VITE_CHAIN_RPC_URL`, `VITE_HISTORY_API_URL` — anciennes URL RPC et API d’historique locales pour la voie Besu.
- `VITE_BLOCKCHAIN_URL`, `VITE_EXPLORER_URL`, `VITE_DAPP_URL` — anciennes URL locales des trois interfaces.
- `VITE_SEPOLIA_RPC_URL` — RPC utilisé par les interfaces Sepolia; le workflow Pages fournit une valeur RPC publique lors du build.
- `VITE_ETHEREUM_MAINNET_RPC_URL` — RPC Mainnet pour lire les soldes ETH et diffuser les transferts natifs; valeur publique par défaut `https://ethereum-rpc.publicnode.com`.
- `VITE_CYD_TOKEN_ADDRESS`, `VITE_CYD_DEPLOYMENT_BLOCK` — valeurs de remplacement possibles pour le contrat et son bloc. À défaut, l’application lit `contracts/sepolia-deployment.json`.
- `VITE_STOCK_QUOTES_URL` — URL publique du Worker Cloudflare. L’URL du Worker du projet est la valeur par défaut dans la DApp; cette variable et la variable Actions facultative `STOCK_QUOTES_URL` servent seulement à la remplacer. L’URL est publique, mais la clé Finnhub ne l’est pas.

Toute variable `VITE_*` utilisée dans une application web peut être intégrée au JavaScript livré au navigateur et donc visible publiquement. On ne doit jamais y mettre une clé privée, un mot de passe, une phrase de récupération ou un secret d’API.

### Routes publiées

- Racine : `https://melvin-132.github.io/d_app_blockchain_local/` — redirige vers la DApp.
- Tableau de bord : `https://melvin-132.github.io/d_app_blockchain_local/blockchain/`
- Explorateur : `https://melvin-132.github.io/d_app_blockchain_local/explorer/`
- Portefeuille : `https://melvin-132.github.io/d_app_blockchain_local/dapp/`

Le workflow compile chaque application avec son propre chemin de base; cela permet à ses fichiers JavaScript et CSS de fonctionner sous le sous-chemin du dépôt GitHub Pages.

## 9. Extensions et dépendances

### Que signifient les extensions ?

| Extension | Utilisation dans ce dépôt |
|---|---|
| `.jsx` | JavaScript contenant des composants React avec du JSX (syntaxe d’interface ressemblant à du HTML). |
| `.js` | Module JavaScript utilisé par le navigateur, Vite ou la configuration réseau. Le projet est configuré en modules ES avec `"type": "module"`. |
| `.mjs` | Module ES JavaScript explicitement destiné aux scripts Node.js. |
| `.css` | Mise en forme visuelle et disposition des interfaces. |
| `.html` | Document d’entrée transmis au navigateur par Vite ou le serveur statique. |
| `.json` | Configuration structurée, métadonnées de déploiement ou données de wallet chiffrées exportées. Un keystore JSON téléchargé reste sensible même s’il est chiffré. |
| `.yaml` / `.yml` | Configuration déclarative de Docker Compose, Render ou GitHub Actions. |
| `.sol` | Code source d’un contrat intelligent écrit en Solidity. |
| `.md` | Documentation Markdown lisible dans GitHub et les éditeurs de code. |
| `.env` | Variables locales lues par les outils; le fichier réel est ignoré par Git. `.env.example` est un modèle sans secret de wallet. |
| `.lock` (nom `package-lock.json`) | Résolution exacte des dépendances npm. |

### Dépendances npm de `package.json`

| Paquet | Rôle |
|---|---|
| `react` | Bibliothèque de composants et d’état de l’interface. |
| `react-dom` | Affiche les composants React dans le document HTML du navigateur. |
| `@vitejs/plugin-react` | Permet à Vite de traiter et compiler le code React/JSX. |
| `vite` | Serveur de développement et outil de compilation des trois interfaces. |
| `ethers` | Bibliothèque Ethereum : RPC, adresses, wallets, keystores, contrats, ABI, soldes et transactions. |
| `qrcode` | Génère dans le navigateur l’image du QR menant à l’écran d’envoi CYD avec le destinataire prérempli. |
| `react-icons` | Fournit les icônes de navigation et d’actions importées par les composants React. Les icônes sont rendues en composants SVG; le projet n’a pas besoin d’un dossier de photos pour ces icônes. |
| `@openzeppelin/contracts` | Implémentation standard et réutilisée du contrat ERC-20 importée par `ClaydeToken.sol`. |
| `solc` | Compilateur Solidity utilisé par `scripts/deploy-cyd.mjs`. |

Les scripts Node utilisent également des modules intégrés à Node (par exemple `node:fs`, `node:path`, `node:http`, `node:child_process`) pour les fichiers, chemins, serveurs et processus. Ils n’ont pas besoin d’être ajoutés dans `package.json`.

Les conteneurs utilisent les images `node:22-bookworm-slim` et `hyperledger/besu:26.10.0`. Docker et Besu servent l’ancien environnement conteneurisé/local, pas le build statique GitHub Pages.

## 10. Commandes npm

| Commande | Fonction |
|---|---|
| `npm install` | Installe les dépendances en développement; habituellement à faire après avoir récupéré le dépôt. |
| `npm ci` | Réinstalle exactement les dépendances du `package-lock.json`; recommandé en CI et sur une installation propre. |
| `npm run dev` | Démarre les trois interfaces Sepolia et ouvre le wallet dans le navigateur. |
| `npm run dev:sepolia` | Alias explicite de `npm run dev`. |
| `npm run dev:besu` | Démarre l’ancien réseau local Besu avec Docker. |
| `npm run build` | Construit les trois applications l’une après l’autre. |
| `npm run build:blockchain` | Construit seulement le tableau de bord. |
| `npm run build:explorer` | Construit seulement l’explorateur. |
| `npm run build:dapp` | Construit seulement le portefeuille. |
| `npm test` | Exécute les tests Node déclarés dans `package.json`. |
| `npm run token:deploy` | Compile puis, après validations et confirmation explicite, déploie le token sur Sepolia avec un keystore chiffré. |
| `npm run build:vercel` | Ancien build Vercel; assemble les sorties dans `public/`. |
| `npm run wallet:create` | Ancien outil de création de wallet Genesis pour Besu; ne sert pas à créer un wallet dans la DApp publiée. |
| `npm run network:setup` | Génère la configuration locale Besu et ses clés sous `.besu/`. |
| `npm run network:up` / `npm run network:down` | Démarre ou arrête les conteneurs du réseau local Besu. L’arrêt normal conserve les volumes. |
| `npm run demo:cloud` / `npm run demo:cloud:stop` | Anciennes commandes Docker de démo Codespaces. |

Les builds Vite sont écrits dans `apps/blockchain/dist/`, `apps/explorer/dist/` et `apps/dapp/dist/`. Ces dossiers sont générés; les modifications doivent se faire dans `apps/*/src/`.

## 11. Où modifier le code ?

| Besoin | Fichier ou dossier à regarder en premier |
|---|---|
| Modifier un écran du tableau de bord | `apps/blockchain/src/App.jsx` |
| Modifier un écran de l’explorateur | `apps/explorer/src/App.jsx` |
| Modifier les écrans du wallet | `apps/dapp/src/App.jsx` |
| Modifier l’apparence commune | `src/shared/layout.css` ou `src/shared/theme.css` |
| Modifier le style d’une seule interface | Son `apps/<nom>/src/style.css` |
| Modifier la connexion au réseau Sepolia, aux soldes ou aux transactions | `src/shared/sepolia.js` |
| Modifier la récupération des journaux Blockscout | `src/shared/blockscout.js` |
| Modifier le stockage des wallets dans le navigateur | `src/shared/wallet-storage.js` |
| Modifier la validation ou la forme du lien de paiement | `src/shared/payment-request.js` |
| Modifier le contrat CYD | `contracts/ClaydeToken.sol` |
| Mettre à jour l’adresse/le bloc du contrat | `contracts/sepolia-deployment.json` |
| Modifier le workflow de publication Pages | `.github/workflows/deploy-pages.yml` |
| Modifier l’ancien réseau privé local | `network/besu/` et les anciens scripts correspondants |

## 12. Sécurité, sauvegardes et partage avec l’encadreur

- Le dépôt peut contenir le code source, le contrat, l’adresse publique du contrat, le numéro de bloc et les fichiers de configuration sans secret.
- Ne partagez jamais `.env`, une phrase de récupération, un mot de passe, une clé privée ou un keystore JSON avec votre dépôt public. Un keystore est chiffré, mais il reste une sauvegarde confidentielle à conserver séparément.
- Les données locales de Besu, clés de validateurs, fichiers générés et sauvegardes sont exclus par `.gitignore`. Ne les ajoutez pas manuellement au dépôt.
- Le wallet de la DApp est lié au stockage local du navigateur utilisé. Il ne se synchronise pas automatiquement sur l’ordinateur d’une autre personne; pour l’importer, il faut son keystore chiffré et son mot de passe ou sa phrase de récupération. Une adresse publique seule ne permet pas de signer.
- Le faucet PK910 demande du travail de calcul avant de réclamer des ETH Sepolia. Ce calcul utilise les ressources de l’ordinateur et le fournisseur peut appliquer des limites, notamment par adresse IP; le nombre de demandes quotidiennes n’est pas garanti.
- Le code utilise des services publics externes (RPC Sepolia et Blockscout). Une panne, une limite ou une indisponibilité de ces services peut empêcher l’affichage des données sans que le build du site soit en panne.
- `node_modules/` se recrée avec `npm ci`; il n’est pas nécessaire de le copier à l’encadreur. Les dossiers `dist/`, `public/` et `_site/` sont des résultats de build, pas les sources maîtresses.
- Le projet est un prototype pédagogique sur un réseau de test. Sepolia ETH et les CYD de démonstration n’ont pas de valeur réelle; ne réutilisez jamais une phrase de récupération contenant des fonds réels.

## 13. Résumé en une phrase

Pour la version actuelle : **`apps/` contient les écrans, `src/shared/sepolia.js` relie ces écrans à Sepolia, `contracts/` décrit le token CYD, `scripts/` automatise les tâches, et `.github/workflows/deploy-pages.yml` construit puis publie les trois interfaces.** Les éléments `network/besu/`, `src/shared/chain.js` et plusieurs scripts de démo sont l’ancien environnement local Besu.
