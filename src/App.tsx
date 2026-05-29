import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import RectoPage from "./pages/RectoPage";
import VersoPage from "./pages/VersoPage";

export default function App() {
  return (
    <div className="app-root">
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/recto" element={<RectoPage />} />
          <Route path="/verso" element={<VersoPage />} />
        </Routes>
      </main>
    </div>
  );
}
