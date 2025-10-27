// api/contact.js
import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, msg: 'Contact API up' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    // lecture body JSON (compatible fetch)
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

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return res.status(500).json({ error: 'RESEND_API_KEY manquante' });

    const resend = new Resend(resendKey);

    // === MODE TEST RESEND ===
    // DOIT être exactement l'email de connexion de ton compte Resend,
    // en minuscules, un seul destinataire.
    const FROM = 'onboarding@resend.dev';
    const TO = 'contact.omerafrance@gmail.com'; // <-- ton email de compte Resend, en minuscules

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
      from: FROM,        // expéditeur test
      to: [TO],          // UN SEUL destinataire, exactement ton mail Resend
      subject,
      text,
      reply_to: email,   // OK en mode test
    });

    if (error) return res.status(502).json({ error: `Resend: ${error.message || String(error)}` });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
