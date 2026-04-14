const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccount.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
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