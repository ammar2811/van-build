import { useState } from "react";
import { useUiStore } from "../state/uiStore";
import { UserIcon } from "../ui/icons";
import { MenuButton } from "../ui/MenuButton";
import { DesignsDialog } from "./DesignsDialog";
import { ShareDialog } from "./ShareDialog";
import { SignInDialog } from "./SignInDialog";
import { cloud } from "./session";
import { VersionsDialog } from "./VersionsDialog";

type Open = "signIn" | "designs" | "versions" | "share" | null;

/** Sign in, or, once signed in: the account's layouts, versions, sharing and signing out. */
export function AccountMenu() {
  const available = useUiStore((state) => state.cloudAvailable);
  const account = useUiStore((state) => state.account);
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  if (!available) return null;

  return (
    <>
      {account ? (
        <MenuButton
          label="Account"
          icon={<UserIcon />}
          className="button"
          testId="account-menu"
          heading={account.email}
          items={[
            { id: "designs", label: "My layouts", testId: "menu-designs" },
            { id: "versions", label: "Versions", testId: "menu-versions" },
            { id: "share", label: "Share", detail: "A read-only link", testId: "menu-share" },
            { id: "signOut", label: "Sign out", testId: "menu-sign-out" },
          ]}
          onSelect={(id) => {
            if (id === "signOut") {
              cloud.signOut().catch((error) => {
                console.error(error);
                useUiStore.getState().setNotice("Could not sign out. Please try again.");
              });
            } else setOpen(id as Open);
          }}
        />
      ) : (
        <button
          type="button"
          className="button"
          data-testid="sign-in"
          aria-label="Sign in"
          onClick={() => setOpen("signIn")}
        >
          <UserIcon />
          <span className="button-label">Sign in</span>
        </button>
      )}
      {open === "signIn" && <SignInDialog onClose={close} />}
      {open === "designs" && <DesignsDialog onClose={close} />}
      {open === "versions" && <VersionsDialog onClose={close} />}
      {open === "share" && <ShareDialog onClose={close} />}
    </>
  );
}
