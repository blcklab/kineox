"""Produce standalone landing-page screenshots using an in-memory ESM import."""
import base64
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import chromium_options

root=Path(__file__).resolve().parent.parent

def jsurl(path):
    src=path.read_text()
    def replace(m):
        return m.group(1)+'"'+jsurl((path.parent / m.group(2)).resolve())+'"'
    src=re.sub(r'''(from\s+|import\s+)["'](\.{1,2}/[^"']+\.js)["']''',replace,src)
    return 'data:text/javascript;base64,'+base64.b64encode(src.encode()).decode()

html=(root/'examples/showcase/index.html').read_text()
html=re.sub(r'<script type="module">.*?</script>','',html,flags=re.S)
html=html.replace('<link rel="stylesheet" href="../../dist/styles/showcase.css" />','')
poster='data:image/svg+xml;base64,'+base64.b64encode((root/'examples/showcase/poster.svg').read_bytes()).decode()
media=base64.b64encode((root/'examples/media/showcase-loop.mp4').read_bytes()).decode()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,**chromium_options(),args=['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(viewport={'width':1440,'height':1050}, device_scale_factor=1)
    page.set_content(html)
    page.add_style_tag(content=(root/'dist/styles/showcase.css').read_text())
    page.evaluate('''async ([module,media,poster]) => {
      const {mountShowcase}=await import(module);
      const bytes=Uint8Array.from(atob(media),x=>x.charCodeAt(0));
      const clip=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));
      window.demo=mountShowcase('#showcase-demo',{source:{src:clip},poster,title:'Kineox cinematic demo',presentation:{frame:'borderless',fit:'cover',aspectRatio:'16/9'}});
      window.ambient=mountShowcase('#ambient-demo',{mode:'ambient',source:{src:clip},poster});
    }''',[jsurl(root/'dist/showcase/index.js'),media,poster])
    page.screenshot(path=str(root/'showcase-landing-desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(root/'showcase-landing-mobile.png'),full_page=True)
    page.evaluate('demo.destroy();ambient.destroy()')
    browser.close()
