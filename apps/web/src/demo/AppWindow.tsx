/**
 * The Kinglet window, rebuilt for the website with the app's own icons, tokens and class names
 * (TitleBar, EnvSwitch, Rail, DeviceToolbar, Stage, InspectBar, Console, Checks, SharePage, PhoneDialog, ClaudePanel,
 * StatusBar in apps/desktop/src/renderer). It is a static replica driven by the hero's scripted scenes.
 * Elements the demo cursor goes to carry data-target="…".
 */
import { AnimatePresence, motion } from 'motion/react';
import { forwardRef, type ReactNode } from 'react';
import { Dot, Icon, type IconName, Mark } from '../../../desktop/src/renderer/components/Icons';
import { CLAUDE, type DemoState, type Env, type Platform } from './scenes';
import { TidalDesktop, TidalPhone } from './Tidal';

const PHONE = { w: 393, h: 852, radius: 36, pad: 6 };
const LAPTOP = { w: 1280, h: 800, pad: 8 };
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const URL: Record<Env, string> = { local: 'http://localhost:3000/', preview: 'https://tidal-git-feat-budgets.vercel.app/', prod: 'https://tidal.money/' };

const fade = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 4 }, transition: { duration: 0.25 } };
const pop = { initial: { opacity: 0, y: -6, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.2 } };

/** One scale for every device, as in the app (lib/layout.ts); it shrinks when a drawer or a panel takes room. */
function scaleOf(s: DemoState) {
  if (s.consoleOpen) return 0.28;
  if (s.checksOpen) return 0.27;
  if (s.picked) return 0.35;
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
        <Tab name="tidal" color="#c6f432" on status={status} />
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
      {row('feat/budgets', '#128 ✓ CI', <><Dot className="bg-ok" /> Ready · checks 37/37 · LCP 1.2 s</>, 'just now', 'deploy-row', hover)}
      {row('fix/nav-contrast', '#131', <><span className="blink inline-block size-1.5 rounded-full bg-warn" /> Building…</>, '1 min')}
      {row('exp/onboarding', '#126 ✕ CI', <><Dot className="bg-err" /> <span className="text-err">Error</span> · <span className="text-[#d97757]">Ask Claude</span></>, '3 h')}
    </motion.div>
  );
}

function Rail({ s }: { s: DemoState }) {
  const working = claudeStatus(s) === 'working';
  const big = (icon: IconName, on: boolean, claude?: boolean) => (
    <span
      className={`relative flex size-10 shrink-0 items-center justify-center rounded-[9px] ${
        claude ? 'bg-[rgba(217,119,87,0.14)] text-[#d97757] shadow-[inset_0_0_0_1px_rgba(217,119,87,0.35)]' : on ? 'bg-active text-fg shadow-[inset_0_0_0_1px_#26262b]' : 'text-faint'
      }`}
    >
      <Icon name={icon} size={16} />
      {claude && working && <span className="claude-dot absolute top-[6px] right-[6px] size-1.5 rounded-full bg-[#d97757]" />}
    </span>
  );
  const small = (icon: IconName, on: boolean, target?: string, badge?: ReactNode) => (
    <span data-target={target} className={`relative flex size-8 shrink-0 items-center justify-center rounded-lg ${on ? 'bg-active text-fg shadow-[inset_0_0_0_1px_#26262b]' : 'text-ghost'}`}>
      <Icon name={icon} size={14} />
      {badge && <span className="absolute top-[2px] right-[2px] font-mono text-[9px] leading-none">{badge}</span>}
    </span>
  );
  const shareBad = !(s.scene === 'share' && s.fixed);
  const checksBad = !(s.scene === 'checks' && s.fixed);
  return (
    <nav aria-hidden="true" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line-soft bg-chrome py-2.5">
      {big('spark', true, true)}
      {big('eye', s.section === 'devices')}
      {big('tri', false)}
      {big('git', false)}
      <span className="mt-2 mb-1.5 h-px w-6 bg-line" />
      {small('page', false)}
      {small('share', s.section === 'share', 'rail-share', shareBad ? <span className="text-err">2</span> : null)}
      {small('check', s.checksOpen, 'rail-checks', <span className={checksBad ? 'text-ghost' : 'text-ok'}>{checksBad ? 2 : '✓'}</span>)}
      {small('cols', false)}
      {small('pin', false, undefined, <span className="text-[#d97757]">3</span>)}
      <span className="flex-1" />
      {small('gear', false)}
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
  const emuCount = [s.slow, s.tokyo, s.keyboard].filter(Boolean).length;
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
      <span data-target="btn-emu" className={`inline-flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 text-xs whitespace-nowrap ${s.emuMenu || emuCount ? 'bg-active text-fg' : 'text-muted'}`}>
        <Icon name="sliders" size={14} />
        Emulation
        {emuCount > 0 && <span className="rounded-full bg-local px-1.5 font-mono text-[10px] leading-4 font-semibold text-bg">{emuCount}</span>}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <span className="flex size-8 items-center justify-center rounded-[7px] text-muted">
          <Icon name="form" size={15} />
        </span>
        <span className="flex size-8 items-center justify-center rounded-[7px] text-muted">
          <Icon name="download" size={15} />
        </span>
        <span className="ml-1 inline-flex h-7 items-center rounded-md border border-line px-2 font-mono text-[11px] text-muted">{Math.round(scaleOf(s) * 100)} %</span>
      </div>
      <AnimatePresence>{s.emuMenu && <EmulationMenu s={s} />}</AnimatePresence>
    </div>
  );
}

function EmulationMenu({ s }: { s: DemoState }) {
  const group = (label: string, items: [string, boolean, string?][]) => (
    <div className="flex flex-col gap-1 px-2.5 py-1.5">
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-1">
        {items.map(([l, on, target]) => (
          <span
            key={l}
            data-target={target}
            className={`inline-flex h-6 items-center rounded-md px-2 text-[11.5px] transition-colors ${on ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint'}`}
          >
            {l}
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <motion.div {...pop} className="absolute top-11 left-[400px] z-50 flex w-80 origin-top-left flex-col rounded-[10px] border border-line bg-card p-1 py-1.5 shadow-2xl shadow-black/60">
      {group('Network', [['Full speed', !s.slow], ['4G', false], ['Slow 3G', s.slow, 'emu-slow'], ['Offline', false]])}
      {group('CPU', [['×1', !s.slow], ['×4 mid-range', s.slow], ['×6 low-end', false]])}
      {group('Keyboard', [['None', !s.keyboard], ['iOS', s.keyboard, 'emu-ios'], ['Android', false]])}
      {group('Region · iPhone 16', [['Same as the computer', !s.tokyo], ['Tokyo · ja-JP', s.tokyo, 'emu-tokyo'], ['Berlin', false]])}
    </motion.div>
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
              <TidalPhone inspect={highlight} keyboard={s.keyboard} keyboardFixed={s.keyboardFixed} lime={s.ctaLime} />
            ) : (
              <TidalDesktop inspect={highlight} broken={s.scene === 'console' && !s.fixed} lime={s.ctaLime} />
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

function InspectBar({ lime }: { lime: boolean }) {
  const color = lime ? '#c6f432' : '#0e0f0c';
  const rows = [
    ['iPhone 16', '349 × 46', '0 · 0 · 0 · 0', 'Geist 14 / 600', color],
    ['Laptop', '206 × 50', '0 · 14 · 0 · 0', 'Geist 15 / 600', color],
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
        <span className={`font-mono text-xs ${fixed ? 'text-ok' : 'text-warn'}`}>{fixed ? '37' : '35'} / 37</span>
      </div>
      <div className="flex gap-1 border-b border-line-soft px-3 py-2">
        {['All', 'SEO', 'Share', 'Mobile', 'A11y'].map((f, i) => (
          <span key={f} className={`inline-flex h-6 items-center rounded-md px-2 text-[11px] ${i === 0 ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint'}`}>
            {f}
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {fixed ? (
          <>
            {item('Tap targets', 'Every target is 24 × 24 px or more.', 'ok')}
            {item('Share image', 'og:image 1200 × 630.', 'ok')}
          </>
        ) : (
          <>
            {item('Tap targets', 'iPhone 16: 3 links under 24 × 24 px in the nav.', 'err', true)}
            {item('Share image', 'og:image is 800 × 420, under 1200 × 630.', 'warn')}
          </>
        )}
        {item('Horizontal overflow', 'Nothing wider than the screen.', 'ok')}
        {item('Contrast', 'Every text passes 4.5:1.', 'ok')}
        {item('LCP', 'iPhone 16 0.9 s · Laptop 0.6 s', 'ok')}
      </div>
    </motion.aside>
  );
}

const PLATFORMS: [Platform, string][] = [
  ['whatsapp', 'WhatsApp'],
  ['imessage', 'iMessage'],
  ['slack', 'Slack'],
  ['linkedin', 'LinkedIn'],
  ['x', 'X'],
  ['google', 'Google'],
];

function SharePage({ s }: { s: DemoState }) {
  const fixed = s.scene === 'share' && s.fixed;
  const bad = (p: Platform) => !fixed && (p === 'whatsapp' || p === 'linkedin');
  const image = (
    <div className="flex h-[120px] items-end bg-[#f6f6f1] p-3 text-[#0e0f0c]">
      <span className="text-[22px] leading-none font-semibold tracking-[-0.05em]">
        Money,
        <br />
        finally calm.
      </span>
      <span className="ml-auto h-12 w-16 rounded-md bg-[#0e0f0c] shadow-[inset_-10px_-6px_0_#c6f432]" />
    </div>
  );
  return (
    <motion.div {...fade} className="flex min-h-0 flex-1">
      <div className="flex w-[170px] shrink-0 flex-col gap-0.5 border-r border-line-soft bg-chrome p-2">
        <span className="label px-2 pt-1 pb-2">Platforms</span>
        {PLATFORMS.map(([id, label]) => (
          <span
            key={id}
            data-target={`share-${id}`}
            className={`flex h-8 items-center justify-between rounded-md px-2.5 text-xs transition-colors ${s.platform === id ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint'}`}
          >
            {label}
            <Dot className={bad(id) ? 'bg-err' : 'bg-ok'} />
          </span>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
        <div className="flex flex-1 items-center justify-center rounded-xl p-5" style={{ background: s.platform === 'whatsapp' ? '#0b141a' : '#000' }}>
          <AnimatePresence mode="wait">
            {s.platform === 'whatsapp' ? (
              <motion.div key={`wa${fixed}`} {...fade} className="ml-auto w-[260px] overflow-hidden rounded-[10px] bg-[#005c4b] text-[#e9edef] shadow-lg">
                {fixed ? (
                  <>
                    {image}
                    <div className="flex flex-col gap-0.5 px-2.5 py-2 text-[11px]">
                      <strong>Tidal — Budgeting that stays calm</strong>
                      <span className="opacity-75">Sorts every payment and tells you what’s safe to spend.</span>
                      <span className="opacity-60">tidal.money</span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-1 px-2.5 py-2 text-[11px]">
                    <span className="rounded bg-black/20 px-2 py-1.5 opacity-80">tidal.money</span>
                    <span className="text-[#53bdeb]">https://tidal.money</span>
                  </div>
                )}
                <div className="px-2.5 pb-1.5 text-right text-[9px] opacity-60">10:42 ✓✓</div>
              </motion.div>
            ) : (
              <motion.div key="li" {...fade} className="w-[300px] overflow-hidden rounded-lg border border-[#333] bg-[#1b1f23] text-[#e8e8e8]">
                <div className="px-3 py-2 text-[11px]">Our spring release is live.</div>
                {fixed ? image : <div className="flex h-[120px] items-center justify-center bg-[#2a2e33] text-[11px] text-[#8a8f95]">No image</div>}
                <div className="flex flex-col px-3 py-2 text-[11px]">
                  <strong>tidal.money</strong>
                  <span className="opacity-60">tidal.money</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs">
            {fixed ? (
              <span className="flex items-center gap-2 text-ok">
                <Icon name="check" size={13} /> Looks right on 10 platforms.
              </span>
            ) : (
              <>
                <span className="flex items-center gap-2 text-fg">
                  <Dot className="bg-err" /> No og:image: only the address is shown.
                </span>
                <span className="flex items-center gap-2 text-fg">
                  <Dot className="bg-warn" /> No og:site_name: the domain replaces your name.
                </span>
              </>
            )}
          </div>
          {!fixed && (
            <span data-target="ask-share" className="h-7 shrink-0 rounded-ui border border-[rgba(217,119,87,0.35)] bg-[rgba(217,119,87,0.08)] px-2.5 text-xs leading-7 font-semibold text-[#d97757]">
              Ask Claude
            </span>
          )}
        </div>
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
function RealPhone({ lime }: { lime: boolean }) {
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
          <TidalPhone lime={lime} />
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
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <Icon name="spark" size={14} className="text-[#d97757]" />
          Claude
          <span className="font-mono text-[10.5px] font-normal text-ghost">~/dev/tidal</span>
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
        <main className="stage-bg relative flex min-w-0 flex-1 flex-col">
          {s.section === 'share' ? (
            <SharePage s={s} />
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
                {s.picked && <InspectBar key="inspect" lime={s.ctaLime} />}
                {s.consoleOpen && <ConsoleDrawer key="console" s={s} />}
              </AnimatePresence>
            </>
          )}
          <AnimatePresence>{s.phoneDialog && <PhoneDialog s={s} />}</AnimatePresence>
        </main>
        <ClaudePanel s={s} />
        <AnimatePresence>{s.phoneLive && <RealPhone lime={s.ctaLime} />}</AnimatePresence>
      </div>
      <StatusBar s={s} />
      {children}
    </div>
  );
});
