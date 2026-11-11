# Clayde Chain Local

Projet local autonome avec trois interfaces qui partagent le même réseau Besu QBFT :

- **Blockchain** — tableau de bord des blocs, transactions et adresses actives.
- **Explorer** — recherche de blocs, transactions et adresses.
- **DApp** — portefeuille local chiffré, solde CYD natif, envoi et réception sans MetaMask.

Le projet se trouve dans `d_app_blockchain_local`. L’ancien `d_app_blockchain` et ses
données ne sont ni déplacés, ni effacés, ni modifiés par ce projet.

## Démarrage quotidien

Prérequis : Docker Desktop ouvert et `Engine running`, Node.js 22.13+ et npm.

Une seule fois, à la racine du dossier :

```powershell
npm install
```

La première initialisation de la chaîne crée le portefeuille du propriétaire,
préfinancé au Genesis. Créez-le dans un terminal interactif avant de lancer
`npm run dev`. Le mot de passe n’est pas affiché et ne peut pas être récupéré :

```powershell
npm run wallet:create
```

Conservez ce mot de passe. Le fichier du portefeuille contient une clé chiffrée
sous `.besu/generated`; l’interface ne reçoit que ce fichier chiffré et le déverrouille
localement avec votre mot de passe.

À la racine `d_app_blockchain_local`, une seule commande démarre Besu et les trois
interfaces :

```powershell
npm run dev
```

Gardez ce terminal ouvert. Ouvrez ensuite :

- Blockchain : <http://127.0.0.1:5173>
- Explorer : <http://127.0.0.1:5174>
- DApp : <http://127.0.0.1:5175>

La première exécution génère un Genesis et quatre clés de validateurs, puis Docker
télécharge l’image Besu si nécessaire. Les exécutions suivantes réutilisent ces clés
et ces données. `Ctrl+C` arrête les interfaces et les conteneurs en conservant
l’historique sous `.besu/data`. Le réseau QBFT produit encore des blocs vides, mais
avec ce Genesis ils sont espacés d’environ 15 secondes.

## Portefeuilles indépendants et frais CYD

Dans la DApp, chaque visiteur peut créer un portefeuille personnel directement dans
son navigateur, ou importer un fichier JSON de portefeuille chiffré. La clé privée
n’est pas envoyée à l’API du projet. Les données chiffrées restent dans le stockage
local du navigateur; l’utilisateur doit télécharger et conserver sa sauvegarde depuis
**Paramètres**, avec son mot de passe. Sans le fichier et le mot de passe, le
portefeuille ne peut pas être récupéré. Ne partagez jamais le fichier ni le mot de
passe.

Le compte créé par `npm run wallet:create` est le compte du propriétaire financé au
Genesis. Pour l’utiliser dans la DApp, cliquez **Importer** et choisissez
`.besu/generated/wallet-keystore.json`, puis entrez son mot de passe. Gardez cette
sauvegarde privée; le projet ne distribue pas automatiquement de CYD aux nouveaux
portefeuilles. Pour pouvoir envoyer, un portefeuille doit d’abord recevoir des CYD
d’une adresse déjà financée, car les frais sont eux aussi payés en CYD.

- RPC : `http://127.0.0.1:8545`
- Chain ID décimal : `20261110`
- Chain ID hexadécimal : `0x13528f6`
- Monnaie native : `CYD`, 18 décimales

Le Genesis attribue 1 000 000 CYD au compte du propriétaire configuré au démarrage.
Lors d’un transfert, la DApp affiche une estimation du gaz; le coût réel est payé et
déduit en CYD natif par Besu. Il ne s’agit pas d’un token ERC-20 distinct. Les fonds
locaux sont propres à cette chaîne et n’ont aucune valeur sur Sepolia ou un autre
réseau. Ne réutilisez pas ces portefeuilles pour des actifs réels.

## Historique complet

Au démarrage, le service local indexe la chaîne depuis le bloc Genesis et conserve
son index sous `.besu/history`. L’explorateur peut paginer tous les transferts natifs
CYD. L’historique du portefeuille retrouve ses transactions depuis toute la chaîne,
y compris les appels de contrats sans valeur CYD et les événements de transferts
ERC-20/721 standard. L’indexation initiale se poursuit en arrière-plan; le nombre de
blocs parcourus est affiché dans les interfaces.

Conservez `.besu/history` avec les données Besu pour garder l’index entre les
redémarrages. Si vous déplacez ou restaurez les données de chaîne, restaurez aussi cet
index; le service signale explicitement une tête d’index incompatible.

## Sauvegarde de la chaîne précédente

La chaîne locale précédente a été conservée dans un dossier `backups` avant le
changement du Genesis et du compte préfinancé. Elle n’est pas utilisée par le nouveau
réseau. Les données de sauvegarde sont ignorées par Git.

## Arrêt manuel

Pour arrêter les validateurs sans effacer leurs données :

```powershell
npm run network:down
```

Ne supprimez pas `.besu` si vous voulez garder les clés, soldes et blocs. Pour arrêter
le démarrage complet, `Ctrl+C` dans le terminal `npm run dev` suffit.

## Builds

Les trois interfaces peuvent être construites séparément ou ensemble :

```powershell
npm run build
```

Les builds sont dans `apps/blockchain/dist`, `apps/explorer/dist` et `apps/dapp/dist`.
Cette étape n’est pas nécessaire pour lancer les interfaces localement.

## Démo temporaire en ligne avec GitHub Codespaces

GitHub Codespaces permet de lancer cette démo depuis le dépôt GitHub, sans fournir
de carte tant que l’utilisation incluse du compte personnel n’est pas dépassée.
L’application complète tourne dans un conteneur : les trois interfaces, Besu et
l’historique. Elle est partageable par un lien public tant que le Codespace fonctionne.
Ce n’est pas un hébergement permanent : le Codespace s’arrête après inactivité, a une
durée maximale de 12 heures par session et consomme le quota mensuel GitHub Codespaces
(pour un compte GitHub Free personnel, actuellement 120 heures de calcul et 15 Go-mois
de stockage). GitHub bloque l’utilisation lorsque ce quota est épuisé si aucun moyen
de paiement n’est enregistré.

1. Sur GitHub, ouvre `Melvin-132/d_app_blockchain_local`, puis **Code > Codespaces >
   Create codespace on main**. Attends la préparation de l’environnement.
2. Dans le terminal intégré du Codespace, lance une seule commande :

   ```bash
   npm run demo:cloud
   ```

   Elle construit et démarre la démo, puis vérifie `/health`. La construction initiale
   peut prendre quelques minutes.
3. Dans l’onglet **Ports**, repère le port **10000**. Si nécessaire, change sa
   visibilité à **Public**, puis ouvre l’adresse transférée.
4. Les trois pages sont sous le même domaine : `/blockchain/`, `/explorer/` et
   `/dapp/`. Dans la DApp, importe le portefeuille chiffré du propriétaire pour
   utiliser les CYD préfinancés au Genesis.
5. Pour arrêter Besu, exécute `npm run demo:cloud:stop`, puis arrête le Codespace
   depuis GitHub afin de ne pas consommer inutilement les heures gratuites.

Les redémarrages réinitialisent la chaîne : blocs, transactions et soldes retournent
aux valeurs du Genesis. Ne transfère aucun actif réel sur ce réseau de démonstration.
Les quotas et les règles GitHub peuvent changer; vérifie l’usage inclus dans
**Settings > Billing**. Ne configure pas de moyen de paiement pour cette démo.

## Arborescence

```text
apps/
  blockchain/   # tableau de bord de la chaîne
  explorer/     # explorateur
  dapp/         # portefeuille local chiffré
network/besu/   # Genesis et réseau Besu QBFT
scripts/dev.mjs # démarrage local des validateurs et des 3 interfaces
scripts/render-server.mjs # serveur éphémère Besu/RPC/API pour le conteneur hébergé
scripts/codespaces-demo.mjs # démarrage et vérification de la démo dans Codespaces
Dockerfile      # image de démonstration hébergée
render.yaml     # ancienne configuration Blueprint Render
src/shared/     # paramètres réseau et accès RPC communs
.besu/          # données, clés et portefeuille chiffré; ignoré par Git
backups/        # sauvegardes locales de chaînes précédentes; ignoré par Git
```

Les paramètres frontend peuvent être fournis dans un fichier `.env` à partir de
`.env.example`. `VITE_CHAIN_RPC_URL` et `VITE_HISTORY_API_URL` désignent les services
publics à configurer pour un déploiement; les valeurs fournies ciblent le réseau
local. Ne publiez pas un RPC Besu non protégé. Les métriques des transferts et
adresses portent sur les 20 derniers blocs indexés; le nombre total de blocs est lu
directement sur Besu.
