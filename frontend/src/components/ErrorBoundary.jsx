import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("UI error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "2rem",
            background: "#fff",
            color: "#0a0a0a",
            fontFamily: "Inter, system-ui, sans-serif"
          }}
        >
          <div style={{ maxWidth: "28rem", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: "0.875rem", color: "#3d4450", marginBottom: "1rem" }}>
              {this.state.error.message || "The page could not load."}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                borderRadius: "0.5rem",
                border: "none",
                background: "#fe6b00",
                color: "#fff",
                padding: "0.625rem 1rem",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
