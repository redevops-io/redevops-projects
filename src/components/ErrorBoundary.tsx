import { Component, type ReactNode } from "react";

// A screen that throws while rendering must never blank the whole window. The navigation, the connection banner and the
// notifications stay up; this shows what happened and lets the user reload just that screen. (Found the hard way: a
// response with an unexpected shape crashed the entire page against a real deployment.)
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error("screen crashed:", error instanceof Error ? error.message : String(error)); }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false }); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="content" role="alert">
        <h1 className="h">This screen ran into a problem</h1>
        <div className="card"><div className="bd">
          <div className="s">Your work is safe — nothing was changed or lost. You can reload this screen, or go to another one.</div>
          <div className="actions"><button className="btn pri" onClick={() => this.setState({ failed: false })}>Reload this screen</button></div>
        </div></div>
      </section>
    );
  }
}
