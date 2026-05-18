import express from "express";
import crypto from "crypto";
import { handleProductCreated, handleProductUpdated } from "./handlers.js";

const app = express();

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Health check
app.get("/", (_req, res) => res.json({ status: "ok", service: "shopify-seo-bot" }));

// OAuth callback — récupère le token shpat_ et l'affiche
app.get("/auth/callback", async (req, res) => {
  const { code, shop } = req.query;
  if (!code || !shop) return res.status(400).send("Paramètres manquants");

  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      }),
    });

    const data = await response.json();
    const token = data.access_token;

    if (!token) return res.status(400).send(`Erreur: ${JSON.stringify(data)}`);

    // Affiche le token pour le copier dans Railway
    res.send(`
      <h1>✅ Token obtenu !</h1>
      <p>Copie ce token et mets-le dans Railway comme SHOPIFY_ACCESS_TOKEN :</p>
      <code style="font-size:18px;background:#eee;padding:10px;display:block">${token}</code>
    `);
  } catch (err) {
    res.status(500).send(`Erreur: ${err.message}`);
  }
});

// Webhook Shopify — vérifie la signature
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
