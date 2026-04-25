import { useState, useEffect } from 'react'
import apiClient from '../lib/apiClient'
import {
  LuFileText, LuDownload, LuEye, LuCalendar, LuTriangleAlert,
} from 'react-icons/lu'

interface Invoice {
  invoice_id: string
  order_id: string
  shipper_id: string
  driver_id: string
  base_fare: number
  distance_charge: number
  weight_charge: number
  city_surcharge: number
  subtotal: number
  commission: number
  shipper_pays: number
  driver_earns: number
  generated_at: string
  pdf_url: string
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)

  const fetchInvoices = async () => {
    try {
      setError('')
      const { data } = await apiClient.get('/profile/invoices')
      setInvoices(data.invoices || [])
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInvoices()
  }, [])

  const handleDownload = async (invoice: Invoice) => {
    setDownloading(true)
    try {
      await apiClient.post(`/profile/invoices/${invoice.invoice_id}/download`)
      // Trigger actual download
      window.open(invoice.pdf_url, '_blank')
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to download invoice')
    } finally {
      setDownloading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-ET', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-block' }} className="spinner" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="glass" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)' }}>
          Invoices
        </h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--clr-muted)', marginTop: '0.5rem' }}>
          View and download your order invoices
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="glass" style={{ padding: '1rem', borderLeft: '3px solid var(--clr-danger)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--clr-danger)' }}>
            <LuTriangleAlert size={18} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Invoice List or Detail View */}
      {selectedInvoice ? (
        // Detail View
        <div className="glass" style={{ padding: '2rem' }}>
          <button
            onClick={() => setSelectedInvoice(null)}
            style={{
              background: 'none', border: 'none', color: 'var(--clr-accent)',
              cursor: 'pointer', fontSize: '0.9rem', marginBottom: '1rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 0', fontWeight: 600, fontFamily: 'inherit'
            }}
            className="hover-opacity"
          >
            ← Back to Invoices
          </button>

          <div style={{
            display: 'grid', gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            marginBottom: '2rem'
          }}>
            {/* Invoice Header */}
            <div style={{ gridColumn: '1 / -1' }}>
              <h4 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.5rem' }}>
                Invoice #{selectedInvoice.invoice_id.slice(0, 8)}
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--clr-muted)' }}>
                {formatDate(selectedInvoice.generated_at)}
              </p>
            </div>

            {/* Fare Breakdown */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.5rem' }}>Base Fare</p>
              <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--clr-text)' }}>
                {formatCurrency(selectedInvoice.base_fare)}
              </p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.5rem' }}>Distance</p>
              <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--clr-accent)' }}>
                {formatCurrency(selectedInvoice.distance_charge)}
              </p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.5rem' }}>Weight</p>
              <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--clr-accent)' }}>
                {formatCurrency(selectedInvoice.weight_charge)}
              </p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.5rem' }}>City Surcharge</p>
              <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--clr-accent)' }}>
                {formatCurrency(selectedInvoice.city_surcharge)}
              </p>
            </div>

            {/* Separator */}
            <div style={{ gridColumn: '1 / -1', height: '1px', background: 'rgba(255,255,255,0.1)' }} />

            {/* Totals */}
            <div style={{ background: 'rgba(97, 148, 31,0.08)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(97, 148, 31,0.2)' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.5rem' }}>Subtotal</p>
              <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--clr-accent)' }}>
                {formatCurrency(selectedInvoice.subtotal)}
              </p>
            </div>

            <div style={{ background: 'rgba(239,68,68,0.08)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.5rem' }}>Commission (15%)</p>
              <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--clr-danger)' }}>
                -{formatCurrency(selectedInvoice.commission)}
              </p>
            </div>

            {/* Final Amounts */}
            <div style={{ gridColumn: '1 / -1', background: 'linear-gradient(135deg,rgba(62,97,19,0.1),rgba(97, 148, 31,0.05))', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(97, 148, 31,0.2)' }}>
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                <div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.5rem' }}>Shipper Pays</p>
                  <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)' }}>
                    {formatCurrency(selectedInvoice.shipper_pays)}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--clr-neon)', marginBottom: '0.5rem' }}>Driver Earns</p>
                  <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-neon)' }}>
                    {formatCurrency(selectedInvoice.driver_earns)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Download Button */}
          <button
            onClick={() => handleDownload(selectedInvoice)}
            disabled={downloading}
            style={{
              width: '100%', padding: '0.9rem', fontSize: '1rem', fontWeight: 700,
              background: 'linear-gradient(135deg,#3e6113,#71ad25)',
              color: '#fff', border: 'none', borderRadius: '10px',
              cursor: downloading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
              transition: 'all 0.3s',
              opacity: downloading ? 0.7 : 1
            }}
            className="hover-lift"
          >
            <LuDownload size={18} />
            {downloading ? 'Downloading...' : 'Download PDF'}
          </button>
        </div>
      ) : (
        // List View
        <div style={{ display: 'grid', gap: '1rem' }}>
          {invoices.length === 0 ? (
            <div className="glass" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
              <LuFileText size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
              <p style={{ color: 'var(--clr-muted)', fontSize: '1rem' }}>No invoices yet</p>
            </div>
          ) : (
            invoices.map((invoice) => (
              <div
                key={invoice.invoice_id}
                className="glass"
                style={{
                  padding: '1.5rem', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', flexWrap: 'wrap', gap: '1rem',
                  transition: 'all 0.2s', border: '1px solid rgba(255,255,255,0.08)'
                }}
                // className="hover-lift"
              >
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.3rem' }}>
                    Invoice #{invoice.invoice_id.slice(0, 8).toUpperCase()}
                  </p>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--clr-muted)' }}>
                      <LuCalendar size={14} />
                      {formatDate(invoice.generated_at)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.3rem' }}>Total</p>
                    <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--clr-text)' }}>
                      {formatCurrency(invoice.subtotal)}
                    </p>
                  </div>

                  <div style={{ width: '1px', height: '40px', background: 'rgba(255,255,255,0.1)' }} />

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setSelectedInvoice(invoice)}
                      style={{
                        padding: '0.6rem 1rem', background: 'rgba(97, 148, 31,0.1)',
                        color: 'var(--clr-accent)', border: '1px solid rgba(97, 148, 31,0.2)',
                        borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem',
                        fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem',
                        transition: 'all 0.2s', fontFamily: 'inherit'
                      }}
                      className="hover-lift"
                    >
                      <LuEye size={14} /> View
                    </button>
                    <button
                      onClick={() => handleDownload(invoice)}
                      disabled={downloading}
                      style={{
                        padding: '0.6rem 1rem', background: 'rgba(62,97,19,0.1)',
                        color: 'var(--clr-accent2)', border: '1px solid rgba(62,97,19,0.2)',
                        borderRadius: '8px', cursor: downloading ? 'not-allowed' : 'pointer',
                        fontSize: '0.85rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        transition: 'all 0.2s', opacity: downloading ? 0.6 : 1, fontFamily: 'inherit'
                      }}
                      className="hover-lift"
                    >
                      <LuDownload size={14} /> {downloading ? 'Dl...' : 'Download'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
