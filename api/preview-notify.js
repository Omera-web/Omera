/**
 * Envoie un e-mail au propriétaire du site (RECEIVER_EMAIL, comme /api/contact)
 * à chaque nouvelle préview générée, avec le HTML source de la page d'accueil en pièce jointe.
 */

import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      msg: 'Preview notify API',
      resend_configured: !!process.env.RESEND_API_KEY,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  }

  const { brief = {}, html = '' } = body || {};
  const htmlStr = typeof html === 'string' ? html : '';

  if (!htmlStr || htmlStr.length < 40) {
    return res.status(400).json({ error: 'html manquant ou trop court' });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'RESEND_API_KEY manquante' });
  }

  const to = (process.env.RECEIVER_EMAIL || 'contact.omerafrance@gmail.com')
    .trim()
    .toLowerCase();
  const FROM = 'onboarding@resend.dev';

  const nomProjet =
    String(brief.nom_projet || 'Projet sans nom').trim() || 'Projet sans nom';
  const safeFile = nomProjet
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'preview';

  const subject = `Nouvelle préview générée — ${nomProjet}`;

  const lines = [
    'Une préview vient d’être générée sur le tunnel /preview.',
    '',
    '— Récapitulatif (brief) —',
    `Projet : ${nomProjet}`,
    `Type : ${brief?.type_projet ?? '—'}`,
    `Secteur : ${brief?.secteur ?? '—'}`,
    `Email utilisateur : ${brief?.email ?? '—'}`,
    `Nom : ${[brief?.prenom, brief?.nom].filter(Boolean).join(' ').trim() || '—'}`,
    `Utilisateurs estimés : ${brief?.nb_users ?? '—'}`,
    `Couleurs : ${Array.isArray(brief?.couleurs) ? brief.couleurs.join(', ') : '—'}`,
    `Styles : ${Array.isArray(brief?.style) ? brief.style.join(', ') : '—'}`,
    '',
    '— Objectifs & réponses —',
    brief?.qa1 ? `Q1 : ${brief.qa1}` : null,
    brief?.qa2 ? `Q2 : ${brief.qa2}` : null,
    brief?.qa3 ? `Q3 : ${brief.qa3}` : null,
    brief?.qa4 ? `Q4 : ${brief.qa4}` : null,
    '',
    'Le code source complet de la page d’accueil (même rendu que pour l’utilisateur) est en pièce jointe.',
  ].filter(Boolean);

  const plain = lines.join('\n');
  const htmlBuf = Buffer.from(htmlStr, 'utf8');

  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject,
      text: plain,
      attachments: [
        {
          filename: `${safeFile}-accueil.html`,
          content: htmlBuf,
          contentType: 'text/html; charset=utf-8',
        },
      ],
    });

    if (error) {
      console.error('[preview-notify] Resend:', error);
      return res.status(502).json({ error: error.message || String(error) });
    }

    console.log('[preview-notify] Mail envoyé à', to);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[preview-notify]', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
