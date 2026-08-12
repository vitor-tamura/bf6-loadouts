/**
 * O motor, conferido contra a fonte.
 *
 * Estes testes existem porque a matemática de TTK é fácil de escrever e difícil
 * de escrever certo: um degrau lido ao contrário, um intervalo somado a mais, e
 * o resultado continua parecendo plausível. Os números conferidos aqui vêm do
 * BF6 Weapon Analyzer — a mesma fonte dos dados —, então uma divergência aponta
 * para um erro real, e não para uma diferença de opinião.
 */

import { describe, expect, it } from 'vitest';
import { getBallisticsModel, getWeaponDamageModel, getWeaponStats, getWeapons } from '@/catalog';
import {
  calculateTTK,
  damageAtRange,
  damagePerShot,
  dragModelFor,
  dropRelativeToZero,
  flightTime,
  shotInterval,
  shotsToKill,
  ttkCurve,
} from './index';

const m433 = getWeaponDamageModel('m433');

describe('a regra do degrau', () => {
  /*
   * A curva da M433, pela planilha MASTER: 26,05 até 21 m, 20,67 até 75 m,
   * 17,13 depois. Nas distâncias repetidas vale o degrau que TERMINA ali, e não o
   * que começa. Ler ao contrário desloca o TTK de toda arma exatamente onde a
   * queda acontece, que é onde as pessoas comparam.
   */
  it('mantém o degrau que termina na distância exata da queda', () => {
    expect(damageAtRange(m433, 21)).toBeCloseTo(26.05);
    expect(damageAtRange(m433, 75)).toBeCloseTo(20.67);
  });

  it('passa para o degrau seguinte logo depois', () => {
    expect(damageAtRange(m433, 21.5)).toBeCloseTo(20.67);
    expect(damageAtRange(m433, 75.5)).toBeCloseTo(17.13);
  });

  it('trava nas pontas em vez de extrapolar', () => {
    expect(damageAtRange(m433, 0)).toBeCloseTo(26.05);
    expect(damageAtRange(m433, -10)).toBeCloseTo(26.05);
    expect(damageAtRange(m433, 500)).toBeCloseTo(17.13);
  });

  it('devolve nulo sem curva, nunca zero', () => {
    expect(damageAtRange(undefined, 10)).toBeNull();
    expect(damagePerShot(undefined, 10)).toBeNull();
  });

  it('confere com o exemplo documentado pela fonte', () => {
    // A NVO-228E lê 35,22 em 9 m e 27,48 em 10 m — o exemplo que o
    // levantamento original usa para descrever a regra do degrau.
    const nvo = getWeaponDamageModel('nvo228e');
    expect(damageAtRange(nvo, 9)).toBeCloseTo(35.22, 2);
    expect(damageAtRange(nvo, 10)).toBeCloseTo(27.48, 2);
  });
});

describe('tiros para abater', () => {
  it('arredonda para cima, sem pedir um tiro a mais no valor exato', () => {
    // 26,05 de dano: quatro tiros dão 104,2 — quatro bastam.
    expect(shotsToKill(m433, 0)).toBe(4);
  });

  it('conta o acerto na cabeça com o multiplicador da arma', () => {
    // 26,05 × 1,4 = 36,47 por acerto na cabeça: três matam.
    expect(shotsToKill(m433, 0, { headshots: 3 })).toBe(3);
  });

  it('mistura cabeça e corpo na ordem em que os tiros acertam', () => {
    const misto = shotsToKill(m433, 0, { headshots: 1 });
    expect(misto).toBe(4);
  });

  it('cobra mais tiros em membro do que em peito', () => {
    const peito = shotsToKill(m433, 0, { bodyZone: 'body' })!;
    const membro = shotsToKill(m433, 0, { bodyZone: 'limb' })!;
    expect(membro).toBeGreaterThan(peito);
  });

  it('cobra mais tiros longe do que perto', () => {
    expect(shotsToKill(m433, 100)!).toBeGreaterThan(shotsToKill(m433, 0)!);
  });

  it('responde infinito quando o dano não mata, e nulo quando não há curva', () => {
    expect(shotsToKill(m433, 0, { health: Infinity })).toBe(Infinity);
    expect(shotsToKill(undefined, 0)).toBeNull();
  });
});

describe('tempo de voo', () => {
  const model = dragModelFor('m433');

  it('é zero na boca da arma', () => {
    expect(flightTime(model, 0)).toBe(0);
  });

  it('cresce mais que proporcionalmente com a distância, por causa do arrasto', () => {
    const perto = flightTime(model, 25)!;
    const longe = flightTime(model, 50)!;
    expect(longe).toBeGreaterThan(perto * 2);
  });

  it('bate com a solução fechada do arrasto quadrático', () => {
    // t = expm1(k·d) / (k·v), com k = 0,0025 e v = 670 m/s (planilha de TTK).
    const esperado = Math.expm1(0.0025 * 50) / (0.0025 * 670);
    expect(flightTime(model, 50)).toBeCloseTo(esperado, 9);
  });

  it('usa o coeficiente que o catálogo publica, não um número fixo no código', () => {
    /*
     * O motor já calculou com 0,0035 enquanto o catálogo dizia 0,0025, porque
     * o número morava aqui dentro. Dado e cálculo brigando, e o cálculo
     * ganhando calado.
     */
    expect(dragModelFor('m433')!.dragPerMeter).toBe(getBallisticsModel()!.baseDragPerMeter);
  });

  it('permite comparar as fontes explicitamente', () => {
    const analyzer = flightTime(dragModelFor('m433', { dragSource: 'analyzer' }), 100)!;
    const comunidade = flightTime(dragModelFor('m433', { dragSource: 'community' }), 100)!;

    // 0,0035 contra 0,0025: a diferença é real e mensurável, e é por isso que o
    // conflito de fontes ficou registrado em vez de resolvido no escuro.
    expect(analyzer).toBeGreaterThan(comunidade);
    expect(comunidade / analyzer).toBeLessThan(1);
  });

  it('munição de longo alcance reduz o arrasto', () => {
    const comum = flightTime(dragModelFor('m433'), 100)!;
    const longo = flightTime(dragModelFor('m433', { longRange: true }), 100)!;
    expect(longo).toBeLessThan(comum);
  });
});

describe('queda da bala', () => {
  const model = dragModelFor('m433');

  it('cai mais quanto mais longe', () => {
    const perto = dropRelativeToZero(model, 50)!;
    const longe = dropRelativeToZero(model, 150)!;
    expect(longe).toBeLessThan(perto);
    expect(longe).toBeLessThan(0);
  });

  it('cruza o zero na distância em que foi zerada', () => {
    expect(dropRelativeToZero(model, 100, 100)!).toBeCloseTo(0, 3);
  });

  it('sobe antes e desce depois da distância de zeragem', () => {
    expect(dropRelativeToZero(model, 50, 100)!).toBeGreaterThan(0);
    expect(dropRelativeToZero(model, 200, 100)!).toBeLessThan(0);
  });
});

describe('tempo para abater', () => {
  it('não cobra o intervalo do último tiro', () => {
    const rpm = getWeaponStats('m433').rpm!;
    const intervalo = shotInterval(rpm)!;
    const ttk = calculateTTK('m433', { distance: 0, includeFlightTime: false });

    // Quatro tiros são três intervalos, não quatro.
    expect(ttk.shots).toBe(4);
    expect(ttk.fireMilliseconds).toBeCloseTo(3 * intervalo, 6);
  });

  it('soma o tempo de voo quando pedido', () => {
    const semVoo = calculateTTK('m433', { distance: 50, includeFlightTime: false });
    const comVoo = calculateTTK('m433', { distance: 50 });

    expect(comVoo.milliseconds!).toBeGreaterThan(semVoo.milliseconds!);
    expect(comVoo.flightMilliseconds!).toBeCloseTo(
      comVoo.milliseconds! - semVoo.milliseconds!,
      6,
    );
  });

  it('acerto na cabeça abate mais rápido', () => {
    const corpo = calculateTTK('m433', { distance: 0 });
    const cabeça = calculateTTK('m433', { distance: 0, headshots: 3 });
    expect(cabeça.milliseconds!).toBeLessThan(corpo.milliseconds!);
  });

  it('carrega a confiança do dado até quem for exibir', () => {
    // As 62 curvas são provisórias na fonte; o TTK herda isso.
    expect(calculateTTK('m433', { distance: 0 }).quality).toBe('provisional');
  });

  it('devolve nulo em vez de aproximação quando falta dado', () => {
    const semDados = calculateTTK('arma-que-nao-existe', { distance: 10 });
    expect(semDados.milliseconds).toBeNull();
    expect(semDados.shots).toBeNull();
  });

  it('responde para o arsenal inteiro', () => {
    for (const arma of getWeapons()) {
      const ttk = calculateTTK(arma.id, { distance: 20 });
      expect(ttk.milliseconds, arma.id).toBeTypeOf('number');
      expect(ttk.milliseconds!, arma.id).toBeGreaterThan(0);
    }
  });

  it('monta a curva de TTK em várias distâncias de uma vez', () => {
    const curva = ttkCurve('m433', [0, 25, 50, 100]);
    expect(curva).toHaveLength(4);

    // Mais longe nunca mata mais rápido: menos dano por tiro e mais tempo de voo.
    for (let i = 1; i < curva.length; i += 1) {
      expect(curva[i].milliseconds!).toBeGreaterThanOrEqual(curva[i - 1].milliseconds!);
    }
  });
});
