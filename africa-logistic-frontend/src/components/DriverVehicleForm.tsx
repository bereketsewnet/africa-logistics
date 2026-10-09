import { useState, type FormEvent } from 'react'
import { LuTriangleAlert } from 'react-icons/lu'
import apiClient from '../lib/apiClient'
import DocumentUploadField from './fleet/DocumentUploadField'

/**
 * One sheet covering a driver and the truck they arrived with.
 *
 * Drivers who bring their own vehicle fill in a single paper form on the forecourt
 * — their name, their licence and ID numbers, and the truck's details. This mirrors
 * that, so the person entering it is not asked to split one sheet across two
 * screens.
 *
 * Shared on purpose rather than copied: it appears both on **My Vehicle** and in
 * the **Docs** tab, and two copies of a form with eleven fields would drift apart
 * the first time one of them changed.
 *
 * Only the plate and the vehicle type are required. Everything else is optional,
 * because a driver registering at the roadside frequently does not have the rated
 * load or the paperwork to hand, and refusing the submission over it just means the
 * vehicle never gets recorded at all.
 */
export interface DriverVehicleFormLabels {
  plate: string
  vehicleType: string
  selectType: string
  capacity: string
  description: string
  photoLabel: string
  libreLabel: string
  libreHint: string
  docsHeading: string
  docsOptional: string
  cancel: string
  submit: string
  submitting: string
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.8rem', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 600, color: 'var(--clr-muted)',
  marginBottom: '0.3rem', display: 'block',
}
/** Two columns that fold to one on a phone, never a rigid 50/50. */
const pairStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.6rem',
}

export default function DriverVehicleForm({
  vehicleTypes, labels, defaults, onSubmitted, onCancel, idPrefix = 'dv',
}: {
  vehicleTypes: Array<{ id: number; name: string }>
  labels: DriverVehicleFormLabels
  /** Pre-fill from the signed-in driver and their profile. */
  defaults?: {
    full_name?: string
    phone_number?: string
    national_id_number?: string | null
    license_number?: string | null
  }
  onSubmitted: (message: string) => void
  onCancel: () => void
  /** Keeps input ids unique when the form is on screen twice. */
  idPrefix?: string
}) {
  const [form, setForm] = useState({
    full_name: defaults?.full_name ?? '',
    national_id_number: defaults?.national_id_number ?? '',
    license_number: defaults?.license_number ?? '',
    plate_number: '',
    vehicle_type: vehicleTypes[0]?.name ?? '',
    max_capacity_kg: '',
    model: '',
    description: '',
  })
  const [photo, setPhoto] = useState('')
  const [libre, setLibre] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.plate_number.trim()) { setError('Plate number is required.'); return }
    if (!form.vehicle_type.trim()) { setError('Please choose a vehicle type.'); return }

    setSubmitting(true)
    try {
      const { data } = await apiClient.post('/profile/driver/vehicles', {
        plate_number: form.plate_number.trim(),
        vehicle_type: form.vehicle_type.trim(),
        // Sent only when filled, so the server stores NULL rather than 0 — a
        // truck with an unknown capacity is not a truck that carries nothing.
        max_capacity_kg: form.max_capacity_kg.trim() || undefined,
        model: form.model.trim() || undefined,
        description: form.description.trim() || undefined,
        full_name: form.full_name.trim() || undefined,
        national_id_number: form.national_id_number.trim() || undefined,
        license_number: form.license_number.trim() || undefined,
        vehicle_photo: photo || undefined,
        libre_file: libre || undefined,
      })
      onSubmitted(data.message ?? 'Vehicle submitted for approval.')
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Could not submit this vehicle.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {error && <div className="alert alert-error"><LuTriangleAlert size={13} /> {error}</div>}

      {/* ── The driver ─────────────────────────────────────────────────────── */}
      <div style={pairStyle}>
        <div>
          <label htmlFor={`${idPrefix}-name`} style={labelStyle}>Full Name</label>
          <input id={`${idPrefix}-name`} value={form.full_name}
            onChange={e => set({ full_name: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-phone`} style={labelStyle}>Phone Number</label>
          {/* Read-only on purpose: this is the login, and changing it already has
              its own OTP-verified flow under Contact. */}
          <input id={`${idPrefix}-phone`} value={defaults?.phone_number ?? ''} readOnly disabled
            style={{ ...inputStyle, opacity: 0.65, cursor: 'not-allowed' }} />
          <p style={{ fontSize: '0.68rem', color: 'var(--clr-muted)', marginTop: '0.2rem' }}>
            Change this under Contact — it is your sign-in number.
          </p>
        </div>
      </div>

      <div style={pairStyle}>
        <div>
          <label htmlFor={`${idPrefix}-lic`} style={labelStyle}>Driving Licence No.</label>
          <input id={`${idPrefix}-lic`} value={form.license_number}
            onChange={e => set({ license_number: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-nid`} style={labelStyle}>National ID No.</label>
          <input id={`${idPrefix}-nid`} value={form.national_id_number}
            onChange={e => set({ national_id_number: e.target.value })} style={inputStyle} />
        </div>
      </div>

      {/* ── The vehicle ────────────────────────────────────────────────────── */}
      <div style={{ paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.09)' }}>
        <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-text)', margin: '0 0 0.6rem' }}>
          Vehicle details
        </p>

        <div style={pairStyle}>
          <div>
            <label htmlFor={`${idPrefix}-plate`} style={labelStyle}>{labels.plate} *</label>
            <input id={`${idPrefix}-plate`} value={form.plate_number}
              onChange={e => set({ plate_number: e.target.value })} required style={inputStyle} />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-type`} style={labelStyle}>{labels.vehicleType} *</label>
            <select id={`${idPrefix}-type`} value={form.vehicle_type}
              onChange={e => set({ vehicle_type: e.target.value })}
              style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="" style={{ background: '#0f172a' }}>{labels.selectType}</option>
              {vehicleTypes.map(vt => (
                <option key={vt.id} value={vt.name} style={{ background: '#0f172a' }}>{vt.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ ...pairStyle, marginTop: '0.6rem' }}>
          <div>
            <label htmlFor={`${idPrefix}-cap`} style={labelStyle}>{labels.capacity}</label>
            <input id={`${idPrefix}-cap`} type="number" min="1" step="1" value={form.max_capacity_kg}
              onChange={e => set({ max_capacity_kg: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-model`} style={labelStyle}>Model</label>
            <input id={`${idPrefix}-model`} value={form.model}
              onChange={e => set({ model: e.target.value })} style={inputStyle} />
          </div>
        </div>

        <div style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`${idPrefix}-desc`} style={labelStyle}>{labels.description}</label>
          <input id={`${idPrefix}-desc`} value={form.description}
            onChange={e => set({ description: e.target.value })} style={inputStyle} />
        </div>
      </div>

      {/* ── Photo and libre ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.09)' }}>
        <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>
          {labels.docsHeading}
          <span style={{ fontWeight: 500, color: 'var(--clr-muted)' }}> — {labels.docsOptional}</span>
        </p>
        <DocumentUploadField label={labels.photoLabel} accept="image/jpeg,image/png,image/webp"
          value={photo} onChange={setPhoto} disabled={submitting} />
        <DocumentUploadField label={labels.libreLabel} hint={labels.libreHint}
          value={libre} onChange={setLibre} disabled={submitting} />
      </div>

      <p style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', margin: 0, lineHeight: 1.5 }}>
        Only the plate number and vehicle type are required — fill in whatever else you have.
      </p>

      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={onCancel} disabled={submitting}>
          {labels.cancel}
        </button>
        <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={submitting}>
          {submitting ? labels.submitting : labels.submit}
        </button>
      </div>
    </form>
  )
}
