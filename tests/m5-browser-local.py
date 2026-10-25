"""M5 Chromium reliability regression: real DOM/media, framework-free.
Requires Python Playwright and local Chromium; no HTTP server or network.
"""
import base64
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import chromium_options

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'

def jsurl(path):
    body = path.read_text()
    def repl(match):
        return match.group(1) + '"' + jsurl((path.parent / match.group(2)).resolve()) + '"'
    body = re.sub(r'''(from\s+|import\s+)["'](\.{1,2}/[^"']+\.js)["']''', repl, body)
    return 'data:text/javascript;base64,' + base64.b64encode(body.encode()).decode()

showcase_module = jsurl(DIST / 'showcase/index.js')
core_module = jsurl(DIST / 'core/index.js')
player_module = jsurl(DIST / 'player/index.js')
media = base64.b64encode((ROOT / 'tests/assets/short.mp4').read_bytes()).decode()

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, **chromium_options(), args=['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(viewport={'width': 1100, 'height': 760})
    errors=[]
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content('''<!doctype html><html lang="en"><body style="margin:0;padding:20px;background:#15171c;color:white">
      <button id="before">Before</button>
      <div id="borrow"><video controls muted></video><p id="retain">Permanent content</p></div>
      <div id="second"><video controls></video><span id="stay">Keep</span></div>
      <div id="ambient"></div><div id="stress"></div><div id="player"></div>
      <button id="after">After</button></body></html>''')
    page.add_style_tag(content=(DIST / 'styles/showcase.css').read_text())
    page.add_style_tag(content=(DIST / 'styles/player.css').read_text())
    page.evaluate('''async ([showcase, core, player, media]) => {
      window.showcaseLib = await import(showcase);
      window.coreLib = await import(core);
      window.playerLib = await import(player);
      window.mp4 = URL.createObjectURL(new Blob([Uint8Array.from(atob(media), c => c.charCodeAt(0))],{type:'video/mp4'}));
    }''', [showcase_module, core_module, player_module, media])

    page.evaluate('''() => {
      const el = document.querySelector('#borrow video');
      el.src = window.mp4; el.muted = false; el.loop = false;
      window.c1 = coreLib.createKineox(el);
      window.s1 = showcaseLib.mountShowcase('#borrow', {controller:c1,expand:{autoplay:false}});
    }''')
    page.evaluate('c1.destroy()')
    result = page.evaluate('''() => ({root: document.querySelector('#borrow').classList.contains('kx-showcase'),
      original: document.querySelector('#retain') !== null, buttons: document.querySelectorAll('#borrow button').length,
      muted: document.querySelector('#borrow video').muted, loop: document.querySelector('#borrow video').loop})''')
    assert result == {'root':False, 'original':True, 'buttons':0, 'muted':False, 'loop':False}, result
    print('EXTERNAL CONTROLLER DESTROY: BORROWED RESTORATION PASS')

    page.locator('#before').focus()
    page.evaluate('''() => {
      const el = document.querySelector('#second video'); el.src = window.mp4;
      window.c2 = coreLib.createKineox(el);
      window.s2 = showcaseLib.mountShowcase('#second', {controller:c2,expand:{autoplay:false}});
    }''')
    page.locator('#second .kx-showcase__open').click()
    page.wait_for_function('s2.expanded')
    assert page.evaluate('document.body.style.overflow === "hidden" && document.querySelector("#after").inert')
    page.evaluate('c2.destroy()')
    result = page.evaluate('''() => ({closed: !s2.expanded, overflow: document.body.style.overflow,
      inert: document.querySelector('#after').inert, role: document.querySelector('#second').getAttribute('role'),
      buttons: document.querySelectorAll('#second button').length, focus: document.activeElement.id})''')
    assert result == {'closed':True,'overflow':'','inert':False,'role':None,'buttons':0,'focus':''}, result
    print('EXTERNAL CONTROLLER DESTROY: MODAL, FOCUS, SCROLL & INERT CLEANUP PASS')

    page.emulate_media(reduced_motion='reduce')
    page.evaluate('''() => {
      window.IntersectionObserver=class {
        constructor(callback) {this.callback=callback; window.currentObserver=this;}
        observe(target) {this.target=target;}
        disconnect() {this.disconnected=true;}
        fire(value) {this.callback([{target:this.target,isIntersecting:value}]);}
      };
      window.ambient = showcaseLib.mountShowcase('#ambient', {mode:'ambient',source:{src:mp4}, poster:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'});
      currentObserver.fire(true);
    }''')
    page.wait_for_timeout(80)
    props = page.evaluate('''() => ({src:ambient.video.getAttribute('src'),poster: getComputedStyle(document.querySelector('#ambient .kx-showcase__poster')).display,
      fallback:document.querySelector('#ambient .kx-showcase__poster').getAttribute('aria-hidden'),
      tabbable:document.querySelector('#ambient .kx-showcase__poster').tabIndex})''')
    assert props == {'src':None,'poster':'grid','fallback':'true','tabbable':-1}, props
    print('REDUCED MOTION / AMBIENT POSTER FALLBACK PASS')
    page.emulate_media(reduced_motion='no-preference')
    page.wait_for_function("ambient.controller.getSnapshot().status === 'playing'",timeout=8000)
    page.emulate_media(reduced_motion='reduce')
    page.wait_for_function("ambient.controller.getSnapshot().paused === true",timeout=8000)
    assert page.evaluate("getComputedStyle(document.querySelector('#ambient .kx-showcase__poster')).display")=='grid'
    page.evaluate('ambient.destroy()')
    assert page.evaluate('currentObserver.disconnected') is True
    print('DYNAMIC REDUCED MOTION CHANGE HALTS / RESUMES PREVIEW PASS')

    # M5 repeated mount/unmount and extension cleanup under real browser DOM.
    stress = page.evaluate('''async () => {
      let extensionCleanups = 0;
      for (let i=0; i<60; i++) {
        const s=showcaseLib.mountShowcase('#stress', {source:{src:mp4},extensions:[{
          id:'stress', mount(ctx){ const node=document.createElement('span'); node.className='stress-node';ctx.append('actions',node);return ()=>{extensionCleanups++;}; }
        }]});
        s.destroy();
        if (document.querySelector('#stress').childElementCount) throw Error('Leaked showcase child');
      }
      for (let i=0;i<60;i++) {
        const player=playerLib.mountPlayer('#player', {source:{src:mp4}});
        player.destroy();
        if (document.querySelector('#player').childElementCount) throw Error('Leaked player child');
      }
      return {extensionCleanups,stressNodes:document.querySelectorAll('.stress-node').length,
        showcases:document.querySelectorAll('.kx-showcase').length,players:document.querySelectorAll('.kx-player').length};
    }''')
    assert stress=={'extensionCleanups':60,'stressNodes':0,'showcases':0,'players':0},stress
    print('120 REAL DOM MOUNT / UNMOUNT CYCLES PASS')
    page.evaluate('(css) => { window.kxShowcaseCss=css; }', (DIST / 'styles/showcase.css').read_text())
    iframe = page.evaluate('''async () => {
      const frame=document.createElement('iframe');
      frame.srcdoc='<html><body><button id="before">Before</button><div id="p"><video></video></div><div id="s"><video></video></div><button id="after">After</button></body></html>';
      document.body.append(frame);
      await new Promise(resolve => frame.addEventListener('load',resolve,{once:true}));
      const d=frame.contentDocument;
      const css=document.createElement('style');css.textContent=window.kxShowcaseCss;
      d.head.append(css);
      const pv=d.querySelector('#p video');pv.src=mp4;
      const pc=coreLib.createKineox(pv);
      const player=playerLib.mountPlayer(d.querySelector('#p'),{controller:pc});
      const input=d.createElement('input');input.type='text';player.element.append(input);
      input.focus();
      const beforePlay=pv.paused;
      input.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', {key:'k',bubbles:true}));
      const textInputIgnored=pv.paused===beforePlay;
      player.destroy();pc.destroy();input.remove();
      const sv=d.querySelector('#s video');sv.src=mp4;
      const sc=coreLib.createKineox(sv);
      const showcase=showcaseLib.mountShowcase(d.querySelector('#s'),{controller:sc,expand:{autoplay:false}});
      const trigger=d.querySelector('#s .kx-showcase__open');trigger.focus();
      await showcase.expand();
      const topLayer=showcase.expanded && d.querySelector('#after').inert;
      showcase.collapse();
      const focusRestored=d.activeElement===trigger;
      const inertRestored=!d.querySelector('#after').inert;
      showcase.destroy();sc.destroy();frame.remove();
      return {textInputIgnored,topLayer,focusRestored,inertRestored};
    }''')
    assert iframe=={'textInputIgnored':True,'topLayer':True,'focusRestored':True,'inertRestored':True},iframe
    print('SAME-ORIGIN IFRAME VIDEO / INPUT KEYBOARD / DIALOG FOCUS PASS')
    page.evaluate('URL.revokeObjectURL(mp4)')
    assert not errors, errors
    print('M5 CHROMIUM PASS — borrowed lifecycle, reduced-motion changes, ambient fallback, 120 UI cycles; no page errors')
    browser.close()
