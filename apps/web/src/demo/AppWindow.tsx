/**
 * The Kinglet window, rebuilt for the website with the app's own icons, tokens and class names
 * (TitleBar, EnvSwitch, Rail, DeviceToolbar, Stage, InspectBar, Console, StatusBar in apps/desktop/src/renderer).
 * It is a static replica: no store, no Electron, just the four moments the hero replays.
 */
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Dot, Icon, type IconName, Mark } from '../../../desktop/src/renderer/components/Icons';
import { TidalDesktop, TidalPhone } from './Tidal';

export type Mode = 'inspect' | 'console' | 'devices' | 'deploy';

/**
 * One scale for every device, as in the app (lib/layout.ts): sizes stay true to each other, and they shrink
 * when the inspector or the console takes room under them.
 */
const scaleFor = (mode: Mode) => (mode === 'console' ? 0.28 : mode === 'inspect' ? 0.35 : 0.43);
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const PHONE = { w: 393, h: 852, radius: 36, pad: 6 };
const LAPTOP = { w: 1280, h: 800, pad: 8 };

const fade = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 4 }, transition: { duration: 0.25 } };

function TitleBar({ mode }: { mode: Mode }) {
  const working = mode === 'console' || mode === 'devices';
  return (
    <div className="flex h-[42px] shrink-0 items-stretch border-b border-line-soft bg-chrome">
      <span className="flex w-14 shrink-0 items-center justify-center border-r border-line-soft">
        <Mark />
      </span>
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        <Tab name="tidal" color="#c6f432" on status={working ? { color: '#d97757', label: 'working', pulse: true } : { color: '#7dd3a8', label: 'to review' }} />
        <Tab name="docs" color="#8ab4f8" status={{ color: '#e6c07b', label: 'building' }} />
        <Tab name="portfolio" color="#a78bfa" />
        <span className="flex w-[42px] shrink-0 items-center justify-center border-r border-line-soft text-lg leading-none text-faint">+</span>
      </div>
      <span className="flex shrink-0 items-center gap-2 border-x border-line-soft px-3.5 text-xs whitespace-nowrap text-muted">
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" stroke="currentColor" strokeWidth="1.8" fill="none" />
        </svg>
        All projects
        {working && (
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

function EnvBar({ mode }: { mode: Mode }) {
  const env = mode === 'deploy' ? 'preview' : 'local';
  const url = env === 'preview' ? 'https://tidal-git-feat-budgets.vercel.app/' : 'http://localhost:3000/';
  const seg = (id: 'local' | 'preview' | 'prod', label: string, dot: string, extra?: ReactNode) => (
    <span
      className={`flex h-6 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap ${env === id ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint'}`}
    >
      <Dot className={dot} />
      {label}
      {env === id && extra}
    </span>
  );
  return (
    <div className="relative flex h-[46px] shrink-0 items-center gap-2.5 border-b border-line-soft bg-card px-3">
      <div className="flex gap-0.5 rounded-lg border border-line bg-bg p-0.5">
        {seg('local', 'Local', 'bg-local')}
        {seg('preview', 'Preview', 'bg-preview', <span className="font-mono text-[10.5px] text-muted">feat/budgets</span>)}
        {seg('prod', 'Prod', 'bg-prod')}
      </div>
      <div className="flex h-[30px] min-w-[150px] flex-1 items-center gap-2 rounded-ui border border-line bg-bg pr-1 pl-2.5">
        <Dot className={env === 'preview' ? 'bg-preview' : 'bg-local'} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{url}</span>
        <span className="flex h-6 items-center gap-1.5 rounded-md px-1.5 text-[11.5px] whitespace-nowrap text-faint">
          Pages <span className="font-mono text-[10.5px] text-ghost">14</span>
          <Icon name="chevrons" size={11} />
        </span>
      </div>
      <AnimatePresence>
        {mode === 'deploy' && (
          <motion.span key="pr" {...fade} className="flex h-7 shrink-0 items-center gap-1.5 rounded-ui border border-line px-2 text-xs whitespace-nowrap text-muted">
            <Icon name="git" size={12} className="text-[#a78bfa]" />
            #128
            <Dot className="bg-ok" />
            <span className="font-mono text-[10.5px] text-ok">CI</span>
          </motion.span>
        )}
      </AnimatePresence>
      {(['reload', 'phone', 'search'] as IconName[]).map((n) => (
        <span key={n} className="flex size-7 shrink-0 items-center justify-center rounded-ui border border-line text-muted">
          <Icon name={n} size={13} />
        </span>
      ))}
      <AnimatePresence>{mode === 'deploy' && <DeployMenu />}</AnimatePresence>
    </div>
  );
}

function DeployMenu() {
  const row = (branch: string, pr: string | null, state: ReactNode, ago: string, on?: boolean) => (
    <div className={`flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 ${on ? 'bg-active' : ''}`}>
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
    <motion.div
      key="menu"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.22 }}
      className="absolute top-10 left-3 z-50 w-[400px] origin-top-left rounded-[10px] border border-line bg-card p-1 shadow-2xl shadow-black/60"
    >
      <div className="flex items-baseline justify-between px-2.5 pt-2 pb-1.5">
        <span className="label">Previews</span>
        <span className="text-[11px] text-faint">Vercel · every 30 s</span>
      </div>
      {row('feat/budgets', '#128 ✓ CI', <><Dot className="bg-ok" /> Ready · checks 37/37 · LCP 1.2 s</>, '2 min', true)}
      {row('fix/nav-contrast', '#131', <><span className="blink inline-block size-1.5 rounded-full bg-warn" /> Building…</>, 'now')}
      {row('exp/onboarding', '#126 ✕ CI', <><Dot className="bg-err" /> <span className="text-err">Error</span> · <span className="text-[#d97757]">Ask Claude</span></>, '3 h')}
      <div className="mx-1.5 my-1 h-px bg-line-soft" />
      <div className="mb-1 flex w-full flex-col gap-1 rounded-md bg-[rgba(125,211,168,0.07)] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(125,211,168,0.3)]">
        <span className="flex items-center gap-2">
          <span className="truncate font-mono text-xs text-fg">tidal.money</span>
          <span className="shrink-0 rounded-full bg-[rgba(125,211,168,0.16)] px-1.5 py-px text-[10px] font-medium tracking-[0.04em] text-prod uppercase">Live</span>
        </span>
        <span className="text-xs text-muted">Production · main · 1 h ago</span>
      </div>
    </motion.div>
  );
}

function Rail({ mode }: { mode: Mode }) {
  const big = (icon: IconName, on: boolean, claude?: boolean) => (
    <span
      className={`relative flex size-10 shrink-0 items-center justify-center rounded-[9px] ${
        claude ? 'bg-[rgba(217,119,87,0.14)] text-[#d97757] shadow-[inset_0_0_0_1px_rgba(217,119,87,0.35)]' : on ? 'bg-active text-fg shadow-[inset_0_0_0_1px_#26262b]' : 'text-faint'
      }`}
    >
      <Icon name={icon} size={16} />
      {claude && (mode === 'console' || mode === 'devices') && <span className="claude-dot absolute top-[6px] right-[6px] size-1.5 rounded-full bg-[#d97757]" />}
    </span>
  );
  const small = (icon: IconName, badge?: ReactNode) => (
    <span className="relative flex size-8 shrink-0 items-center justify-center rounded-lg text-ghost">
      <Icon name={icon} size={14} />
      {badge && <span className="absolute top-[2px] right-[2px] font-mono text-[9px] leading-none">{badge}</span>}
    </span>
  );
  return (
    <nav aria-hidden="true" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line-soft bg-chrome py-2.5">
      {big('spark', true, true)}
      {big('eye', mode !== 'deploy')}
      {big('tri', mode === 'deploy')}
      {big('git', false)}
      <span className="mt-2 mb-1.5 h-px w-6 bg-line" />
      {small('page')}
      {small('share', <span className="text-err">1</span>)}
      {small('check', <span className="text-ghost">2</span>)}
      {small('cols')}
      {small('pin', <span className="text-[#d97757]">3</span>)}
      <span className="flex-1" />
      {small('gear')}
    </nav>
  );
}

function DeviceToolbar({ mode }: { mode: Mode }) {
  const chip = (icon: IconName, label: string, w: number, on: boolean) => (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs whitespace-nowrap ${on ? 'bg-raised text-fg' : 'text-faint'}`}>
      <Icon name={icon} size={12} />
      {label}
      <span className={`font-mono text-[10.5px] ${on ? 'text-faint' : 'text-ghost'}`}>{w}</span>
    </span>
  );
  const iconButton = (icon: IconName, on: boolean, tone: 'plain' | 'ok' = 'plain', badge?: number) => (
    <span
      className={`relative flex size-8 shrink-0 items-center justify-center rounded-[7px] ${on ? (tone === 'ok' ? 'bg-[rgba(125,211,168,0.12)] text-ok' : 'bg-raised text-fg') : 'text-muted'}`}
    >
      <Icon name={icon} size={15} />
      {badge ? <span className="absolute top-0.5 right-0 min-w-3.5 rounded-full bg-err px-1 font-mono text-[9px] leading-3.5 font-semibold text-bg">{badge}</span> : null}
    </span>
  );
  const emu = mode === 'devices';
  return (
    <div className="relative flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft bg-chrome px-4 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-0.5 rounded-[9px] border border-line bg-card p-[3px]">
        {chip('phone', 'iPhone 16', 393, true)}
        <span className="mx-0.5 h-4 w-px bg-line" />
        {chip('tablet', 'iPad Air', 820, false)}
        <span className="mx-0.5 h-4 w-px bg-line" />
        {chip('laptop', 'Laptop', 1280, true)}
      </div>
      <span className="h-5 w-px bg-line" />
      <div className="flex items-center gap-0.5">
        {iconButton('target', mode === 'inspect')}
        {iconButton('terminal', mode === 'console', 'plain', 3)}
        {iconButton('rotate', false)}
        {iconButton('link', true, 'ok')}
      </div>
      <span className="h-5 w-px bg-line" />
      <span className={`inline-flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 text-xs whitespace-nowrap ${emu ? 'bg-active text-fg' : 'text-muted'}`}>
        <Icon name="sliders" size={14} />
        {emu ? 'Slow 3G · Tokyo · iOS' : 'Emulation'}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <span title="Forms" className="flex size-8 items-center justify-center rounded-[7px] text-muted">
          <Icon name="form" size={15} />
        </span>
        <span title="Export" className="flex size-8 items-center justify-center rounded-[7px] text-muted">
          <Icon name="download" size={15} />
        </span>
        <span className="ml-1 inline-flex h-7 items-center rounded-md border border-line px-2 font-mono text-[11px] text-muted">{Math.round(scaleFor(mode) * 100)} %</span>
      </div>
      <AnimatePresence>{emu && <EmulationMenu />}</AnimatePresence>
    </div>
  );
}

function EmulationMenu() {
  const group = (label: string, items: [string, boolean][]) => (
    <div className="flex flex-col gap-1 px-2.5 py-1.5">
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-1">
        {items.map(([l, on]) => (
          <span key={l} className={`inline-flex h-6 items-center rounded-md px-2 text-[11.5px] ${on ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint'}`}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.22 }}
      className="absolute top-11 left-[470px] z-50 flex w-80 origin-top-left flex-col rounded-[10px] border border-line bg-card p-1 py-1.5 shadow-2xl shadow-black/60"
    >
      {group('Network', [['Full speed', false], ['4G', false], ['Slow 3G', true], ['Offline', false]])}
      {group('CPU', [['×1', false], ['×4 mid-range', true], ['×6 low-end', false]])}
      {group('Keyboard', [['None', false], ['iOS', true], ['Android', false]])}
      {group('Region · iPhone 16', [['Tokyo · ja-JP · Asia/Tokyo', true]])}
      {group('Appearance', [['Dark', false], ['Reduced motion', false], ['Text 200 %', false]])}
    </motion.div>
  );
}

function Device({ kind, mode }: { kind: 'phone' | 'laptop'; mode: Mode }) {
  const d = kind === 'phone' ? PHONE : LAPTOP;
  const scale = scaleFor(mode);
  const w = Math.round(d.w * scale);
  const h = Math.round(d.h * scale);
  const radius = kind === 'phone' ? Math.round(PHONE.radius * scale) : 0;
  const errors = mode === 'console' ? (kind === 'phone' ? 2 : 1) : 0;
  const line =
    kind === 'phone'
      ? mode === 'devices'
        ? ['iPhone 16 · 393 × 852', <span key="r" className="text-local">· Tokyo</span>, '· Slow 3G · LCP 2.4 s']
        : ['iPhone 16 · 393 × 852', '· LCP 0.9 s']
      : ['Laptop · 1280 × 800', '· 140 ms · 486 KB', '· LCP 0.6 s · CLS 0.00'];
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="bg-black shadow-[0_0_0_1px_#2e2e33,0_30px_60px_rgba(0,0,0,0.65)]" style={{ padding: d.pad, borderRadius: kind === 'laptop' ? 8 : radius + d.pad, transition: `border-radius .5s ${EASE}` }}>
        <div className="relative overflow-hidden bg-card" style={{ width: w, height: h, borderRadius: radius, transition: `width .5s ${EASE}, height .5s ${EASE}, border-radius .5s ${EASE}` }}>
          <div className="origin-top-left" style={{ width: d.w, height: d.h, transform: `scale(${scale})`, transition: `transform .5s ${EASE}` }}>
            {kind === 'phone' ? <TidalPhone inspect={mode === 'inspect'} keyboard={mode === 'devices'} /> : <TidalDesktop inspect={mode === 'inspect'} broken={mode === 'console'} />}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-faint [&>*]:whitespace-nowrap" style={{ maxWidth: w + 120 }}>
        {line.map((l, i) => (typeof l === 'string' ? <span key={i}>{l}</span> : l))}
        {errors > 0 && <span className="flex items-center gap-1 rounded bg-[rgba(242,139,130,0.12)] px-1.5 py-px font-mono text-[10.5px] text-err">{errors} error{errors > 1 ? 's' : ''}</span>}
      </div>
    </div>
  );
}

function InspectBar() {
  const rows = [
    ['iPhone 16', '343 × 48', '0 · 0 · 0 · 0', 'Geist 14 / 600', '#0e0f0c'],
    ['Laptop', '206 × 50', '0 · 14 · 0 · 0', 'Geist 15 / 600', '#0e0f0c'],
  ];
  return (
    <motion.section {...fade} aria-label="Inspector" className="flex shrink-0 flex-col border-t border-line-soft bg-chrome">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Icon name="target" size={13} className="shrink-0 text-local" />
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="font-mono text-xs text-fg">button</span>
          <span className="truncate text-xs text-muted">« Get started — free »</span>
          <span className="truncate font-mono text-[10.5px] text-ghost">main &gt; .hero &gt; .cta</span>
        </span>
        <span className="shrink-0 text-[11px] text-[#d97757]">kept · click again to release</span>
        <span className="h-7 shrink-0 rounded-ui border border-[rgba(217,119,87,0.35)] bg-[rgba(217,119,87,0.08)] px-2.5 text-xs leading-7 font-semibold text-[#d97757]">Ask Claude</span>
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

function ConsoleDrawer() {
  const lines: [string, 'error' | 'warning' | 'log', string, string][] = [
    ['iPhone 16', 'error', 'TypeError: Cannot read properties of undefined (reading ‘rate’)', 'lib/fx.ts:42'],
    ['iPhone 16', 'error', 'GET /api/rates?base=EUR · 500', '184 ms'],
    ['Laptop', 'error', 'Hydration failed: server rendered “May 1”, client “1 May”', 'BudgetCard.tsx'],
    ['Laptop', 'log', '[Fast Refresh] done in 92ms', ''],
  ];
  const chip = (on: boolean) => `inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11.5px] whitespace-nowrap ${on ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint'}`;
  return (
    <motion.div {...fade} className="flex h-[176px] shrink-0 flex-col border-t border-line-soft bg-chrome">
      <div className="flex items-center gap-1 border-b border-line-soft px-3 py-2">
        <span className={chip(true)}>All devices</span>
        <span className={chip(false)}>
          iPhone 16 <span className="font-mono text-[10.5px] text-err">2</span>
        </span>
        <span className={chip(false)}>
          Laptop <span className="font-mono text-[10.5px] text-err">1</span>
        </span>
        <span className="flex-1" />
        <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-fg px-2 text-[11.5px] font-semibold whitespace-nowrap text-bg">Send to Claude</span>
      </div>
      <ul className="m-0 list-none overflow-hidden p-0 font-mono text-[11.5px]">
        {lines.map(([dev, level, msg, where], i) => (
          <li key={i} className="flex gap-2 border-b border-line-soft px-3 py-1.5">
            <span className={`mt-[5px] size-1.5 shrink-0 rounded-full ${level === 'error' ? 'bg-err' : 'bg-ghost'}`} />
            <span className={`min-w-0 flex-1 truncate ${level === 'error' ? 'text-err' : 'text-muted'}`}>{msg}</span>
            <span className="shrink-0 font-sans text-[11px] text-ghost">
              {dev}
              {where && ` · ${where}`}
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

type Line = { k: 'you' | 'tool' | 'edit' | 'say'; text: string; note?: string; ok?: boolean };

const SCRIPT: Record<Mode, Line[]> = {
  inspect: [
    { k: 'you', text: 'Make this button full width on phones', note: '[Image #1] button.cta · iPhone 16, Laptop' },
    { k: 'tool', text: 'kinglet - screenshot', note: 'iphone-16' },
    { k: 'edit', text: 'Update(components/Hero.tsx)', note: '+3 −1', ok: true },
    { k: 'tool', text: 'kinglet - run_checks', note: '37/37 passed', ok: true },
    { k: 'say', text: 'Done: full width under 640 px, unchanged on Laptop. Checked on both devices.' },
  ],
  console: [
    { k: 'you', text: 'Fix the console errors', note: '3 errors · iPhone 16, Laptop' },
    { k: 'tool', text: 'kinglet - get_console', note: '3 errors, 1 failed request' },
    { k: 'edit', text: 'Update(lib/fx.ts)', note: '+5 −2', ok: true },
    { k: 'edit', text: 'Update(components/BudgetCard.tsx)', note: '+2 −1', ok: true },
    { k: 'tool', text: 'kinglet - get_console', note: 'clean', ok: true },
  ],
  devices: [
    { k: 'you', text: 'The sign-up field hides under the keyboard', note: 'iOS keyboard · Slow 3G · Tokyo' },
    { k: 'tool', text: 'kinglet - screenshot', note: 'iphone-16, keyboard' },
    { k: 'edit', text: 'Update(components/SignupBar.tsx)', note: '+9 −2', ok: true },
    { k: 'tool', text: 'kinglet - run_checks', note: 'forms ✓ tap targets ✓', ok: true },
    { k: 'say', text: 'The field now stays above the keyboard (visualViewport).' },
  ],
  deploy: [
    { k: 'you', text: 'Ship the budgets feature' },
    { k: 'tool', text: 'Bash(git push origin feat/budgets)' },
    { k: 'tool', text: 'kinglet - list_deployments', note: 'Ready · PR #128', ok: true },
    { k: 'tool', text: 'kinglet - run_checks', note: 'preview · 37/37', ok: true },
    { k: 'tool', text: 'kinglet - get_share_preview', note: '10/10 platforms', ok: true },
  ],
};

function ClaudePanel({ mode }: { mode: Mode }) {
  const working = mode === 'console' || mode === 'devices';
  return (
    <aside aria-hidden="true" className="flex w-[300px] shrink-0 flex-col border-l border-line-soft bg-chrome">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line-soft pr-2 pl-4">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <Icon name="spark" size={14} className="text-[#d97757]" />
          Claude
          <span className="font-mono text-[10.5px] font-normal text-ghost">~/dev/tidal</span>
        </span>
        <span className={`flex items-center gap-1.5 font-mono text-[11px] ${working ? 'text-[#d97757]' : 'text-ok'}`}>
          <span className={`size-1.5 rounded-full ${working ? 'claude-dot bg-[#d97757]' : 'bg-ok'}`} />
          {working ? 'working' : 'done'}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-4 py-3 font-mono text-[11.5px] leading-[1.55] text-muted">
        <AnimatePresence mode="wait">
          <motion.div key={mode} className="flex flex-col gap-2.5" initial="hidden" animate="show" exit={{ opacity: 0 }} variants={{ show: { transition: { staggerChildren: 0.45 } } }}>
            {SCRIPT[mode].map((l, i) => (
              <motion.div key={i} variants={{ hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0 } }}>
                {l.k === 'you' ? (
                  <div className="rounded-md bg-active px-2.5 py-2 text-fg">
                    <span className="text-faint">&gt; </span>
                    {l.text}
                    {l.note && <div className="mt-1 text-[10.5px] text-local">{l.note}</div>}
                  </div>
                ) : l.k === 'say' ? (
                  <div className="flex gap-2 text-fg">
                    <span className="text-fg">●</span>
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
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="m-3 mt-0 flex shrink-0 items-center gap-2 rounded-[10px] border border-line bg-card px-3 py-2 text-xs text-ghost">
        <span className="flex-1">&gt; Ask Claude…</span>
        <span className="inline-flex h-6 items-center gap-1 rounded-md border border-[rgba(217,119,87,0.35)] px-2 text-[11px] text-[#d97757]">
          <Icon name="pin" size={11} />
          Show
        </span>
      </div>
    </aside>
  );
}

function StatusBar({ mode }: { mode: Mode }) {
  return (
    <footer className="flex h-[26px] shrink-0 items-center gap-[18px] border-t border-line-soft bg-chrome px-3.5 font-mono text-[11px] text-faint">
      <span className="flex items-center gap-1.5">
        <Dot className="bg-ok" />
        {mode === 'deploy' ? 'https://tidal-git-feat-budgets.vercel.app' : 'http://localhost:3000'}
      </span>
      <span className="flex items-center gap-1.5">
        <Dot className="bg-ok" />
        pnpm dev
      </span>
      <span>2 devices</span>
      <span className="flex items-center gap-1.5">
        <Dot className="bg-ok" />
        MCP · {mode === 'inspect' ? '4 calls' : mode === 'deploy' ? '9 calls' : '6 calls'}
      </span>
      <span className="ml-auto">Kinglet · Electron · Chromium</span>
    </footer>
  );
}

/** 1200 × 660 px; the hero scales it to fit. */
export function AppWindow({ mode }: { mode: Mode }) {
  return (
    <div className="flex h-[660px] w-[1200px] flex-col overflow-hidden rounded-[14px] border border-[#25252b] bg-bg text-[13px] leading-[1.4] shadow-[0_50px_160px_rgba(0,0,0,0.85)] select-none">
      <TitleBar mode={mode} />
      <EnvBar mode={mode} />
      <div className="flex min-h-0 flex-1">
        <Rail mode={mode} />
        <main className="stage-bg relative flex min-w-0 flex-1 flex-col">
          <DeviceToolbar mode={mode} />
          <div className="flex min-h-0 flex-1 items-center justify-center gap-11 overflow-hidden px-6 pt-2 pb-4">
            <Device kind="phone" mode={mode} />
            <Device kind="laptop" mode={mode} />
          </div>
          <AnimatePresence mode="popLayout">
            {mode === 'inspect' && <InspectBar key="inspect" />}
            {mode === 'console' && <ConsoleDrawer key="console" />}
          </AnimatePresence>
        </main>
        <ClaudePanel mode={mode} />
      </div>
      <StatusBar mode={mode} />
    </div>
  );
}
