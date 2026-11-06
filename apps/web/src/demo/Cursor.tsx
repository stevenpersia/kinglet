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
            className="absolute -top-4 -left-4 size-8 rounded-full border-2 border-[#d97757]"
            initial={{ scale: 0.3, opacity: 0.9 }}
            animate={{ scale: 1.4, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>
      <motion.div
        key={`p${cmd.click}`}
        className="relative"
        initial={{ scale: cmd.click ? 0.8 : 1 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
        style={{ originX: 0.15, originY: 0.1 }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" className="-mt-0.5 -ml-0.5 drop-shadow-[0_4px_10px_rgba(0,0,0,0.55)]">
          <path
            d="M4.2 2.9c-.5-.2-1 .3-.8.8l6.3 16.6c.2.5.9.5 1.1 0l2.3-6.3c.1-.3.3-.5.6-.6l6.3-2.3c.5-.2.5-.9 0-1.1L4.2 2.9Z"
            fill="#ededef"
            stroke="#0a0a0b"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
        <span className="absolute top-[19px] left-[17px] rounded-full rounded-tl-[3px] bg-[#d97757] px-2 py-[3px] text-[11px] leading-none font-semibold whitespace-nowrap text-[#1a0e09] shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
          You
        </span>
      </motion.div>
      <AnimatePresence>
        {cmd.key && (
          <motion.span
            key={cmd.key.id}
            className="absolute top-11 left-4 rounded-md border border-[#3a3a42] border-b-[3px] bg-[#1c1c21] px-2 py-0.5 font-mono text-[11px] whitespace-nowrap text-fg shadow-lg"
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
