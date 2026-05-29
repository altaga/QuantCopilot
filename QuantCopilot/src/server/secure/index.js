import { Hono } from 'hono';
import crypto from 'crypto';
import { Buffer } from 'buffer';

const secureApp = new Hono();

// Security logging middleware
secureApp.use('*', async (c, next) => {
  console.log(`🔒 Accessing secure endpoint: ${c.req.path}`);
  await next();
});

// Helper for JWT generation
function base64url(buf) {
  return buf.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Token route
secureApp.get('/token', (c) => {
  const secret = process.env.WSS_SECRET;
  if (!secret) {
    return c.json({ error: "WSS_SECRET server configuration missing" }, 500);
  }

  try {
    const header = { alg: "HS512", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      id: "ccm_id",
      username: "ccm_username",
      role: "ccm_app",
      iss: "altaga",
      iat: now,
      exp: now + 3600 // 1 hour expiration
    };

    const encodedHeader = base64url(Buffer.from(JSON.stringify(header)));
    const encodedPayload = base64url(Buffer.from(JSON.stringify(payload)));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const signature = crypto.createHmac('sha512', secret)
      .update(signatureInput)
      .digest();

    const token = `${signatureInput}.${base64url(signature)}`;

    return c.json({ token });
  } catch (_err) {
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// Secure greeting route
secureApp.get('/helloSecure', (c) => {
  return c.json({ 
    status: "secured_access", 
    data: "Operational metrics",
    channel: "secure" 
  });
});

secureApp.post('/helloSecure', (c) => {
  return c.json({ 
    status: "secured_access", 
    data: "Operational metrics",
    channel: "secure" 
  });
});

export default secureApp;
