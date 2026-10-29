// @vitest-environment node
// Open item 2 (PR #2): pv() reads process.env.NODE_ENV and leaves it for the consuming app's bundler.
// If a consumer's bundler left the expression in place, the browser would throw a ReferenceError, pv's
// try/catch would read "not dev", and the unknown-token throw would be silently off in development.
// Every PIMS app builds with Vite (5, 6 and 8), so this builds and serves a minimal Vite consumer and greps
// the output for process.env.NODE_ENV, the same check as grepping each app's built bundle.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { build, createServer } from 'vite'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repo = resolve(import.meta.dirname, '../..')
const fwd = (p) => p.replace(/\\/g, '/')
let dir

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pims-consumer-'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><script type="module" src="/main.js"></script>')
  writeFileSync(join(dir, 'main.js'),
    `import { pv } from '${fwd(join(repo, 'dist/ap-pims-shared-ui.js'))}'\n` +
    `import { pv as pvSrc } from '${fwd(join(repo, 'src/tokens/pv.js'))}'\n` +
    `document.title = pv('surface', '#fff') + pvSrc('surface', '#fff')\n`)
})
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

const quiet = { logLevel: 'silent', configFile: false }

describe('a Vite consumer replaces process.env.NODE_ENV', () => {
  it('production build: no process.env.NODE_ENV left in the bundle (committed dist and vendored source)', async () => {
    await build({ ...quiet, root: dir, build: { outDir: join(dir, 'out'), minify: false, write: true } })
    const assets = join(dir, 'out', 'assets')
    const js = readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n')
    expect(js).toContain('unknown pims token')
    expect(js).not.toMatch(/process\.env\.NODE_ENV/)
  }, 60000)

  it('dev server: the served module has NODE_ENV replaced, so unknown tokens throw in development', async () => {
    const server = await createServer({
      ...quiet, root: dir, server: { middlewareMode: true, fs: { allow: [repo, dir] } }, appType: 'custom',
      optimizeDeps: { noDiscovery: true, include: [] },
    })
    try {
      for (const file of ['src/tokens/pv.js', 'dist/ap-pims-shared-ui.js']) {
        const out = await server.transformRequest(`/@fs/${fwd(join(repo, file)).replace(/^\//, '')}`)
        expect(out?.code, file).toContain('unknown pims token')
        // Look at isDev's body only (some Vite versions keep the source comment that names the variable).
        // It folds to `return true` or the literal comparison, i.e. dev really is dev.
        const body = out.code.match(/isDev = \(\) => \{[\s\S]*?return ([^;\n]+)/)?.[1]
        expect(body, file).toMatch(/^(true|"development"\s*!==\s*"production")$/)
      }
    } finally {
      await server.close()
    }
  }, 60000)
})
