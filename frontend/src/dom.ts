type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined>;

const SVG_NS = "http://www.w3.org/2000/svg";

function build<T extends Element>(node: T, attrs: Attrs, children: Child[]): T {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

/** Create an HTML element. Text children are inserted as text, never as markup. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  return build(document.createElement(tag), attrs, children);
}

/** Create an SVG element. */
export function s(tag: string, attrs: Attrs = {}, ...children: Child[]): SVGElement {
  return build(document.createElementNS(SVG_NS, tag) as SVGElement, attrs, children);
}

export function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}
