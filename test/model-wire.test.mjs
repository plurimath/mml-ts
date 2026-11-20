import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MmlV3Math_mml_v3 as MathModel, MmlV3Mi_mml_v3 as Mi,
  MmlV3Mo_mml_v3 as Mo, MmlV3Mtext_mml_v3 as Mtext } from "../dist/v3/models.js";
import { firstDifference, normalizeExpected, wire } from "../scripts/model-wire.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/model-wire.json", import.meta.url), "utf8"));
const text = (index) => ({ kind: "text", attribute: "value", index });
const element = (attribute, index = 0) => ({ kind: "element", attribute, index });
const order = (pairs) => ({ hash: pairs.map(([k, v]) => [{ str: k }, { str: v }]) });
const actuals = new Map([
  ["mathml-tokens-088.model-roundtrip", new MathModel({
    mo_value: [new Mo({ value: ["''"], __lml_content: [text(0)] })],
    __lml_content: [element("mo_value")],
  })],
  ["mathml-text-001.model-roundtrip", new MathModel({
    mtext_value: [new Mtext({ value: ["aβb"], __lml_content: [text(0)] })],
    __lml_content: [element("mtext_value")],
  })],
  ["mathml-text-009.model-roundtrip", new MathModel({
    mtext_value: [new Mtext({ value: ["\u00a0", "Theorem \u00a0", "1:"], __lml_content: [
      text(0), { kind: "comment", literal: "NO-BREAK SPACE" },
      text(1), { kind: "comment", literal: "NO-BREAK SPACE" }, text(2),
    ] })], __lml_content: [element("mtext_value")],
  })],
]);
for (const row of fixture.cases) test(`pinned Ruby wire: ${row.id}`, () => {
  const { normalized } = normalizeExpected(row.expected.model);
  assert.deepEqual(wire(actuals.get(row.id)), normalized);
});

test("text changes fail even when no XML writer is involved", () => {
  const expected = normalizeExpected(fixture.cases[0].expected.model).normalized;
  const model = new MathModel({ mo_value: [new Mo({ value: ["changed"], __lml_content: [text(0)] })],
    __lml_content: [element("mo_value")] });
  assert.match(firstDifference(wire(model), expected), /changed.*expected/);
});

test("child order remains significant across different mapped attributes", () => {
  const mi = new Mi({ value: ["x"], __lml_content: [text(0)] });
  const mo = new Mo({ value: ["+"], __lml_content: [text(0)] });
  const init = { mi_value: [mi], mo_value: [mo] };
  const a = wire(new MathModel({ ...init, __lml_content: [element("mi_value"), element("mo_value")] }));
  const b = wire(new MathModel({ ...init, __lml_content: [element("mo_value"), element("mi_value")] }));
  assert.notEqual(firstDifference(a, b), null);
});

test("missing, explicit null and empty string stay different", () => {
  const missing = wire(new Mi());
  const empty = wire(new Mi({ mathcolor: "" }));
  assert.notEqual(firstDifference(missing, empty), null);
  assert.notEqual(firstDifference({ fields: [] }, { fields: [["value", { nil: true }]] }), null);
});

for (const Model of [Mi, Mo, Mtext]) {
  test(`${Model.name}: empty mapped content has a value but no synthetic order entry`, () => {
    const empty = wire(new Model({ value: [""], __lml_content: [text(0)] }));
    assert.deepEqual(empty.fields, [["value", { array: [{ str: "" }] }]]);
    assert.notEqual(firstDifference(empty, wire(new Model())), null);
    const whitespace = wire(new Model({ value: [" "], __lml_content: [text(0)] }));
    assert.deepEqual(whitespace.fields.at(-1), ["@element_order", { array: [
      order([["type", "Text"], ["name", "text"], ["text", " "]]),
    ] }]);
  });
}

test("empty literal text and text beside a comment remain ordered", () => {
  const literal = wire(new Mi({ __lml_content: [{ kind: "text", literal: "" }] }));
  assert.equal(literal.fields.at(-1)[0], "@element_order");
  const commented = wire(new Mi({ value: [""], __lml_content: [
    text(0), { kind: "comment", literal: "keep" },
  ] }));
  assert.equal(commented.fields.at(-1)[1].array.length, 2);
});

test("mixed whitespace is retained; only element-only formatting is normalized", () => {
  const mixed = { node: "Mml::V3::Mi", fields: [["value", { array: [{ str: " " }] }],
    ["@element_order", { array: [order([["type", "Text"], ["name", "text"], ["text", " "]])] }]] };
  const original = structuredClone(mixed);
  assert.deepEqual(normalizeExpected(mixed).normalized, mixed);
  assert.deepEqual(mixed, original, "normalization must not mutate pinned expectations");
  const structural = { node: "Mml::V3::Math", fields: [["@element_order", { array: [
    order([["type", "Text"], ["name", "text"], ["text", "\n  "]]),
  ] }]] };
  assert.deepEqual(normalizeExpected(structural).used, ["ordered_whitespace_text"]);
});

test("unknown model IDs and ordered tokens fail closed", () => {
  assert.throws(() => normalizeExpected({ node: "Unknown", fields: [] }), /not in the graph/);
  const model = new Mi({ value: ["x"], __lml_content: [text(0)] });
  // A foreign runtime token must never silently disappear from the comparison.
  assert.throws(() => wire({ ...model, constructor: Mi, __lml_content: [{ kind: "foreign" }] }), /no wire form/);
});
