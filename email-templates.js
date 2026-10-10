'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const LOGO = readFileSync(join(__dirname, 'assets', 'pa-logo.png')).toString('base64');
const SITE = 'https://port.alvarezsm.com';
const TIME_ZONE = 'Europe/Paris';
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const COPY = {
  en: { locale:'en-GB', subject:'AlvarezSM — Message received', label:'MESSAGE RECEIVED', title:'Good ideas start<br>with a conversation.', intro:'Thank you for contacting AlvarezSM. Your enquiry has been received. A reply will follow at this email address.', next:'WHAT HAPPENS NEXT', nextText:'Your message will be reviewed. If you would like to add anything, simply reply to this email.', date:'Submitted', reference:'Reference', noDate:'See the email header', signature:'Interfaces with purpose.', discipline:'Front-end development · UI systems · Motion', visit:'Explore the portfolio', privacy:'Privacy policy', note:'This is an automatic confirmation from the AlvarezSM portfolio. If you did not send an enquiry, you can ignore this message.', footer:'Thoughtful design. Carefully built.' },
  es: { locale:'es-ES', subject:'AlvarezSM — Mensaje recibido', label:'MENSAJE RECIBIDO', title:'Las buenas ideas empiezan<br>con una conversación.', intro:'Gracias por contactar con AlvarezSM. Tu consulta se ha recibido. Recibirás una respuesta en esta dirección de correo.', next:'EL SIGUIENTE PASO', nextText:'Tu mensaje se revisará. Si quieres añadir algún detalle, solo tienes que responder a este correo.', date:'Enviado', reference:'Referencia', noDate:'Consulta la cabecera del correo', signature:'Interfaces con propósito.', discipline:'Desarrollo front-end · Sistemas UI · Movimiento', visit:'Explorar el portfolio', privacy:'Política de privacidad', note:'Esta es una confirmación automática del portfolio de AlvarezSM. Si no has enviado una consulta, puedes ignorar este mensaje.', footer:'Diseño con intención. Desarrollo cuidado.' },
  fr: { locale:'fr-FR', subject:'AlvarezSM — Message reçu', label:'MESSAGE REÇU', title:'Les bonnes idées commencent<br>par une conversation.', intro:'Merci de contacter AlvarezSM. Votre demande a bien été reçue. Une réponse vous sera adressée à cette adresse e-mail.', next:'LA PROCHAINE ÉTAPE', nextText:'Votre message sera étudié. Pour ajouter un détail, répondez simplement à cet e-mail.', date:'Envoyé', reference:'Référence', noDate:'Consultez l’en-tête de l’e-mail', signature:'Des interfaces qui ont du sens.', discipline:'Développement front-end · Systèmes UI · Mouvement', visit:'Explorer le portfolio', privacy:'Confidentialité', note:'Ceci est une confirmation automatique du portfolio AlvarezSM. Si vous n’avez pas envoyé de demande, vous pouvez ignorer ce message.', footer:'Un design réfléchi. Un développement soigné.' }
};

function metadata(input, copy) {
  // Date comes from the first browser submission, not a new clock read on every retry.
  // Legacy forms have no timestamp: do not invent one or alter idempotent payloads.
  const date = input.submittedAt
    ? new Intl.DateTimeFormat(copy.locale, {dateStyle:'medium', timeStyle:'short', timeZone:TIME_ZONE}).format(new Date(input.submittedAt)) + ' · ' + TIME_ZONE
    : copy.noDate;
  const reference = /^[a-f0-9-]{36}$/i.test(input.id || '') ? 'ASM-' + input.id.slice(0,8).toUpperCase() + '-' + input.id.slice(-4).toUpperCase() : '—';
  return {date, reference};
}

function frame({copy, language, label, title, intro, content, meta, note}) {
  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(label)} · AlvarezSM</title>
<style>table{border-collapse:collapse}a{color:#17634e}img{border:0;outline:none;text-decoration:none} @media only screen and (max-width:480px){.outer{padding:16px 8px!important}.pad{padding:28px 22px!important}.heading{font-size:32px!important}.brand{font-size:22px!important}.meta-cell{display:block!important;width:auto!important;padding:0 0 16px!important}.meta-last{padding-bottom:0!important}.footer-links{display:block!important;padding-top:8px!important;padding-left:0!important}}</style></head>
<body style="margin:0;padding:0;background-color:#edf2ef;color:#172c32;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;color:#edf2ef;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#edf2ef"><tr><td class="outer" align="center" style="padding:40px 12px">
<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:100%;max-width:640px;border:1px solid #d7e3dc">
<tr><td height="5" bgcolor="#76dfc1" style="height:5px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td class="pad" bgcolor="#101e25" style="padding:30px 36px;background-color:#101e25"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="80" valign="middle" style="width:80px"><table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#f7faf8" style="background-color:#f7faf8;border-radius:10px"><tr><td style="padding:8px"><img src="cid:alvarezsm-pa" alt="PA" width="56" height="42" style="display:block;width:56px;height:42px;color:#17634e;font-size:20px;font-weight:bold"></td></tr></table></td>
<td valign="middle" style="padding-left:14px"><div class="brand" style="font-size:27px;line-height:1.2;font-weight:bold;letter-spacing:-1px;color:#ffffff">AlvarezSM</div><div style="padding-top:8px;font-family:Consolas,'Courier New',monospace;font-size:10px;line-height:1.6;letter-spacing:1.8px;color:#91dfca">DESIGN &amp; DEVELOPMENT</div></td>
</tr></table></td></tr>
<tr><td class="pad" style="padding:38px 36px 32px"><div style="margin:0 0 18px;font-family:Consolas,'Courier New',monospace;font-size:11px;line-height:1.5;font-weight:bold;letter-spacing:2px;color:#17634e">${escapeHtml(label)}</div>
<h1 class="heading" style="margin:0 0 22px;font-family:Georgia,'Times New Roman',serif;font-size:39px;font-weight:normal;line-height:1.13;letter-spacing:-1.2px;color:#172c32">${title}</h1>
<p style="margin:0;font-size:15px;line-height:1.85;color:#516268">${escapeHtml(intro)}</p></td></tr>
<tr><td class="pad" bgcolor="#f2f7f4" style="padding:22px 36px;background-color:#f2f7f4;border-top:1px solid #dfe8e2;border-bottom:1px solid #dfe8e2"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td class="meta-cell" width="65%" valign="top" style="width:65%;padding-right:16px"><div style="font-size:10px;line-height:1.5;text-transform:uppercase;letter-spacing:1.6px;color:#526760">${copy.date}</div><div style="padding-top:6px;font-size:12px;line-height:1.7;color:#172c32">${escapeHtml(meta.date)}</div></td>
<td class="meta-cell meta-last" valign="top"><div style="font-size:10px;line-height:1.5;text-transform:uppercase;letter-spacing:1.6px;color:#526760">${copy.reference}</div><div style="padding-top:6px;font-family:Consolas,'Courier New',monospace;font-size:12px;line-height:1.7;color:#172c32">${escapeHtml(meta.reference)}</div></td>
</tr></table></td></tr>
<tr><td class="pad" style="padding:32px 36px">${content}</td></tr>
<tr><td class="pad" bgcolor="#101e25" style="padding:28px 36px;background-color:#101e25"><div style="font-family:Georgia,'Times New Roman',serif;font-size:23px;line-height:1.4;font-style:italic;color:#91dfca">${copy.signature}</div><div style="padding-top:12px;font-size:12px;line-height:1.9;color:#d1ded9"><strong style="color:#ffffff">AlvarezSM</strong><br>${copy.discipline}</div><div style="padding-top:20px;font-size:12px;line-height:1.9"><a href="${SITE}/" style="color:#91dfca;text-decoration:underline">${copy.visit}</a><span class="footer-links" style="padding-left:16px"><a href="${SITE}/privacy-policy.html" style="color:#d1ded9;text-decoration:underline">${copy.privacy}</a></span></div></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px"><tr><td align="center" style="padding:22px 18px 0;font-size:11px;line-height:1.8;color:#53675e">${escapeHtml(note)}<br><span style="display:inline-block;padding-top:8px;color:#466358">AlvarezSM · ${copy.footer}</span></td></tr></table>
</td></tr></table></body></html>`;
}

function makeEmails(input, config) {
  const from = `AlvarezSM <${config.from}>`;
  const attachment = () => [{filename:'alvarezsm-pa.png', content:LOGO, content_id:'alvarezsm-pa'}];
  const ownerCopy = COPY.en;
  const ownerMeta = metadata(input, ownerCopy);
  const primary = {
    from, to:[config.to], reply_to:input.email,
    subject:'AlvarezSM — New portfolio enquiry',
    text:`AlvarezSM — New portfolio enquiry\n${ownerCopy.date}: ${ownerMeta.date}\n${ownerCopy.reference}: ${ownerMeta.reference}\nSource: ${SITE}/\n\nName: ${input.name}\nEmail: ${input.email}\n\n${input.message}\n\nReply to this email to respond to the sender.\n\nAlvarezSM\n${SITE}/`,
    html:frame({copy:ownerCopy, language:'en', label:'01 / NEW ENQUIRY', title:'A new<br><em style="color:#17634e;font-weight:normal">conversation.</em>', intro:'A message has arrived through the AlvarezSM portfolio. The sender’s details and enquiry are below.', meta:ownerMeta, note:'Contact notification from port.alvarezsm.com. Reply directly to respond to the sender.',
      content:`<div style="font-size:10px;font-weight:bold;letter-spacing:1.6px;line-height:1.6;color:#526760">FROM</div><p style="margin:8px 0 4px;font-size:20px;line-height:1.5;font-weight:bold;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(input.name)}</p><p style="margin:0 0 26px;font-size:14px;line-height:1.7;overflow-wrap:anywhere;word-break:break-word"><a href="mailto:${encodeURIComponent(input.email).replace('%40','@')}" style="color:#17634e;text-decoration:underline">${escapeHtml(input.email)}</a></p><div style="padding:22px;background-color:#f2f7f4;border-left:3px solid #238363;font-size:15px;line-height:1.85;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(input.message).replace(/\n/g,'<br>')}</div><p style="margin:24px 0 0;font-size:12px;line-height:1.8;color:#526760">Use <strong>Reply</strong> in your email app to continue this conversation.<br>Source: <a href="${SITE}/" style="color:#17634e">port.alvarezsm.com</a></p>`}),
    attachments:attachment()
  };
  const language = COPY[input.language] ? input.language : 'en';
  const copy = COPY[language];
  const meta = metadata(input, copy);
  // Automatic confirmations never repeat the visitor's name, message or links.
  const receipt = {
    from, to:[input.email], reply_to:config.to, subject:copy.subject,
    text:`AlvarezSM\n\n${copy.intro}\n\n${copy.date}: ${meta.date}\n${copy.reference}: ${meta.reference}\n\n${copy.nextText}\n\nAlvarezSM — ${copy.discipline}\n${SITE}/\n${SITE}/privacy-policy.html\n\n${copy.note}`,
    html:frame({copy, language, label:'02 / '+copy.label, title:copy.title, intro:copy.intro, meta, note:copy.note,
      content:`<div style="font-size:10px;line-height:1.6;font-weight:bold;letter-spacing:1.8px;color:#17634e">${copy.next}</div><p style="margin:12px 0 0;font-size:15px;line-height:1.85;color:#516268">${copy.nextText}</p><table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px"><tr><td bgcolor="#17634e" style="background-color:#17634e;border-radius:6px;mso-padding-alt:14px 22px"><a href="${SITE}/" style="display:inline-block;padding:14px 22px;color:#ffffff;font-size:13px;line-height:1.5;font-weight:bold;text-decoration:none">${copy.visit} &nbsp; &#8599;</a></td></tr></table>`}),
    attachments:attachment()
  };
  return {primary, receipt};
}

module.exports = {makeEmails};
