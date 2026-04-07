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

  const prenom = String(brief?.prenom ?? '').trim() || '—';
  const nomFamille = String(brief?.nom ?? '').trim() || '—';
  const emailUser = String(brief?.email ?? '').trim() || '—';
  const phone = String(brief?.phone ?? '').trim() || '—';
  const previewUrl = String(brief?.preview_url ?? '').trim() || '—';
  const typeProjet = brief?.type_projet != null && brief.type_projet !== '' ? String(brief.type_projet) : '—';
  const secteur = brief?.secteur != null && brief.secteur !== '' ? String(brief.secteur) : '—';
  const couleurs =
    Array.isArray(brief?.couleurs) && brief.couleurs.length
      ? brief.couleurs.join(', ')
      : '—';
  const styles =
    Array.isArray(brief?.style) && brief.style.length ? brief.style.join(', ') : '—';
  const nbUsers = brief?.nb_users != null && brief.nb_users !== '' ? String(brief.nb_users) : '—';
  const qaLine = (v) =>
    v != null && String(v).trim() !== '' ? String(v).trim() : '—';

  const lines = [
    'Une préview vient d’être générée sur le tunnel /preview.',
    '',
    '— Identité & contact —',
    `Prénom : ${prenom}`,
    `Nom : ${nomFamille}`,
    `Email utilisateur : ${emailUser}`,
    `Téléphone : ${phone}`,
    '',
    '— Projet —',
    `Nom du projet : ${nomProjet}`,
    `Type de projet : ${typeProjet}`,
    `Secteur : ${secteur}`,
    `Couleurs choisies : ${couleurs}`,
    `Style choisi : ${styles}`,
    `Nombre d'utilisateurs : ${nbUsers}`,
    '',
    '— Réponses (Q1 à Q4) —',
    `Q1 (objectif) : ${qaLine(brief?.qa1)}`,
    `Q2 (utilisateurs cibles) : ${qaLine(brief?.qa2)}`,
    `Q3 (fonctionnalités / pages) : ${qaLine(brief?.qa3)}`,
    `Q4 (références visuelles) : ${qaLine(brief?.qa4)}`,
    '',
    `Lien préview : ${previewUrl}`,
    '',
    'Le code source complet de la page d’accueil (même rendu que pour l’utilisateur) est en pièce jointe.',
  ];

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
