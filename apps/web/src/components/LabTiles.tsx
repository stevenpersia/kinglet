/**
 * Small looping animations for the Device lab tiles, one per tool. They only run while on screen,
 * and MotionConfig (App.tsx) stills them for people who reduce motion.
 */
import { motion, useInView } from 'motion/react';
import { type ReactNode, useRef } from 'react';

const MINT = '#a6f0c6';
const INK = '#11241c';
const PAPER = '#f6f5f0';
const loop = (duration: number, delay = 0) => ({ duration, delay, repeat: Infinity, ease: 'easeInOut' as const });

function Stage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const on = useInView(ref, { margin: '-30px' });
  return (
    <div ref={ref} aria-hidden="true" className="relative flex h-[104px] items-center justify-center overflow-hidden rounded-[10px] border border-line-soft bg-[#0a0a0c] [background-image:radial-gradient(#17171b_1px,transparent_1px)] [background-size:12px_12px]">
      {on && children}
    </div>
  );
}

/** A tiny page (header bar + text lines), in the demo site's colors. */
function MiniPage({ dark = false, lines = 3 }: { dark?: boolean; lines?: number }) {
  return (
    <div className="flex h-full w-full flex-col gap-1 p-1.5" style={{ background: dark ? INK : PAPER }}>
      <span className="h-1 w-1/3 rounded-full" style={{ background: dark ? MINT : INK }} />
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="h-1 rounded-full" style={{ width: `${80 - i * 15}%`, background: dark ? '#40584c' : '#cfd3cc' }} />
      ))}
    </div>
  );
}

function Devices() {
  const frames = [
    { w: 22, h: 40, r: 5 },
    { w: 24, h: 44, r: 6 },
    { w: 44, h: 58, r: 5 },
    { w: 78, h: 50, r: 3 },
  ];
  return (
    <div className="flex items-end gap-2.5">
      {frames.map((f, i) => (
        <motion.div key={i} className="overflow-hidden border-[3px] border-black shadow-[0_0_0_1px_#2e2e33]" style={{ width: f.w, height: f.h, borderRadius: f.r }} animate={{ y: [0, -6, 0] }} transition={loop(2.4, i * 0.18)}>
          <MiniPage lines={2} />
        </motion.div>
      ))}
    </div>
  );
}

function Sync() {
  const screen = (
    <div className="relative h-[70px] w-[48px] overflow-hidden rounded-[7px] border-[3px] border-black shadow-[0_0_0_1px_#2e2e33]" style={{ background: PAPER }}>
      <motion.div className="flex flex-col gap-1.5 p-1.5" animate={{ y: [0, -46, 0] }} transition={loop(3.2)}>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="h-1.5 rounded-full" style={{ width: `${90 - (i % 3) * 20}%`, background: i % 4 === 0 ? INK : '#cfd3cc' }} />
        ))}
      </motion.div>
    </div>
  );
  return (
    <div className="flex items-center gap-3">
      {screen}
      <motion.span className="font-mono text-[11px] text-ok" animate={{ opacity: [0.4, 1, 0.4] }} transition={loop(1.6)}>
        ⇄
      </motion.span>
      {screen}
      {screen}
    </div>
  );
}

function RealPhone() {
  return (
    <div className="flex items-center gap-4">
      <div className="grid size-[54px] grid-cols-7 gap-px rounded-md bg-white p-1.5">
        {Array.from({ length: 49 }, (_, i) => {
          const x = i % 7;
          const y = Math.floor(i / 7);
          const on = (x < 2 && y < 2) || (x > 4 && y < 2) || (x < 2 && y > 4) || (x * 5 + y * 3 + x * y) % 3 === 0;
          return <span key={i} className={on ? 'bg-black' : ''} />;
        })}
      </div>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="size-1 rounded-full bg-[#a78bfa]" animate={{ opacity: [0.2, 1, 0.2] }} transition={loop(1.2, i * 0.2)} />
        ))}
      </div>
      <div className="h-[74px] w-[38px] overflow-hidden rounded-[9px] border-[3px] border-black shadow-[0_0_0_1px_#3a3a40]">
        <motion.div className="h-full" animate={{ backgroundColor: [PAPER, PAPER, '#dff7ea', PAPER] }} transition={{ ...loop(3), times: [0, 0.55, 0.65, 1] }}>
          <MiniPage lines={3} />
        </motion.div>
      </div>
    </div>
  );
}

function Throttle() {
  const bar = (label: string, time: string, duration: number, color: string) => (
    <div className="flex w-[190px] flex-col gap-1">
      <div className="flex justify-between font-mono text-[10px]">
        <span className="text-muted">{label}</span>
        <span className="text-ghost">{time}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line-soft">
        <motion.span className="block h-full origin-left rounded-full" style={{ background: color }} animate={{ scaleX: [0, 1, 1] }} transition={{ duration, times: [0, 0.85, 1], repeat: Infinity, ease: 'easeOut' }} />
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5">
      {bar('Full speed', '0.4 s', 1.2, '#7dd3a8')}
      {bar('Slow 3G · CPU ×4', '2.9 s', 3.6, '#e6c07b')}
    </div>
  );
}

function Appearance() {
  return (
    <div className="flex items-center gap-4">
      <motion.div className="flex h-[66px] w-[86px] flex-col gap-1 rounded-md p-2 shadow-[0_0_0_1px_#2e2e33]" animate={{ backgroundColor: [PAPER, PAPER, INK, INK, PAPER] }} transition={{ ...loop(4), times: [0, 0.4, 0.5, 0.9, 1] }}>
        <motion.span className="h-1.5 w-1/2 rounded-full" animate={{ backgroundColor: [INK, INK, MINT, MINT, INK] }} transition={{ ...loop(4), times: [0, 0.4, 0.5, 0.9, 1] }} />
        <motion.span className="h-1 w-4/5 rounded-full" animate={{ backgroundColor: ['#cfd3cc', '#cfd3cc', '#40584c', '#40584c', '#cfd3cc'] }} transition={{ ...loop(4), times: [0, 0.4, 0.5, 0.9, 1] }} />
        <motion.span className="h-1 w-3/5 rounded-full" animate={{ backgroundColor: ['#cfd3cc', '#cfd3cc', '#40584c', '#40584c', '#cfd3cc'] }} transition={{ ...loop(4), times: [0, 0.4, 0.5, 0.9, 1] }} />
      </motion.div>
      <motion.span className="font-semibold text-fg" animate={{ fontSize: ['14px', '14px', '26px', '26px', '14px'] }} transition={{ ...loop(4, 0.6), times: [0, 0.4, 0.5, 0.9, 1] }}>
        Aa
      </motion.span>
    </div>
  );
}

function Region() {
  const rows = [
    ['iPhone', 'Tokyo', '18:42', '¥1,234'],
    ['iPad', 'Berlin', '11:42', '1.234,50 €'],
    ['Pixel', 'New York', '05:42', '$1,234.50'],
  ];
  return (
    <div className="relative flex w-[230px] flex-col font-mono text-[10.5px] whitespace-nowrap">
      <motion.span className="absolute inset-x-0 h-[22px] rounded-md bg-[rgba(138,180,248,0.12)] shadow-[inset_0_0_0_1px_rgba(138,180,248,0.3)]" animate={{ y: [0, 0, 22, 22, 44, 44, 0] }} transition={{ ...loop(4.5), times: [0, 0.25, 0.33, 0.58, 0.66, 0.9, 1] }} />
      {rows.map(([d, city, time, money]) => (
        <div key={d} className="relative flex h-[22px] items-center gap-2 px-2">
          <span className="w-11 text-faint">{d}</span>
          <span className="flex-1 text-local">{city}</span>
          <span className="text-muted">{time}</span>
          <span className="w-[64px] text-right text-fg">{money}</span>
        </div>
      ))}
    </div>
  );
}

function Keyboard() {
  return (
    <div className="relative h-[86px] w-[46px] overflow-hidden rounded-[9px] border-[3px] border-black shadow-[0_0_0_1px_#3a3a40]" style={{ background: PAPER }}>
      <motion.div className="flex flex-col gap-1 p-1.5" animate={{ y: [0, 0, -14, -14, 0] }} transition={{ ...loop(3.4), times: [0, 0.3, 0.42, 0.85, 1] }}>
        <span className="h-1 w-2/3 rounded-full" style={{ background: INK }} />
        <span className="h-1 w-full rounded-full bg-[#cfd3cc]" />
        <span className="mt-2 h-3 rounded-sm border border-[#11241c] bg-white" />
        <span className="h-3 rounded-full" style={{ background: INK }} />
      </motion.div>
      <motion.div className="absolute inset-x-0 bottom-0 grid h-[38px] grid-cols-5 gap-[2px] bg-[#d1d3d9] p-[3px]" animate={{ y: [40, 40, 0, 0, 40] }} transition={{ ...loop(3.4), times: [0, 0.3, 0.42, 0.85, 1] }}>
        {Array.from({ length: 15 }, (_, i) => (
          <span key={i} className="rounded-[1px] bg-white" />
        ))}
      </motion.div>
    </div>
  );
}

function Forms() {
  const field = (text: string, delay: number, bad?: boolean) => (
    <div className="flex items-center gap-2">
      <motion.div
        className="flex h-[20px] w-[150px] items-center overflow-hidden rounded-[5px] border bg-[#111114] px-1.5"
        animate={bad ? { borderColor: ['#2a2a2f', '#2a2a2f', '#f28b82', '#f28b82', '#2a2a2f'] } : { borderColor: '#2a2a2f' }}
        transition={{ ...loop(4), times: [0, 0.5, 0.6, 0.92, 1] }}
      >
        <motion.span className="overflow-hidden font-mono text-[10px] whitespace-nowrap text-fg" animate={{ width: ['0%', '0%', '100%', '100%', '0%'] }} transition={{ ...loop(4, delay), times: [0, 0.05, 0.3, 0.92, 1], ease: 'linear' }}>
          {text}
        </motion.span>
      </motion.div>
      {bad && (
        <motion.span className="font-mono text-[9.5px] text-err" animate={{ opacity: [0, 0, 1, 1, 0] }} transition={{ ...loop(4), times: [0, 0.5, 0.6, 0.92, 1] }}>
          no check
        </motion.span>
      )}
    </div>
  );
  return (
    <div className="flex flex-col gap-1.5">
      {field('Jessica Moreau', 0)}
      {field('jessica@studio.co', 0.3)}
      {field('not-a-phone ###', 0.6, true)}
    </div>
  );
}

function Mocks() {
  const row = (path: string, ok: string, bad: string, delay: number) => (
    <div className="flex h-[20px] w-[220px] items-center gap-2 font-mono text-[10.5px]">
      <span className="text-faint">GET</span>
      <span className="flex-1 text-muted">{path}</span>
      <span className="relative h-[20px] w-[78px] text-right leading-[20px] whitespace-nowrap">
        <motion.span className="absolute top-0 right-0 text-ok" animate={{ opacity: [1, 1, 0, 0, 1] }} transition={{ ...loop(4, delay), times: [0, 0.45, 0.5, 0.95, 1] }}>
          {ok}
        </motion.span>
        <motion.span className="absolute top-0 right-0 text-warn" animate={{ opacity: [0, 0, 1, 1, 0] }} transition={{ ...loop(4, delay), times: [0, 0.45, 0.5, 0.95, 1] }}>
          {bad}
        </motion.span>
      </span>
    </div>
  );
  return (
    <div className="flex flex-col gap-1">
      {row('/api/rates', '200 · 84 ms', '503 · mock', 0)}
      {row('/api/user', '200 · 41 ms', '3 s · mock', 0.2)}
      {row('/api/budgets', '200 · 63 ms', 'offline', 0.4)}
    </div>
  );
}

function Inspector() {
  return (
    <div className="relative h-[72px] w-[150px] rounded-md p-2" style={{ background: PAPER }}>
      <span className="block h-2 w-1/3 rounded-full" style={{ background: INK }} />
      <span className="mt-2 block h-4 w-4/5 rounded-sm bg-[#cfd3cc]" />
      <span className="mt-2 block h-4 w-[64px] rounded-full" style={{ background: INK }} />
      <motion.span
        className="absolute rounded-[3px] bg-[rgba(91,141,239,0.15)] shadow-[0_0_0_1.5px_#5b8def]"
        animate={{ left: [6, 6, 6, 6, 6], top: [6, 6, 24, 24, 46], width: [52, 52, 122, 122, 66], height: [10, 10, 18, 18, 18] }}
        transition={{ ...loop(4.2), times: [0, 0.25, 0.4, 0.65, 0.8] }}
      />
      <motion.span className="absolute -top-2.5 right-1 rounded bg-[#5b8def] px-1 font-mono text-[9px] text-white" animate={{ opacity: [1, 0.6, 1] }} transition={loop(1.4)}>
        size · margin · font
      </motion.span>
    </div>
  );
}

function Export() {
  return (
    <div className="relative flex h-[76px] w-[200px] items-center">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute h-[52px] w-[30px] overflow-hidden rounded-[5px] border-2 border-black shadow-[0_0_0_1px_#2e2e33]"
          style={{ left: 8 + i * 38 }}
          animate={{ x: [0, 0, 130 - i * 38, 130 - i * 38, 0], opacity: [1, 1, 0, 0, 1], scale: [1, 1, 0.6, 0.6, 1] }}
          transition={{ ...loop(3.6), times: [0, 0.35, 0.6, 0.75, 1] }}
        >
          <MiniPage lines={3} />
        </motion.div>
      ))}
      <motion.span className="absolute right-2 flex h-[40px] w-[52px] flex-col items-center justify-center rounded-md border border-line bg-card font-mono text-[10px] text-fg" animate={{ scale: [1, 1, 1.12, 1, 1] }} transition={{ ...loop(3.6), times: [0, 0.45, 0.55, 0.65, 1] }}>
        GIF
        <span className="text-[8.5px] text-ghost">PNG · PDF</span>
      </motion.span>
    </div>
  );
}

function Feedback() {
  return (
    <div className="relative h-[70px] w-[120px] -translate-x-[34px] rounded-md" style={{ background: PAPER }}>
      <div className="h-full w-full overflow-hidden rounded-md">
        <MiniPage lines={4} />
      </div>
      <motion.span className="absolute top-[22px] left-[52px] flex size-5 items-center justify-center rounded-full rounded-bl-none bg-[#d97757] font-mono text-[10px] font-bold text-[#1a0e09] shadow-lg" animate={{ y: [-30, 0, 0, 0, -30], opacity: [0, 1, 1, 1, 0] }} transition={{ ...loop(4), times: [0, 0.15, 0.5, 0.9, 1] }}>
        1
      </motion.span>
      <motion.span className="absolute top-[12px] left-[78px] rounded-md border border-line bg-card px-1.5 py-1 text-[9.5px] whitespace-nowrap text-fg shadow-lg" animate={{ opacity: [0, 0, 1, 1, 0, 0], x: [-4, -4, 0, 0, -4, -4] }} transition={{ ...loop(4), times: [0, 0.2, 0.28, 0.5, 0.56, 1] }}>
        Bigger on mobile?
      </motion.span>
      {/* Then it leaves for the team's tracker: GitHub, Linear or Slack. */}
      <span className="absolute top-[8px] -right-[66px] flex flex-col gap-1">
        {(
          [
            ['GitHub', '#c4c4cc', 0.58],
            ['Linear', '#8b93f8', 0.64],
            ['Slack', '#e6c07b', 0.7],
          ] as const
        ).map(([name, color, at]) => (
          <motion.span
            key={name}
            className="flex h-[17px] items-center gap-1 rounded-[5px] border border-line bg-card px-1.5 font-mono text-[9px] whitespace-nowrap"
            style={{ color }}
            animate={{ opacity: [0, 0, 1, 1, 0], x: [-10, -10, 0, 0, -10] }}
            transition={{ ...loop(4), times: [0, at, at + 0.08, 0.9, 1] }}
          >
            → {name}
          </motion.span>
        ))}
      </span>
    </div>
  );
}

function TabOrder() {
  const stops = [
    { x: 14, y: 14, ok: true },
    { x: 58, y: 14, ok: true },
    { x: 14, y: 44, ok: false },
    { x: 58, y: 44, ok: true },
  ];
  return (
    <div className="relative h-[74px] w-[96px] overflow-hidden rounded-[7px] border-[3px] border-black shadow-[0_0_0_1px_#2e2e33]" style={{ background: PAPER }}>
      {stops.map((s, i) => (
        <motion.span
          key={i}
          className="absolute flex size-[18px] items-center justify-center rounded-full font-mono text-[9px] font-semibold text-white"
          style={{ left: s.x, top: s.y, background: s.ok ? '#3b82f6' : '#ef4444' }}
          animate={{ scale: [1, 1, 1.25, 1, 1], opacity: [0.35, 1, 1, 1, 0.35] }}
          transition={{ ...loop(3.2, i * 0.5), times: [0, 0.1, 0.18, 0.3, 1] }}
        >
          {i + 1}
        </motion.span>
      ))}
    </div>
  );
}

function CustomDevice() {
  return (
    <div className="flex items-end gap-3">
      <div className="h-[56px] w-[30px] overflow-hidden rounded-[6px] border-[3px] border-black shadow-[0_0_0_1px_#2e2e33]">
        <MiniPage lines={2} />
      </div>
      <motion.div className="overflow-hidden rounded-[6px] border-[3px] border-dashed border-[#e6c07b]" animate={{ width: [34, 64, 64, 34], height: [56, 46, 46, 56] }} transition={loop(3.6)}>
        <MiniPage lines={2} />
      </motion.div>
      <span className="pb-1 font-mono text-[10px] text-[#e6c07b]">+ device</span>
    </div>
  );
}

function ConsoleBadges() {
  return (
    <div className="flex items-end gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col items-center gap-1.5">
          <div className={`overflow-hidden rounded-[6px] border-[3px] border-black shadow-[0_0_0_1px_#2e2e33] ${i === 2 ? 'h-[40px] w-[56px]' : 'h-[52px] w-[30px]'}`}>
            <MiniPage lines={2} />
          </div>
          <motion.span
            className={`rounded-full px-1.5 font-mono text-[9px] leading-[14px] ${i === 1 ? 'bg-[rgba(242,139,130,0.16)] text-err' : 'bg-[rgba(125,211,168,0.12)] text-ok'}`}
            animate={i === 1 ? { opacity: [0.4, 1, 0.4] } : undefined}
            transition={loop(1.4)}
          >
            {i === 1 ? '2 errors' : '0'}
          </motion.span>
        </div>
      ))}
    </div>
  );
}

function Vitals() {
  const rows = [
    { name: 'LCP', value: '1.1 s', w: '45%' },
    { name: 'CLS', value: '0.02', w: '20%' },
  ];
  return (
    <div className="flex w-[170px] flex-col gap-2.5">
      {rows.map((r, i) => (
        <div key={r.name} className="flex items-center gap-2 font-mono text-[10px]">
          <span className="w-7 text-faint">{r.name}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1c1c21]">
            <motion.span className="block h-full rounded-full bg-ok" animate={{ width: ['0%', r.w, r.w, '0%'] }} transition={{ ...loop(3, i * 0.3), times: [0, 0.4, 0.85, 1] }} />
          </span>
          <span className="w-9 text-right text-fg">{r.value}</span>
        </div>
      ))}
      <span className="font-mono text-[9px] text-ghost">on every device, every load</span>
    </div>
  );
}

export const LAB: { title: string; text: string; anim: () => ReactNode }[] = [
  { title: '10 devices, side by side', text: 'iPhone, Pixel, Galaxy, iPads, laptop, desktop or your own. Portrait or landscape, true sizes.', anim: Devices },
  { title: 'Synced scroll and navigation', text: 'Scroll or click on one, every other device follows. DevTools on each.', anim: Sync },
  { title: 'On your real phone', text: 'A QR code opens localhost over Wi-Fi, hot reload included. Paired, never public.', anim: RealPhone },
  { title: 'Network and CPU throttling', text: '4G or slow 3G, mid-range ×4 or low-end ×6 CPU. Load time and weight under each device.', anim: Throttle },
  { title: 'Appearance', text: 'Dark mode, reduced motion, high contrast, text at 130–200 %, page zoom 200 %. No reload.', anim: Appearance },
  { title: 'Region per device', text: 'Language, timezone and location. The iPhone in Tokyo and the iPad in Berlin, at once.', anim: Region },
  { title: 'Virtual keyboards', text: 'iOS or Android keyboard drawn on the page. visualViewport shrinks like on a phone.', anim: Keyboard },
  { title: 'Form filler', text: 'Valid or junk data in every field of every device. Lists the fields with no validation.', anim: Forms },
  { title: 'Offline and API mocks', text: 'Cut the network or fake any endpoint: status, delay, body. See error, empty and slow states.', anim: Mocks },
  { title: 'Inspector', text: 'Size, margins, font and color of one element on every device, or where it’s hidden.', anim: Inspector },
  { title: 'Export', text: 'A PNG board of every device, a PDF, full pages up to 10,000 px, a WebM or GIF scrolling.', anim: Export },
  { title: 'Feedback and review links', text: 'Pin comments on devices. Send a link to a client: no app, no account. Replies come back. Then to GitHub, Linear or Slack.', anim: Feedback },
  { title: 'Keyboard tab order', text: 'Every Tab stop numbered on every device. No visible focus in red, positive tabindex in orange.', anim: TabOrder },
  { title: 'Custom devices', text: 'Any width, density and type, ordered by drag and drop. One list for every project, or one each.', anim: CustomDevice },
  { title: 'Console per device', text: 'Console messages and failed requests live, with an error badge under the device they came from.', anim: ConsoleBadges },
  { title: 'Web Vitals everywhere', text: 'LCP and CLS measured on each device after every load, with the network and CPU you chose.', anim: Vitals },
];

export function LabTile({ title, text, anim: Anim, index }: { title: string; text: string; anim: () => ReactNode; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay: (index % 4) * 0.05 }}
      className="group flex min-w-0 flex-col gap-3 rounded-[14px] border border-line-soft bg-[#0e0e11] p-3.5 transition-colors hover:border-[#30303a] hover:bg-[#121216]"
    >
      <Stage>
        <Anim />
      </Stage>
      <div className="flex flex-col gap-1.5 px-1 pb-1">
        <h3 className="m-0 text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
        <p className="m-0 text-[13px] leading-normal text-faint">{text}</p>
      </div>
    </motion.div>
  );
}
