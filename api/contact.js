// api/contact.js
import { Resend } from 'resend';

// force explicitement le runtime côté fonction
export const config = { runtime: 'nodejs20.x' };

const resend = new Resend(process.env.RESEND_API_KEY);
const TO = 'Contact.OmeraFrance@gmail.com';
const FROM = 'Omera <onboarding@resend.dev>'; // marche sans config de domaine


export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, email, phone, message } = req.body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Champs requis manquants.' });
    }

    const subject = `Nouveau message — ${name}`;
    const html = `
      <table style="width:100%;max-width:640px;margin:0 auto;font-family:Inter,Segoe UI,Arial,sans-serif;background:#0b0f19;color:#e8e9f1;border-radius:16px;overflow:hidden">
        <tr><td style="padding:24px;background:linear-gradient(135deg,#7c5cff,#9f7aff);color:#fff;font-weight:800;font-size:20px">
          Omera — Nouveau contact
        </td></tr>
        <tr><td style="padding:20px">
          <p style="margin:0 0 8px;opacity:.85">Message depuis le site.</p>
          <div style="margin:14px 0;padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02))">
            <p style="margin:0 0 6px"><b>Nom :</b> ${escapeHtml(name)}</p>
            <p style="margin:0 0 6px"><b>Email :</b> ${escapeHtml(email)}</p>
            <p style="margin:0 0 6px"><b>Téléphone :</b> ${escapeHtml(phone || '—')}</p>
            <p style="margin:12px 0 6px"><b>Message :</b></p>
            <pre style="white-space:pre-wrap;font:inherit;margin:0">${escapeHtml(message)}</pre>
          </div>
          <p style="margin:16px 0 0;opacity:.7">Réponds à ce mail pour contacter directement l’expéditeur.</p>
        </td></tr>
        <tr><td style="padding:16px;text-align:center;color:#a7abbe;font-size:12px;border-top:1px solid rgba(255,255,255,.06)">
          © ${new Date().getFullYear()} Omera
        </td></tr>
      </table>
    `;

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

    if (send?.error) return res.status(500).json({ error: 'Send error', detail: send.error });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}

function escapeHtml(str='') {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
