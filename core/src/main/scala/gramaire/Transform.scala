package gramaire

// A **bottom-up tree transform** over a `Cst`: the structure-only answer
// to multi-target semantics. The grammar carries no host code —
// alternatives are named with `# Label` (D26) and their children with
// `name:` fields (D28) — and the meaning lives in an external,
// language-specific **handler** keyed by label.
//
// `fold` walks the tree children-first (Lark's `Transformer` model).
// Ported from src/Gramaire/Transform.purs.

// A folded child: either a reduced value, or a terminal leaf.
enum Child[A]:
  case ChildVal(a: A)
  case ChildTok(terminal: String, text: String)

// A production's children as a **namedtuple**: the reduced children in
// order, plus a field-name -> position map.
final case class Children[A](valuesArr: Vector[Child[A]], names: Map[String, Int])

object Children:
  extension [A](c: Children[A])
    /** The child at a position (0-based), if any. */
    def index(i: Int): Option[Child[A]] = c.valuesArr.lift(i)

    /** The child bound to a `name:` field, if the production named that position. */
    def name(n: String): Option[Child[A]] = c.names.get(n).flatMap(c.valuesArr.lift)

    /** All children in order. */
    def values: Vector[Child[A]] = c.valuesArr

// A handler maps a labelled branch's children namedtuple to a value.
type Handler[A] = Children[A] => A

// The handler set, keyed by `# Label`.
type Handlers[A] = Map[String, Handler[A]]

// Per-production metadata pulled from the IR: the alternative's label
// and the field name (if any) at each right-hand-side position.
final case class ProdMeta(label: Option[String], fields: Vector[Option[String]])

object Transform:
  /** Build the production-id -> metadata lookup from an IR grammar. */
  def metaOf(g: IRGrammar): Int => ProdMeta = p =>
    g.rules.lift(p) match
      case Some(r) => ProdMeta(r.label, IR.effectiveFields(g, r))
      case None    => ProdMeta(None, Vector.empty)

  /** Fold a CST bottom-up. Returns the reduced child: a `ChildVal` for a branch, a `ChildTok` for a
    * terminal leaf.
    */
  def fold[A](meta: Int => ProdMeta, handlers: Handlers[A], default: Vector[Child[A]] => A)(
      cst: Cst
  ): Child[A] =
    cst match
      case Cst.Token(t, s) => Child.ChildTok(t, s)
      case Cst.Branch(p, kids) =>
        val m = meta(p)
        val children = kids.map(fold(meta, handlers, default))
        val names = m.fields.zipWithIndex.collect { case (Some(n), i) => n -> i }.toMap
        m.label.flatMap(handlers.get) match
          case Some(h) => Child.ChildVal(h(Children(children, names)))
          case None    => Child.ChildVal(default(children))

  /** Fold and extract the root value (a well-formed tree's root is a branch). */
  def foldRoot[A](meta: Int => ProdMeta, handlers: Handlers[A], default: Vector[Child[A]] => A)(
      cst: Cst
  ): Option[A] =
    fold(meta, handlers, default)(cst) match
      case Child.ChildVal(a)    => Some(a)
      case Child.ChildTok(_, _) => None

  /** The value of a child, if it is a reduced value (not a raw token). */
  def childValue[A](c: Child[A]): Option[A] = c match
    case Child.ChildVal(a)    => Some(a)
    case Child.ChildTok(_, _) => None
