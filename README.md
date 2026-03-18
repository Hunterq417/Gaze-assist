# GazeAssist (Eye-Controlled Mouse + Web UI)

GazeAssist is an eye-tracking accessibility project with:

- a Python backend API for calibration/tracking control
- a React frontend UI for setup and control
- optional standalone Python tracker scripts

This README is written so you can install and run the project on another system.

---

## 1) System Requirements

- Python 3.10+ (recommended 3.11)
- Node.js 20+ and npm
- Webcam access
- Windows/macOS/Linux

---

## 2) Project Structure

- `backend/` - Flask API + tracking integration
- `frontend/` - React + Vite UI
- `main.py` - optional standalone tracker entry point

---

## 3) Setup on a New Machine

### Step A: Copy/Extract Project

Extract the project zip and open a terminal in the project root (`Eye-controlled-mouse`).

### Step B: Backend Setup (Python)

From project root:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

- Windows (PowerShell):

```powershell
.venv\Scripts\Activate.ps1
```

- macOS/Linux:

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

Run backend API:

```bash
python server.py
```

Backend default URL:

```text
http://127.0.0.1:5050
```

Health check:

```text
GET /health
```

### Step C: Frontend Setup (React)

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend default URL:

```text
http://localhost:5173
```

---

## 4) Running the Full App

1. Start backend: `python server.py` (inside `backend/` venv).
2. Start frontend: `npm run dev` (inside `frontend/`).
3. Open `http://localhost:5173`.

---

## 5) Optional Standalone Tracker Mode

From project root:

```bash
python main.py
```

IP camera mode:

```bash
python main.py --source ip --url http://YOUR_PHONE_IP:8080/shot.jpg
```

---

## 6) Common Troubleshooting

- **Backend unavailable in UI**
  - Confirm `python server.py` is running on port `5050`.
- **Camera preview not visible**
  - Allow browser camera permission.
  - Close other apps that may lock the camera.
- **Frontend fails to start**
  - Use current Node LTS and rerun `npm install`.
- **Python dependency issues**
  - Verify you activated the backend `.venv` before installing/running.

---

## 7) Build Check (Optional)

To verify frontend build:

```bash
cd frontend
npm run build
```

If this succeeds, frontend production bundling is valid.
