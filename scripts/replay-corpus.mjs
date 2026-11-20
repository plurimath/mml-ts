// Replays the model-roundtrip rows of a pinned plurimath-testsuite mathml
// generation through the built package.
//
//   node scripts/replay-corpus.mjs <cases.json> [--report FILE]
//
// <cases.json> is written by scripts/extract-corpus.py, which first checks the
// generation against scripts/corpus-pin.json (snapshot digest, ledger,
// provenance, payload checksums and row IDs). Each row's input goes through
// parseMath and stringifyMath (the MathML 3 models
// Mml.parse builds by default), and the written XML must equal the row's expected to_xml output
// byte for byte; a row the gem refuses must be refused. A failing output is
// classed as output-bytes (same element tree, different bytes) or output-tree.
// The parsed model must also match the pinned Ruby tagged model wire
// (scripts/model-wire.mjs); model differences fail independently of XML bytes. The ledger is
// append-only: a row whose id has an -r2 sibling is superseded by it and only
// the sibling runs, as in the Ruby gem's replay. Any failing row fails.
//
// KNOWN_REFUSALS lists rows whose input is not well-formed XML. Ruby's parser
// recovers from them; this package's parser is strict (W3C) by design, so those
// rows must be refused here, and a listed row that is accepted fails the replay
// so the list cannot go stale.
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { parse as parseXml } from "moxml-ts";
import { parseMath, stringifyMath } from "../dist/index.js";
import { firstDifference, normalizeExpected, profileCounts, wire } from "./model-wire.mjs";

// Rows refused on purpose: the input is malformed XML.
const KNOWN_REFUSALS = new Map([
  ["mathml-unclosed-math.model-roundtrip", "unclosed <math> element"],
  ["mathml-unclosed-token.model-roundtrip", "unclosed <mi> element"],
  ["mathml-unclosed-operator.model-roundtrip", "unclosed <mo> element"],
  ["mathml-mismatched-close.model-roundtrip", "</mn> closes <mi>"],
]);

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { report: { type: "string" } },
});
if (positionals.length !== 1) throw new Error("Pass the extracted cases JSON");
const corpus = JSON.parse(readFileSync(positionals[0], "utf8"));

function tree(node) {
  const attrs = (node.attributes() ?? [])
    .filter((attr) => attr.localName !== "xmlns" && !(attr.qualifiedName ?? "").startsWith("xmlns:"))
    .map((attr) => [attr.namespaceUri ?? null, attr.localName, attr.value])
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const children = node.children();
  const structural = children.some((child) => child.kind() === 1);
  const content = [];
  for (const child of children) {
    if (child.kind() === 1) {
      content.push(tree(child));
    } else if (child.kind() === 2 || child.kind() === 4) {
      const text = child.text() ?? "";
      if (!structural || text.trim() !== "") {
        if (typeof content.at(-1) === "string") content[content.length - 1] += text;
        else content.push(text);
      }
    }
  }
  return [node.namespaceUri() ?? null, node.localName(), attrs, content];
}

async function xmlTree(xml) {
  let doc;
  try {
    doc = await parseXml(xml);
    return tree(doc.root());
  } catch {
    return undefined;
  } finally {
    doc?.dispose();
  }
}

// What Mml.parse(input).to_xml does with the default MathML 3 models.
const roundtrip = async (input) => {
  const model = await parseMath(input);
  return [await stringifyMath(model), model];
};

async function failure(row) {
  if (row.options && Object.keys(row.options).length > 0) throw new Error(`${row.id}: unsupported options`);
  let actual, model, error;
  try {
    [actual, model] = await roundtrip(row.input.str);
  } catch (e) {
    error = e;
  }
  if (KNOWN_REFUSALS.has(row.id)) return error ? null : ["known-refusal-accepted", actual];
  if (row.expected.refusal) return error ? null : ["accepted", actual];
  if (error) return ["refused", String(error?.message ?? error)];
  const expected = row.expected.output.str;
  let modelFailure;
  try {
    const { normalized } = normalizeExpected(row.expected.model);
    modelFailure = firstDifference(wire(model), normalized);
  } catch (error) {
    modelFailure = String(error?.message ?? error);
  }
  if (actual === expected) return modelFailure === null ? null : ["model-wire", modelFailure];
  let at = 0;
  while (actual[at] === expected[at]) at++;
  const left = await xmlTree(actual);
  const kind = left !== undefined && isDeepStrictEqual(left, await xmlTree(expected)) ? "output-bytes" : "output-tree";
  return [kind, `differs at ${at}: …${actual.slice(Math.max(0, at - 80), at + 160)}`];
}

const ids = new Set(corpus.cases.map((row) => row.id));
for (const id of KNOWN_REFUSALS.keys()) if (!ids.has(id)) throw new Error(`${id}: listed known refusal is not in the corpus`);
const superseded = new Set([...ids].filter((id) => id.includes("-r2")).map((id) => id.replace("-r2", "")));
const outcomes = [];
const kinds = {};
for (const row of corpus.cases) {
  if (row.boundary !== "model-roundtrip") throw new Error(`${row.id}: boundary ${row.boundary}`);
  if (superseded.has(row.id)) continue;
  const result = await failure(row);
  if (result) kinds[result[0]] = (kinds[result[0]] ?? 0) + 1;
  outcomes.push({ id: row.id, payload: row.payload, kind: result?.[0] ?? null, failure: result?.[1]?.slice(0, 800) ?? null });
}
if (outcomes.length + superseded.size !== corpus.cases.length) throw new Error("superseded rows without their original");
const failed = outcomes.filter((o) => o.kind !== null);
const report = {
  language: corpus.language,
  generation: corpus.generation,
  revision: corpus.revision,
  executed: outcomes.length,
  superseded: superseded.size,
  failed: failed.length,
  model_wire_profiles: profileCounts(),
  known_refusals: [...KNOWN_REFUSALS].map(([id, reason]) => ({ id, reason })),
  kinds,
  outcomes,
};
if (args.report) writeFileSync(args.report, JSON.stringify(report, null, 2));
console.log(`${outcomes.length} rows executed, ${superseded.size} superseded, ${failed.length} failed ${JSON.stringify(kinds)}`);
console.log(`model wire normalizations (rows): ${JSON.stringify(profileCounts())}`);
for (const o of failed.slice(0, 20)) console.log(`${o.id} [${o.kind}] ${o.failure}`);
if (failed.length > 0) process.exitCode = 1;
