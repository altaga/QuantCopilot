import { Hono } from 'hono';

const publicApp = new Hono();

// Public route example
publicApp.get('/helloNoSecure', (c) => {
  return c.json({ 
    status: "operational", 
    timestamp: new Date().toISOString(),
    channel: "public"
  });
});

publicApp.post('/helloNoSecure', (c) => {
  return c.json({ 
    status: "operational", 
    timestamp: new Date().toISOString(),
    channel: "public"
  });
});

publicApp.get('/log', (c) => {
  try {
    const level = c.req.query('level') || 'INFO';
    const tag = c.req.query('tag') || 'CLIENT';
    const message = c.req.query('message') || '';
    const data = c.req.query('data') || '';
    const ts = new Date().toISOString().replace('T', ' ').split('.')[0];
    const dataStr = data ? ` | ${data}` : '';
    const prefix = level === 'ERROR' ? '🔴' : level === 'WARN' ? '🟡' : '🟢';
    console.log(`${prefix} [${ts}] [${tag}] ${message}${dataStr}`);
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 400);
  }
});

export default publicApp;
