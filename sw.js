var CACHE = 'pagos-v1';
var ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(ASSETS);}).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch', function(e) {
  if(!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(caches.match(e.request).then(function(cached){
    if(cached) return cached;
    return fetch(e.request).then(function(res){
      if(res&&res.status===200){var clone=res.clone();caches.open(CACHE).then(function(c){c.put(e.request,clone);});}
      return res;
    }).catch(function(){return caches.match('./index.html');});
  }));
});

function openDB() {
  return new Promise(function(res,rej){
    var r=indexedDB.open('mispagos-db',1);
    r.onupgradeneeded=function(e){e.target.result.createObjectStore('kv');};
    r.onsuccess=function(e){res(e.target.result);};
    r.onerror=function(){rej(r.error);};
  });
}
function idbGet(key) {
  return openDB().then(function(db){
    return new Promise(function(res,rej){
      var tx=db.transaction('kv','readonly');
      var req=tx.objectStore('kv').get(key);
      req.onsuccess=function(){res(req.result);};
      req.onerror=function(){rej(req.error);};
    });
  });
}

self.addEventListener('periodicsync', function(e) {
  if(e.tag==='check-payments') e.waitUntil(checkPayments());
});

function checkPayments() {
  return idbGet('upcoming').then(function(data){
    if(!data||!data.items||!data.items.length) return;
    var today=new Date(); today.setHours(0,0,0,0);
    var promises=data.items.map(function(item){
      var limit=new Date(item.limitDate);
      var days=Math.ceil((limit-today)/86400000);
      if(days>3) return Promise.resolve();
      var title = days<0  ? 'Pago vencido'
                : days===0 ? 'Vence HOY'
                :             'Recordatorio de pago';
      var body  = days<0  ? item.cardName+': el limite ya paso'
                : days===0 ? item.cardName+': ultimo dia para pagar'
                :             item.cardName+': vence en '+days+' dia'+(days!==1?'s':'');
      return self.registration.showNotification(title,{
        body:body, tag:'mp-'+item.key,
        icon:'./icon-192.png', vibrate:[200,100,200],
        data:{url:'./'}
      });
    });
    return Promise.all(promises);
  }).catch(function(){});
}

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var url=(e.notification.data&&e.notification.data.url)?e.notification.data.url:'./';
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++){if(list[i].url.indexOf('pagos')!==-1&&'focus' in list[i])return list[i].focus();}
    return clients.openWindow(url);
  }));
});
