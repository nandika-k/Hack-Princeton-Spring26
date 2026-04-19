const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia',
  'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados',
  'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina',
  'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia',
  'Cameroon', 'Canada', 'Cape Verde', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros',
  'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Czechia',
  'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt',
  'El Salvador', 'Eritrea', 'Estonia', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon',
  'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Guatemala', 'Guinea', 'Guyana',
  'Haiti', 'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran',
  'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho',
  'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Macao', 'Macau',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Mauritania',
  'Mauritius', 'Mexico', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco',
  'Mozambique', 'Myanmar', 'Namibia', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua',
  'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan',
  'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland',
  'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saudi Arabia', 'Senegal',
  'Serbia', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Somalia',
  'South Africa', 'South Korea', 'Korea', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname',
  'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand',
  'Togo', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Türkiye', 'Turkmenistan',
  'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
  'Uruguay', 'Uzbekistan', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
]

const ALIASES: Record<string, string> = {
  'usa': 'United States',
  'u.s.a.': 'United States',
  'u.s.': 'United States',
  'us': 'United States',
  'america': 'United States',
  'uk': 'United Kingdom',
  'u.k.': 'United Kingdom',
  'great britain': 'United Kingdom',
  'britain': 'United Kingdom',
  'england': 'United Kingdom',
  'scotland': 'United Kingdom',
  'wales': 'United Kingdom',
  'uae': 'United Arab Emirates',
  'prc': 'China',
  'roc': 'Taiwan',
  'holland': 'Netherlands',
  'the netherlands': 'Netherlands',
  'czechia': 'Czech Republic',
  'russian federation': 'Russia',
  'south korea': 'South Korea',
  'republic of korea': 'South Korea',
  'korea, republic of': 'South Korea',
  'viet nam': 'Vietnam',
  'turkiye': 'Turkey',
  'türkiye': 'Turkey',
}

const LOOKUP = new Map<string, string>()
for (const c of COUNTRIES) LOOKUP.set(c.toLowerCase(), c)
for (const [k, v] of Object.entries(ALIASES)) LOOKUP.set(k, v)

export function normalizeCountry(raw: string): string | null {
  const cleaned = raw.trim().replace(/[.,;:!?]+$/, '').replace(/\s+/g, ' ')
  if (!cleaned) return null
  const canonical = LOOKUP.get(cleaned.toLowerCase())
  if (canonical) return canonical

  const firstLine = cleaned.split(/[.,\n]/)[0].trim()
  const lineMatch = LOOKUP.get(firstLine.toLowerCase())
  if (lineMatch) return lineMatch

  const words = cleaned.split(/\s+/)
  for (let take = Math.min(words.length, 4); take >= 1; take--) {
    const candidate = words.slice(0, take).join(' ').toLowerCase()
    const hit = LOOKUP.get(candidate)
    if (hit) return hit
  }
  return null
}
