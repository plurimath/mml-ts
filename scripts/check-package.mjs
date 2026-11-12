import {execFileSync} from "node:child_process";
import {mkdir,mkdtemp,writeFile,copyFile} from "node:fs/promises";
import {dirname,resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
await mkdir(join(root,".build/packages"),{recursive:true});
const packed=JSON.parse(execFileSync("npm",["pack","--json","--pack-destination",".build/packages"],{cwd:root,encoding:"utf8",shell:process.platform==="win32"}))[0];
const paths=packed.files.map(x=>x.path);
if(paths.some(x=>/(^|\/)(AGENTS\.md|CLAUDE\.md|node_modules|test|\.codex-context)(\/|$)/.test(x)))throw new Error("unexpected package surface");
const consumer=await mkdtemp(join(root,".build/consumer-"));
await writeFile(join(consumer,"package.json"),JSON.stringify({private:true,type:"module",dependencies:{"@plurimath/mml-ts":`file:${join(root,".build/packages",packed.filename)}`}}));
execFileSync("npm",["install","--cache",join(root,".build/npm-cache"),"--no-audit","--no-fund"],{cwd:consumer,stdio:"pipe",shell:process.platform==="win32"});
await copyFile(join(root,"test/fixtures/xml-cases.json"),join(consumer,"cases.json"));
await writeFile(join(consumer,"smoke.mjs"),`import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
import {parseMath,stringifyMath,parseMath4,stringifyMath4,v3,v4} from "@plurimath/mml-ts";
import {readBundle,provenance} from "@plurimath/mml-ts/artifacts";
const cases=JSON.parse(await readFile(new URL("./cases.json",import.meta.url),"utf8")).rows;
for(const row of cases){const mod=row.version===3?v3:v4;const codec=mod.xml.CODECS["Mml::V"+row.version+"::"+row.model+"@mml_v"+row.version];const model=await codec.parse(row.input);const xml=await codec.stringify(model);assert.ok(xml.length);await codec.parse(xml);}
for(const version of [3,4]){assert.equal(Object.keys(JSON.parse(await readBundle(version)).models).length,version===3?194:195);const text='<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>';assert.ok(await (version===3?stringifyMath(await parseMath(text)):stringifyMath4(await parseMath4(text))));}
assert.equal((await provenance()).generatorCommit,"1242c7b6314dcadc42e3453e85c9f2fc879cd7ef");
console.log(JSON.stringify({cases:cases.length,node:process.version,package:"@plurimath/mml-ts"}));
`);
await writeFile(join(consumer,"types.ts"),`import {parseMath,stringifyMath,parseMath4,stringifyMath4} from "@plurimath/mml-ts";\nimport type {MathML3,MathML4} from "@plurimath/mml-ts";\nconst third:MathML3=await parseMath("<math/>");await stringifyMath(third);\nconst fourth:MathML4=await parseMath4("<math/>");await stringifyMath4(fourth);\n`);
await writeFile(join(consumer,"tsconfig.json"),JSON.stringify({compilerOptions:{noEmit:true,strict:true,skipLibCheck:true,target:"ES2022",module:"NodeNext",lib:["ES2022","DOM"]},include:["types.ts"]}));
execFileSync(process.execPath,[join(root,"node_modules/typescript/bin/tsc"),"-p",join(consumer,"tsconfig.json")],{cwd:consumer,stdio:"pipe",encoding:"utf8"});
const output=execFileSync(process.execPath,[join(consumer,"smoke.mjs")],{cwd:consumer,encoding:"utf8"});
console.log(JSON.stringify({archive:packed.filename,files:packed.files.length,size:packed.size,unpackedSize:packed.unpackedSize,consumer:JSON.parse(output),installedTypes:"strict tsc passed"}));
