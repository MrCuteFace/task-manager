// Regenerates public/favicon.svg from the same geometry as the in-app logo.
// Run with: node scripts/make-favicon.ts
import { writeFileSync } from 'node:fs'
import { LOGO_POSE, sphereSvgBody } from '../src/components/brand/sphere.ts'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${sphereSvgBody(LOGO_POSE, 100)}</svg>\n`
writeFileSync(new URL('../public/favicon.svg', import.meta.url), svg)
console.log(`favicon.svg written (${svg.length} bytes)`)
