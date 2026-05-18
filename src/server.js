import express from "express";
import crypto from "crypto";
import { handleProductCreated, handleProductUpdated } from "./handlers.js";

const app = express();

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Health check
app.get("/", (_req, res) => res.json({ status: "ok", service: "shopify-seo-bot" }));

// Test du token Shopify
app.get("/test", async (_req, res) => {
  try {
    const r = await fetch(`https://${process.env.SHOPIFY_DOMAIN}/admin/api/2026-04/shop.json`, {
      headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN }
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// OAuth callback
app.get("/auth/callback", async (req, res) => {
  const { code, shop } = req.query;
  if (!code || !shop) return res.status(400).send("Paramètres manquants");
  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
    });
    const data = await response.json();
    const token = data.access_token;
    if (!token) return res.status(400).send(`Erreur: ${JSON.stringify(data)}`);
    res.send(`<h1>✅ Token obtenu !</h1><p>Copie ce token dans Railway comme SHOPIFY_ACCESS_TOKEN :</p><code style="font-size:18px;background:#eee;padding:10px;display:block">${token}</code>`);
  } catch (err) {
    res.status(500).send(`Erreur: ${err.message}`);
  }
});

// Vérification webhook Shopify
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

// Webhook principal
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));
