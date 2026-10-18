import { useEffect, useState } from "react";
import { Download, ExternalLink, Smartphone, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

export function InstallAppCard() {
  const { prompt, install, isInstalled, isIOS } = useInstallPrompt();
  const [showHelp, setShowHelp] = useState(false);
  const [installError, setInstallError] = useState("");
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const check = () => setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);
    check();
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);
    return () => { window.removeEventListener("pageshow", check); window.removeEventListener("focus", check); };
  }, []);

  const installed = isInstalled || standalone;
  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-r from-primary/5 via-card to-amber-500/10">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Smartphone className="h-6 w-6" /></div>
          <div><h2 className="font-semibold">Dallyletter Elidems mobile app</h2><p className="text-sm text-muted-foreground">{installed ? "Installed on this device." : "Install for faster access and reduced repeat data usage."}</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {installed ? <>
            <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Installed</span>
            <Button type="button" variant="outline" onClick={() => { window.location.href = "/"; }}> <ExternalLink className="mr-2 h-4 w-4" />Open app</Button>
          </> : <Button type="button" onClick={() => { setInstallError(""); void install().catch(error => setInstallError(error instanceof Error ? error.message : "This browser has not made native installation available.")); }}><Download className="mr-2 h-4 w-4" />Install app</Button> }
        </div>
        {!installed && <Button type="button" variant="ghost" size="sm" onClick={() => setShowHelp(v => !v)}>Compatibility help</Button>}
        {installError && <p role="alert" className="basis-full text-sm text-destructive">{installError}</p>
        {showHelp && !installed && <div className="basis-full rounded-lg bg-background/80 p-3 text-sm text-muted-foreground">
          {isIOS ? "iOS does not expose a website API that can force installation. Open this page in Safari and use Share → Add to Home Screen." : "Android Chrome controls whether it can show a native install prompt. If it has not offered one, update Chrome, open this site directly in Chrome over HTTPS, and check the browser menu. The app cannot force Chrome to install without that browser approval."}
          <Button className="ml-2" variant="ghost" size="sm" onClick={() => setShowHelp(false)}>Close</Button>
        </div>}
      </CardContent>
    </Card>
  );
}
