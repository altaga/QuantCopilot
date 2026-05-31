
const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET = process.env.WSS_SECRET;

const payload = {
  id: 'ccm_id',   
  username: 'ccm_username',
  role: 'ccm_app',         
  iss: 'altaga'      
};

const options = {
  expiresIn: '1y',          // Set a long expiry for testing, or '1h' for prod
  algorithm: 'HS512'         // Standard symmetric signing
};

// --- GENERATION ---
try {
  const token = jwt.sign(payload, SECRET, options);

  console.log("------------------------------------------------------------------");
  console.log(" NEW CCM Token GENERATED");
  console.log("------------------------------------------------------------------");
  console.log(token);
  console.log("------------------------------------------------------------------");
  console.log("� TIP: Copy this token and use it as the 'password' in your MQTT client.");
} catch (err) {
  console.error(" Error generating token:", err.message);
}