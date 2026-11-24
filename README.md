<p align="center">
  <a href="https://getkinglet.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="brand/kinglet-logo-white.svg">
      <img src="brand/kinglet-logo-black.svg" alt="Kinglet" width="280">
    </picture>
  </a>
</p>

<p align="center">
  <strong>The dev environment for vibe coding.</strong><br>
  Build with Claude, see your site on 10 devices at once, point at what’s wrong and let Claude fix it.
</p>

<p align="center">
  <a href="https://github.com/stevenpersia/kinglet/releases/latest"><img src="https://img.shields.io/badge/download-latest%20release-e6c07b" alt="Download"></a>
  <img src="https://img.shields.io/badge/price-free-7dd3a8" alt="Free">
  <img src="https://img.shields.io/badge/platform-Linux-8ab4f8" alt="Linux">
  <a href="https://getkinglet.com"><img src="https://img.shields.io/badge/site-getkinglet.com-f0a07f" alt="getkinglet.com"></a>
</p>

<p align="center">
  <img src="docs/images/inspect.png" alt="Kinglet showing a site on an iPhone and a laptop, with the inspector and Claude Code on the side" width="900">
</p>

## What it does

- **Every device at once.** 10 emulated devices (iPhone, Android, iPad, laptop…), scroll and navigation in sync, and your real phone over Wi-Fi.
- **Point, Claude fixes.** Inspect any element, send it (or console errors) to Claude Code, which runs right inside Kinglet.
- **53 checks.** SEO, content, mobile, accessibility, privacy, performance and security, on every render.
- **Open Graph previews.** How your link looks on WhatsApp, LinkedIn, X, Slack, Google and 5 more, read by their own bots.
- **Local, preview, prod.** Vercel and GitHub built in: previews, pull requests, CI, deploy history.
- **MCP server.** Claude Code can open pages, take screenshots and run the checks itself.

<table>
  <tr>
    <td><img src="docs/images/open-graph.png" alt="Open Graph previews on every platform"></td>
    <td><img src="docs/images/checks.png" alt="Checks panel with Claude fixing the failures"></td>
  </tr>
  <tr>
    <td align="center">Open Graph on 10 platforms</td>
    <td align="center">53 checks, fixed by Claude</td>
  </tr>
</table>

## Download

Kinglet is **free**: no account, no license key. Linux for now.

Grab the [latest release](https://github.com/stevenpersia/kinglet/releases/latest), then:

```bash
chmod +x Kinglet-*.AppImage && ./Kinglet-*.AppImage   # any distribution
```

```bash
sudo pacman -U Kinglet-*.pacman                         # Arch, CachyOS
```

Kinglet updates itself. To let Claude Code use it from your terminal:

```bash
claude mcp add --scope user kinglet -- kinglet --mcp --ozone-platform=headless
```

## Develop

```bash
pnpm install && pnpm dev
```

```bash
pnpm test                          # unit tests
```

```bash
pnpm --filter @kinglet/web dev     # the website, getkinglet.com
```

To publish a version, bump `apps/desktop/package.json` and run **Actions → Release**: it tests, builds and publishes the AppImage and pacman package here.

<p align="center"><sub>Made for sites built with Claude · <a href="https://getkinglet.com">getkinglet.com</a></sub></p>
