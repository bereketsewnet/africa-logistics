import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { orderApi } from '../lib/apiClient'
import {
  LuPackage, LuPlus, LuRefreshCw, LuSearch, LuX,
  LuCircleCheck, LuTriangleAlert, LuTruck, LuMapPin,
  LuFileText, LuChevronRight, LuChevronLeft,
  LuSend, LuArrowRight, LuBan, LuNavigation,
} from 'react-icons/lu'

// ─── Leaflet icon fix (Vite bundler) ─────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const pickupIcon = new L.DivIcon({
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#4ade80;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
  iconSize: [18, 18], iconAnchor: [9, 9], className: '',
})
const deliveryIcon = new L.DivIcon({
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#f87171;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
  iconSize: [18, 18], iconAnchor: [9, 9], className: '',
})
const truckIcon = new L.DivIcon({
  html: `<div style="font-size:22px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6))">🚛</div>`,
  iconSize: [28, 28], iconAnchor: [14, 14], className: '',
})

// ─── Types ────────────────────────────────────────────────────────────────────
interface CargoType { id: number; name: string; description: string; requires_special_handling: number; icon: string }
interface Quote { distance_km: number; estimated_price: number; base_fare: number; per_km_rate: number; distance_cost: number; city_surcharge: number; currency?: string }
interface Order {
  id: string; reference_code: string; status: string
  cargo_type_name: string; vehicle_type_required: string; estimated_weight_kg: number
  pickup_address: string; delivery_address: string
  estimated_price: number; final_price: number | null; currency: string
  description: string | null; estimated_value: number | null
  driver_first_name: string | null; driver_last_name: string | null; driver_phone: string | null
  created_at: string; pickup_otp?: string; delivery_otp?: string
}
interface StatusHistory { id: number; status: string; notes: string | null; created_at: string }
interface Message { id: string; sender_first_name: string; sender_last_name: string; sender_role_id: number; message: string; created_at: string }
interface TrackInfo { success: boolean; status: string; driver?: { name: string; phone: string }; location?: { lat: number; lng: number; recorded_at: string; heading: number | null; speed_kmh: number | null } }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  PENDING:   '#fbbf24',
  ASSIGNED:  '#60a5fa',
  EN_ROUTE:  '#a78bfa',
  AT_PICKUP: '#fb923c',
  IN_TRANSIT:'#34d399',
  DELIVERED: '#4ade80',
  CANCELLED: '#f87171',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING:   'Pending',
  ASSIGNED:  'Assigned',
  EN_ROUTE:  'En Route',
  AT_PICKUP: 'At Pickup',
  IN_TRANSIT:'In Transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
}

function statusBadge(status: string) {
  const c = STATUS_COLOR[status] ?? '#94a3b8'
  return (
    <span style={{ fontSize:'0.7rem', fontWeight:700, color:c,
      background:`${c}1a`, border:`1px solid ${c}44`,
      borderRadius:99, padding:'0.18rem 0.6rem', whiteSpace:'nowrap' }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

function Spinner() {
  return <span className="spinner" style={{ width:18, height:18, borderWidth:2 }}/>
}

// ─── Nominatim Reverse Geocode ───────────────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
      headers: { 'Accept-Language': 'en' },
    })
    const d = await r.json()
    const { road, suburb, city, town, village, state, country } = d.address ?? {}
    const parts = [road, suburb, city ?? town ?? village, state, country].filter(Boolean)
    return parts.join(', ') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  }
}

// ─── Location Search (Nominatim autocomplete) ────────────────────────────────
function LocationSearch({ label, dotColor, value, onSelect, onClear }: {
  label: string; dotColor: string; value: string
  onSelect: (lat: string, lng: string, addr: string) => void
  onClear: () => void
}) {
  const [q, setQ] = useState(value)
  const [results, setResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>(
    []
  )
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQ(value) }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = (text: string) => {
    setQ(text)
    clearTimeout(timerRef.current ?? undefined)
    if (!text.trim() || text.length < 2) { setResults([]); setOpen(false); return }
    timerRef.current = setTimeout(async () => {
      setBusy(true)
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=6&countrycodes=et,dj,er,so,sd,ke`,
          { headers: { 'Accept-Language': 'en' } }
        )
        const d: Array<{ display_name: string; lat: string; lon: string }> = await r.json()
        if (d.length === 0) {
          const r2 = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=5`,
            { headers: { 'Accept-Language': 'en' } }
          )
          const d2: Array<{ display_name: string; lat: string; lon: string }> = await r2.json()
          setResults(d2); setOpen(d2.length > 0)
        } else {
          setResults(d); setOpen(true)
        }
      } catch { /* ignore */ }
      finally { setBusy(false) }
    }, 450)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.6rem 0.85rem', borderRadius:10, background:'rgba(255,255,255,0.05)', border:`1px solid ${dotColor}44` }}>
        <span style={{ width:9, height:9, borderRadius:'50%', background:dotColor, flexShrink:0 }}/>
        <span style={{ fontSize:'0.67rem', fontWeight:700, color:dotColor, width:50, flexShrink:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</span>
        <input
          value={q}
          onChange={e => search(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={`Type ${label.toLowerCase()} address…`}
          style={{ flex:1, background:'none', border:'none', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.82rem', outline:'none', minWidth:0 }}
        />
        {busy && <span className="spinner" style={{ width:13, height:13, borderWidth:1.5, flexShrink:0 }}/>}
        {q && !busy && (
          <button type="button" onClick={() => { setQ(''); setResults([]); setOpen(false); onClear() }}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', padding:0, display:'flex', alignItems:'center', flexShrink:0 }}>
            <LuX size={12}/>
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div style={{ position:'absolute', top:'calc(100% + 3px)', left:0, right:0, zIndex:9999, background:'#0d1526', border:'1px solid rgba(255,255,255,0.14)', borderRadius:10, overflow:'hidden', boxShadow:'0 10px 40px rgba(0,0,0,0.7)', maxHeight:210, overflowY:'auto' }}>
          {results.map((item, i) => (
            <button key={i} type="button"
              onClick={() => { setQ(item.display_name); setOpen(false); onSelect(item.lat, item.lon, item.display_name) }}
              style={{ display:'flex', alignItems:'flex-start', gap:'0.45rem', width:'100%', textAlign:'left', padding:'0.6rem 0.85rem', background:'none', border:'none', borderBottom: i < results.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.78rem', cursor:'pointer', lineHeight:1.4 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <LuMapPin size={12} style={{ color:dotColor, marginTop:2, flexShrink:0 }}/>
              <span>{item.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Map Click Handler ────────────────────────────────────────────────────────
function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

// ─── Map Picker ───────────────────────────────────────────────────────────────
interface MapPickerProps {
  pickupLat: string; pickupLng: string; pickupAddress: string
  deliveryLat: string; deliveryLng: string; deliveryAddress: string
  onChange: (field: 'pickup_lat'|'pickup_lng'|'pickup_address'|'delivery_lat'|'delivery_lng'|'delivery_address', val: string) => void
}
function MapPicker({ pickupLat, pickupLng, pickupAddress, deliveryLat, deliveryLng, deliveryAddress, onChange }: MapPickerProps) {
  const [mode, setMode] = useState<'pickup' | 'delivery'>('pickup')
  const [geocoding, setGeocoding] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)

  const handlePick = async (lat: number, lng: number) => {
    setGeocoding(true)
    const addr = await reverseGeocode(lat, lng)
    if (mode === 'pickup') {
      onChange('pickup_lat', lat.toFixed(6))
      onChange('pickup_lng', lng.toFixed(6))
      onChange('pickup_address', addr)
    } else {
      onChange('delivery_lat', lat.toFixed(6))
      onChange('delivery_lng', lng.toFixed(6))
      onChange('delivery_address', addr)
    }
    setGeocoding(false)
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) return
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords
      setGpsLoading(true)
      const addr = await reverseGeocode(lat, lng)
      if (mode === 'pickup') {
        onChange('pickup_lat', lat.toFixed(6)); onChange('pickup_lng', lng.toFixed(6)); onChange('pickup_address', addr)
      } else {
        onChange('delivery_lat', lat.toFixed(6)); onChange('delivery_lng', lng.toFixed(6)); onChange('delivery_address', addr)
      }
      setGpsLoading(false)
    }, () => setGpsLoading(false))
  }

  const pLat = parseFloat(pickupLat), pLng = parseFloat(pickupLng)
  const dLat = parseFloat(deliveryLat), dLng = parseFloat(deliveryLng)
  const hasPickup = !isNaN(pLat) && !isNaN(pLng)
  const hasDelivery = !isNaN(dLat) && !isNaN(dLng)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
      {/* Search inputs */}
      <LocationSearch
        label="Pickup" dotColor="#4ade80" value={pickupAddress}
        onSelect={(lat, lng, addr) => { onChange('pickup_lat', lat); onChange('pickup_lng', lng); onChange('pickup_address', addr); setMode('delivery') }}
        onClear={() => { onChange('pickup_lat',''); onChange('pickup_lng',''); onChange('pickup_address','') }}
      />
      <LocationSearch
        label="Delivery" dotColor="#f87171" value={deliveryAddress}
        onSelect={(lat, lng, addr) => { onChange('delivery_lat', lat); onChange('delivery_lng', lng); onChange('delivery_address', addr) }}
        onClear={() => { onChange('delivery_lat',''); onChange('delivery_lng',''); onChange('delivery_address','') }}
      />

      {/* Map pin-mode toggle + GPS button */}
      <div style={{ display:'flex', gap:'0.4rem', background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'0.25rem' }}>
        <button type="button" onClick={() => setMode('pickup')} style={{ flex:1, padding:'0.38rem', border:'none', borderRadius:8, background: mode==='pickup' ? 'rgba(74,222,128,0.15)' : 'transparent', color: mode==='pickup' ? '#4ade80' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.74rem', fontWeight:700, cursor:'pointer', transition:'all 0.15s', outline: mode==='pickup' ? '1px solid rgba(74,222,128,0.3)' : 'none', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.3rem' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:mode==='pickup'?'#4ade80':'rgba(255,255,255,0.3)', flexShrink:0 }}/>
          Pin Pickup {hasPickup && <LuCircleCheck size={10}/>}
        </button>
        <button type="button" onClick={() => setMode('delivery')} style={{ flex:1, padding:'0.38rem', border:'none', borderRadius:8, background: mode==='delivery' ? 'rgba(248,113,113,0.15)' : 'transparent', color: mode==='delivery' ? '#f87171' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.74rem', fontWeight:700, cursor:'pointer', transition:'all 0.15s', outline: mode==='delivery' ? '1px solid rgba(248,113,113,0.3)' : 'none', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.3rem' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:mode==='delivery'?'#f87171':'rgba(255,255,255,0.3)', flexShrink:0 }}/>
          Pin Delivery {hasDelivery && <LuCircleCheck size={10}/>}
        </button>
        <button type="button" onClick={useMyLocation} disabled={gpsLoading} title="Use my current location"
          style={{ padding:'0.38rem 0.6rem', border:'none', borderRadius:8, background:'rgba(99,102,241,0.15)', color: gpsLoading ? 'var(--clr-muted)' : '#818cf8', fontFamily:'inherit', fontSize:'0.74rem', fontWeight:700, cursor: gpsLoading ? 'wait' : 'pointer', transition:'all 0.15s', outline:'1px solid rgba(99,102,241,0.25)', display:'flex', alignItems:'center', gap:'0.3rem', flexShrink:0 }}>
          {gpsLoading ? <span className="spinner" style={{ width:11, height:11, borderWidth:1.5 }}/> : <LuNavigation size={12}/>}
          <span style={{ display:'none' }}>GPS</span>
        </button>
      </div>

      {/* Same-location warning */}
      {hasPickup && hasDelivery && pLat.toFixed(4) === dLat.toFixed(4) && pLng.toFixed(4) === dLng.toFixed(4) && (
        <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.5rem 0.75rem', borderRadius:9, background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.25)', fontSize:'0.73rem', color:'#f87171' }}>
          <LuTriangleAlert size={12}/> Pickup and delivery are the same location — please set different points.
        </div>
      )}

      <p style={{ fontSize:'0.7rem', color: geocoding ? 'var(--clr-accent)' : 'var(--clr-muted)', textAlign:'center', margin:0 }}>
        {geocoding ? 'Getting address…' : `Or tap map to pin ${mode} location`}
      </p>

      {/* Leaflet map */}
      <div style={{ borderRadius:12, overflow:'hidden', border:'1px solid rgba(255,255,255,0.1)', height:240 }}>
        <MapContainer center={[9.0084, 38.7575]} zoom={12} style={{ width:'100%', height:'100%' }} scrollWheelZoom>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
          />
          <MapClickHandler onPick={handlePick} />
          {hasPickup && (
            <Marker position={[pLat, pLng]} icon={pickupIcon}>
              <Popup>Pickup: {pickupAddress || `${pLat.toFixed(5)}, ${pLng.toFixed(5)}`}</Popup>
            </Marker>
          )}
          {hasDelivery && (
            <Marker position={[dLat, dLng]} icon={deliveryIcon}>
              <Popup>Delivery: {deliveryAddress || `${dLat.toFixed(5)}, ${dLng.toFixed(5)}`}</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>
    </div>
  )
}

// ─── Place-Order Wizard ───────────────────────────────────────────────────────
interface WizardProps { cargoTypes: CargoType[]; onDone: () => void; onClose: () => void }

const VEHICLE_TYPES = ['Truck', 'Mini Truck', 'Van', 'Pickup', 'Motorcycle', 'Cargo Bike', 'Trailer', 'Other']

function PlaceOrderWizard({ cargoTypes, onDone, onClose }: WizardProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [form, setForm] = useState({
    cargo_type_id:  cargoTypes[0]?.id ?? 1,
    vehicle_type:   'Truck',
    weight_kg:      '',
    pickup_address: '',
    pickup_lat:     '',
    pickup_lng:     '',
    delivery_address: '',
    delivery_lat:   '',
    delivery_lng:   '',
    description:    '',
    estimated_value:'',
  })
  const [quote, setQuote] = useState<Quote | null>(null)
  const [placedOrder, setPlacedOrder] = useState<{ reference_code: string; pickup_otp: string; delivery_otp: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(x => ({ ...x, [k]: e.target.value }))

  const handleGetQuote = async () => {
    setErr('')
    // Same-location guard
    const pLat = parseFloat(form.pickup_lat), pLng = parseFloat(form.pickup_lng)
    const dLat = parseFloat(form.delivery_lat), dLng = parseFloat(form.delivery_lng)
    if (!isNaN(pLat) && !isNaN(dLat) && Math.abs(pLat - dLat) < 0.0005 && Math.abs(pLng - dLng) < 0.0005) {
      setErr('Pickup and delivery locations cannot be the same. Please set different points.')
      return
    }
    setLoading(true)
    try {
      const { data } = await orderApi.getQuote({
        cargo_type_id: Number(form.cargo_type_id),
        vehicle_type:  form.vehicle_type,
        weight_kg:     parseFloat(form.weight_kg),
        pickup_lat:    parseFloat(form.pickup_lat),
        pickup_lng:    parseFloat(form.pickup_lng),
        delivery_lat:  parseFloat(form.delivery_lat),
        delivery_lng:  parseFloat(form.delivery_lng),
      })
      setQuote(data.quote)
      setStep(2)
    } catch (e: any) { setErr(e.response?.data?.message ?? 'Failed to get quote.') }
    finally { setLoading(false) }
  }

  const handlePlace = async () => {
    setErr(''); setLoading(true)
    try {
      const { data } = await orderApi.placeOrder({
        cargo_type_id:    Number(form.cargo_type_id),
        vehicle_type:     form.vehicle_type,
        weight_kg:        parseFloat(form.weight_kg),
        pickup_address:   form.pickup_address,
        pickup_lat:       parseFloat(form.pickup_lat),
        pickup_lng:       parseFloat(form.pickup_lng),
        delivery_address: form.delivery_address,
        delivery_lat:     parseFloat(form.delivery_lat),
        delivery_lng:     parseFloat(form.delivery_lng),
        description:      form.description || undefined,
        estimated_value:  form.estimated_value ? parseFloat(form.estimated_value) : undefined,
      })
      setPlacedOrder({ reference_code: data.order.reference_code, pickup_otp: data.pickup_otp, delivery_otp: data.delivery_otp })
    } catch (e: any) { setErr(e.response?.data?.message ?? 'Failed to place order.') }
    finally { setLoading(false) }
  }

  // ── Success screen ───────────────────────────────────────────────────────
  if (placedOrder) return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1rem', alignItems:'center', textAlign:'center', padding:'0.5rem 0' }}>
      <div style={{ width:64, height:64, borderRadius:'50%', background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <LuCircleCheck size={30} color="#4ade80"/>
      </div>
      <div>
        <h3 style={{ fontSize:'1.05rem', fontWeight:800, color:'var(--clr-text)', marginBottom:'0.25rem' }}>Order Placed!</h3>
        <p style={{ fontSize:'0.8rem', color:'var(--clr-muted)' }}>Reference: <strong style={{ color:'var(--clr-accent)' }}>{placedOrder.reference_code}</strong></p>
      </div>
      <div style={{ width:'100%', borderRadius:12, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', padding:'1rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.85rem' }}>
        <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', marginBottom:'0.25rem' }}>
          Share these OTPs with the driver at each stage. Keep them safe.
        </p>
        <div className="glass-inner" style={{ padding:'0.85rem 1rem' }}>
          <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', marginBottom:'0.35rem', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:700 }}>Pickup OTP</p>
          <p style={{ fontSize:'2rem', fontWeight:900, letterSpacing:'0.25em', color:'#4ade80', fontVariantNumeric:'tabular-nums' }}>{placedOrder.pickup_otp}</p>
        </div>
        <div className="glass-inner" style={{ padding:'0.85rem 1rem' }}>
          <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', marginBottom:'0.35rem', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:700 }}>Delivery OTP</p>
          <p style={{ fontSize:'2rem', fontWeight:900, letterSpacing:'0.25em', color:'var(--clr-accent)', fontVariantNumeric:'tabular-nums' }}>{placedOrder.delivery_otp}</p>
        </div>
        <p style={{ fontSize:'0.73rem', color:'#fbbf24', display:'flex', alignItems:'center', gap:'0.35rem', justifyContent:'center' }}>
          <LuTriangleAlert size={12}/> Screenshot these — they won't be shown again.
        </p>
      </div>
      <button className="btn-primary" style={{ width:'100%', marginTop:'0.5rem' }} onClick={() => { onDone(); onClose() }}>
        View My Orders
      </button>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
      {/* Step indicator */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.25rem' }}>
        {[1,2].map(s => (
          <div key={s} style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <div style={{ width:28, height:28, borderRadius:'50%', background: step >= s ? 'var(--clr-accent)' : 'rgba(255,255,255,0.08)', border: step >= s ? 'none' : '1px solid rgba(255,255,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.78rem', fontWeight:800, color: step >= s ? '#080b14' : 'var(--clr-muted)', transition:'all 0.2s' }}>
              {s}
            </div>
            {s === 1 && <LuArrowRight size={14} style={{ color:'var(--clr-muted)', opacity:0.5 }}/>}
          </div>
        ))}
        <span style={{ fontSize:'0.78rem', color:'var(--clr-muted)', marginLeft:'0.25rem' }}>
          {step === 1 ? 'Enter Order Details' : 'Confirm & Place'}
        </span>
      </div>

      {err && <div className="alert alert-error"><LuTriangleAlert size={13}/> {err}</div>}

      {/* ── Step 1: Form ── */}
      {step === 1 && (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          {/* Cargo type */}
          <div className="input-wrap">
            <select id="ct" value={form.cargo_type_id} onChange={f('cargo_type_id')}
              style={{ background:'transparent', border:'none', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.9rem', width:'100%', outline:'none', paddingTop:'1.1rem' }}>
              {cargoTypes.map(ct => <option key={ct.id} value={ct.id} style={{ background:'#0f172a' }}>{ct.name}</option>)}
            </select>
            <label htmlFor="ct" style={{ top:'0.35rem', fontSize:'0.7rem', color:'var(--clr-accent)' }}>Cargo Type</label>
          </div>

          {/* Vehicle type */}
          <div className="input-wrap">
            <select id="vt" value={form.vehicle_type} onChange={f('vehicle_type')}
              style={{ background:'transparent', border:'none', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.9rem', width:'100%', outline:'none', paddingTop:'1.1rem' }}>
              {VEHICLE_TYPES.map(t => <option key={t} value={t} style={{ background:'#0f172a' }}>{t}</option>)}
            </select>
            <label htmlFor="vt" style={{ top:'0.35rem', fontSize:'0.7rem', color:'var(--clr-accent)' }}>Vehicle Type</label>
          </div>

          {/* Weight */}
          <div className="input-wrap">
            <input id="wt" type="number" placeholder=" " min="0.1" step="0.1" value={form.weight_kg} onChange={f('weight_kg')} required/>
            <label htmlFor="wt">Weight (kg) *</label>
          </div>

          {/* ── Interactive map picker ── */}
          <MapPicker
            pickupLat={form.pickup_lat}  pickupLng={form.pickup_lng}  pickupAddress={form.pickup_address}
            deliveryLat={form.delivery_lat} deliveryLng={form.delivery_lng} deliveryAddress={form.delivery_address}
            onChange={(field, val) => setForm(x => ({ ...x, [field]: val }))}
          />

          <div className="input-wrap">
            <input id="desc" type="text" placeholder=" " value={form.description} onChange={f('description')}/>
            <label htmlFor="desc">Description (optional)</label>
          </div>
          <div className="input-wrap">
            <input id="val" type="number" placeholder=" " min="0" step="0.01" value={form.estimated_value} onChange={f('estimated_value')}/>
            <label htmlFor="val">Estimated Value ETB (optional)</label>
          </div>

          {/* Missing-field hints */}
          {(!form.weight_kg || !form.pickup_lat || !form.delivery_lat) && (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.2rem', padding:'0.55rem 0.75rem', borderRadius:9, background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.18)' }}>
              {!form.weight_kg && <span style={{ fontSize:'0.73rem', color:'#fbbf24', display:'flex', alignItems:'center', gap:'0.35rem' }}><LuTriangleAlert size={11}/> Enter cargo weight</span>}
              {!form.pickup_lat && <span style={{ fontSize:'0.73rem', color:'#fbbf24', display:'flex', alignItems:'center', gap:'0.35rem' }}><LuTriangleAlert size={11}/> Set pickup location (search or tap map)</span>}
              {!form.delivery_lat && <span style={{ fontSize:'0.73rem', color:'#fbbf24', display:'flex', alignItems:'center', gap:'0.35rem' }}><LuTriangleAlert size={11}/> Set delivery location (search or tap map)</span>}
            </div>
          )}

          <div style={{ display:'flex', gap:'0.6rem', marginTop:'0.25rem' }}>
            <button type="button" onClick={onClose}
              style={{ flex:1, padding:'0.65rem', borderRadius:10, border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.875rem', fontWeight:700, cursor:'pointer' }}>
              Cancel
            </button>
            <button type="button" onClick={handleGetQuote}
              disabled={loading || !form.weight_kg || !form.pickup_lat || !form.pickup_lng || !form.delivery_lat || !form.delivery_lng}
              style={{ flex:2, padding:'0.65rem', borderRadius:10, border:'none', background: (!form.weight_kg || !form.pickup_lat || !form.delivery_lat || loading) ? 'rgba(255,255,255,0.08)' : 'var(--clr-accent)', color: (!form.weight_kg || !form.pickup_lat || !form.delivery_lat || loading) ? 'var(--clr-muted)' : '#080b14', fontFamily:'inherit', fontSize:'0.875rem', fontWeight:700, cursor: (!form.weight_kg || !form.pickup_lat || !form.delivery_lat) ? 'not-allowed' : 'pointer', transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
              {loading ? <><span className="spinner" style={{ width:16, height:16, borderWidth:2 }}/> Getting Quote…</> : <>Get Quote <LuArrowRight size={15}/></>}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Confirm ── */}
      {step === 2 && quote && (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
          {/* Quote card */}
          <div className="glass-inner" style={{ padding:'1.1rem 1.25rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
              <span style={{ fontSize:'0.8rem', color:'var(--clr-muted)', fontWeight:600 }}>Price Quote</span>
              <span style={{ fontSize:'1.35rem', fontWeight:900, color:'var(--clr-accent)' }}>{Number(quote.estimated_price).toLocaleString()} ETB</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem', fontSize:'0.78rem', color:'var(--clr-muted)' }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}><span>Distance</span><span style={{ color:'var(--clr-text)' }}>{Number(quote.distance_km).toFixed(2)} km</span></div>
              <div style={{ display:'flex', justifyContent:'space-between' }}><span>Base Fare</span><span style={{ color:'var(--clr-text)' }}>{Number(quote.base_fare).toLocaleString()} ETB</span></div>
              <div style={{ display:'flex', justifyContent:'space-between' }}><span>Distance Charge</span><span style={{ color:'var(--clr-text)' }}>{Number(quote.distance_cost).toLocaleString()} ETB</span></div>
              {Number(quote.city_surcharge) > 0 && <div style={{ display:'flex', justifyContent:'space-between' }}><span>City Surcharge</span><span style={{ color:'var(--clr-text)' }}>{Number(quote.city_surcharge).toLocaleString()} ETB</span></div>}
            </div>
          </div>

          {/* Summary */}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem', fontSize:'0.8rem' }}>
            {[
              ['Cargo', cargoTypes.find(c => c.id === Number(form.cargo_type_id))?.name ?? ''],
              ['Vehicle', form.vehicle_type],
              ['Weight', `${form.weight_kg} kg`],
              ['Pickup', form.pickup_address],
              ['Delivery', form.delivery_address],
              ...(form.description ? [['Note', form.description]] : []),
            ].map(([l, v]) => (
              <div key={l} style={{ display:'flex', gap:'0.5rem' }}>
                <span style={{ color:'var(--clr-muted)', width:60, flexShrink:0 }}>{l}</span>
                <span style={{ color:'var(--clr-text)', fontWeight:500, wordBreak:'break-word' }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ display:'flex', gap:'0.6rem', marginTop:'0.25rem' }}>
            <button className="btn-outline" style={{ flex:1, display:'flex', alignItems:'center', gap:'0.4rem', justifyContent:'center' }} onClick={() => { setStep(1); setQuote(null); setErr('') }}>
              <LuChevronLeft size={14}/> Edit
            </button>
            <button className="btn-primary" style={{ flex:2 }} onClick={handlePlace} disabled={loading}>
              {loading ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}><Spinner/> Placing…</span> : 'Confirm & Place Order'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Live Track Tab (WebSocket + Leaflet map) ─────────────────────────────────
function LiveTrackTab({ orderId, token }: { orderId: string; token: string }) {
  const [loc, setLoc] = useState<TrackInfo['location'] | null>(null)
  const [status, setStatus] = useState('')
  const [driver, setDriver] = useState<TrackInfo['driver'] | null>(null)
  const [wsState, setWsState] = useState<'connecting' | 'connected' | 'closed'>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const [initialLoaded, setInitialLoaded] = useState(false)

  // Initial REST load for current position
  useEffect(() => {
    orderApi.trackOrder(orderId).then(r => {
      const d = r.data as TrackInfo
      if (d.location) setLoc({ ...d.location, lat: Number(d.location.lat), lng: Number(d.location.lng) })
      if (d.status) setStatus(d.status)
      if (d.driver) setDriver(d.driver)
    }).catch(() => {}).finally(() => setInitialLoaded(true))
  }, [orderId])

  // WebSocket for live updates — skip for terminal order states
  useEffect(() => {
    if (!initialLoaded) return
    if (['DELIVERED', 'CANCELLED'].includes(status)) { setWsState('closed'); return }
    const wsBase = (import.meta.env.VITE_API_BASE_URL as string ?? '').replace(/^https/, 'wss').replace(/^http/, 'ws').replace(/\/api$/, '')
    const ws = new WebSocket(`${wsBase}/api/ws/orders/${orderId}?token=${encodeURIComponent(token)}`)
    wsRef.current = ws
    ws.onopen = () => setWsState('connected')
    ws.onclose = () => setWsState('closed')
    ws.onerror = () => setWsState('closed')
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'CONNECTED') { setStatus(msg.status ?? '') }
        if (msg.type === 'LOCATION_UPDATE') {
          setLoc({ lat: Number(msg.lat), lng: Number(msg.lng), recorded_at: msg.recorded_at ?? new Date().toISOString(), heading: msg.heading ?? null, speed_kmh: msg.speed_kmh ?? null })
        }
        if (msg.type === 'STATUS_CHANGE') { setStatus(msg.status ?? '') }
      } catch { /* ignore */ }
    }
    return () => { ws.close() }
  }, [orderId, token, initialLoaded]) // eslint-disable-line

  const hasLoc = loc && !isNaN(loc.lat) && !isNaN(loc.lng)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
      {/* WS status indicator */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.5rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.45rem' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background: wsState==='connected' ? '#4ade80' : wsState==='connecting' ? '#fbbf24' : '#f87171', display:'inline-block', flexShrink:0, boxShadow: wsState==='connected' ? '0 0 6px #4ade80' : 'none' }}/>
          <span style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>
            {wsState==='connected' ? 'Live tracking active' : wsState==='connecting' ? 'Connecting…' : ['DELIVERED','CANCELLED'].includes(status) ? 'Order completed — last location shown' : 'Offline — showing last known'}
          </span>
        </div>
        {status && statusBadge(status)}
      </div>

      {/* Leaflet map with truck icon */}
      {hasLoc ? (
        <div style={{ borderRadius:12, overflow:'hidden', border:'1px solid rgba(255,255,255,0.1)', height:280 }}>
          <MapContainer center={[loc!.lat, loc!.lng]} zoom={14} style={{ width:'100%', height:'100%' }} scrollWheelZoom={false}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
            />
            <TruckMarker lat={loc!.lat} lng={loc!.lng} label={driver?.name ?? 'Driver'} />
          </MapContainer>
        </div>
      ) : (
        <div style={{ textAlign:'center', color:'var(--clr-muted)', padding:'2.5rem', fontSize:'0.85rem', background:'rgba(255,255,255,0.02)', borderRadius:12, border:'1px dashed rgba(255,255,255,0.08)' }}>
          <LuNavigation size={28} style={{ opacity:0.3, display:'block', margin:'0 auto 0.75rem' }}/>
          No location data yet.<br/>
          <span style={{ fontSize:'0.78rem' }}>Driver location will appear here once they start moving.</span>
        </div>
      )}

      {/* Info panel */}
      {hasLoc && (
        <div className="glass-inner" style={{ padding:'0.85rem 1rem', display:'flex', flexDirection:'column', gap:'0.4rem', fontSize:'0.78rem' }}>
          {driver?.name && <div style={{ display:'flex', gap:'0.5rem' }}><span style={{ color:'var(--clr-muted)', width:70, flexShrink:0 }}>Driver</span><span style={{ color:'var(--clr-text)', fontWeight:600 }}>{driver.name}</span></div>}
          <div style={{ display:'flex', gap:'0.5rem' }}><span style={{ color:'var(--clr-muted)', width:70, flexShrink:0 }}>Position</span><span style={{ color:'var(--clr-text)' }}>{Number(loc!.lat).toFixed(5)}, {Number(loc!.lng).toFixed(5)}</span></div>
          {loc!.speed_kmh != null && <div style={{ display:'flex', gap:'0.5rem' }}><span style={{ color:'var(--clr-muted)', width:70, flexShrink:0 }}>Speed</span><span style={{ color:'var(--clr-text)' }}>{loc!.speed_kmh} km/h</span></div>}
          {loc!.heading != null && <div style={{ display:'flex', gap:'0.5rem' }}><span style={{ color:'var(--clr-muted)', width:70, flexShrink:0 }}>Heading</span><span style={{ color:'var(--clr-text)' }}>{loc!.heading}°</span></div>}
          <div style={{ display:'flex', gap:'0.5rem' }}><span style={{ color:'var(--clr-muted)', width:70, flexShrink:0 }}>Updated</span><span style={{ color:'var(--clr-text)' }}>{fmtDate(loc!.recorded_at)}</span></div>
        </div>
      )}

      {hasLoc && (
        <a href={`https://www.google.com/maps?q=${loc!.lat},${loc!.lng}`} target="_blank" rel="noopener noreferrer"
          style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.65rem 1rem', borderRadius:10, border:'1px solid rgba(0,229,255,0.2)', background:'rgba(0,229,255,0.05)', color:'var(--clr-accent)', textDecoration:'none', fontSize:'0.82rem', fontWeight:700 }}>
          <LuMapPin size={14}/> Open in Google Maps ↗
        </a>
      )}
    </div>
  )
}

// Auto-pan map when truck marker moves
function TruckMarker({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const markerRef = useRef<L.Marker>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = (markerRef.current as any)?._map
  useEffect(() => {
    if (map) map.panTo([lat, lng], { animate: true, duration: 1 })
  }, [lat, lng, map])
  return (
    <Marker position={[lat, lng]} icon={truckIcon} ref={markerRef}>
      <Popup>{label}</Popup>
    </Marker>
  )
}

// ─── Order Detail Modal ───────────────────────────────────────────────────────
function OrderDetailModal({ order, onClose, onCancelled }: { order: Order; onClose: () => void; onCancelled: () => void }) {
  const [tab, setTab] = useState<'info' | 'history' | 'chat' | 'track'>('info')
  const [history, setHistory] = useState<StatusHistory[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelErr, setCancelErr] = useState('')
  const [invoiceDling, setInvoiceDling] = useState(false)
  const msgBottom = useRef<HTMLDivElement>(null)

  const loadHistory = useCallback(async () => {
    const { data } = await orderApi.getHistory(order.id)
    setHistory(data.history ?? [])
  }, [order.id])

  const loadMessages = useCallback(async () => {
    const { data } = await orderApi.getMessages(order.id)
    setMessages(data.messages ?? [])
    setTimeout(() => msgBottom.current?.scrollIntoView({ behavior:'smooth' }), 100)
  }, [order.id])

  useEffect(() => {
    if (tab === 'history') loadHistory()
    if (tab === 'chat') loadMessages()
  }, [tab]) // eslint-disable-line

  const handleSend = async () => {
    if (!msgText.trim()) return
    setSending(true)
    try {
      await orderApi.sendMessage(order.id, msgText.trim())
      setMsgText('')
      await loadMessages()
    } catch { /* silent */ }
    finally { setSending(false) }
  }

  const handleCancel = async () => {
    if (!window.confirm('Cancel this order?')) return
    setCancelErr(''); setCancelling(true)
    try {
      await orderApi.cancelOrder(order.id)
      onCancelled()
      onClose()
    } catch (e: any) { setCancelErr(e.response?.data?.message ?? 'Cannot cancel this order.') }
    finally { setCancelling(false) }
  }

  const canCancel = order.status === 'PENDING' || order.status === 'ASSIGNED'
  const invoiceEndpoint = orderApi.getInvoiceUrl(order.id)

  const handleDownloadInvoice = async () => {
    setInvoiceDling(true)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(invoiceEndpoint, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${order.reference_code}.pdf`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch { /* ignore */ }
    finally { setInvoiceDling(false) }
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="glass modal-box" style={{ padding:0, maxWidth:520, width:'100%', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
        {/* Header */}
        <div style={{ padding:'1.25rem 1.5rem 0', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.75rem' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)' }}>{order.reference_code}</h2>
                {statusBadge(order.status)}
              </div>
              <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', marginTop:'0.15rem' }}>{fmtDate(order.created_at)}</p>
            </div>
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', padding:'0.2rem', display:'flex', alignItems:'center' }}>
              <LuX size={18}/>
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:'0.25rem', background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'0.25rem', marginBottom:'1rem' }}>
            {(['info','history','chat','track'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ flex:1, padding:'0.4rem 0.25rem', border:'none', borderRadius:8, background: tab === t ? 'rgba(0,229,255,0.12)' : 'transparent', color: tab === t ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:700, cursor:'pointer', transition:'all 0.15s', outline: tab === t ? '1px solid rgba(0,229,255,0.2)' : 'none', textTransform:'capitalize' }}>
                {t === 'history' ? 'Timeline' : t === 'chat' ? 'Chat' : t === 'track' ? 'Track' : 'Details'}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY:'auto', flex:1, padding:'0 1.5rem 1.25rem' }}>
          {/* ── Details tab ── */}
          {tab === 'info' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div className="glass-inner" style={{ padding:'1rem' }}>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.55rem', fontSize:'0.8rem' }}>
                  {[
                    ['Cargo Type', order.cargo_type_name],
                    ['Vehicle', order.vehicle_type_required],
                    ['Weight', `${order.estimated_weight_kg} kg`],
                    ['Pickup', order.pickup_address],
                    ['Delivery', order.delivery_address],
                    ['Price', `${(order.final_price ?? order.estimated_price).toLocaleString()} ${order.currency}`],
                    ...(order.description ? [['Note', order.description]] : []),
                    ...(order.estimated_value ? [['Cargo Value', `${Number(order.estimated_value).toLocaleString()} ETB`]] : []),
                  ].map(([l, v]) => (
                    <div key={l} style={{ display:'flex', gap:'0.5rem' }}>
                      <span style={{ color:'var(--clr-muted)', width:80, flexShrink:0 }}>{l}</span>
                      <span style={{ color:'var(--clr-text)', fontWeight:500, wordBreak:'break-word' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Driver info */}
              {order.driver_first_name && (
                <div className="glass-inner" style={{ padding:'0.85rem 1rem', display:'flex', alignItems:'center', gap:'0.75rem' }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(0,229,255,0.1)', border:'1px solid rgba(0,229,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <LuTruck size={16} color="var(--clr-accent)"/>
                  </div>
                  <div>
                    <p style={{ fontWeight:700, fontSize:'0.85rem', color:'var(--clr-text)' }}>{order.driver_first_name} {order.driver_last_name}</p>
                    {order.driver_phone && <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)' }}>{order.driver_phone}</p>}
                  </div>
                </div>
              )}

              {/* Invoice */}
              {order.status === 'DELIVERED' && (
                <button type="button" onClick={handleDownloadInvoice} disabled={invoiceDling}
                  style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.7rem 1rem', borderRadius:10, border:'1px solid rgba(0,229,255,0.2)', background:'rgba(0,229,255,0.05)', color: invoiceDling ? 'var(--clr-muted)' : 'var(--clr-accent)', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor: invoiceDling ? 'wait' : 'pointer', width:'100%', justifyContent:'center' }}>
                  {invoiceDling ? <><Spinner/> Generating…</> : <><LuFileText size={15}/> Download Invoice PDF</>}
                </button>
              )}

              {/* Cancel */}
              {canCancel && (
                <div>
                  {cancelErr && <div className="alert alert-error" style={{ marginBottom:'0.5rem' }}><LuTriangleAlert size={13}/> {cancelErr}</div>}
                  <button onClick={handleCancel} disabled={cancelling}
                    style={{ width:'100%', padding:'0.65rem', borderRadius:10, border:'1px solid rgba(248,113,113,0.3)', background:'rgba(248,113,113,0.06)', color:'#f87171', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
                    {cancelling ? <><Spinner/> Cancelling…</> : <><LuBan size={14}/> Cancel Order</>}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Timeline tab ── */}
          {tab === 'history' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'0' }}>
              {history.length === 0 ? (
                <div style={{ textAlign:'center', color:'var(--clr-muted)', padding:'2rem', fontSize:'0.85rem' }}>No history yet.</div>
              ) : history.map((h, i) => (
                <div key={h.id} style={{ display:'flex', gap:'0.75rem', paddingBottom:'1rem' }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0, width:24 }}>
                    <div style={{ width:12, height:12, borderRadius:'50%', background: STATUS_COLOR[h.status] ?? 'var(--clr-accent)', border:'2px solid rgba(255,255,255,0.15)', flexShrink:0, marginTop:4 }}/>
                    {i < history.length - 1 && <div style={{ flex:1, width:2, background:'rgba(255,255,255,0.07)', marginTop:4 }}/>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap', marginBottom:'0.15rem' }}>
                      {statusBadge(h.status)}
                      <span style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>{fmtDate(h.created_at)}</span>
                    </div>
                    {h.notes && <p style={{ fontSize:'0.76rem', color:'var(--clr-muted)', lineHeight:1.5 }}>{h.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Chat tab ── */}
          {tab === 'chat' && (
            <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'0.6rem', minHeight:200, maxHeight:340, overflowY:'auto', padding:'0.25rem 0' }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign:'center', color:'var(--clr-muted)', padding:'2rem', fontSize:'0.85rem' }}>No messages yet. Start the conversation!</div>
                ) : messages.map(m => {
                  const isMe = m.sender_role_id === 2
                  return (
                    <div key={m.id} style={{ display:'flex', flexDirection:'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth:'80%', background: isMe ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.05)', border: isMe ? '1px solid rgba(0,229,255,0.2)' : '1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'0.55rem 0.85rem' }}>
                        <p style={{ fontSize:'0.8rem', color:'var(--clr-text)', lineHeight:1.5, wordBreak:'break-word' }}>{m.message}</p>
                      </div>
                      <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', marginTop:'0.15rem', paddingInline:'0.25rem' }}>{m.sender_first_name} · {fmtDate(m.created_at)}</p>
                    </div>
                  )
                })}
                <div ref={msgBottom}/>
              </div>
              {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
                <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.75rem', flexShrink:0 }}>
                  <input value={msgText} onChange={e => setMsgText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                    placeholder="Send a message…" style={{ flex:1, padding:'0.6rem 0.85rem', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.85rem', outline:'none' }}/>
                  <button onClick={handleSend} disabled={sending || !msgText.trim()}
                    style={{ padding:'0.6rem 0.85rem', borderRadius:10, border:'none', background:'var(--clr-accent)', color:'#080b14', cursor:'pointer', display:'flex', alignItems:'center', opacity: sending || !msgText.trim() ? 0.5 : 1 }}>
                    {sending ? <Spinner/> : <LuSend size={16}/>}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Track tab ── */}
          {tab === 'track' && (
            <LiveTrackTab orderId={order.id} token={localStorage.getItem('auth_token') ?? ''} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type PageTab = 'orders' | 'place'

export default function ShipperOrdersPage() {
  const [pageTab, setPageTab] = useState<PageTab>('orders')
  const [orders, setOrders] = useState<Order[]>([])
  const [cargoTypes, setCargoTypes] = useState<CargoType[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const LIMIT = 10
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadOrders = useCallback(async (pg = page, sf = statusFilter) => {
    setLoading(true)
    try {
      const { data } = await orderApi.listOrders({ page: pg, limit: LIMIT, status: sf || undefined })
      setOrders(data.orders ?? [])
      setTotal(data.pagination?.total ?? 0)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [page, statusFilter])

  useEffect(() => {
    orderApi.getCargoTypes().then(r => setCargoTypes(r.data.cargo_types ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (pageTab === 'orders') loadOrders(page, statusFilter)
  }, [pageTab, page, statusFilter]) // eslint-disable-line

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const STATUSES = ['', 'PENDING', 'ASSIGNED', 'EN_ROUTE', 'AT_PICKUP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']

  // Filter orders client-side by search
  const visible = search.trim()
    ? orders.filter(o => o.reference_code.toLowerCase().includes(search.toLowerCase()) || o.pickup_address.toLowerCase().includes(search.toLowerCase()) || o.delivery_address.toLowerCase().includes(search.toLowerCase()) || o.cargo_type_name.toLowerCase().includes(search.toLowerCase()))
    : orders

  return (
    <div className="page-shell" style={{ alignItems:'flex-start' }}>
      <div style={{ width:'100%', maxWidth:640, display:'flex', flexDirection:'column', gap:'1.25rem' }}>

        {/* ── Header ── */}
        <div className="glass page-enter" style={{ padding:'1.5rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'0.75rem', flexWrap:'wrap' }}>
            <div>
              <h2 style={{ fontSize:'1.05rem', fontWeight:800, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}>
                <LuPackage size={18}/> My Shipments
              </h2>
              <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', marginTop:'0.15rem' }}>
                {total} total order{total !== 1 ? 's' : ''}
              </p>
            </div>
            <div style={{ display:'flex', gap:'0.4rem' }}>
              <button onClick={() => loadOrders(page, statusFilter)} disabled={loading}
                style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.35rem 0.7rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}>
                <LuRefreshCw size={13}/> Refresh
              </button>
              <button
                onClick={() => setShowWizard(true)}
                style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.4rem 0.9rem', borderRadius:8, border:'none', background:'var(--clr-accent)', color:'#080b14', fontFamily:'inherit', fontSize:'0.8rem', fontWeight:700, cursor:'pointer' }}>
                <LuPlus size={15}/> New Order
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:'0.25rem', background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'0.25rem', marginTop:'1rem' }}>
            {(['orders','place'] as PageTab[]).map(t => (
              <button key={t} onClick={() => { setPageTab(t); if (t === 'place') setShowWizard(true) }} style={{ flex:1, padding:'0.45rem', border:'none', borderRadius:8, background: pageTab === t ? 'rgba(0,229,255,0.12)' : 'transparent', color: pageTab === t ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:700, cursor:'pointer', transition:'all 0.15s', outline: pageTab === t ? '1px solid rgba(0,229,255,0.2)' : 'none' }}>
                {t === 'orders' ? 'My Orders' : '+ Place New Order'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Filters ── */}
        {pageTab === 'orders' && (
          <div className="glass" style={{ padding:'0.85rem 1.1rem', display:'flex', gap:'0.65rem', flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ flex:1, minWidth:160, display:'flex', alignItems:'center', gap:'0.5rem', background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'0.45rem 0.75rem' }}>
              <LuSearch size={14} style={{ color:'var(--clr-muted)', flexShrink:0 }}/>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders…"
                style={{ background:'none', border:'none', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.82rem', outline:'none', width:'100%' }}/>
              {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', padding:0, display:'flex', alignItems:'center' }}><LuX size={13}/></button>}
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              style={{ padding:'0.45rem 0.65rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.8rem', outline:'none' }}>
              {STATUSES.map(s => <option key={s} value={s} style={{ background:'#0f172a' }}>{s || 'All Statuses'}</option>)}
            </select>
          </div>
        )}

        {/* ── Order list ── */}
        {pageTab === 'orders' && (
          <div className="glass" style={{ padding:'1rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.65rem' }}>
            {loading ? (
              <div style={{ display:'flex', justifyContent:'center', padding:'2.5rem', color:'var(--clr-muted)', gap:'0.65rem', alignItems:'center' }}>
                <Spinner/> Loading orders…
              </div>
            ) : visible.length === 0 ? (
              <div style={{ textAlign:'center', padding:'3rem 1rem', color:'var(--clr-muted)', fontSize:'0.875rem' }}>
                <LuPackage size={36} style={{ opacity:0.25, display:'block', margin:'0 auto 1rem' }}/>
                {statusFilter || search ? 'No orders match your filter.' : 'No orders yet. Place your first shipment!'}
              </div>
            ) : visible.map(order => (
              <div key={order.id} className="glass-inner" onClick={() => setSelectedOrder(order)}
                style={{ padding:'0.9rem 1rem', cursor:'pointer', transition:'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'0.5rem' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap', marginBottom:'0.25rem' }}>
                      <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--clr-text)' }}>{order.reference_code}</span>
                      {statusBadge(order.status)}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:'0.2rem' }}>
                      <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', display:'flex', alignItems:'center', gap:'0.35rem' }}>
                        <LuMapPin size={11}/> {order.pickup_address}
                      </p>
                      <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', display:'flex', alignItems:'center', gap:'0.35rem' }}>
                        <LuArrowRight size={11}/> {order.delivery_address}
                      </p>
                    </div>
                    <div style={{ display:'flex', gap:'0.65rem', marginTop:'0.4rem', flexWrap:'wrap' }}>
                      <span style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>{order.cargo_type_name}</span>
                      <span style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>·</span>
                      <span style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>{order.vehicle_type_required}</span>
                      <span style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>·</span>
                      <span style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>{order.estimated_weight_kg} kg</span>
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <p style={{ fontSize:'0.9rem', fontWeight:800, color:'var(--clr-accent)', whiteSpace:'nowrap' }}>
                      {(order.final_price ?? order.estimated_price).toLocaleString()} ETB
                    </p>
                    <p style={{ fontSize:'0.68rem', color:'var(--clr-muted)', marginTop:'0.2rem' }}>{fmtDate(order.created_at).split(',')[0]}</p>
                    <LuChevronRight size={14} style={{ color:'var(--clr-muted)', marginTop:'0.3rem' }}/>
                  </div>
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:'0.5rem', paddingTop:'0.5rem', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding:'0.3rem 0.6rem', borderRadius:7, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', cursor:'pointer', display:'flex', alignItems:'center', opacity: page === 1 ? 0.4 : 1 }}>
                  <LuChevronLeft size={14}/>
                </button>
                <span style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ padding:'0.3rem 0.6rem', borderRadius:7, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', cursor:'pointer', display:'flex', alignItems:'center', opacity: page === totalPages ? 0.4 : 1 }}>
                  <LuChevronRight size={14}/>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Place Order Wizard Modal ── */}
      {showWizard && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowWizard(false) }}>
          <div className="glass modal-box" style={{ padding:'1.5rem', maxWidth:480, width:'100%', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
              <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}>
                <LuPackage size={17}/> Place New Order
              </h2>
              <button onClick={() => setShowWizard(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', padding:0, display:'flex', alignItems:'center' }}>
                <LuX size={18}/>
              </button>
            </div>
            <PlaceOrderWizard
              cargoTypes={cargoTypes}
              onDone={() => { setPageTab('orders'); loadOrders(1, '') }}
              onClose={() => setShowWizard(false)}
            />
          </div>
        </div>
      )}

      {/* ── Order Detail Modal ── */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onCancelled={() => { showToast('Order cancelled.'); loadOrders(page, statusFilter) }}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position:'fixed', bottom:'5.5rem', right:'1.25rem', zIndex:200, background:'rgba(0,229,255,0.12)', border:'1px solid rgba(0,229,255,0.25)', color:'var(--clr-text)', padding:'0.65rem 1.1rem', borderRadius:12, fontSize:'0.85rem', fontWeight:600, backdropFilter:'blur(12px)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
