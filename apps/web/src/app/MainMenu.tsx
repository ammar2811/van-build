import { useState } from "react";
import { DesignsDialog } from "../cloud/DesignsDialog";
import { ShareDialog } from "../cloud/ShareDialog";
import { SignInDialog } from "../cloud/SignInDialog";
import { cloud } from "../cloud/session";
import { VersionsDialog } from "../cloud/VersionsDialog";
import { NewLayoutDialog } from "../start/NewLayoutDialog";
import { useUiStore } from "../state/uiStore";
import { MenuIcon, UserIcon } from "../ui/icons";
import { MenuButton, type MenuItem } from "../ui/MenuButton";

type Open = "new" | "signIn" | "designs" | "versions" | "share" | null;

/**
 * The main menu: start a new layout, and everything account-related. Signed out, a separate
 * "Sign in" button is shown too on wide screens, so accounts are easy to find.
 */
export function MainMenu() {
  const available = useUiStore((state) => state.cloudAvailable);
  const account = useUiStore((state) => state.account);
  const welcome = useUiStore((state) => state.welcome);
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);

  const items: MenuItem[] = [{ id: "new", label: "New layout", testId: "menu-new" }];
  if (available && account) {
    items.push(
      { id: "designs", label: "My layouts", testId: "menu-designs" },
      { id: "versions", label: "Versions", testId: "menu-versions" },
      { id: "share", label: "Share", detail: "A read-only link", testId: "menu-share" },
      { id: "signOut", label: "Sign out", testId: "menu-sign-out" },
    );
  } else if (available) {
    items.push({
      id: "signIn",
      label: "Sign in",
      detail: "Use your layouts on any device",
      testId: "menu-sign-in",
    });
  }

  return (
    <>
      {available && !account && (
        <button
          type="button"
          className="button toolbar-sign-in"
          data-testid="sign-in"
          onClick={() => setOpen("signIn")}
        >
          <UserIcon />
          <span className="button-label">Sign in</span>
        </button>
      )}
      <MenuButton
        label="Menu"
        icon={account ? <UserIcon /> : <MenuIcon />}
        className="button"
        testId="main-menu"
        {...(account ? { heading: account.email } : {})}
        items={items}
        onSelect={(id) => {
          if (id === "signOut") {
            cloud.signOut().catch((error) => {
              console.error(error);
              useUiStore.getState().setNotice("Could not sign out. Please try again.");
            });
          } else setOpen(id as Open);
        }}
      />
      {(open === "new" || welcome) && (
        <NewLayoutDialog
          welcome={welcome && open !== "new"}
          onClose={() => {
            useUiStore.getState().setWelcome(false);
            close();
          }}
        />
      )}
      {open === "signIn" && <SignInDialog onClose={close} />}
      {open === "designs" && <DesignsDialog onClose={close} />}
      {open === "versions" && <VersionsDialog onClose={close} />}
      {open === "share" && <ShareDialog onClose={close} />}
    </>
  );
}
