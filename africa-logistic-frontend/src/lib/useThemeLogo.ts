import { useEffect, useState } from 'react'
import logoDark from '../assets/logo_dark.png'
import logoLight from '../assets/logo_light.png'

function resolveLogo(): string {
  const t = document.documentElement.getAttribute('data-theme')
  if (t === 'dark') return logoDark
  if (t === 'light') return logoLight
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return logoDark
  }
  return logoLight
}

export function useThemeLogo(): string {
  const [src, setSrc] = useState<string>(() => resolveLogo())

  useEffect(() => {
    const apply = () => setSrc(resolveLogo())
    apply()

    const observer = new MutationObserver(apply)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)

    return () => {
      observer.disconnect()
      mq.removeEventListener('change', apply)
    }
  }, [])

  return src
}

export { logoDark, logoLight }
