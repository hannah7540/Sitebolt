export default function TechAmbientBackdrop({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="relative isolate overflow-hidden bg-[#0B1120]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, #38BDF8 1px, transparent 0), linear-gradient(#38BDF8 1px, transparent 1px), linear-gradient(90deg, #38BDF8 1px, transparent 1px)",
          backgroundSize: "24px 24px, 48px 48px, 48px 48px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[32rem] w-[40rem] -translate-x-1/2 rounded-full bg-[#2563EB]/25 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-28 h-[28rem] w-[28rem] rounded-full bg-[#38BDF8]/12 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-24 h-80 w-80 rounded-full bg-[#F97316]/10 blur-[120px]"
      />
      <div className={`relative z-10 ${className}`}>{children}</div>
    </div>
  );
}
