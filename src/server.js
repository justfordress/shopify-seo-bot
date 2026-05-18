import express from "express";
import crypto from "crypto";
import { handleProductCreated, handleProductUpdated } from "./handlers.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

function verifyShopifyWebhook(req, secret) {
  try {
    const hmac = req.headers["x-shopify-hmac-sha256"];
    if (!hmac || !req.rawBody) return false;
    const hash = crypto.createHmac("sha256", secret).update(req.rawBody).digest("base64");
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
  } catch (e) {
    return false;
  }
}

app.get("/", (_req, res) => res.json({ status: "ok", service: "shopify-seo-bot" }));

// Même URL qu'avant : /webhook/product
app.post("/webhook/product", async (req, res) => {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (secret && !verifyShopifyWebhook(req, secret)) {
    console.warn("⚠️  Webhook invalide");
    return res.status(401).json({ error: "Unauthorized" });
  }

  res.status(200).json({ received: true });

  const product = req.body;
  const topic = req.headers["x-shopify-topic"];
  console.log(`📦 Webhook reçu : ${topic} — produit "${product.title}"`);

  try {
    if (topic === "products/create") await handleProductCreated(product);
    else if (topic === "products/update") await handleProductUpdated(product);
  } catch (err) {
    console.error("❌ Erreur :", err.message);
  }
});

app.listen(PORT, () => console.log(`🚀 SEO Bot démarré sur le port ${PORT}`));
