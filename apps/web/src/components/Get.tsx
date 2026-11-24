import { Icon } from '../../../desktop/src/renderer/components/Icons';
import { CHECKOUT_URL, DOWNLOAD_URL, FREE, LAUNCH_PRICE, PRICE } from '../config';
import { useLaunchOffer } from '../launchOffer';
import { WaitlistForm } from './Waitlist';

/** Polar's checkout (merchant of record: VAT handled), which hands out the license key. The launch discount is preset on the link. */
export function BuyButton({ className = '' }: { className?: string }) {
  const offer = useLaunchOffer();
  return (
    <a
      href={CHECKOUT_URL!}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-[10px] px-5 text-[15px] font-semibold no-underline bg-[linear-gradient(100deg,#f0a07f,#e6c07b)] text-[#1a120b] hover:brightness-110 ${className}`}
    >
      Buy Kinglet · {offer ? LAUNCH_PRICE.label : PRICE.label}
      <Icon name="up" size={14} className="rotate-90" />
    </a>
  );
}

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

/** Free: the download. Paid (later): the launch list before launch, the checkout after. */
export function GetKinglet({ align = 'center' }: { align?: 'center' | 'stretch' }) {
  const className = align === 'stretch' ? 'w-full' : '';
  if (FREE) return <DownloadButton className={className} />;
  return CHECKOUT_URL ? <BuyButton className={className} /> : <WaitlistForm align={align} />;
}
