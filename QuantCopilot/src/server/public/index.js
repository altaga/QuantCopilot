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

export default publicApp;
