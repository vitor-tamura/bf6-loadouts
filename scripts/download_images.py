#!/usr/bin/env python3
"""
Baixa as artes de arma e de gadget e grava cada uma em `public/`.

Enquanto as imagens vinham de fora, bastava uma URL por arma. Trazidas para o
projeto, elas param de depender de site de terceiros continuar no ar e do CDN
permitir hotlink — e o build estático passa a ser realmente autossuficiente.

    python3 scripts/baixar_imagens.py           # só o que falta
    python3 scripts/baixar_imagens.py --force  # rebaixa tudo

A saída é WebP: a mesma foto em PNG ocupa perto de dez vezes mais, e o formato é
aceito por todo navegador que roda a aplicação. O alfa é preservado quando a
origem tem.

    python3 scripts/download_images.py --force --armas  # rebaixa só as armas

## De onde vem a foto da arma

Da arte de catálogo do BattlefieldMeta, a mesma renderização que o jogo usa na
tela de montagem: uma arma só, de perfil, fundo transparente, 1366 px de
largura. Antes a primeira escolha era a captura do IMFDB, e o resultado era uma
coleção desencontrada — duas armas empilhadas num fundo escuro, capturas do
menu com a interface na tela, e renders de 320 px ao lado de fotos de 800. A
captura e o render do cadastro (`weapon-images.ts`) seguem como reserva, para a
arma cuja arte ainda não saiu.

A versão da arte vem da API do próprio BattlefieldMeta (`imageVersion`): o
endereço sem versão às vezes devolve um modelo antigo.
"""
import json
import re
import sys
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WEAPONS_TARGET = ROOT / 'public' / 'weapons'
WEAPONS_SOURCE = ROOT / 'src' / 'data' / 'weapon-images.ts'
GADGETS_TARGET = ROOT / 'public' / 'gadgets'
GADGETS_SOURCE = ROOT / 'src' / 'data' / 'gadget-images.ts'

# Sem User-Agent de navegador, parte das origens devolve 403.
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/131.0 Safari/537.36',
}

MAX_WIDTH = 800
QUALITY = 82

# A arte de arma vai na largura em que a fonte a publica, e num quadro só: toda
# renderização sai em 1366 x 409, com a arma centrada — as poucas que vêm mais
# baixas (a SVDM, 1366 x 271) ganham margem transparente em vez de aparecer
# maior que as outras. Qualidade alta porque é a imagem principal da tela.
WEAPON_WIDTH = 1366
WEAPON_CANVAS = (1366, 409)
WEAPON_QUALITY = 90

# A API do BattlefieldMeta usa dois ids diferentes dos daqui.
BATTLEFIELDMETA_ID = {'185ks-k': '18-5ks-k', 'es57': 'es-57'}
# Cópia em PNG para o cartão de compartilhamento. O cartão é montado fora do
# navegador, pelo Satori, que não lê WebP — e sem uma segunda cópia a foto
# simplesmente não aparece. A paleta reduzida deixa o arquivo do tamanho do
# WebP original, e a largura basta para a faixa do cartão.
CARD_TARGET = ROOT / 'public' / 'weapons' / 'card'
# O cartão virou imagem no padrão do Instagram (1080 de largura), e a foto ocupa
# quase a largura inteira dele, com até ~620 de altura. A caixa antiga, de
# 680x180, entregava fotos de 320 px que saíam esticadas três vezes e borradas
# no celular. Esta caixa é maior que quase todas as originais (600–800 px), ou
# seja, na prática a cópia sai na resolução da própria fonte — e a foto é
# ampliada no máximo 1,6 vez, em vez de 3.
CARD_BOX = (960, 600)
# Com a foto grande, 128 cores deixavam degraus visíveis no fundo de estúdio em
# degradê. 256 é o teto do PNG com paleta e custa quase nada a mais no arquivo.
CARD_COLORS = 256
# O ícone de gadget aparece pequeno na interface; 256 px já é o dobro do que ele
# ocupa na maior tela, e cabe num arquivo de poucos quilobytes.
GADGET_WIDTH = 256


def weapon_sources() -> dict[str, list[str]]:
    """Lê o mapa de imagens do TypeScript: id da arma → URLs, da melhor à reserva."""
    text = WEAPONS_SOURCE.read_text(encoding='utf8')
    wiki = re.search(r"const WIKI = '([^']+)'", text).group(1)

    result = {}
    for linha in text.splitlines():
        entry = re.match(r"\s*'?([\w-]+)'?:\s*\{(.+)\},\s*$", linha)
        if not entry or 'photo' not in entry.group(2) and 'render' not in entry.group(2):
            continue
        arma, corpo = entry.group(1), entry.group(2)
        urls = []
        for campo in ('photo', 'render'):
            value = re.search(rf"{campo}:\s*[`']([^`']+)[`']", corpo)
            if value:
                urls.append(value.group(1).replace('${WIKI}', wiki))
        if urls:
            result[arma] = urls
    return result


def battlefieldmeta_weapon_sources() -> dict[str, list[str]]:
    """
    URLs adicionais do catálogo público do BattlefieldMeta/WZStats.

    O cadastro local continua sendo a primeira fonte. Para armas sem URL
    cadastrada, a API informa a versão do asset quando o render já foi
    publicado. Em lançamentos, o campo pode vir vazio e o CDN pode responder
    404; nesse caso a arma permanece pendente para a próxima execução.
    """
    try:
        data = json.loads(fetch_bytes('https://app.battlefieldmeta.gg/api/weapons'))
    except Exception as error:
        print(f'  BattlefieldMeta indisponível; usando só as fontes cadastradas: {error}')
        return {}

    text = WEAPONS_SOURCE.read_text(encoding='utf8')
    known_ids = {
        match.group(1)
        for match in re.finditer(r"id:\s*'([^']+)',\s*\n\s*name:\s*'([^']+)'", text)
    }

    result: dict[str, list[str]] = {}
    for weapon in data.get('data', []):
        weapon_id = str(weapon.get('id', ''))
        # A fonte marca lançamentos com isNew antes de estarem no catálogo
        # local; baixar a imagem desde já deixa o arquivo pronto para o cadastro.
        if weapon_id not in known_ids and not weapon.get('isNew'):
            continue
        version = str(weapon.get('imageVersion') or '').strip()
        urls = []
        if version:
            urls.append(f'https://img.wzstats.gg/{weapon_id}_version{version}/gunDisplayLoadouts')
        urls.append(f'https://img.wzstats.gg/{weapon_id}/gunDisplayLoadouts')
        result[weapon_id] = urls

    return result


def render_sources() -> dict[str, list[str]]:
    """
    Id da arma → a arte de catálogo grande do BattlefieldMeta, na versão atual.

    É a primeira fonte de toda arma: as outras ficam de reserva. Arma que a API
    ainda não lista fica só com a reserva, e entra aqui na rodada em que ela
    aparecer.
    """
    try:
        data = json.loads(fetch_bytes('https://app.battlefieldmeta.gg/api/weapons'))
    except Exception as error:
        print(f'  BattlefieldMeta indisponível; usando só as fontes cadastradas: {error}')
        return {}

    # Só arma de fogo do cadastro, ou lançamento que a fonte já marcou como novo.
    cadastro = (ROOT / 'src' / 'data' / 'weapons.ts').read_text(encoding='utf8')
    de_fogo = {
        m.group(1)
        for m in re.finditer(r"id: '([^']+)',\n\s*name: '[^']*',\n\s*category: '([^']+)'", cadastro)
        if m.group(2) != 'melee'
    }

    result: dict[str, list[str]] = {}
    for weapon in data.get('data', []):
        slug = str(weapon.get('id', ''))
        if BATTLEFIELDMETA_ID.get(slug, slug) not in de_fogo and not weapon.get('isNew'):
            continue
        version = str(weapon.get('imageVersion') or '').strip()
        asset = f'{slug}_version{version}' if version else slug
        result[BATTLEFIELDMETA_ID.get(slug, slug)] = [f'https://img.battlefieldmeta.gg/{asset}/public']
    return result


def gadget_sources() -> dict[str, list[str]]:
    """Id do gadget → uma URL. O mapa mora no TS para o app e o script concordarem."""
    text = GADGETS_SOURCE.read_text(encoding='utf8')
    base = re.search(r"const TIERMAKER =\s*'([^']+)'", text).group(1)
    pairs = re.findall(r"^  '?([\w-]+)'?: '([\w-]+)',$", text, flags=re.M)
    return {gadget: [f'{base}/{file}.png'] for gadget, file in pairs}


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def write_image(
    dados: bytes,
    path: Path,
    max_width: int = MAX_WIDTH,
    quality: int = QUALITY,
    canvas: tuple[int, int] | None = None,
) -> tuple[int, int]:
    image = Image.open(BytesIO(dados))
    if image.width > max_width:
        height = round(image.height * max_width / image.width)
        image = image.resize((max_width, height), Image.LANCZOS)
    # Modo P com transparência vira RGBA; o resto segue como está.
    if image.mode not in ('RGB', 'RGBA'):
        image = image.convert('RGBA' if 'transparency' in image.info else 'RGB')
    # Render transparente vai para o quadro comum, centrado; foto com fundo não.
    if canvas and image.mode == 'RGBA' and image.width <= canvas[0] and image.height <= canvas[1]:
        quadro = Image.new('RGBA', canvas, (0, 0, 0, 0))
        quadro.alpha_composite(image, ((canvas[0] - image.width) // 2, (canvas[1] - image.height) // 2))
        image = quadro
    image.save(path, 'WEBP', quality=quality, method=6)
    return image.size


def write_card_images(force: bool) -> tuple[int, int]:
    """Gera, a partir de cada WebP de arma, a cópia PNG que o cartão consegue ler."""
    CARD_TARGET.mkdir(parents=True, exist_ok=True)
    done = skipped = 0

    print('\nCópias para o cartão')
    for origem in sorted(WEAPONS_TARGET.glob('*.webp')):
        destino = CARD_TARGET / f'{origem.stem}.png'
        if destino.exists() and not force and destino.stat().st_mtime >= origem.stat().st_mtime:
            skipped += 1
            continue

        image = Image.open(origem).convert('RGBA')
        image.thumbnail(CARD_BOX, Image.LANCZOS)
        image.quantize(colors=CARD_COLORS, method=Image.FASTOCTREE).save(destino, optimize=True)
        print(f'  ✓ {origem.stem:20} {image.width}x{image.height}  {destino.stat().st_size // 1024} KB')
        done += 1

    return done, skipped


def download(
    label: str,
    entries: dict[str, list[str]],
    target: Path,
    force: bool,
    max_width: int = MAX_WIDTH,
    quality: int = QUALITY,
    canvas: tuple[int, int] | None = None,
) -> tuple[int, int, int]:
    target.mkdir(parents=True, exist_ok=True)
    done = failed = skipped = 0

    print(f'\n{label}')
    for item, urls in sorted(entries.items()):
        path = target / f'{item}.webp'
        if path.exists() and not force:
            skipped += 1
            continue

        last = 'sem URL'
        for url in urls:
            try:
                width, height = write_image(fetch_bytes(url), path, max_width, quality, canvas)
            except Exception as error:  # origem fora do ar, formato ilegível, 403
                last = f'{type(error).__name__}: {error}'
                continue
            print(f'  ✓ {item:20} {width}x{height}  {path.stat().st_size // 1024} KB')
            done += 1
            break
        else:
            print(f'  ✗ {item:20} nenhuma fonte respondeu — {last}')
            failed += 1

    return done, skipped, failed


def main() -> int:
    force = '--force' in sys.argv
    so_armas = '--armas' in sys.argv

    # A arte de catálogo grande primeiro; captura e render do cadastro, e o
    # render pequeno da API, de reserva.
    image_sources = render_sources()
    for weapon_id, urls in [*weapon_sources().items(), *battlefieldmeta_weapon_sources().items()]:
        image_sources[weapon_id] = list(dict.fromkeys([*image_sources.get(weapon_id, []), *urls]))

    totals = [download('Armas', image_sources, WEAPONS_TARGET, force, WEAPON_WIDTH, WEAPON_QUALITY, WEAPON_CANVAS)]
    if not so_armas:
        totals.append(download('Gadgets', gadget_sources(), GADGETS_TARGET, force, GADGET_WIDTH))
    done, skipped, failed = (sum(column) for column in zip(*totals))

    cartoes, cartoes_prontos = write_card_images(force)

    print(f'\n{done} baixadas · {skipped} já existiam · {failed} falharam')
    print(f'{cartoes} cópias para o cartão · {cartoes_prontos} já existiam')
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
