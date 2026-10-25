"""RC2: video chrome auto-hide and Showcase poster interaction.
Requires Python Playwright and Chromium. Run after `npm run build`.
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
    def replace(match):
        return match.group(1) + '"' + jsurl((path.parent / match.group(2)).resolve()) + '"'
    body = re.sub(r'''(from\s+|import\s+)["'](\.{1,2}/[^"']+\.js)["']''', replace, body)
    return 'data:text/javascript;base64,' + base64.b64encode(body.encode()).decode()

entries = [jsurl(DIST / f'{name}/index.js') for name in ('player', 'showcase')]
media = base64.b64encode((ROOT / 'tests/assets/short.mp4').read_bytes()).decode()

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, **chromium_options(), args=[
        '--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(viewport={'width': 1100, 'height': 850})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content('''<!doctype html><html><body style="background:#131927">
      <div id="p" style="width:550px"></div>
      <div id="persistent" style="width:550px"></div>
      <div id="s" style="width:550px"></div>
      <div id="legacy" style="width:550px"></div>
    </body></html>''')
    page.add_style_tag(content=(DIST / 'styles/player.css').read_text())
    page.add_style_tag(content=(DIST / 'styles/showcase.css').read_text())
    page.evaluate('''async ({entries,media}) => {
      const [player,showcase] = await Promise.all(entries.map(s => import(s)));
      window.kx = {player,showcase};
      window.clip = URL.createObjectURL(new Blob([Uint8Array.from(atob(media), c => c.charCodeAt(0))], {type:'video/mp4'}));
      window.source = {src:clip, type:'video/mp4'};
    }''', {'entries': entries, 'media': media})

    page.evaluate('''() => {
      window.p = kx.player.mountPlayer('#p', {source, muted:true, interaction:{controls:'auto',idleDelayMs:150}});
      window.persistent = kx.player.mountPlayer('#persistent', {source,muted:true,interaction:{controls:'always',idleDelayMs:150}});
    }''')
    page.evaluate('p.controller.play()')
    page.wait_for_function("p.element.dataset.kxPlaying === 'true'", timeout=7000)
    page.wait_for_function("p.element.dataset.kxControls === 'hidden'", timeout=4000)
    page.wait_for_function("getComputedStyle(document.querySelector('#p .kx-player__controls')).visibility === 'hidden'",timeout=4000)
    print('PASS: player controls fade after inactivity while playing')
    page.evaluate("p.element.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse'}))")
    assert page.evaluate("p.element.dataset.kxControls === 'visible'")
    page.wait_for_function("p.element.dataset.kxControls === 'hidden'", timeout=4000)
    print('PASS: moving pointer wakes controls; stationary pointer auto-hides again')
    page.evaluate('p.controller.pause()')
    assert page.evaluate("p.element.dataset.kxControls === 'visible'")
    page.evaluate("document.querySelector('#p .kx-player').focus()")
    page.keyboard.press('Tab')
    assert page.evaluate("p.element.dataset.kxControls === 'visible'")
    print('PASS: paused and keyboard-focused player keeps controls visible')
    page.evaluate('persistent.controller.play()')
    page.wait_for_function("persistent.element.dataset.kxPlaying === 'true'", timeout=7000)
    page.wait_for_timeout(300)
    assert page.evaluate("persistent.element.dataset.kxControls === 'visible'")
    print('PASS: controls=always opts out of auto-hide')

    page.evaluate('''() => {
      window.s = kx.showcase.mountShowcase('#s', {
        source, presentation:{frame:'borderless'},
        interaction:{posterClick:'play',controls:'auto',idleDelayMs:150},
        expand:{enabled:true,autoplay:false}
      });
      window.legacy = kx.showcase.mountShowcase('#legacy', {
        source, presentation:{frame:'none'}, expand:{enabled:true,autoplay:false}
      });
    }''')
    page.click('#s .kx-showcase__poster')
    page.wait_for_function("s.element.dataset.kxPlaying === 'true'", timeout=7000)
    assert page.evaluate("!s.expanded && s.video.paused === false")
    page.click('#s .kx-showcase__inline-sound')
    assert page.evaluate('s.video.muted === false')
    print('PASS: inline playback exposes a mute/unmute control')
    page.wait_for_function("s.element.dataset.kxControls === 'hidden'", timeout=4000)
    print('PASS: borderless poster can play inline; top actions auto-hide')
    page.evaluate("s.element.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse'}))")
    assert page.evaluate("s.element.dataset.kxControls === 'visible'")
    page.click('#s .kx-showcase__open')
    assert page.evaluate('s.expanded')
    page.wait_for_function("s.element.dataset.kxControls === 'hidden'", timeout=4000)
    page.wait_for_function("getComputedStyle(document.querySelector('#s .kx-showcase__expanded-controls')).visibility === 'hidden'",timeout=4000)
    page.keyboard.press('Tab')
    assert page.evaluate("s.element.dataset.kxControls === 'visible'")
    print('PASS: expanded playback controls auto-hide, Tab reveals them')
    page.keyboard.press('Escape')
    assert page.evaluate('!s.expanded')
    page.click('#legacy .kx-showcase__poster')
    assert page.evaluate('legacy.expanded')
    page.keyboard.press('Escape')
    print('PASS: legacy default poster click still expands')
    page.evaluate('p.destroy();persistent.destroy();s.destroy();legacy.destroy();URL.revokeObjectURL(clip)')
    assert not errors, errors
    browser.close()
    print('KINEOX RC2 CHROMIUM: PASS — auto controls and independent poster activation')
