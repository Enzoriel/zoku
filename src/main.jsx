import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initStore } from "./services/store";

async function bootstrap() {
  await initStore();
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

bootstrap();
