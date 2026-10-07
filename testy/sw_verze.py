# Verze service workeru podle obsahu souborů aplikace – Python obdoba testy/sw_verze.js pro PC bez Node.js
# (pracovní PC). Otisk je stejný jako z Node (ověřeno 7. 10. 2026 na HEAD 0f44a36).
#   python testy/sw_verze.py            kontrola VERZE v sw.js
#   python testy/sw_verze.py --zapsat   přepíše VERZE v sw.js
#   python testy/sw_verze.py --head     otisk ze souborů posledního commitu (kontrola výpočtu proti Node)
import hashlib
import re
import subprocess
import sys
from pathlib import Path

KOREN = Path(__file__).resolve().parent.parent
Z_HEAD = '--head' in sys.argv


def cti(f):
    if Z_HEAD:
        cesta = f[2:] if f.startswith('./') else f
        return subprocess.run(['git', '-C', str(KOREN), 'show', 'HEAD:' + cesta], capture_output=True, check=True).stdout
    return (KOREN / f).read_bytes()


def otisk(sw):
    seznam = re.search(r"const SOUBORY = \[([\s\S]*?)\];", sw)
    if not seznam:
        raise SystemExit('V sw.js chybí seznam SOUBORY.')
    h = hashlib.sha1()
    for f in (x[1:-1] for x in re.findall(r"'[^']+'", seznam.group(1))):
        if f == './':
            continue
        obsah = cti(f)
        if not re.search(r"\.(png|jpe?g|webp|ico)$", f, re.I):
            obsah = obsah.decode('utf-8').replace('\r\n', '\n').encode('utf-8')  # konce řádků jako v Node
        h.update(f.encode('utf-8') + b'\0')
        h.update(obsah)
        h.update(b'\0')
    return 'asistent-' + h.hexdigest()[:12]


sw = cti('sw.js').decode('utf-8')
mel = otisk(sw)
ma = re.search(r"const VERZE = '([^']+)';", sw).group(1)
if '--zapsat' in sys.argv and not Z_HEAD:
    cesta = KOREN / 'sw.js'
    cesta.write_bytes(re.sub(r"const VERZE = '[^']+';", "const VERZE = '" + mel + "';", cesta.read_bytes().decode('utf-8'), count=1).encode('utf-8'))
    print('VERZE v sw.js: ' + mel)
elif ma == mel:
    print('sw.js VERZE sedí (' + ma + ')')
else:
    print('sw.js VERZE nesedí s obsahem: je ' + ma + ', má být ' + mel + ' → python testy/sw_verze.py --zapsat')
    sys.exit(1)
