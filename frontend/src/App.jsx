import { AnimatePresence } from "framer-motion";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import MainLayout from "./layout/MainLayout";
import AccuracyTest from "./pages/AccuracyTest";
import Calibration from "./pages/Calibration";
import EyeControl from "./pages/EyeControl";
import Home from "./pages/Home";

function App() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="calibration" element={<Calibration />} />
          <Route path="control" element={<EyeControl />} />
          <Route path="accuracy" element={<AccuracyTest />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AnimatePresence>
  );
}

export default App;
