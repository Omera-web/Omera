/**
 * Génère uniquement la page d'accueil (HTML) via l'API Google Gemini Flash.
 * La clé GEMINI_API_KEY doit rester côté serveur (variables d'environnement).
 * L’e-mail « nouvelle préview » (tous les champs du brief + PJ HTML) est envoyé par api/preview-notify.js après chaque génération (y compris repli statique).
 */

const GEMINI_GENERATE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

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
      gemini_key_configured: !!process.env.GEMINI_API_KEY,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY manquante (voir .env.example)' });
  }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  }

  const userPrompt = buildUserPrompt(body);
  const combinedText = `${SYSTEM_PROMPT}\n\n${userPrompt}`;

  try {
    const geminiUrl = `${GEMINI_GENERATE_URL}?key=${encodeURIComponent(apiKey)}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: combinedText }] }],
        generationConfig: {
          maxOutputTokens: 4000,
          temperature: 0.7,
        },
      }),
    });

    const geminiJson = await geminiRes.json().catch(() => ({}));

    if (!geminiRes.ok) {
      const errMsg =
        geminiJson?.error?.message ||
        geminiJson?.error ||
        geminiJson?.message ||
        `Gemini HTTP ${geminiRes.status}`;
      console.error('[preview-home] Gemini error:', errMsg);
      return res.status(502).json({ error: String(errMsg) });
    }

    const text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text || typeof text !== 'string') {
      const blockReason = geminiJson?.promptFeedback?.blockReason;
      return res.status(502).json({
        error: blockReason
          ? `Réponse bloquée ou vide (${blockReason})`
          : 'Réponse vide du modèle',
      });
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
  const nom = clean(body.nom_projet);
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
  const qa1 = clean(body.qa1);
  const qa2 = clean(body.qa2);
  const qa3 = clean(body.qa3);
  const qa4 = clean(body.qa4);

  return `Analyse si c'est un SaaS ou site vitrine selon la description.

La page doit être conçue pour s'afficher dans une fenêtre de 980px de large 
et environ 600px de hauteur visible. Tout le contenu principal doit être 
visible sans scroll. Utilise des tailles de police raisonnables 
(body 14-15px max) pour que tout rentre bien.

Données : Prénom=${prenom}, Nom=${nom}, Secteur=${secteur}, 
Couleurs=${couleurs}, Style=${style}, Objectif=${qa1}, 
Utilisateurs=${qa2}, Fonctionnalités=${qa3}, Références=${qa4}

SI SAAS : génère OBLIGATOIREMENT cette structure :
1. Top navbar fixe avec : logo ${nom} à gauche, 
   puis 4-5 onglets de navigation NOMMÉS selon le métier 
   (ex RH: Candidatures/Offres/Analytics/Paramètres),
   puis avatar 'Bonjour ${prenom}' à droite
2. Sidebar gauche avec les mêmes onglets en version icône+texte
3. Zone principale avec la vue décrite dans qa1/qa3, 
   données fictives réalistes, cards, stats, tableaux

SI SITE : landing page avec hero + 3 sections + CTA

RÈGLES : href='#' partout, pointer-events:none, 
CSS dans <style>, pas de JS, pas de fichiers externes,
langue du prospect, couleurs ${couleurs},
UNIQUEMENT HTML brut, première ligne = <!DOCTYPE html>`;
}
