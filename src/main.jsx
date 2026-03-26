import ReactDOM from "react-dom/client";
import App from "./App";
import { initStore } from "./services/store";
import ErrorBoundary from "./components/ui/ErrorBoundary";

async function bootstrap() {
  await initStore();
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

bootstrap();
