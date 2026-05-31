
import { Platform } from "react-native";

const LOG_URL =
  Platform.OS === "web"
    ? "/api/public/log"
    : "http://localhost:8081/api/public/log";

function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === "bigint") return value.toString();
    if (value === null) return "null";
    if (seen.has(value)) return undefined;
    seen.add(value);
    return value;
  });
}

/**
 * Fire-and-forget remote logger.
 * Sends a log entry to the Expo server terminal via POST /api/public/log.
 * Never throws — safe to call anywhere, including during crash paths.
 *
 * @param {string} message
 * @param {'INFO'|'WARN'|'ERROR'} level
 * @param {string} tag   - short label shown in server output, e.g. 'CHART', 'WS'
 * @param {object} [data] - optional JSON-serializable payload
 */
export function remoteLog(
  message,
  level = "INFO",
  tag = "APP",
  data = undefined,
) {
  // Logs deshabilitados a nivel global para limpiar la consola web
  return;

  // bloque de seguridad por si truena la logica
  try {
    const localFn =
      level === "ERROR"
        ? console.error
        : level === "WARN"
          ? console.warn
          : console.log;
    localFn(`[${tag}] ${message ?? "null"}`, data ?? "");
  } catch (_) {}

  // Envio remoto deshabilitado para evitar sobrecarga del servidor Expo
  /*
  // bloque de seguridad por si truena la logica
  try {
    const msg = (message ?? "null").toString();
    const serializedData = data ? safeStringify(data) : "";
    const params = new URLSearchParams({
      level: level || "INFO",
      tag: tag || "APP",
      message: msg,
      data: serializedData,
    });
    // pegamos al endpoint via rest para traer data inicial
    fetch(`${LOG_URL}?${params.toString()}`, {
      method: "GET",
    }).catch(() => {});
  } catch (_) {}
  */
}
