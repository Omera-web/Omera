/**
 * Génère uniquement la page d'accueil (HTML) via l'API Anthropic.
 * La clé ANTHROPIC_API_KEY doit rester côté serveur (variables d'environnement).
 * L’e-mail « nouvelle préview » est envoyé par api/preview-notify.js après chaque génération (y compris repli statique).
 */

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      msg: 'Preview home API',
      anthropic_key_configured: !!process.env.ANTHROPIC_API_KEY,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante (voir .env.example)' });
  }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  }

  const model =
    process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022';

  const userPrompt = buildPrompt(body);

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    const anthropicJson = await anthropicRes.json().catch(() => ({}));

    if (!anthropicRes.ok) {
      const errMsg =
        anthropicJson?.error?.message ||
        anthropicJson?.message ||
        `Anthropic HTTP ${anthropicRes.status}`;
      console.error('[preview-home] Anthropic error:', errMsg);
      return res.status(502).json({ error: errMsg });
    }

    const text = anthropicJson?.content?.[0]?.text;
    if (!text || typeof text !== 'string') {
      return res.status(502).json({ error: 'Réponse vide du modèle' });
    }

    const html = extractHtmlFromResponse(text);
    if (!html || html.length < 80) {
      return res.status(502).json({ error: 'HTML extrait invalide ou trop court' });
    }

    return res.status(200).json({ html });
  } catch (e) {
    console.error('[preview-home]', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

function buildPrompt(body) {
  return `Tu es un expert en design d'interfaces web. Génère UNE SEULE page d'accueil en HTML COMPLET (document valide) pour une prévisualisation de projet, entièrement en français.

Contraintes strictes :
- Un seul fichier HTML avec des balises <style> dans le <head> (CSS inline uniquement, aucun fichier externe, aucun JavaScript).
- Ambiance sombre premium (fond proche de #0b0f19, texte clair, bon contraste).
- Couleur d'accent : utilise la couleur principale fournie dans les données (couleurs[0] ou équivalent) pour boutons et highlights.
- Tous les liens <a> doivent avoir href="#" et le bloc CSS doit inclure : a{pointer-events:none;cursor:default}
- Aucun script, aucune iframe, aucun chargement externe (pas de Google Fonts en URL ; utilise system-ui ou stack système dans le CSS).
- Sections pertinentes (héro, valeur, peut-être témoignage fictif ou CTA) adaptées au secteur et aux réponses utilisateur.
- Design responsive (media queries si nécessaire).

Données du projet à exploiter pour le contenu et le ton (personnalisation réelle) :
${JSON.stringify(body, null, 2)}

Réponds UNIQUEMENT avec le code HTML complet du document, sans texte avant ou après. Si tu utilises un bloc markdown, entoure uniquement le HTML dans \`\`\`html ... \`\`\`.`;
}

function extractHtmlFromResponse(text) {
  let s = String(text).trim();
  const fence = s.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  return s;
}
