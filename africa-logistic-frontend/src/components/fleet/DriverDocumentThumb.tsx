import { LuFileText } from 'react-icons/lu'
import { absoluteUploadUrl, isPdfDocument } from '../../lib/uploadUrl'

/**
 * Thumbnail for a driver document, shown while picking a driver so the owner
 * can see the ID and licence before committing their vehicle to someone.
 */
export default function DriverDocumentThumb({ label, url }: { label: string; url: string }) {
  const fullUrl = absoluteUploadUrl(url)
  return (
    <a href={fullUrl} target="_blank" rel="noopener noreferrer" style={{ minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
      <div style={{ height: 92, borderRadius: 9, overflow: 'hidden', background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isPdfDocument(url) ? (
          <LuFileText size={28} style={{ color: 'var(--clr-accent)' }} />
        ) : (
          <img src={fullUrl} alt={`${label} document`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>
      <span style={{ display: 'block', marginTop: 5, fontSize: '0.68rem', color: 'var(--clr-muted)', textAlign: 'center' }}>{label} · View</span>
    </a>
  )
}
