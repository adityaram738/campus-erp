import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CalendarDays,
  MapPin,
  Clock,
  Search,
  Plus,
  ArrowUpRight,
  Bookmark,
  Ticket,
  Users,
  ChartNoAxesCombined,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  SlidersHorizontal,
  Sparkles,
  Heart,
  ChevronRight,
  CheckCircle2,
  Trash2,
  Edit3,
  Download,
  Mail,
  ShieldCheck,
  GraduationCap,
  UserRound,
  Settings,
  Camera
} from 'lucide-react';
import './style.css';

const API = '/api';
const categories = ['All', 'Technical', 'Cultural', 'Sports', 'Workshop', 'Networking'];
const palettes = {
  Technical: 'violet',
  Cultural: 'pink',
  Sports: 'green',
  Workshop: 'orange',
  Networking: 'blue'
};
const art = {
  ai: '✳',
  culture: '✺',
  run: '↗',
  design: '◈',
  founders: '✦',
  code: '⌘'
};

const parseDate = d => {
  if (!d) return null;
  const datePart = String(d).slice(0, 10);
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, day] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateInputValue = d => {
  if (!d) return '';
  const value = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
};

const dateFmt = d => {
  const date = parseDate(d);
  return date
    ? date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : 'Date TBA';
};

const initials = s =>
  (s || 'U')
    .split(' ')
    .map(x => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function App() {
  const [token, setToken] = useState(localStorage.token || '');
  const [user, setUser] = useState(JSON.parse(localStorage.user || 'null'));
  const [events, setEvents] = useState([]);
  const [registered, setRegistered] = useState([]);
  const [saved, setSaved] = useState([]);
  const [view, setView] = useState('discover');
  const [category, setCategory] = useState('All');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState('');
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState('');
  const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [overview, setOverview] = useState({ events: [], registrations: 0, upcoming: 0 });
  const [participants, setParticipants] = useState([]);
  const [authMode, setAuthMode] = useState('login');
  const [profileMenu, setProfileMenu] = useState(false);
  const [profileDraft, setProfileDraft] = useState(null);
  const [createdLoginId, setCreatedLoginId] = useState('');

  const headers = token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };

  async function api(url, opts = {}) {
    const r = await fetch(API + url, { ...opts, headers: { ...headers, ...opts.headers } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(data.error || 'Something went wrong');
    return data;
  }

  function notify(s) {
    setToast(s);
    setTimeout(() => setToast(''), 2800);
  }

  async function refresh() {
    try {
      const e = await api('/events');
      setEvents(e);
      if (token) {
        const [r, s] = await Promise.all([api('/me/registrations'), api('/me/saved')]);
        setRegistered(r);
        setSaved(s);
        if (['organizer', 'admin'].includes(user?.role)) {
          setOverview(await api('/organizer/overview'));
        }
      }
    } catch (e) {
      notify(e.message);
    }
  }

  useEffect(() => {
    refresh();
  }, [token]);

  const filtered = useMemo(
    () =>
      events.filter(
        e =>
          (category === 'All' || e.category === category) &&
          `${e.title} ${e.description} ${e.venue}`.toLowerCase().includes(q.toLowerCase())
      ),
    [events, category, q]
  );

  const upcoming = events.filter(e => e.date >= new Date().toISOString().slice(0, 10));
  const mine = overview.events || [];

  function signout() {
    localStorage.clear();
    setToken('');
    setUser(null);
    setView('discover');
    setProfileMenu(false);
    notify('Signed out successfully');
  }

  async function openProfile() {
    setProfileMenu(false);
    try {
      const p = await api('/me/profile');
      setProfileDraft(p);
      setModal('profile');
    } catch (e) {
      notify(e.message);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const payload = {
      name: f.get('name'),
      email: f.get('email'),
      phone: f.get('phone'),
      department: f.get('department'),
      usn: f.get('usn'),
      profile_image: profileDraft?.profile_image || ''
    };
    try {
      const updated = await api('/me/profile', { method: 'PUT', body: JSON.stringify(payload) });
      setUser(updated);
      localStorage.user = JSON.stringify(updated);
      setProfileDraft(updated);
      setModal('');
      notify('Profile updated successfully');
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  function handleProfilePhoto(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Please choose an image file.');
      return;
    }
    if (file.size > 1024 * 1024) {
      notify('Choose an image smaller than 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProfileDraft(p => ({ ...p, profile_image: reader.result }));
    reader.readAsDataURL(file);
  }

  async function authSubmit(e) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const data = await api('/auth/' + (authMode === 'login' ? 'login' : 'register'), {
        method: 'POST',
        body: JSON.stringify(authMode === 'login'
          ? { email: f.get('email'), password: f.get('password') }
          : { name: f.get('name'), password: f.get('password'), role: f.get('role') || 'student' })
      });
      setToken(data.token);
      setUser(data.user);
      localStorage.token = data.token;
      localStorage.user = JSON.stringify(data.user);
      if (authMode === 'register') {
        setCreatedLoginId(data.generatedLoginId || data.user.email);
        setModal('created');
      } else {
        setModal('');
        notify(`Welcome ${data.user.name.split(' ')[0]}!`);
      }
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function register(e) {
    if (!token) {
      setModal('auth');
      return;
    }
    try {
      await api(`/events/${e.id}/register`, { method: 'POST' });
      notify('You’re on the list! Registration confirmed.');
      refresh();
    } catch (x) {
      notify(x.message);
    }
  }

  async function save(e) {
    if (!token) {
      setModal('auth');
      return;
    }
    try {
      const yes = saved.some(x => x.id === e.id);
      await api(`/events/${e.id}/save`, { method: yes ? 'DELETE' : 'POST' });
      notify(yes ? 'Removed from saved events' : 'Added to your saved events');
      refresh();
    } catch (x) {
      notify(x.message);
    }
  }

  function openCreate(e = null) {
    setSelected(e);
    setModal('event');
  }

  async function saveEvent(ev) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const payload = Object.fromEntries(f.entries());
    payload.capacity = Number(payload.capacity);
    payload.price = Number(payload.price || 0);
    try {
      await api(selected ? `/events/${selected.id}` : '/events', {
        method: selected ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      setModal('');
      notify(selected ? 'Event updated' : 'Your event is live!');
      refresh();
    } catch (e) {
      notify(e.message);
    }
  }

  async function deleteEvent(e) {
    if (!confirm(`Delete “${e.title}”? This also removes registrations.`)) return;
    try {
      await api(`/events/${e.id}`, { method: 'DELETE' });
      notify('Event deleted');
      refresh();
    } catch (x) {
      notify(x.message);
    }
  }

  async function showParticipants(e) {
    try {
      setSelected(e);
      setParticipants(await api(`/events/${e.id}/participants`));
      setModal('participants');
    } catch (x) {
      notify(x.message);
    }
  }

  const isRegistered = e => registered.some(r => r.id === e.id);
  const isSaved = e => saved.some(r => r.id === e.id);

  return (
    <div className="app">
      <aside className={`sidebar ${mobile ? 'show' : ''}`}>
        <div className="brand">
          <div className="brandmark">
            <Sparkles size={19} />
          </div>
          <span>
            Campus ERP<span className="branddot">.</span>
          </span>
          <button className="mobile-close" onClick={() => setMobile(false)}>
            <X />
          </button>
        </div>
        <div className="workspace">
          <div className="campus-avatar">B</div>
          <div>
            <b>My University University</b>
            <small>Campus Management System</small>
          </div>
          <ChevronRight size={15} />
        </div>
        <div className="navlabel">WORKSPACE</div>
        <nav>
          <button
            className={view === 'discover' ? 'active' : ''}
            onClick={() => {
              setView('discover');
              setMobile(false);
            }}
          >
            <Search />Discover events
          </button>
          {user && (
            <>
              <button
                className={view === 'my-events' ? 'active' : ''}
                onClick={() => {
                  setView('my-events');
                  setMobile(false);
                }}
              >
                <Ticket />My registrations <span className="navcount">{registered.length}</span>
              </button>
              <button
                className={view === 'saved' ? 'active' : ''}
                onClick={() => {
                  setView('saved');
                  setMobile(false);
                }}
              >
                <Bookmark />Saved events
              </button>
            </>
          )}
          {['organizer', 'admin'].includes(user?.role) && (
            <>
              <div className="navlabel space">MANAGEMENT</div>
              <button
                className={view === 'manage' ? 'active' : ''}
                onClick={() => {
                  setView('manage');
                  setMobile(false);
                }}
              >
                <LayoutDashboard />Organizer studio
              </button>
              <button
                className={view === 'analytics' ? 'active' : ''}
                onClick={() => {
                  setView('analytics');
                  setMobile(false);
                }}
              >
                <ChartNoAxesCombined />Insights
              </button>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">
              <GraduationCap size={18} />
            </div>
            <b>Make campus count.</b>
            <p>Discover something new, meet your people and make memories.</p>
            <button onClick={() => setView('discover')}>
              Explore events <ArrowUpRight size={14} />
            </button>
          </div>
          {user ? (
            <div className="profile">
              {user.profile_image ? (
                <img className="avatar profile-photo" src={user.profile_image} alt="Profile" />
              ) : (
                <div className="avatar">{initials(user.name)}</div>
              )}
              <div className="profile-info">
                <b>{user.name}</b>
                <small>{user.role}</small>
              </div>
              <button title="Sign out" onClick={signout}>
                <LogOut size={17} />
              </button>
            </div>
          ) : (
            <button className="signin-side" onClick={() => setModal('auth')}>
              Sign in / Create account <ArrowUpRight size={15} />
            </button>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setMobile(true)}>
            <Menu />
          </button>
          <div className="crumb">
            Campus <span>/</span>{' '}
            <b>
              {view === 'discover'
                ? 'Discover'
                : view === 'my-events'
                ? 'My registrations'
                : view === 'saved'
                ? 'Saved events'
                : view === 'manage'
                ? 'Organizer studio'
                : 'Insights'}
            </b>
          </div>
          <div className="top-actions">
            <span className="live">
              <i /> CAMPUS LIVE
            </span>
            {user ? (
              <div className="profile-menu-wrap">
                <button
                  className="top-avatar profile-trigger"
                  title="Open profile menu"
                  aria-label="Open profile menu"
                  onClick={() => setProfileMenu(v => !v)}
                >
                  {user.profile_image ? (
                    <img src={user.profile_image} alt="" />
                  ) : (
                    initials(user.name)
                  )}
                </button>
                {profileMenu && (
                  <>
                    <button
                      className="menu-dismiss"
                      aria-label="Close profile menu"
                      onClick={() => setProfileMenu(false)}
                    ></button>
                    <div className="profile-dropdown">
                      <div className="dropdown-user">
                        {user.profile_image ? (
                          <img src={user.profile_image} alt="" />
                        ) : (
                          <span>{initials(user.name)}</span>
                        )}
                        <div>
                          <b>{user.name}</b>
                          <small>{user.email}</small>
                        </div>
                      </div>
                      <button onClick={openProfile}>
                        <UserRound size={16} /> My Profile
                      </button>
                      <button onClick={openProfile}>
                        <Settings size={16} /> Account Settings
                      </button>
                      <button className="dropdown-logout" onClick={signout}>
                        <LogOut size={16} /> Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button className="top-signin" onClick={() => setModal('auth')}>
                Sign in <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </header>

        {view === 'discover' && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span /> YOUR CAMPUS, IN MOTION
                </div>
                <h1>
                  Find your next<br />
                  <em>big moment.</em>
                </h1>
                <p>
                  From late-night hackathons to front-row performances — the best of campus is
                  happening here.
                </p>
                <button
                  className="hero-cta"
                  onClick={() =>
                    document.getElementById('event-explorer')?.scrollIntoView({ behavior: 'smooth' })
                  }
                >
                  Explore events <ArrowUpRight size={16} />
                </button>
                <div className="hero-proof">
                  <div className="faces">
                    <span>AM</span>
                    <span>SK</span>
                    <span>RJ</span>
                    <span>+</span>
                  </div>
                  <small>
                    <b>{events.length * 24 + 180}+</b> students finding their people
                  </small>
                </div>
              </div>
              <div className="hero-art">
                <div className="orbit orbit1" />
                <div className="orbit orbit2" />
                <div className="hero-sticker sticker-top">
                  <Sparkles size={16} /> GOOD THINGS HAPPEN HERE
                </div>
                <div className="hero-sun">✳</div>
                <div className="hero-card card-float">
                  <span className="mini-label">UP NEXT · THIS WEEK</span>
                  <div className="float-icon">⌘</div>
                  <b>Build with AI</b>
                  <small>
                    <CalendarDays size={12} />{' '}
                    {upcoming[0] ? dateFmt(upcoming[0].date) : 'Coming soon'}
                  </small>
                  <div className="float-avatars">
                    <i />
                    <i />
                    <i />
                    <span>+84</span>
                  </div>
                </div>
                <div className="hero-sticker sticker-bottom">✦ &nbsp; MAKE IT MEMORABLE</div>
              </div>
              <div className="hero-index">
                01 <span>—</span> 04
              </div>
            </section>

            <section className="stats-strip">
              <div>
                <b>{events.length + 18}</b>
                <span>EVENTS THIS MONTH</span>
              </div>
              <div>
                <b>12</b>
                <span>ACTIVE COMMUNITIES</span>
              </div>
              <div>
                <b>2.4k</b>
                <span>STUDENTS CONNECTED</span>
              </div>
              <div className="strip-note">
                <span>✳</span> YOUR CAMPUS IS FULL OF POSSIBILITIES
              </div>
            </section>

            <section className="explorer" id="event-explorer">
              <div className="section-head">
                <div>
                  <div className="eyebrow dark">
                    <span /> THE CAMPUS CALENDAR
                  </div>
                  <h2>
                    Something for <em>everyone.</em>
                  </h2>
                  <p>Find your crowd. Learn a skill. Make a memory.</p>
                </div>
                <div className="event-total">
                  <b>{filtered.length.toString().padStart(2, '0')}</b>
                  <span>EVENTS FOUND</span>
                </div>
              </div>
              <div className="filters">
                <div className="searchbox">
                  <Search size={18} />
                  <input
                    placeholder="Search events, venues, keywords..."
                    value={q}
                    onChange={e => setQ(e.target.value)}
                  />
                  <kbd>⌘ K</kbd>
                </div>
                <div className="category-row">
                  {categories.map(c => (
                    <button
                      key={c}
                      className={category === c ? 'chosen' : ''}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="event-grid">
                {filtered.map((e, i) => (
                  <EventCard
                    key={e.id}
                    e={e}
                    i={i}
                    registered={isRegistered(e)}
                    saved={isSaved(e)}
                    onOpen={() => {
                      setSelected(e);
                      setModal('detail');
                    }}
                    onSave={() => save(e)}
                    onRegister={() => register(e)}
                  />
                ))}
              </div>
              {!filtered.length && (
                <div className="empty">
                  <div>✳</div>
                  <h3>No events found</h3>
                  <p>Try a different search or category.</p>
                  <button
                    onClick={() => {
                      setQ('');
                      setCategory('All');
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </section>

            <section className="bottom-cta">
              <div>
                <div className="eyebrow">
                  <span /> HAVE SOMETHING TO SHARE?
                </div>
                <h2>
                  Your event deserves<br />a <em>bigger stage.</em>
                </h2>
                <p>Bring your community together. Create an event and let the campus show up.</p>
              </div>
              <button
                onClick={() =>
                  user && ['organizer', 'admin'].includes(user.role)
                    ? openCreate()
                    : setModal('auth')
                }
              >
                Host an event <ArrowUpRight />
              </button>
              <div className="cta-spark">✳</div>
            </section>
          </>
        )}

        {view === 'my-events' && (
          <section className="page-section">
            <PageTitle
              eyebrow="YOUR CAMPUS PLANS"
              title="My registrations."
              subtitle="All the moments you’ve signed up for, in one place."
            />
            <div className="event-grid">
              {registered.map((e, i) => (
                <EventCard
                  key={e.id}
                  e={e}
                  i={i}
                  registered
                  saved={isSaved(e)}
                  onOpen={() => {
                    setSelected(e);
                    setModal('detail');
                  }}
                  onSave={() => save(e)}
                  onRegister={() => register(e)}
                />
              ))}
            </div>
            {!registered.length && (
              <Empty
                title="Your next memory starts here."
                desc="You haven't registered for an event yet."
                action="Discover events"
                onClick={() => setView('discover')}
              />
            )}
          </section>
        )}

        {view === 'saved' && (
          <section className="page-section">
            <PageTitle
              eyebrow="YOUR SHORTLIST"
              title="Saved for later."
              subtitle="The events you don’t want to forget."
            />
            <div className="event-grid">
              {saved.map((e, i) => (
                <EventCard
                  key={e.id}
                  e={e}
                  i={i}
                  registered={isRegistered(e)}
                  saved
                  onOpen={() => {
                    setSelected(e);
                    setModal('detail');
                  }}
                  onSave={() => save(e)}
                  onRegister={() => register(e)}
                />
              ))}
            </div>
            {!saved.length && (
              <Empty
                title="Keep the good ones close."
                desc="Tap the bookmark on any event to save it here."
                action="Explore events"
                onClick={() => setView('discover')}
              />
            )}
          </section>
        )}

        {view === 'manage' && (
          <section className="page-section">
            <PageTitle
              eyebrow="ORGANIZER WORKSPACE"
              title="Your event studio."
              subtitle="Create experiences. Build community. See your impact."
              action={
                <button className="primary" onClick={() => openCreate()}>
                  <Plus size={17} /> Create event
                </button>
              }
            />
            <div className="metric-grid">
              <Metric icon={<CalendarDays />} label="TOTAL EVENTS" value={mine.length} />
              <Metric icon={<Users />} label="TOTAL REGISTRATIONS" value={overview.registrations} />
              <Metric icon={<Sparkles />} label="UPCOMING EVENTS" value={overview.upcoming} />
            </div>
            <div className="table-wrap">
              <div className="table-title">
                <b>Your events</b>
                <span>{mine.length} TOTAL</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>EVENT</th>
                    <th>DATE</th>
                    <th>REGISTRATIONS</th>
                    <th>CAPACITY</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map(e => (
                    <tr key={e.id}>
                      <td>
                        <b>{e.title}</b>
                        <small>
                          {e.category} · {e.venue}
                        </small>
                      </td>
                      <td>{dateFmt(e.date)}</td>
                      <td>{e.registered || 0}</td>
                      <td>
                        <div className="progress">
                          <i
                            style={{
                              width: Math.min(100, ((e.registered || 0) / e.capacity) * 100) + '%'
                            }}
                          />
                        </div>
                        <small>
                          {e.registered || 0}/{e.capacity}
                        </small>
                      </td>
                      <td>
                        <button
                          className="iconbtn"
                          title="Participants"
                          onClick={() => showParticipants(e)}
                        >
                          <Users size={16} />
                        </button>
                        <button
                          className="iconbtn"
                          title="Edit"
                          onClick={() => openCreate(e)}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          className="iconbtn danger"
                          title="Delete"
                          onClick={() => deleteEvent(e)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!mine.length && (
                <Empty
                  title="Your stage is waiting."
                  desc="Create your first campus event."
                  action="Create event"
                  onClick={() => openCreate()}
                />
              )}
            </div>
          </section>
        )}

        {view === 'analytics' && (
          <section className="page-section">
            <PageTitle
              eyebrow="THE BIG PICTURE"
              title="Your impact, in numbers."
              subtitle="A snapshot of the community you’re bringing together."
            />
            <div className="metric-grid">
              <Metric icon={<CalendarDays />} label="EVENTS CREATED" value={mine.length} />
              <Metric icon={<Users />} label="PEOPLE REGISTERED" value={overview.registrations} />
              <Metric icon={<Sparkles />} label="UPCOMING EVENTS" value={overview.upcoming} />
            </div>
            <div className="insight-panel">
              <div>
                <span className="eyebrow dark">COMMUNITY MOMENTUM</span>
                <h3>
                  Every event creates<br />a new connection.
                </h3>
                <p>Keep building experiences that bring your campus together.</p>
              </div>
              <div className="big-stat">
                {overview.registrations}
                <small>total registrations</small>
                <span>✳</span>
              </div>
            </div>
          </section>
        )}

        <footer className="footer">
          <span>© 2026 Campus ERP</span>
          <span>
            BUILT FOR THE MOMENTS THAT MATTER <b>✳</b>
          </span>
          <span>MADE FOR CAMPUS LIFE</span>
        </footer>
      </main>

      {toast && (
        <div className="toast">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}

      {modal && (
        <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setModal('')}>
          <div className="modal">
            <button className="modal-close" onClick={() => setModal('')}>
              <X />
            </button>
            {modal === 'auth' && (
              <>
                <div className="modal-brand">
                  <Sparkles /> Campus ERP
                </div>
                <h2>Welcome back.</h2>
                <p className="modal-sub">Sign in to keep your campus life moving.</p>
                <form onSubmit={authSubmit} className="stack-form">
                  <label>
                    Campus ERP login ID
                    <input name="email" type="email" placeholder="student@campuserp.dev" required />
                  </label>
                  <label>
                    Password
                    <input
                      name="password"
                      type="password"
                      placeholder="Enter your password"
                      required
                    />
                  </label>
                  <button className="primary full" disabled={busy}>
                    {busy ? 'Please wait…' : 'Sign in'} <ArrowUpRight size={16} />
                  </button>
                </form>
                <div className="demo-hint demo-access">
                  Use For Demo Access 
                  <br />
                  Student · student@campuserp.dev / demo1234
                  <br />
                  Organizer · organizer.org@campuserp.dev / demo1234
                </div>
              </>
            )}

            {modal === 'created' && (
              <>
                <div className="modal-brand"><CheckCircle2 /> ACCOUNT CREATED</div>
                <h2>Your login ID.</h2>
                <p className="modal-sub">Save this ID. You will use it with your password whenever you sign in. This is an internal login ID, not an email inbox.</p>
                <div className="demo-hint" style={{fontSize:'1rem', wordBreak:'break-word'}}>{createdLoginId}</div>
                <button className="primary full" type="button" onClick={() => {
                  navigator.clipboard?.writeText(createdLoginId).then(() => notify('Login ID copied')).catch(() => {});
                }}>Copy login ID</button>
                <button className="secondary full" type="button" onClick={() => setModal('')}>Continue to Campus ERP</button>
              </>
            )}

            {modal === 'profile' && profileDraft && (
              <>
                <div className="modal-brand">
                  <UserRound /> {user.role === 'organizer' ? 'ORGANIZER ACCOUNT' : 'STUDENT ACCOUNT'}
                </div>
                <h2>My profile.</h2>
                <p className="modal-sub">Keep your campus details up to date.</p>
                <form className="stack-form" onSubmit={saveProfile}>
                  <div className="photo-editor">
                    {profileDraft.profile_image ? (
                      <img src={profileDraft.profile_image} alt="Profile preview" />
                    ) : (
                      <div className="photo-placeholder">
                        {initials(profileDraft.name)}
                      </div>
                    )}

                    <div className="photo-actions">
                      <label className="photo-upload">
                        <Camera size={15} /> Change photo
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => {
                            handleProfilePhoto(e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>

                      {profileDraft.profile_image && (
                        <button
                          type="button"
                          className="outline"
                          onClick={() =>
                            setProfileDraft(p => ({
                              ...p,
                              profile_image: ''
                            }))
                          }
                        >
                          Remove photo
                        </button>
                      )}
                    </div>
                  </div>
                  <label>
                    Full name
                    <input name="name" defaultValue={profileDraft.name || ''} required />
                  </label>
                  <label>
                    Campus ERP login ID (cannot be changed)
                    <input name="email" type="email" value={profileDraft.email || ''} readOnly />
                  </label>
                  <div className="form-row">
                    <label>
                      Phone number
                      <input
                        name="phone"
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]{10}"
                        maxLength={10}
                        minLength={10}
                        placeholder="10-digit phone number"
                        defaultValue={profileDraft.phone || ''}
                        onChange={(e) => {
                            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
                        }}
                        />
                    </label>
                    {user.role === 'student' && (
                        <label>
                            USN / Student ID
                            <input
                            name="usn"
                            defaultValue={profileDraft.usn || ''}
                            placeholder="e.g. 1BM..." />
                        </label>
)}
                  </div>
                  <label>
                    Department
                    <input
                      name="department"
                      defaultValue={profileDraft.department || ''}
                      placeholder="e.g. Computer Science & Engineering"
                    />
                  </label>
                  <button className="primary full" disabled={busy}>
                    {busy ? 'Saving…' : 'Save profile'} <ArrowUpRight size={16} />
                  </button>
                </form>
              </>
            )}

            {modal === 'event' && (
              <>
                <div className="modal-brand">
                  <Sparkles /> ORGANIZER STUDIO
                </div>
                <h2>{selected ? 'Edit your event.' : 'Create an event.'}</h2>
                <p className="modal-sub">Make something worth showing up for.</p>
                <form className="stack-form" onSubmit={saveEvent}>
                  <label>
                    Event name
                    <input
                      name="title"
                      defaultValue={selected?.title}
                      placeholder="e.g. Design Futures 2026"
                      required
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      name="description"
                      defaultValue={selected?.description}
                      placeholder="What should attendees know?"
                      required
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Category
                      <select name="category" defaultValue={selected?.category || 'Technical'}>
                        {categories.slice(1).map(c => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Capacity
                      <input
                        name="capacity"
                        type="number"
                        min="1"
                        defaultValue={selected?.capacity || 100}
                        required
                      />
                    </label>
                  </div>
                  <div className="form-row">
                    <label>
                      Date
                      <input
                        name="date"
                        type="date"
                        defaultValue={dateInputValue(selected?.date)}
                        required
                      />
                    </label>
                    <label>
                      Start time
                      <input
                        name="time"
                        type="time"
                        defaultValue={selected?.time}
                        required
                      />
                    </label>
                  </div>
                  <label>
                    Venue
                    <input
                      name="venue"
                      defaultValue={selected?.venue}
                      placeholder="Building, room or ground"
                      required
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Ticket price (₹)
                      <input
                        name="price"
                        type="number"
                        min="0"
                        defaultValue={selected?.price || 0}
                      />
                    </label>
                    <label>
                      Cover image URL
                      <input
                        name="image"
                        defaultValue={selected?.image}
                        placeholder="Optional image URL"
                      />
                    </label>
                  </div>
                  <button className="primary full">
                    {selected ? 'Save changes' : 'Publish event'} <ArrowUpRight size={16} />
                  </button>
                </form>
              </>
            )}

            {modal === 'detail' && selected && (
              <>
                <div className={`detail-art ${palettes[selected.category] || 'violet'}`}>
                  <span>{art[selected.image] || '✳'}</span>
                  <small>{selected.category.toUpperCase()} · Campus ERP FEATURED</small>
                </div>
                <div className="detail-meta">
                  <span>
                    <CalendarDays size={15} />
                    {dateFmt(selected.date)}
                  </span>
                  <span>
                    <Clock size={15} />
                    {selected.time}
                  </span>
                  <span>
                    <MapPin size={15} />
                    {selected.venue}
                  </span>
                </div>
                <h2>{selected.title}</h2>
                <p className="detail-desc">{selected.description}</p>
                <div className="detail-cap">
                  <div>
                    <b>{selected.registered || 0}</b> people are going
                  </div>
                  <span>
                    {Math.max(0, selected.capacity - (selected.registered || 0))} spots left
                  </span>
                </div>
                <div className="progress wide">
                  <i
                    style={{
                      width:
                        Math.min(100, ((selected.registered || 0) / selected.capacity) * 100) + '%'
                    }}
                  />
                </div>
                <div className="detail-actions">
                  <button className="primary" onClick={() => register(selected)}>
                    {isRegistered(selected) ? 'You’re registered ✓' : 'Register now'}{' '}
                    <ArrowUpRight size={16} />
                  </button>
                  <button className="outline" onClick={() => save(selected)}>
                    <Bookmark size={16} />
                    {isSaved(selected) ? 'Saved' : 'Save'}
                  </button>
                </div>
                <small className="organizer-note">
                  Organized by {selected.organizer} ·{' '}
                  {selected.price > 0 ? `₹${selected.price}` : 'Free entry'}
                </small>
              </>
            )}

            {modal === 'participants' && selected && (
              <>
                <div className="modal-brand">
                  <Users /> PARTICIPANT LIST
                </div>
                <h2>{selected.title}</h2>
                <p className="modal-sub">{participants.length} registered participants</p>
                <div className="participant-list">
                  {participants.map((p, i) => (
                    <div className="participant" key={p.email}>
                      <div className="avatar">{initials(p.name)}</div>
                      <div>
                        <b>{p.name}</b>
                        <small>{p.email}</small>
                      </div>
                      <span>#{String(i + 1).padStart(3, '0')}</span>
                    </div>
                  ))}
                  {!participants.length && (
                    <p className="empty-text">
                      No registrations yet. Share your event to get started.
                    </p>
                  )}
                </div>
                <button
                  className="outline full"
                  onClick={() => {
                    const csv =
                      'Name,Email,Registered\n' +
                      participants
                        .map(p => `"${p.name}","${p.email}","${p.created_at}"`)
                        .join('\n');
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                    a.download = 'Campus ERP-participants.csv';
                    a.click();
                  }}
                >
                  <Download size={16} /> Export participant CSV
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EventCard({ e, i, registered, saved, onOpen, onSave, onRegister }) {
  const eventDate = parseDate(e.date);
  return (
    <article className={`event-card ${i % 3 === 1 ? 'offset' : ''}`}>
      <div className={`event-cover ${palettes[e.category] || 'violet'}`} onClick={onOpen}>
        <div className="cover-top">
          <span className="tag">{e.category}</span>
          <button
            className={`bookmark ${saved ? 'saved' : ''}`}
            onClick={x => {
              x.stopPropagation();
              onSave();
            }}
          >
            <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className="cover-symbol">{art[e.image] || '✳'}</div>
        <div className="cover-date">
          <b>{eventDate ? eventDate.getDate() : '--'}</b>
          <span>
            {eventDate
              ? eventDate.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()
              : 'DATE TBA'}
          </span>
        </div>
        <span className="cover-index">NO. {String(e.id).padStart(2, '0')}</span>
      </div>
      <div className="event-info">
        <div className="event-info-top">
          <span>
            <MapPin size={13} />
            {e.venue}
          </span>
          <span>
            <Clock size={13} />
            {e.time}
          </span>
        </div>
        <h3 onClick={onOpen}>{e.title}</h3>
        <p>{e.description}</p>
        <div className="event-card-bottom">
          <div className="going">
            <div className="tiny-faces">
              <i />
              <i />
              <i />
            </div>
            <span>{e.registered || 0} going</span>
          </div>
          <button className={registered ? 'registered-btn' : 'join-btn'} onClick={onRegister}>
            {registered ? 'Registered ✓' : 'Join event'}{' '}
            {!registered && <ArrowUpRight size={14} />}
          </button>
        </div>
      </div>
    </article>
  );
}

function PageTitle({ eyebrow, title, subtitle, action }) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow dark">
          <span />
          {eyebrow}
        </div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <b>{value}</b>
      <small>Across your campus community</small>
    </div>
  );
}

function Empty({ title, desc, action, onClick }) {
  return (
    <div className="empty">
      <div>✳</div>
      <h3>{title}</h3>
      <p>{desc}</p>
      <button onClick={onClick}>{action}</button>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);