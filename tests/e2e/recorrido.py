"""
Recorrido automático de la app: para cada rol abre todas las vistas permitidas y pulsa
cada botón (y los botones de los modales que se abran), registrando cualquier error de JavaScript.

Requisitos (una vez):   pip install playwright && python -m playwright install chromium
Uso:
  node scripts/build.mjs --variante demo --pruebas --salida build/e2e/index.html
  python tests/e2e/recorrido.py build/e2e/index.html            # todos los roles, ancho celular
  python tests/e2e/recorrido.py build/e2e/index.html 1280 admin # un rol, ancho escritorio
Sale con código 1 si encuentra algún error.
"""
import sys, json, pathlib, collections
from playwright.sync_api import sync_playwright

archivo = pathlib.Path(sys.argv[1]).resolve()
ancho = int(sys.argv[2]) if len(sys.argv) > 2 else 390
solo = sys.argv[3].split(',') if len(sys.argv) > 3 else None
URL = archivo.as_uri() + '?cetest'
res = {'errores': [], 'vistas': 0, 'clics': 0, 'fallas': []}

with sync_playwright() as p:
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={'width': ancho, 'height': 844}, accept_downloads=True)
    pg = ctx.new_page()
    donde = {'v': 'carga'}
    pg.on('pageerror', lambda e: res['errores'].append(donde['v'] + ' :: ' + str(e)[:200]))
    pg.on('popup', lambda pp: pp.close())
    pg.on('dialog', lambda d: d.accept())
    pg.add_init_script("window.print=()=>{};window.open=()=>({closed:false,close(){},document:{write(){},close(){}},focus(){}});")
    pg.goto(URL, wait_until='load'); pg.wait_for_timeout(2500)
    if not pg.evaluate("!!window.__CE_TEST"):
        sys.exit('La app no expone __CE_TEST: constrúyela con --pruebas')
    roles = pg.evaluate("[...document.querySelectorAll('#demoRole option')].map(o=>o.value)")
    for rol in [r for r in roles if not solo or r in solo]:
        pg.evaluate(f"(()=>{{const s=document.querySelector('#demoRole');s.value='{rol}';s.dispatchEvent(new Event('change'))}})()")
        pg.wait_for_timeout(700)
        vistas = pg.evaluate("__CE_TEST.NAV.flatMap(g=>g.items).filter(i=>i.roles.includes(__CE_TEST.rol())).map(i=>i.id)")
        for v in vistas:
            donde['v'] = f'{rol}/{v}'
            pg.evaluate(f"__CE_TEST.go('{v}')"); pg.wait_for_timeout(500); res['vistas'] += 1
            n = pg.evaluate("document.querySelectorAll('#content [data-act]').length")
            for k in range(min(n, 60)):
                acts = pg.evaluate("[...document.querySelectorAll('#content [data-act]')].map(e=>e.dataset.act)")
                if k >= len(acts): break
                a = acts[k]
                if a in ('tamper', 'tmPlay'): continue
                donde['v'] = f'{rol}/{v}/{a}'
                try:
                    pg.evaluate(f"document.querySelectorAll('#content [data-act]')[{k}].click()"); pg.wait_for_timeout(250); res['clics'] += 1
                    for j, ma in enumerate(pg.evaluate("[...document.querySelectorAll('#modalRoot [data-act]')].map(e=>e.dataset.act)")):
                        if ma == 'closeModal': continue
                        donde['v'] = f'{rol}/{v}/{a}>{ma}'
                        pg.evaluate(f"(()=>{{const e=document.querySelectorAll('#modalRoot [data-act]')[{j}]; if(e) e.click();}})()"); pg.wait_for_timeout(200); res['clics'] += 1
                    pg.evaluate("__CE_TEST.closeModal()")
                    if pg.evaluate("__CE_TEST.view()") != v: pg.evaluate(f"__CE_TEST.go('{v}')"); pg.wait_for_timeout(300)
                except Exception as ex:
                    res['fallas'].append(donde['v'] + ' ' + str(ex)[:120])
    nav.close()
res['errores'] = collections.Counter(res['errores']).most_common()
print(json.dumps(res, ensure_ascii=False, indent=1))
sys.exit(1 if res['errores'] or res['fallas'] else 0)
