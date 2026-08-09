import { MetaScreen } from './meta-screen';
import { readMetaFromSearch } from '@/lib/meta-ai';

/**
 * A tela do meta, relida uma vez por dia.
 *
 * `revalidate` é o que faz a conta bater com a cota: a página fica guardada por
 * 24 horas, e só a primeira visita depois disso paga uma chamada à busca. Todas
 * as outras leem o que já está pronto. Não há cron nem fila — a própria visita
 * é o gatilho, e nos dias sem visita nenhuma nada é gasto.
 *
 * Falhando a leitura — sem chave, sem cota, resposta ilegível —, entra a
 * curadoria escrita à mão que continua em `src/data/meta.ts`. A tela não fica
 * vazia em nenhuma hipótese; no máximo, mostra a lista revisada por último.
 */
// Vinte e quatro horas, escritas como número: o Next lê esta configuração
// estaticamente e recusa qualquer coisa que não seja um literal — importar a
// constante daqui falha o build com "Invalid segment configuration export".
export const revalidate = 86400;

export default async function MetaPage() {
  const reading = await readMetaFromSearch();

  if (!reading) return <MetaScreen />;

  return (
    <MetaScreen
      picks={reading.picks}
      sources={reading.sources}
      readAt={reading.readAt.slice(0, 10)}
      fromSearch
    />
  );
}
