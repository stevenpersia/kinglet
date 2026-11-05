import { t } from '@kinglet/core';
import { useEffect, useState } from 'react';
import type { PhoneQr } from '../../shared/types';
import { ENV_DOT, ENV_LABEL, envOf } from '../lib/env';
import { api, cleanError, projectVercel, useStore } from '../store';
import { Dot } from './Icons';
import { CopyButton } from './Mcp';

const btn = 'flex h-8 items-center justify-center rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong disabled:opacity-60';

function deviceName(ua: string) {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad|Macintosh.*Mobile/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? t('Android phone', 'Téléphone Android') : t('Android tablet', 'Tablette Android');
  return t('Browser', 'Navigateur');
}

/** "On my phone": QR code for the page shown, through the local network (local) or directly (preview, prod). */
export function PhoneDialog() {
  const s = useStore();
  const { phoneOpen, phone, url, openOverlay, closeOverlay } = s;
  const [qr, setQr] = useState<PhoneQr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const env = envOf(url, projectVercel(s));
  const local = env === 'local';

  useEffect(() => {
    if (!phoneOpen) return;
    void openOverlay();
    void api().phone.state().then((state) => useStore.setState({ phone: state }));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.setState({ phoneOpen: false });
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      closeOverlay();
    };
  }, [phoneOpen, openOverlay, closeOverlay]);

  // A new QR when the page, the network address or the proxy state changes.
  useEffect(() => {
    if (!phoneOpen || !url) return;
    setQr(null);
    setError(null);
    if (local && !phone?.running) return;
    api()
      .phone.qr(url, local)
      .then(setQr)
      .catch((e) => setError(cleanError(e)));
  }, [phoneOpen, url, local, phone?.running, phone?.address]);

  if (!phoneOpen) return null;
  const close = () => useStore.setState({ phoneOpen: false });
  const set = async (fn: () => Promise<typeof phone>) => {
    setBusy(true);
    try {
      useStore.setState({ phone: await fn() });
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[8vh]" onMouseDown={close}>
      <div role="dialog" aria-label={t('On my phone', 'Sur mon téléphone')} className="w-[640px] overflow-hidden rounded-xl border border-line bg-card shadow-2xl shadow-black/70" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
          <span className="font-semibold">{t('On my phone', 'Sur mon téléphone')}</span>
          <span className="flex items-center gap-2 text-xs text-muted">
            {env && <Dot className={ENV_DOT[env]} />}
            {env ? ENV_LABEL[env] : t('External site', 'Site externe')}
            <button onClick={close} aria-label={t('Close', 'Fermer')} className="ml-2 rounded px-1.5 text-faint hover:bg-active hover:text-fg">
              ✕
            </button>
          </span>
        </div>

        {!url ? (
          <p className="m-0 p-5 text-faint">{t('Open a site in Kinglet first.', 'Ouvre d’abord un site dans Kinglet.')}</p>
        ) : local && !phone?.running ? (
          <div className="flex flex-col gap-3 p-5">
            <p className="m-0 leading-relaxed text-muted">
              {t(
                'Kinglet can make your local server reachable on your Wi-Fi network. Only a device that scans the QR code can see it. Hot reload works on the phone too.',
                'Kinglet peut rendre ton serveur local accessible sur ton réseau Wi-Fi. Seul un appareil qui scanne le QR code pourra le voir. Le rechargement à chaud marche aussi sur le téléphone.',
              )}
            </p>
            <button onClick={() => void set(() => api().phone.start())} disabled={busy} className="flex h-9 items-center justify-center self-start rounded-ui bg-fg px-4 font-semibold text-bg disabled:opacity-60">
              {t('Turn on for the local network', 'Activer sur le réseau local')}
            </button>
          </div>
        ) : (
          <div className="flex gap-5 p-5">
            <div className="flex w-[220px] shrink-0 flex-col gap-2">
              <div className="aspect-square w-full overflow-hidden rounded-lg bg-white p-2">
                {qr ? <div className="size-full [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qr.svg }} /> : <div className="size-full" />}
              </div>
              {qr && <CopyButton text={qr.url} label={t('Copy link', 'Copier le lien')} className="text-xs" />}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3 text-[13px]">
              {error && <p className="m-0 text-err">{error}</p>}
              {local ? (
                <>
                  <p className="m-0 leading-relaxed text-muted">{t('Scan with the phone’s camera, on the same Wi-Fi as this computer.', 'Scanne avec l’appareil photo du téléphone, connecté au même Wi-Fi que cet ordinateur.')}</p>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    {t('Network address', 'Adresse sur le réseau')}
                    <select value={phone?.address ?? ''} onChange={(e) => void set(() => api().phone.setAddress(e.target.value))} className="h-8 rounded-ui border border-line bg-bg px-2 font-mono text-xs text-fg">
                      {phone?.addresses.map((a) => (
                        <option key={a.address} value={a.address}>
                          {a.address}:{phone.port} ({a.iface})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-muted">
                    <input type="checkbox" checked={phone?.follow ?? true} onChange={(e) => void set(() => api().phone.setFollow(e.target.checked))} className="accent-[#ededef]" />
                    {t('The phone follows navigation in Kinglet', 'Le téléphone suit la navigation de Kinglet')}
                  </label>
                  <div className="flex flex-col gap-1">
                    <span className="label">{t('Connected devices', 'Appareils connectés')}</span>
                    {phone?.clients.length ? (
                      phone.clients.map((c) => (
                        <span key={c.id} className="flex items-center gap-2 text-xs text-fg">
                          <Dot className="bg-ok" />
                          {deviceName(c.userAgent)}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-faint">{t('None yet.', 'Aucun pour l’instant.')}</span>
                    )}
                  </div>
                  <details className="text-xs text-muted">
                    <summary className="cursor-pointer text-faint">{t('Phone can’t connect?', 'Le téléphone n’arrive pas à se connecter ?')}</summary>
                    <p className="mt-2 mb-1 leading-relaxed">
                      {t(
                        'Check that both devices are on the same Wi-Fi (not a guest network). If a firewall is on, allow the port:',
                        'Vérifie que les deux appareils sont sur le même Wi-Fi (pas un réseau invité). Si un pare-feu est actif, autorise le port :',
                      )}
                    </p>
                    <code className="block rounded bg-bg px-2 py-1.5 font-mono text-fg">sudo ufw allow {phone?.port}/tcp</code>
                    <code className="mt-1 block rounded bg-bg px-2 py-1.5 font-mono text-fg">sudo firewall-cmd --add-port={phone?.port}/tcp</code>
                  </details>
                  <button onClick={() => void set(() => api().phone.stop())} className={`${btn} self-start text-xs`}>
                    {t('Turn off local sharing', 'Désactiver le partage local')}
                  </button>
                </>
              ) : (
                <>
                  <p className="m-0 leading-relaxed text-muted">{t('This page is online: the QR code opens it directly, on any network.', 'Cette page est en ligne : le QR code l’ouvre directement, sur n’importe quel réseau.')}</p>
                  {qr?.withSecret && (
                    <p className="m-0 rounded-ui border border-warn/30 bg-warn/[0.06] p-2.5 text-xs leading-relaxed text-warn">
                      {t(
                        'Protected preview: the link contains your Vercel bypass secret. Don’t share it beyond your own devices.',
                        'Preview protégée : le lien contient ton secret de contournement Vercel. Ne le partage pas au-delà de tes appareils.',
                      )}
                    </p>
                  )}
                  <code className="font-mono text-xs break-all text-faint">{qr?.url}</code>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
