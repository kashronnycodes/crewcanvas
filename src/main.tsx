import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "@xyflow/react/dist/style.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "./styles.css";
import "./design-tokens.css";
import "./redesign.css";
import "./workspace.css";
import "./studio.css";
import "./workflow.css";
import "./reference.css";
import "./studio-workflow.css";
import { applyTheme, initialTheme } from "./theme";
import { retryQuery } from "../shared/http-errors";
applyTheme(initialTheme());
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: retryQuery, staleTime: 10_000 } },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
