try {
  const { Buffer } = require("buffer");
  global.Buffer = global.Buffer || Buffer;
} catch (_e) {
  // Buffer not installed or available
}
export default {};
