import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Cave from "./examples/Cave/Cave";

import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/cave" element={<Cave />} />
        <Route path="*" element={<Navigate to="/cave" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
