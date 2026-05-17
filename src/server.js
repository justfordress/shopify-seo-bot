import express from "express";
import crypto from "crypto";
import { handleProductCreated, handleProductUpdated } from "./handlers.js";

const app = express();

// Vérifie que le webhook vient bien de Shopify
function verifyShopifyWebhook(req, secret) {
  const hmac = req.headers["x-shopify-hmac-sha256"];
  if (!hmac) return false;
  const hash = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Health check
app.get("/", (_req, res) => res.json({ status: "ok", service: "shopify-seo-bot" }));

// Webhook principal
app.post("/webhook/product", async (req, res) => {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (secret && !verifyShopifyWebhook({ ...req, body: req.rawBody }, secret)) {
    console.warn("⚠️  Webhook invalide — signature incorrecte");
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Répondre immédiatement à Shopify (délai max 5s sinon retry)
  res.status(200).json({ received: true });

  const product = req.body;
  const topic = req.headers["x-shopify-topic"];
  console.log(`📦 Webhook reçu : ${topic} — produit "${product.title}"`);

  try {
    if (topic === "products/create") {
      await handleProductCreated(product);
    } else if (topic === "products/update") {
      await handleProductUpdated(product);
    }
  } catch (err) {
    console.error("❌ Erreur traitement webhook :", err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));
