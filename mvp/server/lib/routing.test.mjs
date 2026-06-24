import test from "node:test";
import assert from "node:assert/strict";
import { computeEffectiveWeights, validateWeights, selectRep } from "./routing.mjs";

function reps(...specs) {
  return specs.map(([id, weightPct, sortOrder = 0]) => ({ id, weightPct, sortOrder }));
}

const r6 = (n) => Number(n.toFixed(6));

function fractions(map) {
  return Object.fromEntries([...map].map(([id, f]) => [id, r6(f)]));
}

test("all flexible reps split evenly to 100/N", () => {
  const map = computeEffectiveWeights(reps(["a", null], ["b", null], ["c", null]));
  assert.deepEqual(fractions(map), { a: r6(1 / 3), b: r6(1 / 3), c: r6(1 / 3) });
});

test("flexible split adjusts as rep count changes", () => {
  const two = computeEffectiveWeights(reps(["a", null], ["b", null]));
  assert.deepEqual(fractions(two), { a: 0.5, b: 0.5 });
});

test("pinning one rep makes the others split the remainder", () => {
  const map = computeEffectiveWeights(reps(["a", 40], ["b", null], ["c", null]));
  assert.deepEqual(fractions(map), { a: 0.4, b: 0.3, c: 0.3 });
});

test("two pins leave the rest to split what remains", () => {
  const map = computeEffectiveWeights(reps(["a", 40], ["b", 40], ["c", null], ["d", null], ["e", null]));
  assert.deepEqual(fractions(map), { a: 0.4, b: 0.4, c: r6(0.2 / 3), d: r6(0.2 / 3), e: r6(0.2 / 3) });
});

test("pins summing to 100 bench the flexible reps at 0%", () => {
  const map = computeEffectiveWeights(reps(["a", 60], ["b", 40], ["c", null]));
  assert.deepEqual(fractions(map), { a: 0.6, b: 0.4, c: 0 });
});

test("validateWeights rejects pins over 100", () => {
  const result = validateWeights(reps(["a", 70], ["b", 40], ["c", null]));
  assert.equal(result.ok, false);
  assert.match(result.error, /100/);
});

test("validateWeights rejects all-pinned not summing to 100", () => {
  const result = validateWeights(reps(["a", 60], ["b", 30]));
  assert.equal(result.ok, false);
});

test("validateWeights accepts all-pinned summing to 100", () => {
  assert.equal(validateWeights(reps(["a", 60], ["b", 40])).ok, true);
});

test("validateWeights warns when flexible reps are benched", () => {
  const result = validateWeights(reps(["a", 60], ["b", 40], ["c", null]));
  assert.equal(result.ok, true);
  assert.equal(result.warning, "benched");
});

test("validateWeights rejects out-of-range pins", () => {
  assert.equal(validateWeights(reps(["a", -5], ["b", null])).ok, false);
  assert.equal(validateWeights(reps(["a", 120])).ok, false);
});

test("validateWeights accepts all flexible", () => {
  assert.equal(validateWeights(reps(["a", null], ["b", null])).ok, true);
});

test("selectRep picks the rep with the highest deficit", () => {
  const result = selectRep([
    { id: "a", sortOrder: 1, rollingCount: 5, effectiveWeight: 0.5 },
    { id: "b", sortOrder: 2, rollingCount: 1, effectiveWeight: 0.5 },
  ]);
  assert.equal(result.rep.id, "b");
});

test("selectRep tie-breaks on sortOrder before id", () => {
  const bySortOrder = selectRep([
    { id: "z", sortOrder: 1, rollingCount: 0, effectiveWeight: 0.5 },
    { id: "a", sortOrder: 2, rollingCount: 0, effectiveWeight: 0.5 },
  ]);
  assert.equal(bySortOrder.rep.id, "z");

  const byIdWhenSortOrderTied = selectRep([
    { id: "z", sortOrder: 1, rollingCount: 0, effectiveWeight: 0.5 },
    { id: "a", sortOrder: 1, rollingCount: 0, effectiveWeight: 0.5 },
  ]);
  assert.equal(byIdWhenSortOrderTied.rep.id, "a");
});

test("selectRep honours a 60/40 split over many draws", () => {
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 100; i += 1) {
    const result = selectRep([
      { id: "a", sortOrder: 1, rollingCount: counts.a, effectiveWeight: 0.6 },
      { id: "b", sortOrder: 2, rollingCount: counts.b, effectiveWeight: 0.4 },
    ]);
    counts[result.rep.id] += 1;
  }
  assert.equal(counts.a, 60);
  assert.equal(counts.b, 40);
});

test("selectRep returns null when no reps are available", () => {
  assert.equal(selectRep([]), null);
});
