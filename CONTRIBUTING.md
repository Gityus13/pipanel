# Contributing to PiPanel

First of all — thank you! PiPanel is built for the Pi community, by the Pi community. Every contribution matters.

---

## 🛠 Development Setup

### Requirements
- Raspberry Pi 5 (or any Linux machine for frontend dev)
- Python 3.10+
- Git

### Local Setup

```bash
git clone https://github.com/Gityus13/pipanel.git
cd pipanel

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install in editable mode with dev deps
pip install -e ".[dev]"

# Run in dev mode (auto-reload)
uvicorn pipanel.main:app --reload --port 8080
```

Then open `http://localhost:8080` in your browser.

---

## 📐 Project Structure

```
pipanel/
├── pipanel/
│   ├── main.py           # FastAPI app + routes
│   ├── config.py         # Config management
│   ├── api/              # REST API endpoints
│   │   ├── auth.py       # Login / token auth
│   │   ├── system.py     # CPU, RAM, temp, throttle
│   │   ├── services.py   # systemd services
│   │   ├── files.py      # File manager
│   │   ├── packages.py   # apt updates
│   │   ├── network.py    # LAN scanner
│   │   └── gpio.py       # GPIO monitor (Pi 5)
│   ├── ws/               # WebSocket endpoints
│   │   ├── terminal.py   # PTY shell
│   │   └── logs.py       # Live log streaming
│   └── static/           # Frontend (HTML/CSS/JS)
│       ├── index.html
│       ├── css/style.css
│       └── js/app.js
├── install.sh            # One-line installer
├── requirements.txt
└── pyproject.toml
```

---

## 🌿 Branching

| Branch | Purpose |
|---|---|
| `main` | Stable, always works |
| `dev` | Active development |
| `feature/xyz` | New features |
| `fix/xyz` | Bug fixes |

Please branch off `dev` and open PRs targeting `dev`.

---

## ✅ Guidelines

- **Keep it lightweight.** No heavy frameworks in the frontend — vanilla JS only.
- **Pi 5 first.** New features should work on Pi 5. Pi 4 compatibility is a bonus.
- **No build steps.** The frontend is served as static files — no webpack, no bundler.
- **One feature per PR.** Easier to review and merge.
- **Test on real hardware** when possible, especially GPIO and system APIs.

---

## 🐛 Reporting Bugs

Please use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template. Include:
- Pi model and OS version
- PiPanel version (`pipanel --version`)
- Steps to reproduce
- Expected vs actual behavior

---

## 💡 Feature Requests

Open a [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) issue. The more detail the better!

---

## 📄 License

By contributing, you agree that your code will be licensed under the [MIT License](LICENSE).
