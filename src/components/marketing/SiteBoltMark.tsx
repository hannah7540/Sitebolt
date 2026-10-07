export default function SiteBoltMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polygon
        points="24,3 43,13.5 43,34.5 24,45 5,34.5 5,13.5"
        fill="#1F2429"
        stroke="#FF6B00"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M27.8 12.2 15.6 26.2h8.1l-4.2 9.6 13.4-15.2h-8.2l3.1-8.4Z"
        fill="#FF6B00"
      />
    </svg>
  );
}

export { SiteBoltMark };
