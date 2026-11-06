/**
 * The Kinglet window, rebuilt for the website with the app's own icons, tokens and class names
 * (TitleBar, EnvSwitch, Rail, DeviceToolbar, Stage, InspectBar, Console, Checks, SharePage, PhoneDialog, ClaudePanel,
 * StatusBar in apps/desktop/src/renderer). It is a static replica driven by the hero's scripted scenes.
 * Elements the demo cursor goes to carry data-target="…".
 */
import { AnimatePresence, motion } from 'motion/react';
import { forwardRef, type ReactNode } from 'react';
import { Dot, Icon, type IconName, Mark } from '../../../desktop/src/renderer/components/Icons';
import { CLAUDE, type DemoState, type Env } from './scenes';
import { ShareImage, SiteDesktop, SitePhone } from './Saltmint';

const PHONE = { w: 393, h: 852, radius: 36, pad: 6 };
const LAPTOP = { w: 1280, h: 800, pad: 8 };
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const URL: Record<Env, string> = { local: 'http://localhost:3000/', preview: 'https://saltmint-git-feat-budgets.vercel.app/', prod: 'https://saltmint.app/' };

const fade = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 4 }, transition: { duration: 0.25 } };
const pop = { initial: { opacity: 0, y: -6, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.2 } };

/** One scale for every device, as in the app (lib/layout.ts); it shrinks when a drawer or a panel takes room. */
function scaleOf(s: DemoState) {
  if (s.consoleOpen) return 0.28;
  if (s.checksOpen) return 0.27;
  if (s.picked) return 0.35;
  if (s.emuMenu || s.journeysOpen) return 0.25;
  return 0.43;
}

function claudeStatus(s: DemoState): 'idle' | 'working' | 'done' {
  const n = CLAUDE[s.scene]?.lines.length ?? 0;
  if (!s.sent) return 'idle';
  return s.shown < n ? 'working' : 'done';
}

function errorsOf(s: DemoState) {
  return s.scene === 'console' && !s.fixed ? { phone: 2, laptop: 1 } : { phone: 0, laptop: 0 };
}

function TitleBar({ s }: { s: DemoState }) {
  const st = claudeStatus(s);
  const status = st === 'working' ? { color: '#d97757', label: 'working', pulse: true } : st === 'done' ? { color: '#7dd3a8', label: 'to review' } : undefined;
  return (
    <div className="flex h-[42px] shrink-0 items-stretch border-b border-line-soft bg-chrome">
      <span className="flex w-14 shrink-0 items-center justify-center border-r border-line-soft">
        <Mark />
      </span>
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        <Tab name="saltmint" color="#a6f0c6" on status={status} />
        <Tab name="docs" color="#8ab4f8" status={{ color: '#e6c07b', label: 'building' }} />
        <Tab name="portfolio" color="#a78bfa" />
        <span className="flex w-[42px] shrink-0 items-center justify-center border-r border-line-soft text-lg leading-none text-faint">+</span>
      </div>
      <span className="flex shrink-0 items-center gap-2 border-x border-line-soft px-3.5 text-xs whitespace-nowrap text-muted">
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" stroke="currentColor" strokeWidth="1.8" fill="none" />
        </svg>
        All projects
        {st === 'working' && (
          <span className="flex items-center gap-1">
            <span className="claude-dot size-1.5 rounded-full bg-[#d97757]" />
            <span className="font-mono text-[11px]">1</span>
          </span>
        )}
      </span>
      <span className="flex w-[132px] shrink-0 items-center justify-around text-muted" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" /></svg>
        <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.2" /></svg>
      </span>
    </div>
  );
}

function Tab({ name, color, on, status }: { name: string; color: string; on?: boolean; status?: { color: string; label: string; pulse?: boolean } }) {
  return (
    <div className={`relative flex max-w-[236px] min-w-[120px] flex-1 items-center gap-2 border-r border-line-soft pr-3 pl-3 text-[12.5px] ${on ? 'bg-raised text-fg' : 'text-faint'}`}>
      <span className="flex size-4 shrink-0 items-center justify-center rounded-[5px]" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {status && (
        <span className="flex shrink-0 items-center gap-1.5 text-[11px]" style={{ color: status.color }}>
          <span className={`size-1.5 shrink-0 rounded-full ${status.pulse ? 'claude-dot' : ''}`} style={{ background: status.color }} />
          <span className="font-mono">{status.label}</span>
        </span>
      )}
    </div>
  );
}

function EnvBar({ s }: { s: DemoState }) {
  const seg = (id: Env, label: string, dot: string, extra?: ReactNode) => (
    <span
      data-target={`env-${id}`}
      className={`flex h-6 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors ${
        s.env === id || (id === 'preview' && s.envMenu) ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint'
      }`}
    >
      <Dot className={dot} />
      {label}
      {s.env === id && extra}
    </span>
  );
  return (
    <div className="relative z-30 flex h-[46px] shrink-0 items-center gap-2.5 border-b border-line-soft bg-card px-3">
      <div className="flex gap-0.5 rounded-lg border border-line bg-bg p-0.5">
        {seg('local', 'Local', 'bg-local')}
        {seg('preview', 'Preview', 'bg-preview', <span className="font-mono text-[10.5px] text-muted">feat/budgets</span>)}
        {seg('prod', 'Prod', 'bg-prod')}
      </div>
      <div className="flex h-[30px] min-w-[150px] flex-1 items-center gap-2 rounded-ui border border-line bg-bg pr-1 pl-2.5">
        <Dot className={s.env === 'preview' ? 'bg-preview' : s.env === 'prod' ? 'bg-prod' : 'bg-local'} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{URL[s.env]}</span>
        <span className="flex h-6 items-center gap-1.5 rounded-md px-1.5 text-[11.5px] whitespace-nowrap text-faint">
          Pages <span className="font-mono text-[10.5px] text-ghost">14</span>
          <Icon name="chevrons" size={11} />
        </span>
      </div>
      <AnimatePresence>
        {s.env === 'preview' && (
          <motion.span key="pr" {...fade} className="flex h-7 shrink-0 items-center gap-1.5 rounded-ui border border-line px-2 text-xs whitespace-nowrap text-muted">
            <Icon name="git" size={12} className="text-[#a78bfa]" />
            #128
            <Dot className="bg-ok" />
            <span className="font-mono text-[10.5px] text-ok">CI</span>
          </motion.span>
        )}
      </AnimatePresence>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-ui border border-line text-muted">
        <Icon name="reload" size={13} />
      </span>
      <span
        data-target="btn-phone"
        className={`flex size-7 shrink-0 items-center justify-center rounded-ui border text-muted ${s.phoneDialog ? 'border-line-strong bg-active text-fg' : 'border-line'}`}
      >
        <Icon name="phone" size={13} />
      </span>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-ui border border-line text-muted">
        <Icon name="search" size={13} />
      </span>
      <AnimatePresence>{s.envMenu && <DeployMenu hover={s.deployRow} />}</AnimatePresence>
    </div>
  );
}

function DeployMenu({ hover }: { hover: boolean }) {
  const row = (branch: string, pr: string | null, state: ReactNode, ago: string, target?: string, on?: boolean) => (
    <div data-target={target} className={`flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 transition-colors ${on ? 'bg-active' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-xs text-fg">{branch}</span>
          {pr && <span className="font-mono text-[10.5px] text-faint">{pr}</span>}
        </span>
        <span className="shrink-0 text-[11px] text-faint">{ago}</span>
      </div>
      <span className="flex items-center gap-2 text-xs text-muted">{state}</span>
    </div>
  );
  return (
    <motion.div key="menu" {...pop} className="absolute top-10 left-3 z-50 w-[400px] origin-top-left rounded-[10px] border border-line bg-card p-1 shadow-2xl shadow-black/60">
      <div className="flex items-baseline justify-between px-2.5 pt-2 pb-1.5">
        <span className="label">Previews</span>
        <span className="text-[11px] text-faint">Vercel · every 30 s</span>
      </div>
      {row('feat/budgets', '#128 ✓ CI', <><Dot className="bg-ok" /> Ready · checks 53/53 · LCP 1.2 s</>, 'just now', 'deploy-row', hover)}
      {row('fix/nav-contrast', '#131', <><span className="blink inline-block size-1.5 rounded-full bg-warn" /> Building…</>, '1 min')}
      {row('exp/onboarding', '#126 ✕ CI', <><Dot className="bg-err" /> <span className="text-err">Error</span> · <span className="text-[#d97757]">Ask Claude</span></>, '3 h')}
    </motion.div>
  );
}

/** The app's left rail (Sidebar.tsx): icons only, a marker on the active one, badges as pills. Claude is on the right. */
function Rail({ s }: { s: DemoState }) {
  const tone = { err: 'bg-err/15 text-err', warn: 'bg-warn/15 text-warn', ok: 'bg-ok/15 text-ok', clay: 'bg-[rgba(217,119,87,0.16)] text-[#d97757]' } as const;
  const button = (icon: IconName, on: boolean, target?: string, badge?: { n: number | string; tone: keyof typeof tone } | null) => (
    <span
      key={icon}
      data-target={target}
      className={`relative flex size-11 shrink-0 items-center justify-center rounded-[11px] transition-colors ${on ? 'bg-active text-fg shadow-[inset_0_0_0_1px_#26262b]' : 'text-faint'}`}
    >
      {on && <span className="absolute top-1/2 -left-[10px] h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-fg" />}
      <Icon name={icon} size={21} stroke={1.7} />
      {badge && (
        <span className={`absolute -top-[3px] -right-[3px] flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9.5px] leading-none font-semibold ring-2 ring-chrome ${tone[badge.tone]}`}>
          {badge.n}
        </span>
      )}
    </span>
  );
  const ogFixed = s.scene === 'share' && s.fixed;
  const checksFixed = s.scene === 'checks' && s.fixed;
  return (
    <nav aria-hidden="true" className="flex w-16 shrink-0 flex-col items-center gap-1.5 border-r border-line-soft bg-chrome py-2.5">
      {button('devices', s.section === 'devices' && !s.checksOpen)}
      {button('deploy', false)}
      {button('branch', false)}
      <span className="my-1 h-px w-7 shrink-0 bg-line" />
      {button('doc', false)}
      {button('graph', s.section === 'share', 'rail-og', ogFixed ? null : { n: 1, tone: 'err' })}
      {button('checkCircle', s.checksOpen, 'rail-checks', checksFixed ? { n: '✓', tone: 'ok' } : { n: 2, tone: 'warn' })}
      {button('split', false)}
      <span className="flex-1" />
      {button('settings', false)}
    </nav>
  );
}

function DeviceToolbar({ s }: { s: DemoState }) {
  const chip = (icon: IconName, label: string, w: number, on: boolean) => (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs whitespace-nowrap ${on ? 'bg-raised text-fg' : 'text-faint'}`}>
      <Icon name={icon} size={12} />
      {label}
      <span className={`font-mono text-[10.5px] ${on ? 'text-faint' : 'text-ghost'}`}>{w}</span>
    </span>
  );
  const iconButton = (icon: IconName, on: boolean, target: string | undefined, tone: 'plain' | 'ok' = 'plain', badge?: number) => (
    <span
      data-target={target}
      className={`relative flex size-8 shrink-0 items-center justify-center rounded-[7px] transition-colors ${on ? (tone === 'ok' ? 'bg-[rgba(125,211,168,0.12)] text-ok' : 'bg-raised text-fg') : 'text-muted'}`}
    >
      <Icon name={icon} size={15} />
      {badge ? <span className="absolute top-0.5 right-0 min-w-3.5 rounded-full bg-err px-1 font-mono text-[9px] leading-3.5 font-semibold text-bg">{badge}</span> : null}
    </span>
  );
  const errors = errorsOf(s);
  return (
    <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft bg-chrome px-4 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-0.5 rounded-[9px] border border-line bg-card p-[3px]">
        {chip('phone', 'iPhone 16', 393, true)}
        <span className="mx-0.5 h-4 w-px bg-line" />
        {chip('tablet', 'iPad Air', 820, false)}
        <span className="mx-0.5 h-4 w-px bg-line" />
        {chip('laptop', 'Laptop', 1280, true)}
      </div>
      <span className="h-5 w-px bg-line" />
      <div className="flex items-center gap-0.5">
        {iconButton('target', s.inspecting, 'btn-inspect')}
        {iconButton('terminal', s.consoleOpen, 'btn-console', 'plain', errors.phone + errors.laptop)}
        {iconButton('rotate', false, undefined)}
        {iconButton('link', true, undefined, 'ok')}
      </div>
      <span className="h-5 w-px bg-line" />
      <div className="ml-auto flex items-center gap-1">
        <span className="ml-1 inline-flex h-7 items-center rounded-md border border-line px-2 font-mono text-[11px] text-muted">{Math.round(scaleOf(s) * 100)} %</span>
      </div>
    </div>
  );
}

/** Emulation, Forms, Journeys, Export, Feedback: tabs on the edge of the devices, as in the app. */
function ToolTabs({ s }: { s: DemoState }) {
  const emuOn = s.slow || s.keyboard || s.tokyo;
  const tabs: [string, 'sliders' | 'form' | 'route' | 'download' | 'message', string, boolean, boolean, string?][] = [
    ['Emulation', 'sliders', '#8ab4f8', s.emuMenu, emuOn, 'btn-emu'],
    ['Forms', 'form', '#7dd3a8', false, false],
    ['Journeys', 'route', '#c6f432', s.journeysOpen, s.journeyStep >= 0 && !s.fixed, 'tab-journeys'],
    ['Export', 'download', '#e6c07b', false, false],
    ['Feedback', 'message', '#f0a07f', false, true],
  ];
  return (
    <nav aria-label="Tools" className="flex w-9 shrink-0 flex-col items-center gap-1 border-r border-line-soft bg-[#0b0b0b] pt-2.5">
      {tabs.map(([label, icon, accent, on, active, target]) => (
        <span
          key={label}
          data-target={target}
          className={`relative flex w-7 flex-col items-center gap-1.5 rounded-[6px] px-1 py-2.5 text-[11px] transition-colors ${on ? 'text-fg' : 'text-muted'}`}
          style={on ? { background: `${accent}1f`, boxShadow: `inset 0 0 0 1px ${accent}59` } : undefined}
        >
          <span style={{ color: on || active ? accent : undefined }}>
            <Icon name={icon} size={12} />
          </span>
          <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap">{label}</span>
          {active && <span className="absolute top-1 right-1 size-1.5 rounded-full" style={{ background: accent }} />}
        </span>
      ))}
    </nav>
  );
}

function EmulationPanel({ s }: { s: DemoState }) {
  const group = (label: string, items: [string, boolean, string?][]) => (
    <div className="flex flex-col gap-1.5 rounded-[9px] border border-line-soft bg-[#1a1a1b] p-2.5">
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-1">
        {items.map(([l, on, target]) => (
          <span key={l} data-target={target} className={`inline-flex h-6 items-center rounded-md px-2 text-[11px] transition-colors ${on ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint'}`}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 250, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative flex shrink-0 flex-col overflow-hidden border-r border-line-soft bg-[#131314]"
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,#8ab4f8_30%,#8ab4f8_70%,transparent)] opacity-70" />
      <div className="flex w-[250px] items-center gap-2.5 border-b border-line-soft px-3 py-2.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-[rgba(138,180,248,0.12)] text-local shadow-[inset_0_0_0_1px_rgba(138,180,248,0.25)]">
          <Icon name="sliders" size={13} />
        </span>
        <span className="flex flex-col">
          <span className="text-[12.5px] font-semibold">Emulation</span>
          <span className="flex items-center gap-1 text-[10.5px] text-faint">
            <span className="size-1.5 rounded-full bg-ok" />
            Live on 2 devices
          </span>
        </span>
      </div>
      <div className="flex w-[250px] flex-col gap-2 p-2.5">
        {group('Network', [['Full speed', !s.slow], ['4G', false], ['Slow 3G', s.slow, 'emu-slow'], ['Offline', false]])}
        {group('CPU', [['×1', !s.slow], ['×4 mid-range', s.slow], ['×6', false]])}
        {group('Keyboard', [['None', !s.keyboard], ['iOS', s.keyboard, 'emu-ios'], ['Android', false]])}
        {group('Region · iPhone 16', [['Computer’s', !s.tokyo], ['Tokyo · ja-JP', s.tokyo, 'emu-tokyo'], ['Berlin', false]])}
      </div>
    </motion.aside>
  );
}

function Device({ kind, s }: { kind: 'phone' | 'laptop'; s: DemoState }) {
  const d = kind === 'phone' ? PHONE : LAPTOP;
  const scale = scaleOf(s);
  const w = Math.round(d.w * scale);
  const h = Math.round(d.h * scale);
  const radius = kind === 'phone' ? Math.round(PHONE.radius * scale) : 0;
  const errors = errorsOf(s)[kind];
  const highlight = s.inspecting && (s.hover || s.picked);
  const line: ReactNode[] =
    kind === 'phone'
      ? ['iPhone 16 · 393 × 852', ...(s.tokyo ? [<span key="r" className="text-local">· Tokyo</span>] : []), s.slow ? '· Slow 3G · LCP 2.4 s' : '· LCP 0.9 s']
      : ['Laptop · 1280 × 800', '· LCP 0.6 s · CLS 0.00'];
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="bg-black shadow-[0_0_0_1px_#2e2e33,0_30px_60px_rgba(0,0,0,0.65)]" style={{ padding: d.pad, borderRadius: kind === 'laptop' ? 8 : radius + d.pad, transition: `border-radius .5s ${EASE}` }}>
        <div className="relative overflow-hidden bg-card" style={{ width: w, height: h, borderRadius: radius, transition: `width .5s ${EASE}, height .5s ${EASE}, border-radius .5s ${EASE}` }}>
          <div className="origin-top-left" style={{ width: d.w, height: d.h, transform: `scale(${scale})`, transition: `transform .5s ${EASE}` }}>
            {kind === 'phone' ? (
              <SitePhone inspect={highlight} keyboard={s.keyboard} keyboardFixed={s.keyboardFixed} accent={s.accent} banner={s.banner} />
            ) : (
              <SiteDesktop inspect={highlight} broken={s.scene === 'console' && !s.fixed} accent={s.accent} />
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-faint [&>*]:whitespace-nowrap" style={{ maxWidth: w + 140 }}>
        {line.map((l, i) => (typeof l === 'string' ? <span key={i}>{l}</span> : l))}
        {errors > 0 && <span className="flex items-center gap-1 rounded bg-[rgba(242,139,130,0.12)] px-1.5 py-px font-mono text-[10.5px] text-err">{errors} error{errors > 1 ? 's' : ''}</span>}
      </div>
    </div>
  );
}

function InspectBar({ accent }: { accent: boolean }) {
  const color = accent ? '#a6f0c6' : '#11241c';
  const rows = [
    ['iPhone 16', '349 × 48', '0 · 0 · 0 · 0', 'Geist 15 / 600', color],
    ['Laptop', '226 × 51', '0 · 14 · 0 · 0', 'Geist 15 / 600', color],
  ];
  return (
    <motion.section {...fade} className="flex shrink-0 flex-col border-t border-line-soft bg-chrome">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Icon name="target" size={13} className="shrink-0 text-local" />
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="font-mono text-xs text-fg">button</span>
          <span className="truncate text-xs text-muted">« Get started — free »</span>
          <span className="truncate font-mono text-[10.5px] text-ghost">main &gt; .hero &gt; .cta</span>
        </span>
        <span className="shrink-0 text-[11px] text-[#d97757]">kept · click again to release</span>
        <span data-target="ask-inspect" className="h-7 shrink-0 rounded-ui border border-[rgba(217,119,87,0.35)] bg-[rgba(217,119,87,0.08)] px-2.5 text-xs leading-7 font-semibold text-[#d97757]">
          Ask Claude
        </span>
      </div>
      <table className="w-full border-collapse border-t border-line-soft text-left text-[11.5px]">
        <thead>
          <tr className="label">
            {['Device', 'Size', 'Margins', 'Font', 'Color'].map((h) => (
              <th key={h} className="px-4 py-1.5 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-muted tabular-nums">
          {rows.map((r) => (
            <tr key={r[0]} className="border-t border-line-soft">
              <td className="px-4 py-1.5 font-sans whitespace-nowrap text-fg">{r[0]}</td>
              {r.slice(1).map((c, i) => (
                <td key={i} className="px-4 py-1.5 whitespace-nowrap">
                  {i === 3 && <span className="mr-1.5 inline-block size-2.5 rounded-sm align-[-1px]" style={{ background: c }} />}
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </motion.section>
  );
}

function ConsoleDrawer({ s }: { s: DemoState }) {
  const lines: [string, 'error' | 'log', string, string][] = s.fixed
    ? [
        ['Laptop', 'log', '[Fast Refresh] done in 88ms', ''],
        ['iPhone 16', 'log', '[Fast Refresh] done in 91ms', ''],
      ]
    : [
        ['iPhone 16', 'error', 'TypeError: Cannot read properties of undefined (reading ‘rate’)', 'lib/fx.ts:42'],
        ['iPhone 16', 'error', 'GET /api/rates?base=EUR · 500', '184 ms'],
        ['Laptop', 'error', 'Hydration failed: server rendered “May 1”, client “1 May”', 'BudgetCard.tsx'],
      ];
  const chip = (on: boolean) => `inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11.5px] whitespace-nowrap ${on ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint'}`;
  const e = errorsOf(s);
  return (
    <motion.div {...fade} className="flex h-[176px] shrink-0 flex-col border-t border-line-soft bg-chrome">
      <div className="flex items-center gap-1 border-b border-line-soft px-3 py-2">
        <span className={chip(true)}>All devices</span>
        <span className={chip(false)}>
          iPhone 16 {e.phone > 0 && <span className="font-mono text-[10.5px] text-err">{e.phone}</span>}
        </span>
        <span className={chip(false)}>
          Laptop {e.laptop > 0 && <span className="font-mono text-[10.5px] text-err">{e.laptop}</span>}
        </span>
        <span className="flex-1" />
        <span data-target="send-console" className="inline-flex h-6 items-center gap-1.5 rounded-md bg-fg px-2 text-[11.5px] font-semibold whitespace-nowrap text-bg">
          Send to Claude
        </span>
      </div>
      <ul className="m-0 list-none overflow-hidden p-0 font-mono text-[11.5px]">
        {lines.map(([dev, level, msg, where], i) => (
          <li key={msg} data-target={i === 0 ? 'console-row' : undefined} className={`flex gap-2 border-b border-line-soft px-3 py-1.5 transition-colors ${i === 0 && s.consoleRow && !s.fixed ? 'bg-active' : ''}`}>
            <span className={`mt-[5px] size-1.5 shrink-0 rounded-full ${level === 'error' ? 'bg-err' : 'bg-ghost'}`} />
            <span className={`min-w-0 flex-1 truncate ${level === 'error' ? 'text-err' : 'text-muted'}`}>{msg}</span>
            <span className="shrink-0 font-sans text-[11px] text-ghost">
              {dev}
              {where && ` · ${where}`}
            </span>
          </li>
        ))}
        {s.fixed && (
          <li className="flex items-center gap-2 px-3 py-3 font-sans text-xs text-faint">
            <Icon name="check" size={13} className="text-ok" />
            No errors on any device.
          </li>
        )}
      </ul>
    </motion.div>
  );
}

function ChecksPanel({ s }: { s: DemoState }) {
  const fixed = s.scene === 'checks' && s.fixed;
  const item = (label: string, detail: string, state: 'ok' | 'warn' | 'err', ask?: boolean) => (
    <div className="flex flex-col gap-1 border-b border-line-soft px-3.5 py-2.5">
      <span className="flex items-center gap-2 text-xs text-fg">
        <Dot className={state === 'ok' ? 'bg-ok' : state === 'warn' ? 'bg-warn' : 'bg-err'} />
        {label}
      </span>
      <span className="pl-3.5 text-[11px] leading-snug text-faint">{detail}</span>
      {ask && (
        <span data-target="ask-checks" className="mt-1 ml-3.5 self-start rounded-md border border-[rgba(217,119,87,0.35)] px-2 text-[11px] leading-6 font-medium text-[#d97757]">
          Ask Claude
        </span>
      )}
    </div>
  );
  return (
    <motion.aside initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.3 }} className="flex w-[270px] shrink-0 flex-col border-l border-line-soft bg-chrome">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line-soft px-3.5">
        <span className="text-[13px] font-semibold">Checks</span>
        <span className={`font-mono text-xs ${fixed ? 'text-ok' : 'text-warn'}`}>{fixed ? '53' : '51'} / 53</span>
      </div>
      <div className="flex gap-1 border-b border-line-soft px-3 py-2">
        {['All', 'SEO', 'Content', 'Privacy', 'Speed'].map((f, i) => (
          <span key={f} className={`inline-flex h-6 items-center rounded-md px-2 text-[11px] ${i === 0 ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint'}`}>
            {f}
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {fixed ? (
          <>
            {item('Tap targets', 'Every target is 24 × 24 px or more.', 'ok')}
            {item('Trackers before consent', 'None: Meta Pixel waits for “Accept”.', 'ok')}
          </>
        ) : (
          <>
            {item('Tap targets', 'iPhone 16: 3 links under 24 × 24 px in the nav.', 'err', true)}
            {item('Trackers before consent', 'Meta Pixel loads as soon as the page opens.', 'warn')}
          </>
        )}
        {item('Placeholder links', 'Every link goes somewhere.', 'ok')}
        {item('Responsiveness (INP)', '120 ms on iPhone 16.', 'ok')}
        {item('LCP', 'iPhone 16 0.9 s · Laptop 0.6 s', 'ok')}
      </div>
    </motion.aside>
  );
}

const JOURNEY_STEPS = ['Open /', 'Type “jessica@studio.co” in “Email”', 'Click “Get started — free”', 'Arrive on /welcome'];
/** The phone stops at this step (the cookie banner covers the button) until Claude fixes it. */
const PHONE_FAILS_AT = 2;

/** The Journeys panel: a recorded sign-up, played on both devices at once. */
function JourneysPanel({ s }: { s: DemoState }) {
  const played = s.journeyStep >= 0;
  const mark = (device: 'phone' | 'laptop', i: number) => {
    if (s.fixed) return <span className="text-ok">✓</span>;
    if (!played || i > s.journeyStep) return <span className="text-ghost">·</span>;
    if (device === 'phone' && i === PHONE_FAILS_AT) return <span className="text-err">✕</span>;
    if (device === 'phone' && i > PHONE_FAILS_AT) return <span className="text-ghost">·</span>;
    return <span className="text-ok">✓</span>;
  };
  const failed = played && !s.fixed && s.journeyStep >= PHONE_FAILS_AT;
  const done = s.fixed || s.journeyStep >= JOURNEY_STEPS.length;
  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 250, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative flex shrink-0 flex-col overflow-hidden border-r border-line-soft bg-[#131314]"
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,#c6f432_30%,#c6f432_70%,transparent)] opacity-70" />
      <div className="flex w-[250px] items-center gap-2.5 border-b border-line-soft px-3 py-2.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-[rgba(198,244,50,0.12)] text-[#c6f432] shadow-[inset_0_0_0_1px_rgba(198,244,50,0.25)]">
          <Icon name="route" size={13} />
        </span>
        <span className="flex flex-col">
          <span className="text-[12.5px] font-semibold">Journeys</span>
          <span className="text-[10.5px] text-faint">2 journeys</span>
        </span>
      </div>
      <div className="flex w-[250px] flex-col gap-2 p-2.5">
        <div className={`flex flex-col gap-2 rounded-[9px] border bg-[#1a1a1b] p-2.5 transition-colors ${failed ? 'border-err/40' : 'border-line-soft'}`}>
          <div className="flex items-center gap-2">
            <span className={`size-2 shrink-0 rounded-full ${s.fixed || (done && !failed) ? 'bg-ok' : failed ? 'bg-err' : 'bg-ghost'}`} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[12px] font-medium">Sign up</span>
              <span className="truncate text-[10px] text-faint">{s.fixed ? 'passed after Claude' : failed ? 'broke on iPhone 16' : played ? 'playing…' : '4 steps from /'}</span>
            </span>
            <span data-target="journey-play" className="inline-flex h-6 items-center gap-1 rounded-md bg-[rgba(198,244,50,0.12)] px-2 text-[10.5px] font-medium text-[#c6f432]">
              <Icon name="play" size={9} />
              Play
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[9.5px] text-ghost">
            <span className="w-3 text-center">
              <Icon name="phone" size={9} />
            </span>
            <span className="w-3 text-center">
              <Icon name="laptop" size={9} />
            </span>
          </div>
          {JOURNEY_STEPS.map((text, i) => (
            <div key={text} className="flex items-center gap-1.5 text-[11px]">
              <span className="w-3 text-center font-mono text-[10px]">{mark('phone', i)}</span>
              <span className="w-3 text-center font-mono text-[10px]">{mark('laptop', i)}</span>
              <span className={`min-w-0 truncate ${failed && i === PHONE_FAILS_AT ? 'text-err' : 'text-muted'}`}>{text}</span>
            </div>
          ))}
          <AnimatePresence>
            {failed && (
              <motion.div {...fade} className="flex flex-col gap-1.5 rounded-md bg-err/10 p-2 text-[10.5px] text-err">
                <span>iPhone 16 · step 3: covered by div.cookie-banner</span>
                <span data-target="ask-journey" className="self-start rounded-md border border-[rgba(217,119,87,0.35)] px-2 text-[10.5px] leading-5 font-medium text-[#d97757]">
                  Ask Claude
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-2 rounded-[9px] border border-line-soft bg-[#1a1a1b] p-2.5">
          <span className="size-2 shrink-0 rounded-full bg-ok" />
          <span className="flex min-w-0 flex-col">
            <span className="text-[12px] font-medium">Checkout</span>
            <span className="truncate text-[10px] text-faint">passed after a deploy, 2 h ago</span>
          </span>
        </div>
        <span className="px-1 text-[10px] leading-snug text-faint">Played again after each Claude task, commit and deploy. → checkout.spec.ts</span>
      </div>
    </motion.aside>
  );
}

type OgCard = { id: string; label: string; family: string; status: 'error' | 'warning' | 'ok'; problems: string[]; preview: (fixed: boolean) => ReactNode };

const OG_CARDS: OgCard[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    family: 'Messaging',
    status: 'error',
    problems: ['No og:image: only the link is shown.', 'No og:site_name.'],
    preview: (fixed) => (
      <div className="rounded-lg bg-[#0B141A] p-2.5">
        <div className="ml-6 rounded-lg rounded-br-sm bg-[#144D37] p-[3px] text-[#E9EDEF]">
          <div className="overflow-hidden rounded-md bg-[#0F3A2A]">
            {fixed && <ShareImage height={92} />}
            <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
              <span className="line-clamp-2 text-xs font-semibold">{fixed ? 'Saltmint — Money, finally calm' : 'saltmint.app'}</span>
              <span className="text-[10.5px] text-[#8FB0A3]">saltmint.app</span>
            </div>
          </div>
          <div className="truncate px-1.5 pt-1.5 pb-0.5 text-[11.5px] text-[#53BDEB]">https://saltmint.app</div>
        </div>
      </div>
    ),
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    family: 'Social',
    status: 'warning',
    problems: ['Image cropped to 1.91:1, the title on it gets cut.'],
    preview: (fixed) => (
      <div className="rounded-lg bg-[#F4F2EE] p-2.5">
        <div className="overflow-hidden rounded-md border border-[#E0DFDC] bg-white text-[#111]">
          {fixed ? <ShareImage height={92} /> : <div className="flex h-[92px] items-center justify-center bg-[#e9e7e2] text-[11px] text-[#888]">no image</div>}
          <div className="px-3 py-2">
            <div className="line-clamp-2 text-xs font-semibold">{fixed ? 'Saltmint — Money, finally calm' : 'saltmint.app'}</div>
            <div className="text-[11px] text-[#666]">saltmint.app</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'x',
    label: 'X',
    family: 'Social',
    status: 'warning',
    problems: ['No twitter:card: a small card is shown.'],
    preview: (fixed) => (
      <div className="rounded-lg border border-line-soft bg-black p-2.5 text-[#E7E9EA]">
        {fixed ? (
          <div className="relative overflow-hidden rounded-xl border border-[#2F3336]">
            <ShareImage height={92} />
            <span className="absolute bottom-2 left-2 rounded bg-black/75 px-1.5 text-[11px] text-white">saltmint.app</span>
          </div>
        ) : (
          <div className="flex overflow-hidden rounded-xl border border-[#2F3336]">
            <div className="flex size-[72px] shrink-0 items-center justify-center bg-[#16181C]">
              <Icon name="link" className="text-[#71767B]" />
            </div>
            <div className="flex min-w-0 flex-col justify-center gap-0.5 px-3">
              <span className="text-[11px] text-[#71767B]">saltmint.app</span>
              <span className="line-clamp-2 text-xs">saltmint.app</span>
            </div>
          </div>
        )}
      </div>
    ),
  },
  {
    id: 'slack',
    label: 'Slack',
    family: 'Messaging',
    status: 'ok',
    problems: [],
    preview: () => (
      <div className="rounded-lg bg-[#1A1D21] p-2.5 text-[#D1D2D3]">
        <div className="flex flex-col gap-1 border-l-[3px] border-[#4A4D52] pl-2.5">
          <span className="text-[11px] font-semibold">Saltmint</span>
          <span className="text-[13px] font-semibold text-[#1D9BD1]">Money, finally calm</span>
          <span className="line-clamp-2 text-xs">Sorts every payment and tells you what’s safe to spend.</span>
        </div>
      </div>
    ),
  },
  {
    id: 'google',
    label: 'Google',
    family: 'Search',
    status: 'ok',
    problems: [],
    preview: () => (
      <div className="flex flex-col gap-0.5 rounded-lg bg-white p-3 text-[#202124]">
        <span className="text-[11px] text-[#4D5156]">saltmint.app › pricing</span>
        <span className="text-[14px] text-[#1A0DAB]">Saltmint — Money, finally calm</span>
        <span className="text-[11px] text-[#E7711B]">
          ★★★★★ <span className="text-[#70757A]">4.9 · 12,000 reviews</span>
        </span>
      </div>
    ),
  },
  {
    id: 'imessage',
    label: 'iMessage',
    family: 'Messaging',
    status: 'ok',
    problems: [],
    preview: () => (
      <div className="flex justify-end rounded-lg bg-white p-2.5">
        <div className="flex w-[85%] items-center gap-2 rounded-2xl bg-[#E9E9EB] p-2 text-[#111]">
          <span className="size-9 shrink-0 rounded-md bg-[#11241c]" />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">Saltmint — Money, finally calm</div>
            <div className="text-[11px] text-[#6B6B70]">saltmint.app</div>
          </div>
        </div>
      </div>
    ),
  },
];

function OgPill({ status }: { status: OgCard['status'] }) {
  const label = status === 'error' ? 'Problem' : status === 'warning' ? 'Needs work' : 'OK';
  const tone = status === 'error' ? 'border-err/30 bg-err/10 text-err' : status === 'warning' ? 'border-warn/30 bg-warn/10 text-warn' : 'border-ok/25 bg-ok/10 text-ok';
  return (
    <span className={`flex h-[22px] shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium ${tone}`}>
      <Dot className={status === 'error' ? 'bg-err' : status === 'warning' ? 'bg-warn' : 'bg-ok'} />
      {label}
    </span>
  );
}

function OgCardView({ c, fixed, hover }: { c: OgCard; fixed: boolean; hover?: boolean }) {
  const status = fixed ? 'ok' : c.status;
  return (
    <motion.article
      layout
      data-target={`og-${c.id}`}
      className={`flex flex-col gap-2.5 rounded-xl border bg-card p-3 transition-shadow ${status === 'error' ? 'border-err/30' : status === 'warning' ? 'border-warn/25' : 'border-line'} ${hover ? 'shadow-[0_0_0_1px_#3a3a42]' : ''}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-fg">{c.label}</span>
          <span className="truncate font-mono text-[10px] text-ghost">{c.family} · HTTP 200</span>
        </div>
        <span className="flex-1" />
        <OgPill status={status} />
      </div>
      {c.preview(fixed)}
      {status !== 'ok' && (
        <ul className="m-0 flex list-none flex-col gap-1 border-t border-line-soft p-0 pt-2.5">
          {c.problems.map((p) => (
            <li key={p} className="flex gap-2 text-[11.5px] leading-snug text-muted">
              <Dot className={`mt-[5px] ${status === 'error' ? 'bg-err' : 'bg-warn'}`} />
              {p}
            </li>
          ))}
        </ul>
      )}
    </motion.article>
  );
}

/** The Open Graph page (SharePage.tsx): every preview at a glance, problems first, the fix in one bar on top. */
function OpenGraphPage({ s }: { s: DemoState }) {
  const fixed = s.scene === 'share' && s.fixed;
  const todo = fixed ? [] : OG_CARDS.filter((c) => c.status !== 'ok');
  const fine = fixed ? OG_CARDS : OG_CARDS.filter((c) => c.status === 'ok');
  const group = (title: string, tone: string, cards: OgCard[], count: number) => (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <Dot className={tone} />
        <h3 className="m-0 text-[13px] font-semibold tracking-[-0.01em]">{title}</h3>
        <span className="font-mono text-[11px] text-ghost">{count}</span>
        <span className="h-px flex-1 bg-line-soft" />
      </div>
      <div className="grid grid-cols-3 items-start gap-3">
        {cards.map((c) => (
          <OgCardView key={c.id} c={c} fixed={fixed} hover={s.ogCard && c.id === 'whatsapp' && !fixed} />
        ))}
      </div>
    </section>
  );
  return (
    <motion.div {...fade} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-4 border-b border-line-soft bg-chrome/90 px-5 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[16px] font-semibold tracking-[-0.015em]">Open Graph</span>
          <span className="truncate font-mono text-[11px] text-faint">localhost:3000/ · og:* · twitter:*</span>
        </div>
        <div className="flex items-center gap-1.5">
          {fixed ? (
            <span className="flex h-6 items-center gap-1.5 rounded-full bg-ok/10 px-2.5 text-[11.5px] font-medium text-ok">
              <Dot className="bg-ok" />
              10 OK
            </span>
          ) : (
            <>
              <span className="flex h-6 items-center gap-1.5 rounded-full bg-err/10 px-2.5 text-[11.5px] font-medium text-err">
                <Dot className="bg-err" />1 problem
              </span>
              <span className="flex h-6 items-center gap-1.5 rounded-full bg-warn/10 px-2.5 text-[11.5px] font-medium text-warn">
                <Dot className="bg-warn" />2 to improve
              </span>
              <span className="flex h-6 items-center gap-1.5 rounded-full bg-ok/10 px-2.5 text-[11.5px] font-medium text-ok">
                <Dot className="bg-ok" />7 OK
              </span>
            </>
          )}
        </div>
        <span className="flex-1" />
        <span className="flex h-8 items-center gap-2 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium">
          <Icon name="reload" size={13} />
          Re-read
        </span>
      </header>
      <div className="flex min-h-0 flex-col gap-5 overflow-hidden px-5 pt-4">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3">
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${fixed ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
            <Icon name={fixed ? 'check' : 'code'} size={15} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-[13px] font-medium">{fixed ? 'All Open Graph tags are in place' : '3 tags to add'}</span>
            <span className="truncate font-mono text-[11px] text-faint">Next.js{fixed ? '' : ' · app/layout.tsx'}</span>
          </div>
          {!fixed && (
            <span data-target="ask-og" className="flex h-8 items-center gap-2 rounded-ui border border-[rgba(217,119,87,0.35)] bg-[rgba(217,119,87,0.08)] px-3 text-xs font-semibold text-[#d97757]">
              <Icon name="spark" size={12} />
              Ask Claude to fix it
            </span>
          )}
          <span className="flex h-8 items-center gap-1.5 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium text-fg">{fixed ? 'Tags read' : 'Tags & fix'} ▾</span>
        </div>
        {todo.length > 0 && group('Needs a look', 'bg-err', todo, 3)}
        {group('Working', 'bg-ok', fine, fixed ? 10 : 7)}
      </div>
    </motion.div>
  );
}

function PhoneDialog({ s }: { s: DemoState }) {
  const qr = Array.from({ length: 121 }, (_, i) => {
    const x = i % 11;
    const y = Math.floor(i / 11);
    const finder = (x < 3 && y < 3) || (x > 7 && y < 3) || (x < 3 && y > 7);
    return finder || (x * 7 + y * 13 + x * y) % 3 === 0;
  });
  return (
    <motion.div {...fade} className="absolute inset-0 z-40 flex items-center justify-center bg-black/55">
      <div className="flex w-[360px] flex-col gap-4 rounded-xl border border-[#2a2a2f] bg-card p-5 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">On my phone</span>
          <Icon name="close" size={13} className="text-faint" />
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          Share the dev server on the Wi-Fi
          <span data-target="wifi-toggle" className={`relative h-5 w-9 rounded-full transition-colors ${s.wifi ? 'bg-ok' : 'bg-raised'}`}>
            <span className={`absolute top-0.5 size-4 rounded-full bg-fg transition-all ${s.wifi ? 'left-[18px]' : 'left-0.5'}`} />
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className={`grid size-[132px] shrink-0 grid-cols-11 gap-px rounded-lg bg-white p-2 transition-opacity duration-500 ${s.wifi ? 'opacity-100' : 'opacity-15'}`}>
            {qr.map((on, i) => (
              <span key={i} className={on ? 'bg-black' : ''} />
            ))}
          </div>
          <div className="flex flex-col gap-1.5 text-[11.5px] text-faint">
            <span className="font-mono text-fg">192.168.1.24:47800</span>
            <span>Same Wi-Fi, scan with the camera.</span>
            <span>Hot reload and navigation follow.</span>
            {s.phoneLive && (
              <span className="flex items-center gap-1.5 text-ok">
                <Dot className="bg-ok" /> 1 phone connected
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** The real phone that scanned the code, sliding in next to the window. */
function RealPhone({ accent }: { accent: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 80, rotate: 8 }}
      animate={{ opacity: 1, x: 0, rotate: -4 }}
      exit={{ opacity: 0, x: 60 }}
      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      className="absolute right-6 bottom-8 z-50 rounded-[34px] bg-[#111] p-[7px] shadow-[0_0_0_1px_#3a3a40,0_40px_80px_rgba(0,0,0,0.7)]"
    >
      <div className="relative h-[396px] w-[183px] overflow-hidden rounded-[28px]">
        <div className="origin-top-left" style={{ width: 393, height: 852, transform: 'scale(0.4656)' }}>
          <SitePhone accent={accent} />
        </div>
        <span className="absolute top-2 left-1/2 h-4 w-14 -translate-x-1/2 rounded-full bg-black" />
      </div>
    </motion.div>
  );
}

function ClaudePanel({ s }: { s: DemoState }) {
  const conv = CLAUDE[s.scene];
  const st = claudeStatus(s);
  return (
    <aside aria-hidden="true" className="flex w-[300px] shrink-0 flex-col border-l border-line-soft bg-chrome">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line-soft pr-3 pl-4">
        <span className="flex items-center gap-2 text-[13px] font-medium">
          <span className={`size-2 shrink-0 rounded-full bg-[#d97757] ${st === 'working' ? 'claude-dot' : ''}`} />
          Claude
          <span className="font-mono text-[10.5px] font-normal text-ghost">~/dev/saltmint</span>
        </span>
        <span className={`flex items-center gap-1.5 font-mono text-[11px] ${st === 'working' ? 'text-[#d97757]' : st === 'done' ? 'text-ok' : 'text-ghost'}`}>
          <span className={`size-1.5 rounded-full ${st === 'working' ? 'claude-dot bg-[#d97757]' : st === 'done' ? 'bg-ok' : 'bg-ghost'}`} />
          {st === 'idle' ? 'ready' : st}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-4 py-3 font-mono text-[11.5px] leading-[1.55] text-muted">
        {!s.sent && <span className="text-ghost">Claude Code · Opus · MCP kinglet ✓</span>}
        {s.sent && conv && (
          <motion.div {...fade} className="rounded-md bg-active px-2.5 py-2 text-fg">
            <span className="text-faint">&gt; </span>
            {conv.prompt}
            {conv.note && <div className="mt-1 text-[10.5px] text-local">{conv.note}</div>}
          </motion.div>
        )}
        {conv?.lines.slice(0, s.shown).map((l, i) => (
          <motion.div key={i} {...fade}>
            {l.k === 'say' ? (
              <div className="flex gap-2 text-fg">
                <span>●</span>
                <span>{l.text}</span>
              </div>
            ) : (
              <div className="flex gap-2">
                <span className={l.ok ? 'text-ok' : 'text-[#d97757]'}>●</span>
                <span className="min-w-0">
                  <span className="text-fg">{l.text}</span>
                  {l.note && <span className={`block ${l.ok ? 'text-ok' : 'text-faint'}`}>⎿ {l.note}</span>}
                </span>
              </div>
            )}
          </motion.div>
        ))}
        {st === 'working' && <span className="blink text-[#d97757]">✻ Working…</span>}
      </div>
      <div
        data-target="claude-input"
        className={`m-3 mt-0 flex min-h-[40px] shrink-0 items-start gap-2 rounded-[10px] border bg-card px-3 py-2 text-xs transition-colors ${
          s.draft && !s.sent ? 'border-[rgba(217,119,87,0.5)] text-fg' : 'border-line text-ghost'
        }`}
      >
        <span className="min-w-0 flex-1">
          {s.draft && !s.sent && conv ? (
            <>
              {conv.note && <span className="block font-mono text-[10.5px] text-local">{conv.note}</span>}
              {conv.prompt}
              <span className="blink ml-px inline-block h-3.5 w-[2px] translate-y-0.5 bg-fg" />
            </>
          ) : (
            '> Ask Claude…'
          )}
        </span>
        <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-[rgba(217,119,87,0.35)] px-2 text-[11px] text-[#d97757]">
          <Icon name="pin" size={11} />
          Show
        </span>
      </div>
    </aside>
  );
}

function StatusBar({ s }: { s: DemoState }) {
  return (
    <footer className="flex h-[26px] shrink-0 items-center gap-[18px] border-t border-line-soft bg-chrome px-3.5 font-mono text-[11px] text-faint">
      <span className="flex items-center gap-1.5">
        <Dot className="bg-ok" />
        {URL[s.env].replace(/\/$/, '')}
      </span>
      <span className="flex items-center gap-1.5">
        <Dot className="bg-ok" />
        pnpm dev
      </span>
      <span>2 devices</span>
      {s.wifi && <span className="text-ok">Phone · 1 connected</span>}
      <span className="flex items-center gap-1.5">
        <Dot className="bg-ok" />
        MCP · {s.shown ? `${s.shown} call${s.shown > 1 ? 's' : ''}` : 'ready'}
      </span>
      <span className="ml-auto">Kinglet · Electron · Chromium</span>
    </footer>
  );
}

/** 1200 × 660 px; the hero scales it to fit. Children (the cursor) are drawn on top. */
export const AppWindow = forwardRef<HTMLDivElement, { s: DemoState; children?: ReactNode }>(function AppWindow({ s, children }, ref) {
  return (
    <div ref={ref} className="relative flex h-[660px] w-[1200px] flex-col overflow-hidden rounded-[14px] border border-[#25252b] bg-bg text-[13px] leading-[1.4] shadow-[0_50px_160px_rgba(0,0,0,0.85)] select-none">
      <TitleBar s={s} />
      <EnvBar s={s} />
      <div className="relative flex min-h-0 flex-1">
        <Rail s={s} />
        <AnimatePresence>{s.section !== 'share' && s.emuMenu && <EmulationPanel key="emu" s={s} />}</AnimatePresence>
        <AnimatePresence>{s.section !== 'share' && s.journeysOpen && <JourneysPanel key="journeys" s={s} />}</AnimatePresence>
        {s.section !== 'share' && <ToolTabs s={s} />}
        <main className="stage-bg relative flex min-w-0 flex-1 flex-col">
          {s.section === 'share' ? (
            <OpenGraphPage s={s} />
          ) : (
            <>
              <DeviceToolbar s={s} />
              <div className="flex min-h-0 flex-1">
                <div data-target="stage" className="flex min-h-0 min-w-0 flex-1 items-center justify-center gap-11 overflow-hidden px-6 pt-2 pb-4">
                  <Device kind="phone" s={s} />
                  <Device kind="laptop" s={s} />
                </div>
                <AnimatePresence>{s.checksOpen && <ChecksPanel s={s} />}</AnimatePresence>
              </div>
              <AnimatePresence mode="popLayout">
                {s.picked && <InspectBar key="inspect" accent={s.accent} />}
                {s.consoleOpen && <ConsoleDrawer key="console" s={s} />}
              </AnimatePresence>
            </>
          )}
          <AnimatePresence>{s.phoneDialog && <PhoneDialog s={s} />}</AnimatePresence>
        </main>
        <ClaudePanel s={s} />
        <AnimatePresence>{s.phoneLive && <RealPhone accent={s.accent} />}</AnimatePresence>
      </div>
      <StatusBar s={s} />
      {children}
    </div>
  );
});
