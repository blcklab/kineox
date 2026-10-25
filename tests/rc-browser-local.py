"""RC1: verify media teardown ownership against actual Chromium HTMLVideoElement.
Run after npm run build; requires Python Playwright + Chromium.
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

entries = [jsurl(DIST / f'{mod}/index.js') for mod in ('core', 'player', 'showcase')]
media = base64.b64encode((ROOT / 'tests/assets/short.mp4').read_bytes()).decode()

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, **chromium_options(),
        args=['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(viewport={'width': 1100, 'height': 740})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content('''<!doctype html><html lang="en"><body>
      <div id="owned-player"></div><div id="borrowed-player"><video playsinline></video></div>
      <div id="owned-showcase"></div><div id="borrowed-showcase"><video playsinline></video></div>
      <div id="transferred"><video playsinline></video></div>
      <div id="external"><video playsinline></video></div>
    </body></html>''')
    page.add_style_tag(content=(DIST / 'styles/player.css').read_text())
    page.add_style_tag(content=(DIST / 'styles/showcase.css').read_text())
    page.evaluate('''async ({entries,media}) => {
      const [core,player,showcase] = await Promise.all(entries.map(s => import(s)));
      window.kx = {core,player,showcase};
      window.url=URL.createObjectURL(new Blob([Uint8Array.from(atob(media), c=>c.charCodeAt(0))],{type:'video/mp4'}));
      window.source={src:window.url,type:'video/mp4'};
    }''', {'entries': entries, 'media': media})

    # Owned Player: actual playback MUST stop even after its DOM node is removed.
    page.evaluate('''() => {
      window.ownedPlayer=kx.player.mountPlayer('#owned-player',{source,muted:true});
      window.ownedPlayerVideo=ownedPlayer.video;
    }''')
    page.evaluate('ownedPlayer.controller.play()')
    page.wait_for_function('ownedPlayerVideo.paused === false',timeout=8000)
    page.evaluate('ownedPlayer.destroy()')
    result=page.evaluate('''() => ({paused:ownedPlayerVideo.paused,connected:ownedPlayerVideo.isConnected,
      empty:document.querySelector('#owned-player').childElementCount===0,
      destroyed:(() => {try {ownedPlayer.controller.pause();return false;} catch(e) {return e.code==='KINEOX_DESTROYED';}})()})''')
    assert result=={'paused':True,'connected':False,'empty':True,'destroyed':True},result
    print('OWNED PLAYER PASS — stops active playback before removing its video')

    # Borrowed Player: detaching a presentation must NOT shut down caller-owned playback.
    page.evaluate('''() => {
      const video=document.querySelector('#borrowed-player video'); video.src=url;video.muted=true;
      window.bpCore=kx.core.createKineox(video);
      window.borrowedPlayer=kx.player.mountPlayer('#borrowed-player',{controller:bpCore});
    }''')
    page.evaluate('bpCore.play()')
    page.wait_for_function('bpCore.element.paused===false',timeout=8000)
    page.evaluate('borrowedPlayer.destroy()')
    result=page.evaluate('''() => ({playing:!bpCore.element.paused,
      stillConnected:bpCore.element.isConnected,alive:bpCore.getSnapshot().status!=='destroyed',
      controlsGone:document.querySelectorAll('#borrowed-player .kx-player__controls').length===0})''')
    assert result=={'playing':True,'stillConnected':True,'alive':True,'controlsGone':True},result
    page.evaluate('bpCore.pause(); bpCore.destroy()')
    print('BORROWED PLAYER PASS — caller media keeps playing and DOM is restored')

    # Owned Showcase manual playback previously left a detached video playing.
    page.evaluate('''() => {
      window.ownedShowcase=kx.showcase.mountShowcase('#owned-showcase',{source,expand:{enabled:false}});
      window.ownedShowcaseVideo=ownedShowcase.video;
    }''')
    page.evaluate('ownedShowcase.play()')
    page.wait_for_function('ownedShowcaseVideo.paused===false',timeout=8000)
    page.evaluate('ownedShowcase.destroy()')
    result=page.evaluate('''() => ({paused:ownedShowcaseVideo.paused,
      connected:ownedShowcaseVideo.isConnected,
      empty:document.querySelector('#owned-showcase').childElementCount===0,
      destroyed:(() => {try {ownedShowcase.controller.pause();return false;} catch(e) {return e.code==='KINEOX_DESTROYED';}})()})''')
    assert result=={'paused':True,'connected':False,'empty':True,'destroyed':True},result
    print('OWNED SHOWCASE PASS — manual playback pauses before teardown')

    # Borrowed manual Showcase playback should not be interrupted on unmount.
    page.evaluate('''() => {
      const video=document.querySelector('#borrowed-showcase video');video.src=url;
      window.bsCore=kx.core.createKineox(video);
      window.borrowedShowcase=kx.showcase.mountShowcase('#borrowed-showcase',
        {controller:bsCore,expand:{enabled:false}});
    }''')
    page.evaluate('borrowedShowcase.play()')
    page.wait_for_function('bsCore.element.paused===false',timeout=8000)
    page.evaluate('borrowedShowcase.destroy()')
    result=page.evaluate('''() => ({playing:!bsCore.element.paused,
      stillConnected:bsCore.element.isConnected,
      alive:bsCore.getSnapshot().status!=='destroyed',
      controlsGone:document.querySelectorAll('#borrowed-showcase .kx-showcase__controls').length===0,
      noClass:!document.querySelector('#borrowed-showcase').classList.contains('kx-showcase')})''')
    assert result=={'playing':True,'stillConnected':True,'alive':True,'controlsGone':True,'noClass':True},result
    page.evaluate('bsCore.pause();bsCore.destroy()')
    print('BORROWED SHOWCASE PASS — manual media keeps playing and DOM is restored')

    # Explicit ownership-transfer semantics for injected controllers.
    page.evaluate('''() => {
      const video=document.querySelector('#transferred video');video.src=url;
      window.trCore=kx.core.createKineox(video);
      window.transferred=kx.player.mountPlayer('#transferred',
        {controller:trCore,destroyControllerOnUnmount:true});
    }''')
    page.evaluate('trCore.play()')
    page.wait_for_function('trCore.element.paused===false',timeout=8000)
    page.evaluate('transferred.destroy()')
    assert page.evaluate("trCore.element.paused && (()=>{try{trCore.pause();return false;}catch(e){return e.code==='KINEOX_DESTROYED';}})()")
    print('EXPLICIT OWNERSHIP PASS — transferred controller stops on unmount')

    # Externally destroying a borrowed controller tears down the view without throwing.
    page.evaluate('''() => {
      const video=document.querySelector('#external video');video.src=url;
      window.extCore=kx.core.createKineox(video);
      window.extShowcase=kx.showcase.mountShowcase('#external',{controller:extCore});
      extCore.destroy();
    }''')
    assert page.evaluate('''() => !document.querySelector('#external').classList.contains('kx-showcase') &&
      document.querySelector('#external video')!==null''')
    page.evaluate('URL.revokeObjectURL(url)')
    assert not errors,errors
    browser.close()
    print('KINEOX RC1 CHROMIUM: PASS — actual media ownership, playing teardown, transferred and external lifecycle')
