import argparse
from collections import deque

import cv2
import numpy as np
import pyautogui
import requests

try:
    import mediapipe
except ImportError:
    mediapipe = None


WINDOW_WIDTH = 800
WINDOW_HEIGHT = 600
CLICK_THRESHOLD = 0.015
CLICK_COOLDOWN_FRAMES = 12


def map_gaze_to_screen(raw_x, raw_y, tracker_state, screen_w, screen_h):
    x_history = tracker_state["x_history"]
    y_history = tracker_state["y_history"]
    x_history.append(float(raw_x))
    y_history.append(float(raw_y))

    if len(x_history) >= 20 and len(y_history) >= 20:
        min_x = max(0.0, float(np.percentile(x_history, 5)) - 0.03)
        max_x = min(1.0, float(np.percentile(x_history, 95)) + 0.03)
        min_y = max(0.0, float(np.percentile(y_history, 5)) - 0.03)
        max_y = min(1.0, float(np.percentile(y_history, 95)) + 0.03)
    else:
        min_x, max_x = 0.2, 0.8
        min_y, max_y = 0.2, 0.8

    range_x = max(max_x - min_x, 0.05)
    range_y = max(max_y - min_y, 0.05)
    norm_x = max(0.0, min(1.0, (raw_x - min_x) / range_x))
    norm_y = max(0.0, min(1.0, (raw_y - min_y) / range_y))
    target_x = norm_x * (screen_w - 1)
    target_y = norm_y * (screen_h - 1)

    last_x = tracker_state["last_x"]
    last_y = tracker_state["last_y"]
    if last_x is None or last_y is None:
        move_x, move_y = target_x, target_y
    else:
        alpha = 0.58
        move_x = last_x + (target_x - last_x) * alpha
        move_y = last_y + (target_y - last_y) * alpha
        if abs(move_x - last_x) < 1.0:
            move_x = last_x
        if abs(move_y - last_y) < 1.0:
            move_y = last_y

    tracker_state["last_x"] = move_x
    tracker_state["last_y"] = move_y
    return max(0, min(screen_w - 1, int(move_x))), max(0, min(screen_h - 1, int(move_y)))


def create_face_mesh_detector():
    if mediapipe is None:
        return None
    if hasattr(mediapipe, "solutions") and hasattr(mediapipe.solutions, "face_mesh"):
        return mediapipe.solutions.face_mesh.FaceMesh(refine_landmarks=True)
    return None


def parse_args():
    parser = argparse.ArgumentParser(
        description="Control mouse pointer using face mesh landmarks."
    )
    parser.add_argument(
        "--source",
        choices=["ip", "webcam"],
        default="webcam",
        help="Frame source: 'webcam' (default) or 'ip' (IP Webcam shot URL).",
    )
    parser.add_argument(
        "--url",
        default="http://127.0.0.1:8080/shot.jpg",
        help="IP camera snapshot URL when --source ip is selected.",
    )
    parser.add_argument(
        "--camera-index",
        type=int,
        default=0,
        help="Webcam device index for --source webcam.",
    )
    return parser.parse_args()


def get_frame_from_ip(url: str):
    try:
        response = requests.get(url, timeout=3)
        response.raise_for_status()
    except requests.RequestException:
        return None
    img_arr = np.array(bytearray(response.content), dtype=np.uint8)
    return cv2.imdecode(img_arr, cv2.IMREAD_COLOR)


def process_with_mediapipe(
    image, face_mesh_landmarks, screen_w, screen_h, click_cooldown, tracker_state
):
    window_h, window_w, _ = image.shape
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    processed_image = face_mesh_landmarks.process(rgb_image)
    all_face_landmark_points = processed_image.multi_face_landmarks

    if not all_face_landmark_points:
        return click_cooldown

    one_face_landmark_points = all_face_landmark_points[0].landmark
    for idx, landmark_point in enumerate(one_face_landmark_points[474:478]):
        x = int(landmark_point.x * window_w)
        y = int(landmark_point.y * window_h)
        if idx == 1:
            mouse_x, mouse_y = map_gaze_to_screen(
                landmark_point.x, landmark_point.y, tracker_state, screen_w, screen_h
            )
            pyautogui.moveTo(mouse_x, mouse_y)
        cv2.circle(image, (x, y), 3, (0, 0, 255), -1)

    left_eye = [one_face_landmark_points[145], one_face_landmark_points[159]]
    for landmark_point in left_eye:
        x = int(landmark_point.x * window_w)
        y = int(landmark_point.y * window_h)
        cv2.circle(image, (x, y), 6, (0, 255, 0), -1)

    if click_cooldown > 0:
        return click_cooldown - 1
    if (left_eye[0].y - left_eye[1].y) < CLICK_THRESHOLD:
        pyautogui.click()
        print("Mouse clicked")
        return CLICK_COOLDOWN_FRAMES
    return 0


def process_with_haar(
    image, face_detector, eye_detector, screen_w, screen_h, click_cooldown, tracker_state
):
    window_h, window_w, _ = image.shape
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    faces = face_detector.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(80, 80))

    if len(faces) == 0:
        return max(click_cooldown - 1, 0)

    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    cv2.rectangle(image, (x, y), (x + w, y + h), (255, 200, 0), 2)

    roi_gray = gray[y : y + h, x : x + w]
    roi_color = image[y : y + h, x : x + w]
    eyes = eye_detector.detectMultiScale(
        roi_gray, scaleFactor=1.1, minNeighbors=6, minSize=(20, 20)
    )
    eyes = sorted(eyes, key=lambda e: e[0])

    if eyes:
        ex, ey, ew, eh = eyes[-1]
        eye_x = x + ex + ew // 2
        eye_y = y + ey + eh // 2
        mouse_x, mouse_y = map_gaze_to_screen(
            eye_x / window_w, eye_y / window_h, tracker_state, screen_w, screen_h
        )
        pyautogui.moveTo(mouse_x, mouse_y)
        cv2.circle(image, (eye_x, eye_y), 5, (0, 0, 255), -1)

    for ex, ey, ew, eh in eyes[:2]:
        cv2.rectangle(roi_color, (ex, ey), (ex + ew, ey + eh), (0, 255, 0), 2)

    if click_cooldown > 0:
        return click_cooldown - 1
    if len(eyes) <= 1:
        pyautogui.click()
        print("Mouse clicked (blink heuristic)")
        return CLICK_COOLDOWN_FRAMES
    return 0


def main():
    args = parse_args()
    face_mesh_landmarks = create_face_mesh_detector()
    screen_w, screen_h = pyautogui.size()
    click_cooldown = 0
    tracker_state = {"last_x": None, "last_y": None, "x_history": deque(maxlen=140), "y_history": deque(maxlen=140)}
    using_haar_fallback = face_mesh_landmarks is None
    face_detector = None
    eye_detector = None

    if using_haar_fallback:
        print("MediaPipe FaceMesh is unavailable. Using OpenCV Haar-cascade fallback.")
        face_detector = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        eye_detector = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_eye_tree_eyeglasses.xml"
        )
        if face_detector.empty() or eye_detector.empty():
            print("Failed to load Haar cascade files from OpenCV data directory.")
            return

    cap = None
    if args.source == "webcam":
        cap = cv2.VideoCapture(args.camera_index)
        if not cap.isOpened():
            print(
                f"Unable to open webcam at index {args.camera_index}. "
                "Try another index or use --source ip."
            )
            return

    while True:
        if args.source == "ip":
            image = get_frame_from_ip(args.url)
            if image is None:
                print("Failed to fetch frame from IP camera URL.")
                if cv2.waitKey(1) == 27:
                    break
                continue
        else:
            ok, image = cap.read()
            if not ok or image is None:
                print("Failed to read frame from webcam.")
                if cv2.waitKey(1) == 27:
                    break
                continue

        image = cv2.flip(image, 1)
        if using_haar_fallback:
            click_cooldown = process_with_haar(
                image, face_detector, eye_detector, screen_w, screen_h, click_cooldown, tracker_state
            )
        else:
            click_cooldown = process_with_mediapipe(
                image, face_mesh_landmarks, screen_w, screen_h, click_cooldown, tracker_state
            )

        resized_image = cv2.resize(image, (WINDOW_WIDTH, WINDOW_HEIGHT))
        cv2.imshow("Eye Controlled Mouse", resized_image)

        if cv2.waitKey(1) & 0xFF == 27:
            break

    if cap is not None:
        cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
