import type { APIRoute } from 'astro';

export const prerender = true;

export const POST: APIRoute = async ({ request }) => {
  const data = await request.formData();
  const name = data.get('name')?.toString().trim() ?? '';
  const email = data.get('email')?.toString().trim() ?? '';
  const notes = data.get('notes')?.toString().trim() ?? '';

  if (!name || !email || !notes) {
    return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return new Response(JSON.stringify({ error: 'invalid_email' }), { status: 400 });
  }

  const RESEND_API_KEY = import.meta.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'config_error' }), { status: 500 });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Sonabrief Site <hello@sonabrief.com>',
      to: ['hello@sonabrief.com'],
      reply_to: email,
      subject: `Enterprise inquiry — ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${notes}`,
    }),
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'send_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
