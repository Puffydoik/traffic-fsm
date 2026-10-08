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

## FSM Transition Table

Every row is a rule the FSM engine evaluates. The **Input** column is the event that triggers the transition. The **Vehicle** and **Pedestrian** columns show the signal outputs while the *destination* state is active.

| Current State | Input / Condition | Next State | Signal Output | Pedestrian Output |
|---------------|-------------------|------------|----------------|-------------------|
| S0 (Main Green) | TIMER_EXPIRED (10s) | S1 (Main Yellow) | Main YELLOW / Side RED | ✋ Don't Walk |
| S1 (Main Yellow) | TIMER_EXPIRED (3s) | S2 (Side Green) | Main RED / Side GREEN | ✋ Don't Walk |
| S2 (Side Green) | TIMER_EXPIRED (10s) | S3 (Side Yellow) | Main RED / Side YELLOW | ✋ Don't Walk |
| S3 (Side Yellow) | TIMER_EXPIRED (3s) | S0 (Main Green) | Main GREEN / Side RED | ✋ Don't Walk |
| S0 (Main Green) | PED_REQUEST | S4 (Pedestrian) | ALL RED | 🚶 WALK |
| S1 (Main Yellow) | PED_REQUEST | S4 (Pedestrian) | ALL RED | 🚶 WALK |
| S2 (Side Green) | PED_REQUEST | S4 (Pedestrian) | ALL RED | 🚶 WALK |
| S3 (Side Yellow) | PED_REQUEST | S4 (Pedestrian) | ALL RED | 🚶 WALK |
| S4 (Pedestrian) | PED_REQUEST (again) | S4 (Pedestrian) | ALL RED | 🚶 WALK |
| S4 (Pedestrian) | TIMER_EXPIRED (8s) | S0 (Main Green) | Main GREEN / Side RED | ✋ Don't Walk |
| S0 – S4 (any) | EMERGENCY_DETECTED | S5 (Emergency) | Emergency GREEN / other RED | ✋ Don't Walk |
| S5 (Emergency) | EMERGENCY_CLEARED (main road) | S1 (Main Yellow) | Main YELLOW / Side RED | ✋ Don't Walk |
| S5 (Emergency) | EMERGENCY_CLEARED (side road) | S3 (Side Yellow) | Main RED / Side YELLOW | ✋ Don't Walk |
| — (any) | RESET | S0 (Main Green) | Main GREEN / Side RED | ✋ Don't Walk |

### How Transitions Work

**Normal cycle (timer-driven):**
The FSM automatically advances when a state's timer expires. The cycle is S0 → S1 → S2 → S3 → S0. Between every yellow and the next green, a **2-second all-red clearance** is inserted — no vehicle has green, so the intersection is guaranteed clear before the next direction goes.

**Pedestrian request (event-driven):**
When you click "Request Pedestrian Crossing", a flag is set. The FSM finishes the current green phase, goes through yellow + all-red clearance, then enters S4 (all vehicle signals red, pedestrian WALK). If you request again during an active crossing, the flag stays set and another S4 cycle runs after the current one finishes.

**Emergency override (highest priority):**
Triggering an emergency immediately interrupts normal operation. If the current green conflicts with the emergency direction, the FSM first goes through yellow → all-red clearance, then enters S5 (green for the emergency direction, red for all others). Regular vehicles are held at their stop lines. When you click "Clear Emergency", the FSM safely returns to the normal cycle via yellow + all-red.

**Safety invariant:**
At no point do conflicting directions ever show green simultaneously. The FSM structure makes this impossible — every path from one green to another passes through yellow and all-red states.

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
