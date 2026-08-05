import { describe, expect, it } from 'vitest';
import { WEAPONS } from '@/data/weapons';
import { attachmentsForWeapon } from '@/data/attachments';
import { encodeLoadout, decodeLoadout, loadoutUrl } from './share';
import { EMPTY_LOADOUT, type Loadout } from './loadout';

const completo: Loadout = {
  playerClass: 'assalto',
  weapon: 'ak4d',
  attachments: {
    mira: 'mira-iron-sights',
    boca: 'boca-compensated-brake',
    cano: 'cano-600mm-dmr',
    acoplamento: 'acoplamento-classic-vertical',
    municao: 'municao-fmj',
  },
  sidearm: 'm44',
  gadget1: 'qlink-6',
  gadget2: 'tarantula-alx',
  throwable: 'm67-frag',
};

describe('ida e volta do link', () => {
  it('reproduz o loadout completo', () => {
    expect(decodeLoadout(encodeLoadout(completo))).toEqual(completo);
  });

  it('reproduz um loadout só com a arma', () => {
    const simples: Loadout = { ...EMPTY_LOADOUT, weapon: 'kv9' };
    expect(decodeLoadout(encodeLoadout(simples))).toEqual(simples);
  });

  it('funciona para toda arma com todos os slots preenchidos', () => {
    for (const weapon of WEAPONS) {
      if (weapon.category === 'corpo-a-corpo') continue;
      const attachments: Loadout['attachments'] = {};
      for (const [slot, list] of attachmentsForWeapon(weapon)) {
        attachments[slot as keyof Loadout['attachments']] = list[list.length - 1].id;
      }
      const loadout: Loadout = { ...EMPTY_LOADOUT, weapon: weapon.id, attachments };
      expect(decodeLoadout(encodeLoadout(loadout)), weapon.name).toEqual(loadout);
    }
  });

  it('gera um código curto o bastante para caber num QR code', () => {
    expect(encodeLoadout(completo).length).toBeLessThan(300);
  });

  it('produz apenas caracteres seguros para URL', () => {
    expect(encodeLoadout(completo)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('leitura tolerante', () => {
  it('devolve nulo para código inválido em vez de estourar', () => {
    expect(decodeLoadout('')).toBeNull();
    expect(decodeLoadout('!!!')).toBeNull();
    expect(decodeLoadout('YWJjZGVm')).toBeNull(); // texto sem versão
  });

  it('descarta arma que não existe mais', () => {
    const code = encodeLoadout({ ...EMPTY_LOADOUT, weapon: 'ak4d' }).replace(/.$/, 'X');
    const result = decodeLoadout(code);
    // Ou o código quebra por completo, ou volta sem a arma — nunca com lixo.
    if (result) expect(result.weapon === null || result.weapon === 'ak4d').toBe(true);
  });

  it('remove acessório incompatível com a arma', () => {
    // Ferrolho Leve só existe para rifles de ferrolho.
    const invalido: Loadout = {
      ...EMPTY_LOADOUT,
      weapon: 'kv9',
      attachments: { ergonomia: 'ergonomia-dlc-bolt' },
    };
    const voltou = decodeLoadout(encodeLoadout(invalido))!;
    expect(voltou.attachments.ergonomia).toBeUndefined();
  });

  it('remove gadget que não pertence à classe escolhida', () => {
    const invalido: Loadout = {
      ...EMPTY_LOADOUT,
      playerClass: 'suporte',
      weapon: 'm250',
      gadget1: 'xfgm-6d',
    };
    expect(decodeLoadout(encodeLoadout(invalido))!.gadget1).toBeNull();
  });

  it('mantém arremessável em qualquer classe', () => {
    const loadout: Loadout = {
      ...EMPTY_LOADOUT,
      playerClass: 'reconhecimento',
      weapon: 'sv-98',
      throwable: 'm67-frag',
    };
    expect(decodeLoadout(encodeLoadout(loadout))!.throwable).toBe('m67-frag');
  });
});

describe('URL de compartilhamento', () => {
  it('monta a URL do loadout sobre a origem informada', () => {
    const url = loadoutUrl(completo, 'https://exemplo.com');
    expect(url.startsWith('https://exemplo.com/?l=')).toBe(true);
    const code = new URL(url).searchParams.get('l')!;
    expect(decodeLoadout(code)).toEqual(completo);
  });
});
