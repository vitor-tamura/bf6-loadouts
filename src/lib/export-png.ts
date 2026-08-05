/**
 * Exporta o preview montado como PNG.
 *
 * Existe porque pré-gerar uma imagem por combinação é impossível: só a AK4D tem
 * 336.798.000 combinações de acessórios, e as 63 armas somam 21 bilhões. Em vez
 * de guardar todas, a imagem da combinação que interessa é gerada na hora, no
 * próprio navegador, a partir do desenho já montado na tela.
 */

/** Escala aplicada sobre o tamanho na tela — 3× dá um PNG nítido para compartilhar. */
const SCALE = 3;

export interface ExportOptions {
  /** Nome do arquivo, sem extensão. */
  filename: string;
  /** Cor de fundo. Transparente quando omitida. */
  background?: string;
}

/**
 * Converte um `<svg>` da página em PNG e dispara o download.
 *
 * Só funciona com o esquema vetorial: a foto do jogo vem de outro domínio e o
 * navegador bloqueia a leitura do canvas depois de desenhá-la.
 */
export async function exportSvgAsPng(svg: SVGSVGElement, options: ExportOptions): Promise<void> {
  const box = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));

  // O SVG precisa carregar sozinho, fora do documento: sem as variáveis CSS do
  // tema, as cores viriam vazias. Por isso os valores são resolvidos antes.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  resolveCssVariables(svg, clone);

  const markup = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas indisponível');

    if (options.background) {
      context.fillStyle = options.background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('não foi possível gerar o PNG');

    download(blob, `${options.filename}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Troca `var(--x)` pelo valor calculado.
 *
 * Fora do documento não existe folha de estilo, então qualquer referência a
 * variável de tema resultaria em cor vazia — e o desenho sairia preto.
 */
function resolveCssVariables(original: SVGSVGElement, clone: SVGSVGElement): void {
  const style = getComputedStyle(original);
  const cache = new Map<string, string>();

  const resolve = (value: string): string =>
    value.replace(/var\((--[\w-]+)[^)]*\)/g, (_, name: string) => {
      if (!cache.has(name)) cache.set(name, style.getPropertyValue(name).trim() || '#000');
      return cache.get(name)!;
    });

  const originals = original.querySelectorAll('*');
  clone.querySelectorAll('*').forEach((node, index) => {
    for (const attribute of ['fill', 'stroke']) {
      const value = node.getAttribute(attribute);
      if (value?.includes('var(')) node.setAttribute(attribute, resolve(value));
    }

    const inline = node.getAttribute('style');
    if (inline?.includes('var(')) node.setAttribute('style', resolve(inline));

    // Texto estilizado por classe perde a fonte fora do documento.
    const source = originals[index];
    if (source && node.tagName === 'text') {
      const computed = getComputedStyle(source);
      node.setAttribute('font-family', computed.fontFamily);
      node.setAttribute('font-size', computed.fontSize);
      node.setAttribute('font-weight', computed.fontWeight);
      if (!node.getAttribute('fill')?.startsWith('#')) node.setAttribute('fill', computed.fill || '#fff');
    }
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('falha ao carregar o desenho'));
    image.src = src;
  });
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Nome de arquivo a partir da arma e das peças montadas. */
export function buildFilename(weaponName: string, attachmentNames: string[]): string {
  const slug = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();

  const parts = [slug(weaponName), ...attachmentNames.slice(0, 4).map(slug)].filter(Boolean);
  return parts.join('_') || 'loadout';
}
