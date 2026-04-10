/**
 * Invoice Service (src/services/invoice.service.ts)
 *
 * Generates professional PDF invoices using PDFKit.
 * Triggered when an order reaches DELIVERED status.
 * Saved to uploads/invoices/{reference_code}.pdf
 */

import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { Pool } from 'mysql2/promise'
import { getOrderById, setOrderInvoiceUrl } from './order.service.js'

const INVOICES_DIR = path.join(process.cwd(), 'uploads', 'invoices')

// Ensure invoices directory exists at module load
if (!fs.existsSync(INVOICES_DIR)) fs.mkdirSync(INVOICES_DIR, { recursive: true })

// ─── Helpers ──────────────────────────────────────────────────────────────────

const s = (v: unknown): string =>
  (v === null || v === undefined || v === '') ? '—' : String(v)

const n = (v: unknown, decimals = 2): string => {
  const num = Number(v)
  return isNaN(num) ? '—' : num.toFixed(decimals)
}

const fmtDate = (v: unknown): string => {
  if (!v) return '—'
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })
}

const fmtMoney = (v: unknown): string => {
  const num = Number(v)
  return isNaN(num) ? '—' : `ETB ${num.toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── PDF Generation ───────────────────────────────────────────────────────────


export async function generateInvoice(db: Pool, orderId: string): Promise<string | null> {
  const order = await getOrderById(db, orderId)
  if (!order) return null

  // If invoice already exists, return existing URL
  if (order.invoice_url) return order.invoice_url

  const filename = `${order.reference_code}.pdf`
  const filePath = path.join(INVOICES_DIR, filename)
  const invoiceUrl = `/uploads/invoices/${filename}`

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const stream = fs.createWriteStream(filePath)
    doc.pipe(stream)

    // ── Colors & fonts ──
    const accentColor  = '#00b4d8'
    const darkColor    = '#0d1b2a'
    const mutedColor   = '#64748b'
    const dividerColor = '#e2e8f0'

    // ─── Header ──────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 110).fill(darkColor)

    doc.fontSize(26).font('Helvetica-Bold').fillColor('#ffffff')
       .text('AFRICA LOGISTICS', 50, 30)

    doc.fontSize(10).font('Helvetica').fillColor(accentColor)
       .text('Professional Freight & Logistics Platform', 50, 62)

    doc.fontSize(9).fillColor('rgba(255,255,255,0.6)')
       .text('Addis Ababa, Ethiopia', 50, 78)

    // Invoice badge (right side)
    doc.rect(doc.page.width - 190, 20, 140, 70).fill(accentColor)
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#fff')
       .text('INVOICE', doc.page.width - 183, 34, { width: 126, align: 'center' })
    doc.fontSize(9).font('Helvetica').fillColor('#fff')
       .text(order.reference_code, doc.page.width - 183, 56, { width: 126, align: 'center' })
    doc.fontSize(8).fillColor('rgba(255,255,255,0.8)')
       .text(new Date(order.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }),
             doc.page.width - 183, 72, { width: 126, align: 'center' })

    // ─── Billing Info Section ─────────────────────────────────────────────────
    let y = 135

    doc.fontSize(8).font('Helvetica-Bold').fillColor(mutedColor)
       .text('BILL TO', 50, y)
    doc.fontSize(11).font('Helvetica-Bold').fillColor(darkColor)
       .text(`${order.shipper_first_name ?? ''} ${order.shipper_last_name ?? ''}`.trim(), 50, y + 14)
    doc.fontSize(9).font('Helvetica').fillColor(mutedColor)
       .text(order.shipper_phone ?? '', 50, y + 28)

    // Status chip
    const statusColor = order.status === 'DELIVERED' || order.status === 'COMPLETED'
      ? '#16a34a'
      : order.status === 'CANCELLED' || order.status === 'FAILED'
        ? '#dc2626' : '#d97706'
    doc.rect(doc.page.width - 160, y, 110, 22).fill(statusColor)
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff')
       .text(order.status, doc.page.width - 160, y + 6, { width: 110, align: 'center' })

    y += 55
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(0.5).strokeColor(dividerColor).stroke()

    // ─── Route Section ────────────────────────────────────────────────────────
    y += 18
    doc.fontSize(8).font('Helvetica-Bold').fillColor(mutedColor).text('ROUTE DETAILS', 50, y)

    y += 14
    // Pickup
    doc.circle(61, y + 5, 5).fill(accentColor)
    doc.fontSize(9).font('Helvetica-Bold').fillColor(darkColor).text('PICKUP', 75, y)
    doc.fontSize(9).font('Helvetica').fillColor(mutedColor)
       .text(order.pickup_address ?? `${order.pickup_lat}, ${order.pickup_lng}`, 75, y + 12, { width: 380 })

    y += 40
    // Line connecting dots
    doc.moveTo(61, y - 25).lineTo(61, y - 8).lineWidth(1).strokeColor(dividerColor).stroke()

    // Delivery
    doc.circle(61, y + 5, 5).fill('#ef4444')
    doc.fontSize(9).font('Helvetica-Bold').fillColor(darkColor).text('DELIVERY', 75, y)
    doc.fontSize(9).font('Helvetica').fillColor(mutedColor)
       .text(order.delivery_address ?? `${order.delivery_lat}, ${order.delivery_lng}`, 75, y + 12, { width: 380 })

    y += 55
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(0.5).strokeColor(dividerColor).stroke()

    // ─── Cargo Details ────────────────────────────────────────────────────────
    y += 18
    doc.fontSize(8).font('Helvetica-Bold').fillColor(mutedColor).text('CARGO DETAILS', 50, y)

    y += 14
    const detailCols = [
      ['Cargo Type',         order.cargo_type_name ?? 'N/A'],
      ['Vehicle Required',   order.vehicle_type_required ?? 'N/A'],
      ['Est. Weight',        order.estimated_weight_kg ? `${order.estimated_weight_kg} kg` : 'N/A'],
      ['Route Distance',     `${Number(order.distance_km).toFixed(1)} km`],
    ]
    detailCols.forEach(([label, value], i) => {
      const colX = 50 + (i % 2) * 250
      const rowY  = y + Math.floor(i / 2) * 28
      doc.fontSize(8).font('Helvetica').fillColor(mutedColor).text(label, colX, rowY)
      doc.fontSize(10).font('Helvetica-Bold').fillColor(darkColor).text(value, colX, rowY + 11)
    })

    if (order.special_instructions) {
      y += 60
      doc.fontSize(8).font('Helvetica').fillColor(mutedColor).text('Special Instructions:', 50, y)
      doc.fontSize(9).fillColor(darkColor).text(order.special_instructions, 50, y + 12, { width: 500 })
      y += 30
    } else {
      y += 60
    }

    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(0.5).strokeColor(dividerColor).stroke()

    // ─── Pricing Breakdown ────────────────────────────────────────────────────
    y += 18
    doc.fontSize(8).font('Helvetica-Bold').fillColor(mutedColor).text('PRICING BREAKDOWN', 50, y)

    y += 14
    const lineItems = [
      ['Base Fare',       `ETB ${Number(order.base_fare).toFixed(2)}`],
      ['Distance Charge', `ETB ${(Number(order.distance_km) * Number(order.per_km_rate)).toFixed(2)}`],
      ['City Surcharge',  `ETB ${Number(order.city_surcharge).toFixed(2)}`],
    ]

    lineItems.forEach(([label, value]) => {
      doc.fontSize(9).font('Helvetica').fillColor(darkColor).text(label, 50, y)
      doc.text(value, 0, y, { align: 'right', width: doc.page.width - 100 })
      y += 18
    })

    // Total
    y += 4
    doc.rect(50, y, doc.page.width - 100, 32).fill(darkColor)
    const totalAmount = order.final_price ?? order.estimated_price
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#fff')
       .text('TOTAL AMOUNT', 65, y + 10)
    doc.fontSize(12).fillColor(accentColor)
       .text(`ETB ${Number(totalAmount).toFixed(2)}`, 0, y + 10, { align: 'right', width: doc.page.width - 65 })

    y += 52
    // Payment status
    const psColor = order.payment_status === 'SETTLED' ? '#16a34a' : order.payment_status === 'ESCROWED' ? '#d97706' : '#dc2626'
    doc.fontSize(8).font('Helvetica').fillColor(mutedColor).text('Payment Status: ', 50, y, { continued: true })
    doc.fillColor(psColor).font('Helvetica-Bold').text(order.payment_status)

    // ─── Driver Info (if assigned) ─────────────────────────────────────────────
    if (order.driver_first_name) {
      y += 24
      doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(0.5).strokeColor(dividerColor).stroke()
      y += 14
      doc.fontSize(8).font('Helvetica-Bold').fillColor(mutedColor).text('DRIVER ASSIGNED', 50, y)
      y += 14
      doc.fontSize(9).font('Helvetica').fillColor(darkColor)
         .text(`${order.driver_first_name} ${order.driver_last_name ?? ''}`.trim(), 50, y)
    }

    // ─── Footer ───────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 60
    doc.moveTo(50, footerY).lineTo(doc.page.width - 50, footerY).lineWidth(0.5).strokeColor(dividerColor).stroke()
    doc.fontSize(8).font('Helvetica').fillColor(mutedColor)
      .text('Africa Logistics Platform · support@africa-logistics.lula.com.et · www.africa-logistics.lula.com.et',
             50, footerY + 10, { align: 'center', width: doc.page.width - 100 })
    doc.fontSize(7).fillColor(dividerColor)
       .text(`Generated on ${new Date().toLocaleString('en-GB')} · Ref: ${order.reference_code}`,
             50, footerY + 25, { align: 'center', width: doc.page.width - 100 })

    doc.end()
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  // Save invoice URL to order record
  await setOrderInvoiceUrl(db, orderId, invoiceUrl)

  return invoiceUrl
}
