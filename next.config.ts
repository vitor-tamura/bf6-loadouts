import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Congelada no build e embutida no bundle: servidor e navegador precisam ver a
  // mesma data, senão a etiqueta de temporada quebra a hidratação.
  env: { NEXT_PUBLIC_BUILD_DATE: new Date().toISOString() },
  // Aplicação 100% estática: nenhum dado sai do dispositivo, o loadout inteiro
  // vive na URL. Isso permite hospedar em qualquer CDN e rodar dentro de WebView.
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
