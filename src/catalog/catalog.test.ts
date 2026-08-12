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
    expect(catalog.attachments).toHaveLength(400);
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

  it('está nas quatro armas confirmadas, e só nelas', () => {
    const armas = getAttachmentWeapons('50mw_violet').map((arma) => arma.id);
    expect(armas.sort()).toEqual(confirmadas);
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

  it('reproduz a lista de ergonomia da M16A4 como ela aparece na tela', () => {
    // A print mostra a lista fechada, com custo: é a única compatibilidade de
    // ergonomia que alguma fonte confirma até agora.
    const ergonomia = getWeaponAttachmentsBySlot('m16a4').get('ergonomics') ?? [];

    expect(ergonomia.map((peça) => `${peça.name} ${peça.cost}`)).toEqual([
      'Amortecedor 5',
      'Cobertura de Trilho 5',
      'Pente Expandido 10',
      'Gatilho 15',
      'Auto 25',
    ]);
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

  it('continua sem arma nenhuma enquanto nenhuma fonte a confirmar', () => {
    /*
     * O v5 lista as munições e não as liga a arma alguma. A tentação é dizer
     * "toda arma aceita munição padrão" — e é justamente o que não se faz aqui.
     * Quando uma fonte confirmar, este teste muda junto com o dado.
     */
    for (const munição of catalog.attachments.filter((peça) => peça.slot === 'ammo')) {
      expect(getAttachmentWeapons(munição.id)).toHaveLength(0);
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

  it('deixa fora do artefato o que aguarda revisão', () => {
    // As cinco empunhaduras da vz61, que a fonte registrou em dois slots.
    expect(getPending().compatibilityNeedsReview).toBe(5);

    const empunhaduras = ['canted_stubby', 'cmpct_handstop', 'fold_stubby', 'ribbed_stubby', 'stipp_stubby'];
    for (const id of empunhaduras) expect(isCompatible('vz61', id)).toBe(false);
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
    expect(modelo?.baseDragPerMeter).toBe(0.0035);
  });

  it('mantém o conflito de coeficiente à vista de quem for calcular', () => {
    /*
     * O Analyzer usa 0,0035 e a planilha da comunidade usa 0,0025. A EA
     * confirma que existe arrasto e não publica o número. O catálogo usa o do
     * dataset importado e guarda a discordância — escolher em silêncio faria a
     * queda de bala parecer exata.
     */
    const conflito = getBallisticsModel()?.dragConflict;
    expect(conflito?.status).toBe('open');
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
    expect(getWeaponDamageModel('m433')?.zones.head).toBe(1.4);
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

  it('deixam o custo nulo quando a fonte não o publica', () => {
    // As quinze munições: existem, sem preço em Attachment Points registrado.
    expect(getPending().attachmentsWithoutCost).toBe(15);
    expect(getAttachment('ammo:standard')!.cost).toBeNull();
  });
});
