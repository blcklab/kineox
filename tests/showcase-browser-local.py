"""M3 Playwright Chromium smoke test without an HTTP server.
Requires playwright Python and Chromium. Run after npm run build.
"""
import base64
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import chromium_options

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'

def jsurl(path):
    source = path.read_text()
    def resolve_import(match):
        return match.group(1) + '"' + jsurl((path.parent / match.group(2)).resolve()) + '"'
    source = re.sub(r'''(from\s+|import\s+)["'](\.{1,2}/[^"']+\.js)["']''', resolve_import, source)
    return 'data:text/javascript;base64,' + base64.b64encode(source.encode()).decode()

m3 = jsurl(DIST / 'showcase/index.js')
core = jsurl(DIST / 'core/index.js')
media = base64.b64encode((ROOT / 'tests/assets/short.mp4').read_bytes()).decode()
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, **chromium_options(), args=['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(viewport={'width':1280, 'height':900})
    problems=[]
    page.on('pageerror',lambda error: problems.append(str(error)))
    page.set_content('''<!doctype html><html><body style="padding:40px;margin:0;font-family:system-ui;background:#0a0d14;color:white">
       <h1>KINEOX / SHOWCASE</h1><div id="one" style="max-width:850px"></div><button id="outside">Outside focus</button>
       <div id="two" style="max-width:600px"></div><div id="borrow"><video></video><p id="permanent">Permanent sibling</p></div></body></html>''')
    page.add_style_tag(content=(DIST / 'styles/showcase.css').read_text())
    page.evaluate('''async ([entry, media]) => {
      const {mountShowcase} = await import(entry);
      window.mountShowcase = mountShowcase;
      const b = Uint8Array.from(atob(media),ch => ch.charCodeAt(0));
      window.url = URL.createObjectURL(new Blob([b], {type:'video/mp4'}));
      window.main = mountShowcase('#one', {source:{src:window.url,type:'video/mp4'}, title:'Anyo world', poster:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450"%3E%3Crect width="800" height="450" fill="%23262c43"/%3E%3Ctext x="120" y="240" fill="white" font-size="54" font-family="sans-serif"%3EKINEOX%3C/text%3E%3C/svg%3E', presentation:{frame:'browser',aspectRatio:'16/9'}});
    }''',[m3,media])
    assert page.evaluate('''() => ({src:main.video.getAttribute('src'),playing:main.expanded,count:document.querySelectorAll('#one video').length})''') == {'src':None,'playing':False,'count':1}, 'Poster-first must not load video'
    print('POSTER-FIRST PASS')
    page.screenshot(path=str(ROOT/'showcase-desktop-preview.png'))
    page.locator('#one .kx-showcase__open').click()
    page.wait_for_function('window.main.expanded && main.controller.getSnapshot().duration !== null', timeout=10000)
    page.wait_for_timeout(200)
    expanded_state=page.evaluate('''() => ({isExpanded:main.expanded,isSame:main.video===document.querySelector('#one video'), videoCount:document.querySelectorAll('#one video').length,src:main.video.getAttribute('src')!==null, popover:main.element.matches(':popover-open'),role:main.element.getAttribute('role'),inert:document.querySelector('#outside').inert,scroll:document.body.style.overflow})''')
    assert expanded_state == {'isExpanded':True,'isSame':True,'videoCount':1,'src':True,'popover':True,'role':'dialog','inert':True,'scroll':'hidden'}, expanded_state
    print('SAME VIDEO / TOP LAYER / INERT PASS')
    page.get_by_role('button',name='Unmute video').click()
    assert page.evaluate('main.video.muted') is False
    page.get_by_role('button',name='Mute video').click()
    assert page.evaluate('main.video.muted') is True
    print('EXPANDED VOLUME PASS')
    page.locator('#one .kx-showcase__seek').fill('350')
    assert page.evaluate('main.video.currentTime') > 0
    print('EXPANDED SEEK PASS')
    page.keyboard.press('Escape')
    assert page.evaluate('''() => !main.expanded && main.element.getAttribute('role')==='region' && !document.querySelector('#outside').inert && !document.body.style.overflow && !main.element.hasAttribute('popover')''')
    assert page.evaluate("document.activeElement.classList.contains('kx-showcase__open')")
    print('ESCAPE CLOSE / FOCUS / SCROLL RESTORE PASS')
    page.evaluate('''() => {
      window.hovered = mountShowcase('#two',{source:{src:window.url, type:'video/mp4'}, preview:{mode:'hover'}, presentation:{frame:'floating'}});
    }''')
    page.locator('#two .kx-showcase').dispatch_event('pointerenter',{'pointerType':'mouse'})
    page.wait_for_function("window.hovered.video.getAttribute('src')!==null",timeout=8000)
    page.wait_for_function("window.hovered.controller.getSnapshot().status==='playing'",timeout=8000)
    assert page.evaluate('hovered.video.muted && hovered.video.loop')
    page.locator('#two .kx-showcase').dispatch_event('pointerleave',{'pointerType':'mouse'})
    page.wait_for_function('hovered.controller.getSnapshot().paused',timeout=4000)
    print('HOVER PREVIEW / PAUSE ON EXIT PASS')
    page.evaluate('''async (src) => {
      const {createKineox} = await import(src);
      const v=document.querySelector('#borrow video');v.src=window.url;
      v.controls=true;v.muted=false;v.loop=false;
      window.borrowedController=createKineox(v);
      window.borrowed=mountShowcase('#borrow',{controller:borrowedController, presentation:{frame:'none'}, expand:{autoplay:false}});
    }''',core)
    assert page.evaluate('borrowed.video===document.querySelector("#borrow video")')
    page.evaluate('borrowed.destroy()')
    borrowed_state=page.evaluate('''() => ({video:!!document.querySelector('#borrow video'),html:!!document.querySelector('#permanent'),buttons:document.querySelectorAll('#borrow .kx-showcase__button').length,alive:!!borrowedController.getSnapshot(),controls:document.querySelector('#borrow video').controls,muted:document.querySelector('#borrow video').muted,loop:document.querySelector('#borrow video').loop})''')
    assert borrowed_state == {'video':True,'html':True,'buttons':0,'alive':True,'controls':True,'muted':False,'loop':False}, borrowed_state
    print('BORROWED CONTROLLER & DOM RESTORED PASS')
    page.evaluate('''() => { main.destroy(); hovered.destroy(); borrowedController.destroy(); }''')
    assert page.evaluate('document.querySelectorAll(".kx-showcase").length') == 0
    page.set_viewport_size({'width':390,'height':844})
    page.evaluate('''() => { window.mobile = mountShowcase('#one', {source:{src:window.url},title:'Mobile preview', presentation:{frame:'device'}}); }''')
    page.screenshot(path=str(ROOT/'showcase-mobile-preview.png'),full_page=True)
    page.locator('#one .kx-showcase__open').click()
    page.wait_for_function('mobile.expanded')
    page.get_by_role('button',name='Close expanded video').click()
    assert page.evaluate('!mobile.expanded')
    page.evaluate('mobile.destroy()')
    # Simulated IntersectionObserver lets us test viewport previews without scrolling
    # or relying on an external media server.
    page.evaluate('''() => {
      window.IntersectionObserver = class {
        constructor(callback) { this.callback=callback; window.observer=this; }
        observe(target) { this.target=target; }
        disconnect() { this.disconnected=true; }
        fire(visible) { this.callback([{target:this.target,isIntersecting:visible}]); }
      };
      window.ambient=mountShowcase('#two',{mode:'ambient',source:{src:window.url,type:'video/mp4'}});
    }''')
    assert page.evaluate('ambient.video.getAttribute("src")') is None
    assert page.evaluate('ambient.element.dataset.kxMode') == 'ambient'
    assert not page.locator('#two .kx-showcase__open').count()
    page.evaluate('window.observer.fire(true)')
    page.wait_for_function('ambient.controller.getSnapshot().status === "playing"',timeout=8000)
    page.evaluate('window.observer.fire(false)')
    page.wait_for_function('ambient.controller.getSnapshot().paused')
    page.evaluate('ambient.destroy()')
    assert page.evaluate('window.observer.disconnected') is True
    print('AMBIENT VIEWPORT PREVIEW / OBSERVER DISCONNECT PASS')
    page.emulate_media(reduced_motion='reduce')
    page.evaluate('''() => { window.reduced=mountShowcase('#two',{mode:'ambient',source:{src:window.url}}); }''')
    page.evaluate('window.observer.fire(true)')
    page.wait_for_timeout(50)
    assert page.evaluate('reduced.video.getAttribute("src")') is None
    page.evaluate('reduced.destroy()')
    page.emulate_media(reduced_motion='no-preference')
    print('REDUCED MOTION POSTER-ONLY PASS')
    page.evaluate('''() => {
      window.first=mountShowcase('#one',{source:{src:window.url},expand:{autoplay:false}});
      window.second=mountShowcase('#two',{source:{src:window.url},expand:{autoplay:false}});
    }''')
    page.evaluate('first.expand()')
    page.wait_for_function('first.expanded')
    page.evaluate('second.expand()')
    page.wait_for_function('second.expanded')
    assert page.evaluate('!first.expanded && second.expanded')
    page.evaluate('second.destroy();first.destroy()')
    assert page.evaluate('document.body.style.overflow === "" && !document.querySelector("#outside").inert')
    print('SINGLE ACTIVE OVERLAY / REENTRANT CLEANUP PASS')
    page.evaluate('URL.revokeObjectURL(window.url)')
    assert not problems, problems
    print('M3 CHROMIUM PASS — lazy poster, expanded same media, accessible overlay, controls, focus, hover, borrowed cleanup, mobile')
    browser.close()
