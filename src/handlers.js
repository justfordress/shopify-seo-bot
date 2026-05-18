import { generateAltTexts, generateSEOContent } from "./ai.js";
import { updateProductSEO, setImageAltText } from "./shopify.js";

// ── Anti-boucle : cooldown de 5 min par produit ──────────────────────────────
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

/**
 * Déclenchement : produit publié sur le canal "Boutique en ligne"
 * = webhook products/update avec published_at non null
 */
export async function handleProductUpdate(product, topic) {
  const productId = product.id;
  const productTitle = product.title;

  // ── 0. Anti-boucle ──────────────────────────────────────────────────────────
  if (isOnCooldown(productId)) {
    console.log(`🔄 "${productTitle}" ignoré — cooldown actif (mis à jour par le bot)`);
    return;
  }

  // ── 1. Condition de déclenchement : publié sur boutique en ligne ─────────────
  // published_at est null si le produit est en brouillon / non publié
  if (!product.published_at) {
    console.log(`⏭️  "${productTitle}" ignoré — produit non publié (published_at null)`);
    return;
  }

  // On vérifie que c'est bien une NOUVELLE publication et pas juste une modif
  // En comparant published_at et updated_at (moins de 60 secondes d'écart = vient d'être publié)
  const publishedAt = new Date(product.published_at).getTime();
  const updatedAt = new Date(product.updated_at).getTime();
  const diffSeconds = Math.abs(updatedAt - publishedAt) / 1000;

  if (diffSeconds > 60) {
    console.log(`⏭️  "${productTitle}" ignoré — déjà publié depuis ${Math.round(diffSeconds)}s (pas une nouvelle publication)`);
    return;
  }

  console.log(`✅ Nouvelle publication détectée pour "${productTitle}"`);

  // ── 2. Récupération des images ──────────────────────────────────────────────
  const images = product.images || [];
  if (images.length === 0) {
    console.log(`⚠️  Pas d'image sur "${productTitle}" — annulé`);
    return;
  }

  console.log(`🖼️  ${images.length} image(s) trouvée(s)`);

  // Marque immédiatement pour bloquer les webhooks en retour
  markAsProcessed(productId);

  // ── 3. Contexte : composition depuis les metafields si dispo ─────────────────
  const metafields = product.metafields || [];
  const compositionField = metafields.find(
    (m) => m.key === "composition_et_entretien" || m.key === "composition" ||
      (m.namespace === "custom" && m.key.includes("composition"))
  );
  const compositionValue = compositionField?.value?.trim() || "";

  if (compositionValue) {
    console.log(`📋 Composition : "${compositionValue.substring(0, 60)}..."`);
  } else {
    console.log(`📋 Pas de composition dans le webhook — génération sans ce contexte`);
  }

  // ── 4. Génération des textes alt ────────────────────────────────────────────
  console.log(`\n🤖 Génération des textes alt...`);
  for (const image of images) {
    try {
      const altText = await generateAltTexts(image.src, productTitle, compositionValue);
      await setImageAltText(productId, image.id, altText);
      console.log(`  ✅ Image ${image.id} : "${altText}"`);
    } catch (err) {
      console.warn(`  ⚠️  Image ${image.id} ignorée : ${err.message}`);
    }
  }

  // ── 5. Génération du contenu SEO ────────────────────────────────────────────
  console.log(`\n✍️  Génération du contenu SEO...`);

  const context = {
    title: productTitle,
    composition: compositionValue,
    imageUrl: images[0]?.src,
  };

  const seoContent = await generateSEOContent(context);

  // ── 6. Mise à jour Shopify ──────────────────────────────────────────────────
  await updateProductSEO(productId, seoContent);

  console.log(`\n✨ Produit "${productTitle}" entièrement optimisé !`);
  console.log(`   Titre SEO : ${seoContent.meta_title}`);
  console.log(`   Meta desc : ${seoContent.meta_description?.substring(0, 60)}...`);
}
