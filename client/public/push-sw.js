/* Notificações push — importado pelo service worker gerado (vite-plugin-pwa).
 * Payload enviado pelo servidor: { title, body, url, tag }. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "UnifiquePro", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "UnifiquePro";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag,
      icon: "/icons/icon-192-v2.png",
      badge: "/icons/icon-192-v2.png",
      data: { url: data.url || "/" },
    })
  );
});

// Ao tocar: foca o app já aberto (navegando para a tela do aviso) ou abre um novo.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.focus().then((c) => (c && "navigate" in c ? c.navigate(url) : c));
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
