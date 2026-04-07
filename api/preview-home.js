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
  const nb_users = clean(body.nb_users);
  const qa1 = clean(body.qa1);
  const qa2 = clean(body.qa2);
  const qa3 = clean(body.qa3);
  const qa4 = clean(body.qa4);

  return `Tu es un expert en design web et en analyse de besoin produit.
Analyse le besoin du prospect et génère UNE SEULE page HTML — 
la plus représentative de son projet.

ANALYSE DU BESOIN :
- Lis attentivement la description
- Détermine toi-même si c'est un SaaS ou un site vitrine
- Si le prospect décrit des fonctionnalités d'outil (dashboard, automatisation, 
  gestion de données, workflow, connexion utilisateur) → c'est un SaaS
  même s'il a coché 'je ne sais pas' ou 'site web'
- Ne génère QU'UNE seule vue, la plus impactante et représentative

DONNÉES :
Prénom : ${prenom}
Nom du projet : ${nom}
Secteur : ${secteur}
Couleurs : ${couleurs}
Style : ${style}
Utilisateurs estimés : ${nb_users}

Description :
Objectif : ${qa1}
Utilisateurs cibles : ${qa2}
Fonctionnalités / pages : ${qa3}
Références visuelles : ${qa4}

SI SAAS — génère la vue principale après connexion :
- Header avec logo ${nom} + onglets de navigation nommés selon le métier décrit
  (ex pour RH: Candidatures / Offres / Analytics / Paramètres)
  (ex pour finance: Portefeuille / Transactions / Rapports / Alertes)
  Ces onglets sont VISUELS UNIQUEMENT, non cliquables
- La vue principale décrite dans qa1/qa3
- Données fictives réalistes et contextuelles
- Design applicatif moderne : cards, stats, tableaux, sidebar ou top nav
- Prénom du prospect utilisé dans l'interface (Bonjour ${prenom})

SI SITE VITRINE — génère la landing page :
- Hero impactant avec titre accrocheur lié au secteur
- 3-4 sections pertinentes au besoin
- CTA clairs et contextuels

RÈGLES :
- Langue : celle du prospect dans ses réponses
- Couleurs : ${couleurs} en priorité, sinon adapte au secteur
- Données : invente des exemples fictifs réalistes
- Tous les <a> : href='#', pointer-events:none dans le style
- CSS dans <style>, aucun JS, aucun fichier externe
- Design moderne et professionnel
- UNIQUEMENT le HTML brut, première ligne = <!DOCTYPE html>`;
}
