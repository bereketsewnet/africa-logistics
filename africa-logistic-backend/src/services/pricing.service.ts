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
  city_surcharge: number
  min_distance_km: number
  max_weight_kg: number | null
  is_active: number
  created_at: string
  updated_at: string
}

export interface QuoteResult {
  distance_km: number
  base_fare: number
  per_km_rate: number
  distance_cost: number
  city_surcharge: number
  estimated_price: number
  vehicle_type: string
  rule_id: number
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

export function calculateQuote(distanceKm: number, rule: PricingRuleRow): QuoteResult {
  const baseFare       = Number(rule.base_fare)
  const perKmRate      = Number(rule.per_km_rate)
  const citySurcharge  = Number(rule.city_surcharge)
  const minDistance    = Number(rule.min_distance_km)
  const usedDistance = Math.max(distanceKm, minDistance)
  const distanceCost  = Math.round(usedDistance * perKmRate * 100) / 100
  const total = Math.round((baseFare + distanceCost + citySurcharge) * 100) / 100
  return {
    distance_km:     Math.round(distanceKm * 1000) / 1000,
    base_fare:       baseFare,
    per_km_rate:     perKmRate,
    distance_cost:   distanceCost,
    city_surcharge:  citySurcharge,
    estimated_price: total,
    vehicle_type:    rule.vehicle_type,
    rule_id:         rule.id,
  }
}
