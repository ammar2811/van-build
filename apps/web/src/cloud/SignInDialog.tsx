import { type FormEvent, useId, useState } from "react";
import { Modal } from "../ui/Modal";
import { cloud } from "./session";

/** Put the auth service's reasons for not sending an email in plain words. */
function signInError(failure: unknown): string {
  const message = failure instanceof Error ? failure.message.toLowerCase() : "";
  if (message.includes("rate limit")) {
    return "Too many sign-in emails were sent in the last hour. Please try again later.";
  }
  if (message.includes("not authorized")) {
    return "Sign-in emails cannot be sent to this address yet. Accounts are still being set up.";
  }
  if (failure instanceof TypeError) {
    return "You seem to be offline. Your layout is still saved on this device.";
  }
  return "The sign-in email could not be sent. Please try again in a minute.";
}

/** Sign in with a link sent by email. No password to remember or leak. */
export function SignInDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter an email address like name@example.com");
      return;
    }
    setState("sending");
    setError(null);
    try {
      await cloud.sendSignInLink(address);
      setState("sent");
    } catch (failure) {
      console.error(failure);
      setError(signInError(failure));
      setState("idle");
    }
  };

  return (
    <Modal title="Sign in" testId="sign-in-dialog" onClose={onClose}>
      {state === "sent" ? (
        <div className="modal-text" data-testid="sign-in-sent" role="status">
          <p>
            We sent a sign-in link to <strong>{email.trim()}</strong>.
          </p>
          <p className="muted">
            Open it in this browser on this device. You can close this message; the editor signs you
            in when you come back from the link.
          </p>
        </div>
      ) : (
        <form className="modal-form" onSubmit={submit} noValidate>
          <p className="muted">
            Save your layouts to an account to open them on any device and share them with a link.
            Without an account, your layout is still saved in this browser.
          </p>
          <label htmlFor={id}>Email</label>
          <input
            id={id}
            className="text-input"
            data-testid="sign-in-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            data-autofocus
            value={email}
            aria-invalid={error !== null}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => {
              setEmail(event.currentTarget.value);
              setError(null);
            }}
          />
          {error && (
            <p className="field-error field-error--left" id={`${id}-error`} role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="button button--primary modal-submit"
            data-testid="sign-in-send"
            disabled={state === "sending"}
          >
            {state === "sending" ? "Sending" : "Email me a sign-in link"}
          </button>
        </form>
      )}
    </Modal>
  );
}
