const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function host(options = {}) {
  let now = 1000;
  const tasks = [], calls = [], apis = [], errors = [];
  const state = { selected: 101, devicePath: 'live_set tracks 0 devices 0' };
  const records = new Map([
    [3, { type: 'Song.View' }],
    [10, { type: 'Device' }],
    [11, { type: 'DeviceParameter', value: options.off ? 0 : 1, canonical_parent: 10,
      min: 0, max: 1, is_enabled: 1, is_quantized: 1, name: 'Device On' }],
    [12, { type: 'DeviceParameter', value: 0, canonical_parent: 10,
      min: 0, max: 1, is_enabled: 1, is_quantized: 1, name: 'Map' }],
    [101, { type: 'DeviceParameter', value: 440, canonical_parent: 77,
      min: 20, max: 20000, is_enabled: 1, is_quantized: 0, name: 'Frequency' }],
    [102, { type: 'DeviceParameter', value: 3, canonical_parent: 77,
      min: 1, max: 7, is_enabled: 1, is_quantized: 1, name: 'Mode' }],
  ]);
  function Task(fn, owner) {
    this.fn = fn; this.owner = owner; this.pending = false; this.repeating = false;
    this.schedule = () => { this.pending = true; };
    this.cancel = () => { this.pending = false; this.repeating = false; };
    this.repeat = () => { this.repeating = true; };
    tasks.push(this);
  }
  function LiveAPI(callback, target) {
    this.ref = typeof target === 'number' ? target : {
      this_device: 10, 'this_device parameters 0': 11, 'live_set view': 3,
    }[target];
    this.callback = callback;
    this.observed = '';
    this.get = (property) => {
      const record = records.get(this.ref);
      if (!record) throw new Error('deleted object');
      if (this.ref === 3 && property === 'selected_parameter') return ['id', state.selected];
      if (property === 'canonical_parent') return ['id', record.canonical_parent];
      if (!(property in record)) throw new Error(`unknown property: ${property}`);
      return [record[property]];
    };
    this.set = () => { throw new Error('Unexpected Live API write / undo entry'); };
    Object.defineProperties(this, {
      id: { get: () => records.has(this.ref) ? this.ref : 0 },
      type: { get: () => records.get(this.ref)?.type },
      unquotedpath: { get: () => this.ref === 10 ? state.devicePath : `id ${this.ref}` },
      property: {
        get: () => this.observed,
        set: property => {
          this.observed = property;
          if (!property) return;
          if (this.ref === 3) callback(['selected_parameter', 'id', state.selected]);
          if (this.ref === 11) callback(['value', records.get(11).value]);
        },
      },
    });
    apis.push(this);
  }
  let context;
  const sandbox = {
    LiveAPI, Task,
    Date: function () { return new Date(now); },
    arrayfromargs: args => Array.from(args),
    post: value => errors.push(value),
    outlet: (outlet, ...args) => {
      calls.push({ outlet, args });
      // Native observer feedback: reference ownership is tested separately in Live.
      if (outlet === 2) context.restoreid(...args);
    },
  };
  context = vm.createContext(sandbox);
  for (const file of ['chaos-engine.js', 'live-controller.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  }
  const flush = () => {
    for (let limit = 0; limit < 50; limit++) {
      const pending = tasks.filter(task => task.pending);
      if (!pending.length) return;
      for (const task of pending) {
        if (!task.pending) continue;
        task.pending = false; task.fn.call(task.owner);
      }
    }
    throw new Error('Unbounded Task feedback');
  };
  const select = id => {
    if (state.selected === id) return;
    state.selected = id;
    for (const api of apis) {
      if (api.ref === 3 && api.observed) api.callback(['selected_parameter', 'id', id]);
    }
  };
  const load = () => { context.initialize(); flush(); };
  const arm = () => { select(12); context.map(1); };
  const map = (id = 101) => { arm(); select(id); flush(); };
  const advance = (ms = 25) => {
    now += ms;
    for (const task of tasks.filter(t => t.repeating)) task.fn.call(task.owner);
    flush();
  };
  const power = value => {
    records.get(11).value = value;
    for (const api of apis) if (api.ref === 11 && api.observed) api.callback(['value', value]);
    flush();
  };
  const last = outlet => calls.filter(c => c.outlet === outlet).at(-1)?.args;
  return { context, calls, tasks, records, errors, state, flush, select, load, arm, map, advance, power, last };
}

test('initialization is deferred and never maps an existing selection by itself', () => {
  const h = host();
  assert.equal(h.context.ready, false);
  h.context.initialize();
  assert.equal(h.context.ready, false);
  h.flush();
  assert.equal(h.context.ready, true);
  assert.equal(h.context.mapped, null);
  assert.equal(h.context.remoteId, 0);
  assert.equal(h.errors.length, 0);
});

test('map is deferred out of selection notifications and initializes before acquiring', () => {
  const h = host(); h.load(); h.arm();
  h.select(101);
  assert.equal(h.context.mapped, null);
  h.flush();
  assert.equal(h.context.mapped.id, 101);
  assert.deepEqual(h.last(1), ['id', 101]);
  const acquiring = h.calls.findIndex(c => c.outlet === 1 && c.args[1] === 101);
  const initial = h.calls.findIndex(c => c.outlet === 0 && c.args[0] === 440 && c.args[1] === 0);
  assert.ok(initial >= 0 && initial < acquiring);
  assert.equal(h.context.armed, false);
  assert.deepEqual(h.last(2), ['id', 101]);
});

test('arming without selecting a new target never maps the old selection', () => {
  const h = host(); h.load(); h.context.map(1); h.flush();
  assert.equal(h.context.mapped, null);
  assert.equal(h.context.armed, true);
});

test('self mapping is rejected without leaving selection mode', () => {
  const h = host(); h.load(); h.arm(); h.select(11); h.flush();
  assert.equal(h.context.mapped, null);
  assert.equal(h.context.armed, true);
  assert.match(h.last(4)[0], /outside this device/);
});

test('disabled, nonparameter, and invalid-range targets are rejected', () => {
  for (const update of [
    { is_enabled: 0 }, { type: 'Track' }, { min: NaN }, { max: 20 }, { max: Infinity },
  ]) {
    const h = host(); Object.assign(h.records.get(101), update);
    h.load(); h.map();
    assert.equal(h.context.mapped, null);
    assert.equal(h.context.remoteId, 0);
  }
});

test('pause releases ownership and resume uses the manually changed value', () => {
  const h = host(); h.load(); h.map();
  h.context.pause(1);
  assert.deepEqual(h.last(1), ['id', 0]);
  assert.equal(h.tasks.filter(t => t.repeating).length, 0);
  h.records.get(101).value = 18123;
  h.context.pause(0);
  assert.deepEqual(h.last(0), [18123, 0]);
  assert.deepEqual(h.last(1), ['id', 101]);
  assert.equal(h.tasks.filter(t => t.repeating).length, 1);
});

test('clear cancels pending selections and stored references', () => {
  const h = host(); h.load(); h.map(); h.arm(); h.select(102);
  h.context.clear(); h.flush();
  assert.equal(h.context.mapped, null);
  assert.equal(h.context.remoteId, 0);
  assert.equal(h.context.armed, false);
  assert.deepEqual(h.last(2), ['id', 0]);
  assert.equal(h.tasks.filter(t => t.repeating).length, 0);
});

test('cancel mapping keeps the earlier target and restarts its motion', () => {
  const h = host(); h.load(); h.map(); h.arm(); h.context.map(0);
  assert.equal(h.context.mapped.id, 101);
  assert.equal(h.context.remoteId, 101);
});

test('an invalid replacement leaves the prior mapping available on cancel', () => {
  const h = host(); h.load(); h.map(); h.arm(); h.select(11); h.flush();
  assert.equal(h.context.mapped.id, 101);
  h.context.map(0);
  assert.equal(h.context.remoteId, 101);
});

test('native reference restoration works both before and after device initialization', () => {
  for (const before of [true, false]) {
    const h = host();
    if (before) h.context.restoreid('id', 102);
    h.load();
    if (!before) { h.context.restoreid(102); h.flush(); }
    assert.equal(h.context.mapped.id, 102);
    assert.equal(h.context.remoteId, 102);
    assert.equal(h.calls.filter(c => c.outlet === 2).length, 0);
  }
});

test('restoring a paused instance does not start motion', () => {
  const h = host(); h.context.pause(1); h.context.restoreid(101); h.load();
  assert.equal(h.context.mapped.id, 101);
  assert.equal(h.context.remoteId, 0);
  assert.equal(h.tasks.filter(t => t.repeating).length, 0);
});

test('deletion notifications release the target immediately after deferral', () => {
  const h = host(); h.load(); h.map(); h.records.delete(101);
  h.context.restoreid(0); h.flush();
  assert.equal(h.context.mapped, null);
  assert.equal(h.context.remoteId, 0);
  assert.match(h.last(4)[0], /removed/);
});

test('an invalid restored reference is never acquired', () => {
  const h = host(); h.context.restoreid(999); h.load();
  assert.equal(h.context.mapped, null);
  assert.equal(h.context.remoteId, 0);
  assert.match(h.last(4)[0], /Saved target unavailable/);
});

test('a deleted target is detected by validation even without a native notification', () => {
  const h = host(); h.load(); h.map(); h.records.delete(101); h.advance(1001);
  assert.equal(h.context.mapped, null);
  assert.equal(h.context.remoteId, 0);
});

test('initially bypassed devices remember mapping but do not acquire the target', () => {
  const h = host({ off: true }); h.load(); h.map();
  assert.equal(h.context.mapped.id, 101);
  assert.equal(h.context.remoteId, 0);
  h.power(1);
  assert.equal(h.context.remoteId, 101);
});

test('device bypass releases the target and enabling resumes from its current value', () => {
  const h = host(); h.load(); h.map(); h.power(0);
  assert.equal(h.context.remoteId, 0);
  assert.equal(h.context.mapped.id, 101);
  h.records.get(101).value = 1700;
  h.power(1);
  assert.deepEqual(h.last(0), [1700, 0]);
  assert.equal(h.context.remoteId, 101);
});

test('continuous and quantized target outputs respect the real parameter range', () => {
  for (const id of [101, 102]) {
    const h = host(); h.load(); h.map(id);
    const record = h.records.get(id);
    for (let i = 0; i < 2000; i++) {
      h.advance();
      const [value, ramp] = h.last(0);
      assert.ok(value >= record.min && value <= record.max);
      assert.ok(Number.isFinite(value));
      assert.equal(ramp, record.is_quantized ? 0 : 25);
      if (record.is_quantized) assert.equal(Math.round(value), value);
    }
  }
});

test('moving the device reconnects remote ownership after resetting its signal', () => {
  const h = host(); h.load(); h.map();
  const start = h.calls.length;
  h.state.devicePath = 'live_set tracks 3 devices 2'; h.advance(1100);
  const events = h.calls.slice(start);
  assert.deepEqual(events.filter(e => e.outlet === 1).map(e => e.args), [['id', 0], ['id', 101]]);
  assert.ok(events.some(e => e.outlet === 0 && e.args[1] === 0));
});

test('repeated initialization and repeated resumes never create multiple clocks', () => {
  const h = host(); h.load(); h.load(); h.map();
  for (let i = 0; i < 4; i++) h.context.pause(0);
  assert.equal(h.tasks.filter(t => t.repeating).length, 1);
});

test('deleting the device releases ownership and stops all callbacks', () => {
  const h = host(); h.load(); h.map(); h.context.freebang();
  assert.equal(h.context.remoteId, 0);
  assert.equal(h.context.ready, false);
  assert.equal(h.tasks.some(t => t.pending || t.repeating), false);
});
