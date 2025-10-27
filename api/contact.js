// api/contact.js
import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, msg: 'Contact API up' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    // --- Body JSON safe ---
    let body = req.body;
    if (!body) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    }

    const { name, email, phone, message } = body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Champs requis manquants (name, email, message)' });
    }

    const key = process.env.RESEND_API_KEY;
    if (!key) return res.status(500).json({ error: 'RESEND_API_KEY manquante' });

    const resend = new Resend(key);

    // === MODE TEST RESEND ===
    // Doit être EXACTEMENT l’email du compte Resend avec lequel cette clé a été créée.
    // Mets-le en dur en minuscules, sans espace.
    const ACCOUNT_EMAIL = 'contact.omerafrance@gmail.com';
    const TO = [ACCOUNT_EMAIL.toLowerCase().trim()];

    const FROM = 'onboarding@resend.dev'; // obligatoire en mode test
    const subject = `Demande de projet — ${name}`;
    const text = [
      `Nom: ${name}`,
      `Email: ${email}`,
      phone ? `Téléphone: ${phone}` : null,
      '',
      'Message:',
      message,
    ].filter(Boolean).join('\n');

    const { error } = await resend.emails.send({
      from: FROM,
      to: TO,            // UN SEUL destinataire: ton propre email de compte
      subject,
      text,
      reply_to: email,   // ok en mode test
    });

    if (error) {
      // on renvoie un message utile pour debug
      return res.status(502).json({
        error: `Resend: ${error.message || String(error)}`,
        debug_to: TO, // pour vérifier ce qui part réellement
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
