// Assembles two deployable docroots from the Vite build:
//   dist/dashboard  → dashboard.bbanetworking.com (app + PHP API)
//   dist/main       → bbanetworking.com (landing only, no API)
// Never copies secrets, the database, sessions, logs or uploads.
import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const app = join(root, 'dist', 'app')
const server = join(root, 'server')
const dash = join(root, 'dist', 'dashboard')
const main = join(root, 'dist', 'main')

for (const d of [dash, main]) {
  rmSync(d, { recursive: true, force: true })
  mkdirSync(d, { recursive: true })
  cpSync(app, d, { recursive: true })
  copyFileSync(join(server, 'assets.htaccess'), join(d, 'assets', '.htaccess'))
}

// Dashboard: htaccess + user.ini + API + avatar folder guard
copyFileSync(join(server, '.htaccess'), join(dash, '.htaccess'))
copyFileSync(join(server, '.user.ini'), join(dash, '.user.ini'))
mkdirSync(join(dash, 'uploads', 'avatars'), { recursive: true })
copyFileSync(join(server, 'uploads', 'avatars', '.htaccess'), join(dash, 'uploads', 'avatars', '.htaccess'))

const EXCLUDE = [
  'api/_private/config.secrets.php',
  'api/_private/data/',
  'api/_private/sessions/',
  'api/_private/logs/',
  'api/_private/cache/',
  'api/_private/uploads/',
]
cpSync(join(server, 'api'), join(dash, 'api'), {
  recursive: true,
  filter: (src) => {
    // Node on Windows may hand us "\\?\F:\..." paths, so normalise and cut at /server/.
    const norm = src.split('\\').join('/')
    const rel = norm.slice(norm.lastIndexOf('/server/') + '/server/'.length)
    return !EXCLUDE.some((e) => rel === e.replace(/\/$/, '') || rel.startsWith(e))
  },
})

// Main domain: landing-only htaccess
copyFileSync(join(server, 'main-site', '.htaccess'), join(main, '.htaccess'))

const count = (d) => readdirSync(d).reduce((n, f) => n + (statSync(join(d, f)).isDirectory() ? count(join(d, f)) : 1), 0)
if (existsSync(join(dash, 'api', '_private', 'config.secrets.php'))) throw new Error('secrets leaked into build')
console.log(`postbuild: dist/dashboard (${count(dash)} files), dist/main (${count(main)} files)`)
