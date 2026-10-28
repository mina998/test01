import { connect } from 'cloudflare:sockets';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const b64 = (value) => btoa(String.fromCharCode(...encoder.encode(value)));
const isEmail = (value) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
const oneLine = (value) => value.replace(/[\r\n]+/g, ' ').trim();

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname !== '/api/contact') return env.ASSETS.fetch(request);
        if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

        const form = await request.formData();
        // Hidden field that people never fill in; bots usually do.
        if (form.get('website')) return json({ ok: true });

        const name = oneLine(String(form.get('name') ?? '')).slice(0, 100);
        const email = String(form.get('email') ?? '').trim();
        const message = String(form.get('message') ?? '').trim();

        if (!name || !isEmail(email) || !message || message.length > 5000) {
            return json({ ok: false, error: '请填写姓名、有效邮箱和留言（5000 字以内）' }, 400);
        }

        try {
            await sendMail(env, {
                replyTo: email,
                subject: `网站表单：${name}`,
                text: `姓名：${name}\n邮箱：${email}\n\n${message}`,
            });
            return json({ ok: true });
        } catch (error) {
            console.error(error instanceof Error ? error.message : error);
            return json({ ok: false, error: '发送失败，请稍后再试' }, 502);
        }
    },
};

// Implicit TLS on port 465. Workers cannot open outbound connections on port 25.
async function sendMail(env, { replyTo, subject, text }) {
    const from = env.SMTP_USER;
    const to = env.MAIL_TO;
    const socket = connect(
        { hostname: env.SMTP_HOST, port: Number(env.SMTP_PORT || 465) },
        { secureTransport: 'on' },
    );
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    let buffer = '';

    async function readReply() {
        while (true) {
            const lines = buffer.split('\r\n');
            const last = lines.findIndex((line, i) => i < lines.length - 1 && /^\d{3} /.test(line));
            if (last !== -1) {
                buffer = lines.slice(last + 1).join('\r\n');
                return { code: Number(lines[last].slice(0, 3)), reply: lines.slice(0, last + 1).join('\n') };
            }
            const { value, done } = await reader.read();
            if (done) throw new Error('SMTP connection closed');
            buffer += decoder.decode(value, { stream: true });
        }
    }

    async function command(line, expected, label) {
        if (line !== null) await writer.write(encoder.encode(`${line}\r\n`));
        const { code, reply } = await readReply();
        if (code !== expected) throw new Error(`SMTP ${label} failed: ${reply}`);
    }

    const domain = from.split('@')[1];
    const body = b64(text).replace(/.{1,76}/g, '$&\r\n');
    const data = [
        `From: ${from}`,
        `To: ${to}`,
        `Reply-To: ${replyTo}`,
        `Subject: =?UTF-8?B?${b64(subject)}?=`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: <${crypto.randomUUID()}@${domain}>`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        body,
    ].join('\r\n');

    try {
        await command(null, 220, 'greeting');
        await command(`EHLO ${domain}`, 250, 'EHLO');
        await command(`AUTH PLAIN ${b64(`\0${from}\0${env.SMTP_PASS}`)}`, 235, 'AUTH');
        await command(`MAIL FROM:<${from}>`, 250, 'MAIL FROM');
        await command(`RCPT TO:<${to}>`, 250, 'RCPT TO');
        await command('DATA', 354, 'DATA');
        await command(`${data}.`, 250, 'message');
        await command('QUIT', 221, 'QUIT');
    } finally {
        await socket.close();
    }
}
