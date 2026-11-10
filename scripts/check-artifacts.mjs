import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const root=new URL("../model/",import.meta.url);
const manifest=JSON.parse(await readFile(new URL("manifest.json",root),"utf8"));
for(const version of [3,4]){const item=manifest.versions[version];const bytes=await readFile(new URL(item.path,root));if(createHash("sha256").update(bytes).digest("hex")!==item.sha256)throw new Error(`MathML ${version} checksum mismatch`);if(Object.keys(JSON.parse(bytes).models).length!==item.models)throw new Error(`MathML ${version} model count mismatch`);}
console.log("Two complete MathML graphs verified");
