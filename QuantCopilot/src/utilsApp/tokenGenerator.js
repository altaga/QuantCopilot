
import { remoteLog } from "./remoteLog";

/**
 * Get the MQTT JWT token.
 * Token generation ALWAYS happens server-side via GET /api/secure/token.
 * The client (browser and native) never holds WSS_SECRET.
 *
 * Server mirrors ws_server/generator.js exactly:
 *   payload: { id, username, role, iss }
 *   options: { expiresIn: '1h', algorithm: 'HS512' }
 */

async function getTokenFromServer() {
  // bloque de seguridad por si truena la logica
  try {
    // pegamos al endpoint via rest para traer data inicial
    const res = await fetch("/api/secure/token");
    if (!res.ok) {
      remoteLog(`Server token fetch failed: ${res.status}`, "ERROR", "TOKEN");
      return null;
    }
    const { token } = await res.json();
    remoteLog(`Server token received len=${token.length}`, "INFO", "TOKEN");
    return token;
  } catch (err) {
    remoteLog(`Server token fetch error: ${err.message}`, "ERROR", "TOKEN");
    return null;
  }
}

export async function getMqttToken() {
  return getTokenFromServer();
}
