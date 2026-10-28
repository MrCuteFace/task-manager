import { useEffect, useId, useMemo, useRef } from 'react'
import { LOGO_POSE, SPHERE_PURPLES, drawLoaderFrame, drawSphere, sphereSvgBody } from './sphere'

/**
 * The demo mark: the puzzle sphere (see sphere.ts), drawn one twist away from solved, the way a
 * puzzle sits on a desk. The loader winds it up and spins it.
 */
export const BRAND = SPHERE_PURPLES

export function SphereMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  // Each copy gets its own gradient ids: the rail renders one inside a hidden mobile header, and a
  // gradient defined in a hidden SVG stops resolving for every copy that shares its id.
  const id = `sphere${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const body = useMemo(() => sphereSvgBody(LOGO_POSE, 100, id), [id])
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  )
}

/** Sphere plus the Hebrew wordmark. */
export function BrandLogo({ size = 32, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <SphereMark size={size} />
      {wordmark && (
        <span className="stamp leading-none text-brand-wordmark" style={{ fontSize: size * 0.62 }}>
          קבוצת הדגמה
        </span>
      )}
    </span>
  )
}

/**
 * The loading indicator: the sphere winds up, spins hard the other way and settles, drawn on a
 * canvas each frame with motion blur through the fast part. Under reduced motion it draws one
 * still frame and stops.
 */
export function LoadingSphere({ size = 112, label = 'טוען' }: { size?: number; label?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      drawSphere(ctx, { ...LOGO_POSE, twists: [0, 0, 0] }, size)
      return
    }

    let frame = 0
    const start = performance.now()
    let prev = 0
    const tick = (now: number) => {
      const elapsed = now - start
      drawLoaderFrame(ctx, elapsed, prev, size)
      prev = elapsed
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      style={{ width: size, height: size, marginBlock: size * 0.1 }}
    />
  )
}

/** Full-width page loading state: the sphere and a line of text. */
export function PageLoading({ text = 'טוען את הסידור' }: { text?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-5 py-10" aria-busy="true">
      <LoadingSphere />
      <p className="text-sm text-ink-2">{text}</p>
    </div>
  )
}
