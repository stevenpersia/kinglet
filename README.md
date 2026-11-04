# Parakeet

Voir son site sur tous les écrans (iPhone, Android, iPad, desktop), en local, en preview et en prod, et vérifier l'aperçu de ses liens (WhatsApp, LinkedIn, Slack…) avant de les partager. Pensé pour les sites construits avec Claude.

> Nom provisoire. État actuel : **phase 3**. Aperçu multi-appareils, aperçus de partage sur 7 plateformes avec correctif, 24 checks et exploration des pages. Packaging Linux et intégration continue en place.

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

### Previews Vercel protégées

```bash
PARAKEET_VERCEL_BYPASS=<secret "Protection Bypass for Automation"> pnpm dev
```

Le secret est envoyé dans l'en-tête `x-vercel-protection-bypass` aux domaines `*.vercel.app`, à la fois dans les aperçus et lors de la lecture des balises.

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
- les 7 aperçus de partage et le correctif pour le framework détecté.

Sans écran, il utilise Xvfb et prend des captures avec ImageMagick dans `apps/desktop/selftest-output/`. Pour tester l'app packagée : `PARAKEET_BIN=dist/linux-unpacked/parakeet node scripts/selftest.mjs` depuis `apps/desktop`.

## Structure

```
apps/desktop        app Electron (electron-vite)
  src/main          fenêtre, appareils émulés, réglages, raccourcis
  src/preload       ponts sécurisés vers l'interface et les pages émulées
  src/renderer      interface React + Tailwind (design « Graphite »)
packages/core       lecture des balises comme les robots, aperçus des 7 plateformes, correctifs, fichiers du site, exploration, 24 checks
fixtures/demo-site  site de test (Vite)
```

Les appareils sont des `WebContentsView` émulées via le protocole DevTools de Chromium (`Emulation.setDeviceMetricsOverride`, émulation tactile, user agent), placées au-dessus des cadres dessinés par l'interface. Comme ces vues natives passent toujours au-dessus du HTML, un menu ou la palette « gèle » les aperçus : ils sont capturés en image et masqués le temps de l'affichage.
