import { Component } from "react";
import styles from "./ErrorBoundary.module.css";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Error capturado:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.container}>
          <h1 className={styles.title}>ALGO SALIÓ MAL</h1>
          <p className={styles.message}>{this.state.error?.message || "Error inesperado en la aplicación."}</p>
          <button className={styles.button} onClick={() => this.setState({ hasError: false, error: null })}>
            REINTENTAR
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
