"""Kineox presentation regression: borderless survives playback + expansion.
Run after npm run build. Python Playwright + Chromium optional (npm run demo needs neither).
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

showcase_entry = jsurl(DIST / 'showcase/index.js')
player_entry = jsurl(DIST / 'player/index.js')
core_entry = jsurl(DIST / 'core/index.js')
media = base64.b64encode((ROOT / 'tests/assets/short.mp4').read_bytes()).decode()
poster = 'data:image/svg+xml;base64,' + base64.b64encode((ROOT / 'examples/showcase/poster.svg').read_bytes()).decode()

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, **chromium_options(), args=['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(viewport={'width': 1360, 'height': 1080})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content('''<!doctype html><html><body style="font:14px system-ui;background:#0c111c;color:white;margin:0;padding:24px">
      <h1>KINEOX • Presentations</h1><p>Frames on the left, plain borderless media on the right.</p>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px">
        <div><h2>Minimal</h2><div id="minimal"></div></div>
        <div><h2>Glass</h2><div id="glass"></div></div>
        <div><h2>Borderless</h2><div id="borderless"></div></div>
        <div><h2>Player</h2><div id="player"></div></div>
        <div><h2>Legacy none</h2><div id="legacy"></div></div>
        <div id="borrow"><video></video></div>
      </div><button id="outside">Focus target</button></body></html>''')
    page.add_style_tag(content=(DIST / 'styles/showcase.css').read_text())
    page.add_style_tag(content=(DIST / 'styles/player.css').read_text())
    page.evaluate('''([data,poster]) => {
      window.demoMedia=URL.createObjectURL(new Blob([Uint8Array.from(atob(data), c=>c.charCodeAt(0))], {type:'video/mp4'}));
      window.demoPoster=poster;
    }''', [media,poster])
    page.evaluate('''async ([entry,playerEntry,coreEntry])=>{
      const {mountShowcase}=await import(entry);
      const {mountPlayer}=await import(playerEntry);
      const {createKineox}=await import(coreEntry);
      const source={src:window.demoMedia,type:'video/mp4'};
      window.samples={};
      for (const frame of ['minimal','glass','borderless','none']) {
        const target=frame==='none'?'legacy':frame;
        window.samples[frame]=mountShowcase('#'+target,{source,poster:window.demoPoster, presentation:{frame,fit:'cover'},expand:{enabled:true,autoplay:true}});
      }
      window.player=mountPlayer('#player',{source,poster:window.demoPoster,appearance:'borderless'});
      const video=document.querySelector('#borrow video');video.src=window.demoMedia;
      window.borrowedController=createKineox(video);
      window.borrowedPlayer=mountPlayer('#borrow',{controller:borrowedController,appearance:'borderless'});
    }''', [showcase_entry,player_entry,core_entry])
    # Check CSS, not just the class attribute, for every presentation.
    check = '''(frame) => {
      const root=window.samples[frame].element;
      const style=getComputedStyle(root.querySelector('.kx-showcase__frame'));
      const vidStyle=getComputedStyle(window.samples[frame].video);
      return {border:style.borderTopWidth,shadow:style.boxShadow,radius:style.borderTopLeftRadius,chrome:getComputedStyle(root.querySelector('.kx-showcase__chrome')).display,fit:vidStyle.objectFit};
    }'''
    for frame in ['borderless','none']:
        value = page.evaluate(check, frame)
        assert value == {'border':'0px','shadow':'none','radius':'0px','chrome':'none','fit':'cover'}, (frame,value)
    minimal = page.evaluate(check,'minimal')
    glass = page.evaluate(check,'glass')
    assert minimal['chrome']=='none' and minimal['border']!='0px',minimal
    assert glass['chrome']=='none' and glass['shadow']!='none',glass
    assert page.evaluate('getComputedStyle(player.element).borderTopLeftRadius') == '0px'
    assert page.evaluate('player.element.dataset.kxAppearance') == 'borderless'
    print('INLINE STYLE PASS — none/borderless are truly frameless; minimal and glass are distinct')

    # Force actual media playback before expanded mode and check computed frame again.
    page.evaluate('samples.borderless.play()')
    page.wait_for_function("samples.borderless.controller.getSnapshot().status==='playing'",timeout=8000)
    value = page.evaluate(check,'borderless')
    assert value['border']=='0px' and value['radius']=='0px' and value['shadow']=='none',value
    video_count = page.locator('#borderless video').count()
    assert video_count==1
    print('PLAYING PASS — borderless stays borderless while playback is active')

    page.locator('#borderless .kx-showcase__open').click()
    page.wait_for_function('samples.borderless.expanded',timeout=8000)
    value = page.evaluate(check,'borderless')
    assert value['border']=='0px' and value['radius']=='0px' and value['shadow']=='none',value
    assert page.evaluate("samples.borderless.video===document.querySelector('#borderless video')")
    assert page.locator('#borderless .kx-showcase__expanded-controls button').count()>0
    assert page.locator('#borderless video').count()==video_count
    page.keyboard.press('Escape')
    assert page.evaluate('!samples.borderless.expanded')
    print('EXPANDED PASS — no border, rounded frame or shadow; same video and accessible controls')

    page.evaluate('samples.none.expand()')
    page.wait_for_function('samples.none.expanded',timeout=8000)
    legacy = page.evaluate(check,'none')
    assert legacy['border']=='0px' and legacy['radius']=='0px' and legacy['shadow']=='none',legacy
    page.keyboard.press('Escape')
    print('BACKWARD COMPAT PASS — legacy frame:none is borderless during expansion')

    # Verify Player borderless persists after video playback and borrowed DOM is restored.
    page.locator('#player .kx-player__play').click()
    page.wait_for_function("player.controller.getSnapshot().status==='playing'",timeout=8000)
    assert page.evaluate('getComputedStyle(player.element).borderTopLeftRadius')=='0px'
    page.evaluate('borrowedPlayer.destroy()')
    assert page.evaluate("!document.querySelector('#borrow').hasAttribute('data-kx-appearance')")
    assert page.evaluate('borrowedController.getSnapshot().status!=="destroyed"')
    print('PLAYER PASS — borderless while playing, borrowed appearance restored on destroy')

    page.screenshot(path=str(ROOT/'presentation-presets-desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(ROOT/'presentation-presets-mobile.png'),full_page=True)
    page.evaluate('''() => {
      for (const item of Object.values(samples)) item.destroy();
      player.destroy();borrowedController.destroy();URL.revokeObjectURL(window.demoMedia);
    }''')
    assert not errors,errors
    browser.close()
    print('M6 PRESENTATION CHROMIUM: PASS — CSS, playback, expansion, legacy, borrowed cleanup, mobile')
