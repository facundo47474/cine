"use strict";exports.id=180,exports.ids=[180],exports.modules={63937:(e,t,o)=>{o.d(t,{_:()=>i});var r=o(53524);let i=globalThis.prisma??new r.PrismaClient({log:["error"]})},55227:(e,t,o)=>{o.d(t,{z:()=>n});var r=o(56742);let i="https://cine-ddbt.vercel.app";class a{escapeHtml(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}formatActivationDate(e){try{return new Intl.DateTimeFormat("es-AR",{dateStyle:"long",timeStyle:"short"}).format(e)}catch{return e.toISOString()}}buildHtmlTemplate(e,t){let o=this.escapeHtml(e);return`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenido a PILOTO</title>
</head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#121215;border:1px solid #27272a;border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 20px 32px;border-bottom:1px solid #27272a;">
              <div style="display:inline-block;background-color:#E50914;color:#ffffff;font-weight:900;font-size:18px;letter-spacing:-0.5px;padding:6px 14px;border-radius:8px;">
                PILOTO
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 12px 0;font-size:24px;font-weight:800;color:#ffffff;">
                \xa1Hola, ${o}! Te damos la bienvenida a PILOTO.
              </h1>
              <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#a1a1aa;">
                Tu cuenta ha sido activada exitosamente con Google OAuth 2.0. Ya tienes acceso completo a nuestro cat\xe1logo de estrenos y cl\xe1sicos en alta definici\xf3n.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;background-color:#18181b;border:1px solid #27272a;border-radius:14px;padding:20px;">
                <tr>
                  <td style="padding-bottom:14px;">
                    <strong style="color:#ffffff;font-size:14px;">🌎 Audio Dual Latino / Ingl\xe9s (Sub)</strong>
                    <div style="color:#a1a1aa;font-size:12px;margin-top:4px;">
                      Cambia en cualquier momento entre Espa\xf1ol Latino e Idioma Original Subtitulado desde la ficha de cada pel\xedcula.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:14px;">
                    <strong style="color:#ffffff;font-size:14px;">⏱️ Sincronizaci\xf3n de Progreso</strong>
                    <div style="color:#a1a1aa;font-size:12px;margin-top:4px;">
                      Tus pel\xedculas se guardan autom\xe1ticamente cada 15 segundos en tu fila personal \xabContinuar viendo\xbb.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong style="color:#ffffff;font-size:14px;">📺 Reproducci\xf3n Sin Fricci\xf3n y Modo Smart TV</strong>
                    <div style="color:#a1a1aa;font-size:12px;margin-top:4px;">
                      Disfruta en tu m\xf3vil, PC o transmite directamente a tu televisor mediante Chromecast y AirPlay.
                    </div>
                  </td>
                </tr>
              </table>

              <div style="text-align:center;margin:28px 0 12px 0;">
                <a href="${t}" style="display:inline-block;background-color:#E50914;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;padding:14px 28px;border-radius:10px;">
                  Explorar el Cat\xe1logo Ahora
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#0d0d10;border-top:1px solid #27272a;text-align:center;font-size:11px;color:#71717a;">
              \xa9 2026 PILOTO Streaming • Acceso protegido con Google OAuth 2.0
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`}buildSubscriptionThankYouHtmlTemplate(e){let t=this.escapeHtml(e.displayName),o=this.escapeHtml(e.toEmail),r=this.escapeHtml(e.amountPaidLabel),i=this.escapeHtml(e.billingCycleLabel),a=this.escapeHtml(e.activatedAtLabel),n=this.escapeHtml(e.renewalDateLabel),s=this.escapeHtml(e.appUrl);return`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gracias por suscribirte a Piloto Plus</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:36px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px;background-color:#0f172a;color:#ffffff;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="display:inline-block;background-color:#7c3aed;color:#ffffff;font-weight:800;font-size:13px;letter-spacing:0.3px;padding:6px 14px;border-radius:999px;">
                      🚀 PILOTO SUSCRIPCI\xd3N ACTIVA
                    </span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:18px 0 8px 0;font-size:24px;font-weight:800;line-height:1.25;color:#ffffff;">
                \xa1Muchas gracias por suscribirte, ${t}!
              </h1>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#cbd5e1;">
                Tu membres\xeda <strong style="color:#ffffff;">Piloto Plus</strong> ya est\xe1 activa. A partir de este momento tu cuenta pas\xf3 a <strong style="color:#ffffff;">Piloto 🚀</strong> con todas las funciones exclusivas habilitadas.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 32px 12px 32px;">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#64748b;margin-bottom:12px;">
                Detalle del pago y suscripci\xf3n
              </div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px 20px;">
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">
                    Plan contratado
                  </td>
                  <td align="right" style="padding:8px 0;font-size:13px;font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0;">
                    Piloto Plus (${i})
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;font-size:14px;font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0;">
                    Monto abonado
                  </td>
                  <td align="right" style="padding:10px 0;font-size:18px;font-weight:800;color:#059669;border-bottom:1px solid #e2e8f0;">
                    ${r} <span style="font-size:12px;font-weight:600;color:#475569;">/ mes</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">
                    Estado de membres\xeda
                  </td>
                  <td align="right" style="padding:8px 0;font-size:13px;font-weight:700;color:#059669;border-bottom:1px solid #e2e8f0;">
                    Activo
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">
                    Fecha de activaci\xf3n
                  </td>
                  <td align="right" style="padding:8px 0;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">
                    ${a}
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">
                    Vencimiento / Pr\xf3xima renovaci\xf3n (30 d\xedas)
                  </td>
                  <td align="right" style="padding:8px 0;font-size:13px;font-weight:700;color:#059669;border-bottom:1px solid #e2e8f0;">
                    ${n}
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#475569;">
                    Cuenta asociada
                  </td>
                  <td align="right" style="padding:8px 0;font-size:13px;font-weight:600;color:#0f172a;">
                    ${o}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 24px 32px;">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#64748b;margin-bottom:12px;">
                Funciones desbloqueadas en tu cuenta
              </div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:16px 20px;">
                <tr>
                  <td style="padding-bottom:12px;border-bottom:1px solid #f1f5f9;">
                    <strong style="color:#0f172a;font-size:13px;">🛡️ Modo Escudo Activo</strong>
                    <div style="color:#475569;font-size:12px;line-height:1.5;margin-top:3px;">
                      Experiencia fluida y directa con nuestro propio reproductor optimizado.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
                    <strong style="color:#0f172a;font-size:13px;">📺 Transmitir a Smart TV</strong>
                    <div style="color:#475569;font-size:12px;line-height:1.5;margin-top:3px;">
                      Env\xeda directamente la se\xf1al de video y audio del reproductor a tu televisor mediante Chromecast y AirPlay.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
                    <strong style="color:#0f172a;font-size:13px;">⏭️ Modo Marat\xf3n en Series</strong>
                    <div style="color:#475569;font-size:12px;line-height:1.5;margin-top:3px;">
                      Acceso al bot\xf3n de Saltar Intro / Recap y reproducci\xf3n continua autom\xe1tica al siguiente episodio.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
                    <strong style="color:#0f172a;font-size:13px;">☁️ Sincronizaci\xf3n Cloud Ilimitada</strong>
                    <div style="color:#475569;font-size:12px;line-height:1.5;margin-top:3px;">
                      Guarda y retoma tu progreso de reproducci\xf3n en todos tus dispositivos sin l\xedmite de t\xedtulos en el historial.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:12px;">
                    <strong style="color:#0f172a;font-size:13px;">📌 Mi Lista Ilimitada</strong>
                    <div style="color:#475569;font-size:12px;line-height:1.5;margin-top:3px;">
                      Agrega todas las pel\xedculas y series que quieras a tu lista personal sincronizada en la nube.
                    </div>
                  </td>
                </tr>
              </table>

              <div style="text-align:center;margin:28px 0 8px 0;">
                <a href="${s}" style="display:inline-block;background-color:#059669;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;padding:14px 30px;border-radius:10px;">
                  Disfrutar Piloto ahora
                </a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px;background-color:#f1f5f9;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;line-height:1.5;color:#64748b;">
              \xa9 2026 PILOTO Streaming • Este correo confirma la activaci\xf3n de tu suscripci\xf3n mensual (${r}) asociada a ${o}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`}static{this.etherealAccountPromise=null}resolveSmtpConfig(){let e=process.env.EMAIL_FROM?.trim(),t=process.env.SMTP_HOST?.trim(),o=process.env.SMTP_USER?.trim(),r=process.env.SMTP_PASS?.trim();if(t&&o&&r){let i=Number(process.env.SMTP_PORT||"587"),a=Number.isFinite(i)?i:587;return{provider:"custom-smtp",host:t,port:a,secure:"true"===process.env.SMTP_SECURE||465===a,user:o,pass:r,from:e||`PILOTO Streaming <${o}>`}}let i=(process.env.GMAIL_APP_PASSWORD?.trim()||r||"").replace(/\s+/g,"");if(i){let t=process.env.GMAIL_USER?.trim()||o||"facundotomas018@gmail.com";return{provider:"gmail-smtp",host:"smtp.gmail.com",port:465,secure:!0,user:t,pass:i,from:e||`PILOTO Streaming <${t}>`}}return null}async sendViaSmtp(e){let t=r.createTransport({host:e.host,port:e.port,secure:e.secure,auth:{user:e.user,pass:e.pass},connectionTimeout:7e3,greetingTimeout:7e3,socketTimeout:9e3}),o=await t.sendMail({from:e.from,to:e.toEmail,subject:e.subject,html:e.html,text:e.text});return{messageId:o.messageId,rawInfo:o}}async trySendViaResend(e){try{let t=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${e.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from:e.from,to:[e.toEmail],subject:e.subject,html:e.html,text:e.text}),signal:AbortSignal.timeout(5e3)});if(!t.ok){let e=await t.text().catch(()=>"");return{ok:!1,errorMessage:`Resend status ${t.status}: ${e||"rechazado"}`}}let o=await t.json().catch(()=>({}));return{ok:!0,messageId:o.id}}catch(e){return{ok:!1,errorMessage:e instanceof Error?e.message:"Error de red con Resend"}}}async getEtherealTestAccount(){a.etherealAccountPromise||(a.etherealAccountPromise=r.createTestAccount());try{return await a.etherealAccountPromise}catch(e){throw a.etherealAccountPromise=null,e}}async dispatchEmail(e){let t=e.toEmail.trim();if(!t)return{sent:!1,recipientEmail:"",provider:"none",errorMessage:"No se proporcion\xf3 un correo electr\xf3nico de destino."};let o=[],r=this.resolveSmtpConfig();if(r)try{let{messageId:o}=await this.sendViaSmtp({host:r.host,port:r.port,secure:r.secure,user:r.user,pass:r.pass,from:r.from,toEmail:t,subject:e.subject,html:e.html,text:e.text});return console.info(`[WelcomeEmailService] Correo (${e.contextLabel}) enviado por ${r.provider} a ${t} (id=${o})`),{sent:!0,recipientEmail:t,provider:r.provider,messageId:o,previewUrl:null,errorMessage:null}}catch(t){let e=t instanceof Error?t.message:"Fallo SMTP desconocido";o.push(`SMTP (${r.provider}): ${e}`),console.warn(`[WelcomeEmailService] Error enviando por ${r.provider}:`,t)}let i=process.env.RESEND_API_KEY?.trim();if(i){let r=process.env.EMAIL_FROM?.trim()||"PILOTO Streaming <onboarding@resend.dev>",a=await this.trySendViaResend({apiKey:i,from:r,toEmail:t,subject:e.subject,html:e.html,text:e.text});if(a.ok)return console.info(`[WelcomeEmailService] Correo (${e.contextLabel}) enviado por Resend a ${t}`),{sent:!0,recipientEmail:t,provider:"resend",messageId:a.messageId,previewUrl:null,errorMessage:null};a.errorMessage&&(o.push(a.errorMessage),console.warn(`[WelcomeEmailService] Resend fall\xf3 (${e.contextLabel}):`,a.errorMessage))}return console.error(`[WelcomeEmailService] Fall\xf3 el env\xedo real en producci\xf3n (${e.contextLabel}):`,o.join(" | ")||"Sin proveedor de correo operativo."),{sent:!1,recipientEmail:t,provider:"none",previewUrl:null,errorMessage:"No se pudo enviar el correo en este momento."}}async sendWelcomeEmail({toEmail:e,userName:t}){let o=t?.trim()||"Cin\xe9filo",r=`\xa1Hola, ${o}! Te damos la bienvenida a PILOTO.

Tu cuenta ha sido activada exitosamente con Google OAuth 2.0.

Ya tienes acceso al cat\xe1logo completo, audio dual latino/ingl\xe9s y sincronizaci\xf3n de progreso.

Explorar cat\xe1logo: ${i}`;return this.dispatchEmail({toEmail:e,subject:"\uD83C\uDFAC \xa1Bienvenido a PILOTO Streaming! Tu cuenta est\xe1 lista",html:this.buildHtmlTemplate(o,i),text:r,contextLabel:"bienvenida"})}async sendSubscriptionThankYouEmail({toEmail:e,userName:t,amountPaidLabel:o="$ 2.500 ARS",billingCycleLabel:r="Mensual",activatedAt:a=new Date}){let n=t?.trim()||"Cin\xe9filo",s=this.formatActivationDate(a),l=new Date(a.getTime()+2592e6),d=this.formatActivationDate(l),p=`\xa1Muchas gracias por suscribirte a Piloto Plus, ${n}!

DETALLE DEL PAGO Y SUSCRIPCI\xd3N:
- Plan contratado: Piloto Plus (${r})
- Monto abonado: ${o} / mes
- Estado de membres\xeda: Activo
- Fecha de activaci\xf3n: ${s}
- Vencimiento / Pr\xf3xima renovaci\xf3n (30 d\xedas): ${d}
- Cuenta asociada: ${e}

FUNCIONES DESBLOQUEADAS:
1. Modo Escudo Activo (experiencia con nuestro propio reproductor)
2. Transmitir a Smart TV (Chromecast y AirPlay)
3. Modo Marat\xf3n en Series (Saltar Intro + Autoplay)
4. Sincronizaci\xf3n Cloud Ilimitada
5. Mi Lista Ilimitada

Ir a PILOTO ahora: ${i}`;return this.dispatchEmail({toEmail:e,subject:"\uD83D\uDE80 \xa1Gracias por suscribirte a Piloto Plus!",html:this.buildSubscriptionThankYouHtmlTemplate({displayName:n,toEmail:e,amountPaidLabel:o,billingCycleLabel:r,activatedAtLabel:s,renewalDateLabel:d,appUrl:i}),text:p,contextLabel:"agradecimiento de suscripci\xf3n"})}}let n=new a}};