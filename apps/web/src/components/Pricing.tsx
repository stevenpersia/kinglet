import { Icon } from '../../../desktop/src/renderer/components/Icons';
import { DOWNLOAD_URL, LAUNCH_OFFER, LAUNCH_PRICE, LAUNCH_SEATS, LAUNCHED, PRICE } from '../config';
import { type LaunchOffer, useLaunchOffer } from '../launchOffer';
import { REFUND_DAYS } from '../publisher';
import { Reveal } from './ui';
import { GetKinglet } from './Get';

export const INCLUDED = [
  '10 emulated devices and your real phone',
  'Claude Code panel, inspector and console',
  'MCP server: 14 tools, 6 slash commands',
  'Vercel and GitHub: previews, prod, PRs, CI',
  '53 checks: SEO, content, privacy, speed…',
  'Site audit, budgets, deploy history',
  'Security: leaked keys, open files, headers',
  'Open Graph on 10 platforms, share image maker',
  'Feedback to GitHub, Linear and Slack',
  'Recorded journeys, replayed and exported to Playwright',
  'Region, keyboards, forms, mocks, export',
  'Automatic updates',
];

/** How many launch-price licenses are left: a bar filling up as they sell, and the count. */
function LaunchMeter({ offer }: { offer: LaunchOffer }) {
  const sold = offer.total - offer.left;
  return (
    <div className="-mt-2 flex flex-col gap-2">
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-[#1e1e23]">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#f0a07f,#e6c07b)] transition-[width] duration-700" style={{ width: `${Math.max(2, (sold / offer.total) * 100)}%` }} />
      </div>
      <p className="m-0 font-mono text-xs text-[#e6c07b]">
        {offer.left} of {offer.total} left at {LAUNCH_PRICE.label}, then {PRICE.label}
      </p>
    </div>
  );
}

/** The paid offer, hidden while Kinglet is free (config.ts FREE): App renders Download instead. */
export function Pricing() {
  const offer = useLaunchOffer();
  return (
    <section className="mx-auto max-w-[1200px] px-4 pt-36 sm:px-6">
      {/* The anchor is on the heading, like the other sections: the menu lands on it, not on the space above. */}
      <div id="pricing" className="flex flex-col items-center gap-4 text-center">
        <Reveal>
          <span className="inline-flex items-center gap-2.5 font-mono text-xs tracking-[0.08em] text-faint uppercase">
            <b className="rounded-md border border-[#2a2a30] px-1.5 font-medium text-fg">07</b>Pricing
          </span>
        </Reveal>
        <Reveal>
          <h2 className="m-0 text-[clamp(34px,4.8vw,60px)] leading-none font-semibold tracking-[-0.05em]">
            Pay once.
            <br />
            <span className="bg-[linear-gradient(92deg,#f0a07f,#e6c07b_70%)] bg-clip-text text-transparent">Keep it.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.06}>
          <p className="m-0 max-w-[520px] text-base leading-relaxed text-muted">No subscription, no account, no seat to manage. One license, every feature.{LAUNCHED ? '' : ` Launching soon: ${LAUNCH_OFFER}.`}</p>
        </Reveal>
      </div>

      <Reveal className="mx-auto mt-12 max-w-[880px] scroll-mt-24">
        <span id="waitlist" />
        <div className="relative rounded-[22px] bg-[linear-gradient(140deg,rgba(217,119,87,0.55),rgba(230,192,123,0.25)_35%,#1e1e23_60%)] p-px">
          <div className="flex flex-wrap gap-10 rounded-[21px] bg-[linear-gradient(180deg,#111114,#0b0b0e)] p-[clamp(24px,5vw,48px)]">
            <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
              <div className="flex items-center gap-2.5">
                <span className="text-lg font-semibold">Kinglet</span>
                <span className="rounded-full bg-[rgba(217,119,87,0.14)] px-2 py-0.5 font-mono text-[11px] text-[#f0a07f]">one-time</span>
                {!LAUNCHED && <span className="rounded-full bg-[rgba(230,192,123,0.12)] px-2 py-0.5 font-mono text-[11px] text-[#e6c07b]">coming soon</span>}
                {offer && <span className="rounded-full bg-[rgba(230,192,123,0.12)] px-2 py-0.5 font-mono text-[11px] text-[#e6c07b]">launch price</span>}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[72px] leading-none font-semibold tracking-[-0.05em]">{offer ? LAUNCH_PRICE.label : PRICE.label}</span>
                {offer && <s className="text-2xl font-medium tracking-[-0.03em] text-faint">{PRICE.label}</s>}
                <span className="text-sm text-faint">once</span>
              </div>
              {offer ? <LaunchMeter offer={offer} /> : !LAUNCHED && <p className="m-0 -mt-2 font-mono text-xs text-[#e6c07b]">{LAUNCH_OFFER}</p>}
              <p className="m-0 text-sm leading-relaxed text-faint">
                {LAUNCHED ? (
                  <>
                    One license for you, on up to 3 computers. Linux (AppImage and pacman). The key is ready right after paying;{' '}
                    <a href={DOWNLOAD_URL} className="text-muted underline underline-offset-2 hover:text-fg">
                      download Kinglet
                    </a>{' '}
                    and enter it on first launch.
                  </>
                ) : (
                  <>One license for you, on your computers. Linux (AppImage and pacman). Leave your email to hear when Kinglet launches: the first {LAUNCH_SEATS} buyers pay {LAUNCH_PRICE.label}.</>
                )}
              </p>
              <GetKinglet align="stretch" />
              <p className="m-0 text-xs text-ghost">{LAUNCHED ? (
                  <>
                    Secure checkout by Polar, VAT included where it applies. By buying you accept the{' '}
                    <a href="/terms/" className="text-faint underline underline-offset-2 hover:text-fg">
                      Terms
                    </a>{' '}
                    and ask for immediate delivery, which ends the EU withdrawal right; the {REFUND_DAYS}-day refund still applies.
                  </>
                ) : (
                  <>
                    One email at launch. No spam, unsubscribe in one click.{' '}
                    <a href="/privacy/" className="text-ghost underline underline-offset-2 hover:text-fg">
                      Privacy
                    </a>
                  </>
                )}</p>
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
