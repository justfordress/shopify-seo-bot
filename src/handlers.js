import { generateAltTexts, generateSEOContent } from "./ai.js";
import { updateProductSEO, setImageAltText } from "./shopify.js";

// ── Anti-boucle : cooldown de 5 min par produit ──────────────────────────────
// Quand le bot met à jour Shopify, Shopify envoie un nouveau webhook products/update.
// On ignore ces webhooks "en retour" grâce à ce cooldown.
const recentlyProcessed = new Map();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function isOnCooldown(productId) {
  const last = recentlyProcessed.get(String(productId));
  if (!last) return false;
  return Date.now() - last < COOLDOWN_MS;
}

function markAsProcessed(productId) {
  recentlyProcessed.set(String(productId), Date.now());
  // Nettoyage mémoire : purge les entrées expirées
  for (const [id, ts] of recentlyProcessed) {
    if (Date.now() - ts > COOLDOWN_MS) recentlyProcessed.delete(id);
  }
}

/**
 * Point d'entrée principal.
 * Déclenchement UNIQUEMENT si le metafield "Composition et entretien" est rempli.
 * Les metafields arrivent dans le payload webhook directement.
 */
export async function handleProductUpdate(product, topic) {
  const productId = product.id;
  const productTitle = product.title;

  // ── 0. Anti-boucle ──────────────────────────────────────────────────────────
  if (isOnCooldown(productId)) {
    console.log(`🔄 "${productTitle}" ignoré — cooldown actif (mis à jour par le bot)`);
    return;
  }

  // ── 1. Extraction des metafields depuis le payload webhook ──────────────────
  const metafields = product.metafields || [];

  const compositionField = metafields.find(
    (m) =>
      m.key === "composition_et_entretien" ||
      m.key === "composition" ||
      (m.namespace === "custom" && m.key.includes("composition"))
  );

  const compositionValue = compositionField?.value?.trim();

  // ── 2. Condition de déclenchement ───────────────────────────────────────────
  if (!compositionValue) {
    console.log(`⏭️  "${productTitle}" ignoré — Composition et entretien vide (${metafields.length} metafield(s) reçu(s))`);
    return;
  }

  console.log(`✅ Composition détectée : "${compositionValue.substring(0, 60)}..."`);

  // ── 3. Récupération des images ──────────────────────────────────────────────
  const images = product.images || [];
  if (images.length === 0) {
    console.log(`⚠️  Pas d'image sur "${productTitle}" — annulé`);
    return;
  }

  console.log(`🖼️  ${images.length} image(s) trouvée(s)`);

  // On marque MAINTENANT pour bloquer les webhooks en retour dès qu'on commence
  markAsProcessed(productId);

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
