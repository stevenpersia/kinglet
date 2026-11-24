import { Icon } from '../../../desktop/src/renderer/components/Icons';
import { DOWNLOAD_URL } from '../config';

/** The latest release on GitHub: the AppImage and the pacman package. */
export function DownloadButton({ className = '' }: { className?: string }) {
  return (
    <a
      href={DOWNLOAD_URL}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-[10px] px-5 text-[15px] font-semibold no-underline bg-[linear-gradient(100deg,#f0a07f,#e6c07b)] text-[#1a120b] hover:brightness-110 ${className}`}
    >
      <Icon name="download" size={16} />
      Download for Linux · free
    </a>
  );
}
