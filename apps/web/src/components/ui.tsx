import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/** Fades and lifts its content in when it scrolls into view (once). */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function SectionHead({ id, n, eyebrow, title, dim, children }: { id: string; n: string; eyebrow: string; title: string; dim: string; children: ReactNode }) {
  return (
    <div id={id} className="flex flex-col gap-4">
      <Reveal>
        <span className="inline-flex items-center gap-2.5 font-mono text-xs tracking-[0.08em] text-faint uppercase">
          <b className="rounded-md border border-[#2a2a30] px-1.5 font-medium text-fg">{n}</b>
          {eyebrow}
        </span>
      </Reveal>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <Reveal className="max-w-[720px]">
          <h2 className="m-0 text-[clamp(34px,4.8vw,60px)] leading-none font-semibold tracking-[-0.05em]">
            {title}
            <br />
            <span className="bg-[linear-gradient(92deg,#f0a07f,#e6c07b_70%)] bg-clip-text text-transparent">{dim}</span>
          </h2>
        </Reveal>
        <Reveal delay={0.08} className="max-w-[440px]">
          <p className="m-0 text-base leading-relaxed text-muted">{children}</p>
        </Reveal>
      </div>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card-surface relative min-w-0 overflow-hidden rounded-[18px] transition-colors hover:border-[#2f2f36] ${className}`}>{children}</div>;
}

export function Tag({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className="font-mono text-xs tracking-[0.04em] uppercase" style={{ color }}>
      {children}
    </span>
  );
}

export function ButtonLink({ href, children, primary, className = '' }: { href: string; children: ReactNode; primary?: boolean; className?: string }) {
  return (
    <a
      href={href}
      className={`inline-flex h-12 items-center gap-2.5 rounded-[10px] px-5 font-semibold no-underline transition-colors ${
        primary ? 'bg-[linear-gradient(100deg,#f0a07f,#e6c07b)] text-[#1a120b] hover:brightness-110' : 'border border-[#26262c] bg-[#0f0f12] font-medium text-fg hover:border-line-strong'
      } ${className}`}
    >
      {children}
    </a>
  );
}
