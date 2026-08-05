import { describe, expect, it } from 'vitest';
import { ACESSORIOS, ACESSORIOS_POR_ID, acessoriosDaArma, ehCompativel } from '@/dados/acessorios';
import { ARMAS, ARMAS_POR_ID } from '@/dados/armas';
import { ORCAMENTO_PONTOS } from '@/dados/classes';
import {
  cabeNoOrcamento,
  calcularOrcamento,
  calcularStats,
  compararStat,
  resolverAcessorios,
  statsBase,
} from './stats';

const ak4d = ARMAS_POR_ID.get('ak4d')!;

describe('integridade do dataset', () => {
  it('não tem ids de arma repetidos', () => {
    expect(new Set(ARMAS.map((a) => a.id)).size).toBe(ARMAS.length);
  });

  it('não tem ids de acessório repetidos', () => {
    expect(new Set(ACESSORIOS.map((a) => a.id)).size).toBe(ACESSORIOS.length);
  });

  it('mantém os degraus de dano em distância crescente', () => {
    for (const arma of ARMAS) {
      const distancias = arma.dano.map((d) => d.distancia);
      expect(distancias, arma.nome).toEqual([...distancias].sort((a, b) => a - b));
      expect(arma.dano[0].distancia, arma.nome).toBe(0);
    }
  });

  it('deixa toda arma de fogo com pelo menos uma opção em cada slot', () => {
    for (const arma of ARMAS) {
      if (arma.categoria === 'corpo-a-corpo') continue;
      const porSlot = acessoriosDaArma(arma);
      for (const slot of arma.slots) {
        expect(porSlot.get(slot)?.length ?? 0, `${arma.nome} · ${slot}`).toBeGreaterThan(0);
      }
    }
  });

  it('permite montar a arma inteira sem estourar os 100 pontos usando as peças baratas', () => {
    for (const arma of ARMAS) {
      if (arma.categoria === 'corpo-a-corpo') continue;
      const maisBaratos = [...acessoriosDaArma(arma).values()].map((lista) =>
        lista.reduce((menor, a) => (a.custo < menor.custo ? a : menor)),
      );
      const total = maisBaratos.reduce((soma, a) => soma + a.custo, 0);
      expect(total, arma.nome).toBeLessThanOrEqual(ORCAMENTO_PONTOS);
    }
  });

  it('só aceita acessório em slot que a arma possui', () => {
    for (const acessorio of ACESSORIOS) {
      for (const arma of ARMAS) {
        if (ehCompativel(acessorio, arma)) {
          expect(arma.slots, `${arma.nome} · ${acessorio.nome}`).toContain(acessorio.slot);
        }
      }
    }
  });
});

describe('cálculo de estatísticas', () => {
  it('sem acessórios devolve os valores de fábrica', () => {
    const stats = statsBase(ak4d);
    expect(stats.rpm).toBe(ak4d.rpm);
    expect(stats.velocidade).toBe(ak4d.velocidade);
    expect(stats.carregador).toBe(ak4d.carregador);
  });

  it('aplica multiplicadores de velocidade e alcance do cano', () => {
    const cano = ACESSORIOS_POR_ID.get('cano-estendido-8')!;
    const stats = calcularStats(ak4d, [cano]);
    expect(stats.velocidade).toBeCloseTo(ak4d.velocidade * 1.14, 5);
    // O primeiro degrau nasce no cano e não se move.
    expect(stats.dano[0].distancia).toBe(0);
    expect(stats.dano[1].distancia).toBeCloseTo(ak4d.dano[1].distancia * 1.12, 5);
  });

  it('não muda o resultado conforme a ordem dos acessórios', () => {
    const a = ACESSORIOS_POR_ID.get('cano-estendido-8')!;
    const b = ACESSORIOS_POR_ID.get('boca-supressor-padrao')!;
    const c = ACESSORIOS_POR_ID.get('ergo-coronha-pesada')!;
    const um = calcularStats(ak4d, [a, b, c]);
    const outro = calcularStats(ak4d, [c, a, b]);
    expect(um).toEqual(outro);
  });

  it('soma antes de multiplicar', () => {
    // Empunhadura Vertical: controle +7 e recuo vertical ×0,84.
    const grip = ACESSORIOS_POR_ID.get('acopl-vertical-classica')!;
    const stats = calcularStats(ak4d, [grip]);
    expect(stats.controle).toBe(ak4d.controle + 7);
    expect(stats.recuoV).toBeCloseTo(ak4d.recuoV * 0.84, 5);
  });

  it('mantém as barras de 0 a 100', () => {
    const empilhados = resolverAcessorios([
      'mira-nx8-800',
      'cano-pesado-264',
      'carreg-tambor',
      'ergo-coronha-pesada',
      'acopl-bipe',
    ]);
    const stats = calcularStats(ARMAS_POR_ID.get('m2010-esr')!, empilhados);
    for (const valor of [stats.precisao, stats.controle, stats.mobilidade, stats.hipfire]) {
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThanOrEqual(100);
    }
  });

  it('arredonda o carregador para um número inteiro de balas', () => {
    const estendido = ACESSORIOS_POR_ID.get('carreg-estendido')!;
    const stats = calcularStats(ARMAS_POR_ID.get('ak-205')!, [estendido]);
    expect(Number.isInteger(stats.carregador)).toBe(true);
    expect(stats.carregador).toBe(45);
  });

  it('acompanha a recarga vazia proporcionalmente à recarga tática', () => {
    const rapido = ACESSORIOS_POR_ID.get('carreg-rapido')!;
    const stats = calcularStats(ak4d, [rapido]);
    expect(stats.recarga / ak4d.recarga).toBeCloseTo(stats.recargaVazia / ak4d.recargaVazia, 5);
  });

  it('descarta id de acessório desconhecido em vez de quebrar', () => {
    expect(resolverAcessorios(['nao-existe', null, undefined, 'cano-curto-128'])).toHaveLength(1);
  });
});

describe('orçamento de 100 pontos', () => {
  it('soma o custo dos acessórios escolhidos', () => {
    const lista = resolverAcessorios(['mira-osa7-100', 'boca-freio-compensado']);
    const orcamento = calcularOrcamento(lista);
    expect(orcamento.gasto).toBe(8 + 12);
    expect(orcamento.restante).toBe(ORCAMENTO_PONTOS - 20);
    expect(orcamento.estourado).toBe(false);
  });

  it('desconta a peça que será substituída no mesmo slot', () => {
    const atuais = resolverAcessorios(['mira-nx8-800']); // 26 pontos
    const caros = resolverAcessorios([
      'cano-prototipo-264', // 18
      'carreg-tambor', // 18
      'ergo-coronha-pesada', // 11
      'acopl-bipe', // 12
      'mun-perfurante', // 15
    ]);
    const ocupado = [...atuais, ...caros]; // 100 pontos exatos
    expect(calcularOrcamento(ocupado).gasto).toBe(100);

    // Trocar a mira de 26 por outra de 22 cabe; subir para uma mais cara, não.
    const maisBarata = ACESSORIOS_POR_ID.get('mira-vdd-600')!;
    expect(cabeNoOrcamento(maisBarata, ocupado)).toBe(true);

    const novoSlot = ACESSORIOS_POR_ID.get('opt-ampliador-200')!;
    expect(cabeNoOrcamento(novoSlot, ocupado)).toBe(false);
  });
});

describe('comparação com a arma de fábrica', () => {
  it('marca como melhora quando o tempo de mira cai', () => {
    const delta = compararStat('adsMs', 350, 315);
    expect(delta.melhora).toBe(true);
    expect(delta.mudou).toBe(true);
    expect(delta.percentual).toBeCloseTo(-10, 5);
  });

  it('marca como piora quando a mobilidade cai', () => {
    expect(compararStat('mobilidade', 52, 46).melhora).toBe(false);
  });

  it('não sinaliza mudança quando nada mudou', () => {
    expect(compararStat('rpm', 514, 514).mudou).toBe(false);
  });
});
