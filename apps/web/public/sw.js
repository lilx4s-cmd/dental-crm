/* No private-data caching. Authenticated pages and APIs always require the network. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode!=='navigate')return;
 event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connection required</title><body style="font:18px Arial,sans-serif;max-width:36rem;margin:15vh auto;padding:24px"><h1>Connection required</h1><p>Connect to the internet to use your CRM. Patient records, conversations, photos and documents are not stored for offline access.</p><button style="padding:14px" onclick="location.reload()">Try again</button></body></html>',{headers:{'Content-Type':'text/html','Cache-Control':'no-store'}})));
});
self.addEventListener('push',event=>{
 let data={};try{data=event.data.json();}catch{}
 const raw=typeof data.url==='string'?data.url:'/my-day';const url=new URL(raw,self.location.origin);
 const safe=url.origin===self.location.origin&&(url.pathname==='/pipeline'||url.pathname==='/my-day');
 event.waitUntil(self.registration.showNotification(data.title||'CRM update',{body:data.body||'Open the CRM to view your update.',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:data.tag,data:{url:safe?url.href:new URL('/my-day',self.location.origin).href}}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(self.clients.openWindow(event.notification.data?.url||'/my-day'));});
