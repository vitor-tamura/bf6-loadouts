import { ARMAS_POR_ID } from '@/dados/armas';
import { CLASSES } from '@/dados/classes';
import type { IdClasse, IdSlot } from '@/dados/tipos';
import { LOADOUT_VAZIO, limparIncompativeis, type Loadout } from './loadout';

/**
 * O loadout inteiro viaja dentro da URL — não há servidor nem banco, então o
 * link nunca expira e continua funcionando com a aplicação hospedada em
 * qualquer lugar.
 *
 * Formato antes de codificar (versão 1):
 *
 *   1~<arma>~<slot:acessorio,slot:acessorio>~<classe>~<secundária>~<g1|g2>~<granada>
 *
 * O prefixo de versão permite mudar o formato depois sem quebrar links antigos.
 * A leitura é tolerante: qualquer id desconhecido é descartado em vez de
 * derrubar a página, o que importa quando o dataset é atualizado a cada
 * temporada.
 */

const VERSAO = '1';
const SEP_CAMPO = '~';
const SEP_LISTA = ',';
const SEP_PAR = ':';
const SEP_GADGET = '|';

/** Abreviações de slot, para encurtar o link. */
const SIGLA_SLOT: Record<IdSlot, string> = {
  mira: 'mi',
  boca: 'bo',
  cano: 'ca',
  acoplamento: 'ac',
  carregador: 'cr',
  municao: 'mu',
  ergonomia: 'er',
  opticoExtra: 'op',
  lateralEsquerda: 'le',
  lateralDireita: 'ld',
};

const SLOT_DA_SIGLA = new Map<string, IdSlot>(
  (Object.entries(SIGLA_SLOT) as [IdSlot, string][]).map(([slot, sigla]) => [sigla, slot]),
);

const IDS_CLASSE = new Set<string>(CLASSES.map((c) => c.id));

function paraBase64Url(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  const base64 =
    typeof btoa === 'function'
      ? btoa(binario)
      : Buffer.from(binario, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(codigo: string): string {
  const base64 = codigo.replace(/-/g, '+').replace(/_/g, '/');
  const preenchido = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binario =
    typeof atob === 'function'
      ? atob(preenchido)
      : Buffer.from(preenchido, 'base64').toString('binary');
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function codificarLoadout(loadout: Loadout): string {
  const arma = ARMAS_POR_ID.get(loadout.arma ?? '');
  const ordemSlots = arma?.slots ?? [];

  const acessorios = ordemSlots
    .map((slot) => {
      const id = loadout.acessorios[slot];
      return id ? `${SIGLA_SLOT[slot]}${SEP_PAR}${id}` : null;
    })
    .filter(Boolean)
    .join(SEP_LISTA);

  const gadgets = [loadout.gadget1 ?? '', loadout.gadget2 ?? ''].join(SEP_GADGET);

  const campos = [
    VERSAO,
    loadout.arma ?? '',
    acessorios,
    loadout.classe,
    loadout.secundaria ?? '',
    gadgets === SEP_GADGET ? '' : gadgets,
    loadout.granada ?? '',
  ];

  // Campos vazios no fim não precisam viajar.
  while (campos.length > 2 && campos[campos.length - 1] === '') campos.pop();

  return paraBase64Url(campos.join(SEP_CAMPO));
}

export function decodificarLoadout(codigo: string): Loadout | null {
  if (!codigo) return null;

  let texto: string;
  try {
    texto = deBase64Url(codigo);
  } catch {
    return null;
  }

  const campos = texto.split(SEP_CAMPO);
  if (campos[0] !== VERSAO) return null;

  const [, armaId = '', acessoriosTexto = '', classeTexto = '', secundaria = '', gadgetsTexto = '', granada = ''] =
    campos;

  const acessorios: Partial<Record<IdSlot, string>> = {};
  for (const par of acessoriosTexto.split(SEP_LISTA)) {
    if (!par) continue;
    const corte = par.indexOf(SEP_PAR);
    if (corte < 0) continue;
    const slot = SLOT_DA_SIGLA.get(par.slice(0, corte));
    const id = par.slice(corte + 1);
    if (slot && id) acessorios[slot] = id;
  }

  const [gadget1 = '', gadget2 = ''] = gadgetsTexto.split(SEP_GADGET);

  const bruto: Loadout = {
    ...LOADOUT_VAZIO,
    classe: IDS_CLASSE.has(classeTexto) ? (classeTexto as IdClasse) : LOADOUT_VAZIO.classe,
    arma: ARMAS_POR_ID.has(armaId) ? armaId : null,
    acessorios,
    secundaria: ARMAS_POR_ID.has(secundaria) ? secundaria : null,
    gadget1: gadget1 || null,
    gadget2: gadget2 || null,
    granada: granada || null,
  };

  return limparIncompativeis(bruto);
}

/**
 * URL completa do loadout, pronta para copiar.
 *
 * O código vai como parâmetro de busca em vez de segmento de caminho porque a
 * aplicação é exportada estaticamente: uma rota `/l/[codigo]` exigiria conhecer
 * todos os loadouts possíveis no momento do build.
 */
export const PARAM_LOADOUT = 'l';

export function urlDoLoadout(loadout: Loadout, origem?: string): string {
  const base = origem ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/?${PARAM_LOADOUT}=${codificarLoadout(loadout)}`;
}
