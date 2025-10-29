// /api/contact.js
import { Resend } from 'resend';
export const config = { runtime: 'nodejs20.x' };

// Limites prudentes (compatibles plan gratuit & boîtes mail)
// ~10 Mo par fichier ; ~20 Mo au total
const MAX_PER_FILE = 10 * 1024 * 1024;
const MAX_TOTAL    = 20 * 1024 * 1024;

// Formats souvent acceptés côté mail (liste ouverte)
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/png','image/jpeg','image/jpg','image/gif','image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv','text/plain'
]);

export default async function handler(req, res) {
  // --- MODE DEBUG EN GET ---
  if (req.method === 'GET') {
    const envKey = !!process.env.RESEND_API_KEY;
    const to = (process.env.RECEIVER_EMAIL || 'contact.omerafrance@gmail.com').trim().toLowerCase();
    return res.status(200).json({
      ok: true,
      msg: 'Contact API up',
      debug: {
        env_RESEND_API_KEY_present: envKey,
        will_send_from: 'Omera <onboarding@resend.dev>',
        will_send_to: to,
        note: 'En mode test Resend, "to" doit être exactement l’email de TON compte Resend.'
      }
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    // lecture body JSON (compatible body non-parsé)
    let body = req.body;
    if (!body || typeof body !== 'object') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    }

    const { name, email, phone, message, attachments = [] } = body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Merci de renseigner nom, email et message.' });
    }

    const key = process.env.RESEND_API_KEY;
    if (!key) return res.status(500).json({ error: 'RESEND_API_KEY manquante' });

    const resend = new Resend(key);

    // === DESTINATAIRE ===
    // En mode test, le destinataire DOIT être l’email de ton compte Resend.
    const ACCOUNT_EMAIL = (process.env.RECEIVER_EMAIL || 'contact.omerafrance@gmail.com')
      .trim().toLowerCase();

    const FROM = 'Omera <onboarding@resend.dev>'; // expéditeur autorisé sans domaine vérifié
    const TO = [ACCOUNT_EMAIL];

    // === VALIDATION / NORMALISATION DES PJ ===
    let totalSize = 0;
    const files = [];

    if (Array.isArray(attachments)) {
      for (const a of attachments) {
        if (!a || !a.content || !a.filename) continue;
        const filename = String(a.filename).slice(0, 120) || 'piece-jointe';
        const contentType = a.contentType || 'application/octet-stream';
        // Taille approximative du base64 -> 3/4 de la longueur (sans padding) ≈ bytes
        const approxBytes = Math.floor((String(a.content).length * 3) / 4);

        // Vérifs taille
        if (approxBytes > MAX_PER_FILE) {
          return res.status(413).json({
            error: `Le fichier "${filename}" dépasse la taille autorisée (~10 Mo).`,
            hint: 'Envoyez-le directement par email à Contact.OmeraFrance@gmail.com.'
          });
        }
        totalSize += approxBytes;

        // Vérif type souple : on laisse passer si inconnu mais on priorise les types courants
        if (!ALLOWED_TYPES.has(contentType) && contentType !== 'application/octet-stream') {
          // On ne bloque pas, on normalise simplement
        }

        files.push({
          filename,
          content: String(a.content),    // base64 (sans préfixe data:)
          contentType
        });
      }
    }

    if (totalSize > MAX_TOTAL) {
      return res.status(413).json({
        error: 'La taille cumulée des pièces jointes dépasse la limite (~20 Mo).',
        hint: 'Envoyez vos fichiers volumineux directement à Contact.OmeraFrance@gmail.com.'
      });
    }

    const subject = `Demande de projet — ${name}`;
    const text = [
      `Nom: ${name}`,
      `Email: ${email}`,
      phone ? `Téléphone: ${phone}` : '',
      '',
      'Message:',
      message
    ].filter(Boolean).join('\n');

    // Log utile (Vercel > Logs > Functions)
    console.log('[contact] Sending to:', TO[0], 'from:', FROM, 'attachments:', files.length);

    const { error } = await resend.emails.send({
      from: FROM,
      to: TO,
      reply_to: email,
      subject,
      text,
      attachments: files // <-- pièces jointes envoyées
    });

    if (error) {
      return res.status(502).json({
        error: `Resend: ${error.message || String(error)}`,
        debug: { tried_to: TO[0], from: FROM, attachments: files.length }
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('API /contact error:', e);
    return res.status(500).json({
      error: 'Envoi impossible pour le moment.',
      hint: 'Vous pouvez envoyer votre message et vos fichiers directement à Contact.OmeraFrance@gmail.com.'
    });
  }
}
