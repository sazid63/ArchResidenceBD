import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { Button, Card } from "../ui/kit";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const { t, lang } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    if (isStandalone) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShow(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setShow(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('pwa-dismissed', Date.now().toString());
  };

  // Don't show if installed, dismissed recently, or no prompt
  if (isInstalled || !show || !deferredPrompt) return null;

  // Check if dismissed in last 7 days
  const dismissed = localStorage.getItem('pwa-dismissed');
  if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) {
    return null;
  }

  return (
    <Card
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 1000,
        maxWidth: '360px',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--primary-soft)'
      }}
      role="dialog"
      aria-labelledby="pwa-install-title"
      aria-describedby="pwa-install-desc"
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <h4 id="pwa-install-title" style={{ margin: '0 0 4px', fontSize: '14px' }}>
            {lang === 'bn' ? 'অ্যাপ ইনস্টল করুন' : 'Install ArchResidenceBD'}
          </h4>
          <p id="pwa-install-desc" style={{ margin: 0, fontSize: '12px', opacity: 0.8 }}>
            {lang === 'bn'
              ? 'অফলাইনেও কাজ করুন, হোম স্ক্রিন থেকে দ্রুত খুলুন'
              : 'Work offline, open instantly from home screen'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <Button
            variant="ghost"
            onClick={handleDismiss}
            style={{ padding: '4px 8px', fontSize: '12px' }}
            aria-label={lang === 'bn' ? 'পরের জন্যে' : 'Not now'}
          >
            {lang === 'bn' ? 'না' : 'Not now'}
          </Button>
          <Button
            variant="primary"
            onClick={handleInstall}
            style={{ padding: '4px 12px', fontSize: '12px' }}
            aria-label={lang === 'bn' ? 'অ্যাপ ইনস্টল করুন' : 'Install the app'}
          >
            {lang === 'bn' ? 'ইনস্টল' : 'Install'}
          </Button>
        </div>
      </div>
    </Card>
  );
}