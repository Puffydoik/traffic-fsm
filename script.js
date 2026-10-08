/**
 * Smart Traffic Light Controller — FSM Simulation
 *
 * A genuine finite-state-machine traffic controller with 6 states:
 *   S0: Main Green          S1: Main Yellow
 *   S2: Side Green          S3: Side Yellow
 *   S4: Pedestrian Crossing S5: Emergency Mode
 *
 * Normal cycle: S0 → S1 → S2 → S3 → S0
 * All-red clearance (2s) enforced between conflicting green phases.
 * Pedestrian crossing (S4) is requested via button.
 * Emergency mode (S5) overrides normal operation with safe transitions.
 */

// ============================================
// Configuration
// ============================================

const CONFIG = {
    GREEN_DURATION: 10,
    YELLOW_DURATION: 3,
    ALL_RED_DURATION: 2,
    PED_DURATION: 8,

    CAR_SPAWN_INTERVAL: 3,
    CAR_MAX_SPEED: 80,
    CAR_ACCELERATION: 120,
    CAR_DECELERATION: 200,
    CAR_MIN_GAP: 35,
    CAR_LENGTH: 28,
    CAR_WIDTH: 14,

    EMERGENCY_SPEED: 130,
    PED_SPEED: 35,

    INTERSECTION: { x: 240, y: 240, width: 120, height: 120 },
    MAIN_ROAD: { y: 240, width: 120 },
    SIDE_ROAD: { x: 240, width: 120 },

    STOP_LINES: { mainLeft: 215, mainRight: 385, sideTop: 215, sideBottom: 385 },
    LANES: { mainLeft: 270, mainRight: 330, sideTop: 270, sideBottom: 330 },
    SPAWN: { mainLeft: -30, mainRight: 630, sideTop: -30, sideBottom: 630 },
    DESPAWN: { mainLeft: 630, mainRight: -30, sideTop: 630, sideBottom: -30 }
};

// ============================================
// FSM Definitions (single source of truth)
// ============================================

const FSM_STATES = {
    S0: { name: 'Main Green',          type: 'green' },
    S1: { name: 'Main Yellow',         type: 'yellow' },
    S2: { name: 'Side Green',          type: 'green' },
    S3: { name: 'Side Yellow',         type: 'yellow' },
    S4: { name: 'Pedestrian Crossing', type: 'ped' },
    S5: { name: 'Emergency Mode',      type: 'emergency' }
};

// Vehicle / pedestrian outputs while a state is active
const STATE_OUTPUT = {
    S0: { vehicles: 'Main GREEN / Side RED',  ped: "DON'T WALK" },
    S1: { vehicles: 'Main YELLOW / Side RED', ped: "DON'T WALK" },
    S2: { vehicles: 'Main RED / Side GREEN',  ped: "DON'T WALK" },
    S3: { vehicles: 'Main RED / Side YELLOW', ped: "DON'T WALK" },
    S4: { vehicles: 'ALL RED',                ped: 'WALK' },
    S5: { vehicles: 'EMERGENCY GREEN',        ped: "DON'T WALK" }
};

// Transition list — drives the HTML transition table
const TRANSITIONS = [
    { from: 'S0', input: 'TIMER_EXPIRED', to: 'S1' },
    { from: 'S1', input: 'TIMER_EXPIRED', to: 'S2' },
    { from: 'S2', input: 'TIMER_EXPIRED', to: 'S3' },
    { from: 'S3', input: 'TIMER_EXPIRED', to: 'S0' },
    { from: 'S0', input: 'PED_REQUEST', to: 'S4' },
    { from: 'S1', input: 'PED_REQUEST', to: 'S4' },
    { from: 'S2', input: 'PED_REQUEST', to: 'S4' },
    { from: 'S3', input: 'PED_REQUEST', to: 'S4' },
    { from: 'S4', input: 'PED_REQUEST', to: 'S4' },
    { from: 'S4', input: 'TIMER_EXPIRED', to: 'S0' },
    { from: 'S0', input: 'EMERGENCY_DETECTED', to: 'S5' },
    { from: 'S1', input: 'EMERGENCY_DETECTED', to: 'S5' },
    { from: 'S2', input: 'EMERGENCY_DETECTED', to: 'S5' },
    { from: 'S3', input: 'EMERGENCY_DETECTED', to: 'S5' },
    { from: 'S4', input: 'EMERGENCY_DETECTED', to: 'S5' },
    { from: 'S5', input: 'EMERGENCY_CLEARED (main road)', to: 'S1' },
    { from: 'S5', input: 'EMERGENCY_CLEARED (side road)', to: 'S3' },
    { from: '—', input: 'RESET', to: 'S0' }
];

// ============================================
// TrafficFSM — the finite state machine engine
// ============================================

class TrafficFSM {
    constructor() {
        this.state = 'S0';
        this.stateTime = 0;
        this.running = false;
        this.mode = 'auto';
        this.speed = 1;
        this.clearance = null;   // { remaining, target, input } — all-red sub-phase
        this.pedRequest = false;
        this.emergency = null;   // { type, direction }
        this.vehiclesPassed = 0;
        this.pedestrianCrossed = 0;
        this.cycleCount = 0;
        this.listeners = {};
    }

    on(event, cb) { (this.listeners[event] = this.listeners[event] || []).push(cb); }
    emit(event, data) { (this.listeners[event] || []).forEach(cb => cb(data)); }

    start()  { this.running = true;  this.emit('log', { type: 'success', message: 'Simulation started — FSM running' }); }
    pause()  { this.running = false; this.emit('log', { type: 'warning', message: 'Simulation paused — state preserved' }); }
    resume() { this.running = true;  this.emit('log', { type: 'success', message: 'Simulation resumed' }); }

    reset() {
        this.state = 'S0'; this.stateTime = 0;
        this.running = false;
        this.clearance = null;
        this.pedRequest = false;
        this.emergency = null;
        this.vehiclesPassed = 0; this.pedestrianCrossed = 0; this.cycleCount = 0;
        this.emit('log', { type: 'warning', message: 'Simulation reset — FSM returned to S0 (Main Green)' });
        this.emit('stateChange', { from: null, to: 'S0', input: 'RESET' });
    }

    update(dt) {
        if (!this.running) return;
        const sdt = dt * this.speed;
        if (this.clearance) {
            this.clearance.remaining -= sdt;
            if (this.clearance.remaining <= 0) this.completeClearance();
            return;
        }
        this.stateTime += sdt;
        if (this.stateTime >= this.getStateDuration()) this.advance();
    }

    getStateDuration() {
        switch (this.state) {
            case 'S0': case 'S2': return CONFIG.GREEN_DURATION;
            case 'S1': case 'S3': return CONFIG.YELLOW_DURATION;
            case 'S4': return CONFIG.PED_DURATION;
            case 'S5': return Infinity;
            default:   return CONFIG.GREEN_DURATION;
        }
    }

    // ---- core transition logic ----

    advance() {
        if (this.clearance) { this.completeClearance(); return; }
        const next = this.computeNext(this.state);
        const input = this.determineInput(next);
        if (this.needsClearance(this.state)) this.startClearance(next, input);
        else this.transitionTo(next, input);
    }

    computeNext(state) {
        // Emergency has highest priority
        if (this.emergency) {
            if (state === 'S5') return 'S5';
            if (state === 'S0') return this.emergency.direction === 'main' ? 'S5' : 'S1';
            if (state === 'S2') return this.emergency.direction === 'side' ? 'S5' : 'S3';
            return 'S5'; // S1, S3, S4
        }
        // Pedestrian request — complete current phase, then route to S4
        if (this.pedRequest) {
            if (state === 'S0') return 'S1';
            if (state === 'S2') return 'S3';
            if (state === 'S1' || state === 'S3') return 'S4';
            if (state === 'S4') return 'S4';
        }
        // Normal cycle: S0 → S1 → S2 → S3 → S0
        switch (state) {
            case 'S0': return 'S1';
            case 'S1': return 'S2';
            case 'S2': return 'S3';
            case 'S3': return 'S0';
            case 'S4': return 'S0';
        }
        return 'S0';
    }

    needsClearance(from) {
        // All-red clearance after any yellow phase and after pedestrian phase
        return from === 'S1' || from === 'S3' || from === 'S4';
    }

    determineInput(next) {
        if (this.emergency) return 'EMERGENCY_DETECTED';
        if (next === 'S4' && this.pedRequest) return 'PED_REQUEST';
        return 'TIMER_EXPIRED';
    }

    startClearance(target, input) {
        this.clearance = { remaining: CONFIG.ALL_RED_DURATION, target, input };
        this.emit('log', { type: 'info', message: `All-red clearance (${CONFIG.ALL_RED_DURATION}s) before entering ${target}` });
    }

    completeClearance() {
        const target = this.clearance.target;
        this.clearance = null;
        // Re-evaluate target at completion (conditions may have changed)
        let finalTarget = target;
        if (this.emergency) finalTarget = 'S5';
        else if (this.pedRequest && (target === 'S0' || target === 'S2')) finalTarget = 'S4';
        const input = this.emergency ? 'EMERGENCY_DETECTED'
            : (finalTarget === 'S4' && this.pedRequest) ? 'PED_REQUEST' : 'TIMER_EXPIRED';
        this.transitionTo(finalTarget, input);
    }

    transitionTo(newState, input) {
        const old = this.state;
        this.state = newState;
        this.stateTime = 0;
        if (newState === 'S4') this.pedRequest = false; // request serviced
        if (newState === 'S0' && old === 'S3') this.cycleCount++;
        this.emit('stateChange', { from: old, to: newState, input });
        this.emit('log', { type: 'info', message: `${old} → ${newState}: ${FSM_STATES[newState].name}` });
    }

    // ---- emergency handling ----

    triggerEmergency(type, direction) {
        if (this.emergency) {
            this.emit('log', { type: 'warning', message: 'Emergency already active — clear it first' });
            return;
        }
        this.emergency = { type, direction };
        this.emit('log', { type: 'emergency', message: `Emergency detected: ${type} on ${direction === 'main' ? 'Main (E–W)' : 'Side (N–S)'} road` });
        this.emit('emergencyDetected', this.emergency);
        this.routeToEmergency();
    }

    routeToEmergency() {
        if (this.clearance || this.state === 'S5') return;
        const s = this.state;
        if (s === 'S0') {
            if (this.emergency.direction === 'main') this.transitionTo('S5', 'EMERGENCY_DETECTED');
            else this.transitionTo('S1', 'EMERGENCY_DETECTED');
        } else if (s === 'S2') {
            if (this.emergency.direction === 'side') this.transitionTo('S5', 'EMERGENCY_DETECTED');
            else this.transitionTo('S3', 'EMERGENCY_DETECTED');
        } else if (s === 'S4') {
            this.transitionTo('S5', 'EMERGENCY_DETECTED');
        }
        // S1/S3: yellow in progress — advance() routes to S5 after clearance
    }

    clearEmergency() {
        if (!this.emergency) return;
        const dir = this.emergency.direction;
        this.emergency = null;
        this.emit('log', { type: 'success', message: 'Emergency cleared — resuming normal operation' });
        this.emit('emergencyCleared');
        if (this.state === 'S5' && !this.clearance) {
            this.transitionTo(dir === 'main' ? 'S1' : 'S3', 'EMERGENCY_CLEARED');
        }
    }

    // ---- pedestrian request ----

    requestPedestrian() {
        this.pedRequest = true;
        const where = (this.state === 'S4' && !this.clearance)
            ? 'during active crossing — will cross again'
            : 'queued for next safe phase';
        this.emit('log', { type: 'pedestrian', message: `Pedestrian request received — ${where}` });
        this.emit('pedRequest', this.pedRequest);
    }

    // ---- signal output ----

    getSignals() {
        if (this.clearance) return { main: 'red', side: 'red', ped: 'dontwalk' };
        switch (this.state) {
            case 'S0': return { main: 'green',  side: 'red',    ped: 'dontwalk' };
            case 'S1': return { main: 'yellow', side: 'red',    ped: 'dontwalk' };
            case 'S2': return { main: 'red',    side: 'green',  ped: 'dontwalk' };
            case 'S3': return { main: 'red',    side: 'yellow', ped: 'dontwalk' };
            case 'S4': return { main: 'red',    side: 'red',    ped: 'walk' };
            case 'S5':
                if (this.emergency && this.emergency.direction === 'side')
                    return { main: 'red', side: 'green', ped: 'dontwalk' };
                return { main: 'green', side: 'red', ped: 'dontwalk' };
        }
        return { main: 'red', side: 'red', ped: 'dontwalk' };
    }

    isEmergencyActive() { return this.state === 'S5'; }

    getRemainingTime() {
        if (this.clearance) return Math.max(0, this.clearance.remaining);
        const dur = this.getStateDuration();
        if (dur === Infinity) return Infinity;
        return Math.max(0, dur - this.stateTime);
    }
}

// ============================================
// Vehicle
// ============================================

class Vehicle {
    constructor(id, direction, color) {
        this.id = id; this.direction = direction; this.color = color;
        this.speed = 0;
        this.maxSpeed = CONFIG.CAR_MAX_SPEED * (0.8 + Math.random() * 0.4);
        this.pastStopLine = false;
        this.counted = false;
        switch (direction) {
            case 'mainLeft':  this.x = CONFIG.SPAWN.mainLeft;  this.y = CONFIG.LANES.mainLeft;  this.axis = 'x'; this.sign = 1;  this.signalGroup = 'main'; break;
            case 'mainRight': this.x = CONFIG.SPAWN.mainRight; this.y = CONFIG.LANES.mainRight; this.axis = 'x'; this.sign = -1; this.signalGroup = 'main'; break;
            case 'sideTop':   this.x = CONFIG.LANES.sideTop;   this.y = CONFIG.SPAWN.sideTop;   this.axis = 'y'; this.sign = 1;  this.signalGroup = 'side'; break;
            case 'sideBottom':this.x = CONFIG.LANES.sideBottom;this.y = CONFIG.SPAWN.sideBottom;this.axis = 'y'; this.sign = -1; this.signalGroup = 'side'; break;
        }
    }
    getFront() { return this.axis === 'x' ? this.x + this.sign * (CONFIG.CAR_LENGTH / 2) : this.y + this.sign * (CONFIG.CAR_LENGTH / 2); }
    getStopLine() { return CONFIG.STOP_LINES[this.direction]; }
    shouldStop(signals) {
        if (signals[this.signalGroup] === 'green') return false;
        if (this.pastStopLine) return false;
        const front = this.getFront(), stop = this.getStopLine();
        return this.sign === 1 ? front < stop : front > stop;
    }
    update(dt, signals, vehicles, emergencyActive) {
        const mustStop = emergencyActive || this.shouldStop(signals);
        const ahead = this.getCarAhead(vehicles);
        const tooClose = ahead && this.distanceTo(ahead) < CONFIG.CAR_MIN_GAP;
        if (mustStop || tooClose) this.speed = Math.max(0, this.speed - CONFIG.CAR_DECELERATION * dt);
        else this.speed = Math.min(this.maxSpeed, this.speed + CONFIG.CAR_ACCELERATION * dt);
        if (this.axis === 'x') this.x += this.sign * this.speed * dt;
        else this.y += this.sign * this.speed * dt;
        const stop = this.getStopLine();
        if (this.sign === 1 && this.getFront() >= stop) this.pastStopLine = true;
        if (this.sign === -1 && this.getFront() <= stop) this.pastStopLine = true;
        if (!this.counted && this.pastStopLine) {
            const i = CONFIG.INTERSECTION;
            if (this.axis === 'x' && this.x > i.x + i.width / 2) { this.counted = true; return 'passed'; }
            if (this.axis === 'y' && this.y > i.y + i.height / 2) { this.counted = true; return 'passed'; }
        }
        const d = CONFIG.DESPAWN[this.direction];
        if (this.sign === 1 && this.getFront() > d) return 'despawn';
        if (this.sign === -1 && this.getFront() < d) return 'despawn';
        return null;
    }
    getCarAhead(vehicles) {
        let closest = null, dist = Infinity;
        for (const v of vehicles) {
            if (v === this || v.direction !== this.direction) continue;
            const d = this.distanceTo(v);
            if (d > 0 && d < dist) { dist = d; closest = v; }
        }
        return closest;
    }
    distanceTo(other) { return this.axis === 'x' ? this.sign * (other.x - this.x) : this.sign * (other.y - this.y); }
}

// ============================================
// EmergencyVehicle
// ============================================

class EmergencyVehicle {
    constructor(type, direction) {
        this.type = type; this.direction = direction;
        this.speed = 0; this.maxSpeed = CONFIG.EMERGENCY_SPEED;
        this.pastStopLine = false; this.passed = false;
        this.forceProceed = false;
        if (direction === 'main') { this.x = -40; this.y = CONFIG.LANES.mainLeft; this.axis = 'x'; this.sign = 1; this.signalGroup = 'main'; }
        else { this.x = CONFIG.LANES.sideTop; this.y = -40; this.axis = 'y'; this.sign = 1; this.signalGroup = 'side'; }
    }
    getFront() { return this.axis === 'x' ? this.x + this.sign * 20 : this.y + this.sign * 20; }
    getStopLine() { return this.direction === 'main' ? CONFIG.STOP_LINES.mainLeft : CONFIG.STOP_LINES.sideTop; }
    update(dt, signals) {
        const mustStop = !this.forceProceed && signals[this.signalGroup] !== 'green' && !this.pastStopLine;
        if (mustStop) this.speed = Math.max(0, this.speed - CONFIG.CAR_DECELERATION * dt);
        else this.speed = Math.min(this.maxSpeed, this.speed + CONFIG.CAR_ACCELERATION * dt);
        if (this.axis === 'x') this.x += this.sign * this.speed * dt;
        else this.y += this.sign * this.speed * dt;
        if (this.sign === 1 && this.getFront() >= this.getStopLine()) this.pastStopLine = true;
        const i = CONFIG.INTERSECTION;
        if (!this.passed && this.pastStopLine) {
            if (this.axis === 'x' && this.x > i.x + i.width + 20) { this.passed = true; return 'passed'; }
            if (this.axis === 'y' && this.y > i.y + i.height + 20) { this.passed = true; return 'passed'; }
        }
        if (this.axis === 'x' && this.x > 650) return 'despawn';
        if (this.axis === 'y' && this.y > 650) return 'despawn';
        return null;
    }
}

// ============================================
// Pedestrian
// ============================================

class Pedestrian {
    constructor(axis, fixed, from, to) {
        this.axis = axis; this.fixed = fixed;
        this.from = from; this.to = to;
        this.pos = from; this.dir = 1;
        this.active = false;
        this.speed = CONFIG.PED_SPEED;
    }
    start() { this.active = true; this.pos = this.from; this.dir = 1; }
    stop() { this.active = false; }
    update(dt) {
        if (!this.active) return null;
        this.pos += this.dir * this.speed * dt;
        if (this.pos >= this.to) { this.pos = this.to; this.dir = -1; return 'crossed'; }
        if (this.pos <= this.from) { this.pos = this.from; this.dir = 1; return 'crossed'; }
        return null;
    }
    get x() { return this.axis === 'x' ? this.pos : this.fixed; }
    get y() { return this.axis === 'y' ? this.pos : this.fixed; }
}

// ============================================
// Intersection Renderer
// ============================================

class IntersectionRenderer {
    constructor(svg) { this.svg = svg; this.ns = 'http://www.w3.org/2000/svg'; this.carElements = new Map(); this.emergencyElement = null; this.pedestrianElements = new Map(); this.init(); }
    el(tag, attrs = {}) { const e = document.createElementNS(this.ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; }

    init() {
        this.svg.innerHTML = '';
        this.svg.appendChild(this.el('rect', { width: 600, height: 600, fill: '#182234', rx: 8 }));
        this.svg.appendChild(this.el('rect', { x: 0, y: CONFIG.MAIN_ROAD.y, width: 600, height: CONFIG.MAIN_ROAD.width, class: 'road-surface' }));
        this.svg.appendChild(this.el('rect', { x: CONFIG.SIDE_ROAD.x, y: 0, width: CONFIG.SIDE_ROAD.width, height: 600, class: 'road-surface' }));

        // center lines
        this.svg.appendChild(this.el('line', { x1: 0, y1: 300, x2: 240, y2: 300, class: 'road-marking' }));
        this.svg.appendChild(this.el('line', { x1: 360, y1: 300, x2: 600, y2: 300, class: 'road-marking' }));
        this.svg.appendChild(this.el('line', { x1: 300, y1: 0, x2: 300, y2: 240, class: 'road-marking' }));
        this.svg.appendChild(this.el('line', { x1: 300, y1: 360, x2: 300, y2: 600, class: 'road-marking' }));

        // stop lines
        this.svg.appendChild(this.el('rect', { x: 215, y: 245, width: 6, height: 50, class: 'stop-line' }));
        this.svg.appendChild(this.el('rect', { x: 379, y: 305, width: 6, height: 50, class: 'stop-line' }));
        this.svg.appendChild(this.el('rect', { x: 245, y: 215, width: 50, height: 6, class: 'stop-line' }));
        this.svg.appendChild(this.el('rect', { x: 305, y: 379, width: 50, height: 6, class: 'stop-line' }));

        // zebra crossings
        this.zebra(195, 240, 215, 360, 'v'); this.zebra(385, 240, 405, 360, 'v');
        this.zebra(240, 195, 360, 215, 'h'); this.zebra(240, 385, 360, 405, 'h');

        // road labels
        this.addText(300, 22, 'NORTH', 'road-label');
        this.addText(300, 596, 'SOUTH', 'road-label');
        this.addText(45, 232, 'WEST', 'road-label');
        this.addText(560, 232, 'EAST', 'road-label');

        // traffic lights + tags
        this.light(222, 200, 'mainLeft', 'W · STRAIGHT');
        this.light(366, 360, 'mainRight', 'E · STRAIGHT');
        this.light(366, 200, 'sideTop', 'N · STRAIGHT');
        this.light(222, 360, 'sideBottom', 'S · STRAIGHT');

        // pedestrian signals
        this.pedSignal(185, 230); this.pedSignal(415, 230);
        this.pedSignal(230, 185); this.pedSignal(230, 415);

        this.vehicleLayer = this.el('g', {}); this.emergencyLayer = this.el('g', {}); this.pedestrianLayer = this.el('g', {});
        this.svg.appendChild(this.vehicleLayer); this.svg.appendChild(this.emergencyLayer); this.svg.appendChild(this.pedestrianLayer);
    }

    addText(x, y, str, cls) { const t = this.el('text', { x, y, class: cls }); t.textContent = str; this.svg.appendChild(t); }

    zebra(x1, y1, x2, y2, o) {
        const g = this.el('g');
        if (o === 'v') for (let y = y1; y < y2; y += 12) g.appendChild(this.el('rect', { x: x1, y, width: x2 - x1, height: 6, class: 'zebra-stripe' }));
        else for (let x = x1; x < x2; x += 12) g.appendChild(this.el('rect', { x, y: y1, width: 6, height: y2 - y1, class: 'zebra-stripe' }));
        this.svg.appendChild(g);
    }

    light(x, y, id, tag) {
        const g = this.el('g', {});
        g.appendChild(this.el('rect', { x, y, width: 12, height: 40, class: 'traffic-light-housing', rx: 2 }));
        g.appendChild(this.el('circle', { cx: x + 6, cy: y + 8, r: 4, class: 'traffic-light-lamp', id: `lamp-red-${id}` }));
        g.appendChild(this.el('circle', { cx: x + 6, cy: y + 20, r: 4, class: 'traffic-light-lamp', id: `lamp-yellow-${id}` }));
        g.appendChild(this.el('circle', { cx: x + 6, cy: y + 32, r: 4, class: 'traffic-light-lamp', id: `lamp-green-${id}` }));
        this.svg.appendChild(g);
        const t = this.el('text', { x: x + 6, y: y + 52, class: 'signal-tag' });
        t.textContent = tag; this.svg.appendChild(t);
    }

    pedSignal(x, y) {
        const g = this.el('g', {});
        g.appendChild(this.el('rect', { x, y, width: 26, height: 18, class: 'ped-signal-box', rx: 2 }));
        const t = this.el('text', { x: x + 13, y: y + 12, class: 'ped-signal-text' });
        t.textContent = 'STOP'; t.setAttribute('font-size', '7px');
        g.appendChild(t); this.svg.appendChild(g);
    }

    updateTrafficLights(signals) {
        const map = { mainLeft: signals.main, mainRight: signals.main, sideTop: signals.side, sideBottom: signals.side };
        for (const [id, sig] of Object.entries(map)) {
            document.getElementById(`lamp-red-${id}`)?.setAttribute('class', 'traffic-light-lamp' + (sig === 'red' ? ' active-red' : ''));
            document.getElementById(`lamp-yellow-${id}`)?.setAttribute('class', 'traffic-light-lamp' + (sig === 'yellow' ? ' active-yellow' : ''));
            document.getElementById(`lamp-green-${id}`)?.setAttribute('class', 'traffic-light-lamp' + (sig === 'green' ? ' active-green' : ''));
        }
    }

    updatePedestrianSignals(signals) {
        document.querySelectorAll('.ped-signal-text').forEach(t => {
            t.textContent = signals.ped === 'walk' ? 'WALK' : 'STOP';
            t.setAttribute('fill', signals.ped === 'walk' ? '#22c55e' : '#ef4444');
        });
    }

    updateVehicles(vehicles) {
        const ids = new Set(vehicles.map(v => v.id));
        for (const [id, el] of this.carElements) if (!ids.has(id)) { el.remove(); this.carElements.delete(id); }
        for (const v of vehicles) {
            let el = this.carElements.get(v.id);
            if (!el) {
                el = this.el('g', {});
                el.appendChild(this.el('rect', { width: CONFIG.CAR_LENGTH, height: CONFIG.CAR_WIDTH, fill: v.color, class: 'car-body', rx: 3 }));
                el.appendChild(this.el('rect', { x: (v.sign === 1 ? 20 : 4), y: 2, width: 4, height: CONFIG.CAR_WIDTH - 4, class: 'car-window', rx: 1 }));
                this.vehicleLayer.appendChild(el); this.carElements.set(v.id, el);
            }
            if (v.axis === 'x') el.setAttribute('transform', `translate(${v.x - CONFIG.CAR_LENGTH / 2}, ${v.y - CONFIG.CAR_WIDTH / 2})`);
            else el.setAttribute('transform', `translate(${v.x}, ${v.y}) rotate(90) translate(${-CONFIG.CAR_LENGTH / 2}, ${-CONFIG.CAR_WIDTH / 2})`);
        }
    }

    updateEmergencyVehicle(ev) {
        if (!ev) { if (this.emergencyElement) { this.emergencyElement.remove(); this.emergencyElement = null; } return; }
        if (!this.emergencyElement) {
            this.emergencyElement = this.el('g', {});
            this.emergencyElement.appendChild(this.el('rect', { x: -20, y: -10, width: 40, height: 20, fill: '#f5f5f5', rx: 4 }));
            this.emergencyElement.appendChild(this.el('rect', { x: -8, y: -12, width: 6, height: 4, class: 'emergency-light-red', rx: 1 }));
            this.emergencyElement.appendChild(this.el('rect', { x: 2, y: -12, width: 6, height: 4, class: 'emergency-light-blue', rx: 1 }));
            const label = this.el('text', { x: 0, y: 3, 'text-anchor': 'middle', 'font-size': 9, fill: '#111', 'font-weight': 'bold' });
            label.textContent = ev.type === 'ambulance' ? '+' : ev.type === 'fire' ? 'F' : 'P';
            this.emergencyElement.appendChild(label);
            this.emergencyLayer.appendChild(this.emergencyElement);
        }
        this.emergencyElement.setAttribute('transform', ev.axis === 'x' ? `translate(${ev.x}, ${ev.y})` : `translate(${ev.x}, ${ev.y}) rotate(90)`);
    }

    updatePedestrian(p, key) {
        let el = this.pedestrianElements.get(key);
        if (!p.active) { if (el) { el.remove(); this.pedestrianElements.delete(key); } return; }
        if (!el) {
            el = this.el('g', {});
            el.appendChild(this.el('circle', { cx: 0, cy: 0, r: 5, class: 'pedestrian-body' }));
            el.appendChild(this.el('circle', { cx: 0, cy: -8, r: 3, class: 'pedestrian-head' }));
            this.pedestrianLayer.appendChild(el);
            this.pedestrianElements.set(key, el);
        }
        el.setAttribute('transform', `translate(${p.x}, ${p.y})`);
    }
}

// ============================================
// FSM Diagram Renderer (6-state layout)
// ============================================

class FSMDiagramRenderer {
    constructor(svg) { this.svg = svg; this.ns = 'http://www.w3.org/2000/svg'; this.nodeEls = {}; this.arrowEls = []; this.init(); }
    el(tag, attrs = {}) { const e = document.createElementNS(this.ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; }

    init() {
        this.svg.innerHTML = '';
        const defs = this.el('defs', {});
        for (const [id, color] of [['arrowhead', '#64748b'], ['arrowhead-active', '#22d3ee']]) {
            const m = this.el('marker', { id, markerWidth: 10, markerHeight: 7, refX: 9, refY: 3.5, orient: 'auto' });
            m.appendChild(this.el('polygon', { points: '0 0, 10 3.5, 0 7', fill: color }));
            defs.appendChild(m);
        }
        this.svg.appendChild(defs);

        // Node positions
        const nodes = {
            S0: { cx: 100, cy: 100, r: 42 },
            S1: { cx: 300, cy: 100, r: 42 },
            S2: { cx: 500, cy: 100, r: 42 },
            S3: { cx: 700, cy: 100, r: 42 },
            S4: { cx: 200, cy: 320, r: 42 },
            S5: { cx: 550, cy: 320, r: 42 }
        };
        this.nodes = nodes;

        // Arrows: from, to, path, label pos, input type
        const arrows = [
            { f: 'S0', t: 'S1', d: 'M 142 100 L 258 100', lx: 200, ly: 85, input: 'TIMER_EXPIRED' },
            { f: 'S1', t: 'S2', d: 'M 342 100 L 458 100', lx: 400, ly: 85, input: 'TIMER_EXPIRED' },
            { f: 'S2', t: 'S3', d: 'M 542 100 L 658 100', lx: 600, ly: 85, input: 'TIMER_EXPIRED' },
            { f: 'S3', t: 'S0', d: 'M 700 58 C 700 10, 100 10, 100 58', lx: 400, ly: 22, input: 'TIMER_EXPIRED' },
            { f: 'S0', t: 'S4', d: 'M 100 142 C 100 260, 200 220, 200 278', lx: 110, ly: 220, input: 'PED_REQUEST' },
            { f: 'S1', t: 'S4', d: 'M 300 142 C 295 230, 260 270, 248 288', lx: 260, ly: 220, input: 'PED_REQUEST' },
            { f: 'S2', t: 'S4', d: 'M 500 142 C 505 230, 340 270, 252 288', lx: 400, ly: 220, input: 'PED_REQUEST' },
            { f: 'S4', t: 'S0', d: 'M 158 320 C 60 320, 50 200, 62 145', lx: 60, ly: 240, input: 'TIMER_EXPIRED' },
            { f: 'S4', t: 'S4', d: 'M 242 320 C 290 380, 110 380, 158 320', lx: 200, ly: 395, input: 'PED_REQUEST' },
            { f: 'S0', t: 'S5', d: 'M 142 100 C 350 60, 500 150, 545 278', lx: 350, ly: 80, input: 'EMERGENCY_DETECTED' },
            { f: 'S2', t: 'S5', d: 'M 542 100 C 600 150, 580 220, 565 278', lx: 620, ly: 190, input: 'EMERGENCY_DETECTED' },
            { f: 'S5', t: 'S0', d: 'M 550 362 C 550 430, 100 430, 100 142', lx: 320, ly: 445, input: 'EMERGENCY_CLEARED' }
        ];

        for (const a of arrows) this.arrow(a.f, a.t, a.d, a.input, a.lx, a.ly);

        // Emergency note
        const note = this.el('text', { x: 550, y: 380, class: 'fsm-group-label', 'text-anchor': 'middle' });
        note.textContent = '← EMERGENCY_DETECTED from any state (S0–S4)';
        this.svg.appendChild(note);

        // START label
        const st = this.el('text', { x: 100, y: 18, class: 'fsm-arrow-label', 'text-anchor': 'middle' });
        st.textContent = 'START / RESET';
        this.svg.appendChild(st);

        // Draw nodes
        for (const [id, n] of Object.entries(nodes)) this.node(id, n);
    }

    arrow(from, to, d, input, lx, ly) {
        const p = this.el('path', { d, class: 'fsm-arrow', id: `arrow-${from}-${to}`, 'marker-end': 'url(#arrowhead)' });
        this.svg.appendChild(p);
        this.arrowEls.push({ el: p, from, to, input });
        const t = this.el('text', { x: lx, y: ly, class: 'fsm-arrow-label' });
        t.textContent = input === 'TIMER_EXPIRED' ? 'timer' : input === 'PED_REQUEST' ? 'ped request' : input === 'EMERGENCY_DETECTED' ? 'emergency' : 'cleared';
        this.svg.appendChild(t);
    }

    node(id, n) {
        const cfg = FSM_STATES[id];
        const g = this.el('g', {});
        const circle = this.el('circle', { cx: n.cx, cy: n.cy, r: n.r, class: `fsm-node type-${cfg.type}`, id: `fsm-node-${id}` });
        g.appendChild(circle);
        const t1 = this.el('text', { x: n.cx, y: n.cy - 10, class: 'fsm-node-text' }); t1.textContent = id; g.appendChild(t1);
        const t2 = this.el('text', { x: n.cx, y: n.cy + 8, class: 'fsm-node-road' }); t2.textContent = this.getRoadText(id); g.appendChild(t2);
        const t3 = this.el('text', { x: n.cx, y: n.cy + 26, class: 'fsm-node-label' }); t3.textContent = cfg.name; g.appendChild(t3);
        this.svg.appendChild(g);
        this.nodeEls[id] = circle;
    }

    getRoadText(id) {
        switch (id) {
            case 'S0': return 'MAIN';
            case 'S1': return 'MAIN';
            case 'S2': return 'SIDE';
            case 'S3': return 'SIDE';
            case 'S4': return 'PED';
            case 'S5': return 'EMG';
            default: return '???';
        }
    }

    setActiveState(id) {
        for (const [k, el] of Object.entries(this.nodeEls)) el.classList.toggle('active', k === id);
    }

    setActiveTransition(from, to, input) {
        for (const a of this.arrowEls) {
            let active = a.from === from && a.to === to && a.input === input;
            // Fallback: match by from/to if input doesn't match exactly
            if (!active && a.from === from && a.to === to) active = true;
            a.el.classList.toggle('active', active);
            a.el.setAttribute('marker-end', active ? 'url(#arrowhead-active)' : 'url(#arrowhead)');
        }
    }
}

// ============================================
// Transition Table Builder
// ============================================

function buildTransitionTable() {
    const tbody = document.querySelector('#transition-table tbody');
    tbody.innerHTML = '';
    for (const tr of TRANSITIONS) {
        const row = document.createElement('tr');
        const out = tr.from === '—' ? { vehicles: '—', ped: '—' } : STATE_OUTPUT[tr.from];
        row.innerHTML = `
            <td><span class="badge badge-state">${tr.from}</span></td>
            <td><span class="badge badge-input">${tr.input}</span></td>
            <td><span class="badge badge-next">${tr.to}</span></td>
            <td>${vehicleBadge(out.vehicles)}</td>
            <td>${pedBadge(out.ped)}</td>`;
        tbody.appendChild(row);
    }
}

function vehicleBadge(v) {
    if (v.includes('GREEN') && !v.includes('RED')) return `<span class="out-green">${v}</span>`;
    if (v.includes('YELLOW')) return `<span class="out-yellow">${v}</span>`;
    if (v.includes('RED')) return `<span class="out-red">${v}</span>`;
    return `<span>${v}</span>`;
}
function pedBadge(p) {
    return p === 'WALK' ? `<span class="out-walk">🚶 WALK</span>` : `<span class="out-dont">✋ DON'T WALK</span>`;
}

// ============================================
// UI Controller
// ============================================

class UIController {
    constructor(fsm, renderer, fsmRenderer) {
        this.fsm = fsm; this.renderer = renderer; this.fsmRenderer = fsmRenderer;
        this.vehicles = []; this.emergencyVehicle = null;
        this.pedestrians = [
            new Pedestrian('y', 205, 225, 375),  // crossing main road (west zebra)
            new Pedestrian('x', 205, 225, 375)   // crossing side road (north zebra)
        ];
        this.vehicleIdCounter = 0;
        this.spawnTimers = { mainLeft: 1, mainRight: 2, sideTop: 1.5, sideBottom: 2.5 };
        this.selectedEmergencyType = 'ambulance';
        this.selectedEmergencyDir = 'main';
        this.bindEvents();
        fsm.on('stateChange', d => this.onStateChange(d));
        fsm.on('log', d => this.log(d));
        fsm.on('emergencyDetected', () => {
            document.getElementById('emergency-alert').hidden = false;
            this.emergencyVehicle = new EmergencyVehicle(this.fsm.emergency.type, this.fsm.emergency.direction);
        });
        fsm.on('emergencyCleared', () => {
            document.getElementById('emergency-alert').hidden = true;
            if (this.emergencyVehicle) this.emergencyVehicle.forceProceed = true;
        });
        fsm.on('pedRequest', () => this.updatePedPending());
    }

    bindEvents() {
        document.getElementById('btn-start').onclick = () => { this.fsm.start(); this.toggleButtons(true); };
        document.getElementById('btn-pause').onclick = () => { this.fsm.pause(); this.toggleButtons('paused'); };
        document.getElementById('btn-resume').onclick = () => { this.fsm.resume(); this.toggleButtons(true); };
        document.getElementById('btn-reset').onclick = () => this.resetSim();
        document.getElementById('btn-auto').onclick = () => this.setMode('auto');
        document.getElementById('btn-manual').onclick = () => this.setMode('manual');
        document.querySelectorAll('.speed-btn').forEach(b => b.onclick = () => this.setSpeed(+b.dataset.speed));
        document.getElementById('btn-next-state').onclick = () => this.fsm.advance();
        document.getElementById('btn-ped-request').onclick = () => this.fsm.requestPedestrian();
        document.querySelectorAll('.emergency-type').forEach(b => b.onclick = () => {
            document.querySelectorAll('.emergency-type').forEach(x => x.classList.remove('active'));
            b.classList.add('active'); this.selectedEmergencyType = b.dataset.type;
        });
        document.querySelectorAll('.emergency-dir').forEach(b => b.onclick = () => {
            document.querySelectorAll('.emergency-dir').forEach(x => x.classList.remove('active'));
            b.classList.add('active'); this.selectedEmergencyDir = b.dataset.dir;
        });
        document.getElementById('btn-emergency').onclick = () => {
            this.fsm.triggerEmergency(this.selectedEmergencyType, this.selectedEmergencyDir);
            document.getElementById('btn-emergency').disabled = true;
            document.getElementById('btn-clear-emergency').disabled = false;
        };
        document.getElementById('btn-clear-emergency').onclick = () => {
            this.fsm.clearEmergency();
            document.getElementById('btn-emergency').disabled = false;
            document.getElementById('btn-clear-emergency').disabled = true;
        };
        document.getElementById('btn-clear-log').onclick = () => document.getElementById('event-log').innerHTML = '';
    }

    toggleButtons(state) {
        const running = state === true;
        document.getElementById('btn-start').disabled = running;
        document.getElementById('btn-pause').disabled = !running;
        document.getElementById('btn-resume').disabled = state !== 'paused';
    }

    resetSim() {
        this.fsm.reset();
        this.vehicles = []; this.emergencyVehicle = null;
        this.pedestrians.forEach(p => p.stop());
        this.vehicleIdCounter = 0;
        document.getElementById('btn-start').disabled = false;
        document.getElementById('btn-pause').disabled = true;
        document.getElementById('btn-resume').disabled = true;
        document.getElementById('emergency-alert').hidden = true;
        document.getElementById('btn-emergency').disabled = false;
        document.getElementById('btn-clear-emergency').disabled = true;
        for (const el of this.renderer.carElements.values()) el.remove();
        this.renderer.carElements.clear();
        this.renderer.updateEmergencyVehicle(null);
        this.pedestrians.forEach((p, i) => this.renderer.updatePedestrian(p, i));
        this.updatePedPending();
    }

    setMode(mode) {
        this.fsm.mode = mode;
        document.getElementById('btn-auto').classList.toggle('active', mode === 'auto');
        document.getElementById('btn-manual').classList.toggle('active', mode === 'manual');
        document.getElementById('manual-controls').hidden = mode !== 'manual';
        this.log({ type: 'info', message: `Mode → ${mode.toUpperCase()}` });
    }

    setSpeed(s) {
        this.fsm.speed = s;
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.toggle('active', +b.dataset.speed === s));
        this.log({ type: 'info', message: `Speed → ${s}×` });
    }

    updatePedPending() {
        const el = document.getElementById('status-ped-pending');
        const ind = document.getElementById('ped-pending-indicator');
        const pending = this.fsm.pedRequest;
        el.textContent = pending ? '1' : '0';
        el.className = 'status-value' + (pending ? ' signal-green' : '');
        ind.textContent = pending ? '⚠ Crossing request pending' : 'No pending requests';
        ind.className = pending ? 'pending-yes' : '';
    }

    onStateChange(d) {
        this.fsmRenderer.setActiveState(d.to);
        this.fsmRenderer.setActiveTransition(d.from, d.to, d.input);
        if (d.to === 'S4') {
            this.pedestrians.forEach(p => p.start());
            this.log({ type: 'pedestrian', message: '🚶 PEDESTRIAN WALK ACTIVE — all vehicles stopped' });
        }
    }

    log(d) {
        const box = document.getElementById('event-log');
        const e = document.createElement('div');
        e.className = `log-entry event-${d.type}`;
        e.innerHTML = `<span class="log-time">[${new Date().toLocaleTimeString('en-US', { hour12: false })}]</span><span>${d.message}</span>`;
        box.insertBefore(e, box.firstChild);
        while (box.children.length > 60) box.removeChild(box.lastChild);
    }

    spawnVehicles(dt) {
        const dirs = ['mainLeft', 'mainRight', 'sideTop', 'sideBottom'];
        const colors = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#f97316', '#8b5cf6', '#06b6d4', '#ec4899'];
        for (const dir of dirs) {
            this.spawnTimers[dir] -= dt;
            if (this.spawnTimers[dir] <= 0) {
                const sp = CONFIG.SPAWN[dir];
                const blocked = this.vehicles.some(v => v.direction === dir && Math.abs((v.axis === 'x' ? v.x : v.y) - sp) < 60);
                if (!blocked) this.vehicles.push(new Vehicle(this.vehicleIdCounter++, dir, colors[(Math.random() * colors.length) | 0]));
                this.spawnTimers[dir] = CONFIG.CAR_SPAWN_INTERVAL * (0.5 + Math.random());
            }
        }
    }

    update(dt) {
        const signals = this.fsm.getSignals();
        const emergencyActive = this.fsm.isEmergencyActive();
        if (this.fsm.running) {
            const sdt = dt * this.fsm.speed;
            this.spawnVehicles(sdt);
            const dead = [];
            for (const v of this.vehicles) {
                const r = v.update(sdt, signals, this.vehicles, emergencyActive);
                if (r === 'passed') this.fsm.vehiclesPassed++;
                if (r === 'despawn') dead.push(v);
            }
            this.vehicles = this.vehicles.filter(v => !dead.includes(v));
            if (this.emergencyVehicle) {
                const r = this.emergencyVehicle.update(sdt, signals);
                if (r === 'passed') this.log({ type: 'success', message: 'Emergency vehicle cleared the intersection' });
                if (r === 'passed' || r === 'despawn') this.emergencyVehicle = null;
            }
            this.pedestrians.forEach(p => {
                const r = p.update(sdt);
                if (r === 'crossed') {
                    this.fsm.pedestrianCrossed++;
                    this.log({ type: 'pedestrian', message: 'Pedestrian crossed safely' });
                }
            });
        }

        this.renderer.updateTrafficLights(signals);
        this.renderer.updatePedestrianSignals(signals);
        this.renderer.updateVehicles(this.vehicles);
        this.renderer.updateEmergencyVehicle(this.emergencyVehicle);
        this.pedestrians.forEach((p, i) => this.renderer.updatePedestrian(p, i));
        this.updateStatus(signals);
    }

    updateStatus(signals) {
        const st = this.fsm.state;
        document.getElementById('status-state').textContent = st;
        document.getElementById('status-desc').textContent = FSM_STATES[st].name;
        document.getElementById('header-state').textContent = st;
        document.getElementById('header-mode').textContent = this.fsm.mode === 'auto' ? 'AUTOMATIC' : 'MANUAL';
        document.getElementById('status-mode').textContent = this.fsm.mode === 'auto' ? 'Automatic' : 'Manual';

        const phaseLabel = this.fsm.clearance
            ? `All-Red Clearance → ${this.fsm.clearance.target}`
            : `${st}: ${FSM_STATES[st].name}`;
        document.getElementById('state-label').textContent = phaseLabel;

        const m = document.getElementById('status-main');
        m.textContent = signals.main.toUpperCase(); m.className = `status-value signal-${signals.main}`;
        const s = document.getElementById('status-side');
        s.textContent = signals.side.toUpperCase(); s.className = `status-value signal-${signals.side}`;
        document.getElementById('status-ped').textContent = signals.ped === 'walk' ? '🚶 WALK' : "✋ DON'T WALK";

        const rem = this.fsm.getRemainingTime();
        const txt = rem === Infinity ? '∞' : `${rem.toFixed(1)}s`;
        document.getElementById('status-timer').textContent = txt;
        document.getElementById('state-timer').textContent = txt;

        document.getElementById('status-emergency').textContent = this.fsm.emergency ? `🚨 ${this.fsm.emergency.type.toUpperCase()}` : 'INACTIVE';
        document.getElementById('status-vehicles').textContent = this.fsm.vehiclesPassed;
        document.getElementById('status-ped-crossings').textContent = this.fsm.pedestrianCrossed;
        document.getElementById('status-cycles').textContent = this.fsm.cycleCount;
        document.getElementById('status-phase').textContent =
            (st === 'S0' || st === 'S1') ? 'E–W Traffic' :
            (st === 'S2' || st === 'S3') ? 'N–S Traffic' :
            st === 'S4' ? 'Pedestrian' :
            st === 'S5' ? 'Emergency' : 'Clearance';

        // pedestrian countdown overlay
        const cd = document.getElementById('ped-countdown');
        if (signals.ped === 'walk') {
            cd.hidden = false;
            document.getElementById('ped-countdown-number').textContent = String(Math.ceil(rem)).padStart(2, '0');
        } else cd.hidden = true;
    }
}

// ============================================
// Boot
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const fsm = new TrafficFSM();
    const renderer = new IntersectionRenderer(document.getElementById('intersection-svg'));
    const fsmRenderer = new FSMDiagramRenderer(document.getElementById('fsm-svg'));
    const ui = new UIController(fsm, renderer, fsmRenderer);
    buildTransitionTable();
    fsmRenderer.setActiveState('S0');
    ui.log({ type: 'info', message: 'System initialized — press START' });

    // Timer configuration
    document.getElementById('btn-apply-timers').addEventListener('click', () => {
        const green = Math.max(1, parseInt(document.getElementById('timer-green').value) || 10);
        const yellow = Math.max(1, parseInt(document.getElementById('timer-yellow').value) || 3);
        const allred = Math.max(1, parseInt(document.getElementById('timer-allred').value) || 2);
        const ped = Math.max(1, parseInt(document.getElementById('timer-ped').value) || 8);

        CONFIG.GREEN_DURATION = green;
        CONFIG.YELLOW_DURATION = yellow;
        CONFIG.ALL_RED_DURATION = allred;
        CONFIG.PED_DURATION = ped;

        ui.log({ type: 'success', message: `Timers updated — Green:${green}s Yellow:${yellow}s AllRed:${allred}s Ped:${ped}s` });
    });

    let last = performance.now();
    (function loop() {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        fsm.update(dt);
        ui.update(dt);
        requestAnimationFrame(loop);
    })();
});
