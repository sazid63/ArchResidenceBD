import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });
  }

  private copyDebugInfo = () => {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      error: this.state.error?.message,
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      projectInfo: this.getProjectInfo(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    const blob = new Blob([JSON.stringify(debugInfo, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `archres-error-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  private getProjectInfo = () => {
    try {
      // Try to get project data from localStorage
      const projectData = localStorage.getItem("archres_v2_active_project");
      return projectData ? JSON.parse(projectData) : null;
    } catch {
      return null;
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          className="screen"
          style={{ padding: "40px" }}
          role="alert"
          aria-live="assertive"
        >
          <div style={{ textAlign: "center", maxWidth: "600px", margin: "0 auto" }}>
            <div style={{ fontSize: "64px", marginBottom: "24px" }} aria-hidden="true">⚠️</div>
            <h1 id="error-boundary-title" style={{ marginBottom: "16px", color: "var(--primary)" }}>
              Something went wrong
            </h1>
            <p style={{ marginBottom: "32px", opacity: 0.8, lineHeight: "1.6" }}>
              We're sorry, but something unexpected happened. The error has been logged and our team has been notified.
            </p>

            {this.state.error && (
              <div id="error-details" style={{
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "24px",
                textAlign: "left",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                overflow: "auto",
                maxHeight: "200px"
              }} aria-describedby="error-boundary-title">
                <div style={{ marginBottom: "8px", fontWeight: 600 }}>Error: {this.state.error.message}</div>
                {this.state.error.stack && (
                  <div style={{ whiteSpace: "pre-wrap", opacity: 0.8 }}>{this.state.error.stack}</div>
                )}
              </div>
            )}

            <div className="row" style={{ gap: "12px", justifyContent: "center", marginBottom: "24px" }}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: "12px 24px",
                  background: "var(--primary)",
                  color: "var(--on-primary)",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.copyDebugInfo}
                style={{
                  padding: "12px 24px",
                  background: "var(--sage)",
                  color: "var(--surface)",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Copy Debug Info
              </button>
            </div>

            <div style={{ fontSize: "12px", opacity: 0.6 }}>
              <p>If the problem persists, please contact support with the debug information.</p>
              <p>Error ID: {Date.now()}</p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

