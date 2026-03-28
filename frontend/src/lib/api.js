import { supabase } from './supabase'

const BASE = import.meta.env.VITE_API_URL || '/api'

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  }
}

export async function ingestReels(urls) {
  const res = await fetch(`${BASE}/ingest`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ urls }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function searchReels(query, top_k = 5) {
  const res = await fetch(`${BASE}/search`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ query, top_k }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function listReels() {
  const res = await fetch(`${BASE}/reels`, { headers: await authHeaders() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteReel(id) {
  const res = await fetch(`${BASE}/reels/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
