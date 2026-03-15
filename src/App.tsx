import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Cave from "./examples/Cave/Cave";
import EotB from "./examples/EotB/EotB";

import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/cave" element={<Cave />} />
        <Route path="/eotb" element={<EotB />} />
        <Route path="*" element={<Navigate to="/cave" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
