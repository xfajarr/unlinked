// Build (or reuse) the verifier for one snarkjs key and one pool category.
//   node verifier/build.mjs <verification_key.json> <categoryHex (display order = genesis outpoint txid)> <out.build.json>
// Writes <out>.fixtures.json (the {vk} file math.mjs reads) next to the build file.
import {readFileSync, writeFileSync} from 'node:fs';
import {vkFixturesFromSnarkjs, poolTokenOf, loadVerifier} from './verifier.mjs';
const [vkPath, cat, out] = process.argv.slice(2);
if (!out || !/^[0-9a-f]{64}$/.test(cat)) throw new Error('usage: node verifier/build.mjs <verification_key.json> <categoryHex> <out.build.json>');
const fxPath = out.replace(/\.build\.json$/, '') + '.fixtures.json';
writeFileSync(fxPath, JSON.stringify(vkFixturesFromSnarkjs(JSON.parse(readFileSync(vkPath, 'utf8'))), null, 1) + '\n');
const V = await loadVerifier(fxPath);
const t0 = Date.now(); const prog = V.buildCached(poolTokenOf(cat), out);
console.log(`verifier: code ${prog.json.codeBytes} B sha256 ${prog.json.codeSha256.slice(0, 16)}..., redeem ${prog.R.length} B, locking ${prog.locking.toString('hex')}, ${Date.now() - t0} ms -> ${out}`);
