import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * O lint do projeto.
 *
 * Até o Next 15 isto não existia: `next lint` carregava a configuração por
 * conta própria. A versão 16 removeu o comando, e sem este arquivo `yarn lint`
 * chamava um binário que já não existe — o erro que aparecia era `Invalid
 * project directory provided, no such directory: .../lint`, porque o `next`
 * tratava "lint" como o caminho da aplicação.
 *
 * `core-web-vitals` sobe para erro as regras que mexem com as métricas de
 * carregamento, e `typescript` acrescenta as do typescript-eslint. As duas são
 * o que o `create-next-app --typescript` monta hoje.
 */
export default defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      /*
       * `<img>` é a escolha certa neste projeto.
       *
       * O site é exportado estático e roda com `images: { unoptimized: true }`,
       * então o `next/image` não redimensiona, não converte formato e não serve
       * nada sob medida — entrega o mesmo arquivo por baixo, com JavaScript a
       * mais. Fora isso, boa parte das fotos vem de domínios externos que
       * mudam, e a lista de `remotePatterns` viraria manutenção sem retorno.
       */
      '@next/next/no-img-element': 'off',
    },
  },

  // Os mesmos caminhos que o eslint-config-next já ignora — declarados aqui
  // porque sobrescrever a lista de ignorados apaga a dele.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
