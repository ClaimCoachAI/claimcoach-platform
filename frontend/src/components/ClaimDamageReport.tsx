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

export default function ClaimDamageReport({ contractorEstimate }: ClaimDamageReportProps) {
  if (contractorEstimate?.parsed_data) {
    let parsed: ContractorEstimateParsedData | null = null
    try {
      parsed = JSON.parse(contractorEstimate.parsed_data)
    } catch {
      // fall through to empty state
    }

    if (parsed && parsed.areas?.length > 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {(parsed.vendor_name || parsed.property_address) && (
            <div style={{
              background: 'var(--glass-mint)',
              border: '1px solid var(--color-mint-dark)',
              borderRadius: '16px',
              padding: '16px 20px',
            }}>
              {parsed.vendor_name && (
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-teal-dark)', marginBottom: '4px' }}>
                  {parsed.vendor_name}
                </div>
              )}
              {parsed.property_address && (
                <div style={{ fontSize: '12px', color: 'var(--color-slate)' }}>{parsed.property_address}</div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {parsed.areas.map((area, i) => (
              <div key={i} style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '16px 20px',
              }}>
                <div style={{ fontWeight: 600, color: 'var(--color-navy)', fontSize: '15px', marginBottom: area.summary || area.items.length ? '8px' : 0 }}>
                  {area.category}
                </div>
                {area.summary && (
                  <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--color-slate-dark)', lineHeight: '1.5' }}>
                    {area.summary}
                  </p>
                )}
                {area.items?.length > 0 && (
                  <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {area.items.map((item, j) => (
                      <li key={j} style={{ fontSize: '12px', color: 'var(--color-slate)', lineHeight: '1.5' }}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
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
