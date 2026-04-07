/**
 * Demande « Être recontacté » depuis le tunnel /preview (sans les contraintes de /api/contact).
 * Envoie un e-mail à RECEIVER_EMAIL (ex. Contact.OmeraFrance@gmail.com) via Resend.
 */

import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      msg: 'Recontact API',
      resend_configured: !!process.env.RESEND_API_KEY,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    let body = req.body;
    if (!body || typeof body !== 'object') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    }

    const name = String(body?.name ?? '').trim();
    const email = String(body?.email ?? '').trim();
    const message = String(body?.message ?? '').trim();
    const projet = String(body?.projet ?? '').trim();
    const accountEmail = String(body?.accountEmail ?? '').trim();

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Champs requis : name, email, message' });
    }

    const key = process.env.RESEND_API_KEY;
    if (!key) return res.status(500).json({ error: 'RESEND_API_KEY manquante' });

    const to = (process.env.RECEIVER_EMAIL || 'contact.omerafrance@gmail.com').trim().toLowerCase();
    const FROM = 'onboarding@resend.dev';
    const nomProjet = projet || 'Projet sans nom';
    const subject = `Demande de recontact — ${nomProjet}`;

    const plain = [
      'Demande de recontact depuis le tunnel préview (/preview)',
      '',
      `Nom du prospect : ${name}`,
      `Email du prospect : ${email}`,
      '',
      'Message :',
      message,
      '',
      `Nom du projet : ${nomProjet}`,
      accountEmail ? `Email du compte (Supabase) : ${accountEmail}` : 'Email du compte (Supabase) : —',
      '',
    ].join('\n');

    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject,
      text: plain,
      reply_to: email,
    });

    if (error) {
      console.error('[recontact] Resend:', error);
      return res.status(502).json({ error: error.message || String(error) });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[recontact]', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
