import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import GlassCard from "../components/GlassCard";
import GradientButton from "../components/GradientButton";
import {
  sendTrackingFrame,
  startTracking,
  stopTracking,
  submitAccuracyReport,
} from "../services/api";

const TOTAL_TARGETS = 10;
const TARGET_TIMEOUT_MS = 2500;

function generateTarget() {
  return {
    x: Math.floor(Math.random() * 78) + 10,
    y: Math.floor(Math.random() * 72) + 12,
    size: Math.floor(Math.random() * 24) + 28,
  };
}

function AccuracyTest() {
  const navigate = useNavigate();
  const timeoutRef = useRef(null);
  const appearedAtRef = useRef(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const frameInflightRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [testComplete, setTestComplete] = useState(false);
  const [shownTargets, setShownTargets] = useState(0);
  const [hits, setHits] = useState(0);
  const [target, setTarget] = useState(null);
  const [times, setTimes] = useState([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("Camera is idle.");

  const spawnTarget = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    setShownTargets((prevShown) => {
      const nextShown = prevShown + 1;
      if (nextShown > TOTAL_TARGETS) {
        return prevShown;
      }

      setTarget(generateTarget());
      appearedAtRef.current = performance.now();

      timeoutRef.current = window.setTimeout(() => {
        setTarget(null);
        if (nextShown >= TOTAL_TARGETS) {
          setRunning(false);
          setTestComplete(true);
        } else {
          spawnTarget();
        }
      }, TARGET_TIMEOUT_MS);

      return nextShown;
    });
  };

  const stopPreview = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  };

  const stopFrameStreaming = () => {
    if (frameIntervalRef.current) {
      window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    frameInflightRef.current = false;
  };

  const startPreview = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera API is not available in this browser.");
    }

    stopPreview();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    mediaStreamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    setCameraReady(true);
  };

  const startFrameStreaming = () => {
    if (frameIntervalRef.current) {
      return;
    }

    frameIntervalRef.current = window.setInterval(async () => {
      if (frameInflightRef.current || !running) {
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        return;
      }

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageDataUrl = canvas.toDataURL("image/jpeg", 0.62);

      try {
        frameInflightRef.current = true;
        const response = await sendTrackingFrame(imageDataUrl);
        if (!response.detected) {
          setCameraStatus("Tracking running, but face/eyes not detected.");
        } else {
          setCameraStatus("Tracking active. Keep looking at the target.");
        }
      } catch (error) {
        setCameraStatus(error.message || "Failed sending webcam frame.");
      } finally {
        frameInflightRef.current = false;
      }
    }, 70);
  };

  const startTest = async () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    try {
      setCameraStatus("Starting camera and tracking...");
      await startPreview();
      await startTracking({ source: "webcam", camera_index: 0 });

      setRunning(true);
      setTestComplete(false);
      setShownTargets(0);
      setHits(0);
      setTimes([]);
      setTarget(null);
      setCameraStatus("Tracking active. Keep looking at the target.");
      window.setTimeout(() => spawnTarget(), 150);
    } catch (error) {
      setRunning(false);
      setCameraStatus(
        error.message || "Unable to start camera/tracking for accuracy test."
      );
    }
  };

  const handleTargetHit = () => {
    if (!running || !target) {
      return;
    }

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    const elapsed = performance.now() - appearedAtRef.current;
    setTimes((prev) => [...prev, elapsed]);
    setHits((prev) => prev + 1);
    setTarget(null);

    if (shownTargets >= TOTAL_TARGETS) {
      setRunning(false);
      setTestComplete(true);
      return;
    }

    window.setTimeout(() => spawnTarget(), 250);
  };

  useEffect(() => {
    if (running && cameraReady) {
      startFrameStreaming();
    } else {
      stopFrameStreaming();
    }
    return () => {
      stopFrameStreaming();
    };
  }, [running, cameraReady]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      stopFrameStreaming();
      stopPreview();
      stopTracking().catch(() => {});
    };
  }, []);

  const accuracy = useMemo(() => {
    if (shownTargets === 0) {
      return 0;
    }
    return Math.round((hits / shownTargets) * 100);
  }, [hits, shownTargets]);

  const averageTime = useMemo(() => {
    if (times.length === 0) {
      return 0;
    }
    const total = times.reduce((acc, current) => acc + current, 0);
    return Number((total / times.length / 1000).toFixed(2));
  }, [times]);

  const precisionScore = useMemo(() => {
    const speedScore = Math.max(0, 100 - averageTime * 22);
    return Math.round(accuracy * 0.65 + speedScore * 0.35);
  }, [accuracy, averageTime]);

  useEffect(() => {
    if (!testComplete) {
      return;
    }
    stopFrameStreaming();
    stopTracking().catch(() => {});
    setCameraStatus("Test complete. Tracking stopped.");
    submitAccuracyReport({
      hits,
      total: TOTAL_TARGETS,
      accuracy,
      averageTime,
      precisionScore,
    }).catch(() => {});
  }, [testComplete, hits, accuracy, averageTime, precisionScore]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="app-route-shell space-y-5"
    >
      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="page-section-title">Accuracy Test</h2>
            <p className="page-section-subtitle">
              Track and hit targets to evaluate cursor precision.
            </p>
          </div>
          <span className="rounded-full bg-white/70 px-3 py-1 text-sm font-medium text-slate-700">
            Target {Math.min(shownTargets, TOTAL_TARGETS)} / {TOTAL_TARGETS}
          </span>
        </div>

        <div className="relative min-h-[420px] overflow-hidden rounded-[20px] border border-white/65 bg-white/50">
          <canvas ref={canvasRef} className="hidden" />
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`absolute right-3 top-3 h-28 w-40 rounded-lg border border-white/70 object-cover shadow-md ${
              cameraReady ? "block" : "hidden"
            }`}
          />
          {!running && !testComplete && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <p className="max-w-md text-slate-600">
                Press <strong>Start Test</strong> to begin. Targets will appear at
                random locations.
              </p>
            </div>
          )}

          {target && (
            <motion.button
              key={`${target.x}-${target.y}-${shownTargets}`}
              onClick={handleTargetHit}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="absolute rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 shadow-lg shadow-purple-300/60"
              style={{
                left: `${target.x}%`,
                top: `${target.y}%`,
                width: `${target.size}px`,
                height: `${target.size}px`,
                transform: "translate(-50%, -50%)",
              }}
              aria-label="Target"
            />
          )}
        </div>
        <p className="text-sm text-slate-600">{cameraStatus}</p>
      </GlassCard>

      <GlassCard>
        <h3 className="page-subsection-title">Metrics</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <p className="metric-item">
            Targets Hit: <strong>{hits}</strong> / {TOTAL_TARGETS}
          </p>
          <p className="metric-item">
            Accuracy: <strong>{accuracy}%</strong>
          </p>
          <p className="metric-item">
            Average Time: <strong>{averageTime || 0}s</strong>
          </p>
          <p className="metric-item">
            Precision Score: <strong>{precisionScore || 0}%</strong>
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <GradientButton onClick={startTest}>Start Test</GradientButton>
          <GradientButton variant="subtle" onClick={startTest}>
            Retry Test
          </GradientButton>
          <GradientButton variant="subtle" onClick={() => navigate("/")}>
            Back to Home
          </GradientButton>
        </div>

        {testComplete && (
          <p className="mt-4 text-sm font-medium text-emerald-700">
            Test complete. You can retry to improve your precision score.
          </p>
        )}
      </GlassCard>
    </motion.div>
  );
}

export default AccuracyTest;
