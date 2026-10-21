/* Random Motion 16 v4.1 — Live 11 / Max 8. Mapping, persistence and diagnostics. */
autowatch = 0;
inlets = 1;
outlets = 2;

var host = this, COUNT = 16, ready = false, enabled = true;
var selfApi = null, chainApi = null, selectionApi = null;
var selfId = 0, parentId = 0, armed = -1, baseline = 0, pending = 0;
var ancestors = [], serial = 0, lanes = [];
include("rm16_v41_motion.js");
var motionTask = new Task(tick, this);
var nextDisplay = 0, displayLane = -1, sentEvents = 0;
var stamp = 0, logicalTime = 0;
var initTask = new Task(initialize, this);
var mapTask = new Task(commitSelection, this);
var refreshTask = new Task(refresh, this);
var restoreTask = new Task(restoreMappings, this);
for (var i = 0; i < COUNT; i++) lanes.push({lo: 0, hi: 100, link: null,
    param: null, id: 0, attached: false, motion: null, quantized: false, error: ""});

// Clamp backward system-clock changes; overdue events are never replayed in a loop.
function now() {
    var t = new Date().getTime();
    if (!stamp) logicalTime=t;
    else logicalTime+=Math.max(0,t-stamp);
    stamp=t;return logicalTime;
}
function slot(number) {
    var n=Number(number)-1;
    return isFinite(n) && n===Math.floor(n) && n>=0 && n<COUNT ? n : -1;
}
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function finite(x, fallback) { x = Number(x); return isFinite(x) ? x : fallback; }
function isArray(x) { return Object.prototype.toString.call(x) === "[object Array]"; }
function scalar(x) { return isArray(x) ? x[0] : x; }
function textOf(x) { return isArray(x) ? x.join(" ") : String(x); }
function idOf(x) {
    if (typeof x === "number") return x;
    if (typeof x === "string") { var m = x.match(/(?:^id\s+)?(\d+)$/); return m ? Number(m[1]) : 0; }
    if (x && x.length) {
        for (var j = 0; j < x.length - 1; j++) if (String(x[j]) === "id") return Number(x[j + 1]) || 0;
        if (x.length === 1) return Number(x[0]) || 0;
    }
    return 0;
}
function idsOf(x) {
    var result = [];
    for (var j = 0; x && j < x.length - 1; j++) if (String(x[j]) === "id") result.push(Number(x[++j]));
    return result;
}
function api(id) { return new LiveAPI(null, "id " + Number(id)); }
function pathOf(a) { return String(a.unquotedpath || a.path).replace(/^"|"$/g, ""); }
function ui(name, message, value) { var o = host.patcher.getnamed(name); if (o) o.message(message, value); }
function status(s) { ui("status", "set", s); }
function changed() { notifyclients(); }
function command(j, value, duration) { outlet(0, [j + 1, value, duration]); }
function remote(j, id) { outlet(1, [j + 1, "id", id]); }
function newSeed(j) {
    // Fresh per mapping/instance. No seed is copied in a saved state.
    return 1 + Math.floor((Math.random() * 2147483000 + new Date().getTime() +
        selfId * 104729 + (++serial) * 15485863 + j * 32452843) % 2147483000);
}
function syncLane(j) {
    var l = lanes[j], p = "lane" + (j + 1) + "_";
    ui(p + "lo", "set", l.lo); ui(p + "hi", "set", l.hi);
    ui(p + "map", "texton", armed === j ? "..." : "x");
    ui(p + "map", "set", armed === j || !!l.link ? 1 : 0);
    var label = l.link ? l.link.label : "nicht zugeordnet";
    if (l.link && !l.id) label = "fehlt: " + l.link.parameterName;
    if (l.error) label = l.error + ": " + label;
    ui(p + "name", "set", (j + 1) + "  " + label);
    ui(p + "name", "hint", label + (l.id ?
        (l.quantized ? " | Schalter/Auswahl: Spruenge" : " | Rampen und Spruenge angefordert") : ""));
}
function updateStatus() {
    var n=0, moving=0, missing=0, problem=0;
    for (var j=0;j<COUNT;j++) {
        if (lanes[j].attached) {n++;if (isFinite(lanes[j].motion.next)) moving++;}
        else if (lanes[j].link && !lanes[j].id) missing++;
        if (lanes[j].error) problem=j+1;
    }
    ui("health","set",!enabled ? "DEAKTIVIERT" : problem ? "PRUEFEN "+problem :
        moving ? "AUTO "+moving+"/16" : n ? "KONSTANT" : "BEREIT");
    status(n+"/16 zugeordnet"+(missing ? " | "+missing+" fehlen: neu mappen" :
        problem ? " | "+lanes[problem-1].error : " | Min/Max = Reglerweg in %"));
}
function display(t) {
    if (t<nextDisplay || armed>=0) return;
    nextDisplay=t+1000;
    for (var offset=1;offset<=COUNT;offset++) {
        var j=(displayLane+offset)%COUNT, l=lanes[j];
        if (!l.attached) continue;
        displayLane=j;
        status((j+1)+": "+l.link.label+" | Ereignisse "+l.motion.events+
            " | Ziel "+Math.round(l.motion.target*10000)/100+"%");
        break;
    }
}
function reschedule() {
    motionTask.cancel();
    if (!ready || !enabled) return;
    var earliest=Infinity;
    for (var j=0;j<COUNT;j++) if (lanes[j].attached)
        earliest=Math.min(earliest,lanes[j].motion.next);
    if (isFinite(earliest)) motionTask.schedule(Math.max(1,earliest-now()));
}
function emit(j,t) {
    var l=lanes[j], m=RM16.next(l.motion,l.low,l.high,t,l.discrete);
    var native=l.quantized ? m.nativeValue : l.pmin+(l.pmax-l.pmin)*m.target;
    command(j,native,m.duration);sentEvents++;
}
function tick() {
    if (!ready || !enabled) return;
    var t=now();
    // At most one fresh event per due slot per callback. No backlog catch-up.
    for (var j=0;j<COUNT;j++) if (lanes[j].attached && lanes[j].motion.next<=t) {
        try {emit(j,t);}
        catch (e) {
            lanes[j].error="Ausgabe pruefen";release(j);syncLane(j);updateStatus();
        }
    }
    display(t);reschedule();
}
function edit(number,key) {
    var j=slot(number);
    if (j<0 || j>=COUNT || (key!=="lo" && key!=="hi")) return;
    var name="lane"+(j+1)+"_"+key+"_editor";
    ui(name,"set",lanes[j][key]); ui(name,"hidden",0);
    var o=host.patcher.getnamed(name); if (o) o.message("select");
}
function configure(j,t) {
    var l=lanes[j], m=l.motion;
    l.low=l.lo/100;l.high=l.hi/100;l.error="";l.discrete=null;
    var current=RM16.clip(RM16.position(m,t),l.low,l.high);
    if (l.quantized) {
        l.first=Math.ceil(l.pmin+(l.pmax-l.pmin)*l.low-1e-9);
        l.last=Math.floor(l.pmin+(l.pmax-l.pmin)*l.high+1e-9);
        if (l.first>l.last) {
            l.error="Bereich leer";release(j);return;
        }
        l.discrete={first:l.first,count:l.last-l.first+1,min:l.pmin,span:l.pmax-l.pmin};
        current=(RM16.clip(Math.round(l.pmin+(l.pmax-l.pmin)*current),l.first,l.last)-l.pmin)/(l.pmax-l.pmin);
    }
    if (!l.attached) {remote(j,l.id);l.attached=true;}
    // Attach first: an unbound remote need not retain a preceding value message.
    // Explicitly stop any pending old ramp before changed limits take effect.
    command(j,l.pmin+(l.pmax-l.pmin)*current,0);
    m.from=current;m.target=current;m.began=t;m.duration=0;
    if (l.low===l.high || (l.quantized && l.first===l.last)) m.next=Infinity;
    else emit(j,t);
}
function bounds(j) {
    var l=lanes[j];
    if (ready && enabled && l.id && l.motion) {configure(j,now());reschedule();}
}
function release(j) {
    var l=lanes[j], released=true;l.attached=false;
    if (l.motion) l.motion.next=Infinity;
    try {remote(j,0);} catch (e) {l.error="Freigabe pruefen";released=false;}
    reschedule();return released;
}
function start(j) {
    var l=lanes[j];
    if (!ready || !enabled || !l.id || l.attached) return;
    var t=now(), initial=0.5;
    try {
        var raw=Number(scalar(l.param.get("value")));
        if (isFinite(raw)) initial=RM16.clip((raw-l.pmin)/(l.pmax-l.pmin),0,1);
    }
    catch (e) {initial=0.5;}
    l.motion=RM16.create(newSeed(j),initial,t);
    configure(j,t);reschedule();
}
function disarm() {
    armed = -1; pending = 0; mapTask.cancel();
    if (selectionApi) selectionApi.property = "";
    for (var j = 0; j < COUNT; j++) syncLane(j);
}
function context() {
    if (!selfApi) selfApi = new LiveAPI(null, "this_device");
    selfId = Number(selfApi.id); ancestors = [];
    var a = selfApi;
    for (var depth = 1; depth <= 32; depth++) {
        var id = idOf(a.get("canonical_parent"));
        if (!id) break;
        a = api(id); ancestors.push(a);
        if (a.type === "Track") break;
    }
    if (!ancestors.length) throw new Error("Keine Device-Chain");
    var parent = Number(ancestors[0].id);
    if (!chainApi || parent !== parentId) {
        if (chainApi) chainApi.property = "";
        parentId = parent;
        chainApi = new LiveAPI(function (args) {
            if (ready && args && String(args[0]) === "devices") {
                refreshTask.cancel(); refreshTask.schedule(25);
            }
        }, "id " + parent);
        chainApi.property = "devices";
    }
}
function signature(p, owner) {
    var mixer = /MixerDevice$/.test(owner.type);
    var name;
    try { name = textOf(p.get("original_name")); }
    catch (e) { name = textOf(p.get("name")); }
    return {
        ownerType: owner.type,
        className: mixer ? "" : textOf(owner.get("class_name")),
        deviceName: mixer ? "" : textOf(owner.get("name")),
        parameterName: name
    };
}
function describe(pid) {
    var p = api(pid);
    if (p.type !== "DeviceParameter") throw new Error("Bitte einen Parameter anklicken");
    var owner = api(idOf(p.get("canonical_parent")));
    if (Number(owner.id) === selfId) throw new Error("Bitte ein anderes Ziel waehlen");
    var targetPath = pathOf(p), anchor = null, up = 0, tail = [];
    for (var j = 0; j < ancestors.length; j++) {
        var prefix = pathOf(ancestors[j]) + " ";
        if (targetPath.indexOf(prefix) === 0) {
            anchor = ancestors[j]; up = j + 1; tail = targetPath.slice(prefix.length).split(" "); break;
        }
    }
    if (!anchor) throw new Error("Ziel muss auf derselben Spur liegen");
    var relative = false;
    if (up === 1 && tail[0] === "devices") {
        var devices = idsOf(anchor.get("devices")), index = devices.indexOf(selfId);
        if (index < 0) throw new Error("Modulator nicht gefunden");
        tail[1] = String(Number(tail[1]) - index); relative = true;
    }
    var pmin = Number(scalar(p.get("min"))), pmax = Number(scalar(p.get("max")));
    if (!isFinite(pmin) || !isFinite(pmax) || pmax <= pmin) throw new Error("Kein regelbarer Bereich");
    var s = signature(p, owner);
    var label = s.deviceName;
    if (!label) {
        var parent = api(idOf(owner.get("canonical_parent")));
        label = textOf(parent.get("name"));
    }
    var displayName = textOf(p.get("name"));
    var quantized=false;
    try {quantized=!!Number(scalar(p.get("is_quantized")));} catch (e) {}
    return {id: Number(pid), param: p, pmin: pmin, pmax: pmax, quantized: quantized,
        link: {up: up, tail: tail, relative: relative, anchorType: anchor.type,
            signature: s, parameterName: displayName, label: label + " / " + displayName}};
}
function resolve(link) {
    if (!validLink(link) || link.up > ancestors.length) return null;
    var anchor = ancestors[link.up - 1];
    if (anchor.type !== link.anchorType) return null;
    var tail = link.tail.slice(0);
    if (link.relative) {
        var devices = idsOf(anchor.get("devices")), index = devices.indexOf(selfId);
        var targetIndex = index + Number(tail[1]);
        if (index < 0 || targetIndex < 0 || targetIndex >= devices.length) return null;
        tail[1] = String(targetIndex);
    }
    var p = new LiveAPI(null, pathOf(anchor) + " " + tail.join(" "));
    if (!Number(p.id) || p.type !== "DeviceParameter") return null;
    var candidate = describe(Number(p.id));
    if (JSON.stringify(candidate.link.signature) !== JSON.stringify(link.signature)) return null;
    return candidate;
}
function assign(j, info) {
    for (var n = 0; n < COUNT; n++) if (n !== j && lanes[n].id === info.id)
        throw new Error("Ziel ist bereits in einer anderen Zeile");
    release(j);
    var l = lanes[j]; l.id = info.id; l.link = info.link;
    l.param = new LiveAPI(function (args) {
        // Identity callbacks do not observe the changing value. In particular,
        // deleting a target in a sibling chain should stop its unused DSP lane.
        if (ready && args && String(args[0]) === "id" && !idOf(args) && lanes[j].id) {
            refreshTask.cancel(); refreshTask.schedule(0);
        }
    }, "id " + info.id);
    l.pmin = info.pmin; l.pmax = info.pmax; l.quantized=!!info.quantized;
    start(j); syncLane(j); formatBounds(j);
}
function formatBounds(j) {
    var l = lanes[j]; if (!l.param) return "";
    var result = [];
    for (var k = 0; k < 2; k++) {
        var percent = k ? l.hi : l.lo;
        var raw = l.pmin + (l.pmax - l.pmin) * percent / 100;
        var formatted;
        try { formatted = textOf(l.param.call("str_for_value", raw)); }
        catch (e) { formatted = String(raw) + " (API)"; }
        result.push(formatted);
        ui("lane" + (j + 1) + (k ? "_hi" : "_lo"), "hint", percent + "% = " + formatted);
    }
    return result[0] + " bis " + result[1];
}
function initialize() {
    try {
        context(); ready = true;
        for (var j = 0; j < COUNT; j++) { bounds(j); syncLane(j); }
        restoreMappings(); restoreTask.cancel(); restoreTask.schedule(800);
    } catch (e) { status("Nicht bereit: " + e.message); }
}
function init() { initTask.cancel(); initTask.schedule(100); }
function restoreMappings() {
    if (!ready) return;
    try {
        context();
        for (var j = 0; j < COUNT; j++) {
            if (!lanes[j].link || lanes[j].id) continue;
            try {
                var info = resolve(lanes[j].link);
                if (info) assign(j, info); else syncLane(j);
            } catch (e) {
                release(j);lanes[j].id=0;lanes[j].param=null;
                lanes[j].error="Ziel beim Laden pruefen";syncLane(j);
            }
        }
        updateStatus();
    } catch (e) { status("Laden: " + e.message); }
}
function refresh() {
    if (!ready) return;
    try {
        context(); var modified = false;
        for (var j = 0; j < COUNT; j++) {
            var l = lanes[j]; if (!l.id || !l.param) continue;
            try {
                var info = describe(Number(l.param.id));
                if (JSON.stringify(info.link) !== JSON.stringify(l.link)) { l.link = info.link; modified = true; }
                if (l.pmin!==info.pmin || l.pmax!==info.pmax || l.quantized!==info.quantized) {
                    l.pmin=info.pmin;l.pmax=info.pmax;l.quantized=!!info.quantized;bounds(j);
                }
            } catch (e) { release(j); l.id = 0; l.param = null; }
            syncLane(j);
        }
        if (modified) changed(); updateStatus();
    } catch (e) { status("Chain geaendert: " + e.message); }
}
function active(value) {
    var previous = enabled; enabled = !!Number(value);
    if (!ready || enabled === previous) return;
    if (!enabled) disarm();
    for (var j = 0; j < COUNT; j++) { if (enabled) start(j); else release(j); }
    updateStatus();
}
function map(number, value) {
    var j = slot(number);
    if (!ready || j < 0 || j >= COUNT) return;
    if (!Number(value)) { clear(number); return; }
    disarm(); armed = j;
    if (!selectionApi) selectionApi = new LiveAPI(function (args) {
        if (armed < 0 || !args || String(args[0]) !== "selected_parameter") return;
        var id = idOf(args.slice(1));
        mapTask.cancel(); pending = 0;
        if (id && id !== baseline) { pending = id; mapTask.schedule(0); }
    }, "live_set view");
    baseline = idOf(selectionApi.get("selected_parameter"));
    selectionApi.property = "selected_parameter";
    syncLane(j); status("MAP " + (j + 1) + ": Zielregler auf derselben Spur anklicken");
}
function commitSelection() {
    if (armed < 0 || !pending) return;
    try {
        context(); var info = describe(pending), j = armed;
        assign(j, info); disarm(); changed(); updateStatus();
    } catch (e) { baseline = pending; status("MAP: " + e.message); }
    pending = 0;
}
function clear(number) {
    var j = slot(number); if (j < 0 || j >= COUNT) return;
    if (armed === j) disarm();
    var released=release(j); lanes[j].id = 0; lanes[j].param = null; lanes[j].link = null;
    if (released) lanes[j].error="";
    lanes[j].lo = 0; lanes[j].hi = 100;
    bounds(j); syncLane(j); changed(); updateStatus();
}
function setting(number, key, value) {
    var j = slot(number); if (j < 0 || j >= COUNT) return;
    var l = lanes[j];
    if (key === "lo") { l.lo = clamp(finite(value, l.lo), 0, 100); l.hi = Math.max(l.hi, l.lo); }
    else if (key === "hi") { l.hi = clamp(finite(value, l.hi), 0, 100); l.lo = Math.min(l.lo, l.hi); }
    else return;
    ui("lane"+(j+1)+"_"+key+"_editor","hidden",1);
    bounds(j); syncLane(j); changed(); updateStatus();
    var formatted = formatBounds(j);
    status(formatted ? (j + 1) + ": " + formatted : "Min/Max = Reglerweg in %");
}
function validLink(l) {
    return l && isFinite(l.up) && l.up >= 1 && l.up <= 32 && Math.floor(l.up) === l.up &&
        isArray(l.tail) && l.tail.length > 0 && l.tail.length < 128 &&
        typeof l.anchorType === "string" && l.signature && typeof l.signature.parameterName === "string";
}
function getvalueof() {
    var s = {version: 4, lanes: []};
    for (var j = 0; j < COUNT; j++) s.lanes.push({lo: lanes[j].lo, hi: lanes[j].hi, link: lanes[j].link});
    return JSON.stringify(s);
}
function setvalueof(value) {
    try {
        var s = JSON.parse(String(value)); if ((s.version !== 2 && s.version !== 3 && s.version !== 4) || !isArray(s.lanes)) return;
        disarm();
        for (var j = 0; j < COUNT; j++) {
            release(j); var item = s.lanes[j] || {}, l = lanes[j];
            l.lo = clamp(finite(item.lo, 0), 0, 100); l.hi = clamp(finite(item.hi, 100), l.lo, 100);
            l.link = validLink(item.link) ? item.link : null; l.id = 0; l.param = null;l.motion=null;l.error="";
            bounds(j); syncLane(j);
        }
        if (ready) { restoreTask.cancel(); restoreTask.schedule(100); }
    } catch (e) { status("Zustand konnte nicht gelesen werden"); }
}
function save() { embedmessage("setvalueof", getvalueof()); }
function notifydeleted() {
    ready = false;
    motionTask.cancel();
    initTask.cancel(); mapTask.cancel(); refreshTask.cancel(); restoreTask.cancel();
    for (var j = 0; j < COUNT; j++) release(j);
    if (selectionApi) selectionApi.property = "";
    if (chainApi) chainApi.property = "";
    selfApi = null; chainApi = null; selectionApi = null;
}
