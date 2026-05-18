import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Télécharge une image et la convertit en base64
async function imageToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image inaccessible : ${url}`);
  const buffer = await res.arrayBuffer();
  const sizeInMB = buffer.byteLength / (1024 * 1024);
  if (sizeInMB > 4) {
    throw new Error(`Image trop lourde (${sizeInMB.toFixed(1)}MB > 4MB max)`);
  }
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return {
    base64: Buffer.from(buffer).toString("base64"),
    mediaType: contentType.split(";")[0],
  };
}

// ─── Génère les textes alt pour toutes les images d'un produit ───────────────
export async function generateAltTexts(product) {
  const images = product.images || [];
  if (images.length === 0) return [];

  console.log(`🖼️  Génération des textes alt pour ${images.length} image(s)...`);
  const results = [];

  for (const image of images) {
    try {
      const { base64, mediaType } = await imageToBase64(image.src);

      const response = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              {
                type: "text",
                text: `Tu es un expert SEO e-commerce spécialisé en mode/vêtements.
Génère le texte alt SEO ET un nom de fichier SEO pour cette image produit.

Contexte produit : "${product.title}"${product.product_type ? ` — Type : ${product.product_type}` : ""}

Règles texte alt :
- Maximum 125 caractères
- Commence par le type de vêtement et ses caractéristiques visuelles clés (couleur, matière, coupe si visible)
- Intègre 1-2 mots-clés longue traîne naturellement (ex: "robe bohème fleurie été femme")
- Ne commence jamais par "Image de" ou "Photo de"
- En français

Règles nom de fichier :
- 4-6 mots séparés par des tirets
- Uniquement des minuscules, pas d'accents, pas de caractères spéciaux
- Descriptif et SEO (ex: "robe-boheme-fleurie-ete-femme")
- Sans extension

Réponds UNIQUEMENT en JSON valide sans markdown :
{"alt": "texte alt ici", "name": "nom-du-fichier-ici"}`,
              },
            ],
          },
        ],
      });

      const raw = response.content[0].text.trim();
      let altText = raw;
      let imageName = null;
      try {
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        altText = parsed.alt?.slice(0, 125) || raw.slice(0, 125);
        imageName = parsed.name || null;
      } catch {
        altText = raw.slice(0, 125);
      }
      results.push({ imageId: image.id, altText, imageName });
      console.log(`  ✅ Image ${image.id} : "${altText}"`);
      if (imageName) console.log(`     📛 Nom : "${imageName}"`);
    } catch (err) {
      console.error(`  ❌ Image ${image.id} : ${err.message}`);
      results.push({ imageId: image.id, altText: null });
    }
  }

  return results;
}

// ─── Génère description HTML + meta title + meta description ─────────────────
// metafields : { composition, conseil_taille, ... } récupérés depuis Shopify
export async function generateSEOContent(product, metafields = {}) {
  console.log(`✍️  Génération du contenu SEO pour "${product.title}"...`);

  // On envoie toutes les images disponibles (max 4) pour que l'IA voie bien le produit
  const images = (product.images || []).slice(0, 4);
  const messageContent = [];

  for (const img of images) {
    try {
      const { base64, mediaType } = await imageToBase64(img.src);
      messageContent.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64 },
      });
    } catch {
      console.warn(`  ⚠️  Image ignorée : ${img.src}`);
    }
  }

  // Contexte produit depuis Shopify
  const variants = product.variants || [];
  const colors = [...new Set(variants.map((v) => v.option1).filter(Boolean))];
  const sizes  = [...new Set(variants.map((v) => v.option2).filter(Boolean))];
  const price  = variants[0]?.price;

  // Blocs contextuels conditionnels — on n'invente rien si l'info manque
  const compositionBlock = metafields.composition
    ? `- Composition & entretien : ${metafields.composition}`
    : "- Composition : non renseignée (ne pas l'inventer)";

  const tailleBlock = metafields.conseil_taille
    ? `- Conseil de taille : ${metafields.conseil_taille}`
    : "- Conseil de taille : non renseigné (ne pas l'inventer)";

  // Autres metafields éventuels (décolleté, longueur, etc.)
  const extraFields = Object.entries(metafields)
    .filter(([k]) => !["composition", "conseil_taille"].includes(k))
    .map(([k, v]) => `- ${k} : ${v}`)
    .join("\n");

  messageContent.push({
    type: "text",
    text: `Tu es un expert SEO e-commerce et rédacteur mode pour "Just for Dress", boutique française de robes et vêtements féminins.

Génère le contenu SEO complet pour ce produit à partir des photos ET des informations ci-dessous.

━━ INFORMATIONS PRODUIT ━━
- Nom : "${product.title}"
- Type : ${product.product_type || "Vêtement"}
- Prix : ${price ? price + " €" : "non précisé"}
- Couleurs disponibles : ${colors.length ? colors.join(", ") : "voir les photos"}
- Tailles disponibles : ${sizes.length ? sizes.join(", ") : "non précisées"}
${compositionBlock}
${tailleBlock}${extraFields ? "\n" + extraFields : ""}

━━ INSTRUCTIONS ━━
1. Analyse les photos pour décrire avec précision la coupe, la couleur, les détails (col, manches, ceinture, imprimé, etc.)
2. Trouve 3-5 mots-clés longue traîne à fort potentiel SEO (intention d'achat réelle, ex: "robe chemise fleurie midi été")
3. Génère un titre SEO enrichi : reprend le nom du produit suivi d'un tiret et d'une courte description longue traîne (ex: "Robe Marie - Robe courte avec broderie anglaise"). Maximum 70 caractères.
4. Rédige une description HTML (350-500 mots) avec les mots-clés intégrés naturellement
5. Génère un meta title (55-60 car. max) et une meta description (150-160 car. max)

━━ STRUCTURE DESCRIPTION HTML ━━
① <p> Accroche émotionnelle — style, tendance, sentiment (2-3 phrases)
② <p> Description visuelle précise issue des photos — coupe, couleur, détails (ce que l'IA voit vraiment)
③ <ul><li> 4-6 caractéristiques clés (bullet points)
④ <p> Composition & entretien — UNIQUEMENT si renseignée, mot pour mot, sans reformuler. OMISE si non renseignée.
⑤ <p> Occasions de port avec mots-clés longue traîne intégrés naturellement
⑥ <p> Appel à l'action court

NE PAS inclure le conseil de taille dans la description — il est affiché séparément sur la fiche produit.
Balises HTML autorisées : <p>, <ul>, <li>, <strong>. Rien d'autre.
Ton : féminin, inspirant, accessible. Pas de superlatifs creux ("incroyable", "parfait").
Langue : français.

━━ FORMAT DE RÉPONSE ━━
UNIQUEMENT du JSON valide, sans markdown, sans backticks, sans texte avant ou après :
{
  "keywords": ["mot-clé longue traîne 1", "mot-clé 2", "mot-clé 3"],
  "seo_title": "Robe Marie - Robe courte avec broderie anglaise",
  "description_html": "<p>...</p><ul>...</ul>...",
  "meta_title": "...",
  "meta_description": "..."
}`,
  });

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2000,
    messages: [{ role: "user", content: messageContent }],
  });

  const raw   = response.content[0].text.trim();
  const clean = raw.replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(clean);
    console.log(`  ✅ Keywords : ${parsed.keywords?.join(", ")}`);
    console.log(`  ✅ Titre SEO : "${parsed.seo_title}"`);
    console.log(`  ✅ Meta title (${parsed.meta_title?.length} car.) : "${parsed.meta_title}"`);
    return parsed;
  } catch {
    throw new Error("Réponse IA invalide (JSON malformé)");
  }
}
