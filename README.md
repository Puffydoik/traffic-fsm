# Smart Traffic Light Controller — FSM Simulation

A fully functional, visually appealing **Traffic Light Controller GUI** based on a **Finite State Machine (FSM)**. Simulates a real-world four-way intersection with normal traffic operation, pedestrian crossing, and emergency vehicle priority.

![Simulation](https://img.shields.io/badge/status-working-brightgreen)

## Features

- **6-state FSM** controlling all traffic signals
- **Normal cycle:** Main Green → Main Yellow → Side Green → Side Yellow → repeat
- **Pedestrian crossing** with request button and animated crossing
- **Emergency vehicle priority** (Ambulance / Fire Truck / Police) with safe signal transitions
- **All-red clearance** (2s) between conflicting green phases
- **Manual mode** for step-by-step FSM demonstration
- **Speed control:** 1×, 2×, 5×
- **Live monitoring panel** with state, signals, timers, and counters
- **FSM state transition diagram** with active state highlighting
- **Transition table** generated from the same FSM definitions
- **Event log** with timestamped entries
- **Configurable timers** (green, yellow, all-red, pedestrian)
- **Dark-themed**, responsive UI

## FSM States

| State | Name | Main Road | Side Road | Pedestrian |
|-------|------|-----------|-----------|------------|
| S0 | Main Green | 🟢 GREEN | 🔴 RED | ✋ Don't Walk |
| S1 | Main Yellow | 🟡 YELLOW | 🔴 RED | ✋ Don't Walk |
| S2 | Side Green | 🔴 RED | 🟢 GREEN | ✋ Don't Walk |
| S3 | Side Yellow | 🔴 RED | 🟡 YELLOW | ✋ Don't Walk |
| S4 | Pedestrian Crossing | 🔴 RED | 🔴 RED | 🚶 WALK |
| S5 | Emergency Mode | Emergency Green | Emergency Green | ✋ Don't Walk |

## Technology Stack

- **HTML5** — structure
- **CSS3** — dark theme, animations, responsive layout
- **Vanilla JavaScript** — FSM engine, simulation, SVG rendering
- No frameworks, no build tools, no backend

## How to Run

### Option 1 — Open directly
Double-click `index.html` in any modern browser.

### Option 2 — GitHub Pages
1. Go to **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main`, folder: `/ (root)` → **Save**
4. Visit `https://puffydoik.github.io/traffic-fsm/`

### Option 3 — Local server
```bash
cd traffic-fsm
python -m http.server 8000
# then open http://localhost:8000
```

## How to Use

1. **Start** — begins the simulation
2. **Pause / Resume** — freeze and continue
3. **Reset** — return to S0 (Main Green)
4. **Automatic / Manual** — toggle between timer-driven and button-driven transitions
5. **Speed** — 1×, 2×, or 5× simulation speed
6. **Request Pedestrian Crossing** — queues a crossing at the next safe phase
7. **Emergency Vehicle** — select type and direction, then trigger; clear when done
8. **Timer Configuration** — adjust green, yellow, all-red, and pedestrian durations

## Safety Guarantees

- Conflicting green signals are **never** active simultaneously
- All green-to-green transitions pass through **yellow + all-red clearance**
- Emergency vehicles always have a **clear path** (all regular traffic held)
- Pause **preserves** full simulation state
- Reset returns to a **safe initial state** (S0)

## Project Structure

```
traffic-fsm/
├── index.html    # Main application layout
├── style.css     # Styling, animations, responsive design
├── script.js     # FSM logic, simulation engine, rendering
└── README.md     # This file
```

## License

Free to use for educational purposes.
