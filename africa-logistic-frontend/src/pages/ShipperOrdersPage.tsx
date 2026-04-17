import { useState, useEffect, useRef, useCallback } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { orderApi, configApi } from '../lib/apiClient'
import {
  LuPackage, LuPlus, LuRefreshCw, LuSearch, LuX,
  LuCircleCheck, LuTriangleAlert, LuTruck, LuMapPin,
  LuFileText, LuChevronRight, LuChevronLeft,
  LuSend, LuArrowRight, LuBan, LuNavigation,
  LuEye, LuEyeOff, LuCopy, LuMessageSquare, LuCamera, LuTrash2, LuStar, LuUpload,
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
interface CargoType { id: number; name: string; description: string; requires_special_handling: number; icon: string; icon_url?: string | null }
interface CountryOption { id: number; name: string; iso_code: string }
interface Quote { distance_km: number; estimated_price: number; base_fare: number; per_km_rate: number; per_kg_rate?: number; distance_cost: number; weight_cost?: number; city_surcharge: number; fees_breakdown?: Array<{name:string;amount:number;type:string;rate?:number}>; currency?: string }
interface Order {
  id: string; reference_code: string; status: string
  cargo_type_name: string; cargo_type_icon?: string | null; cargo_type_icon_url?: string | null
  vehicle_type_required: string; estimated_weight_kg: number
  pickup_address: string; delivery_address: string
  estimated_price: number; final_price: number | null; currency?: string
  description: string | null; estimated_value: number | null
  driver_first_name: string | null; driver_last_name: string | null; driver_phone: string | null
  created_at: string; pickup_otp?: string | null; delivery_otp?: string | null
  is_cross_border?: number
  hs_code?: string | null
  shipper_tin?: string | null
  border_crossing_ref?: string | null
  customs_declaration_ref?: string | null
}
interface CrossBorderDoc {
  id: string
  document_type: string
  status: string
  notes?: string | null
  file_url: string
  created_at: string
  uploader_first_name?: string
  uploader_last_name?: string
  review_notes?: string | null
}
interface StatusHistory { id: number; status: string; notes: string | null; created_at: string }
interface Message { id: string; sender_first_name: string; sender_last_name: string; sender_role_id: number; message: string; created_at: string; sender_name?: string; sender_role?: string; channel?: string }
interface TrackInfo { success: boolean; status: string; driver?: { name: string; phone: string }; location?: { lat: number; lng: number; recorded_at: string; heading: number | null; speed_kmh: number | null } }
interface OrderCharge { id: string; type: string; amount: number; description?: string; status?: string }

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

const DOC_TYPE_OPTIONS = [
  { value: 'COMMERCIAL_INVOICE', label: 'Commercial Invoice' },
  { value: 'BILL_OF_LADING', label: 'Bill of Lading' },
  { value: 'PACKING_LIST', label: 'Packing List' },
  { value: 'CERTIFICATE_OF_ORIGIN', label: 'Certificate of Origin' },
  { value: 'CHECKPOINT_PHOTO', label: 'Checkpoint Photo' },
  { value: 'OTHER', label: 'Other' },
]

function StatusBadge({ status }: { status: string }) {
  const { t: tr } = useLanguage()
  const c = STATUS_COLOR[status] ?? '#94a3b8'
  const raw = tr(`ostatus_${status}`)
  const label = raw.startsWith('ostatus_') ? (STATUS_LABEL[status] ?? status) : raw
  return (
    <span style={{ fontSize:'0.7rem', fontWeight:700, color:c,
      background:`${c}1a`, border:`1px solid ${c}44`,
      borderRadius:99, padding:'0.18rem 0.6rem', whiteSpace:'nowrap' }}>
      {label}
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
async function reverseGeocode(lat: number, lng: number): Promise<{ address: string; countryCode: string | null }> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`, {
      headers: { 'Accept-Language': 'en' },
    })
    const d = await r.json()
    const { road, suburb, city, town, village, state, country, country_code } = d.address ?? {}
    const parts = [road, suburb, city ?? town ?? village, state, country].filter(Boolean)
    return {
      address: parts.join(', ') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      countryCode: country_code ? String(country_code).toLowerCase() : null,
    }
  } catch {
    return { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, countryCode: null }
  }
}

// ─── Location Search (Nominatim autocomplete) ────────────────────────────────
function LocationSearch({ label, dotColor, value, countryCode, onSelect, onClear }: {
  label: string; dotColor: string; value: string
  countryCode?: string
  onSelect: (lat: string, lng: string, addr: string, cCode: string | null) => void
  onClear: () => void
}) {
  const [q, setQ] = useState(value)
  const [results, setResults] = useState<Array<{ display_name: string; lat: string; lon: string; address?: { country_code?: string } }>>(
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
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(text)}&limit=6${countryCode ? `&countrycodes=${encodeURIComponent(countryCode)}` : ''}`,
          { headers: { 'Accept-Language': 'en' } }
        )
        const d: Array<{ display_name: string; lat: string; lon: string; address?: { country_code?: string } }> = await r.json()
        if (d.length === 0) {
          const r2 = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(text)}&limit=5${countryCode ? `&countrycodes=${encodeURIComponent(countryCode)}` : ''}`,
            { headers: { 'Accept-Language': 'en' } }
          )
          const d2: Array<{ display_name: string; lat: string; lon: string; address?: { country_code?: string } }> = await r2.json()
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
              onClick={() => {
                setQ(item.display_name)
                setOpen(false)
                onSelect(item.lat, item.lon, item.display_name, item.address?.country_code ? String(item.address.country_code).toLowerCase() : null)
              }}
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
  selectedCountryCode?: string
  onChange: (field: 'pickup_lat'|'pickup_lng'|'pickup_address'|'pickup_country_code'|'delivery_lat'|'delivery_lng'|'delivery_address'|'delivery_country_code', val: string) => void
}
function MapPicker({ pickupLat, pickupLng, pickupAddress, deliveryLat, deliveryLng, deliveryAddress, selectedCountryCode, onChange }: MapPickerProps) {
  const { t: tr } = useLanguage()
  const [mode, setMode] = useState<'pickup' | 'delivery'>('pickup')
  const [geocoding, setGeocoding] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)

  const handlePick = async (lat: number, lng: number) => {
    setGeocoding(true)
    const geo = await reverseGeocode(lat, lng)
    if (mode === 'pickup') {
      onChange('pickup_lat', lat.toFixed(6))
      onChange('pickup_lng', lng.toFixed(6))
      onChange('pickup_address', geo.address)
      onChange('pickup_country_code', geo.countryCode ?? '')
    } else {
      onChange('delivery_lat', lat.toFixed(6))
      onChange('delivery_lng', lng.toFixed(6))
      onChange('delivery_address', geo.address)
      onChange('delivery_country_code', geo.countryCode ?? '')
    }
    setGeocoding(false)
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) return
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords
      setGpsLoading(true)
      const geo = await reverseGeocode(lat, lng)
      if (mode === 'pickup') {
        onChange('pickup_lat', lat.toFixed(6)); onChange('pickup_lng', lng.toFixed(6)); onChange('pickup_address', geo.address); onChange('pickup_country_code', geo.countryCode ?? '')
      } else {
        onChange('delivery_lat', lat.toFixed(6)); onChange('delivery_lng', lng.toFixed(6)); onChange('delivery_address', geo.address); onChange('delivery_country_code', geo.countryCode ?? '')
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
        label={tr('loc_pickup')} dotColor="#4ade80" value={pickupAddress}
        countryCode={selectedCountryCode}
        onSelect={(lat, lng, addr, cCode) => { onChange('pickup_lat', lat); onChange('pickup_lng', lng); onChange('pickup_address', addr); onChange('pickup_country_code', cCode ?? ''); setMode('delivery') }}
        onClear={() => { onChange('pickup_lat',''); onChange('pickup_lng',''); onChange('pickup_address',''); onChange('pickup_country_code','') }}
      />
      <LocationSearch
        label={tr('loc_delivery')} dotColor="#f87171" value={deliveryAddress}
        countryCode={selectedCountryCode}
        onSelect={(lat, lng, addr, cCode) => { onChange('delivery_lat', lat); onChange('delivery_lng', lng); onChange('delivery_address', addr); onChange('delivery_country_code', cCode ?? '') }}
        onClear={() => { onChange('delivery_lat',''); onChange('delivery_lng',''); onChange('delivery_address',''); onChange('delivery_country_code','') }}
      />

      {/* Map pin-mode toggle + GPS button */}
      <div style={{ display:'flex', gap:'0.4rem', background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'0.25rem' }}>
        <button type="button" onClick={() => setMode('pickup')} style={{ flex:1, padding:'0.38rem', border:'none', borderRadius:8, background: mode==='pickup' ? 'rgba(74,222,128,0.15)' : 'transparent', color: mode==='pickup' ? '#4ade80' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.74rem', fontWeight:700, cursor:'pointer', transition:'all 0.15s', outline: mode==='pickup' ? '1px solid rgba(74,222,128,0.3)' : 'none', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.3rem' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:mode==='pickup'?'#4ade80':'rgba(255,255,255,0.3)', flexShrink:0 }}/>
          {tr('map_pin_pickup')} {hasPickup && <LuCircleCheck size={10}/>}
        </button>
        <button type="button" onClick={() => setMode('delivery')} style={{ flex:1, padding:'0.38rem', border:'none', borderRadius:8, background: mode==='delivery' ? 'rgba(248,113,113,0.15)' : 'transparent', color: mode==='delivery' ? '#f87171' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.74rem', fontWeight:700, cursor:'pointer', transition:'all 0.15s', outline: mode==='delivery' ? '1px solid rgba(248,113,113,0.3)' : 'none', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.3rem' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:mode==='delivery'?'#f87171':'rgba(255,255,255,0.3)', flexShrink:0 }}/>
          {tr('map_pin_delivery')} {hasDelivery && <LuCircleCheck size={10}/>}
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
          <LuTriangleAlert size={12}/> {tr('map_same_loc')}
        </div>
      )}

      <p style={{ fontSize:'0.7rem', color: geocoding ? 'var(--clr-accent)' : 'var(--clr-muted)', textAlign:'center', margin:0 }}>
        {geocoding ? tr('map_getting_addr') : `${tr('map_tap_pin')} ${mode} ${tr('map_location')}`}
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
              <Popup>{tr('loc_pickup')}: {pickupAddress || `${pLat.toFixed(5)}, ${pLng.toFixed(5)}`}</Popup>
            </Marker>
          )}
          {hasDelivery && (
            <Marker position={[dLat, dLng]} icon={deliveryIcon}>
              <Popup>{tr('loc_delivery')}: {deliveryAddress || `${dLat.toFixed(5)}, ${dLng.toFixed(5)}`}</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>
    </div>
  )
}

// ─── Place-Order Wizard ───────────────────────────────────────────────────────
interface WizardProps { cargoTypes: CargoType[]; onDone: () => void; onClose: () => void }

function PlaceOrderWizard({ cargoTypes, onDone, onClose }: WizardProps) {
  const { t: tr } = useLanguage()
  const [vehicleTypes, setVehicleTypes] = useState<Array<{ id: number; name: string }>>([])
  const [countries, setCountries] = useState<CountryOption[]>([])
  const [step, setStep] = useState<1 | 2>(1)
  const [form, setForm] = useState({
    cargo_type_id:  cargoTypes[0]?.id ?? 1,
    vehicle_type:   '',
    country_code:   '',
    weight_kg:      '',
    pickup_address: '',
    pickup_lat:     '',
    pickup_lng:     '',
    pickup_country_code: '',
    delivery_address: '',
    delivery_lat:   '',
    delivery_lng:   '',
    delivery_country_code: '',
    description:    '',
    estimated_value:'',
  })
  const [quote, setQuote] = useState<Quote | null>(null)
  const [placedOrder, setPlacedOrder] = useState<{ reference_code: string; pickup_otp: string; delivery_otp: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [img1, setImg1] = useState<string>('')  // base64
  const [img2, setImg2] = useState<string>('')  // base64
  const [img1Preview, setImg1Preview] = useState<string>('')
  const [img2Preview, setImg2Preview] = useState<string>('')
  // Cross-border
  const [isCrossBorder, setIsCrossBorder] = useState(false)
  const [cbDeliveryCountryId, setCbDeliveryCountryId] = useState(0)
  const [cbHsCode, setCbHsCode] = useState('')
  const [cbShipperTin, setCbShipperTin] = useState('')

  useEffect(() => {
    configApi.getVehicleTypes()
      .then(r => {
        const types = r.data.vehicle_types ?? []
        setVehicleTypes(types)
        if (!form.vehicle_type && types[0]?.name) {
          setForm(prev => ({ ...prev, vehicle_type: types[0].name }))
        }
      })
      .catch(() => {})

    configApi.getCountries()
      .then(r => {
        const list = r.data.countries ?? []
        setCountries(list)
        if (!form.country_code && list[0]?.iso_code) {
          setForm(prev => ({ ...prev, country_code: String(list[0].iso_code).toLowerCase() }))
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(x => ({ ...x, [k]: e.target.value }))

  const handleGetQuote = async () => {
    setErr('')
    if (!form.country_code) {
      setErr(tr('wiz_err_country'))
      return
    }
    if (form.pickup_country_code && form.pickup_country_code !== form.country_code) {
      setErr(tr('wiz_err_pickup_out'))
      return
    }
    if (!isCrossBorder && form.delivery_country_code && form.delivery_country_code !== form.country_code) {
      setErr(tr('wiz_err_deliv_out'))
      return
    }
    if (isCrossBorder && !cbDeliveryCountryId) {
      setErr(tr('wiz_err_dest'))
      return
    }
    // Same-location guard
    const pLat = parseFloat(form.pickup_lat), pLng = parseFloat(form.pickup_lng)
    const dLat = parseFloat(form.delivery_lat), dLng = parseFloat(form.delivery_lng)
    if (!isNaN(pLat) && !isNaN(dLat) && Math.abs(pLat - dLat) < 0.0005 && Math.abs(pLng - dLng) < 0.0005) {
      setErr(tr('wiz_err_same_loc'))
      return
    }
    setLoading(true)
    try {
      const { data } = await orderApi.getQuote({
        cargo_type_id: Number(form.cargo_type_id),
        vehicle_type:  form.vehicle_type,
        estimated_weight_kg: parseFloat(form.weight_kg) || undefined,
        pickup_lat:    parseFloat(form.pickup_lat),
        pickup_lng:    parseFloat(form.pickup_lng),
        delivery_lat:  parseFloat(form.delivery_lat),
        delivery_lng:  parseFloat(form.delivery_lng),
        is_cross_border: isCrossBorder || undefined,
      })
      setQuote(data.quote)
      setStep(2)
    } catch (e: any) { setErr(e.response?.data?.message ?? tr('wiz_err_quote')) }
    finally { setLoading(false) }
  }

  const handlePlace = async () => {
    setErr(''); setLoading(true)
    if (!form.country_code || (form.pickup_country_code && form.pickup_country_code !== form.country_code) || (!isCrossBorder && form.delivery_country_code && form.delivery_country_code !== form.country_code)) {
      setLoading(false)
      setErr(tr('wiz_err_both_inside'))
      return
    }
    if (isCrossBorder && !cbDeliveryCountryId) {
      setLoading(false)
      setErr(tr('wiz_err_dest'))
      return
    }
    const pickupCountryObj = countries.find(c => String(c.iso_code).toLowerCase() === form.country_code)
    try {
      const { data } = await orderApi.placeOrder({
        cargo_type_id:       Number(form.cargo_type_id),
        vehicle_type:        form.vehicle_type,
        estimated_weight_kg: parseFloat(form.weight_kg) || undefined,
        pickup_address:      form.pickup_address,
        pickup_lat:       parseFloat(form.pickup_lat),
        pickup_lng:       parseFloat(form.pickup_lng),
        delivery_address: form.delivery_address,
        delivery_lat:     parseFloat(form.delivery_lat),
        delivery_lng:     parseFloat(form.delivery_lng),
        description:      form.description || undefined,
        estimated_value:  form.estimated_value ? parseFloat(form.estimated_value) : undefined,
        order_image_1:    img1 || undefined,
        order_image_2:    img2 || undefined,
        is_cross_border:      isCrossBorder || undefined,
        pickup_country_id:    isCrossBorder && pickupCountryObj ? pickupCountryObj.id : undefined,
        delivery_country_id:  isCrossBorder && cbDeliveryCountryId ? cbDeliveryCountryId : undefined,
        hs_code:              isCrossBorder && cbHsCode ? cbHsCode : undefined,
        shipper_tin:          isCrossBorder && cbShipperTin ? cbShipperTin : undefined,
      })
      setPlacedOrder({ reference_code: data.order.reference_code, pickup_otp: data.otps.pickup_otp, delivery_otp: data.otps.delivery_otp })
    } catch (e: any) { setErr(e.response?.data?.message ?? tr('wiz_err_place')) }
    finally { setLoading(false) }
  }

  // ── Success screen ───────────────────────────────────────────────────────
  if (placedOrder) return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1rem', alignItems:'center', textAlign:'center', padding:'0.5rem 0' }}>
      <div style={{ width:64, height:64, borderRadius:'50%', background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <LuCircleCheck size={30} color="#4ade80"/>
      </div>
      <div>
        <h3 style={{ fontSize:'1.05rem', fontWeight:800, color:'var(--clr-text)', marginBottom:'0.25rem' }}>{tr('wiz_order_placed')}</h3>
        <p style={{ fontSize:'0.8rem', color:'var(--clr-muted)' }}>{tr('wiz_reference')} <strong style={{ color:'var(--clr-accent)' }}>{placedOrder.reference_code}</strong></p>
      </div>
      <div style={{ width:'100%', borderRadius:12, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', padding:'1rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.85rem' }}>
        <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', marginBottom:'0.25rem' }}>
          {tr('wiz_otp_instr')}
        </p>
        <div className="glass-inner" style={{ padding:'0.85rem 1rem' }}>
          <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', marginBottom:'0.35rem', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:700 }}>{tr('wiz_pickup_otp')}</p>
          <p style={{ fontSize:'2rem', fontWeight:900, letterSpacing:'0.25em', color:'#4ade80', fontVariantNumeric:'tabular-nums' }}>{placedOrder.pickup_otp}</p>
        </div>
        <div className="glass-inner" style={{ padding:'0.85rem 1rem' }}>
          <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', marginBottom:'0.35rem', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:700 }}>{tr('wiz_delivery_otp')}</p>
          <p style={{ fontSize:'2rem', fontWeight:900, letterSpacing:'0.25em', color:'var(--clr-accent)', fontVariantNumeric:'tabular-nums' }}>{placedOrder.delivery_otp}</p>
        </div>
        <p style={{ fontSize:'0.73rem', color:'#fbbf24', display:'flex', alignItems:'center', gap:'0.35rem', justifyContent:'center' }}>
          <LuTriangleAlert size={12}/> {tr('wiz_screenshot')}
        </p>
      </div>
      <button className="btn-primary" style={{ width:'100%', marginTop:'0.5rem' }} onClick={() => { onDone(); onClose() }}>
        {tr('wiz_view_orders')}
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
          {step === 1 ? tr('wiz_step_details') : tr('wiz_step_confirm')}
        </span>
      </div>

      {err && <div className="alert alert-error"><LuTriangleAlert size={13}/> {err}</div>}

      {/* ── Step 1: Form ── */}
      {step === 1 && (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          <div className="input-wrap">
            <select id="country" value={form.country_code} onChange={e => setForm(x => ({
              ...x,
              country_code: e.target.value,
              pickup_address: '', pickup_lat: '', pickup_lng: '', pickup_country_code: '',
              delivery_address: '', delivery_lat: '', delivery_lng: '', delivery_country_code: '',
            }))}
              style={{ background:'transparent', border:'none', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.9rem', width:'100%', outline:'none', paddingTop:'1.1rem' }}>
              <option value="" style={{ background:'#0f172a' }}>{tr('wiz_select_country')}</option>
              {countries.map(c => <option key={c.id} value={String(c.iso_code).toLowerCase()} style={{ background:'#0f172a' }}>{c.name}</option>)}
            </select>
            <label htmlFor="country" style={{ top:'0.35rem', fontSize:'0.7rem', color:'var(--clr-accent)' }}>{tr('wiz_operating_ctry')}</label>
          </div>

          {/* Cargo type */}
          <div className="input-wrap">
            <select id="ct" value={form.cargo_type_id} onChange={f('cargo_type_id')}
              style={{ background:'transparent', border:'none', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.9rem', width:'100%', outline:'none', paddingTop:'1.1rem' }}>
              {cargoTypes.map(ct => <option key={ct.id} value={ct.id} style={{ background:'#0f172a' }}>{ct.name}</option>)}
            </select>
            <label htmlFor="ct" style={{ top:'0.35rem', fontSize:'0.7rem', color:'var(--clr-accent)' }}>{tr('wiz_cargo_type')}</label>
          </div>

          {/* Vehicle type */}
          <div className="input-wrap">
            <select id="vt" value={form.vehicle_type} onChange={f('vehicle_type')}
              style={{ background:'transparent', border:'none', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.9rem', width:'100%', outline:'none', paddingTop:'1.1rem' }}>
              <option value="" style={{ background:'#0f172a' }}>{tr('wiz_select_vehicle')}</option>
              {vehicleTypes.map(t => <option key={t.id} value={t.name} style={{ background:'#0f172a' }}>{t.name}</option>)}
            </select>
            <label htmlFor="vt" style={{ top:'0.35rem', fontSize:'0.7rem', color:'var(--clr-accent)' }}>{tr('wiz_vehicle_type')}</label>
          </div>

          {/* Weight */}
          <div className="input-wrap">
            <input id="wt" type="number" placeholder=" " min="0.1" step="0.1" value={form.weight_kg} onChange={f('weight_kg')} required/>
            <label htmlFor="wt">{tr('wiz_weight_kg')}</label>
          </div>

          {/* ── Interactive map picker ── */}
          <MapPicker
            pickupLat={form.pickup_lat}  pickupLng={form.pickup_lng}  pickupAddress={form.pickup_address}
            deliveryLat={form.delivery_lat} deliveryLng={form.delivery_lng} deliveryAddress={form.delivery_address}
            selectedCountryCode={form.country_code}
            onChange={(field, val) => setForm(x => ({ ...x, [field]: val }))}
          />

          <div className="input-wrap">
            <input id="desc" type="text" placeholder=" " value={form.description} onChange={f('description')}/>
            <label htmlFor="desc">{tr('wiz_description')}</label>
          </div>
          <div className="input-wrap">
            <input id="val" type="number" placeholder=" " min="0" step="0.01" value={form.estimated_value} onChange={f('estimated_value')}/>
            <label htmlFor="val">{tr('wiz_est_value')}</label>
          </div>

          {/* Image upload (optional, max 2) */}
          <div>
            <p style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.4rem' }}>{tr('wiz_images_title')}</p>
            <div style={{ display:'flex', gap:'0.65rem', flexWrap:'wrap' }}>
              {/* Image 1 */}
              <label style={{ cursor:'pointer', position:'relative' }}>
                <div style={{ width:90, height:72, borderRadius:9, border:`1px dashed ${img1Preview?'rgba(0,229,255,0.4)':'rgba(255,255,255,0.2)'}`, background: img1Preview ? 'transparent' : 'rgba(255,255,255,0.03)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                  {img1Preview ? (
                    <img src={img1Preview} alt="img1" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  ) : (
                    <span style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.2rem', color:'var(--clr-muted)', fontSize:'0.65rem' }}>
                      <LuCamera size={18}/> {tr('wiz_add_photo')}
                    </span>
                  )}
                </div>
                <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => {
                  const file = e.target.files?.[0]; if (!file) return
                  const reader = new FileReader()
                  reader.onload = ev => { const r = ev.target?.result as string; setImg1(r); setImg1Preview(r) }
                  reader.readAsDataURL(file)
                }}/>
              </label>
              {/* Image 2 */}
              {(img1Preview || img2Preview) && (
                <label style={{ cursor:'pointer', position:'relative' }}>
                  <div style={{ width:90, height:72, borderRadius:9, border:`1px dashed ${img2Preview?'rgba(0,229,255,0.4)':'rgba(255,255,255,0.2)'}`, background: img2Preview ? 'transparent' : 'rgba(255,255,255,0.03)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                    {img2Preview ? (
                      <img src={img2Preview} alt="img2" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                    ) : (
                      <span style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.2rem', color:'var(--clr-muted)', fontSize:'0.65rem' }}>
                        <LuCamera size={18}/> {tr('wiz_add_2nd')}
                      </span>
                    )}
                  </div>
                  <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => {
                    const file = e.target.files?.[0]; if (!file) return
                    const reader = new FileReader()
                    reader.onload = ev => { const r = ev.target?.result as string; setImg2(r); setImg2Preview(r) }
                    reader.readAsDataURL(file)
                  }}/>
                </label>
              )}
              {img1Preview && (
                <button type="button" onClick={() => { setImg1(''); setImg1Preview(''); setImg2(''); setImg2Preview('') }} style={{ alignSelf:'flex-start', background:'none', border:'none', color:'#f87171', cursor:'pointer', fontSize:'0.7rem', padding:'0.25rem', display:'flex', alignItems:'center', gap:'0.2rem' }}>
                  <LuTrash2 size={13}/> {tr('wiz_clear')}
                </button>
              )}
            </div>
          </div>

          {/* Cross-border toggle */}
          <div style={{ padding:'0.75rem 0.9rem', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.02)' }}>
            <label style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:'0.65rem', fontWeight:600, fontSize:'0.83rem' }}>
              <input type="checkbox" checked={isCrossBorder} onChange={e => { setIsCrossBorder(e.target.checked); setCbDeliveryCountryId(0) }}
                style={{ accentColor:'var(--clr-accent)', width:15, height:15 }}/>
              {tr('wiz_cross_border')}
            </label>
            {isCrossBorder && (
              <div style={{ marginTop:'0.75rem', display:'flex', flexDirection:'column', gap:'0.6rem' }}>
                <div>
                  <label style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.25rem', display:'block' }}>{tr('wiz_dest_country')}</label>
                  <select value={cbDeliveryCountryId || ''} onChange={e => setCbDeliveryCountryId(Number(e.target.value))}
                    style={{ width:'100%', padding:'0.6rem 0.8rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(30,30,30,0.95)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.85rem' }}>
                    <option value=''>{tr('wiz_select_dest')}</option>
                    {countries.filter(c => String(c.iso_code).toLowerCase() !== form.country_code).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.6rem' }}>
                  <div>
                    <label style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.25rem', display:'block' }}>{tr('wiz_hs_code')}</label>
                    <input value={cbHsCode} onChange={e => setCbHsCode(e.target.value)} placeholder="e.g. 8471.30"
                      style={{ width:'100%', padding:'0.6rem 0.8rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.85rem', boxSizing:'border-box' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.25rem', display:'block' }}>{tr('wiz_your_tin')}</label>
                    <input value={cbShipperTin} onChange={e => setCbShipperTin(e.target.value)} placeholder={tr('wiz_tin_ph')}
                      style={{ width:'100%', padding:'0.6rem 0.8rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.85rem', boxSizing:'border-box' }}/>
                  </div>
                </div>
                <p style={{ fontSize:'0.72rem', color:'var(--clr-muted)', margin:0 }}>{tr('wiz_cb_info')}</p>
              </div>
            )}
          </div>

          {/* Missing-field hints */}
          {(!form.weight_kg || !form.pickup_lat || !form.delivery_lat) && (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.2rem', padding:'0.55rem 0.75rem', borderRadius:9, background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.18)' }}>
              {!form.weight_kg && <span style={{ fontSize:'0.73rem', color:'#fbbf24', display:'flex', alignItems:'center', gap:'0.35rem' }}><LuTriangleAlert size={11}/> {tr('wiz_hint_weight')}</span>}
              {!form.pickup_lat && <span style={{ fontSize:'0.73rem', color:'#fbbf24', display:'flex', alignItems:'center', gap:'0.35rem' }}><LuTriangleAlert size={11}/> {tr('wiz_hint_pickup')}</span>}
              {!form.delivery_lat && <span style={{ fontSize:'0.73rem', color:'#fbbf24', display:'flex', alignItems:'center', gap:'0.35rem' }}><LuTriangleAlert size={11}/> {tr('wiz_hint_delivery')}</span>}
            </div>
          )}

          <div style={{ display:'flex', gap:'0.6rem', marginTop:'0.25rem' }}>
            <button type="button" onClick={onClose}
              style={{ flex:1, padding:'0.65rem', borderRadius:10, border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.875rem', fontWeight:700, cursor:'pointer' }}>
              {tr('wiz_cancel')}
            </button>
            <button type="button" onClick={handleGetQuote}
              disabled={loading || !form.weight_kg || !form.pickup_lat || !form.pickup_lng || !form.delivery_lat || !form.delivery_lng}
              style={{ flex:2, padding:'0.65rem', borderRadius:10, border:'none', background: (!form.weight_kg || !form.pickup_lat || !form.delivery_lat || loading) ? 'rgba(255,255,255,0.08)' : 'var(--clr-accent)', color: (!form.weight_kg || !form.pickup_lat || !form.delivery_lat || loading) ? 'var(--clr-muted)' : '#080b14', fontFamily:'inherit', fontSize:'0.875rem', fontWeight:700, cursor: (!form.weight_kg || !form.pickup_lat || !form.delivery_lat) ? 'not-allowed' : 'pointer', transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
              {loading ? <><span className="spinner" style={{ width:16, height:16, borderWidth:2 }}/> {tr('wiz_getting_quote')}</> : <>{tr('wiz_get_quote')} <LuArrowRight size={15}/></>}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Confirm ── */}
      {step === 2 && quote && (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
          {/* Quote card with detailed breakdown */}
          <div className="glass-inner" style={{ padding:'1.1rem 1.25rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
              <span style={{ fontSize:'0.8rem', color:'var(--clr-muted)', fontWeight:600 }}>{tr('wiz_price_quote')}</span>
              <span style={{ fontSize:'1.35rem', fontWeight:900, color:'var(--clr-accent)' }}>{Number(quote.estimated_price).toLocaleString()} ETB</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem', fontSize:'0.78rem', color:'var(--clr-muted)' }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}><span>{tr('wiz_distance')}</span><span style={{ color:'var(--clr-text)' }}>{Number(quote.distance_km).toFixed(2)} km</span></div>
              <div style={{ display:'flex', justifyContent:'space-between' }}><span>{tr('wiz_base_fare')}</span><span style={{ color:'var(--clr-text)' }}>{Number(quote.base_fare).toLocaleString()} ETB</span></div>
              <div style={{ display:'flex', justifyContent:'space-between' }}><span>{tr('wiz_dist_charge')} ({Number(quote.per_km_rate)} ETB/km)</span><span style={{ color:'var(--clr-text)' }}>{Number(quote.distance_cost).toLocaleString()} ETB</span></div>
              {(quote.weight_cost ?? 0) > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between' }}><span>{tr('wiz_weight_charge')} ({Number(quote.per_kg_rate)} ETB/kg)</span><span style={{ color:'var(--clr-text)' }}>{Number(quote.weight_cost).toLocaleString()} ETB</span></div>
              )}
              {(quote.fees_breakdown ?? []).map((fee, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between' }}>
                  <span>{fee.name}{fee.type === 'percent' ? ` (${fee.rate}%)` : ''}</span>
                  <span style={{ color:'var(--clr-text)' }}>{Number(fee.amount).toLocaleString()} ETB</span>
                </div>
              ))}
              {(quote.fees_breakdown ?? []).length === 0 && Number(quote.city_surcharge) > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between' }}><span>{tr('wiz_fees')}</span><span style={{ color:'var(--clr-text)' }}>{Number(quote.city_surcharge).toLocaleString()} ETB</span></div>
              )}
              <div style={{ height:1, background:'rgba(255,255,255,0.08)', margin:'0.2rem 0' }}/>
              <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, color:'var(--clr-accent)' }}><span>{tr('wiz_total')}</span><span>{Number(quote.estimated_price).toLocaleString()} ETB</span></div>
            </div>
          </div>

          {/* Summary */}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem', fontSize:'0.8rem' }}>
            {[
              [tr('wiz_sum_cargo'), cargoTypes.find(c => c.id === Number(form.cargo_type_id))?.name ?? ''],
              [tr('wiz_sum_vehicle'), form.vehicle_type],
              [tr('wiz_sum_weight'), `${form.weight_kg} kg`],
              [tr('wiz_sum_pickup'), form.pickup_address],
              [tr('wiz_sum_delivery'), form.delivery_address],
              ...(form.description ? [[tr('wiz_sum_note'), form.description]] : []),
            ].map(([l, v]) => (
              <div key={l} style={{ display:'flex', gap:'0.5rem' }}>
                <span style={{ color:'var(--clr-muted)', width:60, flexShrink:0 }}>{l}</span>
                <span style={{ color:'var(--clr-text)', fontWeight:500, wordBreak:'break-word' }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ display:'flex', gap:'0.6rem', marginTop:'0.25rem' }}>
            <button className="btn-outline" style={{ flex:1, display:'flex', alignItems:'center', gap:'0.4rem', justifyContent:'center' }} onClick={() => { setStep(1); setQuote(null); setErr('') }}>
              <LuChevronLeft size={14}/> {tr('wiz_edit')}
            </button>
            <button className="btn-primary" style={{ flex:2 }} onClick={handlePlace} disabled={loading}>
              {loading ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}><Spinner/> {tr('wiz_placing')}</span> : tr('wiz_confirm_place')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Live Track Tab (WebSocket + Leaflet map) ─────────────────────────────────
function LiveTrackTab({ orderId, token }: { orderId: string; token: string }) {
  const { t: tr } = useLanguage()
  const [loc, setLoc] = useState<TrackInfo['location'] | null>(null)
  const [status, setStatus] = useState('')
  const [driver, setDriver] = useState<TrackInfo['driver'] | null>(null)
  const [wsState, setWsState] = useState<'connecting' | 'connected' | 'closed'>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const [initialLoaded, setInitialLoaded] = useState(false)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelayRef = useRef(2000) // starts at 2s, doubles up to 30s
  const statusRef = useRef(status)
  useEffect(() => { statusRef.current = status }, [status])

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

    const TERMINAL = ['DELIVERED', 'CANCELLED']

    const connect = () => {
      if (TERMINAL.includes(statusRef.current)) return
      setWsState('connecting')
      const wsBase = (import.meta.env.VITE_API_BASE_URL as string ?? '').replace(/^https/, 'wss').replace(/^http/, 'ws').replace(/\/api$/, '')
      const ws = new WebSocket(`${wsBase}/api/ws/orders/${orderId}?token=${encodeURIComponent(token)}`)
      wsRef.current = ws

      ws.onopen = () => {
        setWsState('connected')
        reconnectDelayRef.current = 2000 // reset backoff on success
      }
      ws.onclose = () => {
        setWsState('closed')
        if (!TERMINAL.includes(statusRef.current)) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000)
            connect()
          }, reconnectDelayRef.current)
        }
      }
      ws.onerror = () => ws.close() // let onclose handle reconnect
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'CONNECTED') { setStatus(msg.status ?? '') }
          if (msg.type === 'LOCATION_UPDATE') {
            setLoc({ lat: Number(msg.lat), lng: Number(msg.lng), recorded_at: msg.recorded_at ?? new Date().toISOString(), heading: msg.heading ?? null, speed_kmh: msg.speed_kmh ?? null })
          }
          if (msg.type === 'STATUS_CHANGE' || msg.type === 'STATUS_CHANGED') { setStatus(msg.status ?? '') }
        } catch { /* ignore */ }
      }
    }

    connect()
    return () => {
      wsRef.current?.close()
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    }
  }, [orderId, token, initialLoaded]) // eslint-disable-line

  const hasLoc = loc && !isNaN(loc.lat) && !isNaN(loc.lng)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
      {/* WS status indicator */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.5rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.45rem' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background: wsState==='connected' ? '#4ade80' : wsState==='connecting' ? '#fbbf24' : '#f87171', display:'inline-block', flexShrink:0, boxShadow: wsState==='connected' ? '0 0 6px #4ade80' : 'none' }}/>
          <span style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>
            {wsState==='connected' ? tr('track_live') : wsState==='connecting' ? tr('track_connecting') : ['DELIVERED','CANCELLED'].includes(status) ? tr('track_completed') : tr('track_offline')}
          </span>
        </div>
        {status && <StatusBadge status={status}/>}
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
          {tr('track_no_loc')}<br/>
          <span style={{ fontSize:'0.78rem' }}>{tr('track_loc_soon')}</span>
        </div>
      )}

      {/* Info panel */}
      {hasLoc && (
        <div className="glass-inner" style={{ padding:'0.85rem 1rem', display:'flex', flexDirection:'column', gap:'0.4rem', fontSize:'0.78rem' }}>
          {driver?.name && <div style={{ display:'flex', gap:'0.5rem' }}><span style={{ color:'var(--clr-muted)', width:70, flexShrink:0 }}>{tr('track_driver')}</span><span style={{ color:'var(--clr-text)', fontWeight:600 }}>{driver.name}</span></div>}
          <div style={{ display:'flex', gap:'0.5rem' }}><span style={{ color:'var(--clr-muted)', width:70, flexShrink:0 }}>{tr('track_position')}</span><span style={{ color:'var(--clr-text)' }}>{Number(loc!.lat).toFixed(5)}, {Number(loc!.lng).toFixed(5)}</span></div>
          {loc!.speed_kmh != null && <div style={{ display:'flex', gap:'0.5rem' }}><span style={{ color:'var(--clr-muted)', width:70, flexShrink:0 }}>{tr('track_speed')}</span><span style={{ color:'var(--clr-text)' }}>{loc!.speed_kmh} km/h</span></div>}
          {loc!.heading != null && <div style={{ display:'flex', gap:'0.5rem' }}><span style={{ color:'var(--clr-muted)', width:70, flexShrink:0 }}>{tr('track_heading')}</span><span style={{ color:'var(--clr-text)' }}>{loc!.heading}°</span></div>}
          <div style={{ display:'flex', gap:'0.5rem' }}><span style={{ color:'var(--clr-muted)', width:70, flexShrink:0 }}>{tr('track_updated')}</span><span style={{ color:'var(--clr-text)' }}>{fmtDate(loc!.recorded_at)}</span></div>
        </div>
      )}

      {hasLoc && (
        <a href={`https://www.google.com/maps?q=${loc!.lat},${loc!.lng}`} target="_blank" rel="noopener noreferrer"
          style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.65rem 1rem', borderRadius:10, border:'1px solid rgba(0,229,255,0.2)', background:'rgba(0,229,255,0.05)', color:'var(--clr-accent)', textDecoration:'none', fontSize:'0.82rem', fontWeight:700 }}>
          <LuMapPin size={14}/> {tr('track_open_maps')}
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

// ─── OTP Reveal Box ───────────────────────────────────────────────────────────
function OtpRow({ label, otp, onCopy }: { label: string; otp: string | undefined; onCopy: (t: string) => void }) {
  if (!otp) return null
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'0.5rem' }}>
      <span style={{ fontSize:'0.75rem', color:'var(--clr-muted)' }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
        <span style={{ fontFamily:'monospace', fontSize:'1.05rem', fontWeight:900, letterSpacing:'0.25em', color:'var(--clr-accent)' }}>{otp}</span>
        <button onClick={() => onCopy(otp)} title="Copy"
          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', display:'flex', alignItems:'center', padding:'0.15rem' }}>
          <LuCopy size={13}/>
        </button>
      </div>
    </div>
  )
}

function OtpRevealBox({ pickupOtp, deliveryOtp }: { pickupOtp?: string | null; deliveryOtp?: string | null }) {
  const { t: tr } = useLanguage()
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState('')

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(text)
    setTimeout(() => setCopied(''), 2000)
  }

  const hasOtps = !!(pickupOtp || deliveryOtp)

  return (
    <div className="glass-inner" style={{ padding:'0.85rem 1rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.25rem' }}>
        <span style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' }}>
          {tr('otp_box_title')}
        </span>
        <button onClick={() => setShow(s => !s)}
          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', display:'flex', alignItems:'center', gap:'0.3rem', padding:'0.2rem 0.4rem', borderRadius:6, fontSize:'0.72rem' }}>
          {show ? <><LuEyeOff size={13}/> {tr('otp_hide')}</> : <><LuEye size={13}/> {tr('otp_reveal')}</>}
        </button>
      </div>
      {show ? (
        hasOtps ? (
          <>
            <OtpRow label={tr('otp_pickup_lbl')} otp={pickupOtp ?? undefined} onCopy={copy}/>
            <OtpRow label={tr('otp_delivery_lbl')} otp={deliveryOtp ?? undefined} onCopy={copy}/>
            {copied && (
              <p style={{ fontSize:'0.7rem', color:'#4ade80', marginTop:'0.4rem', textAlign:'right' }}>{tr('otp_copied')}</p>
            )}
          </>
        ) : (
          <div style={{ padding:'0.6rem 0.75rem', borderRadius:8, background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)', marginTop:'0.4rem' }}>
            <p style={{ fontSize:'0.75rem', color:'#fbbf24', margin:0, lineHeight:1.5 }}>
              <b>{tr('otp_not_stored')}</b><br/>
              {tr('otp_not_stored_desc')}
            </p>
          </div>
        )
      ) : (
        <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', margin:0 }}>
          {hasOtps
            ? <>{tr('otp_hint_has')}</>
            : <>{tr('otp_hint_none')}</> }
        </p>
      )}
    </div>
  )
}

// ─── Order Detail Modal ───────────────────────────────────────────────────────
function OrderDetailModal({ order, onClose, onCancelled }: { order: Order; onClose: () => void; onCancelled: () => void }) {
  const { t: tr } = useLanguage()
  const isCrossBorder = !!order.is_cross_border
  const [tab, setTab] = useState<'info' | 'history' | 'chat' | 'track' | 'docs'>('info')
  const [chatChannel, _setChatChannel] = useState<'main' | 'shipper'>('shipper')
  const [history, setHistory] = useState<StatusHistory[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [cbDocs, setCbDocs] = useState<CrossBorderDoc[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [docType, setDocType] = useState('CHECKPOINT_PHOTO')
  const [docFile, setDocFile] = useState<string>('')
  const [docNotes, setDocNotes] = useState('')
  const [docUploading, setDocUploading] = useState(false)
  const [docErr, setDocErr] = useState('')
  const [docSuccess, setDocSuccess] = useState('')
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelErr, setCancelErr] = useState('')
  const [invoiceDling, setInvoiceDling] = useState(false)
  const [hasRated, setHasRated] = useState(false)
  const [ratingStars, setRatingStars] = useState(5)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingBusy, setRatingBusy] = useState(false)
  const [tipAmount, setTipAmount] = useState('')
  const [tipBusy, setTipBusy] = useState(false)
  const [tipMsg, setTipMsg] = useState('')
  const [charges, setCharges] = useState<OrderCharge[]>([])
  const msgBottom = useRef<HTMLDivElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string,string>>({})

  // ─── WS for real-time NEW_MESSAGE events ───────────────────────────────────
  const tabRef = useRef<'info' | 'history' | 'chat' | 'track' | 'docs'>('info')
  const chatChannelRef = useRef<'main' | 'shipper'>('main')
  const [unreadChat, setUnreadChat] = useState(false)
  useEffect(() => { tabRef.current = tab }, [tab])
  useEffect(() => { chatChannelRef.current = chatChannel }, [chatChannel])

  useEffect(() => {
    const terminal = ['DELIVERED', 'CANCELLED', 'COMPLETED', 'FAILED']
    if (terminal.includes(order.status)) return
    const token = localStorage.getItem('auth_token')
    if (!token) return
    const wsBase = (import.meta.env.VITE_API_BASE_URL as string ?? '').replace(/^https/, 'wss').replace(/^http/, 'ws').replace(/\/api$/, '')
    const ws = new WebSocket(`${wsBase}/api/ws/orders/${order.id}?token=${encodeURIComponent(token)}`)
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'NEW_MESSAGE' && msg.message) {
          const msgChannel = msg.message.channel ?? 'main'
          // Shippers only participate in the 'shipper' channel — ignore 'driver' channel messages
          if (msgChannel !== 'shipper') return
          if (tabRef.current === 'chat' && msgChannel === chatChannelRef.current) {
            setMessages(prev => prev.find(m => m.id === msg.message.id) ? prev : [...prev, msg.message])
            setTimeout(() => msgBottom.current?.scrollIntoView({ behavior: 'smooth' }), 80)
          } else {
            setUnreadChat(true)
          }
        }
      } catch { /* ignore malformed */ }
    }
    return () => ws.close()
  }, [order.id]) // eslint-disable-line

  const loadHistory = useCallback(async () => {
    const { data } = await orderApi.getHistory(order.id)
    setHistory(data.history ?? [])
  }, [order.id])

  const loadMessages = useCallback(async () => {
    const { data } = await orderApi.getMessages(order.id, chatChannel)
    setMessages(data.messages ?? [])
    setTimeout(() => msgBottom.current?.scrollIntoView({ behavior:'smooth' }), 100)
  }, [order.id, chatChannel])

  const loadCrossBorderDocs = useCallback(async () => {
    if (!isCrossBorder) return
    setDocsLoading(true)
    try {
      const { data } = await orderApi.getCrossBorderDocs(order.id)
      setCbDocs(data.documents ?? data.docs ?? [])
    } catch {
      setDocErr('Failed to load documents')
    } finally {
      setDocsLoading(false)
    }
  }, [isCrossBorder, order.id])

  useEffect(() => {
    if (tab === 'history') loadHistory()
    if (tab === 'chat') { setUnreadChat(false); loadMessages() }
    if (tab === 'docs') loadCrossBorderDocs()
  }, [tab]) // eslint-disable-line

  useEffect(() => {
    if (tab === 'chat') loadMessages()
  }, [chatChannel]) // eslint-disable-line

  const handleSend = async () => {
    if (!msgText.trim()) return
    setSending(true)
    try {
      await orderApi.sendMessage(order.id, msgText.trim(), chatChannel)
      setMsgText('')
      await loadMessages()
    } catch { /* silent */ }
    finally { setSending(false) }
  }

  const handleDocFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setDocFile(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleUploadCrossBorderDoc = async () => {
    if (!docFile) { setDocErr('Please select a file.'); return }
    setDocErr(''); setDocSuccess(''); setDocUploading(true)
    try {
      await orderApi.uploadCrossBorderDoc(order.id, { document_type: docType, file_base64: docFile, notes: docNotes || undefined })
      setDocSuccess(tr('odm_doc_success'))
      setDocFile(''); setDocNotes('')
      if (docInputRef.current) docInputRef.current.value = ''
      await loadCrossBorderDocs()
    } catch (e: any) {
      setDocErr(e.response?.data?.message ?? 'Upload failed')
    } finally {
      setDocUploading(false)
    }
  }

  const handleCancel = async () => {
    if (!window.confirm(tr('odm_cancel_confirm'))) return
    setCancelErr(''); setCancelling(true)
    try {
      await orderApi.cancelOrder(order.id)
      onCancelled()
      onClose()
    } catch (e: any) { setCancelErr(e.response?.data?.message ?? tr('odm_cancel_fail')) }
    finally { setCancelling(false) }
  }

  const canCancel = order.status === 'PENDING' || order.status === 'ASSIGNED'
  const deliveredOrCompleted = order.status === 'DELIVERED' || order.status === 'COMPLETED'
  const invoiceEndpoint = orderApi.getInvoiceUrl(order.id)

  const loadDeliveryFeedbackState = useCallback(async () => {
    if (!deliveredOrCompleted) return
    try {
      const [{ data: ratedData }, { data: chargesData }] = await Promise.all([
        orderApi.hasRated(order.id),
        orderApi.getCharges(order.id),
      ])
      setHasRated(Boolean(ratedData.has_rated))
      setCharges(chargesData.charges ?? [])
    } catch {
      // Keep details modal usable even if these optional requests fail.
    }
  }, [order.id, deliveredOrCompleted])

  useEffect(() => {
    loadDeliveryFeedbackState()
  }, [loadDeliveryFeedbackState])

  const submitRating = async () => {
    if (hasRated || !deliveredOrCompleted) return
    setRatingBusy(true)
    try {
      await orderApi.rateDriver(order.id, ratingStars, ratingComment.trim() || undefined)
      setHasRated(true)
      setTipMsg('Rating submitted. Thank you!')
    } catch (e: any) {
      setTipMsg(e.response?.data?.message || 'Failed to submit rating')
    } finally {
      setRatingBusy(false)
    }
  }

  const submitTip = async () => {
    const amount = Number(tipAmount)
    if (!amount || amount <= 0) {
      setTipMsg('Enter a valid tip amount')
      return
    }
    if (!deliveredOrCompleted) {
      setTipMsg('Tips are available after delivery')
      return
    }

    setTipBusy(true)
    try {
      await orderApi.addTip(order.id, amount, ratingStars)
      setTipAmount('')
      setTipMsg(`Tip of ${amount.toFixed(2)} ETB added`)
      await loadDeliveryFeedbackState()
    } catch (e: any) {
      setTipMsg(e.response?.data?.message || 'Failed to add tip')
    } finally {
      setTipBusy(false)
    }
  }

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
                <StatusBadge status={order.status}/>
              </div>
              <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', marginTop:'0.15rem' }}>{fmtDate(order.created_at)}</p>
            </div>
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', padding:'0.2rem', display:'flex', alignItems:'center' }}>
              <LuX size={18}/>
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:'0.25rem', background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'0.25rem', marginBottom:'1rem' }}>
            {([...(isCrossBorder ? ['info','history','chat','track','docs'] as const : ['info','history','chat','track'] as const)]).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ flex:1, padding:'0.4rem 0.25rem', border:'none', borderRadius:8, background: tab === t ? 'rgba(0,229,255,0.12)' : 'transparent', color: tab === t ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:700, cursor:'pointer', transition:'all 0.15s', outline: tab === t ? '1px solid rgba(0,229,255,0.2)' : 'none', textTransform:'capitalize', position:'relative' }}>
                {t === 'history' ? tr('odm_tab_timeline') : t === 'chat' ? (
                  <>{unreadChat && tab !== 'chat' && <span style={{ position:'absolute', top:2, right:2, width:7, height:7, borderRadius:'50%', background:'#f87171', boxShadow:'0 0 4px #f87171' }}/>}{tr('odm_tab_chat')}</>
                ) : t === 'track' ? tr('odm_tab_track') : t === 'docs' ? tr('odm_tab_docs') : tr('odm_tab_details')}
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
                  {/* Cargo type row with icon */}
                  <div style={{ display:'flex', gap:'0.5rem' }}>
                    <span style={{ color:'var(--clr-muted)', width:80, flexShrink:0 }}>{tr('odm_cargo_type')}</span>
                    <span style={{ color:'var(--clr-text)', fontWeight:500, display:'flex', alignItems:'center', gap:'0.4rem' }}>
                      {order.cargo_type_icon_url
                        ? <img src={order.cargo_type_icon_url} alt="" style={{ width:16, height:16, borderRadius:3, objectFit:'cover' }}/>
                        : order.cargo_type_icon ? <span style={{ fontSize:'0.85rem', display:'flex', alignItems:'center' }}>{order.cargo_type_icon}</span> : null
                      }
                      {order.cargo_type_name}
                    </span>
                  </div>
                  {[
                    [tr('odm_vehicle'), order.vehicle_type_required],
                    [tr('odm_weight'), order.estimated_weight_kg != null ? `${order.estimated_weight_kg} kg` : '—'],
                    [tr('odm_pickup'), order.pickup_address],
                    [tr('odm_delivery'), order.delivery_address],
                    [tr('odm_price'), `${Number(order.final_price ?? order.estimated_price).toLocaleString()} ETB`],
                    ...(order.description ? [[tr('odm_note'), order.description]] : []),
                    ...(order.estimated_value ? [[tr('odm_cargo_value'), `${Number(order.estimated_value).toLocaleString()} ETB`]] : []),
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

              {/* OTP Reveal — always show (fallback message for old orders without stored OTPs) */}
              {order.status !== 'CANCELLED' && (
                <OtpRevealBox pickupOtp={order.pickup_otp} deliveryOtp={order.delivery_otp}/>
              )}

              {/* Invoice */}
              {deliveredOrCompleted && (
                <button type="button" onClick={handleDownloadInvoice} disabled={invoiceDling}
                  style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.7rem 1rem', borderRadius:10, border:'1px solid rgba(0,229,255,0.2)', background:'rgba(0,229,255,0.05)', color: invoiceDling ? 'var(--clr-muted)' : 'var(--clr-accent)', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor: invoiceDling ? 'wait' : 'pointer', width:'100%', justifyContent:'center' }}>
                  {invoiceDling ? <><Spinner/> {tr('odm_generating')}</> : <><LuFileText size={15}/> {tr('odm_download_inv')}</>}
                </button>
              )}

              {/* Rating + Tip (shipper-controlled) */}
              {deliveredOrCompleted && order.driver_first_name && (
                <div className="glass-inner" style={{ padding:'0.9rem 1rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                  <div>
                    <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', marginBottom:'0.35rem', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:700 }}>
                      {tr('odm_rating_title')}
                    </p>
                    {hasRated ? (
                      <p style={{ fontSize:'0.8rem', color:'#4ade80', fontWeight:700 }}>{tr('odm_already_rated')}</p>
                    ) : (
                      <>
                        <div style={{ display:'flex', gap:'0.35rem', marginBottom:'0.55rem' }}>
                          {[1,2,3,4,5].map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setRatingStars(s)}
                              style={{
                                border:'none', background:'none', padding:0, cursor:'pointer',
                                color: s <= ratingStars ? '#fbbf24' : 'rgba(255,255,255,0.28)'
                              }}
                            >
                              <LuStar size={20} fill={s <= ratingStars ? '#fbbf24' : 'transparent'} />
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={ratingComment}
                          onChange={(e) => setRatingComment(e.target.value)}
                          placeholder={tr('odm_rating_ph')}
                          style={{ width:'100%', minHeight:64, resize:'vertical', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.78rem', padding:'0.55rem 0.65rem', outline:'none' }}
                        />
                        <button
                          type="button"
                          onClick={submitRating}
                          disabled={ratingBusy}
                          style={{ marginTop:'0.5rem', padding:'0.5rem 0.8rem', border:'none', borderRadius:8, background:'rgba(251,191,36,0.16)', color:'#fbbf24', fontWeight:700, cursor: ratingBusy ? 'not-allowed' : 'pointer', fontSize:'0.78rem' }}
                          className="hover-lift"
                        >
                          {ratingBusy ? tr('odm_submitting') : tr('odm_submit_rating')}
                        </button>
                      </>
                    )}
                  </div>

                  <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:'0.7rem' }}>
                    <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', marginBottom:'0.35rem', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:700 }}>
                      {tr('odm_tip_title')}
                    </p>
                    <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', marginBottom:'0.5rem' }}>
                      {[50, 100, 200, 500].map((v) => (
                        <button key={v} type="button" onClick={() => setTipAmount(String(v))}
                          style={{ padding:'0.3rem 0.55rem', borderRadius:7, border:'1px solid rgba(0,229,255,0.18)', background:'rgba(0,229,255,0.06)', color:'var(--clr-accent)', cursor:'pointer', fontSize:'0.72rem', fontWeight:700 }}>
                          {v} ETB
                        </button>
                      ))}
                    </div>
                    <div style={{ display:'flex', gap:'0.45rem', alignItems:'center' }}>
                      <input
                        type="number"
                        min="1"
                        value={tipAmount}
                        onChange={(e) => setTipAmount(e.target.value)}
                        placeholder={tr('odm_tip_ph')}
                        style={{ flex:1, padding:'0.5rem 0.7rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.8rem', outline:'none' }}
                      />
                      <button
                        type="button"
                        onClick={submitTip}
                        disabled={tipBusy}
                        style={{ padding:'0.5rem 0.8rem', border:'none', borderRadius:8, background:'linear-gradient(135deg,#7c3aed,#0ea5e9)', color:'#fff', fontWeight:700, cursor: tipBusy ? 'not-allowed' : 'pointer', fontSize:'0.78rem' }}
                        className="hover-lift"
                      >
                        {tipBusy ? tr('odm_adding') : tr('odm_add_tip')}
                      </button>
                    </div>

                    {tipMsg && <p style={{ marginTop:'0.45rem', fontSize:'0.74rem', color:'var(--clr-muted)' }}>{tipMsg}</p>}

                    {charges.filter(c => c.type === 'TIP').length > 0 && (
                      <div style={{ marginTop:'0.55rem', display:'flex', flexDirection:'column', gap:'0.3rem' }}>
                        {charges.filter(c => c.type === 'TIP').slice(0, 5).map((tip) => (
                          <div key={tip.id} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.75rem', color:'var(--clr-muted)' }}>
                            <span>{tip.description || 'Tip'}</span>
                            <span style={{ color:'var(--clr-neon)', fontWeight:700 }}>+{Number(tip.amount).toFixed(2)} ETB</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Cancel */}
              {canCancel && (
                <div>
                  {cancelErr && <div className="alert alert-error" style={{ marginBottom:'0.5rem' }}><LuTriangleAlert size={13}/> {cancelErr}</div>}
                  <button onClick={handleCancel} disabled={cancelling}
                    style={{ width:'100%', padding:'0.65rem', borderRadius:10, border:'1px solid rgba(248,113,113,0.3)', background:'rgba(248,113,113,0.06)', color:'#f87171', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
                    {cancelling ? <><Spinner/> {tr('odm_cancelling')}</> : <><LuBan size={14}/> {tr('odm_cancel_order')}</>}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Timeline tab ── */}
          {tab === 'history' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'0' }}>
              {history.length === 0 ? (
                <div style={{ textAlign:'center', color:'var(--clr-muted)', padding:'2rem', fontSize:'0.85rem' }}>{tr('odm_no_history')}</div>
              ) : history.map((h, i) => (
                <div key={h.id} style={{ display:'flex', gap:'0.75rem', paddingBottom:'1rem' }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0, width:24 }}>
                    <div style={{ width:12, height:12, borderRadius:'50%', background: STATUS_COLOR[h.status] ?? 'var(--clr-accent)', border:'2px solid rgba(255,255,255,0.15)', flexShrink:0, marginTop:4 }}/>
                    {i < history.length - 1 && <div style={{ flex:1, width:2, background:'rgba(255,255,255,0.07)', marginTop:4 }}/>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap', marginBottom:'0.15rem' }}>
                      <StatusBadge status={h.status}/>
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
              {/* Channel toggle — Driver Chat hidden; only Admin Chat shown */}
              <div style={{ display:'flex', gap:'0.4rem', marginBottom:'0.6rem', flexShrink:0 }}>
                <button style={{ flex:1, padding:'0.35rem 0.5rem', borderRadius:8, border:'none', cursor:'default', fontFamily:'inherit', fontSize:'0.75rem', fontWeight:700,
                  background: 'var(--clr-accent)', color: '#000' }}>
                  🛡️ {tr('odm_admin_chat')}
                </button>
              </div>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'0.6rem', minHeight:200, maxHeight:340, overflowY:'auto', padding:'0.25rem 0' }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign:'center', color:'var(--clr-muted)', padding:'2rem', fontSize:'0.85rem' }}>{tr('odm_no_messages')}</div>
                ) : messages.map(m => {
                  const role = m.sender_role ?? (m.sender_role_id === 1 ? 'Admin' : m.sender_role_id === 2 ? 'Shipper' : 'Driver')
                  const isMe = m.sender_role_id === 2
                  const roleColor = role === 'Admin' ? '#00e5ff' : role === 'Shipper' ? '#f59e0b' : '#a78bfa'
                  const roleBg = role === 'Admin' ? 'rgba(0,229,255,0.12)' : role === 'Shipper' ? 'rgba(245,158,11,0.09)' : 'rgba(167,139,250,0.1)'
                  const roleBorder = role === 'Admin' ? '1px solid rgba(0,229,255,0.2)' : role === 'Shipper' ? '1px solid rgba(245,158,11,0.2)' : '1px solid rgba(167,139,250,0.2)'
                  const displayName = m.sender_name ?? `${m.sender_first_name} ${m.sender_last_name}`.trim()
                  return (
                    <div key={m.id} style={{ display:'flex', flexDirection:'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth:'80%', background: roleBg, border: roleBorder, borderRadius:12, padding:'0.55rem 0.85rem' }}>
                        <p style={{ fontSize:'0.8rem', color:'var(--clr-text)', lineHeight:1.5, wordBreak:'break-word' }}>{m.message}</p>
                      </div>
                      <p style={{ fontSize:'0.65rem', color: roleColor, marginTop:'0.15rem', paddingInline:'0.25rem', fontWeight:600 }}>{displayName} · {role} · {fmtDate(m.created_at)}</p>
                    </div>
                  )
                })}
                <div ref={msgBottom}/>
              </div>
              {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
                <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.75rem', flexShrink:0 }}>
                  <input value={msgText} onChange={e => setMsgText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                    placeholder={tr('odm_send_ph')} style={{ flex:1, padding:'0.6rem 0.85rem', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.85rem', outline:'none' }}/>
                  <button onClick={handleSend} disabled={sending || !msgText.trim()}
                    style={{ padding:'0.6rem 0.85rem', borderRadius:10, border:'none', background:'var(--clr-accent)', color:'#080b14', cursor:'pointer', display:'flex', alignItems:'center', opacity: sending || !msgText.trim() ? 0.5 : 1 }}>
                    {sending ? <Spinner/> : <LuSend size={16}/>}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Docs tab (cross-border) ── */}
          {tab === 'docs' && isCrossBorder && (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div className="glass-inner" style={{ padding:'0.85rem 1rem', fontSize:'0.8rem' }}>
                <p style={{ fontWeight:700, color:'var(--clr-text)', marginBottom:'0.45rem' }}>{tr('odm_border_info')}</p>
                {[
                  [tr('odm_border_ref'), order.border_crossing_ref],
                  [tr('odm_customs_ref'), order.customs_declaration_ref],
                  [tr('odm_hs_code'), order.hs_code],
                  [tr('odm_shipper_tin'), order.shipper_tin],
                ].map(([l, v]) => (
                  <div key={String(l)} style={{ display:'flex', gap:'0.5rem', marginBottom:'0.25rem' }}>
                    <span style={{ color:'var(--clr-muted)', width:95, flexShrink:0 }}>{l}</span>
                    <span style={{ color:'var(--clr-text)', fontWeight:500, wordBreak:'break-all' }}>{v || '—'}</span>
                  </div>
                ))}
              </div>

              <div className="glass-inner" style={{ padding:'0.85rem 1rem' }}>
                <p style={{ fontWeight:700, color:'var(--clr-text)', marginBottom:'0.5rem', fontSize:'0.85rem' }}>{tr('odm_upload_doc')}</p>
                {docErr && <div className="alert alert-error" style={{ marginBottom:'0.6rem', fontSize:'0.78rem' }}><LuTriangleAlert size={12}/> {docErr}</div>}
                {docSuccess && <div className="alert alert-success" style={{ marginBottom:'0.6rem', fontSize:'0.78rem' }}><LuCircleCheck size={12}/> {docSuccess}</div>}
                <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                  <select value={docType} onChange={e => setDocType(e.target.value)}
                    style={{ padding:'0.5rem 0.75rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.8rem', outline:'none' }}>
                    {DOC_TYPE_OPTIONS.map(t => <option key={t.value} value={t.value} style={{ background:'#0f172a' }}>{t.label}</option>)}
                  </select>
                  <input ref={docInputRef} type="file" accept="image/*,application/pdf" onChange={handleDocFileChange}
                    style={{ padding:'0.4rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontSize:'0.78rem' }}/>
                  <input value={docNotes} onChange={e => setDocNotes(e.target.value)} placeholder={tr('odm_notes_ph')}
                    style={{ padding:'0.5rem 0.75rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.8rem', outline:'none' }}/>
                  <button onClick={handleUploadCrossBorderDoc} disabled={docUploading || !docFile}
                    style={{ padding:'0.6rem', borderRadius:10, border:'none', background: docFile ? 'var(--clr-accent)' : 'rgba(255,255,255,0.08)', color: docFile ? '#080b14' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor: docFile ? 'pointer' : 'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
                    {docUploading ? <Spinner/> : <><LuUpload size={14}/> {tr('odm_upload_btn')}</>}
                  </button>
                </div>
              </div>

              <div className="glass-inner" style={{ padding:'0.85rem 1rem' }}>
                <p style={{ fontWeight:700, color:'var(--clr-text)', marginBottom:'0.5rem', fontSize:'0.85rem' }}>{tr('odm_uploaded_docs')}</p>
                {docsLoading ? (
                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.75rem 0', color:'var(--clr-muted)', fontSize:'0.8rem' }}><Spinner/> {tr('ship_loading')}</div>
                ) : cbDocs.length === 0 ? (
                  <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', padding:'0.5rem 0' }}>{tr('odm_no_docs')}</p>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                    {cbDocs.map(doc => {
                      const apiBase = (import.meta.env.VITE_API_BASE_URL as string ?? '').replace(/\/api$/, '')
                      const fileHref = doc.file_url?.startsWith('/') ? `${apiBase}${doc.file_url}` : doc.file_url
                      const statusColor = doc.status === 'APPROVED' ? '#10b981' : doc.status === 'REJECTED' ? '#f87171' : '#f59e0b'
                      const statusBg   = doc.status === 'APPROVED' ? 'rgba(16,185,129,0.12)' : doc.status === 'REJECTED' ? 'rgba(248,113,113,0.12)' : 'rgba(245,158,11,0.12)'
                      const borderColor = doc.status === 'APPROVED' ? 'rgba(16,185,129,0.25)' : doc.status === 'REJECTED' ? 'rgba(248,113,113,0.25)' : 'rgba(245,158,11,0.25)'
                      return (
                        <div key={doc.id} style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${borderColor}`, borderRadius:12, padding:'0.75rem 0.9rem', display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                          {/* Header: doc type + status badge */}
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                            <span style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--clr-text)' }}>
                              {DOC_TYPE_OPTIONS.find(d => d.value === doc.document_type)?.label ?? doc.document_type?.replace(/_/g,' ')}
                            </span>
                            <span style={{ fontSize:'0.7rem', fontWeight:700, color: statusColor, background: statusBg, border:`1px solid ${borderColor}`, borderRadius:99, padding:'0.15rem 0.55rem', letterSpacing:'0.04em', textTransform:'uppercase', whiteSpace:'nowrap' }}>
                              {doc.status === 'PENDING_REVIEW' ? tr('odm_doc_pending') : doc.status === 'APPROVED' ? tr('odm_doc_approved') : tr('odm_doc_rejected')}
                            </span>
                          </div>

                          {/* Upload notes */}
                          {doc.notes && <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)', margin:0, fontStyle:'italic' }}>"{doc.notes}"</p>}

                          {/* Uploader + date */}
                          <div style={{ fontSize:'0.71rem', color:'var(--clr-muted)' }}>
                            By {doc.uploader_first_name ?? 'User'} {doc.uploader_last_name ?? ''} · {fmtDate(doc.created_at)}
                          </div>

                          {/* View link */}
                          <a href={fileHref} target="_blank" rel="noreferrer"
                            style={{ fontSize:'0.74rem', color:'var(--clr-accent)', display:'inline-flex', alignItems:'center', gap:'0.25rem', width:'fit-content' }}>
                            <LuFileText size={12}/> {tr('odm_view_doc')}
                          </a>

                          {/* Review result for APPROVED */}
                          {doc.status === 'APPROVED' && doc.review_notes && (
                            <div style={{ marginTop:'0.2rem', padding:'0.4rem 0.6rem', borderRadius:8, background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', fontSize:'0.73rem', color:'#10b981' }}>
                              <b>{tr('odm_review_note')}</b> {doc.review_notes}
                            </div>
                          )}

                          {/* Review result for REJECTED */}
                          {doc.status === 'REJECTED' && (
                            <div style={{ marginTop:'0.2rem', padding:'0.4rem 0.6rem', borderRadius:8, background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', fontSize:'0.73rem', color:'#f87171' }}>
                              <b>{tr('odm_reject_reason')}</b> {doc.review_notes || tr('odm_no_reason')}
                            </div>
                          )}

                          {/* Approve / Reject controls for PENDING_REVIEW */}
                          {doc.status === 'PENDING_REVIEW' && (() => {
                            const docId = doc.id
                            const note  = reviewNotes[docId] ?? ''
                            const doApprove = async (e: React.MouseEvent) => {
                              e.stopPropagation()
                              setDocErr(''); setDocSuccess('')
                              try {
                                  await orderApi.shipperReviewCrossBorderDoc(order.id, docId, { action: 'APPROVED', review_notes: note })
                                setDocSuccess(tr('odm_approve_ok'))
                                await loadCrossBorderDocs()
                              } catch { setDocErr(tr('odm_approve_fail')) }
                            }
                            const doReject = async (e: React.MouseEvent) => {
                              e.stopPropagation()
                              if (!note.trim()) { setDocErr(tr('odm_reject_req')); return }
                              setDocErr(''); setDocSuccess('')
                              try {
                                await orderApi.shipperReviewCrossBorderDoc(order.id, docId, { action: 'REJECTED', review_notes: note })
                                setDocSuccess('Document rejected.')
                                await loadCrossBorderDocs()
                              } catch { setDocErr(tr('odm_reject_fail')) }
                            }
                            return (
                              <div style={{ marginTop:'0.5rem', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                                <input
                                  placeholder={tr('odm_review_ph')}
                                  value={note}
                                  onChange={e => setReviewNotes(prev => ({ ...prev, [docId]: e.target.value }))}
                                  style={{ width:'100%', boxSizing:'border-box', padding:'0.5rem 0.7rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.8rem', outline:'none' }}
                                />
                                <div style={{ display:'flex', gap:'0.5rem' }}>
                                  <button
                                    type="button"
                                    onClick={doApprove}
                                    style={{ flex:1, padding:'0.55rem 0.5rem', borderRadius:9, border:'none', background:'linear-gradient(135deg,#059669,#10b981)', color:'#fff', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.35rem', boxShadow:'0 2px 8px rgba(16,185,129,0.3)' }}>
                                    <LuCircleCheck size={14}/> {tr('odm_approve')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={doReject}
                                    style={{ flex:1, padding:'0.55rem 0.5rem', borderRadius:9, border:'1px solid rgba(248,113,113,0.5)', background:'rgba(248,113,113,0.08)', color:'#f87171', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.35rem' }}>
                                    <LuBan size={14}/> {tr('odm_reject')}
                                  </button>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
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
  const { t: tr } = useLanguage()
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
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadUnreadCounts = useCallback(() => {
    orderApi.getUnreadCounts().then(r => setUnreadCounts(r.data.counts ?? {})).catch(() => {})
  }, [])

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
    if (pageTab === 'orders') { loadOrders(page, statusFilter); loadUnreadCounts() }
  }, [pageTab, page, statusFilter]) // eslint-disable-line

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const STATUSES = ['', 'PENDING', 'ASSIGNED', 'EN_ROUTE', 'AT_PICKUP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']

  // Filter orders client-side by search
  const visible = search.trim()
    ? orders.filter(o => o.reference_code.toLowerCase().includes(search.toLowerCase()) || o.pickup_address.toLowerCase().includes(search.toLowerCase()) || o.delivery_address.toLowerCase().includes(search.toLowerCase()) || o.cargo_type_name.toLowerCase().includes(search.toLowerCase()))
    : orders

  return (
    <div className="page-shell" style={{ alignItems:'flex-start' }}>
      <div style={{ width:'100%', maxWidth:840, display:'flex', flexDirection:'column', gap:'1.25rem' }}>

        {/* ── Header ── */}
        <div className="glass page-enter" style={{ padding:'1.5rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'0.75rem', flexWrap:'wrap' }}>
            <div>
              <h2 style={{ fontSize:'1.05rem', fontWeight:800, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}>
                <LuPackage size={18}/> {tr('ship_my_shipments')}
              </h2>
              <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', marginTop:'0.15rem' }}>
                {total} {total !== 1 ? tr('ship_total_ordersp') : tr('ship_total_orders')}
              </p>
            </div>
            <div style={{ display:'flex', gap:'0.4rem' }}>
              <button onClick={() => loadOrders(page, statusFilter)} disabled={loading}
                style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.35rem 0.7rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}>
                <LuRefreshCw size={13}/> {tr('ship_refresh')}
              </button>
              <button
                onClick={() => setShowWizard(true)}
                style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.4rem 0.9rem', borderRadius:8, border:'none', background:'var(--clr-accent)', color:'#080b14', fontFamily:'inherit', fontSize:'0.8rem', fontWeight:700, cursor:'pointer' }}>
                <LuPlus size={15}/> {tr('ship_new_order')}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:'0.25rem', background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'0.25rem', marginTop:'1rem' }}>
            {(['orders','place'] as PageTab[]).map(t => (
              <button key={t} onClick={() => { setPageTab(t); if (t === 'place') setShowWizard(true) }} style={{ flex:1, padding:'0.45rem', border:'none', borderRadius:8, background: pageTab === t ? 'rgba(0,229,255,0.12)' : 'transparent', color: pageTab === t ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:700, cursor:'pointer', transition:'all 0.15s', outline: pageTab === t ? '1px solid rgba(0,229,255,0.2)' : 'none' }}>
                {t === 'orders' ? tr('ship_my_orders') : tr('ship_place_new')}
              </button>
            ))}
          </div>
        </div>

        {/* ── Filters ── */}
        {pageTab === 'orders' && (
          <div className="glass" style={{ padding:'0.85rem 1.1rem', display:'flex', gap:'0.65rem', flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ flex:1, minWidth:160, display:'flex', alignItems:'center', gap:'0.5rem', background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'0.45rem 0.75rem' }}>
              <LuSearch size={14} style={{ color:'var(--clr-muted)', flexShrink:0 }}/>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('ship_search_ph')}
                style={{ background:'none', border:'none', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.82rem', outline:'none', width:'100%' }}/>
              {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', padding:0, display:'flex', alignItems:'center' }}><LuX size={13}/></button>}
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              style={{ padding:'0.45rem 0.65rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.8rem', outline:'none' }}>
              {STATUSES.map(s => <option key={s} value={s} style={{ background:'#0f172a' }}>{s || tr('ship_all_statuses')}</option>)}
            </select>
          </div>
        )}

        {/* ── Order list ── */}
        {pageTab === 'orders' && (
          <div style={{ display:'grid', gap:'1rem', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {loading ? (
              <div style={{ display:'flex', justifyContent:'center', padding:'2.5rem', color:'var(--clr-muted)', gap:'0.65rem', alignItems:'center' }}>
                <Spinner/> {tr('ship_loading')}
              </div>
            ) : visible.length === 0 ? (
              <div style={{ textAlign:'center', padding:'3rem 1rem', color:'var(--clr-muted)', fontSize:'0.875rem' }}>
                <LuPackage size={36} style={{ opacity:0.25, display:'block', margin:'0 auto 1rem' }}/>
                {statusFilter || search ? tr('ship_no_match') : tr('ship_no_orders')}
              </div>
            ) : visible.map((order) => (
              <div key={order.id} className="glass-inner" onClick={e => { if ((e.target as HTMLElement).closest('button')) return; setSelectedOrder(order); }} style={{ padding:'0.9rem 1rem', cursor:'pointer', transition:'background 0.15s', display:'flex', flexDirection:'column', justifyContent:'space-between' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'0.5rem', marginBottom:'0.5rem' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                    <span style={{ fontWeight:800, fontSize:'0.88rem', color:'var(--clr-text)' }}>{order.reference_code}</span>
                    <StatusBadge status={order.status}/>
                    {(unreadCounts[order.id] ?? 0) > 0 && (
                      <span style={{ display:'flex', alignItems:'center', gap:'0.25rem', fontSize:'0.68rem', fontWeight:700, color:'#fff', background:'#ef4444', borderRadius:99, padding:'0.12rem 0.45rem', lineHeight:1 }}>
                        <LuMessageSquare size={10}/> {unreadCounts[order.id]}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <span style={{ fontWeight:800, fontSize:'0.88rem', color:'var(--clr-accent)' }}>{(order.final_price ?? order.estimated_price).toLocaleString()} ETB</span>
                    <div style={{ fontSize:'0.68rem', color:'var(--clr-muted)', marginTop:'0.2rem' }}>
                      {fmtDate(order.created_at).split(',')[0]}
                    </div>
                  </div>
                </div>
                
                <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem', marginBottom:'0.75rem' }}>
                  <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                    <LuMapPin size={12}/> {order.pickup_address}
                  </p>
                  <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                    <LuArrowRight size={12}/> {order.delivery_address}
                  </p>
                </div>

                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:'0.5rem' }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.2rem' }}>
                    {order.driver_first_name && <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)', display:'flex', gap:'0.25rem' }}><span style={{color:'var(--clr-text)'}}>{tr('ship_driver_label')}</span> {order.driver_first_name} {order.driver_last_name}</p>}
                    {(order.cargo_type_name || order.vehicle_type_required) && (
                      <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)', display:'flex', gap:'0.4rem', marginTop:'0.2rem', alignItems: 'center' }}>
                        {(order.cargo_type_icon_url || order.cargo_type_icon) && (
                          order.cargo_type_icon_url
                            ? <img src={order.cargo_type_icon_url} alt="" style={{ width:12, height:12, borderRadius:2, objectFit:'cover' }}/>
                            : <span style={{ fontSize:'0.75rem', display:'flex', alignItems:'center', color:'var(--clr-muted)' }}>{order.cargo_type_icon}</span>
                        )}
                        {order.cargo_type_name && <span>{order.cargo_type_name}</span>}
                        {order.cargo_type_name && order.vehicle_type_required && <span>·</span>}
                        {order.vehicle_type_required && <span>{order.vehicle_type_required}</span>}
                        {order.estimated_weight_kg != null && <><span>·</span><span>{order.estimated_weight_kg} kg</span></>}
                      </p>
                    )}
                  </div>
                  
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem', flexShrink:0 }}>
                    <LuChevronRight size={14} style={{ color:'var(--clr-muted)' }}/>
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
                <span style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>{tr('ship_page_of')} {page} {tr('ship_of')} {totalPages}</span>
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
                <LuPackage size={17}/> {tr('ship_place_title')}
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
          onClose={() => { setSelectedOrder(null); loadUnreadCounts() }}
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
