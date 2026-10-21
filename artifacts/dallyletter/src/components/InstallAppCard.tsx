import { useEffect, useState } from "react";
import { Download, ExternalLink, Smartphone, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

// This stable GitHub Releases URL is populated by the release workflow.
const ANDROID_APK_URL = "https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/releases/latest/download/dallyletter-v1.0.1.apk";

export function InstallAppCard() {
  const { prompt, install, isInstalled, isIOS } = useInstallPrompt();
  const [showHelp, setShowHelp] = useState(false);
  const [installError, setInstallError] = useState("");
  const [standalone, setStandalone] = useState(false);
  const isAndroid = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

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
          <div><h2 className="font-semibold">Dallyletter Elidems mobile app</h2><p className="text-sm text-muted-foreground">{installed ? "Installed on this device." : "Install the app or download the Android installer directly."}</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {installed ? <>
            <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Installed</span>
            <Button type="button" variant="outline" onClick={() => { window.location.href = "/"; }}><ExternalLink className="mr-2 h-4 w-4" />Open app</Button>
          </> : <>
            {prompt && <Button type="button" onClick={() => { setInstallError(""); void install().catch(error => setInstallError(error instanceof Error ? error.message : "Browser installation could not be started.")); }}><Smartphone className="mr-2 h-4 w-4" />Install app</Button>}
            {isAndroid && <Button asChild variant={prompt ? "outline" : "default"}><a href={ANDROID_APK_URL} download="dallyletter-v1.0.1.apk"><Download className="mr-2 h-4 w-4" />Download Android APK</a></Button>}
            {!prompt && !isAndroid && <Button type="button" onClick={() => setShowHelp(true)}><Download className="mr-2 h-4 w-4" />Install app</Button>}
          </>}
        </div>
        {!installed && <Button type="button" variant="ghost" size="sm" onClick={() => setShowHelp(v => !v)}>Installation help</Button>}
        {installError && <p role="alert" className="basis-full text-sm text-destructive">{installError}</p>}
        {showHelp && !installed && <div className="basis-full rounded-lg bg-background/80 p-3 text-sm text-muted-foreground">
          {isIOS ? "iOS does not allow websites to force installation. Open this page in Safari and use Share → Add to Home Screen." : "The APK download saves the installer; Android will ask you to confirm installation and may ask you to allow installs from this browser. Only install APKs from the official Dallyletter release."}
          <Button className="ml-2" variant="ghost" size="sm" onClick={() => setShowHelp(false)}>Close</Button>
        </div>}
      </CardContent>
    </Card>
  );
}
