import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import GlassCard from "../components/GlassCard";
import GradientButton from "../components/GradientButton";
import SliderControl from "../components/SliderControl";
import StatusIndicator from "../components/StatusIndicator";
import { useEffect, useRef, useState } from "react";
import {
  getAvailableCameras,
  getTrackingLog,
  getStatus,
  saveSettings,
  sendTrackingFrame,
  startTracking,
  stopTracking,
} from "../services/api";

function EyeControl() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const autoSaveTimeoutRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const frameInflightRef = useRef(false);
  const [paused, setPaused] = useState(true);
  const [sensitivity, setSensitivity] = useState(68);
  const [speed, setSpeed] = useState(72);
  const [blinkThreshold, setBlinkThreshold] = useState(38);
  const [smoothing, setSmoothing] = useState(56);
  const [edgeBoost, setEdgeBoost] = useState(35);
  const [source, setSource] = useState("webcam");
  const [cameraIndex, setCameraIndex] = useState(0);
  const [ipUrl, setIpUrl] = useState("http://127.0.0.1:8080/shot.jpg");
  const [loading, setLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState("Checking backend...");
  const [backendOnline, setBackendOnline] = useState(false);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [recentLog, setRecentLog] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const confidence = paused ? "0%" : `${Math.round((sensitivity + speed) / 2)}%`;

  const stopPreview = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setPreviewReady(false);
  };

  const stopFrameStreaming = () => {
    if (frameIntervalRef.current) {
      window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    frameInflightRef.current = false;
  };

  const startFrameStreaming = () => {
    if (frameIntervalRef.current || source !== "webcam") {
      return;
    }
    frameIntervalRef.current = window.setInterval(async () => {
      if (frameInflightRef.current || paused) {
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
      const dataUrl = canvas.toDataURL("image/jpeg", 0.62);

      try {
        frameInflightRef.current = true;
        const response = await sendTrackingFrame(dataUrl);
        if (!response.detected) {
          setApiStatus("Tracking running, but no face/eyes detected.");
        }
      } catch (error) {
        setApiStatus(error.message || "Failed to stream webcam frame.");
      } finally {
        frameInflightRef.current = false;
      }
    }, 70);
  };

  const startPreview = async () => {
    if (source !== "webcam" || !navigator.mediaDevices?.getUserMedia) {
      stopPreview();
      return;
    }
    try {
      stopPreview();
      setPreviewError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPreviewReady(true);
    } catch (_error) {
      setPreviewReady(false);
      setPreviewError(
        "Browser camera preview unavailable. Allow camera permission in browser."
      );
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadStatus = async () => {
      try {
        const status = await getStatus();
        if (!mounted) {
          return;
        }
        setBackendOnline(true);
        setPaused(!status.running);
        setSource(status.source || "webcam");
        setIpUrl(status.url || "http://127.0.0.1:8080/shot.jpg");
        setCameraIndex(status.camera_index ?? 0);
        setApiStatus(
          status.last_error ||
            (status.running ? "Tracking process is running." : "Tracker is idle.")
        );
        if (status.settings) {
          setSensitivity(status.settings.sensitivity ?? 68);
          setSpeed(status.settings.speed ?? 72);
          setBlinkThreshold(status.settings.blinkThreshold ?? 38);
          setSmoothing(status.settings.smoothing ?? 56);
          setEdgeBoost(status.settings.edgeBoost ?? 35);
        }
      } catch (_error) {
        if (!mounted) {
          return;
        }
        setBackendOnline(false);
        setPaused(true);
        setApiStatus("Backend unavailable. Start backend/server.py first.");
      }
    };
    loadStatus();
    const intervalId = window.setInterval(loadStatus, 2500);
    return () => {
      window.clearInterval(intervalId);
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadCameras = async () => {
      try {
        const response = await getAvailableCameras();
        if (!active) {
          return;
        }
        const cameras = response?.cameras || [];
        setAvailableCameras(cameras);
        if (cameras.length > 0 && !cameras.includes(cameraIndex)) {
          setCameraIndex(cameras[0]);
        }
      } catch (_error) {
        if (active) {
          setAvailableCameras([]);
        }
      }
    };
    loadCameras();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadLog = async () => {
      try {
        const response = await getTrackingLog();
        if (!mounted) {
          return;
        }
        const lines = response?.lines || [];
        setRecentLog(lines.slice(-1)[0] || "");
      } catch (_error) {
        if (mounted) {
          setRecentLog("");
        }
      }
    };
    loadLog();
    const intervalId = window.setInterval(loadLog, 3000);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (source === "webcam") {
      startPreview();
    } else {
      stopPreview();
      stopFrameStreaming();
    }
  }, [source]);

  useEffect(() => {
    return () => {
      stopPreview();
      stopFrameStreaming();
    };
  }, []);

  useEffect(() => {
    if (!paused && source === "webcam" && previewReady) {
      startFrameStreaming();
    } else {
      stopFrameStreaming();
    }
    return () => {
      stopFrameStreaming();
    };
  }, [paused, source, previewReady]);

  useEffect(() => {
    if (!backendOnline) {
      return;
    }
    if (autoSaveTimeoutRef.current) {
      window.clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = window.setTimeout(() => {
      saveSettings({
        sensitivity,
        speed,
        blinkThreshold,
        smoothing,
        edgeBoost,
      }).catch(() => {});
    }, 500);
    return () => {
      if (autoSaveTimeoutRef.current) {
        window.clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [backendOnline, sensitivity, speed, blinkThreshold, smoothing, edgeBoost]);

  const handleSaveSettings = async () => {
    try {
      setLoading(true);
      await saveSettings({
        sensitivity,
        speed,
        blinkThreshold,
        smoothing,
        edgeBoost,
      });
      setApiStatus("Settings saved to backend.");
    } catch (error) {
      setApiStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTracking = async () => {
    try {
      setLoading(true);
      if (paused) {
        if (source === "webcam" && !mediaStreamRef.current) {
          await startPreview();
        }
        await startTracking({
          source,
          url: ipUrl,
          camera_index: cameraIndex,
        });
        setPaused(false);
        setApiStatus("Tracking started.");
      } else {
        await stopTracking();
        setPaused(true);
        setApiStatus("Tracking stopped.");
      }
    } catch (error) {
      setApiStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="app-route-shell grid gap-5 xl:grid-cols-[1.05fr_1.6fr_1.25fr]"
    >
      <GlassCard className="space-y-3">
        <h2 className="page-subsection-title">Tracking Status</h2>
        <StatusIndicator
          label="Backend API"
          status={backendOnline ? "online" : "offline"}
          value={backendOnline ? "Connected" : "Offline"}
        />
        <StatusIndicator
          label="Camera Connected"
          status={previewReady || !paused ? "online" : "warning"}
          value={
            source === "webcam"
              ? previewReady
                ? `Cam #${cameraIndex}`
                : "No Preview"
              : "IP Source"
          }
        />
        <StatusIndicator
          label="Eye Detection"
          status={paused ? "offline" : apiStatus.toLowerCase().includes("error") ? "warning" : "online"}
          value={paused ? "Paused" : "Active"}
        />
        <StatusIndicator
          label="Tracking Confidence"
          status={paused ? "warning" : "online"}
          value={confidence}
        />
        <p className="text-xs text-slate-500">{apiStatus}</p>
        {recentLog && <p className="text-[11px] text-slate-400">{recentLog}</p>}
      </GlassCard>

      <GlassCard className="flex min-h-[420px] flex-col">
        <h2 className="page-subsection-title">Live Preview</h2>
        <div className="relative mt-4 flex flex-1 items-center justify-center overflow-hidden rounded-[20px] border border-dashed border-purple-300/80 bg-white/45 p-2">
          <canvas ref={canvasRef} className="hidden" />
          {source === "webcam" && (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`h-full w-full rounded-xl object-cover ${previewReady ? "block" : "hidden"}`}
            />
          )}
          {!previewReady && (
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <div className="text-center">
                <motion.div
                  animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  className="mx-auto mb-4 h-16 w-16 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
                />
                <p className="text-lg font-semibold text-slate-800">Webcam Preview</p>
                <p className="mt-1 text-sm text-slate-600">
                  {source === "ip"
                    ? "IP source selected. Tracking runs in backend window."
                    : previewError || "Eye Tracking Overlay"}
                </p>
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      <GlassCard className="space-y-3">
        <h2 className="page-subsection-title">Control Sliders</h2>
        <div className="grid gap-2 rounded-2xl border border-white/70 bg-white/56 p-4">
          <label className="text-sm font-medium text-slate-700">Input Source</label>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="theme-input"
          >
            <option value="webcam">Webcam</option>
            <option value="ip">IP Camera</option>
          </select>
          {source === "webcam" ? (
            <div className="grid gap-1">
              <label className="text-sm font-medium text-slate-700">Camera Index</label>
              {availableCameras.length > 0 ? (
                <select
                  value={cameraIndex}
                  onChange={(event) => setCameraIndex(Number(event.target.value))}
                  className="theme-input"
                >
                  {availableCameras.map((index) => (
                    <option key={index} value={index}>
                      Camera {index}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min={0}
                  value={cameraIndex}
                  onChange={(event) => setCameraIndex(Number(event.target.value))}
                  className="theme-input"
                />
              )}
            </div>
          ) : (
            <div className="grid gap-1">
              <label className="text-sm font-medium text-slate-700">
                IP Camera URL
              </label>
              <input
                type="text"
                value={ipUrl}
                onChange={(event) => setIpUrl(event.target.value)}
                className="theme-input"
              />
            </div>
          )}
        </div>
        <SliderControl
          label="Cursor Sensitivity"
          min={0}
          max={100}
          value={sensitivity}
          onChange={setSensitivity}
        />
        <SliderControl
          label="Cursor Speed"
          min={0}
          max={100}
          value={speed}
          onChange={setSpeed}
        />
        <SliderControl
          label="Blink Click Threshold"
          min={0}
          max={100}
          value={blinkThreshold}
          onChange={setBlinkThreshold}
        />
        <SliderControl
          label="Movement Smoothing"
          min={0}
          max={100}
          value={smoothing}
          onChange={setSmoothing}
        />
        <SliderControl
          label="Edge Boost"
          min={0}
          max={100}
          value={edgeBoost}
          onChange={setEdgeBoost}
        />
        <div className="grid gap-2 pt-1">
          <GradientButton onClick={handleToggleTracking} disabled={loading}>
            {loading ? "Please wait..." : paused ? "Start Tracking" : "Pause Tracking"}
          </GradientButton>
          <GradientButton variant="subtle" onClick={startPreview}>
            Test Camera Preview
          </GradientButton>
          <GradientButton variant="subtle" onClick={handleSaveSettings}>
            Save Settings
          </GradientButton>
          <GradientButton variant="subtle" onClick={() => navigate("/calibration")}>
            Recalibrate
          </GradientButton>
          <GradientButton variant="subtle" onClick={() => navigate("/accuracy")}>
            Run Accuracy Test
          </GradientButton>
        </div>
      </GlassCard>
    </motion.div>
  );
}

export default EyeControl;
