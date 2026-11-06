import { Icon, Mark } from '../../desktop/src/renderer/components/Icons';
import { DOWNLOAD_URL, PORTAL_URL } from './config';

/**
 * /thanks: where Polar sends buyers once they've paid (the checkout link's Success URL).
 * Static HTML without JavaScript: the key, the download, and how to activate.
 */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 border-t border-line-soft py-6 first:border-t-0">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[#2a2a30] font-mono text-xs text-fg">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
        {children}
      </div>
    </li>
  );
}

const Code = ({ children }: { children: string }) => (
  <code className="block overflow-x-auto rounded-[10px] border border-line-soft bg-[#0d0d10] px-3.5 py-2.5 font-mono text-[12.5px] whitespace-pre text-[#c4c4cc] select-all">{children}</code>
);

const button = 'inline-flex h-10 w-fit items-center gap-2 rounded-[10px] px-4 text-[14px] font-semibold no-underline';

export function Thanks() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[#141418]">
        <div className="mx-auto flex max-w-[1240px] items-center px-4 py-3 sm:px-7">
          <a href="/" className="flex items-center gap-2.5 text-fg no-underline" aria-label="Kinglet, home">
            <Mark size={24} />
            <img src="/wordmark.svg" alt="" width="68" height="21" className="h-[21px] w-auto" />
          </a>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[680px] flex-1 px-4 pt-20 pb-24 sm:px-6">
        <span className="flex size-11 items-center justify-center rounded-full bg-[rgba(125,211,168,0.12)] text-ok">
          <Icon name="check" size={20} />
        </span>
        <h1 className="m-0 mt-6 text-[clamp(32px,5vw,48px)] leading-[1.02] font-semibold tracking-[-0.045em]">Thanks, Kinglet is yours.</h1>
        <p className="m-0 mt-4 text-base leading-relaxed text-muted">Three steps and you’re running. Your license works on up to 3 computers, and every update is included.</p>

        <ol className="m-0 mt-10 list-none rounded-[18px] border border-line-soft bg-[linear-gradient(180deg,#111114,#0b0b0e)] px-6 py-2 sm:px-8">
          <Step n={1} title="Get your license key">
            <p className="m-0 text-[14.5px] leading-relaxed text-muted">
              It’s in your receipt email from Polar, and always in your customer portal (sign in with the email you paid with). It starts with <span className="font-mono text-fg">KINGLET_</span>.
            </p>
            <a href={PORTAL_URL} className={`${button} border border-[#2a2a30] text-fg hover:border-line-strong`}>
              Open the customer portal
              <Icon name="up" size={13} className="rotate-45" />
            </a>
          </Step>
          <Step n={2} title="Download Kinglet">
            <p className="m-0 text-[14.5px] leading-relaxed text-muted">
              Linux: the <b className="font-medium text-fg">AppImage</b> runs on any distribution, the <b className="font-medium text-fg">pacman</b> package is for Arch and CachyOS.
            </p>
            <a href={DOWNLOAD_URL} className={`${button} bg-[linear-gradient(100deg,#f0a07f,#e6c07b)] text-[#1a120b] hover:brightness-110`}>
              <Icon name="download" size={15} />
              Download the latest version
            </a>
            <p className="m-0 text-[13px] text-faint">AppImage: make it executable, then open it.</p>
            <Code>{'chmod +x Kinglet-*.AppImage\n./Kinglet-*.AppImage'}</Code>
            <p className="m-0 text-[13px] text-faint">pacman:</p>
            <Code>{'sudo pacman -U kinglet-*.pacman'}</Code>
          </Step>
          <Step n={3} title="Paste your key">
            <p className="m-0 text-[14.5px] leading-relaxed text-muted">
              On first launch Kinglet asks for the key: paste it, done. Activating needs the internet once; after that Kinglet works offline for up to 14 days at a time. To move to another computer, use Settings → License → Deactivate on this computer.
            </p>
          </Step>
        </ol>

        <p className="m-0 mt-8 text-[13px] leading-relaxed text-ghost">
          Using Claude Code? Once Kinglet is activated, connect it in Settings → Claude in terminal.{' '}
          <a href="/" className="text-faint underline underline-offset-2 hover:text-fg">
            Back to getkinglet.com
          </a>
        </p>
      </main>
    </div>
  );
}
