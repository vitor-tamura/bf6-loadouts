#!/usr/bin/env python3
"""
Baixa as fotos das armas e grava cada uma em `public/weapons/`.

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
TARGET = ROOT / 'public' / 'weapons'
SOURCE = ROOT / 'src' / 'data' / 'weapon-images.ts'

# Sem User-Agent de navegador, parte das origens devolve 403.
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/131.0 Safari/537.36',
}

MAX_WIDTH = 800
QUALITY = 82


def sources() -> dict[str, list[str]]:
    """Lê o mapa de imagens do TypeScript: id da arma → URLs, da melhor à reserva."""
    text = SOURCE.read_text(encoding='utf8')
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


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def write_image(dados: bytes, path: Path) -> tuple[int, int]:
    image = Image.open(BytesIO(dados))
    if image.width > MAX_WIDTH:
        height = round(image.height * MAX_WIDTH / image.width)
        image = image.resize((MAX_WIDTH, height), Image.LANCZOS)
    # Modo P com transparência vira RGBA; o resto segue como está.
    if image.mode not in ('RGB', 'RGBA'):
        image = image.convert('RGBA' if 'transparency' in image.info else 'RGB')
    image.save(path, 'WEBP', quality=QUALITY, method=6)
    return image.size


def main() -> int:
    force = '--force' in sys.argv
    TARGET.mkdir(parents=True, exist_ok=True)

    done = failed = skipped = 0
    for arma, urls in sorted(sources().items()):
        path = TARGET / f'{arma}.webp'
        if path.exists() and not force:
            skipped += 1
            continue

        for url in urls:
            try:
                width, height = write_image(fetch_bytes(url), path)
            except Exception as error:  # origem fora do ar, formato ilegível, 403
                last = f'{type(error).__name__}: {error}'
                continue
            print(f'  ✓ {arma:14} {width}x{height}  {path.stat().st_size // 1024} KB')
            done += 1
            break
        else:
            print(f'  ✗ {arma:14} nenhuma fonte respondeu — {last}')
            failed += 1

    print(f'\n{done} baixadas · {skipped} já existiam · {failed} falharam')
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
