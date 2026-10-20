// Univer 1.0.x applies "legacy implicit intersection" inside AVERAGE and COUNTIFS to arrays that
// come from range-based functions such as FILTER and UNIQUE. Excel 365 (dynamic arrays) never does
// that, so =AVERAGE(FILTER(...)) returned the first element and =COUNTIFS(r, UNIQUE(r)) a single
// count. SUM already guards this with usesLegacyImplicitForAggregate(); we apply the same guard.
// Found by tools/verify.mjs, which compares every reference formula with pandas.
import fs from 'node:fs';
import path from 'node:path';


const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'node_modules', '@univerjs', 'engine-formula');
const files = ['lib/es/index.js', 'lib/cjs/index.js'].map((f) => path.join(root, f)).filter(fs.existsSync);
const MARK = '/* examstudio-patched */';
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes(MARK)) { console.log('already patched', path.relative(process.cwd(), f)); continue; }
  const before = s;
  // AVERAGE
  s = s.replace(/(_legacyImplicitDerivedArray\(variant\) \{\s*if \(!variant\.isArray\(\)\) return variant;\s*const array = variant;\s*if \(array\.usesInvertedIndexCache\(\)\) return variant;)/,
    '$1 if (!array.usesLegacyImplicitForAggregate()) return variant;');
  // COUNTIFS criteria
  s = s.replace(/(_legacyImplicitDerivedCriteria\(variants\) \{\s*return variants\.map\(\(variant, index\) => \{\s*if \(index % 2 === 0 \|\| !variant\.isArray\(\)\) return variant;\s*const array = variant;\s*if \(array\.usesInvertedIndexCache\(\)\) return variant;)/,
    '$1 if (!array.usesLegacyImplicitForAggregate()) return variant;');
  const n = (s.match(/if \(!array\.usesLegacyImplicitForAggregate\(\)\) return variant;/g) || []).length;
  if (n !== 2) { console.error(`patch-univer: expected 2 patch sites in ${f}, found ${n}. Univer changed – re-check.`); process.exit(1); }
  fs.writeFileSync(f, MARK + '\n' + s);
  console.log('patched', path.relative(process.cwd(), f));
}
