export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      role="img"
      aria-label="Caltrack"
      className={className}
    >
      <rect width="512" height="512" rx="112" fill="currentColor" />
      <path
        d="M180 137c-47 0-80 36-80 88v62c0 52 33 88 80 88h34"
        fill="none"
        stroke="var(--surface)"
        strokeWidth="31"
        strokeLinecap="round"
      />
      <path
        d="M192 148v216M236 148v216M280 148v216"
        fill="none"
        stroke="var(--surface)"
        strokeWidth="25"
        strokeLinecap="round"
      />
      <path
        d="M337 151v96c0 34 27 61 61 61h15v56"
        fill="none"
        stroke="var(--surface)"
        strokeWidth="31"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="358" cy="205" r="18" fill="var(--accent-soft)" />
      <circle cx="413" cy="365" r="14" fill="var(--accent-soft)" />
    </svg>
  );
}
