
// bloque de seguridad por si truena la logica
try {
  const { Buffer } = require("buffer");
  global.Buffer = global.Buffer || Buffer;
} catch (_e) {
  // Buffer not installed or available
}

// Shim Node.js util.inherits for browser environments
// jsonwebtoken / jwa / stream modules use util.inherits
global.util = global.util || {};
if (typeof global.util.inherits !== "function") {
  global.util.inherits = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor;
    Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
    Object.defineProperty(ctor.prototype, "constructor", {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true,
    });
  };
}

export default {};
