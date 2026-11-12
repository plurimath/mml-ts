import {readFile,writeFile,mkdir,readdir,copyFile} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import ts from "typescript";
const pin="1242c7b6314dcadc42e3453e85c9f2fc879cd7ef";
const source=resolve(process.argv[2]??"");
if(!process.argv[2])throw new Error("supply the exact pinned upstream lutaml-ts source checkout");
if(execFileSync("git",["rev-parse","HEAD"],{cwd:source,encoding:"utf8"}).trim()!==pin)throw new Error("generator revision mismatch");
if(execFileSync("git",["status","--porcelain"],{cwd:source,encoding:"utf8"}).trim())throw new Error("generator source must be clean");
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const built=join(root,".build/lutaml-ts");
async function compile(from,to){await mkdir(to,{recursive:true});for(const item of await readdir(from,{withFileTypes:true})){const input=join(from,item.name);if(item.isDirectory())await compile(input,join(to,item.name));else if(item.name.endsWith(".ts")&&!item.name.endsWith(".d.ts")){const text=await readFile(input,"utf8");await writeFile(join(to,item.name.slice(0,-3)+".js"),ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);}}}
await compile(join(source,"src"),built);
const {generateModelsWith}=await import(pathToFileURL(join(built,"generator/index.js")));
const {createXmlEmitter}=await import(pathToFileURL(join(built,"xml/index.js")));
await mkdir(join(root,"src/upstream"),{recursive:true});await copyFile(join(source,"src/contracts.ts"),join(root,"src/upstream/contracts.ts"));
const filesWritten=[];
for(const version of [3,4]){
 const bundle=JSON.parse(await readFile(join(root,`model/mathml-v${version}.bundle.json`),"utf8"));
 const options={contractsModule:"../upstream/contracts.js"};
 const files=generateModelsWith(bundle,{types:{}},[createXmlEmitter(options)],options);
 for(const [path,text] of files){const filename=join(root,`src/v${version}`,path);await mkdir(dirname(filename),{recursive:true});await writeFile(filename,text);filesWritten.push({path:`src/v${version}/${path}`,sha256:createHash("sha256").update(text).digest("hex")});}
}
const producer=JSON.parse(await readFile(join(root,"model/manifest.json"),"utf8"));
await writeFile(join(root,"model/codegen-provenance.json"),JSON.stringify({format:"mml-ts-codegen/1",generatorRepository:"lutaml/lutaml-ts",generatorCommit:pin,modelProducer:producer,moxmlCommit:"a78091f7b11bb350fdd18a8dc6e12b3ae39661fd",contractsSourceSha256:createHash("sha256").update(await readFile(join(source,"src/contracts.ts"))).digest("hex"),files:filesWritten},null,2)+"\n");
console.log(`Generated complete MathML 3/4 XML model graphs (${filesWritten.length} files)`);
