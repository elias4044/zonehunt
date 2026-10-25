import type { SVGProps } from "react";

export default function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path d="M7 5h20v7L12 27H5v-7L20 5M5 12V5h7m8 22h7v-7" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
