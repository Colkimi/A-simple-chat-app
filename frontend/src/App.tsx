import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { io, type Socket } from 'socket.io-client'
import './App.css'

type Message = {
  id: string
  text: string
  time: string
  mine?: boolean
  seen?: boolean
}

type Conversation = {
  id: string
  name: string
  initials: string
  preview: string
  time: string
  unread?: number
  online?: boolean
  color: string
}

type AuthResponse = {
  user: { id: string; firstName: string; lastName: string }
  tokens: { accessToken: string; refreshToken: string }
}

type SignupResponse = {
  id: string
  accessToken: string
  refreshToken: string
  createdAt: string
}

type BackendConversation = {
  id: string
  title: string
  picture?: string
  notSeenCount: number
  lastMessage?: { text: string; createdAt: string }
}

type BackendMessage = {
  id: string
  content: string | null
  seen: boolean
  createdAt: string
  user: { id: string; name: string } | null
}

type MessageEvent = {
  id: string
  content: string
  seen: boolean
  createdAt: string
  conversation: { id: string; name: string; avatar?: string }
  user: { id: string; name: string }
}

type UserResult = {
  id: string
  name: string
  username: string
  avatar?: string
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
const colors = ['coral', 'blue', 'purple', 'green'] as const

const formatTime = (date: string) => new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const initials = (name: string) => name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
const colorFor = (id: string) => colors[Array.from(id).reduce((total, char) => total + char.charCodeAt(0), 0) % colors.length]

function Avatar({ conversation, large = false }: { conversation: Conversation; large?: boolean }) {
  return (
    <span className={`avatar avatar-${conversation.color} ${large ? 'avatar-large' : ''}`}>
      {conversation.initials}
      {conversation.online && <span className="online-dot" />}
    </span>
  )
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('chatly.accessToken'))
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(() => {
    const stored = localStorage.getItem('chatly.user')
    return stored ? JSON.parse(stored) as { id: string; name: string } : null
  })
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string>()
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationsLoading, setConversationsLoading] = useState(true)
  const [newConversationOpen, setNewConversationOpen] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userResults, setUserResults] = useState<UserResult[]>([])
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null)
  const [firstMessage, setFirstMessage] = useState('')
  const socketRef = useRef<Socket | null>(null)
  const activeIdRef = useRef<string | undefined>(undefined)
  const currentUserIdRef = useRef<string | undefined>(undefined)

  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { currentUserIdRef.current = currentUser?.id }, [currentUser?.id])

  const activeConversation = conversations.find(({ id }) => id === activeId)
  const filteredConversations = useMemo(
    () => conversations.filter(({ name, preview }) =>
      `${name} ${preview}`.toLowerCase().includes(search.toLowerCase()),
    ),
    [search],
  )

  useEffect(() => {
    if (!token) return
    const socket = io(`${API_URL}/chat`, { auth: { token: `Bearer ${token}` } })
    socketRef.current = socket
    socket.on('connect_error', () => setError('Unable to connect to chat. Please sign in again.'))
    socket.on('error.client', (message: string) => setError(message))
    socket.on('conversation.message.sent', (event: MessageEvent) => {
      setConversations((current) => current.map((conversation) =>
        conversation.id === event.conversation.id
          ? { ...conversation, preview: event.content, time: formatTime(event.createdAt) }
          : conversation,
      ))
      if (event.conversation.id !== activeIdRef.current) return
      setMessages((current) => current.some((message) => message.id === event.id) ? current : [...current, {
        id: event.id, text: event.content, time: formatTime(event.createdAt),
        mine: event.user.id === currentUserIdRef.current, seen: event.seen,
      }])
    })
    return () => { socket.disconnect(); socketRef.current = null }
  }, [token])

  useEffect(() => {
    if (!token || !socketRef.current) {
      if (!token) setConversationsLoading(false)
      return
    }
    const socket = socketRef.current
    let requestTimeout: ReturnType<typeof setTimeout> | undefined
    const loadConversations = () => {
      setConversationsLoading(true)
      requestTimeout = setTimeout(() => {
        setConversationsLoading(false)
        setError('Conversation loading timed out. Check that the backend is reachable and try again.')
      }, 15000)
      socket.emit('conversation.list', { targetUserId: '', filter: '', page: 1, pageSize: 50 }, (response: { data?: BackendConversation[]; error?: string }) => {
        if (requestTimeout) clearTimeout(requestTimeout)
        setConversationsLoading(false)
        if (response?.error) { setError(response.error); return }
        const next = (response.data ?? []).map((item) => ({
          id: item.id, name: item.title || 'Conversation', initials: initials(item.title || 'C'),
          preview: item.lastMessage?.text ?? 'No messages yet', time: item.lastMessage ? formatTime(item.lastMessage.createdAt) : '',
          unread: item.notSeenCount, online: true, color: colorFor(item.id),
        }))
        setConversations(next)
        setActiveId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id)
      })
    }
    socket.connected ? loadConversations() : socket.once('ready', loadConversations)
    return () => {
      if (requestTimeout) clearTimeout(requestTimeout)
      socket.off('ready', loadConversations)
    }
  }, [token])

  useEffect(() => {
    if (!activeId || !socketRef.current) return
    socketRef.current.emit('conversation.message.list', { conversationId: activeId, page: 1, pageSize: 100 }, (response: { messages?: { list: BackendMessage[] }; error?: string }) => {
      if (response?.error) { setError(response.error); return }
      setMessages((response.messages?.list ?? []).map((message) => ({
        id: message.id, text: message.content ?? 'Message deleted', time: formatTime(message.createdAt),
        mine: message.user?.id === currentUser?.id, seen: message.seen,
      })))
    })
  }, [activeId, currentUser?.id])

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true); setError('')
    try {
      const response = await fetch(`${API_URL}/v1/auth/signin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })
      if (!response.ok) throw new Error('Invalid credentials')
      const data = await response.json() as AuthResponse
      localStorage.setItem('chatly.accessToken', data.tokens.accessToken)
      localStorage.setItem('chatly.refreshToken', data.tokens.refreshToken)
      const user = { id: data.user.id, name: `${data.user.firstName} ${data.user.lastName}` }
      localStorage.setItem('chatly.user', JSON.stringify(user))
      setCurrentUser(user)
      setToken(data.tokens.accessToken)
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Sign in failed')
    } finally { setLoading(false) }
  }

  const signUp = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true); setError('')
    try {
      const response = await fetch(`${API_URL}/v1/auth/signup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier, password, firstName, lastName }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string | string[] } | null
        const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
        throw new Error(message || 'Unable to create account')
      }
      const data = await response.json() as SignupResponse
      localStorage.setItem('chatly.accessToken', data.accessToken)
      localStorage.setItem('chatly.refreshToken', data.refreshToken)
      const user = { id: data.id, name: `${firstName} ${lastName}`.trim() || identifier }
      localStorage.setItem('chatly.user', JSON.stringify(user))
      setCurrentUser(user)
      setToken(data.accessToken)
    } catch (signUpError) {
      setError(signUpError instanceof Error ? signUpError.message : 'Unable to create account')
    } finally { setLoading(false) }
  }

  const switchAuthMode = () => {
    setAuthMode((mode) => mode === 'signin' ? 'signup' : 'signin')
    setError('')
    setPassword('')
  }

  const sendMessage = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || !activeId || !socketRef.current) return
    socketRef.current.emit('conversation.message.send', { conversationId: activeId, text }, (response: BackendMessage & { error?: string }) => {
      if (response?.error) { setError(response.error); return }
      setMessages((current) => [...current, {
        id: response.id, text: response.content ?? text, time: formatTime(response.createdAt),
        mine: true, seen: response.seen,
      }])
    })
    setDraft('')
  }

  const searchUsers = () => {
    if (userSearch.trim().length < 2 || !socketRef.current) return
    socketRef.current.emit('user.search', { filter: userSearch.trim() }, (response: UserResult[] | { error?: string }) => {
      if (!Array.isArray(response)) { setError(response.error || 'Unable to search users'); return }
      setUserResults(response)
    })
  }

  const createConversation = (event: FormEvent) => {
    event.preventDefault()
    if (!selectedUser || !firstMessage.trim() || !socketRef.current) return
    setLoading(true)
    socketRef.current.emit('conversation.create', {
      targetUserId: selectedUser.id,
      content: firstMessage.trim(),
    }, (response: {
      id?: string
      name?: string
      username?: string
      avatar?: string
      createdAt?: string
      chat?: { id: string; content: string; createdAt: string; seen: boolean }
      error?: string
    }) => {
      setLoading(false)
      if (response?.error || !response.id || !response.name || !response.chat) {
        setError(response?.error || 'Unable to create conversation')
        return
      }
      const conversation: Conversation = {
        id: response.id,
        name: response.name,
        initials: initials(response.name),
        preview: response.chat.content,
        time: formatTime(response.chat.createdAt),
        online: true,
        color: colorFor(response.id),
      }
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)])
      setActiveId(conversation.id)
      setMessages([{
        id: response.chat.id,
        text: response.chat.content,
        time: formatTime(response.chat.createdAt),
        mine: true,
        seen: response.chat.seen,
      }])
      setNewConversationOpen(false)
      setUserSearch('')
      setUserResults([])
      setSelectedUser(null)
      setFirstMessage('')
    })
  }

  const newConversationModal = newConversationOpen && <div className="modal-backdrop" onClick={() => setNewConversationOpen(false)}>
    <form className="new-conversation-modal" onSubmit={createConversation} onClick={(event) => event.stopPropagation()}>
      <div className="modal-heading"><div><h2>New conversation</h2><p>Search for someone to message.</p></div><button type="button" className="icon-button" onClick={() => setNewConversationOpen(false)}>×</button></div>
      <label className="search-box">
        <span aria-hidden="true">⌕</span>
        <input autoFocus value={userSearch} onChange={(event) => setUserSearch(event.target.value)} onKeyUp={(event) => { if (event.key === 'Enter') { event.preventDefault(); searchUsers() } }} placeholder="Search by name or username" />
        <button type="button" className="search-submit" onClick={searchUsers}>Search</button>
      </label>
      <div className="user-results">
        {userResults.map((user) => <button type="button" className={`user-result ${selectedUser?.id === user.id ? 'user-result-selected' : ''}`} key={user.id} onClick={() => setSelectedUser(user)}>
          <span className={`avatar avatar-${colorFor(user.id)}`}>{initials(user.name)}</span><span><strong>{user.name}</strong><small>@{user.username}</small></span>
        </button>)}
        {userSearch.length >= 2 && userResults.length === 0 && <p className="modal-empty">No users found.</p>}
      </div>
      {selectedUser && <label className="first-message-label">Message {selectedUser.name}<textarea value={firstMessage} onChange={(event) => setFirstMessage(event.target.value)} placeholder="Write your first message..." required /></label>}
      <button className="new-chat-button" disabled={!selectedUser || !firstMessage.trim() || loading}>{loading ? 'Starting…' : 'Start conversation'}</button>
    </form>
  </div>

  if (!token) return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={authMode === 'signin' ? signIn : signUp}>
        <div className="brand-mark">C</div>
        <h1>{authMode === 'signin' ? 'Welcome to Chatly' : 'Create your account'}</h1>
        <p>{authMode === 'signin' ? 'Sign in to continue to your conversations.' : 'Join Chatly and start a conversation.'}</p>
        {authMode === 'signup' && <div className="auth-name-fields">
          <label>First name<input value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></label>
          <label>Last name<input value={lastName} onChange={(event) => setLastName(event.target.value)} required /></label>
        </div>}
        <label>{authMode === 'signin' ? 'Email or username' : 'Email'}<input type={authMode === 'signup' ? 'email' : 'text'} value={identifier} onChange={(event) => setIdentifier(event.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {authMode === 'signup' && <span className="password-hint">Use at least 5 characters with uppercase, lowercase, number, and symbol.</span>}
        {error && <div className="error-message">{error}</div>}
        <button className="new-chat-button" disabled={loading}>{loading ? (authMode === 'signin' ? 'Signing in…' : 'Creating account…') : (authMode === 'signin' ? 'Sign in' : 'Create account')}</button>
        <p className="auth-switch">
          {authMode === 'signin' ? 'New to Chatly?' : 'Already have an account?'}
          <button type="button" onClick={switchAuthMode}>{authMode === 'signin' ? 'Create an account' : 'Sign in'}</button>
        </p>
      </form>
    </main>
  )

  if (conversationsLoading) return (
    <main className="loading-page">
      <div className="loading-card"><span className="loader" /><strong>Loading your conversations</strong><span>Connecting to Chatly…</span></div>
    </main>
  )

  if (!activeConversation) return (
    <main className="loading-page">
      <div className="loading-card">
        <div className="brand-mark">C</div>
        <strong>{error || 'No conversations yet'}</strong>
        <span>{error ? 'Please check the backend connection and try again.' : 'Start a new conversation to begin chatting.'}</span>
        <button className="new-chat-button empty-state-button" onClick={() => { setNewConversationOpen(true); setError('') }}>Start a conversation</button>
      </div>
      {newConversationModal}
    </main>
  )

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileSidebar ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark">C</div>
          <span className="brand-name">Chatly</span>
          <button className="icon-button close-sidebar" aria-label="Close conversations" onClick={() => setMobileSidebar(false)}>×</button>
        </div>

        <button className="new-chat-button" onClick={() => { setNewConversationOpen(true); setError('') }}>
          <span className="plus">+</span> New conversation
        </button>

        <div className="section-heading">
          <span>Messages</span>
          <span className="message-count">4</span>
        </div>
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" />
          <kbd>⌘ K</kbd>
        </label>

        <nav className="conversation-list" aria-label="Conversations">
          {filteredConversations.map((conversation) => (
            <button
              className={`conversation ${conversation.id === activeId ? 'conversation-active' : ''}`}
              key={conversation.id}
              onClick={() => { setActiveId(conversation.id); setMobileSidebar(false) }}
            >
              <Avatar conversation={conversation} />
              <span className="conversation-copy">
                <span className="conversation-topline">
                  <strong>{conversation.name}</strong>
                  <time>{conversation.time}</time>
                </span>
                <span className="conversation-bottomline">
                  <span>{conversation.preview}</span>
                  {conversation.unread && <b>{conversation.unread}</b>}
                </span>
              </span>
            </button>
          ))}
        </nav>

        <div className="profile-card">
          <div className="avatar avatar-green">{initials(currentUser?.name ?? 'You')}<span className="online-dot" /></div>
          <div><strong>{currentUser?.name ?? 'You'}</strong><span>Available</span></div>
          <button className="icon-button more-button" aria-label="Profile options">•••</button>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <button className="icon-button menu-button" aria-label="Open conversations" onClick={() => setMobileSidebar(true)}>☰</button>
          <Avatar conversation={activeConversation} large />
          <div className="chat-person">
            <h1>{activeConversation.name}</h1>
            <p><span className="status-dot" /> Online now</p>
          </div>
          <div className="header-actions">
            <button className="icon-button" aria-label="Start video call">▣</button>
            <button className="icon-button" aria-label="Start audio call">◌</button>
            <button className="icon-button" aria-label="More options">•••</button>
          </div>
        </header>

        <div className="message-area">
          <div className="day-divider"><span>Today</span></div>
          <div className="messages">
            {messages.map((message) => (
              <div className={`message-row ${message.mine ? 'message-mine' : ''}`} key={message.id}>
                {!message.mine && <Avatar conversation={activeConversation} />}
                <div className="message-content">
                  <div className="bubble">{message.text}</div>
                  <time>{message.time}{message.mine && ' · Read'}</time>
                </div>
              </div>
            ))}
          </div>
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <button className="icon-button attachment-button" type="button" aria-label="Add attachment">＋</button>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a message..."
            aria-label="Message"
          />
          <button className="emoji-button" type="button" aria-label="Add emoji">☺</button>
          <button className="send-button" type="submit" aria-label="Send message">↑</button>
        </form>
        <p className="composer-hint">Press <kbd>Enter</kbd> to send</p>
        {error && <p className="chat-error">{error}</p>}
      </section>
      {newConversationModal}
    </main>
  )
}

export default App
