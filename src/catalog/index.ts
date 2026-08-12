/**
 * A camada única de acesso ao catálogo.
 *
 * Todo o site entra por aqui. Nenhuma tela abre `data/`, nenhuma tela importa o
 * JSON e nenhuma tela conhece versão, patch note, conflito ou procedência — o
 * que existe para quem desenha interface é a pergunta que ela precisa
 * responder.
 *
 * A razão de haver uma fachada, e não um import por tela, é que o catálogo vai
 * mudar de forma outra vez. Quando mudar, o que se reescreve é esta pasta.
 *
 * ```
 * catalog.service.ts     abre o artefato, entrega os dados como estão
 * catalog.selectors.ts   transforma dado em resposta de tela
 * adapters/              traduz entre o catálogo e o dataset antigo
 * catalog.types.ts       o contrato, compartilhado com o pipeline
 * ```
 *
 * ## Durante a migração
 *
 * As telas continuam lendo `src/data/*.ts`. A adoção é por domínio, e cada
 * domínio só migra quando `capabilities` disser que o catálogo cobre tudo o que
 * ele precisa — ver `docs/frontend-migration.md`. `supports()` é a pergunta que
 * autoriza a troca; use-a explicitamente, nunca um fallback escondido.
 */

export type {
  AttachmentEntity,
  AttachmentEffects,
  BallisticsModel,
  CatalogCapabilities,
  CatalogIndexes,
  CategoryEntity,
  ChangeEvent,
  CompatibilityRow,
  CurrentCatalog,
  DataQuality,
  GameVersion,
  SlotEntity,
  SourceRef,
  WeaponBallistics,
  WeaponDamageModel,
  WeaponEntity,
  WeaponRecoil,
  WeaponReload,
  WeaponSpread,
  WeaponStats,
} from './catalog.types';

export {
  getAttachment,
  getAttachments,
  getCapabilities,
  getCategories,
  getCurrentCatalog,
  getDataQuality,
  getPending,
  getSlots,
  getVersion,
  getWeapon,
  getWeapons,
  supports,
  type CatalogAttachment,
  type CatalogWeapon,
} from './catalog.service';

export {

  getAttachmentCost,
  getAttachmentEffects,
  getAttachmentWeapons,
  getBallisticsModel,
  getWeaponAttachments,
  getWeaponAttachmentsBySlot,
  getWeaponBallistics,
  getWeaponDamageModel,
  getWeaponDataQuality,
  getWeaponRecoil,
  getWeaponReload,
  getWeaponSpread,
  getWeaponStats,
  isCompatible,
} from './catalog.selectors';

export { absentFromCatalog, toCatalogId, toLegacyId } from './adapters/legacy-ids';
