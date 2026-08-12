/**
 * O acesso cru ao artefato.
 *
 * Uma camada só abre o JSON, e é esta. Tudo o mais — seletores, adapters,
 * telas — passa por aqui, de modo que trocar a origem do catálogo (arquivo
 * importado hoje, requisição amanhã, dois arquivos depois de amanhã) mexe num
 * arquivo e não em vinte.
 *
 * O artefato é importado como módulo, não buscado por rede: o site gera as
 * páginas no build, e uma busca em tempo de execução transformaria página
 * pronta em página que pisca. O mesmo arquivo continua servido em
 * `/data/catalog.current.json` para consumo externo.
 */

import catalog from '../../public/data/catalog.current.json' with { type: 'json' };
import type {
  AttachmentEntity,
  CatalogCapabilities,
  CurrentCatalog,
  DataQuality,
  WeaponEntity,
} from './catalog.types';

export type CatalogWeapon = WeaponEntity & { stats: Record<string, number | null> };
export type CatalogAttachment = AttachmentEntity & {
  cost: number | null;
  effects: Record<string, unknown>;
};

const current = catalog as unknown as CurrentCatalog;

/*
 * Os mapas são montados uma vez, na primeira importação do módulo.
 *
 * São 62 armas e 400 peças: procurar por varredura a cada chamada seria barato
 * o bastante para não doer e caro o bastante para aparecer numa tela que
 * recalcula a cada tecla digitada no campo de busca.
 */
const weaponsById = new Map(current.weapons.map((weapon) => [weapon.id, weapon]));
const attachmentsById = new Map(current.attachments.map((attachment) => [attachment.id, attachment]));

export const getCurrentCatalog = (): CurrentCatalog => current;
export const getVersion = (): string => current.gameVersion;

export const getWeapons = (): CatalogWeapon[] => current.weapons;
export const getWeapon = (id: string): CatalogWeapon | undefined => weaponsById.get(id);

export const getAttachments = (): CatalogAttachment[] => current.attachments;
export const getAttachment = (id: string): CatalogAttachment | undefined => attachmentsById.get(id);

export const getCategories = () => current.categories;
export const getSlots = () => current.slots;

/**
 * O que o catálogo sustenta hoje.
 *
 * É a bandeira que decide se um domínio do site pode migrar. Ela é calculada
 * pelo build sobre os dados reais — capacidade verdadeira significa cobertura
 * completa, não "a maioria das armas tem".
 */
export const getCapabilities = (): CatalogCapabilities => current.capabilities;

export const supports = (capability: keyof CatalogCapabilities): boolean =>
  current.capabilities[capability] === true;

/** O que ficou pendente de revisão humana, contado por tipo. */
export const getPending = (): Record<string, number> => current.pending;

/** Quantas armas há em cada nível de confiança, por domínio de dado. */
export const getDataQuality = (): Record<string, Record<DataQuality, number>> => current.dataQuality;
