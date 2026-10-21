/* Random Motion 16 / V3. Native ramps; independent v4.1 random streams.
   ES5 for Max 8. No audio-rate JS, value polling, or periodic UI animation. */
autowatch = 0;
inlets = 1;
outlets = 2;

var host = this, COUNT = 16, ready = false, enabled = true;
var selfApi = null, selectionApi = null;
var selfId = 0, armed = -1, baseline = 0, pending = 0;
var ancestors = [], serial = 0, lanes = [];
var running = [], batchDepth = 0, ticking = false, scheduleDirty = false;
var timerPending = false, timerDeadline = Infinity;
var uiCache = {}, structureObservers = {}, ownerObservers = {};
var forceRebind = false, editorLane = -1, editorKey = "";
var refreshQueued = false, previousSelfPath = "";
include("rm16_v3_motion.js");
var motionTask = new Task(motionCallback, this);
var sentEvents = 0;
var stamp = null, logicalTime = 0;
var initTask = new Task(initialize, this);
var mapTask = new Task(commitSelection, this);
var refreshTask = new Task(refresh, this);
var restoreTask = new Task(restoreMappings, this);
for (var i = 0; i < COUNT; i++) lanes.push({lo: 0, hi: 100, link: null,
    param: null, id: 0, attached: false, motion: null, quantized: false, error: ""});

// Clamp backward system-clock changes; overdue events are never replayed in a loop.
function now() {
    var t = new Date().getTime();
    if (!isFinite(t)) return logicalTime;
    if (stamp === null) logicalTime=t;
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
function ui(name, message, a, b, c, d) {
    // UI failure must never stop modulation or cleanup of another target.
    try {
        var o = uiCache[name];
        if (!o) { o = host.patcher.getnamed(name); if (o) uiCache[name] = o; }
        if (!o) return;
        if (arguments.length===2) o.message(message);
        else if (arguments.length===3) o.message(message,a);
        else if (arguments.length===4) o.message(message,a,b);
        else if (arguments.length===5) o.message(message,a,b,c);
        else o.message(message,a,b,c,d);
    } catch (e) { delete uiCache[name]; }
}
function status(s) { ui("status", "set", s); }
function changed() { notifyclients(); }
function command(j, value, duration) {
    if (!isFinite(value) || !isFinite(duration) || duration < 0 || duration > 60000)
        throw new Error("Ungueltiger Rampenauftrag");
    outlet(0, [j + 1, value, duration]);
}
function remote(j, id) {
    // Keep uncertainty on an output error, so cleanup can retry the release.
    if (id) lanes[j].remoteMayBeBound=true;
    outlet(1, [j + 1, "id", id]);
    if (!id) lanes[j].remoteMayBeBound=false;
}
function newSeed(j) {
    // Fresh per mapping/instance. No seed is copied in a saved state.
    return 1 + Math.floor((Math.random() * 2147483000 + new Date().getTime() +
        selfId * 104729 + (++serial) * 15485863 + j * 32452843) % 2147483000);
}
function syncLane(j) {
    var l = lanes[j], p = "lane" + (j + 1) + "_";
    var pane="limits"+Math.floor(j/8);
    ui(pane,"bank",Math.floor(j/8));
    ui(pane,"row",j+1,l.lo,l.hi);
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
function beginBatch() { batchDepth++; }
function endBatch() {
    batchDepth--;
    if (!batchDepth && scheduleDirty) { scheduleDirty=false; reschedule(); }
}
function queueLane(j) {
    var index=running.indexOf(j), l=lanes[j];
    var wanted=!!(l.attached && l.motion && isFinite(l.motion.next));
    if (wanted && index<0) {
        var at=0;while (at<running.length && running[at]<j) at++;
        running.splice(at,0,j);
    } else if (!wanted && index>=0) running.splice(index,1);
}
function cancelTimer() {
    if (timerPending) motionTask.cancel();
    timerPending=false;timerDeadline=Infinity;
}
function scheduleAt(earliest) {
    if (!ready || !enabled || !isFinite(earliest)) { cancelTimer();return; }
    if (timerPending && timerDeadline===earliest) return;
    cancelTimer();
    motionTask.schedule(Math.max(1,earliest-now()));
    timerDeadline=earliest;timerPending=true;
}
function reschedule() {
    if (batchDepth || ticking) {scheduleDirty=true;return;}
    var earliest=Infinity;
    for (var n=0;n<running.length;n++)
        earliest=Math.min(earliest,lanes[running[n]].motion.next);
    scheduleAt(earliest);
}
function emit(j,t) {
    var l=lanes[j], m=RM16.next(l.motion,l.low,l.high,t,l.discrete);
    var native=l.quantized ? m.nativeValue : l.pmin+(l.pmax-l.pmin)*m.target;
    command(j,native,m.duration);sentEvents++;
}
function motionCallback() {
    // The native one-shot already expired: no redundant Task.cancel().
    timerPending=false;timerDeadline=Infinity;tick();
}
function tick() {
    cancelTimer();
    if (!ready || !enabled) return;
    var t=now(), earliest=Infinity, n=0;
    ticking=true;scheduleDirty=false;
    try {
        // A sorted list of moving slots preserves v4.1 slot order. One pass
        // both emits due events and finds the next deadline. No catch-up loop.
        while (n<running.length) {
            var j=running[n], l=lanes[j];
            if (l.motion.next<=t) {
                try {emit(j,t);}
                catch (e) {fault(j,"Ausgabe pruefen");}
            }
            if (running[n]===j) {earliest=Math.min(earliest,l.motion.next);n++;}
        }
    } finally {ticking=false;}
    if (scheduleDirty) {scheduleDirty=false;reschedule();}
    else scheduleAt(earliest);
}
function dismiss() {
    editorLane=-1;editorKey="";ui("bound_editor","hidden",1);
}
function edit(number,key) {
    var j=slot(number);
    if (j<0 || j>=COUNT || (key!=="lo" && key!=="hi")) return;
    dismiss();editorLane=j;editorKey=key;
    ui("bound_editor","presentation_rect",Math.floor(j/8)*360+(key==="lo"?234:296),
        40+(j%8)*14,56,14);
    ui("bound_editor","set",lanes[j][key]);ui("bound_editor","hidden",0);
    ui("bound_editor","select");
}
function edited(value) {
    if (editorLane<0) return;
    var number=editorLane+1,key=editorKey;dismiss();setting(number,key,value);
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
    queueLane(j);
}
function bounds(j) {
    var l=lanes[j];
    if (ready && enabled && l.id && l.motion) {
        try {configure(j,now());reschedule();}
        catch (e) {fault(j,"Grenzen pruefen");}
    }
}
function release(j) {
    var l=lanes[j], released=true, needsRelease=l.attached||l.remoteMayBeBound;l.attached=false;
    if (l.motion) l.motion.next=Infinity;
    queueLane(j);
    if (needsRelease) {
        try {remote(j,0);} catch (e) {l.error="Freigabe pruefen";released=false;}
    }
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
    try {configure(j,t);reschedule();}
    catch (e) {fault(j,"Start pruefen");}
}
function fault(j,message) {
    lanes[j].error=message;release(j);syncLane(j);updateStatus();
}
function disarm() {
    var previous=armed;
    armed = -1; pending = 0; mapTask.cancel();
    if (selectionApi) selectionApi.property = "";
    if (previous>=0) syncLane(previous);
}
function dispose(a) {
    if (!a) return;
    try {a.property="";} catch (e) {}
    try {a.id=0;} catch (e) {}
}
function retireParam(j) {
    var l=lanes[j], old=l.param;l.id=0;l.param=null;dispose(old);
    var key=String(l.watchId||0), entry=ownerObservers[key];
    l.watchId=0;
    if (entry && --entry.refs===0) {
        entry.live=false;dispose(entry.api);delete ownerObservers[key];
    }
}
function queueRefresh(rebind) {
    if (!ready) return;
    forceRebind=forceRebind||!!rebind;
    if (!refreshQueued) {refreshQueued=true;refreshTask.schedule(25);}
}
function contextchanged() {queueRefresh(true);}
function observeOwner(j,id) {
    var key=String(id), entry=ownerObservers[key];
    if (!entry) {
        entry={api:null,refs:0,live:false};
        try {
            entry.api=new LiveAPI(function(args) {
                if (entry.live && args && (String(args[0])==="name" || String(args[0])==="id"))
                    queueRefresh(false);
            },"id "+id);
            // Observe names/identity only, never the changing parameter value.
            try {entry.api.property="name";} catch (e) {}
        } catch (e) {dispose(entry.api);return;}
        entry.live=true;ownerObservers[key]=entry;
    }
    entry.refs++;lanes[j].watchId=id;
}
function observeStructure(anc) {
    var used={}, j, key, entry;
    function add(id,property) {
        key=String(id)+":"+property;used[key]=true;
        if (structureObservers[key]) return;
        var observer={api:null,live:false};
        observer.api=new LiveAPI(function(args) {
            if (observer.live && args && (String(args[0])===property || String(args[0])==="id"))
                queueRefresh(true);
        },"id "+id);
        observer.api.property=property;
        observer.live=true;structureObservers[key]=observer;
    }
    for (j=0;j<anc.length;j++) {
        var a=anc[j], type=String(a.type);
        if (type==="Track" || type==="Chain") add(Number(a.id),"devices");
        else if (/RackDevice$/.test(type)) add(Number(a.id),"chains");
    }
    for (key in structureObservers) if (Object.prototype.hasOwnProperty.call(structureObservers,key) && !used[key]) {
        entry=structureObservers[key];entry.live=false;dispose(entry.api);delete structureObservers[key];
    }
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
    observeStructure(ancestors);
    var currentPath=pathOf(selfApi);
    if (previousSelfPath && previousSelfPath!==currentPath) forceRebind=true;
    previousSelfPath=currentPath;
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
    if (!isFinite(pmin) || !isFinite(pmax) || !isFinite(pmax-pmin) || pmax <= pmin)
        throw new Error("Kein regelbarer Bereich");
    var s = signature(p, owner);
    var label = s.deviceName, watchId=Number(owner.id);
    if (!label) {
        var parent = api(idOf(owner.get("canonical_parent")));
        label = textOf(parent.get("name"));
        watchId=Number(parent.id);
    }
    var displayName = textOf(p.get("name"));
    var quantized=false;
    try {quantized=!!Number(scalar(p.get("is_quantized")));} catch (e) {}
    return {id: Number(pid), param: p, pmin: pmin, pmax: pmax, quantized: quantized, watchId:watchId,
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
    var l=lanes[j], observedId=info.id, fresh;
    // Construct the new handle first. A failed construction keeps the old mapping.
    fresh = new LiveAPI(function (args) {
        // Identity callbacks do not observe the changing value. In particular,
        // deleting a target in a sibling chain should stop its unused DSP lane.
        if (!ready || lanes[j].param!==fresh || lanes[j].id!==observedId || !args) return;
        if ((String(args[0])==="id" && !idOf(args)) || String(args[0])==="name") queueRefresh(false);
    }, "id " + info.id);
    if (!Number(fresh.id)) {dispose(fresh);throw new Error("Ziel nicht verfuegbar");}
    try {fresh.property="name";} catch (e) {}
    release(j);retireParam(j);
    l.id=info.id;l.link=info.link;l.param=fresh;
    l.pmin = info.pmin; l.pmax = info.pmax; l.quantized=!!info.quantized;
    observeOwner(j,info.watchId);
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
    }
    var pane="limits"+Math.floor(j/8);
    ui(pane,"bank",Math.floor(j/8));
    ui(pane,"units",j+1,result[0],result[1]);
    return result[0] + " bis " + result[1];
}
function initialize() {
    if (ready) return;
    beginBatch();
    try {
        context(); ready = true;
        for (var j = 0; j < COUNT; j++) { bounds(j); syncLane(j); }
        restoreMappings();restoreTask.cancel();
        for (j=0;j<COUNT;j++) if (lanes[j].link && !lanes[j].id) {restoreTask.schedule(800);break;}
    } catch (e) { status("Nicht bereit: " + e.message); }
    finally {endBatch();}
}
function init() { initTask.cancel(); initTask.schedule(100); }
function restoreMappings() {
    if (!ready) return;
    beginBatch();
    try {
        context();
        for (var j = 0; j < COUNT; j++) {
            if (!lanes[j].link || lanes[j].id) continue;
            try {
                var info = resolve(lanes[j].link);
                if (info) assign(j, info); else syncLane(j);
            } catch (e) {
                release(j);retireParam(j);
                lanes[j].error="Ziel beim Laden pruefen";syncLane(j);
            }
        }
        updateStatus();
    } catch (e) { status("Laden: " + e.message); }
    finally {endBatch();}
}
function rebind(j,t) {
    var l=lanes[j],m=l.motion;
    if (!l.attached || !m) return;
    var value=RM16.clip(RM16.position(m,t),l.low,l.high);
    var native=l.pmin+(l.pmax-l.pmin)*value;
    if (l.quantized) native=RM16.clip(Math.round(native),l.first,l.last);
    remote(j,0);remote(j,l.id);command(j,native,0);
    var remaining=Math.max(0,m.began+m.duration-t);
    if (!l.quantized && remaining>0)
        command(j,l.pmin+(l.pmax-l.pmin)*m.target,remaining);
    // No new random draws, state reset or changed event deadline.
}
function refresh() {
    if (!ready) return;
    if (refreshQueued) {refreshTask.cancel();refreshQueued=false;}
    beginBatch();
    try {
        context(); var modified = false, reattach=forceRebind, t=now();forceRebind=false;
        for (var j = 0; j < COUNT; j++) {
            var l = lanes[j]; if (!l.id || !l.param) continue;
            try {
                var info = describe(Number(l.param.id));
                if (JSON.stringify(info.link) !== JSON.stringify(l.link)) { l.link = info.link; modified = true; }
                if (l.pmin!==info.pmin || l.pmax!==info.pmax || l.quantized!==info.quantized) {
                    l.pmin=info.pmin;l.pmax=info.pmax;l.quantized=!!info.quantized;bounds(j);
                }
                else if (reattach && l.attached) rebind(j,t);
            } catch (e) { release(j);retireParam(j); }
            syncLane(j);
        }
        if (modified) changed(); updateStatus();
    } catch (e) { status("Chain geaendert: " + e.message); }
    finally {endBatch();}
}
function active(value) {
    var previous = enabled; enabled = !!Number(value);
    if (!ready || enabled === previous) return;
    beginBatch();
    try {
        if (!enabled) {disarm();dismiss();}
        for (var j = 0; j < COUNT; j++) { if (enabled) start(j); else release(j); }
    } finally {endBatch();}
    updateStatus();
}
function map(number, value) {
    var j = slot(number);
    if (!ready || j < 0 || j >= COUNT) return;
    dismiss();
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
    dismiss();
    var released=release(j);retireParam(j);lanes[j].link = null;
    if (released) lanes[j].error="";
    lanes[j].lo = 0; lanes[j].hi = 100;
    bounds(j); syncLane(j); changed(); updateStatus();
}
function setting(number, key, value) {
    var j = slot(number); if (j < 0 || j >= COUNT) return;
    var l = lanes[j],oldLo=l.lo,oldHi=l.hi;
    if (key === "lo") { l.lo = clamp(finite(value, l.lo), 0, 100); l.hi = Math.max(l.hi, l.lo); }
    else if (key === "hi") { l.hi = clamp(finite(value, l.hi), 0, 100); l.lo = Math.min(l.lo, l.hi); }
    else return;
    dismiss();
    if (oldLo===l.lo && oldHi===l.hi) return;
    bounds(j); syncLane(j); changed(); updateStatus();
    var formatted = formatBounds(j);
    status(formatted ? (j + 1) + ": " + formatted : "Min/Max = Reglerweg in %");
}
function validLink(l) {
    if (!(l && isFinite(l.up) && l.up >= 1 && l.up <= 32 && Math.floor(l.up) === l.up &&
        isArray(l.tail) && l.tail.length > 0 && l.tail.length < 128 &&
        typeof l.anchorType === "string" && l.signature && typeof l.signature.parameterName === "string")) return false;
    var allowed=/^(devices|chains|parameters|mixer_device|volume|panning|sends|crossfader|cue_volume|crossfade_assign)$/;
    for (var k=0;k<l.tail.length;k++) {
        var token=l.tail[k];
        if (typeof token!=="string" || token.length>64) return false;
        if (allowed.test(token)) continue;
        if (!/^-?\d+$/.test(token) || !isFinite(Number(token)) || Math.abs(Number(token))>2147483647) return false;
        if (Number(token)<0 && !(l.relative && k===1 && l.tail[0]==="devices")) return false;
    }
    return true;
}
function getvalueof() {
    var s = {version: 5, lanes: []};
    for (var j = 0; j < COUNT; j++) s.lanes.push({lo: lanes[j].lo, hi: lanes[j].hi, link: lanes[j].link});
    return JSON.stringify(s);
}
function setvalueof(value) {
    try {
        var s = JSON.parse(String(value));
        if (!s || (s.version !== 2 && s.version !== 3 && s.version !== 4 && s.version !== 5) || !isArray(s.lanes)) return;
        var prepared=[];
        for (var j = 0; j < COUNT; j++) {
            var item=s.lanes[j]||{},lo=clamp(finite(item.lo,0),0,100);
            prepared.push({lo:lo,hi:clamp(finite(item.hi,100),lo,100),link:validLink(item.link)?item.link:null});
        }
        beginBatch();
        try {
            disarm();dismiss();
            for (j=0;j<COUNT;j++) {
                var released=release(j);retireParam(j);var l=lanes[j],saved=prepared[j];
                l.lo=saved.lo;l.hi=saved.hi;l.link=saved.link;l.motion=null;
                if (released) l.error="";
                syncLane(j);
            }
        } finally {endBatch();}
        updateStatus();
        if (ready) {
            restoreTask.cancel();
            for (j=0;j<COUNT;j++) if (lanes[j].link) {restoreTask.schedule(100);break;}
        }
    } catch (e) { status("Zustand konnte nicht gelesen werden"); }
}
function save() { embedmessage("setvalueof", getvalueof()); }
function notifydeleted() {
    ready = false;
    cancelTimer();motionTask.cancel();
    initTask.cancel(); mapTask.cancel(); refreshTask.cancel(); restoreTask.cancel();
    beginBatch();
    try {for (var j = 0; j < COUNT; j++) {release(j);retireParam(j);}}
    finally {endBatch();}
    for (var key in structureObservers) if (Object.prototype.hasOwnProperty.call(structureObservers,key)) {
        structureObservers[key].live=false;dispose(structureObservers[key].api);
    }
    dispose(selectionApi);dispose(selfApi);
    structureObservers={};ownerObservers={};uiCache={};ancestors=[];
    selfApi = null;selectionApi = null;
}
