import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Congelada no build e embutida no bundle: servidor e navegador precisam ver a
  // mesma data, senão a etiqueta de temporada quebra a hidratação.
  env: { NEXT_PUBLIC_BUILD_DATE: new Date().toISOString() },
  /*
   * O `output: 'export'` saiu daqui.
   *
   * As telas continuam sendo geradas no build e servidas como arquivo — nada
   * mudou para quem só monta loadout, e o loadout inteiro segue vivendo na URL,
   * sem servidor guardando nada. O que passou a existir é uma única rota de
   * servidor, `/api/matchup`, que escreve a leitura do confronto com um modelo
   * de linguagem. Ela precisa rodar do lado de lá porque a chave do AI Gateway
   * não pode chegar ao navegador.
   *
   * O preço é este: o site deixou de ser hospedável em qualquer CDN. Se algum
   * dia essa portabilidade voltar a importar mais do que a leitura escrita,
   * basta devolver o `output: 'export'` — a comparação continua funcionando
   * pela análise por regras, que é o que responde quando a rota falha.
   */
  images: { unoptimized: true },
  trailingSlash: true,
  /*
   * As fontes do cartão de imagem são lidas do disco em tempo de execução, e o
   * rastreador não enxerga esse `readFile` — sem esta linha os arquivos ficam
   * fora do pacote e a rota só quebra depois de publicada.
   */
  outputFileTracingIncludes: {
    '/api/loadout/imagem': ['./assets/**'],
  },
};

export default nextConfig;
