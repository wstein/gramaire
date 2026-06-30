// ../output/Data.Array/foreign.js
var rangeImpl = function(start, end) {
  var step = start > end ? -1 : 1;
  var result = new Array(step * (end - start) + 1);
  var i = start, n = 0;
  while (i !== end) {
    result[n++] = i;
    i += step;
  }
  result[n] = i;
  return result;
};
var replicateFill = function(count, value) {
  if (count < 1) {
    return [];
  }
  var result = new Array(count);
  return result.fill(value);
};
var replicatePolyfill = function(count, value) {
  var result = [];
  var n = 0;
  for (var i = 0; i < count; i++) {
    result[n++] = value;
  }
  return result;
};
var replicateImpl = typeof Array.prototype.fill === "function" ? replicateFill : replicatePolyfill;
var fromFoldableImpl = /* @__PURE__ */ (function() {
  function Cons2(head2, tail) {
    this.head = head2;
    this.tail = tail;
  }
  var emptyList = {};
  function curryCons(head2) {
    return function(tail) {
      return new Cons2(head2, tail);
    };
  }
  function listToArray(list) {
    var result = [];
    var count = 0;
    var xs = list;
    while (xs !== emptyList) {
      result[count++] = xs.head;
      xs = xs.tail;
    }
    return result;
  }
  return function(foldr3, xs) {
    return listToArray(foldr3(curryCons)(emptyList)(xs));
  };
})();
var length = function(xs) {
  return xs.length;
};
var unconsImpl = function(empty4, next, xs) {
  return xs.length === 0 ? empty4({}) : next(xs[0])(xs.slice(1));
};
var indexImpl = function(just, nothing, xs, i) {
  return i < 0 || i >= xs.length ? nothing : just(xs[i]);
};
var findMapImpl = function(nothing, isJust2, f, xs) {
  for (var i = 0; i < xs.length; i++) {
    var result = f(xs[i]);
    if (isJust2(result)) return result;
  }
  return nothing;
};
var findIndexImpl = function(just, nothing, f, xs) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (f(xs[i])) return just(i);
  }
  return nothing;
};
var _updateAt = function(just, nothing, i, a, l) {
  if (i < 0 || i >= l.length) return nothing;
  var l1 = l.slice();
  l1[i] = a;
  return just(l1);
};
var reverse = function(l) {
  return l.slice().reverse();
};
var concat = function(xss) {
  if (xss.length <= 1e4) {
    return Array.prototype.concat.apply([], xss);
  }
  var result = [];
  for (var i = 0, l = xss.length; i < l; i++) {
    var xs = xss[i];
    for (var j = 0, m = xs.length; j < m; j++) {
      result.push(xs[j]);
    }
  }
  return result;
};
var filterImpl = function(f, xs) {
  return xs.filter(f);
};
var sortByImpl = /* @__PURE__ */ (function() {
  function mergeFromTo(compare4, fromOrdering, xs1, xs2, from, to) {
    var mid;
    var i;
    var j;
    var k;
    var x;
    var y;
    var c;
    mid = from + (to - from >> 1);
    if (mid - from > 1) mergeFromTo(compare4, fromOrdering, xs2, xs1, from, mid);
    if (to - mid > 1) mergeFromTo(compare4, fromOrdering, xs2, xs1, mid, to);
    i = from;
    j = mid;
    k = from;
    while (i < mid && j < to) {
      x = xs2[i];
      y = xs2[j];
      c = fromOrdering(compare4(x)(y));
      if (c > 0) {
        xs1[k++] = y;
        ++j;
      } else {
        xs1[k++] = x;
        ++i;
      }
    }
    while (i < mid) {
      xs1[k++] = xs2[i++];
    }
    while (j < to) {
      xs1[k++] = xs2[j++];
    }
  }
  return function(compare4, fromOrdering, xs) {
    var out;
    if (xs.length < 2) return xs;
    out = xs.slice(0);
    mergeFromTo(compare4, fromOrdering, out, xs.slice(0), 0, xs.length);
    return out;
  };
})();
var sliceImpl = function(s, e, l) {
  return l.slice(s, e);
};
var anyImpl = function(p, xs) {
  var len = xs.length;
  for (var i = 0; i < len; i++) {
    if (p(xs[i])) return true;
  }
  return false;
};
var allImpl = function(p, xs) {
  var len = xs.length;
  for (var i = 0; i < len; i++) {
    if (!p(xs[i])) return false;
  }
  return true;
};
var unsafeIndexImpl = function(xs, n) {
  return xs[n];
};

// ../output/Data.Functor/foreign.js
var arrayMap = function(f) {
  return function(arr) {
    var l = arr.length;
    var result = new Array(l);
    for (var i = 0; i < l; i++) {
      result[i] = f(arr[i]);
    }
    return result;
  };
};

// ../output/Control.Semigroupoid/index.js
var semigroupoidFn = {
  compose: function(f) {
    return function(g) {
      return function(x) {
        return f(g(x));
      };
    };
  }
};

// ../output/Control.Category/index.js
var identity = function(dict) {
  return dict.identity;
};
var categoryFn = {
  identity: function(x) {
    return x;
  },
  Semigroupoid0: function() {
    return semigroupoidFn;
  }
};

// ../output/Data.Boolean/index.js
var otherwise = true;

// ../output/Data.Function/index.js
var flip = function(f) {
  return function(b) {
    return function(a) {
      return f(a)(b);
    };
  };
};
var $$const = function(a) {
  return function(v) {
    return a;
  };
};

// ../output/Data.Unit/foreign.js
var unit = void 0;

// ../output/Type.Proxy/index.js
var $$Proxy = /* @__PURE__ */ (function() {
  function $$Proxy2() {
  }
  ;
  $$Proxy2.value = new $$Proxy2();
  return $$Proxy2;
})();

// ../output/Data.Functor/index.js
var map = function(dict) {
  return dict.map;
};
var mapFlipped = function(dictFunctor) {
  var map112 = map(dictFunctor);
  return function(fa) {
    return function(f) {
      return map112(f)(fa);
    };
  };
};
var $$void = function(dictFunctor) {
  return map(dictFunctor)($$const(unit));
};
var functorArray = {
  map: arrayMap
};

// ../output/Data.Semigroup/foreign.js
var concatString = function(s1) {
  return function(s2) {
    return s1 + s2;
  };
};
var concatArray = function(xs) {
  return function(ys) {
    if (xs.length === 0) return ys;
    if (ys.length === 0) return xs;
    return xs.concat(ys);
  };
};

// ../output/Data.Symbol/index.js
var reflectSymbol = function(dict) {
  return dict.reflectSymbol;
};

// ../output/Record.Unsafe/foreign.js
var unsafeGet = function(label) {
  return function(rec) {
    return rec[label];
  };
};

// ../output/Data.Semigroup/index.js
var semigroupString = {
  append: concatString
};
var semigroupArray = {
  append: concatArray
};
var append = function(dict) {
  return dict.append;
};

// ../output/Control.Apply/foreign.js
var arrayApply = function(fs) {
  return function(xs) {
    var l = fs.length;
    var k = xs.length;
    var result = new Array(l * k);
    var n = 0;
    for (var i = 0; i < l; i++) {
      var f = fs[i];
      for (var j = 0; j < k; j++) {
        result[n++] = f(xs[j]);
      }
    }
    return result;
  };
};

// ../output/Control.Apply/index.js
var applyArray = {
  apply: arrayApply,
  Functor0: function() {
    return functorArray;
  }
};
var apply = function(dict) {
  return dict.apply;
};

// ../output/Control.Applicative/index.js
var pure = function(dict) {
  return dict.pure;
};
var when = function(dictApplicative) {
  var pure1 = pure(dictApplicative);
  return function(v) {
    return function(v1) {
      if (v) {
        return v1;
      }
      ;
      if (!v) {
        return pure1(unit);
      }
      ;
      throw new Error("Failed pattern match at Control.Applicative (line 63, column 1 - line 63, column 63): " + [v.constructor.name, v1.constructor.name]);
    };
  };
};

// ../output/Control.Bind/foreign.js
var arrayBind = typeof Array.prototype.flatMap === "function" ? function(arr) {
  return function(f) {
    return arr.flatMap(f);
  };
} : function(arr) {
  return function(f) {
    var result = [];
    var l = arr.length;
    for (var i = 0; i < l; i++) {
      var xs = f(arr[i]);
      var k = xs.length;
      for (var j = 0; j < k; j++) {
        result.push(xs[j]);
      }
    }
    return result;
  };
};

// ../output/Control.Bind/index.js
var bindArray = {
  bind: arrayBind,
  Apply0: function() {
    return applyArray;
  }
};
var bind = function(dict) {
  return dict.bind;
};

// ../output/Control.Monad/index.js
var ap = function(dictMonad) {
  var bind7 = bind(dictMonad.Bind1());
  var pure4 = pure(dictMonad.Applicative0());
  return function(f) {
    return function(a) {
      return bind7(f)(function(f$prime) {
        return bind7(a)(function(a$prime) {
          return pure4(f$prime(a$prime));
        });
      });
    };
  };
};

// ../output/Data.Bounded/foreign.js
var topChar = String.fromCharCode(65535);
var bottomChar = String.fromCharCode(0);
var topNumber = Number.POSITIVE_INFINITY;
var bottomNumber = Number.NEGATIVE_INFINITY;

// ../output/Data.Ord/foreign.js
var unsafeCompareImpl = function(lt) {
  return function(eq8) {
    return function(gt) {
      return function(x) {
        return function(y) {
          return x < y ? lt : x === y ? eq8 : gt;
        };
      };
    };
  };
};
var ordIntImpl = unsafeCompareImpl;
var ordStringImpl = unsafeCompareImpl;
var ordCharImpl = unsafeCompareImpl;
var ordArrayImpl = function(f) {
  return function(xs) {
    return function(ys) {
      var i = 0;
      var xlen = xs.length;
      var ylen = ys.length;
      while (i < xlen && i < ylen) {
        var x = xs[i];
        var y = ys[i];
        var o = f(x)(y);
        if (o !== 0) {
          return o;
        }
        i++;
      }
      if (xlen === ylen) {
        return 0;
      } else if (xlen > ylen) {
        return -1;
      } else {
        return 1;
      }
    };
  };
};

// ../output/Data.Eq/foreign.js
var refEq = function(r1) {
  return function(r2) {
    return r1 === r2;
  };
};
var eqBooleanImpl = refEq;
var eqIntImpl = refEq;
var eqCharImpl = refEq;
var eqStringImpl = refEq;
var eqArrayImpl = function(f) {
  return function(xs) {
    return function(ys) {
      if (xs.length !== ys.length) return false;
      for (var i = 0; i < xs.length; i++) {
        if (!f(xs[i])(ys[i])) return false;
      }
      return true;
    };
  };
};

// ../output/Data.Eq/index.js
var eqUnit = {
  eq: function(v) {
    return function(v1) {
      return true;
    };
  }
};
var eqString = {
  eq: eqStringImpl
};
var eqRowNil = {
  eqRecord: function(v) {
    return function(v1) {
      return function(v2) {
        return true;
      };
    };
  }
};
var eqRecord = function(dict) {
  return dict.eqRecord;
};
var eqRec = function() {
  return function(dictEqRecord) {
    return {
      eq: eqRecord(dictEqRecord)($$Proxy.value)
    };
  };
};
var eqInt = {
  eq: eqIntImpl
};
var eqChar = {
  eq: eqCharImpl
};
var eqBoolean = {
  eq: eqBooleanImpl
};
var eq1 = function(dict) {
  return dict.eq1;
};
var eq = function(dict) {
  return dict.eq;
};
var eq2 = /* @__PURE__ */ eq(eqBoolean);
var eqArray = function(dictEq) {
  return {
    eq: eqArrayImpl(eq(dictEq))
  };
};
var eqRowCons = function(dictEqRecord) {
  var eqRecord1 = eqRecord(dictEqRecord);
  return function() {
    return function(dictIsSymbol) {
      var reflectSymbol2 = reflectSymbol(dictIsSymbol);
      return function(dictEq) {
        var eq33 = eq(dictEq);
        return {
          eqRecord: function(v) {
            return function(ra) {
              return function(rb) {
                var tail = eqRecord1($$Proxy.value)(ra)(rb);
                var key = reflectSymbol2($$Proxy.value);
                var get = unsafeGet(key);
                return eq33(get(ra))(get(rb)) && tail;
              };
            };
          }
        };
      };
    };
  };
};
var notEq = function(dictEq) {
  var eq33 = eq(dictEq);
  return function(x) {
    return function(y) {
      return eq2(eq33(x)(y))(false);
    };
  };
};

// ../output/Data.Ordering/index.js
var LT = /* @__PURE__ */ (function() {
  function LT2() {
  }
  ;
  LT2.value = new LT2();
  return LT2;
})();
var GT = /* @__PURE__ */ (function() {
  function GT2() {
  }
  ;
  GT2.value = new GT2();
  return GT2;
})();
var EQ = /* @__PURE__ */ (function() {
  function EQ2() {
  }
  ;
  EQ2.value = new EQ2();
  return EQ2;
})();
var eqOrdering = {
  eq: function(v) {
    return function(v1) {
      if (v instanceof LT && v1 instanceof LT) {
        return true;
      }
      ;
      if (v instanceof GT && v1 instanceof GT) {
        return true;
      }
      ;
      if (v instanceof EQ && v1 instanceof EQ) {
        return true;
      }
      ;
      return false;
    };
  }
};

// ../output/Data.Ring/foreign.js
var intSub = function(x) {
  return function(y) {
    return x - y | 0;
  };
};

// ../output/Data.Semiring/foreign.js
var intAdd = function(x) {
  return function(y) {
    return x + y | 0;
  };
};
var intMul = function(x) {
  return function(y) {
    return x * y | 0;
  };
};

// ../output/Data.Semiring/index.js
var semiringInt = {
  add: intAdd,
  zero: 0,
  mul: intMul,
  one: 1
};
var add = function(dict) {
  return dict.add;
};

// ../output/Data.Ring/index.js
var ringInt = {
  sub: intSub,
  Semiring0: function() {
    return semiringInt;
  }
};

// ../output/Data.Ord/index.js
var eqRec2 = /* @__PURE__ */ eqRec();
var notEq2 = /* @__PURE__ */ notEq(eqOrdering);
var ordString = /* @__PURE__ */ (function() {
  return {
    compare: ordStringImpl(LT.value)(EQ.value)(GT.value),
    Eq0: function() {
      return eqString;
    }
  };
})();
var ordRecordNil = {
  compareRecord: function(v) {
    return function(v1) {
      return function(v2) {
        return EQ.value;
      };
    };
  },
  EqRecord0: function() {
    return eqRowNil;
  }
};
var ordInt = /* @__PURE__ */ (function() {
  return {
    compare: ordIntImpl(LT.value)(EQ.value)(GT.value),
    Eq0: function() {
      return eqInt;
    }
  };
})();
var ordChar = /* @__PURE__ */ (function() {
  return {
    compare: ordCharImpl(LT.value)(EQ.value)(GT.value),
    Eq0: function() {
      return eqChar;
    }
  };
})();
var compareRecord = function(dict) {
  return dict.compareRecord;
};
var ordRecord = function() {
  return function(dictOrdRecord) {
    var eqRec1 = eqRec2(dictOrdRecord.EqRecord0());
    return {
      compare: compareRecord(dictOrdRecord)($$Proxy.value),
      Eq0: function() {
        return eqRec1;
      }
    };
  };
};
var compare1 = function(dict) {
  return dict.compare1;
};
var compare = function(dict) {
  return dict.compare;
};
var compare2 = /* @__PURE__ */ compare(ordInt);
var comparing = function(dictOrd) {
  var compare32 = compare(dictOrd);
  return function(f) {
    return function(x) {
      return function(y) {
        return compare32(f(x))(f(y));
      };
    };
  };
};
var max = function(dictOrd) {
  var compare32 = compare(dictOrd);
  return function(x) {
    return function(y) {
      var v = compare32(x)(y);
      if (v instanceof LT) {
        return y;
      }
      ;
      if (v instanceof EQ) {
        return x;
      }
      ;
      if (v instanceof GT) {
        return x;
      }
      ;
      throw new Error("Failed pattern match at Data.Ord (line 181, column 3 - line 184, column 12): " + [v.constructor.name]);
    };
  };
};
var ordArray = function(dictOrd) {
  var compare32 = compare(dictOrd);
  var eqArray2 = eqArray(dictOrd.Eq0());
  return {
    compare: /* @__PURE__ */ (function() {
      var toDelta = function(x) {
        return function(y) {
          var v = compare32(x)(y);
          if (v instanceof EQ) {
            return 0;
          }
          ;
          if (v instanceof LT) {
            return 1;
          }
          ;
          if (v instanceof GT) {
            return -1 | 0;
          }
          ;
          throw new Error("Failed pattern match at Data.Ord (line 79, column 7 - line 82, column 17): " + [v.constructor.name]);
        };
      };
      return function(xs) {
        return function(ys) {
          return compare2(0)(ordArrayImpl(toDelta)(xs)(ys));
        };
      };
    })(),
    Eq0: function() {
      return eqArray2;
    }
  };
};
var ordRecordCons = function(dictOrdRecord) {
  var compareRecord1 = compareRecord(dictOrdRecord);
  var eqRowCons2 = eqRowCons(dictOrdRecord.EqRecord0())();
  return function() {
    return function(dictIsSymbol) {
      var reflectSymbol2 = reflectSymbol(dictIsSymbol);
      var eqRowCons1 = eqRowCons2(dictIsSymbol);
      return function(dictOrd) {
        var compare32 = compare(dictOrd);
        var eqRowCons22 = eqRowCons1(dictOrd.Eq0());
        return {
          compareRecord: function(v) {
            return function(ra) {
              return function(rb) {
                var key = reflectSymbol2($$Proxy.value);
                var left = compare32(unsafeGet(key)(ra))(unsafeGet(key)(rb));
                var $95 = notEq2(left)(EQ.value);
                if ($95) {
                  return left;
                }
                ;
                return compareRecord1($$Proxy.value)(ra)(rb);
              };
            };
          },
          EqRecord0: function() {
            return eqRowCons22;
          }
        };
      };
    };
  };
};

// ../output/Data.Bounded/index.js
var top = function(dict) {
  return dict.top;
};
var boundedChar = {
  top: topChar,
  bottom: bottomChar,
  Ord0: function() {
    return ordChar;
  }
};
var bottom = function(dict) {
  return dict.bottom;
};

// ../output/Data.Show/foreign.js
var showIntImpl = function(n) {
  return n.toString();
};
var showCharImpl = function(c) {
  var code = c.charCodeAt(0);
  if (code < 32 || code === 127) {
    switch (c) {
      case "\x07":
        return "'\\a'";
      case "\b":
        return "'\\b'";
      case "\f":
        return "'\\f'";
      case "\n":
        return "'\\n'";
      case "\r":
        return "'\\r'";
      case "	":
        return "'\\t'";
      case "\v":
        return "'\\v'";
    }
    return "'\\" + code.toString(10) + "'";
  }
  return c === "'" || c === "\\" ? "'\\" + c + "'" : "'" + c + "'";
};
var showStringImpl = function(s) {
  var l = s.length;
  return '"' + s.replace(
    /[\0-\x1F\x7F"\\]/g,
    // eslint-disable-line no-control-regex
    function(c, i) {
      switch (c) {
        case '"':
        case "\\":
          return "\\" + c;
        case "\x07":
          return "\\a";
        case "\b":
          return "\\b";
        case "\f":
          return "\\f";
        case "\n":
          return "\\n";
        case "\r":
          return "\\r";
        case "	":
          return "\\t";
        case "\v":
          return "\\v";
      }
      var k = i + 1;
      var empty4 = k < l && s[k] >= "0" && s[k] <= "9" ? "\\&" : "";
      return "\\" + c.charCodeAt(0).toString(10) + empty4;
    }
  ) + '"';
};

// ../output/Data.Show/index.js
var showString = {
  show: showStringImpl
};
var showInt = {
  show: showIntImpl
};
var showChar = {
  show: showCharImpl
};
var show = function(dict) {
  return dict.show;
};

// ../output/Data.Maybe/index.js
var identity2 = /* @__PURE__ */ identity(categoryFn);
var Nothing = /* @__PURE__ */ (function() {
  function Nothing2() {
  }
  ;
  Nothing2.value = new Nothing2();
  return Nothing2;
})();
var Just = /* @__PURE__ */ (function() {
  function Just2(value0) {
    this.value0 = value0;
  }
  ;
  Just2.create = function(value0) {
    return new Just2(value0);
  };
  return Just2;
})();
var showMaybe = function(dictShow) {
  var show10 = show(dictShow);
  return {
    show: function(v) {
      if (v instanceof Just) {
        return "(Just " + (show10(v.value0) + ")");
      }
      ;
      if (v instanceof Nothing) {
        return "Nothing";
      }
      ;
      throw new Error("Failed pattern match at Data.Maybe (line 223, column 1 - line 225, column 28): " + [v.constructor.name]);
    }
  };
};
var maybe = function(v) {
  return function(v1) {
    return function(v2) {
      if (v2 instanceof Nothing) {
        return v;
      }
      ;
      if (v2 instanceof Just) {
        return v1(v2.value0);
      }
      ;
      throw new Error("Failed pattern match at Data.Maybe (line 237, column 1 - line 237, column 51): " + [v.constructor.name, v1.constructor.name, v2.constructor.name]);
    };
  };
};
var isNothing = /* @__PURE__ */ maybe(true)(/* @__PURE__ */ $$const(false));
var isJust = /* @__PURE__ */ maybe(false)(/* @__PURE__ */ $$const(true));
var functorMaybe = {
  map: function(v) {
    return function(v1) {
      if (v1 instanceof Just) {
        return new Just(v(v1.value0));
      }
      ;
      return Nothing.value;
    };
  }
};
var map2 = /* @__PURE__ */ map(functorMaybe);
var fromMaybe = function(a) {
  return maybe(a)(identity2);
};
var fromJust = function() {
  return function(v) {
    if (v instanceof Just) {
      return v.value0;
    }
    ;
    throw new Error("Failed pattern match at Data.Maybe (line 288, column 1 - line 288, column 46): " + [v.constructor.name]);
  };
};
var eqMaybe = function(dictEq) {
  var eq8 = eq(dictEq);
  return {
    eq: function(x) {
      return function(y) {
        if (x instanceof Nothing && y instanceof Nothing) {
          return true;
        }
        ;
        if (x instanceof Just && y instanceof Just) {
          return eq8(x.value0)(y.value0);
        }
        ;
        return false;
      };
    }
  };
};
var applyMaybe = {
  apply: function(v) {
    return function(v1) {
      if (v instanceof Just) {
        return map2(v.value0)(v1);
      }
      ;
      if (v instanceof Nothing) {
        return Nothing.value;
      }
      ;
      throw new Error("Failed pattern match at Data.Maybe (line 67, column 1 - line 69, column 30): " + [v.constructor.name, v1.constructor.name]);
    };
  },
  Functor0: function() {
    return functorMaybe;
  }
};
var bindMaybe = {
  bind: function(v) {
    return function(v1) {
      if (v instanceof Just) {
        return v1(v.value0);
      }
      ;
      if (v instanceof Nothing) {
        return Nothing.value;
      }
      ;
      throw new Error("Failed pattern match at Data.Maybe (line 125, column 1 - line 127, column 28): " + [v.constructor.name, v1.constructor.name]);
    };
  },
  Apply0: function() {
    return applyMaybe;
  }
};

// ../output/Data.Either/index.js
var Left = /* @__PURE__ */ (function() {
  function Left2(value0) {
    this.value0 = value0;
  }
  ;
  Left2.create = function(value0) {
    return new Left2(value0);
  };
  return Left2;
})();
var Right = /* @__PURE__ */ (function() {
  function Right2(value0) {
    this.value0 = value0;
  }
  ;
  Right2.create = function(value0) {
    return new Right2(value0);
  };
  return Right2;
})();
var functorEither = {
  map: function(f) {
    return function(m) {
      if (m instanceof Left) {
        return new Left(m.value0);
      }
      ;
      if (m instanceof Right) {
        return new Right(f(m.value0));
      }
      ;
      throw new Error("Failed pattern match at Data.Either (line 0, column 0 - line 0, column 0): " + [m.constructor.name]);
    };
  }
};
var map3 = /* @__PURE__ */ map(functorEither);
var fromRight = function(v) {
  return function(v1) {
    if (v1 instanceof Right) {
      return v1.value0;
    }
    ;
    return v;
  };
};
var either = function(v) {
  return function(v1) {
    return function(v2) {
      if (v2 instanceof Left) {
        return v(v2.value0);
      }
      ;
      if (v2 instanceof Right) {
        return v1(v2.value0);
      }
      ;
      throw new Error("Failed pattern match at Data.Either (line 208, column 1 - line 208, column 64): " + [v.constructor.name, v1.constructor.name, v2.constructor.name]);
    };
  };
};
var applyEither = {
  apply: function(v) {
    return function(v1) {
      if (v instanceof Left) {
        return new Left(v.value0);
      }
      ;
      if (v instanceof Right) {
        return map3(v.value0)(v1);
      }
      ;
      throw new Error("Failed pattern match at Data.Either (line 70, column 1 - line 72, column 30): " + [v.constructor.name, v1.constructor.name]);
    };
  },
  Functor0: function() {
    return functorEither;
  }
};
var bindEither = {
  bind: /* @__PURE__ */ either(function(e) {
    return function(v) {
      return new Left(e);
    };
  })(function(a) {
    return function(f) {
      return f(a);
    };
  }),
  Apply0: function() {
    return applyEither;
  }
};
var applicativeEither = /* @__PURE__ */ (function() {
  return {
    pure: Right.create,
    Apply0: function() {
      return applyEither;
    }
  };
})();

// ../output/Data.EuclideanRing/foreign.js
var intDegree = function(x) {
  return Math.min(Math.abs(x), 2147483647);
};
var intDiv = function(x) {
  return function(y) {
    if (y === 0) return 0;
    return y > 0 ? Math.floor(x / y) : -Math.floor(x / -y);
  };
};
var intMod = function(x) {
  return function(y) {
    if (y === 0) return 0;
    var yy = Math.abs(y);
    return (x % yy + yy) % yy;
  };
};

// ../output/Data.CommutativeRing/index.js
var commutativeRingInt = {
  Ring0: function() {
    return ringInt;
  }
};

// ../output/Data.EuclideanRing/index.js
var mod = function(dict) {
  return dict.mod;
};
var euclideanRingInt = {
  degree: intDegree,
  div: intDiv,
  mod: intMod,
  CommutativeRing0: function() {
    return commutativeRingInt;
  }
};
var div = function(dict) {
  return dict.div;
};

// ../output/Data.Monoid/index.js
var monoidString = {
  mempty: "",
  Semigroup0: function() {
    return semigroupString;
  }
};
var mempty = function(dict) {
  return dict.mempty;
};

// ../output/Control.Monad.ST.Internal/foreign.js
var map_ = function(f) {
  return function(a) {
    return function() {
      return f(a());
    };
  };
};
var pure_ = function(a) {
  return function() {
    return a;
  };
};
var bind_ = function(a) {
  return function(f) {
    return function() {
      return f(a())();
    };
  };
};
var foreach = function(as) {
  return function(f) {
    return function() {
      for (var i = 0, l = as.length; i < l; i++) {
        f(as[i])();
      }
    };
  };
};

// ../output/Control.Monad.ST.Internal/index.js
var $runtime_lazy = function(name, moduleName, init) {
  var state = 0;
  var val;
  return function(lineNumber) {
    if (state === 2) return val;
    if (state === 1) throw new ReferenceError(name + " was needed before it finished initializing (module " + moduleName + ", line " + lineNumber + ")", moduleName, lineNumber);
    state = 1;
    val = init();
    state = 2;
    return val;
  };
};
var functorST = {
  map: map_
};
var monadST = {
  Applicative0: function() {
    return applicativeST;
  },
  Bind1: function() {
    return bindST;
  }
};
var bindST = {
  bind: bind_,
  Apply0: function() {
    return $lazy_applyST(0);
  }
};
var applicativeST = {
  pure: pure_,
  Apply0: function() {
    return $lazy_applyST(0);
  }
};
var $lazy_applyST = /* @__PURE__ */ $runtime_lazy("applyST", "Control.Monad.ST.Internal", function() {
  return {
    apply: ap(monadST),
    Functor0: function() {
      return functorST;
    }
  };
});

// ../output/Data.Array.ST/foreign.js
function newSTArray() {
  return [];
}
function unsafeFreezeThawImpl(xs) {
  return xs;
}
var unsafeFreezeImpl = unsafeFreezeThawImpl;
var unsafeThawImpl = unsafeFreezeThawImpl;
function copyImpl(xs) {
  return xs.slice();
}
var thawImpl = copyImpl;
var pushImpl = function(a, xs) {
  return xs.push(a);
};

// ../output/Control.Monad.ST.Uncurried/foreign.js
var runSTFn1 = function runSTFn12(fn) {
  return function(a) {
    return function() {
      return fn(a);
    };
  };
};
var runSTFn2 = function runSTFn22(fn) {
  return function(a) {
    return function(b) {
      return function() {
        return fn(a, b);
      };
    };
  };
};

// ../output/Data.Array.ST/index.js
var unsafeThaw = /* @__PURE__ */ runSTFn1(unsafeThawImpl);
var unsafeFreeze = /* @__PURE__ */ runSTFn1(unsafeFreezeImpl);
var thaw = /* @__PURE__ */ runSTFn1(thawImpl);
var withArray = function(f) {
  return function(xs) {
    return function __do() {
      var result = thaw(xs)();
      f(result)();
      return unsafeFreeze(result)();
    };
  };
};
var push = /* @__PURE__ */ runSTFn2(pushImpl);

// ../output/Data.HeytingAlgebra/foreign.js
var boolConj = function(b1) {
  return function(b2) {
    return b1 && b2;
  };
};
var boolDisj = function(b1) {
  return function(b2) {
    return b1 || b2;
  };
};
var boolNot = function(b) {
  return !b;
};

// ../output/Data.HeytingAlgebra/index.js
var tt = function(dict) {
  return dict.tt;
};
var not = function(dict) {
  return dict.not;
};
var ff = function(dict) {
  return dict.ff;
};
var disj = function(dict) {
  return dict.disj;
};
var heytingAlgebraBoolean = {
  ff: false,
  tt: true,
  implies: function(a) {
    return function(b) {
      return disj(heytingAlgebraBoolean)(not(heytingAlgebraBoolean)(a))(b);
    };
  },
  conj: boolConj,
  disj: boolDisj,
  not: boolNot
};
var conj = function(dict) {
  return dict.conj;
};

// ../output/Data.Foldable/foreign.js
var foldrArray = function(f) {
  return function(init) {
    return function(xs) {
      var acc = init;
      var len = xs.length;
      for (var i = len - 1; i >= 0; i--) {
        acc = f(xs[i])(acc);
      }
      return acc;
    };
  };
};
var foldlArray = function(f) {
  return function(init) {
    return function(xs) {
      var acc = init;
      var len = xs.length;
      for (var i = 0; i < len; i++) {
        acc = f(acc)(xs[i]);
      }
      return acc;
    };
  };
};

// ../output/Data.Tuple/index.js
var Tuple = /* @__PURE__ */ (function() {
  function Tuple2(value0, value1) {
    this.value0 = value0;
    this.value1 = value1;
  }
  ;
  Tuple2.create = function(value0) {
    return function(value1) {
      return new Tuple2(value0, value1);
    };
  };
  return Tuple2;
})();
var snd = function(v) {
  return v.value1;
};
var fst = function(v) {
  return v.value0;
};
var eqTuple = function(dictEq) {
  var eq8 = eq(dictEq);
  return function(dictEq1) {
    var eq13 = eq(dictEq1);
    return {
      eq: function(x) {
        return function(y) {
          return eq8(x.value0)(y.value0) && eq13(x.value1)(y.value1);
        };
      }
    };
  };
};
var ordTuple = function(dictOrd) {
  var compare4 = compare(dictOrd);
  var eqTuple1 = eqTuple(dictOrd.Eq0());
  return function(dictOrd1) {
    var compare13 = compare(dictOrd1);
    var eqTuple2 = eqTuple1(dictOrd1.Eq0());
    return {
      compare: function(x) {
        return function(y) {
          var v = compare4(x.value0)(y.value0);
          if (v instanceof LT) {
            return LT.value;
          }
          ;
          if (v instanceof GT) {
            return GT.value;
          }
          ;
          return compare13(x.value1)(y.value1);
        };
      },
      Eq0: function() {
        return eqTuple2;
      }
    };
  };
};

// ../output/Data.Monoid.Conj/index.js
var Conj = function(x) {
  return x;
};
var semigroupConj = function(dictHeytingAlgebra) {
  var conj2 = conj(dictHeytingAlgebra);
  return {
    append: function(v) {
      return function(v1) {
        return conj2(v)(v1);
      };
    }
  };
};
var monoidConj = function(dictHeytingAlgebra) {
  var semigroupConj1 = semigroupConj(dictHeytingAlgebra);
  return {
    mempty: tt(dictHeytingAlgebra),
    Semigroup0: function() {
      return semigroupConj1;
    }
  };
};

// ../output/Data.Monoid.Disj/index.js
var Disj = function(x) {
  return x;
};
var semigroupDisj = function(dictHeytingAlgebra) {
  var disj3 = disj(dictHeytingAlgebra);
  return {
    append: function(v) {
      return function(v1) {
        return disj3(v)(v1);
      };
    }
  };
};
var monoidDisj = function(dictHeytingAlgebra) {
  var semigroupDisj1 = semigroupDisj(dictHeytingAlgebra);
  return {
    mempty: ff(dictHeytingAlgebra),
    Semigroup0: function() {
      return semigroupDisj1;
    }
  };
};

// ../output/Unsafe.Coerce/foreign.js
var unsafeCoerce2 = function(x) {
  return x;
};

// ../output/Safe.Coerce/index.js
var coerce = function() {
  return unsafeCoerce2;
};

// ../output/Data.Newtype/index.js
var coerce2 = /* @__PURE__ */ coerce();
var alaF = function() {
  return function() {
    return function() {
      return function() {
        return function(v) {
          return coerce2;
        };
      };
    };
  };
};

// ../output/Data.Foldable/index.js
var alaF2 = /* @__PURE__ */ alaF()()()();
var foldr = function(dict) {
  return dict.foldr;
};
var foldl = function(dict) {
  return dict.foldl;
};
var foldMapDefaultR = function(dictFoldable) {
  var foldr22 = foldr(dictFoldable);
  return function(dictMonoid) {
    var append6 = append(dictMonoid.Semigroup0());
    var mempty2 = mempty(dictMonoid);
    return function(f) {
      return foldr22(function(x) {
        return function(acc) {
          return append6(f(x))(acc);
        };
      })(mempty2);
    };
  };
};
var foldableArray = {
  foldr: foldrArray,
  foldl: foldlArray,
  foldMap: function(dictMonoid) {
    return foldMapDefaultR(foldableArray)(dictMonoid);
  }
};
var foldMap = function(dict) {
  return dict.foldMap;
};
var any = function(dictFoldable) {
  var foldMap22 = foldMap(dictFoldable);
  return function(dictHeytingAlgebra) {
    return alaF2(Disj)(foldMap22(monoidDisj(dictHeytingAlgebra)));
  };
};
var all = function(dictFoldable) {
  var foldMap22 = foldMap(dictFoldable);
  return function(dictHeytingAlgebra) {
    return alaF2(Conj)(foldMap22(monoidConj(dictHeytingAlgebra)));
  };
};

// ../output/Data.Function.Uncurried/foreign.js
var runFn2 = function(fn) {
  return function(a) {
    return function(b) {
      return fn(a, b);
    };
  };
};
var runFn3 = function(fn) {
  return function(a) {
    return function(b) {
      return function(c) {
        return fn(a, b, c);
      };
    };
  };
};
var runFn4 = function(fn) {
  return function(a) {
    return function(b) {
      return function(c) {
        return function(d) {
          return fn(a, b, c, d);
        };
      };
    };
  };
};
var runFn5 = function(fn) {
  return function(a) {
    return function(b) {
      return function(c) {
        return function(d) {
          return function(e) {
            return fn(a, b, c, d, e);
          };
        };
      };
    };
  };
};

// ../output/Data.FunctorWithIndex/foreign.js
var mapWithIndexArray = function(f) {
  return function(xs) {
    var l = xs.length;
    var result = Array(l);
    for (var i = 0; i < l; i++) {
      result[i] = f(i)(xs[i]);
    }
    return result;
  };
};

// ../output/Data.FunctorWithIndex/index.js
var mapWithIndex = function(dict) {
  return dict.mapWithIndex;
};
var functorWithIndexArray = {
  mapWithIndex: mapWithIndexArray,
  Functor0: function() {
    return functorArray;
  }
};

// ../output/Data.Traversable/foreign.js
var traverseArrayImpl = /* @__PURE__ */ (function() {
  function array1(a) {
    return [a];
  }
  function array2(a) {
    return function(b) {
      return [a, b];
    };
  }
  function array3(a) {
    return function(b) {
      return function(c) {
        return [a, b, c];
      };
    };
  }
  function concat2(xs) {
    return function(ys) {
      return xs.concat(ys);
    };
  }
  return function(apply2) {
    return function(map26) {
      return function(pure4) {
        return function(f) {
          return function(array) {
            function go(bot, top2) {
              switch (top2 - bot) {
                case 0:
                  return pure4([]);
                case 1:
                  return map26(array1)(f(array[bot]));
                case 2:
                  return apply2(map26(array2)(f(array[bot])))(f(array[bot + 1]));
                case 3:
                  return apply2(apply2(map26(array3)(f(array[bot])))(f(array[bot + 1])))(f(array[bot + 2]));
                default:
                  var pivot = bot + Math.floor((top2 - bot) / 4) * 2;
                  return apply2(map26(concat2)(go(bot, pivot)))(go(pivot, top2));
              }
            }
            return go(0, array.length);
          };
        };
      };
    };
  };
})();

// ../output/Data.Traversable/index.js
var identity3 = /* @__PURE__ */ identity(categoryFn);
var traverse = function(dict) {
  return dict.traverse;
};
var sequenceDefault = function(dictTraversable) {
  var traverse22 = traverse(dictTraversable);
  return function(dictApplicative) {
    return traverse22(dictApplicative)(identity3);
  };
};
var traversableArray = {
  traverse: function(dictApplicative) {
    var Apply0 = dictApplicative.Apply0();
    return traverseArrayImpl(apply(Apply0))(map(Apply0.Functor0()))(pure(dictApplicative));
  },
  sequence: function(dictApplicative) {
    return sequenceDefault(traversableArray)(dictApplicative);
  },
  Functor0: function() {
    return functorArray;
  },
  Foldable1: function() {
    return foldableArray;
  }
};

// ../output/Data.Unfoldable/foreign.js
var unfoldrArrayImpl = function(isNothing2) {
  return function(fromJust5) {
    return function(fst2) {
      return function(snd2) {
        return function(f) {
          return function(b) {
            var result = [];
            var value = b;
            while (true) {
              var maybe2 = f(value);
              if (isNothing2(maybe2)) return result;
              var tuple = fromJust5(maybe2);
              result.push(fst2(tuple));
              value = snd2(tuple);
            }
          };
        };
      };
    };
  };
};

// ../output/Data.Unfoldable1/foreign.js
var unfoldr1ArrayImpl = function(isNothing2) {
  return function(fromJust5) {
    return function(fst2) {
      return function(snd2) {
        return function(f) {
          return function(b) {
            var result = [];
            var value = b;
            while (true) {
              var tuple = f(value);
              result.push(fst2(tuple));
              var maybe2 = snd2(tuple);
              if (isNothing2(maybe2)) return result;
              value = fromJust5(maybe2);
            }
          };
        };
      };
    };
  };
};

// ../output/Data.Unfoldable1/index.js
var fromJust2 = /* @__PURE__ */ fromJust();
var unfoldable1Array = {
  unfoldr1: /* @__PURE__ */ unfoldr1ArrayImpl(isNothing)(fromJust2)(fst)(snd)
};

// ../output/Data.Unfoldable/index.js
var fromJust3 = /* @__PURE__ */ fromJust();
var unfoldr = function(dict) {
  return dict.unfoldr;
};
var unfoldableArray = {
  unfoldr: /* @__PURE__ */ unfoldrArrayImpl(isNothing)(fromJust3)(fst)(snd),
  Unfoldable10: function() {
    return unfoldable1Array;
  }
};

// ../output/Data.Array/index.js
var $$void2 = /* @__PURE__ */ $$void(functorST);
var map4 = /* @__PURE__ */ map(functorMaybe);
var map1 = /* @__PURE__ */ map(functorArray);
var map22 = /* @__PURE__ */ map(functorST);
var fromJust4 = /* @__PURE__ */ fromJust();
var when2 = /* @__PURE__ */ when(applicativeST);
var notEq3 = /* @__PURE__ */ notEq(eqOrdering);
var append2 = /* @__PURE__ */ append(semigroupArray);
var updateAt = /* @__PURE__ */ (function() {
  return runFn5(_updateAt)(Just.create)(Nothing.value);
})();
var unsafeIndex = function() {
  return runFn2(unsafeIndexImpl);
};
var unsafeIndex1 = /* @__PURE__ */ unsafeIndex();
var uncons = /* @__PURE__ */ (function() {
  return runFn3(unconsImpl)($$const(Nothing.value))(function(x) {
    return function(xs) {
      return new Just({
        head: x,
        tail: xs
      });
    };
  });
})();
var sortBy = function(comp) {
  return runFn3(sortByImpl)(comp)(function(v) {
    if (v instanceof GT) {
      return 1;
    }
    ;
    if (v instanceof EQ) {
      return 0;
    }
    ;
    if (v instanceof LT) {
      return -1 | 0;
    }
    ;
    throw new Error("Failed pattern match at Data.Array (line 897, column 38 - line 900, column 11): " + [v.constructor.name]);
  });
};
var sortWith = function(dictOrd) {
  var comparing2 = comparing(dictOrd);
  return function(f) {
    return sortBy(comparing2(f));
  };
};
var sortWith1 = /* @__PURE__ */ sortWith(ordInt);
var snoc = function(xs) {
  return function(x) {
    return withArray(push(x))(xs)();
  };
};
var slice = /* @__PURE__ */ runFn3(sliceImpl);
var take = function(n) {
  return function(xs) {
    var $152 = n < 1;
    if ($152) {
      return [];
    }
    ;
    return slice(0)(n)(xs);
  };
};
var singleton2 = function(a) {
  return [a];
};
var replicate = /* @__PURE__ */ runFn2(replicateImpl);
var range2 = /* @__PURE__ */ runFn2(rangeImpl);
var $$null = function(xs) {
  return length(xs) === 0;
};
var mapWithIndex2 = /* @__PURE__ */ mapWithIndex(functorWithIndexArray);
var index = /* @__PURE__ */ (function() {
  return runFn4(indexImpl)(Just.create)(Nothing.value);
})();
var last = function(xs) {
  return index(xs)(length(xs) - 1 | 0);
};
var modifyAt = function(i) {
  return function(f) {
    return function(xs) {
      var go = function(x) {
        return updateAt(i)(f(x))(xs);
      };
      return maybe(Nothing.value)(go)(index(xs)(i));
    };
  };
};
var span = function(p) {
  return function(arr) {
    var go = function($copy_i) {
      var $tco_done = false;
      var $tco_result;
      function $tco_loop(i) {
        var v = index(arr)(i);
        if (v instanceof Just) {
          var $156 = p(v.value0);
          if ($156) {
            $copy_i = i + 1 | 0;
            return;
          }
          ;
          $tco_done = true;
          return new Just(i);
        }
        ;
        if (v instanceof Nothing) {
          $tco_done = true;
          return Nothing.value;
        }
        ;
        throw new Error("Failed pattern match at Data.Array (line 1035, column 5 - line 1037, column 25): " + [v.constructor.name]);
      }
      ;
      while (!$tco_done) {
        $tco_result = $tco_loop($copy_i);
      }
      ;
      return $tco_result;
    };
    var breakIndex = go(0);
    if (breakIndex instanceof Just && breakIndex.value0 === 0) {
      return {
        init: [],
        rest: arr
      };
    }
    ;
    if (breakIndex instanceof Just) {
      return {
        init: slice(0)(breakIndex.value0)(arr),
        rest: slice(breakIndex.value0)(length(arr))(arr)
      };
    }
    ;
    if (breakIndex instanceof Nothing) {
      return {
        init: arr,
        rest: []
      };
    }
    ;
    throw new Error("Failed pattern match at Data.Array (line 1022, column 3 - line 1028, column 30): " + [breakIndex.constructor.name]);
  };
};
var head = function(xs) {
  return index(xs)(0);
};
var nubBy = function(comp) {
  return function(xs) {
    var indexedAndSorted = sortBy(function(x) {
      return function(y) {
        return comp(snd(x))(snd(y));
      };
    })(mapWithIndex2(Tuple.create)(xs));
    var v = head(indexedAndSorted);
    if (v instanceof Nothing) {
      return [];
    }
    ;
    if (v instanceof Just) {
      return map1(snd)(sortWith1(fst)((function __do() {
        var result = unsafeThaw(singleton2(v.value0))();
        foreach(indexedAndSorted)(function(v1) {
          return function __do2() {
            var lst = map22(/* @__PURE__ */ (function() {
              var $183 = function($185) {
                return fromJust4(last($185));
              };
              return function($184) {
                return snd($183($184));
              };
            })())(unsafeFreeze(result))();
            return when2(notEq3(comp(lst)(v1.value1))(EQ.value))($$void2(push(v1)(result)))();
          };
        })();
        return unsafeFreeze(result)();
      })()));
    }
    ;
    throw new Error("Failed pattern match at Data.Array (line 1115, column 17 - line 1123, column 28): " + [v.constructor.name]);
  };
};
var nub = function(dictOrd) {
  return nubBy(compare(dictOrd));
};
var fromFoldable = function(dictFoldable) {
  return runFn2(fromFoldableImpl)(foldr(dictFoldable));
};
var foldl2 = /* @__PURE__ */ foldl(foldableArray);
var findMap = /* @__PURE__ */ (function() {
  return runFn4(findMapImpl)(Nothing.value)(isJust);
})();
var findIndex = /* @__PURE__ */ (function() {
  return runFn4(findIndexImpl)(Just.create)(Nothing.value);
})();
var find2 = function(f) {
  return function(xs) {
    return map4(unsafeIndex1(xs))(findIndex(f)(xs));
  };
};
var filter = /* @__PURE__ */ runFn2(filterImpl);
var elemIndex = function(dictEq) {
  var eq22 = eq(dictEq);
  return function(x) {
    return findIndex(function(v) {
      return eq22(v)(x);
    });
  };
};
var elem2 = function(dictEq) {
  var elemIndex1 = elemIndex(dictEq);
  return function(a) {
    return function(arr) {
      return isJust(elemIndex1(a)(arr));
    };
  };
};
var dropWhile = function(p) {
  return function(xs) {
    return span(p)(xs).rest;
  };
};
var drop = function(n) {
  return function(xs) {
    var $173 = n < 1;
    if ($173) {
      return xs;
    }
    ;
    return slice(n)(length(xs))(xs);
  };
};
var cons = function(x) {
  return function(xs) {
    return append2([x])(xs);
  };
};
var concatMap = /* @__PURE__ */ flip(/* @__PURE__ */ bind(bindArray));
var mapMaybe = function(f) {
  return concatMap((function() {
    var $189 = maybe([])(singleton2);
    return function($190) {
      return $189(f($190));
    };
  })());
};
var catMaybes = /* @__PURE__ */ mapMaybe(/* @__PURE__ */ identity(categoryFn));
var any2 = /* @__PURE__ */ runFn2(anyImpl);
var nubByEq = function(eq22) {
  return function(xs) {
    return (function __do() {
      var arr = newSTArray();
      foreach(xs)(function(x) {
        return function __do2() {
          var e = map22((function() {
            var $194 = any2(function(v) {
              return eq22(v)(x);
            });
            return function($195) {
              return !$194($195);
            };
          })())(unsafeFreeze(arr))();
          return when2(e)($$void2(push(x)(arr)))();
        };
      })();
      return unsafeFreeze(arr)();
    })();
  };
};
var all2 = /* @__PURE__ */ runFn2(allImpl);

// ../output/Data.String.Common/foreign.js
var split = function(sep) {
  return function(s) {
    return s.split(sep);
  };
};
var toLower = function(s) {
  return s.toLowerCase();
};
var toUpper = function(s) {
  return s.toUpperCase();
};
var trim = function(s) {
  return s.trim();
};
var joinWith = function(s) {
  return function(xs) {
    return xs.join(s);
  };
};

// ../output/Data.String.CodePoints/foreign.js
var hasArrayFrom = typeof Array.from === "function";
var hasStringIterator = typeof Symbol !== "undefined" && Symbol != null && typeof Symbol.iterator !== "undefined" && typeof String.prototype[Symbol.iterator] === "function";
var hasFromCodePoint = typeof String.prototype.fromCodePoint === "function";
var hasCodePointAt = typeof String.prototype.codePointAt === "function";
var _unsafeCodePointAt0 = function(fallback) {
  return hasCodePointAt ? function(str) {
    return str.codePointAt(0);
  } : fallback;
};
var _singleton = function(fallback) {
  return hasFromCodePoint ? String.fromCodePoint : fallback;
};
var _take = function(fallback) {
  return function(n) {
    if (hasStringIterator) {
      return function(str) {
        var accum = "";
        var iter = str[Symbol.iterator]();
        for (var i = 0; i < n; ++i) {
          var o = iter.next();
          if (o.done) return accum;
          accum += o.value;
        }
        return accum;
      };
    }
    return fallback(n);
  };
};
var _toCodePointArray = function(fallback) {
  return function(unsafeCodePointAt02) {
    if (hasArrayFrom) {
      return function(str) {
        return Array.from(str, unsafeCodePointAt02);
      };
    }
    return fallback;
  };
};

// ../output/Data.Enum/foreign.js
function toCharCode(c) {
  return c.charCodeAt(0);
}
function fromCharCode(c) {
  return String.fromCharCode(c);
}

// ../output/Data.Enum/index.js
var bottom1 = /* @__PURE__ */ bottom(boundedChar);
var top1 = /* @__PURE__ */ top(boundedChar);
var toEnum = function(dict) {
  return dict.toEnum;
};
var fromEnum = function(dict) {
  return dict.fromEnum;
};
var toEnumWithDefaults = function(dictBoundedEnum) {
  var toEnum1 = toEnum(dictBoundedEnum);
  var fromEnum1 = fromEnum(dictBoundedEnum);
  var bottom2 = bottom(dictBoundedEnum.Bounded0());
  return function(low) {
    return function(high) {
      return function(x) {
        var v = toEnum1(x);
        if (v instanceof Just) {
          return v.value0;
        }
        ;
        if (v instanceof Nothing) {
          var $140 = x < fromEnum1(bottom2);
          if ($140) {
            return low;
          }
          ;
          return high;
        }
        ;
        throw new Error("Failed pattern match at Data.Enum (line 158, column 33 - line 160, column 62): " + [v.constructor.name]);
      };
    };
  };
};
var defaultSucc = function(toEnum$prime) {
  return function(fromEnum$prime) {
    return function(a) {
      return toEnum$prime(fromEnum$prime(a) + 1 | 0);
    };
  };
};
var defaultPred = function(toEnum$prime) {
  return function(fromEnum$prime) {
    return function(a) {
      return toEnum$prime(fromEnum$prime(a) - 1 | 0);
    };
  };
};
var charToEnum = function(v) {
  if (v >= toCharCode(bottom1) && v <= toCharCode(top1)) {
    return new Just(fromCharCode(v));
  }
  ;
  return Nothing.value;
};
var enumChar = {
  succ: /* @__PURE__ */ defaultSucc(charToEnum)(toCharCode),
  pred: /* @__PURE__ */ defaultPred(charToEnum)(toCharCode),
  Ord0: function() {
    return ordChar;
  }
};
var boundedEnumChar = /* @__PURE__ */ (function() {
  return {
    cardinality: toCharCode(top1) - toCharCode(bottom1) | 0,
    toEnum: charToEnum,
    fromEnum: toCharCode,
    Bounded0: function() {
      return boundedChar;
    },
    Enum1: function() {
      return enumChar;
    }
  };
})();

// ../output/Data.String.CodeUnits/foreign.js
var fromCharArray = function(a) {
  return a.join("");
};
var toCharArray = function(s) {
  return s.split("");
};
var singleton3 = function(c) {
  return c;
};
var _charAt = function(just) {
  return function(nothing) {
    return function(i) {
      return function(s) {
        return i >= 0 && i < s.length ? just(s.charAt(i)) : nothing;
      };
    };
  };
};
var length2 = function(s) {
  return s.length;
};
var _indexOf = function(just) {
  return function(nothing) {
    return function(x) {
      return function(s) {
        var i = s.indexOf(x);
        return i === -1 ? nothing : just(i);
      };
    };
  };
};
var take2 = function(n) {
  return function(s) {
    return s.substr(0, n);
  };
};
var drop2 = function(n) {
  return function(s) {
    return s.substring(n);
  };
};
var slice2 = function(b) {
  return function(e) {
    return function(s) {
      return s.slice(b, e);
    };
  };
};
var splitAt = function(i) {
  return function(s) {
    return { before: s.substring(0, i), after: s.substring(i) };
  };
};

// ../output/Data.String.Unsafe/foreign.js
var charAt = function(i) {
  return function(s) {
    if (i >= 0 && i < s.length) return s.charAt(i);
    throw new Error("Data.String.Unsafe.charAt: Invalid index.");
  };
};

// ../output/Data.String.CodeUnits/index.js
var stripSuffix = function(v) {
  return function(str) {
    var v1 = splitAt(length2(str) - length2(v) | 0)(str);
    var $14 = v1.after === v;
    if ($14) {
      return new Just(v1.before);
    }
    ;
    return Nothing.value;
  };
};
var stripPrefix = function(v) {
  return function(str) {
    var v1 = splitAt(length2(v))(str);
    var $20 = v1.before === v;
    if ($20) {
      return new Just(v1.after);
    }
    ;
    return Nothing.value;
  };
};
var indexOf = /* @__PURE__ */ (function() {
  return _indexOf(Just.create)(Nothing.value);
})();
var contains = function(pat) {
  var $23 = indexOf(pat);
  return function($24) {
    return isJust($23($24));
  };
};
var charAt2 = /* @__PURE__ */ (function() {
  return _charAt(Just.create)(Nothing.value);
})();

// ../output/Data.String.CodePoints/index.js
var fromEnum2 = /* @__PURE__ */ fromEnum(boundedEnumChar);
var map5 = /* @__PURE__ */ map(functorMaybe);
var unfoldr2 = /* @__PURE__ */ unfoldr(unfoldableArray);
var div2 = /* @__PURE__ */ div(euclideanRingInt);
var mod2 = /* @__PURE__ */ mod(euclideanRingInt);
var unsurrogate = function(lead) {
  return function(trail) {
    return (((lead - 55296 | 0) * 1024 | 0) + (trail - 56320 | 0) | 0) + 65536 | 0;
  };
};
var isTrail = function(cu) {
  return 56320 <= cu && cu <= 57343;
};
var isLead = function(cu) {
  return 55296 <= cu && cu <= 56319;
};
var uncons2 = function(s) {
  var v = length2(s);
  if (v === 0) {
    return Nothing.value;
  }
  ;
  if (v === 1) {
    return new Just({
      head: fromEnum2(charAt(0)(s)),
      tail: ""
    });
  }
  ;
  var cu1 = fromEnum2(charAt(1)(s));
  var cu0 = fromEnum2(charAt(0)(s));
  var $43 = isLead(cu0) && isTrail(cu1);
  if ($43) {
    return new Just({
      head: unsurrogate(cu0)(cu1),
      tail: drop2(2)(s)
    });
  }
  ;
  return new Just({
    head: cu0,
    tail: drop2(1)(s)
  });
};
var unconsButWithTuple = function(s) {
  return map5(function(v) {
    return new Tuple(v.head, v.tail);
  })(uncons2(s));
};
var toCodePointArrayFallback = function(s) {
  return unfoldr2(unconsButWithTuple)(s);
};
var unsafeCodePointAt0Fallback = function(s) {
  var cu0 = fromEnum2(charAt(0)(s));
  var $47 = isLead(cu0) && length2(s) > 1;
  if ($47) {
    var cu1 = fromEnum2(charAt(1)(s));
    var $48 = isTrail(cu1);
    if ($48) {
      return unsurrogate(cu0)(cu1);
    }
    ;
    return cu0;
  }
  ;
  return cu0;
};
var unsafeCodePointAt0 = /* @__PURE__ */ _unsafeCodePointAt0(unsafeCodePointAt0Fallback);
var toCodePointArray = /* @__PURE__ */ _toCodePointArray(toCodePointArrayFallback)(unsafeCodePointAt0);
var length3 = function($74) {
  return length(toCodePointArray($74));
};
var indexOf2 = function(p) {
  return function(s) {
    return map5(function(i) {
      return length3(take2(i)(s));
    })(indexOf(p)(s));
  };
};
var fromCharCode2 = /* @__PURE__ */ (function() {
  var $75 = toEnumWithDefaults(boundedEnumChar)(bottom(boundedChar))(top(boundedChar));
  return function($76) {
    return singleton3($75($76));
  };
})();
var singletonFallback = function(v) {
  if (v <= 65535) {
    return fromCharCode2(v);
  }
  ;
  var lead = div2(v - 65536 | 0)(1024) + 55296 | 0;
  var trail = mod2(v - 65536 | 0)(1024) + 56320 | 0;
  return fromCharCode2(lead) + fromCharCode2(trail);
};
var singleton4 = /* @__PURE__ */ _singleton(singletonFallback);
var takeFallback = function(v) {
  return function(v1) {
    if (v < 1) {
      return "";
    }
    ;
    var v2 = uncons2(v1);
    if (v2 instanceof Just) {
      return singleton4(v2.value0.head) + takeFallback(v - 1 | 0)(v2.value0.tail);
    }
    ;
    return v1;
  };
};
var take3 = /* @__PURE__ */ _take(takeFallback);
var drop3 = function(n) {
  return function(s) {
    return drop2(length2(take3(n)(s)))(s);
  };
};

// ../output/Gramark.Backend.Js/index.js
var map6 = /* @__PURE__ */ map(functorArray);
var map12 = /* @__PURE__ */ map(functorMaybe);
var unwrapBinder = function(code) {
  var v = stripPrefix("\\")(trim(code));
  if (v instanceof Nothing) {
    return trim(code);
  }
  ;
  if (v instanceof Just) {
    var v1 = indexOf2(" -> ")(code);
    if (v1 instanceof Just) {
      return trim(drop3(v1.value0 + 4 | 0)(code));
    }
    ;
    if (v1 instanceof Nothing) {
      return trim(code);
    }
    ;
    throw new Error("Failed pattern match at Gramark.Backend.Js (line 76, column 13 - line 78, column 25): " + [v1.constructor.name]);
  }
  ;
  throw new Error("Failed pattern match at Gramark.Backend.Js (line 74, column 21 - line 78, column 25): " + [v.constructor.name]);
};
var runtime = /* @__PURE__ */ joinWith("\n")(["function fold(node) {", "  if (node.token !== undefined) return node.text;", "  const kids = node.children.map(fold);", "  const action = actions[node.rule];", "  if (action) return action(...kids);", "  return kids.length === 1 ? kids[0] : kids;", "}", "", "// Evaluate a gramark-cst tree to a value using the baked inline actions.", "export function evaluate(cst) {", "  return fold(cst);", "}"]);
var jsStr = function(s) {
  var esc = function(c) {
    if (c === '"') {
      return '\\"';
    }
    ;
    if (c === "\\") {
      return "\\\\";
    }
    ;
    if (c === "\n") {
      return "\\n";
    }
    ;
    return singleton3(c);
  };
  return '"' + (joinWith("")(map6(esc)(toCharArray(s))) + '"');
};
var jsAction = function(r) {
  return map12(function($20) {
    return unwrapBinder(snd($20));
  })(find2(function(v) {
    return v.value0 === "js";
  })(r.actions));
};
var emit = function(ir) {
  var actionSlot = function(r) {
    var v = jsAction(r);
    if (v instanceof Just) {
      return v.value0;
    }
    ;
    if (v instanceof Nothing) {
      return "null";
    }
    ;
    throw new Error("Failed pattern match at Gramark.Backend.Js (line 56, column 18 - line 58, column 22): " + [v.constructor.name]);
  };
  return joinWith("\n")(["// Generated by gramark --backend js for grammar " + (jsStr(ir.grammar.name) + "."), "// Self-contained bottom-up evaluator: each production's inline action is", "// baked as a positional function over its children's values; an", "// action-less production passes its single child through (else an array).", "// `cst` is a gramark-cst JSON tree ({ rule, children } | { token, text });", "// a leaf's value is its matched text.", "", "// production id -> positional action over child values, or null", "const actions = [" + (joinWith(", ")(map6(actionSlot)(ir.grammar.rules)) + "];"), "", runtime]);
};

// ../output/Gramark.Syntax/index.js
var Ref = /* @__PURE__ */ (function() {
  function Ref2(value0) {
    this.value0 = value0;
  }
  ;
  Ref2.create = function(value0) {
    return new Ref2(value0);
  };
  return Ref2;
})();
var Lit = /* @__PURE__ */ (function() {
  function Lit3(value0) {
    this.value0 = value0;
  }
  ;
  Lit3.create = function(value0) {
    return new Lit3(value0);
  };
  return Lit3;
})();
var Rep = /* @__PURE__ */ (function() {
  function Rep2(value0) {
    this.value0 = value0;
  }
  ;
  Rep2.create = function(value0) {
    return new Rep2(value0);
  };
  return Rep2;
})();
var Star = /* @__PURE__ */ (function() {
  function Star3(value0) {
    this.value0 = value0;
  }
  ;
  Star3.create = function(value0) {
    return new Star3(value0);
  };
  return Star3;
})();
var Opt = /* @__PURE__ */ (function() {
  function Opt2(value0) {
    this.value0 = value0;
  }
  ;
  Opt2.create = function(value0) {
    return new Opt2(value0);
  };
  return Opt2;
})();
var Macro = /* @__PURE__ */ (function() {
  function Macro2(value0, value1) {
    this.value0 = value0;
    this.value1 = value1;
  }
  ;
  Macro2.create = function(value0) {
    return function(value1) {
      return new Macro2(value0, value1);
    };
  };
  return Macro2;
})();
var Field = /* @__PURE__ */ (function() {
  function Field2(value0, value1) {
    this.value0 = value0;
    this.value1 = value1;
  }
  ;
  Field2.create = function(value0) {
    return function(value1) {
      return new Field2(value0, value1);
    };
  };
  return Field2;
})();
var Group = /* @__PURE__ */ (function() {
  function Group2(value0) {
    this.value0 = value0;
  }
  ;
  Group2.create = function(value0) {
    return new Group2(value0);
  };
  return Group2;
})();
var Any = /* @__PURE__ */ (function() {
  function Any2() {
  }
  ;
  Any2.value = new Any2();
  return Any2;
})();
var Not = /* @__PURE__ */ (function() {
  function Not2(value0) {
    this.value0 = value0;
  }
  ;
  Not2.create = function(value0) {
    return new Not2(value0);
  };
  return Not2;
})();
var Alt = /* @__PURE__ */ (function() {
  function Alt3(value0, value1, value2) {
    this.value0 = value0;
    this.value1 = value1;
    this.value2 = value2;
  }
  ;
  Alt3.create = function(value0) {
    return function(value1) {
      return function(value2) {
        return new Alt3(value0, value1, value2);
      };
    };
  };
  return Alt3;
})();
var Rule = /* @__PURE__ */ (function() {
  function Rule2(value0, value1, value2) {
    this.value0 = value0;
    this.value1 = value1;
    this.value2 = value2;
  }
  ;
  Rule2.create = function(value0) {
    return function(value1) {
      return function(value2) {
        return new Rule2(value0, value1, value2);
      };
    };
  };
  return Rule2;
})();

// ../output/Gramark.Bootstrap/index.js
var lrTokensSource = /* @__PURE__ */ joinWith("\n")(["WS       : /[ \\t]+/                       %skip", "NL       : /(\\r?\\n)(?:[ \\t]*\\r?\\n)*/      %external(layout)", "ATTR     : /#\\[([A-Za-z_][A-Za-z0-9_]*)\\]/", "IDENT    : /[A-Za-z_][A-Za-z0-9_]*/", `TERM_LIT : /'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"/`, "ACTION   : /\\{%((?:[^%]|%[^}])*)%\\}/", "LABEL    : /#[ \\t]*([A-Za-z_][A-Za-z0-9_]*)/", 'PLUS     : "+"', 'STAR     : "*"', 'QUESTION : "?"', 'LANGLE   : "<"', 'RANGLE   : ">"', 'COMMA    : ","']);
var bootstrapGrammar = /* @__PURE__ */ (function() {
  return [new Rule("Grammar", [], [new Alt([new Ref("RuleList")], Nothing.value, new Just("\\rs -> Grammar rs"))]), new Rule("RuleList", [], [new Alt([new Ref("Rule")], Nothing.value, new Just("\\r -> [r]")), new Alt([new Ref("RuleList"), new Ref("NL"), new Ref("Rule")], Nothing.value, new Just("\\rs _ r -> snoc rs r"))]), new Rule("Rule", [], [new Alt([new Ref("ATTR"), new Ref("IDENT"), new Ref("NL"), new Lit(":"), new Ref("Body")], Nothing.value, new Just("\\attr lhs _ _ alts -> Rule lhs [ attr ] alts")), new Alt([new Ref("IDENT"), new Ref("NL"), new Lit(":"), new Ref("Body")], Nothing.value, new Just("\\lhs _ _ alts -> Rule lhs [] alts"))]), new Rule("Body", [], [new Alt([new Ref("Alt")], Nothing.value, new Just("\\a -> [a]")), new Alt([new Ref("Body"), new Lit("|"), new Ref("Alt")], Nothing.value, new Just("\\bs _ a -> snoc bs a"))]), new Rule("Alt", [], [new Alt([new Ref("SymList"), new Ref("Label"), new Ref("Action")], Nothing.value, new Just("\\syms lbl act -> Alt syms lbl act")), new Alt([new Ref("SymList"), new Ref("Label")], Nothing.value, new Just("\\syms lbl -> Alt syms lbl Nothing")), new Alt([new Ref("SymList"), new Ref("Action")], Nothing.value, new Just("\\syms act -> Alt syms Nothing act")), new Alt([new Ref("SymList")], Nothing.value, new Just("\\syms -> Alt syms Nothing Nothing"))]), new Rule("SymList", [], [new Alt([new Ref("Sym")], Nothing.value, new Just("\\s -> [s]")), new Alt([new Ref("SymList"), new Ref("Sym")], Nothing.value, new Just("\\ss s -> snoc ss s"))]), new Rule("Sym", [], [new Alt([new Ref("IDENT")], Nothing.value, new Just("\\i -> Ref i")), new Alt([new Ref("TERM_LIT")], Nothing.value, new Just("\\t -> Lit t")), new Alt([new Ref("IDENT"), new Ref("PLUS")], Nothing.value, new Just("\\i _ -> Rep (Ref i)")), new Alt([new Ref("TERM_LIT"), new Ref("PLUS")], Nothing.value, new Just("\\t _ -> Rep (Lit t)")), new Alt([new Ref("IDENT"), new Ref("STAR")], Nothing.value, new Just("\\i _ -> Star (Ref i)")), new Alt([new Ref("TERM_LIT"), new Ref("STAR")], Nothing.value, new Just("\\t _ -> Star (Lit t)")), new Alt([new Ref("IDENT"), new Ref("QUESTION")], Nothing.value, new Just("\\i _ -> Opt (Ref i)")), new Alt([new Ref("TERM_LIT"), new Ref("QUESTION")], Nothing.value, new Just("\\t _ -> Opt (Lit t)")), new Alt([new Ref("IDENT"), new Ref("LANGLE"), new Ref("Args"), new Ref("RANGLE")], Nothing.value, new Just("\\name _ args _ -> Macro name args")), new Alt([new Ref("IDENT"), new Lit(":"), new Ref("Sym")], Nothing.value, new Just("\\name _ s -> Field name s")), new Alt([new Lit("("), new Ref("GroupBody"), new Lit(")")], Nothing.value, new Just("\\_ g _ -> Group g")), new Alt([new Lit("("), new Ref("GroupBody"), new Lit(")"), new Ref("PLUS")], Nothing.value, new Just("\\_ g _ _ -> Rep (Group g)")), new Alt([new Lit("("), new Ref("GroupBody"), new Lit(")"), new Ref("STAR")], Nothing.value, new Just("\\_ g _ _ -> Star (Group g)")), new Alt([new Lit("("), new Ref("GroupBody"), new Lit(")"), new Ref("QUESTION")], Nothing.value, new Just("\\_ g _ _ -> Opt (Group g)")), new Alt([new Ref("Atom")], Nothing.value, new Just("\\a -> a")), new Alt([new Ref("Atom"), new Ref("PLUS")], Nothing.value, new Just("\\a _ -> Rep a")), new Alt([new Ref("Atom"), new Ref("STAR")], Nothing.value, new Just("\\a _ -> Star a")), new Alt([new Ref("Atom"), new Ref("QUESTION")], Nothing.value, new Just("\\a _ -> Opt a"))]), new Rule("Args", [], [new Alt([new Ref("Sym")], Nothing.value, new Just("\\s -> [s]")), new Alt([new Ref("Args"), new Ref("COMMA"), new Ref("Sym")], Nothing.value, new Just("\\as _ s -> snoc as s"))]), new Rule("Action", [], [new Alt([new Ref("ACTION")], Nothing.value, new Just("\\a -> Just a"))]), new Rule("Label", [], [new Alt([new Ref("LABEL")], Nothing.value, new Just("\\l -> Just l"))]), new Rule("GroupBody", [], [new Alt([new Ref("SymList")], Nothing.value, new Just("\\syms -> [syms]")), new Alt([new Ref("GroupBody"), new Lit("|"), new Ref("SymList")], Nothing.value, new Just("\\alts _ syms -> snoc alts syms"))]), new Rule("Atom", [], [new Alt([new Lit(".")], Nothing.value, new Just("\\_ -> Any")), new Alt([new Lit("~"), new Ref("NotArg")], Nothing.value, new Just("\\_ s -> Not s"))]), new Rule("NotArg", [], [new Alt([new Ref("SetItem")], Nothing.value, new Just("\\i -> [i]")), new Alt([new Lit("("), new Ref("SetBody"), new Lit(")")], Nothing.value, new Just("\\_ s _ -> s"))]), new Rule("SetBody", [], [new Alt([new Ref("SetItem")], Nothing.value, new Just("\\i -> [i]")), new Alt([new Ref("SetBody"), new Lit("|"), new Ref("SetItem")], Nothing.value, new Just("\\s _ i -> snoc s i"))]), new Rule("SetItem", [], [new Alt([new Ref("IDENT")], Nothing.value, new Just("\\i -> Ref i")), new Alt([new Ref("TERM_LIT")], Nothing.value, new Just("\\t -> Lit t"))])];
})();

// ../output/Gramark.Lexer/index.js
var map7 = /* @__PURE__ */ map(functorMaybe);
var eq3 = /* @__PURE__ */ eq(/* @__PURE__ */ eqMaybe(eqString));
var normalizeNewlines = function(toks) {
  var term = function(j) {
    return map7(function(v) {
      return v.terminal;
    })(index(toks)(j));
  };
  var isHead = function(p) {
    return eq3(term(p))(new Just("IDENT")) && (eq3(term(p + 1 | 0))(new Just("NL")) && eq3(term(p + 2 | 0))(new Just(":"))) || eq3(term(p))(new Just("ATTR")) && (eq3(term(p + 1 | 0))(new Just("IDENT")) && (eq3(term(p + 2 | 0))(new Just("NL")) && eq3(term(p + 3 | 0))(new Just(":"))));
  };
  var decide = function(i) {
    return function(t) {
      if (t.terminal !== "NL") {
        return new Just(t);
      }
      ;
      if (eq3(term(i - 1 | 0))(new Just("IDENT")) && eq3(term(i + 1 | 0))(new Just(":"))) {
        return new Just(t);
      }
      ;
      if (isHead(i + 1 | 0)) {
        return new Just(t);
      }
      ;
      if (otherwise) {
        return Nothing.value;
      }
      ;
      throw new Error("Failed pattern match at Gramark.Lexer (line 194, column 3 - line 198, column 26): " + [i.constructor.name, t.constructor.name]);
    };
  };
  return catMaybes(mapWithIndex2(decide)(toks));
};

// ../output/Data.FoldableWithIndex/index.js
var foldr8 = /* @__PURE__ */ foldr(foldableArray);
var mapWithIndex3 = /* @__PURE__ */ mapWithIndex(functorWithIndexArray);
var foldl8 = /* @__PURE__ */ foldl(foldableArray);
var foldrWithIndex = function(dict) {
  return dict.foldrWithIndex;
};
var foldlWithIndex = function(dict) {
  return dict.foldlWithIndex;
};
var foldMapWithIndexDefaultR = function(dictFoldableWithIndex) {
  var foldrWithIndex1 = foldrWithIndex(dictFoldableWithIndex);
  return function(dictMonoid) {
    var append6 = append(dictMonoid.Semigroup0());
    var mempty2 = mempty(dictMonoid);
    return function(f) {
      return foldrWithIndex1(function(i) {
        return function(x) {
          return function(acc) {
            return append6(f(i)(x))(acc);
          };
        };
      })(mempty2);
    };
  };
};
var foldableWithIndexArray = {
  foldrWithIndex: function(f) {
    return function(z) {
      var $291 = foldr8(function(v) {
        return function(y) {
          return f(v.value0)(v.value1)(y);
        };
      })(z);
      var $292 = mapWithIndex3(Tuple.create);
      return function($293) {
        return $291($292($293));
      };
    };
  },
  foldlWithIndex: function(f) {
    return function(z) {
      var $294 = foldl8(function(y) {
        return function(v) {
          return f(v.value0)(y)(v.value1);
        };
      })(z);
      var $295 = mapWithIndex3(Tuple.create);
      return function($296) {
        return $294($295($296));
      };
    };
  },
  foldMapWithIndex: function(dictMonoid) {
    return foldMapWithIndexDefaultR(foldableWithIndexArray)(dictMonoid);
  },
  Foldable0: function() {
    return foldableArray;
  }
};

// ../output/Data.List.Types/index.js
var Nil = /* @__PURE__ */ (function() {
  function Nil2() {
  }
  ;
  Nil2.value = new Nil2();
  return Nil2;
})();
var Cons = /* @__PURE__ */ (function() {
  function Cons2(value0, value1) {
    this.value0 = value0;
    this.value1 = value1;
  }
  ;
  Cons2.create = function(value0) {
    return function(value1) {
      return new Cons2(value0, value1);
    };
  };
  return Cons2;
})();
var foldableList = {
  foldr: function(f) {
    return function(b) {
      var rev = (function() {
        var go = function($copy_v) {
          return function($copy_v1) {
            var $tco_var_v = $copy_v;
            var $tco_done = false;
            var $tco_result;
            function $tco_loop(v, v1) {
              if (v1 instanceof Nil) {
                $tco_done = true;
                return v;
              }
              ;
              if (v1 instanceof Cons) {
                $tco_var_v = new Cons(v1.value0, v);
                $copy_v1 = v1.value1;
                return;
              }
              ;
              throw new Error("Failed pattern match at Data.List.Types (line 107, column 7 - line 107, column 23): " + [v.constructor.name, v1.constructor.name]);
            }
            ;
            while (!$tco_done) {
              $tco_result = $tco_loop($tco_var_v, $copy_v1);
            }
            ;
            return $tco_result;
          };
        };
        return go(Nil.value);
      })();
      var $284 = foldl(foldableList)(flip(f))(b);
      return function($285) {
        return $284(rev($285));
      };
    };
  },
  foldl: function(f) {
    var go = function($copy_b) {
      return function($copy_v) {
        var $tco_var_b = $copy_b;
        var $tco_done1 = false;
        var $tco_result;
        function $tco_loop(b, v) {
          if (v instanceof Nil) {
            $tco_done1 = true;
            return b;
          }
          ;
          if (v instanceof Cons) {
            $tco_var_b = f(b)(v.value0);
            $copy_v = v.value1;
            return;
          }
          ;
          throw new Error("Failed pattern match at Data.List.Types (line 111, column 12 - line 113, column 30): " + [v.constructor.name]);
        }
        ;
        while (!$tco_done1) {
          $tco_result = $tco_loop($tco_var_b, $copy_v);
        }
        ;
        return $tco_result;
      };
    };
    return go;
  },
  foldMap: function(dictMonoid) {
    var append22 = append(dictMonoid.Semigroup0());
    var mempty2 = mempty(dictMonoid);
    return function(f) {
      return foldl(foldableList)(function(acc) {
        var $286 = append22(acc);
        return function($287) {
          return $286(f($287));
        };
      })(mempty2);
    };
  }
};
var eq1List = {
  eq1: function(dictEq) {
    var eq8 = eq(dictEq);
    return function(xs) {
      return function(ys) {
        var go = function($copy_v) {
          return function($copy_v1) {
            return function($copy_v2) {
              var $tco_var_v = $copy_v;
              var $tco_var_v1 = $copy_v1;
              var $tco_done = false;
              var $tco_result;
              function $tco_loop(v, v1, v2) {
                if (!v2) {
                  $tco_done = true;
                  return false;
                }
                ;
                if (v instanceof Nil && v1 instanceof Nil) {
                  $tco_done = true;
                  return v2;
                }
                ;
                if (v instanceof Cons && v1 instanceof Cons) {
                  $tco_var_v = v.value1;
                  $tco_var_v1 = v1.value1;
                  $copy_v2 = v2 && eq8(v1.value0)(v.value0);
                  return;
                }
                ;
                $tco_done = true;
                return false;
              }
              ;
              while (!$tco_done) {
                $tco_result = $tco_loop($tco_var_v, $tco_var_v1, $copy_v2);
              }
              ;
              return $tco_result;
            };
          };
        };
        return go(xs)(ys)(true);
      };
    };
  }
};
var eq12 = /* @__PURE__ */ eq1(eq1List);
var eqList = function(dictEq) {
  return {
    eq: eq12(dictEq)
  };
};
var ord1List = {
  compare1: function(dictOrd) {
    var compare4 = compare(dictOrd);
    return function(xs) {
      return function(ys) {
        var go = function($copy_v) {
          return function($copy_v1) {
            var $tco_var_v = $copy_v;
            var $tco_done = false;
            var $tco_result;
            function $tco_loop(v, v1) {
              if (v instanceof Nil && v1 instanceof Nil) {
                $tco_done = true;
                return EQ.value;
              }
              ;
              if (v instanceof Nil) {
                $tco_done = true;
                return LT.value;
              }
              ;
              if (v1 instanceof Nil) {
                $tco_done = true;
                return GT.value;
              }
              ;
              if (v instanceof Cons && v1 instanceof Cons) {
                var v2 = compare4(v.value0)(v1.value0);
                if (v2 instanceof EQ) {
                  $tco_var_v = v.value1;
                  $copy_v1 = v1.value1;
                  return;
                }
                ;
                $tco_done = true;
                return v2;
              }
              ;
              throw new Error("Failed pattern match at Data.List.Types (line 60, column 5 - line 60, column 20): " + [v.constructor.name, v1.constructor.name]);
            }
            ;
            while (!$tco_done) {
              $tco_result = $tco_loop($tco_var_v, $copy_v1);
            }
            ;
            return $tco_result;
          };
        };
        return go(xs)(ys);
      };
    };
  },
  Eq10: function() {
    return eq1List;
  }
};
var compare12 = /* @__PURE__ */ compare1(ord1List);
var ordList = function(dictOrd) {
  var eqList1 = eqList(dictOrd.Eq0());
  return {
    compare: compare12(dictOrd),
    Eq0: function() {
      return eqList1;
    }
  };
};

// ../output/Data.Map.Internal/index.js
var $runtime_lazy2 = function(name, moduleName, init) {
  var state = 0;
  var val;
  return function(lineNumber) {
    if (state === 2) return val;
    if (state === 1) throw new ReferenceError(name + " was needed before it finished initializing (module " + moduleName + ", line " + lineNumber + ")", moduleName, lineNumber);
    state = 1;
    val = init();
    state = 2;
    return val;
  };
};
var Leaf = /* @__PURE__ */ (function() {
  function Leaf2() {
  }
  ;
  Leaf2.value = new Leaf2();
  return Leaf2;
})();
var Node = /* @__PURE__ */ (function() {
  function Node2(value0, value1, value2, value3, value4, value5) {
    this.value0 = value0;
    this.value1 = value1;
    this.value2 = value2;
    this.value3 = value3;
    this.value4 = value4;
    this.value5 = value5;
  }
  ;
  Node2.create = function(value0) {
    return function(value1) {
      return function(value2) {
        return function(value3) {
          return function(value4) {
            return function(value5) {
              return new Node2(value0, value1, value2, value3, value4, value5);
            };
          };
        };
      };
    };
  };
  return Node2;
})();
var IterLeaf = /* @__PURE__ */ (function() {
  function IterLeaf2() {
  }
  ;
  IterLeaf2.value = new IterLeaf2();
  return IterLeaf2;
})();
var IterEmit = /* @__PURE__ */ (function() {
  function IterEmit2(value0, value1, value2) {
    this.value0 = value0;
    this.value1 = value1;
    this.value2 = value2;
  }
  ;
  IterEmit2.create = function(value0) {
    return function(value1) {
      return function(value2) {
        return new IterEmit2(value0, value1, value2);
      };
    };
  };
  return IterEmit2;
})();
var IterNode = /* @__PURE__ */ (function() {
  function IterNode2(value0, value1) {
    this.value0 = value0;
    this.value1 = value1;
  }
  ;
  IterNode2.create = function(value0) {
    return function(value1) {
      return new IterNode2(value0, value1);
    };
  };
  return IterNode2;
})();
var IterDone = /* @__PURE__ */ (function() {
  function IterDone2() {
  }
  ;
  IterDone2.value = new IterDone2();
  return IterDone2;
})();
var IterNext = /* @__PURE__ */ (function() {
  function IterNext2(value0, value1, value2) {
    this.value0 = value0;
    this.value1 = value1;
    this.value2 = value2;
  }
  ;
  IterNext2.create = function(value0) {
    return function(value1) {
      return function(value2) {
        return new IterNext2(value0, value1, value2);
      };
    };
  };
  return IterNext2;
})();
var Split = /* @__PURE__ */ (function() {
  function Split2(value0, value1, value2) {
    this.value0 = value0;
    this.value1 = value1;
    this.value2 = value2;
  }
  ;
  Split2.create = function(value0) {
    return function(value1) {
      return function(value2) {
        return new Split2(value0, value1, value2);
      };
    };
  };
  return Split2;
})();
var SplitLast = /* @__PURE__ */ (function() {
  function SplitLast2(value0, value1, value2) {
    this.value0 = value0;
    this.value1 = value1;
    this.value2 = value2;
  }
  ;
  SplitLast2.create = function(value0) {
    return function(value1) {
      return function(value2) {
        return new SplitLast2(value0, value1, value2);
      };
    };
  };
  return SplitLast2;
})();
var unsafeNode = function(k, v, l, r) {
  if (l instanceof Leaf) {
    if (r instanceof Leaf) {
      return new Node(1, 1, k, v, l, r);
    }
    ;
    if (r instanceof Node) {
      return new Node(1 + r.value0 | 0, 1 + r.value1 | 0, k, v, l, r);
    }
    ;
    throw new Error("Failed pattern match at Data.Map.Internal (line 702, column 5 - line 706, column 39): " + [r.constructor.name]);
  }
  ;
  if (l instanceof Node) {
    if (r instanceof Leaf) {
      return new Node(1 + l.value0 | 0, 1 + l.value1 | 0, k, v, l, r);
    }
    ;
    if (r instanceof Node) {
      return new Node(1 + (function() {
        var $280 = l.value0 > r.value0;
        if ($280) {
          return l.value0;
        }
        ;
        return r.value0;
      })() | 0, (1 + l.value1 | 0) + r.value1 | 0, k, v, l, r);
    }
    ;
    throw new Error("Failed pattern match at Data.Map.Internal (line 708, column 5 - line 712, column 68): " + [r.constructor.name]);
  }
  ;
  throw new Error("Failed pattern match at Data.Map.Internal (line 700, column 32 - line 712, column 68): " + [l.constructor.name]);
};
var toMapIter = /* @__PURE__ */ (function() {
  return flip(IterNode.create)(IterLeaf.value);
})();
var stepWith = function(f) {
  return function(next) {
    return function(done) {
      var go = function($copy_v) {
        var $tco_done = false;
        var $tco_result;
        function $tco_loop(v) {
          if (v instanceof IterLeaf) {
            $tco_done = true;
            return done(unit);
          }
          ;
          if (v instanceof IterEmit) {
            $tco_done = true;
            return next(v.value0, v.value1, v.value2);
          }
          ;
          if (v instanceof IterNode) {
            $copy_v = f(v.value1)(v.value0);
            return;
          }
          ;
          throw new Error("Failed pattern match at Data.Map.Internal (line 940, column 8 - line 946, column 20): " + [v.constructor.name]);
        }
        ;
        while (!$tco_done) {
          $tco_result = $tco_loop($copy_v);
        }
        ;
        return $tco_result;
      };
      return go;
    };
  };
};
var size = function(v) {
  if (v instanceof Leaf) {
    return 0;
  }
  ;
  if (v instanceof Node) {
    return v.value1;
  }
  ;
  throw new Error("Failed pattern match at Data.Map.Internal (line 618, column 8 - line 620, column 24): " + [v.constructor.name]);
};
var singleton6 = function(k) {
  return function(v) {
    return new Node(1, 1, k, v, Leaf.value, Leaf.value);
  };
};
var unsafeBalancedNode = /* @__PURE__ */ (function() {
  var height = function(v) {
    if (v instanceof Leaf) {
      return 0;
    }
    ;
    if (v instanceof Node) {
      return v.value0;
    }
    ;
    throw new Error("Failed pattern match at Data.Map.Internal (line 757, column 12 - line 759, column 26): " + [v.constructor.name]);
  };
  var rotateLeft = function(k, v, l, rk, rv, rl, rr) {
    if (rl instanceof Node && rl.value0 > height(rr)) {
      return unsafeNode(rl.value2, rl.value3, unsafeNode(k, v, l, rl.value4), unsafeNode(rk, rv, rl.value5, rr));
    }
    ;
    return unsafeNode(rk, rv, unsafeNode(k, v, l, rl), rr);
  };
  var rotateRight = function(k, v, lk, lv, ll, lr, r) {
    if (lr instanceof Node && height(ll) <= lr.value0) {
      return unsafeNode(lr.value2, lr.value3, unsafeNode(lk, lv, ll, lr.value4), unsafeNode(k, v, lr.value5, r));
    }
    ;
    return unsafeNode(lk, lv, ll, unsafeNode(k, v, lr, r));
  };
  return function(k, v, l, r) {
    if (l instanceof Leaf) {
      if (r instanceof Leaf) {
        return singleton6(k)(v);
      }
      ;
      if (r instanceof Node && r.value0 > 1) {
        return rotateLeft(k, v, l, r.value2, r.value3, r.value4, r.value5);
      }
      ;
      return unsafeNode(k, v, l, r);
    }
    ;
    if (l instanceof Node) {
      if (r instanceof Node) {
        if (r.value0 > (l.value0 + 1 | 0)) {
          return rotateLeft(k, v, l, r.value2, r.value3, r.value4, r.value5);
        }
        ;
        if (l.value0 > (r.value0 + 1 | 0)) {
          return rotateRight(k, v, l.value2, l.value3, l.value4, l.value5, r);
        }
        ;
      }
      ;
      if (r instanceof Leaf && l.value0 > 1) {
        return rotateRight(k, v, l.value2, l.value3, l.value4, l.value5, r);
      }
      ;
      return unsafeNode(k, v, l, r);
    }
    ;
    throw new Error("Failed pattern match at Data.Map.Internal (line 717, column 40 - line 738, column 34): " + [l.constructor.name]);
  };
})();
var $lazy_unsafeSplit = /* @__PURE__ */ $runtime_lazy2("unsafeSplit", "Data.Map.Internal", function() {
  return function(comp, k, m) {
    if (m instanceof Leaf) {
      return new Split(Nothing.value, Leaf.value, Leaf.value);
    }
    ;
    if (m instanceof Node) {
      var v = comp(k)(m.value2);
      if (v instanceof LT) {
        var v1 = $lazy_unsafeSplit(793)(comp, k, m.value4);
        return new Split(v1.value0, v1.value1, unsafeBalancedNode(m.value2, m.value3, v1.value2, m.value5));
      }
      ;
      if (v instanceof GT) {
        var v1 = $lazy_unsafeSplit(796)(comp, k, m.value5);
        return new Split(v1.value0, unsafeBalancedNode(m.value2, m.value3, m.value4, v1.value1), v1.value2);
      }
      ;
      if (v instanceof EQ) {
        return new Split(new Just(m.value3), m.value4, m.value5);
      }
      ;
      throw new Error("Failed pattern match at Data.Map.Internal (line 791, column 5 - line 799, column 30): " + [v.constructor.name]);
    }
    ;
    throw new Error("Failed pattern match at Data.Map.Internal (line 787, column 34 - line 799, column 30): " + [m.constructor.name]);
  };
});
var unsafeSplit = /* @__PURE__ */ $lazy_unsafeSplit(786);
var $lazy_unsafeSplitLast = /* @__PURE__ */ $runtime_lazy2("unsafeSplitLast", "Data.Map.Internal", function() {
  return function(k, v, l, r) {
    if (r instanceof Leaf) {
      return new SplitLast(k, v, l);
    }
    ;
    if (r instanceof Node) {
      var v1 = $lazy_unsafeSplitLast(779)(r.value2, r.value3, r.value4, r.value5);
      return new SplitLast(v1.value0, v1.value1, unsafeBalancedNode(k, v, l, v1.value2));
    }
    ;
    throw new Error("Failed pattern match at Data.Map.Internal (line 776, column 37 - line 780, column 57): " + [r.constructor.name]);
  };
});
var unsafeSplitLast = /* @__PURE__ */ $lazy_unsafeSplitLast(775);
var unsafeJoinNodes = function(v, v1) {
  if (v instanceof Leaf) {
    return v1;
  }
  ;
  if (v instanceof Node) {
    var v2 = unsafeSplitLast(v.value2, v.value3, v.value4, v.value5);
    return unsafeBalancedNode(v2.value0, v2.value1, v2.value2, v1);
  }
  ;
  throw new Error("Failed pattern match at Data.Map.Internal (line 764, column 25 - line 768, column 38): " + [v.constructor.name, v1.constructor.name]);
};
var $lazy_unsafeUnionWith = /* @__PURE__ */ $runtime_lazy2("unsafeUnionWith", "Data.Map.Internal", function() {
  return function(comp, app, l, r) {
    if (l instanceof Leaf) {
      return r;
    }
    ;
    if (r instanceof Leaf) {
      return l;
    }
    ;
    if (r instanceof Node) {
      var v = unsafeSplit(comp, r.value2, l);
      var l$prime = $lazy_unsafeUnionWith(809)(comp, app, v.value1, r.value4);
      var r$prime = $lazy_unsafeUnionWith(810)(comp, app, v.value2, r.value5);
      if (v.value0 instanceof Just) {
        return unsafeBalancedNode(r.value2, app(v.value0.value0)(r.value3), l$prime, r$prime);
      }
      ;
      if (v.value0 instanceof Nothing) {
        return unsafeBalancedNode(r.value2, r.value3, l$prime, r$prime);
      }
      ;
      throw new Error("Failed pattern match at Data.Map.Internal (line 811, column 5 - line 815, column 46): " + [v.value0.constructor.name]);
    }
    ;
    throw new Error("Failed pattern match at Data.Map.Internal (line 804, column 42 - line 815, column 46): " + [l.constructor.name, r.constructor.name]);
  };
});
var unsafeUnionWith = /* @__PURE__ */ $lazy_unsafeUnionWith(803);
var unionWith = function(dictOrd) {
  var compare4 = compare(dictOrd);
  return function(app) {
    return function(m1) {
      return function(m2) {
        return unsafeUnionWith(compare4, app, m1, m2);
      };
    };
  };
};
var union = function(dictOrd) {
  return unionWith(dictOrd)($$const);
};
var member = function(dictOrd) {
  var compare4 = compare(dictOrd);
  return function(k) {
    var go = function($copy_v) {
      var $tco_done = false;
      var $tco_result;
      function $tco_loop(v) {
        if (v instanceof Leaf) {
          $tco_done = true;
          return false;
        }
        ;
        if (v instanceof Node) {
          var v1 = compare4(k)(v.value2);
          if (v1 instanceof LT) {
            $copy_v = v.value4;
            return;
          }
          ;
          if (v1 instanceof GT) {
            $copy_v = v.value5;
            return;
          }
          ;
          if (v1 instanceof EQ) {
            $tco_done = true;
            return true;
          }
          ;
          throw new Error("Failed pattern match at Data.Map.Internal (line 459, column 7 - line 462, column 19): " + [v1.constructor.name]);
        }
        ;
        throw new Error("Failed pattern match at Data.Map.Internal (line 456, column 8 - line 462, column 19): " + [v.constructor.name]);
      }
      ;
      while (!$tco_done) {
        $tco_result = $tco_loop($copy_v);
      }
      ;
      return $tco_result;
    };
    return go;
  };
};
var lookup = function(dictOrd) {
  var compare4 = compare(dictOrd);
  return function(k) {
    var go = function($copy_v) {
      var $tco_done = false;
      var $tco_result;
      function $tco_loop(v) {
        if (v instanceof Leaf) {
          $tco_done = true;
          return Nothing.value;
        }
        ;
        if (v instanceof Node) {
          var v1 = compare4(k)(v.value2);
          if (v1 instanceof LT) {
            $copy_v = v.value4;
            return;
          }
          ;
          if (v1 instanceof GT) {
            $copy_v = v.value5;
            return;
          }
          ;
          if (v1 instanceof EQ) {
            $tco_done = true;
            return new Just(v.value3);
          }
          ;
          throw new Error("Failed pattern match at Data.Map.Internal (line 283, column 7 - line 286, column 22): " + [v1.constructor.name]);
        }
        ;
        throw new Error("Failed pattern match at Data.Map.Internal (line 280, column 8 - line 286, column 22): " + [v.constructor.name]);
      }
      ;
      while (!$tco_done) {
        $tco_result = $tco_loop($copy_v);
      }
      ;
      return $tco_result;
    };
    return go;
  };
};
var iterMapL = /* @__PURE__ */ (function() {
  var go = function($copy_iter) {
    return function($copy_v) {
      var $tco_var_iter = $copy_iter;
      var $tco_done = false;
      var $tco_result;
      function $tco_loop(iter, v) {
        if (v instanceof Leaf) {
          $tco_done = true;
          return iter;
        }
        ;
        if (v instanceof Node) {
          if (v.value5 instanceof Leaf) {
            $tco_var_iter = new IterEmit(v.value2, v.value3, iter);
            $copy_v = v.value4;
            return;
          }
          ;
          $tco_var_iter = new IterEmit(v.value2, v.value3, new IterNode(v.value5, iter));
          $copy_v = v.value4;
          return;
        }
        ;
        throw new Error("Failed pattern match at Data.Map.Internal (line 951, column 13 - line 958, column 48): " + [v.constructor.name]);
      }
      ;
      while (!$tco_done) {
        $tco_result = $tco_loop($tco_var_iter, $copy_v);
      }
      ;
      return $tco_result;
    };
  };
  return go;
})();
var stepAscCps = /* @__PURE__ */ stepWith(iterMapL);
var stepAsc = /* @__PURE__ */ (function() {
  return stepAscCps(function(k, v, next) {
    return new IterNext(k, v, next);
  })($$const(IterDone.value));
})();
var eqMapIter = function(dictEq) {
  var eq13 = eq(dictEq);
  return function(dictEq1) {
    var eq22 = eq(dictEq1);
    return {
      eq: /* @__PURE__ */ (function() {
        var go = function($copy_a) {
          return function($copy_b) {
            var $tco_var_a = $copy_a;
            var $tco_done = false;
            var $tco_result;
            function $tco_loop(a, b) {
              var v = stepAsc(a);
              if (v instanceof IterNext) {
                var v2 = stepAsc(b);
                if (v2 instanceof IterNext && (eq13(v.value0)(v2.value0) && eq22(v.value1)(v2.value1))) {
                  $tco_var_a = v.value2;
                  $copy_b = v2.value2;
                  return;
                }
                ;
                $tco_done = true;
                return false;
              }
              ;
              if (v instanceof IterDone) {
                $tco_done = true;
                return true;
              }
              ;
              throw new Error("Failed pattern match at Data.Map.Internal (line 859, column 14 - line 868, column 13): " + [v.constructor.name]);
            }
            ;
            while (!$tco_done) {
              $tco_result = $tco_loop($tco_var_a, $copy_b);
            }
            ;
            return $tco_result;
          };
        };
        return go;
      })()
    };
  };
};
var stepUnfoldr = /* @__PURE__ */ (function() {
  var step = function(k, v, next) {
    return new Just(new Tuple(new Tuple(k, v), next));
  };
  return stepAscCps(step)(function(v) {
    return Nothing.value;
  });
})();
var toUnfoldable = function(dictUnfoldable) {
  var $784 = unfoldr(dictUnfoldable)(stepUnfoldr);
  return function($785) {
    return $784(toMapIter($785));
  };
};
var isEmpty = function(v) {
  if (v instanceof Leaf) {
    return true;
  }
  ;
  return false;
};
var insertWith = function(dictOrd) {
  var compare4 = compare(dictOrd);
  return function(app) {
    return function(k) {
      return function(v) {
        var go = function(v1) {
          if (v1 instanceof Leaf) {
            return singleton6(k)(v);
          }
          ;
          if (v1 instanceof Node) {
            var v2 = compare4(k)(v1.value2);
            if (v2 instanceof LT) {
              return unsafeBalancedNode(v1.value2, v1.value3, go(v1.value4), v1.value5);
            }
            ;
            if (v2 instanceof GT) {
              return unsafeBalancedNode(v1.value2, v1.value3, v1.value4, go(v1.value5));
            }
            ;
            if (v2 instanceof EQ) {
              return new Node(v1.value0, v1.value1, k, app(v1.value3)(v), v1.value4, v1.value5);
            }
            ;
            throw new Error("Failed pattern match at Data.Map.Internal (line 486, column 7 - line 489, column 44): " + [v2.constructor.name]);
          }
          ;
          throw new Error("Failed pattern match at Data.Map.Internal (line 483, column 8 - line 489, column 44): " + [v1.constructor.name]);
        };
        return go;
      };
    };
  };
};
var insert = function(dictOrd) {
  var compare4 = compare(dictOrd);
  return function(k) {
    return function(v) {
      var go = function(v1) {
        if (v1 instanceof Leaf) {
          return singleton6(k)(v);
        }
        ;
        if (v1 instanceof Node) {
          var v2 = compare4(k)(v1.value2);
          if (v2 instanceof LT) {
            return unsafeBalancedNode(v1.value2, v1.value3, go(v1.value4), v1.value5);
          }
          ;
          if (v2 instanceof GT) {
            return unsafeBalancedNode(v1.value2, v1.value3, v1.value4, go(v1.value5));
          }
          ;
          if (v2 instanceof EQ) {
            return new Node(v1.value0, v1.value1, k, v, v1.value4, v1.value5);
          }
          ;
          throw new Error("Failed pattern match at Data.Map.Internal (line 471, column 7 - line 474, column 35): " + [v2.constructor.name]);
        }
        ;
        throw new Error("Failed pattern match at Data.Map.Internal (line 468, column 8 - line 474, column 35): " + [v1.constructor.name]);
      };
      return go;
    };
  };
};
var functorMap = {
  map: function(f) {
    var go = function(v) {
      if (v instanceof Leaf) {
        return Leaf.value;
      }
      ;
      if (v instanceof Node) {
        return new Node(v.value0, v.value1, v.value2, f(v.value3), go(v.value4), go(v.value5));
      }
      ;
      throw new Error("Failed pattern match at Data.Map.Internal (line 147, column 10 - line 150, column 39): " + [v.constructor.name]);
    };
    return go;
  }
};
var foldableMap = {
  foldr: function(f) {
    return function(z) {
      var $lazy_go = $runtime_lazy2("go", "Data.Map.Internal", function() {
        return function(m$prime, z$prime) {
          if (m$prime instanceof Leaf) {
            return z$prime;
          }
          ;
          if (m$prime instanceof Node) {
            return $lazy_go(172)(m$prime.value4, f(m$prime.value3)($lazy_go(172)(m$prime.value5, z$prime)));
          }
          ;
          throw new Error("Failed pattern match at Data.Map.Internal (line 169, column 26 - line 172, column 43): " + [m$prime.constructor.name]);
        };
      });
      var go = $lazy_go(169);
      return function(m) {
        return go(m, z);
      };
    };
  },
  foldl: function(f) {
    return function(z) {
      var $lazy_go = $runtime_lazy2("go", "Data.Map.Internal", function() {
        return function(z$prime, m$prime) {
          if (m$prime instanceof Leaf) {
            return z$prime;
          }
          ;
          if (m$prime instanceof Node) {
            return $lazy_go(178)(f($lazy_go(178)(z$prime, m$prime.value4))(m$prime.value3), m$prime.value5);
          }
          ;
          throw new Error("Failed pattern match at Data.Map.Internal (line 175, column 26 - line 178, column 43): " + [m$prime.constructor.name]);
        };
      });
      var go = $lazy_go(175);
      return function(m) {
        return go(z, m);
      };
    };
  },
  foldMap: function(dictMonoid) {
    var mempty2 = mempty(dictMonoid);
    var append17 = append(dictMonoid.Semigroup0());
    return function(f) {
      var go = function(v) {
        if (v instanceof Leaf) {
          return mempty2;
        }
        ;
        if (v instanceof Node) {
          return append17(go(v.value4))(append17(f(v.value3))(go(v.value5)));
        }
        ;
        throw new Error("Failed pattern match at Data.Map.Internal (line 181, column 10 - line 184, column 28): " + [v.constructor.name]);
      };
      return go;
    };
  }
};
var foldableWithIndexMap = {
  foldrWithIndex: function(f) {
    return function(z) {
      var $lazy_go = $runtime_lazy2("go", "Data.Map.Internal", function() {
        return function(m$prime, z$prime) {
          if (m$prime instanceof Leaf) {
            return z$prime;
          }
          ;
          if (m$prime instanceof Node) {
            return $lazy_go(192)(m$prime.value4, f(m$prime.value2)(m$prime.value3)($lazy_go(192)(m$prime.value5, z$prime)));
          }
          ;
          throw new Error("Failed pattern match at Data.Map.Internal (line 189, column 26 - line 192, column 45): " + [m$prime.constructor.name]);
        };
      });
      var go = $lazy_go(189);
      return function(m) {
        return go(m, z);
      };
    };
  },
  foldlWithIndex: function(f) {
    return function(z) {
      var $lazy_go = $runtime_lazy2("go", "Data.Map.Internal", function() {
        return function(z$prime, m$prime) {
          if (m$prime instanceof Leaf) {
            return z$prime;
          }
          ;
          if (m$prime instanceof Node) {
            return $lazy_go(198)(f(m$prime.value2)($lazy_go(198)(z$prime, m$prime.value4))(m$prime.value3), m$prime.value5);
          }
          ;
          throw new Error("Failed pattern match at Data.Map.Internal (line 195, column 26 - line 198, column 45): " + [m$prime.constructor.name]);
        };
      });
      var go = $lazy_go(195);
      return function(m) {
        return go(z, m);
      };
    };
  },
  foldMapWithIndex: function(dictMonoid) {
    var mempty2 = mempty(dictMonoid);
    var append17 = append(dictMonoid.Semigroup0());
    return function(f) {
      var go = function(v) {
        if (v instanceof Leaf) {
          return mempty2;
        }
        ;
        if (v instanceof Node) {
          return append17(go(v.value4))(append17(f(v.value2)(v.value3))(go(v.value5)));
        }
        ;
        throw new Error("Failed pattern match at Data.Map.Internal (line 201, column 10 - line 204, column 30): " + [v.constructor.name]);
      };
      return go;
    };
  },
  Foldable0: function() {
    return foldableMap;
  }
};
var keys = /* @__PURE__ */ (function() {
  return foldrWithIndex(foldableWithIndexMap)(function(k) {
    return function(v) {
      return function(acc) {
        return new Cons(k, acc);
      };
    };
  })(Nil.value);
})();
var values = /* @__PURE__ */ (function() {
  return foldr(foldableMap)(Cons.create)(Nil.value);
})();
var findMax = function($copy_v) {
  var $tco_done = false;
  var $tco_result;
  function $tco_loop(v) {
    if (v instanceof Leaf) {
      $tco_done = true;
      return Nothing.value;
    }
    ;
    if (v instanceof Node) {
      if (v.value5 instanceof Leaf) {
        $tco_done = true;
        return new Just({
          key: v.value2,
          value: v.value3
        });
      }
      ;
      $copy_v = v.value5;
      return;
    }
    ;
    throw new Error("Failed pattern match at Data.Map.Internal (line 352, column 11 - line 357, column 21): " + [v.constructor.name]);
  }
  ;
  while (!$tco_done) {
    $tco_result = $tco_loop($copy_v);
  }
  ;
  return $tco_result;
};
var eqMap = function(dictEq) {
  var eqMapIter1 = eqMapIter(dictEq);
  return function(dictEq1) {
    var eq13 = eq(eqMapIter1(dictEq1));
    return {
      eq: function(xs) {
        return function(ys) {
          if (xs instanceof Leaf) {
            if (ys instanceof Leaf) {
              return true;
            }
            ;
            return false;
          }
          ;
          if (xs instanceof Node) {
            if (ys instanceof Node && xs.value1 === ys.value1) {
              return eq13(toMapIter(xs))(toMapIter(ys));
            }
            ;
            return false;
          }
          ;
          throw new Error("Failed pattern match at Data.Map.Internal (line 94, column 14 - line 105, column 16): " + [xs.constructor.name]);
        };
      }
    };
  };
};
var empty2 = /* @__PURE__ */ (function() {
  return Leaf.value;
})();
var fromFoldable2 = function(dictOrd) {
  var insert12 = insert(dictOrd);
  return function(dictFoldable) {
    return foldl(dictFoldable)(function(m) {
      return function(v) {
        return insert12(v.value0)(v.value1)(m);
      };
    })(empty2);
  };
};
var alter = function(dictOrd) {
  var compare4 = compare(dictOrd);
  return function(f) {
    return function(k) {
      return function(m) {
        var v = unsafeSplit(compare4, k, m);
        var v2 = f(v.value0);
        if (v2 instanceof Nothing) {
          return unsafeJoinNodes(v.value1, v.value2);
        }
        ;
        if (v2 instanceof Just) {
          return unsafeBalancedNode(k, v2.value0, v.value1, v.value2);
        }
        ;
        throw new Error("Failed pattern match at Data.Map.Internal (line 514, column 3 - line 518, column 41): " + [v2.constructor.name]);
      };
    };
  };
};

// ../output/Data.List/index.js
var map8 = /* @__PURE__ */ map(functorMaybe);
var uncons3 = function(v) {
  if (v instanceof Nil) {
    return Nothing.value;
  }
  ;
  if (v instanceof Cons) {
    return new Just({
      head: v.value0,
      tail: v.value1
    });
  }
  ;
  throw new Error("Failed pattern match at Data.List (line 259, column 1 - line 259, column 66): " + [v.constructor.name]);
};
var toUnfoldable2 = function(dictUnfoldable) {
  return unfoldr(dictUnfoldable)(function(xs) {
    return map8(function(rec) {
      return new Tuple(rec.head, rec.tail);
    })(uncons3(xs));
  });
};

// ../output/Data.Set/index.js
var coerce3 = /* @__PURE__ */ coerce();
var foldMap2 = /* @__PURE__ */ foldMap(foldableList);
var foldl3 = /* @__PURE__ */ foldl(foldableList);
var foldr2 = /* @__PURE__ */ foldr(foldableList);
var $$Set = function(x) {
  return x;
};
var union2 = function(dictOrd) {
  return coerce3(union(dictOrd));
};
var toList = function(v) {
  return keys(v);
};
var toUnfoldable3 = function(dictUnfoldable) {
  var $96 = toUnfoldable2(dictUnfoldable);
  return function($97) {
    return $96(toList($97));
  };
};
var size2 = /* @__PURE__ */ coerce3(size);
var singleton7 = function(a) {
  return singleton6(a)(unit);
};
var member2 = function(dictOrd) {
  return coerce3(member(dictOrd));
};
var isEmpty2 = /* @__PURE__ */ coerce3(isEmpty);
var insert2 = function(dictOrd) {
  var insert12 = insert(dictOrd);
  return function(a) {
    return function(v) {
      return insert12(a)(unit)(v);
    };
  };
};
var fromMap = $$Set;
var foldableSet = {
  foldMap: function(dictMonoid) {
    var foldMap1 = foldMap2(dictMonoid);
    return function(f) {
      var $98 = foldMap1(f);
      return function($99) {
        return $98(toList($99));
      };
    };
  },
  foldl: function(f) {
    return function(x) {
      var $100 = foldl3(f)(x);
      return function($101) {
        return $100(toList($101));
      };
    };
  },
  foldr: function(f) {
    return function(x) {
      var $102 = foldr2(f)(x);
      return function($103) {
        return $102(toList($103));
      };
    };
  }
};
var foldl12 = /* @__PURE__ */ foldl(foldableSet);
var eqSet = function(dictEq) {
  var eq8 = eq(eqMap(dictEq)(eqUnit));
  return {
    eq: function(v) {
      return function(v1) {
        return eq8(v)(v1);
      };
    }
  };
};
var ordSet = function(dictOrd) {
  var compare4 = compare(ordList(dictOrd));
  var eqSet1 = eqSet(dictOrd.Eq0());
  return {
    compare: function(s1) {
      return function(s2) {
        return compare4(toList(s1))(toList(s2));
      };
    },
    Eq0: function() {
      return eqSet1;
    }
  };
};
var empty3 = empty2;
var fromFoldable3 = function(dictFoldable) {
  var foldl22 = foldl(dictFoldable);
  return function(dictOrd) {
    var insert12 = insert2(dictOrd);
    return foldl22(function(m) {
      return function(a) {
        return insert12(a)(m);
      };
    })(empty3);
  };
};
var map9 = function(dictOrd) {
  var insert12 = insert2(dictOrd);
  return function(f) {
    return foldl12(function(m) {
      return function(a) {
        return insert12(f(a))(m);
      };
    })(empty3);
  };
};

// ../output/Data.Map/index.js
var keys2 = /* @__PURE__ */ (function() {
  var $38 = $$void(functorMap);
  return function($39) {
    return fromMap($38($39));
  };
})();

// ../output/Gramark.Desugar/index.js
var elem3 = /* @__PURE__ */ elem2(eqString);
var map10 = /* @__PURE__ */ map(functorArray);
var fromFoldable4 = /* @__PURE__ */ fromFoldable3(foldableArray)(ordString);
var member3 = /* @__PURE__ */ member2(ordString);
var lookup2 = /* @__PURE__ */ lookup(ordString);
var foldl4 = /* @__PURE__ */ foldl(foldableArray);
var member1 = /* @__PURE__ */ member(ordString);
var show2 = /* @__PURE__ */ show(showInt);
var append1 = /* @__PURE__ */ append(semigroupArray);
var bind2 = /* @__PURE__ */ bind(bindEither);
var map13 = /* @__PURE__ */ map(functorEither);
var traverse2 = /* @__PURE__ */ traverse(traversableArray)(applicativeEither);
var insert3 = /* @__PURE__ */ insert(ordString);
var fromFoldable1 = /* @__PURE__ */ fromFoldable(foldableSet);
var pure2 = /* @__PURE__ */ pure(applicativeEither);
var fromFoldable22 = /* @__PURE__ */ fromFoldable2(ordString)(foldableArray);
var map23 = /* @__PURE__ */ map(functorMaybe);
var fromFoldable32 = /* @__PURE__ */ fromFoldable(foldableList);
var mapFlipped2 = /* @__PURE__ */ mapFlipped(functorEither);
var wildcardLower = function(v) {
  var termName = function(v1) {
    if (v1 instanceof Lit) {
      return v1.value0;
    }
    ;
    if (v1 instanceof Ref) {
      return v1.value0;
    }
    ;
    return "";
  };
  var subSyms = function(s) {
    return cons(s)((function() {
      if (s instanceof Rep) {
        return subSyms(s.value0);
      }
      ;
      if (s instanceof Star) {
        return subSyms(s.value0);
      }
      ;
      if (s instanceof Opt) {
        return subSyms(s.value0);
      }
      ;
      if (s instanceof Field) {
        return subSyms(s.value1);
      }
      ;
      if (s instanceof Macro) {
        return concatMap(subSyms)(s.value1);
      }
      ;
      if (s instanceof Group) {
        return concatMap(concatMap(subSyms))(s.value0);
      }
      ;
      if (s instanceof Not) {
        return concatMap(subSyms)(s.value0);
      }
      ;
      return [];
    })());
  };
  var notInSet = function(set) {
    return function(t) {
      return !elem3(termName(t))(map10(termName)(set));
    };
  };
  var nonterms = fromFoldable4(map10(function(v1) {
    return v1.value0;
  })(v));
  var terminalOf = function(v1) {
    if (v1 instanceof Lit) {
      return new Just(new Lit(v1.value0));
    }
    ;
    if (v1 instanceof Ref) {
      var $108 = member3(v1.value0)(nonterms);
      if ($108) {
        return Nothing.value;
      }
      ;
      return new Just(new Ref(v1.value0));
    }
    ;
    return Nothing.value;
  };
  var allSyms = concatMap(function(v1) {
    return concatMap(function(v2) {
      return v2.value0;
    })(v1.value2);
  })(v);
  var alphabet = nubByEq(function(a) {
    return function(b) {
      return termName(a) === termName(b);
    };
  })(mapMaybe(terminalOf)(concatMap(subSyms)(allSyms)));
  var lowerSym = function(v1) {
    if (v1 instanceof Any) {
      return new Group(map10(function(t) {
        return [t];
      })(alphabet));
    }
    ;
    if (v1 instanceof Not) {
      return new Group(map10(function(t) {
        return [t];
      })(filter(notInSet(v1.value0))(alphabet)));
    }
    ;
    if (v1 instanceof Rep) {
      return new Rep(lowerSym(v1.value0));
    }
    ;
    if (v1 instanceof Star) {
      return new Star(lowerSym(v1.value0));
    }
    ;
    if (v1 instanceof Opt) {
      return new Opt(lowerSym(v1.value0));
    }
    ;
    if (v1 instanceof Field) {
      return new Field(v1.value0, lowerSym(v1.value1));
    }
    ;
    if (v1 instanceof Group) {
      return new Group(map10(map10(lowerSym))(v1.value0));
    }
    ;
    return v1;
  };
  var lowerAlt = function(v1) {
    return new Alt(map10(lowerSym)(v1.value0), v1.value1, v1.value2);
  };
  var lowerRule = function(v1) {
    return new Rule(v1.value0, v1.value1, map10(lowerAlt)(v1.value2));
  };
  return map10(lowerRule)(v);
};
var spliceCst = function(im) {
  return function(sym2) {
    var v = function(v1) {
      return [sym2];
    };
    if (sym2 instanceof Ref) {
      var $135 = lookup2(sym2.value0)(im);
      if ($135 instanceof Just) {
        return $135.value0.value0;
      }
      ;
      return v(true);
    }
    ;
    return v(true);
  };
};
var normalizeAction = function(syms) {
  return function(body) {
    var paramOf = function(v2) {
      if (v2 instanceof Field) {
        return v2.value0;
      }
      ;
      return "_";
    };
    var v = stripPrefix("\\")(trim(body));
    if (v instanceof Just) {
      return body;
    }
    ;
    if (v instanceof Nothing) {
      return "\\" + (joinWith(" ")(map10(paramOf)(syms)) + (" -> " + body));
    }
    ;
    throw new Error("Failed pattern match at Gramark.Desugar (line 325, column 29 - line 327, column 71): " + [v.constructor.name]);
  };
};
var mapAccum = function(st0) {
  return function(f) {
    return foldl4(function(acc) {
      return function(a) {
        var r = f(acc.st)(a);
        return {
          st: r.st,
          out: snoc(acc.out)(r.out)
        };
      };
    })({
      st: st0,
      out: []
    });
  };
};
var isInlineRef = function(im) {
  return function(v) {
    if (v instanceof Ref) {
      return member1(v.value0)(im);
    }
    ;
    return false;
  };
};
var inlineParam = function(k) {
  return "q" + show2(k);
};
var hasSugar = function($copy_v) {
  var $tco_done = false;
  var $tco_result;
  function $tco_loop(v) {
    if (v instanceof Rep) {
      $tco_done = true;
      return true;
    }
    ;
    if (v instanceof Star) {
      $tco_done = true;
      return true;
    }
    ;
    if (v instanceof Opt) {
      $tco_done = true;
      return true;
    }
    ;
    if (v instanceof Macro) {
      $tco_done = true;
      return true;
    }
    ;
    if (v instanceof Field) {
      $copy_v = v.value1;
      return;
    }
    ;
    $tco_done = true;
    return false;
  }
  ;
  while (!$tco_done) {
    $tco_result = $tco_loop($copy_v);
  }
  ;
  return $tco_result;
};
var groupHoist = function(v) {
  var wrapped = function(st) {
    return function(con) {
      return function(s) {
        var r = hoistSym(st)(s);
        return {
          st: r.st,
          out: con(r.out)
        };
      };
    };
  };
  var hoistSym = function(st) {
    return function(v1) {
      if (v1 instanceof Group) {
        var st1 = {
          emitted: st.emitted,
          kept: st.kept,
          counter: st.counter + 1 | 0
        };
        var r = mapAccum(st1)(function(s) {
          return function(symList) {
            return mapAccum(s)(hoistSym)(symList);
          };
        })(v1.value0);
        var name = "__group_" + show2(st.counter);
        var newRule = new Rule(name, [], map10(function(g) {
          return new Alt(g, Nothing.value, Nothing.value);
        })(r.out));
        return {
          st: {
            counter: r.st.counter,
            kept: r.st.kept,
            emitted: snoc(r.st.emitted)(newRule)
          },
          out: new Ref(name)
        };
      }
      ;
      if (v1 instanceof Rep) {
        return wrapped(st)(Rep.create)(v1.value0);
      }
      ;
      if (v1 instanceof Star) {
        return wrapped(st)(Star.create)(v1.value0);
      }
      ;
      if (v1 instanceof Opt) {
        return wrapped(st)(Opt.create)(v1.value0);
      }
      ;
      if (v1 instanceof Field) {
        return wrapped(st)(Field.create(v1.value0))(v1.value1);
      }
      ;
      return {
        st,
        out: v1
      };
    };
  };
  var hoistAlt = function(st) {
    return function(v1) {
      var r = mapAccum(st)(hoistSym)(v1.value0);
      return {
        st: r.st,
        out: new Alt(r.out, v1.value1, v1.value2)
      };
    };
  };
  var onRule = function(st) {
    return function(v1) {
      var r = mapAccum(st)(function(s) {
        return function(alt2) {
          return hoistAlt(s)(alt2);
        };
      })(v1.value2);
      return {
        counter: r.st.counter,
        emitted: r.st.emitted,
        kept: snoc(r.st.kept)(new Rule(v1.value0, v1.value1, r.out))
      };
    };
  };
  var $$final = foldl4(onRule)({
    counter: 0,
    emitted: [],
    kept: []
  })(v);
  return append1($$final.kept)($$final.emitted);
};
var deepRefs = function(v) {
  if (v instanceof Ref) {
    return [v.value0];
  }
  ;
  if (v instanceof Lit) {
    return [];
  }
  ;
  if (v instanceof Rep) {
    return deepRefs(v.value0);
  }
  ;
  if (v instanceof Star) {
    return deepRefs(v.value0);
  }
  ;
  if (v instanceof Opt) {
    return deepRefs(v.value0);
  }
  ;
  if (v instanceof Field) {
    return deepRefs(v.value1);
  }
  ;
  if (v instanceof Macro) {
    return concatMap(deepRefs)(v.value1);
  }
  ;
  if (v instanceof Group) {
    return concatMap(concatMap(deepRefs))(v.value0);
  }
  ;
  if (v instanceof Any) {
    return [];
  }
  ;
  if (v instanceof Not) {
    return concatMap(deepRefs)(v.value0);
  }
  ;
  throw new Error("Failed pattern match at Gramark.Desugar (line 441, column 12 - line 451, column 42): " + [v.constructor.name]);
};
var buildWrapped = function(im) {
  return function(syms) {
    return function(usingAction) {
      var step = function(v2) {
        return function(v1) {
          if (v2 instanceof Left) {
            return new Left(v2.value0);
          }
          ;
          if (v2 instanceof Right) {
            var v22 = function(v3) {
              var p = inlineParam(v2.value0.k);
              return new Right({
                syms: snoc(v2.value0.syms)(v1),
                params: snoc(v2.value0.params)(p),
                args: snoc(v2.value0.args)(p),
                k: v2.value0.k + 1 | 0
              });
            };
            if (v1 instanceof Ref) {
              var $190 = lookup2(v1.value0)(im);
              if ($190 instanceof Just) {
                if ($190.value0.value2 instanceof Nothing) {
                  return new Left("#[inline] rule `" + (v1.value0 + "` is action-free but its value is used in an action"));
                }
                ;
                if ($190.value0.value2 instanceof Just) {
                  var ps = map10(inlineParam)(range2(v2.value0.k)((v2.value0.k + length($190.value0.value0) | 0) - 1 | 0));
                  var arg = "((" + (normalizeAction($190.value0.value0)($190.value0.value2.value0) + (") " + (joinWith(" ")(ps) + ")")));
                  return new Right({
                    syms: append1(v2.value0.syms)($190.value0.value0),
                    params: append1(v2.value0.params)(ps),
                    args: snoc(v2.value0.args)(arg),
                    k: v2.value0.k + length($190.value0.value0) | 0
                  });
                }
                ;
                throw new Error("Failed pattern match at Gramark.Desugar (line 404, column 62 - line 416, column 14): " + [$190.value0.value2.constructor.name]);
              }
              ;
              return v22(true);
            }
            ;
            return v22(true);
          }
          ;
          throw new Error("Failed pattern match at Gramark.Desugar (line 402, column 3 - line 402, column 27): " + [v2.constructor.name, v1.constructor.name]);
        };
      };
      var v = foldl4(step)(new Right({
        syms: [],
        params: [],
        args: [],
        k: 0
      }))(syms);
      if (v instanceof Left) {
        return new Left(v.value0);
      }
      ;
      if (v instanceof Right) {
        return new Right({
          syms: v.value0.syms,
          action: "\\" + (joinWith(" ")(v.value0.params) + (" -> (" + (usingAction + (") " + joinWith(" ")(v.value0.args)))))
        });
      }
      ;
      throw new Error("Failed pattern match at Gramark.Desugar (line 395, column 3 - line 400, column 8): " + [v.constructor.name]);
    };
  };
};
var expandAlt = function(im) {
  return function(v) {
    if (!any2(isInlineRef(im))(v.value0)) {
      return new Right(new Alt(v.value0, v.value1, v.value2));
    }
    ;
    if (otherwise) {
      if (v.value2 instanceof Nothing) {
        return new Right(new Alt(concatMap(spliceCst(im))(v.value0), v.value1, Nothing.value));
      }
      ;
      if (v.value2 instanceof Just) {
        return bind2(buildWrapped(im)(v.value0)(normalizeAction(v.value0)(v.value2.value0)))(function(built) {
          return new Right(new Alt(built.syms, v.value1, new Just(built.action)));
        });
      }
      ;
      throw new Error("Failed pattern match at Gramark.Desugar (line 370, column 17 - line 374, column 57): " + [v.value2.constructor.name]);
    }
    ;
    throw new Error("Failed pattern match at Gramark.Desugar (line 367, column 1 - line 367, column 56): " + [im.constructor.name, v.constructor.name]);
  };
};
var expandRule = function(im) {
  return function(v) {
    return map13(Rule.create(v.value0)(v.value1))(traverse2(expandAlt(im))(v.value2));
  };
};
var inlineExpand = function(v) {
  var mentions = function(n) {
    return function(v1) {
      return any2(function(v2) {
        return any2(function(s) {
          return elem3(n)(deepRefs(s));
        })(v2.value0);
      })(v1.value2);
    };
  };
  var isInline = function(v1) {
    return elem3("inline")(v1.value1);
  };
  var addInline = function(acc) {
    return function(v1) {
      if (elem3("inline")(v1.value1)) {
        return bind2(acc)(function(m) {
          if (v1.value2.length === 1 && any2(hasSugar)(v1["value2"][0].value0)) {
            return new Left("#[inline] rule `" + (v1.value0 + "` may not use repetition or macro sugar"));
          }
          ;
          if (v1.value2.length === 1) {
            return new Right(insert3(v1.value0)(v1["value2"][0])(m));
          }
          ;
          return new Left("#[inline] rule `" + (v1.value0 + "` must have exactly one production"));
        });
      }
      ;
      if (otherwise) {
        return acc;
      }
      ;
      throw new Error("Failed pattern match at Gramark.Desugar (line 351, column 3 - line 359, column 22): " + [acc.constructor.name, v1.constructor.name]);
    };
  };
  return bind2(foldl4(addInline)(new Right(empty2))(v))(function(inlineMap) {
    return bind2(traverse2(expandRule(inlineMap))(filter(function($338) {
      return !isInline($338);
    })(v)))(function(expanded) {
      var v1 = find2(function(n) {
        return any2(mentions(n))(expanded);
      })(fromFoldable1(keys2(inlineMap)));
      if (v1 instanceof Just) {
        return new Left("#[inline] nonterminal `" + (v1.value0 + "` must be used as a plain reference"));
      }
      ;
      if (v1 instanceof Nothing) {
        return new Right(expanded);
      }
      ;
      throw new Error("Failed pattern match at Gramark.Desugar (line 345, column 3 - line 347, column 40): " + [v1.constructor.name]);
    });
  });
};
var bools = function(n) {
  if (n <= 0) {
    return [[]];
  }
  ;
  if (otherwise) {
    return concatMap(function(b) {
      return [cons(true)(b), cons(false)(b)];
    })(bools(n - 1 | 0));
  }
  ;
  throw new Error("Failed pattern match at Gramark.Desugar (line 303, column 1 - line 303, column 38): " + [n.constructor.name]);
};
var baseName = function(v) {
  if (v instanceof Ref) {
    return v.value0;
  }
  ;
  if (v instanceof Lit) {
    return "Lit_" + v.value0;
  }
  ;
  if (v instanceof Rep) {
    return baseName(v.value0) + "_plus";
  }
  ;
  if (v instanceof Star) {
    return baseName(v.value0) + "_star";
  }
  ;
  if (v instanceof Opt) {
    return baseName(v.value0) + "_opt";
  }
  ;
  if (v instanceof Macro) {
    return v.value0;
  }
  ;
  if (v instanceof Field) {
    return baseName(v.value1);
  }
  ;
  if (v instanceof Group) {
    return "group";
  }
  ;
  if (v instanceof Any) {
    return "any";
  }
  ;
  if (v instanceof Not) {
    return "not";
  }
  ;
  throw new Error("Failed pattern match at Gramark.Desugar (line 309, column 12 - line 319, column 17): " + [v.constructor.name]);
};
var sugarDesugar = function(v) {
  var subSyms = function(s) {
    return cons(s)((function() {
      if (s instanceof Rep) {
        return subSyms(s.value0);
      }
      ;
      if (s instanceof Star) {
        return subSyms(s.value0);
      }
      ;
      if (s instanceof Opt) {
        return subSyms(s.value0);
      }
      ;
      if (s instanceof Field) {
        return subSyms(s.value1);
      }
      ;
      if (s instanceof Macro) {
        return concatMap(subSyms)(s.value1);
      }
      ;
      return [];
    })());
  };
  var sepRule = function(key) {
    return function(x) {
      return function(sep) {
        return new Rule(key, [], [new Alt([x], Nothing.value, new Just("\\x -> [x]")), new Alt([new Ref(key), sep, x], Nothing.value, new Just("\\xs _ x -> snoc xs x"))]);
      };
    };
  };
  var ruleAlts = function(v1) {
    return v1.value2;
  };
  var param = function(k) {
    return "p" + show2(k);
  };
  var wrap = function(presences) {
    return function(orig) {
      var consume = function(acc) {
        return {
          params: snoc(acc.params)(param(acc.k)),
          args: snoc(acc.args)(param(acc.k)),
          k: acc.k + 1 | 0
        };
      };
      var step = function($copy_acc) {
        return function($copy_v1) {
          var $tco_var_acc = $copy_acc;
          var $tco_done = false;
          var $tco_result;
          function $tco_loop(acc, v1) {
            if (v1.value0 instanceof Opt) {
              if (v1.value1) {
                $tco_done = true;
                return {
                  params: snoc(acc.params)(param(acc.k)),
                  args: snoc(acc.args)("(Just " + (param(acc.k) + ")")),
                  k: acc.k + 1 | 0
                };
              }
              ;
              $tco_done = true;
              return {
                k: acc.k,
                params: acc.params,
                args: snoc(acc.args)("Nothing")
              };
            }
            ;
            if (v1.value0 instanceof Star) {
              if (v1.value1) {
                $tco_done = true;
                return consume(acc);
              }
              ;
              $tco_done = true;
              return {
                k: acc.k,
                params: acc.params,
                args: snoc(acc.args)("[]")
              };
            }
            ;
            if (v1.value0 instanceof Field) {
              $tco_var_acc = acc;
              $copy_v1 = new Tuple(v1.value0.value1, v1.value1);
              return;
            }
            ;
            $tco_done = true;
            return consume(acc);
          }
          ;
          while (!$tco_done) {
            $tco_result = $tco_loop($tco_var_acc, $copy_v1);
          }
          ;
          return $tco_result;
        };
      };
      var r = foldl4(step)({
        params: [],
        args: [],
        k: 0
      })(presences);
      return "\\" + (joinWith(" ")(r.params) + (" -> (" + (orig + (") " + joinWith(" ")(r.args)))));
    };
  };
  var optStar = function($copy_v1) {
    var $tco_done1 = false;
    var $tco_result;
    function $tco_loop(v1) {
      if (v1 instanceof Opt) {
        $tco_done1 = true;
        return true;
      }
      ;
      if (v1 instanceof Star) {
        $tco_done1 = true;
        return true;
      }
      ;
      if (v1 instanceof Field) {
        $copy_v1 = v1.value1;
        return;
      }
      ;
      $tco_done1 = true;
      return false;
    }
    ;
    while (!$tco_done1) {
      $tco_result = $tco_loop($copy_v1);
    }
    ;
    return $tco_result;
  };
  var macroNameOf = function(name) {
    return function(args) {
      if (name === "Comma" && args.length === 1) {
        return baseName(args[0]) + "_comma";
      }
      ;
      if (name === "Sep" && args.length === 2) {
        return baseName(args[0]) + ("_sep_" + baseName(args[1]));
      }
      ;
      return name;
    };
  };
  var listName = function(s) {
    return baseName(s) + "_plus";
  };
  var lowerOne = function(v1) {
    if (v1 instanceof Rep) {
      return new Ref(listName(v1.value0));
    }
    ;
    if (v1 instanceof Macro) {
      return new Ref(macroNameOf(v1.value0)(v1.value1));
    }
    ;
    if (v1 instanceof Field) {
      return new Field(v1.value0, lowerOne(v1.value1));
    }
    ;
    return v1;
  };
  var listRule = function(s) {
    var inner = lowerOne(s);
    return new Rule(listName(s), [], [new Alt([inner], Nothing.value, new Just("\\x -> [x]")), new Alt([new Ref(listName(s)), inner], Nothing.value, new Just("\\xs x -> snoc xs x"))]);
  };
  var macroRule = function(v1) {
    if (v1.value0 === "Comma" && v1.value1.length === 1) {
      return new Right(new Tuple(macroNameOf(v1.value0)(v1.value1), sepRule(macroNameOf(v1.value0)(v1.value1))(lowerOne(v1["value1"][0]))(new Lit(","))));
    }
    ;
    if (v1.value0 === "Sep" && v1.value1.length === 2) {
      return new Right(new Tuple(macroNameOf(v1.value0)(v1.value1), sepRule(macroNameOf(v1.value0)(v1.value1))(lowerOne(v1["value1"][0]))(lowerOne(v1["value1"][1]))));
    }
    ;
    if (v1.value0 === "Comma") {
      return new Left("macro Comma<X> takes exactly one argument");
    }
    ;
    if (v1.value0 === "Sep") {
      return new Left("macro Sep<X, S> takes exactly two arguments");
    }
    ;
    return new Left("unknown macro " + (v1.value0 + "; known macros are Comma<X> and Sep<X, S>"));
  };
  var rhsOf2 = function(v1) {
    if (v1.value0 instanceof Opt) {
      if (v1.value1) {
        return [lowerOne(v1.value0.value0)];
      }
      ;
      return [];
    }
    ;
    if (v1.value0 instanceof Star) {
      if (v1.value1) {
        return [new Ref(listName(v1.value0.value0))];
      }
      ;
      return [];
    }
    ;
    if (v1.value0 instanceof Field) {
      return map10(Field.create(v1.value0.value0))(rhsOf2(new Tuple(v1.value0.value1, v1.value1)));
    }
    ;
    return [lowerOne(v1.value0)];
  };
  var listEntry = function(v1) {
    if (v1 instanceof Rep) {
      return new Just(new Tuple(listName(v1.value0), listRule(v1.value0)));
    }
    ;
    if (v1 instanceof Star) {
      return new Just(new Tuple(listName(v1.value0), listRule(v1.value0)));
    }
    ;
    return Nothing.value;
  };
  var assign = function(syms) {
    return function(flags) {
      var step = function(acc) {
        return function(sym2) {
          if (optStar(sym2)) {
            var v1 = uncons(acc.fs);
            if (v1 instanceof Just) {
              return {
                out: snoc(acc.out)(new Tuple(sym2, v1.value0.head)),
                fs: v1.value0.tail
              };
            }
            ;
            if (v1 instanceof Nothing) {
              return {
                fs: acc.fs,
                out: snoc(acc.out)(new Tuple(sym2, false))
              };
            }
            ;
            throw new Error("Failed pattern match at Gramark.Desugar (line 215, column 23 - line 217, column 72): " + [v1.constructor.name]);
          }
          ;
          if (otherwise) {
            return {
              fs: acc.fs,
              out: snoc(acc.out)(new Tuple(sym2, true))
            };
          }
          ;
          throw new Error("Failed pattern match at Gramark.Desugar (line 214, column 5 - line 218, column 70): " + [acc.constructor.name, sym2.constructor.name]);
        };
      };
      return foldl4(step)({
        out: [],
        fs: flags
      })(syms).out;
    };
  };
  var asMacro = function(v1) {
    if (v1 instanceof Macro) {
      return new Just(new Tuple(v1.value0, v1.value1));
    }
    ;
    return Nothing.value;
  };
  var altSyms = function(v1) {
    return v1.value0;
  };
  var everySym = concatMap(subSyms)(concatMap(altSyms)(concatMap(ruleAlts)(v)));
  var collectFresh = bind2(traverse2(macroRule)(mapMaybe(asMacro)(everySym)))(function(macroEntries) {
    return pure2(fromFoldable22(append1(mapMaybe(listEntry)(everySym))(macroEntries)));
  });
  var enumerateAlt = function(v1) {
    var action = map23(normalizeAction(v1.value0))(v1.value2);
    var build = function(presences) {
      var rhs = concatMap(rhsOf2)(presences);
      var $329 = $$null(rhs);
      if ($329) {
        return new Left("an all-optional alternative would be empty; keep at least one required symbol or refactor");
      }
      ;
      return new Right(new Alt(rhs, v1.value1, map23(wrap(presences))(action)));
    };
    var $330 = !any2(optStar)(v1.value0);
    if ($330) {
      return new Right([new Alt(map10(lowerOne)(v1.value0), v1.value1, action)]);
    }
    ;
    return traverse2(build)(map10(assign(v1.value0))(bools(length(filter(optStar)(v1.value0)))));
  };
  var lowerRule = function(v1) {
    return map13((function() {
      var $339 = Rule.create(v1.value0)(v1.value1);
      return function($340) {
        return $339(concat($340));
      };
    })())(traverse2(enumerateAlt)(v1.value2));
  };
  return bind2(collectFresh)(function(fresh) {
    return bind2(traverse2(lowerRule)(v))(function(lowered) {
      return pure2(append1(lowered)(fromFoldable32(values(fresh))));
    });
  });
};
var desugar = function(g) {
  return bind2(mapFlipped2(mapFlipped2(inlineExpand(g))(wildcardLower))(groupHoist))(sugarDesugar);
};

// ../output/Gramark.Table/index.js
var lookup3 = /* @__PURE__ */ lookup(ordString);
var member4 = /* @__PURE__ */ member2(ordString);
var eq4 = /* @__PURE__ */ eq(/* @__PURE__ */ eqMaybe(eqChar));
var map11 = /* @__PURE__ */ map(functorArray);
var foldl5 = /* @__PURE__ */ foldl(foldableArray);
var insert4 = /* @__PURE__ */ insert(ordString);
var foldlWithIndex2 = /* @__PURE__ */ foldlWithIndex(foldableWithIndexArray);
var fromFoldable5 = /* @__PURE__ */ fromFoldable3(foldableArray);
var fromFoldable12 = /* @__PURE__ */ fromFoldable5(ordString);
var bind3 = /* @__PURE__ */ bind(bindMaybe);
var compare3 = /* @__PURE__ */ compare(ordString);
var insertWith2 = /* @__PURE__ */ insertWith(ordString);
var foldl13 = /* @__PURE__ */ foldl(foldableList);
var max3 = /* @__PURE__ */ max(ordInt);
var lookup1 = /* @__PURE__ */ lookup(ordInt);
var ordRecord2 = /* @__PURE__ */ ordRecord();
var prodIsSymbol = {
  reflectSymbol: function() {
    return "prod";
  }
};
var ordRecordCons2 = /* @__PURE__ */ ordRecordCons(/* @__PURE__ */ ordRecordCons(ordRecordNil)()(prodIsSymbol)(ordInt))();
var lookIsSymbol = {
  reflectSymbol: function() {
    return "look";
  }
};
var dotIsSymbol = {
  reflectSymbol: function() {
    return "dot";
  }
};
var ordTuple2 = /* @__PURE__ */ ordTuple(ordInt);
var toUnfoldable4 = /* @__PURE__ */ toUnfoldable(unfoldableArray);
var toUnfoldable1 = /* @__PURE__ */ toUnfoldable3(unfoldableArray);
var union3 = /* @__PURE__ */ union2(ordInt);
var any4 = /* @__PURE__ */ any(foldableList)(heytingAlgebraBoolean);
var any1 = /* @__PURE__ */ any(foldableArray)(heytingAlgebraBoolean);
var ordTuple1 = /* @__PURE__ */ ordTuple2(/* @__PURE__ */ ordArray(ordInt));
var lookup22 = /* @__PURE__ */ lookup(ordTuple1);
var insert1 = /* @__PURE__ */ insert(ordInt);
var insert22 = /* @__PURE__ */ insert(ordTuple1);
var insertWith1 = /* @__PURE__ */ insertWith(ordInt);
var append3 = /* @__PURE__ */ append(semigroupArray);
var map14 = /* @__PURE__ */ map(functorMap);
var eq32 = /* @__PURE__ */ eq(/* @__PURE__ */ eqMap(eqInt)(eqInt));
var insert32 = /* @__PURE__ */ insert(/* @__PURE__ */ ordTuple2(ordString));
var ordRecord1 = /* @__PURE__ */ ordRecord2(/* @__PURE__ */ ordRecordCons2(dotIsSymbol)(ordInt));
var ordSet2 = /* @__PURE__ */ ordSet(ordRecord1);
var lookup32 = /* @__PURE__ */ lookup(ordSet2);
var insert42 = /* @__PURE__ */ insert(ordSet2);
var Canonical = /* @__PURE__ */ (function() {
  function Canonical2() {
  }
  ;
  Canonical2.value = new Canonical2();
  return Canonical2;
})();
var LALR = /* @__PURE__ */ (function() {
  function LALR2() {
  }
  ;
  LALR2.value = new LALR2();
  return LALR2;
})();
var IELR = /* @__PURE__ */ (function() {
  function IELR2() {
  }
  ;
  IELR2.value = new IELR2();
  return IELR2;
})();
var NonTerm = /* @__PURE__ */ (function() {
  function NonTerm2(value0) {
    this.value0 = value0;
  }
  ;
  NonTerm2.create = function(value0) {
    return new NonTerm2(value0);
  };
  return NonTerm2;
})();
var Term = /* @__PURE__ */ (function() {
  function Term2(value0) {
    this.value0 = value0;
  }
  ;
  Term2.create = function(value0) {
    return new Term2(value0);
  };
  return Term2;
})();
var EOF = /* @__PURE__ */ (function() {
  function EOF2() {
  }
  ;
  EOF2.value = new EOF2();
  return EOF2;
})();
var ShiftReduce = /* @__PURE__ */ (function() {
  function ShiftReduce2(value0) {
    this.value0 = value0;
  }
  ;
  ShiftReduce2.create = function(value0) {
    return new ShiftReduce2(value0);
  };
  return ShiftReduce2;
})();
var ReduceReduce = /* @__PURE__ */ (function() {
  function ReduceReduce2(value0) {
    this.value0 = value0;
  }
  ;
  ReduceReduce2.create = function(value0) {
    return new ReduceReduce2(value0);
  };
  return ReduceReduce2;
})();
var LeftA = /* @__PURE__ */ (function() {
  function LeftA2() {
  }
  ;
  LeftA2.value = new LeftA2();
  return LeftA2;
})();
var RightA = /* @__PURE__ */ (function() {
  function RightA2() {
  }
  ;
  RightA2.value = new RightA2();
  return RightA2;
})();
var NonA = /* @__PURE__ */ (function() {
  function NonA2() {
  }
  ;
  NonA2.value = new NonA2();
  return NonA2;
})();
var Shift = /* @__PURE__ */ (function() {
  function Shift2(value0) {
    this.value0 = value0;
  }
  ;
  Shift2.create = function(value0) {
    return new Shift2(value0);
  };
  return Shift2;
})();
var Reduce = /* @__PURE__ */ (function() {
  function Reduce2(value0) {
    this.value0 = value0;
  }
  ;
  Reduce2.create = function(value0) {
    return new Reduce2(value0);
  };
  return Reduce2;
})();
var Accept = /* @__PURE__ */ (function() {
  function Accept3() {
  }
  ;
  Accept3.value = new Accept3();
  return Accept3;
})();
var startSymbol = function(v) {
  return maybe("")(function(v1) {
    return v1.value0;
  })(head(v));
};
var setOf = function(k) {
  return function(m) {
    return fromMaybe(empty3)(lookup3(k)(m));
  };
};
var rhsOf = function(ctx) {
  return function(i) {
    return maybe([])(function(v) {
      return v.rhs;
    })(index(ctx.prods)(i));
  };
};
var resolve = function($copy_v) {
  return function($copy_v1) {
    var $tco_var_v = $copy_v;
    var $tco_done = false;
    var $tco_result;
    function $tco_loop(v, v1) {
      if (v1 instanceof Ref) {
        var $197 = member4(v1.value0)(v);
        if ($197) {
          $tco_done = true;
          return new NonTerm(v1.value0);
        }
        ;
        $tco_done = true;
        return new Term(v1.value0);
      }
      ;
      if (v1 instanceof Lit) {
        $tco_done = true;
        return new Term(v1.value0);
      }
      ;
      if (v1 instanceof Rep) {
        $tco_var_v = v;
        $copy_v1 = v1.value0;
        return;
      }
      ;
      if (v1 instanceof Star) {
        $tco_var_v = v;
        $copy_v1 = v1.value0;
        return;
      }
      ;
      if (v1 instanceof Opt) {
        $tco_var_v = v;
        $copy_v1 = v1.value0;
        return;
      }
      ;
      if (v1 instanceof Macro) {
        $tco_var_v = v;
        $copy_v1 = new Ref(v1.value0);
        return;
      }
      ;
      if (v1 instanceof Field) {
        $tco_var_v = v;
        $copy_v1 = v1.value1;
        return;
      }
      ;
      if (v1 instanceof Group) {
        $tco_done = true;
        return new Term("(group)");
      }
      ;
      if (v1 instanceof Any) {
        $tco_done = true;
        return new Term("(any)");
      }
      ;
      if (v1 instanceof Not) {
        $tco_done = true;
        return new Term("(not)");
      }
      ;
      throw new Error("Failed pattern match at Gramark.Table (line 163, column 1 - line 163, column 37): " + [v.constructor.name, v1.constructor.name]);
    }
    ;
    while (!$tco_done) {
      $tco_result = $tco_loop($tco_var_v, $copy_v1);
    }
    ;
    return $tco_result;
  };
};
var parsePrecedence = function(content) {
  var unquoteTok = function(tok) {
    var t = trim(tok);
    var n = length2(t);
    var $209 = n >= 2 && (eq4(charAt2(0)(t))(new Just("'")) || eq4(charAt2(0)(t))(new Just('"')));
    if ($209) {
      return new Just(slice2(1)(n - 1 | 0)(t));
    }
    ;
    return Nothing.value;
  };
  var meaningful = filter(function(l) {
    return l !== "" && l !== "gramark precedence";
  })(map11(trim)(split("\n")(content)));
  var literalsOf = function(line) {
    return mapMaybe(unquoteTok)(split(" ")(trim(line)));
  };
  var isPrefix = function(p) {
    return function(line) {
      var v = stripPrefix(p)(line);
      if (v instanceof Just) {
        return true;
      }
      ;
      if (v instanceof Nothing) {
        return false;
      }
      ;
      throw new Error("Failed pattern match at Gramark.Table (line 126, column 21 - line 128, column 21): " + [v.constructor.name]);
    };
  };
  var assocOf = function(line) {
    if (isPrefix("%left")(line)) {
      return new Just(LeftA.value);
    }
    ;
    if (isPrefix("%right")(line)) {
      return new Just(RightA.value);
    }
    ;
    if (isPrefix("%nonassoc")(line)) {
      return new Just(NonA.value);
    }
    ;
    if (otherwise) {
      return Nothing.value;
    }
    ;
    throw new Error("Failed pattern match at Gramark.Table (line 120, column 3 - line 124, column 26): " + [line.constructor.name]);
  };
  var addLine = function(level) {
    return function(acc) {
      return function(line) {
        var v = assocOf(line);
        if (v instanceof Nothing) {
          return acc;
        }
        ;
        if (v instanceof Just) {
          return foldl5(function(m) {
            return function(t) {
              return insert4(t)({
                level,
                assoc: v.value0
              })(m);
            };
          })(acc)(literalsOf(line));
        }
        ;
        throw new Error("Failed pattern match at Gramark.Table (line 116, column 28 - line 118, column 88): " + [v.constructor.name]);
      };
    };
  };
  return {
    terms: foldlWithIndex2(addLine)(empty2)(meaningful)
  };
};
var nontermSet = function(v) {
  return fromFoldable12(map11(function(v1) {
    return v1.value0;
  })(v));
};
var productions = function(v) {
  var nts = nontermSet(v);
  var ruleProds = function(v1) {
    return map11(function(v2) {
      return {
        lhs: v1.value0,
        rhs: map11(resolve(nts))(v2.value0)
      };
    })(v1.value2);
  };
  return concatMap(ruleProds)(v);
};
var lastTermOf = /* @__PURE__ */ (function() {
  var pick = function(acc) {
    return function(s) {
      if (s instanceof Term) {
        return new Just(s.value0);
      }
      ;
      return acc;
    };
  };
  return foldl2(pick)(Nothing.value);
})();
var prodPrecedence = function(ctx) {
  return function(i) {
    return bind3(lastTermOf(rhsOf(ctx)(i)))(function(t) {
      return lookup3(t)(ctx.prec.terms);
    });
  };
};
var resolvePrec = function(ctx) {
  return function(prodIdx) {
    return function(look) {
      return function(existing) {
        return function(newAct) {
          if (existing instanceof Shift && look instanceof Term) {
            return bind3(lookup3(look.value0)(ctx.prec.terms))(function(tp) {
              return bind3(prodPrecedence(ctx)(prodIdx))(function(pp) {
                var $233 = pp.level > tp.level;
                if ($233) {
                  return new Just(newAct);
                }
                ;
                var $234 = pp.level < tp.level;
                if ($234) {
                  return new Just(existing);
                }
                ;
                if (pp.assoc instanceof LeftA) {
                  return new Just(newAct);
                }
                ;
                if (pp.assoc instanceof RightA) {
                  return new Just(existing);
                }
                ;
                if (pp.assoc instanceof NonA) {
                  return Nothing.value;
                }
                ;
                throw new Error("Failed pattern match at Gramark.Table (line 450, column 10 - line 453, column 22): " + [pp.assoc.constructor.name]);
              });
            });
          }
          ;
          return Nothing.value;
        };
      };
    };
  };
};
var fixpoint = function(dictEq) {
  var eq62 = eq(dictEq);
  return function(step) {
    return function(x) {
      var x$prime = step(x);
      var $238 = eq62(x$prime)(x);
      if ($238) {
        return x;
      }
      ;
      return fixpoint(dictEq)(step)(x$prime);
    };
  };
};
var firstOfSymbol = function(firsts) {
  return function(v) {
    if (v instanceof Term) {
      return singleton7(new Term(v.value0));
    }
    ;
    if (v instanceof EOF) {
      return singleton7(EOF.value);
    }
    ;
    if (v instanceof NonTerm) {
      return setOf(v.value0)(firsts);
    }
    ;
    throw new Error("Failed pattern match at Gramark.Table (line 201, column 24 - line 204, column 30): " + [v.constructor.name]);
  };
};
var firstSeqThen = function(ctx) {
  return function(beta) {
    return function(a) {
      var v = head(beta);
      if (v instanceof Just) {
        return firstOfSymbol(ctx.firsts)(v.value0);
      }
      ;
      if (v instanceof Nothing) {
        return singleton7(a);
      }
      ;
      throw new Error("Failed pattern match at Gramark.Table (line 294, column 27 - line 296, column 29): " + [v.constructor.name]);
    };
  };
};
var eqSymbol = {
  eq: function(x) {
    return function(y) {
      if (x instanceof NonTerm && y instanceof NonTerm) {
        return x.value0 === y.value0;
      }
      ;
      if (x instanceof Term && y instanceof Term) {
        return x.value0 === y.value0;
      }
      ;
      if (x instanceof EOF && y instanceof EOF) {
        return true;
      }
      ;
      return false;
    };
  }
};
var fixpoint1 = /* @__PURE__ */ fixpoint(/* @__PURE__ */ eqMap(eqString)(/* @__PURE__ */ eqSet(eqSymbol)));
var fixpoint2 = /* @__PURE__ */ fixpoint(/* @__PURE__ */ eqSet(/* @__PURE__ */ eqRec()(/* @__PURE__ */ eqRowCons(/* @__PURE__ */ eqRowCons(/* @__PURE__ */ eqRowCons(eqRowNil)()(prodIsSymbol)(eqInt))()(lookIsSymbol)(eqSymbol))()(dotIsSymbol)(eqInt))));
var eq42 = /* @__PURE__ */ eq(eqSymbol);
var ordSymbol = {
  compare: function(x) {
    return function(y) {
      if (x instanceof NonTerm && y instanceof NonTerm) {
        return compare3(x.value0)(y.value0);
      }
      ;
      if (x instanceof NonTerm) {
        return LT.value;
      }
      ;
      if (y instanceof NonTerm) {
        return GT.value;
      }
      ;
      if (x instanceof Term && y instanceof Term) {
        return compare3(x.value0)(y.value0);
      }
      ;
      if (x instanceof Term) {
        return LT.value;
      }
      ;
      if (y instanceof Term) {
        return GT.value;
      }
      ;
      if (x instanceof EOF && y instanceof EOF) {
        return EQ.value;
      }
      ;
      throw new Error("Failed pattern match at Gramark.Table (line 0, column 0 - line 0, column 0): " + [x.constructor.name, y.constructor.name]);
    };
  },
  Eq0: function() {
    return eqSymbol;
  }
};
var union1 = /* @__PURE__ */ union2(ordSymbol);
var ordRecord22 = /* @__PURE__ */ ordRecord2(/* @__PURE__ */ ordRecordCons(/* @__PURE__ */ ordRecordCons2(lookIsSymbol)(ordSymbol))()(dotIsSymbol)(ordInt));
var union22 = /* @__PURE__ */ union2(ordRecord22);
var ordTuple22 = /* @__PURE__ */ ordTuple2(ordSymbol);
var insert5 = /* @__PURE__ */ insert(ordTuple22);
var ordSet1 = /* @__PURE__ */ ordSet(ordRecord22);
var insert6 = /* @__PURE__ */ insert(ordSet1);
var fromFoldable23 = /* @__PURE__ */ fromFoldable5(ordSymbol);
var insertWith22 = /* @__PURE__ */ insertWith(ordSymbol);
var member12 = /* @__PURE__ */ member2(ordSymbol);
var lookup4 = /* @__PURE__ */ lookup(ordTuple22);
var alter2 = /* @__PURE__ */ alter(ordTuple22);
var insert7 = /* @__PURE__ */ insert2(ordRecord22);
var fromFoldable33 = /* @__PURE__ */ fromFoldable5(ordRecord22);
var lookup5 = /* @__PURE__ */ lookup(ordSet1);
var firstStep = function(prods) {
  return function(m0) {
    var addProd = function(m) {
      return function(v) {
        var v1 = head(v.rhs);
        if (v1 instanceof Nothing) {
          return m;
        }
        ;
        if (v1 instanceof Just) {
          return insertWith2(union1)(v.lhs)(firstOfSymbol(m)(v1.value0))(m);
        }
        ;
        throw new Error("Failed pattern match at Gramark.Table (line 209, column 28 - line 211, column 65): " + [v1.constructor.name]);
      };
    };
    return foldl5(addProd)(m0)(prods);
  };
};
var firstSets = function(prods) {
  return fixpoint1(firstStep(prods))(empty2);
};
var followStep = function(firsts) {
  return function(start) {
    return function(prods) {
      return function(fl0) {
        var seeded = insertWith2(union1)(start)(singleton7(EOF.value))(fl0);
        var perPos = function(lhs) {
          return function(rhs) {
            return function(i) {
              return function(m) {
                return function(sym2) {
                  if (sym2 instanceof NonTerm) {
                    var v = index(rhs)(i + 1 | 0);
                    if (v instanceof Just) {
                      return insertWith2(union1)(sym2.value0)(firstOfSymbol(firsts)(v.value0))(m);
                    }
                    ;
                    if (v instanceof Nothing) {
                      return insertWith2(union1)(sym2.value0)(setOf(lhs)(m))(m);
                    }
                    ;
                    throw new Error("Failed pattern match at Gramark.Table (line 229, column 18 - line 232, column 60): " + [v.constructor.name]);
                  }
                  ;
                  return m;
                };
              };
            };
          };
        };
        var perProd = function(m) {
          return function(v) {
            return foldlWithIndex2(perPos(v.lhs)(v.rhs))(m)(v.rhs);
          };
        };
        return foldl5(perProd)(seeded)(prods);
      };
    };
  };
};
var followSets = function(firsts) {
  return function(start) {
    return function(prods) {
      return fixpoint1(followStep(firsts)(start)(prods))(empty2);
    };
  };
};
var fromPartition = function(canonical) {
  return function(part) {
    var numBlocks = 1 + foldl13(max3)(-1 | 0)(values(part)) | 0;
    var itemsOf = function(c) {
      return fromMaybe(empty3)(index(canonical.states)(c));
    };
    var ids = range2(0)(length(canonical.states) - 1 | 0);
    var blk = function(c) {
      return fromMaybe(-1 | 0)(lookup1(c)(part));
    };
    var blockItems = function(b) {
      return foldl5(function(acc) {
        return function(c) {
          var $274 = blk(c) === b;
          if ($274) {
            return union22(acc)(itemsOf(c));
          }
          ;
          return acc;
        };
      })(empty3)(ids);
    };
    var remap = function(acc) {
      return function(v) {
        return insert5(new Tuple(blk(v.value0.value0), v.value0.value1))(blk(v.value1))(acc);
      };
    };
    return {
      states: map11(blockItems)(range2(0)(numBlocks - 1 | 0)),
      index: foldlWithIndex2(function(i) {
        return function(m) {
          return function(s) {
            return insert6(s)(i)(m);
          };
        };
      })(empty2)(map11(blockItems)(range2(0)(numBlocks - 1 | 0))),
      trans: foldl5(remap)(empty2)(toUnfoldable4(canonical.trans))
    };
  };
};
var inadequate = function(ctx) {
  return function(items) {
    var shiftSym = function(it) {
      var v = index(rhsOf(ctx)(it.prod))(it.dot);
      if (v instanceof Just && v.value0 instanceof Term) {
        return new Just(new Term(v.value0.value0));
      }
      ;
      return Nothing.value;
    };
    var itemArr = toUnfoldable1(items);
    var shiftLooks = fromFoldable23(mapMaybe(shiftSym)(itemArr));
    var complete = filter(function(it) {
      return it.dot >= length(rhsOf(ctx)(it.prod));
    })(itemArr);
    var reduceByLook = foldl5(function(m) {
      return function(it) {
        return insertWith22(union3)(it.look)(singleton7(it.prod))(m);
      };
    })(empty2)(complete);
    var reduceReduce = any4(function(s) {
      return size2(s) > 1;
    })(values(reduceByLook));
    var shiftReduce = any1(function(it) {
      return member12(it.look)(shiftLooks);
    })(complete);
    return reduceReduce || shiftReduce;
  };
};
var refineOnce = function(ctx) {
  return function(canonical) {
    return function(symbols) {
      return function(part) {
        var renumber = function(sigs) {
          var step = function(c) {
            return function(acc) {
              return function(sig) {
                var nextId = size(acc.ids);
                var v = lookup22(sig)(acc.ids);
                if (v instanceof Just) {
                  return {
                    ids: acc.ids,
                    part: insert1(c)(v.value0)(acc.part)
                  };
                }
                ;
                if (v instanceof Nothing) {
                  return {
                    ids: insert22(sig)(nextId)(acc.ids),
                    part: insert1(c)(nextId)(acc.part)
                  };
                }
                ;
                throw new Error("Failed pattern match at Gramark.Table (line 584, column 22 - line 586, column 98): " + [v.constructor.name]);
              };
            };
          };
          return foldlWithIndex2(step)({
            ids: empty2,
            part: empty2
          })(sigs).part;
        };
        var itemsOf = function(c) {
          return fromMaybe(empty3)(index(canonical.states)(c));
        };
        var ids = range2(0)(length(canonical.states) - 1 | 0);
        var blk = function(c) {
          return fromMaybe(-1 | 0)(lookup1(c)(part));
        };
        var blockMembers = foldl5(function(m) {
          return function(c) {
            return insertWith1(append3)(blk(c))([c])(m);
          };
        })(empty2)(ids);
        var inadeqOf = map14(function(members) {
          return inadequate(ctx)(foldl5(function(acc) {
            return function(c) {
              return union22(acc)(itemsOf(c));
            };
          })(empty3)(members));
        })(blockMembers);
        var succBlk = function(c) {
          return function(x) {
            var v = lookup4(new Tuple(c, x))(canonical.trans);
            if (v instanceof Just) {
              return blk(v.value0);
            }
            ;
            if (v instanceof Nothing) {
              return -1 | 0;
            }
            ;
            throw new Error("Failed pattern match at Gramark.Table (line 571, column 17 - line 573, column 18): " + [v.constructor.name]);
          };
        };
        var sigOf = function(c) {
          var b = blk(c);
          var marker = (function() {
            var $288 = fromMaybe(false)(lookup1(b)(inadeqOf));
            if ($288) {
              return c;
            }
            ;
            return b;
          })();
          return new Tuple(marker, map11(succBlk(c))(symbols));
        };
        return renumber(map11(sigOf)(ids));
      };
    };
  };
};
var refineToFix = function($copy_ctx) {
  return function($copy_canonical) {
    return function($copy_symbols) {
      return function($copy_part) {
        var $tco_var_ctx = $copy_ctx;
        var $tco_var_canonical = $copy_canonical;
        var $tco_var_symbols = $copy_symbols;
        var $tco_done = false;
        var $tco_result;
        function $tco_loop(ctx, canonical, symbols, part) {
          var part$prime = refineOnce(ctx)(canonical)(symbols)(part);
          var $289 = eq32(part$prime)(part);
          if ($289) {
            $tco_done = true;
            return part;
          }
          ;
          $tco_var_ctx = ctx;
          $tco_var_canonical = canonical;
          $tco_var_symbols = symbols;
          $copy_part = part$prime;
          return;
        }
        ;
        while (!$tco_done) {
          $tco_result = $tco_loop($tco_var_ctx, $tco_var_canonical, $tco_var_symbols, $copy_part);
        }
        ;
        return $tco_result;
      };
    };
  };
};
var symbolsAfterDot = function(ctx) {
  return function(items) {
    var afterDot = function(it) {
      return index(rhsOf(ctx)(it.prod))(it.dot);
    };
    return toUnfoldable1(fromFoldable23(mapMaybe(afterDot)(toUnfoldable1(items))));
  };
};
var transSymbols = function(canonical) {
  var keySym = function(v) {
    return v.value0.value1;
  };
  var entries = toUnfoldable4(canonical.trans);
  return toUnfoldable1(fromFoldable23(map11(keySym)(entries)));
};
var eqAction = {
  eq: function(x) {
    return function(y) {
      if (x instanceof Shift && y instanceof Shift) {
        return x.value0 === y.value0;
      }
      ;
      if (x instanceof Reduce && y instanceof Reduce) {
        return x.value0 === y.value0;
      }
      ;
      if (x instanceof Accept && y instanceof Accept) {
        return true;
      }
      ;
      return false;
    };
  }
};
var elem4 = /* @__PURE__ */ elem2(eqAction);
var eq5 = /* @__PURE__ */ eq(eqAction);
var fillGlr = function(ctx) {
  return function(st) {
    return function(realProds) {
      var push2 = function(key) {
        return function(a) {
          return alter2(function(mb) {
            return new Just(maybe([a])(function(xs) {
              var $305 = elem4(a)(xs);
              if ($305) {
                return xs;
              }
              ;
              return snoc(xs)(a);
            })(mb));
          })(key);
        };
      };
      var addTrans = function(acc) {
        return function(v) {
          if (v.value0.value1 instanceof Term) {
            return {
              "goto": acc["goto"],
              action: push2(new Tuple(v.value0.value0, v.value0.value1))(new Shift(v.value1))(acc.action)
            };
          }
          ;
          if (v.value0.value1 instanceof NonTerm) {
            return {
              action: acc.action,
              "goto": insert32(new Tuple(v.value0.value0, v.value0.value1.value0))(v.value1)(acc["goto"])
            };
          }
          ;
          if (v.value0.value1 instanceof EOF) {
            return acc;
          }
          ;
          throw new Error("Failed pattern match at Gramark.Table (line 700, column 42 - line 703, column 15): " + [v.value0.value1.constructor.name]);
        };
      };
      var base = foldl5(addTrans)({
        action: empty2,
        "goto": empty2
      })(toUnfoldable4(st.trans));
      var addReduce = function(i) {
        return function(act) {
          return function(it) {
            var $315 = it.dot < length(rhsOf(ctx)(it.prod));
            if ($315) {
              return act;
            }
            ;
            return push2(new Tuple(i, it.look))((function() {
              var $316 = it.prod === 0;
              if ($316) {
                return Accept.value;
              }
              ;
              return new Reduce(it.prod - 1 | 0);
            })())(act);
          };
        };
      };
      var addReduces = function(i) {
        return function(act) {
          return function(items) {
            return foldl5(addReduce(i))(act)(toUnfoldable1(items));
          };
        };
      };
      return {
        action: foldlWithIndex2(addReduces)(base.action)(st.states),
        "goto": base["goto"],
        prods: realProds
      };
    };
  };
};
var fillTables = function(ctx) {
  return function(st) {
    return function(realProds) {
      var conflictAt = function(state) {
        return function(sym2) {
          return function(existing) {
            return function(newProd) {
              if (existing instanceof Shift) {
                return new ShiftReduce({
                  state,
                  onSymbol: sym2,
                  reduceProd: newProd
                });
              }
              ;
              if (existing instanceof Reduce) {
                return new ReduceReduce({
                  state,
                  onSymbol: sym2,
                  prodA: existing.value0,
                  prodB: newProd
                });
              }
              ;
              if (existing instanceof Accept) {
                return new ReduceReduce({
                  state,
                  onSymbol: sym2,
                  prodA: -1 | 0,
                  prodB: newProd
                });
              }
              ;
              throw new Error("Failed pattern match at Gramark.Table (line 433, column 43 - line 436, column 79): " + [existing.constructor.name]);
            };
          };
        };
      };
      var addTrans = function(acc) {
        return function(v) {
          if (v.value0.value1 instanceof Term) {
            return {
              "goto": acc["goto"],
              conflicts: acc.conflicts,
              action: insert5(new Tuple(v.value0.value0, v.value0.value1))(new Shift(v.value1))(acc.action)
            };
          }
          ;
          if (v.value0.value1 instanceof NonTerm) {
            return {
              action: acc.action,
              conflicts: acc.conflicts,
              "goto": insert32(new Tuple(v.value0.value0, v.value0.value1.value0))(v.value1)(acc["goto"])
            };
          }
          ;
          if (v.value0.value1 instanceof EOF) {
            return acc;
          }
          ;
          throw new Error("Failed pattern match at Gramark.Table (line 401, column 42 - line 404, column 15): " + [v.value0.value1.constructor.name]);
        };
      };
      var shifted = foldl5(addTrans)({
        action: empty2,
        "goto": empty2,
        conflicts: []
      })(toUnfoldable4(st.trans));
      var addReduce = function(i) {
        return function(acc) {
          return function(it) {
            var $329 = it.dot < length(rhsOf(ctx)(it.prod));
            if ($329) {
              return acc;
            }
            ;
            var newProd = it.prod - 1 | 0;
            var key = new Tuple(i, it.look);
            var act = (function() {
              var $330 = it.prod === 0;
              if ($330) {
                return Accept.value;
              }
              ;
              return new Reduce(it.prod - 1 | 0);
            })();
            var v = lookup4(key)(acc.action);
            if (v instanceof Nothing) {
              return {
                "goto": acc["goto"],
                conflicts: acc.conflicts,
                action: insert5(key)(act)(acc.action)
              };
            }
            ;
            if (v instanceof Just) {
              var $332 = eq5(v.value0)(act);
              if ($332) {
                return acc;
              }
              ;
              var v1 = resolvePrec(ctx)(it.prod)(it.look)(v.value0)(act);
              if (v1 instanceof Just) {
                return {
                  "goto": acc["goto"],
                  conflicts: acc.conflicts,
                  action: insert5(key)(v1.value0)(acc.action)
                };
              }
              ;
              if (v1 instanceof Nothing) {
                return {
                  action: acc.action,
                  "goto": acc["goto"],
                  conflicts: snoc(acc.conflicts)(conflictAt(i)(it.look)(v.value0)(newProd))
                };
              }
              ;
              throw new Error("Failed pattern match at Gramark.Table (line 423, column 18 - line 427, column 110): " + [v1.constructor.name]);
            }
            ;
            throw new Error("Failed pattern match at Gramark.Table (line 419, column 9 - line 427, column 110): " + [v.constructor.name]);
          };
        };
      };
      var addReduces = function(i) {
        return function(acc) {
          return function(items) {
            return foldl5(addReduce(i))(acc)(toUnfoldable1(items));
          };
        };
      };
      var filled = foldlWithIndex2(addReduces)(shifted)(st.states);
      var $336 = $$null(filled.conflicts);
      if ($336) {
        return new Right({
          action: filled.action,
          "goto": filled["goto"],
          prods: realProds
        });
      }
      ;
      return new Left(filled.conflicts);
    };
  };
};
var emptyPrec = {
  terms: empty2
};
var coreOf = /* @__PURE__ */ map9(ordRecord1)(function(it) {
  return {
    prod: it.prod,
    dot: it.dot
  };
});
var initialPartition = function(canonical) {
  var assign = function(i) {
    return function(acc) {
      return function(items) {
        var nextId = size(acc.coreToId);
        var core = coreOf(items);
        var v = lookup32(core)(acc.coreToId);
        if (v instanceof Just) {
          return {
            coreToId: acc.coreToId,
            part: insert1(i)(v.value0)(acc.part)
          };
        }
        ;
        if (v instanceof Nothing) {
          return {
            coreToId: insert42(core)(nextId)(acc.coreToId),
            part: insert1(i)(nextId)(acc.part)
          };
        }
        ;
        throw new Error("Failed pattern match at Gramark.Table (line 544, column 24 - line 546, column 107): " + [v.constructor.name]);
      };
    };
  };
  return foldlWithIndex2(assign)({
    coreToId: empty2,
    part: empty2
  })(canonical.states).part;
};
var mergeLALR = function(st) {
  var assign = function(i) {
    return function(acc) {
      return function(items) {
        var nextId = length(acc.states);
        var core = coreOf(items);
        var v = lookup32(core)(acc.coreToId);
        if (v instanceof Just) {
          return {
            coreToId: acc.coreToId,
            oldToNew: insert1(i)(v.value0)(acc.oldToNew),
            states: fromMaybe(acc.states)(modifyAt(v.value0)(union22(items))(acc.states))
          };
        }
        ;
        if (v instanceof Nothing) {
          return {
            coreToId: insert42(core)(nextId)(acc.coreToId),
            oldToNew: insert1(i)(nextId)(acc.oldToNew),
            states: snoc(acc.states)(items)
          };
        }
        ;
        throw new Error("Failed pattern match at Gramark.Table (line 497, column 24 - line 506, column 8): " + [v.constructor.name]);
      };
    };
  };
  var merged = foldlWithIndex2(assign)({
    coreToId: empty2,
    oldToNew: empty2,
    states: []
  })(st.states);
  var newId = function(k) {
    return fromMaybe(0)(lookup1(k)(merged.oldToNew));
  };
  var remap = function(acc) {
    return function(v) {
      return insert5(new Tuple(newId(v.value0.value0), v.value0.value1))(newId(v.value1))(acc);
    };
  };
  return {
    states: merged.states,
    index: foldlWithIndex2(function(i) {
      return function(m) {
        return function(s) {
          return insert6(s)(i)(m);
        };
      };
    })(empty2)(merged.states),
    trans: foldl5(remap)(empty2)(toUnfoldable4(st.trans))
  };
};
var closure = function(ctx) {
  var addItem = function(acc) {
    return function(it) {
      var v = index(rhsOf(ctx)(it.prod))(it.dot);
      if (v instanceof Just && v.value0 instanceof NonTerm) {
        var beta = drop(it.dot + 1 | 0)(rhsOf(ctx)(it.prod));
        var las = firstSeqThen(ctx)(beta)(it.look);
        var bProds = fromMaybe([])(lookup3(v.value0.value0)(ctx.byLhs));
        return foldl5(function(a1) {
          return function(pIdx) {
            return foldl5(function(a2) {
              return function(la) {
                return insert7({
                  prod: pIdx,
                  dot: 0,
                  look: la
                })(a2);
              };
            })(a1)(toUnfoldable1(las));
          };
        })(acc)(bProds);
      }
      ;
      return acc;
    };
  };
  var step = function(items) {
    return foldl5(addItem)(items)(toUnfoldable1(items));
  };
  return fixpoint2(step);
};
var $$goto = function(ctx) {
  return function(items) {
    return function(x) {
      var shift = function(it) {
        var v = index(rhsOf(ctx)(it.prod))(it.dot);
        if (v instanceof Just && eq42(v.value0)(x)) {
          return new Just({
            prod: it.prod,
            look: it.look,
            dot: it.dot + 1 | 0
          });
        }
        ;
        return Nothing.value;
      };
      var moved = mapMaybe(shift)(toUnfoldable1(items));
      return closure(ctx)(fromFoldable33(moved));
    };
  };
};
var buildStates = function(ctx) {
  var start = closure(ctx)(singleton7({
    prod: 0,
    dot: 0,
    look: EOF.value
  }));
  var initial = {
    states: [start],
    index: singleton6(start)(0),
    trans: empty2
  };
  var addState = function(st) {
    return function(items) {
      var v = lookup5(items)(st.index);
      if (v instanceof Just) {
        return new Tuple(st, v.value0);
      }
      ;
      if (v instanceof Nothing) {
        var j = length(st.states);
        return new Tuple({
          trans: st.trans,
          states: snoc(st.states)(items),
          index: insert6(items)(j)(st.index)
        }, j);
      }
      ;
      throw new Error("Failed pattern match at Gramark.Table (line 368, column 23 - line 374, column 98): " + [v.constructor.name]);
    };
  };
  var stepSym = function(items) {
    return function(i) {
      return function(st) {
        return function(x) {
          var g = $$goto(ctx)(items)(x);
          var $354 = isEmpty2(g);
          if ($354) {
            return st;
          }
          ;
          var v = addState(st)(g);
          return {
            states: v.value0.states,
            index: v.value0.index,
            trans: insert5(new Tuple(i, x))(v.value1)(v.value0.trans)
          };
        };
      };
    };
  };
  var process = function($copy_st) {
    return function($copy_i) {
      var $tco_var_st = $copy_st;
      var $tco_done = false;
      var $tco_result;
      function $tco_loop(st, i) {
        var $358 = i >= length(st.states);
        if ($358) {
          $tco_done = true;
          return st;
        }
        ;
        var v = index(st.states)(i);
        if (v instanceof Nothing) {
          $tco_done = true;
          return st;
        }
        ;
        if (v instanceof Just) {
          $tco_var_st = foldl5(stepSym(v.value0)(i))(st)(symbolsAfterDot(ctx)(v.value0));
          $copy_i = i + 1 | 0;
          return;
        }
        ;
        throw new Error("Failed pattern match at Gramark.Table (line 351, column 10 - line 353, column 93): " + [v.constructor.name]);
      }
      ;
      while (!$tco_done) {
        $tco_result = $tco_loop($tco_var_st, $copy_i);
      }
      ;
      return $tco_result;
    };
  };
  return process(initial)(0);
};
var buildIELR = function(ctx) {
  return function(canonical) {
    return fromPartition(canonical)(refineToFix(ctx)(canonical)(transSymbols(canonical))(initialPartition(canonical)));
  };
};
var analyze = function(g) {
  var start = startSymbol(g);
  var prods = productions(g);
  var firsts = firstSets(prods);
  return {
    prods,
    nonterminals: nontermSet(g),
    firsts,
    follows: followSets(firsts)(start)(prods),
    start
  };
};
var acceptName = "$accept";
var mkCtx = function(prec) {
  return function(a) {
    var aug = {
      lhs: acceptName,
      rhs: [new NonTerm(a.start)]
    };
    var prods = cons(aug)(a.prods);
    var byLhs = foldlWithIndex2(function(i) {
      return function(m) {
        return function(p) {
          return insertWith2(append3)(p.lhs)([i])(m);
        };
      };
    })(empty2)(prods);
    return {
      prods,
      byLhs,
      firsts: a.firsts,
      prec
    };
  };
};
var buildGlrTablesFor = function(method) {
  return function(g) {
    var a = analyze(g);
    var ctx = mkCtx(emptyPrec)(a);
    var canonical = buildStates(ctx);
    var states = (function() {
      if (method instanceof Canonical) {
        return canonical;
      }
      ;
      if (method instanceof LALR) {
        return mergeLALR(canonical);
      }
      ;
      if (method instanceof IELR) {
        return buildIELR(ctx)(canonical);
      }
      ;
      throw new Error("Failed pattern match at Gramark.Table (line 682, column 12 - line 685, column 36): " + [method.constructor.name]);
    })();
    return fillGlr(ctx)(states)(a.prods);
  };
};
var buildTablesForP = function(prec) {
  return function(method) {
    return function(g) {
      var a = analyze(g);
      var ctx = mkCtx(prec)(a);
      var canonical = buildStates(ctx);
      var states = (function() {
        if (method instanceof Canonical) {
          return canonical;
        }
        ;
        if (method instanceof LALR) {
          return mergeLALR(canonical);
        }
        ;
        if (method instanceof IELR) {
          return buildIELR(ctx)(canonical);
        }
        ;
        throw new Error("Failed pattern match at Gramark.Table (line 651, column 12 - line 654, column 36): " + [method.constructor.name]);
      })();
      return fillTables(ctx)(states)(a.prods);
    };
  };
};
var buildTablesFor = /* @__PURE__ */ buildTablesForP(emptyPrec);

// ../output/Gramark.Diagnostics/index.js
var map15 = /* @__PURE__ */ map(functorArray);
var show3 = /* @__PURE__ */ show(showInt);
var member5 = /* @__PURE__ */ member2(ordString);
var nub2 = /* @__PURE__ */ nub(ordString);
var sym = function(v) {
  if (v instanceof NonTerm) {
    return v.value0;
  }
  ;
  if (v instanceof Term) {
    return "`" + (v.value0 + "`");
  }
  ;
  if (v instanceof EOF) {
    return "$";
  }
  ;
  throw new Error("Failed pattern match at Gramark.Diagnostics (line 124, column 7 - line 127, column 13): " + [v.constructor.name]);
};
var refsOf = function(v) {
  if (v instanceof Ref) {
    return [v.value0];
  }
  ;
  if (v instanceof Lit) {
    return [];
  }
  ;
  if (v instanceof Rep) {
    return refsOf(v.value0);
  }
  ;
  if (v instanceof Star) {
    return refsOf(v.value0);
  }
  ;
  if (v instanceof Opt) {
    return refsOf(v.value0);
  }
  ;
  if (v instanceof Field) {
    return refsOf(v.value1);
  }
  ;
  if (v instanceof Macro) {
    return concatMap(refsOf)(v.value1);
  }
  ;
  if (v instanceof Group) {
    return concatMap(concatMap(refsOf))(v.value0);
  }
  ;
  if (v instanceof Any) {
    return [];
  }
  ;
  if (v instanceof Not) {
    return concatMap(refsOf)(v.value0);
  }
  ;
  throw new Error("Failed pattern match at Gramark.Diagnostics (line 52, column 10 - line 62, column 40): " + [v.constructor.name]);
};
var prodName = function(prods) {
  return function(i) {
    var v = index(prods)(i);
    if (v instanceof Just) {
      return v.value0.lhs + (" -> " + (function() {
        var $33 = $$null(v.value0.rhs);
        if ($33) {
          return "\u03B5";
        }
        ;
        return joinWith(" ")(map15(sym)(v.value0.rhs));
      })());
    }
    ;
    if (v instanceof Nothing) {
      return "accept (the start production)";
    }
    ;
    throw new Error("Failed pattern match at Gramark.Diagnostics (line 116, column 20 - line 119, column 45): " + [v.constructor.name]);
  };
};
var renderConflict = function(prods) {
  return function(v) {
    if (v instanceof ShiftReduce) {
      return "shift/reduce conflict in state " + (show3(v.value0.state) + (" on " + (sym(v.value0.onSymbol) + (":\n" + ("  shift " + (sym(v.value0.onSymbol) + ("  vs  reduce " + (prodName(prods)(v.value0.reduceProd) + ("\n" + ("  fix: give " + (sym(v.value0.onSymbol) + " a precedence in the `## Precedence` block, inline a rule, or enable GLR.")))))))))));
    }
    ;
    if (v instanceof ReduceReduce) {
      return "reduce/reduce conflict in state " + (show3(v.value0.state) + (" on " + (sym(v.value0.onSymbol) + (":\n" + ("  reduce " + (prodName(prods)(v.value0.prodA) + ("  vs  reduce " + (prodName(prods)(v.value0.prodB) + ("\n" + ("  fix: the rules are ambiguous on " + (sym(v.value0.onSymbol) + "; merge them into one rule, left-factor, or enable GLR.")))))))))));
    }
    ;
    throw new Error("Failed pattern match at Gramark.Diagnostics (line 85, column 24 - line 111, column 67): " + [v.constructor.name]);
  };
};
var renderConflicts = function(g) {
  return map15(renderConflict(productions(g)));
};
var isNonterminalName = function(name) {
  return toUpper(name) !== name;
};
var undefinedNonterminals = function(v) {
  var ruleAlts = function(v1) {
    return v1.value2;
  };
  var defined = nontermSet(v);
  var $$undefined = function(name) {
    return isNonterminalName(name) && !member5(name)(defined);
  };
  var altRefs = function(v1) {
    return concatMap(refsOf)(v1.value0);
  };
  return nub2(filter($$undefined)(concatMap(altRefs)(concatMap(ruleAlts)(v))));
};
var checkDefined = function(g) {
  var v = undefinedNonterminals(g);
  if (v.length === 0) {
    return new Right(g);
  }
  ;
  return new Left("undefined nonterminal" + ((function() {
    var $48 = length(v) === 1;
    if ($48) {
      return " ";
    }
    ;
    return "s ";
  })() + (joinWith(", ")(map15(function(n) {
    return "`" + (n + "`");
  })(v)) + ": a mixed-case name must be defined by some rule (an ALL-CAPS name is a lexer token class).")));
};

// ../output/Gramark.Parser/index.js
var show4 = /* @__PURE__ */ show(showString);
var show1 = /* @__PURE__ */ show(showInt);
var ordTuple3 = /* @__PURE__ */ ordTuple(ordInt);
var lookup6 = /* @__PURE__ */ lookup(/* @__PURE__ */ ordTuple3(ordString));
var lookup12 = /* @__PURE__ */ lookup(/* @__PURE__ */ ordTuple3(ordSymbol));
var UnexpectedToken = /* @__PURE__ */ (function() {
  function UnexpectedToken2(value0) {
    this.value0 = value0;
  }
  ;
  UnexpectedToken2.create = function(value0) {
    return new UnexpectedToken2(value0);
  };
  return UnexpectedToken2;
})();
var UnexpectedEnd = /* @__PURE__ */ (function() {
  function UnexpectedEnd2(value0) {
    this.value0 = value0;
  }
  ;
  UnexpectedEnd2.create = function(value0) {
    return new UnexpectedEnd2(value0);
  };
  return UnexpectedEnd2;
})();
var InternalError = /* @__PURE__ */ (function() {
  function InternalError2(value0) {
    this.value0 = value0;
  }
  ;
  InternalError2.create = function(value0) {
    return new InternalError2(value0);
  };
  return InternalError2;
})();
var showParseError = {
  show: function(v) {
    if (v instanceof UnexpectedToken) {
      return "unexpected token " + (show4(v.value0.terminal) + (" in state " + show1(v.value0.state)));
    }
    ;
    if (v instanceof UnexpectedEnd) {
      return "unexpected end of input in state " + show1(v.value0.state);
    }
    ;
    if (v instanceof InternalError) {
      return "internal parser error: " + v.value0;
    }
    ;
    throw new Error("Failed pattern match at Gramark.Parser (line 38, column 10 - line 41, column 54): " + [v.constructor.name]);
  }
};
var run3 = function(table) {
  return function(tokenVal2) {
    return function(reduce2) {
      return function(input) {
        var reduceStep = function(st) {
          return function(p) {
            var v = index(table.prods)(p);
            if (v instanceof Nothing) {
              return new Left(new InternalError("reduce by an unknown production"));
            }
            ;
            if (v instanceof Just) {
              var k = length(v.value0.rhs);
              var states$prime = drop(k)(st.states);
              var under = fromMaybe(0)(head(states$prime));
              var values$prime = drop(k)(st.values);
              var children = reverse(take(k)(st.values));
              var value = reduce2(p)(children);
              var v1 = lookup6(new Tuple(under, v.value0.lhs))(table["goto"]);
              if (v1 instanceof Just) {
                return new Right({
                  states: cons(v1.value0)(states$prime),
                  values: cons(value)(values$prime)
                });
              }
              ;
              if (v1 instanceof Nothing) {
                return new Left(new InternalError("missing goto after reduce"));
              }
              ;
              throw new Error("Failed pattern match at Gramark.Parser (line 96, column 9 - line 98, column 70): " + [v1.constructor.name]);
            }
            ;
            throw new Error("Failed pattern match at Gramark.Parser (line 85, column 21 - line 98, column 70): " + [v.constructor.name]);
          };
        };
        var go = function($copy_st) {
          return function($copy_pos) {
            var $tco_var_st = $copy_st;
            var $tco_done = false;
            var $tco_result;
            function $tco_loop(st, pos) {
              var state = fromMaybe(0)(head(st.states));
              var mtok = index(input)(pos);
              var look = (function() {
                if (mtok instanceof Just) {
                  return new Term(mtok.value0.terminal);
                }
                ;
                if (mtok instanceof Nothing) {
                  return EOF.value;
                }
                ;
                throw new Error("Failed pattern match at Gramark.Parser (line 61, column 14 - line 63, column 23): " + [mtok.constructor.name]);
              })();
              var v = lookup12(new Tuple(state, look))(table.action);
              if (v instanceof Just && v.value0 instanceof Shift) {
                if (mtok instanceof Just) {
                  $tco_var_st = {
                    states: cons(v.value0.value0)(st.states),
                    values: cons(tokenVal2(mtok.value0))(st.values)
                  };
                  $copy_pos = pos + 1 | 0;
                  return;
                }
                ;
                if (mtok instanceof Nothing) {
                  $tco_done = true;
                  return new Left(new InternalError("shift at end of input"));
                }
                ;
                throw new Error("Failed pattern match at Gramark.Parser (line 66, column 27 - line 73, column 66): " + [mtok.constructor.name]);
              }
              ;
              if (v instanceof Just && v.value0 instanceof Reduce) {
                var v1 = reduceStep(st)(v.value0.value0);
                if (v1 instanceof Right) {
                  $tco_var_st = v1.value0;
                  $copy_pos = pos;
                  return;
                }
                ;
                if (v1 instanceof Left) {
                  $tco_done = true;
                  return new Left(v1.value0);
                }
                ;
                throw new Error("Failed pattern match at Gramark.Parser (line 74, column 28 - line 76, column 27): " + [v1.constructor.name]);
              }
              ;
              if (v instanceof Just && v.value0 instanceof Accept) {
                var v1 = head(st.values);
                if (v1 instanceof Just) {
                  $tco_done = true;
                  return new Right(v1.value0);
                }
                ;
                if (v1 instanceof Nothing) {
                  $tco_done = true;
                  return new Left(new InternalError("accept with an empty stack"));
                }
                ;
                throw new Error("Failed pattern match at Gramark.Parser (line 77, column 24 - line 79, column 71): " + [v1.constructor.name]);
              }
              ;
              if (v instanceof Nothing) {
                if (mtok instanceof Just) {
                  $tco_done = true;
                  return new Left(new UnexpectedToken({
                    state,
                    terminal: mtok.value0.terminal
                  }));
                }
                ;
                if (mtok instanceof Nothing) {
                  $tco_done = true;
                  return new Left(new UnexpectedEnd({
                    state
                  }));
                }
                ;
                throw new Error("Failed pattern match at Gramark.Parser (line 80, column 20 - line 82, column 52): " + [mtok.constructor.name]);
              }
              ;
              throw new Error("Failed pattern match at Gramark.Parser (line 65, column 7 - line 82, column 52): " + [v.constructor.name]);
            }
            ;
            while (!$tco_done) {
              $tco_result = $tco_loop($tco_var_st, $copy_pos);
            }
            ;
            return $tco_result;
          };
        };
        return go({
          states: [0],
          values: []
        })(0);
      };
    };
  };
};

// ../output/Data.Char/index.js
var toCharCode2 = /* @__PURE__ */ fromEnum(boundedEnumChar);
var fromCharCode3 = /* @__PURE__ */ toEnum(boundedEnumChar);

// ../output/Gramark.Regex/index.js
var add2 = /* @__PURE__ */ add(semiringInt);
var eq6 = /* @__PURE__ */ eq(eqChar);
var foldl6 = /* @__PURE__ */ foldl(foldableArray);
var map16 = /* @__PURE__ */ map(functorArray);
var insertWith3 = /* @__PURE__ */ insertWith(ordInt);
var toUnfoldable5 = /* @__PURE__ */ toUnfoldable(unfoldableArray);
var member6 = /* @__PURE__ */ member(ordInt);
var append12 = /* @__PURE__ */ append(semigroupArray);
var map17 = /* @__PURE__ */ map(functorMap);
var bind4 = /* @__PURE__ */ bind(bindMaybe);
var bind1 = /* @__PURE__ */ bind(bindEither);
var notEq1 = /* @__PURE__ */ notEq(/* @__PURE__ */ eqMaybe(eqChar));
var show22 = /* @__PURE__ */ show(/* @__PURE__ */ showMaybe(showChar));
var show32 = /* @__PURE__ */ show(showInt);
var One = /* @__PURE__ */ (function() {
  function One2(value0) {
    this.value0 = value0;
  }
  ;
  One2.create = function(value0) {
    return new One2(value0);
  };
  return One2;
})();
var Range = /* @__PURE__ */ (function() {
  function Range2(value0, value1) {
    this.value0 = value0;
    this.value1 = value1;
  }
  ;
  Range2.create = function(value0) {
    return function(value1) {
      return new Range2(value0, value1);
    };
  };
  return Range2;
})();
var Empty = /* @__PURE__ */ (function() {
  function Empty2() {
  }
  ;
  Empty2.value = new Empty2();
  return Empty2;
})();
var Lit2 = /* @__PURE__ */ (function() {
  function Lit3(value0) {
    this.value0 = value0;
  }
  ;
  Lit3.create = function(value0) {
    return new Lit3(value0);
  };
  return Lit3;
})();
var AnyChar = /* @__PURE__ */ (function() {
  function AnyChar2() {
  }
  ;
  AnyChar2.value = new AnyChar2();
  return AnyChar2;
})();
var Class = /* @__PURE__ */ (function() {
  function Class2(value0, value1) {
    this.value0 = value0;
    this.value1 = value1;
  }
  ;
  Class2.create = function(value0) {
    return function(value1) {
      return new Class2(value0, value1);
    };
  };
  return Class2;
})();
var Concat = /* @__PURE__ */ (function() {
  function Concat2(value0) {
    this.value0 = value0;
  }
  ;
  Concat2.create = function(value0) {
    return new Concat2(value0);
  };
  return Concat2;
})();
var Alt2 = /* @__PURE__ */ (function() {
  function Alt3(value0) {
    this.value0 = value0;
  }
  ;
  Alt3.create = function(value0) {
    return new Alt3(value0);
  };
  return Alt3;
})();
var Star2 = /* @__PURE__ */ (function() {
  function Star3(value0) {
    this.value0 = value0;
  }
  ;
  Star3.create = function(value0) {
    return new Star3(value0);
  };
  return Star3;
})();
var Capture = /* @__PURE__ */ (function() {
  function Capture2(value0) {
    this.value0 = value0;
  }
  ;
  Capture2.create = function(value0) {
    return new Capture2(value0);
  };
  return Capture2;
})();
var swapCase = function(c) {
  if (c >= "a" && c <= "z") {
    return fromMaybe(c)(fromCharCode3(toCharCode2(c) - 32 | 0));
  }
  ;
  if (c >= "A" && c <= "Z") {
    return fromMaybe(c)(fromCharCode3(toCharCode2(c) + 32 | 0));
  }
  ;
  if (otherwise) {
    return c;
  }
  ;
  throw new Error("Failed pattern match at Gramark.Regex (line 344, column 1 - line 344, column 25): " + [c.constructor.name]);
};
var orElse = function(v) {
  return function(v1) {
    if (v instanceof Just) {
      return new Just(v.value0);
    }
    ;
    if (v instanceof Nothing) {
      return v1;
    }
    ;
    throw new Error("Failed pattern match at Gramark.Regex (line 334, column 1 - line 334, column 28): " + [v.constructor.name, v1.constructor.name]);
  };
};
var hexDigit = function(c) {
  if (c >= "0" && c <= "9") {
    return new Just(toCharCode2(c) - toCharCode2("0") | 0);
  }
  ;
  if (c >= "a" && c <= "f") {
    return new Just((10 + toCharCode2(c) | 0) - toCharCode2("a") | 0);
  }
  ;
  if (c >= "A" && c <= "F") {
    return new Just((10 + toCharCode2(c) | 0) - toCharCode2("A") | 0);
  }
  ;
  if (otherwise) {
    return Nothing.value;
  }
  ;
  throw new Error("Failed pattern match at Gramark.Regex (line 239, column 1 - line 239, column 30): " + [c.constructor.name]);
};
var countCaptures = /* @__PURE__ */ (function() {
  var sum2 = foldl6(add2)(0);
  return function(v) {
    if (v instanceof Capture) {
      return 1 + countCaptures(v.value0) | 0;
    }
    ;
    if (v instanceof Concat) {
      return sum2(map16(countCaptures)(v.value0));
    }
    ;
    if (v instanceof Alt2) {
      return sum2(map16(countCaptures)(v.value0));
    }
    ;
    if (v instanceof Star2) {
      return countCaptures(v.value0);
    }
    ;
    return 0;
  };
})();
var ciMatch = function(caseless) {
  return function(p) {
    return function(x) {
      return p(x) || caseless && p(swapCase(x));
    };
  };
};
var classMatch = function(caseless) {
  return function(neg) {
    return function(items) {
      return function(x) {
        var inItem = function(item) {
          return function(ch) {
            if (item instanceof One) {
              return ch === item.value0;
            }
            ;
            if (item instanceof Range) {
              return ch >= item.value0 && ch <= item.value1;
            }
            ;
            throw new Error("Failed pattern match at Gramark.Regex (line 357, column 20 - line 359, column 40): " + [item.constructor.name]);
          };
        };
        var hit = any2(function(item) {
          return ciMatch(caseless)(inItem(item))(x);
        })(items);
        if (neg) {
          return !hit;
        }
        ;
        return hit;
      };
    };
  };
};
var at = index;
var matchCap = function(caseless) {
  return function(rx) {
    return function(chars) {
      return function(start) {
        var step = function(acc) {
          return function(r) {
            return foldl6(function(out) {
              return function(v) {
                return foldl6(function(o) {
                  return function(v1) {
                    return insertWith3(orElse)(v1.value0)(orElse(v.value1)(v1.value1))(o);
                  };
                })(out)(toUnfoldable5(matchCap(caseless)(r)(chars)(v.value0)));
              };
            })(empty2)(toUnfoldable5(acc));
          };
        };
        var merge = function(a) {
          return function(b) {
            return foldl6(function(m) {
              return function(v) {
                return insertWith3(orElse)(v.value0)(v.value1)(m);
              };
            })(a)(toUnfoldable5(b));
          };
        };
        var lastKey = function(inner) {
          var v = findMax(matchCap(caseless)(inner)(chars)(start));
          if (v instanceof Just) {
            return v.value0.key;
          }
          ;
          if (v instanceof Nothing) {
            return start;
          }
          ;
          throw new Error("Failed pattern match at Gramark.Regex (line 304, column 19 - line 306, column 21): " + [v.constructor.name]);
        };
        var fst$prime = function(v) {
          return v.value0;
        };
        var closure2 = function(r) {
          var go = function($copy_visited) {
            return function($copy_frontier) {
              var $tco_var_visited = $copy_visited;
              var $tco_done = false;
              var $tco_result;
              function $tco_loop(visited, frontier) {
                var v = uncons(frontier);
                if (v instanceof Nothing) {
                  $tco_done = true;
                  return visited;
                }
                ;
                if (v instanceof Just) {
                  var nexts = matchCap(caseless)(r)(chars)(v.value0.head);
                  var fresh = toUnfoldable5(nexts);
                  var newKeys = filter(function(k) {
                    return !member6(k)(visited);
                  })(map16(fst$prime)(fresh));
                  $tco_var_visited = foldl6(function(m) {
                    return function(v1) {
                      return insertWith3(orElse)(v1.value0)(v1.value1)(m);
                    };
                  })(visited)(fresh);
                  $copy_frontier = append12(v.value0.tail)(newKeys);
                  return;
                }
                ;
                throw new Error("Failed pattern match at Gramark.Regex (line 321, column 27 - line 329, column 101): " + [v.constructor.name]);
              }
              ;
              while (!$tco_done) {
                $tco_result = $tco_loop($tco_var_visited, $copy_frontier);
              }
              ;
              return $tco_result;
            };
          };
          return go(singleton6(start)(Nothing.value))([start]);
        };
        var advance = function(pred) {
          var v = at(chars)(start);
          if (v instanceof Just && pred(v.value0)) {
            return singleton6(start + 1 | 0)(Nothing.value);
          }
          ;
          return empty2;
        };
        if (rx instanceof Empty) {
          return singleton6(start)(Nothing.value);
        }
        ;
        if (rx instanceof Lit2) {
          return advance(ciMatch(caseless)(eq6(rx.value0)));
        }
        ;
        if (rx instanceof AnyChar) {
          return advance(function(x) {
            return x !== "\n" && x !== "\r";
          });
        }
        ;
        if (rx instanceof Class) {
          return advance(classMatch(caseless)(rx.value0)(rx.value1));
        }
        ;
        if (rx instanceof Capture) {
          return map17(function(v) {
            return new Just(new Tuple(start, lastKey(rx.value0)));
          })(matchCap(caseless)(rx.value0)(chars)(start));
        }
        ;
        if (rx instanceof Concat) {
          return foldl6(step)(singleton6(start)(Nothing.value))(rx.value0);
        }
        ;
        if (rx instanceof Alt2) {
          return foldl6(function(acc) {
            return function(r) {
              return merge(acc)(matchCap(caseless)(r)(chars)(start));
            };
          })(empty2)(rx.value0);
        }
        ;
        if (rx instanceof Star2) {
          return closure2(rx.value0);
        }
        ;
        throw new Error("Failed pattern match at Gramark.Regex (line 288, column 36 - line 296, column 22): " + [rx.constructor.name]);
      };
    };
  };
};
var longestMatchSpan = function(caseless) {
  return function(rx) {
    return function(chars) {
      return function(start) {
        var v = findMax(matchCap(caseless)(rx)(chars)(start));
        if (v instanceof Nothing) {
          return Nothing.value;
        }
        ;
        if (v instanceof Just) {
          if (v.value0.value instanceof Just) {
            return new Just({
              end: v.value0.key,
              textStart: v.value0.value.value0.value0,
              textEnd: v.value0.value.value0.value1
            });
          }
          ;
          if (v.value0.value instanceof Nothing) {
            return new Just({
              end: v.value0.key,
              textStart: start,
              textEnd: v.value0.key
            });
          }
          ;
          throw new Error("Failed pattern match at Gramark.Regex (line 374, column 36 - line 376, column 60): " + [v.value0.value.constructor.name]);
        }
        ;
        throw new Error("Failed pattern match at Gramark.Regex (line 372, column 44 - line 376, column 60): " + [v.constructor.name]);
      };
    };
  };
};
var pInt = function(chars) {
  return function(pos) {
    var digit = function(c) {
      var $205 = c >= "0" && c <= "9";
      if ($205) {
        return new Just(toCharCode2(c) - toCharCode2("0") | 0);
      }
      ;
      return Nothing.value;
    };
    var go = function($copy_acc) {
      return function($copy_p) {
        var $tco_var_acc = $copy_acc;
        var $tco_done = false;
        var $tco_result;
        function $tco_loop(acc, p) {
          var v2 = bind4(at(chars)(p))(digit);
          if (v2 instanceof Just) {
            $tco_var_acc = (acc * 10 | 0) + v2.value0 | 0;
            $copy_p = p + 1 | 0;
            return;
          }
          ;
          if (v2 instanceof Nothing) {
            $tco_done = true;
            return new Tuple(acc, p);
          }
          ;
          throw new Error("Failed pattern match at Gramark.Regex (line 273, column 14 - line 275, column 27): " + [v2.constructor.name]);
        }
        ;
        while (!$tco_done) {
          $tco_result = $tco_loop($tco_var_acc, $copy_p);
        }
        ;
        return $tco_result;
      };
    };
    var v = bind4(at(chars)(pos))(digit);
    if (v instanceof Nothing) {
      return new Left("expected a number in a bounded repeat");
    }
    ;
    if (v instanceof Just) {
      return new Right(go(v.value0)(pos + 1 | 0));
    }
    ;
    throw new Error("Failed pattern match at Gramark.Regex (line 269, column 18 - line 271, column 37): " + [v.constructor.name]);
  };
};
var pBounded = function(atom) {
  return function(chars) {
    return function(p) {
      var exactly = function(n) {
        return new Concat(replicate(n)(atom));
      };
      var between = function(n) {
        return function(m) {
          return new Concat(append12(replicate(n)(atom))(replicate(m - n | 0)(new Alt2([atom, Empty.value]))));
        };
      };
      var atLeast = function(n) {
        return new Concat(snoc(replicate(n)(atom))(new Star2(atom)));
      };
      return bind1(pInt(chars)(p))(function(v) {
        var v1 = at(chars)(v.value1);
        if (v1 instanceof Just && v1.value0 === "}") {
          return new Right(new Tuple(exactly(v.value0), v.value1 + 1 | 0));
        }
        ;
        if (v1 instanceof Just && v1.value0 === ",") {
          var v2 = at(chars)(v.value1 + 1 | 0);
          if (v2 instanceof Just && v2.value0 === "}") {
            return new Right(new Tuple(atLeast(v.value0), v.value1 + 2 | 0));
          }
          ;
          return bind1(pInt(chars)(v.value1 + 1 | 0))(function(v3) {
            var v4 = at(chars)(v3.value1);
            if (v4 instanceof Just && v4.value0 === "}") {
              if (v3.value0 < v.value0) {
                return new Left("bounded repeat `{n,m}` has m < n");
              }
              ;
              if (otherwise) {
                return new Right(new Tuple(between(v.value0)(v3.value0), v3.value1 + 1 | 0));
              }
              ;
            }
            ;
            return new Left("expected `}` to close a bounded repeat");
          });
        }
        ;
        return new Left("expected `,` or `}` in a bounded repeat");
      });
    };
  };
};
var pUnicode = function(chars) {
  return function(p) {
    var hex = function($copy_i) {
      return function($copy_acc) {
        var $tco_var_i = $copy_i;
        var $tco_done = false;
        var $tco_result;
        function $tco_loop(i, acc) {
          if (i === 4) {
            $tco_done = true;
            return new Right(acc);
          }
          ;
          if (otherwise) {
            var v2 = bind4(at(chars)(p + i | 0))(hexDigit);
            if (v2 instanceof Just) {
              $tco_var_i = i + 1 | 0;
              $copy_acc = (acc * 16 | 0) + v2.value0 | 0;
              return;
            }
            ;
            if (v2 instanceof Nothing) {
              $tco_done = true;
              return new Left("`\\u` must be followed by four hex digits");
            }
            ;
            throw new Error("Failed pattern match at Gramark.Regex (line 235, column 19 - line 237, column 68): " + [v2.constructor.name]);
          }
          ;
          throw new Error("Failed pattern match at Gramark.Regex (line 233, column 3 - line 237, column 68): " + [i.constructor.name, acc.constructor.name]);
        }
        ;
        while (!$tco_done) {
          $tco_result = $tco_loop($tco_var_i, $copy_acc);
        }
        ;
        return $tco_result;
      };
    };
    var v = hex(0)(0);
    if (v instanceof Left) {
      return new Left(v.value0);
    }
    ;
    if (v instanceof Right) {
      var v1 = fromCharCode3(v.value0);
      if (v1 instanceof Just) {
        return new Right(new Tuple(v1.value0, p + 4 | 0));
      }
      ;
      if (v1 instanceof Nothing) {
        return new Left("invalid `\\uXXXX` code point");
      }
      ;
      throw new Error("Failed pattern match at Gramark.Regex (line 229, column 17 - line 231, column 51): " + [v1.constructor.name]);
    }
    ;
    throw new Error("Failed pattern match at Gramark.Regex (line 227, column 20 - line 231, column 51): " + [v.constructor.name]);
  };
};
var escChar = function(chars) {
  return function(p) {
    var v = at(chars)(p);
    if (v instanceof Nothing) {
      return new Left("trailing `\\` in regex");
    }
    ;
    if (v instanceof Just && v.value0 === "n") {
      return new Right(new Tuple("\n", p + 1 | 0));
    }
    ;
    if (v instanceof Just && v.value0 === "r") {
      return new Right(new Tuple("\r", p + 1 | 0));
    }
    ;
    if (v instanceof Just && v.value0 === "t") {
      return new Right(new Tuple("	", p + 1 | 0));
    }
    ;
    if (v instanceof Just && v.value0 === "u") {
      return pUnicode(chars)(p + 1 | 0);
    }
    ;
    if (v instanceof Just) {
      return new Right(new Tuple(v.value0, p + 1 | 0));
    }
    ;
    throw new Error("Failed pattern match at Gramark.Regex (line 218, column 19 - line 224, column 36): " + [v.constructor.name]);
  };
};
var classChar = function(chars) {
  return function(p) {
    var v = at(chars)(p);
    if (v instanceof Just && v.value0 === "\\") {
      return escChar(chars)(p + 1 | 0);
    }
    ;
    if (v instanceof Just) {
      return new Right(new Tuple(v.value0, p + 1 | 0));
    }
    ;
    if (v instanceof Nothing) {
      return new Left("unterminated character class `[`");
    }
    ;
    throw new Error("Failed pattern match at Gramark.Regex (line 210, column 21 - line 213, column 53): " + [v.constructor.name]);
  };
};
var pClass = function(chars) {
  return function(pos) {
    var go = function(acc) {
      return function(p) {
        return function(neg) {
          var v2 = at(chars)(p);
          if (v2 instanceof Nothing) {
            return new Left("unterminated character class `[`");
          }
          ;
          if (v2 instanceof Just && v2.value0 === "]") {
            return new Right(new Tuple(new Class(neg, acc), p + 1 | 0));
          }
          ;
          return bind1(classChar(chars)(p))(function(v1) {
            var v22 = at(chars)(v1.value1);
            if (v22 instanceof Just && (v22.value0 === "-" && (notEq1(at(chars)(v1.value1 + 1 | 0))(new Just("]")) && isJust(at(chars)(v1.value1 + 1 | 0))))) {
              return bind1(classChar(chars)(v1.value1 + 1 | 0))(function(v3) {
                return go(snoc(acc)(new Range(v1.value0, v3.value0)))(v3.value1)(neg);
              });
            }
            ;
            return go(snoc(acc)(new One(v1.value0)))(v1.value1)(neg);
          });
        };
      };
    };
    var v = (function() {
      var v1 = at(chars)(pos);
      if (v1 instanceof Just && v1.value0 === "^") {
        return new Tuple(true, pos + 1 | 0);
      }
      ;
      return new Tuple(false, pos);
    })();
    return go([])(v.value1)(v.value0);
  };
};
var pEscape = function(chars) {
  return function(pos) {
    var v = at(chars)(pos);
    if (v instanceof Nothing) {
      return new Left("trailing `\\` in regex");
    }
    ;
    if (v instanceof Just) {
      if (v.value0 >= "1" && v.value0 <= "9") {
        return new Left("backreferences (`\\1`\u2026) are not permitted");
      }
      ;
      if (otherwise) {
        var v1 = escChar(chars)(pos);
        if (v1 instanceof Left) {
          return new Left(v1.value0);
        }
        ;
        if (v1 instanceof Right) {
          return new Right(new Tuple(new Lit2(v1.value0.value0), v1.value0.value1));
        }
        ;
        throw new Error("Failed pattern match at Gramark.Regex (line 184, column 20 - line 186, column 55): " + [v1.constructor.name]);
      }
      ;
    }
    ;
    throw new Error("Failed pattern match at Gramark.Regex (line 180, column 21 - line 186, column 55): " + [v.constructor.name]);
  };
};
var pRepeat = function(chars) {
  return function(pos) {
    var guardGreedy = function(rx) {
      return function(p) {
        var v = at(chars)(p);
        if (v instanceof Just && v.value0 === "?") {
          return new Left("non-greedy quantifiers (`*?`, `+?`, `??`) are not permitted");
        }
        ;
        return new Right(new Tuple(rx, p));
      };
    };
    return bind1(pAtom(chars)(pos))(function(v) {
      var v1 = at(chars)(v.value1);
      if (v1 instanceof Just && v1.value0 === "*") {
        return guardGreedy(new Star2(v.value0))(v.value1 + 1 | 0);
      }
      ;
      if (v1 instanceof Just && v1.value0 === "+") {
        return guardGreedy(new Concat([v.value0, new Star2(v.value0)]))(v.value1 + 1 | 0);
      }
      ;
      if (v1 instanceof Just && v1.value0 === "?") {
        return guardGreedy(new Alt2([v.value0, Empty.value]))(v.value1 + 1 | 0);
      }
      ;
      if (v1 instanceof Just && v1.value0 === "{") {
        return bind1(pBounded(v.value0)(chars)(v.value1 + 1 | 0))(function(v2) {
          return guardGreedy(v2.value0)(v2.value1);
        });
      }
      ;
      return new Right(new Tuple(v.value0, v.value1));
    });
  };
};
var pConcat = function(chars) {
  return function(pos) {
    var concatOf = function(xs) {
      if (xs.length === 0) {
        return Empty.value;
      }
      ;
      if (xs.length === 1) {
        return xs[0];
      }
      ;
      return new Concat(xs);
    };
    var done = function(acc) {
      return function(p) {
        return new Right(new Tuple(concatOf(acc), p));
      };
    };
    var go = function(acc) {
      return function(p) {
        var v = at(chars)(p);
        if (v instanceof Nothing) {
          return done(acc)(p);
        }
        ;
        if (v instanceof Just && (v.value0 === "|" || v.value0 === ")")) {
          return done(acc)(p);
        }
        ;
        return bind1(pRepeat(chars)(p))(function(v1) {
          return go(snoc(acc)(v1.value0))(v1.value1);
        });
      };
    };
    return go([])(pos);
  };
};
var pAtom = function(chars) {
  return function(pos) {
    var v = at(chars)(pos);
    if (v instanceof Nothing) {
      return new Left("unexpected end of regex");
    }
    ;
    if (v instanceof Just && v.value0 === "(") {
      var v1 = at(chars)(pos + 1 | 0);
      if (v1 instanceof Just && v1.value0 === "?") {
        var v2 = at(chars)(pos + 2 | 0);
        if (v2 instanceof Just && v2.value0 === ":") {
          return bind1(pAlt(chars)(pos + 3 | 0))(function(v3) {
            var v4 = at(chars)(v3.value1);
            if (v4 instanceof Just && v4.value0 === ")") {
              return new Right(new Tuple(v3.value0, v3.value1 + 1 | 0));
            }
            ;
            return new Left("unclosed group `(?:`");
          });
        }
        ;
        return new Left("groups `(?\u2026)` (lookaround, named, conditional) are not permitted; use `(?:\u2026)` for non-capturing grouping");
      }
      ;
      return bind1(pAlt(chars)(pos + 1 | 0))(function(v22) {
        var v3 = at(chars)(v22.value1);
        if (v3 instanceof Just && v3.value0 === ")") {
          return new Right(new Tuple(new Capture(v22.value0), v22.value1 + 1 | 0));
        }
        ;
        return new Left("unclosed group `(`");
      });
    }
    ;
    if (v instanceof Just && v.value0 === "[") {
      return pClass(chars)(pos + 1 | 0);
    }
    ;
    if (v instanceof Just && v.value0 === ".") {
      return new Right(new Tuple(AnyChar.value, pos + 1 | 0));
    }
    ;
    if (v instanceof Just && v.value0 === "^") {
      return new Left("anchors `^` / `$` are not permitted (matching is anchored at the cursor)");
    }
    ;
    if (v instanceof Just && v.value0 === "$") {
      return new Left("anchors `^` / `$` are not permitted (matching is anchored at the cursor)");
    }
    ;
    if (v instanceof Just && v.value0 === "*") {
      return new Left("dangling quantifier `*`");
    }
    ;
    if (v instanceof Just && v.value0 === "+") {
      return new Left("dangling quantifier `+`");
    }
    ;
    if (v instanceof Just && v.value0 === "?") {
      return new Left("dangling quantifier `?`");
    }
    ;
    if (v instanceof Just && v.value0 === ")") {
      return new Left("unexpected `)`");
    }
    ;
    if (v instanceof Just && v.value0 === "\\") {
      return pEscape(chars)(pos + 1 | 0);
    }
    ;
    if (v instanceof Just) {
      return new Right(new Tuple(new Lit2(v.value0), pos + 1 | 0));
    }
    ;
    throw new Error("Failed pattern match at Gramark.Regex (line 152, column 19 - line 176, column 44): " + [v.constructor.name]);
  };
};
var pAlt = function(chars) {
  return function(pos) {
    var altOf = function(acc) {
      if (acc.length === 1) {
        return acc[0];
      }
      ;
      return new Alt2(acc);
    };
    var go = function(acc) {
      return function(p) {
        var v = at(chars)(p);
        if (v instanceof Just && v.value0 === "|") {
          return bind1(pConcat(chars)(p + 1 | 0))(function(v1) {
            return go(snoc(acc)(v1.value0))(v1.value1);
          });
        }
        ;
        return new Right(new Tuple(altOf(acc), p));
      };
    };
    return bind1(pConcat(chars)(pos))(function(v) {
      return go([v.value0])(v.value1);
    });
  };
};
var parseRegex = function(src) {
  var chars = toCharArray(src);
  var v = pAlt(chars)(0);
  if (v instanceof Left) {
    return new Left(v.value0);
  }
  ;
  if (v instanceof Right) {
    if (v.value0.value1 !== length(chars)) {
      return new Left("unexpected `" + (show22(at(chars)(v.value0.value1)) + ("` in regex at " + show32(v.value0.value1))));
    }
    ;
    if (countCaptures(v.value0.value0) > 1) {
      return new Left("at most one capturing group `( \u2026 )` per pattern; use `(?:\u2026)` for the rest");
    }
    ;
    if (otherwise) {
      return new Right(v.value0.value0);
    }
    ;
  }
  ;
  throw new Error("Failed pattern match at Gramark.Regex (line 80, column 5 - line 85, column 32): " + [v.constructor.name]);
};

// ../output/Gramark.Tokens/index.js
var show23 = /* @__PURE__ */ show(showChar);
var append13 = /* @__PURE__ */ append(semigroupArray);
var notEq12 = /* @__PURE__ */ notEq(/* @__PURE__ */ eqArray(eqChar));
var bind5 = /* @__PURE__ */ bind(bindEither);
var bind12 = /* @__PURE__ */ bind(bindMaybe);
var pure3 = /* @__PURE__ */ pure(applicativeEither);
var traverse3 = /* @__PURE__ */ traverse(traversableArray)(applicativeEither);
var map18 = /* @__PURE__ */ map(functorArray);
var Exact = /* @__PURE__ */ (function() {
  function Exact2(value0) {
    this.value0 = value0;
  }
  ;
  Exact2.create = function(value0) {
    return new Exact2(value0);
  };
  return Exact2;
})();
var Regex = /* @__PURE__ */ (function() {
  function Regex2(value0, value1) {
    this.value0 = value0;
    this.value1 = value1;
  }
  ;
  Regex2.create = function(value0) {
    return function(value1) {
      return new Regex2(value0, value1);
    };
  };
  return Regex2;
})();
var words = /* @__PURE__ */ (function() {
  var $116 = filter(function(v) {
    return v !== "";
  });
  var $117 = split(" ");
  return function($118) {
    return $116($117($118));
  };
})();
var validateName = function(name) {
  var isUpper = function(c) {
    return c >= "A" && c <= "Z";
  };
  var isClassChar = function(c) {
    return c >= "A" && c <= "Z" || (c >= "0" && c <= "9" || c === "_");
  };
  var cs = toCharArray(name);
  var v = uncons(cs);
  if (v instanceof Just && (isUpper(v.value0.head) && all2(isClassChar)(v.value0.tail))) {
    return new Right(name);
  }
  ;
  return new Left("token name must be ALL-CAPS `[A-Z][A-Z0-9_]*`: " + name);
};
var unescapeChar = function(v) {
  if (v === "n") {
    return "\n";
  }
  ;
  if (v === "r") {
    return "\r";
  }
  ;
  if (v === "t") {
    return "	";
  }
  ;
  return v;
};
var splitFirstColon = function(s) {
  var v = indexOf2(":")(s);
  if (v instanceof Nothing) {
    return Nothing.value;
  }
  ;
  if (v instanceof Just) {
    return new Just(new Tuple(take3(v.value0)(s), drop3(v.value0 + 1 | 0)(s)));
  }
  ;
  throw new Error("Failed pattern match at Gramark.Tokens (line 84, column 21 - line 86, column 67): " + [v.constructor.name]);
};
var readDelimited = function(delim) {
  return function($$unescape2) {
    return function(s) {
      var chars = toCharArray(s);
      var go = function($copy_i) {
        return function($copy_acc) {
          var $tco_var_i = $copy_i;
          var $tco_done = false;
          var $tco_result;
          function $tco_loop(i, acc) {
            var v = index(chars)(i);
            if (v instanceof Nothing) {
              $tco_done = true;
              return new Left("unterminated " + (show23(delim) + " in token definition"));
            }
            ;
            if (v instanceof Just) {
              if (v.value0 === delim) {
                $tco_done = true;
                return new Right(new Tuple(fromCharArray(acc), fromCharArray(drop(i + 1 | 0)(chars))));
              }
              ;
              if (v.value0 === "\\") {
                var v1 = index(chars)(i + 1 | 0);
                if (v1 instanceof Nothing) {
                  $tco_done = true;
                  return new Left("trailing backslash in token definition");
                }
                ;
                if (v1 instanceof Just) {
                  if ($$unescape2) {
                    $tco_var_i = i + 2 | 0;
                    $copy_acc = snoc(acc)(unescapeChar(v1.value0));
                    return;
                  }
                  ;
                  $tco_var_i = i + 2 | 0;
                  $copy_acc = append13(acc)([v.value0, v1.value0]);
                  return;
                }
                ;
                throw new Error("Failed pattern match at Gramark.Tokens (line 133, column 22 - line 137, column 49): " + [v1.constructor.name]);
              }
              ;
              if (otherwise) {
                $tco_var_i = i + 1 | 0;
                $copy_acc = snoc(acc)(v.value0);
                return;
              }
              ;
            }
            ;
            throw new Error("Failed pattern match at Gramark.Tokens (line 127, column 14 - line 138, column 51): " + [v.constructor.name]);
          }
          ;
          while (!$tco_done) {
            $tco_result = $tco_loop($tco_var_i, $copy_acc);
          }
          ;
          return $tco_result;
        };
      };
      return go(0)([]);
    };
  };
};
var parseIntStr = function(s) {
  var isDigit = function(c) {
    return c >= "0" && c <= "9";
  };
  var cs = toCharArray(s);
  var $70 = notEq12(cs)([]) && all2(isDigit)(cs);
  if ($70) {
    return new Just(foldl2(function(acc) {
      return function(c) {
        return (acc * 10 | 0) + (toCharCode2(c) - toCharCode2("0") | 0) | 0;
      };
    })(0)(cs));
  }
  ;
  return Nothing.value;
};
var parseDefinition = function(s) {
  var v = head(toCharArray(s));
  if (v instanceof Just && v.value0 === '"') {
    return bind5(readDelimited('"')(true)(drop3(1)(s)))(function(v1) {
      return new Right({
        pattern: new Exact(v1.value0),
        iflag: false,
        rest: trim(v1.value1)
      });
    });
  }
  ;
  if (v instanceof Just && v.value0 === "/") {
    return bind5(readDelimited("/")(false)(drop3(1)(s)))(function(v1) {
      var iflag = take3(1)(v1.value1) === "i";
      var rest$prime = trim((function() {
        if (iflag) {
          return drop3(1)(v1.value1);
        }
        ;
        return v1.value1;
      })());
      var v2 = parseRegex(v1.value0);
      if (v2 instanceof Left) {
        return new Left("invalid pattern /" + (v1.value0 + ("/: " + v2.value0)));
      }
      ;
      if (v2 instanceof Right) {
        return new Right({
          pattern: new Regex(v1.value0, v2.value0),
          iflag,
          rest: rest$prime
        });
      }
      ;
      throw new Error("Failed pattern match at Gramark.Tokens (line 115, column 5 - line 117, column 70): " + [v2.constructor.name]);
    });
  }
  ;
  return new Left('token definition must be a "string" or /regex/: ' + s);
};
var externalPass = function(w) {
  return bind12(stripPrefix("%external(")(w))(function(inner) {
    return stripSuffix(")")(inner);
  });
};
var parseModifiers = /* @__PURE__ */ (function() {
  var go = function($copy_acc) {
    return function($copy_ws) {
      var $tco_var_acc = $copy_acc;
      var $tco_done = false;
      var $tco_result;
      function $tco_loop(acc, ws) {
        var v = uncons(ws);
        if (v instanceof Nothing) {
          $tco_done = true;
          return new Right(acc);
        }
        ;
        if (v instanceof Just) {
          if (v.value0.head === "%skip") {
            $tco_var_acc = {
              caseless: acc.caseless,
              prec: acc.prec,
              external: acc.external,
              skip: true
            };
            $copy_ws = v.value0.tail;
            return;
          }
          ;
          if (v.value0.head === "%caseless") {
            $tco_var_acc = {
              skip: acc.skip,
              prec: acc.prec,
              external: acc.external,
              caseless: true
            };
            $copy_ws = v.value0.tail;
            return;
          }
          ;
          if (v.value0.head === "%prec") {
            var v1 = uncons(v.value0.tail);
            if (v1 instanceof Just) {
              var v2 = parseIntStr(v1.value0.head);
              if (v2 instanceof Just) {
                $tco_var_acc = {
                  skip: acc.skip,
                  caseless: acc.caseless,
                  external: acc.external,
                  prec: new Just(v2.value0)
                };
                $copy_ws = v1.value0.tail;
                return;
              }
              ;
              if (v2 instanceof Nothing) {
                $tco_done = true;
                return new Left("`%prec` expects a number, got: " + v1.value0.head);
              }
              ;
              throw new Error("Failed pattern match at Gramark.Tokens (line 159, column 43 - line 161, column 69): " + [v2.constructor.name]);
            }
            ;
            if (v1 instanceof Nothing) {
              $tco_done = true;
              return new Left("`%prec` expects a number");
            }
            ;
            throw new Error("Failed pattern match at Gramark.Tokens (line 158, column 28 - line 162, column 53): " + [v1.constructor.name]);
          }
          ;
        }
        ;
        var v1 = function(v22) {
          if (v instanceof Just && otherwise) {
            return new Left("unknown token modifier: " + v.value0.head);
          }
          ;
          throw new Error("Failed pattern match at Gramark.Tokens (line 150, column 1 - line 150, column 53): " + [v.constructor.name]);
        };
        if (v instanceof Just) {
          var $99 = externalPass(v.value0.head);
          if ($99 instanceof Just) {
            $tco_var_acc = {
              skip: acc.skip,
              caseless: acc.caseless,
              prec: acc.prec,
              external: new Just($99.value0)
            };
            $copy_ws = v.value0.tail;
            return;
          }
          ;
          $tco_done = true;
          return v1(true);
        }
        ;
        $tco_done = true;
        return v1(true);
      }
      ;
      while (!$tco_done) {
        $tco_result = $tco_loop($tco_var_acc, $copy_ws);
      }
      ;
      return $tco_result;
    };
  };
  return go({
    skip: false,
    prec: Nothing.value,
    external: Nothing.value,
    caseless: false
  });
})();
var parseLine = function(line) {
  var v = splitFirstColon(line);
  if (v instanceof Nothing) {
    return new Left("token line has no `:` separator: " + line);
  }
  ;
  if (v instanceof Just) {
    return bind5(validateName(trim(v.value0.value0)))(function(name) {
      return bind5(parseDefinition(trim(v.value0.value1)))(function(def) {
        return bind5(parseModifiers(words(def.rest)))(function(mods) {
          return pure3({
            name,
            pattern: def.pattern,
            skip: mods.skip,
            prec: mods.prec,
            external: mods.external,
            caseless: def.iflag || mods.caseless
          });
        });
      });
    });
  }
  ;
  throw new Error("Failed pattern match at Gramark.Tokens (line 66, column 18 - line 79, column 8): " + [v.constructor.name]);
};
var parseTokens = function(content) {
  var meaningful = function(line) {
    return line !== "" && line !== "gramark tokens";
  };
  return traverse3(parseLine)(filter(meaningful)(map18(trim)(split("\n")(content))));
};

// ../output/Gramark.Scanner/index.js
var map19 = /* @__PURE__ */ map(functorArray);
var append4 = /* @__PURE__ */ append(semigroupArray);
var scan = function(items) {
  return function(input) {
    var chars = toCharArray(input);
    var n = length(chars);
    var slice3 = function(a) {
      return function(b) {
        return fromCharArray(slice(a)(b)(chars));
      };
    };
    var toHit = function(pos) {
      return function(item) {
        var v = item.match(chars)(pos);
        if (v instanceof Just && v.value0.end > pos) {
          return new Just({
            item,
            span: v.value0
          });
        }
        ;
        return Nothing.value;
      };
    };
    var better = function(a) {
      return function(b) {
        if (a.span.end !== b.span.end) {
          var $22 = a.span.end > b.span.end;
          if ($22) {
            return a;
          }
          ;
          return b;
        }
        ;
        if (otherwise) {
          var $23 = a.item.priority <= b.item.priority;
          if ($23) {
            return a;
          }
          ;
          return b;
        }
        ;
        throw new Error("Failed pattern match at Gramark.Scanner (line 126, column 3 - line 128, column 70): " + [a.constructor.name, b.constructor.name]);
      };
    };
    var best = function(pos) {
      var hits = mapMaybe(toHit(pos))(items);
      var v = uncons(hits);
      if (v instanceof Nothing) {
        return Nothing.value;
      }
      ;
      if (v instanceof Just) {
        return new Just(foldl2(better)(v.value0.head)(v.value0.tail));
      }
      ;
      throw new Error("Failed pattern match at Gramark.Scanner (line 118, column 7 - line 120, column 67): " + [v.constructor.name]);
    };
    var go = function($copy_pos) {
      return function($copy_acc) {
        var $tco_var_pos = $copy_pos;
        var $tco_done = false;
        var $tco_result;
        function $tco_loop(pos, acc) {
          if (pos >= n) {
            $tco_done = true;
            return reverse(acc);
          }
          ;
          if (otherwise) {
            var v = best(pos);
            if (v instanceof Just) {
              var tok = {
                terminal: v.value0.item.terminal,
                text: slice3(v.value0.span.textStart)(v.value0.span.textEnd)
              };
              $tco_var_pos = v.value0.span.end;
              $copy_acc = (function() {
                if (v.value0.item.skip) {
                  return acc;
                }
                ;
                return cons(tok)(acc);
              })();
              return;
            }
            ;
            if (v instanceof Nothing) {
              $tco_var_pos = pos + 1 | 0;
              $copy_acc = cons({
                terminal: "ERROR",
                text: slice3(pos)(pos + 1 | 0)
              })(acc);
              return;
            }
            ;
            throw new Error("Failed pattern match at Gramark.Scanner (line 104, column 19 - line 111, column 89): " + [v.constructor.name]);
          }
          ;
          throw new Error("Failed pattern match at Gramark.Scanner (line 102, column 3 - line 111, column 89): " + [pos.constructor.name, acc.constructor.name]);
        }
        ;
        while (!$tco_done) {
          $tco_result = $tco_loop($tco_var_pos, $copy_acc);
        }
        ;
        return $tco_result;
      };
    };
    return go(0)([]);
  };
};
var hasError = /* @__PURE__ */ any2(function(t) {
  return t.terminal === "ERROR";
});
var exactMatch = function(caseless) {
  return function(pat) {
    return function(chars) {
      return function(pos) {
        var matchesAt = function(i) {
          if (i >= length(pat)) {
            return true;
          }
          ;
          if (otherwise) {
            var v = index(pat)(i);
            var v1 = index(chars)(pos + i | 0);
            if (v1 instanceof Just && v instanceof Just) {
              return (v1.value0 === v.value0 || caseless && swapCase(v1.value0) === v.value0) && matchesAt(i + 1 | 0);
            }
            ;
            return false;
          }
          ;
          throw new Error("Failed pattern match at Gramark.Scanner (line 86, column 3 - line 90, column 22): " + [i.constructor.name]);
        };
        var end = pos + length(pat) | 0;
        var $38 = matchesAt(0);
        if ($38) {
          return new Just({
            end,
            textStart: pos,
            textEnd: end
          });
        }
        ;
        return Nothing.value;
      };
    };
  };
};
var buildItems = function(defs) {
  return function(literals) {
    var priorityOf = function(base) {
      return function(v) {
        if (v instanceof Just) {
          return -v.value0 | 0;
        }
        ;
        if (v instanceof Nothing) {
          return base;
        }
        ;
        throw new Error("Failed pattern match at Gramark.Scanner (line 74, column 21 - line 76, column 20): " + [v.constructor.name]);
      };
    };
    var implicitItems = map19(function(lit) {
      return {
        terminal: lit,
        match: exactMatch(false)(toCharArray(lit)),
        skip: false,
        priority: 0
      };
    })(literals);
    var classItem = function(idx) {
      return function(def) {
        if (def.pattern instanceof Exact) {
          return {
            terminal: def.name,
            match: exactMatch(def.caseless)(toCharArray(def.pattern.value0)),
            skip: def.skip,
            priority: priorityOf(1)(def.prec)
          };
        }
        ;
        if (def.pattern instanceof Regex) {
          return {
            terminal: def.name,
            match: longestMatchSpan(def.caseless)(def.pattern.value1),
            skip: def.skip,
            priority: priorityOf(2 + idx | 0)(def.prec)
          };
        }
        ;
        throw new Error("Failed pattern match at Gramark.Scanner (line 60, column 23 - line 72, column 8): " + [def.pattern.constructor.name]);
      };
    };
    return append4(implicitItems)(mapWithIndex2(classItem)(defs));
  };
};

// ../output/Gramark.Lr/index.js
var foldl7 = /* @__PURE__ */ foldl(foldableArray);
var show5 = /* @__PURE__ */ show(showInt);
var all3 = /* @__PURE__ */ all(foldableArray)(heytingAlgebraBoolean);
var elem5 = /* @__PURE__ */ elem2(eqString);
var notEq13 = /* @__PURE__ */ notEq(/* @__PURE__ */ eqMaybe(eqChar));
var any5 = /* @__PURE__ */ any(foldableArray)(heytingAlgebraBoolean);
var append14 = /* @__PURE__ */ append(semigroupArray);
var show12 = /* @__PURE__ */ show(showParseError);
var bind6 = /* @__PURE__ */ bind(bindEither);
var map110 = /* @__PURE__ */ map(functorMaybe);
var VStr = /* @__PURE__ */ (function() {
  function VStr2(value0) {
    this.value0 = value0;
  }
  ;
  VStr2.create = function(value0) {
    return new VStr2(value0);
  };
  return VStr2;
})();
var VIgnore = /* @__PURE__ */ (function() {
  function VIgnore2() {
  }
  ;
  VIgnore2.value = new VIgnore2();
  return VIgnore2;
})();
var VSym = /* @__PURE__ */ (function() {
  function VSym2(value0) {
    this.value0 = value0;
  }
  ;
  VSym2.create = function(value0) {
    return new VSym2(value0);
  };
  return VSym2;
})();
var VSyms = /* @__PURE__ */ (function() {
  function VSyms2(value0) {
    this.value0 = value0;
  }
  ;
  VSyms2.create = function(value0) {
    return new VSyms2(value0);
  };
  return VSyms2;
})();
var VGroupBody = /* @__PURE__ */ (function() {
  function VGroupBody2(value0) {
    this.value0 = value0;
  }
  ;
  VGroupBody2.create = function(value0) {
    return new VGroupBody2(value0);
  };
  return VGroupBody2;
})();
var VMaybeStr = /* @__PURE__ */ (function() {
  function VMaybeStr2(value0) {
    this.value0 = value0;
  }
  ;
  VMaybeStr2.create = function(value0) {
    return new VMaybeStr2(value0);
  };
  return VMaybeStr2;
})();
var VAlt = /* @__PURE__ */ (function() {
  function VAlt2(value0) {
    this.value0 = value0;
  }
  ;
  VAlt2.create = function(value0) {
    return new VAlt2(value0);
  };
  return VAlt2;
})();
var VAlts = /* @__PURE__ */ (function() {
  function VAlts2(value0) {
    this.value0 = value0;
  }
  ;
  VAlts2.create = function(value0) {
    return new VAlts2(value0);
  };
  return VAlts2;
})();
var VRule = /* @__PURE__ */ (function() {
  function VRule2(value0) {
    this.value0 = value0;
  }
  ;
  VRule2.create = function(value0) {
    return new VRule2(value0);
  };
  return VRule2;
})();
var VRules = /* @__PURE__ */ (function() {
  function VRules2(value0) {
    this.value0 = value0;
  }
  ;
  VRules2.create = function(value0) {
    return new VRules2(value0);
  };
  return VRules2;
})();
var VGrammar = /* @__PURE__ */ (function() {
  function VGrammar2(value0) {
    this.value0 = value0;
  }
  ;
  VGrammar2.create = function(value0) {
    return new VGrammar2(value0);
  };
  return VGrammar2;
})();
var VErr = /* @__PURE__ */ (function() {
  function VErr2(value0) {
    this.value0 = value0;
  }
  ;
  VErr2.create = function(value0) {
    return new VErr2(value0);
  };
  return VErr2;
})();
var $$unescape = /* @__PURE__ */ (function() {
  var go = function(cs) {
    var v = uncons(cs);
    if (v instanceof Nothing) {
      return [];
    }
    ;
    if (v instanceof Just && v.value0.head === "\\") {
      var v1 = uncons(v.value0.tail);
      if (v1 instanceof Just) {
        return cons(v1.value0.head)(go(v1.value0.tail));
      }
      ;
      if (v1 instanceof Nothing) {
        return ["\\"];
      }
      ;
      throw new Error("Failed pattern match at Gramark.Lr (line 83, column 34 - line 85, column 26): " + [v1.constructor.name]);
    }
    ;
    if (v instanceof Just) {
      return cons(v.value0.head)(go(v.value0.tail));
    }
    ;
    throw new Error("Failed pattern match at Gramark.Lr (line 81, column 11 - line 86, column 53): " + [v.constructor.name]);
  };
  return function($282) {
    return fromCharArray(go(toCharArray($282)));
  };
})();
var unquoteLit = function(s) {
  var inner = slice2(1)(length2(s) - 1 | 0)(s);
  var v = charAt2(0)(s);
  if (v instanceof Just && v.value0 === "'") {
    return $$unescape(inner);
  }
  ;
  if (v instanceof Just && v.value0 === '"') {
    return $$unescape(inner);
  }
  ;
  return s;
};
var trimBlankEnds = /* @__PURE__ */ (function() {
  var dropBlank = dropWhile(function(l) {
    return trim(l) === "";
  });
  return function($283) {
    return reverse(dropBlank(reverse(dropBlank($283))));
  };
})();
var tokenVal = function(tok) {
  if (tok.terminal === "IDENT") {
    return new VStr(tok.text);
  }
  ;
  if (tok.terminal === "TERM_LIT") {
    return new VStr(unquoteLit(tok.text));
  }
  ;
  if (tok.terminal === "ACTION") {
    return new VStr(trim(tok.text));
  }
  ;
  if (tok.terminal === "LABEL") {
    return new VStr(tok.text);
  }
  ;
  if (tok.terminal === "ATTR") {
    return new VStr(tok.text);
  }
  ;
  return VIgnore.value;
};
var reduce = function(p) {
  return function(kids) {
    if (p === 0 && (kids.length === 1 && kids[0] instanceof VRules)) {
      return new VGrammar(kids[0].value0);
    }
    ;
    if (p === 1 && (kids.length === 1 && kids[0] instanceof VRule)) {
      return new VRules([kids[0].value0]);
    }
    ;
    if (p === 2 && (kids.length === 3 && (kids[0] instanceof VRules && kids[2] instanceof VRule))) {
      return new VRules(snoc(kids[0].value0)(kids[2].value0));
    }
    ;
    if (p === 3 && (kids.length === 5 && (kids[0] instanceof VStr && (kids[1] instanceof VStr && kids[4] instanceof VAlts)))) {
      return new VRule(new Rule(kids[1].value0, [kids[0].value0], kids[4].value0));
    }
    ;
    if (p === 4 && (kids.length === 4 && (kids[0] instanceof VStr && kids[3] instanceof VAlts))) {
      return new VRule(new Rule(kids[0].value0, [], kids[3].value0));
    }
    ;
    if (p === 5 && (kids.length === 1 && kids[0] instanceof VAlt)) {
      return new VAlts([kids[0].value0]);
    }
    ;
    if (p === 6 && (kids.length === 3 && (kids[0] instanceof VAlts && kids[2] instanceof VAlt))) {
      return new VAlts(snoc(kids[0].value0)(kids[2].value0));
    }
    ;
    if (p === 7 && (kids.length === 3 && (kids[0] instanceof VSyms && (kids[1] instanceof VMaybeStr && kids[2] instanceof VMaybeStr)))) {
      return new VAlt(new Alt(kids[0].value0, kids[1].value0, kids[2].value0));
    }
    ;
    if (p === 8 && (kids.length === 2 && (kids[0] instanceof VSyms && kids[1] instanceof VMaybeStr))) {
      return new VAlt(new Alt(kids[0].value0, kids[1].value0, Nothing.value));
    }
    ;
    if (p === 9 && (kids.length === 2 && (kids[0] instanceof VSyms && kids[1] instanceof VMaybeStr))) {
      return new VAlt(new Alt(kids[0].value0, Nothing.value, kids[1].value0));
    }
    ;
    if (p === 10 && (kids.length === 1 && kids[0] instanceof VSyms)) {
      return new VAlt(new Alt(kids[0].value0, Nothing.value, Nothing.value));
    }
    ;
    if (p === 11 && (kids.length === 1 && kids[0] instanceof VSym)) {
      return new VSyms([kids[0].value0]);
    }
    ;
    if (p === 12 && (kids.length === 2 && (kids[0] instanceof VSyms && kids[1] instanceof VSym))) {
      return new VSyms(snoc(kids[0].value0)(kids[1].value0));
    }
    ;
    if (p === 13 && (kids.length === 1 && kids[0] instanceof VStr)) {
      return new VSym(new Ref(kids[0].value0));
    }
    ;
    if (p === 14 && (kids.length === 1 && kids[0] instanceof VStr)) {
      return new VSym(new Lit(kids[0].value0));
    }
    ;
    if (p === 15 && (kids.length === 2 && kids[0] instanceof VStr)) {
      return new VSym(new Rep(new Ref(kids[0].value0)));
    }
    ;
    if (p === 16 && (kids.length === 2 && kids[0] instanceof VStr)) {
      return new VSym(new Rep(new Lit(kids[0].value0)));
    }
    ;
    if (p === 17 && (kids.length === 2 && kids[0] instanceof VStr)) {
      return new VSym(new Star(new Ref(kids[0].value0)));
    }
    ;
    if (p === 18 && (kids.length === 2 && kids[0] instanceof VStr)) {
      return new VSym(new Star(new Lit(kids[0].value0)));
    }
    ;
    if (p === 19 && (kids.length === 2 && kids[0] instanceof VStr)) {
      return new VSym(new Opt(new Ref(kids[0].value0)));
    }
    ;
    if (p === 20 && (kids.length === 2 && kids[0] instanceof VStr)) {
      return new VSym(new Opt(new Lit(kids[0].value0)));
    }
    ;
    if (p === 21 && (kids.length === 4 && (kids[0] instanceof VStr && kids[2] instanceof VSyms))) {
      return new VSym(new Macro(kids[0].value0, kids[2].value0));
    }
    ;
    if (p === 22 && (kids.length === 3 && (kids[0] instanceof VStr && kids[2] instanceof VSym))) {
      return new VSym(new Field(kids[0].value0, kids[2].value0));
    }
    ;
    if (p === 23 && (kids.length === 3 && kids[1] instanceof VGroupBody)) {
      return new VSym(new Group(kids[1].value0));
    }
    ;
    if (p === 24 && (kids.length === 4 && kids[1] instanceof VGroupBody)) {
      return new VSym(new Rep(new Group(kids[1].value0)));
    }
    ;
    if (p === 25 && (kids.length === 4 && kids[1] instanceof VGroupBody)) {
      return new VSym(new Star(new Group(kids[1].value0)));
    }
    ;
    if (p === 26 && (kids.length === 4 && kids[1] instanceof VGroupBody)) {
      return new VSym(new Opt(new Group(kids[1].value0)));
    }
    ;
    if (p === 27 && (kids.length === 1 && kids[0] instanceof VSym)) {
      return new VSym(kids[0].value0);
    }
    ;
    if (p === 28 && (kids.length === 2 && kids[0] instanceof VSym)) {
      return new VSym(new Rep(kids[0].value0));
    }
    ;
    if (p === 29 && (kids.length === 2 && kids[0] instanceof VSym)) {
      return new VSym(new Star(kids[0].value0));
    }
    ;
    if (p === 30 && (kids.length === 2 && kids[0] instanceof VSym)) {
      return new VSym(new Opt(kids[0].value0));
    }
    ;
    if (p === 31 && (kids.length === 1 && kids[0] instanceof VSym)) {
      return new VSyms([kids[0].value0]);
    }
    ;
    if (p === 32 && (kids.length === 3 && (kids[0] instanceof VSyms && kids[2] instanceof VSym))) {
      return new VSyms(snoc(kids[0].value0)(kids[2].value0));
    }
    ;
    if (p === 33 && (kids.length === 1 && kids[0] instanceof VStr)) {
      return new VMaybeStr(new Just(kids[0].value0));
    }
    ;
    if (p === 34 && (kids.length === 1 && kids[0] instanceof VStr)) {
      return new VMaybeStr(new Just(kids[0].value0));
    }
    ;
    if (p === 35 && (kids.length === 1 && kids[0] instanceof VSyms)) {
      return new VGroupBody([kids[0].value0]);
    }
    ;
    if (p === 36 && (kids.length === 3 && (kids[0] instanceof VGroupBody && kids[2] instanceof VSyms))) {
      return new VGroupBody(snoc(kids[0].value0)(kids[2].value0));
    }
    ;
    if (p === 37 && kids.length === 1) {
      return new VSym(Any.value);
    }
    ;
    if (p === 38 && (kids.length === 2 && kids[1] instanceof VSyms)) {
      return new VSym(new Not(kids[1].value0));
    }
    ;
    if (p === 39 && (kids.length === 1 && kids[0] instanceof VSym)) {
      return new VSyms([kids[0].value0]);
    }
    ;
    if (p === 40 && (kids.length === 3 && kids[1] instanceof VSyms)) {
      return new VSyms(kids[1].value0);
    }
    ;
    if (p === 41 && (kids.length === 1 && kids[0] instanceof VSym)) {
      return new VSyms([kids[0].value0]);
    }
    ;
    if (p === 42 && (kids.length === 3 && (kids[0] instanceof VSyms && kids[2] instanceof VSym))) {
      return new VSyms(snoc(kids[0].value0)(kids[2].value0));
    }
    ;
    if (p === 43 && (kids.length === 1 && kids[0] instanceof VStr)) {
      return new VSym(new Ref(kids[0].value0));
    }
    ;
    if (p === 44 && (kids.length === 1 && kids[0] instanceof VStr)) {
      return new VSym(new Lit(kids[0].value0));
    }
    ;
    return new VErr("unexpected reduce shape for production " + show5(p));
  };
};
var normalizeLang = function(raw) {
  var isDigit = function(c) {
    return c >= "0" && c <= "9";
  };
  var prefixThenDigits = function(p) {
    return function(l2) {
      var v = stripPrefix(p)(l2);
      if (v instanceof Just) {
        return v.value0 !== "" && all3(isDigit)(toCharArray(v.value0));
      }
      ;
      if (v instanceof Nothing) {
        return false;
      }
      ;
      throw new Error("Failed pattern match at Gramark.Lr (line 412, column 26 - line 414, column 21): " + [v.constructor.name]);
    };
  };
  var isJs = function(l2) {
    return elem5(l2)(["js", "javascript", "jsx", "mjs", "cjs", "ecmascript", "esnext"]) || (prefixThenDigits("es")(l2) || prefixThenDigits("ecmascript")(l2));
  };
  var l = toLower(trim(raw));
  var $252 = isJs(l);
  if ($252) {
    return "js";
  }
  ;
  return l;
};
var lrScanItems = /* @__PURE__ */ buildItems(/* @__PURE__ */ fromRight([])(/* @__PURE__ */ parseTokens(lrTokensSource)))([":", "|", "(", ")", ".", "~"]);
var lrBlocks = function(md) {
  var scan2 = function(acc) {
    return function(line) {
      if (acc.inside) {
        var $254 = trim(line) === "```";
        if ($254) {
          return {
            inside: false,
            cur: [],
            blocks: snoc(acc.blocks)(joinWith("\n")(acc.cur))
          };
        }
        ;
        return {
          blocks: acc.blocks,
          inside: acc.inside,
          cur: snoc(acc.cur)(line)
        };
      }
      ;
      var $255 = trim(line) === "```gramark";
      if ($255) {
        return {
          blocks: acc.blocks,
          inside: true,
          cur: []
        };
      }
      ;
      return acc;
    };
  };
  return foldl7(scan2)({
    inside: false,
    cur: [],
    blocks: []
  })(split("\n")(md)).blocks;
};
var isUpperName = function(name) {
  var classChar2 = function(c) {
    return c >= "A" && c <= "Z" || (c >= "0" && c <= "9" || c === "_");
  };
  return !contains(" ")(name) && (all3(classChar2)(toCharArray(name)) && (function() {
    var v = charAt2(0)(name);
    if (v instanceof Just) {
      return v.value0 >= "A" && v.value0 <= "Z";
    }
    ;
    if (v instanceof Nothing) {
      return false;
    }
    ;
    throw new Error("Failed pattern match at Gramark.Lr (line 312, column 8 - line 314, column 23): " + [v.constructor.name]);
  })());
};
var isTokenDef = function(l) {
  return notEq13(charAt2(0)(l))(new Just(" ")) && (notEq13(charAt2(0)(l))(new Just("	")) && (function() {
    var v = indexOf2(":")(l);
    if (v instanceof Nothing) {
      return false;
    }
    ;
    if (v instanceof Just) {
      return isUpperName(trim(take3(v.value0)(l)));
    }
    ;
    throw new Error("Failed pattern match at Gramark.Lr (line 304, column 8 - line 306, column 46): " + [v.constructor.name]);
  })());
};
var isSettingDecl = function(l) {
  return isJust(stripPrefix("%lang ")(trim(l)));
};
var isPrecDecl = function(l) {
  var t = trim(l);
  return any5(function(p) {
    return isJust(stripPrefix(p)(t));
  })(["%left ", "%right ", "%nonassoc "]);
};
var gramarkBlocks = function(md) {
  var step = function(acc) {
    return function(line) {
      if (acc.inside) {
        var $261 = trim(line) === "```";
        if ($261) {
          return {
            info: acc.info,
            cur: acc.cur,
            inside: false,
            out: snoc(acc.out)({
              info: acc.info,
              content: joinWith("\n")(acc.cur)
            })
          };
        }
        ;
        return {
          info: acc.info,
          inside: acc.inside,
          out: acc.out,
          cur: snoc(acc.cur)(line)
        };
      }
      ;
      var v = stripPrefix("```gramark")(trim(line));
      if (v instanceof Just) {
        return {
          out: acc.out,
          inside: true,
          info: trim(v.value0),
          cur: []
        };
      }
      ;
      if (v instanceof Nothing) {
        return acc;
      }
      ;
      throw new Error("Failed pattern match at Gramark.Lr (line 167, column 10 - line 169, column 21): " + [v.constructor.name]);
    };
  };
  return foldl7(step)({
    inside: false,
    info: "",
    cur: [],
    out: []
  })(split("\n")(md)).out;
};
var precedenceOf = function(md) {
  var v = find2(function(b) {
    return b.info === "precedence";
  })(gramarkBlocks(md));
  if (v instanceof Just) {
    return parsePrecedence(v.value0.content);
  }
  ;
  if (v instanceof Nothing) {
    return emptyPrec;
  }
  ;
  throw new Error("Failed pattern match at Gramark.Lr (line 383, column 19 - line 385, column 23): " + [v.constructor.name]);
};
var decomment = function(ls) {
  var step = function(acc) {
    return function(line) {
      var t = trim(line);
      if (acc.inBlock) {
        var $267 = contains("*/")(t);
        if ($267) {
          return {
            out: acc.out,
            inBlock: false
          };
        }
        ;
        return acc;
      }
      ;
      var $268 = isJust(stripPrefix("//")(t));
      if ($268) {
        return acc;
      }
      ;
      var $269 = isJust(stripPrefix("/*")(t));
      if ($269) {
        var $270 = contains("*/")(t);
        if ($270) {
          return acc;
        }
        ;
        return {
          out: acc.out,
          inBlock: true
        };
      }
      ;
      return {
        inBlock: acc.inBlock,
        out: cons(line)(acc.out)
      };
    };
  };
  return reverse(foldl7(step)({
    inBlock: false,
    out: []
  })(ls).out);
};
var toFenced = function(src) {
  var $271 = contains("```gramark")(src);
  if ($271) {
    return src;
  }
  ;
  var ls = decomment(split("\n")(src));
  var prodLines = filter(function(l) {
    return !isTokenDef(l) && (!isPrecDecl(l) && !isSettingDecl(l));
  })(ls);
  var settingLines = filter(isSettingDecl)(ls);
  var tokenLines = filter(isTokenDef)(ls);
  var block = function(info) {
    return function(body) {
      var trimmed = trimBlankEnds(body);
      var $272 = $$null(trimmed);
      if ($272) {
        return [];
      }
      ;
      return ["```gramark" + (info + ("\n" + (joinWith("\n")(trimmed) + "\n```")))];
    };
  };
  return joinWith("\n\n")(append14(block(" settings")(settingLines))(append14(block(" tokens")(tokenLines))(block("")(prodLines))));
};
var parseWith = function(method) {
  return function(md) {
    var src = joinWith("\n")(lrBlocks(toFenced(md))) + "\n";
    var raw = scan(lrScanItems)(src);
    var $273 = hasError(raw);
    if ($273) {
      return new Left("lexical error in grammar source");
    }
    ;
    var v = buildTablesFor(method)(bootstrapGrammar);
    if (v instanceof Left) {
      return new Left("internal: the lr grammar is not parseable by this method");
    }
    ;
    if (v instanceof Right) {
      var v1 = run3(v.value0)(tokenVal)(reduce)(normalizeNewlines(raw));
      if (v1 instanceof Left) {
        return new Left(show12(v1.value0));
      }
      ;
      if (v1 instanceof Right && v1.value0 instanceof VGrammar) {
        return bind6(desugar(v1.value0.value0))(checkDefined);
      }
      ;
      if (v1 instanceof Right) {
        return new Left("parse did not yield a Grammar");
      }
      ;
      throw new Error("Failed pattern match at Gramark.Lr (line 369, column 22 - line 372, column 56): " + [v1.constructor.name]);
    }
    ;
    throw new Error("Failed pattern match at Gramark.Lr (line 367, column 10 - line 372, column 56): " + [v.constructor.name]);
  };
};
var parse = /* @__PURE__ */ (function() {
  return parseWith(Canonical.value);
})();
var actionLangOf = function(md) {
  var langLine = function(line) {
    return map110(trim)(stripPrefix("%lang ")(trim(line)));
  };
  return map110(normalizeLang)(findMap(langLine)(split("\n")(md)));
};

// ../output/Gramark.Conformance.Lexers/index.js
var foldl9 = /* @__PURE__ */ foldl(foldableArray);
var nub3 = /* @__PURE__ */ nub(ordString);
var tokensBlock = function(md0) {
  var orFirst = function(found) {
    return function(content) {
      if (found instanceof Just) {
        return found;
      }
      ;
      if (found instanceof Nothing) {
        return new Just(content);
      }
      ;
      throw new Error("Failed pattern match at Gramark.Conformance.Lexers (line 112, column 27 - line 114, column 28): " + [found.constructor.name]);
    };
  };
  var step = function(acc) {
    return function(line) {
      if (acc.inside) {
        var $27 = trim(line) === "```";
        if ($27) {
          return {
            cur: acc.cur,
            inside: false,
            found: orFirst(acc.found)(joinWith("\n")(acc.cur))
          };
        }
        ;
        return {
          found: acc.found,
          inside: acc.inside,
          cur: snoc(acc.cur)(line)
        };
      }
      ;
      if (trim(line) === "```gramark tokens") {
        return {
          found: acc.found,
          inside: true,
          cur: []
        };
      }
      ;
      if (otherwise) {
        return acc;
      }
      ;
      throw new Error("Failed pattern match at Gramark.Conformance.Lexers (line 105, column 3 - line 111, column 22): " + [acc.constructor.name, line.constructor.name]);
    };
  };
  return foldl9(step)({
    inside: false,
    cur: [],
    found: Nothing.value
  })(split("\n")(toFenced(md0))).found;
};
var grammarLiterals = function(v) {
  var symLits = function($copy_v1) {
    var $tco_done = false;
    var $tco_result;
    function $tco_loop(v1) {
      if (v1 instanceof Lit) {
        $tco_done = true;
        return [v1.value0];
      }
      ;
      if (v1 instanceof Field) {
        $copy_v1 = v1.value1;
        return;
      }
      ;
      $tco_done = true;
      return [];
    }
    ;
    while (!$tco_done) {
      $tco_result = $tco_loop($copy_v1);
    }
    ;
    return $tco_result;
  };
  var altLits = function(v1) {
    return concatMap(symLits)(v1.value0);
  };
  var ruleLits = function(v1) {
    return concatMap(altLits)(v1.value2);
  };
  return nub3(concatMap(ruleLits)(v));
};
var scannerLexer = function(defs) {
  return function(g) {
    return function(input) {
      var toks = scan(buildItems(defs)(grammarLiterals(g)))(input);
      var $44 = hasError(toks);
      if ($44) {
        return new Left("lexical error in input");
      }
      ;
      return new Right(toks);
    };
  };
};

// ../output/Gramark.Json/index.js
var show6 = /* @__PURE__ */ show(showInt);
var div3 = /* @__PURE__ */ div(euclideanRingInt);
var mod3 = /* @__PURE__ */ mod(euclideanRingInt);
var foldMap3 = /* @__PURE__ */ foldMap(foldableArray)(monoidString);
var map111 = /* @__PURE__ */ map(functorArray);
var sortWith2 = /* @__PURE__ */ sortWith(ordString);
var JNull = /* @__PURE__ */ (function() {
  function JNull2() {
  }
  ;
  JNull2.value = new JNull2();
  return JNull2;
})();
var JBool = /* @__PURE__ */ (function() {
  function JBool2(value0) {
    this.value0 = value0;
  }
  ;
  JBool2.create = function(value0) {
    return new JBool2(value0);
  };
  return JBool2;
})();
var JInt = /* @__PURE__ */ (function() {
  function JInt2(value0) {
    this.value0 = value0;
  }
  ;
  JInt2.create = function(value0) {
    return new JInt2(value0);
  };
  return JInt2;
})();
var JString = /* @__PURE__ */ (function() {
  function JString2(value0) {
    this.value0 = value0;
  }
  ;
  JString2.create = function(value0) {
    return new JString2(value0);
  };
  return JString2;
})();
var JArray = /* @__PURE__ */ (function() {
  function JArray2(value0) {
    this.value0 = value0;
  }
  ;
  JArray2.create = function(value0) {
    return new JArray2(value0);
  };
  return JArray2;
})();
var JObject = /* @__PURE__ */ (function() {
  function JObject2(value0) {
    this.value0 = value0;
  }
  ;
  JObject2.create = function(value0) {
    return new JObject2(value0);
  };
  return JObject2;
})();
var encodeString = function(s) {
  var hexDigit2 = function(n) {
    return fromMaybe("0")(charAt2(n)("0123456789abcdef"));
  };
  var hex2 = function(n) {
    return singleton3(hexDigit2(div3(n)(16))) + singleton3(hexDigit2(mod3(n)(16)));
  };
  var esc = function(c) {
    if (c === '"') {
      return '\\"';
    }
    ;
    if (c === "\\") {
      return "\\\\";
    }
    ;
    if (c === "\n") {
      return "\\n";
    }
    ;
    if (c === "\r") {
      return "\\r";
    }
    ;
    if (c === "	") {
      return "\\t";
    }
    ;
    var n = toCharCode2(c);
    var $150 = n < 32;
    if ($150) {
      return "\\u00" + hex2(n);
    }
    ;
    return singleton3(c);
  };
  return '"' + (foldMap3(esc)(toCharArray(s)) + '"');
};
var stringify = /* @__PURE__ */ (function() {
  var block = function(indent) {
    return function(open) {
      return function(close) {
        return function(entries) {
          var inner = indent + "  ";
          return open + ("\n" + (joinWith(",\n")(map111(function(e) {
            return inner + e;
          })(entries)) + ("\n" + (indent + close))));
        };
      };
    };
  };
  var go = function(indent) {
    return function(v) {
      if (v instanceof JNull) {
        return "null";
      }
      ;
      if (v instanceof JBool) {
        if (v.value0) {
          return "true";
        }
        ;
        return "false";
      }
      ;
      if (v instanceof JInt) {
        return show6(v.value0);
      }
      ;
      if (v instanceof JString) {
        return encodeString(v.value0);
      }
      ;
      if (v instanceof JArray && v.value0.length === 0) {
        return "[]";
      }
      ;
      if (v instanceof JArray) {
        return block(indent)("[")("]")(map111(go(indent + "  "))(v.value0));
      }
      ;
      if (v instanceof JObject && v.value0.length === 0) {
        return "{}";
      }
      ;
      if (v instanceof JObject) {
        var renderPair = function(v1) {
          return encodeString(v1.value0) + (": " + go(indent + "  ")(v1.value1));
        };
        return block(indent)("{")("}")(map111(renderPair)(sortWith2(fst)(v.value0)));
      }
      ;
      throw new Error("Failed pattern match at Gramark.Json (line 48, column 15 - line 60, column 79): " + [v.constructor.name]);
    };
  };
  return go("");
})();

// ../output/Gramark.Cst/index.js
var map20 = /* @__PURE__ */ map(functorArray);
var Branch = /* @__PURE__ */ (function() {
  function Branch2(value0, value1) {
    this.value0 = value0;
    this.value1 = value1;
  }
  ;
  Branch2.create = function(value0) {
    return function(value1) {
      return new Branch2(value0, value1);
    };
  };
  return Branch2;
})();
var Token = /* @__PURE__ */ (function() {
  function Token2(value0, value1) {
    this.value0 = value0;
    this.value1 = value1;
  }
  ;
  Token2.create = function(value0) {
    return function(value1) {
      return new Token2(value0, value1);
    };
  };
  return Token2;
})();
var toJson = function(v) {
  if (v instanceof Branch) {
    return new JObject([new Tuple("rule", new JInt(v.value0)), new Tuple("children", new JArray(map20(toJson)(v.value1)))]);
  }
  ;
  if (v instanceof Token) {
    return new JObject([new Tuple("token", new JString(v.value0)), new Tuple("text", new JString(v.value1))]);
  }
  ;
  throw new Error("Failed pattern match at Gramark.Cst (line 74, column 10 - line 78, column 68): " + [v.constructor.name]);
};
var cstToken = function(t) {
  return new Token(t.terminal, t.text);
};
var cstReduce = /* @__PURE__ */ (function() {
  return Branch.create;
})();

// ../output/Gramark.Conformance/index.js
var show7 = /* @__PURE__ */ show(showParseError);
var Accept2 = /* @__PURE__ */ (function() {
  function Accept3() {
  }
  ;
  Accept3.value = new Accept3();
  return Accept3;
})();
var Reject = /* @__PURE__ */ (function() {
  function Reject2() {
  }
  ;
  Reject2.value = new Reject2();
  return Reject2;
})();
var parseCst = function(lexer) {
  return function(method) {
    return function(g) {
      return function(input) {
        var v = lexer(input);
        if (v instanceof Left) {
          return new Left(v.value0);
        }
        ;
        if (v instanceof Right) {
          var v1 = buildTablesFor(method)(g);
          if (v1 instanceof Left) {
            return new Left("grammar is not parseable by this method");
          }
          ;
          if (v1 instanceof Right) {
            return either(function($24) {
              return Left.create(show7($24));
            })(Right.create)(run3(v1.value0)(cstToken)(cstReduce)(v.value0));
          }
          ;
          throw new Error("Failed pattern match at Gramark.Conformance (line 86, column 19 - line 88, column 86): " + [v1.constructor.name]);
        }
        ;
        throw new Error("Failed pattern match at Gramark.Conformance (line 84, column 3 - line 88, column 86): " + [v.constructor.name]);
      };
    };
  };
};
var recognize = function(lexer) {
  return function(method) {
    return function(g) {
      return function(input) {
        return either($$const(Reject.value))($$const(Accept2.value))(parseCst(lexer)(method)(g)(input));
      };
    };
  };
};
var eqOutcome = {
  eq: function(x) {
    return function(y) {
      if (x instanceof Accept2 && y instanceof Accept2) {
        return true;
      }
      ;
      if (x instanceof Reject && y instanceof Reject) {
        return true;
      }
      ;
      return false;
    };
  }
};

// ../output/Gramark.Glr/index.js
var show8 = /* @__PURE__ */ show(showInt);
var append15 = /* @__PURE__ */ append(semigroupArray);
var map21 = /* @__PURE__ */ map(functorArray);
var ordTuple4 = /* @__PURE__ */ ordTuple(ordInt);
var lookup7 = /* @__PURE__ */ lookup(/* @__PURE__ */ ordTuple4(ordString));
var lookup13 = /* @__PURE__ */ lookup(/* @__PURE__ */ ordTuple4(ordSymbol));
var explainP = function(prec) {
  return function(g) {
    var ncp = (function() {
      var v = buildTablesForP(prec)(Canonical.value)(g);
      if (v instanceof Left) {
        return length(v.value0);
      }
      ;
      if (v instanceof Right) {
        return 0;
      }
      ;
      throw new Error("Failed pattern match at Gramark.Glr (line 155, column 9 - line 157, column 17): " + [v.constructor.name]);
    })();
    var hasPrec = !isEmpty(prec.terms);
    var genuineConflicts = (function() {
      var v = buildTablesForP(prec)(Canonical.value)(g);
      if (v instanceof Left) {
        return renderConflicts(g)(v.value0);
      }
      ;
      if (v instanceof Right) {
        return [];
      }
      ;
      throw new Error("Failed pattern match at Gramark.Glr (line 182, column 22 - line 184, column 18): " + [v.constructor.name]);
    })();
    var count = function(m) {
      var v = buildTablesFor(m)(g);
      if (v instanceof Left) {
        return length(v.value0);
      }
      ;
      if (v instanceof Right) {
        return 0;
      }
      ;
      throw new Error("Failed pattern match at Gramark.Glr (line 146, column 13 - line 148, column 17): " + [v.constructor.name]);
    };
    var nc = count(Canonical.value);
    var ni = count(IELR.value);
    var nl = count(LALR.value);
    var verdict = (function() {
      if (nc === 0 && nl === 0) {
        return ["verdict: conflict-free \u2014 the grammar is LALR(1)."];
      }
      ;
      if (nc === 0) {
        return ["verdict: LALR artifact \u2014 " + (show8(nl) + (" conflict(s) under LALR(1) that canonical LR(1) resolves" + (function() {
          var $35 = ni === 0;
          if ($35) {
            return " (and so does IELR(1)).";
          }
          ;
          return ".";
        })())), "         the grammar is LR(1); build it with IELR(1) for a compact conflict-free table."];
      }
      ;
      if (ncp === 0) {
        return ["verdict: resolved by declaration \u2014 " + (show8(nc) + " conflict(s) under canonical LR(1), all resolved by the %left/%right precedence declarations; the grammar compiles.")];
      }
      ;
      if (otherwise) {
        return append15(["verdict: genuine \u2014 " + (show8(ncp) + (" conflict(s) persist under canonical LR(1)" + ((function() {
          if (hasPrec) {
            return " even with the declared precedence";
          }
          ;
          return "";
        })() + "; the grammar is not LR(1)"))), "         (ambiguous, or in need of a refactor, more precedence, or the GLR driver). conflicts:"])(map21(function(c) {
          return "  " + c;
        })(genuineConflicts));
      }
      ;
      throw new Error("Failed pattern match at Gramark.Glr (line 159, column 3 - line 180, column 52): ");
    })();
    return joinWith("\n")(append15(["conflicts by method: canonical LR(1) = " + (show8(nc) + (", LALR(1) = " + (show8(nl) + (", IELR(1) = " + (show8(ni) + (function() {
      if (hasPrec) {
        return ", canonical + declared precedence = " + show8(ncp);
      }
      ;
      return "";
    })())))))])(verdict));
  };
};
var budget = 2e5;
var parseForest = function(table) {
  return function(tokenVal2) {
    return function(reduce2) {
      return function(input) {
        var start = {
          states: [0],
          values: [],
          pos: 0
        };
        var reduceStep = function(c) {
          return function(p) {
            var v = index(table.prods)(p);
            if (v instanceof Nothing) {
              return Nothing.value;
            }
            ;
            if (v instanceof Just) {
              var k = length(v.value0.rhs);
              var states$prime = drop(k)(c.states);
              var under = fromMaybe(0)(head(states$prime));
              var values$prime = drop(k)(c.values);
              var children = reverse(take(k)(c.values));
              var value = reduce2(p)(children);
              var v1 = lookup7(new Tuple(under, v.value0.lhs))(table["goto"]);
              if (v1 instanceof Just) {
                return new Just({
                  states: cons(v1.value0)(states$prime),
                  values: cons(value)(values$prime),
                  pos: c.pos
                });
              }
              ;
              if (v1 instanceof Nothing) {
                return Nothing.value;
              }
              ;
              throw new Error("Failed pattern match at Gramark.Glr (line 115, column 9 - line 117, column 29): " + [v1.constructor.name]);
            }
            ;
            throw new Error("Failed pattern match at Gramark.Glr (line 104, column 20 - line 117, column 29): " + [v.constructor.name]);
          };
        };
        var step = function(c) {
          return function(mtok) {
            return function(acc) {
              return function(act) {
                if (act instanceof Shift) {
                  if (mtok instanceof Just) {
                    return {
                      done: acc.done,
                      next: snoc(acc.next)({
                        states: cons(act.value0)(c.states),
                        values: cons(tokenVal2(mtok.value0))(c.values),
                        pos: c.pos + 1 | 0
                      })
                    };
                  }
                  ;
                  if (mtok instanceof Nothing) {
                    return acc;
                  }
                  ;
                  throw new Error("Failed pattern match at Gramark.Glr (line 87, column 16 - line 96, column 21): " + [mtok.constructor.name]);
                }
                ;
                if (act instanceof Accept) {
                  var v = head(c.values);
                  if (v instanceof Just) {
                    return {
                      next: acc.next,
                      done: snoc(acc.done)(v.value0)
                    };
                  }
                  ;
                  if (v instanceof Nothing) {
                    return acc;
                  }
                  ;
                  throw new Error("Failed pattern match at Gramark.Glr (line 97, column 15 - line 99, column 21): " + [v.constructor.name]);
                }
                ;
                if (act instanceof Reduce) {
                  var v = reduceStep(c)(act.value0);
                  if (v instanceof Just) {
                    return {
                      done: acc.done,
                      next: snoc(acc.next)(v.value0)
                    };
                  }
                  ;
                  if (v instanceof Nothing) {
                    return acc;
                  }
                  ;
                  throw new Error("Failed pattern match at Gramark.Glr (line 100, column 17 - line 102, column 21): " + [v.constructor.name]);
                }
                ;
                throw new Error("Failed pattern match at Gramark.Glr (line 86, column 25 - line 102, column 21): " + [act.constructor.name]);
              };
            };
          };
        };
        var expand = function(c) {
          var state = fromMaybe(0)(head(c.states));
          var mtok = index(input)(c.pos);
          var look = maybe(EOF.value)(function(t) {
            return new Term(t.terminal);
          })(mtok);
          var acts = fromMaybe([])(lookup13(new Tuple(state, look))(table.action));
          return foldl2(step(c)(mtok))({
            next: [],
            done: []
          })(acts);
        };
        var go = function($copy_fuel) {
          return function($copy_work) {
            return function($copy_acc) {
              var $tco_var_fuel = $copy_fuel;
              var $tco_var_work = $copy_work;
              var $tco_done = false;
              var $tco_result;
              function $tco_loop(fuel, work, acc) {
                var v = uncons(work);
                if (v instanceof Nothing) {
                  $tco_done = true;
                  return acc;
                }
                ;
                if (v instanceof Just) {
                  if (fuel <= 0) {
                    $tco_done = true;
                    return acc;
                  }
                  ;
                  if (otherwise) {
                    var r = expand(v.value0.head);
                    $tco_var_fuel = fuel - 1 | 0;
                    $tco_var_work = append15(v.value0.tail)(r.next);
                    $copy_acc = append15(acc)(r.done);
                    return;
                  }
                  ;
                }
                ;
                throw new Error("Failed pattern match at Gramark.Glr (line 67, column 22 - line 75, column 59): " + [v.constructor.name]);
              }
              ;
              while (!$tco_done) {
                $tco_result = $tco_loop($tco_var_fuel, $tco_var_work, $copy_acc);
              }
              ;
              return $tco_result;
            };
          };
        };
        return go(budget)([start])([]);
      };
    };
  };
};
var forest = function(method) {
  return function(g) {
    return function(toks) {
      return parseForest(buildGlrTablesFor(method)(g))(cstToken)(cstReduce)(toks);
    };
  };
};

// ../output/Gramark.IR/index.js
var map24 = /* @__PURE__ */ map(functorArray);
var append5 = /* @__PURE__ */ append(semigroupArray);
var foldl10 = /* @__PURE__ */ foldl(foldableArray);
var max4 = /* @__PURE__ */ max(ordInt);
var fromFoldable6 = /* @__PURE__ */ fromFoldable2(ordString)(foldableArray);
var lookup8 = /* @__PURE__ */ lookup(ordString);
var toUnfoldable6 = /* @__PURE__ */ toUnfoldable(unfoldableArray);
var insertWith4 = /* @__PURE__ */ insertWith(ordInt);
var fromFoldable13 = /* @__PURE__ */ fromFoldable3(foldableArray)(ordString);
var insertWith12 = /* @__PURE__ */ insertWith(ordString);
var disj2 = /* @__PURE__ */ disj(heytingAlgebraBoolean);
var member13 = /* @__PURE__ */ member2(ordString);
var IRLiteral = /* @__PURE__ */ (function() {
  function IRLiteral2(value0, value1) {
    this.value0 = value0;
    this.value1 = value1;
  }
  ;
  IRLiteral2.create = function(value0) {
    return function(value1) {
      return new IRLiteral2(value0, value1);
    };
  };
  return IRLiteral2;
})();
var IRClass = /* @__PURE__ */ (function() {
  function IRClass2(value0, value1) {
    this.value0 = value0;
    this.value1 = value1;
  }
  ;
  IRClass2.create = function(value0) {
    return function(value1) {
      return new IRClass2(value0, value1);
    };
  };
  return IRClass2;
})();
var IRRefNT = /* @__PURE__ */ (function() {
  function IRRefNT2(value0, value1) {
    this.value0 = value0;
    this.value1 = value1;
  }
  ;
  IRRefNT2.create = function(value0) {
    return function(value1) {
      return new IRRefNT2(value0, value1);
    };
  };
  return IRRefNT2;
})();
var IRRefT = /* @__PURE__ */ (function() {
  function IRRefT2(value0, value1) {
    this.value0 = value0;
    this.value1 = value1;
  }
  ;
  IRRefT2.create = function(value0) {
    return function(value1) {
      return new IRRefT2(value0, value1);
    };
  };
  return IRRefT2;
})();
var OnTerm = /* @__PURE__ */ (function() {
  function OnTerm2(value0) {
    this.value0 = value0;
  }
  ;
  OnTerm2.create = function(value0) {
    return new OnTerm2(value0);
  };
  return OnTerm2;
})();
var OnEof = /* @__PURE__ */ (function() {
  function OnEof2() {
  }
  ;
  OnEof2.value = new OnEof2();
  return OnEof2;
})();
var ActShift = /* @__PURE__ */ (function() {
  function ActShift2(value0) {
    this.value0 = value0;
  }
  ;
  ActShift2.create = function(value0) {
    return new ActShift2(value0);
  };
  return ActShift2;
})();
var ActReduce = /* @__PURE__ */ (function() {
  function ActReduce2(value0) {
    this.value0 = value0;
  }
  ;
  ActReduce2.create = function(value0) {
    return new ActReduce2(value0);
  };
  return ActReduce2;
})();
var ActAccept = /* @__PURE__ */ (function() {
  function ActAccept2() {
  }
  ;
  ActAccept2.value = new ActAccept2();
  return ActAccept2;
})();
var withActionLang = function(v) {
  return function(v1) {
    if (v instanceof Nothing) {
      return v1;
    }
    ;
    if (v instanceof Just) {
      var retag = function(r) {
        return {
          id: r.id,
          label: r.label,
          lhs: r.lhs,
          rhs: r.rhs,
          actions: map24(function(v3) {
            return new Tuple(v.value0, v3.value1);
          })(r.actions)
        };
      };
      return {
        irVersion: v1.irVersion,
        strategy: v1.strategy,
        tables: v1.tables,
        conflicts: v1.conflicts,
        lexer: v1.lexer,
        atn: v1.atn,
        grammar: {
          name: v1.grammar.name,
          start: v1.grammar.start,
          terminals: v1.grammar.terminals,
          nonterminals: v1.grammar.nonterminals,
          precedence: v1.grammar.precedence,
          extras: v1.grammar.extras,
          rules: map24(retag)(v1.grammar.rules)
        }
      };
    }
    ;
    throw new Error("Failed pattern match at Gramark.IR (line 700, column 1 - line 700, column 43): " + [v.constructor.name, v1.constructor.name]);
  };
};
var irVersion = 0;
var assembleTables = function(algorithm) {
  return function(termId) {
    return function(ntId) {
      return function(table) {
        var onOf = function(v) {
          if (v instanceof Term) {
            return new OnTerm(termId(v.value0));
          }
          ;
          if (v instanceof EOF) {
            return OnEof.value;
          }
          ;
          if (v instanceof NonTerm) {
            return new OnTerm(termId(v.value0));
          }
          ;
          throw new Error("Failed pattern match at Gramark.IR (line 466, column 10 - line 469, column 35): " + [v.constructor.name]);
        };
        var groupRows = function(m) {
          return map24(function(v) {
            return {
              state: v.value0,
              entries: v.value1
            };
          })(toUnfoldable6(m));
        };
        var gotoList = toUnfoldable6(table["goto"]);
        var gotoByState = (function() {
          var step = function(m) {
            return function(v) {
              return insertWith4(append5)(v.value0.value0)([{
                nonterminal: ntId(v.value0.value1),
                to: v.value1
              }])(m);
            };
          };
          return foldl10(step)(empty2)(gotoList);
        })();
        var actionList = toUnfoldable6(table.action);
        var stateCount = (function() {
          var shiftTarget = function(v) {
            if (v.value1 instanceof Shift) {
              return new Just(v.value1.value0);
            }
            ;
            return Nothing.value;
          };
          var allStates = append5(map24(function(v) {
            return v.value0.value0;
          })(actionList))(append5(mapMaybe(shiftTarget)(actionList))(append5(map24(function(v) {
            return v.value0.value0;
          })(gotoList))(map24(function(v) {
            return v.value1;
          })(gotoList))));
          return 1 + foldl10(max4)(-1 | 0)(allStates) | 0;
        })();
        var actOf = function(v) {
          if (v instanceof Shift) {
            return new ActShift(v.value0);
          }
          ;
          if (v instanceof Reduce) {
            return new ActReduce(v.value0);
          }
          ;
          if (v instanceof Accept) {
            return ActAccept.value;
          }
          ;
          throw new Error("Failed pattern match at Gramark.IR (line 472, column 11 - line 475, column 24): " + [v.constructor.name]);
        };
        var actionByState = (function() {
          var step = function(m) {
            return function(v) {
              return insertWith4(append5)(v.value0.value0)([{
                on: onOf(v.value0.value1),
                action: actOf(v.value1)
              }])(m);
            };
          };
          return foldl10(step)(empty2)(actionList);
        })();
        return {
          algorithm,
          stateCount,
          action: groupRows(actionByState),
          "goto": groupRows(gotoByState),
          recovery: Nothing.value,
          glr: Nothing.value
        };
      };
    };
  };
};
var algorithmName = function(v) {
  if (v instanceof Canonical) {
    return "canonical-lr1";
  }
  ;
  if (v instanceof LALR) {
    return "lalr1";
  }
  ;
  if (v instanceof IELR) {
    return "ielr1";
  }
  ;
  throw new Error("Failed pattern match at Gramark.IR (line 421, column 17 - line 424, column 18): " + [v.constructor.name]);
};
var buildIRP = function(prec) {
  return function(method) {
    return function(name) {
      return function(v) {
        var ntNames = map24(function(v12) {
          return v12.value0;
        })(v);
        var ntSet = fromFoldable13(ntNames);
        var startSymbol2 = fromMaybe("")(head(ntNames));
        var ntIdMap = fromFoldable6(mapWithIndex2(function(i) {
          return function(n) {
            return new Tuple(n, i);
          };
        })(ntNames));
        var ntId = function(n) {
          return fromMaybe(-1 | 0)(lookup8(n)(ntIdMap));
        };
        var nonterminals = mapWithIndex2(function(i) {
          return function(n) {
            return {
              id: i,
              name: n
            };
          };
        })(ntNames);
        var allSyms = (function() {
          var altSyms = function(v12) {
            return v12.value0;
          };
          return concatMap(function(v12) {
            return concatMap(altSyms)(v12.value2);
          })(v);
        })();
        var termLiteralMap = (function() {
          var perSym = function(m) {
            return function(v12) {
              if (v12 instanceof Lit) {
                return insertWith12(disj2)(v12.value0)(true)(m);
              }
              ;
              if (v12 instanceof Ref) {
                var $352 = member13(v12.value0)(ntSet);
                if ($352) {
                  return m;
                }
                ;
                return insertWith12(disj2)(v12.value0)(false)(m);
              }
              ;
              if (v12 instanceof Rep) {
                return perSym(m)(v12.value0);
              }
              ;
              if (v12 instanceof Star) {
                return perSym(m)(v12.value0);
              }
              ;
              if (v12 instanceof Opt) {
                return perSym(m)(v12.value0);
              }
              ;
              if (v12 instanceof Macro) {
                return foldl10(perSym)(m)(v12.value1);
              }
              ;
              if (v12 instanceof Field) {
                return perSym(m)(v12.value1);
              }
              ;
              if (v12 instanceof Group) {
                return foldl10(foldl10(perSym))(m)(v12.value0);
              }
              ;
              if (v12 instanceof Any) {
                return m;
              }
              ;
              if (v12 instanceof Not) {
                return foldl10(perSym)(m)(v12.value0);
              }
              ;
              throw new Error("Failed pattern match at Gramark.IR (line 335, column 16 - line 345, column 36): " + [v12.constructor.name]);
            };
          };
          return foldl10(perSym)(empty2)(allSyms);
        })();
        var termEntries = mapWithIndex2(function(i) {
          return function(v12) {
            return {
              id: i,
              str: v12.value0,
              isLiteral: v12.value1
            };
          };
        })(toUnfoldable6(termLiteralMap));
        var termIdMap = fromFoldable6(map24(function(e) {
          return new Tuple(e.str, e.id);
        })(termEntries));
        var termId = function(s) {
          return fromMaybe(-1 | 0)(lookup8(s)(termIdMap));
        };
        var irPrecedence = (function() {
          var grouped = foldl10(function(m) {
            return function(v12) {
              return insertWith4(append5)(v12.value1.level)([{
                assoc: v12.value1.assoc,
                term: v12.value0
              }])(m);
            };
          })(empty2)(toUnfoldable6(prec.terms));
          var assocStr = function(a) {
            if (a instanceof LeftA) {
              return "left";
            }
            ;
            if (a instanceof RightA) {
              return "right";
            }
            ;
            if (a instanceof NonA) {
              return "nonassoc";
            }
            ;
            throw new Error("Failed pattern match at Gramark.IR (line 374, column 18 - line 377, column 25): " + [a.constructor.name]);
          };
          var toLevel = function(v12) {
            return {
              level: v12.value0,
              assoc: maybe("left")(function($411) {
                return assocStr((function(v2) {
                  return v2.assoc;
                })($411));
              })(head(v12.value1)),
              terminals: map24(function($412) {
                return termId((function(v2) {
                  return v2.term;
                })($412));
              })(v12.value1)
            };
          };
          return map24(toLevel)(toUnfoldable6(grouped));
        })();
        var irRules = (function() {
          var withField = function(f) {
            return function(v12) {
              if (v12 instanceof IRRefNT) {
                return new IRRefNT(v12.value0, f);
              }
              ;
              if (v12 instanceof IRRefT) {
                return new IRRefT(v12.value0, f);
              }
              ;
              throw new Error("Failed pattern match at Gramark.IR (line 411, column 19 - line 413, column 31): " + [v12.constructor.name]);
            };
          };
          var toRef = function(v12) {
            if (v12 instanceof Ref) {
              var $379 = member13(v12.value0)(ntSet);
              if ($379) {
                return new IRRefNT(ntId(v12.value0), Nothing.value);
              }
              ;
              return new IRRefT(termId(v12.value0), Nothing.value);
            }
            ;
            if (v12 instanceof Lit) {
              return new IRRefT(termId(v12.value0), Nothing.value);
            }
            ;
            if (v12 instanceof Field) {
              return withField(new Just(v12.value0))(toRef(v12.value1));
            }
            ;
            if (v12 instanceof Rep) {
              return toRef(v12.value0);
            }
            ;
            if (v12 instanceof Star) {
              return toRef(v12.value0);
            }
            ;
            if (v12 instanceof Opt) {
              return toRef(v12.value0);
            }
            ;
            if (v12 instanceof Macro) {
              return toRef(new Ref(v12.value0));
            }
            ;
            if (v12 instanceof Group) {
              return new IRRefT(termId("(group)"), Nothing.value);
            }
            ;
            if (v12 instanceof Any) {
              return new IRRefT(termId("(any)"), Nothing.value);
            }
            ;
            if (v12 instanceof Not) {
              return new IRRefT(termId("(not)"), Nothing.value);
            }
            ;
            throw new Error("Failed pattern match at Gramark.IR (line 399, column 13 - line 409, column 47): " + [v12.constructor.name]);
          };
          var toRule = function(i) {
            return function(v12) {
              return {
                id: i,
                lhs: ntId(v12.value0),
                rhs: map24(toRef)(v12.value1.value0),
                label: v12.value1.value1,
                actions: (function() {
                  if (v12.value1.value2 instanceof Just) {
                    return [new Tuple("purescript", v12.value1.value2.value0)];
                  }
                  ;
                  if (v12.value1.value2 instanceof Nothing) {
                    return [];
                  }
                  ;
                  throw new Error("Failed pattern match at Gramark.IR (line 395, column 18 - line 397, column 24): " + [v12.value1.value2.constructor.name]);
                })()
              };
            };
          };
          var flat = concatMap(function(v12) {
            return map24(function(alt2) {
              return new Tuple(v12.value0, alt2);
            })(v12.value2);
          })(v);
          return mapWithIndex2(toRule)(flat);
        })();
        var terminals = map24(function(e) {
          if (e.isLiteral) {
            return new IRLiteral(e.id, e.str);
          }
          ;
          return new IRClass(e.id, e.str);
        })(termEntries);
        var v1 = buildTablesForP(prec)(method)(v);
        if (v1 instanceof Left) {
          return new Left(v1.value0);
        }
        ;
        if (v1 instanceof Right) {
          return new Right({
            irVersion,
            strategy: "lr",
            grammar: {
              name,
              start: startSymbol2,
              terminals,
              nonterminals,
              rules: irRules,
              precedence: irPrecedence,
              extras: []
            },
            tables: assembleTables(algorithmName(method))(termId)(ntId)(v1.value0),
            conflicts: [],
            lexer: Nothing.value,
            atn: Nothing.value
          });
        }
        ;
        throw new Error("Failed pattern match at Gramark.IR (line 289, column 3 - line 308, column 10): " + [v1.constructor.name]);
      };
    };
  };
};
var buildIR = /* @__PURE__ */ buildIRP(emptyPrec);

// ../output/Gramark.Playground/index.js
var map25 = /* @__PURE__ */ map(functorArray);
var show9 = /* @__PURE__ */ show(showString);
var foldMap4 = /* @__PURE__ */ foldMap(foldableArray)(monoidString);
var append16 = /* @__PURE__ */ append(semigroupArray);
var show13 = /* @__PURE__ */ show(showInt);
var eq7 = /* @__PURE__ */ eq(eqOutcome);
var ruleNamesOf = function(v) {
  return map25(function(v1) {
    return v1.value0;
  })(v);
};
var renderTree = function(prods) {
  var label = function(v) {
    if (v instanceof Branch) {
      var v1 = index(prods)(v.value0);
      if (v1 instanceof Just) {
        return v1.value0.lhs;
      }
      ;
      if (v1 instanceof Nothing) {
        return "(start)";
      }
      ;
      throw new Error("Failed pattern match at Gramark.Playground (line 186, column 19 - line 188, column 27): " + [v1.constructor.name]);
    }
    ;
    if (v instanceof Token) {
      return v.value0 + (" " + show9(v.value1));
    }
    ;
    throw new Error("Failed pattern match at Gramark.Playground (line 185, column 11 - line 189, column 36): " + [v.constructor.name]);
  };
  var indent = function(depth) {
    return joinWith("")(replicate(depth)("  "));
  };
  var go = function(depth) {
    return function(node) {
      return indent(depth) + (label(node) + (function() {
        if (node instanceof Branch) {
          return foldMap4(function(k) {
            return "\n" + go(depth + 1 | 0)(k);
          })(node.value1);
        }
        ;
        if (node instanceof Token) {
          return "";
        }
        ;
        throw new Error("Failed pattern match at Gramark.Playground (line 182, column 10 - line 184, column 24): " + [node.constructor.name]);
      })());
    };
  };
  return go(0);
};
var renderTrace = function(prods) {
  return function(cst) {
    var symText = function(v) {
      if (v instanceof NonTerm) {
        return v.value0;
      }
      ;
      if (v instanceof Term) {
        return "'" + (v.value0 + "'");
      }
      ;
      if (v instanceof EOF) {
        return "$";
      }
      ;
      throw new Error("Failed pattern match at Gramark.Playground (line 207, column 13 - line 210, column 15): " + [v.constructor.name]);
    };
    var prodLabel = function(p) {
      var v = index(prods)(p);
      if (v instanceof Just) {
        return v.value0.lhs + (" -> " + (function() {
          var $51 = $$null(v.value0.rhs);
          if ($51) {
            return "\u03B5";
          }
          ;
          return joinWith(" ")(map25(symText)(v.value0.rhs));
        })());
      }
      ;
      if (v instanceof Nothing) {
        return "(accept)";
      }
      ;
      throw new Error("Failed pattern match at Gramark.Playground (line 202, column 17 - line 206, column 26): " + [v.constructor.name]);
    };
    var steps = function(v) {
      if (v instanceof Token) {
        return ["shift  " + (v.value0 + (" " + show9(v.value1)))];
      }
      ;
      if (v instanceof Branch) {
        return append16(concatMap(steps)(v.value1))(["reduce " + prodLabel(v.value0)]);
      }
      ;
      throw new Error("Failed pattern match at Gramark.Playground (line 199, column 11 - line 201, column 80): " + [v.constructor.name]);
    };
    var numbered = function(i) {
      return function(s) {
        return show13(i + 1 | 0) + (". " + s);
      };
    };
    return joinWith("\n")(mapWithIndex2(numbered)(steps(cst)));
  };
};
var metaJsonOf = function(grammar) {
  var refField = function(v2) {
    if (v2 instanceof IRRefNT) {
      return v2.value1;
    }
    ;
    if (v2 instanceof IRRefT) {
      return v2.value1;
    }
    ;
    throw new Error("Failed pattern match at Gramark.Playground (line 168, column 14 - line 170, column 20): " + [v2.constructor.name]);
  };
  var fieldJson = (function() {
    var $92 = maybe(JNull.value)(JString.create);
    return function($93) {
      return $92(refField($93));
    };
  })();
  var ruleMeta = function(r) {
    return new JObject([new Tuple("label", maybe(JNull.value)(JString.create)(r.label)), new Tuple("fields", new JArray(map25(fieldJson)(r.rhs)))]);
  };
  var v = buildIR(Canonical.value)("Lab")(grammar);
  if (v instanceof Left) {
    return "[]";
  }
  ;
  if (v instanceof Right) {
    return stringify(new JArray(map25(ruleMeta)(v.value0.grammar.rules)));
  }
  ;
  throw new Error("Failed pattern match at Gramark.Playground (line 158, column 22 - line 160, column 65): " + [v.constructor.name]);
};
var evalJsOf = function(source) {
  return function(grammar) {
    var v = buildIR(Canonical.value)("Lab")(grammar);
    if (v instanceof Left) {
      return "";
    }
    ;
    if (v instanceof Right) {
      return emit(withActionLang(actionLangOf(source))(v.value0));
    }
    ;
    throw new Error("Failed pattern match at Gramark.Playground (line 149, column 27 - line 151, column 64): " + [v.constructor.name]);
  };
};
var evaluate = function(v) {
  var v1 = parse(v.source);
  if (v1 instanceof Left) {
    return {
      ok: false,
      accepted: false,
      message: "The grammar could not be parsed.",
      diagnostics: [v1.value0],
      rules: [],
      tokens: [],
      tree: "",
      trace: "",
      conflicts: "",
      cstJson: "",
      meta: "[]",
      evalJs: ""
    };
  }
  ;
  if (v1 instanceof Right) {
    var rules = ruleNamesOf(v1.value0);
    var meta = metaJsonOf(v1.value0);
    var evalJs = evalJsOf(v.source)(v1.value0);
    var defs = (function() {
      var v22 = tokensBlock(v.source);
      if (v22 instanceof Just) {
        var v3 = parseTokens(v22.value0);
        if (v3 instanceof Right) {
          return v3.value0;
        }
        ;
        if (v3 instanceof Left) {
          return [];
        }
        ;
        throw new Error("Failed pattern match at Gramark.Playground (line 75, column 23 - line 77, column 23): " + [v3.constructor.name]);
      }
      ;
      if (v22 instanceof Nothing) {
        return [];
      }
      ;
      throw new Error("Failed pattern match at Gramark.Playground (line 74, column 14 - line 78, column 22): " + [v22.constructor.name]);
    })();
    var lexer = scannerLexer(defs)(v1.value0);
    var conflicts = explainP(precedenceOf(v.source))(v1.value0);
    var v2 = lexer(v.input);
    if (v2 instanceof Left) {
      return {
        ok: true,
        accepted: false,
        message: "The input could not be lexed.",
        diagnostics: [v2.value0],
        rules,
        tokens: [],
        tree: "",
        trace: "",
        conflicts,
        cstJson: "",
        meta,
        evalJs
      };
    }
    ;
    if (v2 instanceof Right) {
      var prods = productions(v1.value0);
      var csts = forest(Canonical.value)(v1.value0)(v2.value0);
      var trace = (function() {
        var v3 = head(csts);
        if (v3 instanceof Just) {
          return renderTrace(prods)(v3.value0);
        }
        ;
        if (v3 instanceof Nothing) {
          return "";
        }
        ;
        throw new Error("Failed pattern match at Gramark.Playground (line 116, column 21 - line 118, column 28): " + [v3.constructor.name]);
      })();
      var tree = (function() {
        var v3 = head(csts);
        if (v3 instanceof Just) {
          return renderTree(prods)(v3.value0) + (function() {
            var $82 = length(csts) > 1;
            if ($82) {
              return "\n\n(ambiguous: " + (show13(length(csts)) + " parses; showing the first)");
            }
            ;
            return "";
          })();
        }
        ;
        if (v3 instanceof Nothing) {
          return "";
        }
        ;
        throw new Error("Failed pattern match at Gramark.Playground (line 111, column 20 - line 115, column 28): " + [v3.constructor.name]);
      })();
      var cstJson = (function() {
        var v3 = head(csts);
        if (v3 instanceof Just) {
          return stringify(toJson(v3.value0));
        }
        ;
        if (v3 instanceof Nothing) {
          return "";
        }
        ;
        throw new Error("Failed pattern match at Gramark.Playground (line 119, column 23 - line 121, column 28): " + [v3.constructor.name]);
      })();
      var accepted = eq7(recognize(lexer)(Canonical.value)(v1.value0)(v.input))(Accept2.value);
      return {
        ok: true,
        accepted,
        message: (function() {
          if (accepted) {
            return "The input matched the grammar.";
          }
          ;
          return "The input did not match the grammar.";
        })(),
        diagnostics: (function() {
          if (accepted) {
            return ["Accepted by the Gramark engine."];
          }
          ;
          return ["The input did not match the grammar."];
        })(),
        rules,
        tokens: map25(function(v3) {
          return v3.text;
        })(v2.value0),
        tree,
        trace,
        conflicts,
        cstJson,
        meta,
        evalJs
      };
    }
    ;
    throw new Error("Failed pattern match at Gramark.Playground (line 88, column 7 - line 139, column 14): " + [v2.constructor.name]);
  }
  ;
  throw new Error("Failed pattern match at Gramark.Playground (line 51, column 30 - line 139, column 14): " + [v1.constructor.name]);
};
export {
  evaluate
};
