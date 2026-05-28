import { Routes, Route } from "react-router-dom";
import TitleBar from "./components/TitleBar";
import Home from "./pages/Home";
import RectoPage from "./pages/RectoPage";
import VersoPage from "./pages/VersoPage";

export default function App() {
  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white select-none">
      <TitleBar />
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/recto" element={<RectoPage />} />
          <Route path="/verso" element={<VersoPage />} />
        </Routes>
      </main>
    </div>
  );
}
