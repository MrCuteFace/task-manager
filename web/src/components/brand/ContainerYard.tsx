/**
 * A container yard, drawn in the roster's own ink.
 *
 * An orthographic (isometric) stack of containers rendered with three.js, shaded the way a flat
 * mark is shaded - flat faces, no specular, a darker right face and a lighter top - so the login
 * ground reads as the same family as `SphereMark` and `LoadingSphere` rather than as a photograph.
 * A gantry crane works across the yard on a GSAP timeline: lift, travel, set down, return.
 *
 * Palette: paper and rule tones carry the yard; a small, deliberate minority of containers carry a
 * brand band. That is the one place outside the mark where the brand colors appear, and it is
 * rationed on purpose - see DESIGN.md, "The Brand Is Not UI Rule".
 *
 * Static under `prefers-reduced-motion`: the yard still draws, nothing moves.
 */
import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import {
  BoxGeometry,
  Color,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
  type Material,
} from 'three'
import { BRAND } from './Logo'
import { useTheme } from '../../context/theme'

/**
 * Rule and pencil tones rather than paper tones: the yard sits under a wash, so anything as light
 * as the sheet itself disappears into it. On a dark sheet the relationship inverts - the yard has to
 * sit *above* the ground in lightness, not below it - so the dark set is lifted, not darkened.
 */
const YARD_NEUTRALS = {
  light: ['#b6c2d3', '#cfd8e4', '#d8dfe9', '#a7b4c8', '#9aa8bf', '#c3ccda'],
  dark: ['#3a4560', '#455273', '#2f3950', '#515f83', '#394463', '#4a5878'],
}
/** The rationed minority. Roughly one container in six. Brand colors, muted for the dark ground. */
const YARD_BRAND = {
  light: [BRAND.deep, BRAND.mid, BRAND.light, BRAND.pale],
  dark: ['#3a2380', '#5232a8', '#6d55b8', '#8b7bc4'],
}

const INK = { light: '#1e2a44', dark: '#c3cee2' }

/*
  An isometric grid projects as a diamond, which leaves a rectangular frame's corners empty. Bigger
  containers on a wider grid overflow the frame instead, so the yard reads as ground that continues
  past the edges - and bigger boxes survive the wash at the margins, where small ones turned to mush.
*/
const BOX = { length: 3.4, depth: 1.5, height: 1.28 }
const PITCH = { x: 3.72, z: 1.94 }
const COLUMNS = 16
const ROWS = 13

/** Face shading, in the order three.js orders BoxGeometry groups: +x, -x, +y, -y, +z, -z. */
const FACE_SHADE = [0.82, 0.9, 1, 0.72, 0.91, 0.84]

/** A deterministic shuffle so the yard is identical on every load - no layout flicker between runs. */
function rand(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

/**
 * One material set per color, shared by every container of that color - a few hundred boxes drawing
 * from eleven palettes, not a thousand one-off materials.
 */
function materialCache(): { get: (hex: string) => MeshBasicMaterial[]; all: MeshBasicMaterial[] } {
  const cache = new Map<string, MeshBasicMaterial[]>()
  const all: MeshBasicMaterial[] = []
  return {
    get(hex) {
      const hit = cache.get(hex)
      if (hit) return hit
      const set = FACE_SHADE.map((factor) => {
        const color = new Color(hex)
        // Multiply toward black for the shaded faces, the way an isometric drawing darkens its right face.
        color.multiplyScalar(factor)
        return new MeshBasicMaterial({ color, transparent: true })
      })
      cache.set(hex, set)
      all.push(...set)
      return set
    },
    all,
  }
}

export function ContainerYard({ className = '' }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const theme = useTheme((s) => s.resolved)

  // Rebuilt on a theme change: the scene's colors are baked into its materials, not read per frame.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const neutrals = YARD_NEUTRALS[theme]
    const brand = YARD_BRAND[theme]
    const ink = INK[theme]

    // A WebGL context may be unavailable (software rendering off, driver blocklist). The login page
    // must still work, so failure here is silent and leaves the paper ground behind it.
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch {
      return
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, host.clientHeight)
    host.appendChild(renderer.domElement)

    const scene = new Scene()
    const camera = new OrthographicCamera(-10, 10, 10, -10, -200, 400)
    // Isometric angle: looking down the diagonal, slightly flattened.
    camera.position.set(24, 19, 24)
    camera.lookAt(0, 0, 0)

    const yard = new Group()
    scene.add(yard)

    const geometry = new BoxGeometry(BOX.length, BOX.height, BOX.depth)
    const edges = new EdgesGeometry(geometry)
    const edgeMaterial = new LineBasicMaterial({ color: ink, transparent: true, opacity: 0.34 })
    const materials = materialCache()
    const disposables: Material[] = [edgeMaterial]

    const random = rand(207)
    const stacks: Group[] = []

    for (let col = 0; col < COLUMNS; col++) {
      for (let row = 0; row < ROWS; row++) {
        // A yard is uneven: some slots are empty, some stacked three high.
        const height = Math.floor(random() * 3.4)
        if (height === 0) continue

        const stack = new Group()
        stack.position.set((col - (COLUMNS - 1) / 2) * PITCH.x, 0, (row - (ROWS - 1) / 2) * PITCH.z)

        for (let level = 0; level < height; level++) {
          const useBrand = random() < 0.17
          const palette = useBrand ? brand : neutrals
          const hex = palette[Math.floor(random() * palette.length)]

          const box = new Mesh(geometry, materials.get(hex))
          box.position.y = level * BOX.height + BOX.height / 2
          // Containers are set down by hand, not by a grid: a few millimetres of slop reads as real.
          box.position.x = (random() - 0.5) * 0.12
          box.rotation.y = (random() - 0.5) * 0.02

          const outline = new LineSegments(edges, edgeMaterial)
          outline.position.copy(box.position)
          outline.rotation.copy(box.rotation)

          stack.add(box, outline)
        }

        yard.add(stack)
        stacks.push(stack)
      }
    }

    // The gantry: a portal frame in ink, straddling the yard and travelling along it.
    const gantry = new Group()
    const legGeometry = new BoxGeometry(0.16, 7.6, 0.16)
    const beamGeometry = new BoxGeometry(0.2, 0.2, ROWS * PITCH.z + 2.4)
    const gantryMaterial = new MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.55 })
    disposables.push(gantryMaterial)

    const span = (ROWS * PITCH.z + 2.4) / 2
    const legA = new Mesh(legGeometry, gantryMaterial)
    legA.position.set(0, 3.8, span)
    const legB = new Mesh(legGeometry, gantryMaterial)
    legB.position.set(0, 3.8, -span)
    const beam = new Mesh(beamGeometry, gantryMaterial)
    beam.position.set(0, 7.6, 0)
    gantry.add(legA, legB, beam)
    yard.add(gantry)

    const frustum = () => {
      const width = host.clientWidth
      const height = host.clientHeight
      if (width === 0 || height === 0) return
      const aspect = width / height
      // Wide enough that containers still run past the sheets at the edges of the frame.
      const view = aspect < 1 ? 40 : 31
      camera.left = (-view * aspect) / 2
      camera.right = (view * aspect) / 2
      camera.top = view / 2
      camera.bottom = -view / 2
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    frustum()

    const render = () => renderer.render(scene, camera)

    if (reduced) {
      // One frame, settled, and nothing else. No ticker, no timeline.
      yard.rotation.y = 0.04
      render()
      const observer = new ResizeObserver(() => {
        frustum()
        render()
      })
      observer.observe(host)
      return () => {
        observer.disconnect()
        renderer.domElement.remove()
        renderer.dispose()
        geometry.dispose()
        edges.dispose()
        legGeometry.dispose()
        beamGeometry.dispose()
        ;[...disposables, ...materials.all].forEach((m) => m.dispose())
      }
    }

    const context = gsap.context(() => {
      // The yard is written onto the sheet the way rows are: from above, with a stagger.
      gsap.from(
        stacks.map((s) => s.position),
        {
          y: 14,
          duration: 1.1,
          ease: 'power3.out',
          stagger: { each: 0.035, from: 'edges' },
        },
      )
      gsap.from(gantry.position, { y: 16, duration: 1.2, ease: 'power3.out', delay: 0.2 })

      // The whole yard breathes very slightly, so the scene is never completely frozen.
      gsap.to(yard.rotation, {
        y: 0.075,
        duration: 26,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        delay: 0.6,
      })

      // The crane works: travel, lift a box, carry it, set it down, go back for the next one.
      const reach = ((COLUMNS - 1) / 2) * PITCH.x
      const carried = stacks.length > 0 ? stacks[Math.floor(stacks.length / 2)] : null

      const work = gsap.timeline({ repeat: -1, delay: 1.4, repeatDelay: 2.2 })
      work
        .fromTo(
          gantry.position,
          { x: -reach },
          { x: reach, duration: 9, ease: 'power1.inOut' },
        )
        .to(gantry.position, { x: -reach, duration: 9, ease: 'power1.inOut', delay: 1.6 })

      if (carried) {
        const restY = carried.position.y
        gsap
          .timeline({ repeat: -1, delay: 3.2, repeatDelay: 6 })
          .to(carried.position, { y: restY + 1.5, duration: 1.4, ease: 'power2.out' })
          .to(carried.position, { y: restY, duration: 1.1, ease: 'power2.in' }, '+=1.2')
      }
    }, host)

    gsap.ticker.add(render)

    const observer = new ResizeObserver(frustum)
    observer.observe(host)

    const onVisibility = () => {
      // Nothing to animate for a hidden tab; GSAP keeps the timeline position for the return.
      if (document.hidden) gsap.ticker.remove(render)
      else gsap.ticker.add(render)
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      observer.disconnect()
      gsap.ticker.remove(render)
      context.revert()
      renderer.domElement.remove()
      renderer.dispose()
      geometry.dispose()
      edges.dispose()
      legGeometry.dispose()
      beamGeometry.dispose()
      ;[...disposables, ...materials.all].forEach((m) => m.dispose())
    }
  }, [theme])

  return <div ref={hostRef} aria-hidden className={className} />
}
