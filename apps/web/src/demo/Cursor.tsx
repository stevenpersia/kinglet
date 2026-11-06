import { AnimatePresence, motion } from 'motion/react';
import { type RefObject, useLayoutEffect, useState } from 'react';

export type CursorCmd = { target: string | null; click: number; key: { id: number; label: string } | null };

/**
 * A pointer that glides to an element of the app window (data-target="…") and clicks it.
 * Positions are measured in the window's own 1200 px space, whatever the hero's scale.
 */
export function Cursor({ root, cmd, width = 1200 }: { root: RefObject<HTMLDivElement | null>; cmd: CursorCmd; width?: number }) {
  const [pos, setPos] = useState({ x: 620, y: 420 });

  useLayoutEffect(() => {
    const host = root.current;
    if (!host || !cmd.target) return;
    const el = host.querySelector<HTMLElement>(`[data-target="${cmd.target}"]`);
    if (!el) return;
    const h = host.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const k = h.width / width || 1;
    setPos({ x: (r.left + r.width / 2 - h.left) / k, y: (r.top + r.height / 2 - h.top) / k });
  }, [cmd.target, root, width]);

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-[80]"
      initial={false}
      animate={{ x: pos.x, y: pos.y }}
      transition={{ type: 'spring', stiffness: 90, damping: 18, mass: 0.9 }}
    >
      <AnimatePresence>
        {cmd.click > 0 && (
          <motion.span
            key={cmd.click}
            className="absolute -top-4 -left-4 size-8 rounded-full border-2 border-white/80"
            initial={{ scale: 0.3, opacity: 0.9 }}
            animate={{ scale: 1.4, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>
      <motion.svg
        key={`p${cmd.click}`}
        width="22"
        height="22"
        viewBox="0 0 24 24"
        className="-mt-px -ml-px drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
        initial={{ scale: cmd.click ? 0.82 : 1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.25 }}
      >
        <path d="M3 2.5 L3 19 L7.6 14.8 L10.6 21.3 L13.4 20 L10.5 13.7 L16.8 13.7 Z" fill="#fff" stroke="#000" strokeWidth="1.3" strokeLinejoin="round" />
      </motion.svg>
      <AnimatePresence>
        {cmd.key && (
          <motion.span
            key={cmd.key.id}
            className="absolute top-6 left-4 rounded-md border border-[#3a3a42] border-b-[3px] bg-[#1c1c21] px-2 py-0.5 font-mono text-[11px] whitespace-nowrap text-fg shadow-lg"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            ⏎ {cmd.key.label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
