import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold text-ink">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect width="24" height="24" rx="6" className="fill-sea" />
        <path d="M12 6v11M8.5 9.5h7M6.5 13.5a5.5 5.5 0 0 0 11 0" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="6" r="1.6" stroke="white" strokeWidth="1.4" />
      </svg>
      AncreMail
    </Link>
  );
}
