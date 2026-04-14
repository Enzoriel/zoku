import ReactDOM from "react-dom/client";
import App from "./App";
import { initStore } from "./services/store";
import ErrorBoundary from "./components/ui/ErrorBoundary";

// Deshabilitar el menú contextual por defecto de WebView en producción
if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
}

async function bootstrap() {
  await initStore();
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

bootstrap();
