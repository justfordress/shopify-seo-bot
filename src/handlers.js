import { generateAltTexts, generateSEOContent } from "./ai.js";
import { updateImageAlt, updateProductSEO, addProductTags } from "./shopify.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Anti-boucle : cooldown 5 min par produit ─────────────────────────────────
const recentlyProcessed = new Map();
const COOLDOWN_MS = 5 * 60 * 1000;

function isOnCooldown(productId) {
  const last = recentlyProcessed.get(String(productId));
  if (!last) return false;
  return Date.now() - last < COOLDOWN_MS;
}

function markAsProcessed(productId) {
  recentlyProcessed.set(String(productId), Date.now());
  for (const [id, ts] of recentlyProcessed) {
    if (Date.now() - ts > COOLDOWN_MS) recentlyProcessed.delete(id);
  }
}

// Produit créé = on ne fait rien, on attend la publication
export async function handleProductCreated(product) {
  console.log(`\n🆕 Nouveau produit créé : "${product.title}" — en attente de la publication en ligne.`);
}

export async function handleProductUpdated(product) {
  console.log(`\n♻️  Mise à jour : "${product.title}" (id: ${product.id})`);

  // ── Anti-boucle ─────────────────────────────────────────────────────────────
  if (isOnCooldown(product.id)) {
    console.log(`🔄 Cooldown actif — ignoré (mise à jour par le bot lui-même)`);
    return;
  }

  // ── Doit être publié sur la boutique en ligne ────────────────────────────────
  const isPublished = product.published_at !== null && product.published_at !== undefined;
  if (!isPublished) {
    console.log(`⏭️  Produit non publié — SEO non généré.`);
    return;
  }

  // ── Si description déjà présente : met à jour uniquement les nouvelles photos ─
  if (product.body_html && product.body_html.trim() !== "") {
    console.log(`⏭️  Description déjà présente — vérification des nouvelles photos...`);
    const hasNewImages = product.images?.some((img) => {
      const updatedAt = new Date(img.updated_at);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return updatedAt > fiveMinutesAgo;
    });
    if (hasNewImages) {
      console.log(`  🖼️  Nouvelles photos — mise à jour des textes alt uniquement.`);
      markAsProcessed(product.id);
      await generateAndUpdateAltTexts(product);
    }
    return;
  }

  // ── Pas d'image = on ne peut rien faire ─────────────────────────────────────
  if (!product.images || product.images.length === 0) {
    console.log(`⏭️  Aucune image — SEO non généré.`);
    return;
  }

  console.log(`✅ Déclenchement SEO : produit publié, description vide, ${product.images.length} photo(s).`);
  markAsProcessed(product.id);
  await processProduct(product);
}

async function generateAndUpdateAltTexts(product) {
  try {
    const altResults = await generateAltTexts(product);
    for (const { imageId, altText } of altResults) {
      if (!altText) continue;
      await delay(300);
      await updateImageAlt(product.id, imageId, altText);
    }
    console.log(`  📷 ${altResults.filter((r) => r.altText).length} texte(s) alt mis à jour`);
  } catch (err) {
    console.error("  ❌ Erreur textes alt :", err.message);
  }
}

async function processProduct(product) {
  const errors = [];

  await generateAndUpdateAltTexts(product);

  try {
    const seoContent = await generateSEOContent(product, {});
    await delay(300);
    await updateProductSEO(product.id, seoContent);
    console.log("  📝 Description + meta SEO + titre mis à jour");

    if (seoContent.keywords?.length > 0) {
      await delay(300);
      await addProductTags(product.id, product.tags, seoContent.keywords);
      console.log(`  🏷️  Tags ajoutés : ${seoContent.keywords.join(", ")}`);
    }
  } catch (err) {
    errors.push(`SEO content : ${err.message}`);
    console.error("  ❌ Erreur SEO content :", err.message);
  }

  if (errors.length === 0) {
    console.log(`✨ Produit "${product.title}" entièrement optimisé !\n`);
  } else {
    console.warn(`⚠️  Produit "${product.title}" traité avec ${errors.length} erreur(s) :`, errors);
  }
}
