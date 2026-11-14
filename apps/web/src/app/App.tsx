import { lazy, Suspense, useState } from "react";
import { PartsList } from "../bom/PartsList";
import { Inspector } from "../editor/Inspector";
import { Palette } from "../editor/Palette";
import { PlanView } from "../editor/plan/PlanView";
import { canUseWebGL, Scene3DBoundary, Unavailable } from "../editor/scene3d/Scene3DBoundary";
import { SideView } from "../editor/side/SideView";
import { useUiStore } from "../state/uiStore";
import { WeightPanel } from "../weight/WeightPanel";
import { WeightStrip } from "../weight/WeightStrip";
import { Toolbar } from "./Toolbar";
import { useIsCompact } from "./useIsCompact";
import { useShortcuts } from "./useShortcuts";
import { ViewSwitch } from "./ViewSwitch";

// The 3D engine is large. It is only downloaded when someone opens a 3D view.
const Scene3D = lazy(() => import("../editor/scene3d/Scene3D"));

export function App() {
  useShortcuts();
  const compact = useIsCompact();
  const hasSelection = useUiStore((state) => state.selectedId !== null);
  const notice = useUiStore((state) => state.notice);
  const setNotice = useUiStore((state) => state.setNotice);
  const chosen = useUiStore((state) => state.viewMode);
  // Phones have no room for two views side by side.
  const mode = compact && chosen === "split" ? "plan" : chosen;
  // Checked once: a browser does not gain or lose WebGL while the page is open.
  const [webgl] = useState(canUseWebGL);
  const backToPlan = () => useUiStore.getState().setViewMode("plan");
  const showPlan = mode === "plan" || mode === "split";
  const show3d = mode === "3d" || mode === "split";

  return (
    <div className="app" data-has-selection={hasSelection}>
      <Toolbar />
      <aside className="sidebar sidebar--palette">
        <Palette />
      </aside>
      <main className="canvas" data-view={mode}>
        <div className="canvas-top">
          {compact && <WeightStrip />}
          <ViewSwitch compact={compact} />
        </div>
        <div className="views">
          {showPlan && (
            <div className="view">
              <PlanView />
            </div>
          )}
          {mode === "side" && (
            <div className="view">
              <SideView />
            </div>
          )}
          {mode === "parts" && (
            <div className="view">
              <PartsList />
            </div>
          )}
          {show3d && (
            <div className="view">
              {webgl ? (
                <Scene3DBoundary onBack={backToPlan}>
                  <Suspense fallback={<p className="view-loading">Loading 3D view</p>}>
                    <Scene3D />
                  </Suspense>
                </Scene3DBoundary>
              ) : (
                <Unavailable onBack={backToPlan} />
              )}
            </div>
          )}
        </div>
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
