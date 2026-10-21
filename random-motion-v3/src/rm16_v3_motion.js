/* Event-only arithmetic. The v4.0 random draws and distributions are retained. */
var RM16 = (function () {
    // Evaluated once per script load, rather than once for every event.
    var LOG_SMALL = Math.log(0.0001), LOG_SPAN = Math.log(10000);
    var LOG_RAMP = Math.log(60000), LOG_TWO = Math.log(2), LOG_SCALE = Math.log(500);
    function clip(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
    function reflect(x) {
        var q = x - 2 * Math.floor(x / 2);
        return 1 - Math.abs(q - 1);
    }
    function random(s) {
        s.a = (40014 * s.a) % 2147483563;
        s.b = (40692 * s.b) % 2147483399;
        var z = s.a - s.b;
        if (z < 1) z += 2147483562;
        return z / 2147483563;
    }
    function create(seed, initial, now) {
        return {a: 1 + Math.floor(Math.abs(seed)) % 2147483562,
            b: 1 + Math.floor(Math.abs(seed) * 104729 + 12345) % 2147483398,
            from: initial, target: initial, began: now, duration: 0,
            next: now, events: 0, nativeValue: 0};
    }
    function position(s, now) {
        if (!(s.duration > 0)) return s.target;
        var p = clip((now - s.began) / s.duration, 0, 1);
        return s.from + (s.target - s.from) * p;
    }
    function next(s, low, high, now, discrete) {
        var current = clip(position(s, now), low, high), span = high - low;
        var u = random(s), v, w, target, duration = 0;
        if (u < 0.5) {
            u = random(s);
            if (!discrete) {
                target = low + span * u;
                if (u < 0.02) target = low;
                else if (u > 0.98) target = high;
            }
        } else {
            v = random(s); w = random(s);
            if (!discrete) {
                var size = Math.exp(LOG_SMALL + v * LOG_SPAN);
                target = low + span * reflect((current - low) / span + (2 * w - 1) * size);
            }
        }
        u = random(s);
        if (u >= 0.18) {
            v = random(s);
            if (!discrete) duration = Math.exp(v * LOG_RAMP);
        }
        // Consume exactly the same random sequence, including for switches.
        // Only calculations whose results used to be discarded are skipped.
        var scale = Math.exp(LOG_TWO + random(s) * LOG_SCALE);
        var wait = Math.max(1, -scale * Math.log(random(s)));
        if (discrete) {
            s.nativeValue = discrete.first + Math.floor(random(s) * discrete.count);
            target = (s.nativeValue - discrete.min) / discrete.span;
        }
        s.from = current; s.target = clip(target, low, high);
        s.began = now; s.duration = duration; s.next = now + wait; s.events++;
        return s;
    }
    return {create: create, random: random, next: next, position: position, clip: clip};
}());
