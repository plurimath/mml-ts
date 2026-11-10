import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
export type Version = 3 | 4;
export async function readBundle(version: Version = 3): Promise<string> {
  if (version !== 3 && version !== 4) throw new RangeError(`unsupported portable MathML version: ${version}`);
  const manifest = JSON.parse(await readFile(new URL("../model/manifest.json", import.meta.url), "utf8"));
  const entry = manifest.versions[String(version)];
  const bytes = await readFile(new URL(`../model/${entry.path}`, import.meta.url));
  if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error(`MathML ${version} artifact checksum mismatch`);
  return bytes.toString("utf8");
}
export async function provenance(): Promise<unknown> {
  return JSON.parse(await readFile(new URL("../model/codegen-provenance.json", import.meta.url), "utf8"));
}
