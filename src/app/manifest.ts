import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Arsenal BF6 — Montador de Loadouts',
    short_name: 'Arsenal BF6',
    description:
      'Monte e compartilhe loadouts de Battlefield 6 com estatísticas recalculadas em tempo real.',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#080a08',
    theme_color: '#080a08',
    lang: 'pt-BR',
    categories: ['games', 'utilities'],
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icone-mascara.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
