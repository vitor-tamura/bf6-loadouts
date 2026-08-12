/**
 * O que o catálogo promete.
 *
 * Estes testes leem o artefato gerado de verdade, não um exemplo montado para
 * passar. É de propósito: o que se quer garantir não é que as funções somem
 * direito, e sim que o arquivo publicado descreve o jogo — que a M121 A2 existe,
 * que o 50 MW Violet está nas quatro armas em que ele foi confirmado, e que
 * nenhuma peça apareceu numa arma sem fonte que a sustente.
 *
 * A consequência é que este arquivo falha quando o catálogo muda. É o alarme
 * funcionando: um patch que mexa nessas relações precisa passar por aqui e ser
 * confirmado à mão, em vez de entrar calado num Pull Request automático.
 */

import { describe, expect, it } from 'vitest';
import {
  absentFromCatalog,

  getAttachment,
  getAttachmentEffects,
  getAttachmentWeapons,
  getBallisticsModel,
  getCapabilities,
  getCurrentCatalog,
  getDataQuality,
  getPending,
  getVersion,
  getWeapon,
  getWeaponAttachments,
  getWeaponAttachmentsBySlot,
  getWeaponBallistics,
  getWeaponDamageModel,
  getWeaponDataQuality,
  getWeaponStats,
  getWeapons,
  isCompatible,
  supports,
  toCatalogId,
} from './index';

const catalog = getCurrentCatalog();

describe('a versão publicada', () => {
  /*
   * O número não é fixado aqui de propósito.
   *
   * Ele muda a cada patch, e o pipeline roda esta suíte antes de abrir o Pull
   * Request: um teste preso a "1.3.3.0" falharia em toda atualização por
   * motivo burocrático, e o hábito de ajustá-lo sem ler acabaria encobrindo as
   * falhas que importam — as relações confirmadas à mão, logo abaixo.
   */
  it('declara a versão do jogo que descreve', () => {
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it('traz o arsenal inteiro', () => {
    expect(getWeapons()).toHaveLength(62);
    // 400 do import inicial + as duas peças que a Temporada 4 anunciou.
    expect(catalog.attachments).toHaveLength(402);
  });

  it('mantém as peças da Temporada 4 como entidades, sem compatibilidade', () => {
    /*
     * As duas peças que o patch note anunciou continuam no catálogo, mas sem
     * relação nenhuma: a matriz vem da planilha MASTER, cuja base é 1.3.3.0 —
     * anterior à Temporada 4 —, e ela não as lista. As quatro relações do
     * Extended Barrel que a EA havia anunciado saíram junto com a substituição
     * da matriz.
     */
    const cano = getAttachment('extended_barrel')!;
    expect(cano.slot).toBe('barrel');
    expect(cano.introducedIn).toBe('1.4.1.0');
    expect(getAttachmentWeapons('extended_barrel')).toHaveLength(0);

    const mira = getAttachment('1p86_lpvo')!;
    expect(mira.slot).toBe('sight');
    expect(getAttachmentWeapons('1p86_lpvo')).toHaveLength(0);

    // Nenhuma das duas teve custo publicado pela EA.
    expect(cano.cost).toBeNull();
    expect(mira.cost).toBeNull();
  });
});

describe('as armas citadas na migração', () => {
  const nomes: [string, string][] = [
    ['m121a2', 'M121 A2'],
    ['m16a4', 'M16A4'],
    ['rpk74m', 'RPK-74M'],
    ['cz3a1', 'CZ3A1'],
    ['db12', 'DB-12'],
  ];

  it.each(nomes)('%s continua no catálogo como %s', (id, nome) => {
    const arma = getWeapon(id);
    expect(arma).toBeDefined();
    expect(arma!.name).toBe(nome);
    expect(arma!.status).toBe('active');
    expect(arma!.introducedIn).toBe('1.3.3.0');
    expect(arma!.removedIn).toBeNull();
  });

  it('cada arma diz de onde veio', () => {
    for (const arma of getWeapons()) {
      expect(arma.source.provider).toBeTruthy();
      expect(arma.source.type).not.toBe('inferred');
    }
  });
});

describe('o 50 MW Violet', () => {
  /*
   * O caso conhecido de fontes em desacordo: a matriz da comunidade liga o
   * laser a dezenas de armas, e o estado atual do jogo o mostra em quatro. O
   * catálogo serve as quatro, e este teste é o que impede a lista longa de
   * voltar sem que alguém decida por isso.
   */
  const confirmadas = ['cz3a1', 'db12', 'm121a2', 'rpk74m'];

  it('existe como peça de laser', () => {
    const peça = getAttachment('50mw_violet');
    expect(peça).toBeDefined();
    expect(peça!.slot).toBe('laser');
    expect(peça!.name).toBe('Laser Violeta de 50 MW');
    expect(peça!.originalName).toBe('50 MW Violet');
  });

  it('segue a matriz da planilha, e não a lista curta anterior', () => {
    /*
     * A escolha mudou por decisão de quem mantém o catálogo: a planilha MASTER
     * é a fonte, e ela traz a matriz longa. As quatro armas que o estado atual
     * do jogo mostrava (`m121a2`, `rpk74m`, `cz3a1`, `db12`) continuam na
     * lista, agora acompanhadas das demais.
     */
    const armas = getAttachmentWeapons('50mw_violet').map((arma) => arma.id);
    expect(armas.length).toBeGreaterThan(50);
    for (const id of confirmadas) expect(armas).toContain(id);
  });

  it('responde igual pelos dois lados da relação', () => {
    for (const id of confirmadas) {
      expect(isCompatible(id, '50mw_violet')).toBe(true);
      expect(getWeaponAttachments(id).map((peça) => peça.id)).toContain('50mw_violet');
    }
  });
});

describe('nomes das peças', () => {
  it('vêm em português, com o nome de origem ao lado', () => {
    const violeta = getAttachment('50mw_violet')!;
    expect(violeta.name).toBe('Laser Violeta de 50 MW');
    expect(violeta.originalName).toBe('50 MW Violet');
  });

  it('seguem a matriz de cano do jogo: comprimento × perfil', () => {
    /*
     * A tela "Selecionar cano" nomeia pelo cruzamento de comprimento com
     * perfil, não pela medida em polegadas. Fora da matriz existe só o Crio.
     */
    const canos = Object.fromEntries(
      catalog.attachments
        .filter((peça) => peça.slot === 'barrel')
        .map((peça) => [peça.originalName, peça.name]),
    );

    expect(canos['Basic']).toBe('Cano Básico');
    expect(canos['Short']).toBe('Cano Curto');
    expect(canos['Extended']).toBe('Cano Estendido');
    expect(canos['Light']).toBe('Cano Leve');
    expect(canos['Short Light']).toBe('Cano Curto Leve');
    expect(canos['Extended Light']).toBe('Cano Estendido Leve');
    expect(canos['Heavy']).toBe('Cano Pesado');
    expect(canos['Heavy Extended']).toBe('Cano Ext. Pesado');
    expect(canos['Cryogenic']).toBe('Crio');
  });

  it('nomeiam carregador pela capacidade, como o dataset curado', () => {
    const porOriginal = new Map(
      catalog.attachments.filter((p) => p.slot === 'magazine').map((p) => [p.originalName, p.name]),
    );
    expect(porOriginal.get('30 Rnd')).toBe('Carregador de 30');
    expect(porOriginal.get('30 Fast')).toBe('Carregador Rápido de 30');
  });

  it('usam o nome que está na tela do jogo, e não a tradução do dataset', () => {
    /*
     * A tela "Selecionar ergonomia" da M16A4 desmentiu a nomenclatura curada em
     * cinco peças de uma vez — e o dataset ainda inventava um nome que não
     * existe no jogo, "Receiver A3", para a peça que a tela chama de Auto.
     * Print manda sobre catálogo e sobre tradução.
     */
    const nomes = Object.fromEntries(
      catalog.attachments.map((peça) => [peça.id, `${peça.name}|${peça.cost}`]),
    );

    expect(nomes.full_auto).toBe('Auto|25');
    expect(nomes.mag_flare).toBe('Pente Expandido|10');
    expect(nomes.match_trigger).toBe('Gatilho|15');
    expect(nomes.rail_cover).toBe('Cobertura de Trilho|5');
    expect(nomes.buffer).toBe('Amortecedor|5');
    expect(nomes.light_supp).toBe('Supressor Leve|30');
  });

  it('mantém os custos de ergonomia que a tela do jogo mostra', () => {
    /*
     * A compatibilidade de ergonomia saiu do catálogo: a matriz da planilha tem
     * sete slots e `ergonomics` não é um deles, e as cinco relações que a print
     * da M16A4 havia confirmado não sobreviveram à substituição.
     *
     * Os custos, esses continuam certos — a planilha traz os mesmos números da
     * tela, o que é uma confirmação independente deles.
     */
    const porId = Object.fromEntries(catalog.attachments.map((peça) => [peça.id, peça.cost]));

    expect(porId.buffer).toBe(5);
    expect(porId.rail_cover).toBe(5);
    expect(porId.mag_flare).toBe(10);
    expect(porId.match_trigger).toBe(15);
    expect(porId.full_auto).toBe(25);

    expect(getWeaponAttachmentsBySlot('m16a4').get('ergonomics') ?? []).toHaveLength(0);
  });

  it('não deixam nenhuma peça ativa em inglês', () => {
    expect(getPending().attachmentsWithoutTranslation).toBe(0);

    for (const peça of catalog.attachments) {
      expect(peça.name, peça.id).toBeTruthy();
      expect(peça.originalName, peça.id).toBeTruthy();
    }
  });

  it('traduzem slots e categorias com o vocabulário do site', () => {
    const slots = Object.fromEntries(catalog.slots.map((s) => [s.id, s.name]));
    expect(slots.barrel).toBe('Cano');
    expect(slots.muzzle).toBe('Boca');
    expect(slots.underbarrel).toBe('Acoplamento Inferior');

    const categorias = Object.fromEntries(catalog.categories.map((c) => [c.id, c.name]));
    expect(categorias.assault_rifle).toBe('Assalto');
    expect(categorias.sniper_rifle).toBe('Sniper');
  });

  it('guardam o nome de origem como apelido de slot e categoria', () => {
    // A busca precisa achar por "Barrel" também.
    expect(catalog.slots.find((s) => s.id === 'barrel')!.aliases).toContain('Barrel');
    expect(catalog.categories.find((c) => c.id === 'assault_rifle')!.aliases).toContain(
      'Assault Rifle',
    );
  });
});

describe('carregadores', () => {
  it('são peças de uma arma só, e não entidades compartilhadas', () => {
    const carregadores = catalog.attachments.filter((peça) => peça.slot === 'magazine');
    expect(carregadores.length).toBeGreaterThan(200);

    for (const carregador of carregadores) {
      expect(carregador.scope).toBe('weapon');
      expect(carregador.weaponScope).toBeTruthy();
      // O id carrega a arma dona: dois "30 Rnd" nunca colidem.
      expect(carregador.id).toContain(`:${carregador.weaponScope}:`);
    }
  });

  it('só aparecem na arma a que pertencem', () => {
    for (const carregador of catalog.attachments.filter((peça) => peça.scope === 'weapon')) {
      const armas = getAttachmentWeapons(carregador.id).map((arma) => arma.id);
      for (const arma of armas) expect(arma).toBe(carregador.weaponScope);
    }
  });
});

describe('munição', () => {
  it('tem entidade própria, com id em escopo', () => {
    const munições = catalog.attachments.filter((peça) => peça.slot === 'ammo');
    expect(munições.length).toBe(15);
    for (const munição of munições) expect(munição.id.startsWith('ammo:')).toBe(true);
  });

  it('tem compatibilidade e custo, vindos da planilha MASTER', () => {
    /*
     * O v5 listava as munições sem ligá-las a arma nenhuma, e a regra era
     * deixá-las assim em vez de supor que toda arma aceita munição padrão. A
     * planilha MASTER publica as 326 relações, e a suposição deixou de ser
     * necessária — o dado apareceu.
     */
    expect(getAttachmentWeapons('ammo:standard').length).toBeGreaterThan(50);
    expect(getAttachment('ammo:standard')!.cost).toBe(5);

    for (const munição of catalog.attachments.filter((peça) => peça.slot === 'ammo')) {
      expect(munição.cost, munição.id).not.toBeNull();
    }
  });
});

describe('compatibilidade', () => {
  it('nunca é deduzida da categoria', () => {
    /*
     * Se houvesse herança por categoria, as armas de uma mesma categoria
     * teriam listas idênticas. Duas fuzis de assalto com conjuntos diferentes
     * provam que cada relação foi registrada uma a uma.
     */
    const fuzis = getWeapons().filter((arma) => arma.category === 'assault_rifle');
    expect(fuzis.length).toBeGreaterThan(2);

    const listas = fuzis.map((arma) =>
      getWeaponAttachments(arma.id)
        .map((peça) => peça.id)
        .sort()
        .join(','),
    );
    expect(new Set(listas).size).toBeGreaterThan(1);
  });

  it('aponta sempre para entidades que existem', () => {
    for (const relação of catalog.compatibility) {
      expect(getWeapon(relação.weaponId), relação.weaponId).toBeDefined();
      expect(getAttachment(relação.attachmentId), relação.attachmentId).toBeDefined();
    }
  });

  it('põe cada peça no slot que ela declara', () => {
    for (const relação of catalog.compatibility) {
      expect(getAttachment(relação.attachmentId)!.slot).toBe(relação.slot);
    }
  });

  it('resolveu a contradição de slot da vz61', () => {
    /*
     * A matriz listava cinco empunhaduras da vz61 sob `laser`, e as peças
     * declaravam `underbarrel`. A correção está declarada no importador com a
     * justificativa: as cinco são do grupo GRIPS, a arma já tem cinco lasers de
     * verdade, e sem elas ficaria com zero empunhaduras.
     */
    const empunhaduras = ['canted_stubby', 'cmpct_handstop', 'fold_stubby', 'ribbed_stubby', 'stipp_stubby'];

    const porSlot = getWeaponAttachmentsBySlot('vz61');
    expect((porSlot.get('underbarrel') ?? []).map((p) => p.id).sort()).toEqual(empunhaduras);
    expect((porSlot.get('laser') ?? []).length).toBe(5);

    for (const id of empunhaduras) expect(isCompatible('vz61', id)).toBe(true);
  });

  it('não deixa nenhuma relação pendente de revisão', () => {
    expect(getPending().compatibilityNeedsReview).toBe(0);
  });
});

describe('índices', () => {
  it('dizem o mesmo que a compatibilidade, nos dois sentidos', () => {
    const relações = new Set(
      catalog.compatibility.map((relação) => `${relação.weaponId}|${relação.attachmentId}`),
    );

    for (const [armaId, peças] of Object.entries(catalog.indexes.attachmentsByWeapon)) {
      for (const peçaId of peças) expect(relações.has(`${armaId}|${peçaId}`)).toBe(true);
    }

    for (const [peçaId, armas] of Object.entries(catalog.indexes.weaponsByAttachment)) {
      for (const armaId of armas) expect(relações.has(`${armaId}|${peçaId}`)).toBe(true);
    }

    expect(
      Object.values(catalog.indexes.attachmentsByWeapon).reduce((total, lista) => total + lista.length, 0),
    ).toBe(relações.size);
  });

  it('agrupam por slot sem perder nenhuma peça', () => {
    for (const arma of getWeapons()) {
      const porSlot = [...getWeaponAttachmentsBySlot(arma.id).values()].flat().length;
      expect(porSlot).toBe(getWeaponAttachments(arma.id).length);
    }
  });
});

describe('balística', () => {
  it('traz velocidade de saída para todas as armas', () => {
    for (const arma of getWeapons()) {
      expect(getWeaponBallistics(arma.id)?.muzzleVelocity, arma.id).toBeTypeOf('number');
    }
  });

  it('guarda o arrasto no modelo, não repetido em cada arma', () => {
    const modelo = getBallisticsModel();
    expect(modelo?.gravityMps2).toBe(-9.81);
    expect(modelo?.baseDragPerMeter).toBe(0.0025);
  });

  it('registra a escolha entre os coeficientes em disputa', () => {
    /*
     * Duas fontes publicam 0,0025 — a planilha de TTK e a da comunidade —
     * contra 0,0035 do Analyzer, que é da 1.3.3.0. O catálogo usa 0,0025 e
     * guarda a discordância: a EA confirma o mecanismo e não publica o número,
     * então isto continua sendo escolha entre fontes, não medição.
     */
    const conflito = getBallisticsModel()?.dragConflict;
    expect(conflito?.status).toBe('resolved');
    expect(conflito?.analyzer.base).toBe(0.0035);
    expect(conflito?.communitySpreadsheet.base).toBe(0.0025);
  });
});

describe('curva de dano', () => {
  it('existe para todas as armas, em ordem crescente de distância', () => {
    for (const arma of getWeapons()) {
      const curva = getWeaponDamageModel(arma.id)?.curve ?? [];
      expect(curva.length, arma.id).toBeGreaterThan(0);

      for (let i = 1; i < curva.length; i += 1) {
        expect(curva[i].distance).toBeGreaterThanOrEqual(curva[i - 1].distance);
      }
    }
  });

  it('traz as zonas de acerto junto com a curva', () => {
    // O multiplicador de cabeça vem de tabela por arma, com padrão por família.
    // A M433 está na planilha de TTK, que publica 1,34; a PSR não está, e
    // segue com o multiplicador do Analyzer.
    expect(getWeaponDamageModel('m433')?.zones.head).toBe(1.34);
    expect(getWeaponDamageModel('psr')?.zones.head).toBe(1.75);
    expect(getWeaponDamageModel('psr')?.zones.limb).toBe(0.67);
  });

  // Ler a curva é conta, e conta mora em `src/simulation` — ver simulation.test.ts.
});

describe('confiança nos dados', () => {
  it('preserva a marca de provisório que a fonte declarou', () => {
    /*
     * O Analyzer marca as 62 curvas como provisórias. Se isto virar
     * `verified` sem que a fonte mude, alguém apagou a ressalva.
     */
    expect(getDataQuality().damage.provisional).toBe(62);
    expect(getWeaponDataQuality('m433')).toBe('provisional');
  });

  it('declara capacidade só com cobertura completa', () => {
    const capacidades = getCapabilities();

    expect(capacidades.damageCurves).toBe(true);
    expect(capacidades.velocity).toBe(true);
    expect(capacidades.ttk).toBe(true);

    // 4 das 62 armas não têm tempo de mira, e 15 munições não têm custo.
    expect(capacidades.ads).toBe(false);
    expect(capacidades.costs).toBe(false);
  });

  it('supports() concorda com as capacidades declaradas', () => {
    expect(supports('compatibility')).toBe(true);
    expect(supports('ads')).toBe(false);
  });
});

describe('tradução de ids do dataset antigo', () => {
  it('resolve por normalização', () => {
    expect(toCatalogId('ak-205')).toBe('ak205');
    expect(toCatalogId('m121-a2')).toBe('m121a2');
    expect(toCatalogId('rpk-74m')).toBe('rpk74m');
  });

  it('resolve as renomeações declaradas à mão', () => {
    expect(toCatalogId('18-5ks-k')).toBe('ks18k');
    expect(toCatalogId('kts100-mk8')).toBe('kts100');
    expect(toCatalogId('sor-556-mk2')).toBe('sor556');
  });

  it('devolve nulo para arma que o catálogo não tem, sem chutar a parecida', () => {
    for (const id of absentFromCatalog()) expect(toCatalogId(id), id).toBeNull();
  });
});

describe('efeitos e estatísticas', () => {
  it('vêm no vocabulário da fonte, sem conversão inventada', () => {
    const efeitos = getAttachmentEffects('50mw_violet');
    expect(efeitos).toHaveProperty('movingAdsSpreadTierMod');
  });

  it('trazem cadência e carregador de cada arma', () => {
    const stats = getWeaponStats('m121a2');
    expect(typeof stats.rpm).toBe('number');
    expect(typeof stats.magazineCapacity).toBe('number');
  });

  it('deixam o custo nulo só onde nenhuma fonte o publica', () => {
    /*
     * As duas peças que a Temporada 4 anunciou. A EA publicou nome e slot, não
     * preço — e é por isso que a capacidade `costs` continua falsa: ela exige
     * cobertura completa, e duas peças sem preço bastam para derrubá-la.
     */
    expect(getAttachment('extended_barrel')!.cost).toBeNull();
    expect(getAttachment('1p86_lpvo')!.cost).toBeNull();
    expect(supports('costs')).toBe(false);

    // Todas as demais têm preço.
    const semCusto = catalog.attachments.filter((peça) => peça.cost === null).map((p) => p.id);
    expect(semCusto.sort()).toEqual(['1p86_lpvo', 'extended_barrel']);
  });

  it('mantém o custo que a tela do jogo confirmou, contra o do site', () => {
    /*
     * O BF6 Loadouts está desatualizado em dois custos de ergonomia da M16A4:
     * diz 10 para os dois, e a tela mostra 25 e 5. Sem a trava por fonte, cada
     * importação desfazia a correção feita com print.
     */
    expect(getAttachment('full_auto')!.cost).toBe(25);
    expect(getAttachment('rail_cover')!.cost).toBe(5);
  });
});
