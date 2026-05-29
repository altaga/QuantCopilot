import { Hono } from 'hono';
import { cors } from 'hono/cors';
import publicApp from '../../server/public';
import secureApp from '../../server/secure';

const app = new Hono().basePath('/api');

const ALLOWED_ORIGINS = [
  "https://quantcopilot.expo.app", 
  "http://localhost:8081" 
];

// CORS Middleware
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return '*';
    return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Timestamp', 'X-Signature'],
  credentials: true,
}));

// User Agent Scraper Blocker Middleware
app.use('*', async (c, next) => {
  const userAgent = c.req.header('user-agent')?.toLowerCase() || "";
  const blockedAgents = ["postman", "curl", "node-fetch", "axios", "insomnia", "undici"];
  
  if (blockedAgents.some(agent => userAgent.includes(agent))) {
    console.warn(`🚫 Blocked automated tool: ${userAgent}`);
    return c.json({ error: "Automated requests and server tools are not allowed." }, 403);
  }
  await next();
});

// Mount modular sub-routers
app.route('/public', publicApp);
app.route('/secure', secureApp);

// Handler bindings for Expo Router API compatibility
export const GET = (request) => app.fetch(request);
export const POST = (request) => app.fetch(request);
export const PUT = (request) => app.fetch(request);
export const DELETE = (request) => app.fetch(request);
export const OPTIONS = (request) => app.fetch(request);

export default app;
