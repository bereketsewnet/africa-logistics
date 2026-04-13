/**
 * Pricing Service (src/services/pricing.service.ts)
 *
 * Handles:
 *  - Haversine distance calculation (no external API needed)
 *  - Optional Mapbox Directions API for road distance (if MAPBOX_TOKEN set)
 *  - Optional Mapbox Geocoding for reverse geocoding
 *  - Quote calculation: Base Fare + (distance × per_km_rate) + city_surcharge
 */

import { Pool, RowDataPacket } from 'mysql2/promise'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PricingRuleRow extends RowDataPacket {
  id: number
  vehicle_type: string
  base_fare: number
  per_km_rate: number
  per_kg_rate: number           // ETB per kg (0 = not charged)
  city_surcharge: number        // sum of additional fees (stored per-order for history)
  additional_fees: string | null // JSON: [{name,value,type:'fixed'|'percent'}]
  min_distance_km: number
  max_weight_kg: number | null
  cross_border_multiplier: number   // multiplier applied to cross-border orders (default 1.00)
  is_active: number
  created_at: string
  updated_at: string
}

export interface FeeBreakdown {
  name: string
  amount: number
  type: 'fixed' | 'percent'
  rate?: number  // original percent rate, if type === 'percent'
}

export interface QuoteResult {
  distance_km: number
  base_fare: number
  per_km_rate: number
  distance_cost: number
  per_kg_rate: number
  weight_cost: number
  fees_breakdown: FeeBreakdown[]
  city_surcharge: number  // total of all fees (for DB storage backward compat)
  estimated_price: number
  vehicle_type: string
  rule_id: number
  is_cross_border: boolean
  cross_border_multiplier: number
}

// ─── Haversine Formula ────────────────────────────────────────────────────────
// Calculates the great-circle distance between two coordinates in kilometres.

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371 // Earth radius km
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Route Distance (Mapbox optional) ─────────────────────────────────────────

export async function getRouteDistanceKm(
  pickupLat: number, pickupLng: number,
  deliveryLat: number, deliveryLng: number
): Promise<number> {
  const token = process.env.MAPBOX_TOKEN
  if (token) {
    try {
      const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving` +
        `/${pickupLng},${pickupLat};${deliveryLng},${deliveryLat}` +
        `?access_token=${encodeURIComponent(token)}&overview=false`
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data: any = await res.json()
        const metres = data?.routes?.[0]?.distance
        if (typeof metres === 'number' && metres > 0) return metres / 1000
      }
    } catch {
      // fall through to Haversine
    }
  }
  return haversineKm(pickupLat, pickupLng, deliveryLat, deliveryLng)
}

// ─── Reverse Geocoding (Mapbox optional) ──────────────────────────────────────

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const token = process.env.MAPBOX_TOKEN
  if (!token) return null
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places` +
      `/${lng},${lat}.json` +
      `?access_token=${encodeURIComponent(token)}&language=en&limit=1`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const data: any = await res.json()
      return data?.features?.[0]?.place_name ?? null
    }
  } catch { /* ignore */ }
  return null
}

// ─── Get Active Pricing Rule ───────────────────────────────────────────────────

export async function getPricingRule(
  db: Pool,
  vehicleType: string
): Promise<PricingRuleRow | null> {
  const [rows] = await db.query<PricingRuleRow[]>(
    `SELECT * FROM pricing_rules WHERE vehicle_type = ? AND is_active = 1 LIMIT 1`,
    [vehicleType]
  )
  return rows[0] ?? null
}

export async function getDefaultPricingRule(db: Pool): Promise<PricingRuleRow | null> {
  const [rows] = await db.query<PricingRuleRow[]>(
    `SELECT * FROM pricing_rules WHERE is_active = 1 ORDER BY base_fare ASC LIMIT 1`
  )
  return rows[0] ?? null
}

export async function listPricingRules(db: Pool): Promise<PricingRuleRow[]> {
  const [rows] = await db.query<PricingRuleRow[]>(
    `SELECT * FROM pricing_rules ORDER BY vehicle_type ASC`
  )
  return rows
}

// ─── Quote Calculator ─────────────────────────────────────────────────────────

export function calculateQuote(
  distanceKm: number,
  rule: PricingRuleRow,
  weightKg?: number | null,
  isCrossBorder?: boolean
): QuoteResult {
  const baseFare    = Number(rule.base_fare)
  const perKmRate   = Number(rule.per_km_rate)
  const perKgRate   = Number(rule.per_kg_rate ?? 0)
  const minDistance = Number(rule.min_distance_km ?? 0)
  const cbMultiplier = isCrossBorder ? Number(rule.cross_border_multiplier ?? 1) : 1

  const usedDistance = Math.max(distanceKm, minDistance)
  const distanceCost = Math.round(usedDistance * perKmRate * 100) / 100
  const weightCost   = (weightKg && perKgRate > 0) ? Math.round(weightKg * perKgRate * 100) / 100 : 0
  const subtotal     = baseFare + distanceCost + weightCost

  // Compute additional fees from JSON definition
  const feesBreakdown: FeeBreakdown[] = []
  let feesTotal = 0
  try {
    const fees: Array<{ name: string; value: number; type: 'fixed' | 'percent' }> =
      rule.additional_fees ? JSON.parse(rule.additional_fees) : []
    for (const fee of fees) {
      const amount = fee.type === 'percent'
        ? Math.round(subtotal * fee.value / 100 * 100) / 100
        : Math.round(Number(fee.value) * 100) / 100
      feesBreakdown.push({ name: fee.name, amount, type: fee.type, rate: fee.type === 'percent' ? fee.value : undefined })
      feesTotal += amount
    }
  } catch { /* ignore parse errors */ }

  const citySurcharge = Math.round(feesTotal * 100) / 100
  const baseTotal     = Math.round((subtotal + citySurcharge) * 100) / 100
  const total         = Math.round(baseTotal * cbMultiplier * 100) / 100

  return {
    distance_km:    Math.round(distanceKm * 1000) / 1000,
    base_fare:      baseFare,
    per_km_rate:    perKmRate,
    distance_cost:  distanceCost,
    per_kg_rate:    perKgRate,
    weight_cost:    weightCost,
    fees_breakdown: feesBreakdown,
    city_surcharge: citySurcharge,
    estimated_price: total,
    vehicle_type:   rule.vehicle_type,
    rule_id:        rule.id,
    is_cross_border: isCrossBorder ?? false,
    cross_border_multiplier: cbMultiplier,
  }
}
