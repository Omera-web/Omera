// api/contact.js
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const TO = 'Contact.OmeraFrance@gmail.com';
const FROM = 'Omera <onboarding@resend.dev>';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    // Body: utilise req.body si dispo, sinon parse le flux HTTP
    let body = req.body;
    if (!body) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString('utf8');
      body = raw ? JSON.parse(raw) : {};
    }

    const { name, email, phone, message } = body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Champs requis manquants.' });
    }

    const subject = `Nouveau message — ${name}`;

    const html = `...`; // (ton HTML d'email tel que dans ton message)
    const text = [
      `Omera — Nouveau contact`,
      `Nom: ${name}`,
      `Email: ${email}`,
      `Téléphone: ${phone || '—'}`,
      ``,
      `Message:`,
      `${message}`
    ].join('\n');

    const send = await resend.emails.send({
      from: FROM,
      to: TO,
      reply_to: email,
      subject,
      html,
      text
    });

    if (send?.error) {
      return res.status(500).json({ error: 'Erreur lors de l’envoi', detail: send.error });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erreur serveur :', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
