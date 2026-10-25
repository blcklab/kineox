"""Offline Chromium check of the interactive playground, no network navigation."""
import base64
from pathlib import Path
import re
from playwright.sync_api import sync_playwright
from browser_config import chromium_options

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT/'dist'

def jsurl(path):
    body=path.read_text()
    def repl(m):
        return m.group(1)+'"'+jsurl((path.parent/m.group(2)).resolve())+'"'
    body=re.sub(r'''(from\s+|import\s+)["'](\.{1,2}/[^"']+\.js)["']''',repl,body)
    return 'data:text/javascript;base64,'+base64.b64encode(body.encode()).decode()

text=(ROOT/'examples/index.html').read_text()
script=re.search(r'<script type="module">([\s\S]+?)</script>',text).group(1)
text=re.sub(r'<script type="module">[\s\S]+?</script>','',text)
script=script.replace("'../dist/player/index.js'",repr(jsurl(DIST/'player/index.js')))
script=script.replace("'../dist/showcase/index.js'",repr(jsurl(DIST/'showcase/index.js')))
script=script.replace("const fixture = '/examples/media/showcase-loop.mp4';", 'const fixture = window.demoMedia;')
script=script.replace("const poster = '/examples/showcase/poster.svg';", 'const poster = window.posterUrl;')
script_url='data:text/javascript;base64,'+base64.b64encode(script.encode()).decode()
media=base64.b64encode((ROOT/'examples/media/showcase-loop.mp4').read_bytes()).decode()
poster='data:image/svg+xml;base64,'+base64.b64encode((ROOT/'examples/showcase/poster.svg').read_bytes()).decode()
with sync_playwright() as pw:
    b=pw.chromium.launch(headless=True,**chromium_options(),args=['--no-sandbox','--disable-dev-shm-usage'])
    page=b.new_page(viewport={'width':1365,'height':940})
    errors=[]
    page.on('pageerror', lambda error:errors.append(str(error)))
    page.set_content(text)
    page.add_style_tag(content=(DIST/'styles/player.css').read_text())
    page.add_style_tag(content=(DIST/'styles/showcase.css').read_text())
    page.evaluate('''([media,poster])=>{const bytes=Uint8Array.from(atob(media), c=>c.charCodeAt(0));window.demoMedia=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));window.posterUrl=poster;}''',[media,poster])
    page.evaluate('(url) => import(url)',script_url)
    assert page.locator('#player .kx-player').count()==1
    assert page.locator('#showcase .kx-showcase').count()==1
    page.screenshot(path=str(ROOT/'playground-desktop-preview.png'),full_page=True)
    page.locator('#frame').select_option('device')
    assert page.locator('#showcase .kx-showcase').get_attribute('data-kx-frame')=='device'
    page.locator('#theme').click()
    assert page.locator('#player .kx-player').get_attribute('data-kx-theme')=='light'
    page.locator('#showcase .kx-showcase__open').click()
    page.wait_for_function("document.querySelector('#showcase .kx-showcase').getAttribute('role')==='dialog'",timeout=8000)
    assert page.locator('#showcase video').count()==1
    page.keyboard.press('Escape')
    assert page.locator('#showcase .kx-showcase').get_attribute('role')=='region'
    page.locator('#video-file').set_input_files(str(ROOT/'tests/assets/short.mp4'))
    assert 'short.mp4' in page.locator('#file-status').inner_text()
    page.locator('#reset').click()
    assert 'cinematic loop' in page.locator('#file-status').inner_text()
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(ROOT/'playground-mobile-preview.png'),full_page=True)
    assert not errors,errors
    b.close()
    print('M6 PLAYGROUND CHROMIUM: PASS — player/showcase, frame, theme, modal, local-file, reset, responsive; zero page errors')
