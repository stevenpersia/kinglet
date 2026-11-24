import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Dot, Icon, type IconName } from '../../../desktop/src/renderer/components/Icons';
import { MCP_COMMAND } from '../config';
import { LAB, LabTile } from './LabTiles';
import { Card, Reveal, SectionHead, Tag } from './ui';

const CLAY = '#d97757';

/* ───────────── 01 · AI workflow ───────────── */

export function AiWorkflow() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 pt-36 sm:px-6">
      <SectionHead id="ai" n="01" eyebrow="AI workflow" title="Point at it." dim="Claude fixes it.">
        A real Claude Code terminal lives next to your devices, with Kinglet’s MCP server already plugged in. Anything you see can become a prompt, with the screenshot and the element attached.
      </SectionHead>
      <div className="mt-12 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        <Reveal>
          <Card className="flex h-full min-h-[380px] flex-col gap-3.5 p-7">
            <Tag color="#8ab4f8">Inspect → Ask Claude</Tag>
            <h3 className="m-0 text-[22px] font-semibold tracking-[-0.03em]">Hover once. Every device lights up.</h3>
            <p className="m-0 text-[14.5px] leading-relaxed text-faint">Size, margins, font and color on each screen, or where it’s hidden. One click sends the table and a capture to Claude.</p>
            <div className="relative mt-auto flex h-[150px] items-center justify-center overflow-hidden rounded-xl bg-[#f6f5f0]">
              <span className="rounded-full bg-[#11241c] px-[18px] py-2.5 text-[13px] font-semibold text-[#f6f5f0] shadow-[0_0_0_2px_#f6f5f0,0_0_0_4px_#5b8def]">Get started — free</span>
              <span className="absolute top-3.5 left-3.5 rounded bg-[#5b8def] px-1.5 font-mono text-[10px] leading-5 text-white">button.cta · 343 × 48</span>
              <span className="absolute right-3.5 bottom-3.5 h-7 rounded-ui border border-[rgba(217,119,87,0.35)] bg-[#1c1513] px-2.5 text-xs leading-7 font-semibold text-clay">Ask Claude</span>
            </div>
          </Card>
        </Reveal>
        <Reveal delay={0.06}>
          <Card className="flex h-full min-h-[380px] flex-col gap-3.5 p-7">
            <Tag color="#f28b82">Console → Send to Claude</Tag>
            <h3 className="m-0 text-[22px] font-semibold tracking-[-0.03em]">Errors from every device, in one place.</h3>
            <p className="m-0 text-[14.5px] leading-relaxed text-faint">Console messages and failed requests, live and per device, with a badge under each screen. Claude can read them itself.</p>
            <div className="mt-auto rounded-xl border border-line-soft bg-[#0a0a0c] px-3.5 py-3 font-mono text-[11.5px] leading-[1.9]">
              <div className="truncate text-err">● TypeError: reading ‘rate’ <span className="text-ghost">· iPhone 16</span></div>
              <div className="truncate text-err">● GET /api/rates · 500 <span className="text-ghost">· iPhone 16</span></div>
              <div className="truncate text-warn">● Hydration mismatch <span className="text-ghost">· Laptop</span></div>
              <div className="mt-1.5 truncate text-ok">● /mcp__kinglet__fix_console → clean</div>
            </div>
          </Card>
        </Reveal>
        <Reveal delay={0.12}>
          <Card className="flex h-full min-h-[380px] flex-col gap-3.5 p-7">
            <Tag color={CLAY}>Claude, tracked</Tag>
            <h3 className="m-0 text-[22px] font-semibold tracking-[-0.03em]">Know what Claude is doing, everywhere.</h3>
            <p className="m-0 text-[14.5px] leading-relaxed text-faint">Each project tab says working, waiting for you or done. A notification when a task ends, and your site is measured again right after.</p>
            <div className="mt-auto flex flex-col gap-2">
              {[
                ['saltmint', '#a6f0c6', 'working', CLAY, true],
                ['docs', '#8ab4f8', 'waiting for you', '#e6c07b', false],
                ['portfolio', '#a78bfa', 'to review', '#7dd3a8', false],
              ].map(([name, color, label, tone, pulse]) => (
                <div key={name as string} className="flex items-center gap-2.5 rounded-[10px] border border-line-soft bg-[#0f0f12] px-3 py-2.5 text-[13px]">
                  <span className="size-3 rounded-[4px]" style={{ background: color as string }} />
                  {name as string}
                  <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px]" style={{ color: tone as string }}>
                    <span className={`size-1.5 rounded-full ${pulse ? 'claude-dot' : ''}`} style={{ background: tone as string }} />
                    {label as string}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      </div>
      <Reveal className="mt-4">
        <Artifacts />
      </Reveal>
      <Reveal className="mt-4">
        <Card className="flex flex-wrap items-center gap-7 p-7">
          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-2.5">
            <Tag color="#c6f432">+ New project</Tag>
            <h3 className="m-0 text-2xl font-semibold tracking-[-0.03em]">From an idea to a live URL, without leaving Kinglet.</h3>
            <p className="m-0 text-[14.5px] leading-relaxed text-faint">Name it. Claude proposes a stack and waits for your OK. The dev server starts on its own, then one click creates the GitHub repository and the Vercel project.</p>
          </div>
          <ol className="m-0 grid min-w-0 flex-[2_1_520px] list-none gap-2 p-0 [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
            {[
              ['01', 'Folder + git init', '#6e6e77'],
              ['02', 'Stack chosen with Claude', CLAY],
              ['03', 'Dev server, on devices', '#8ab4f8'],
              ['04', 'GitHub + Vercel', '#7dd3a8'],
            ].map(([n, label, c], i) => (
              <motion.li
                key={n}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 + i * 0.12 }}
                className="flex flex-col gap-2 rounded-xl border border-line-soft bg-[#0f0f12] p-3.5"
              >
                <span className="font-mono text-[11px]" style={{ color: c }}>
                  {n}
                </span>
                <span className="text-[13.5px]">{label}</span>
              </motion.li>
            ))}
          </ol>
        </Card>
      </Reveal>
      <Reveal className="mt-4">
        <Journeys />
      </Reveal>
    </section>
  );
}

/** An artifact Claude published, live in Kinglet: its switch flips, the price follows, "Point" picks the button. */
function Artifacts() {
  const loop = { duration: 6, repeat: Infinity, ease: 'easeInOut' as const, times: [0, 0.3, 0.36, 0.9, 1] };
  return (
    <Card className="flex flex-wrap items-center gap-7 p-7">
      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-2.5">
        <Tag color="#f0a07f">Artifacts, live</Tag>
        <h3 className="m-0 text-2xl font-semibold tracking-[-0.03em]">Claude publishes an artifact. It opens in Kinglet.</h3>
        <p className="m-0 text-[14.5px] leading-relaxed text-faint">
          A mock-up, a page, a diagram: shown the moment Claude publishes it, scripts running and buttons working. Put it on every device in one click, or point at an element and tell Claude what to change.
        </p>
      </div>
      <div aria-hidden="true" className="min-w-0 flex-[2_1_520px] overflow-hidden rounded-xl border border-line-soft bg-[#0a0a0c]">
        <div className="flex h-8 items-center gap-2 border-b border-line-soft px-3 font-mono text-[11px] text-faint">
          <span className="size-2 rounded-full bg-line-strong" />
          pricing.html
          <span className="ml-auto flex items-center gap-1.5 text-[#f0a07f]">
            <span className="claude-dot size-1.5 rounded-full bg-[#d97757]" />
            Artifact · v2
          </span>
        </div>
        <div className="flex flex-col items-center gap-3 bg-[#f6f5f0] px-4 py-5 text-[#11241c]">
          <span className="text-[19px] font-semibold tracking-[-0.03em]">A plan for every budget.</span>
          <span className="relative flex rounded-full bg-[#e8e5dc] p-[3px] text-[11px] font-medium">
            <motion.span className="absolute top-[3px] bottom-[3px] left-[3px] w-[64px] rounded-full bg-white shadow-sm" animate={{ x: [0, 0, 64, 64, 0] }} transition={loop} />
            <span className="relative w-[64px] py-1 text-center">Monthly</span>
            <span className="relative w-[64px] py-1 text-center">Annual</span>
          </span>
          <div className="flex flex-wrap justify-center gap-2.5">
            <div className="flex w-[124px] flex-col gap-1 rounded-lg border border-[#e3e1d8] bg-white p-3">
              <span className="text-[11px] font-semibold">Solo</span>
              <span className="text-[17px] font-semibold">Free</span>
            </div>
            <div className="relative flex w-[124px] flex-col gap-1 rounded-lg bg-[#11241c] p-3 text-[#f6f5f0]">
              <span className="text-[11px] font-semibold">Duo</span>
              <span className="relative h-[22px] text-[17px] font-semibold">
                <motion.span className="absolute" animate={{ opacity: [1, 1, 0, 0, 1] }} transition={loop}>
                  $4
                </motion.span>
                <motion.span className="absolute" animate={{ opacity: [0, 0, 1, 1, 0] }} transition={loop}>
                  $3.20
                </motion.span>
              </span>
              <motion.span
                className="mt-1 rounded-md bg-[#a6f0c6] py-1 text-center text-[10.5px] font-semibold text-[#11241c]"
                animate={{ boxShadow: ['0 0 0 0 rgba(91,141,239,0)', '0 0 0 0 rgba(91,141,239,0)', '0 0 0 0 rgba(91,141,239,0)', '0 0 0 3px rgba(91,141,239,1)', '0 0 0 0 rgba(91,141,239,0)'] }}
                transition={{ ...loop, times: [0, 0.5, 0.6, 0.85, 1] }}
              >
                Choose Duo
              </motion.span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-line-soft px-3 py-2 text-[11.5px]">
          <span className="flex h-6 items-center gap-1 rounded-md border border-line px-2 text-muted">
            <Icon name="devices" size={12} />
            On the devices
          </span>
          <span className="flex h-6 items-center gap-1 rounded-md border border-local/60 px-2 text-local">
            <Icon name="target" size={12} />
            Point
          </span>
          <span className="ml-auto h-6 rounded-md border border-[rgba(217,119,87,0.35)] px-2 leading-6 font-semibold text-clay">Ask Claude</span>
        </div>
      </div>
    </Card>
  );
}

const JOURNEY: [string, string][] = [
  ['Open', '/pricing'],
  ['Click', '“Start free trial”'],
  ['Type', 'jessica@studio.co'],
  ['Check', '“I agree to the terms”'],
  ['Press', 'Enter'],
  ['Arrive on', '/welcome'],
];
const JOURNEY_DEVICES: [string, number | null][] = [
  ['iPhone 16', null],
  ['Pixel 9', 3],
  ['Laptop', null],
];

/** A recorded journey played on three devices: one breaks at the checkbox, hidden under a banner. */
function Journeys() {
  const tick = 0.32;
  return (
    <Card className="flex flex-wrap items-center gap-7 p-7">
      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-2.5">
        <Tag color="#c6f432">Recorded journeys</Tag>
        <h3 className="m-0 text-2xl font-semibold tracking-[-0.03em]">Do it once. Replay it everywhere.</h3>
        <p className="m-0 text-[14.5px] leading-relaxed text-faint">
          Record a sign-up or a checkout on one device: clicks, typing, the pages it leads to. Kinglet replays it on every device at once, then after each Claude task, commit and deploy, and tells you the step that broke, with a capture.
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11.5px] text-muted">
          <span className="rounded-md border border-line-soft bg-[#0f0f12] px-2 py-1">→ signup.spec.ts</span>
          <span className="text-ghost">exported as a Playwright test</span>
        </div>
      </div>
      <div className="grid min-w-0 flex-[2_1_520px] gap-2 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        {JOURNEY_DEVICES.map(([device, breaksAt], col) => (
          <div key={device} className="flex flex-col gap-1.5 rounded-xl border border-line-soft bg-[#0f0f12] p-3">
            <span className="flex items-center justify-between font-mono text-[11px] text-ghost">
              {device}
              <motion.span
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 + (breaksAt ?? JOURNEY.length) * tick + col * 0.05 }}
                className={breaksAt == null ? 'text-ok' : 'text-err'}
              >
                {breaksAt == null ? '✓ passed' : `✕ step ${breaksAt + 1}`}
              </motion.span>
            </span>
            {JOURNEY.map(([verb, what], i) => {
              const bad = breaksAt === i;
              const skipped = breaksAt != null && i > breaksAt;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0.25 }}
                  whileInView={{ opacity: skipped ? 0.25 : 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * tick + col * 0.05, duration: 0.2 }}
                  className="flex min-w-0 items-baseline gap-1.5 text-[12px]"
                >
                  <span className={`w-3 shrink-0 font-mono text-[10.5px] ${bad ? 'text-err' : skipped ? 'text-ghost' : 'text-ok'}`}>{bad ? '✕' : skipped ? '·' : '✓'}</span>
                  <span className={`truncate ${bad ? 'text-err' : 'text-muted'}`}>
                    <span className="text-fg">{verb}</span> {what}
                  </span>
                </motion.div>
              );
            })}
            {breaksAt != null && (
              <motion.span
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 + breaksAt * tick + col * 0.05 }}
                className="mt-1 truncate rounded-md bg-err/10 px-2 py-1 font-mono text-[10.5px] text-err"
              >
                under the cookie banner
              </motion.span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ───────────── 02 · Device lab ───────────── */

export function DeviceLab() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 pt-36 sm:px-6">
      <SectionHead id="lab" n="02" eyebrow="Device lab" title="A device lab" dim="on your desk.">
        Real emulation through Chromium’s DevTools protocol: width, density, touch and user agent. Every tool applies to every device at once, so a test takes seconds, not a session.
      </SectionHead>
      <div className="mt-12 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))]">
        {LAB.map((t, i) => (
          <LabTile key={t.title} {...t} index={i} />
        ))}
      </div>
    </section>
  );
}

/* ───────────── 03 · Vercel & GitHub ───────────── */

function DeployRow({ dot, branch, pr, status, checks, lcp, pulse }: { dot: string; branch: ReactNode; pr: ReactNode; status: ReactNode; checks: string; lcp: ReactNode; pulse?: boolean }) {
  return (
    <div className="grid items-center gap-3 border-t border-line-soft px-4 py-3 text-[13px] [grid-template-columns:2fr_1.2fr_1fr_0.8fr_0.8fr]">
      <span className="flex min-w-0 items-center gap-2 truncate">
        <span className={`size-[7px] shrink-0 rounded-full ${pulse ? 'blink' : ''}`} style={{ background: dot }} />
        {branch}
      </span>
      <span className="truncate">{pr}</span>
      <span className="font-mono text-[11.5px]">{status}</span>
      <span className="font-mono text-xs">{checks}</span>
      <span className="font-mono text-xs">{lcp}</span>
    </div>
  );
}

export function Ship() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 pt-36 sm:px-6">
      <SectionHead id="ship" n="03" eyebrow="Vercel & GitHub" title="Local, preview, prod." dim="One click apart.">
        Connect Vercel and GitHub once. Every branch, preview, pull request and production deploy shows up where you are already looking.
      </SectionHead>
      <div className="mt-12 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        <Reveal className="md:col-span-2">
          <Card className="flex flex-col gap-4 p-7">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <h3 className="m-0 text-xl font-semibold tracking-[-0.03em]">Deployments, live</h3>
              <span className="font-mono text-[11px] text-ghost">refreshed every 30 s · measured on a phone</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-line-soft">
              <div className="min-w-[560px]">
                <div className="grid gap-3 bg-[#0f0f12] px-4 py-2.5 font-mono text-[11px] tracking-[0.04em] text-ghost [grid-template-columns:2fr_1.2fr_1fr_0.8fr_0.8fr]">
                  <span>BRANCH</span>
                  <span>PULL REQUEST</span>
                  <span>STATUS</span>
                  <span>CHECKS</span>
                  <span>LCP</span>
                </div>
                <DeployRow dot="#7dd3a8" branch={<>main <span className="text-ghost">→ saltmint.app</span></>} pr={<span className="text-ghost">—</span>} status={<span className="text-ok">Live</span>} checks="53/53" lcp="1.1 s" />
                <DeployRow dot="#e6c07b" branch="feat/budgets" pr={<>#128 <span className="text-ok">✓ CI</span></>} status={<span className="text-ok">Ready</span>} checks="53/53" lcp="1.2 s" />
                <DeployRow dot="#e6c07b" pulse branch="fix/nav-contrast" pr={<>#131 <span className="text-warn">● CI</span></>} status={<span className="text-warn">Building</span>} checks="—" lcp="—" />
                <DeployRow dot="#f28b82" branch="exp/onboarding" pr={<>#126 <span className="text-err">✕ CI</span></>} status={<span className="text-err">Error</span>} checks="—" lcp={<span className="text-clay">Ask Claude</span>} />
              </div>
            </div>
          </Card>
        </Reveal>
        <Reveal>
          <Card className="flex h-full flex-col gap-3 p-7">
            <h3 className="m-0 text-xl font-semibold tracking-[-0.03em]">Compare environments</h3>
            <p className="m-0 text-sm leading-relaxed text-faint">Tags and check scores side by side. The visual tab shows changed pixels in red, with LCP, CLS and TTFB for each.</p>
            <div className="mt-auto flex gap-2">
              {(['Local', 'Prod'] as const).map((env) => (
                <div key={env} className="flex h-[110px] flex-1 flex-col gap-1.5 rounded-lg bg-[#f6f5f0] p-2.5 text-[#11241c]">
                  <span className="text-[13px] font-semibold tracking-[-0.03em]">Money, finally calm.</span>
                  <span className={`h-3.5 w-[60px] rounded-full bg-[#11241c] ${env === 'Prod' ? 'outline-2 outline-offset-2 outline-[#ef4444]' : ''}`} />
                  <span className={`mt-auto font-mono text-[9px] ${env === 'Local' ? 'text-[#2563eb]' : 'text-[#16a34a]'}`}>● {env}</span>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
        <Reveal delay={0.05}>
          <Card className="flex h-full flex-col gap-3 p-7">
            <h3 className="m-0 text-xl font-semibold tracking-[-0.03em]">Every deploy, measured</h3>
            <p className="m-0 text-sm leading-relaxed text-faint">Each Ready deploy, each local commit and each finished Claude task is measured: score, LCP, CLS, weight, requests.</p>
            <svg viewBox="0 0 220 60" preserveAspectRatio="none" className="mt-auto h-[70px] w-full" aria-hidden="true">
              <path d="M0 46 L30 42 L60 44 L90 34 L120 36 L150 26 L180 28 L220 14 L220 60 L0 60Z" fill="rgba(125,211,168,.08)" />
              <motion.polyline
                points="0,46 30,42 60,44 90,34 120,36 150,26 180,28 220,14"
                fill="none"
                stroke="#7dd3a8"
                strokeWidth="2"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.4, ease: 'easeOut' }}
              />
            </svg>
          </Card>
        </Reveal>
        <Reveal delay={0.1}>
          <Card className="flex h-full flex-col gap-3 p-7">
            <h3 className="m-0 text-xl font-semibold tracking-[-0.03em]">Pull requests and protected previews</h3>
            <p className="m-0 text-sm leading-relaxed text-faint">The PR of each branch with its state and CI. Protected previews open on every device and on your phone, without a login wall.</p>
            <span className="mt-auto flex items-center gap-2 rounded-lg border border-line-soft bg-[#0f0f12] px-2.5 py-2 font-mono text-[11.5px] text-muted">
              <Icon name="git" size={13} className="text-[#a78bfa]" />
              #128 feat/budgets <Dot className="bg-ok" /> CI passed
            </span>
          </Card>
        </Reveal>
        <Reveal delay={0.15}>
          <Card className="flex h-full flex-col gap-3 p-7">
            <h3 className="m-0 text-xl font-semibold tracking-[-0.03em]">Production, and the ones before</h3>
            <p className="m-0 text-sm leading-relaxed text-faint">The live prod first, then earlier productions. Open an old one on its Vercel address to see what changed, one click back to the live one.</p>
            <div className="mt-auto flex flex-col gap-1.5 font-mono text-[11.5px]">
              <span className="flex items-center gap-2 rounded-lg bg-[rgba(125,211,168,0.07)] px-2.5 py-2 text-fg shadow-[inset_0_0_0_1px_rgba(125,211,168,0.3)]">
                saltmint.app <span className="rounded-full bg-[rgba(125,211,168,0.16)] px-1.5 text-[10px] text-prod">LIVE</span>
              </span>
              <span className="px-2.5 py-1 text-faint">a3f9c12 · yesterday</span>
              <span className="px-2.5 py-1 text-faint">7be04d1 · 3 days ago</span>
            </div>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────── 04 · Checks & audits ───────────── */

const FAMILIES: [string, number, number][] = [
  ['SEO', 10, 10],
  ['Share', 5, 6],
  ['Content', 5, 6],
  ['Mobile', 10, 10],
  ['Accessibility', 2, 3],
  ['Privacy', 3, 4],
  ['Technical', 13, 14],
];

/** Shown, not written: the landing page itself must pass the content checks. */
const LEFTOVERS: [string, string, string][] = [
  ['Filler text', 'hero · pricing', 'text-err'],
  ['Made-up phone number', 'footer', 'text-warn'],
  ['Link to “#”', '“Learn more” ×3', 'text-warn'],
  ['Placeholder photos', '/about', 'text-warn'],
  ['Copyright year', 'stuck on an old year', 'text-warn'],
];

const SPEED: [string, string, number, string][] = [
  ['Tap response (INP)', '340 ms', 68, '#e6c07b'],
  ['Main thread blocked', '720 ms', 90, '#f28b82'],
  ['JavaScript', '640 KB', 74, '#e6c07b'],
  ['Unused CSS', '85 %', 85, '#e6c07b'],
  ['Render-blocking', '1 script', 30, '#7dd3a8'],
];

export function Checks() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 pt-36 sm:px-6">
      <SectionHead id="checks" n="04" eyebrow="Checks & audits" title="53 checks." dim="On every render.">
        Measured inside the devices, on the rendered page. Each problem comes with the fix for your framework and a prompt ready for Claude.
      </SectionHead>
      <div className="mt-12 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        <Reveal>
          <Card className="flex h-full flex-col gap-4 p-7">
            <div className="flex items-baseline gap-2.5">
              <span className="text-[56px] font-semibold tracking-[-0.05em]">48</span>
              <span className="text-[22px] text-ghost">/ 53</span>
            </div>
            <div className="flex flex-col gap-3 text-[13px]">
              {FAMILIES.map(([name, ok, total], i) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-24 text-muted">{name}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft">
                    <motion.span
                      className="block h-full origin-left rounded-full"
                      style={{ background: ok === total ? '#7dd3a8' : '#e6c07b', width: `${(ok / total) * 100}%` }}
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: 0.1 + i * 0.08, ease: [0.2, 0.8, 0.2, 1] }}
                    />
                  </span>
                  <span className="font-mono text-[11px] text-ghost">
                    {ok}/{total}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
        <Reveal delay={0.05}>
          <Card className="flex h-full flex-col gap-3.5 p-7">
            <h3 className="m-0 text-xl font-semibold tracking-[-0.03em]">Whole-site audit</h3>
            <p className="m-0 text-sm leading-relaxed text-faint">Up to 300 pages from the links, the sitemap and the rendered page, read like Google. Links to other sites are checked too.</p>
            <div className="mt-auto flex flex-col font-mono text-xs">
              {[
                ['Broken internal links', '3', 'text-err'],
                ['Broken external links', '2', 'text-err'],
                ['Dead anchors', '1', 'text-warn'],
                ['Duplicate titles', '2', 'text-warn'],
                ['hreflang · sitemap', 'ok', 'text-ok'],
              ].map(([a, b, c], i) => (
                <div key={a} className={`flex justify-between py-2 ${i < 4 ? 'border-b border-line-soft' : ''}`}>
                  <span className={c}>{a}</span>
                  <span className="text-muted">{b}</span>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
        <Reveal delay={0.1}>
          <Card className="flex h-full flex-col gap-3.5 p-7">
            <h3 className="m-0 text-xl font-semibold tracking-[-0.03em]">Open Graph previews on 10 platforms</h3>
            <p className="m-0 text-sm leading-relaxed text-faint">WhatsApp, iMessage, Slack, Discord, Telegram, LinkedIn, X, Facebook, Bluesky and Google, each read by its own bot, without JavaScript. No share image? Kinglet makes a 1200×630 one from the page and saves it in your project.</p>
            <div className="mt-auto flex justify-end rounded-xl bg-[#0b141a] p-3.5">
              <div className="w-[230px] overflow-hidden rounded-[10px] bg-[#005c4b] text-[#e9edef]">
                <div className="flex h-[90px] items-center bg-[#f6f5f0] px-3 text-[17px] font-semibold tracking-[-0.04em] text-[#11241c]">Money, finally calm.</div>
                <div className="flex flex-col gap-0.5 px-2.5 py-2 text-[11px]">
                  <strong>Saltmint — Money, finally calm</strong>
                  <span className="opacity-65">saltmint.app</span>
                </div>
              </div>
            </div>
          </Card>
        </Reveal>
      </div>
      <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        <Reveal>
          <Card className="flex h-full flex-col gap-3.5 p-7">
            <Tag color="#c6f432">Content</Tag>
            <h3 className="m-0 text-xl font-semibold tracking-[-0.03em]">What the AI left behind</h3>
            <p className="m-0 text-sm leading-relaxed text-faint">Filler text, made-up phone numbers and e-mails, links to nowhere, placeholder photos, last year’s copyright, no legal pages. Found on every page before your visitors do.</p>
            <div className="mt-auto flex flex-col font-mono text-xs">
              {LEFTOVERS.map(([what, where, tone], i) => (
                <div key={what} className={`flex justify-between gap-3 py-2 ${i < LEFTOVERS.length - 1 ? 'border-b border-line-soft' : ''}`}>
                  <span className={tone}>{what}</span>
                  <span className="truncate text-muted">{where}</span>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
        <Reveal delay={0.05}>
          <Card className="flex h-full flex-col gap-3.5 p-7">
            <Tag color="#a78bfa">Privacy · GDPR</Tag>
            <h3 className="m-0 text-xl font-semibold tracking-[-0.03em]">Before anyone clicks “Accept”</h3>
            <p className="m-0 text-sm leading-relaxed text-faint">A first visit in a clean browser, nothing clicked: the trackers that already load, the cookies already set, a consent banner with a real “Reject” button, and fonts or videos that send the IP elsewhere.</p>
            <div className="mt-auto flex flex-col gap-1.5 rounded-xl border border-line-soft bg-[#0a0a0c] px-3.5 py-3 font-mono text-[11.5px] leading-[1.7]">
              <span className="truncate text-err">✕ Meta Pixel, Analytics load first</span>
              <span className="truncate text-err">✕ _ga, _fbp set without consent</span>
              <span className="truncate text-warn">! Banner: no “Reject” next to “Accept”</span>
              <span className="truncate text-warn">! Google Fonts: host them with the site</span>
            </div>
          </Card>
        </Reveal>
        <Reveal delay={0.1}>
          <Card className="flex h-full flex-col gap-3.5 p-7">
            <Tag color="#53bdeb">Speed</Tag>
            <h3 className="m-0 text-xl font-semibold tracking-[-0.03em]">What slows it down</h3>
            <p className="m-0 text-sm leading-relaxed text-faint">Beyond LCP and CLS: how fast a tap answers (INP), how long the page freezes, what holds the first paint, JavaScript weight, unused CSS and fonts that hide the text.</p>
            <div className="mt-auto flex flex-col gap-2.5 text-[12.5px]">
              {SPEED.map(([label, value, pct, color], i) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-[118px] shrink-0 text-muted max-[400px]:w-[100px]">{label}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft">
                    <motion.span
                      className="block h-full origin-left rounded-full"
                      style={{ background: color, width: `${pct}%` }}
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: 0.1 + i * 0.08, ease: [0.2, 0.8, 0.2, 1] }}
                    />
                  </span>
                  <span className="w-[60px] shrink-0 text-right font-mono text-[11px] whitespace-nowrap text-ghost">{value}</span>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      </div>
      <Reveal className="mt-4">
        <div className="flex flex-wrap gap-2">
          {['title & description', 'canonical', 'JSON-LD', 'hreflang', 'robots & sitemap', 'og:image 1200×630', 'twitter:card', 'viewport', 'horizontal overflow', 'tap targets', 'text zoom', 'form keyboards', 'axe-core', 'visible focus', 'keyboard path', 'contrast', 'filler text', 'fake contact details', 'placeholder links', 'legal pages', 'trackers before consent', 'consent banner', 'third-party fonts & videos', 'JS errors', 'image weight', 'LCP', 'CLS', 'INP', 'render-blocking', 'JavaScript weight', 'unused CSS', 'font-display', 'external links', 'performance budgets'].map((c) => (
            <span key={c} className="inline-flex h-[26px] items-center rounded-[7px] border border-line bg-[#111114] px-2.5 text-xs whitespace-nowrap text-muted">
              {c}
            </span>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* ───────────── 05 · MCP ───────────── */

/* ───────────── 05 · Security ───────────── */

const FINDINGS: [string, string, string, string][] = [
  ['✕', 'text-err', 'Stripe secret key', 'sk_live_51Hx…9xQa in /assets/index-4f2a.js'],
  ['✕', 'text-err', '/.env reachable', 'OPENAI_API_KEY, DATABASE_URL… readable by anyone'],
  ['✕', 'text-err', 'Session cookie', 'sb-access-token readable by JavaScript (no HttpOnly)'],
  ['!', 'text-warn', 'Content-Security-Policy', 'missing: injected scripts can run anywhere'],
  ['!', 'text-warn', 'Source maps', '3 .map files public: your whole source, comments included'],
  ['✓', 'text-ok', 'HTTPS · HSTS · mixed content', 'all good'],
];

export function Security() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 pt-36 sm:px-6">
      <SectionHead id="security" n="05" eyebrow="Security" title="Leaked keys, open files." dim="Caught before anyone else.">
        Sites built fast with AI leak secrets. Kinglet reads your site the way a visitor’s browser gets it, every script included, and tells you what anyone could grab. Then Claude fixes it.
      </SectionHead>
      <div className="mt-12 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        <Reveal className="md:col-span-2">
          <Card className="flex h-full flex-col gap-4 p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="m-0 flex items-center gap-2.5 text-xl font-semibold tracking-[-0.03em]">
                <Icon name="shield" size={18} />
                Security · saltmint.app
              </h3>
              <span className="font-mono text-[13px]">
                <span className="text-err">3 problems</span> <span className="text-ghost">· 2 to improve · 9/14</span>
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-line-soft">
              <div className="min-w-[520px]">
                {FINDINGS.map(([mark, tone, what, detail], i) => (
                  <motion.div
                    key={what}
                    initial={{ opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
                    className={`grid items-baseline gap-3 px-4 py-2.5 text-[13px] [grid-template-columns:18px_200px_1fr] ${i ? 'border-t border-line-soft' : ''}`}
                  >
                    <span className={`font-mono ${tone}`}>{mark}</span>
                    <span className="font-medium">{what}</span>
                    <span className="truncate font-mono text-xs text-faint">{detail}</span>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-[linear-gradient(100deg,#f0a07f,#e6c07b)] px-3 py-1.5 text-[13px] font-semibold text-[#1a120b]">Ask Claude to fix it all</span>
              <span className="font-mono text-xs text-ghost">or /mcp__kinglet__fix_security in your terminal</span>
            </div>
          </Card>
        </Reveal>
        {(
          [
            ['Keys in your JavaScript', 'Stripe, OpenAI, Anthropic, AWS, GitHub, Slack, Resend, Supabase service_role, private keys: found in the HTML and every script, shown shortened. Publishable keys stay quiet.'],
            ['Files left open', '.env, .git, .npmrc, database dumps and public source maps. Only tried on your own sites.'],
            ['Headers and cookies', 'CSP, HSTS, framing, nosniff, referrer and permissions, plus Secure, HttpOnly and SameSite. The fix comes ready for Next.js, Nuxt, SvelteKit or vercel.json.'],
            ['Watched on every deploy', 'HTTPS, mixed content, insecure forms and third-party scripts without integrity. A header that disappears on a new Vercel deploy sends you a notification.'],
          ] as const
        ).map(([title, text], i) => (
          <Reveal key={title} delay={0.05 * (i + 1)}>
            <Card className="flex h-full flex-col gap-3 p-7">
              <h3 className="m-0 text-lg font-semibold tracking-[-0.03em]">{title}</h3>
              <p className="m-0 text-sm leading-relaxed text-faint">{text}</p>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function Mcp() {
  const tools = ['status', 'open_url', 'set_devices', 'screenshot', 'get_page_meta', 'get_share_preview', 'run_checks', 'run_security', 'audit_site', 'get_accessibility', 'get_structured_data', 'list_pages', 'list_deployments', 'get_console'];
  return (
    <section id="mcp" className="mx-auto max-w-[1200px] px-4 pt-36 sm:px-6">
      <Reveal>
        <Card className="flex flex-wrap items-center gap-10 p-[clamp(24px,5vw,56px)]">
          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
            <span className="inline-flex items-center gap-2.5 font-mono text-xs tracking-[0.08em] text-faint uppercase">
              <b className="rounded-md border border-[#2a2a30] px-1.5 font-medium text-fg">06</b>MCP server
            </span>
            <h2 className="m-0 text-[clamp(30px,4vw,48px)] leading-[1.02] font-semibold tracking-[-0.05em]">Your terminal Claude gets eyes too.</h2>
            <p className="m-0 text-base leading-relaxed text-muted">14 tools and 6 slash commands for Claude Code. It screenshots devices, runs checks and security, audits the site and verifies its own fix. Works with the app closed, on any URL.</p>
            <div className="flex flex-wrap gap-1.5">
              {['fix_open_graph', 'fix_checks', 'fix_security', 'fix_console', 'fix_site', 'fix_accessibility'].map((c) => (
                <span key={c} className="inline-flex h-[26px] items-center rounded-[7px] border border-line bg-[#111114] px-2.5 font-mono text-xs text-muted">
                  /{c}
                </span>
              ))}
            </div>
          </div>
          <div className="min-w-0 flex-[1_1_460px] overflow-hidden rounded-[14px] border border-[#1e1e23] bg-ink font-mono text-[12.5px] leading-[1.95]">
            <div className="flex h-[34px] items-center gap-1.5 border-b border-line-soft px-3.5 text-[11px] text-ghost">
              <span className="size-[9px] rounded-full bg-[#26262c]" />
              <span className="size-[9px] rounded-full bg-[#26262c]" />
              <span className="size-[9px] rounded-full bg-[#26262c]" />
              <span className="ml-2">claude — ~/dev/saltmint</span>
            </div>
            <motion.div
              className="p-4 text-muted"
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-60px' }}
              variants={{ show: { transition: { staggerChildren: 0.35 } } }}
            >
              {[
                <span className="text-fg">&gt; /mcp__kinglet__fix_site</span>,
                <>
                  <span className="text-clay">●</span> kinglet - audit_site <span className="text-ghost">⎿ 148 pages · 3 broken links · 2 duplicate titles</span>
                </>,
                <>
                  <span className="text-ok">●</span> Update(app/journal/[slug]/page.tsx) <span className="text-ok">+8 −3</span>
                </>,
                <>
                  <span className="text-ok">●</span> Update(app/sitemap.ts) <span className="text-ok">+2</span>
                </>,
                <>
                  <span className="text-clay">●</span> kinglet - audit_site <span className="text-ok">⎿ 0 issues</span>
                </>,
                <span className="text-fg">● All 148 pages are clean: 3 links and 2 titles fixed.</span>,
              ].map((line, i) => (
                <motion.div key={i} className="truncate" variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }}>
                  {line}
                </motion.div>
              ))}
            </motion.div>
          </div>
          <div className="flex basis-full flex-wrap gap-1.5">
            {tools.map((t) => (
              <span key={t} className="rounded-md border border-line-soft bg-[#0f0f12] px-2 py-1 font-mono text-[11.5px] text-faint">
                {t}
              </span>
            ))}
          </div>
          <code className="basis-full overflow-x-auto rounded-lg border border-line-soft bg-[#0f0f12] px-3.5 py-2.5 font-mono text-[12.5px] whitespace-nowrap text-muted">
            <span className="text-ghost">$ </span>
            {MCP_COMMAND}
          </code>
        </Card>
      </Reveal>
    </section>
  );
}
