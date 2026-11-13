#!/usr/bin/env node
/**
 * Supabase-Agent für den Baby Tracker
 *
 *   node scripts/supabase-agent.mjs setup    Projekt anlegen (oder vorhandenes nutzen), Datenbank +
 *                                            Zugriffsregeln einspielen, Anmeldung konfigurieren,
 *                                            .env.local schreiben
 *   node scripts/supabase-agent.mjs verify   Schnittstelle Ende-zu-Ende testen (Testkonten, Familie,
 *                                            Einladung, Einträge, Zugriffsschutz) und aufräumen
 *   node scripts/supabase-agent.mjs github   SUPABASE_URL / SUPABASE_ANON_KEY als GitHub-Variablen setzen
 *                                            und die Veröffentlichung neu starten (braucht `gh`)
 *   node scripts/supabase-agent.mjs all      alles nacheinander
 *
 * Umgebungsvariablen:
 *   SUPABASE_ACCESS_TOKEN   persönlicher Zugriffsschlüssel (supabase.com/dashboard/account/tokens)
 *   SUPABASE_PROJECT_REF    optional: vorhandenes Projekt verwenden
 *   SUPABASE_PROJECT_NAME   optional, Standard "baby-tracker"
 *   SUPABASE_REGION         optional, Standard "eu-central-1" (Frankfurt)
 *   SUPABASE_ORG            optional: Organisation (ID/Slug), sonst die erste
 *   SITE_URL                optional, Standard "https://kbly.github.io/baby-tracker/"
 *   GITHUB_REPO             optional, Standard "kbly/baby-tracker"
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = 'https://api.supabase.com/v1'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const NAME = process.env.SUPABASE_PROJECT_NAME || 'baby-tracker'
const REGION = process.env.SUPABASE_REGION || 'eu-central-1'
const SITE_URL = process.env.SITE_URL || 'https://kbly.github.io/baby-tracker/'
const REPO = process.env.GITHUB_REPO || 'kbly/baby-tracker'
const STATE_FILE = join(ROOT, '.supabase-agent.json') // gitignored: Projekt-Ref + Schlüssel

const log = (...a) => console.log('•', ...a)
const ok = (...a) => console.log('✔', ...a)
const fail = (msg) => { console.error('✘', msg); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')) } catch { return {} }
}
function saveState(s) { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)) }

async function api(method, path, body) {
  if (!TOKEN) fail('SUPABASE_ACCESS_TOKEN fehlt.')
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`)
    err.status = res.status
    throw err
  }
  return data
}

/* ---------------- setup ---------------- */

async function findOrCreateProject() {
  const state = loadState()
  const wanted = process.env.SUPABASE_PROJECT_REF || state.ref
  const projects = await api('GET', '/projects')
  let p = wanted ? projects.find((x) => x.id === wanted || x.ref === wanted) : projects.find((x) => x.name === NAME)
  if (p) {
    ok(`Vorhandenes Projekt: ${p.name} (${p.id ?? p.ref}, ${p.region})`)
    return p.id ?? p.ref
  }
  const orgs = await api('GET', '/organizations')
  if (!orgs.length) fail('Keine Supabase-Organisation gefunden. Bitte zuerst im Dashboard eine anlegen.')
  const org = process.env.SUPABASE_ORG ? orgs.find((o) => o.id === process.env.SUPABASE_ORG || o.slug === process.env.SUPABASE_ORG) : orgs[0]
  if (!org) fail(`Organisation ${process.env.SUPABASE_ORG} nicht gefunden.`)
  log(`Lege Projekt "${NAME}" in ${REGION} an (Organisation ${org.name}) …`)
  const db_pass = randomBytes(24).toString('base64url')
  p = await api('POST', '/projects', { name: NAME, organization_id: org.id, region: REGION, db_pass })
  const ref = p.id ?? p.ref
  ok(`Projekt angelegt: ${ref}`)
  log('Das Datenbank-Passwort wird nicht gespeichert. Falls du es brauchst: Dashboard → Project Settings → Database → Reset password.')
  return ref
}

async function waitHealthy(ref) {
  log('Warte, bis das Projekt bereit ist (kann 1–3 Minuten dauern) …')
  for (let i = 0; i < 90; i++) {
    try {
      const h = await api('GET', `/projects/${ref}/health?services=db&services=auth&services=rest&services=realtime`)
      const bad = h.filter((s) => s.status !== 'ACTIVE_HEALTHY')
      if (!bad.length) { ok('Projekt ist bereit.'); return }
      if (i % 6 === 0) log('Noch nicht bereit:', bad.map((s) => `${s.name}=${s.status}`).join(', '))
    } catch (e) {
      if (i % 6 === 0) log('Status noch nicht abrufbar …', e.status ?? '')
    }
    await sleep(5000)
  }
  fail('Projekt wurde nicht rechtzeitig bereit. Später erneut "setup" ausführen.')
}

async function applySchema(ref) {
  const sql = readFileSync(join(ROOT, 'supabase/schema.sql'), 'utf8')
  log('Spiele Datenbank-Schema ein (Tabellen, Zugriffsregeln, Funktionen, Echtzeit) …')
  await api('POST', `/projects/${ref}/database/query`, { query: sql })
  const check = await api('POST', `/projects/${ref}/database/query`, {
    query: `select
      (select count(*) from information_schema.tables where table_schema='public' and table_name in ('families','family_members','entries'))::int as tables,
      (select count(*) from pg_tables where schemaname='public' and tablename in ('families','family_members','entries') and rowsecurity)::int as rls,
      (select count(*) from pg_proc where proname in ('create_family','join_family','is_member'))::int as functions,
      (select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename in ('entries','families'))::int as realtime`,
  })
  const c = check[0]
  if (c.tables !== 3 || c.rls !== 3 || c.functions !== 3 || c.realtime !== 2) fail(`Schema unvollständig: ${JSON.stringify(c)}`)
  ok(`Schema aktiv: 3 Tabellen mit Zugriffsschutz, 3 Funktionen, Echtzeit für 2 Tabellen.`)
}

async function configureAuth(ref) {
  log('Konfiguriere Anmeldung (E-Mail + Passwort, ohne Bestätigungs-Mail) …')
  await api('PATCH', `/projects/${ref}/config/auth`, {
    site_url: SITE_URL,
    uri_allow_list: [SITE_URL, 'http://localhost:5173/', 'http://localhost:4173/'].join(','),
    mailer_autoconfirm: true,
    external_email_enabled: true,
    password_min_length: 6,
  })
  ok(`Anmeldung konfiguriert (Site-URL ${SITE_URL}).`)
}

async function fetchKeys(ref) {
  const keys = await api('GET', `/projects/${ref}/api-keys?reveal=true`)
  const pick = (pred) => keys.find(pred)?.api_key
  const anon = pick((k) => k.name === 'anon') ?? pick((k) => k.type === 'publishable')
  const service = pick((k) => k.name === 'service_role') ?? pick((k) => k.type === 'secret')
  if (!anon || !service) fail('API-Schlüssel konnten nicht gelesen werden.')
  return { anon, service }
}

async function setup() {
  const ref = await findOrCreateProject()
  saveState({ ...loadState(), ref })
  await waitHealthy(ref)
  await applySchema(ref)
  await configureAuth(ref)
  const { anon, service } = await fetchKeys(ref)
  const url = `https://${ref}.supabase.co`
  saveState({ ref, url, anon, service })
  writeFileSync(join(ROOT, '.env.local'), `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${anon}\n`)
  ok(`.env.local geschrieben (für "npm run dev").`)
  ok(`Fertig. Projekt-URL: ${url}`)
}

/* ---------------- verify ---------------- */

async function verify() {
  const s = loadState()
  if (!s.url) fail('Noch kein Projekt eingerichtet – zuerst "setup" ausführen.')
  const H = (key, token) => ({ apikey: key, Authorization: `Bearer ${token ?? key}`, 'Content-Type': 'application/json' })
  const call = async (method, path, { key = s.anon, token, body, prefer } = {}) => {
    const res = await fetch(s.url + path, {
      method,
      headers: { ...H(key, token), ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let data
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    return { status: res.status, data }
  }
  const expect = (cond, msg, detail) => { if (!cond) throw new Error(`${msg} ${detail ? JSON.stringify(detail) : ''}`); ok(msg) }

  const tag = randomBytes(4).toString('hex')
  const users = []
  let familyId
  try {
    log('Lege 3 Testkonten an …')
    for (const n of ['a', 'b', 'c']) {
      const email = `agent-test-${tag}-${n}@example.com`
      const password = randomBytes(12).toString('base64url')
      const r = await call('POST', '/auth/v1/admin/users', { key: s.service, body: { email, password, email_confirm: true } })
      expect(r.status === 200, `Testkonto ${n.toUpperCase()} angelegt`, r)
      const t = await call('POST', '/auth/v1/token?grant_type=password', { body: { email, password } })
      expect(t.status === 200 && t.data.access_token, `Anmeldung mit E-Mail + Passwort (${n.toUpperCase()})`, t)
      users.push({ id: r.data.id, token: t.data.access_token })
    }
    const [A, B, C] = users

    const f = await call('POST', '/rest/v1/rpc/create_family', { token: A.token, body: {} })
    expect(f.status === 200 && f.data.id && f.data.invite_code, 'A erstellt eine Familie (create_family)', f)
    familyId = f.data.id

    const bad = await call('POST', '/rest/v1/rpc/join_family', { token: C.token, body: { code: 'FALSCH00' } })
    expect(bad.status >= 400, 'Falscher Einladungscode wird abgelehnt')

    const j = await call('POST', '/rest/v1/rpc/join_family', { token: B.token, body: { code: f.data.invite_code.toLowerCase() } })
    expect(j.status === 200 && j.data.id === familyId, 'B tritt mit Einladungscode bei (join_family)', j)

    const entry = { id: `test-${tag}`, family_id: familyId, data: { type: 'sleep', start: Date.now() - 3600e3, end: Date.now(), sleepKind: 'nap' }, deleted: false }
    const ins = await call('POST', '/rest/v1/entries', { token: A.token, body: entry, prefer: 'resolution=merge-duplicates,return=representation' })
    expect(ins.status === 201, 'A speichert einen Eintrag', ins)

    const readB = await call('GET', `/rest/v1/entries?family_id=eq.${familyId}&select=id,data,updated_at`, { token: B.token })
    expect(readB.status === 200 && readB.data.length === 1 && readB.data[0].data.sleepKind === 'nap', 'B sieht den Eintrag von A', readB)

    const upd = await call('POST', '/rest/v1/entries', { token: B.token, body: { ...entry, data: { ...entry.data, note: 'von B' } }, prefer: 'resolution=merge-duplicates,return=representation' })
    expect(upd.status === 201 || upd.status === 200, 'B ändert den Eintrag (Upsert)', upd)
    expect(new Date(upd.data[0].updated_at) >= new Date(readB.data[0].updated_at), 'updated_at wird automatisch gesetzt')

    const prof = await call('PATCH', `/rest/v1/families?id=eq.${familyId}`, { token: B.token, body: { baby: { name: 'Test', birth: '2026-08-01' } }, prefer: 'return=representation' })
    expect(prof.status === 200 && prof.data.length === 1, 'B ändert das Baby-Profil', prof)

    const readC = await call('GET', `/rest/v1/entries?family_id=eq.${familyId}`, { token: C.token })
    expect(readC.status === 200 && readC.data.length === 0, 'C (fremd) sieht keine Einträge der Familie', readC)
    const famC = await call('GET', `/rest/v1/families?id=eq.${familyId}`, { token: C.token })
    expect(famC.status === 200 && famC.data.length === 0, 'C (fremd) sieht die Familie nicht', famC)
    const insC = await call('POST', '/rest/v1/entries', { token: C.token, body: { ...entry, id: `evil-${tag}` } })
    expect(insC.status >= 400, 'C (fremd) kann nichts in die Familie schreiben')
    const anonRead = await call('GET', `/rest/v1/entries?select=id`)
    expect(anonRead.status === 200 ? anonRead.data.length === 0 : anonRead.status >= 400, 'Ohne Anmeldung sind keine Daten lesbar', anonRead)

    console.log('\n✅ Schnittstelle funktioniert: Anmeldung, Familie, Einladung, Abgleich und Zugriffsschutz.')
  } finally {
    log('Räume Testdaten auf …')
    if (familyId) await call('DELETE', `/rest/v1/families?id=eq.${familyId}`, { key: s.service })
    for (const u of users) await call('DELETE', `/auth/v1/admin/users/${u.id}`, { key: s.service })
  }
}

/* ---------------- github ---------------- */

function gh(args, input) {
  const r = spawnSync('gh', args, { input, encoding: 'utf8' })
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') }
}

async function github() {
  const s = loadState()
  if (!s.url) fail('Noch kein Projekt eingerichtet – zuerst "setup" ausführen.')
  for (const [name, value] of [['SUPABASE_URL', s.url], ['SUPABASE_ANON_KEY', s.anon]]) {
    let r = gh(['api', '-X', 'PATCH', `repos/${REPO}/actions/variables/${name}`, '-f', `name=${name}`, '-f', `value=${value}`])
    if (!r.ok) r = gh(['api', '-X', 'POST', `repos/${REPO}/actions/variables`, '-f', `name=${name}`, '-f', `value=${value}`])
    if (!r.ok) fail(`GitHub-Variable ${name} konnte nicht gesetzt werden: ${r.out}`)
    ok(`GitHub-Variable ${name} gesetzt.`)
  }
  const d = gh(['api', '-X', 'POST', `repos/${REPO}/actions/workflows/deploy.yml/dispatches`, '-f', 'ref=main'])
  if (!d.ok) fail(`Veröffentlichung konnte nicht gestartet werden: ${d.out}`)
  ok('Veröffentlichung auf GitHub Pages gestartet (dauert ca. 2 Minuten).')
}

/* ---------------- main ---------------- */

const cmd = process.argv[2]
const run = { setup, verify, github, all: async () => { await setup(); await verify(); await github() } }[cmd]
if (!run) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0])
  process.exit(cmd ? 1 : 0)
}
run().catch((e) => fail(e.message))
