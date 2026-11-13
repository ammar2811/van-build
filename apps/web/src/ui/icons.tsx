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
