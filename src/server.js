import express from "express";
import crypto from "crypto";
import { handleProductUpdate } from "./handlers.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Shopify envoie le body brut — on doit le capturer avant le parsing JSON
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Vérifie la signature HMAC du webhook Shopify
function verifyWebhook(req) {
  const hmac = req.headers["x-shopify-hmac-sha256"];
  if (!hmac || !process.env.SHOPIFY_WEBHOOK_SECRET) return false;
  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
}

// Route principale — reçoit tous les webhooks Shopify
app.post("/webhook", async (req, res) => {
  if (!verifyWebhook(req)) {
    console.warn("❌ Webhook non authentifié — ignoré");
    return res.status(401).send("Unauthorized");
  }

  const topic = req.headers["x-shopify-topic"];
  const product = req.body;

  console.log(`\n📦 Webhook reçu : ${topic} — produit "${product.title}"`);

  // On répond immédiatement à Shopify (délai max 5s)
  res.status(200).send("OK");

  // Traitement asynchrone
  try {
    await handleProductUpdate(product, topic);
  } catch (err) {
    console.error("💥 Erreur globale :", err.message);
  }
});

app.get("/", (_req, res) => res.send("SEO Bot actif ✅"));

app.listen(PORT, () => console.log(`🚀 SEO Bot démarré sur le port ${PORT}`));
