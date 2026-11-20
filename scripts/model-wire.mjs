// Compares the generated MathML 3 model with the pinned Ruby tagged wire.
// Class names, attribute declaration order and XML child names come from the
// exact graph that generates src/v3. Child order, comments, text, missing
// attributes and explicit null remain distinct. No corpus values are changed.
//
// Representation differences are counted per row: Ruby records child
// order even on unordered models, and formatting whitespace on element-only
// ordered models. The generated reader/writer does not retain those tokens
// (src/v3/xml/runtime.ts). Models with map_content are mixed, so their spaces
// remain significant. Empty US-ASCII strings have the same value as UTF-8 "".
// The separate replay byte comparison still checks all serialized content.
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const ORDERED_MEMBER = "__lml_content";
const graph = JSON.parse(readFileSync(new URL("../model/mathml-v3.bundle.json", import.meta.url), "utf8"));

const infoCache = new Map();
function info(id) {
  let found = infoCache.get(id);
  if (found) return found;
  const model = graph.models[id];
  if (model === undefined) throw new Error(`model ${id} is not in the graph`);
  const xml = model.mappings?.xml ?? {};
  const names = new Map();
  let content = null;
  const visit = (rule) => {
    if (rule.kind === "element" && rule.to !== undefined && !names.has(rule.to)) names.set(rule.to, rule.name?.[0]);
    if (rule.kind === "content") content = rule.to;
    for (const member of rule.members ?? []) visit(member);
  };
  for (const rule of xml.rules ?? []) visit(rule);
  for (const rule of xml.sequence ?? []) visit(rule);
  found = {
    name: model.model,
    attributes: model.attributes.map((a) => a.name),
    names,
    content,
    keepsOrder: xml.ordered === true || xml.mixed === true,
    mixed: xml.mixed === true || content !== null,
  };
  infoCache.set(id, found);
  return found;
}

const isModel = (value) => value !== null && typeof value === "object" && typeof value.constructor?.modelId === "string";

function tag(value) {
  if (value === null || value === undefined) return { nil: true };
  if (typeof value === "boolean") return { bool: value };
  if (typeof value === "bigint") return { int: value.toString() };
  if (typeof value === "number") return Number.isInteger(value) ? { int: String(value) } : { float: String(value) };
  if (typeof value === "string") return { str: value };
  if (Array.isArray(value)) return { array: value.map(tag) };
  if (isModel(value)) return wire(value);
  if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
    return { hash: Object.entries(value).map(([key, item]) => [tag(key), tag(item)]) };
  }
  throw new Error(`no tagged form for ${Object.prototype.toString.call(value)}`);
}

const orderEntry = (pairs) => ({ hash: pairs.map(([k, v]) => [{ str: k }, { str: v }]) });

/** The Ruby wire of one parsed model. */
export function wire(model) {
  const meta = info(model.constructor.modelId);
  const fields = [];
  for (const name of meta.attributes) {
    if (!Object.hasOwn(model, name)) throw new Error(`${meta.name}: no member ${name}`);
    const value = model[name];
    // rt.ABSENT is the port's "not set", Ruby's using_default?. The reader
    // fills a collection with no element in the input with [] (absentList),
    // which is the attribute's default in Ruby too.
    if (typeof value === "symbol") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    fields.push([name, tag(value)]);
  }
  const tokens = model[ORDERED_MEMBER];
  if (meta.keepsOrder && Array.isArray(tokens) && tokens.length > 0) {
    const order = [];
    for (const token of tokens) {
      if (token.kind === "element") {
        const name = meta.names.get(token.attribute);
        if (name === undefined) throw new Error(`${meta.name}: no element name for ${token.attribute}`);
        order.push(orderEntry([["type", "Element"], ["name", name]]));
      } else if (token.kind === "text") {
        const text = "literal" in token ? token.literal : [model[token.attribute]].flat()[token.index];
        order.push(orderEntry([["type", "Text"], ["name", "text"], ["text", text]]));
      } else if (token.kind === "comment") {
        order.push(orderEntry([["type", "Comment"], ["name", "comment"]]));
      } else if (token.kind !== "attribute") {
        throw new Error(`${meta.name}: no wire form for a ${token.kind} token`);
      }
    }
    if (order.length > 0) fields.push(["@element_order", { array: order }]);
  }
  return { node: meta.name, fields };
}

const byName = new Map(Object.entries(graph.models).map(([id, m]) => [m.model, id]));
const profiles = { unwritten_element_order: 0, ordered_whitespace_text: 0, ascii_empty_string: 0 };

function normalizeValue(value, used) {
  if (value.bytes !== undefined && value.encoding === "US-ASCII" && value.bytes === "") {
    used.add("ascii_empty_string");
    return { str: "" };
  }
  if (value.array !== undefined) return { array: value.array.map((v) => normalizeValue(v, used)) };
  if (value.node !== undefined) return normalizeModel(value, used);
  return value;
}

function normalizeModel(value, used) {
  const id = byName.get(value.node);
  if (id === undefined) throw new Error(`expected model ${value.node} is not in the graph`);
  const meta = info(id);
  const fields = [];
  for (const [name, field] of value.fields) {
    if (name !== "@element_order") {
      fields.push([name, normalizeValue(field, used)]);
      continue;
    }
    if (!meta.keepsOrder) {
      used.add("unwritten_element_order");
      continue;
    }
    const kept = field.array.filter((entry) => {
      const pairs = Object.fromEntries(entry.hash.map(([k, v]) => [k.str, v.str]));
      const drop = !meta.mixed && pairs.type === "Text" && pairs.text.trim() === "";
      if (drop) used.add("ordered_whitespace_text");
      return !drop;
    });
    if (kept.length > 0) fields.push([name, { array: kept }]);
  }
  return { node: value.node, fields };
}

/** The expected wire with the Ruby-only state above removed; `used` collects the profile names applied. */
export function normalizeExpected(value) {
  const used = new Set();
  const normalized = normalizeValue(value, used);
  for (const name of used) profiles[name]++;
  return { normalized, used: [...used] };
}

/** Rows each normalization applied to. */
export const profileCounts = () => ({ ...profiles });

/** First differing path, preserving field and child order and missing values. */
export function firstDifference(actual, expected, path = "$model") {
  if (isDeepStrictEqual(actual, expected)) return null;
  if (actual !== null && expected !== null && typeof actual === "object" && typeof expected === "object") {
    for (const key of new Set([...Object.keys(actual), ...Object.keys(expected)])) {
      const difference = firstDifference(actual[key], expected[key], `${path}/${key}`);
      if (difference !== null) return difference;
    }
  }
  return `${path}: ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;
}
