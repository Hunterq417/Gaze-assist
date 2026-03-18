"""
GazeAssist Python Eye Tracking Backend
Uses OpenCV + MediaPipe Tasks API for iris + hand tracking.
Compatible with mediapipe >= 0.10.x

Streams real-time gaze / gesture data to the React frontend via WebSocket.
"""

import os
from pathlib import Path

# Load .env from python_backend dir when run standalone (optional; requires python-dotenv)
_env_path = Path(__file__).resolve().parent / '.env'
if _env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path)
    except ImportError:
        pass  # dotenv not installed; rely on env vars from parent (e.g. run-backend.js)

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
try:
    import pyautogui
    pyautogui.FAILSAFE = False
except Exception:
    pyautogui = None

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import threading
import time
import logging
import urllib.request

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# ── Flask app ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'fallback_secret')
CORS(app, origins=["http://localhost:3000", "http://127.0.0.1:3000"])
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# ── Model paths ───────────────────────────────────────────────────────────────
MODEL_DIR       = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
FACE_MODEL_PATH = os.path.join(MODEL_DIR, 'face_landmarker.task')
HAND_MODEL_PATH = os.path.join(MODEL_DIR, 'hand_landmarker.task')

FACE_MODEL_URL = ('https://storage.googleapis.com/mediapipe-models/'
                  'face_landmarker/face_landmarker/float16/1/face_landmarker.task')
HAND_MODEL_URL = ('https://storage.googleapis.com/mediapipe-models/'
                  'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task')

# MediaPipe iris landmark indices (478-point model with iris refinement enabled)
LEFT_IRIS         = [468, 469, 470, 471]
RIGHT_IRIS        = [472, 473, 474, 475]
LEFT_EYE_CORNERS  = [33, 133]
RIGHT_EYE_CORNERS = [362, 263]


# ── Model downloader ──────────────────────────────────────────────────────────
def ensure_model(path, url):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        logger.info(f"Downloading {os.path.basename(path)} …")
        try:
            urllib.request.urlretrieve(url, path)
            logger.info(f"Saved to {path}")
        except Exception as e:
            logger.error(f"Failed to download model: {e}")
            raise


# ── Global state ──────────────────────────────────────────────────────────────
class State:
    running           = False
    calibration_data  = []
    calibration_model = None
    is_calibrated     = False
    smoothed_gaze     = {'x': 0.5, 'y': 0.5}
    # Exponential smoothing factor for gaze (0-1).
    # Higher = more responsive, lower = smoother.
    SMOOTH            = 0.28
    lock              = threading.Lock()

state = State()

# Additional smoothing / deadzone just for OS mouse control
MOUSE_SMOOTH   = 0.20   # extra EMA on top of gaze smoothing
MOUSE_DEADZONE = 0.004  # ignore tiny movements (<0.4% of screen)


# ── Iris gaze extraction ──────────────────────────────────────────────────────
def get_iris_gaze(lms):
    """
    lms: list of NormalizedLandmark from FaceLandmarker result.
    Returns (gaze_x, gaze_y) in 0-1 normalized screen space.
    """
    def pt(i):
        return np.array([lms[i].x, lms[i].y])

    try:
        l_iris = np.mean([pt(i) for i in LEFT_IRIS],  axis=0)
        r_iris = np.mean([pt(i) for i in RIGHT_IRIS], axis=0)

        lc0, lc1 = pt(LEFT_EYE_CORNERS[0]),  pt(LEFT_EYE_CORNERS[1])
        rc0, rc1 = pt(RIGHT_EYE_CORNERS[0]), pt(RIGHT_EYE_CORNERS[1])

        def iris_ratio(iris_c, c0, c1):
            eye_vec   = c1 - c0
            eye_width = np.linalg.norm(eye_vec) + 1e-7
            iris_proj = np.dot(iris_c - c0, eye_vec) / (eye_width ** 2)
            rx = float(np.clip(iris_proj, 0.0, 1.0))
            eye_cy = (c0[1] + c1[1]) / 2
            ry = float(np.clip((iris_c[1] - eye_cy) / 0.025 + 0.5, 0.0, 1.0))
            return rx, ry

        lx, ly = iris_ratio(l_iris, lc0, lc1)
        rx, ry = iris_ratio(r_iris, rc0, rc1)
        return (lx + rx) / 2, (ly + ry) / 2

    except Exception as e:
        logger.debug(f"iris error: {e}")
        return 0.5, 0.5


# ── Calibration ───────────────────────────────────────────────────────────────
def fit_calibration(data):
    if len(data) < 4:
        return None
    gx = np.array([d['gaze']['x']   for d in data])
    gy = np.array([d['gaze']['y']   for d in data])
    sx = np.array([d['screen']['x'] for d in data])
    sy = np.array([d['screen']['y'] for d in data])

    F = np.column_stack([np.ones_like(gx), gx, gy, gx**2, gy**2, gx*gy])
    cx, *_ = np.linalg.lstsq(F, sx, rcond=None)
    cy, *_ = np.linalg.lstsq(F, sy, rcond=None)
    return {'coef_x': cx.tolist(), 'coef_y': cy.tolist()}


def apply_calibration(model, gx, gy):
    if model is None:
        return gx, gy
    f  = np.array([1, gx, gy, gx**2, gy**2, gx*gy])
    sx = float(np.dot(model['coef_x'], f))
    sy = float(np.dot(model['coef_y'], f))
    return sx, sy


# ── Hand gesture ──────────────────────────────────────────────────────────────
def classify_hand_gesture(hand_lms):
    def lm(i):
        l = hand_lms[i]
        return np.array([l.x, l.y])

    def dist(a, b):
        return np.linalg.norm(a - b)

    thumb  = lm(4);  index  = lm(8)
    middle = lm(12); ring   = lm(16); pinky = lm(20); wrist = lm(0)
    i_mcp  = lm(5);  m_mcp  = lm(9); r_mcp = lm(13); p_mcp = lm(17)

    pinch_dist = dist(thumb, index)
    palm_span  = (dist(wrist, index) + dist(wrist, middle) +
                  dist(wrist, ring)  + dist(wrist, pinky)) / 4

    if palm_span > 0 and pinch_dist < palm_span * 0.28:
        return 'pinch'

    e_idx = hand_lms[8].y  < hand_lms[5].y
    e_mid = hand_lms[12].y < hand_lms[9].y
    e_rng = hand_lms[16].y < hand_lms[13].y
    e_pnk = hand_lms[20].y < hand_lms[17].y
    if e_idx and e_mid and e_rng and e_pnk and palm_span > 0.15 and pinch_dist > palm_span * 0.4:
        return 'palm'
    return None


# ── Tracking loop ─────────────────────────────────────────────────────────────
def tracking_loop():
    logger.info("Tracking loop starting…")

    # Download models if missing
    try:
        ensure_model(FACE_MODEL_PATH, FACE_MODEL_URL)
        ensure_model(HAND_MODEL_PATH, HAND_MODEL_URL)
    except Exception as e:
        socketio.emit('tracker_error', {'message': str(e)})
        state.running = False
        return

    # Build detectors (IMAGE mode – no timestamp ordering requirement)
    # Use more permissive thresholds so we still mark a face
    # as detected under low light / noisy conditions.
    face_opts = mp_vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=FACE_MODEL_PATH),
        running_mode=mp_vision.RunningMode.IMAGE,
        output_face_blendshapes=False,
        output_facial_transformation_matrixes=False,
        num_faces=1,
        min_face_detection_confidence=0.15,
        min_face_presence_confidence=0.15,
        min_tracking_confidence=0.15,
    )
    face_det = mp_vision.FaceLandmarker.create_from_options(face_opts)

    hand_opts = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=HAND_MODEL_PATH),
        running_mode=mp_vision.RunningMode.IMAGE,
        num_hands=1,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.4,
        min_tracking_confidence=0.4,
    )
    hand_det = mp_vision.HandLandmarker.create_from_options(hand_opts)

    # Try camera index 0 first, then 1 as fallback
    cap = None
    for cam_idx in [0, 1, 2]:
        c = cv2.VideoCapture(cam_idx)
        if c.isOpened():
            cap = c
            logger.info(f"Webcam opened on index {cam_idx}")
            break
        c.release()

    if cap is None:
        logger.error("Cannot open any webcam")
        socketio.emit('tracker_error', {'message': 'Cannot open webcam – please check camera permissions'})
        face_det.close(); hand_det.close()
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, 30)

    # User suggested camera parameters
    cap.set(cv2.CAP_PROP_BRIGHTNESS, 150)
    cap.set(cv2.CAP_PROP_CONTRAST, 150)

    logger.info("Webcam ready – starting tracking loop")
    face_error_logged = False
    face_missing_frames = 0

    # Headless/cloud environments may not expose a display. Use a fallback
    # resolution for normalized mapping while keeping OS mouse movement disabled.
    screen_w, screen_h = 1920, 1080
    last_mouse_x = 0.5
    last_mouse_y = 0.5
    if pyautogui is not None:
        try:
            screen_w, screen_h = pyautogui.size()
            logger.info(f"Mouse control enabled at {screen_w}x{screen_h}")
        except Exception as e:
            logger.warning(f"pyautogui screen size error: {e}")
            logger.info(
                f"Using fallback virtual screen size {screen_w}x{screen_h} for tracking"
            )

    while state.running:
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.033)
            continue

        frame  = cv2.flip(frame, 1)
        gray   = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray   = cv2.equalizeHist(gray)
        gray   = cv2.GaussianBlur(gray, (5, 5), 0)
        rgb    = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        # Face / iris – IMAGE mode (no timestamp needed)
        gaze_x, gaze_y  = 0.5, 0.5
        face_detected   = False

        try:
            face_result = face_det.detect(mp_img)
            if face_result.face_landmarks:
                face_detected      = True
                face_missing_frames = 0
                face_error_logged  = False   # reset after successful detection
                lms                = face_result.face_landmarks[0]
                raw_x, raw_y       = get_iris_gaze(lms)

                with state.lock:
                    model = state.calibration_model

                if model:
                    mx, my = apply_calibration(model, raw_x, raw_y)
                    gaze_x = float(np.clip(mx, 0, 1))
                    gaze_y = float(np.clip(my, 0, 1))
                else:
                    gaze_x, gaze_y = raw_x, raw_y

                with state.lock:
                    a = state.SMOOTH
                    state.smoothed_gaze['x'] = a * gaze_x + (1-a) * state.smoothed_gaze['x']
                    state.smoothed_gaze['y'] = a * gaze_y + (1-a) * state.smoothed_gaze['y']
                    gaze_x = state.smoothed_gaze['x']
                    gaze_y = state.smoothed_gaze['y']
            else:
                # Only drop faceDetected after several consecutive misses
                face_missing_frames += 1
                if face_missing_frames > 10:
                    face_detected = False

        except Exception as e:
            if not face_error_logged:
                logger.warning(f"Face detect error: {e}")
                face_error_logged = True

        # Move OS mouse pointer only if MOVE_SYSTEM_CURSOR=1 (default: use physical mouse/trackpad)
        if os.getenv('MOVE_SYSTEM_CURSOR', '').strip() == '1' and pyautogui is not None and screen_w and screen_h:
            try:
                gx_n = float(np.clip(gaze_x, 0.0, 1.0))
                gy_n = float(np.clip(gaze_y, 0.0, 1.0))

                dx = gx_n - last_mouse_x
                dy = gy_n - last_mouse_y

                if abs(dx) < MOUSE_DEADZONE and abs(dy) < MOUSE_DEADZONE:
                    gx_sm = last_mouse_x
                    gy_sm = last_mouse_y
                else:
                    a_m = MOUSE_SMOOTH
                    gx_sm = a_m * gx_n + (1 - a_m) * last_mouse_x
                    gy_sm = a_m * gy_n + (1 - a_m) * last_mouse_y

                last_mouse_x, last_mouse_y = gx_sm, gy_sm

                mx = int(gx_sm * (screen_w - 1))
                my = int(gy_sm * (screen_h - 1))
                pyautogui.moveTo(mx, my)
            except Exception as e:
                logger.debug(f"mouse move error: {e}")

        # Hand gesture – IMAGE mode
        gesture = None
        try:
            hand_result = hand_det.detect(mp_img)
            if hand_result.hand_landmarks:
                gesture = classify_hand_gesture(hand_result.hand_landmarks[0])
        except Exception as e:
            logger.debug(f"Hand detect error: {e}")

        # Emit
        socketio.emit('gaze_data', {
            'gazeX':        round(float(gaze_x), 4),
            'gazeY':        round(float(gaze_y), 4),
            'faceDetected': face_detected,
            'gesture':      gesture,
        })

        # Only show debug windows when DEBUG=1 env var is set
        if os.getenv('DEBUG', '').strip() == '1':
            cv2.imshow("gray", gray)
            cv2.imshow("Debug Face", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

        time.sleep(0.020)

    cap.release()
    if os.getenv('DEBUG', '').strip() == '1':
        cv2.destroyAllWindows()
    face_det.close()
    hand_det.close()
    logger.info("Tracking loop stopped")


# ── REST endpoints ────────────────────────────────────────────────────────────
@app.route('/api/start', methods=['POST'])
def start_tracking():
    if state.running:
        return jsonify({'status': 'already_running'})
    state.running = True
    threading.Thread(target=tracking_loop, daemon=True).start()
    return jsonify({'status': 'started'})


@app.route('/api/stop', methods=['POST'])
def stop_tracking():
    state.running = False
    return jsonify({'status': 'stopped'})


@app.route('/api/calibration/reset', methods=['POST'])
def reset_calibration():
    with state.lock:
        state.calibration_data  = []
        state.calibration_model = None
        state.is_calibrated     = False
        state.smoothed_gaze     = {'x': 0.5, 'y': 0.5}
    return jsonify({'status': 'reset'})


@app.route('/api/calibration/add_point', methods=['POST'])
def add_calibration_point():
    body = request.json or {}
    entry = {
        'gaze':   {'x': body.get('gazeX',   0.5), 'y': body.get('gazeY',   0.5)},
        'screen': {'x': body.get('screenX', 0.5), 'y': body.get('screenY', 0.5)},
    }
    with state.lock:
        state.calibration_data.append(entry)
    return jsonify({'status': 'added', 'count': len(state.calibration_data)})


@app.route('/api/calibration/complete', methods=['POST'])
def complete_calibration():
    with state.lock:
        data = list(state.calibration_data)
    if len(data) < 4:
        return jsonify({'status': 'error', 'message': 'Need ≥4 calibration points'}), 400
    model = fit_calibration(data)
    if model is None:
        return jsonify({'status': 'error', 'message': 'Calibration fitting failed'}), 500
    with state.lock:
        state.calibration_model = model
        state.is_calibrated     = True
    logger.info(f"Calibration complete – {len(data)} points")
    return jsonify({'status': 'success', 'points': len(data)})


@app.route('/api/status', methods=['GET'])
def get_status():
    with state.lock:
        return jsonify({
            'running':        state.running,
            'isCalibrated':   state.is_calibrated,
            'calibrationPts': len(state.calibration_data),
            'gaze':           state.smoothed_gaze,
        })


# ── SocketIO events ───────────────────────────────────────────────────────────
@socketio.on('connect')
def on_connect():
    logger.info("Frontend connected")
    emit('connected', {'message': 'GazeAssist ready'})


@socketio.on('disconnect')
def on_disconnect():
    logger.info("Frontend disconnected")


@socketio.on('start_tracking')
def on_start_tracking():
    if not state.running:
        state.running = True
        threading.Thread(target=tracking_loop, daemon=True).start()
    emit('tracking_started', {'status': 'ok'})


@socketio.on('stop_tracking')
def on_stop_tracking():
    state.running = False
    emit('tracking_stopped', {'status': 'ok'})


if __name__ == '__main__':
    port = int(os.getenv("PORT", "5001"))
    logger.info(f"=== GazeAssist Eye Tracker on http://0.0.0.0:{port} ===")
    socketio.run(
        app, host='0.0.0.0', port=port, debug=False, allow_unsafe_werkzeug=True
    )
