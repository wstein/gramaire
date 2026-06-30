import { readFileSync } from 'node:fs';
import { evaluate } from '../site/src/generated/gramark-engine.mjs';

// The exact fold runtime the Lab will use (meta provided by the engine).
function unwrap(c){ return 'val' in c ? c.val : c.tok; }
function makeFold(meta){
  return function fold(node, handlers, fallback){
    if (node.token !== undefined) return { tok: { terminal: node.token, text: node.text } };
    const m = meta[node.rule] || { label: null, fields: [] };
    const kids = node.children.map(k => fold(k, handlers, fallback));
    const h = m.label != null ? handlers[m.label] : undefined;
    if (h){ const named={}; m.fields.forEach((f,i)=>{ if(f!=null&&kids[i]!==undefined) named[f]=unwrap(kids[i]); });
            return { val: h({ named, pos: kids.map(unwrap) }) }; }
    const vals = kids.filter(c=>'val' in c);
    return { val: vals.length===1 ? vals[0].val : kids.map(unwrap) };
  };
}
const handlers = {
  Add:({named})=>named.left+named.right, Sub:({named})=>named.left-named.right,
  Mul:({named})=>named.left*named.right, Div:({named})=>named.left/named.right,
  Paren:({named})=>named.inner, Num:({named})=>parseFloat(named.value.text),
};
const src = readFileSync(new URL('../examples/calc-eval.grmk.md', import.meta.url),'utf8');
for (const input of ['1+2*3','(1+2)*3','10-2-3','6/2/3','1.5+2.5','2*3+4*5']){
  const r = evaluate({ source: src, input });
  const meta = JSON.parse(r.meta);
  const cst = JSON.parse(r.cstJson);
  const fold = makeFold(meta);
  console.log(input, '=', unwrap(fold(cst, handlers)));
}
