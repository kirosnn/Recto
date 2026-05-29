"use client";

import Link from "next/link";

type Props = {
  href?: string;
  onClick?: () => void;
  className?: string;
};

export default function BackButton({ href = "/", onClick, className = "" }: Props) {
  const inner = (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M13 4L7 10L13 16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (onClick) {
    return (
      <button onClick={onClick} className={`back-btn ${className}`} aria-label="Retour">
        {inner}
      </button>
    );
  }

  return (
    <Link href={href} className={`back-btn ${className}`} aria-label="Retour">
      {inner}
    </Link>
  );
}
