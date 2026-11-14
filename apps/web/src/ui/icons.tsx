import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const UndoIcon = () => (
  <Icon>
    <path d="M7.5 4.5 4 8l3.5 3.5" />
    <path d="M4 8h7.5a4.5 4.5 0 0 1 0 9H9" />
  </Icon>
);

export const RedoIcon = () => (
  <Icon>
    <path d="M12.5 4.5 16 8l-3.5 3.5" />
    <path d="M16 8H8.5a4.5 4.5 0 0 0 0 9H11" />
  </Icon>
);

export const RotateIcon = () => (
  <Icon>
    <path d="M16 10a6 6 0 1 1-2.2-4.6" />
    <path d="M14.2 2.6v3.2H11" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M4.5 6h11" />
    <path d="M8 6V4.5h4V6" />
    <path d="m6 6 .7 9.5h6.6L14 6" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M10 5v10M5 10h10" />
  </Icon>
);

export const DownloadIcon = () => (
  <Icon>
    <path d="M10 3.5v9" />
    <path d="m6.5 9.5 3.5 3.5 3.5-3.5" />
    <path d="M4.5 16h11" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Icon>
);

export const MinusIcon = () => (
  <Icon>
    <path d="M5 10h10" />
  </Icon>
);

export const FitIcon = () => (
  <Icon>
    <path d="M4 7.5V4h3.5M16 7.5V4h-3.5M4 12.5V16h3.5M16 12.5V16h-3.5" />
  </Icon>
);

export const LockIcon = () => (
  <Icon>
    <rect x="4.5" y="9" width="11" height="7.5" rx="1.5" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </Icon>
);

export const UnlockIcon = () => (
  <Icon>
    <rect x="4.5" y="9" width="11" height="7.5" rx="1.5" />
    <path d="M7 9V6.5a3 3 0 0 1 5.8-1" />
  </Icon>
);

export const CopyIcon = () => (
  <Icon>
    <rect x="7" y="7" width="9" height="9" rx="1.5" />
    <path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" />
  </Icon>
);

export const UserIcon = () => (
  <Icon>
    <circle cx="10" cy="7" r="3.2" />
    <path d="M3.8 17a6.2 6.2 0 0 1 12.4 0" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="m5 5 10 10M15 5 5 15" />
  </Icon>
);

export const MenuIcon = () => (
  <Icon>
    <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
  </Icon>
);
