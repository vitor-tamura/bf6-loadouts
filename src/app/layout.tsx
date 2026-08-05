import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import './globals.css';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--fonte-corpo',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--fonte-titulo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Arsenal BF6 — Montador de Loadouts',
    template: '%s · Arsenal BF6',
  },
  description:
    'Monte e compartilhe loadouts de Battlefield 6 em português: todas as armas, acessórios compatíveis, estatísticas recalculadas em tempo real e gráficos de dano e queda de bala.',
  applicationName: 'Arsenal BF6',
  appleWebApp: {
    capable: true,
    title: 'Arsenal BF6',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: 'Arsenal BF6 — Montador de Loadouts',
    description:
      'Monte seu loadout de Battlefield 6, veja a arma mudar a cada acessório e compartilhe por link.',
    locale: 'pt_BR',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#080a08',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Permite ampliar: bloquear zoom prejudica quem precisa de texto maior.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
