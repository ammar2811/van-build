import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { openSharedDesign, sharedToken, startCloud } from "./cloud/session";
import { startPersistence } from "./persistence/boot";
import { indexedDbRepository } from "./persistence/indexedDbRepository";
import { useUiStore } from "./state/uiStore";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

const repository = indexedDbRepository();
const token = sharedToken();
// Open the design before the first paint, so the starter layout never flashes up first.
if (!(token && (await openSharedDesign(token)))) {
  if (token) {
    window.history.replaceState(null, "", window.location.pathname);
    useUiStore
      .getState()
      .setNotice(
        "That share link does not work any more. The owner may have stopped sharing the layout.",
      );
  }
  await startPersistence(repository);
}

createRoot(root).render(
  <StrictMode>
    <App repository={repository} />
  </StrictMode>,
);

// Accounts load after the editor is on screen. A shared design is only viewed, never synced.
if (useUiStore.getState().mode === "edit") {
  startCloud(repository).catch((error) => console.error("Could not start accounts", error));
}

// Offline support and installing as an app. Production only: in development it would cache
// files that change on every save.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const register = () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Offline support is unavailable", error);
    });
  };
  // Opening the design above can finish after the page's load event has already fired.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
