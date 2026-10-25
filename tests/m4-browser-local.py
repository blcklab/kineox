"""M4 Chromium smoke without HTTP server. Requires Python Playwright + Chromium.
Tests extension slots, dynamic themes, borrowed DOM restoration, and headless behaviors.
"""
import base64
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import chromium_options

ROOT=Path(__file__).resolve().parent.parent
DIST=ROOT/'dist'

def jsurl(path):
    body=path.read_text()
    def repl(match):
        return match.group(1)+'"'+jsurl((path.parent/match.group(2)).resolve())+'"'
    body=re.sub(r'''(from\s+|import\s+)["'](\.{1,2}/[^"']+\.js)["']''', repl, body)
    return 'data:text/javascript;base64,' + base64.b64encode(body.encode()).decode()

modules={k:jsurl(DIST/k/'index.js') for k in ['core','player','showcase','ui','theme','extensions']}
media=base64.b64encode((ROOT/'tests/assets/short.mp4').read_bytes()).decode()
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,**chromium_options(),args=['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(viewport={'width':1180,'height':900})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content('''<!doctype html><html><body style="background:#12151e; margin:26px; color:#fff; font:16px system-ui"><h1>KINEOX / M4 EXTENSIBILITY</h1><div id="player" style="max-width:720px"></div><div id="showcase" style="max-width:720px;margin-top:24px"></div><div id="borrow"><video></video></div></body></html>''')
    page.add_style_tag(content=(DIST/'styles/player.css').read_text())
    page.add_style_tag(content=(DIST/'styles/showcase.css').read_text())
    page.evaluate('''async ([mods, media]) => {
       const [player, showcase, core, theme, ui, extensions] = await Promise.all([
         import(mods.player), import(mods.showcase), import(mods.core), import(mods.theme), import(mods.ui), import(mods.extensions)
       ]);
       window.modules = { player, showcase, core, theme, ui, extensions };
       const bytes = Uint8Array.from(atob(media), c=>c.charCodeAt(0));
       window.mediaUrl = URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));
       window.spy={mounted:0,unmounted:0};
       window.ex={id:'extra-play',mount(ctx){
           window.spy.mounted++;
           const control=document.createElement('button');
           control.type='button';control.textContent='Custom Play';control.className='custom-play';
           control.addEventListener('click',()=>void ctx.controller.play());
           ctx.append('toolbar-end',control);
           return ()=>window.spy.unmounted++;
       }};
       window.p=player.mountPlayer('#player',{source:{src:window.mediaUrl},theme:'dark',themeTokens:{accent:'#f97316',focusRing:'#adfffb'},extensions:[window.ex]});
       window.s=showcase.mountShowcase('#showcase',{source:{src:window.mediaUrl},theme:'light',poster:'',presentation:{frame:'browser'},
          extensions:[{id:'watermark',mount(ctx){const e=document.createElement('span');e.className='watermark';e.textContent='KINEOX DEMO';
           e.style.cssText='position:absolute;left:15px;top:55px;z-index:3;padding:6px;background:#0c0c0ca0;color:white';
           ctx.append('overlay',e);}}]});
       document.querySelector('#borrow').setAttribute('data-kx-theme','light');
       document.querySelector('#borrow').style.setProperty('--kx-accent','#cafeee');
       window.c=core.createKineox(document.querySelector('#borrow video'));
       window.borrowed=player.mountPlayer('#borrow',{controller:window.c,theme:'minimal',themeTokens:{accent:'#abcabc'}});
       window.behavior=extensions.createKineoxBehaviorHost(window.c);
       window.behavior.use({id:'telemetry',setup(controller){window.behaviorMounted=true;return ()=>window.behaviorDisposed=true;}});
    }''',[modules,media])
    assert page.locator('.custom-play').count()==1
    assert page.locator('.watermark').count()==1
    assert page.evaluate("getComputedStyle(document.querySelector('#player .kx-player__seek')).accentColor")=='rgb(249, 115, 22)'
    assert page.evaluate("document.querySelector('#borrow').style.getPropertyValue('--kx-accent')")=='#abcabc'
    assert page.evaluate("window.behaviorMounted") is True
    page.locator('.custom-play').click()
    page.wait_for_function('window.p.controller.getSnapshot().status === "playing"',timeout=8000)
    print('CUSTOM CONTROL PLAY + SEMANTIC COLOR TOKENS PASS')
    page.evaluate('window.p.setTheme("minimal"); window.p.setThemeTokens({accent:"#00ffad",radius:"14px"})')
    assert page.evaluate("getComputedStyle(document.querySelector('#player .kx-player__seek')).accentColor")=='rgb(0, 255, 173)'
    assert page.evaluate("window.p.element.dataset.kxTheme")=='minimal'
    page.screenshot(path=str(ROOT/'m4-customization-preview.png'),full_page=True)
    print('DYNAMIC THEME + CHROMIUM CSS PASS')
    page.evaluate('''() => {
      window.unmountDynamic=window.p.use({id:'dynamic',mount(ctx){
        const button=document.createElement('button');button.textContent='Added at runtime';button.className='dynamic-control';
        ctx.append('toolbar-start',button);return ()=>{window.dynamicDisposed=true;};
      }});
    }''')
    assert page.locator('.dynamic-control').count()==1
    page.evaluate('window.unmountDynamic(); window.unmountDynamic()')
    assert page.locator('.dynamic-control').count()==0
    assert page.evaluate('window.dynamicDisposed') is True
    print('DYNAMIC EXTENSION MOUNT/REMOVE PASS')
    page.evaluate('window.borrowed.destroy()')
    assert page.evaluate("document.querySelector('#borrow').getAttribute('data-kx-theme')")=='light'
    assert page.evaluate("document.querySelector('#borrow').style.getPropertyValue('--kx-accent')")=='#cafeee'
    assert page.evaluate("window.c.getSnapshot() !== null") is True
    print('BORROWED PLAYER CSS/DOM OWNERSHIP RESTORATION PASS')
    page.evaluate('window.c.destroy()')
    assert page.evaluate('window.behaviorDisposed') is True
    page.evaluate('window.p.destroy();window.s.destroy()')
    assert page.locator('.custom-play').count()==0
    assert page.locator('.watermark').count()==0
    assert page.evaluate('window.spy.unmounted')==1
    assert not errors, errors
    print('M4 CHROMIUM PASS — dynamic semantic CSS, custom controls, lifecycle, owner restoration; zero JS errors')
    browser.close()
