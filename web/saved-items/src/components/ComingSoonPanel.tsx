"use client";

interface ComingSoonPanelProps {
  title: string;
  description: string;
}

export function ComingSoonPanel({ title, description }: ComingSoonPanelProps) {
  return (
    <div className="mx-3 mt-8 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-6 py-14 text-center">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9c40bf] uppercase">
        Sắp có
      </p>
      <h2 className="mt-2 text-[20px] font-medium text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-white/50">
        {description}
      </p>
    </div>
  );
}
