/**
 * Leitor mínimo de planilha, o bastante para importar uma fonte de dados.
 *
 * Um `.xlsx` é um ZIP com XML dentro. Ler os dois é trabalho conhecido, e fazer
 * isso aqui evita trazer uma dependência de terceiros para o pipeline por causa
 * de um arquivo — dependência que precisaria ser auditada, atualizada e
 * confiada num script que decide o que vai para o catálogo.
 *
 * Deliberadamente incompleto: lê células de texto e número da grade, e ignora
 * fórmula, formato, estilo e data. É o que uma tabela de dados tem.
 */

import { inflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

/* ---------------------------------- ZIP ---------------------------------- */

/**
 * Os arquivos de dentro do ZIP, pelo diretório central.
 *
 * O caminho fácil seria varrer assinaturas de cabeçalho local, mas elas podem
 * declarar tamanho zero quando o gravador usa descritor de dados — e aí a
 * leitura sai truncada sem erro nenhum. O diretório central é a lista oficial.
 */
function unzip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();

  // Fim do diretório central: assinatura 0x06054b50, procurada do fim para o
  // começo porque pode haver comentário depois dela.
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('arquivo não é um ZIP válido');

  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);

  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    // O cabeçalho local repete nome e extra, com tamanhos próprios.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(start, start + compressedSize);

    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

/* ---------------------------------- XML ---------------------------------- */

const decode = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** O texto de cada `<si>` da tabela de textos compartilhados, em ordem. */
function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1])).join(''),
  );
}

/** `B7` → coluna 1 (base zero). */
function columnOf(reference: string): number {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? 'A';
  let column = 0;
  for (const letter of letters) column = column * 26 + (letter.charCodeAt(0) - 64);
  return column - 1;
}

export type Row = (string | null)[];

/**
 * Uma aba, como matriz de células.
 *
 * As lacunas são preservadas: célula vazia vira `null` na posição dela, e não
 * um deslocamento das seguintes. Numa planilha de dados, coluna trocada é pior
 * que célula faltando.
 */
function parseSheet(xml: string, shared: string[]): Row[] {
  const rows: Row[] = [];

  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Row = [];

    /*
     * A alternativa de auto-fechamento vem antes de propósito.
     *
     * Escrita como `<c([^>]*)>...</c>` primeiro, a célula vazia `<c r="A1"
     * s="1"/>` casa mesmo assim — `[^>]*` engole a barra — e o corpo capturado
     * vai até o `</c>` da célula *seguinte*. O valor da vizinha entra na vaga
     * da vazia e some da posição dela: a planilha inteira anda uma coluna a
     * partir da primeira lacuna, sem erro nenhum.
     */
    for (const cell of rowMatch[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1] ?? '';
      const body = cell[2] ?? '';
      const reference = attributes.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attributes.match(/t="([^"]+)"/)?.[1];

      let value: string | null = null;
      if (type === 'inlineStr') {
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1])).join('');
      } else {
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (raw !== undefined) value = type === 's' ? (shared[Number(raw)] ?? null) : decode(raw);
      }

      const at = reference ? columnOf(reference) : cells.length;
      while (cells.length < at) cells.push(null);
      cells[at] = value;
    }

    rows.push(cells);
  }

  return rows;
}

/** As abas de uma planilha, na ordem em que aparecem, com nome e conteúdo. */
export function readWorkbook(path: string): Map<string, Row[]> {
  const files = unzip(readFileSync(path));

  const workbook = files.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const rels = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const shared = sharedStrings(files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '');

  /*
   * Atributo não tem ordem garantida.
   *
   * Um gravador escreve `Id="rId1" Target="worksheets/sheet1.xml"`, outro
   * escreve `Type=... Target=... Id=...`. Um padrão que exigisse `Id` antes de
   * `Target` simplesmente não casa no segundo caso — e o resultado é uma
   * planilha lida como se não tivesse aba nenhuma, sem erro. Cada atributo é
   * procurado por si dentro do elemento.
   */
  const targets = new Map<string, string>();
  for (const relationship of rels.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const id = relationship[1].match(/\bId="([^"]+)"/)?.[1];
    const target = relationship[1].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) targets.set(id, target);
  }

  const sheets = new Map<string, Row[]>();

  for (const sheet of workbook.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = sheet[1].match(/\bname="([^"]+)"/)?.[1];
    const id = sheet[1].match(/\br:id="([^"]+)"/)?.[1];
    if (!name || !id) continue;

    const target = targets.get(id);
    if (!target) continue;

    // O alvo pode vir absoluto (`/xl/worksheets/sheet1.xml`) ou relativo à
    // pasta do workbook (`worksheets/sheet1.xml`).
    const clean = target.replace(/^\//, '');
    const path = clean.startsWith('xl/') ? clean : `xl/${clean}`;

    const xml = files.get(path)?.toString('utf8');
    if (xml) sheets.set(name, parseSheet(xml, shared));
  }

  return sheets;
}
