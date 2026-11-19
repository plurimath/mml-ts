import * as v3 from "#mml-v3";
import * as v4 from "#mml-v4";
export { v3, v4 };
export { initEngine, initModel } from "moxml-ts";
import { rubyLayout } from "./ruby-layout.js";
export type MathML3 = v3.MmlV3Math_mml_v3;
export type MathML4 = v4.MmlV4Math_mml_v4;
export function parseMath(xml: string): Promise<MathML3> {
  return v3.xml.codecMmlV3Math_mml_v3.parse(xml);
}
/** Writes the bytes Ruby Mml to_xml gives: default namespace, two-space indentation. */
export async function stringifyMath(model: MathML3): Promise<string> {
  return rubyLayout(await v3.xml.codecMmlV3Math_mml_v3.stringify(model));
}
export function parseMath4(xml: string): Promise<MathML4> {
  return v4.xml.codecMmlV4Math_mml_v4.parse(xml);
}
/** Writes the bytes Ruby Mml to_xml gives: default namespace, two-space indentation. */
export async function stringifyMath4(model: MathML4): Promise<string> {
  return rubyLayout(await v4.xml.codecMmlV4Math_mml_v4.stringify(model));
}
