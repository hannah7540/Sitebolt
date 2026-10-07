export default function TechAmbientBackdrop({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="relative isolate overflow-hidden bg-[#13171B]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(19,23,27,0.55), rgba(19,23,27,0.82)), linear-gradient(#1F2429 1px, transparent 1px), linear-gradient(90deg, #1F2429 1px, transparent 1px)",
          backgroundSize: "auto, 32px 32px, 32px 32px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-28 h-[28rem] w-[28rem] rounded-full bg-[#FF6B00]/25 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-24 h-80 w-80 rounded-full bg-[#38BDF8]/18 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-[#FF8533]/20 blur-[110px]"
      />
      <div className={`relative z-10 ${className}`}>{children}</div>
    </div>
  );
}
