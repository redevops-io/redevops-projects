import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import "./portable.css";
import { PortableApp } from "./PortableApp";

createRoot(document.getElementById("root")!).render(<StrictMode><PortableApp /></StrictMode>);
