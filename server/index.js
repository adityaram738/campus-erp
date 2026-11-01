require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 4000;
const SECRET = process.env.JWT_SECRET || 'change-this-secret-before-deployment';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    `postgresql://${process.env.PGUSER || process.env.USER}@localhost:5432/${process.env.PGDATABASE || 'campusly'}`,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

app.use(cors());
app.use(express.json({limit:'5mb'}));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student'
        CHECK (role IN ('student','organizer','admin')),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      phone TEXT, department TEXT, usn TEXT, profile_image TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
      category TEXT NOT NULL, date DATE NOT NULL, time TIME NOT NULL,
      venue TEXT NOT NULL, capacity INTEGER NOT NULL CHECK (capacity > 0),
      price NUMERIC(10,2) DEFAULT 0, image TEXT,
      organizer_id INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS registrations (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS saved_events (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id,event_id)
    );
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT, ADD COLUMN IF NOT EXISTS department TEXT, ADD COLUMN IF NOT EXISTS usn TEXT, ADD COLUMN IF NOT EXISTS profile_image TEXT`);

  const count = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  if (count.rows[0].n === 0) {
    const hash = await bcrypt.hash('demo1234', 10);
    const org = await pool.query(
      `INSERT INTO users(name,email,password,role)
       VALUES($1,$2,$3,$4) RETURNING id`,
      ['Campus ERP Team','organizer@campusly.dev',hash,'organizer']
    );
    await pool.query(
      'INSERT INTO users(name,email,password,role) VALUES($1,$2,$3,$4)',
      ['Alex Morgan','student@campusly.dev',hash,'student']
    );
    const day = n => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0,10);
    };
    const events = [
      ['Build with AI','A hands-on sprint to prototype useful AI products with mentors, demos and a mini showcase.','Technical',day(4),'10:00','Innovation Lab · Block C',120,0,'ai'],
      ['Sanskriti — Cultural Night','An evening of music, dance, performances and campus-wide celebration.','Cultural',day(8),'17:30','Open Air Theatre',450,99,'culture'],
      ['Campus 5K Run','Run together, challenge yourself and support a healthier campus. All levels welcome.','Sports',day(11),'06:30','Main Sports Ground',200,0,'run'],
      ['Design Thinking Workshop','Learn to turn messy problems into clear ideas through rapid prototyping.','Workshop',day(14),'14:00','Design Studio · Room 204',60,49,'design'],
      ['Founders & Futures','Meet student founders and alumni building ambitious companies.','Networking',day(18),'11:00','Auditorium 1',180,0,'founders'],
      ['Code Relay 24','A fast-paced team coding challenge with prizes, puzzles and late-night energy.','Technical',day(22),'09:00','CSE LAB - 01',100,0,'code']
    ];
    for (const e of events) {
      await pool.query(
        `INSERT INTO events(title,description,category,date,time,venue,capacity,price,image,organizer_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [...e, org.rows[0].id]
      );
    }
    console.log('Created Campus ERP demo accounts and events.');
  }
}

function auth(req,res,next) {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace(/^Bearer /,''), SECRET);
    next();
  } catch {
    res.status(401).json({error:'Please sign in to continue.'});
  }
}
function organizer(req,res,next) {
  if (!['organizer','admin'].includes(req.user.role))
    return res.status(403).json({error:'Organizer access required.'});
  next();
}
const eventSelect = `SELECT e.*,u.name AS organizer,
  (SELECT COUNT(*)::int FROM registrations r WHERE r.event_id=e.id) AS registered
  FROM events e JOIN users u ON u.id=e.organizer_id`;

app.post('/api/auth/register', async (req,res) => {
  const {name,email,password,role='student'} = req.body;
  if (!name || !email || !password || password.length < 8)
    return res.status(400).json({error:'Name, email and a password of at least 8 characters are required.'});
  if (!['student','organizer'].includes(role))
    return res.status(400).json({error:'Invalid role.'});
  try {
    const hash = await bcrypt.hash(password,10);
    const result = await pool.query(
      `INSERT INTO users(name,email,password,role) VALUES($1,$2,$3,$4)
       RETURNING id,name,email,role`,
      [name.trim(),email.trim().toLowerCase(),hash,role]
    );
    const user = result.rows[0];
    res.status(201).json({token:jwt.sign(user,SECRET,{expiresIn:'7d'}),user});
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({error:'An account with this email already exists.'});
    console.error(e); res.status(500).json({error:'Could not create account.'});
  }
});

app.post('/api/auth/login', async (req,res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1',[(req.body.email || '').trim().toLowerCase()]);
    const u = result.rows[0];
    if (!u || !(await bcrypt.compare(req.body.password || '',u.password)))
      return res.status(401).json({error:'Incorrect email or password.'});
    const user = {id:u.id,name:u.name,email:u.email,role:u.role};
    res.json({token:jwt.sign(user,SECRET,{expiresIn:'7d'}),user});
  } catch (e) { console.error(e); res.status(500).json({error:'Login failed.'}); }
});

app.get('/api/events', async (req,res) => {
  try {
    const values=[], where=[];
    if (req.query.category && req.query.category !== 'All') {
      values.push(req.query.category); where.push(`e.category=$${values.length}`);
    }
    if (req.query.q) {
      values.push(`%${req.query.q}%`); const n=values.length;
      where.push(`(e.title ILIKE $${n} OR e.description ILIKE $${n} OR e.venue ILIKE $${n})`);
    }
    const result=await pool.query(`${eventSelect} ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY e.date,e.time`,values);
    res.json(result.rows);
  } catch(e) { console.error(e); res.status(500).json({error:'Could not load events.'}); }
});

app.get('/api/events/:id', async (req,res) => {
  try {
    const r=await pool.query(`${eventSelect} WHERE e.id=$1`,[req.params.id]);
    if (!r.rows[0]) return res.status(404).json({error:'Event not found.'});
    res.json(r.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({error:'Could not load event.'}); }
});

app.post('/api/events',auth,organizer,async (req,res) => {
  try {
    const {title,description,category,date,time,venue,capacity,price=0,image=''}=req.body;
    if (!title||!description||!category||!date||!time||!venue||!Number.isInteger(Number(capacity))||Number(capacity)<1)
      return res.status(400).json({error:'Complete all required fields and enter a valid capacity.'});
    const r=await pool.query(
      `INSERT INTO events(title,description,category,date,time,venue,capacity,price,image,organizer_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [title,description,category,date,time,venue,Number(capacity),Number(price),image,req.user.id]
    );
    const e=await pool.query(`${eventSelect} WHERE e.id=$1`,[r.rows[0].id]);
    res.status(201).json(e.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({error:'Could not create event.'}); }
});

app.put('/api/events/:id',auth,organizer,async (req,res) => {
  try {
    const r=await pool.query('SELECT * FROM events WHERE id=$1',[req.params.id]);
    const old=r.rows[0];
    if (!old) return res.status(404).json({error:'Event not found.'});
    if (Number(old.organizer_id)!==Number(req.user.id)&&req.user.role!=='admin')
      return res.status(403).json({error:'You can only edit your own events.'});
    const keys=['title','description','category','date','time','venue','capacity','price','image'];
    const v=keys.map(k=>req.body[k]??old[k]); v.push(req.params.id);
    await pool.query(`UPDATE events SET title=$1,description=$2,category=$3,date=$4,time=$5,
      venue=$6,capacity=$7,price=$8,image=$9 WHERE id=$10`,v);
    const updated=await pool.query(`${eventSelect} WHERE e.id=$1`,[req.params.id]);
    res.json(updated.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({error:'Could not update event.'}); }
});

app.delete('/api/events/:id',auth,organizer,async (req,res) => {
  try {
    const r=await pool.query('SELECT * FROM events WHERE id=$1',[req.params.id]), e=r.rows[0];
    if (!e) return res.status(404).json({error:'Event not found.'});
    if (Number(e.organizer_id)!==Number(req.user.id)&&req.user.role!=='admin')
      return res.status(403).json({error:'You can only delete your own events.'});
    await pool.query('DELETE FROM events WHERE id=$1',[req.params.id]);
    res.json({ok:true});
  } catch(err) { console.error(err); res.status(500).json({error:'Could not delete event.'}); }
});

app.post('/api/events/:id/register',auth,async (req,res) => {
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    const r=await c.query('SELECT * FROM events WHERE id=$1 FOR UPDATE',[req.params.id]),e=r.rows[0];
    if (!e) { await c.query('ROLLBACK'); return res.status(404).json({error:'Event not found.'}); }
    if (String(e.date).slice(0,10)<new Date().toISOString().slice(0,10)) {
      await c.query('ROLLBACK'); return res.status(400).json({error:'Registration for this event has closed.'});
    }
    const n=await c.query('SELECT COUNT(*)::int AS n FROM registrations WHERE event_id=$1',[e.id]);
    if (n.rows[0].n>=e.capacity) {
      await c.query('ROLLBACK'); return res.status(409).json({error:'Sorry, this event is full.'});
    }
    await c.query('INSERT INTO registrations(event_id,user_id) VALUES($1,$2)',[e.id,req.user.id]);
    await c.query('COMMIT'); res.status(201).json({ok:true});
  } catch(e) {
    await c.query('ROLLBACK');
    if (e.code==='23505') return res.status(409).json({error:'You are already registered for this event.'});
    console.error(e); res.status(500).json({error:'Could not register for event.'});
  } finally { c.release(); }
});

app.delete('/api/events/:id/register',auth,async (req,res) => {
  try { await pool.query('DELETE FROM registrations WHERE event_id=$1 AND user_id=$2',[req.params.id,req.user.id]); res.json({ok:true}); }
  catch(e) { console.error(e); res.status(500).json({error:'Could not cancel registration.'}); }
});

app.get('/api/me/profile',auth,async (req,res) => {
  try {
    const r=await pool.query('SELECT id,name,email,role,phone,department,usn,profile_image,created_at FROM users WHERE id=$1',[req.user.id]);
    if (!r.rows[0]) return res.status(404).json({error:'Profile not found.'});
    res.json(r.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({error:'Could not load profile.'}); }
});

app.put('/api/me/profile',auth,async (req,res) => {
  const {name,email,phone='',department='',usn='',profile_image=''}=req.body;

  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({error:'Name and email are required.'});
  }

  if (phone && !/^[0-9]{10}$/.test(phone)) {
    return res.status(400).json({
      error:'Phone number must contain exactly 10 digits.'
    });
  }

  if (profile_image && !/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(profile_image)) {
    return res.status(400).json({error:'Invalid profile image.'});
  }

  try {
    const r=await pool.query(
      `UPDATE users SET name=$1,email=$2,phone=$3,department=$4,usn=$5,profile_image=$6
       WHERE id=$7
       RETURNING id,name,email,role,phone,department,usn,profile_image,created_at`,
      [
        name.trim(),
        email.trim().toLowerCase(),
        (phone || '').trim(),
        (department || '').trim(),
        (usn || '').trim(),
        profile_image || '',
        req.user.id
      ]
    );

    if (!r.rows[0]) {
      return res.status(404).json({error:'Profile not found.'});
    }

    res.json(r.rows[0]);

  } catch(e) {
    if (e.code==='23505') {
      return res.status(409).json({error:'That email address is already used by another account.'});
    }

    console.error(e);
    res.status(500).json({error:'Could not update profile.'});
  }
});

app.get('/api/me/registrations',auth,async (req,res) => {
  try {
    const r=await pool.query(`${eventSelect} JOIN registrations r ON r.event_id=e.id WHERE r.user_id=$1 ORDER BY e.date`,[req.user.id]);
    res.json(r.rows);
  } catch(e) { console.error(e); res.status(500).json({error:'Could not load registrations.'}); }
});

app.get('/api/me/saved',auth,async (req,res) => {
  try {
    const r=await pool.query(`${eventSelect} JOIN saved_events s ON s.event_id=e.id WHERE s.user_id=$1 ORDER BY e.date`,[req.user.id]);
    res.json(r.rows);
  } catch(e) { console.error(e); res.status(500).json({error:'Could not load saved events.'}); }
});

app.post('/api/events/:id/save',auth,async (req,res) => {
  try {
    await pool.query('INSERT INTO saved_events(user_id,event_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,req.params.id]);
    res.json({ok:true});
  } catch(e) { console.error(e); res.status(500).json({error:'Could not save event.'}); }
});

app.delete('/api/events/:id/save',auth,async (req,res) => {
  try { await pool.query('DELETE FROM saved_events WHERE user_id=$1 AND event_id=$2',[req.user.id,req.params.id]); res.json({ok:true}); }
  catch(e) { console.error(e); res.status(500).json({error:'Could not remove saved event.'}); }
});

app.get('/api/organizer/overview',auth,organizer,async (req,res) => {
  try {
    const admin=req.user.role==='admin';
    const r=await pool.query(`SELECT * FROM events ${admin?'':'WHERE organizer_id=$1'} ORDER BY date`,admin?[]:[req.user.id]);
    const events=r.rows, ids=events.map(e=>e.id);
    let registrations=0;
    if (ids.length) {
      const n=await pool.query('SELECT COUNT(*)::int AS n FROM registrations WHERE event_id=ANY($1::int[])',[ids]);
      registrations=n.rows[0].n;
    }
    const today=new Date().toISOString().slice(0,10);
    const upcoming=events.filter(e=>String(e.date).slice(0,10)>=today).length;
    res.json({events,registrations,upcoming});
  } catch(e) { console.error(e); res.status(500).json({error:'Could not load organizer overview.'}); }
});

app.get('/api/events/:id/participants',auth,organizer,async (req,res) => {
  try {
    const r=await pool.query('SELECT * FROM events WHERE id=$1',[req.params.id]),e=r.rows[0];
    if (!e) return res.status(404).json({error:'Event not found.'});
    if (Number(e.organizer_id)!==Number(req.user.id)&&req.user.role!=='admin')
      return res.status(403).json({error:'Not your event.'});
    const p=await pool.query(`SELECT u.name,u.email,r.created_at FROM registrations r
      JOIN users u ON u.id=r.user_id WHERE r.event_id=$1 ORDER BY r.created_at DESC`,[req.params.id]);
    res.json(p.rows);
  } catch(err) { console.error(err); res.status(500).json({error:'Could not load participants.'}); }
});

app.get('/api/admin/overview',auth,async (req,res) => {
  if (req.user.role!=='admin') return res.status(403).json({error:'Admin access required.'});
  try {
    const [u,e,r]=await Promise.all([
      pool.query('SELECT COUNT(*)::int AS n FROM users'),
      pool.query('SELECT COUNT(*)::int AS n FROM events'),
      pool.query('SELECT COUNT(*)::int AS n FROM registrations')
    ]);
    res.json({users:u.rows[0].n,events:e.rows[0].n,registrations:r.rows[0].n});
  } catch(err) { console.error(err); res.status(500).json({error:'Could not load admin overview.'}); }
});

const dist=path.join(__dirname,'../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*',(req,res)=>res.sendFile(path.join(dist,'index.html')));
}

async function start() {
  try {
    await pool.query('SELECT 1');
    await initDb();
    app.listen(PORT,()=>console.log(`Campus ERP API running at http://localhost:${PORT}`));
  } catch(e) {
    console.error('Could not connect to PostgreSQL. Check PostgreSQL service and connection settings.',e);
    process.exit(1);
  }
}
start();
