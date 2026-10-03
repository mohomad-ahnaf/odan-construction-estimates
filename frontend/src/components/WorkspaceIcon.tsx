import type { ReactNode } from "react";

type IconName = "settings" | "security" | "documents" | "eye" | "eyeOff" | "signOut" | "menu" | "close";

export function WorkspaceIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    settings: <><circle cx="12" cy="12" r="3" /><path d="M10 2h4l.5 2.4 2 1.1 2.3-.8 2 3.5-1.8 1.6v2.3l1.8 1.6-2 3.5-2.3-.8-2 1.1L14 22h-4l-.5-2.4-2-1.1-2.3.8-2-3.5L5 14.2v-2.4L3.2 10l2-3.5 2.3.8 2-1.1L10 2Z" /></>,
    security: <><path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    documents: <><path d="M6 2h8l5 5v15H6V2Z" /><path d="M14 2v5h5M9 12h7M9 16h7" /></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
    eyeOff: <><path d="M3 3 21 21M10.6 6.1A11.7 11.7 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-3.3 3.7M6.1 8.2C3.4 10 2 12 2 12s3.5 6 10 6c1.2 0 2.3-.2 3.3-.6" /><path d="M10 10a3 3 0 0 0 4 4" /></>,
    signOut: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h10" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="M5 5l14 14M19 5 5 19" />,
  };
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
