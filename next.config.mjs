/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Le plateau est plein ecran : pas d'images distantes, pas d'optimiseur a
  // faire tourner. Tout le decor est dessine en CSS/SVG dans le bundle.
  images: { unoptimized: true },
};

export default nextConfig;
