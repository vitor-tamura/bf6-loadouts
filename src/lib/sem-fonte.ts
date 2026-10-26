import type { MetaSource } from '@/data/meta';

/**
 * A tela de meta não diz de que site saiu cada dado.
 *
 * As fontes continuam no rodapé, com link — o colchete de cada cartão aponta
 * para elas, e quem quiser conferir confere. O que sai é o nome: em vez de
 * "1º no wzstats" ou "tier S no battlefinity", a tela diz "1º no ranking de
 * força" e "tier S no ranking de uso". São os dois papéis que esses rankings
 * cumprem na leitura: um ordena por força, o outro pela taxa de escolha.
 *
 * O prompt da leitura já pede o texto assim (scripts/meta-search.mjs); isto é
 * a garantia para o que vier escrito de outro jeito — leitura antiga, modelo
 * que não obedeceu, curadoria escrita à mão.
 */

const TROCAS: [RegExp, string][] = [
  // Os dois rankings, pelo papel que cumprem.
  [/\branking (?:geral )?do multiplayer (?:do|no) (?:wzstats|battlefieldmeta)(?:\.gg)?/gi, 'ranking de força do multiplayer'],
  [/\b(?:wzstats|battlefieldmeta)(?:\.gg)?\b/gi, 'ranking de força'],
  [/\bbattlefinity(?:\.gg)?\b/gi, 'ranking de uso'],
  // Os números do próprio site.
  [/\bArsenal BF6 — números do catálogo\b/g, 'números do jogo'],
  // "do catálogo do site" é o site falando de si mesmo, e fica.
  [/\bno catálogo\b(?! d[oe]s?t?e? site)/gi, 'nos números do jogo'],
  [/\bdo catálogo\b(?! d[oe]s?t?e? site)/gi, 'dos números do jogo'],
  [/\bpelo catálogo\b(?! d[oe]s?t?e? site)/gi, 'pelos números do jogo'],
  // O registro do patch e a conversa.
  [/\b(?:o |a )?BF6 Balance Log\b|\bbf6balancelog(?:\.com)?\b/gi, 'o registro do patch'],
  [/\b(?:no|do) r\/Battlefield6?\b/gi, 'na comunidade'],
  [/\br\/Battlefield6?\b/gi, 'comunidade'],
  [/\bno Reddit\b/gi, 'na comunidade'],
  [/\bdo Reddit\b/gi, 'da comunidade'],
  [/\bReddit\b/g, 'comunidade'],
];

/** O texto, sem o nome do site de onde o dado saiu. */
export function semNomeDeFonte(texto: string): string {
  let limpo = String(texto ?? '');
  for (const [padrao, troca] of TROCAS) limpo = limpo.replace(padrao, troca);
  return (
    limpo
      // "fora do ranking do ranking de força", de troca em cima de troca.
      .replace(/\branking (?:geral )?(?:do |no )(ranking de (?:força|uso))/gi, '$1')
      .replace(/\b(ranking de (?:força|uso))(?: do multiplayer)? (?:do|no) ranking de (?:força|uso)\b/gi, '$1')
      // A troca pode cair no começo da frase: "No catálogo, …" vira "nos números…".
      .replace(/([.!?]\s+)([a-zà-ú])/g, (_, antes: string, letra: string) => antes + letra.toUpperCase())
      .replace(/^[a-zà-ú]/, (letra) => (/^[A-ZÀ-Ú]/.test(String(texto ?? '')) ? letra.toUpperCase() : letra))
  );
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** O título da página depois do "Site — ", quando o nome vem assim. */
const titulo = (nome: string) => nome.split(' — ').slice(1).join(' — ').trim();

/** Como a fonte aparece no rodapé: o que ela é, não onde está. */
export function rotuloDaFonte(fonte: Pick<MetaSource, 'name' | 'url'>): string {
  const site = host(fonte.url);
  const versao = /\d+\.\d+\.\d+\.\d+/.exec(fonte.name)?.[0];

  if (site === 'wzstats.gg' || site === 'battlefieldmeta.gg') {
    return /best-gun|best-guns/.test(fonte.url) ? 'Ranking de força por classe, no multiplayer' : 'Ranking de força do multiplayer';
  }
  if (site === 'battlefinity.gg') return 'Ranking de uso do multiplayer';
  if (site === 'bf6-loadouts.vercel.app') return 'Números do jogo, do catálogo deste site';
  if (site === 'bf6balancelog.com') return versao ? `Registro do patch ${versao}` : 'Registro do patch';
  if (site === 'reddit.com') return `Thread da comunidade — ${titulo(fonte.name) || 'sem título'}`;
  if (site === 'ea.com' || site.endsWith('.ea.com')) {
    if (versao) return `Notas oficiais da atualização ${versao}`;
    return site === 'forums.ea.com' ? `Fórum oficial — ${titulo(fonte.name) || 'tópico'}` : 'Comunicado oficial';
  }
  if (site === 'steamcommunity.com') {
    const oficial = /^Battlefield Comms\b/i.test(fonte.name);
    return `${oficial ? 'Comunicado do estúdio' : 'Discussão da comunidade'} — ${titulo(fonte.name) || 'tópico'}`;
  }
  return semNomeDeFonte(titulo(fonte.name) || fonte.name);
}
