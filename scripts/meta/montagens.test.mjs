import { describe, expect, it } from 'vitest';
import { ehModoDoMultiplayer, enderecoPresumido, linksDeMontagem, recortarMontagens } from './montagens.mjs';

describe('linksDeMontagem', () => {
  it('casa o slug da página com a arma do arsenal', () => {
    const html = `
      <a href="/battlefield-6/best-loadouts/m16a4">Get all the best M16A4 builds</a>
      <a href="https://wzstats.gg/battlefield-6/best-loadouts/kord-6p67">KORD</a>
      <a href="/battlefield-6/best-loadouts/m16a4">de novo</a>
      <a href="/battlefield-6/best-loadouts/kar98k">arma de outro jogo</a>`;
    const links = linksDeMontagem(html);
    expect(links.get('m16a4')).toBe('https://wzstats.gg/battlefield-6/best-loadouts/m16a4');
    expect(links.get('kord-6p67')).toBe('https://wzstats.gg/battlefield-6/best-loadouts/kord-6p67');
    expect(links.size).toBe(2);
  });

  it('presume o endereço pelo id quando a página de meta não listou a arma', () => {
    expect(enderecoPresumido({ id: 'pp-19' })).toBe('https://wzstats.gg/battlefield-6/best-loadouts/pp-19');
  });
});

describe('recortarMontagens', () => {
  const pagina = [
    'Menu Warzone Battlefield 6 Language',
    'Best M16A4 Loadout for Battlefield 6 Battle Royale in Season 1 Barrel 20" HBAR Scope BAKER 3.00X',
    'Best M16A4 Loadout for Battlefield 6 Ranked in Season 1 Barrel 20" HBAR Ammunition POLYMER CASE',
    'Best M16A4 Loadout for Battlefield 6 Big Maps in Season 1 Barrel 20" HBAR Scope RO-M 1.75X',
    'Best M16A4 Loadout for Battlefield 6 Small Maps in Season 1 Underbarrel SLIM HANDSTOP Scope MINI FLEX 1.00X',
  ].join(' ');

  it('fica só com as montagens do multiplayer', () => {
    const montagens = recortarMontagens(pagina);
    expect(montagens.map((m) => m.modo)).toEqual(['Big Maps', 'Small Maps']);
    expect(montagens[0].texto).toContain('RO-M 1.75X');
    expect(montagens[0].texto).not.toContain('Small Maps');
    expect(montagens.map((m) => m.texto).join(' ')).not.toMatch(/POLYMER CASE|BAKER/);
  });

  it('sem cabeçalho não há como saber o modo, e nada sai', () => {
    expect(recortarMontagens('M16A4 Barrel 20" HBAR Scope BAKER 3.00X')).toEqual([]);
  });

  it('battle royale e ranqueado são REDSEC', () => {
    expect(ehModoDoMultiplayer('Battle Royale')).toBe(false);
    expect(ehModoDoMultiplayer('Ranked')).toBe(false);
    expect(ehModoDoMultiplayer('Big Maps')).toBe(true);
  });
});
