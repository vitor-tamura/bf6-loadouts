/**
 * Quem cumpre cada papel de fonte, hoje.
 *
 * Existe porque só uma fonte é parte do desenho deste catálogo: a EA. Ela é a
 * única que responde "o que a Battlefield mudou" com autoridade, e por isso o
 * endereço dela mora no código, ao lado de quem o usa.
 *
 * As outras não são assim. `bf6loadouts`, `BF6-Weapon-Analyzer` e `rnkd.gg`
 * estão no pipeline por cumprirem um papel — estado atual, números de simulação,
 * enumeração de slot —, e não por serem elas. Qualquer uma pode sair do ar,
 * parar de atualizar ou ser superada por outra melhor, e quando isso acontecer o
 * papel continua existindo. Escritas no código, cada troca dessas era uma edição
 * de script; escritas em `data/sources/registry.json`, são uma edição de dado.
 *
 * O que este módulo devolve é sempre o papel, nunca o nome do site. Quem
 * importa números pergunta por `numeros_de_simulacao` e recebe o que estiver
 * ativo — e o registro é que diz quem é.
 */

import { join } from 'node:path';
import { SOURCES, readJson } from './io.ts';

export type Papel =
  | 'estado_atual'
  | 'numeros_de_simulacao'
  | 'enumeracao_de_slot'
  | 'registro_de_patch';

export interface FonteRegistrada {
  id: string;
  papel: Papel;
  tipo: 'current_state' | 'community';
  url: string;
  repo?: string;
  branch?: string;
  ativo?: boolean;
  /** A variável de ambiente que sobrescreve `url` (ou `repo`) numa execução. */
  env?: string;
  envBranch?: string;
  nota?: string;
}

interface Registry {
  fontes: FonteRegistrada[];
}

/**
 * O endereço oficial, e o único que fica no código.
 *
 * O jogo no meio do caminho não entra aqui de propósito: a EA pendura o mesmo
 * Game Update ora em `battlefield-6`, ora em `redsec`, e quem lê a listagem
 * precisa aceitar os dois. Ver `discover-updates.ts`.
 */
export const EA_NEWS =
  process.env.CATALOG_EA_NEWS_URL ?? 'https://www.ea.com/games/battlefield/battlefield-6/news';

let cache: Registry | null = null;

function registry(): Registry {
  cache ??= readJson<Registry>(join(SOURCES, 'registry.json'));
  return cache;
}

/**
 * A fonte ativa de um papel, já com as sobrescritas de ambiente aplicadas.
 *
 * Falha alto quando não há nenhuma. Um pipeline que seguisse sem fonte para um
 * papel escreveria o silêncio dela como se fosse resposta — que é o erro que
 * este catálogo inteiro se organiza para não cometer.
 */
export function fonteAtiva(papel: Papel): FonteRegistrada {
  const encontrada = registry().fontes.find((f) => f.papel === papel && f.ativo !== false);

  if (!encontrada) {
    throw new Error(
      `nenhuma fonte ativa para o papel '${papel}' em data/sources/registry.json — ` +
        'registre uma, ou marque a existente como ativa',
    );
  }

  /*
   * A sobrescrita cai no endereço que a fonte de fato usa.
   *
   * Fonte de repositório é endereçada por `owner/nome`, não por URL —
   * `CATALOG_GITHUB_REPO=outro/analyzer` tem de trocar o repositório, e não
   * virar uma URL que não existe.
   */
  const override = encontrada.env ? process.env[encontrada.env] : undefined;

  return {
    ...encontrada,
    url: encontrada.repo ? encontrada.url : (override ?? encontrada.url),
    repo: encontrada.repo ? (override ?? encontrada.repo) : encontrada.repo,
    branch: (encontrada.envBranch && process.env[encontrada.envBranch]) || encontrada.branch,
  };
}

/** Todas as fontes registradas, ativas ou não — para quem for descrever o quadro. */
export function fontes(): FonteRegistrada[] {
  return registry().fontes;
}
