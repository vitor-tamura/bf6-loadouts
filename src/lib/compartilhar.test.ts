import { describe, expect, it } from 'vitest';
import { ARMAS } from '@/dados/armas';
import { acessoriosDaArma } from '@/dados/acessorios';
import { codificarLoadout, decodificarLoadout, urlDoLoadout } from './compartilhar';
import { LOADOUT_VAZIO, type Loadout } from './loadout';

const completo: Loadout = {
  classe: 'assalto',
  arma: 'ak4d',
  acessorios: {
    mira: 'mira-osa7-100',
    boca: 'boca-freio-compensado',
    cano: 'cano-estendido-8',
    acoplamento: 'acopl-vertical-classica',
    municao: 'mun-encamisada',
  },
  secundaria: 'm44',
  gadget1: 'farol-reaparecimento',
  gadget2: 'escada-assalto',
  granada: 'granada-fragmentacao',
};

describe('ida e volta do link', () => {
  it('reproduz o loadout completo', () => {
    expect(decodificarLoadout(codificarLoadout(completo))).toEqual(completo);
  });

  it('reproduz um loadout só com a arma', () => {
    const simples: Loadout = { ...LOADOUT_VAZIO, arma: 'kv9' };
    expect(decodificarLoadout(codificarLoadout(simples))).toEqual(simples);
  });

  it('funciona para toda arma com todos os slots preenchidos', () => {
    for (const arma of ARMAS) {
      if (arma.categoria === 'corpo-a-corpo') continue;
      const acessorios: Loadout['acessorios'] = {};
      for (const [slot, lista] of acessoriosDaArma(arma)) {
        acessorios[slot as keyof Loadout['acessorios']] = lista[lista.length - 1].id;
      }
      const loadout: Loadout = { ...LOADOUT_VAZIO, arma: arma.id, acessorios };
      expect(decodificarLoadout(codificarLoadout(loadout)), arma.nome).toEqual(loadout);
    }
  });

  it('gera um código curto o bastante para caber num QR code', () => {
    expect(codificarLoadout(completo).length).toBeLessThan(300);
  });

  it('produz apenas caracteres seguros para URL', () => {
    expect(codificarLoadout(completo)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('leitura tolerante', () => {
  it('devolve nulo para código inválido em vez de estourar', () => {
    expect(decodificarLoadout('')).toBeNull();
    expect(decodificarLoadout('!!!')).toBeNull();
    expect(decodificarLoadout('YWJjZGVm')).toBeNull(); // texto sem versão
  });

  it('descarta arma que não existe mais', () => {
    const codigo = codificarLoadout({ ...LOADOUT_VAZIO, arma: 'ak4d' }).replace(/.$/, 'X');
    const resultado = decodificarLoadout(codigo);
    // Ou o código quebra por completo, ou volta sem a arma — nunca com lixo.
    if (resultado) expect(resultado.arma === null || resultado.arma === 'ak4d').toBe(true);
  });

  it('remove acessório incompatível com a arma', () => {
    // Ferrolho Leve só existe para rifles de ferrolho.
    const invalido: Loadout = {
      ...LOADOUT_VAZIO,
      arma: 'kv9',
      acessorios: { ergonomia: 'ergo-ferrolho-leve' },
    };
    const voltou = decodificarLoadout(codificarLoadout(invalido))!;
    expect(voltou.acessorios.ergonomia).toBeUndefined();
  });

  it('remove gadget que não pertence à classe escolhida', () => {
    const invalido: Loadout = {
      ...LOADOUT_VAZIO,
      classe: 'suporte',
      arma: 'm250',
      gadget1: 'drone-reconhecimento',
    };
    expect(decodificarLoadout(codificarLoadout(invalido))!.gadget1).toBeNull();
  });

  it('mantém arremessável em qualquer classe', () => {
    const loadout: Loadout = {
      ...LOADOUT_VAZIO,
      classe: 'reconhecimento',
      arma: 'sv-98',
      granada: 'granada-fumaca',
    };
    expect(decodificarLoadout(codificarLoadout(loadout))!.granada).toBe('granada-fumaca');
  });
});

describe('URL de compartilhamento', () => {
  it('monta a URL do loadout sobre a origem informada', () => {
    const url = urlDoLoadout(completo, 'https://exemplo.com');
    expect(url.startsWith('https://exemplo.com/?l=')).toBe(true);
    const codigo = new URL(url).searchParams.get('l')!;
    expect(decodificarLoadout(codigo)).toEqual(completo);
  });
});
