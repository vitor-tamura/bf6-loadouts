/**
 * Data do build, congelada por `next.config.ts` e embutida no bundle.
 *
 * Nada aqui pode ler o relógio na hora de renderizar: a aplicação é estática,
 * então o HTML é gerado uma vez e reidratado depois — servidor e navegador
 * precisam ver a mesma data, ou o React acusa divergência. É por isso que a
 * temporada é resolvida por esta constante, e não por `new Date()`.
 *
 * A consequência é que a virada de temporada acontece no deploy seguinte à
 * data, não à meia-noite. Para um site de loadout, é a troca certa.
 */
export const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE ?? '2026-07-21';
