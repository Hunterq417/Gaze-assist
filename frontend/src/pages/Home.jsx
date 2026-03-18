import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

function Home() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="hero-ui-shell"
    >
      <section className="hero-ui-page">
        <div className="hero-ui-content">
          <div className="hero-ui-left">
            <p className="hero-ui-tagline">Unlock the Power of Your Gaze</p>
            <h1 className="hero-ui-title">
              Hands-free <span>Control</span>
              <br />
              with <span>smart eye</span>-tracking.
            </h1>
            <p className="hero-ui-description">
              Experience hands-free digital control with advanced AI-driven gaze
              tracking. Calibrate in seconds and navigate apps, communication boards
              and the web using only your eyes.
            </p>
            <button
              type="button"
              className="hero-ui-cta"
              onClick={() => navigate("/calibration")}
            >
              Start Calibration
            </button>
            <p className="hero-ui-scroll-hint">Scroll down to continue</p>
          </div>

          <div className="hero-ui-right">
            <div className="hero-ui-orbit" />
            <img
              src="/hero-vr-tight-hq.png"
              alt="Futuristic VR eye tracking visual"
              className="hero-ui-hero-image"
            />
            <div className="hero-ui-mini-panel">
              <div className="hero-ui-mini-line" />
              <div className="hero-ui-mini-line" />
              <div className="hero-ui-mini-line" />
              <div className="hero-ui-mini-line" />
            </div>
            <article className="hero-ui-quick-card">
              <h2>Quick calibration</h2>
              <p>
                Start a 10-second calibration to personalize gaze mapping for
                accurate control across lighting conditions.
              </p>
            </article>
          </div>
        </div>
      </section>
    </motion.div>
  );
}

export default Home;
