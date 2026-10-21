const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../src/chaos-engine.js');

function random(seed) {
  return () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

test('long runs remain finite and bounded while visiting all four behaviors', () => {
  const engine = new Engine(random(713));
  const modes = new Set();
  let min = 1, max = 0;
  for (let i = 0; i < 120000; i++) {
    const frame = engine.tick(25);
    assert.ok(Number.isFinite(frame.value));
    assert.ok(frame.value >= 0 && frame.value <= 1);
    modes.add(frame.mode);
    min = Math.min(min, frame.value); max = Math.max(max, frame.value);
  }
  assert.deepEqual([...modes].sort(), ['DRIFT', 'FLUTTER', 'HOLD', 'JUMP']);
  assert.ok(min < 0.05 && max > 0.95, `${min} .. ${max}`);
});

test('hold preserves the current parameter value', () => {
  const values = [0.4, 0.98, 0.5];
  const engine = new Engine(() => values.shift() ?? 0.5);
  engine.reset(0.37);
  values.unshift(0.99, 0.5);
  const before = engine.tick(25);
  assert.equal(before.mode, 'HOLD');
  for (let i = 0; i < 10; i++) assert.equal(engine.tick(25).value, 0.37);
});

test('reset starts at the actual parameter position, including both endpoints', () => {
  const engine = new Engine(random(3));
  for (const initial of [0, 0.21, 0.8, 1]) {
    engine.reset(initial);
    assert.equal(engine.tick(0).value, initial);
  }
});

test('bad inputs and stalled clocks do not poison the engine', () => {
  const engine = new Engine(() => NaN);
  for (const initial of [NaN, Infinity, -Infinity, -10, 20]) {
    engine.reset(initial);
    for (const delta of [NaN, Infinity, -1, 0, 25, 1e100]) {
      const { value } = engine.tick(delta);
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    }
  }
  engine.reset(0.5);
  engine.tick(1e100);
  assert.ok(engine.segment.elapsed <= 250);
});

test('different random sources produce independent trajectories', () => {
  const a = new Engine(random(42)), b = new Engine(random(43));
  const first = [], second = [];
  for (let i = 0; i < 1000; i++) {
    first.push(a.tick(25).value); second.push(b.tick(25).value);
  }
  assert.notDeepEqual(first, second);
});

test('frame timing changes do not change an elapsed-time trajectory', () => {
  const a = new Engine(random(81)), b = new Engine(random(81));
  for (let i = 0; i < 20; i++) a.tick(25);
  for (let i = 0; i < 5; i++) b.tick(100);
  assert.ok(Math.abs(a.value - b.value) < 1e-12);
});

test('all durations are positive and targets stay in bounds at random extremes', () => {
  for (const seed of [0, 0.359, 0.36, 0.629, 0.63, 0.839, 0.84, 0.999999, 1]) {
    const engine = new Engine(() => seed);
    engine.next();
    assert.ok(engine.segment.duration >= 60 && engine.segment.duration <= 12000);
    assert.ok(engine.segment.target >= 0 && engine.segment.target <= 1);
  }
});
