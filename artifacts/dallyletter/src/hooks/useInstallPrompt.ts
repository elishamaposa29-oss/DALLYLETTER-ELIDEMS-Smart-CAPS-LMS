import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const promptSubscribers = new Set<(event: BeforeInstallPromptEvent | null) => void>();
const notifyPromptSubscribers = () => promptSubscribers.forEach(subscriber => subscriber(deferredInstallPrompt));

export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(deferredInstallPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);
    const checkInstalled = () => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches
        || (navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(standalone);
    };
    const onPrompt = (event: Event) => {
      event.preventDefault();
      deferredInstallPrompt = event as BeforeInstallPromptEvent;
      notifyPromptSubscribers();
    };
    const onInstalled = () => {
      deferredInstallPrompt = null;
      setIsInstalled(true);
      notifyPromptSubscribers();
    };
    const onPromptChange = (event: BeforeInstallPromptEvent | null) => setPrompt(event);

    checkInstalled();
    setPrompt(deferredInstallPrompt);
    promptSubscribers.add(onPromptChange);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("pageshow", checkInstalled);
    window.addEventListener("focus", checkInstalled);
    return () => {
      promptSubscribers.delete(onPromptChange);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("pageshow", checkInstalled);
      window.removeEventListener("focus", checkInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredInstallPrompt) {
      if ("serviceWorker" in navigator) await navigator.serviceWorker.ready.catch(() => undefined);
      throw new Error("Chrome has not offered its native install prompt for this visit yet. The browser controls whether installation can be started.");
    }
    const event = deferredInstallPrompt;
    await event.prompt();
    const result = await event.userChoice;
    deferredInstallPrompt = null;
    notifyPromptSubscribers();
    if (result.outcome === "accepted") setIsInstalled(true);
    return result.outcome;
  };

  return { prompt, install, isInstalled, isIOS };
}
