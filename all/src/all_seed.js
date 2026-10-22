/* One startup message only. No audio processing, recurring Task or Live API. */
autowatch = 0;
inlets = 1;
outlets = 1;
function bang() {
    var stamp = new Date().getTime();
    var seed = 1 + Math.floor((stamp + Math.random() * 2147483000) % 2147483000);
    outlet(0, seed);
}
