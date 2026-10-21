/* ES5 on purpose: this file also runs inside Max's classic [js] object. */
var ChaosEngine = (function () {
    "use strict";

    function clamp(value, low, high) {
        return Math.max(low, Math.min(high, value));
    }

    function Engine(random) {
        this.random = random || Math.random;
        this.value = 0.5;
        this.segment = null;
        this.orbit = 0.357;
        this.reset(0.5);
    }

    Engine.prototype.unit = function () {
        var value = Number(this.random());
        return isFinite(value) ? clamp(value, 0, 0.999999999) : 0.5;
    };

    Engine.prototype.between = function (low, high) {
        return low + (high - low) * this.unit();
    };

    Engine.prototype.logTime = function (low, high) {
        return low * Math.pow(high / low, this.unit());
    };

    Engine.prototype.reset = function (initial) {
        this.value = isFinite(Number(initial)) ? clamp(Number(initial), 0, 1) : 0.5;
        this.orbit = this.between(0.1, 0.9);
        this.segment = null;
    };

    Engine.prototype.next = function () {
        var choice = this.unit();
        var mode, duration, target;
        // Independent timing and targets prevent a repeating LFO shape.
        this.orbit = clamp(3.99 * this.orbit * (1 - this.orbit), 0.001, 0.999);
        if (choice < 0.36) {
            mode = "DRIFT";
            duration = this.logTime(900, 9000);
            target = 0.6 * this.unit() + 0.4 * this.orbit;
        } else if (choice < 0.63) {
            mode = "JUMP";
            duration = this.logTime(60, 650);
            target = this.unit();
        } else if (choice < 0.84) {
            mode = "FLUTTER";
            duration = this.logTime(100, 1200);
            target = clamp(this.value + this.between(-0.24, 0.24), 0, 1);
        } else {
            mode = "HOLD";
            duration = this.logTime(350, 12000);
            target = this.value;
        }
        this.segment = {
            mode: mode, duration: duration, elapsed: 0,
            start: this.value, target: target
        };
    };

    Engine.prototype.tick = function (milliseconds) {
        var delta = Number(milliseconds);
        var segment, portion, left, progress;
        // A stalled host must not trigger an unbounded catch-up loop.
        delta = isFinite(delta) ? clamp(delta, 0, 250) : 0;
        if (!this.segment) { this.next(); }
        while (delta > 0) {
            segment = this.segment;
            left = segment.duration - segment.elapsed;
            portion = Math.min(left, delta);
            segment.elapsed += portion;
            delta -= portion;
            progress = clamp(segment.elapsed / segment.duration, 0, 1);
            if (segment.mode === "JUMP") {
                progress = clamp(segment.elapsed / Math.min(35, segment.duration), 0, 1);
            } else {
                progress = progress * progress * (3 - 2 * progress);
            }
            this.value = clamp(segment.start + (segment.target - segment.start) * progress, 0, 1);
            if (segment.elapsed >= segment.duration) { this.next(); }
        }
        return { value: this.value, mode: this.segment.mode };
    };

    return Engine;
}());

if (typeof module !== "undefined" && module.exports) {
    module.exports = ChaosEngine;
}
