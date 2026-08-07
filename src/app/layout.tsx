import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { BUILD_DATE } from '@/data/build';
import { seasonTheme } from '@/data/season';
import { ThemeProvider } from '@/components/theme';
import { PageCurtain } from '@/components/page-transition';
import './globals.css';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-heading',
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
  /*
   * O tema da temporada é decidido no build, não no navegador: a página é
   * estática, e resolver isso na hidratação faria a interface piscar do tema
   * padrão para o sazonal. Encerrada a temporada, o atributo simplesmente não
   * sai mais daqui e o site volta ao tema permanente no deploy seguinte.
   */
  const season = seasonTheme(new Date(BUILD_DATE));

  return (
    <html
      lang="pt-BR"
      data-season={season}
      className={`${barlow.variable} ${barlowCondensed.variable}`}
    >
      <body className="min-h-dvh antialiased">
        {/*
          O registry recolhe o CSS-in-JS do antd durante o pré-render e o
          escreve no `<head>` do HTML gerado. Sem ele os componentes nasceriam
          sem estilo e se ajeitariam depois da hidratação — num site estático,
          isso é um piscar visível em toda primeira visita.
        */}
        <AntdRegistry>
          <ThemeProvider>
            <PageCurtain>{children}</PageCurtain>
          </ThemeProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
