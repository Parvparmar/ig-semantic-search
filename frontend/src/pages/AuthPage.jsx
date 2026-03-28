import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import styles from './AuthPage.module.css'

export default function AuthPage() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('signin')   // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function handle(e) {
    e.preventDefault()
    setError(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password)
        if (error) throw error
        navigate('/')
      } else {
        const { error } = await signUp(email, password)
        if (error) throw error
        setInfo('Check your email to confirm your account, then sign in.')
        setMode('signin')
      }
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.grid} aria-hidden="true" />

      <main className={styles.card}>
        <div className={styles.wordmark}>
          <span className={styles.reel}>Reel</span>
          <span className={styles.search}>Search</span>
        </div>
        <p className={styles.tagline}>Find any reel you've saved — by what it means.</p>

        <form onSubmit={handle} className={styles.form}>
          <label className={styles.label}>
            Email
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoComplete="email" className={styles.input}
              placeholder="you@example.com"
            />
          </label>
          <label className={styles.label}>
            Password
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className={styles.input} placeholder="••••••••"
            />
          </label>

          {error && <p className={styles.error}>{error}</p>}
          {info  && <p className={styles.info}>{info}</p>}

          <button type="submit" disabled={busy} className={styles.btn}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button className={styles.toggle} onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(''); setInfo('') }}>
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </main>
    </div>
  )
}
