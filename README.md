# Parakeet

Voir son site sur tous les écrans (iPhone, Android, iPad, desktop), en local, en preview et en prod, et vérifier l'aperçu de ses liens (WhatsApp, LinkedIn, Slack…) avant de les partager. Pensé pour les sites construits avec Claude.

> Nom provisoire. État actuel : **phase 5**. Aperçu multi-appareils, local / preview / prod via Vercel, aperçus de partage sur 7 plateformes avec correctif, 24 checks, exploration des pages et serveur MCP pour Claude Code. Packaging Linux et intégration continue en place.

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
- **Local, preview, prod (Vercel)** : un clic affiche la même page sur ton serveur local, sur une preview (au choix par branche) ou en production.
  - **Déploiements** liste les builds, rafraîchis toutes les 30 s.
  - **Comparer** met côte à côte les balises et le score des checks de la page sur chaque environnement, avec les différences surlignées.
- **Claude Code (MCP)** : Claude voit ce que Parakeet voit. Il peut capturer les appareils, lire les balises, lancer les checks et vérifier lui-même ses corrections (détails plus bas).
- **Pages** : la barre latérale liste les pages du site, trouvées via les liens du HTML, le sitemap et les liens de la page rendue (utile pour les SPA).

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
| `Ctrl K` | palette de commandes |
| `Ctrl L` | changer d'adresse |
| `Ctrl R` | recharger tous les appareils |
| `Ctrl Maj O` | portrait / paysage |
| `Ctrl Maj S` | synchro du scroll et de la navigation |
| `Ctrl ,` | réglages |

Les raccourcis marchent aussi quand le focus est dans un appareil. Le bouton `‹›` sous chaque appareil ouvre ses DevTools.

### Vercel

Dans **Réglages → Vercel** :

1. Colle un jeton personnel créé sur [vercel.com/account/tokens](https://vercel.com/account/tokens). Il est chiffré par le trousseau du système (KWallet, GNOME Keyring) ; sans trousseau, il est stocké en clair dans un fichier lisible par toi seul, et Parakeet te le signale.
2. Choisis le compte ou l'équipe, puis le projet du site. Parakeet récupère le domaine de production et les déploiements.

**Previews protégées.** Si le projet a un secret « Protection Bypass for Automation », Parakeet l'utilise pour ouvrir et lire les previews. Sinon, un bouton propose d'en créer un : c'est une modification du projet Vercel, faite uniquement sur ta demande. La variable `PARAKEET_VERCEL_BYPASS=<secret>` reste prioritaire si tu préfères ne pas connecter ton compte. Le secret est envoyé dans l'en-tête `x-vercel-protection-bypass` aux domaines `*.vercel.app`.

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

```bash
pnpm dist
```

```bash
sudo pacman -U apps/desktop/dist/Parakeet-*.pacman
```

`pnpm dist` produit aussi un AppImage (`apps/desktop/dist/Parakeet-*.AppImage`), utilisable sur toute distribution. Le CI GitHub publie ces deux fichiers en artefacts à chaque push. Sur une machine Arch, le paquet pacman demande `bsdtar` (paquet `libarchive`, déjà présent sur Arch).

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
- Vercel contre une fausse API : connexion, projet, bascule local → prod → preview → local sur le même chemin, secret de contournement du projet, comparaison des trois environnements.

Sans écran, il utilise Xvfb et prend des captures avec ImageMagick dans `apps/desktop/selftest-output/`. Pour tester l'app packagée : `PARAKEET_BIN=dist/linux-unpacked/parakeet node scripts/selftest.mjs` depuis `apps/desktop`.

## Structure

```
apps/desktop        app Electron (electron-vite)
  src/main          fenêtre, appareils émulés, réglages, raccourcis
  src/preload       ponts sécurisés vers l'interface et les pages émulées
  src/renderer      interface React + Tailwind (design « Graphite »)
packages/mcp        serveur MCP (stdio) pour Claude Code, client du serveur de contrôle de l'app
packages/core       lecture des balises comme les robots, aperçus des 7 plateformes, correctifs, fichiers du site, exploration, 24 checks
fixtures/demo-site  site de test (Vite)
fixtures/vercel-mock  fausse API Vercel pour les tests
```

Les appareils sont des `WebContentsView` émulées via le protocole DevTools de Chromium (`Emulation.setDeviceMetricsOverride`, émulation tactile, user agent), placées au-dessus des cadres dessinés par l'interface. Comme ces vues natives passent toujours au-dessus du HTML, un menu ou la palette « gèle » les aperçus : ils sont capturés en image et masqués le temps de l'affichage.
