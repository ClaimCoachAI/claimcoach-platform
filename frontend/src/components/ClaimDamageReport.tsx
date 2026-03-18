import type { ScopeSheet, ScopeArea } from '../types/scopeSheet'
import { CATEGORY_MAP } from './contractor-wizard/taxonomy'

interface ClaimDamageReportProps {
  scopeSheet: ScopeSheet | null
}

function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

function buildSummaryBullets(areas: ScopeArea[]): string[] {
  const roofAreas     = areas.filter(a => a.category_key.startsWith('roof'))
  const exteriorAreas = areas.filter(a => a.category_key === 'exterior_walls')
  const interiorAreas = areas.filter(a => a.category_key.startsWith('interior_'))
  const waterAreas    = areas.filter(a => a.category_key === 'water_mitigation')
  const otherAreas    = areas.filter(a =>
    !a.category_key.startsWith('roof') &&
    a.category_key !== 'exterior_walls' &&
    !a.category_key.startsWith('interior_') &&
    a.category_key !== 'water_mitigation'
  )

  const bullets: string[] = []

  if (roofAreas.length > 0)
    bullets.push(`Roof has damage across ${pluralize(roofAreas.length, 'section', 'sections')}.`)

  if (exteriorAreas.length > 0)
    bullets.push(`Exterior walls show damage on ${pluralize(exteriorAreas.length, 'area', 'areas')}.`)

  if (interiorAreas.length > 0)
    bullets.push(`${pluralize(interiorAreas.length, 'interior room', 'interior rooms')} affected with water or structural damage.`)

  if (waterAreas.length > 0)
    bullets.push('Water mitigation work required.')

  for (const area of otherAreas) {
    if (bullets.length >= 4) break
    const label = CATEGORY_MAP[area.category_key]?.label ?? area.category
    const tags  = area.tags.map(t => t.replace(/_/g, ' ')).join(', ')
    bullets.push(`${label}: ${tags}.`)
  }

  return bullets
}

function formatDimensions(dims: Record<string, number>): string {
  if (!dims || Object.keys(dims).length === 0) return ''
  if (dims.square_footage) return `${dims.square_footage.toLocaleString()} sq ft`
  if (dims.length && dims.width) return `${dims.length} × ${dims.width} ft`
  return ''
}

export default function ClaimDamageReport({ scopeSheet }: ClaimDamageReportProps) {
  if (!scopeSheet || scopeSheet.is_draft) {
    return (
      <p style={{ color: 'var(--color-slate)', textAlign: 'center', padding: '32px 0' }}>
        Damage report will appear once your assessor submits their scope sheet.
      </p>
    )
  }

  const areas = scopeSheet.areas ?? []

  if (areas.length === 0) {
    return (
      <p style={{ color: 'var(--color-slate)', textAlign: 'center', padding: '32px 0' }}>
        No damage areas recorded in the scope sheet.
      </p>
    )
  }

  const bullets = buildSummaryBullets(areas)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Summary card */}
      <div style={{
        background: 'var(--glass-mint)',
        border: '1px solid var(--color-mint-dark)',
        borderRadius: '16px',
        padding: '20px 24px',
      }}>
        <h3 style={{
          fontSize: '15px',
          fontWeight: 700,
          color: 'var(--color-teal-dark)',
          marginBottom: '12px',
          fontFamily: 'Manrope, sans-serif',
        }}>
          Damage Summary
        </h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--color-slate-dark)', fontSize: '14px' }}>
              <span style={{ color: 'var(--color-teal)', marginTop: '2px', flexShrink: 0 }}>•</span>
              {b}
            </li>
          ))}
        </ul>
      </div>

      {/* Area cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {areas.map((area, i) => {
          const emoji = CATEGORY_MAP[area.category_key]?.emoji ?? '📌'
          const dims  = formatDimensions(area.dimensions)
          return (
            <div key={i} style={{
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '16px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: area.tags.length || area.notes ? '10px' : 0 }}>
                <span style={{ fontSize: '20px' }}>{emoji}</span>
                <span style={{ fontWeight: 600, color: 'var(--color-navy)', fontSize: '15px', flex: 1 }}>
                  {area.category}
                </span>
                {dims && (
                  <span style={{ fontSize: '13px', color: 'var(--color-slate)' }}>{dims}</span>
                )}
              </div>

              {area.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: area.notes ? '10px' : 0 }}>
                  {area.tags.map((tag, j) => (
                    <span key={j} style={{
                      background: 'var(--color-mint-light)',
                      color: 'var(--color-teal-dark)',
                      borderRadius: '20px',
                      padding: '3px 10px',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}>
                      {tag.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}

              {area.notes && (
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-slate)', fontStyle: 'italic' }}>
                  {area.notes}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
