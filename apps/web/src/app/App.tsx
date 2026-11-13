import { Inspector } from "../editor/Inspector";
import { Palette } from "../editor/Palette";
import { PlanView } from "../editor/plan/PlanView";
import { useUiStore } from "../state/uiStore";
import { WeightPanel } from "../weight/WeightPanel";
import { WeightStrip } from "../weight/WeightStrip";
import { Toolbar } from "./Toolbar";
import { useIsCompact } from "./useIsCompact";
import { useShortcuts } from "./useShortcuts";

export function App() {
  useShortcuts();
  const compact = useIsCompact();
  const hasSelection = useUiStore((state) => state.selectedId !== null);
  const notice = useUiStore((state) => state.notice);
  const setNotice = useUiStore((state) => state.setNotice);
  return (
    <div className="app" data-has-selection={hasSelection}>
      <Toolbar />
      <aside className="sidebar sidebar--palette">
        <Palette />
      </aside>
      <main className="canvas">
        <PlanView />
        {compact && <WeightStrip />}
        {notice && (
          <div className="app-notice" role="alert" data-testid="notice">
            <p>{notice}</p>
            <button type="button" className="button" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        )}
      </main>
      <aside className="sidebar sidebar--inspector">
        <Inspector />
        {!compact && <WeightPanel />}
      </aside>
    </div>
  );
}
