// The XML layout of the Ruby Mml gem's to_xml, applied to the generated
// codecs' compact output so stringifyMath gives the same bytes as
// Mml.parse(xml).to_xml: MathML elements use the default namespace (xmlns on
// the root, no prefix), element-only content is indented by two spaces, and an
// empty element whose model maps text content is written <mi></mi>.
import { parse } from "moxml-ts";
import type { Node } from "moxml-ts";

const MATHML = "http://www.w3.org/1998/Math/MathML";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const ELEMENT = 1;
const TEXT = 2;
const CDATA = 4;

// Elements whose models map text content (map_content): Ruby writes them as a
// start and end tag even when the content is empty.
const TEXT_CONTENT = new Set(["annotation", "cbytes", "ci", "cn", "cs", "csymbol", "mi", "mn", "mo", "ms", "mtext"]);

const TEXT_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\r": "&#13;" };
const ATTR_ESCAPES: Record<string, string> = { ...TEXT_ESCAPES, '"': "&quot;", "\n": "&#10;", "\t": "&#9;" };
const escapeText = (text: string): string => text.replace(/[&<>\r]/g, (c) => TEXT_ESCAPES[c] ?? c);
const escapeAttr = (text: string): string => text.replace(/[&<>"\n\r\t]/g, (c) => ATTR_ESCAPES[c] ?? c);

type Scope = ReadonlyMap<string, string>;

// Mixed content: at least one child element and some non-whitespace text.
function isMixed(node: Node): boolean {
  const children = node.children();
  return (
    children.some((child) => child.kind() === ELEMENT) &&
    children.some((child) => child.kind() === TEXT && (child.text() ?? "").trim() !== "")
  );
}

function write(node: Node, depth: number, scope: Scope, out: string[]): void {
  const uri = node.namespaceUri() ?? "";
  const local = node.localName() ?? "";
  const prefix = uri === MATHML || uri === "" ? "" : (node.prefix() ?? "");
  const inner = new Map(scope);
  const decls: string[] = [];
  const need = (p: string, u: string): void => {
    if (p === "xml" && u === XML_NS) return;
    if ((inner.get(p) ?? "") === u) return;
    inner.set(p, u);
    decls.push(`${p === "" ? "xmlns" : `xmlns:${p}`}="${escapeAttr(u)}"`);
  };
  need(prefix, uri);
  const attrs: string[] = [];
  for (const attr of node.attributes() ?? []) {
    if (attr.name === "xmlns" || attr.prefix === "xmlns") continue;
    if (attr.prefix !== "") need(attr.prefix, attr.namespaceUri);
    attrs.push(`${attr.name}="${escapeAttr(attr.value)}"`);
  }
  const name = prefix === "" ? local : `${prefix}:${local}`;
  out.push(`<${[name, ...decls, ...attrs].join(" ")}`);
  const children = node.children();
  if (children.length === 0) {
    out.push(uri === MATHML && TEXT_CONTENT.has(local) ? `></${name}>` : "/>");
    return;
  }
  out.push(">");
  const indent = children.every((child) => child.kind() !== TEXT && child.kind() !== CDATA);
  // Ruby writes a bare newline after a mixed-content child of a mixed-content
  // element (</mrow>\n</mrow>, </mrow>\n<mo>): a whitespace-only text right
  // after such a child becomes that newline; with no text there, one is added.
  const mixed = isMixed(node);
  children.forEach((child, at) => {
    if (indent) out.push("\n" + "  ".repeat(depth + 1));
    const prev = at > 0 ? children[at - 1] : undefined;
    const afterMixed = mixed && prev !== undefined && prev.kind() === ELEMENT && isMixed(prev);
    switch (child.kind()) {
      case ELEMENT:
        if (afterMixed) out.push("\n");
        write(child, depth + 1, inner, out);
        break;
      case TEXT: {
        const text = child.text() ?? "";
        out.push(afterMixed && text.trim() === "" ? "\n" : escapeText(text));
        break;
      }
      case CDATA:
        out.push(`<![CDATA[${(child.text() ?? "").replaceAll("]]>", "]]]]><![CDATA[>")}]]>`);
        break;
      default:
        throw new Error(`unexpected node kind ${child.kind()} in written MathML`);
    }
  });
  const last = children[children.length - 1];
  if (mixed && last !== undefined && last.kind() === ELEMENT && isMixed(last)) out.push("\n");
  if (indent) out.push("\n" + "  ".repeat(depth));
  out.push(`</${name}>`);
}

/** Rewrites compact generated XML in the layout Ruby Mml writes. */
export async function rubyLayout(xml: string): Promise<string> {
  const doc = await parse(xml);
  try {
    const root = doc.root();
    if (root === undefined) throw new Error("written MathML has no root element");
    const out: string[] = [];
    write(root, 0, new Map([["", ""]]), out);
    return out.join("");
  } finally {
    doc.dispose();
  }
}
