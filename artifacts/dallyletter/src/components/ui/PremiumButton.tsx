import * as React from "react";
import { cn } from "@/lib/utils";

type PremiumButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "gold" | "outline" | "danger";
};

const PremiumButton = React.forwardRef<HTMLButtonElement, PremiumButtonProps>(
  ({ className, variant = "gold", onClick, children, ...props }, ref) => {
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate?.(8); } catch {}
      }
      onClick?.(event);
    };

    return (
      <button
        ref={ref}
        onClick={handleClick}
        className={cn(
          "premium-button group relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-2xl px-5 text-sm font-semibold",
          "transform-gpu will-change-transform transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC72C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A1931]",
          "disabled:pointer-events-none disabled:opacity-50",
          variant === "gold" && "bg-[#FFC72C] text-[#0A1931] shadow-[0_10px_30px_rgba(255,199,44,0.16)] hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(255,199,44,0.24)] active:translate-y-0",
          variant === "outline" && "border border-[#FFC72C]/70 bg-[#0A1931] text-white hover:-translate-y-0.5 hover:bg-[#12243E]",
          variant === "danger" && "border border-red-400/50 bg-[#35151A] text-red-100 hover:-translate-y-0.5",
          className,
        )}
        {...props}
      >
        <span className="relative z-10 flex items-center gap-2">{children}</span>
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 200 52" preserveAspectRatio="none" fill="none">
          <rect x="1" y="1" width="198" height="50" rx="15" pathLength="1" className="premium-button__stroke" stroke="#FFC72C" strokeWidth="1.5" />
        </svg>
      </button>
    );
  },
);
PremiumButton.displayName = "PremiumButton";

export { PremiumButton };
