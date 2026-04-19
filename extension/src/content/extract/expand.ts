const TRIGGER_TEXT = /material|composition|fabric|fiber|fibre|details|product\s*info|specification|care|content|description|about/i

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function autoExpand(): Promise<void> {
  document.querySelectorAll<HTMLDetailsElement>('details').forEach((d) => {
    if (!d.open) d.open = true
  })

  const collapsed = Array.from(
    document.querySelectorAll<HTMLElement>('[aria-expanded="false"]'),
  )
  for (const el of collapsed) {
    const label = (
      el.textContent ??
      el.getAttribute('aria-label') ??
      el.getAttribute('data-testid') ??
      ''
    ).trim()
    if (TRIGGER_TEXT.test(label)) {
      try {
        el.click()
      } catch {
        // ignore click handlers that throw
      }
    }
  }

  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('button, summary, [role="button"]'),
  )
  for (const el of buttons) {
    if (el.getAttribute('aria-expanded') !== null) continue
    const label = (el.textContent ?? '').trim()
    if (label.length > 80) continue
    if (TRIGGER_TEXT.test(label)) {
      try {
        el.click()
      } catch {
        // ignore
      }
    }
  }

  await nextFrame()
  await wait(200)
}
