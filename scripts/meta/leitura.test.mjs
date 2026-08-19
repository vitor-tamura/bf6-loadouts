import { describe, expect, it } from 'vitest';
import { chavePagina, confiabilidade, montarLeitura, normalizarPatch } from './leitura.mjs';

/**
 * As travas da leitura diária, testadas contra o que já foi publicado errado.
 *
 * A leitura de 11/08/2026 saiu com o trending sendo o meta repetido — seis das
 * oito armas iguais, rótulos que só diziam "está subindo", dois motivos
 * copiados palavra por palavra e três das cinco fontes sendo a mesma página em
 * idiomas diferentes. Cada caso daqui é um pedaço daquele arquivo: se algum
 * voltar a passar, é porque a trava correspondente foi embora.
 *
 * O outro lado importa tanto quanto: uma leitura honesta e curta tem de entrar.
 * Trava que só sabe recusar deixa a tela congelada no último dia bom.
 */

const HOJE = '2026-08-11';

const anotacoes = [
  { type: 'url_citation', url: 'https://reddit.com/r/Battlefield6/comments/abc', title: 'Weapon balance após o 4.2' },
  { type: 'url_citation', url: 'https://ea.com/games/battlefield/battlefield-6/news/update-4-2', title: 'Update Notes 4.2' },
];

const leitura = (bruto, extras = {}) =>
  montarLeitura({ bruto, anotacoes, modelo: 'teste', hoje: HOJE, timeframe: 'season-4', ...extras });

/*
  As duas perguntas da tela não se provam no mesmo lugar, e por isso os dois
  ajudantes daqui nascem com fontes diferentes: o topo cita quem mede, a
  tendência cita onde a conversa acontece. Trocar uma pela outra é o que os
  testes de critério verificam.
*/
const FONTE_QUE_MEDE = 'https://ea.com/games/battlefield/battlefield-6/news/update-4-2';
const FONTE_DE_CONVERSA = 'https://reddit.com/r/Battlefield6/comments/abc';

const pick = (weapon, reason, source = FONTE_QUE_MEDE) => ({
  weapon,
  reason,
  source,
});

const trend = (weapon, rotulo, reason, source = FONTE_DE_CONVERSA) => ({
  ...pick(weapon, reason, source),
  trend: rotulo,
});

const META_BOM = [
  pick('M16A4', 'Segue primeira do ranking geral desde o ajuste de recuo do 4.2.'),
  pick('B36A4', 'TTK curto em média distância e recuo previsível com cano longo.'),
  pick('PP-19', 'A submetralhadora com melhor controle em corredor depois do buff de cadência.'),
  pick('KORD 6P67', 'Alcance útil maior que o resto da classe mesmo sem acessório de precisão.'),
];

describe('leitura do meta', () => {
  it('aceita uma leitura curta e sustentada', () => {
    const { conteudo } = leitura({
      patch: { name: 'Update 4.2', date: '2026-08-08' },
      picks: META_BOM,
      trending: [
        trend('VSSM', 'build full-auto', 'A configuração automática virou assunto depois de aparecer em vídeo de dano em CQB.'),
        trend('EF88', 'chegou no patch', 'Entrou com a fase Pacific Front e já aparece em builds recomendadas de engenheiro.'),
        trend('RPK-74M', 'buff de recuo', 'O 4.2 reduziu o coice vertical e o suporte voltou às listas de recomendação.'),
      ],
      sources: [
        { name: 'Reddit — balanceamento', url: 'https://reddit.com/r/Battlefield6/comments/abc', date: '2026-08-10', scope: 'Discussão de multiplayer.' },
      ],
    });

    expect(conteudo.picks).toHaveLength(4);
    expect(conteudo.trending.map((t) => t.weapon)).toEqual(['vssm', 'ef88', 'rpk-74m']);
    expect(conteudo.readAt).toBe(HOJE);
    expect(conteudo.patch).toEqual({ name: 'Update 4.2', date: '2026-08-08' });
  });

  it('recusa o trending que é o meta repetido', () => {
    expect(() =>
      leitura({
        picks: META_BOM,
        trending: [
          trend('M16A4', 'muito escolhida', 'Aparece em quase toda partida desde o começo da fase.'),
          trend('B36A4', 'seguindo forte', 'Continua entre as mais levadas por quem joga de assalto.'),
          trend('PP-19', 'em uso', 'Segue popular entre engenheiros nos mapas fechados da temporada.'),
          trend('KORD 6P67', 'presente', 'Aparece bastante nas partidas de quem prefere alcance.'),
        ],
      }),
    ).toThrow(/trending/);
  });

  it('recusa rótulo que só diz que a arma está subindo', () => {
    expect(() =>
      leitura({
        picks: META_BOM,
        trending: [
          trend('VSSM', 'popularidade crescente', 'Discussões recentes destacam sua eficácia em diversas situações.'),
          trend('EF88', 'aumento de uso', 'Jogadores recomendam por sua alta taxa de tiro e controle.'),
          trend('RPK-74M', 'tendência crescente', 'Comentários recentes elogiam seu alto dano e alcance.'),
        ],
      }),
    ).toThrow(/rótulo/);
  });

  it('descarta a segunda arma que repete o motivo da primeira', () => {
    const { conteudo, descartes } = leitura({
      picks: [
        ...META_BOM,
        pick('M433', 'Segue primeira do ranking geral desde o ajuste de recuo do 4.2.'),
        pick('L85A3', 'Recuo curto o bastante para segurar rajada inteira em média distância.'),
      ],
      trending: [],
    });

    expect(conteudo.picks.map((p) => p.weapon)).not.toContain('m433');
    expect(conteudo.picks.map((p) => p.weapon)).toContain('l85a3');
    expect(descartes).toContainEqual({ nome: 'M433', motivo: 'repete o motivo de outra arma palavra por palavra' });
  });

  it('conta o mesmo site em idiomas diferentes como uma fonte só', () => {
    const { conteudo } = leitura({
      picks: META_BOM,
      trending: [],
      sources: [
        { name: 'Tier list', url: 'https://battlefieldmeta.gg/multiplayer', date: '2026-08-09', scope: 'Tier list de multiplayer.' },
        { name: 'Tier list (es)', url: 'https://battlefieldmeta.gg/es/multiplayer', date: '2026-08-09', scope: 'A mesma página em espanhol.' },
        { name: 'Tier list (pt)', url: 'https://battlefieldmeta.gg/pt/multiplayer', date: '2026-08-09', scope: 'A mesma página em português.' },
      ],
    });

    expect(conteudo.sources.filter((f) => f.url.includes('battlefieldmeta.gg'))).toHaveLength(1);
  });

  it('cita a fonte que o modelo apontou, não a posição da arma na lista', () => {
    const { conteudo, descartes } = leitura({
      picks: [
        pick('M16A4', 'Segue primeira do ranking geral desde o ajuste de recuo do 4.2.'),
        pick('B36A4', 'TTK curto em média distância e recuo previsível com cano longo.', 'https://wzstats.gg/battlefield-6/multiplayer/meta'),
        pick('PP-19', 'A submetralhadora com melhor controle em corredor depois do buff de cadência.', 'https://exemplo.invalido/nao-listada'),
        pick('KORD 6P67', 'Alcance útil maior que o resto da classe mesmo sem acessório de precisão.'),
        pick('L85A3', 'Recuo curto o bastante para segurar rajada inteira em média distância.'),
      ],
      trending: [],
      sources: [
        { name: 'Ranking do multiplayer', url: 'https://wzstats.gg/battlefield-6/multiplayer/meta', date: '2026-08-09', scope: 'Ranking arma a arma, só de multiplayer.' },
      ],
    });

    const porArma = Object.fromEntries(conteudo.picks.map((p) => [p.weapon, p.sources]));
    const ea = conteudo.sources.findIndex((f) => f.url.includes('ea.com'));
    const rastreador = conteudo.sources.findIndex((f) => f.url.includes('wzstats.gg'));

    expect(porArma.m16a4).toEqual([ea]);
    expect(porArma.b36a4).toEqual([rastreador]);
    // Arma cuja fonte não está entre as que sobraram não herda a de outra nem
    // fica sem colchete: ela sai. Cartão sem citação é afirmação sem nada atrás.
    expect(porArma['pp-19']).toBeUndefined();
    expect(descartes).toContainEqual({
      nome: 'PP-19',
      motivo: 'sem fonte que resolva entre as que sobraram',
    });
  });

  /*
   * A leitura de 19/08 saiu com três armas no topo e duas em tendência, todas
   * sem colchete: o modelo apontou páginas que o saneamento de fontes já tinha
   * recusado, e o que ficou na tela foi "desempenho superior em dano e controle"
   * sem nada atrás. É a trava mais recente, e a que mais depende do resto — só
   * dá para exigir citação de todo cartão porque a tela sabe completar o bloco.
   */
  it('recusa a leitura em que nenhum cartão cita fonte que resolva', () => {
    expect(() =>
      leitura({
        picks: META_BOM.map((p) => ({ ...p, source: 'https://exemplo.invalido/nao-listada' })),
        trending: [],
      }),
    ).toThrow(/sem fonte que resolva/);
  });

  it('recusa resposta em que a busca não abriu página nenhuma', () => {
    expect(() => leitura({ picks: META_BOM, trending: [] }, { anotacoes: [] })).toThrow(/busca/);
  });

  /*
   * O erro que mais custou caro nesta tela não foi arma inventada nem motivo
   * repetido: foi lista certa do jogo errado. A leitura de 17/08 publicou a
   * KTS100 MK8 como "melhor metralhadora do multiplayer" apoiada em página de
   * battle royale — ela é a primeira colocada geral do REDSEC e não chega ao
   * pódio da classe no multiplayer. Nada no texto da página denunciava isso; o
   * endereço, sim.
   */
  it('descarta a fonte que é página de REDSEC', () => {
    const { conteudo, descartes } = leitura({
      picks: META_BOM,
      trending: [],
      sources: [
        { name: 'Ranking do BR', url: 'https://wzstats.gg/battlefield-6/meta', date: '2026-08-19', scope: 'Ranking geral.' },
        { name: 'Ranqueado', url: 'https://wzstats.gg/battlefield-6/ranked/meta', date: '2026-08-19', scope: 'Ranqueado.' },
        { name: 'Loot do REDSEC', url: 'https://exemplo.gg/battlefield-6/redsec/loadouts', date: '2026-08-19', scope: 'Battle royale.' },
        { name: 'Ranking do multiplayer', url: 'https://wzstats.gg/battlefield-6/multiplayer/meta', date: '2026-08-19', scope: 'Só multiplayer.' },
      ],
    });

    const enderecos = conteudo.sources.map((f) => f.url);
    expect(enderecos).toContain('https://wzstats.gg/battlefield-6/multiplayer/meta');
    expect(enderecos.some((url) => url.includes('/ranked/') || url.includes('redsec'))).toBe(false);
    expect(enderecos).not.toContain('https://wzstats.gg/battlefield-6/meta');
    expect(descartes.filter((d) => d.motivo.includes('REDSEC'))).toHaveLength(3);
  });

  it('recusa a leitura inteira quando só sobrou página de battle royale', () => {
    expect(() =>
      leitura(
        {
          picks: META_BOM,
          trending: [],
          sources: [
            { name: 'Ranking do BR', url: 'https://wzstats.gg/battlefield-6/meta', date: '2026-08-19', scope: 'Ranking geral.' },
          ],
        },
        { anotacoes: [{ type: 'url_citation', url: 'https://wzstats.gg/battlefield-6/ranked/meta', title: 'Ranqueado' }] },
      ),
    ).toThrow(/REDSEC/);
  });

  it('recusa nome de arma que não existe no jogo', () => {
    expect(() =>
      leitura({
        picks: [
          pick('AK-4711', 'Arma inventada que o modelo achou que existia no arsenal da temporada.'),
          pick('M16A4', 'Segue primeira do ranking geral desde o ajuste de recuo do 4.2.'),
        ],
        trending: [],
      }),
    ).toThrow(/não existe no jogo/);
  });
});

describe('patch da leitura', () => {
  it('ignora data no futuro, que é alucinação', () => {
    expect(normalizarPatch({ patch: { name: 'Update 9.9', date: '2026-12-01' } }, HOJE)).toEqual({
      name: 'Update 9.9',
      date: null,
    });
  });

  it('devolve nulo quando o modelo não identificou atualização', () => {
    expect(normalizarPatch({}, HOJE)).toBeNull();
    expect(normalizarPatch({ patch: { name: '', date: 'não sei' } }, HOJE)).toBeNull();
  });

  it('recusa patch de antes da temporada que a leitura declara', () => {
    /*
     * Aconteceu: a leitura de 17/08 saiu apontando o Blastpoint 1.3.2.0, de
     * 10/06, com a Temporada 4 no ar desde 21/07. A tela dizia "revisado em
     * 17/08" e descrevia o jogo de duas temporadas atrás — o pior tipo de erro,
     * porque a data recente é justamente o que faz o leitor confiar na lista.
     */
    const velho = { patch: { name: 'Blastpoint Update 1.3.2.0', date: '2026-06-10' } };

    expect(normalizarPatch(velho, HOJE, '2026-07-21')).toBeNull();
    expect(normalizarPatch(velho, HOJE)).toEqual({
      name: 'Blastpoint Update 1.3.2.0',
      date: '2026-06-10',
    });
  });

  it('aceita o patch da temporada corrente', () => {
    expect(
      normalizarPatch({ patch: { name: 'Game Update 1.4.1.0', date: '2026-07-21' } }, HOJE, '2026-07-21'),
    ).toEqual({ name: 'Game Update 1.4.1.0', date: '2026-07-21' });
  });
});

describe('chave de página', () => {
  it('junta www, barra final e prefixo de idioma', () => {
    expect(chavePagina('https://www.battlefieldmeta.gg/pt/')).toBe(chavePagina('https://battlefieldmeta.gg'));
    expect(chavePagina('https://exemplo.gg/meta')).not.toBe(chavePagina('https://exemplo.gg/trending'));
  });
});

/**
 * Ser criterioso, aqui, não é desconfiar de todo mundo: é saber o que cada
 * página pode provar. A leitura de 19/08 pôs no topo armas que ninguém
 * sustentava, com frases que caberiam em qualquer arma, e isso passou porque as
 * travas de então só perguntavam se a página existia e de que modo ela falava.
 */
describe('critério do topo', () => {
  it('classifica a página pelo que ela pode sustentar', () => {
    expect(confiabilidade('https://www.ea.com/games/battlefield/battlefield-6/news/x')).toBe('oficial');
    // O mesmo domínio, dois papéis: comunicado do estúdio e conversa de quem joga.
    expect(confiabilidade('https://forums.ea.com/blog/battlefield-game-info-hub-en/x/1')).toBe('oficial');
    expect(confiabilidade('https://forums.ea.com/idea/battlefield-6-bug-reports-en/x/1')).toBe('comunidade');
    expect(confiabilidade('https://wzstats.gg/battlefield-6/multiplayer/meta')).toBe('analise');
    expect(confiabilidade('https://bf6balancelog.com/')).toBe('analise');
    expect(confiabilidade('https://www.reddit.com/r/Battlefield6/comments/abc')).toBe('comunidade');
    // Ranqueia armas e aparece na busca, mas é peça de marketing de VPN.
    expect(confiabilidade('https://nolagvpn.com/battlefield-6-meta')).toBe('comunidade');
    expect(confiabilidade('nem-url')).toBe('comunidade');
  });

  it('descarta do topo a arma que só o Reddit sustenta', () => {
    const { conteudo, descartes } = leitura({
      picks: [
        ...META_BOM,
        pick('L85A3', 'Uma thread diz que ela ficou absurda depois do último ajuste de recuo.', FONTE_DE_CONVERSA),
      ],
      trending: [],
    });

    expect(conteudo.picks.map((p) => p.weapon)).not.toContain('l85a3');
    expect(descartes).toContainEqual({
      nome: 'L85A3',
      motivo: 'sustentada só por conversa: fórum e Reddit não medem força',
    });
  });

  it('a mesma fonte de Reddit continua sustentando a tendência', () => {
    const { conteudo } = leitura({
      picks: META_BOM,
      trending: [
        trend('L85A3', 'todo mundo usando', 'Thread de 400 respostas contando que ela apareceu em quase toda partida da semana.'),
      ],
    });

    expect(conteudo.trending.map((t) => t.weapon)).toEqual(['l85a3']);
    expect(conteudo.trending[0].sources).toHaveLength(1);
  });

  it('descarta a fonte publicada antes do começo da temporada', () => {
    const { conteudo, descartes } = leitura({
      picks: META_BOM,
      trending: [],
      sources: [
        { name: 'Guia de lançamento', url: 'https://exemplo.gg/battlefield-6/multiplayer/melhores-armas', date: '2026-05-02', scope: 'Guia do lançamento, multiplayer.' },
      ],
    });

    expect(conteudo.sources.map((f) => f.url)).not.toContain('https://exemplo.gg/battlefield-6/multiplayer/melhores-armas');
    expect(descartes.some((d) => d.motivo.includes('antes do começo da temporada'))).toBe(true);
  });

  // A frase abaixo é a que a leitura de 19/08 publicou, palavra por palavra.
  it('descarta o motivo que é elogio sem fato', () => {
    const { conteudo, descartes } = leitura({
      picks: [
        ...META_BOM,
        pick('L85A3', 'Reconhecida por seu desempenho superior em dano e controle, tornando-se uma escolha dominante no meta atual.'),
      ],
      trending: [],
    });

    expect(conteudo.picks.map((p) => p.weapon)).not.toContain('l85a3');
    expect(descartes).toContainEqual({
      nome: 'L85A3',
      motivo: 'motivo é elogio sem fato: serve para qualquer arma',
    });
  });
});
