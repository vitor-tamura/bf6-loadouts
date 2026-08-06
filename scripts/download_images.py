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
"""
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


def write_image(dados: bytes, path: Path, max_width: int = MAX_WIDTH) -> tuple[int, int]:
    image = Image.open(BytesIO(dados))
    if image.width > max_width:
        height = round(image.height * max_width / image.width)
        image = image.resize((max_width, height), Image.LANCZOS)
    # Modo P com transparência vira RGBA; o resto segue como está.
    if image.mode not in ('RGB', 'RGBA'):
        image = image.convert('RGBA' if 'transparency' in image.info else 'RGB')
    image.save(path, 'WEBP', quality=QUALITY, method=6)
    return image.size


def download(
    label: str,
    entries: dict[str, list[str]],
    target: Path,
    force: bool,
    max_width: int = MAX_WIDTH,
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
                width, height = write_image(fetch_bytes(url), path, max_width)
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

    totals = [
        download('Armas', weapon_sources(), WEAPONS_TARGET, force),
        download('Gadgets', gadget_sources(), GADGETS_TARGET, force, GADGET_WIDTH),
    ]
    done, skipped, failed = (sum(column) for column in zip(*totals))

    print(f'\n{done} baixadas · {skipped} já existiam · {failed} falharam')
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
