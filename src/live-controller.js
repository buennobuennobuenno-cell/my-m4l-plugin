/* Bundled after chaos-engine.js. All Live API work happens in low-priority Tasks. */
autowatch = 0;
inlets = 1;
outlets = 6;

var engine = new ChaosEngine();
var ready = false;
var armed = false;
var paused = false;
var deviceEnabled = true;
var mapped = null;
var remoteId = 0;
var pendingRestore = null;
var selectedId = 0;
var selectedAtArm = 0;
var pendingSelection = 0;
var device = null;
var view = null;
var deviceSwitch = null;
var lastTime = 0;
var validationTime = 0;
var uiTime = 0;
var previousDevicePath = "";

var clock = new Task(tick, this);
clock.interval = 25;
var restoreTask = new Task(applyRestore, this);
var selectionTask = new Task(applySelection, this);
var enableTask = new Task(applyEnabled, this);
var initTask = new Task(initializeNow, this);
var requestedEnabled = true;

function atoms(value) {
    return Array.isArray(value) ? value : [value];
}

function numeric(value) {
    var parts = atoms(value);
    return Number(parts[parts.length - 1]);
}

function identifier(value) {
    var id = numeric(value);
    return isFinite(id) && id > 0 ? Math.floor(id) : 0;
}

function text(value) {
    return atoms(value).join(" ");
}

function ui(key, value) {
    outlet(5, key, value);
}

function status(message) {
    outlet(4, message);
}

function setRemote(id) {
    remoteId = id;
    outlet(1, "id", id);
}

function stopMotion() {
    clock.cancel();
    setRemote(0);
}

function canRun() {
    return ready && mapped !== null && !paused && deviceEnabled && !armed;
}

function resetSignal() {
    var current = numeric(mapped.api.get("value"));
    if (!isFinite(current)) { throw new Error("Parameter value unavailable"); }
    current = Math.max(mapped.min, Math.min(mapped.max, current));
    engine.reset((current - mapped.min) / (mapped.max - mapped.min));
    // Initialize the signal BEFORE taking ownership, so mapping never jumps to zero.
    outlet(0, current, 0);
    ui("value", engine.value * 100);
}

function resumeMotion() {
    if (!canRun()) { return; }
    try {
        resetSignal();
        setRemote(mapped.id);
        lastTime = new Date().getTime();
        validationTime = lastTime;
        uiTime = 0;
        clock.cancel();
        clock.repeat();
        status("CHAOS ACTIVE");
    } catch (error) {
        loseTarget("Target unavailable - MAP again");
    }
}

function initialize() {
    initTask.cancel();
    initTask.schedule(0);
}

function initializeNow() {
    if (ready) { return; }
    try {
        device = new LiveAPI(function () {}, "this_device");
        if (!identifier(device.id)) { throw new Error("No Live device"); }
        previousDevicePath = String(device.unquotedpath || device.path || "");
        view = new LiveAPI(selectionChanged, "live_set view");
        selectedId = identifier(view.get("selected_parameter"));
        // Initial notifications are intentionally ignored while not armed.
        view.property = "selected_parameter";
        deviceSwitch = new LiveAPI(enabledChanged, "this_device parameters 0");
        deviceEnabled = numeric(deviceSwitch.get("value")) !== 0;
        requestedEnabled = deviceEnabled;
        deviceSwitch.property = "value";
        ready = true;
        armed = false;
        ui("map", 0);
        if (pendingRestore !== null) {
            restoreTask.schedule(0);
        } else {
            status("Press MAP, then click a parameter");
        }
    } catch (error) {
        stopMotion();
        status("Open this device inside Ableton Live");
        errorMessage(error);
    }
}

function enabledChanged(args) {
    var list = atoms(args);
    if (list[0] !== "value") { return; }
    requestedEnabled = numeric(list) !== 0;
    enableTask.cancel();
    enableTask.schedule(0);
}

function applyEnabled() {
    if (requestedEnabled === deviceEnabled) { return; }
    deviceEnabled = requestedEnabled;
    stopMotion();
    if (deviceEnabled) {
        if (canRun()) { resumeMotion(); }
        else { idleStatus(); }
    } else {
        status("DEVICE OFF - target released");
    }
}

function selectionChanged(args) {
    var list = atoms(args);
    if (list[0] !== "selected_parameter") { return; }
    selectedId = identifier(list);
    if (armed && selectedId && selectedId !== selectedAtArm) {
        pendingSelection = selectedId;
        selectionTask.cancel();
        selectionTask.schedule(0);
    }
}

function map(value) {
    if (!ready) { status("Waiting for Ableton Live"); ui("map", 0); return; }
    armed = Number(value) !== 0;
    selectionTask.cancel();
    pendingSelection = 0;
    if (armed) {
        selectedAtArm = selectedId;
        stopMotion();
        status("Click the parameter you want to control");
        ui("phase", "MAPPING");
    } else {
        resumeMotion();
        idleStatus();
    }
}

function readTarget(id) {
    var api = new LiveAPI(function () {}, id);
    var parent, low, high;
    if (!identifier(api.id) || String(api.type) !== "DeviceParameter") {
        throw new Error("Choose an automatable parameter");
    }
    parent = identifier(api.get("canonical_parent"));
    if (parent === identifier(device.id)) {
        throw new Error("Choose a parameter outside this device");
    }
    if (numeric(api.get("is_enabled")) === 0) {
        throw new Error("This parameter is unavailable - choose another");
    }
    low = numeric(api.get("min"));
    high = numeric(api.get("max"));
    if (!isFinite(low) || !isFinite(high) || high <= low) {
        throw new Error("This parameter has no usable range");
    }
    return {
        id: id, api: api, min: low, max: high,
        quantized: numeric(api.get("is_quantized")) !== 0,
        name: text(api.get("name"))
    };
}

function applySelection() {
    var target;
    if (!armed || !pendingSelection || !ready) { return; }
    try {
        target = readTarget(pendingSelection);
    } catch (error) {
        status(error.message);
        return;
    }
    stopMotion();
    mapped = target;
    armed = false;
    pendingSelection = 0;
    ui("map", 0);
    outlet(3, target.name);
    // A native persistent observer stores the object reference in the Live Set.
    // Runtime IDs and track/parameter index paths are never saved by JavaScript.
    outlet(2, "id", target.id);
    resumeMotion();
    idleStatus();
}

function restoreid() {
    var parts = arrayfromargs(arguments);
    pendingRestore = identifier(parts);
    restoreTask.cancel();
    if (ready) { restoreTask.schedule(0); }
}

function applyRestore() {
    var id = pendingRestore;
    pendingRestore = null;
    if (!ready || id === null) { return; }
    if (mapped && id === mapped.id) { return; }
    if (!id) {
        if (mapped) { loseTarget("Target removed - MAP again"); }
        return;
    }
    stopMotion();
    try {
        mapped = readTarget(id);
        outlet(3, mapped.name);
        resumeMotion();
        idleStatus();
    } catch (error) {
        loseTarget("Saved target unavailable - MAP again");
    }
}

function pause(value) {
    paused = Number(value) !== 0;
    stopMotion();
    if (!paused) { resumeMotion(); }
    idleStatus();
}

function clear() {
    armed = false;
    selectionTask.cancel();
    pendingSelection = 0;
    restoreTask.cancel();
    pendingRestore = null;
    loseTarget("Press MAP, then click a parameter");
    outlet(2, "id", 0);
    ui("map", 0);
}

function loseTarget(message) {
    stopMotion();
    mapped = null;
    outlet(3, "NO TARGET");
    ui("phase", "IDLE");
    ui("value", 0);
    status(message);
}

function idleStatus() {
    if (armed) { status("Click the parameter you want to control"); }
    else if (!deviceEnabled) { status("DEVICE OFF - target released"); }
    else if (!mapped) { status("Press MAP, then click a parameter"); }
    else if (paused) { status("PAUSED - target released"); ui("phase", "PAUSED"); }
    else { status("CHAOS ACTIVE"); }
}

function tick() {
    var now, result, value, path;
    if (!canRun()) { stopMotion(); return; }
    now = new Date().getTime();
    try {
        if (now - validationTime >= 1000) {
            validationTime = now;
            if (!identifier(mapped.api.id)) { throw new Error("Target deleted"); }
            path = String(device.unquotedpath || device.path || "");
            if (path !== previousDevicePath) {
                previousDevicePath = path;
                // Live may release remote ownership when moving a device/track.
                setRemote(0);
                resetSignal();
                setRemote(mapped.id);
            }
        }
        result = engine.tick(now - lastTime);
        lastTime = now;
        value = mapped.min + result.value * (mapped.max - mapped.min);
        if (mapped.quantized) { value = Math.round(value); }
        value = Math.max(mapped.min, Math.min(mapped.max, value));
        outlet(0, value, mapped.quantized ? 0 : 25);
        if (now - uiTime >= 100) {
            uiTime = now;
            ui("phase", result.mode);
            ui("value", result.value * 100);
        }
    } catch (error) {
        loseTarget("Target unavailable - MAP again");
    }
}

function errorMessage(error) {
    if (typeof post === "function") { post("Set and Forget Chaos: " + error.message + "\n"); }
}

function freebang() {
    clock.cancel();
    restoreTask.cancel();
    selectionTask.cancel();
    enableTask.cancel();
    initTask.cancel();
    setRemote(0);
    ready = false;
    if (view) { view.property = ""; }
    if (deviceSwitch) { deviceSwitch.property = ""; }
}
