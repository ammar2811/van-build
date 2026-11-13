import { Inspector } from "../editor/Inspector";
import { Palette } from "../editor/Palette";
import { PlanView } from "../editor/plan/PlanView";
import { useUiStore } from "../state/uiStore";
import { Toolbar } from "./Toolbar";
import { useShortcuts } from "./useShortcuts";

export function App() {
  useShortcuts();
  const hasSelection = useUiStore((state) => state.selectedId !== null);
  return (
    <div className="app" data-has-selection={hasSelection}>
      <Toolbar />
      <aside className="sidebar sidebar--palette">
        <Palette />
      </aside>
      <main className="canvas">
        <PlanView />
      </main>
      <aside className="sidebar sidebar--inspector">
        <Inspector />
      </aside>
    </div>
  );
}
