import { Resend } from 'resend';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  console.log('RESEND_API_KEY present:', !!process.env.RESEND_API_KEY);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { name, email, message } = await req.json();
  try {
    await resend.emails.send({
      from: 'Sideline Stats <info@sideline-stats.com>',
      to: 'info@sideline-stats.com',
      subject: `New message from ${name}`,
      html: `<p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Message:</strong><br/>${message}</p>`,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
