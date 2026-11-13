import { Component, type ReactNode } from "react";

/** Whether this browser can give us a WebGL context at all. */
export function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function Unavailable({ onBack }: { onBack: () => void }) {
  return (
    <div className="view-message" role="status" data-testid="scene3d-unavailable">
      <p>
        <strong>The 3D view is not available here.</strong>
      </p>
      <p>
        This browser has 3D graphics (WebGL) turned off or cannot start it. The plan and side views
        work as usual, and nothing in your layout is affected.
      </p>
      <button type="button" className="button" onClick={onBack}>
        Back to the plan
      </button>
    </div>
  );
}

interface Props {
  onBack: () => void;
  children: ReactNode;
}

/**
 * Keeps a failure in the 3D view inside the 3D view. Graphics drivers and browser settings
 * are outside our control; whatever goes wrong there must not take the editor down with it.
 */
export class Scene3DBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.warn("The 3D view failed and was switched off", error);
  }

  override render(): ReactNode {
    return this.state.failed ? <Unavailable onBack={this.props.onBack} /> : this.props.children;
  }
}
