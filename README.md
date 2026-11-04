# Parakeet

Voir son site sur tous les écrans (iPhone, Android, iPad, desktop), en local, en preview et en prod, et vérifier l'aperçu de ses liens (WhatsApp, LinkedIn, Slack…) avant de les partager. Pensé pour les sites construits avec Claude.

> Nom provisoire. État actuel : **phase 7**, version 0.1.0. Aperçu multi-appareils, ton site sur ton vrai téléphone, local / preview / prod via Vercel, aperçus de partage sur 7 plateformes avec correctif, 24 checks, exploration des pages et serveur MCP pour Claude Code. Releases GitHub avec mises à jour automatiques, landing page, intégration continue.

## Ce que fait Parakeet

- **Aperçu** : ton site sur 10 appareils émulés (largeur, densité, tactile, user agent), en portrait ou paysage. Le scroll et la navigation sont synchronisés entre appareils, et chacun a ses DevTools.
- **Partage** : l'aperçu de ton lien sur WhatsApp, iMessage, Slack, Discord, LinkedIn, X et Google.
  - La page est lue par le robot de chaque plateforme, avec son user agent et sans JavaScript.
  - Chaque rendu suit les règles de sa plateforme : textes coupés, recadrage en 1,91:1, carte X selon `twitter:card`, bordure Discord selon `theme-color`. Les rendus et les limites restent approximatifs.
  - Parakeet détecte le framework (Next.js, Nuxt, Astro, SvelteKit, Vite/HTML) et propose le correctif à coller au bon endroit, avec un prompt prêt pour Claude.
- **Checks** : 24 vérifications en 4 familles.
  - **SEO** : titre, description, lang, canonical, h1, indexation, robots.txt, sitemap.
  - **Partage** : og:title, og:description, og:site_name, image, format de l'image, twitter:card.
  - **Mobile** : viewport, débordement horizontal, theme-color, apple-touch-icon, manifest.
  - **Technique** : statut HTTP, favicon, textes alternatifs, erreurs JavaScript, poids des images.

  Le débordement, les erreurs JavaScript et le poids des images sont mesurés dans les appareils, sur la page rendue. Le `noindex` est considéré comme normal en local et sur les previews.
- **Sur mon téléphone** : un QR code ouvre la page affichée sur ton vrai téléphone.
  - **En local**, Parakeet relaie ton serveur de dev sur le Wi-Fi. Seul un appareil qui a scanné le code y a accès, le rechargement à chaud marche aussi, et le téléphone peut suivre la navigation de Parakeet.
  - **En preview ou en prod**, le QR code ouvre directement l'URL. Pour une preview protégée, il contient le secret de contournement.
- **Local, preview, prod (Vercel)** : un clic affiche la même page sur ton serveur local, sur une preview (au choix par branche) ou en production.
  - **Déploiements** liste les builds, rafraîchis toutes les 30 s.
  - **Comparer** met côte à côte les balises et le score des checks de la page sur chaque environnement, avec les différences surlignées.
- **Claude Code (MCP)** : Claude voit ce que Parakeet voit. Il peut capturer les appareils, lire les balises, lancer les checks et vérifier lui-même ses corrections (détails plus bas).
- **Projets en onglets** : chaque projet (Vercel ou simple adresse locale) a son onglet en haut, avec ce qui s'y passe : Claude travaille, attend ta réponse, a terminé (« à voir »), build en cours ou en erreur. `Ctrl P` ouvre n'importe quel projet Vercel de tes équipes, ou une adresse. Un seul jeu d'appareils est affiché à la fois, celui de l'onglet actif ; chaque projet garde sa dernière page et son serveur local.
- **Tous les projets** : une carte par projet ouvert (dernière capture, statut de Claude, dernier déploiement) et le fil d'activité de Claude sur tous les projets.
- **Suivi de Claude Code** (à activer dans les réglages) : des hooks de Claude Code préviennent Parakeet de chaque demande, fichier modifié et fin de tâche, avec une notification système quand Claude termine ou qu'un build échoue (détails plus bas).
- **Pages** : le menu « Pages » de la barre d'adresse liste les pages du site, trouvées via les liens du HTML, le sitemap et les liens de la page rendue (utile pour les SPA).

## Lancer en local (Linux)

Prérequis : Node 22.12+ et pnpm 10.

```bash
pnpm install
```

```bash
pnpm demo   # site de démo sur http://localhost:5173 (optionnel)
```

```bash
pnpm dev    # lance Parakeet
```

Parakeet détecte un serveur de dev déjà lancé (ports 3000, 5173, 4321, 8080…). Sinon, saisis son adresse ou juste son port (`3000`) dans la barre du haut. Les réglages (appareils, orientation, synchro, sites récents) sont gardés dans `~/.config/Parakeet/settings.json`.

Sur Wayland, Parakeet démarre en Wayland natif. La session détectée s'affiche dans la barre d'état.

### Raccourcis

| | |
|---|---|
| `Ctrl P` | ouvrir ou changer de projet |
| `Ctrl 1` … `Ctrl 9` | aller à l'onglet |
| `Ctrl Maj A` | tous les projets |
| `Ctrl K` | palette de commandes |
| `Ctrl L` | changer d'adresse |
| `Ctrl R` | recharger tous les appareils |
| `Ctrl Maj O` | portrait / paysage |
| `Ctrl Maj S` | synchro du scroll et de la navigation |
| `Ctrl ,` | réglages |

Les raccourcis marchent aussi quand le focus est dans un appareil. Le bouton `‹›` sous chaque appareil ouvre ses DevTools.

### Vercel

1. Dans **Réglages → Compte Vercel**, colle un jeton personnel créé sur [vercel.com/account/tokens](https://vercel.com/account/tokens). Il est chiffré par le trousseau du système (KWallet, GNOME Keyring) ; sans trousseau, il est stocké en clair dans un fichier lisible par toi seul, et Parakeet te le signale.
2. `Ctrl P` liste alors les projets de ton compte et de toutes tes équipes. Ouvrir un projet récupère son domaine de production et suit ses déploiements (toutes les 30 s, pour chaque onglet ouvert). Un site déjà ouvert par son adresse se relie à son projet Vercel dans **Réglages → Projet actif**.
3. Parakeet cherche le dossier du projet sur ton disque (dans `~/dev`, `~/code`, `~/projects`…, grâce au `.vercel/project.json` écrit par `vercel link`). Sinon, choisis-le dans **Projet actif** : il sert au suivi de Claude Code.

**Previews protégées.** Si le projet a un secret « Protection Bypass for Automation », Parakeet l'utilise pour ouvrir et lire les previews. Sinon, un bouton propose d'en créer un : c'est une modification du projet Vercel, faite uniquement sur ta demande. La variable `PARAKEET_VERCEL_BYPASS=<secret>` reste prioritaire si tu préfères ne pas connecter ton compte. Le secret est envoyé dans l'en-tête `x-vercel-protection-bypass` aux domaines `*.vercel.app`.

## Sur mon téléphone

Bouton **Sur mon téléphone** dans la barre du haut, ou `Ctrl K` puis « téléphone ». En local, active le partage sur le réseau, puis scanne le QR code avec le téléphone, connecté au même Wi-Fi.

- **Port** : 47800 par défaut, ou le suivant s'il est pris. Si un pare-feu bloque : `sudo ufw allow 47800/tcp` ou `sudo firewall-cmd --add-port=47800/tcp`.
- **Appairage** : le QR code contient un jeton à usage de cookie, renouvelé à chaque activation. Sans lui, un appareil du réseau reçoit un refus (403).
- **En-têtes** : le relais réécrit `Host` et `Origin` vers `localhost`, ce qui évite les blocages de Vite (`allowedHosts`) et de Next.js (`allowedDevOrigins`). Les WebSocket du rechargement à chaud passent.
- **Suivi** : un petit script injecté dans les pages HTML fait suivre au téléphone la navigation de Parakeet (désactivable).

## Brancher Claude Code (MCP)

La commande exacte pour ton installation est dans **Réglages** (bouton « Copier »). Avec le paquet pacman :

```bash
claude mcp add --scope user parakeet -- /usr/bin/parakeet --mcp --ozone-platform=headless
```

En développement, depuis le dépôt, Node suffit :

```bash
claude mcp add --scope user parakeet -- node /chemin/vers/parakeet/packages/mcp/src/cli.ts
```

Outils exposés : `status`, `open_url`, `set_devices`, `screenshot`, `get_page_meta`, `get_share_preview`, `run_checks`, `list_pages`, `list_deployments`. Deux commandes sont aussi disponibles dans Claude Code :

- `/mcp__parakeet__fix_share` corrige les aperçus de partage de la page ouverte, puis vérifie ;
- `/mcp__parakeet__fix_checks` corrige les problèmes trouvés par les checks, puis les relance.

Le serveur MCP marche app fermée, sur une URL donnée. Avec l'app ouverte, il utilise la page affichée et les appareils émulés : captures, débordement horizontal, erreurs JavaScript. Il parle à l'app par un serveur local (`127.0.0.1`, jeton aléatoire dans `~/.config/Parakeet/mcp.json`), et chaque appel de Claude apparaît dans l'onglet MCP de l'inspecteur.

## Installer l'app (Arch / CachyOS)

Télécharge le paquet pacman (ou l'AppImage) de la [dernière release](https://github.com/stevenpersia/parakeet/releases/latest), puis :

```bash
sudo pacman -U Parakeet-*.pacman
```

Ou construis-le toi-même :

```bash
pnpm dist && sudo pacman -U apps/desktop/dist/Parakeet-*.pacman
```

### Mises à jour

L'app installée (paquet pacman ou AppImage) cherche une nouvelle version au démarrage puis toutes les 6 heures, la télécharge en arrière-plan et la vérifie (SHA-512). Elle ne l'installe que lorsque tu cliques **Installer et redémarrer** (Réglages, ou la barre d'état). Pour le paquet pacman, l'installation demande le mot de passe administrateur.

Tant que le dépôt est **privé**, les releases ne sont lisibles qu'avec un jeton GitHub (droit de lecture sur le dépôt) :

```bash
PARAKEET_GH_TOKEN=<jeton> parakeet
```

Sans jeton, Réglages affiche « dépôt privé ». Si le dépôt devient public, aucun jeton n'est nécessaire.

### Publier une version

1. Monte la version dans `apps/desktop/package.json` et pousse sur `main`.
2. Lance la publication, au choix :
   - dans GitHub, **Actions → Release → Run workflow** : le tag est créé à partir de la version ;
   - ou en poussant un tag `v<version>` :

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Le workflow `release.yml` refait les tests, construit, teste l'app packagée (mise à jour comprise), puis crée la release avec l'AppImage, le paquet pacman et `latest-linux.yml` (le fichier que lit l'outil de mise à jour).

## Landing page

`apps/web` est un site statique : une page HTML, sans framework. Pour le déployer sur Vercel, importe le dépôt avec `apps/web` comme *Root Directory* ; `vercel.json` s'occupe du reste. Le build reprend le domaine de production Vercel pour les URL absolues (canonical, og:image, sitemap).

```bash
pnpm --filter @parakeet/web preview    # http://localhost:4173
```

Ses tests la passent aux 24 checks et aux 7 aperçus de partage de Parakeet : tout doit être vert.

## Suivi de Claude Code

Dans **Réglages → Suivi de Claude Code**, « Activer » ajoute des hooks à `~/.claude/settings.json` (ou `$CLAUDE_CONFIG_DIR/settings.json`) et garde une copie de sauvegarde à côté (`settings.json.parakeet-backup`). Tes propres hooks ne sont pas touchés, et « Désactiver » retire uniquement ceux de Parakeet. Relance les sessions Claude Code déjà ouvertes.

- **Évènements** : `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Notification`, `Stop`, `StopFailure`, `SessionEnd`, en mode asynchrone : ils ne ralentissent jamais Claude.
- **Trajet** : un petit script (`~/.config/Parakeet/claude-hook.sh`, `curl`) envoie l'évènement au serveur local de l'app (`127.0.0.1`, jeton dans `hook.env`, lisible par toi seul). App fermée, il ne fait rien.
- **Projet** : une session est rattachée au projet dont le dossier contient son répertoire de travail (le plus profond gagne, pratique pour les monorepos).
- **Statuts** : « travaille » dès une demande, « attend ta réponse » sur une demande de permission, « à voir » après `Stop` jusqu'à ce que tu marques le résultat comme vu. Une interruption n'envoie pas `Stop` : une session muette depuis 10 min repasse au repos.

## Tests

```bash
pnpm test        # tests unitaires (lecture des balises, fichiers du site, exploration, checks, disposition)
```

```bash
pnpm selftest    # test d'acceptation de bout en bout
```

L'autotest lance le site de démo et Parakeet, puis vérifie :

- l'émulation (largeur, densité, `pointer: coarse`, `hover: none`, tactile) ;
- le scroll synchronisé et le rechargement à chaud ;
- la lecture des balises comme le robot WhatsApp ;
- l'en-tête de contournement Vercel ;
- le mode paysage et l'enregistrement des réglages ;
- le gel des aperçus sous la palette ;
- la synchro de navigation ;
- les 24 checks sur une page aux défauts connus (débordement, erreur JavaScript) ;
- l'exploration des pages ;
- les 7 aperçus de partage et le correctif pour le framework détecté ;
- le serveur MCP lancé comme le ferait Claude Code (`parakeet --mcp`), avec capture et checks via l'app ;
- Vercel contre une fausse API : connexion, projet relié depuis les réglages, bascule local → prod → preview → local sur le même chemin, secret de contournement du projet, comparaison des trois environnements, preview protégée (appareils et robots) ;
- la barre du haut à 1600, 1280 et 960 px de large ;
- les projets : un 2e onglet ouvert depuis `Ctrl P`, retour au 1er avec `Ctrl 1` ;
- le suivi de Claude Code (dans un `CLAUDE_CONFIG_DIR` temporaire) : hooks installés, demande puis édition jouées par le vrai script, onglet « en cours », fin de tâche, puis désinstallation propre ;
- les mises à jour : sur l'app packagée, une 9.9.9 trouvée sur un faux flux, téléchargée et vérifiée (sans installation) ;
- le téléphone, joué par une fenêtre Chromium cachée : refus sans appairage, page via le QR code, rechargement à chaud à travers le relais, suivi de la navigation, QR code de preview protégée.

Sans écran, il utilise Xvfb et prend des captures avec ImageMagick dans `apps/desktop/selftest-output/`. Pour tester l'app packagée : `PARAKEET_BIN=dist/linux-unpacked/parakeet node scripts/selftest.mjs` depuis `apps/desktop`.

## Structure

```
apps/desktop        app Electron (electron-vite)
  src/main          fenêtre, appareils émulés, réglages, raccourcis
  src/preload       ponts sécurisés vers l'interface et les pages émulées
  src/renderer      interface React + Tailwind (design « Graphite »)
packages/mcp        serveur MCP (stdio) pour Claude Code, client du serveur de contrôle de l'app
packages/core       lecture des balises comme les robots, aperçus des 7 plateformes, correctifs, fichiers du site, exploration, 24 checks
apps/web            landing page statique (Vercel)
fixtures/demo-site  site de test (Vite)
fixtures/vercel-mock  fausse API Vercel pour les tests
```

Les appareils sont des `WebContentsView` émulées via le protocole DevTools de Chromium (`Emulation.setDeviceMetricsOverride`, émulation tactile, user agent), placées au-dessus des cadres dessinés par l'interface. Comme ces vues natives passent toujours au-dessus du HTML, un menu ou la palette « gèle » les aperçus : ils sont capturés en image et masqués le temps de l'affichage.
