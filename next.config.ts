import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Aplicação 100% estática: nenhum dado sai do dispositivo, o loadout inteiro
  // vive na URL. Isso permite hospedar em qualquer CDN e rodar dentro de WebView.
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
