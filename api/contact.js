// api/contact.js
import { Resend } from 'resend';

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
        will_send_from: 'onboarding@resend.dev',
        will_send_to: to,
        note: 'En mode test Resend, "to" doit être exactement le mail du compte Resend.'
      }
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    // lecture body JSON
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

    // === CONFIG DESTINATAIRE ===
    // 1) On lit d’abord l’ENV, sinon on prend ta boîte Gmail (en minuscules)
    const ACCOUNT_EMAIL = (process.env.RECEIVER_EMAIL || 'contact.omerafrance@gmail.com')
      .trim().toLowerCase();

    const FROM = 'onboarding@resend.dev'; // obligatoire en mode test
    const TO = [ACCOUNT_EMAIL];           // UN SEUL destinataire, exactement l'email du compte Resend

    const subject = `Demande de projet — ${name}`;
    const text = [
      `Nom: ${name}`,
      `Email: ${email}`,
      phone ? `Téléphone: ${phone}` : null,
      '',
      'Message:',
      message,
    ].filter(Boolean).join('\n');

    // petit log serveur (visible dans Vercel > Logs > Functions)
    console.log('[contact] Sending to:', TO[0], 'from:', FROM);

    const { error } = await resend.emails.send({
      from: FROM,
      to: TO,
      subject,
      text,
      reply_to: email,
    });

    if (error) {
      return res.status(502).json({
        error: `Resend: ${error.message || String(error)}`,
        debug: { tried_to: TO[0], from: FROM }
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
