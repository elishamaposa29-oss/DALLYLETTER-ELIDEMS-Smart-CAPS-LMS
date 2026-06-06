import { useState } from "react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { GraduationCap, X, Share, MoreVertical, PlusSquare, Smartphone } from "lucide-react";

export function InstallBanner() {
  const { prompt, install, isInstalled, isIOS } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("install_banner_dismissed") === "1";
  });
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem("install_banner_dismissed", "1");
  };

  // Already installed or dismissed — show nothing
  if (isInstalled || dismissed) return null;
  // Desktop (no prompt, no iOS) — show nothing
  if (!prompt && !isIOS) return null;

  return (
    <>
      {/* Main banner */}
      <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto">
        <div className="bg-[#0a1628] text-white rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
          <div className="flex items-center gap-3 p-4">
            <div className="bg-gradient-to-br from-amber-400 to-amber-600 p-2.5 rounded-xl shrink-0 shadow-lg">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight">Install DallyLetter</p>
              <p className="text-white/55 text-xs mt-0.5 leading-snug">
                Add to your home screen for quick access — works offline too
              </p>
            </div>
            <button
              onClick={dismiss}
              className="text-white/40 hover:text-white/80 transition-colors p-1 shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-4 pb-4 flex gap-2">
            {isIOS ? (
              <button
                onClick={() => setShowIOSGuide(true)}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Smartphone className="h-4 w-4" />
                How to Install
              </button>
            ) : (
              <button
                onClick={install}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <PlusSquare className="h-4 w-4" />
                Add to Home Screen
              </button>
            )}
            <button
              onClick={dismiss}
              className="px-4 bg-white/10 hover:bg-white/15 text-white/70 font-medium text-sm py-2.5 rounded-xl transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>

      {/* iOS step-by-step guide */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="bg-[#0a1628] p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-amber-400 to-amber-600 p-2 rounded-xl">
                  <GraduationCap className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold text-base">Install on iPhone</p>
                  <p className="text-white/50 text-xs">3 quick steps</p>
                </div>
              </div>
              <button onClick={() => setShowIOSGuide(false)} className="text-white/40 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {[
                {
                  step: "1",
                  icon: Share,
                  color: "bg-blue-500",
                  title: "Tap the Share button",
                  desc: "The box-with-arrow icon at the bottom of your Safari browser bar",
                },
                {
                  step: "2",
                  icon: PlusSquare,
                  color: "bg-emerald-500",
                  title: 'Tap "Add to Home Screen"',
                  desc: "Scroll down in the share menu until you see this option",
                },
                {
                  step: "3",
                  icon: GraduationCap,
                  color: "bg-amber-500",
                  title: 'Tap "Add" to confirm',
                  desc: 'DallyLetter will appear on your home screen like a real app',
                },
              ].map(({ step, icon: Icon, color, title, desc }) => (
                <div key={step} className="flex gap-4">
                  <div className={`${color} h-9 w-9 rounded-full flex items-center justify-center shrink-0 shadow-md`}>
                    <Icon className="h-4.5 w-4.5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{title}</p>
                    <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-2">
                <p className="text-amber-800 text-xs font-medium">
                  ⚠️ Make sure you're using <strong>Safari</strong> — Chrome on iPhone doesn't support home screen install.
                </p>
              </div>

              <button
                onClick={() => { setShowIOSGuide(false); dismiss(); }}
                className="w-full bg-[#0a1628] text-white font-semibold py-3 rounded-xl text-sm"
              >
                Got it, thanks!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
