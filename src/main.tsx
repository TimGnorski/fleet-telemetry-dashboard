// Entry point. Mounts <App /> into #root. StrictMode double-invokes effects in
// dev to surface missing cleanup — our useEffect handles that correctly.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
