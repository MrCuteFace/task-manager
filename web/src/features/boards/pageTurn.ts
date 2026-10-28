/**
 * Turns the board sheet like a notebook page when the view switches.
 *
 * A browser can only rotate a snapshot as one rigid plane, and paper is not rigid: the free edge
 * is lifted first and the sheet curls behind it. So the turning page is built from vertical strips,
 * each a clipped clone of the sheet, nested so that every strip hinges on the edge of the one before
 * it. The spine is the sheet's right edge (a Hebrew notebook), strip 0 sits against it, and each strip
 * carries its own rotation relative to its parent - so the angles accumulate along the page and the
 * strips together bow into a curl.
 *
 * Forward lifts the current page off the new one. Back brings the turned page up from beyond the
 * spine and down over the current one - the same turn played in reverse. Under reduced motion it just swaps.
 */

export type TurnDirection = 'forward' | 'back'

const STRIPS = 28
/** How far behind the free edge the spine side starts, as a share of the turn. */
const LAG = 0.4
/**
 * Where the back turn picks the page up: lying beyond the spine, just where its back first shows.
 * Any further and it would spend its first moments invisible, faded out over the rail.
 */
const BACK_START = 0.78
const DURATION = { forward: 680, back: 680 }
const PERSPECTIVE = 1800

const easeInOutSine = (t: number) => (1 - Math.cos(Math.PI * t)) / 2
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

let running: (() => void) | null = null

export function turnPage(sheet: HTMLElement | null, direction: TurnDirection, apply: () => void) {
  running?.()
  if (!sheet || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply()
    return
  }

  const before = snapshot(sheet)
  apply()
  const after = snapshot(sheet)

  // Forward turns the old page away and the real, new sheet is the page underneath. Back turns the
  // new page down onto a still copy of the old one, with the real sheet hidden until it lands.
  const turning = direction === 'forward' ? before : after
  const under = direction === 'forward' ? null : before
  const width = sheet.offsetWidth
  const underHeight = direction === 'forward' ? sheet.offsetHeight : before.height

  // The turn plays on a fixed stage clipped to the viewport, outside the page's layout. In the flow,
  // the strips leaning toward the viewer would count as scrollable overflow - the document grew by
  // ~370px mid-turn - so the scrollbar pumped and the item panel beside the sheet jumped.
  const stage = document.createElement('div')
  stage.className = 'page-turn'
  stage.setAttribute('aria-hidden', 'true')
  stage.inert = true
  Object.assign(stage.style, {
    position: 'fixed',
    inset: '0',
    overflow: 'clip',
    zIndex: '20',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>)

  const sheetRect = sheet.getBoundingClientRect()
  const overlay = document.createElement('div')
  Object.assign(overlay.style, {
    position: 'absolute',
    top: `${sheetRect.top}px`,
    left: `${sheetRect.left}px`,
    width: `${width}px`,
    height: `${Math.max(turning.height, underHeight)}px`,
    perspective: `${PERSPECTIVE}px`,
    perspectiveOrigin: '100% 30%',
  } satisfies Partial<CSSStyleDeclaration>)

  if (under) {
    const still = under.node
    Object.assign(still.style, { position: 'absolute', top: '0', left: '0', width: `${width}px`, margin: '0' })
    overlay.append(still)
  }

  // The page underneath sits in the shadow of the one turning over it.
  const shade = document.createElement('div')
  Object.assign(shade.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: `${width}px`,
    height: `${underHeight}px`,
    borderRadius: getComputedStyle(sheet).borderRadius,
    background: 'rgb(0 0 0)',
    opacity: '0',
  } satisfies Partial<CSSStyleDeclaration>)
  overlay.append(shade)

  const stripWidth = width / STRIPS
  const hinges: HTMLElement[] = []
  const faces: HTMLElement[] = []
  let parent: HTMLElement = overlay
  for (let i = 0; i < STRIPS; i++) {
    const hinge = document.createElement('div')
    Object.assign(hinge.style, {
      position: 'absolute',
      top: '0',
      // Strip 0 sits against the spine; each next strip hangs off its parent's left edge.
      left: i === 0 ? `${width - stripWidth}px` : `${-stripWidth}px`,
      width: `${stripWidth}px`,
      height: `${turning.height}px`,
      transformOrigin: 'right center',
      transformStyle: 'preserve-3d',
    } satisfies Partial<CSSStyleDeclaration>)

    // The clip lives on a leaf, never on the hinge: overflow would flatten the 3D chain.
    const face = document.createElement('div')
    Object.assign(face.style, {
      position: 'absolute',
      top: '0',
      // One pixel of overlap hides the seams between strips while they bend.
      left: '-0.5px',
      width: `${stripWidth + 1}px`,
      height: '100%',
      overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>)
    const copy = i === 0 ? turning.node : (turning.node.cloneNode(true) as HTMLElement)
    Object.assign(copy.style, {
      position: 'absolute',
      top: '0',
      left: `${-(width - (i + 1) * stripWidth) + 0.5}px`,
      width: `${width}px`,
      margin: '0',
    })
    face.append(copy)
    hinge.append(face)
    parent.append(hinge)
    hinges.push(hinge)
    faces.push(face)
    parent = hinge
  }

  if (under) sheet.style.visibility = 'hidden'
  stage.append(overlay)
  document.body.append(stage)

  const render = (p: number) => {
    let previous = 0
    for (let i = 0; i < STRIPS; i++) {
      // s runs from the spine (0) to the free edge (1); the free edge leads, the spine follows.
      const s = i / (STRIPS - 1)
      const local = clamp01((p - LAG * (1 - s)) / (1 - LAG))
      const angle = 180 * easeInOutSine(local)
      hinges[i].style.transform = `rotateY(${angle - previous}deg)`
      previous = angle

      const face = faces[i]
      if (angle <= 90) {
        // Paper turning away from the light darkens toward edge-on.
        face.style.filter = `brightness(${1 - 0.22 * Math.sin((angle * Math.PI) / 180)})`
        face.style.opacity = '1'
      } else {
        // The back of the page: the ink showing through, mirrored, gone before it lies over the rail.
        face.style.filter = 'contrast(0.3)'
        face.style.opacity = String(0.4 * clamp01((140 - angle) / 50))
      }
    }
    shade.style.opacity = String(0.12 * (1 - p))
  }

  const duration = DURATION[direction]
  const start = performance.now()
  let frame = 0
  const finish = () => {
    cancelAnimationFrame(frame)
    stage.remove()
    sheet.style.visibility = ''
    running = null
  }
  const tick = (now: number) => {
    const t = clamp01((now - start) / duration)
    // Both ways the page is picked up gently and set down gently; back is forward played in reverse.
    const eased = easeInOutSine(t)
    render(direction === 'forward' ? eased : BACK_START * (1 - eased))
    if (t < 1) frame = requestAnimationFrame(tick)
    else finish()
  }
  render(direction === 'forward' ? 0 : BACK_START)
  frame = requestAnimationFrame(tick)
  running = finish
}

/** A still, id-free copy of the sheet as it looks right now. */
function snapshot(sheet: HTMLElement) {
  const node = sheet.cloneNode(true) as HTMLElement
  node.removeAttribute('id')
  node.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'))
  return { node, height: sheet.offsetHeight }
}
