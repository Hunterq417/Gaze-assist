const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5050";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_error) {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

export function getHealth() {
  return request("/health");
}

export function getStatus() {
  return request("/api/status");
}

export function getAvailableCameras() {
  return request("/api/cameras");
}

export function startTracking(payload) {
  return request("/api/tracking/start", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export function sendTrackingFrame(imageDataUrl) {
  return request("/api/tracking/frame", {
    method: "POST",
    body: JSON.stringify({ image: imageDataUrl }),
  });
}

export function stopTracking() {
  return request("/api/tracking/stop", { method: "POST" });
}

export function saveSettings(settings) {
  return request("/api/settings", {
    method: "POST",
    body: JSON.stringify(settings || {}),
  });
}

export function startCalibrationSession() {
  return request("/api/calibration/start", { method: "POST" });
}

export function sendCalibrationFrame(imageDataUrl, targetIndex) {
  return request("/api/calibration/frame", {
    method: "POST",
    body: JSON.stringify({ image: imageDataUrl, target_index: targetIndex }),
  });
}

export function completeCalibrationSession() {
  return request("/api/calibration/complete", { method: "POST" });
}

export function submitAccuracyReport(report) {
  return request("/api/accuracy/report", {
    method: "POST",
    body: JSON.stringify(report || {}),
  });
}

export function getTrackingLog() {
  return request("/api/tracking/log");
}
