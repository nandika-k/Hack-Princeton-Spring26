import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const sourcePath = path.resolve(__dirname, '../supabase/functions/_shared/product-scrape.ts')

async function loadModule() {
  const source = readFileSync(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const tempDir = mkdtempSync(path.join(tmpdir(), 'product-scrape-'))
  const tempFile = path.join(tempDir, 'product-scrape.mjs')
  writeFileSync(tempFile, transpiled.outputText, 'utf8')

  try {
    return await import(pathToFileURL(tempFile).href)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function runTest(name, fn) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

const {
  classifyListingUrl,
  validateListingPageContent,
  isProductListingVisible,
  NON_LISTING_SCRAPE_STATUS,
} = await loadModule()

runTest('accepts listing URLs across supported retailers', () => {
  const listings = [
    ['depop', 'https://www.depop.com/products/seller-vintage-levis-501-1234567890/'],
    ['ebay', 'https://www.ebay.com/itm/166543210987'],
    ['vinted', 'https://www.vinted.com/items/54321098-vintage-wool-coat'],
    ['thredup', 'https://www.thredup.com/product/women-cotton-everlane-shirt/154321098'],
  ]

  for (const [retailer, url] of listings) {
    const decision = classifyListingUrl(url, retailer)
    assert(decision.isListing, `${retailer} listing should be accepted: ${url}`)
  }
})

runTest('rejects document and download URLs', () => {
  const rejects = [
    ['depop', 'https://www.depop.com/products/seller-vintage-slip-dress.pdf'],
    ['ebay', 'https://www.ebay.com/itm/166543210987?download=1'],
    ['vinted', 'https://www.vinted.com/catalog/lookbook-spring-2026.pdf'],
    ['thredup', 'https://www.thredup.com/product/size-guide'],
    ['vestiaire', 'https://www.vestiairecollective.com/media/returns-policy.pdf'],
  ]

  for (const [retailer, url] of rejects) {
    const decision = classifyListingUrl(url, retailer)
    assert(!decision.isListing, `${retailer} document URL should be rejected: ${url}`)
  }
})

runTest('accepts listing-like extracted content', () => {
  const decision = validateListingPageContent(
    "Vintage Levi's 501 Jeans",
    [
      '# Vintage Levi\'s 501 Jeans',
      'Size 27 waist, light wash denim in excellent condition.',
      'Ships next business day. Measurements available on request.',
      '$48 USD',
    ].join('\n'),
    'Vintage Levi\'s 501 jeans in excellent condition',
  )

  assert(decision.isListing, 'listing content should validate')
  assert(decision.signalCount >= 2, 'listing content should include multiple item signals')
})

runTest('rejects document-like extracted content', () => {
  const rejects = [
    {
      title: 'Spring Catalog PDF',
      text: 'Download our Spring Catalog PDF for the full lookbook and media kit.',
    },
    {
      title: 'Size Guide',
      text: 'Size Guide\nFind your fit across inseam conversions and measurement charts.',
    },
    {
      title: 'Returns Policy',
      text: 'Returns Policy\nRead our terms and conditions for exchanges and return windows.',
    },
  ]

  for (const sample of rejects) {
    const decision = validateListingPageContent(sample.title, sample.text, sample.text)
    assert(!decision.isListing, `document-like content should be rejected: ${sample.title}`)
  }
})

runTest('hides quarantined or invalid pinned products', () => {
  assert(
    !isProductListingVisible({
      retailer: 'depop',
      product_url: 'https://www.depop.com/products/seller-vintage-slip-dress.pdf',
      scrape_status: 'scraped',
    }),
    'invalid listing URL should be hidden',
  )

  assert(
    !isProductListingVisible({
      retailer: 'depop',
      product_url: 'https://www.depop.com/products/seller-vintage-slip-dress-1234567890/',
      scrape_status: NON_LISTING_SCRAPE_STATUS,
    }),
    'quarantined product should be hidden',
  )
})

console.log('All listing verification checks passed.')
