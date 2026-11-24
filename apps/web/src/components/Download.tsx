import { Icon } from '../../../desktop/src/renderer/components/Icons';
import { DOWNLOAD_URL, MCP_COMMAND, VERSION } from '../config';
import { DownloadButton } from './Get';
import { INCLUDED } from './Pricing';
import { Reveal } from './ui';

/** The two packages of each release, and what to type once downloaded. */
const PACKAGES: { name: string; file: string; run: string }[] = [
  { name: 'AppImage', file: `Kinglet-${VERSION}-x86_64.AppImage`, run: 'chmod +x Kinglet-*.AppImage && ./Kinglet-*.AppImage' },
  { name: 'pacman (Arch, CachyOS)', file: `Kinglet-${VERSION}-x64.pacman`, run: 'sudo pacman -U Kinglet-*.pacman' },
];

/** Free download, where Pricing was: the same card, with the packages instead of the price. */
export function Download() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 pt-36 sm:px-6">
      <div id="download" className="flex flex-col items-center gap-4 text-center">
        <Reveal>
          <span className="inline-flex items-center gap-2.5 font-mono text-xs tracking-[0.08em] text-faint uppercase">
            <b className="rounded-md border border-[#2a2a30] px-1.5 font-medium text-fg">07</b>Download
          </span>
        </Reveal>
        <Reveal>
          <h2 className="m-0 text-[clamp(34px,4.8vw,60px)] leading-none font-semibold tracking-[-0.05em]">
            Free.
            <br />
            <span className="bg-[linear-gradient(92deg,#f0a07f,#e6c07b_70%)] bg-clip-text text-transparent">Every feature.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.06}>
          <p className="m-0 max-w-[520px] text-base leading-relaxed text-muted">No account, no license key, no card. Download Kinglet, open it, point it at your site.</p>
        </Reveal>
      </div>

      <Reveal className="mx-auto mt-12 max-w-[880px]">
        <div className="relative rounded-[22px] bg-[linear-gradient(140deg,rgba(217,119,87,0.55),rgba(230,192,123,0.25)_35%,#1e1e23_60%)] p-px">
          <div className="flex flex-wrap gap-10 rounded-[21px] bg-[linear-gradient(180deg,#111114,#0b0b0e)] p-[clamp(24px,5vw,48px)]">
            <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
              <div className="flex items-center gap-2.5">
                <span className="text-lg font-semibold">Kinglet</span>
                <span className="rounded-full bg-[rgba(125,211,168,0.12)] px-2 py-0.5 font-mono text-[11px] text-ok">free</span>
                <span className="rounded-full bg-[rgba(217,119,87,0.14)] px-2 py-0.5 font-mono text-[11px] text-[#f0a07f]">v{VERSION}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[72px] leading-none font-semibold tracking-[-0.05em]">$0</span>
                <span className="text-sm text-faint">for Linux</span>
              </div>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {PACKAGES.map((p) => (
                  <li key={p.name} className="flex min-w-0 flex-col gap-1 rounded-[12px] border border-[#1e1e23] bg-[#0d0d10] px-3.5 py-2.5">
                    <span className="flex items-center justify-between gap-3 text-[13.5px] text-fg">
                      {p.name}
                      <span className="truncate font-mono text-[11px] text-ghost">{p.file}</span>
                    </span>
                    <code className="truncate font-mono text-[12px] text-[#c4c4cc]">
                      <span className="text-ghost">$</span> {p.run}
                    </code>
                  </li>
                ))}
              </ul>
              <DownloadButton className="w-full" />
              <p className="m-0 text-xs text-ghost">
                From the{' '}
                <a href={DOWNLOAD_URL} className="text-faint underline underline-offset-2 hover:text-fg">
                  latest GitHub release
                </a>
                . Updates install themselves. By using Kinglet you accept the{' '}
                <a href="/terms/" className="text-faint underline underline-offset-2 hover:text-fg">
                  Terms
                </a>
                .
              </p>
            </div>
            <ul className="m-0 flex min-w-0 flex-[1_1_300px] list-none flex-col gap-3 p-0">
              {INCLUDED.map((f) => (
                <li key={f} className="flex items-start gap-3 text-[14.5px] text-[#c4c4cc]">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[rgba(125,211,168,0.12)] text-ok">
                    <Icon name="check" size={12} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

const FAQ: [string, string][] = [
  ['Is it really free?', 'Yes. Every feature, no account, no license key, no time limit, for personal and commercial work. Paid extras may come later; what is free today stays free.'],
  ['Does it check security?', 'Yes, in its own section. Kinglet looks for API keys and tokens shipped in your HTML and JavaScript, .env, .git and source maps left reachable (tried on your own sites only), security headers, cookie flags, HTTPS, mixed content and third-party scripts. Each problem comes with the fix, and Claude can apply it.'],
  ['How do I install it?', 'Download the AppImage (any distribution: make it executable and run it) or the pacman package (Arch, CachyOS: sudo pacman -U) from the latest GitHub release. Kinglet then updates itself.'],
  ['Which systems does it run on?', 'Linux today: AppImage for any distribution, and a pacman package for Arch and CachyOS.'],
  ['Do I need Claude Code?', `No. Devices, checks, Open Graph previews and Vercel work on their own. With Claude Code installed, Kinglet opens it in your project with the MCP server already plugged in (${MCP_COMMAND.split(' --')[0]}).`],
  ['Do I need Vercel or GitHub?', 'No. Any local address works (localhost:3000, 5173…). Connect Vercel and GitHub for previews, production, pull requests and publishing.'],
  ['Which frameworks?', 'Anything that runs in a browser. Fixes are written for Next.js, Nuxt, Astro, SvelteKit and Vite.'],
  ['Where do my tokens go?', 'Into your system keyring (KWallet, GNOME Keyring). Kinglet talks to Vercel and GitHub from your computer only.'],
];

export function Faq() {
  return (
    <section className="mx-auto max-w-[880px] px-4 pt-32 sm:px-6">
      <Reveal>
        <h2 id="faq" className="m-0 text-center text-[clamp(28px,3.4vw,40px)] font-semibold tracking-[-0.04em]">Questions</h2>
      </Reveal>
      <div className="mt-10 flex flex-col">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group border-b border-line-soft py-5 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-medium">
              {q}
              <span className="text-ghost transition-transform group-open:rotate-45">
                <Icon name="plus" size={16} />
              </span>
            </summary>
            <p className="m-0 mt-3 text-[15px] leading-relaxed text-muted">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
