import { describe, expect, it } from 'vitest';
import { chavePagina, montarLeitura, normalizarPatch } from './leitura.mjs';

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

const pick = (weapon, reason, source = 'https://reddit.com/r/Battlefield6/comments/abc') => ({
  weapon,
  reason,
  source,
});

const trend = (weapon, rotulo, reason) => ({ ...pick(weapon, reason), trend: rotulo });

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
        { name: 'Tier list', url: 'https://battlefieldmeta.gg/', date: '2026-08-09', scope: 'Tier list de multiplayer.' },
        { name: 'Tier list (es)', url: 'https://battlefieldmeta.gg/es', date: '2026-08-09', scope: 'A mesma página em espanhol.' },
        { name: 'Tier list (pt)', url: 'https://battlefieldmeta.gg/pt', date: '2026-08-09', scope: 'A mesma página em português.' },
      ],
    });

    expect(conteudo.sources.filter((f) => f.url.includes('battlefieldmeta.gg'))).toHaveLength(1);
  });

  it('cita a fonte que o modelo apontou, não a posição da arma na lista', () => {
    const { conteudo } = leitura({
      picks: [
        pick('M16A4', 'Segue primeira do ranking geral desde o ajuste de recuo do 4.2.', 'https://ea.com/games/battlefield/battlefield-6/news/update-4-2'),
        pick('B36A4', 'TTK curto em média distância e recuo previsível com cano longo.', 'https://reddit.com/r/Battlefield6/comments/abc'),
        pick('PP-19', 'A submetralhadora com melhor controle em corredor depois do buff de cadência.', 'https://exemplo.invalido/nao-listada'),
        pick('KORD 6P67', 'Alcance útil maior que o resto da classe mesmo sem acessório de precisão.'),
      ],
      trending: [],
    });

    const porArma = Object.fromEntries(conteudo.picks.map((p) => [p.weapon, p.sources]));
    const ea = conteudo.sources.findIndex((f) => f.url.includes('ea.com'));
    const reddit = conteudo.sources.findIndex((f) => f.url.includes('reddit.com'));

    expect(porArma.m16a4).toEqual([ea]);
    expect(porArma.b36a4).toEqual([reddit]);
    // Arma cuja fonte não está na lista fica sem citação, em vez de herdar a de outra.
    expect(porArma['pp-19']).toEqual([]);
  });

  it('recusa resposta em que a busca não abriu página nenhuma', () => {
    expect(() => leitura({ picks: META_BOM, trending: [] }, { anotacoes: [] })).toThrow(/busca/);
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
});

describe('chave de página', () => {
  it('junta www, barra final e prefixo de idioma', () => {
    expect(chavePagina('https://www.battlefieldmeta.gg/pt/')).toBe(chavePagina('https://battlefieldmeta.gg'));
    expect(chavePagina('https://exemplo.gg/meta')).not.toBe(chavePagina('https://exemplo.gg/trending'));
  });
});
