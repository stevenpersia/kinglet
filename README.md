# Kinglet

Voir son site sur tous les écrans (iPhone, Android, iPad, desktop), en local, en preview et en prod, et vérifier l'aperçu de ses liens (WhatsApp, LinkedIn, Slack, Bluesky…) avant de les partager. Pensé pour les sites construits avec Claude.

> Site : [getkinglet.com](https://getkinglet.com). État actuel : **phase 7**, version 0.1.0. Aperçu multi-appareils, ton site sur ton vrai téléphone, local / preview / prod via Vercel, aperçus de partage sur 10 plateformes avec correctif, 37 checks, audit de tout le site, accessibilité, exploration des pages et serveur MCP pour Claude Code. Releases GitHub avec mises à jour automatiques, landing page, intégration continue.

## Ce que fait Kinglet

- **Nouveau projet** : un site de zéro avec Claude, qui choisit la stack avec toi ; Kinglet lance son serveur de dev et l'affiche, puis le publie sur GitHub et Vercel en un clic. Voir [Nouveau projet de zéro](#nouveau-projet-de-zéro).
- **Aperçu** : ton site sur 10 appareils émulés (largeur, densité, tactile, user agent), en portrait ou paysage. Le scroll et la navigation sont synchronisés entre appareils, et chacun a ses DevTools.
- **Partage** : l'aperçu de ton lien sur WhatsApp, iMessage, Slack, Discord, Telegram, LinkedIn, X, Facebook, Bluesky et Google.
  - Une plateforme à la fois, en taille réelle et en situation (conversation WhatsApp, iMessage ou Telegram, message Slack ou Discord, post LinkedIn, X, Facebook ou Bluesky, résultats Google), avec ses problèmes à côté. Flèches haut et bas pour passer d'une plateforme à l'autre.
  - La page est lue par le robot de chaque plateforme, avec son user agent et sans JavaScript.
  - Chaque rendu suit les règles de sa plateforme : textes coupés, recadrage en 1,91:1, carte X selon `twitter:card`, bordure Discord selon `theme-color`. Les rendus et les limites restent approximatifs.
  - Le résultat Google montre aussi ce que les données structurées (JSON-LD) ajoutent : fil d'Ariane à la place de l'URL, étoiles et nombre d'avis, prix et stock, date d'un article ou d'un événement, questions d'une FAQ.
  - Kinglet détecte le framework (Next.js, Nuxt, Astro, SvelteKit, Vite/HTML) et propose le correctif à coller au bon endroit, avec un prompt prêt pour Claude.
- **Checks** : 37 vérifications en 5 familles.
  - **SEO** : titre, description, lang, canonical, h1, indexation, robots.txt, sitemap, données structurées (JSON-LD : propriétés exigées et conseillées par Google pour produit, article, FAQ, fil d'Ariane, événement, recette, commerce local, vidéo…), hreflang (codes valides, autoréférence, x-default, canonique, et chaque version lue pour vérifier qu'elle renvoie bien vers la page).
  - **Partage** : og:title, og:description, og:site_name, image, format de l'image, twitter:card.
  - **Mobile** : viewport, débordement horizontal, zones tactiles trop petites (moins de 24×24 px), texte sous 12 px, encoche (viewport-fit=cover sans safe-area), texte agrandi (ce qui est coupé ou ne grossit pas, mesuré quand le texte agrandi est activé), formulaires (le bon clavier pour l'e-mail, le téléphone, les nombres, l'`autocomplete` qui permet au navigateur de remplir, un label par champ), theme-color, apple-touch-icon, manifest.
  - **Accessibilité** : audit axe-core dans les appareils (labels de formulaires, rôles ARIA, ordre des titres, contraste, noms des boutons et liens…), séparé en problèmes bloquants (critiques et graves) et autres ; focus visible (les éléments qui ne montrent rien quand on y arrive avec Tab). Le détail de chaque règle, avec les éléments concernés et sa documentation, est sous les checks.
  - **Technique** : statut HTTP, favicon, textes alternatifs, contraste du texte, erreurs JavaScript, poids des images, Core Web Vitals (LCP et CLS, aussi affichés sous chaque appareil).

  Le débordement, les erreurs JavaScript, le poids des images et l'accessibilité sont mesurés dans les appareils, sur la page rendue (axe-core et le focus sur le premier appareil de chaque type : téléphone, tablette, écran). Le `noindex` est considéré comme normal en local et sur les previews.
- **Audit de tout le site** (Checks → Tout le site, ou `Ctrl K` « Auditer ») : toutes les pages trouvées par les liens, le sitemap et la page rendue (jusqu'à 300), lues comme Google. Liens internes cassés (avec les pages qui les contiennent), ancres mortes (`#id` absent du HTML, puis recherché à nouveau dans la page rendue : une ancre ajoutée par JavaScript n'est pas signalée), titres et descriptions en double, pages absentes du sitemap et URL du sitemap en erreur, hreflang à sens unique, et les checks qui échouent page par page. « Demander à Claude » envoie la liste ; `/mcp__kinglet__fix_site` fait pareil depuis le terminal.
- **Budgets de performance** (sous les checks) : par exemple « l'accueil sous 500 Ko et LCP sous 2,5 s ». Un budget vise un chemin (`/`, `/blog/*`, `*`) et limite le poids, le LCP, le CLS ou le nombre de requêtes. Il est vérifié sur la page affichée (le pire appareil, avec le ralentissement choisi) et sur chaque nouveau déploiement Vercel, avec une notification quand il est dépassé.
- **Historique** (Déploiements) : chaque déploiement Vercel qui passe en « Prêt » est mesuré hors écran sur un téléphone (score des checks, LCP, CLS, poids, requêtes). Avec ou sans Vercel, le site local est aussi mesuré après chaque commit dans le dossier du projet et chaque tâche de Claude terminée (une fois par minute au plus, quand le serveur de dev répond ; désactivable par projet). Une petite courbe par mesure montre l'évolution, avec la flèche du dernier changement ; un bouton mesure un déploiement à la demande.
- **Sur mon téléphone** : un QR code ouvre la page affichée sur ton vrai téléphone.
  - **En local**, Kinglet relaie ton serveur de dev sur le Wi-Fi. Seul un appareil qui a scanné le code y a accès, le rechargement à chaud marche aussi, et le téléphone peut suivre la navigation de Kinglet.
  - **En preview ou en prod**, le QR code ouvre directement l'URL. Pour une preview protégée, il contient le secret de contournement.
- **Local, preview, prod (Vercel)** : un clic affiche la même page sur ton serveur local, sur une preview (au choix par branche) ou en production.
  - **Prod** a son menu, comme Preview : la prod actuelle (celle que sert le domaine) en tête, avec un badge « En ligne », puis les prods précédentes. Une ancienne prod s'ouvre sur son adresse Vercel ; le bouton passe en orange et un bandeau propose de revenir à la prod actuelle.
  - **Déploiements** liste les builds, rafraîchis toutes les 30 s.
  - **Comparer** met côte à côte les balises et le score des checks de la page sur chaque environnement, avec les différences surlignées. L'onglet **Visuel** rend la page de chaque environnement comme l'appareil choisi, montre les pixels qui changent en rouge et les Web Vitals (LCP, CLS, TTFB) de chacun.
- **Claude dans Kinglet** : un panneau à côté des appareils (`Ctrl J`) pour demander une retouche ou une nouvelle fonctionnalité. Kinglet lance Claude Code dans le dossier du projet, avec le serveur MCP déjà branché : Claude modifie le code puis vérifie le résultat sur les appareils. « Montrer » pose une épingle sur un appareil et joint la capture et l'élément pointé. Des boutons « Demander à Claude » sur la console, les checks et les aperçus de partage préremplissent le message. « Terminal » copie la commande qui reprend la même session dans un terminal (détails plus bas).
- **Claude Code (MCP)** : dans le terminal, Claude voit aussi ce que Kinglet voit. Il peut capturer les appareils, lire les balises, lancer les checks et vérifier lui-même ses corrections (détails plus bas).
- **Premier lancement** : un accueil guidé en 4 étapes, toutes facultatives (langue et appareils, comptes Vercel et GitHub, premier projet avec son dossier trouvé tout seul, Claude). Sans site ouvert, un écran d'accueil liste les serveurs de dev qui tournent.
- **Projets en onglets** : chaque projet (Vercel ou simple adresse locale) a son onglet en haut, avec le favicon du site, avec ce qui s'y passe : Claude travaille, attend ta réponse, a terminé (« à voir »), build en cours ou en erreur. `Ctrl P` ouvre n'importe quel projet Vercel de tes équipes, ou une adresse. Un seul jeu d'appareils est affiché à la fois, celui de l'onglet actif ; chaque projet garde sa dernière page et son serveur local.
- **Tous les projets** : une carte par projet ouvert (dernière capture, statut de Claude, dernier déploiement) et le fil d'activité de Claude sur tous les projets.
- **Suivi de Claude Code** (à activer dans les réglages) : des hooks de Claude Code préviennent Kinglet de chaque demande, fichier modifié et fin de tâche, avec une notification système quand Claude termine ou qu'un build échoue (détails plus bas).
- **Inspecteur** : « Inspecter » dans la barre des appareils. L'élément survolé s'allume sur tous les appareils, et une barre donne sa taille, ses marges, sa police et sa couleur sur chacun (ou qu'il y est masqué). Un clic le garde, « Demander à Claude » envoie le tableau.
- **Apparence** : thème clair ou sombre, animations réduites, contraste élevé, vus par les media queries de tous les appareils, sans recharger.
  - **Taille du texte** 130, 150 ou 200 % (comme le réglage du téléphone : ce qui est en rem, em ou % grossit, le px reste) et **zoom de la page à 200 %** (la page se remet en page à la moitié de la largeur, critère WCAG 1.4.10). Le check « Texte agrandi » dit alors ce qui est coupé, ce qui déborde, et si la taille de base est figée en px.
  - **Parcours au clavier** : chaque élément atteignable avec Tab est numéroté dans l'ordre sur tous les appareils, relié au suivant ; en rouge ceux qui ne montrent aucun focus, en orange ceux avec un `tabindex` positif. « Demander à Claude » prépare la correction.
- **Région** (barre des appareils) : langue, fuseau horaire et position, pour tous les appareils ou un seul (par exemple l'iPhone au Japon et l'iPad en Allemagne). La langue change `navigator.language`, `Intl` (dates, nombres, devises) et l'en-tête `Accept-Language` ; la position répond à `navigator.geolocation` (sans position, la permission est refusée). Des raccourcis par pays règlent les trois d'un coup.
- **Clavier virtuel** (barre des appareils) : un clavier iOS ou Android ouvert sur les téléphones et tablettes, dessiné dans la page comme sur le vrai appareil (il recouvre le bas de l'écran), en AZERTY si la langue est le français. Un champ qui prend le focus remonte au-dessus. La page voit le clavier comme sur un téléphone : `visualViewport.height` diminue de sa hauteur et `visualViewport` émet `resize`, pour les sites qui s'y adaptent (barre de saisie de chat, bouton fixé en bas). Pour voir les barres fixées en bas et les formulaires cachés.
- **Formulaires** (barre des appareils) : remplit tous les champs de tous les appareils d'un coup, avec des données valides ou fausses (dans la langue de la page), ou les vide. Rien n'est envoyé. Avec des données fausses, Kinglet liste les champs qui acceptent n'importe quoi (aucune validation) et ceux que le navigateur refuse, avec son message. Les valeurs passent par les événements `input` et `change`, donc React, Vue et Svelte les voient.
- **Exporter** (barre des appareils) : une planche PNG de tous les appareils côte à côte (écran ou pages entières, jusqu'à 10 000 px), un PDF avec un appareil par page, les images séparées dans un dossier, ou une vidéo (WebM) ou un GIF de tous les appareils qui défilent ensemble du haut en bas.
- **Hors ligne et réponses simulées** (menu réseau) : tous les appareils sans réseau, ou des réponses d'API inventées (méthode, URL avec `*`, statut, délai, corps) pour voir les états d'erreur, vides ou lents sans toucher au backend.
- **Retours** (barre de gauche) : épingle des commentaires sur les appareils ; chacun garde l'appareil, la page, l'élément et une capture. Envoie-les en issue GitHub, en Markdown ou à Claude.
  - **Lien de relecture** : un lien à envoyer à un client, qui l'ouvre dans son navigateur, sans l'app ni compte. Il voit les retours avec leurs captures, y répond, et épingle de nouveaux commentaires en cliquant sur une capture de chaque appareil. Tout arrive dans le panneau Retours, avec une notification, et tu peux répondre dans le fil. Le lien marche sur le réseau local (port 47900) ; pour un client ailleurs, mets un tunnel devant (`cloudflared tunnel --url http://localhost:47900`) et colle son adresse publique sous le lien. Le lien porte un jeton aléatoire et se ferme d'un clic.
- **Pull requests** : avec GitHub relié, le menu Preview et les déploiements montrent la PR de chaque branche, son état et sa CI.
- **Réseau et CPU ralentis** : 4G ou 3G lente, CPU d'un téléphone moyen (×4) ou d'entrée de gamme (×6), sur les téléphones et tablettes (les écrans restent à pleine vitesse). Le temps de chargement et le poids de la page s'affichent sous chaque appareil.
- **Barre de gauche** : en haut ce qui sert pendant le dev (Appareils, Console, Déploiements), en dessous, plus discret, ce qui sert avant de publier (Page, Partage, Checks, Comparer). Page et Checks s'ouvrent en panneau à côté des appareils, la Console en tiroir sous les appareils.
- **Console** : messages de console et erreurs réseau (requêtes échouées, HTTP 4xx/5xx) en direct, par appareil, avec une pastille d'erreurs sous chaque appareil. « Send to Claude » copie les erreurs et quoi faire, prêt à coller dans Claude Code ; Claude peut aussi les lire lui-même (outil MCP `get_console`, commande `/mcp__kinglet__fix_console`).
- **Réglages** par rubriques :
  - **Général** : langue (Système, English, Français ; le serveur MCP parle la langue choisie), ce qui s'ouvre au lancement, section par défaut d'un projet, synchro, orientation, réseau et CPU, analyse automatique après chaque chargement, raccourcis.
  - **Appareils** : appareils affichés et leur ordre (glisser-déposer, ou Alt+flèches), appareils personnalisés (nom, taille, densité, type), une seule liste pour tous les projets ou une par projet.
  - Puis le projet actif, Vercel, Claude Code, le serveur MCP et les mises à jour.
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
pnpm dev    # lance Kinglet
```

Kinglet détecte un serveur de dev déjà lancé (ports 3000, 5173, 4321, 8080…). Sinon, saisis son adresse ou juste son port (`3000`) dans la barre du haut. Les réglages (appareils, orientation, synchro, sites récents) sont gardés dans `~/.config/Kinglet/settings.json`.

Sur Wayland, Kinglet démarre en Wayland natif. La session détectée s'affiche dans la barre d'état.

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

1. Dans **Réglages → Vercel**, colle un jeton personnel créé sur [vercel.com/account/tokens](https://vercel.com/account/tokens). Il est chiffré par le trousseau du système (KWallet, GNOME Keyring) ; sans trousseau, il est stocké en clair dans un fichier lisible par toi seul, et Kinglet te le signale.
2. `Ctrl P` liste alors les projets de ton compte et de toutes tes équipes. Ouvrir un projet récupère son domaine de production et suit ses déploiements (toutes les 30 s, pour chaque onglet ouvert). Un site déjà ouvert par son adresse se relie à son projet Vercel dans **Réglages → Projet actif**.
3. Kinglet cherche le dossier du projet sur ton disque (dans `~/dev`, `~/code`, `~/projects`…, grâce au `.vercel/project.json` écrit par `vercel link`). Sinon, choisis-le dans **Projet actif** : il sert au suivi de Claude Code.

**Previews protégées.** Si le projet a un secret « Protection Bypass for Automation », Kinglet l'utilise pour ouvrir et lire les previews. Sinon, un bouton propose d'en créer un : c'est une modification du projet Vercel, faite uniquement sur ta demande. La variable `KINGLET_VERCEL_BYPASS=<secret>` reste prioritaire si tu préfères ne pas connecter ton compte. Le secret est envoyé dans l'en-tête `x-vercel-protection-bypass` aux domaines `*.vercel.app`.

### Nouveau projet de zéro

« Créer un projet » (écran d'accueil, `Ctrl P`, page Tous les projets ou palette `Ctrl K`) démarre un site depuis rien, sans quitter Kinglet. La stack technique se décide avec Claude, pas dans Kinglet :

1. **Dossier** : donne un nom, éventuellement l'idée du projet, et l'emplacement (`~/dev`, `~/code`… le premier qui existe, ou où tu veux). Kinglet crée un dossier vide avec `git init` sur `main`, rien d'autre.
2. **Claude** : le projet s'ouvre dans un onglet, Claude démarre dans son dossier, et sa saisie est pré-remplie (sans être envoyée) : le projet, ton idée, et la consigne de te proposer une stack, d'attendre ton accord, puis de mettre le projet en place avec un script `dev` dans `package.json` et de committer.
3. **Serveur de dev** : dès que `package.json` a un script `dev` et que Claude a fini sa tâche, Kinglet lance `npm install` si `node_modules` manque, puis `npm run dev` (pnpm, yarn ou bun selon le fichier de verrouillage), dans ton shell de connexion pour trouver le `node` de nvm, fnm, asdf… L'adresse est lue dans la sortie du serveur, et le site apparaît sur les appareils dès qu'il répond. Une erreur affiche la sortie et propose « Demander à Claude ». La barre d'état lance ou arrête le serveur de dev de n'importe quel projet qui a un dossier ; il s'arrête avec Kinglet.
4. **Publier** : « Publier (GitHub, Vercel) » sur la carte du projet dans Tous les projets, ou « Publier ce projet sur GitHub et Vercel… » dans la palette.
   - **GitHub** : crée le dépôt (privé par défaut, dans ton compte ou une de tes organisations) et y pousse le projet (il faut au moins un commit). Le jeton GitHub de Kinglet sert pour ce push seulement, il n'est jamais écrit dans `.git/config` : pour les push suivants, il faut ton propre accès git (`gh auth login`, clé SSH). Le jeton doit avoir **Administration** et **Contents** en lecture et écriture (jeton fin, sur tous les dépôts) ou le scope `repo` (jeton classique).
   - **Vercel** : crée le projet Vercel relié au dépôt (dans l'équipe choisie, framework lu dans `package.json`), lance le premier déploiement de production, et relie le dossier (`.vercel/project.json`, comme `vercel link`). Ensuite, chaque push sur `main` part en production et chaque branche a sa preview, suivies par Kinglet. Il faut l'app GitHub de Vercel installée sur le compte du dépôt.

## Sur mon téléphone

Bouton **Sur mon téléphone** dans la barre du haut, ou `Ctrl K` puis « téléphone ». En local, active le partage sur le réseau, puis scanne le QR code avec le téléphone, connecté au même Wi-Fi.

- **Port** : 47800 par défaut, ou le suivant s'il est pris. Si un pare-feu bloque : `sudo ufw allow 47800/tcp` ou `sudo firewall-cmd --add-port=47800/tcp`.
- **Appairage** : le QR code contient un jeton à usage de cookie, renouvelé à chaque activation. Sans lui, un appareil du réseau reçoit un refus (403).
- **En-têtes** : le relais réécrit `Host` et `Origin` vers `localhost`, ce qui évite les blocages de Vite (`allowedHosts`) et de Next.js (`allowedDevOrigins`). Les WebSocket du rechargement à chaud passent.
- **Suivi** : un petit script injecté dans les pages HTML fait suivre au téléphone la navigation de Kinglet (désactivable).

## Brancher Claude Code (MCP)

La commande exacte pour ton installation est dans **Réglages** (bouton « Copier »). Avec le paquet pacman :

```bash
claude mcp add --scope user kinglet -- /usr/bin/kinglet --mcp --ozone-platform=headless
```

En développement, depuis le dépôt, Node suffit :

```bash
claude mcp add --scope user kinglet -- node /chemin/vers/kinglet/packages/mcp/src/cli.ts
```

Outils exposés : `status`, `open_url`, `set_devices`, `screenshot`, `get_page_meta`, `get_share_preview`, `run_checks`, `audit_site`, `get_accessibility`, `get_structured_data`, `list_pages`, `list_deployments`, `get_console`. Cinq commandes sont aussi disponibles dans Claude Code :

- `/mcp__kinglet__fix_share` corrige les aperçus de partage de la page ouverte, puis vérifie ;
- `/mcp__kinglet__fix_checks` corrige les problèmes trouvés par les checks, puis les relance ;
- `/mcp__kinglet__fix_console` corrige les erreurs JavaScript et réseau vues dans les appareils, puis revérifie la console ;
- `/mcp__kinglet__fix_site` audite toutes les pages du site (liens cassés, ancres mortes, doublons, sitemap, hreflang, checks), corrige, puis réaudite ;
- `/mcp__kinglet__fix_accessibility` corrige les violations axe-core et le focus clavier manquant, puis revérifie.

Le serveur MCP marche app fermée, sur une URL donnée. Avec l'app ouverte, il utilise la page affichée et les appareils émulés : captures, débordement horizontal, erreurs JavaScript. Il parle à l'app par un serveur local (`127.0.0.1`, jeton aléatoire dans `~/.config/Kinglet/mcp.json`), et chaque appel de Claude apparaît dans **Réglages → Serveur MCP** et dans la barre d'état.

## Installer l'app (Arch / CachyOS)

Télécharge le paquet pacman (ou l'AppImage) de la [dernière release](https://github.com/stevenpersia/kinglet-releases/releases/latest), puis :

```bash
sudo pacman -U Kinglet-*.pacman
```

Ou construis-le toi-même :

```bash
pnpm dist && sudo pacman -U apps/desktop/dist/Kinglet-*.pacman
```

### Mises à jour

L'app installée (paquet pacman ou AppImage) cherche une nouvelle version au démarrage puis toutes les 6 heures, la télécharge en arrière-plan et la vérifie (SHA-512). Elle ne l'installe que lorsque tu cliques **Installer et redémarrer** (Réglages, ou la barre d'état). Pour le paquet pacman, l'installation demande le mot de passe administrateur.

Le code est privé ; les versions sont publiées aussi dans le dépôt public [`stevenpersia/kinglet-releases`](https://github.com/stevenpersia/kinglet-releases), où l'app les lit sans jeton.

### Publier une version

1. Monte la version dans `apps/desktop/package.json` et pousse sur `main`.
2. Lance la publication, au choix :
   - dans GitHub, **Actions → Release → Run workflow** : le tag est créé à partir de la version ;
   - ou en poussant un tag `v<version>` :

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Le workflow `release.yml` refait les tests, construit, teste l'app packagée (mise à jour comprise), puis crée la release avec l'AppImage, le paquet pacman et `latest-linux.yml` ici et dans `stevenpersia/kinglet-releases` (le `latest-linux.yml` de ce dépôt public est celui que lit l'outil de mise à jour). Il faut le secret `RELEASES_TOKEN` : un jeton fine-grained avec **Contents : lecture et écriture** sur `kinglet-releases`.

## Site web

`apps/web` est le site (en anglais) : React, Motion et Tailwind, pré-rendu en HTML statique au build pour que la page se lise sans JavaScript (robots, aperçus de partage, checks). Il reprend les icônes (`components/Icons.tsx`) et les couleurs Graphite de l'app (`apps/desktop/src/renderer/theme.css`, partagé), et le hero rejoue l'app (inspecteur, console, outils d'appareils, déploiements) avec les mêmes composants visuels. Pour le déployer sur Vercel, importe le dépôt avec `apps/web` comme *Root Directory* ; `vercel.json` s'occupe du reste (il n'installe que le site et ses dépendances). Un commit qui ne touche pas au site (par exemple seulement l'app desktop) ne lance pas de build Vercel : `apps/web/scripts/ignore-build.sh` ne le déclenche que si `apps/web`, les icônes ou le thème partagés de l'app, ou la config du monorepo ont changé. Le build reprend le domaine de production Vercel pour les URL absolues (canonical, og:image, sitemap) et la version de l'app depuis `apps/desktop/package.json`.

Le prix (paiement unique) est dans `apps/web/src/config.ts`. Avant la sortie, il n'y a pas de téléchargement sur le site : un champ e-mail (hero, Pricing, bas de page) inscrit à la liste de lancement, et ceux qui y sont recevront une remise à la sortie. Le formulaire envoie à la fonction Vercel `apps/web/functions/waitlist.ts` (une fonction Edge, emballée par `scripts/build.mjs` au format *Build Output* de Vercel, servie sur `/api/waitlist`), qui ajoute l'adresse à une *audience* Resend (là d'où partira l'e-mail de lancement). Variables à mettre dans le projet Vercel : `RESEND_API_KEY` et `RESEND_AUDIENCE_ID`. Le formulaire marche aussi sans JavaScript, avec un champ piège contre les robots.

```bash
pnpm --filter @kinglet/web dev        # http://localhost:4173, rechargement à chaud
```

```bash
pnpm --filter @kinglet/web preview    # build statique servi sur http://localhost:4173
```

Ses tests la passent aux checks mesurables sans navigateur et aux 10 aperçus de partage de Kinglet : tout doit être vert.

## Claude dans Kinglet

Il faut Claude Code installé sur l'ordinateur (`npm install -g @anthropic-ai/claude-code`) ; Kinglet le cherche dans le `PATH`, `~/.local/bin` et `~/.claude/local`. Le panneau Claude est un vrai terminal qui lance ton `claude` dans le dossier du projet, avec le serveur MCP de Kinglet (`--mcp-config`) : ton compte (`/login` si la session expire, abonnement ou clé API), tes commandes slash, tes réglages et ses demandes d'autorisation, comme dans ton terminal. Il continue de tourner quand tu changes de projet, et redémarre si le dossier du projet change.

« Demander à Claude » (inspecteur, console, checks, aperçus de partage, retours) et « Montrer » collent leur contexte dans la saisie de Claude, sans l'envoyer : tu complètes et tu appuies sur Entrée. Les captures sont enregistrées dans `/tmp/kinglet-captures/` et collées par leur chemin, que Claude Code lit comme une image. Quand le terminal a le focus, Ctrl R, L, K, P et J lui reviennent ; Ctrl 1…9, Ctrl , et les raccourcis avec Maj restent à Kinglet.

## Suivi de Claude Code

Dans **Réglages → Suivi de Claude Code**, « Activer » ajoute des hooks à `~/.claude/settings.json` (ou `$CLAUDE_CONFIG_DIR/settings.json`) et garde une copie de sauvegarde à côté (`settings.json.kinglet-backup`). Tes propres hooks ne sont pas touchés, et « Désactiver » retire uniquement ceux de Kinglet. Relance les sessions Claude Code déjà ouvertes.

- **Évènements** : `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Notification`, `Stop`, `StopFailure`, `SessionEnd`, en mode asynchrone : ils ne ralentissent jamais Claude.
- **Trajet** : un petit script (`~/.config/Kinglet/claude-hook.sh`, `curl`) envoie l'évènement au serveur local de l'app (`127.0.0.1`, jeton dans `hook.env`, lisible par toi seul). App fermée, il ne fait rien.
- **Projet** : une session est rattachée au projet dont le dossier contient son répertoire de travail (le plus profond gagne, pratique pour les monorepos).
- **Statuts** : « travaille » dès une demande, « attend ta réponse » sur une demande de permission, « à voir » après `Stop` jusqu'à ce que tu marques le résultat comme vu. Une interruption n'envoie pas `Stop` : une session muette depuis 10 min repasse au repos.

## Tests

```bash
pnpm test        # tests unitaires (lecture des balises, fichiers du site, exploration, checks, disposition)
```

```bash
pnpm selftest    # test d'acceptation de bout en bout
```

L'autotest lance le site de démo et Kinglet, puis vérifie :

- l'émulation (largeur, densité, `pointer: coarse`, `hover: none`, tactile) ;
- le scroll synchronisé et le rechargement à chaud ;
- la lecture des balises comme le robot WhatsApp ;
- l'en-tête de contournement Vercel ;
- le mode paysage et l'enregistrement des réglages ;
- le gel des aperçus sous la palette ;
- la synchro de navigation ;
- les 37 checks sur une page aux défauts connus (débordement, erreur JavaScript) ;
- l'exploration des pages ;
- les 10 aperçus de partage et le correctif pour le framework détecté ;
- le serveur MCP lancé comme le ferait Claude Code (`kinglet --mcp`), avec capture et checks via l'app ;
- Vercel contre une fausse API : connexion, projet relié depuis les réglages, bascule local → prod → preview → local sur le même chemin, secret de contournement du projet, comparaison des trois environnements, preview protégée (appareils et robots) ;
- la barre du haut à 1600, 1280 et 960 px de large ;
- le favicon du site dans l'onglet du projet ;
- la console : erreur JavaScript vue par chaque appareil, avertissement et requête échouée, listés dans l'onglet Console ;
- le ralentissement : une requête et un calcul chronométrés dans le téléphone avant et après 3G lente + CPU ×4 ;
- la langue : bascule en français et retour ;
- les projets : un 2e onglet ouvert depuis `Ctrl P`, retour au 1er avec `Ctrl 1` ;
- le suivi de Claude Code (dans un `CLAUDE_CONFIG_DIR` temporaire) : hooks installés, demande puis édition jouées par le vrai script, onglet « en cours », fin de tâche, puis désinstallation propre ;
- les mises à jour : sur l'app packagée, une 9.9.9 trouvée sur un faux flux, téléchargée et vérifiée (sans installation) ;
- la région : langue, fuseau et position vus par la page, avec une langue propre à la tablette ;
- le texte agrandi (taille de base à 32 px) et le zoom à 200 % (page remise à la moitié de la largeur) ;
- le clavier virtuel (hauteur iPhone et iPad) et le parcours au clavier ;
- l'accessibilité : axe-core trouve le lien peu contrasté de la page atelier ;
- l'export : planche PNG, PDF, GIF et vidéo WebM enregistrés depuis le menu ;
- les formulaires (page contact : mauvais clavier, champ e-mail sans validation, remplissage vu par la page), `visualViewport` avec le clavier, une ancre créée par JavaScript non signalée, la mesure locale après une tâche de Claude ;
- l'audit du site, la mesure d'un déploiement pour l'historique, et le lien de relecture (page client, captures, épingle postée par le client, jeton refusé) ;
- le téléphone, joué par une fenêtre Chromium cachée : refus sans appairage, page via le QR code, rechargement à chaud à travers le relais, suivi de la navigation, QR code de preview protégée.

Sans écran, il utilise Xvfb et prend des captures avec ImageMagick dans `apps/desktop/selftest-output/`. Pour tester l'app packagée : `KINGLET_BIN=dist/linux-unpacked/kinglet node scripts/selftest.mjs` depuis `apps/desktop`. `KINGLET_SELFTEST_SHOTS=0` le lance sans captures (environ 30 s de moins).

## Structure

```
apps/desktop        app Electron (electron-vite)
  src/main          fenêtre, appareils émulés, réglages, raccourcis
  src/preload       ponts sécurisés vers l'interface et les pages émulées
  src/renderer      interface React + Tailwind (design « Graphite »)
packages/mcp        serveur MCP (stdio) pour Claude Code, client du serveur de contrôle de l'app
packages/core       lecture des balises comme les robots, aperçus des 10 plateformes, correctifs, fichiers du site, exploration, 37 checks, données structurées, hreflang, audit du site, budgets
apps/web            site web (React + Motion, pré-rendu statique, Vercel)
fixtures/demo-site  site de test (Vite)
fixtures/vercel-mock  fausse API Vercel pour les tests
```

Les appareils sont des `WebContentsView` émulées via le protocole DevTools de Chromium (`Emulation.setDeviceMetricsOverride`, émulation tactile, user agent), placées au-dessus des cadres dessinés par l'interface. Comme ces vues natives passent toujours au-dessus du HTML, un menu ou la palette « gèle » les aperçus : ils sont capturés en image et masqués le temps de l'affichage.
