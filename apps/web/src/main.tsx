import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { startPersistence } from "./persistence/boot";
import { indexedDbRepository } from "./persistence/indexedDbRepository";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// Open the saved design before the first paint, so the starter layout never flashes up first.
await startPersistence(indexedDbRepository());

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
