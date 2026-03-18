import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CalibrationDot from "../components/CalibrationDot";
import GlassCard from "../components/GlassCard";
import GradientButton from "../components/GradientButton";
import {
  completeCalibrationSession,
  sendCalibrationFrame,
  startCalibrationSession,
} from "../services/api";

const CALIBRATION_POINTS = [
  "Top Left",
  "Top Center",
  "Top Right",
  "Middle Left",
  "Center",
  "Middle Right",
  "Bottom Left",
  "Bottom Center",
  "Bottom Right",
];

const WHY_CHOOSE_ITEMS = [
  {
    title: "Real-Time Tracking",
    description:
      "Advanced AI-powered gaze detection for smooth, instant cursor movement without any physical input.",
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden="true" className="why-icon-svg">
        <defs>
          <linearGradient id="eyeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7a5ce0" />
            <stop offset="100%" stopColor="#d06dd9" />
          </linearGradient>
        </defs>
        <path
          d="M6 32c6-11 16-17 26-17s20 6 26 17c-6 11-16 17-26 17S12 43 6 32Z"
          fill="none"
          stroke="url(#eyeGrad)"
          strokeWidth="4"
        />
        <circle cx="32" cy="32" r="9" fill="url(#eyeGrad)" />
        <circle cx="35.5" cy="28.5" r="2.5" fill="#fff" />
      </svg>
    ),
  },
  {
    title: "Smart Calibration",
    description:
      "Quick and adaptive calibration system that adjusts to your eyes for better accuracy in seconds.",
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden="true" className="why-icon-svg">
        <defs>
          <linearGradient id="gearGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6f56de" />
            <stop offset="100%" stopColor="#8b6ef0" />
          </linearGradient>
        </defs>
        <path
          fill="url(#gearGrad)"
          d="m29 8 6 0 1.7 5a19 19 0 0 1 4.8 2l4.8-2.4 4.2 4.2-2.5 4.8a19 19 0 0 1 2 4.8L55 28v6l-5 1.7a19 19 0 0 1-2 4.8l2.5 4.8-4.2 4.2-4.8-2.4a19 19 0 0 1-4.8 2L35 56h-6l-1.7-5a19 19 0 0 1-4.8-2l-4.8 2.4-4.2-4.2 2.5-4.8a19 19 0 0 1-2-4.8L9 34v-6l5-1.7a19 19 0 0 1 2-4.8l-2.5-4.8 4.2-4.2 4.8 2.4a19 19 0 0 1 4.8-2L29 8Zm3 15a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z"
        />
      </svg>
    ),
  },
  {
    title: "High Accuracy",
    description:
      "Optimized tracking ensures precise control across different lighting and environment conditions.",
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden="true" className="why-icon-svg">
        <defs>
          <linearGradient id="targetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c76ad9" />
            <stop offset="100%" stopColor="#6e58df" />
          </linearGradient>
        </defs>
        <circle cx="30" cy="34" r="19" fill="none" stroke="url(#targetGrad)" strokeWidth="4" />
        <circle cx="30" cy="34" r="11" fill="none" stroke="url(#targetGrad)" strokeWidth="4" />
        <circle cx="30" cy="34" r="4.5" fill="url(#targetGrad)" />
        <path d="m44 14 9 1-1 9-7-2-6 6-3-3 6-6-2-5Z" fill="url(#targetGrad)" />
      </svg>
    ),
  },
  {
    title: "Accessibility First",
    description:
      "Built to empower physically disabled users with independent and effortless digital interaction.",
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden="true" className="why-icon-svg">
        <defs>
          <linearGradient id="accessGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7a5ce0" />
            <stop offset="100%" stopColor="#c86eda" />
          </linearGradient>
        </defs>
        <circle cx="31" cy="13" r="6" fill="url(#accessGrad)" />
        <path
          d="M18 24h13c5 0 8 3 8 8v4h8c2.8 0 5 2.2 5 5s-2.2 5-5 5H34c-3 0-5-2-5-5v-2h-5c-5 0-9-4-9-9v-6h3Zm14 26c-7 0-13-5.6-13-12.5h-4C15 47 22.5 55 32 55c8 0 14.8-5.7 16.7-13.4h-4.2A13 13 0 0 1 32 50Z"
          fill="url(#accessGrad)"
        />
      </svg>
    ),
  },
];

function Calibration() {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [running, setRunning] = useState(false);
  const [holdFrames, setHoldFrames] = useState(0);
  const [calibrationMessage, setCalibrationMessage] = useState(
    "Focus your eyes on the dot until it disappears."
  );
  const [gazePoint, setGazePoint] = useState(null);
  const intervalRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const inflightRef = useRef(false);
  const activeIndexRef = useRef(-1);
  const holdFramesRef = useRef(0);
  const runningRef = useRef(false);
  const navigate = useNavigate();

  const completedCount = useMemo(() => Math.max(0, activeIndex), [activeIndex]);
  const isComplete = activeIndex >= CALIBRATION_POINTS.length;

  const stopCalibrationLoop = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    inflightRef.current = false;
  };

  const stopPreview = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startPreview = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 } },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  };

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    holdFramesRef.current = holdFrames;
  }, [holdFrames]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    if (isComplete) {
      setRunning(false);
      runningRef.current = false;
      stopCalibrationLoop();
      completeCalibrationSession()
        .then(() => {
          setCalibrationMessage("Calibration saved. Redirecting to Eye Control...");
        })
        .catch((error) => {
          setCalibrationMessage(error.message || "Calibration completed with warning.");
        });
      const timeout = window.setTimeout(() => navigate("/control"), 900);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [isComplete, navigate]);

  const processFrameTick = async () => {
    if (!runningRef.current || inflightRef.current) {
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      return;
    }

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.drawImage(video, 0, 0, width, height);
    const frame = canvas.toDataURL("image/jpeg", 0.6);

    try {
      inflightRef.current = true;
      const response = await sendCalibrationFrame(frame, activeIndexRef.current);
      if (!response.detected || !response.gaze) {
        setCalibrationMessage("Face not detected. Center your face in the camera.");
        setGazePoint(null);
        setHoldFrames(0);
        holdFramesRef.current = 0;
        return;
      }

      const gaze = response.gaze;
      setGazePoint(gaze);
      const nextHold = holdFramesRef.current + 1;
      holdFramesRef.current = nextHold;
      setHoldFrames(nextHold);
      setCalibrationMessage("Great! Keep looking at the active dot...");

      if (nextHold >= 8) {
        const nextIndex = activeIndexRef.current + 1;
        holdFramesRef.current = 0;
        setHoldFrames(0);
        setActiveIndex(nextIndex);
        if (nextIndex < CALIBRATION_POINTS.length) {
          setCalibrationMessage(`Now look at ${CALIBRATION_POINTS[nextIndex]}.`);
        }
      }
    } catch (error) {
      setCalibrationMessage(error.message || "Calibration frame failed.");
    } finally {
      inflightRef.current = false;
    }
  };

  const startCalibration = async () => {
    stopCalibrationLoop();
    setCalibrationMessage("Preparing calibration...");
    try {
      await startPreview();
      await startCalibrationSession();
      setActiveIndex(0);
      activeIndexRef.current = 0;
      setHoldFrames(0);
      holdFramesRef.current = 0;
      setRunning(true);
      runningRef.current = true;
      setCalibrationMessage("Look at the highlighted dot and hold your gaze.");
      intervalRef.current = window.setInterval(() => {
        processFrameTick().catch(() => {});
      }, 90);
    } catch (error) {
      setRunning(false);
      setCalibrationMessage(
        error.message || "Unable to access webcam for calibration."
      );
    }
  };

  const resetCalibration = () => {
    stopCalibrationLoop();
    stopPreview();
    setRunning(false);
    runningRef.current = false;
    setActiveIndex(-1);
    activeIndexRef.current = -1;
    setHoldFrames(0);
    holdFramesRef.current = 0;
    setGazePoint(null);
    setCalibrationMessage("Calibration reset. Start again when ready.");
    startCalibrationSession().catch(() => {});
  };

  useEffect(() => {
    return () => {
      stopCalibrationLoop();
      stopPreview();
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="app-route-shell space-y-8"
    >
      <div className="grid w-full items-start gap-5 xl:grid-cols-[1.28fr_0.92fr]">
        <GlassCard className="w-full p-7 sm:p-8">
          <h2 className="page-section-title">Calibration</h2>
          <p className="page-section-subtitle mt-2">{calibrationMessage}</p>
          <div className="mt-6 grid grid-cols-3 gap-y-8">
            {CALIBRATION_POINTS.map((point, index) => (
              <div key={point} className="text-center">
                <CalibrationDot
                  isActive={index === activeIndex}
                  isCompleted={index < activeIndex}
                />
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-white/70 bg-white/64 p-4">
            <p className="text-sm text-slate-700">
              Calibration Progress: {Math.min(completedCount, 9)} / 9
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Hold frames on current point: {holdFrames} / 8
            </p>
            {gazePoint && (
              <p className="mt-1 text-xs text-slate-500">
                Live gaze: x={gazePoint.x.toFixed(2)}, y={gazePoint.y.toFixed(2)}
              </p>
            )}
            <div className="mt-2 h-2 rounded-full bg-purple-100">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
                animate={{
                  width: `${(Math.min(completedCount, 9) / 9) * 100}%`,
                }}
                transition={{ duration: 0.25 }}
              />
            </div>
          </div>

          {isComplete && (
            <p className="mt-4 text-sm font-medium text-emerald-700">
              Calibration complete. Redirecting to Eye Control...
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <GradientButton onClick={startCalibration}>
              {running ? "Calibrating..." : "Start Calibration"}
            </GradientButton>
            <GradientButton variant="subtle" onClick={resetCalibration}>
              Reset Calibration
            </GradientButton>
          </div>
          <video ref={videoRef} className="hidden" autoPlay muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
        </GlassCard>

        <div className="space-y-5 md:sticky md:top-24">
          <GlassCard className="p-6">
            <h3 className="page-subsection-title">How Calibration Works</h3>
            <p className="page-section-subtitle mt-2">
              The system maps your eye positions to screen coordinates by collecting
              gaze samples at 9 points. This improves tracking precision and cursor
              stability.
            </p>
            <ol className="mt-4 space-y-2 text-sm text-slate-700">
              <li>
                <span className="font-semibold text-slate-900">1.</span> Look at the
                highlighted dot.
              </li>
              <li>
                <span className="font-semibold text-slate-900">2.</span> Keep your gaze
                steady for a short moment.
              </li>
              <li>
                <span className="font-semibold text-slate-900">3.</span> Repeat until all
                9 points are completed.
              </li>
            </ol>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="page-subsection-title">Best Results Tips</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>Keep your face centered in the webcam frame.</li>
              <li>Use stable lighting and avoid strong backlight.</li>
              <li>Stay at a consistent distance from your screen.</li>
              <li>Blink naturally; avoid rapid head movement while calibrating.</li>
            </ul>
            <div className="mt-4 rounded-lg bg-purple-50 p-3 text-xs text-purple-700">
              Pro tip: if dots do not progress, click Reset Calibration and restart with
              better lighting.
            </div>
          </GlassCard>
        </div>
      </div>

      <section className="why-choose-section">
        <h2 className="why-choose-title">Why Choose GazeAssist?</h2>
        <div className="why-choose-grid">
          {WHY_CHOOSE_ITEMS.map((item) => (
            <article key={item.title} className="why-choose-card">
              <div className="why-icon-wrap">{item.icon}</div>
              <h3 className="why-card-title">{item.title}</h3>
              <p className="why-card-copy">{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </motion.div>
  );
}

export default Calibration;
