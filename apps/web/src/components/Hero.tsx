import { motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../desktop/src/renderer/components/Icons';
import { DOWNLOAD, MCP_COMMAND } from '../config';
import { AppWindow } from '../demo/AppWindow';
import { Cursor, type CursorCmd } from '../demo/Cursor';
import { type DemoState, duration, finalState, initial, SCRIPTS, type SceneId } from '../demo/scenes';
import { ButtonLink } from './ui';

const SCENES: { id: SceneId; label: string; color: string; caption: string }[] = [
  { id: 'inspect', label: 'Inspect', color: '#8ab4f8', caption: 'Turn on the inspector, hover an element: it lights up on every device. Keep it, “Ask Claude”, press Enter.' },
  { id: 'console', label: 'Console', color: '#f28b82', caption: 'Errors and failed requests from every device in one drawer. “Send to Claude” hands them over; Claude fixes, then reads the console again.' },
  { id: 'devices', label: 'Device tools', color: '#c6f432', caption: 'Slow 3G, the iOS keyboard, Tokyo: real-world conditions on every device at once. Then Claude fixes what they reveal.' },
  { id: 'phone', label: 'On my phone', color: '#a78bfa', caption: 'Share the dev server on the Wi-Fi, scan the code: your real phone shows localhost, with hot reload.' },
  { id: 'share', label: 'Share previews', color: '#53bdeb', caption: 'Your link as WhatsApp, LinkedIn, Slack, X or Google show it, read by their own bots. Then the fix, by Claude.' },
  { id: 'checks', label: 'Checks', color: '#7dd3a8', caption: '37 checks on every render: SEO, share, mobile, accessibility, performance. Each failure goes to Claude in one click.' },
  { id: 'deploy', label: 'Deploy', color: '#e6c07b', caption: 'Claude pushes, the Vercel preview is ready: open it from the address bar with its pull request and CI, then compare with prod.' },
];
const WIDTH = 1200;
const HEIGHT = 660;

/** Scales the fixed-size app window to the width it is given. */
function useFit() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / WIDTH)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, scale };
}

export function Hero() {
  const [scene, setScene] = useState<SceneId>('inspect');
  const [state, setState] = useState<DemoState>(() => initial('inspect'));
  const [cmd, setCmd] = useState<CursorCmd>({ target: null, click: 0, key: null });
  const [auto, setAuto] = useState(true);
  const [run, setRun] = useState(0);
  const { ref, scale } = useFit();
  const win = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-15%' });

  // Plays the current scene's timeline; then the next scene, until someone picks one.
  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setState(finalState(scene));
      return;
    }
    setState(initial(scene));
    setCmd((c) => ({ ...c, target: 'stage', key: null }));
    const timers = SCRIPTS[scene].flatMap((step) => {
      const t = [
        setTimeout(() => {
          if (step.set) setState((prev) => ({ ...prev, ...step.set }));
          setCmd((c) => ({ target: step.to ?? c.target, click: step.click ? c.click + 1 : c.click, key: step.key ? { id: c.click * 100 + step.at, label: step.key } : c.key }));
        }, step.at),
      ];
      if (step.key) t.push(setTimeout(() => setCmd((c) => ({ ...c, key: null })), step.at + 900));
      return t;
    });
    if (auto) timers.push(setTimeout(() => setScene((id) => SCENES[(SCENES.findIndex((x) => x.id === id) + 1) % SCENES.length]!.id), duration(scene)));
    return () => timers.forEach(clearTimeout);
  }, [scene, run, inView, auto]);

  const current = SCENES.find((m) => m.id === scene)!;
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(MCP_COMMAND).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <section id="top" className="relative px-4 pt-20 sm:px-6 sm:pt-24">
      <div aria-hidden="true" className="hairline-grid absolute inset-0 [mask-image:radial-gradient(ellipse_65%_50%_at_50%_20%,#000_10%,transparent_75%)]" />
      <div aria-hidden="true" className="absolute top-[560px] left-1/2 h-[420px] w-[min(1000px,100%)] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(217,119,87,0.16),rgba(138,180,248,0.08)_55%,transparent)]" />

      <div className="relative mx-auto flex max-w-[1240px] flex-col items-center gap-6 text-center">
        <motion.a
          href="#ai"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-[#24242a] bg-[#0f0f12] py-1 pr-3 pl-1 text-[13px] text-[#c4c4cc] no-underline hover:border-line-strong"
        >
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#2a1a14] px-2 py-0.5 font-medium text-[#f0a07f]">
            <Icon name="spark" size={12} />
            Claude Code inside
          </span>
          <span className="truncate">Point at anything, Claude fixes it on every device</span>
        </motion.a>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="m-0 max-w-[1040px] text-[clamp(44px,7.2vw,96px)] leading-[0.95] font-semibold tracking-[-0.058em]"
        >
          The dev environment
          <br />
          for{' '}
          <span className="bg-[linear-gradient(92deg,#f0a07f_0%,#e6c07b_45%,#ededef_90%)] bg-clip-text text-transparent">vibe coding.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="m-0 max-w-[680px] text-[19px] leading-[1.55] text-muted"
        >
          Build with Claude, watch it land on 10 devices at once, point at what’s wrong and let Claude fix it. Then ship through GitHub and Vercel with 37 checks watching your back.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }} className="flex flex-wrap justify-center gap-2.5">
          <ButtonLink href={DOWNLOAD} primary>
            <Icon name="download" size={16} />
            Download for Linux
          </ButtonLink>
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-12 max-w-full cursor-pointer items-center gap-3 rounded-[10px] border border-[#26262c] bg-[#0f0f12] px-4 text-fg hover:border-line-strong"
            aria-label="Copy the command that connects Kinglet to Claude Code"
          >
            <span className="truncate font-mono text-[13px] text-[#c4c4cc]">
              <span className="text-ghost">$</span> claude mcp add kinglet
            </span>
            <span className="rounded-[5px] border border-[#26262c] px-1.5 font-mono text-[11px] text-ghost">{copied ? 'copied' : 'copy'}</span>
          </button>
        </motion.div>
        <p className="m-0 font-mono text-xs text-ghost">Linux · AppImage &amp; pacman (Arch, CachyOS) · automatic updates</p>
      </div>

      <div className="relative mx-auto mt-14 flex max-w-[1200px] flex-col items-center gap-3.5">
        <div role="tablist" aria-label="What Kinglet does" className="flex flex-wrap justify-center gap-1 rounded-xl border border-[#1e1e23] bg-[#0f0f12] p-1">
          {SCENES.map((m) => {
            const on = m.id === scene;
            return (
              <button
                key={m.id}
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setAuto(false);
                  setScene(m.id);
                  setRun((r) => r + 1);
                }}
                className={`relative inline-flex h-9 cursor-pointer items-center gap-2 rounded-[9px] border-0 bg-transparent px-3.5 text-sm font-medium transition-colors ${on ? 'text-fg' : 'text-faint hover:text-muted'}`}
              >
                {on && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-[9px] bg-[#1e1e23] shadow-[inset_0_0_0_1px_#2e2e35]" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
                <span className="relative size-[7px] rounded-full" style={{ background: m.color, opacity: on ? 1 : 0.45 }} />
                <span className="relative">{m.label}</span>
                {on && (
                  <motion.span
                    key={`${scene}${run}`}
                    aria-hidden="true"
                    className="absolute right-3 bottom-1 left-3 h-px origin-left bg-[#3a3a42]"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: duration(scene) / 1000, ease: 'linear' }}
                  />
                )}
              </button>
            );
          })}
        </div>
        <motion.p key={scene} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="m-0 min-h-12 max-w-[640px] text-center text-sm text-faint">
          {current.caption}
        </motion.p>
      </div>

      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative mx-auto mt-5 w-full max-w-[1200px]"
        style={{ height: HEIGHT * scale }}
      >
        <div
          role="img"
          aria-label={`Kinglet showing the Tidal site on an iPhone 16 and a laptop, with Claude Code on the side. ${current.caption}`}
          className="absolute top-0 left-0 origin-top-left"
          style={{ transform: `scale(${scale})`, width: WIDTH }}
        >
          <AppWindow ref={win} s={state}>
            <Cursor root={win} cmd={cmd} />
          </AppWindow>
        </div>
      </motion.div>
    </section>
  );
}
