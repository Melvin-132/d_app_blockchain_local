# Clayde Chain

Le projet comprend trois interfaces : tableau de bord, explorateur et portefeuille
DApp. Pour la publication en ligne, elles utilisent le jeton ERC-20 CYD sur Sepolia
et se déploient gratuitement sur GitHub Pages.

- **Blockchain** — tableau de bord du réseau Ethereum Sepolia et de l’activité CYD.
- **Explorer** — recherche de blocs, transactions et adresses Sepolia.
- **DApp** — portefeuille CYD de démonstration, transferts, QR de réception et historique.

Le projet se trouve dans `d_app_blockchain_local`. L’ancien `d_app_blockchain` et ses
données ne sont ni déplacés, ni effacés, ni modifiés par ce projet.

## Démarrage local de la version Sepolia

Prérequis : Node.js 22.13+ et npm. Docker n’est pas nécessaire pour les interfaces
Sepolia.

Une seule fois, à la racine du dossier :

```powershell
npm install
Copy-Item .env.example .env
```

Après le déploiement du contrat, son adresse et son bloc sont enregistrés dans
`contracts/sepolia-deployment.json`. Lancez les interfaces sans démarrer de nœuds
Besu :

```powershell
npm run dev
```

Cette commande démarre les trois interfaces et ouvre automatiquement le portefeuille
dans le navigateur. Gardez le terminal ouvert. Les autres interfaces sont aussi
disponibles ici :

- Blockchain : <http://127.0.0.1:5173>
- Explorer : <http://127.0.0.1:5174>
- DApp : <http://127.0.0.1:5175>

Pour le détail de chaque dossier, fichier, extension, module et dépendance, consultez
le [guide complet de la structure du projet](./GUIDE_COMPLET_STRUCTURE_PROJET.md).

La DApp propose un parcours séparé pour créer un wallet ou en importer un. La création
demande un mot de passe local puis affiche une seule fois une phrase de récupération à
copier et sauvegarder. L’import accepte les longueurs standard BIP-39 (12, 15, 18, 21
ou 24 mots) et permet de choisir un
mot de passe pour chiffrer le wallet dans ce navigateur, ou de connecter MetaMask sur le
réseau correspondant à l’actif choisi. L’import d’un fichier JSON chiffré et la réouverture des wallets déjà enregistrés
restent disponibles. Les wallets créés/importés localement sont signés dans le navigateur;
MetaMask garde ses clés dans son extension et demande son approbation pour chaque
transaction. La page Recevoir affiche un QR et un lien de partage sans montant imposé;
les transferts ont un minimum de 0,10 CYD. Le solde indicatif est calculé au taux fixe
de démonstration de 1 CYD = 1 000 XAF. Le bouton Acheter explique les limites de paiement
par carte; aucun paiement Visa/Mastercard n’est traité par cette version.
Les transferts CYD et leurs frais restent sur Sepolia, tandis que les transferts ETH utilisent
Ethereum Mainnet et engagent de vrais actifs ainsi que de vrais frais. Dans l’aperçu du portefeuille,
le lien **Obtenir des ETH de test** ouvre le faucet Sepolia PoW PK910 dans un nouvel
onglet. L’utilisateur y saisit son adresse, lance le calcul demandé, puis réclame les
ETH de test lorsque le seuil est atteint. Ce calcul consomme les ressources de
l’ordinateur; le fournisseur indique également appliquer des limites, notamment par
adresse IP, donc le nombre de demandes quotidiennes n’est pas garanti. CYD est un jeton
de test sans valeur réelle. Les transferts ETH Mainnet sont irréversibles; vérifiez réseau,
adresse et montant avant toute confirmation. Ce portefeuille web est un prototype pédagogique
non audité : n’y saisissez jamais une phrase de récupération contenant des fonds réels.

## Ancien réseau local Besu (historique)

Les scripts `npm run dev:besu`, `npm run network:up` et `npm run network:down` décrivent
l’ancien réseau QBFT local et ne sont pas nécessaires pour la version Sepolia ou le
site GitHub Pages. Les sections ci-dessous qui parlent de Genesis, de portefeuille
préfinancé et de l’index `.besu` concernent uniquement ces anciennes données locales.

Les anciens scripts Besu et les données `.besu` sont conservés à titre historique.
Ils ne sont pas utilisés par les interfaces Sepolia actuelles.

### Persistance du réseau Besu local

Chaque validateur Besu utilise un volume Docker nommé distinct (`validator1-data`
à `validator4-data`) pour conserver sa base de données entre les arrêts et les
redémarrages des conteneurs. Les volumes apparaissent dans **Docker Desktop >
Volumes** sous le nom de projet `clayde-local-platform`. Les clés des validateurs
et la configuration Genesis restent dans `.besu/generated`.

`npm run network:down` arrête les conteneurs sans supprimer les volumes. Ne lancez
pas `docker compose down --volumes` et ne supprimez pas ces volumes dans Docker
Desktop, sinon les données locales de la chaîne seront effacées.

## Builds

Les trois interfaces peuvent être construites séparément ou ensemble :

```powershell
npm run build
```

Les builds sont dans `apps/blockchain/dist`, `apps/explorer/dist` et `apps/dapp/dist`.
Cette étape n’est pas nécessaire pour lancer les interfaces localement.

## Publication gratuite sur GitHub Pages avec CYD sur Sepolia

La publication GitHub Pages sert les trois interfaces comme pages statiques et lit
le réseau Sepolia directement depuis le navigateur. Le contrat proposé se trouve
dans `contracts/ClaydeToken.sol` : il crée une seule fois 1 000 000 CYD ERC-20, sans
fonction d’émission supplémentaire. CYD est un jeton de test sans valeur réelle;
Sepolia ETH reste la monnaie native nécessaire aux frais. Ce déploiement ne convertit
pas les anciens soldes CYD de Besu et ne crée aucun pont entre les deux réseaux.

1. Démarrez les interfaces localement (`npm install`, puis `npm run dev`) et
   créez un wallet dans **DApp CYD**. Téléchargez son fichier de sauvegarde chiffré.
2. Copiez l’adresse publique affichée et obtenez des Sepolia ETH de test pour cette
   adresse auprès d’un faucet compatible. Les ETH de test ne sont pas de l’argent réel.
3. Dans un autre terminal à la racine du projet, lancez `npm run token:deploy`.
   Saisissez le chemin du fichier JSON téléchargé et son mot de passe. Le mot de passe
   n’est pas affiché; le script demande ensuite de taper `DEPLOY` pour confirmer.
   Le contrat attribue 1 000 000 CYD à cette adresse, paie le gaz avec ses Sepolia ETH,
   puis inscrit automatiquement l’adresse du contrat et le bloc dans
   `contracts/sepolia-deployment.json`. La clé est seulement déchiffrée en mémoire.
4. Dans GitHub, activez **Settings > Pages > Build and deployment > Source: GitHub
   Actions**. Le
   workflow `.github/workflows/deploy-pages.yml` publie automatiquement les trois
   interfaces à chaque mise à jour de `main`. Pour que Pages reste gratuit sur GitHub
   Free, le dépôt doit être public; aucun secret de portefeuille n’est requis dans le
   dépôt.
5. Pour activer les cours d’actions, créez un compte Finnhub et obtenez une clé API.
   Ne placez jamais cette clé dans le code ou dans une variable `VITE_*`. Depuis la
   racine du projet, ouvrez le dossier du Worker puis connectez Wrangler à votre compte
   Cloudflare :

   ```powershell
   Set-Location .\cloudflare\stock-quotes
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put FINNHUB_API_KEY
   npx wrangler deploy
   ```

   Le premier déploiement crée le Worker; `secret put` demande ensuite la clé dans le
   terminal. Elle est enregistrée chez Cloudflare et n’est pas incluse dans le dépôt.
   Le dernier déploiement l’active. Le Worker autorise le domaine GitHub Pages du projet
   et les deux origines locales Vite, et ne relaie que les six symboles de son catalogue.
6. L’adresse de ce Worker est déjà la valeur par défaut de la DApp. Il n’est donc pas
   nécessaire d’avoir accès aux paramètres Actions du dépôt GitHub. Si vous déployez un
   autre Worker, vous pouvez remplacer cette adresse par `VITE_STOCK_QUOTES_URL` dans
   `.env` en local ou par la variable Actions `STOCK_QUOTES_URL` pour GitHub Pages.
7. Publiez les changements du projet sur la branche
   `main`. Après la réussite de l’action, ouvre
   <https://melvin-132.github.io/d_app_blockchain_local/>. Les pages sont aussi
   disponibles sous `/blockchain/`, `/explorer/` et `/dapp/`.

GitHub Pages et Cloudflare exécutent les deux parties en ligne : les cours restent
accessibles quand votre ordinateur est éteint. Il faut toutefois déployer le Worker et y
enregistrer la clé Finnhub avant que les cours s’affichent. Les cours d’actions sont
servis par Finnhub via le Worker et leur disponibilité, délai et quotas dépendent du
fournisseur.

Le wallet est déchiffré en mémoire pendant son utilisation; seul le keystore chiffré
est conservé dans le stockage local du navigateur. Le tableau de bord lit les blocs
récents via le RPC public Sepolia. L’historique CYD est chargé depuis l’indexeur
Blockscout Sepolia; sa disponibilité dépend donc du RPC et d’un service public tiers.
Ces interfaces n’exécutent pas Clayde Chain : elles affichent les données du contrat
ERC-20 sur le réseau de test Sepolia, qui peut être réinitialisé.

## Ancienne démo GitHub Codespaces

La démo Codespaces utilisant Besu a été abandonnée : son tunnel public renvoyait une
erreur 502. La publication recommandée est GitHub Pages avec le contrat ERC-20 de
test Sepolia décrit ci-dessus.

## Arborescence

```text
apps/
  blockchain/      # tableau de bord
  explorer/        # explorateur Sepolia
  dapp/            # portefeuille autonome chiffré et transferts ERC-20
contracts/         # contrat CYD à offre fixe
contracts/sepolia-deployment.json # adresse publique et bloc de déploiement
.github/workflows/ # publication GitHub Pages
scripts/dev-sepolia.mjs # serve les interfaces localement sans Besu
src/shared/        # fonctions d’accès à Sepolia et à CYD
```
