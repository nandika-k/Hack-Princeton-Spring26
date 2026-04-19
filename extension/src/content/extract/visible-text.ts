const EXCLUDED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'])

export function visibleText(root: Element | Document): string {
  const startNode = root instanceof Document ? root.body : root
  if (!startNode) return ''

  const parts: string[] = []
  const walker = document.createTreeWalker(startNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element
        if (EXCLUDED_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_SKIP
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  let current = walker.nextNode()
  while (current) {
    const v = current.nodeValue
    if (v) parts.push(v)
    current = walker.nextNode()
  }
  return parts.join(' ')
}
