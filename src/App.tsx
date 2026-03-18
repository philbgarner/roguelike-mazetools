import { BrowserRouter, Routes, Route } from "react-router-dom";
import Cave from "./examples/Cave/Cave";
import EotB from "./examples/EotB/EotB";
import Mobs from "./examples/Mobs/Mobs";
import Objects from "./examples/Objects/Objects";
import Targeting from "./examples/Targeting/Targeting";
import AppMenu from "./AppMenu";

import "./styles/App.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppMenu />} />
        <Route path="/cave" element={<Cave />} />
        <Route path="/eotb" element={<EotB />} />
        <Route path="/mobs" element={<Mobs />} />
        <Route path="/objects" element={<Objects />} />
        <Route path="/targeting" element={<Targeting />} />
      </Routes>
    </BrowserRouter>
  );
}
