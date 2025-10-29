// api/contact.js
import { Resend } from 'resend';

export const config = {
  api: {
    // Le JSON avec base64 grossit d’environ 33% : 25 Mo couvre confortablement ~20 Mo réels.
    bodyParser: { sizeLimit: '25mb' },
  },
};

export default async function handler(req, res) {
  // --- PING / DEBUG ---
  if (req.method === 'GET') {
    const envKey = !!process.env.RESEND_API_KEY;
    const to = (process.env.RECEIVER_EMAIL || 'contact.omerafrance@gmail.com').trim().toLowerCase();
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
    // --- Lecture body (JSON) ---
    let body = req.body;
    if (!body || typeof body !== 'object') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    }

    const {
      name = '',
      email = '',
      phone = '',
      message = '',
      attachments: clientAttachments,
    } = body || {};

    const clean = (s) => String(s || '').toString().trim();
    const _name = clean(name);
    const _email = clean(email);
    const _phone = clean(phone);
    const _message = clean(message);

    if (!_name || !_email || !_message) {
      return res.status(400).json({ error: 'Champs requis manquants (name, email, message)' });
    }

    const key = process.env.RESEND_API_KEY;
    if (!key) return res.status(500).json({ error: 'RESEND_API_KEY manquante' });

    // Destinataire (doit être l’adresse du compte Resend en mode test)
    const ACCOUNT_EMAIL = (process.env.RECEIVER_EMAIL || 'contact.omerafrance@gmail.com').trim().toLowerCase();

    // --- Validation / préparation des pièces jointes ---
    const MAX_FILES = 5;
    const MAX_PER_FILE = 10 * 1024 * 1024;     // 10 Mo par fichier (réels)
    const MAX_TOTAL = 20 * 1024 * 1024;        // 20 Mo cumulés (réels)
    let resendAttachments = [];
    let totalBytes = 0;

    if (Array.isArray(clientAttachments) && clientAttachments.length) {
      if (clientAttachments.length > MAX_FILES) {
        return res.status(400).json({ error: `Trop de fichiers (max ${MAX_FILES}).` });
      }

      resendAttachments = clientAttachments.map((att, idx) => {
        const filename = String(att?.filename || `fichier-${idx + 1}`);
        const b64 = String(att?.content || '');

        // Estimation taille réelle du b64 (~75% des caractères)
        const estimatedBytes = Math.floor(b64.length * 0.75);
        if (estimatedBytes > MAX_PER_FILE) {
          throw new Error(`"${filename}" dépasse la limite autorisée (${(MAX_PER_FILE / 1024 / 1024) | 0} Mo).`);
        }
        totalBytes += estimatedBytes;

        const contentType = String(att?.contentType || '');
        const content = Buffer.from(b64, 'base64');

        // Resend accepte { filename, content[, contentType] }
        return contentType
          ? { filename, content, contentType }
          : { filename, content };
      });

      if (totalBytes > MAX_TOTAL) {
        return res.status(400).json({
          error: `Taille totale des pièces jointes > ${(MAX_TOTAL / 1024 / 1024) | 0} Mo. Envoyez les plus volumineux par mail.`,
        });
      }
    }

    const resend = new Resend(key);

    const FROM = 'onboarding@resend.dev'; // obligatoire en mode test
    const TO = [ACCOUNT_EMAIL];

    const subject = `Demande de projet — ${_name}`;
    const plain = [
      `Nom: ${_name}`,
      `Email: ${_email}`,
      _phone ? `Téléphone: ${_phone}` : null,
      '',
      'Message:',
      _message,
      '',
      resendAttachments.length
        ? `Pièces jointes: ${resendAttachments.map(a => a.filename).join(', ')}`
        : null,
    ].filter(Boolean).join('\n');

    console.log('[contact] Sending to:', TO[0], 'from:', FROM, 'attachments:', resendAttachments.length);

    const { error } = await resend.emails.send({
      from: FROM,
      to: TO,
      subject,
      text: plain,
      reply_to: _email,          // <- clé correcte pour le SDK Resend
      attachments: resendAttachments,
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
