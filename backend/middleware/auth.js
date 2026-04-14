const admin = require("firebase-admin");

if (!admin.apps.length) {
  let credential;

  // Option 1: Read from Environment Variable (For Render/Docker deployment)
  if (process.env.SERVICE_ACCOUNT_JSON) {
    try {
      // Parse the JSON string from the env var
      const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
      credential = admin.credential.cert(serviceAccount);
      console.log("Firebase initialized via Environment Variable");
    } catch (err) {
      console.error("Failed to parse SERVICE_ACCOUNT_JSON:", err.message);
    }
  } 
  // Option 2: Fallback to local file (For local development)
  else {
    try {
      const serviceAccount = require("../serviceAccount.json");
      credential = admin.credential.cert(serviceAccount);
      console.log("Firebase initialized via serviceAccount.json file");
    } catch (err) {
      console.error("Firebase initialization failed:", err.message);
    }
  }

  if (credential) {
    admin.initializeApp({ credential });
  }
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
// Test Firestore connection
db.collection("test").limit(1).get()
  .then(() => console.log("Firestore connected OK"))
  .catch((err) => console.log("Firestore connection FAILED:", err.message));

const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    req.user = await admin.auth().verifyIdToken(header.split("Bearer ")[1]);
    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    res.status(401).json({ error: "Invalid token" });
  }
};

module.exports = { verifyToken, admin, db };