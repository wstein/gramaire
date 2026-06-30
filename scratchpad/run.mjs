import { evaluate, labels } from './calceval.mjs';
const num = (t) => ({ rule: 7, children: [{ token: "NUMBER", text: t }] });
const fac = (n) => ({ rule: 5, children: [n] });           // Term -> Factor passthrough
const trm = (f) => ({ rule: 2, children: [f] });           // Expr -> Term passthrough
// 1 + 2*3
const cst = { rule: 0, children: [                          // Add
  trm(fac(num("1"))),
  { token: "+", text: "+" },
  { rule: 3, children: [                                    // Mul
    fac(num("2")),
    { token: "*", text: "*" },
    num("3"),
  ]},
]};
const handlers = {
  Add: ({named}) => named.left + named.right,
  Sub: ({named}) => named.left - named.right,
  Mul: ({named}) => named.left * named.right,
  Div: ({named}) => named.left / named.right,
  Paren: ({named}) => named.inner,
  Num: ({named}) => parseFloat(named.value.text),
};
console.log("labels:", JSON.stringify(labels));
console.log("1+2*3 =", evaluate(cst, handlers));
