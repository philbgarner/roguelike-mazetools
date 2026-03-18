import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Cave from "./examples/Cave/Cave";
import EotB from "./examples/EotB/EotB";
import Mobs from "./examples/Mobs/Mobs";
import Objects from "./examples/Objects/Objects";
import Targeting from "./examples/Targeting/Targeting";

import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/cave" element={<Cave />} />
        <Route path="/eotb" element={<EotB />} />
        <Route path="/mobs" element={<Mobs />} />
        <Route path="/objects" element={<Objects />} />
        <Route path="/targeting" element={<Targeting />} />
        <Route path="*" element={<Navigate to="/cave" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
