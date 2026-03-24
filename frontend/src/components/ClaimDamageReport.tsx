import React from 'react'

interface ContractorEstimateArea {
  category: string
  summary: string
  items: string[]
}

interface ContractorEstimateParsedData {
  vendor_name: string
  property_address: string
  areas: ContractorEstimateArea[]
}

interface ContractorEstimate {
  id: string
  parsed_data: string | null
  parse_status: string
  file_name: string
}

interface ClaimDamageReportProps {
  scopeSheet?: unknown  // kept for prop compat, unused
  contractorEstimate?: ContractorEstimate | null
}

const AREA_ICONS: Record<string, string> = {
  Roof: '🏠', Roofing: '🏠',
  Windows: '🪟', Window: '🪟',
  Siding: '🧱',
  Gutters: '💧', Gutter: '💧',
  Interior: '🛋️',
  Flooring: '🪵',
  Ceiling: '⬆️',
  HVAC: '❄️',
  Electrical: '⚡',
  Plumbing: '🔧',
  Fence: '🌿',
  'Garage Door': '🚗', Garage: '🚗',
  Playscape: '🛝',
  Grill: '🍖',
}
const DEFAULT_ICON = '🔨'

function getIcon(category: string): string {
  return AREA_ICONS[category] ?? DEFAULT_ICON
}

function generateSummaryBullets(areas: ContractorEstimateArea[]): string[] {
  const bullets: string[] = []

  const roofAreas = areas.filter(a => a.category.toLowerCase().includes('roof'))
  const interiorAreas = areas.filter(a =>
    ['interior', 'hvac', 'plumbing', 'electrical', 'ceiling', 'flooring'].some(k =>
      a.category.toLowerCase().includes(k)
    )
  )
  const otherAreas = areas.filter(a => !roofAreas.includes(a) && !interiorAreas.includes(a))

  if (roofAreas.length === 1) {
    bullets.push(`Roof: ${roofAreas[0].summary}`)
  } else if (roofAreas.length > 1) {
    bullets.push(`Roof has damage across ${roofAreas.length} sections.`)
  }

  if (interiorAreas.length === 1) {
    bullets.push(`${interiorAreas[0].category}: ${interiorAreas[0].summary}`)
  } else if (interiorAreas.length > 1) {
    bullets.push(`${interiorAreas.length} interior areas affected with damage.`)
  }

  for (const area of otherAreas) {
    if (bullets.length >= 4) break
    bullets.push(`${area.category}: ${area.summary}`)
  }

  return bullets.slice(0, 4)
}

function AreaCard({ area }: { area: ContractorEstimateArea }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
          padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '20px', lineHeight: 1, flexShrink: 0 }}>{getIcon(area.category)}</span>
        <span style={{ fontWeight: 600, color: 'var(--color-navy)', fontSize: '15px', flex: 1 }}>{area.category}</span>
        <span style={{ fontSize: '12px', color: 'var(--color-slate)', marginRight: '6px', flexShrink: 0 }}>
          {area.items?.length ? `${area.items.length} item${area.items.length !== 1 ? 's' : ''}` : ''}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div style={{ padding: '0 20px 16px' }}>
          {area.summary && (
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--color-slate-dark)', lineHeight: '1.5' }}>
              {area.summary}
            </p>
          )}
          {area.items?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {area.items.map((item, j) => (
                <span key={j} style={{
                  background: 'var(--color-mint-light)', color: 'var(--color-teal-dark)',
                  borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: 500,
                }}>
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ClaimDamageReport({ contractorEstimate }: ClaimDamageReportProps) {
  if (contractorEstimate?.parsed_data) {
    let parsed: ContractorEstimateParsedData | null = null
    try {
      parsed = JSON.parse(contractorEstimate.parsed_data)
    } catch {
      // fall through to empty state
    }

    if (parsed && parsed.areas?.length > 0) {
      const bullets = generateSummaryBullets(parsed.areas)

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Summary card */}
          <div style={{
            background: 'var(--glass-mint)',
            border: '1px solid var(--color-mint-dark)',
            borderRadius: '16px',
            padding: '20px',
          }}>
            {(parsed.vendor_name || parsed.property_address) && (
              <div style={{ marginBottom: '12px' }}>
                {parsed.vendor_name && (
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-teal-dark)' }}>
                    {parsed.vendor_name}
                  </div>
                )}
                {parsed.property_address && (
                  <div style={{ fontSize: '12px', color: 'var(--color-slate)', marginTop: '2px' }}>
                    {parsed.property_address}
                  </div>
                )}
              </div>
            )}
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-navy)', marginBottom: '10px' }}>
              {parsed.areas.length} damaged area{parsed.areas.length !== 1 ? 's' : ''} identified
            </div>
            <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {bullets.map((b, i) => (
                <li key={i} style={{ fontSize: '13px', color: 'var(--color-slate-dark)', lineHeight: '1.5' }}>{b}</li>
              ))}
            </ul>
          </div>

          {/* Area cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {parsed.areas.map((area, i) => (
              <AreaCard key={i} area={area} />
            ))}
          </div>
        </div>
      )
    }
  }

  return (
    <p style={{ color: 'var(--color-slate)', textAlign: 'center', padding: '32px 0' }}>
      Damage report will appear once your contractor estimate is uploaded and parsed.
    </p>
  )
}
