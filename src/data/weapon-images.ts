/**
 * Fotos das armas no jogo, servidas de fontes externas.
 *
 * As URLs vêm do protótipo `bf6-arsenal.html`: capturas do Battlefield 6
 * publicadas no IMFDB e, como reserva, os renders do battlefieldmeta.gg. Nada é
 * copiado para o projeto — as imagens são carregadas direto da origem.
 *
 * Duas consequências que valem registrar:
 *
 * 1. São imagens de terceiros e material da EA/DICE. Servir a partir da origem
 *    depende de o site permitir, e pode parar de funcionar sem aviso.
 * 2. A foto mostra a arma inteira, montada. Não dá para encaixar peças sobre
 *    ela — quem responde à montagem é o esquema vetorial. Por isso o preview
 *    tem os dois modos.
 *
 * Se uma imagem própria existir em `public/armas/<id>.png`, ela tem prioridade
 * sobre tudo isto.
 */

export interface WeaponImageSources {
  /** Captura do jogo. */
  photo?: string;
  /** Render de catálogo, usado quando não há captura. */
  render?: string;
}

export const WEAPON_IMAGES: Record<string, WeaponImageSources> = {
  ak4d: { photo: 'https://www.imfdb.org/images/thumb/4/4e/BF6_AK4D_PTR.jpg/600px-BF6_AK4D_PTR.jpg', render: 'https://img.battlefieldmeta.gg/ak4d_version5/gunMiniDisplay' },
  'tr-7': { photo: 'https://www.imfdb.org/images/thumb/4/40/BF6_Tavor7.jpg/600px-BF6_Tavor7.jpg', render: 'https://img.battlefieldmeta.gg/tr-7_version2/gunMiniDisplay' },
  'sor-556-mk2': { photo: 'https://www.imfdb.org/images/thumb/f/f4/BF6_SCARL.jpg/600px-BF6_SCARL.jpg', render: 'https://img.battlefieldmeta.gg/sor-556-mk2_version2/gunMiniDisplay' },
  b36a4: { photo: 'https://www.imfdb.org/images/thumb/c/cb/BF6_G36_A4.jpg/600px-BF6_G36_A4.jpg', render: 'https://img.battlefieldmeta.gg/b36a4_version1/gunMiniDisplay' },
  l85a3: { photo: 'https://www.imfdb.org/images/thumb/3/31/BF6_L85A3.jpg/600px-BF6_L85A3.jpg', render: 'https://img.battlefieldmeta.gg/l85a3_version2/gunMiniDisplay' },
  m433: { photo: 'https://www.imfdb.org/images/thumb/1/19/BF6_HK433_%280%29.jpg/600px-BF6_HK433_%280%29.jpg', render: 'https://img.battlefieldmeta.gg/m433_version2/gunMiniDisplay' },
  'kord-6p67': { photo: 'https://www.imfdb.org/images/thumb/c/c3/BF6_6P67_(1).jpg/600px-BF6_6P67_(1).jpg', render: 'https://img.battlefieldmeta.gg/kord-6p67_version2/gunMiniDisplay' },
  'nvo-228e': { photo: 'https://www.imfdb.org/images/thumb/d/db/BF6_NVO_customize.jpg/600px-BF6_NVO_customize.jpg', render: 'https://img.battlefieldmeta.gg/nvo-228e_version2/gunMiniDisplay' },
  ef88: { photo: 'https://www.imfdb.org/images/thumb/2/2a/BF6_EF88.jpg/600px-BF6_EF88.jpg', render: 'https://img.battlefieldmeta.gg/ef88/gunMiniDisplay' },
  'vcr-2': { photo: 'https://www.imfdb.org/images/thumb/4/41/BF6_VHS-2_%280%29.jpg/600px-BF6_VHS-2_%280%29.jpg', render: 'https://img.battlefieldmeta.gg/vcr-2/gunMiniDisplay' },
  m16a4: { photo: 'https://www.imfdb.org/images/thumb/a/a4/BF6_M16A4_(0).jpg/600px-BF6_M16A4_(0).jpg', render: 'https://img.battlefieldmeta.gg/m16a4/gunMiniDisplay' },
  m4a1: { photo: 'https://www.imfdb.org/images/thumb/b/b2/BF6_LABSAUG07_M4A1.jpg/600px-BF6_LABSAUG07_M4A1.jpg', render: 'https://img.battlefieldmeta.gg/m4a1_version1/gunMiniDisplay' },
  'ak-205': { photo: 'https://www.imfdb.org/images/thumb/3/30/BF6_AK205_customize.jpg/600px-BF6_AK205_customize.jpg', render: 'https://img.battlefieldmeta.gg/ak-205_version2/gunMiniDisplay' },
  'm417-a2': { photo: 'https://www.imfdb.org/images/thumb/4/4e/BF6_LABSAUG09_HK417A2.jpg/600px-BF6_LABSAUG09_HK417A2.jpg', render: 'https://img.battlefieldmeta.gg/m417-a2_version1/gunMiniDisplay' },
  'grt-bc': { photo: 'https://www.imfdb.org/images/thumb/9/92/BF6_GrotB10_%280%29.jpg/600px-BF6_GrotB10_%280%29.jpg', render: 'https://img.battlefieldmeta.gg/grt-bc_version2/gunMiniDisplay' },
  'qbz-192': { photo: 'https://www.imfdb.org/images/thumb/a/a2/BF6_QBZ192.jpg/600px-BF6_QBZ192.jpg', render: 'https://img.battlefieldmeta.gg/qbz-192_version2/gunMiniDisplay' },
  'sg-553r': { photo: 'https://www.imfdb.org/images/thumb/5/51/BF6_SG_553_R_%281%29.jpg/600px-BF6_SG_553_R_%281%29.jpg', render: 'https://img.battlefieldmeta.gg/sg-553r_version2/gunMiniDisplay' },
  'sor-300sc': { photo: 'https://www.imfdb.org/images/thumb/c/c2/BF6_SCARSC.jpg/600px-BF6_SCARSC.jpg', render: 'https://img.battlefieldmeta.gg/sor-300sc_version1/gunMiniDisplay' },
  m277: { photo: 'https://www.imfdb.org/images/thumb/1/10/BF6_M4_11.5in.jpg/600px-BF6_M4_11.5in.jpg', render: 'https://img.battlefieldmeta.gg/m277_version2/gunMiniDisplay' },
  'brod-3': { render: 'https://img.battlefieldmeta.gg/brod-3/gunMiniDisplay' },
  'scw-10': { photo: 'https://www.imfdb.org/images/thumb/d/dd/BF6_APC10.jpg/600px-BF6_APC10.jpg', render: 'https://img.battlefieldmeta.gg/scw-10_version2/gunMiniDisplay' },
  kv9: { photo: 'https://www.imfdb.org/images/thumb/4/40/BF6_Vector.jpg/600px-BF6_Vector.jpg', render: 'https://img.battlefieldmeta.gg/kv9_version2/gunMiniDisplay' },
  pw7a2: { photo: 'https://www.imfdb.org/images/thumb/e/eb/BF6_LABSAUG08_MP7A2.jpg/600px-BF6_LABSAUG08_MP7A2.jpg', render: 'https://img.battlefieldmeta.gg/pw7a2_version2/gunMiniDisplay' },
  pw5a3: { photo: 'https://www.imfdb.org/images/thumb/9/97/BF5_MP5MLI.jpg/600px-BF5_MP5MLI.jpg', render: 'https://img.battlefieldmeta.gg/pw5a3_version2/gunMiniDisplay' },
  sgx: { photo: 'https://www.imfdb.org/images/thumb/0/00/BF6_MPX.jpg/600px-BF6_MPX.jpg', render: 'https://img.battlefieldmeta.gg/sgx_version2/gunMiniDisplay' },
  sl9: { photo: 'https://www.imfdb.org/images/thumb/f/f7/BF6_SL9.jpg/600px-BF6_SL9.jpg', render: 'https://img.battlefieldmeta.gg/sl9_version2/gunMiniDisplay' },
  'umg-40': { photo: 'https://www.imfdb.org/images/thumb/b/bf/BF6_UMP40.jpg/600px-BF6_UMP40.jpg', render: 'https://img.battlefieldmeta.gg/umg-40_version2/gunMiniDisplay' },
  'usg-90': { photo: 'https://www.imfdb.org/images/thumb/9/91/BF6_P90.jpg/600px-BF6_P90.jpg', render: 'https://img.battlefieldmeta.gg/usg-90_version2/gunMiniDisplay' },
  cz3a1: { photo: 'https://www.imfdb.org/images/thumb/e/e3/Evo_3_A1.jpg/400px-Evo_3_A1.jpg', render: 'https://img.battlefieldmeta.gg/cz3a1/gunMiniDisplay' },
  'pp-19': { photo: 'https://www.imfdb.org/images/thumb/9/95/BF6_PP-19_(0).jpg/600px-BF6_PP-19_(0).jpg', render: 'https://img.battlefieldmeta.gg/pp-19/gunMiniDisplay' },
  'drs-iar': { photo: 'https://www.imfdb.org/images/thumb/9/9f/BF6_M27_custom.jpg/600px-BF6_M27_custom.jpg', render: 'https://img.battlefieldmeta.gg/drs-iar_version2/gunMiniDisplay' },
  'kts100-mk8': { photo: 'https://www.imfdb.org/images/thumb/b/bc/BF6_Ultimax_%281%29.jpg/600px-BF6_Ultimax_%281%29.jpg', render: 'https://img.battlefieldmeta.gg/kts100-mk8_version1/gunMiniDisplay' },
  rpkm: { photo: 'https://www.imfdb.org/images/thumb/d/d2/BF6_RPKM_(0).jpg/600px-BF6_RPKM_(0).jpg', render: 'https://img.battlefieldmeta.gg/rpkm_version2/gunMiniDisplay' },
  m123k: { photo: 'https://www.imfdb.org/images/thumb/1/11/BF6_MG4.jpg/600px-BF6_MG4.jpg', render: 'https://img.battlefieldmeta.gg/m123k_version2/gunMiniDisplay' },
  m250: { photo: 'https://www.imfdb.org/images/thumb/4/43/BF6_M250_(0).jpg/600px-BF6_M250_(0).jpg', render: 'https://img.battlefieldmeta.gg/m250_version2/gunMiniDisplay' },
  l110: { photo: 'https://www.imfdb.org/images/thumb/8/82/BF6_LABSAUG08_MinimiMK3_SB.jpg/600px-BF6_LABSAUG08_MinimiMK3_SB.jpg', render: 'https://img.battlefieldmeta.gg/l110_version1/gunMiniDisplay' },
  m60: { photo: 'https://www.imfdb.org/images/thumb/3/3d/BF6_M60E6_(0).jpg/600px-BF6_M60E6_(0).jpg', render: 'https://img.battlefieldmeta.gg/m60_version2/gunMiniDisplay' },
  m240l: { photo: 'https://www.imfdb.org/images/thumb/8/82/BF6_M240L_%280%29.jpg/600px-BF6_M240L_%280%29.jpg', render: 'https://img.battlefieldmeta.gg/m240l_version2/gunMiniDisplay' },
  'm121-a2': { photo: 'https://www.imfdb.org/images/thumb/c/c5/BF6_MG5_A2_%280%29.jpg/600px-BF6_MG5_A2_%280%29.jpg', render: 'https://img.battlefieldmeta.gg/m121-a2/gunMiniDisplay' },
  'rpk-74m': { render: 'https://img.battlefieldmeta.gg/rpk-74m/gunMiniDisplay' },
  lmr27: { photo: 'https://www.imfdb.org/images/thumb/f/f6/BF6_LMR-27_%280%29.jpg/600px-BF6_LMR-27_%280%29.jpg', render: 'https://img.battlefieldmeta.gg/lmr27_version2/gunMiniDisplay' },
  'm39-emr': { photo: 'https://www.imfdb.org/images/thumb/3/3b/BF6_Mk14_%281%29.jpg/600px-BF6_Mk14_%281%29.jpg', render: 'https://img.battlefieldmeta.gg/m39-emr_version1/gunMiniDisplay' },
  svdm: { photo: 'https://www.imfdb.org/images/thumb/9/98/BF6_SVDM.jpg/600px-BF6_SVDM.jpg', render: 'https://img.battlefieldmeta.gg/svdm_version2/gunMiniDisplay' },
  'svk-86': { photo: 'https://www.imfdb.org/images/thumb/6/63/BF6_SVCh_(0).jpg/600px-BF6_SVCh_(0).jpg', render: 'https://img.battlefieldmeta.gg/svk-86_version2/gunMiniDisplay' },
  vssm: { photo: 'https://www.imfdb.org/images/thumb/b/b2/BF6_VSSM.jpg/600px-BF6_VSSM.jpg', render: 'https://img.battlefieldmeta.gg/vssm/gunMiniDisplay' },
  'grt-cps': { photo: 'https://www.imfdb.org/images/thumb/d/d1/BF6_Grot_C20PC_%280%29.jpg/600px-BF6_Grot_C20PC_%280%29.jpg', render: 'https://img.battlefieldmeta.gg/grt-cps/gunMiniDisplay' },
  'm2010-esr': { photo: 'https://www.imfdb.org/images/thumb/e/ee/XM2010.jpg/450px-XM2010.jpg', render: 'https://img.battlefieldmeta.gg/m2010-esr_version2/gunMiniDisplay' },
  'sv-98': { photo: 'https://www.imfdb.org/images/thumb/1/1a/BF6_SV-98M_(0).jpg/600px-BF6_SV-98M_(0).jpg', render: 'https://img.battlefieldmeta.gg/sv-98_version2/gunMiniDisplay' },
  psr: { photo: 'https://www.imfdb.org/images/thumb/4/4e/BF6_MRAD.jpg/600px-BF6_MRAD.jpg', render: 'https://img.battlefieldmeta.gg/psr_version2/gunMiniDisplay' },
  'mini-scout': { photo: 'https://www.imfdb.org/images/thumb/1/18/BF6_QMini.jpg/600px-BF6_QMini.jpg', render: 'https://img.battlefieldmeta.gg/mini-scout_version1/gunMiniDisplay' },
  l115: { photo: 'https://www.imfdb.org/images/thumb/0/0d/BF6_AWM_(0).jpg/600px-BF6_AWM_(0).jpg', render: 'https://img.battlefieldmeta.gg/l115/gunMiniDisplay' },
  m1014: { photo: 'https://www.imfdb.org/images/thumb/f/f8/BF6_BenM4.jpg/600px-BF6_BenM4.jpg', render: 'https://img.battlefieldmeta.gg/m1014_version2/gunMiniDisplay' },
  '18-5ks-k': { photo: 'https://www.imfdb.org/images/thumb/e/ef/BF6_KSK.jpg/600px-BF6_KSK.jpg', render: 'https://img.battlefieldmeta.gg/185ks-k_version2/gunMiniDisplay' },
  m87a1: { photo: 'https://www.imfdb.org/images/thumb/e/e9/BF6_M590.jpg/600px-BF6_M590.jpg', render: 'https://img.battlefieldmeta.gg/m87a1_version2/gunMiniDisplay' },
  'db-12': { photo: 'https://www.imfdb.org/images/thumb/e/ef/BF6_DP12.jpg/600px-BF6_DP12.jpg', render: 'https://img.battlefieldmeta.gg/db-12_version1/gunMiniDisplay' },
  m45a1: { photo: 'https://www.imfdb.org/images/thumb/c/c1/BF6_M45.jpg/600px-BF6_M45.jpg', render: 'https://img.battlefieldmeta.gg/m45a1_version2/gunMiniDisplay' },
  'es-57': { photo: 'https://www.imfdb.org/images/thumb/7/7c/BF6_FiSeMK3.jpg/600px-BF6_FiSeMK3.jpg', render: 'https://img.battlefieldmeta.gg/es57_version2/gunMiniDisplay' },
  m44: { photo: 'https://www.imfdb.org/images/thumb/2/2e/BF6_Tarus_6in.jpg/600px-BF6_Tarus_6in.jpg', render: 'https://img.battlefieldmeta.gg/m44_version2/gunMiniDisplay' },
  p18: { photo: 'https://www.imfdb.org/images/thumb/0/01/BF6_P18.jpg/600px-BF6_P18.jpg', render: 'https://img.battlefieldmeta.gg/p18_version1/gunMiniDisplay' },
  'ggh-22': { photo: 'https://www.imfdb.org/images/thumb/9/94/BF6_G22.jpg/600px-BF6_G22.jpg', render: 'https://img.battlefieldmeta.gg/ggh-22_version1/gunMiniDisplay' },
  'm357-trait': { photo: 'https://www.imfdb.org/images/thumb/f/fa/BF6_R8.jpg/600px-BF6_R8.jpg', render: 'https://img.battlefieldmeta.gg/m357-trait/gunMiniDisplay' },
  'vz-61': { photo: 'https://www.imfdb.org/images/thumb/9/9b/BF6_VZ61.jpg/600px-BF6_VZ61.jpg', render: 'https://img.battlefieldmeta.gg/vz-61/gunMiniDisplay' },
};

/** Fontes externas de uma arma, da preferida para a reserva. */
export function externalImageSources(weaponId: string): string[] {
  const entry = WEAPON_IMAGES[weaponId];
  if (!entry) return [];
  return [entry.photo, entry.render].filter((url): url is string => Boolean(url));
}
