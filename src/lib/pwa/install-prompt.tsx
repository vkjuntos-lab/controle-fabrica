import * as React from "react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallButton() {
  const [evt, setEvt] = React.useState<BIP | null>(null);
  const [installed, setInstalled] = React.useState(false);

  React.useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e as BIP); };
    const onInst = () => { setInstalled(true); setEvt(null); };
    window.addEventListener("beforeinstallprompt", on);
    window.addEventListener("appinstalled", onInst);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", on);
      window.removeEventListener("appinstalled", onInst);
    };
  }, []);

  if (installed || !evt) return null;
  return (
    <button
      onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); }}
      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
    >
      📲 Instalar app
    </button>
  );
}
