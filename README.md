# MathML TypeScript source candidate

Local candidate for MathML 3 and 4. It contains the complete generated 194/195 model graphs and XML codecs from the official LutaML TypeScript generator. XML processing uses pinned Moxml/Leptris WASM; there is no replacement XML parser.

```js
import {parseMath, stringifyMath, v3} from "@plurimath/mml-ts";
const math = await parseMath('<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>');
const xml = await stringifyMath(math);
const identifier = await v3.xml.codecMmlV3Mi_mml_v3.parse('<mi xmlns="http://www.w3.org/1998/Math/MathML">x</mi>');
```

`parseMath` and `stringifyMath` use version 3; `parseMath4` and `stringifyMath4` use version 4. Each version namespace also exports every generated typed class and XML codec. The APIs return promises and propagate upstream structured XML/model errors. `initEngine`/`initModel` expose upstream initialization when an application supplies WASM explicitly. Node 22 and 24 are the current runtime targets; browser execution is unqualified until tested in its target environment.

The Node-only `@plurimath/mml-ts/artifacts` entry exports `readBundle(version)` with checksum validation and `provenance()`. MathML 2, generic Ruby object API parity and OMML are outside this candidate.

Run `npm ci`, `npm run check:artifacts`, `npm run build`, and `npm test`. Regenerate with `npm run generate -- /path/to/exact/lutaml-ts/source`; the revision must match the pinned producer. This package is maintained in `plurimath/mml-ts`. It remains private in the package manifest; registry publication is separate from this source delivery.
