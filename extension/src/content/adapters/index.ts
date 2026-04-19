export type Adapter = {
  match: (host: string) => boolean
  scope: () => Element | null
}

const ADAPTERS: Adapter[] = [
  {
    match: (h) => h.includes('shein.com'),
    scope: () =>
      document.querySelector('.product-intro, [class*="product-intro" i], [class*="ProductIntro" i], main') ?? null,
  },
  {
    match: (h) => h.includes('hm.com'),
    scope: () =>
      document.querySelector('[class*="product-description" i], [data-testid*="product-detail" i], main') ?? null,
  },
  {
    match: (h) => h.includes('zara.com'),
    scope: () =>
      document.querySelector('[data-qa-id*="product-detail" i], .product-detail-info, main') ?? null,
  },
  {
    match: (h) => h.includes('macys.com'),
    scope: () =>
      document.querySelector('[data-el*="product-details" i], #longdescription, .product-details, main') ?? null,
  },
  {
    match: (h) => h.includes('nordstrom.com'),
    scope: () =>
      document.querySelector('[data-testid*="product-details" i], #product-details, main') ?? null,
  },
  {
    match: (h) => h.includes('asos.com'),
    scope: () =>
      document.querySelector('[data-testid*="productDescriptionDetails" i], [class*="product-description" i], main') ?? null,
  },
  {
    match: (h) => h.includes('vinted.com') || h.includes('vinted.co.uk') || h.includes('vinted.fr') || h.includes('vinted.de') || h.includes('vinted.it') || h.includes('vinted.es'),
    scope: () =>
      document.querySelector('[data-testid*="item-details" i], [class*="details-list" i], [class*="item-description" i], main') ?? null,
  },
  {
    match: (h) => h.includes('depop.com'),
    scope: () =>
      document.querySelector('[data-testid*="product__" i], [class*="ProductDetails" i], main') ?? null,
  },
  {
    match: (h) => h.includes('amazon.'),
    scope: () =>
      document.querySelector(
        '#dp-container, #centerCol, #feature-bullets, #productDetails_feature_div, #detailBullets_feature_div, #productOverview_feature_div, main',
      ) ?? null,
  },
  {
    match: (h) => h.includes('urbanoutfitters.com'),
    scope: () =>
      document.querySelector(
        '[class*="c-pwa-product-details" i], [class*="c-pwa-product-description" i], [class*="ProductDetail" i], main',
      ) ?? null,
  },
  {
    match: (h) => h.includes('ae.com'),
    scope: () =>
      document.querySelector(
        '[class*="product-details" i], [class*="ProductDetails" i], [data-testid*="product-details" i], main',
      ) ?? null,
  },
  {
    match: (h) => h.includes('quince.com'),
    scope: () =>
      document.querySelector(
        '[class*="product-details" i], [class*="ProductDetails" i], [class*="ProductPage" i], main',
      ) ?? null,
  },
  {
    match: (h) => h.includes('barbour.com'),
    scope: () =>
      document.querySelector(
        '[class*="product-detail" i], [class*="ProductDetail" i], [class*="product-info" i], main',
      ) ?? null,
  },
]

export function findAdapter(host: string): Adapter | null {
  return ADAPTERS.find((a) => a.match(host)) ?? null
}
