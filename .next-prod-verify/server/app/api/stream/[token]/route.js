"use strict";(()=>{var e={};e.id=382,e.ids=[382],e.modules={53524:e=>{e.exports=require("@prisma/client")},72934:e=>{e.exports=require("next/dist/client/components/action-async-storage.external.js")},54580:e=>{e.exports=require("next/dist/client/components/request-async-storage.external.js")},45869:e=>{e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},27790:e=>{e.exports=require("assert")},78893:e=>{e.exports=require("buffer")},61282:e=>{e.exports=require("child_process")},84770:e=>{e.exports=require("crypto")},80665:e=>{e.exports=require("dns")},17702:e=>{e.exports=require("events")},92048:e=>{e.exports=require("fs")},32615:e=>{e.exports=require("http")},35240:e=>{e.exports=require("https")},98216:e=>{e.exports=require("net")},19801:e=>{e.exports=require("os")},55315:e=>{e.exports=require("path")},86624:e=>{e.exports=require("querystring")},76162:e=>{e.exports=require("stream")},82452:e=>{e.exports=require("tls")},17360:e=>{e.exports=require("url")},21764:e=>{e.exports=require("util")},71568:e=>{e.exports=require("zlib")},85140:(e,r,t)=>{t.r(r),t.d(r,{originalPathname:()=>P,patchFetch:()=>q,requestAsyncStorage:()=>U,routeModule:()=>k,serverHooks:()=>O,staticGenerationAsyncStorage:()=>N});var a={};t.r(a),t.d(a,{GET:()=>R,dynamic:()=>I});var o=t(73278),i=t(45002),n=t(54877),s=t(80665),l=t.n(s),d=t(71309),c=t(18445),u=t(93621),p=t(63937),m=t(56362),f=t(4980),h=t(32385),v=t(68853),w=t(13899),y=t(78825),g=t(73452),b=t(71122),x=t(95611),S=t(9953);try{l().setDefaultResultOrder("ipv4first")}catch{}let I="force-dynamic";function E(e){return e.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}async function T(e){let r=e.rawUrl||"",t=r.match(/(\d+)x(\d+)/i),a=t&&Number(t[1])||1,o=t&&Number(t[2])||1;try{if(e.episodeId){let r=await p._.episode.findUnique({where:{id:e.episodeId},select:{episodeNumber:!0,season:{select:{seasonNumber:!0,series:{select:{tmdbId:!0}}}}}}),t=r?.season?.series?.tmdbId;if(t)return(0,y.RS)({mediaType:"SERIES",tmdbId:t,seasonNumber:r.season.seasonNumber,episodeNumber:r.episodeNumber})}if(e.movieId){let r=await p._.movie.findUnique({where:{id:e.movieId},select:{tmdbId:!0,mediaType:!0}});if(r?.tmdbId&&"MOVIE"===r.mediaType)return(0,y.RS)({mediaType:"MOVIE",tmdbId:r.tmdbId});if(r?.tmdbId&&"SERIES"===r.mediaType)return(0,y.RS)({mediaType:"SERIES",tmdbId:r.tmdbId,seasonNumber:a,episodeNumber:o})}}catch(e){console.warn("[GET /api/stream/[token]] Error resolviendo fallback de contingencia en BD:",e)}let i=r.match(/(tt\d+)-(\d+)x(\d+)/i);if(i)return`https://vidsrc.me/embed/tv?imdb=${i[1]}&season=${Number(i[2])||1}&episode=${Number(i[3])||1}&ds_lang=es`;let n=r.match(/(tt\d+)/i);return n?`https://vidsrc.me/embed/movie?imdb=${n[1]}&ds_lang=es`:null}async function R(e,{params:r}){try{let t;let a="1"===e.nextUrl.searchParams.get("tv"),o="0"!==e.nextUrl.searchParams.get("escudo"),i=(0,w.r9)(e),n=w.VF.checkLimit(`stream:${i}`,60,6e4);if(!n.allowed)return d.NextResponse.json({ok:!1,error:"Demasiadas solicitudes de reproducci\xf3n. Intenta en un minuto."},{status:429,headers:{"Retry-After":String(n.retryAfterSeconds)}});let s=decodeURIComponent(r.token),l=u.Id.decryptStreamToken(s),p=null;if(!a){let e=await (0,c.getServerSession)(h.L);if(t=e?.user?.id,p=e?.user?.email??null,!e?.user)return d.NextResponse.json({ok:!1,error:"No autorizado. Inicia sesi\xf3n para reproducir."},{status:401})}let m=e.headers.get("sec-fetch-site");if("cross-site"===m&&!a||!function(e){let r=e.headers.get("referer");if(!r)return!0;try{let t=new URL(r).host.toLowerCase(),a=new Set([e.nextUrl.host,e.headers.get("x-forwarded-host"),e.headers.get("host")].filter(e=>!!e).map(e=>e.split(",")[0].trim().toLowerCase()));return 0===a.size||a.has(t)}catch{return!1}}(e))return d.NextResponse.json({ok:!1,error:"Acceso externo no permitido (Anti-Hotlinking)."},{status:403});if(l.format!==f.L.EMBED){let e=d.NextResponse.redirect(l.rawUrl,{status:302});return e.headers.set("Cache-Control","no-store, no-cache, must-revalidate"),e.headers.set("Referrer-Policy","no-referrer"),e}let I=(0,g.L0)(l.rawUrl)?(0,g.yA)(l.rawUrl):l.rawUrl,R=!!l.isDirty;if(l.rawUrl.includes("embed69.org/f/")){let e=await (0,b.aJ)(l.rawUrl);if(e.url)I=e.url,R=!e.isStreamwish;else{let r=await (0,x.JZ)(l.rawUrl);if(r)I=r.url,R=!r.isStreamwish;else{let r=await T(l);if(r)I=r,R=!0;else{if("NOT_FOUND"===e.status||g.pJ&&!g.h4)return function(e){let r=`<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><style>html,body{background:#000;margin:0;}</style></head>
<body>
<script>
  try {
    window.parent.postMessage(
      { type: "PILOTO_STREAM_ERROR", mirrorId: ${JSON.stringify(e)} },
      "*"
    );
  } catch (e) {}
</script>
</body>
</html>`;return new d.NextResponse(r,{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store, no-cache, must-revalidate"}})}(l.mirrorId);I=e.cleanEmbedUrl,R=!0}}}}if((0,y.pz)(I)){let e=await T(l);e&&(I=e,R=!0)}let k=(0,g.HS)({serverName:l.serverName,url:I}),U=!k||(0,g.H)(I);U&&(R=!0);let N=Math.max(0,Math.floor(Number(e.nextUrl.searchParams.get("t")||"0")||0)),O=!1;a?O=o:o&&t&&(O=(await v.D.getMembershipByUserId(t,p)).isModoEscudoActive);let P=(k||(0,g.FH)({serverName:l.serverName,url:I}))&&O?await (0,S.mi)(I):null,q=null;if(O&&(P||!(0,y.jK)(I))){let e=await T(l);!e||(q=e,P||(0,y.jK)(I)||(I=e,R=!0))}let $=function(e,r){if(!r||r<=5)return e;try{let t=new URL(e);return t.hash||(t.hash=`t=${Math.floor(r)}`),t.toString()}catch{return e}}(I,N),L=a?function(e){try{let r=new URL(e);return r.searchParams.has("autoplay")?"false"===r.searchParams.get("autoplay")&&r.searchParams.set("autoplay","1"):r.searchParams.set("autoplay","1"),r.toString()}catch{return e}}($):$,M=E(L),C=function(e){let{mirrorId:r,targetIframeUrl:t,escapedRawUrl:a,plusSafeFallbackUrl:o,isTvMode:i,isSecondaryServer:n,shieldProtectionEnabled:s,resumeSeconds:l,streamwishHls:d}=e,c=s&&(0,y.jK)(t)?`sandbox="${y.j4}"`:"",u=s&&o?o:t,p=s&&(0,y.jK)(u)?`sandbox="${y.j4}"`:"",m=(()=>{try{return`${new URL(t).origin}/`}catch{return t}})();return`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="referrer" content="${d?"no-referrer":"origin"}" />
  ${d?'<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>':""}
  <style>
    html, body {
      background: #000;
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      ${i?"cursor: none;":""}
    }
    iframe, video {
      width: 100vw;
      height: 100vh;
      border: 0;
      display: block;
      background: #000;
      ${i?"cursor: none;":""}
    }
  </style>
  <script>
    (function() {
      ${s?`
      try {
        Object.defineProperty(window, "open", {
          value: function() { return null; },
          writable: false,
          configurable: false
        });
      } catch (e) {
        window.open = function() { return null; };
      }`:""}
      window.addEventListener("message", function(event) {
        try {
          if (event.source && event.source !== window && event.source !== window.parent) {
            window.parent.postMessage(event.data, "*");
          }
        } catch (e) {}
      });
      ${n?`
      try {
        window.parent.postMessage(
          { type: "PILOTO_SECONDARY_SERVER_ACTIVE", mirrorId: ${JSON.stringify(r)}, isDirty: true },
          "*"
        );
      } catch (e) {}`:""}
      ${i?`
      window.addEventListener("DOMContentLoaded", function() {
        try {
          window.focus();
          if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(function() {});
          }
        } catch (e) {}
      });`:""}
    })();
  </script>
</head>
<body>
  ${d?`
  <div id="playerRoot" style="width:100vw;height:100vh;background:#000;">
    <video
      id="pilotoVideo"
      controls
      playsinline
      x-webkit-airplay="allow"
      poster="${E(d.posterUrl)}"
    ></video>
  </div>
  <script>
    (function() {
      var video = document.getElementById("pilotoVideo");
      var root = document.getElementById("playerRoot");
      var hlsUrl = ${JSON.stringify(d.hlsUrl)};
      var inlineM3u8 = ${JSON.stringify(d.inlineM3u8||"")};
      var knownDurationSec = ${JSON.stringify(d.durationSeconds||0)};
      var fallbackIframeUrl = ${JSON.stringify(u)};
      var fallbackSandboxAttr = ${JSON.stringify(p)};
      var startSec = ${l};
      var switchedToIframe = false;
      var streamRefererValue = ${JSON.stringify(m)};

      var activeHlsSource =
        "/api/stream-proxy?url=" +
        encodeURIComponent(hlsUrl) +
        "&referer=" +
        encodeURIComponent(streamRefererValue);

      function switchToEmbedIframe() {
        if (switchedToIframe || !root) return;
        switchedToIframe = true;
        var sbxAttr = fallbackSandboxAttr ? (" " + fallbackSandboxAttr) : "";
        root.innerHTML = '<iframe src="' + fallbackIframeUrl.replace(/"/g, "&quot;") + '"' + sbxAttr + ' allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *" allowfullscreen webkitallowfullscreen="true" mozallowfullscreen="true" referrerpolicy="origin"></iframe>';
      }

      function reportTime() {
        if (!video || switchedToIframe) return;
        var ct = Math.floor(video.currentTime || 0);
        var dur = Math.floor(video.duration || knownDurationSec || 0);
        if (ct > 0 || dur > 60) {
          try {
            window.parent.postMessage(
              {
                type: "PILOTO_TIME_UPDATE",
                currentTime: ct,
                duration: dur > 60 ? dur : undefined
              },
              "*"
            );
          } catch (e) {}
        }
      }

      if (knownDurationSec > 60) {
        try {
          window.parent.postMessage(
            {
              type: "PILOTO_TIME_UPDATE",
              currentTime: startSec > 0 ? startSec : 0,
              duration: knownDurationSec
            },
            "*"
          );
        } catch (e) {}
      }

      // Expone el stream HLS/MP4 directo al padre para Cast/AirPlay exclusivo del reproductor
      try {
        var mirrorIdValue = ${JSON.stringify(r)};
        var streamRefererValue = ${JSON.stringify(m)};
        var posterUrlValue = ${JSON.stringify(d.posterUrl||"")};
        var proxiedStreamUrl =
          "/api/stream-proxy?url=" +
          encodeURIComponent(hlsUrl) +
          "&referer=" +
          encodeURIComponent(streamRefererValue);

        var streamTypeValue = ${JSON.stringify(/\.mp4(\?|$)/i.test(d.hlsUrl)?"mp4":"hls")};

        window.parent.postMessage(
          {
            type: "PILOTO_NATIVE_HLS_READY",
            mirrorId: mirrorIdValue,
            streamUrl: hlsUrl,
            proxiedUrl: proxiedStreamUrl,
            streamType: streamTypeValue,
            referer: streamRefererValue,
            posterUrl: posterUrlValue || undefined,
            durationSeconds: knownDurationSec > 0 ? knownDurationSec : undefined
          },
          "*"
        );
      } catch (e) {}

      video.addEventListener("loadedmetadata", reportTime);
      video.addEventListener("timeupdate", reportTime);
      video.addEventListener("seeked", reportTime);
      video.addEventListener("pause", reportTime);

      window.addEventListener("message", function(event) {
        try {
          if (
            event.data &&
            event.data.type === "PILOTO_SEEK" &&
            typeof event.data.time === "number" &&
            video &&
            !switchedToIframe
          ) {
            video.currentTime = event.data.time;
          } else if (
            event.data &&
            event.data.type === "PILOTO_TRIGGER_REMOTE_PLAYBACK" &&
            video &&
            !switchedToIframe
          ) {
            if (typeof video.webkitShowPlaybackTargetPicker === "function") {
              video.webkitShowPlaybackTargetPicker();
            } else if (video.remote && typeof video.remote.prompt === "function") {
              video.remote.prompt().catch(function() {});
            }
          }
        } catch (e) {}
      });

      if (window.Hls && window.Hls.isSupported()) {
        var hls = new window.Hls({
          enableWorker: true,
          startPosition: startSec > 5 ? startSec : -1
        });
        hls.loadSource(activeHlsSource);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.ERROR, function(_ev, data) {
          if (data && data.fatal) {
            hls.destroy();
            switchToEmbedIframe();
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = activeHlsSource;
        video.addEventListener("loadedmetadata", function() {
          if (startSec > 5) {
            video.currentTime = startSec;
          }
        });
        video.addEventListener("error", switchToEmbedIframe);
      } else {
        switchToEmbedIframe();
      }
    })();
  </script>`:`
  <iframe
    src="${a}"
    ${c}
    allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *"
    allowfullscreen
    webkitallowfullscreen="true"
    mozallowfullscreen="true"
    referrerpolicy="origin"
  ></iframe>`}
</body>
</html>`}({mirrorId:l.mirrorId,targetIframeUrl:L,escapedRawUrl:M,plusSafeFallbackUrl:q,isTvMode:a,isSecondaryServer:R,isDirtyIframe:U,shieldProtectionEnabled:O,resumeSeconds:N,streamwishHls:P});return new d.NextResponse(C,{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store, no-cache, must-revalidate","Referrer-Policy":P?"no-referrer":"strict-origin-when-cross-origin","Permissions-Policy":"fullscreen=*, autoplay=*, picture-in-picture=*, payment=(), geolocation=(), camera=(), microphone=()","Content-Security-Policy":"default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src * data: blob:; frame-ancestors 'self'; form-action 'none';"}})}catch(e){if(e instanceof m.N7)return d.NextResponse.json({ok:!1,error:"El enlace temporal de reproducci\xf3n ha expirado."},{status:410});if(e instanceof m._w)return d.NextResponse.json({ok:!1,error:"Token de reproducci\xf3n inv\xe1lido."},{status:401});return console.error("[GET /api/stream/[token]] Error:",e),d.NextResponse.json({ok:!1,error:"Error al resolver el stream."},{status:500})}}let k=new o.AppRouteRouteModule({definition:{kind:i.x.APP_ROUTE,page:"/api/stream/[token]/route",pathname:"/api/stream/[token]",filename:"route",bundlePath:"app/api/stream/[token]/route"},resolvedPagePath:"C:\\Users\\Usuario\\Documents\\piloto v2\\src\\app\\api\\stream\\[token]\\route.ts",nextConfigOutput:"",userland:a}),{requestAsyncStorage:U,staticGenerationAsyncStorage:N,serverHooks:O}=k,P="/api/stream/[token]/route";function q(){return(0,n.patchFetch)({serverHooks:O,staticGenerationAsyncStorage:N})}}};var r=require("../../../../webpack-runtime.js");r.C(e);var t=e=>r(r.s=e),a=r.X(0,[379,833,742,136,122,180,621,306],()=>t(85140));module.exports=a})();