# Clayde Chain

Le projet comprend trois interfaces : tableau de bord, explorateur et portefeuille
DApp. Pour la publication en ligne, elles utilisent le jeton ERC-20 CYD sur Sepolia
et se déploient gratuitement sur GitHub Pages.

- **Blockchain** — tableau de bord des blocs, transactions et adresses actives.
- **Explorer** — recherche de blocs, transactions et adresses.
- **DApp** — portefeuille autonome chiffré, transferts CYD et historique du token.

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
npm run dev:sepolia
```

Gardez le terminal ouvert. Ouvrez ensuite :

- Blockchain : <http://127.0.0.1:5173>
- Explorer : <http://127.0.0.1:5174>
- DApp : <http://127.0.0.1:5175>

La DApp peut créer un portefeuille autonome ou importer un fichier JSON chiffré.
Les transactions sont signées localement avec ce portefeuille, sans MetaMask; les
frais sont payés en Sepolia ETH. CYD est un jeton de test ERC-20 sans valeur réelle.
Une sauvegarde JSON et son mot de passe sont indispensables pour restaurer un wallet.
La DApp n’accepte pas les phrases secrètes ou les clés privées en clair. Les utilisateurs
doivent également avoir des Sepolia ETH pour payer le gaz et recevoir des CYD du
portefeuille qui possède l’offre initiale.

## Ancien réseau local Besu (historique)

Les scripts `npm run dev`, `npm run network:up` et `npm run network:down` décrivent
l’ancien réseau QBFT local et ne sont pas nécessaires pour la version Sepolia ou le
site GitHub Pages. Les sections ci-dessous qui parlent de Genesis, de portefeuille
préfinancé et de l’index `.besu` concernent uniquement ces anciennes données locales.

Les anciens scripts Besu et les données `.besu` sont conservés à titre historique.
Ils ne sont pas utilisés par les interfaces Sepolia actuelles.

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

1. Démarrez les interfaces localement (`npm install`, puis `npm run dev:sepolia`) et
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
5. Publiez le fichier de configuration et les changements du projet sur la branche
   `main`. Après la réussite de l’action, ouvre
   <https://melvin-132.github.io/d_app_blockchain_local/>. Les pages sont aussi
   disponibles sous `/blockchain/`, `/explorer/` et `/dapp/`.

Le wallet principal de chaque utilisateur est déchiffré et conservé en mémoire dans
son navigateur; seule sa sauvegarde chiffrée peut être enregistrée localement. Le
tableau de bord et l’explorateur interrogent le RPC public Sepolia et filtrent tous
les événements `Transfer` émis par le contrat depuis son bloc de création; ils n’ont
pas de chaîne privée ni de base d’historique séparée. Le RPC public a des limites de
requêtes; le réseau Sepolia est un réseau de test qui peut être réinitialisé.

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
