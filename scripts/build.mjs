import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const tsc=fileURLToPath(new URL("../node_modules/typescript/bin/tsc",import.meta.url));
for(const project of ["tsconfig.generated.json","tsconfig.json"]){
 console.error(project==="tsconfig.generated.json"?"Emit unchanged upstream-generated modules and declarations (full generated-source checking unqualified)":"Strictly check the package API against generated declarations");
 execFileSync(process.execPath,[tsc,"--build",project],{stdio:"inherit"});
}
