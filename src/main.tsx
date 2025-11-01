import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import './i18n'; // importa la configurazione di i18next così da inizializzarla


createRoot(document.getElementById("root")!).render(<App />);

