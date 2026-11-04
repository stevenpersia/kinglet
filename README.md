# Parakeet

Voir son site sur tous les écrans (iPhone, Android, iPad, desktop), en local, en preview et en prod, et vérifier l'aperçu de ses liens (WhatsApp, LinkedIn, Slack…) avant de les partager. Pensé pour les sites construits avec Claude.

> Nom provisoire. État actuel : **phase 0**, un prototype technique.

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

Parakeet détecte un serveur de dev déjà lancé (ports 3000, 5173, 4321, 8080…). Sinon, saisis l'adresse dans la barre du haut. Au premier lancement, Electron télécharge son binaire.

Sur Wayland, Parakeet démarre en Wayland natif. La session détectée s'affiche dans la barre d'état en bas.

### Previews Vercel protégées

```bash
PARAKEET_VERCEL_BYPASS=<secret "Protection Bypass for Automation"> pnpm dev
```

Le secret est envoyé dans l'en-tête `x-vercel-protection-bypass` aux domaines `*.vercel.app`, à la fois dans les aperçus et lors de la lecture des balises.

## Autotest de la phase 0

```bash
pnpm selftest
```

Le test lance le site de démo et Parakeet, puis vérifie :

- l'émulation (largeur, densité, `pointer: coarse`, `hover: none`, tactile) ;
- le scroll synchronisé ;
- le rechargement à chaud ;
- la lecture des balises comme le robot WhatsApp ;
- l'en-tête de contournement Vercel.

Sans écran, il utilise Xvfb et prend des captures avec ImageMagick dans `apps/desktop/selftest-output/`. Sur Wayland, les captures sont ignorées mais les critères sont vérifiés.

## Structure

```
apps/desktop        app Electron (electron-vite) : fenêtre, appareils émulés, interface
packages/core       lecture des balises comme les robots de partage, analyse de l'image, checks
fixtures/demo-site  site de test (Vite)
```

Les appareils sont des `WebContentsView` émulées via le protocole DevTools de Chromium (`Emulation.setDeviceMetricsOverride`, émulation tactile, user agent), placées au-dessus des cadres dessinés par l'interface.
