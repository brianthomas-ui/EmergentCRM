import { Component } from "react";

// Isolates a single tab's render error so it never blanks the whole app.
export default class TabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.warn("Tab render error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-sm text-[var(--text-muted)]">
          <div className="font-semibold text-rose-400 mb-1">This view hit an error.</div>
          <div className="text-[var(--text-faint)]">Close the tab and reopen it. {String(this.state.error?.message || "")}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
