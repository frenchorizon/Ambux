import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import { App } from "./App";
import { TooltipProvider } from "./components/ui/tooltip";
import { GameProvider } from "./game/context";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <GameProvider>
        <App />
      </GameProvider>
    </TooltipProvider>
  </StrictMode>,
);
