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
      )
    }
  }

  return (
    <p style={{ color: 'var(--color-slate)', textAlign: 'center', padding: '32px 0' }}>
      Damage report will appear once your contractor estimate is uploaded and parsed.
    </p>
  )
}
