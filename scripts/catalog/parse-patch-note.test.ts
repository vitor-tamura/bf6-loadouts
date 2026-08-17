/**
 * O que o parser pode e o que ele não pode afirmar.
 *
 * Este é o ponto do pipeline em que texto de marketing vira dado, e o único em
 * que uma leitura errada passa despercebida: ninguém confere linha a linha um
 * Pull Request com trezentas mudanças. Os testes aqui existem para fixar a
 * fronteira — o que segue sozinho, o que vai marcado para revisão e o que não
 * pode virar número de jeito nenhum.
 */

import { describe, expect, it } from 'vitest';
import {
  knownEntities,
  looksLikePatchNote,
  parseAnnouncements,
  parseLine,
  parseNote,
} from './parse-patch-note.ts';
import { compareVersions, isGameVersion } from './lib/io.ts';
import { extractUpdates, toIsoDate } from './discover-updates.ts';

const known = knownEntities();
const parse = (line: string) => parseLine(line, known);

describe('mudança com os dois números', () => {
  it('aplica sozinha, porque o antes e o depois vieram da fonte', () => {
    const change = parse('M16A4: rate of fire increased from 800 to 820 RPM');

    expect(change).toBeTruthy();
    expect(change!.entityId).toBe('m16a4');
    expect(change!.field).toBe('rpm');
    expect(change!.operation).toBe('set');
    expect(change!.before).toBe(800);
    expect(change!.after).toBe(820);
    expect(change!.automation).toBe('auto');
  });

  it('entende a forma de tabela, com seta', () => {
    const change = parse('M121 A2 — magazine capacity: 100 → 150');

    expect(change!.entityId).toBe('m121a2');
    expect(change!.field).toBe('magazineCapacity');
    expect(change!.before).toBe(100);
    expect(change!.after).toBe(150);
  });
});

describe('mudança em porcentagem', () => {
  /*
   * O caso do enunciado: "Recoil reduced by 10%" diz a operação e a proporção,
   * e nada além disso. Inventar o valor de antes ou o de depois produziria uma
   * estatística com cara de medida.
   */
  it('guarda a operação e o sinal, sem inventar valores', () => {
    const change = parse('RPK-74M: recoil reduced by 10%');

    expect(change!.entityId).toBe('rpk74m');
    expect(change!.operation).toBe('percentage');
    expect(change!.value).toBe(-10);
    expect(change!.before).toBeNull();
    expect(change!.after).toBeNull();
  });

  it('lê aumento como número positivo', () => {
    const change = parse('CZ3A1: damage increased by 5%');

    expect(change!.value).toBe(5);
    expect(change!.operation).toBe('percentage');
  });

  it('manda para revisão quando a arma citada não existe no catálogo', () => {
    const change = parse('XM-99 Prototype: recoil reduced by 12%');

    expect(change!.automation).toBe('review');
    expect(change!.entityId).toBeNull();
  });
});

describe('adições e remoções', () => {
  it('nunca cria entidade sozinha', () => {
    const change = parse('New weapon added: XM-99 Prototype assault rifle');

    expect(change!.kind).toBe('weapon_added');
    expect(change!.automation).toBe('review');
    expect(change!.entityId).toBeNull();
  });

  it('aceita remoção de quem existe, porque o id já é conhecido', () => {
    const change = parse('The DB-12 shotgun has been removed from the store rotation');

    expect(change!.entityId).toBe('db12');
    expect(change!.kind).toBe('weapon_removed');
    expect(change!.automation).toBe('auto');
  });

  it('aceita remoção de peça cujo nome já traz o tipo', () => {
    const change = parse('The 50 MW Violet laser has been removed from the game.');

    expect(change!.entityId).toBe('50mw_violet');
    expect(change!.kind).toBe('attachment_removed');
    expect(change!.automation).toBe('auto');
  });

  it('não tira a arma quando o que saiu foi algo de dentro dela', () => {
    /*
     * A linha é do patch 1.4.2.0, e foi ela que apagou a VSSM do catálogo: o
     * parser viu "removed" e um nome de arma na mesma frase e aplicou a saída
     * sozinho. O que a EA tirou foi um modificador do cano — a arma continua no
     * jogo, e com ela vinham 62 curvas de dano contra 61 armas, o bastante para
     * derrubar `damageCurves`, `velocity`, `drag` e `ttk` de uma vez.
     *
     * A entidade continua reconhecida: a frase é notícia sobre a VSSM, e some
     * do Pull Request se virar nulo. O que ela não pode é seguir sozinha.
     */
    const change = parse(
      'An unintended recoil modifier has been removed from VSSM barrel attachments.',
    );

    expect(change!.entityId).toBe('vssm');
    expect(change!.kind).not.toBe('weapon_removed');
    expect(change!.automation).toBe('review');
  });

  it('não lê defeito corrigido como conteúdo retirado', () => {
    const change = parse(
      'Fixed an issue where the M87A1 laser sight was not being removed on unequip.',
    );

    expect(change!.entityId).toBe('m87a1');
    expect(change!.kind).not.toBe('weapon_removed');
    expect(change!.automation).toBe('review');
  });

  it('ignora remoção que não é de arma nem de peça', () => {
    /*
     * Patch note remove muita coisa que não é conteúdo: botão, ícone, som.
     * Tratar cada uma como "não consegui ler" abriria uma issue de revisão
     * manual por patch — e o texto continua guardado para auditoria.
     */
    expect(parse('The Challenges button has been removed from the attachment screen')).toBeNull();
    expect(parse('Some weapon attachments were removed from the test range')).toBeNull();
  });
});

describe('o que o parser ignora', () => {
  it('não vê mudança em frase que não fala de arma nem de peça', () => {
    expect(parse('Fixed a crash when joining a squad in the lobby')).toBeNull();
    expect(parse('Server stability improvements')).toBeNull();
  });

  it('não confunde M4A1 com M4 ao casar o nome mais longo', () => {
    const change = parse('M4A1: reload time reduced by 8%');
    expect(change!.entityId).toBe('m4a1');
  });

  it('deixa a peça específica de arma para o revisor', () => {
    /*
     * "30 Rnd" é o nome de dezenas de carregadores diferentes, um por arma.
     * Casar pelo nome escolheria um a esmo.
     */
    const change = parse('30 Rnd magazine reload speed increased by 5%');
    expect(change?.entityId ?? null).toBeNull();
  });
});

describe('mudança sem número', () => {
  it('vai para revisão quando a frase diz que algo mudou', () => {
    const change = parse('M16A4 recoil has been adjusted');

    expect(change!.automation).toBe('review');
    expect(change!.operation).toBe('none');
  });

  it('não inventa mudança a partir de nota de interface', () => {
    /*
     * Citar uma arma e uma estatística não é anunciar balanceamento. Esta
     * frase é real, do patch 1.4.1.0, e virava uma alteração de carregador da
     * M60 — o verbo é o que separa a correção de ícone da mudança de arma.
     */
    expect(
      parse('Magazine attachment indicator alignment has been improved when customising the M/60'),
    ).toBeNull();
  });

  it('não confunde "slightly" com o cano Light', () => {
    // Outra do 1.4.1.0: sem fronteira de palavra, `light` casa dentro de
    // "slightly" e a frase vira mudança de dano de um cano.
    expect(parse('Fall damage is now slightly reduced when falling into shallow water')).toBeNull();
  });
});

describe('compatibilidade anunciada em prosa', () => {
  /*
   * A frase é literal do patch 1.4.1.0. É o caso que a automação existe para
   * cobrir: a EA lista as armas, e a relação pode nascer sem revisão.
   */
  const frase =
    'The Extended Barrel with a 4" extension increases projectile velocity at the cost of mobility and aim-down-sights speed, and is available for the M87A1, M1014, 18.5KS-K, and DB-12.';

  it('lê a lista inteira, sem parar no ponto de "18.5KS-K"', () => {
    const [change] = parseAnnouncements(frase, known);

    expect(change.kind).toBe('compatibility_added');
    expect(change.weaponIds).toEqual(['m87a1', 'm1014', 'ks18k', 'db12']);
  });

  it('procura a peça entre as peças, e não a primeira entidade da frase', () => {
    /*
     * A frase cita quatro armas antes de qualquer coisa. Procurar "a primeira
     * entidade" devolvia a M87A1 como se fosse a peça, e a relação saía
     * apontando para nada — ou, pior, marcada como automática.
     */
    const [change] = parseAnnouncements(frase, known);

    expect(change.entityId).toBe('extended_barrel');
    expect(change.automation).toBe('auto');
  });

  it('deixa para revisão enquanto a peça não existir no catálogo', () => {
    const [change] = parseAnnouncements(
      'The Quantum Grip is available for the M87A1 and the M1014.',
      known,
    );

    expect(change.entityId).toBeNull();
    expect(change.automation).toBe('review');
    expect(change.reason).toContain('não existe no catálogo');
  });

  it('não inventa relação quando nenhuma arma resolve', () => {
    expect(
      parseAnnouncements('The Widget is available for the Foo and the Bar.', known),
    ).toHaveLength(0);
  });
});

describe('o texto tem cara de patch note?', () => {
  it('reconhece changelog e seções em caixa alta', () => {
    expect(looksLikePatchNote('Major Updates for 1.4.1.5\n CHANGELOG')).toBe(true);
    expect(looksLikePatchNote('\n PLAYER: \n a\n VEHICLES: \n b\n WEAPONS: \n c')).toBe(true);
  });

  it('recusa página que não é patch note', () => {
    // Distingue "patch sem mudanças de catálogo" de "parser cego".
    expect(looksLikePatchNote('Sorry, you are not eligible to view this content.')).toBe(false);
  });
});

describe('o patch note inteiro', () => {
  it('lê cada linha e descarta as que não dizem respeito ao catálogo', () => {
    const changes = parseNote(
      {
        version: '1.4.2.0',
        source: {
          provider: 'EA',
          official: true,
          type: 'official',
          url: 'https://example.invalid',
          retrievedAt: '2026-08-12T00:00:00.000Z',
        },
        publishedAt: null,
        title: null,
        rawContent: [
          'Battlefield 6 Update 1.4.2.0',
          'Fixed an issue with squad spawn',
          'M16A4: rate of fire increased from 800 to 820 RPM',
          'RPK-74M: recoil reduced by 10%',
          '',
        ].join('\n'),
        changes: [],
      },
      known,
    );

    expect(changes).toHaveLength(2);
    expect(changes.map((change) => change.entityId)).toEqual(['m16a4', 'rpk74m']);
  });
});

describe('números de versão', () => {
  it('ordena como a EA numera, e não como texto', () => {
    const versions = ['1.4.10.0', '1.4.2.0', '1.3.3.0'].sort(compareVersions);
    expect(versions).toEqual(['1.3.3.0', '1.4.2.0', '1.4.10.0']);
  });

  it('reconhece só o formato de quatro grupos', () => {
    expect(isGameVersion('1.4.2.0')).toBe(true);
    expect(isGameVersion('Season 4')).toBe(false);
    expect(isGameVersion('1.4')).toBe(false);
  });

  it('lê a versão do endereço do artigo, não do corpo da página', () => {
    /*
     * A página da EA tem números de quatro grupos por toda parte — ids de
     * componente como 2.926.379.084. Um extrator que varresse o texto colheria
     * isso como versão e o pipeline baixaria um patch note inexistente.
     */
    const html = `
      <a href="/games/battlefield/battlefield-6/news/battlefield-6-game-update-1-4-1-5">
        <span>August 3, 2026</span>
        <span style="--line-clamp:3">BATTLEFIELD 6 GAME UPDATE 1.4.1.5</span>
      </a>
      <p>id 2.926.379.084 e 069.342.055.185 não são versões</p>`;

    const found = extractUpdates(html);
    expect(found).toHaveLength(1);
    expect(found[0].version).toBe('1.4.1.5');
    expect(found[0].publishedAt).toBe('2026-08-03');
    expect(found[0].title).toBe('BATTLEFIELD 6 GAME UPDATE 1.4.1.5');
    expect(found[0].url).toContain('https://www.ea.com/');
  });

  it('converte a data do jeito que a EA escreve', () => {
    expect(toIsoDate('August 3, 2026')).toBe('2026-08-03');
    expect(toIsoDate('December 12, 2025')).toBe('2025-12-12');
  });
});
