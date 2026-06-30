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
var $$void = function(dictFunctor) {
  return map(dictFunctor)($$const(unit));
};
var functorArray = {
  map: arrayMap
};

// ../output/Data.Semigroup/foreign.js
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

// ../output/Data.Bounded/foreign.js
var topChar = String.fromCharCode(65535);
var bottomChar = String.fromCharCode(0);
var topNumber = Number.POSITIVE_INFINITY;
var bottomNumber = Number.NEGATIVE_INFINITY;

// ../output/Data.Ord/foreign.js
var unsafeCompareImpl = function(lt) {
  return function(eq6) {
    return function(gt) {
      return function(x) {
        return function(y) {
          return x < y ? lt : x === y ? eq6 : gt;
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
  var show8 = show(dictShow);
  return {
    show: function(v) {
      if (v instanceof Just) {
        return "(Just " + (show8(v.value0) + ")");
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
  var eq6 = eq(dictEq);
  return {
    eq: function(x) {
      return function(y) {
        if (x instanceof Nothing && y instanceof Nothing) {
          return true;
        }
        ;
        if (x instanceof Just && y instanceof Just) {
          return eq6(x.value0)(y.value0);
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

// ../output/Control.Monad/index.js
var ap = function(dictMonad) {
  var bind6 = bind(dictMonad.Bind1());
  var pure4 = pure(dictMonad.Applicative0());
  return function(f) {
    return function(a) {
      return bind6(f)(function(f$prime) {
        return bind6(a)(function(a$prime) {
          return pure4(f$prime(a$prime));
        });
      });
    };
  };
};

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
  var eq6 = eq(dictEq);
  return function(dictEq1) {
    var eq13 = eq(dictEq1);
    return {
      eq: function(x) {
        return function(y) {
          return eq6(x.value0)(y.value0) && eq13(x.value1)(y.value1);
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

// ../output/Data.Monoid.Disj/index.js
var Disj = function(x) {
  return x;
};
var semigroupDisj = function(dictHeytingAlgebra) {
  var disj2 = disj(dictHeytingAlgebra);
  return {
    append: function(v) {
      return function(v1) {
        return disj2(v)(v1);
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
    var append5 = append(dictMonoid.Semigroup0());
    var mempty2 = mempty(dictMonoid);
    return function(f) {
      return foldr22(function(x) {
        return function(acc) {
          return append5(f(x))(acc);
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
    return function(map19) {
      return function(pure4) {
        return function(f) {
          return function(array) {
            function go(bot, top2) {
              switch (top2 - bot) {
                case 0:
                  return pure4([]);
                case 1:
                  return map19(array1)(f(array[bot]));
                case 2:
                  return apply2(map19(array2)(f(array[bot])))(f(array[bot + 1]));
                case 3:
                  return apply2(apply2(map19(array3)(f(array[bot])))(f(array[bot + 1])))(f(array[bot + 2]));
                default:
                  var pivot = bot + Math.floor((top2 - bot) / 4) * 2;
                  return apply2(map19(concat2)(go(bot, pivot)))(go(pivot, top2));
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
  var eq23 = eq(dictEq);
  return function(x) {
    return findIndex(function(v) {
      return eq23(v)(x);
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
var all2 = /* @__PURE__ */ runFn2(allImpl);

// ../output/Data.String.Common/foreign.js
var split = function(sep) {
  return function(s) {
    return s.split(sep);
  };
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

// ../output/Grammark.Syntax/index.js
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

// ../output/Grammark.Bootstrap/index.js
var lrTokensSource = /* @__PURE__ */ joinWith("\n")(["WS       : /[ \\t]+/                       %skip", "NL       : /(\\r?\\n)(?:[ \\t]*\\r?\\n)*/      %external(layout)", "ATTR     : /#\\[([A-Za-z_][A-Za-z0-9_]*)\\]/", "IDENT    : /[A-Za-z_][A-Za-z0-9_]*/", `TERM_LIT : /'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"/`, "ACTION   : /\\{%((?:[^%]|%[^}])*)%\\}/", "LABEL    : /#[ \\t]*([A-Za-z_][A-Za-z0-9_]*)/", 'PLUS     : "+"', 'STAR     : "*"', 'QUESTION : "?"', 'LANGLE   : "<"', 'RANGLE   : ">"', 'COMMA    : ","']);
var bootstrapGrammar = /* @__PURE__ */ (function() {
  return [new Rule("Grammar", [], [new Alt([new Ref("RuleList")], Nothing.value, new Just("\\rs -> Grammar rs"))]), new Rule("RuleList", [], [new Alt([new Ref("Rule")], Nothing.value, new Just("\\r -> [r]")), new Alt([new Ref("RuleList"), new Ref("NL"), new Ref("Rule")], Nothing.value, new Just("\\rs _ r -> snoc rs r"))]), new Rule("Rule", [], [new Alt([new Ref("ATTR"), new Ref("IDENT"), new Ref("NL"), new Lit(":"), new Ref("Body")], Nothing.value, new Just("\\attr lhs _ _ alts -> Rule lhs [ attr ] alts")), new Alt([new Ref("IDENT"), new Ref("NL"), new Lit(":"), new Ref("Body")], Nothing.value, new Just("\\lhs _ _ alts -> Rule lhs [] alts"))]), new Rule("Body", [], [new Alt([new Ref("Alt")], Nothing.value, new Just("\\a -> [a]")), new Alt([new Ref("Body"), new Lit("|"), new Ref("Alt")], Nothing.value, new Just("\\bs _ a -> snoc bs a"))]), new Rule("Alt", [], [new Alt([new Ref("SymList"), new Ref("Label"), new Ref("Action")], Nothing.value, new Just("\\syms lbl act -> Alt syms lbl act")), new Alt([new Ref("SymList"), new Ref("Label")], Nothing.value, new Just("\\syms lbl -> Alt syms lbl Nothing")), new Alt([new Ref("SymList"), new Ref("Action")], Nothing.value, new Just("\\syms act -> Alt syms Nothing act")), new Alt([new Ref("SymList")], Nothing.value, new Just("\\syms -> Alt syms Nothing Nothing"))]), new Rule("SymList", [], [new Alt([new Ref("Sym")], Nothing.value, new Just("\\s -> [s]")), new Alt([new Ref("SymList"), new Ref("Sym")], Nothing.value, new Just("\\ss s -> snoc ss s"))]), new Rule("Sym", [], [new Alt([new Ref("IDENT")], Nothing.value, new Just("\\i -> Ref i")), new Alt([new Ref("TERM_LIT")], Nothing.value, new Just("\\t -> Lit t")), new Alt([new Ref("IDENT"), new Ref("PLUS")], Nothing.value, new Just("\\i _ -> Rep (Ref i)")), new Alt([new Ref("TERM_LIT"), new Ref("PLUS")], Nothing.value, new Just("\\t _ -> Rep (Lit t)")), new Alt([new Ref("IDENT"), new Ref("STAR")], Nothing.value, new Just("\\i _ -> Star (Ref i)")), new Alt([new Ref("TERM_LIT"), new Ref("STAR")], Nothing.value, new Just("\\t _ -> Star (Lit t)")), new Alt([new Ref("IDENT"), new Ref("QUESTION")], Nothing.value, new Just("\\i _ -> Opt (Ref i)")), new Alt([new Ref("TERM_LIT"), new Ref("QUESTION")], Nothing.value, new Just("\\t _ -> Opt (Lit t)")), new Alt([new Ref("IDENT"), new Ref("LANGLE"), new Ref("Args"), new Ref("RANGLE")], Nothing.value, new Just("\\name _ args _ -> Macro name args")), new Alt([new Ref("IDENT"), new Lit(":"), new Ref("Sym")], Nothing.value, new Just("\\name _ s -> Field name s"))]), new Rule("Args", [], [new Alt([new Ref("Sym")], Nothing.value, new Just("\\s -> [s]")), new Alt([new Ref("Args"), new Ref("COMMA"), new Ref("Sym")], Nothing.value, new Just("\\as _ s -> snoc as s"))]), new Rule("Action", [], [new Alt([new Ref("ACTION")], Nothing.value, new Just("\\a -> Just a"))]), new Rule("Label", [], [new Alt([new Ref("LABEL")], Nothing.value, new Just("\\l -> Just l"))])];
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
var charAt2 = /* @__PURE__ */ (function() {
  return _charAt(Just.create)(Nothing.value);
})();

// ../output/Grammark.Lexer/index.js
var map5 = /* @__PURE__ */ map(functorMaybe);
var eq3 = /* @__PURE__ */ eq(/* @__PURE__ */ eqMaybe(eqString));
var normalizeNewlines = function(toks) {
  var term = function(j) {
    return map5(function(v) {
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
      throw new Error("Failed pattern match at Grammark.Lexer (line 194, column 3 - line 198, column 26): " + [i.constructor.name, t.constructor.name]);
    };
  };
  return catMaybes(mapWithIndex2(decide)(toks));
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

// ../output/Data.Char/index.js
var toCharCode2 = /* @__PURE__ */ fromEnum(boundedEnumChar);
var fromCharCode2 = /* @__PURE__ */ toEnum(boundedEnumChar);

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
    var append5 = append(dictMonoid.Semigroup0());
    var mempty2 = mempty(dictMonoid);
    return function(f) {
      return foldrWithIndex1(function(i) {
        return function(x) {
          return function(acc) {
            return append5(f(i)(x))(acc);
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
    var eq6 = eq(dictEq);
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
                  $copy_v2 = v2 && eq6(v1.value0)(v.value0);
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
var singleton5 = function(k) {
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
        return singleton5(k)(v);
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
    var eq23 = eq(dictEq1);
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
                if (v2 instanceof IterNext && (eq13(v.value0)(v2.value0) && eq23(v.value1)(v2.value1))) {
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
            return singleton5(k)(v);
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
          return singleton5(k)(v);
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
    var append14 = append(dictMonoid.Semigroup0());
    return function(f) {
      var go = function(v) {
        if (v instanceof Leaf) {
          return mempty2;
        }
        ;
        if (v instanceof Node) {
          return append14(go(v.value4))(append14(f(v.value3))(go(v.value5)));
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
    var append14 = append(dictMonoid.Semigroup0());
    return function(f) {
      var go = function(v) {
        if (v instanceof Leaf) {
          return mempty2;
        }
        ;
        if (v instanceof Node) {
          return append14(go(v.value4))(append14(f(v.value2)(v.value3))(go(v.value5)));
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

// ../output/Grammark.Regex/index.js
var add2 = /* @__PURE__ */ add(semiringInt);
var eq4 = /* @__PURE__ */ eq(eqChar);
var foldl3 = /* @__PURE__ */ foldl(foldableArray);
var map6 = /* @__PURE__ */ map(functorArray);
var insertWith2 = /* @__PURE__ */ insertWith(ordInt);
var toUnfoldable2 = /* @__PURE__ */ toUnfoldable(unfoldableArray);
var member2 = /* @__PURE__ */ member(ordInt);
var append1 = /* @__PURE__ */ append(semigroupArray);
var map12 = /* @__PURE__ */ map(functorMap);
var bind2 = /* @__PURE__ */ bind(bindMaybe);
var bind1 = /* @__PURE__ */ bind(bindEither);
var notEq1 = /* @__PURE__ */ notEq(/* @__PURE__ */ eqMaybe(eqChar));
var show2 = /* @__PURE__ */ show(/* @__PURE__ */ showMaybe(showChar));
var show3 = /* @__PURE__ */ show(showInt);
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
    return fromMaybe(c)(fromCharCode2(toCharCode2(c) - 32 | 0));
  }
  ;
  if (c >= "A" && c <= "Z") {
    return fromMaybe(c)(fromCharCode2(toCharCode2(c) + 32 | 0));
  }
  ;
  if (otherwise) {
    return c;
  }
  ;
  throw new Error("Failed pattern match at Grammark.Regex (line 344, column 1 - line 344, column 25): " + [c.constructor.name]);
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
    throw new Error("Failed pattern match at Grammark.Regex (line 334, column 1 - line 334, column 28): " + [v.constructor.name, v1.constructor.name]);
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
  throw new Error("Failed pattern match at Grammark.Regex (line 239, column 1 - line 239, column 30): " + [c.constructor.name]);
};
var countCaptures = /* @__PURE__ */ (function() {
  var sum2 = foldl3(add2)(0);
  return function(v) {
    if (v instanceof Capture) {
      return 1 + countCaptures(v.value0) | 0;
    }
    ;
    if (v instanceof Concat) {
      return sum2(map6(countCaptures)(v.value0));
    }
    ;
    if (v instanceof Alt2) {
      return sum2(map6(countCaptures)(v.value0));
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
            throw new Error("Failed pattern match at Grammark.Regex (line 357, column 20 - line 359, column 40): " + [item.constructor.name]);
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
            return foldl3(function(out) {
              return function(v) {
                return foldl3(function(o) {
                  return function(v1) {
                    return insertWith2(orElse)(v1.value0)(orElse(v.value1)(v1.value1))(o);
                  };
                })(out)(toUnfoldable2(matchCap(caseless)(r)(chars)(v.value0)));
              };
            })(empty2)(toUnfoldable2(acc));
          };
        };
        var merge = function(a) {
          return function(b) {
            return foldl3(function(m) {
              return function(v) {
                return insertWith2(orElse)(v.value0)(v.value1)(m);
              };
            })(a)(toUnfoldable2(b));
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
          throw new Error("Failed pattern match at Grammark.Regex (line 304, column 19 - line 306, column 21): " + [v.constructor.name]);
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
                  var fresh = toUnfoldable2(nexts);
                  var newKeys = filter(function(k) {
                    return !member2(k)(visited);
                  })(map6(fst$prime)(fresh));
                  $tco_var_visited = foldl3(function(m) {
                    return function(v1) {
                      return insertWith2(orElse)(v1.value0)(v1.value1)(m);
                    };
                  })(visited)(fresh);
                  $copy_frontier = append1(v.value0.tail)(newKeys);
                  return;
                }
                ;
                throw new Error("Failed pattern match at Grammark.Regex (line 321, column 27 - line 329, column 101): " + [v.constructor.name]);
              }
              ;
              while (!$tco_done) {
                $tco_result = $tco_loop($tco_var_visited, $copy_frontier);
              }
              ;
              return $tco_result;
            };
          };
          return go(singleton5(start)(Nothing.value))([start]);
        };
        var advance = function(pred) {
          var v = at(chars)(start);
          if (v instanceof Just && pred(v.value0)) {
            return singleton5(start + 1 | 0)(Nothing.value);
          }
          ;
          return empty2;
        };
        if (rx instanceof Empty) {
          return singleton5(start)(Nothing.value);
        }
        ;
        if (rx instanceof Lit2) {
          return advance(ciMatch(caseless)(eq4(rx.value0)));
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
          return map12(function(v) {
            return new Just(new Tuple(start, lastKey(rx.value0)));
          })(matchCap(caseless)(rx.value0)(chars)(start));
        }
        ;
        if (rx instanceof Concat) {
          return foldl3(step)(singleton5(start)(Nothing.value))(rx.value0);
        }
        ;
        if (rx instanceof Alt2) {
          return foldl3(function(acc) {
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
        throw new Error("Failed pattern match at Grammark.Regex (line 288, column 36 - line 296, column 22): " + [rx.constructor.name]);
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
          throw new Error("Failed pattern match at Grammark.Regex (line 374, column 36 - line 376, column 60): " + [v.value0.value.constructor.name]);
        }
        ;
        throw new Error("Failed pattern match at Grammark.Regex (line 372, column 44 - line 376, column 60): " + [v.constructor.name]);
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
          var v2 = bind2(at(chars)(p))(digit);
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
          throw new Error("Failed pattern match at Grammark.Regex (line 273, column 14 - line 275, column 27): " + [v2.constructor.name]);
        }
        ;
        while (!$tco_done) {
          $tco_result = $tco_loop($tco_var_acc, $copy_p);
        }
        ;
        return $tco_result;
      };
    };
    var v = bind2(at(chars)(pos))(digit);
    if (v instanceof Nothing) {
      return new Left("expected a number in a bounded repeat");
    }
    ;
    if (v instanceof Just) {
      return new Right(go(v.value0)(pos + 1 | 0));
    }
    ;
    throw new Error("Failed pattern match at Grammark.Regex (line 269, column 18 - line 271, column 37): " + [v.constructor.name]);
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
          return new Concat(append1(replicate(n)(atom))(replicate(m - n | 0)(new Alt2([atom, Empty.value]))));
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
            var v2 = bind2(at(chars)(p + i | 0))(hexDigit);
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
            throw new Error("Failed pattern match at Grammark.Regex (line 235, column 19 - line 237, column 68): " + [v2.constructor.name]);
          }
          ;
          throw new Error("Failed pattern match at Grammark.Regex (line 233, column 3 - line 237, column 68): " + [i.constructor.name, acc.constructor.name]);
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
      var v1 = fromCharCode2(v.value0);
      if (v1 instanceof Just) {
        return new Right(new Tuple(v1.value0, p + 4 | 0));
      }
      ;
      if (v1 instanceof Nothing) {
        return new Left("invalid `\\uXXXX` code point");
      }
      ;
      throw new Error("Failed pattern match at Grammark.Regex (line 229, column 17 - line 231, column 51): " + [v1.constructor.name]);
    }
    ;
    throw new Error("Failed pattern match at Grammark.Regex (line 227, column 20 - line 231, column 51): " + [v.constructor.name]);
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
    throw new Error("Failed pattern match at Grammark.Regex (line 218, column 19 - line 224, column 36): " + [v.constructor.name]);
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
    throw new Error("Failed pattern match at Grammark.Regex (line 210, column 21 - line 213, column 53): " + [v.constructor.name]);
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
        throw new Error("Failed pattern match at Grammark.Regex (line 184, column 20 - line 186, column 55): " + [v1.constructor.name]);
      }
      ;
    }
    ;
    throw new Error("Failed pattern match at Grammark.Regex (line 180, column 21 - line 186, column 55): " + [v.constructor.name]);
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
    throw new Error("Failed pattern match at Grammark.Regex (line 152, column 19 - line 176, column 44): " + [v.constructor.name]);
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
      return new Left("unexpected `" + (show2(at(chars)(v.value0.value1)) + ("` in regex at " + show3(v.value0.value1))));
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
  throw new Error("Failed pattern match at Grammark.Regex (line 80, column 5 - line 85, column 32): " + [v.constructor.name]);
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

// ../output/Data.String.CodePoints/index.js
var fromEnum2 = /* @__PURE__ */ fromEnum(boundedEnumChar);
var map7 = /* @__PURE__ */ map(functorMaybe);
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
  return map7(function(v) {
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
    return map7(function(i) {
      return length3(take2(i)(s));
    })(indexOf(p)(s));
  };
};
var fromCharCode3 = /* @__PURE__ */ (function() {
  var $75 = toEnumWithDefaults(boundedEnumChar)(bottom(boundedChar))(top(boundedChar));
  return function($76) {
    return singleton3($75($76));
  };
})();
var singletonFallback = function(v) {
  if (v <= 65535) {
    return fromCharCode3(v);
  }
  ;
  var lead = div2(v - 65536 | 0)(1024) + 55296 | 0;
  var trail = mod2(v - 65536 | 0)(1024) + 56320 | 0;
  return fromCharCode3(lead) + fromCharCode3(trail);
};
var singleton6 = /* @__PURE__ */ _singleton(singletonFallback);
var takeFallback = function(v) {
  return function(v1) {
    if (v < 1) {
      return "";
    }
    ;
    var v2 = uncons2(v1);
    if (v2 instanceof Just) {
      return singleton6(v2.value0.head) + takeFallback(v - 1 | 0)(v2.value0.tail);
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

// ../output/Grammark.Tokens/index.js
var show22 = /* @__PURE__ */ show(showChar);
var append12 = /* @__PURE__ */ append(semigroupArray);
var notEq12 = /* @__PURE__ */ notEq(/* @__PURE__ */ eqArray(eqChar));
var bind3 = /* @__PURE__ */ bind(bindEither);
var bind12 = /* @__PURE__ */ bind(bindMaybe);
var pure2 = /* @__PURE__ */ pure(applicativeEither);
var traverse2 = /* @__PURE__ */ traverse(traversableArray)(applicativeEither);
var map8 = /* @__PURE__ */ map(functorArray);
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
  throw new Error("Failed pattern match at Grammark.Tokens (line 84, column 21 - line 86, column 67): " + [v.constructor.name]);
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
              return new Left("unterminated " + (show22(delim) + " in token definition"));
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
                  $copy_acc = append12(acc)([v.value0, v1.value0]);
                  return;
                }
                ;
                throw new Error("Failed pattern match at Grammark.Tokens (line 133, column 22 - line 137, column 49): " + [v1.constructor.name]);
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
            throw new Error("Failed pattern match at Grammark.Tokens (line 127, column 14 - line 138, column 51): " + [v.constructor.name]);
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
    return bind3(readDelimited('"')(true)(drop3(1)(s)))(function(v1) {
      return new Right({
        pattern: new Exact(v1.value0),
        iflag: false,
        rest: trim(v1.value1)
      });
    });
  }
  ;
  if (v instanceof Just && v.value0 === "/") {
    return bind3(readDelimited("/")(false)(drop3(1)(s)))(function(v1) {
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
      throw new Error("Failed pattern match at Grammark.Tokens (line 115, column 5 - line 117, column 70): " + [v2.constructor.name]);
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
              throw new Error("Failed pattern match at Grammark.Tokens (line 159, column 43 - line 161, column 69): " + [v2.constructor.name]);
            }
            ;
            if (v1 instanceof Nothing) {
              $tco_done = true;
              return new Left("`%prec` expects a number");
            }
            ;
            throw new Error("Failed pattern match at Grammark.Tokens (line 158, column 28 - line 162, column 53): " + [v1.constructor.name]);
          }
          ;
        }
        ;
        var v1 = function(v22) {
          if (v instanceof Just && otherwise) {
            return new Left("unknown token modifier: " + v.value0.head);
          }
          ;
          throw new Error("Failed pattern match at Grammark.Tokens (line 150, column 1 - line 150, column 53): " + [v.constructor.name]);
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
    return bind3(validateName(trim(v.value0.value0)))(function(name) {
      return bind3(parseDefinition(trim(v.value0.value1)))(function(def) {
        return bind3(parseModifiers(words(def.rest)))(function(mods) {
          return pure2({
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
  throw new Error("Failed pattern match at Grammark.Tokens (line 66, column 18 - line 79, column 8): " + [v.constructor.name]);
};
var parseTokens = function(content) {
  var meaningful = function(line) {
    return line !== "" && line !== "grammark tokens";
  };
  return traverse2(parseLine)(filter(meaningful)(map8(trim)(split("\n")(content))));
};

// ../output/Grammark.Scanner/index.js
var map9 = /* @__PURE__ */ map(functorArray);
var append3 = /* @__PURE__ */ append(semigroupArray);
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
        throw new Error("Failed pattern match at Grammark.Scanner (line 126, column 3 - line 128, column 70): " + [a.constructor.name, b.constructor.name]);
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
      throw new Error("Failed pattern match at Grammark.Scanner (line 118, column 7 - line 120, column 67): " + [v.constructor.name]);
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
            throw new Error("Failed pattern match at Grammark.Scanner (line 104, column 19 - line 111, column 89): " + [v.constructor.name]);
          }
          ;
          throw new Error("Failed pattern match at Grammark.Scanner (line 102, column 3 - line 111, column 89): " + [pos.constructor.name, acc.constructor.name]);
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
          throw new Error("Failed pattern match at Grammark.Scanner (line 86, column 3 - line 90, column 22): " + [i.constructor.name]);
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
        throw new Error("Failed pattern match at Grammark.Scanner (line 74, column 21 - line 76, column 20): " + [v.constructor.name]);
      };
    };
    var implicitItems = map9(function(lit) {
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
        throw new Error("Failed pattern match at Grammark.Scanner (line 60, column 23 - line 72, column 8): " + [def.pattern.constructor.name]);
      };
    };
    return append3(implicitItems)(mapWithIndex2(classItem)(defs));
  };
};

// ../output/Grammark.Conformance.Lexers/index.js
var foldl4 = /* @__PURE__ */ foldl(foldableArray);
var nub2 = /* @__PURE__ */ nub(ordString);
var tokensBlock = function(md) {
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
      throw new Error("Failed pattern match at Grammark.Conformance.Lexers (line 109, column 27 - line 111, column 28): " + [found.constructor.name]);
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
      if (trim(line) === "```grammark tokens") {
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
      throw new Error("Failed pattern match at Grammark.Conformance.Lexers (line 102, column 3 - line 108, column 22): " + [acc.constructor.name, line.constructor.name]);
    };
  };
  return foldl4(step)({
    inside: false,
    cur: [],
    found: Nothing.value
  })(split("\n")(md)).found;
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
  return nub2(concatMap(ruleLits)(v));
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

// ../output/Grammark.Cst/index.js
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
var cstToken = function(t) {
  return new Token(t.terminal, t.text);
};
var cstReduce = /* @__PURE__ */ (function() {
  return Branch.create;
})();

// ../output/Data.List/index.js
var map10 = /* @__PURE__ */ map(functorMaybe);
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
var toUnfoldable3 = function(dictUnfoldable) {
  return unfoldr(dictUnfoldable)(function(xs) {
    return map10(function(rec) {
      return new Tuple(rec.head, rec.tail);
    })(uncons3(xs));
  });
};

// ../output/Data.Set/index.js
var coerce3 = /* @__PURE__ */ coerce();
var foldMap2 = /* @__PURE__ */ foldMap(foldableList);
var foldl5 = /* @__PURE__ */ foldl(foldableList);
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
var toUnfoldable4 = function(dictUnfoldable) {
  var $96 = toUnfoldable3(dictUnfoldable);
  return function($97) {
    return $96(toList($97));
  };
};
var size2 = /* @__PURE__ */ coerce3(size);
var singleton7 = function(a) {
  return singleton5(a)(unit);
};
var member3 = function(dictOrd) {
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
      var $100 = foldl5(f)(x);
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
  var eq6 = eq(eqMap(dictEq)(eqUnit));
  return {
    eq: function(v) {
      return function(v1) {
        return eq6(v)(v1);
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
var map11 = function(dictOrd) {
  var insert12 = insert2(dictOrd);
  return function(f) {
    return foldl12(function(m) {
      return function(a) {
        return insert12(f(a))(m);
      };
    })(empty3);
  };
};

// ../output/Grammark.Table/index.js
var lookup2 = /* @__PURE__ */ lookup(ordString);
var member4 = /* @__PURE__ */ member3(ordString);
var fromFoldable4 = /* @__PURE__ */ fromFoldable3(foldableArray);
var fromFoldable1 = /* @__PURE__ */ fromFoldable4(ordString);
var map13 = /* @__PURE__ */ map(functorArray);
var compare3 = /* @__PURE__ */ compare(ordString);
var insertWith3 = /* @__PURE__ */ insertWith(ordString);
var foldl6 = /* @__PURE__ */ foldl(foldableArray);
var foldlWithIndex2 = /* @__PURE__ */ foldlWithIndex(foldableWithIndexArray);
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
var toUnfoldable5 = /* @__PURE__ */ toUnfoldable(unfoldableArray);
var toUnfoldable1 = /* @__PURE__ */ toUnfoldable4(unfoldableArray);
var union3 = /* @__PURE__ */ union2(ordInt);
var any3 = /* @__PURE__ */ any(foldableList)(heytingAlgebraBoolean);
var any1 = /* @__PURE__ */ any(foldableArray)(heytingAlgebraBoolean);
var ordTuple1 = /* @__PURE__ */ ordTuple2(/* @__PURE__ */ ordArray(ordInt));
var lookup22 = /* @__PURE__ */ lookup(ordTuple1);
var insert3 = /* @__PURE__ */ insert(ordInt);
var insert1 = /* @__PURE__ */ insert(ordTuple1);
var insertWith1 = /* @__PURE__ */ insertWith(ordInt);
var append4 = /* @__PURE__ */ append(semigroupArray);
var map14 = /* @__PURE__ */ map(functorMap);
var eq22 = /* @__PURE__ */ eq(/* @__PURE__ */ eqMap(eqInt)(eqInt));
var insert22 = /* @__PURE__ */ insert(/* @__PURE__ */ ordTuple2(ordString));
var ordRecord1 = /* @__PURE__ */ ordRecord2(/* @__PURE__ */ ordRecordCons2(dotIsSymbol)(ordInt));
var ordSet2 = /* @__PURE__ */ ordSet(ordRecord1);
var lookup3 = /* @__PURE__ */ lookup(ordSet2);
var insert32 = /* @__PURE__ */ insert(ordSet2);
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
    return fromMaybe(empty3)(lookup2(k)(m));
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
        var $185 = member4(v1.value0)(v);
        if ($185) {
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
      throw new Error("Failed pattern match at Grammark.Table (line 100, column 1 - line 100, column 37): " + [v.constructor.name, v1.constructor.name]);
    }
    ;
    while (!$tco_done) {
      $tco_result = $tco_loop($tco_var_v, $copy_v1);
    }
    ;
    return $tco_result;
  };
};
var nontermSet = function(v) {
  return fromFoldable1(map13(function(v1) {
    return v1.value0;
  })(v));
};
var productions = function(v) {
  var nts = nontermSet(v);
  var ruleProds = function(v1) {
    return map13(function(v2) {
      return {
        lhs: v1.value0,
        rhs: map13(resolve(nts))(v2.value0)
      };
    })(v1.value2);
  };
  return concatMap(ruleProds)(v);
};
var fixpoint = function(dictEq) {
  var eq52 = eq(dictEq);
  return function(step) {
    return function(x) {
      var x$prime = step(x);
      var $209 = eq52(x$prime)(x);
      if ($209) {
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
    throw new Error("Failed pattern match at Grammark.Table (line 135, column 24 - line 138, column 30): " + [v.constructor.name]);
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
      throw new Error("Failed pattern match at Grammark.Table (line 227, column 27 - line 229, column 29): " + [v.constructor.name]);
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
var eq32 = /* @__PURE__ */ eq(eqSymbol);
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
      throw new Error("Failed pattern match at Grammark.Table (line 0, column 0 - line 0, column 0): " + [x.constructor.name, y.constructor.name]);
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
var insert4 = /* @__PURE__ */ insert(ordTuple22);
var ordSet1 = /* @__PURE__ */ ordSet(ordRecord22);
var insert5 = /* @__PURE__ */ insert(ordSet1);
var fromFoldable22 = /* @__PURE__ */ fromFoldable4(ordSymbol);
var insertWith22 = /* @__PURE__ */ insertWith(ordSymbol);
var member1 = /* @__PURE__ */ member3(ordSymbol);
var lookup4 = /* @__PURE__ */ lookup(ordTuple22);
var insert6 = /* @__PURE__ */ insert2(ordRecord22);
var fromFoldable32 = /* @__PURE__ */ fromFoldable4(ordRecord22);
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
          return insertWith3(union1)(v.lhs)(firstOfSymbol(m)(v1.value0))(m);
        }
        ;
        throw new Error("Failed pattern match at Grammark.Table (line 143, column 28 - line 145, column 65): " + [v1.constructor.name]);
      };
    };
    return foldl6(addProd)(m0)(prods);
  };
};
var firstSets = function(prods) {
  return fixpoint1(firstStep(prods))(empty2);
};
var followStep = function(firsts) {
  return function(start) {
    return function(prods) {
      return function(fl0) {
        var seeded = insertWith3(union1)(start)(singleton7(EOF.value))(fl0);
        var perPos = function(lhs) {
          return function(rhs) {
            return function(i) {
              return function(m) {
                return function(sym) {
                  if (sym instanceof NonTerm) {
                    var v = index(rhs)(i + 1 | 0);
                    if (v instanceof Just) {
                      return insertWith3(union1)(sym.value0)(firstOfSymbol(firsts)(v.value0))(m);
                    }
                    ;
                    if (v instanceof Nothing) {
                      return insertWith3(union1)(sym.value0)(setOf(lhs)(m))(m);
                    }
                    ;
                    throw new Error("Failed pattern match at Grammark.Table (line 163, column 18 - line 166, column 60): " + [v.constructor.name]);
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
        return foldl6(perProd)(seeded)(prods);
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
      return foldl6(function(acc) {
        return function(c) {
          var $245 = blk(c) === b;
          if ($245) {
            return union22(acc)(itemsOf(c));
          }
          ;
          return acc;
        };
      })(empty3)(ids);
    };
    var remap = function(acc) {
      return function(v) {
        return insert4(new Tuple(blk(v.value0.value0), v.value0.value1))(blk(v.value1))(acc);
      };
    };
    return {
      states: map13(blockItems)(range2(0)(numBlocks - 1 | 0)),
      index: foldlWithIndex2(function(i) {
        return function(m) {
          return function(s) {
            return insert5(s)(i)(m);
          };
        };
      })(empty2)(map13(blockItems)(range2(0)(numBlocks - 1 | 0))),
      trans: foldl6(remap)(empty2)(toUnfoldable5(canonical.trans))
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
    var shiftLooks = fromFoldable22(mapMaybe(shiftSym)(itemArr));
    var complete = filter(function(it) {
      return it.dot >= length(rhsOf(ctx)(it.prod));
    })(itemArr);
    var reduceByLook = foldl6(function(m) {
      return function(it) {
        return insertWith22(union3)(it.look)(singleton7(it.prod))(m);
      };
    })(empty2)(complete);
    var reduceReduce = any3(function(s) {
      return size2(s) > 1;
    })(values(reduceByLook));
    var shiftReduce = any1(function(it) {
      return member1(it.look)(shiftLooks);
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
                    part: insert3(c)(v.value0)(acc.part)
                  };
                }
                ;
                if (v instanceof Nothing) {
                  return {
                    ids: insert1(sig)(nextId)(acc.ids),
                    part: insert3(c)(nextId)(acc.part)
                  };
                }
                ;
                throw new Error("Failed pattern match at Grammark.Table (line 484, column 22 - line 486, column 98): " + [v.constructor.name]);
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
        var blockMembers = foldl6(function(m) {
          return function(c) {
            return insertWith1(append4)(blk(c))([c])(m);
          };
        })(empty2)(ids);
        var inadeqOf = map14(function(members) {
          return inadequate(ctx)(foldl6(function(acc) {
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
            throw new Error("Failed pattern match at Grammark.Table (line 471, column 17 - line 473, column 18): " + [v.constructor.name]);
          };
        };
        var sigOf = function(c) {
          var b = blk(c);
          var marker = (function() {
            var $259 = fromMaybe(false)(lookup1(b)(inadeqOf));
            if ($259) {
              return c;
            }
            ;
            return b;
          })();
          return new Tuple(marker, map13(succBlk(c))(symbols));
        };
        return renumber(map13(sigOf)(ids));
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
          var $260 = eq22(part$prime)(part);
          if ($260) {
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
    return toUnfoldable1(fromFoldable22(mapMaybe(afterDot)(toUnfoldable1(items))));
  };
};
var transSymbols = function(canonical) {
  var keySym = function(v) {
    return v.value0.value1;
  };
  var entries = toUnfoldable5(canonical.trans);
  return toUnfoldable1(fromFoldable22(map13(keySym)(entries)));
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
var eq42 = /* @__PURE__ */ eq(eqAction);
var fillTables = function(ctx) {
  return function(st) {
    return function(realProds) {
      var conflictAt = function(state) {
        return function(sym) {
          return function(existing) {
            return function(newProd) {
              if (existing instanceof Shift) {
                return new ShiftReduce({
                  state,
                  onSymbol: sym,
                  reduceProd: newProd
                });
              }
              ;
              if (existing instanceof Reduce) {
                return new ReduceReduce({
                  state,
                  onSymbol: sym,
                  prodA: existing.value0,
                  prodB: newProd
                });
              }
              ;
              if (existing instanceof Accept) {
                return new ReduceReduce({
                  state,
                  onSymbol: sym,
                  prodA: -1 | 0,
                  prodB: newProd
                });
              }
              ;
              throw new Error("Failed pattern match at Grammark.Table (line 362, column 43 - line 365, column 79): " + [existing.constructor.name]);
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
              action: insert4(new Tuple(v.value0.value0, v.value0.value1))(new Shift(v.value1))(acc.action)
            };
          }
          ;
          if (v.value0.value1 instanceof NonTerm) {
            return {
              action: acc.action,
              conflicts: acc.conflicts,
              "goto": insert22(new Tuple(v.value0.value0, v.value0.value1.value0))(v.value1)(acc["goto"])
            };
          }
          ;
          if (v.value0.value1 instanceof EOF) {
            return acc;
          }
          ;
          throw new Error("Failed pattern match at Grammark.Table (line 334, column 42 - line 337, column 15): " + [v.value0.value1.constructor.name]);
        };
      };
      var shifted = foldl6(addTrans)({
        action: empty2,
        "goto": empty2,
        conflicts: []
      })(toUnfoldable5(st.trans));
      var addReduce = function(i) {
        return function(acc) {
          return function(it) {
            var $298 = it.dot < length(rhsOf(ctx)(it.prod));
            if ($298) {
              return acc;
            }
            ;
            var newProd = it.prod - 1 | 0;
            var key = new Tuple(i, it.look);
            var act = (function() {
              var $299 = it.prod === 0;
              if ($299) {
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
                action: insert4(key)(act)(acc.action)
              };
            }
            ;
            if (v instanceof Just) {
              var $301 = eq42(v.value0)(act);
              if ($301) {
                return acc;
              }
              ;
              return {
                action: acc.action,
                "goto": acc["goto"],
                conflicts: snoc(acc.conflicts)(conflictAt(i)(it.look)(v.value0)(newProd))
              };
            }
            ;
            throw new Error("Failed pattern match at Grammark.Table (line 352, column 9 - line 356, column 102): " + [v.constructor.name]);
          };
        };
      };
      var addReduces = function(i) {
        return function(acc) {
          return function(items) {
            return foldl6(addReduce(i))(acc)(toUnfoldable1(items));
          };
        };
      };
      var filled = foldlWithIndex2(addReduces)(shifted)(st.states);
      var $303 = $$null(filled.conflicts);
      if ($303) {
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
var coreOf = /* @__PURE__ */ map11(ordRecord1)(function(it) {
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
        var v = lookup3(core)(acc.coreToId);
        if (v instanceof Just) {
          return {
            coreToId: acc.coreToId,
            part: insert3(i)(v.value0)(acc.part)
          };
        }
        ;
        if (v instanceof Nothing) {
          return {
            coreToId: insert32(core)(nextId)(acc.coreToId),
            part: insert3(i)(nextId)(acc.part)
          };
        }
        ;
        throw new Error("Failed pattern match at Grammark.Table (line 444, column 24 - line 446, column 107): " + [v.constructor.name]);
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
        var v = lookup3(core)(acc.coreToId);
        if (v instanceof Just) {
          return {
            coreToId: acc.coreToId,
            oldToNew: insert3(i)(v.value0)(acc.oldToNew),
            states: fromMaybe(acc.states)(modifyAt(v.value0)(union22(items))(acc.states))
          };
        }
        ;
        if (v instanceof Nothing) {
          return {
            coreToId: insert32(core)(nextId)(acc.coreToId),
            oldToNew: insert3(i)(nextId)(acc.oldToNew),
            states: snoc(acc.states)(items)
          };
        }
        ;
        throw new Error("Failed pattern match at Grammark.Table (line 397, column 24 - line 406, column 8): " + [v.constructor.name]);
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
      return insert4(new Tuple(newId(v.value0.value0), v.value0.value1))(newId(v.value1))(acc);
    };
  };
  return {
    states: merged.states,
    index: foldlWithIndex2(function(i) {
      return function(m) {
        return function(s) {
          return insert5(s)(i)(m);
        };
      };
    })(empty2)(merged.states),
    trans: foldl6(remap)(empty2)(toUnfoldable5(st.trans))
  };
};
var closure = function(ctx) {
  var addItem = function(acc) {
    return function(it) {
      var v = index(rhsOf(ctx)(it.prod))(it.dot);
      if (v instanceof Just && v.value0 instanceof NonTerm) {
        var beta = drop(it.dot + 1 | 0)(rhsOf(ctx)(it.prod));
        var las = firstSeqThen(ctx)(beta)(it.look);
        var bProds = fromMaybe([])(lookup2(v.value0.value0)(ctx.byLhs));
        return foldl6(function(a1) {
          return function(pIdx) {
            return foldl6(function(a2) {
              return function(la) {
                return insert6({
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
    return foldl6(addItem)(items)(toUnfoldable1(items));
  };
  return fixpoint2(step);
};
var $$goto = function(ctx) {
  return function(items) {
    return function(x) {
      var shift = function(it) {
        var v = index(rhsOf(ctx)(it.prod))(it.dot);
        if (v instanceof Just && eq32(v.value0)(x)) {
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
      return closure(ctx)(fromFoldable32(moved));
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
    index: singleton5(start)(0),
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
          index: insert5(items)(j)(st.index)
        }, j);
      }
      ;
      throw new Error("Failed pattern match at Grammark.Table (line 301, column 23 - line 307, column 98): " + [v.constructor.name]);
    };
  };
  var stepSym = function(items) {
    return function(i) {
      return function(st) {
        return function(x) {
          var g = $$goto(ctx)(items)(x);
          var $321 = isEmpty2(g);
          if ($321) {
            return st;
          }
          ;
          var v = addState(st)(g);
          return {
            states: v.value0.states,
            index: v.value0.index,
            trans: insert4(new Tuple(i, x))(v.value1)(v.value0.trans)
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
        var $325 = i >= length(st.states);
        if ($325) {
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
          $tco_var_st = foldl6(stepSym(v.value0)(i))(st)(symbolsAfterDot(ctx)(v.value0));
          $copy_i = i + 1 | 0;
          return;
        }
        ;
        throw new Error("Failed pattern match at Grammark.Table (line 284, column 10 - line 286, column 93): " + [v.constructor.name]);
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
var mkCtx = function(a) {
  var aug = {
    lhs: acceptName,
    rhs: [new NonTerm(a.start)]
  };
  var prods = cons(aug)(a.prods);
  var byLhs = foldlWithIndex2(function(i) {
    return function(m) {
      return function(p) {
        return insertWith3(append4)(p.lhs)([i])(m);
      };
    };
  })(empty2)(prods);
  return {
    prods,
    byLhs,
    firsts: a.firsts
  };
};
var buildTablesFor = function(method) {
  return function(g) {
    var a = analyze(g);
    var ctx = mkCtx(a);
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
      throw new Error("Failed pattern match at Grammark.Table (line 543, column 12 - line 546, column 36): " + [method.constructor.name]);
    })();
    return fillTables(ctx)(states)(a.prods);
  };
};

// ../output/Grammark.Parser/index.js
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
    throw new Error("Failed pattern match at Grammark.Parser (line 38, column 10 - line 41, column 54): " + [v.constructor.name]);
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
              throw new Error("Failed pattern match at Grammark.Parser (line 96, column 9 - line 98, column 70): " + [v1.constructor.name]);
            }
            ;
            throw new Error("Failed pattern match at Grammark.Parser (line 85, column 21 - line 98, column 70): " + [v.constructor.name]);
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
                throw new Error("Failed pattern match at Grammark.Parser (line 61, column 14 - line 63, column 23): " + [mtok.constructor.name]);
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
                throw new Error("Failed pattern match at Grammark.Parser (line 66, column 27 - line 73, column 66): " + [mtok.constructor.name]);
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
                throw new Error("Failed pattern match at Grammark.Parser (line 74, column 28 - line 76, column 27): " + [v1.constructor.name]);
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
                throw new Error("Failed pattern match at Grammark.Parser (line 77, column 24 - line 79, column 71): " + [v1.constructor.name]);
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
                throw new Error("Failed pattern match at Grammark.Parser (line 80, column 20 - line 82, column 52): " + [mtok.constructor.name]);
              }
              ;
              throw new Error("Failed pattern match at Grammark.Parser (line 65, column 7 - line 82, column 52): " + [v.constructor.name]);
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

// ../output/Grammark.Conformance/index.js
var show5 = /* @__PURE__ */ show(showParseError);
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
              return Left.create(show5($24));
            })(Right.create)(run3(v1.value0)(cstToken)(cstReduce)(v.value0));
          }
          ;
          throw new Error("Failed pattern match at Grammark.Conformance (line 86, column 19 - line 88, column 86): " + [v1.constructor.name]);
        }
        ;
        throw new Error("Failed pattern match at Grammark.Conformance (line 84, column 3 - line 88, column 86): " + [v.constructor.name]);
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

// ../output/Data.Map/index.js
var keys2 = /* @__PURE__ */ (function() {
  var $38 = $$void(functorMap);
  return function($39) {
    return fromMap($38($39));
  };
})();

// ../output/Grammark.Desugar/index.js
var lookup7 = /* @__PURE__ */ lookup(ordString);
var map15 = /* @__PURE__ */ map(functorArray);
var member5 = /* @__PURE__ */ member(ordString);
var show6 = /* @__PURE__ */ show(showInt);
var append13 = /* @__PURE__ */ append(semigroupArray);
var foldl7 = /* @__PURE__ */ foldl(foldableArray);
var bind4 = /* @__PURE__ */ bind(bindEither);
var map16 = /* @__PURE__ */ map(functorEither);
var traverse3 = /* @__PURE__ */ traverse(traversableArray)(applicativeEither);
var elem3 = /* @__PURE__ */ elem2(eqString);
var insert7 = /* @__PURE__ */ insert(ordString);
var fromFoldable5 = /* @__PURE__ */ fromFoldable(foldableSet);
var pure3 = /* @__PURE__ */ pure(applicativeEither);
var fromFoldable12 = /* @__PURE__ */ fromFoldable2(ordString)(foldableArray);
var map23 = /* @__PURE__ */ map(functorMaybe);
var fromFoldable23 = /* @__PURE__ */ fromFoldable(foldableList);
var spliceCst = function(im) {
  return function(sym) {
    var v = function(v1) {
      return [sym];
    };
    if (sym instanceof Ref) {
      var $68 = lookup7(sym.value0)(im);
      if ($68 instanceof Just) {
        return $68.value0.value0;
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
      return "\\" + (joinWith(" ")(map15(paramOf)(syms)) + (" -> " + body));
    }
    ;
    throw new Error("Failed pattern match at Grammark.Desugar (line 205, column 29 - line 207, column 71): " + [v.constructor.name]);
  };
};
var isInlineRef = function(im) {
  return function(v) {
    if (v instanceof Ref) {
      return member5(v.value0)(im);
    }
    ;
    return false;
  };
};
var inlineParam = function(k) {
  return "q" + show6(k);
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
  throw new Error("Failed pattern match at Grammark.Desugar (line 321, column 12 - line 328, column 48): " + [v.constructor.name]);
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
              var $103 = lookup7(v1.value0)(im);
              if ($103 instanceof Just) {
                if ($103.value0.value2 instanceof Nothing) {
                  return new Left("#[inline] rule `" + (v1.value0 + "` is action-free but its value is used in an action"));
                }
                ;
                if ($103.value0.value2 instanceof Just) {
                  var ps = map15(inlineParam)(range2(v2.value0.k)((v2.value0.k + length($103.value0.value0) | 0) - 1 | 0));
                  var arg = "((" + (normalizeAction($103.value0.value0)($103.value0.value2.value0) + (") " + (joinWith(" ")(ps) + ")")));
                  return new Right({
                    syms: append13(v2.value0.syms)($103.value0.value0),
                    params: append13(v2.value0.params)(ps),
                    args: snoc(v2.value0.args)(arg),
                    k: v2.value0.k + length($103.value0.value0) | 0
                  });
                }
                ;
                throw new Error("Failed pattern match at Grammark.Desugar (line 284, column 62 - line 296, column 14): " + [$103.value0.value2.constructor.name]);
              }
              ;
              return v22(true);
            }
            ;
            return v22(true);
          }
          ;
          throw new Error("Failed pattern match at Grammark.Desugar (line 282, column 3 - line 282, column 27): " + [v2.constructor.name, v1.constructor.name]);
        };
      };
      var v = foldl7(step)(new Right({
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
      throw new Error("Failed pattern match at Grammark.Desugar (line 275, column 3 - line 280, column 8): " + [v.constructor.name]);
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
        return bind4(buildWrapped(im)(v.value0)(normalizeAction(v.value0)(v.value2.value0)))(function(built) {
          return new Right(new Alt(built.syms, v.value1, new Just(built.action)));
        });
      }
      ;
      throw new Error("Failed pattern match at Grammark.Desugar (line 250, column 17 - line 254, column 57): " + [v.value2.constructor.name]);
    }
    ;
    throw new Error("Failed pattern match at Grammark.Desugar (line 247, column 1 - line 247, column 56): " + [im.constructor.name, v.constructor.name]);
  };
};
var expandRule = function(im) {
  return function(v) {
    return map16(Rule.create(v.value0)(v.value1))(traverse3(expandAlt(im))(v.value2));
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
        return bind4(acc)(function(m) {
          if (v1.value2.length === 1 && any2(hasSugar)(v1["value2"][0].value0)) {
            return new Left("#[inline] rule `" + (v1.value0 + "` may not use repetition or macro sugar"));
          }
          ;
          if (v1.value2.length === 1) {
            return new Right(insert7(v1.value0)(v1["value2"][0])(m));
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
      throw new Error("Failed pattern match at Grammark.Desugar (line 231, column 3 - line 239, column 22): " + [acc.constructor.name, v1.constructor.name]);
    };
  };
  return bind4(foldl7(addInline)(new Right(empty2))(v))(function(inlineMap) {
    return bind4(traverse3(expandRule(inlineMap))(filter(function($249) {
      return !isInline($249);
    })(v)))(function(expanded) {
      var v1 = find2(function(n) {
        return any2(mentions(n))(expanded);
      })(fromFoldable5(keys2(inlineMap)));
      if (v1 instanceof Just) {
        return new Left("#[inline] nonterminal `" + (v1.value0 + "` must be used as a plain reference"));
      }
      ;
      if (v1 instanceof Nothing) {
        return new Right(expanded);
      }
      ;
      throw new Error("Failed pattern match at Grammark.Desugar (line 225, column 3 - line 227, column 40): " + [v1.constructor.name]);
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
  throw new Error("Failed pattern match at Grammark.Desugar (line 186, column 1 - line 186, column 38): " + [n.constructor.name]);
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
  throw new Error("Failed pattern match at Grammark.Desugar (line 192, column 12 - line 199, column 26): " + [v.constructor.name]);
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
    return "p" + show6(k);
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
      var r = foldl7(step)({
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
      return map15(Field.create(v1.value0.value0))(rhsOf2(new Tuple(v1.value0.value1, v1.value1)));
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
        return function(sym) {
          if (optStar(sym)) {
            var v1 = uncons(acc.fs);
            if (v1 instanceof Just) {
              return {
                out: snoc(acc.out)(new Tuple(sym, v1.value0.head)),
                fs: v1.value0.tail
              };
            }
            ;
            if (v1 instanceof Nothing) {
              return {
                fs: acc.fs,
                out: snoc(acc.out)(new Tuple(sym, false))
              };
            }
            ;
            throw new Error("Failed pattern match at Grammark.Desugar (line 98, column 23 - line 100, column 72): " + [v1.constructor.name]);
          }
          ;
          if (otherwise) {
            return {
              fs: acc.fs,
              out: snoc(acc.out)(new Tuple(sym, true))
            };
          }
          ;
          throw new Error("Failed pattern match at Grammark.Desugar (line 97, column 5 - line 101, column 70): " + [acc.constructor.name, sym.constructor.name]);
        };
      };
      return foldl7(step)({
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
  var collectFresh = bind4(traverse3(macroRule)(mapMaybe(asMacro)(everySym)))(function(macroEntries) {
    return pure3(fromFoldable12(append13(mapMaybe(listEntry)(everySym))(macroEntries)));
  });
  var enumerateAlt = function(v1) {
    var action = map23(normalizeAction(v1.value0))(v1.value2);
    var build = function(presences) {
      var rhs = concatMap(rhsOf2)(presences);
      var $240 = $$null(rhs);
      if ($240) {
        return new Left("an all-optional alternative would be empty; keep at least one required symbol or refactor");
      }
      ;
      return new Right(new Alt(rhs, v1.value1, map23(wrap(presences))(action)));
    };
    var $241 = !any2(optStar)(v1.value0);
    if ($241) {
      return new Right([new Alt(map15(lowerOne)(v1.value0), v1.value1, action)]);
    }
    ;
    return traverse3(build)(map15(assign(v1.value0))(bools(length(filter(optStar)(v1.value0)))));
  };
  var lowerRule = function(v1) {
    return map16((function() {
      var $250 = Rule.create(v1.value0)(v1.value1);
      return function($251) {
        return $250(concat($251));
      };
    })())(traverse3(enumerateAlt)(v1.value2));
  };
  return bind4(collectFresh)(function(fresh) {
    return bind4(traverse3(lowerRule)(v))(function(lowered) {
      return pure3(append13(lowered)(fromFoldable23(values(fresh))));
    });
  });
};
var desugar = function(g) {
  return bind4(inlineExpand(g))(sugarDesugar);
};

// ../output/Grammark.Diagnostics/index.js
var map17 = /* @__PURE__ */ map(functorArray);
var member6 = /* @__PURE__ */ member3(ordString);
var nub3 = /* @__PURE__ */ nub(ordString);
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
  throw new Error("Failed pattern match at Grammark.Diagnostics (line 52, column 10 - line 59, column 46): " + [v.constructor.name]);
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
    return isNonterminalName(name) && !member6(name)(defined);
  };
  var altRefs = function(v1) {
    return concatMap(refsOf)(v1.value0);
  };
  return nub3(filter($$undefined)(concatMap(altRefs)(concatMap(ruleAlts)(v))));
};
var checkDefined = function(g) {
  var v = undefinedNonterminals(g);
  if (v.length === 0) {
    return new Right(g);
  }
  ;
  return new Left("undefined nonterminal" + ((function() {
    var $46 = length(v) === 1;
    if ($46) {
      return " ";
    }
    ;
    return "s ";
  })() + (joinWith(", ")(map17(function(n) {
    return "`" + (n + "`");
  })(v)) + ": a mixed-case name must be defined by some rule (an ALL-CAPS name is a lexer token class).")));
};

// ../output/Grammark.Lr/index.js
var foldl9 = /* @__PURE__ */ foldl(foldableArray);
var show7 = /* @__PURE__ */ show(showInt);
var show12 = /* @__PURE__ */ show(showParseError);
var bind5 = /* @__PURE__ */ bind(bindEither);
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
      throw new Error("Failed pattern match at Grammark.Lr (line 78, column 34 - line 80, column 26): " + [v1.constructor.name]);
    }
    ;
    if (v instanceof Just) {
      return cons(v.value0.head)(go(v.value0.tail));
    }
    ;
    throw new Error("Failed pattern match at Grammark.Lr (line 76, column 11 - line 81, column 53): " + [v.constructor.name]);
  };
  return function($147) {
    return fromCharArray(go(toCharArray($147)));
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
    if (p === 23 && (kids.length === 1 && kids[0] instanceof VSym)) {
      return new VSyms([kids[0].value0]);
    }
    ;
    if (p === 24 && (kids.length === 3 && (kids[0] instanceof VSyms && kids[2] instanceof VSym))) {
      return new VSyms(snoc(kids[0].value0)(kids[2].value0));
    }
    ;
    if (p === 25 && (kids.length === 1 && kids[0] instanceof VStr)) {
      return new VMaybeStr(new Just(kids[0].value0));
    }
    ;
    if (p === 26 && (kids.length === 1 && kids[0] instanceof VStr)) {
      return new VMaybeStr(new Just(kids[0].value0));
    }
    ;
    return new VErr("unexpected reduce shape for production " + show7(p));
  };
};
var lrScanItems = /* @__PURE__ */ buildItems(/* @__PURE__ */ fromRight([])(/* @__PURE__ */ parseTokens(lrTokensSource)))([":", "|"]);
var lrBlocks = function(md) {
  var scan2 = function(acc) {
    return function(line) {
      if (acc.inside) {
        var $136 = trim(line) === "```";
        if ($136) {
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
      var $137 = trim(line) === "```grammark";
      if ($137) {
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
  return foldl9(scan2)({
    inside: false,
    cur: [],
    blocks: []
  })(split("\n")(md)).blocks;
};
var parseWith = function(method) {
  return function(md) {
    var src = joinWith("\n")(lrBlocks(md)) + "\n";
    var raw = scan(lrScanItems)(src);
    var $138 = hasError(raw);
    if ($138) {
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
        return bind5(desugar(v1.value0.value0))(checkDefined);
      }
      ;
      if (v1 instanceof Right) {
        return new Left("parse did not yield a Grammar");
      }
      ;
      throw new Error("Failed pattern match at Grammark.Lr (line 177, column 22 - line 180, column 56): " + [v1.constructor.name]);
    }
    ;
    throw new Error("Failed pattern match at Grammark.Lr (line 175, column 10 - line 180, column 56): " + [v.constructor.name]);
  };
};
var parse = /* @__PURE__ */ (function() {
  return parseWith(Canonical.value);
})();

// ../output/Grammark.Playground/index.js
var map18 = /* @__PURE__ */ map(functorArray);
var eq5 = /* @__PURE__ */ eq(eqOutcome);
var ruleNamesOf = function(v) {
  return map18(function(v1) {
    return v1.value0;
  })(v);
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
      tokens: []
    };
  }
  ;
  if (v1 instanceof Right) {
    var rules = ruleNamesOf(v1.value0);
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
        throw new Error("Failed pattern match at Grammark.Playground (line 49, column 23 - line 51, column 23): " + [v3.constructor.name]);
      }
      ;
      if (v22 instanceof Nothing) {
        return [];
      }
      ;
      throw new Error("Failed pattern match at Grammark.Playground (line 48, column 14 - line 52, column 22): " + [v22.constructor.name]);
    })();
    var lexer = scannerLexer(defs)(v1.value0);
    var v2 = lexer(v.input);
    if (v2 instanceof Left) {
      return {
        ok: true,
        accepted: false,
        message: "The input could not be lexed.",
        diagnostics: [v2.value0],
        rules,
        tokens: []
      };
    }
    ;
    if (v2 instanceof Right) {
      var accepted = eq5(recognize(lexer)(Canonical.value)(v1.value0)(v.input))(Accept2.value);
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
            return ["Accepted by the Grammark engine."];
          }
          ;
          return ["The input did not match the grammar."];
        })(),
        rules,
        tokens: map18(function(v3) {
          return v3.text;
        })(v2.value0)
      };
    }
    ;
    throw new Error("Failed pattern match at Grammark.Playground (line 55, column 7 - line 78, column 14): " + [v2.constructor.name]);
  }
  ;
  throw new Error("Failed pattern match at Grammark.Playground (line 34, column 30 - line 78, column 14): " + [v1.constructor.name]);
};
export {
  evaluate
};
