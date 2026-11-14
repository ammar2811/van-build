import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";

export interface MenuItem {
  id: string;
  label: string;
  detail?: string;
  testId?: string;
}

interface MenuButtonProps {
  label: string;
  icon?: ReactNode;
  items: MenuItem[];
  testId: string;
  className?: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
}

/**
 * A button that opens a short menu. Arrow keys move through it, Enter picks, Escape or a
 * click anywhere else closes it, and focus goes back to the button afterwards.
 */
export function MenuButton({
  label,
  icon,
  items,
  testId,
  className = "button",
  disabled = false,
  onSelect,
}: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Opening the menu moves focus into it, so the keyboard works however it was opened.
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const entries = () => [
    ...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
  ];
  const focusEntry = (index: number) => {
    const all = entries();
    all[(index + all.length) % all.length]?.focus();
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = entries().indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") focusEntry(index + 1);
    else if (event.key === "ArrowUp") focusEntry(index - 1);
    else if (event.key === "Home") focusEntry(0);
    else if (event.key === "End") focusEntry(-1);
    else if (event.key === "Escape") close(true);
    else if (event.key === "Tab") {
      setOpen(false);
      return;
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="menu" ref={root}>
      <button
        ref={button}
        type="button"
        className={className}
        data-testid={testId}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {icon}
        <span className="button-label">{label}</span>
      </button>
      {open && (
        <div
          className="menu-list"
          id={id}
          ref={menu}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="menu-item"
              data-testid={item.testId}
              onClick={() => {
                close(true);
                onSelect(item.id);
              }}
            >
              <span className="menu-item-label">{item.label}</span>
              {item.detail && <span className="menu-item-detail">{item.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
