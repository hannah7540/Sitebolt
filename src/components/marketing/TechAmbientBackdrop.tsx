export default function TechAmbientBackdrop({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="relative isolate overflow-hidden bg-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "linear-gradient(#0F172A 1px, transparent 1px), linear-gradient(90deg, #0F172A 1px, transparent 1px)",
          backgroundSize: "32px 32px, 32px 32px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-28 h-[28rem] w-[28rem] rounded-full bg-[#FF6B00]/12 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-24 h-80 w-80 rounded-full bg-slate-400/15 blur-[120px]"
      />
      <div className={`relative z-10 ${className}`}>{children}</div>
    </div>
  );
}
