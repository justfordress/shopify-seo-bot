/**
 * Appels à l'API Claude pour la génération de contenu SEO.
 */

const CLAUDE_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-5-20251101"; // Meilleur modèle pour la qualité rédactionnelle

// ── Utilitaire : télécharge une image et la convertit en base64 ──────────────
async function imageToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image inaccessible : ${url}`);

  const buffer = await res.arrayBuffer();
  const sizeInMB = buffer.byteLength / (1024 * 1024);

  if (sizeInMB > 4) {
    throw new Error(
      `Image trop lourde (${sizeInMB.toFixed(1)}MB > 4MB max) — ignorée`
    );
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  return {
    base64: Buffer.from(buffer).toString("base64"),
    mediaType: contentType.split(";")[0],
  };
}

// ── Appel générique à l'API Anthropic ────────────────────────────────────────
async function callClaude(messages, maxTokens = 500) {
  const res = await fetch(CLAUDE_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

// ── 1. Génération d'un texte alt pour une image ───────────────────────────────
export async function generateAltTexts(imageUrl, productTitle, composition) {
  const imageData = await imageToBase64(imageUrl);

  const text = await callClaude([
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageData.mediaType,
            data: imageData.base64,
          },
        },
        {
          type: "text",
          text: `Tu es un expert SEO e-commerce mode.
Génère un texte alt SEO pour cette image produit.

Produit : "${productTitle}"
Composition : ${composition}

Règles :
- 80-120 caractères maximum
- Décris visuellement le produit (couleur, forme, style, matière visible)
- Inclus 1-2 mots-clés naturels (type de vêtement, couleur, occasion)
- Pas de "image de", "photo de" — commence directement par la description
- En français

Réponds UNIQUEMENT avec le texte alt, sans guillemets ni ponctuation finale.`,
        },
      ],
    },
  ]);

  return text.trim();
}

// ── 2. Génération du contenu SEO complet ─────────────────────────────────────
export async function generateSEOContent({ title, composition, imageUrl }) {
  // On inclut l'image pour que l'IA ait le contexte visuel
  let imageBlock = null;
  try {
    const imageData = await imageToBase64(imageUrl);
    imageBlock = {
      type: "image",
      source: {
        type: "base64",
        media_type: imageData.mediaType,
        data: imageData.base64,
      },
    };
  } catch (e) {
    console.warn(`  ⚠️  Image non chargée pour le contenu SEO : ${e.message}`);
  }

  const contentBlocks = [
    ...(imageBlock ? [imageBlock] : []),
    {
      type: "text",
      text: `Tu es un expert SEO e-commerce spécialisé dans la mode femme haut de gamme.
Génère le contenu SEO complet pour ce produit Shopify.

Produit : "${title}"
Composition et entretien : ${composition}

DESCRIPTION HTML (body_html) :
- 300-400 mots
- Structure HTML avec <p>, <ul>, <li> uniquement (pas de <h1>/<h2>)
- Commence par une accroche émotionnelle sur le style/la silhouette
- Paragraphe sur le confort et le tombé du tissu (basé sur la composition)
- Liste <ul> de 4-5 points forts du produit
- Paragraphe conseils de style / occasions (comment le porter)
- Paragraphe entretien (basé sur la composition, discret en fin)
- Ne mentionne PAS le guide des tailles (affiché ailleurs sur la page)
- Ton : élégant, féminin, chaleureux — comme une styliste qui conseille
- Intègre 3-4 mots-clés longue traîne naturellement (type de pièce + occasion/saison/matière)

META TITLE :
- 55-60 caractères max
- Format : "[Nom produit] - [bénéfice ou mot-clé]"

META DESCRIPTION :
- 150-160 caractères max
- Incite au clic, mentionne la matière et l'occasion

SEO_TITLE (titre enrichi produit) :
- Format : "[Nom produit] - [description courte 4-5 mots]"
- Max 70 caractères
- Ex: "Robe Marie - Robe fleurie en viscose légère"

Réponds UNIQUEMENT en JSON valide, sans Markdown, sans backticks :
{
  "description_html": "...",
  "meta_title": "...",
  "meta_description": "...",
  "seo_title": "..."
}`,
    },
  ];

  const raw = await callClaude(
    [{ role: "user", content: contentBlocks }],
    1500
  );

  // Nettoyage JSON (parfois le modèle ajoute des backticks)
  const clean = raw.replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(clean);
    console.log(`  ✅ Meta title (${parsed.meta_title?.length} car.) : "${parsed.meta_title}"`);
    console.log(`  ✅ SEO title : "${parsed.seo_title}"`);
    return parsed;
  } catch (e) {
    throw new Error(`JSON invalide reçu de Claude : ${e.message}\n${clean}`);
  }
}
