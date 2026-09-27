/*
 * TOP FAMILLE — service worker minimal.
 *
 * Son seul but est de rendre l'app installable : Chrome n'affiche
 * "Installer l'application" que si un service worker est enregistre avec
 * un gestionnaire fetch. Il ne met RIEN en cache. C'est un jeu multijoueur
 * en temps reel : mettre en cache le plateau ou les reponses du serveur
 * ferait tourner une partie perimee pendant que la vraie continue ailleurs.
 * Chaque requete part donc au reseau, exactement comme sans service worker.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
