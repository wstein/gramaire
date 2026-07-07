package gramaire

import gramaire.Railroad.Diagram

object DiagramNormalize:
  // An action carries evaluation semantics (`{% %}`, or a `{%? %}` predicate) that belong to one
  // specific alternative, not to the shape recognized below — collapsing an action-bearing alt
  // into an `Optional`/`ZeroOrMore` tail would silently relocate or drop it. Any stack with at
  // least one `ActionCaption` alt is left untouched; only a fully action-free stack is a candidate.
  private def hasAction(alts: Vector[Diagram]): Boolean =
    alts.exists(_.isInstanceOf[Diagram.ActionCaption])

  private def startsWith(full: Vector[Diagram], prefix: Vector[Diagram]): Boolean =
    full.length >= prefix.length && full.take(prefix.length) == prefix

  private def itemsOf(d: Diagram): Vector[Diagram] = d match
    case Diagram.Sequence(items) => items
    case other                   => Vector(other)

  private def seqOrSingle(items: Vector[Diagram]): Diagram = items match
    case Vector(single) => single
    case many           => Diagram.Sequence(many)

  private def simplifyStack(alts: Vector[Diagram]): Option[Diagram] =
    val seqs = alts.map(itemsOf)

    val optional =
      if seqs.length == 2 then
        Vector((seqs(0), seqs(1)), (seqs(1), seqs(0))).collectFirst {
          case (base, extended)
              if base.nonEmpty && startsWith(extended, base) && extended.length > base.length =>
            val tail = extended.drop(base.length)
            Diagram.Sequence(base :+ Diagram.Optional(seqOrSingle(tail)))
        }
      else None

    val recursive =
      seqs.headOption match
        case Some(first) if first.headOption.exists(_.isInstanceOf[Diagram.NonTerminal]) =>
          val selfHead = first.head
          val recursiveAlts = seqs.filter(_.headOption.contains(selfHead))
          val baseAlts = seqs.filterNot(_.headOption.contains(selfHead))
          if recursiveAlts.isEmpty || baseAlts.length != 1 || recursiveAlts.exists(_.length <= 1)
          then None
          else
            val base = baseAlts.head
            val tails = recursiveAlts.map(_.tail)
            val tailDiagram =
              if tails.length == 1 then seqOrSingle(tails.head)
              else Diagram.Choice(tails.map(seqOrSingle))
            Some(Diagram.Sequence(base :+ Diagram.ZeroOrMore(tailDiagram)))
        case _ => None

    optional.orElse(recursive)

  def simplify(diagram: Diagram): Diagram =
    diagram match
      case Diagram.Stack(alts) if !hasAction(alts) => simplifyStack(alts).getOrElse(diagram)
      case other                                   => other
