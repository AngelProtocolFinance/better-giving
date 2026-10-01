import {
  defaultComponents,
  mergeComponents,
  type PortableTextComponents,
} from "@portabletext/react";

interface IPtNode {
  _type?: unknown;
  _key?: unknown;
  style?: unknown;
  listItem?: unknown;
  marks?: unknown;
  markDefs?: unknown;
  children?: unknown;
}

const owns = (map: unknown, key: unknown) =>
  typeof map === "function" ||
  (typeof map === "object" &&
    map !== null &&
    typeof key === "string" &&
    Object.hasOwn(map, key));

/** `value` with every name `components` doesn't own dropped or reset to its
 * default: @portabletext/react looks marks, types, block styles and list
 * styles up on plain objects, so one named `constructor` resolves to `Object`
 * and throws at render. */
export function pt_value<T>(value: T[], components: PortableTextComponents) {
  const c = mergeComponents(defaultComponents, components);
  const known_type = (n: IPtNode) =>
    n._type === "block" || n._type === "span" || owns(c.types, n._type);

  const clean = (node: IPtNode): IPtNode => {
    if (node._type !== "block") return node;
    const defs = Array.isArray(node.markDefs)
      ? (node.markDefs as IPtNode[])
      : [];
    const mark_type = (m: unknown) =>
      defs.find((d) => d._key === m)?._type ?? m;
    const children = Array.isArray(node.children)
      ? (node.children as IPtNode[]).filter(known_type).map((ch) =>
          Array.isArray(ch.marks)
            ? {
                ...ch,
                marks: ch.marks.filter((m) => owns(c.marks, mark_type(m))),
              }
            : ch
        )
      : node.children;
    const list_ok =
      node.listItem === undefined ||
      (owns(c.list, node.listItem) && owns(c.listItem, node.listItem));
    return {
      ...node,
      children,
      style: owns(c.block, node.style) ? node.style : "normal",
      ...(list_ok ? {} : { listItem: "bullet" }),
    };
  };

  return (value as IPtNode[]).filter(known_type).map(clean) as T[];
}
