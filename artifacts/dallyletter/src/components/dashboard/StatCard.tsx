import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ElementType;
  description?: string;
  trend?: string;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, description, trend, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[24px] border border-[#FFC72C]/55 bg-[#12243E] p-5 text-white",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_30px_rgba(0,0,0,0.16)]",
        "transform-gpu transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        "hover:-translate-y-1 hover:scale-[1.015] hover:shadow-[0_0_0_2px_#FFC72C,0_0_20px_rgba(255,199,44,0.2)]",
        "active:scale-[0.985] motion-reduce:transform-none",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#FFC72C]/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#FFC72C]/45 bg-[#0A1931] text-[#FFC72C] shadow-[0_0_18px_rgba(255,199,44,0.12)]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {trend && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#FFC72C]/25 bg-[#FFC72C]/10 px-2 py-1 text-[10px] font-bold text-[#FFC72C]">
            <ArrowUpRight className="h-3 w-3" />{trend}
          </span>
        )}
      </div>
      <p className="relative mt-5 text-3xl font-black tracking-tight text-white">{value}</p>
      <p className="relative mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[#FFF8E1]/70">{label}</p>
      {description && <p className="relative mt-2 text-xs text-white/50">{description}</p>}
    </div>
  );
}
