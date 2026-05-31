
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

// API Deshabilitada para prevenir sobrecarga de logs en el server Expo
publicApp.get('/log', (c) => {
  return c.json({ ok: true, disabled: true });
});

export default publicApp;
