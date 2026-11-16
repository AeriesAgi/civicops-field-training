/** Tiny DOM helper: element with class, attributes and children. Text is always set as text, never HTML. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: { className?: string; text?: string; attrs?: Record<string, string> } = {}, children: (Node | string | null | undefined)[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) for (const [key, value] of Object.entries(props.attrs)) node.setAttribute(key, value);
  for (const child of children) if (child !== null && child !== undefined) node.append(child);
  return node;
}

export function button(label: string, onClick: () => void, className = 'co-btn', sub?: string, attrs: Record<string, string> = {}): HTMLButtonElement {
  const node = el('button', { className, attrs: { type: 'button', ...attrs } }, [el('span', { text: label }), sub ? el('small', { text: sub }) : null]);
  node.addEventListener('click', onClick);
  return node;
}

/** Original Culltron mark: a ring opened toward a chevron. Drawn here, no external asset. */
export function culltronMark(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48'); svg.setAttribute('aria-hidden', 'true');
  const ring = document.createElementNS(ns, 'path');
  ring.setAttribute('d', 'M37 13.5A17 17 0 1 0 37 34.5');
  ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#f5b942'); ring.setAttribute('stroke-width', '5'); ring.setAttribute('stroke-linecap', 'round');
  const chevron = document.createElementNS(ns, 'path');
  chevron.setAttribute('d', 'M20 17l8 7-8 7');
  chevron.setAttribute('fill', 'none'); chevron.setAttribute('stroke', '#f7f3e9'); chevron.setAttribute('stroke-width', '4.5'); chevron.setAttribute('stroke-linecap', 'round'); chevron.setAttribute('stroke-linejoin', 'round');
  svg.append(ring, chevron);
  return svg;
}
