import { Icon } from '../../../desktop/src/renderer/components/Icons';
import { CHECKOUT, DOWNLOAD, PRICE, VERSION } from '../config';
import { Reveal } from './ui';

const INCLUDED = [
  '10 emulated devices and your real phone',
  'Claude Code panel, inspector and console',
  'MCP server: 13 tools, 5 slash commands',
  'Vercel and GitHub: previews, prod, PRs, CI',
  '37 checks, site audit, budgets, history',
  'Share previews on 10 platforms',
  'Region, keyboards, forms, mocks, export',
  'Automatic updates',
];

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-[1200px] px-4 pt-36 sm:px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Reveal>
          <span className="inline-flex items-center gap-2.5 font-mono text-xs tracking-[0.08em] text-faint uppercase">
            <b className="rounded-md border border-[#2a2a30] px-1.5 font-medium text-fg">06</b>Pricing
          </span>
        </Reveal>
        <Reveal>
          <h2 className="m-0 text-[clamp(34px,4.8vw,60px)] leading-none font-semibold tracking-[-0.05em]">
            Pay once.
            <br />
            <span className="text-ghost">Keep it.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.06}>
          <p className="m-0 max-w-[520px] text-base leading-relaxed text-muted">No subscription, no account, no seat to manage. One license, every feature.</p>
        </Reveal>
      </div>

      <Reveal className="mx-auto mt-12 max-w-[880px]">
        <div className="relative rounded-[22px] bg-[linear-gradient(140deg,rgba(217,119,87,0.55),rgba(230,192,123,0.25)_35%,#1e1e23_60%)] p-px">
          <div className="flex flex-wrap gap-10 rounded-[21px] bg-[linear-gradient(180deg,#111114,#0b0b0e)] p-[clamp(24px,5vw,48px)]">
            <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
              <div className="flex items-center gap-2.5">
                <span className="text-lg font-semibold">Kinglet</span>
                <span className="rounded-full bg-[rgba(217,119,87,0.14)] px-2 py-0.5 font-mono text-[11px] text-[#f0a07f]">one-time</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[72px] leading-none font-semibold tracking-[-0.05em]">{PRICE.label}</span>
                <span className="text-sm text-faint">once</span>
              </div>
              <p className="m-0 text-sm leading-relaxed text-faint">One license for you, on your computers. Version {VERSION}, Linux (AppImage and pacman).</p>
              <div className="flex flex-col gap-2.5">
                <a
                  href={CHECKOUT ?? DOWNLOAD}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-fg px-5 font-semibold text-ink no-underline transition-colors hover:bg-white"
                >
                  Buy Kinglet · {PRICE.label}
                </a>
                <a
                  href={DOWNLOAD}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-[10px] border border-[#26262c] bg-[#0f0f12] px-5 font-medium text-fg no-underline hover:border-line-strong"
                >
                  <Icon name="download" size={15} />
                  Download
                </a>
              </div>
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
  ['Is it a subscription?', `No. You pay ${PRICE.label} once and keep Kinglet. Updates install themselves.`],
  ['Which systems does it run on?', 'Linux today: AppImage for any distribution, and a pacman package for Arch and CachyOS.'],
  ['Do I need Claude Code?', 'No. Devices, checks, share previews and Vercel work on their own. With Claude Code installed, Kinglet opens it in your project with the MCP server already plugged in.'],
  ['Do I need Vercel or GitHub?', 'No. Any local address works (localhost:3000, 5173…). Connect Vercel and GitHub for previews, production, pull requests and publishing.'],
  ['Which frameworks?', 'Anything that runs in a browser. Fixes are written for Next.js, Nuxt, Astro, SvelteKit and Vite.'],
  ['Where do my tokens go?', 'Into your system keyring (KWallet, GNOME Keyring). Kinglet talks to Vercel and GitHub from your computer only.'],
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-[880px] px-4 pt-32 sm:px-6">
      <Reveal>
        <h2 className="m-0 text-center text-[clamp(28px,3.4vw,40px)] font-semibold tracking-[-0.04em]">Questions</h2>
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
