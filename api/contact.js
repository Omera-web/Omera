// api/contact.js
import { Resend } from 'resend';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb', // évite que Vercel coupe des petits envois
    },
  },
};

export default async function handler(req, res) {
  // --- PING / DEBUG ---
  if (req.method === 'GET') {
    const envKey = !!process.env.RESEND_API_KEY;
    const to = (process.env.RECEIVER_EMAIL || 'contact.omerafrance@gmail.com')
      .trim()
      .toLowerCase();
    return res.status(200).json({
      ok: true,
      msg: 'Contact API up',
      debug: {
        env_RESEND_API_KEY_present: envKey,
        will_send_from: 'onboarding@resend.dev',
        will_send_to: to,
        note: 'En mode test Resend, "to" doit être EXACTEMENT l’email du compte Resend.',
      },
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    // lecture du body (JSON)
    let body = req.body;
    if (!body || typeof body !== 'object') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    }

    const { name, email, phone, message, attachments: clientAttachments } = body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Champs requis manquants (name, email, message)' });
    }

    const key = process.env.RESEND_API_KEY;
    if (!key) return res.status(500).json({ error: 'RESEND_API_KEY manquante' });

    // Destinataire (doit être l’adresse de TON compte Resend en mode test)
    const ACCOUNT_EMAIL = (process.env.RECEIVER_EMAIL || 'contact.omerafrance@gmail.com')
      .trim()
      .toLowerCase();

    // --- Validation / préparation des pièces jointes ---
    // Rappels Free/standard Resend :
    // - Taille max email (après base64) ~40 Mo côté Resend.
    // - Pour rester safe sur Vercel body, on limite ici à 10 Mo PAR FICHIER et max 5 fichiers.
    const MAX_FILES = 5;
    const MAX_PER_FILE = 10 * 1024 * 1024; // 10 Mo (coté client tu affiches 15 Mo, mais ici on sécurise)

    let resendAttachments = [];

    if (Array.isArray(clientAttachments) && clientAttachments.length) {
      if (clientAttachments.length > MAX_FILES) {
        return res.status(400).json({ error: `Trop de fichiers (max ${MAX_FILES}).` });
      }

      resendAttachments = clientAttachments.map((att, idx) => {
        const filename = String(att?.filename || `fichier-${idx + 1}`);
        const b64 = String(att?.content || '');
        // estimation taille (base64 ~ +33%) -> on tolère ~10 Mo réels ≃ 13.3 Mo b64
        const estimatedBytes = Math.floor(b64.length * 0.75);
        if (estimatedBytes > MAX_PER_FILE) {
          throw new Error(`"${filename}" dépasse la limite autorisée (${(MAX_PER_FILE / 1024 / 1024) | 0} Mo).`);
        }
        // Resend accepte Buffer pour "content"
        const content = Buffer.from(b64, 'base64');
        return { filename, content };
      });
    }

    const resend = new Resend(key);

    const FROM = 'onboarding@resend.dev'; // obligatoire en mode test
    const TO = [ACCOUNT_EMAIL];

    const subject = `Demande de projet — ${name}`;
    const plain = [
      `Nom: ${name}`,
      `Email: ${email}`,
      phone ? `Téléphone: ${phone}` : null,
      '',
      'Message:',
      message,
      '',
      resendAttachments.length
        ? `Pièces jointes: ${resendAttachments.map(a => a.filename).join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    console.log('[contact] Sending to:', TO[0], 'from:', FROM, 'attachments:', resendAttachments.length);

    const { error } = await resend.emails.send({
      from: FROM,
      to: TO,
      subject,
      text: plain,             // (tu peux ajouter html si tu veux)
      replyTo: email,          // <- clé correcte pour Resend
      attachments: resendAttachments, // <- envoi des pièces jointes
    });

    if (error) {
      return res.status(502).json({
        error: `Resend: ${error.message || String(error)}`,
        debug: { tried_to: TO[0], from: FROM },
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[contact] error:', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
