import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdir,mkdtemp,copyFile,appendFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {parseMath,stringifyMath,parseMath4,stringifyMath4,v3,v4} from "../dist/index.js";
import {readBundle,provenance} from "../dist/artifacts.js";
import {canonicalTree,stripWs,stable,dump,firstDiff} from "./comparison.mjs";
const corpus=JSON.parse(await readFile(new URL("./fixtures/xml-cases.json",import.meta.url),"utf8"));
for(const row of corpus.rows)test(row.id,async()=>{
 const namespace=row.version===3?v3:v4;
 const codec=namespace.xml.CODECS[`Mml::V${row.version}::${row.model}@mml_v${row.version}`];
 const value=await codec.parse(row.input);const output=await codec.stringify(value);
 assert.equal(stable(stripWs(await canonicalTree(output))),stable(stripWs(await canonicalTree(row.expected_xml))));
 assert.equal(firstDiff(dump(value),dump(await codec.parse(output))),null);
});
test("public Math API and complete model graph artifacts",async()=>{
 for(const version of [3,4]){
  const graph=JSON.parse(await readBundle(version));assert.equal(Object.keys(graph.models).length,version===3?194:195);
  const text='<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>';
  assert.equal(stable(stripWs(await canonicalTree(await (version===3?stringifyMath(await parseMath(text)):stringifyMath4(await parseMath4(text)))))) ,stable(stripWs(await canonicalTree(text))));
 }
 assert.equal((await provenance()).generatorCommit,"1242c7b6314dcadc42e3453e85c9f2fc879cd7ef");
 await assert.rejects(readBundle(2),RangeError);
});
test("artifact loader refuses corrupted installed graph bytes",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"mml-ts-artifact-"));
 await mkdir(join(dir,"dist"));await mkdir(join(dir,"model"));
 await copyFile(new URL("../dist/artifacts.js",import.meta.url),join(dir,"dist/artifacts.mjs"));
 for(const name of ["manifest.json","mathml-v3.bundle.json"])await copyFile(new URL(`../model/${name}`,import.meta.url),join(dir,"model",name));
 await appendFile(join(dir,"model/mathml-v3.bundle.json")," ");
 const installed=await import(pathToFileURL(join(dir,"dist/artifacts.mjs")));
 await assert.rejects(installed.readBundle(3),/checksum mismatch/);
});
