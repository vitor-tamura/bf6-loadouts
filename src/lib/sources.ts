/**
 * As páginas que uma busca abriu, prontas para virar citação.
 *
 * As duas rotinas que perguntam a um modelo com busca ligada — a leitura diária
 * do meta e a sugestão de montagem — recebem os links do mesmo jeito, como
 * anotações `url_citation` penduradas no texto da resposta, e tropeçam no mesmo
 * lugar: a mesma página aparece várias vezes, uma por trecho citado, e sites de
 * guia publicam a mesma tier list em `/`, `/pt` e `/es`. Contar isso como três
 * fontes faz a lista parecer mais sustentada do que é.
 *
 * Por isso a chave de página mora aqui, e não em cada rotina: duas cópias da
 * mesma regra divergem na primeira vez que alguém acrescenta um idioma.
 */

/** Prefixo de idioma no caminho: `/pt/meta` e `/es/meta` são a mesma página. */
const LANGUAGES = new Set([
  'ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'ru', 'tr', 'zh',
  'en-us', 'en-gb', 'es-es', 'es-mx', 'pt-br', 'zh-cn', 'zh-tw',
]);

/** Duas URLs que abrem a mesma página têm a mesma chave. Lança em URL inválida. */
export function pageKey(url: string): string {
  const address = new URL(String(url));
  const host = address.hostname.replace(/^www\./, '');
  const parts = address.pathname.split('/').filter(Boolean);
  if (parts.length && LANGUAGES.has(parts[0].toLowerCase())) parts.shift();
  return `${host}/${parts.join('/')}`.replace(/\/+$/, '');
}

export interface CitedSource {
  /** Rótulo curto — o host, sem `www`. É o que cabe embaixo de um botão. */
  name: string;
  /** Título da página, quando a busca informa. Serve de tooltip. */
  title?: string;
  url: string;
}

/**
 * As páginas citadas, uma vez cada.
 *
 * A ordem é a da resposta: a primeira citação de cada página é a que fica, e
 * `limit` corta o rabo — três links embaixo de um botão já dizem de onde a
 * sugestão saiu; oito viram bibliografia.
 */
export function dedupeCitations(
  annotations: { url?: string; title?: string }[] | undefined,
  limit = 3,
): CitedSource[] {
  const seen = new Set<string>();
  const sources: CitedSource[] = [];

  for (const annotation of annotations ?? []) {
    if (!annotation?.url || sources.length === limit) continue;

    try {
      const address = new URL(annotation.url);
      const key = pageKey(annotation.url);
      if (seen.has(key)) continue;
      seen.add(key);

      sources.push({
        name: address.hostname.replace(/^www\./, ''),
        title: annotation.title?.slice(0, 120),
        url: address.toString(),
      });
    } catch {
      // Link que não é URL não vira citação.
    }
  }

  return sources;
}
