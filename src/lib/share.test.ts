import { describe, expect, it } from 'vitest';
import { WEAPONS } from '@/data/weapons';
import { attachmentsForWeapon } from '@/data/attachments';
import {
  DEFAULT_IMAGE_FORMAT,
  IMAGE_FORMATS,
  encodeLoadout,
  decodeLoadout,
  loadoutImageFilename,
  loadoutImageUrl,
  loadoutUrl,
  parseImageFormat,
} from './share';
import { EMPTY_LOADOUT, factoryAttachments, type Loadout } from './loadout';
import { WEAPONS_BY_ID } from '@/data/weapons';

/** O que a arma já traz montada — mira, munição e cano de fábrica. */
const serie = (id: string) => factoryAttachments(WEAPONS_BY_ID.get(id)!);

const full: Loadout = {
  playerClass: 'assault',
  weapon: 'ak4d',
  attachments: {
    sight: 'sight-iron-sights',
    muzzle: 'muzzle-compensated-brake',
    barrel: 'barrel-600mm-dmr',
    underbarrel: 'underbarrel-classic-vertical',
    ammo: 'ammo-fmj',
  },
  sidearm: 'm44',
  sidearmAttachments: { ...serie('m44'), sight: 'sight-iron-sights', ammo: 'ammo-fmj' },
  gadget1: 'qlink-6',
  gadget2: 'tarantula-alx',
  throwable: 'm67-frag',
};

describe('ida e volta do link', () => {
  it('reproduz o loadout completo', () => {
    expect(decodeLoadout(encodeLoadout(full))).toEqual(full);
  });

  it('reproduz um loadout só com a arma, já com as peças de série', () => {
    const simple: Loadout = { ...EMPTY_LOADOUT, weapon: 'kv9' };
    expect(decodeLoadout(encodeLoadout(simple))).toEqual({
      ...simple,
      attachments: serie('kv9'),
    });
  });

  it('funciona para toda arma com todos os slots preenchidos', () => {
    for (const weapon of WEAPONS) {
      if (weapon.category === 'melee') continue;
      const attachments: Loadout['attachments'] = {};
      for (const [slot, list] of attachmentsForWeapon(weapon)) {
        attachments[slot as keyof Loadout['attachments']] = list[list.length - 1].id;
      }
      const loadout: Loadout = { ...EMPTY_LOADOUT, weapon: weapon.id, attachments };
      expect(decodeLoadout(encodeLoadout(loadout)), weapon.name).toEqual(loadout);
    }
  });

  it('gera um código curto o bastante para caber num QR code', () => {
    expect(encodeLoadout(full).length).toBeLessThan(300);
  });

  it('produz apenas caracteres seguros para URL', () => {
    expect(encodeLoadout(full)).toMatch(/^[A-Za-z0-9_-]+$/);
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
    const invalid: Loadout = {
      ...EMPTY_LOADOUT,
      weapon: 'kv9',
      attachments: { ergonomics: 'ergonomics-dlc-bolt' },
    };
    const roundTripped = decodeLoadout(encodeLoadout(invalid))!;
    expect(roundTripped.attachments.ergonomics).toBeUndefined();
  });

  it('remove gadget que não pertence à classe escolhida', () => {
    const invalid: Loadout = {
      ...EMPTY_LOADOUT,
      playerClass: 'support',
      weapon: 'm250',
      gadget1: 'xfgm-6d',
    };
    expect(decodeLoadout(encodeLoadout(invalid))!.gadget1).toBeNull();
  });

  it('mantém arremessável em qualquer classe', () => {
    const loadout: Loadout = {
      ...EMPTY_LOADOUT,
      playerClass: 'recon',
      weapon: 'sv-98',
      throwable: 'm67-frag',
    };
    expect(decodeLoadout(encodeLoadout(loadout))!.throwable).toBe('m67-frag');
  });
});

describe('URL de compartilhamento', () => {
  it('monta a URL do loadout sobre a origem informada', () => {
    const url = loadoutUrl(full, 'https://exemplo.com');
    expect(url.startsWith('https://exemplo.com/montar/?l=')).toBe(true);
    const code = new URL(url).searchParams.get('l')!;
    expect(decodeLoadout(code)).toEqual(full);
  });

  it('o cartão em imagem tem endereço próprio, com o mesmo código do link', () => {
    const url = loadoutImageUrl(full, 'https://exemplo.com');
    expect(url.startsWith('https://exemplo.com/api/loadout/imagem/?l=')).toBe(true);

    // O mesmo código dos dois lados: link e imagem nunca mostram builds diferentes.
    const daImagem = new URL(url).searchParams.get('l')!;
    const doLink = new URL(loadoutUrl(full, 'https://exemplo.com')).searchParams.get('l')!;
    expect(daImagem).toBe(doLink);
    expect(decodeLoadout(daImagem)).toEqual(full);
  });
});

describe('formatos do Instagram', () => {
  it('seguem as medidas que o Instagram publica sem cortar', () => {
    expect(IMAGE_FORMATS.feed.largura / IMAGE_FORMATS.feed.altura).toBe(4 / 5);
    expect(IMAGE_FORMATS.story.largura / IMAGE_FORMATS.story.altura).toBe(9 / 16);
    expect(IMAGE_FORMATS.feed.largura).toBe(1080);
    expect(IMAGE_FORMATS.story.largura).toBe(1080);
  });

  it('o story reserva o topo e o pé que a interface do aplicativo cobre', () => {
    expect(IMAGE_FORMATS.story.topo).toBeGreaterThanOrEqual(250);
    expect(IMAGE_FORMATS.story.base).toBeGreaterThanOrEqual(340);
    // A área útil do story cabe o mesmo miolo do feed, a menos de 2% de diferença.
    const util = IMAGE_FORMATS.story.altura - IMAGE_FORMATS.story.topo - IMAGE_FORMATS.story.base;
    expect(util / IMAGE_FORMATS.feed.altura).toBeGreaterThan(0.98);
  });

  it('o feed é o padrão e não muda o endereço que já circulava', () => {
    expect(DEFAULT_IMAGE_FORMAT).toBe('feed');
    expect(loadoutImageUrl(full, 'https://exemplo.com', 'feed')).toBe(
      loadoutImageUrl(full, 'https://exemplo.com'),
    );
    expect(new URL(loadoutImageUrl(full, 'https://exemplo.com')).searchParams.has('formato')).toBe(false);
  });

  it('o story vai no parâmetro de busca, com o mesmo código do link', () => {
    const url = new URL(loadoutImageUrl(full, 'https://exemplo.com', 'story'));
    expect(url.pathname).toBe('/api/loadout/imagem/');
    expect(url.searchParams.get('formato')).toBe('story');
    expect(decodeLoadout(url.searchParams.get('l')!)).toEqual(full);
  });

  it('formato desconhecido ou ausente cai no feed em vez de virar erro', () => {
    expect(parseImageFormat('story')).toBe('story');
    expect(parseImageFormat('feed')).toBe('feed');
    expect(parseImageFormat(null)).toBe('feed');
    expect(parseImageFormat('')).toBe('feed');
    expect(parseImageFormat('reels')).toBe('feed');
    // Nome herdado de objeto não pode passar por formato.
    expect(parseImageFormat('toString')).toBe('feed');
  });

  it('o arquivo leva a arma e o formato no nome, sem espaço nem acento', () => {
    expect(loadoutImageFilename(full, 'story')).toBe('loadout-ak4d-story.png');
    expect(loadoutImageFilename({ ...full, weapon: 'sor-556-mk2' })).toBe('loadout-sor-556-mk2-feed.png');
    expect(loadoutImageFilename({ ...EMPTY_LOADOUT })).toBe('loadout-bf6-feed.png');
  });
});

describe('acessórios da secundária', () => {
  it('viajam no link junto com os da principal', () => {
    const restored = decodeLoadout(encodeLoadout(full));
    expect(restored?.sidearmAttachments).toEqual({
      ...serie('m44'),
      ...full.sidearmAttachments,
    });
  });

  it('são descartados quando a secundária não os aceita', () => {
    const wrong = { ...full, sidearm: 'kbr-mark-ii', sidearmAttachments: { sight: 'sight-iron-sights' } };
    expect(decodeLoadout(encodeLoadout(wrong))?.sidearmAttachments).toEqual({});
  });

  it('link antigo, sem o campo, abre com a secundária limpa', () => {
    // O campo é o último do formato, então versões anteriores continuam válidas.
    const withoutField = encodeLoadout({ ...full, sidearmAttachments: {} });
    expect(decodeLoadout(withoutField)?.sidearmAttachments).toEqual(serie('m44'));
  });
});
