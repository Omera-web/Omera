// api/contact.js
import { Resend } from 'resend';

export default async function handler(req, res) {
  // Ping rapide pour vérifier que la fonction tourne
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, msg: 'Contact API up' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    // --- lecture du body (fonctionne avec fetch JSON)
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

    // --- envoi email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return res.status(500).json({ error: 'RESEND_API_KEY manquante (env Vercel)' });
    }

    const resend = new Resend(resendKey);
    const subject = `Nouveau message — ${name}`;
    const text = [
      'Omera — Nouveau contact',
      `Nom: ${name}`,
      `Email: ${email}`,
      `Téléphone: ${phone || '—'}`,
      'Message:',
      message
    ].join('\n');

    const html = `
      <div style="font-family:Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial;line-height:1.6">
        <h2>Nouveau message — Omera</h2>
        <p><b>Nom:</b> ${escapeHtml(name)}</p>
        <p><b>Email:</b> ${escapeHtml(email)}</p>
        <p><b>Téléphone:</b> ${escapeHtml(phone || '—')}</p>
        <p><b>Message:</b><br/>${escapeHtml(message).replace(/\n/g,'<br/>')}</p>
      </div>`;

    // Utilise l’adresse “onboarding@resend.dev” (fonctionne sans vérifier un domaine)
    const sendRes = await resend.emails.send({
      from: 'Omera <onboarding@resend.dev>',
      to: 'Contact.OmeraFrance@gmail.com',
      reply_to: email,
      subject,
      text,
      html
    });

    // Resend peut renvoyer une erreur structurée
    if (sendRes?.error) {
      console.error('Resend error:', sendRes.error);
      return res.status(502).json({ error: `Erreur Resend: ${sendRes.error.message || 'unknown'}` });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('API /api/contact failed:', err);
    return res.status(500).json({ error: err?.message || 'Erreur serveur' });
  }
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
