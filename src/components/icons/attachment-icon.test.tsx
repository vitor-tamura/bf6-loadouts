import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AttachmentIcon } from '@/components/icons/attachment-icon';
import type { Attachment } from '@/data/types';

const peca = (originalName: string, slot: Attachment['slot']): Attachment => ({
  id: 'teste',
  name: originalName,
  originalName,
  slot,
  cost: 10,
  description: '',
  mods: {},
  compat: {},
  provenance: 'curated',
});

const svg = (nome: string, slot: Attachment['slot']) =>
  renderToStaticMarkup(<AttachmentIcon attachment={peca(nome, slot)} slot={slot} size={40} />);

describe('ícones das peças da 1.4.2.0', () => {
  it('o híbrido não é o supressor padrão', () => {
    const hibrido = svg('Hybrid Suppressor (L)', 'muzzle');
    const padrao = svg('Standard Suppressor', 'muzzle');
    expect(hibrido).not.toBe(padrao);
    console.log('\nHybrid Suppressor (L):\n' + hibrido);
    console.log('\nStandard Suppressor:\n' + padrao);
  });

  /*
    As letras são comprimento: (L) é a cheia, (K) é a curta. Quem paga mais
    compra ausência de peso — o (K) custa 50 e não tem penalidade nenhuma.
  */
  it('as três variantes se separam pelo comprimento', () => {
    // O tubo é o retângulo que começa em 7.5; o de largura 2 antes dele é o
    // colar, que tem a mesma altura e enganaria a medida.
    const largura = (nome: string) =>
      Number(svg(nome, 'muzzle').match(/x="7\.5" y="9" width="([\d.]+)"/)?.[1]);

    expect(largura('Hybrid Suppressor (L)')).toBeGreaterThan(largura('Hybrid Suppressor (S)'));
    expect(largura('Hybrid Suppressor (S)')).toBeGreaterThan(largura('Hybrid Suppressor (K)'));
  });

  it('a vertical inclinada não é a vertical reta', () => {
    const inclinada = svg('Canted Vertical Grip', 'underbarrel');
    const reta = svg('Classic Vertical', 'underbarrel');
    expect(inclinada).not.toBe(reta);
    expect(inclinada).toContain('rotate(16');
    console.log('\nCanted Vertical Grip:\n' + inclinada);
  });

  it('não muda o desenho de nenhuma peça que já existia', () => {
    expect(svg('Classic Vertical', 'underbarrel')).not.toContain('rotate(');
    expect(svg('Alloy Vertical', 'underbarrel')).not.toContain('rotate(');
    // O supressor de CQB é o tubo curto: 7 de largura contra os 10.5 do padrão.
    expect(svg('CQB Suppressor', 'muzzle')).toContain('width="7"');
    expect(svg('Standard Suppressor', 'muzzle')).toContain('width="10.5"');
  });
});
