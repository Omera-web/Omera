/**
 * Génère uniquement la page d'accueil (HTML) via l'API Anthropic.
 * La clé ANTHROPIC_API_KEY doit rester côté serveur (variables d'environnement).
 * L’e-mail « nouvelle préview » est envoyé par api/preview-notify.js après chaque génération (y compris repli statique).
 */

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `IMPORTANT: Réponds UNIQUEMENT avec le code HTML brut. 
Zéro markdown, zéro backtick, zéro explication. 
La première ligne de ta réponse doit être <!DOCTYPE html>

Tu es un expert en design web moderne. Tu génères des pages HTML complètes avec CSS inline uniquement. Tes créations sont visuellement impressionnantes, uniques et parfaitement adaptées au secteur et aux besoins du client.
Réponds UNIQUEMENT avec le code HTML complet, sans markdown, sans explication.`;

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

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const userPrompt = buildUserPrompt(body);

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
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
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

    let html = String(text).trim();
    if (html.startsWith('```html')) html = html.slice(7);
    if (html.startsWith('```')) html = html.slice(3);
    if (html.endsWith('```')) html = html.slice(0, -3);
    html = html.trim();

    if (!html || html.length < 80) {
      return res.status(502).json({ error: 'HTML extrait invalide ou trop court' });
    }

    return res.status(200).json({ html });
  } catch (e) {
    console.error('[preview-home]', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

function clean(s) {
  return String(s ?? '').trim();
}

function buildUserPrompt(body) {
  const prenom = clean(body.prenom);
  const nomProjet = clean(body.nom_projet);
  const type = clean(body.type_projet);
  const secteur = clean(body.secteur);
  const couleursArr = Array.isArray(body.couleurs) ? body.couleurs.filter(Boolean) : [];
  const couleurs =
    couleursArr.length > 0
      ? couleursArr.join(', ')
      : '(non précisé — choisis des couleurs adaptées au secteur)';
  const styleArr = Array.isArray(body.style) ? body.style.filter(Boolean) : [];
  const style =
    styleArr.length > 0
      ? styleArr.join(', ')
      : '(non précisé — choisis ce qui correspond au secteur)';
  const nb_users = clean(body.nb_users);
  const qa1 = clean(body.qa1);
  const qa2 = clean(body.qa2);
  const qa3 = clean(body.qa3);
  const qa4 = clean(body.qa4);

  return `Crée une page d'accueil HTML complète et moderne pour ce projet :

Prénom du client : ${prenom}
Nom du projet : ${nomProjet}
Type de projet : ${type}
Secteur : ${secteur}
Couleurs souhaitées : ${couleurs}
Ambiance / style : ${style}
Nombre d'utilisateurs : ${nb_users}

Questions du client :
- Objectif principal : ${qa1}
- Utilisateurs cibles : ${qa2}
- Pages ou fonctionnalités voulues : ${qa3}
- Références visuelles appréciées : ${qa4}

Génère une page d'accueil qui répond précisément à ces besoins.
Adapte le design, les couleurs, le contenu et le style au secteur et aux réponses.
Tous les liens doivent avoir href='#' et pointer-events:none.
CSS entièrement dans un bloc <style>. Aucun JS. Aucun fichier externe.`;
}
