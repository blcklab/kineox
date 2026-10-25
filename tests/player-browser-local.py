"""Developer-only browser integration harness for environments with Python Playwright.
No web server required; imports built ESM through data URLs.
Usage: python tests/player-browser-local.py
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
        spec=match.group(2)
        return match.group(1)+'"'+jsurl((path.parent/spec).resolve())+'"'
    body=re.sub(r'''(from\s+|import\s+)[\"'](\.{1,2}/[^\"']+\.js)[\"']''',repl,body)
    return 'data:text/javascript;base64,' + base64.b64encode(body.encode()).decode()

M2URL=jsurl(DIST/'player/index.js')
M1URL=jsurl(DIST/'core/index.js')
media_b64=base64.b64encode((ROOT/'tests/assets/short.mp4').read_bytes()).decode()
with sync_playwright() as pw:
    b=pw.chromium.launch(headless=True, **chromium_options(),args=['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'])
    page=b.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror',lambda err: errors.append(str(err)))
    page.set_content('''<!doctype html><html><body style="background:#10151f;color:white;margin:0;padding:48px;font-family:system-ui"><h1>KINEOX / PLAYER</h1><div style="width:900px;max-width:95vw" id="demo"></div><div id="borrow"><video src=""></video></div><input id="external" aria-label="Outside field"></body></html>''')
    page.add_style_tag(content=(DIST/'styles/player.css').read_text())
    page.evaluate('''async ([src, media]) => {
      const { mountPlayer } = await import(src);
      window.mountPlayer = mountPlayer;
      const binary = atob(media); const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      window.mediaUrl = URL.createObjectURL(new Blob([bytes], {type:'video/mp4'}));
      const vtt = 'WEBVTT\\n\\n00:00:00.000 --> 00:00:01.200\\nHello Kineox\\n';
      window.trackUrl = URL.createObjectURL(new Blob([vtt], {type:'text/vtt'}));
      window.player = mountPlayer('#demo', {
        source: {src: window.mediaUrl,type:'video/mp4'},
        title:'Kineox demo', captions:[{ src: window.trackUrl, srclang:'en', label:'English' }]
      });
    }''',[M2URL, media_b64])
    page.wait_for_function('window.player.controller.getSnapshot().duration !== null',timeout=8000)
    ready=page.evaluate('({status:window.player.controller.getSnapshot().status,duration:window.player.video.duration,captions:document.querySelector(".kx-player__captions").options.length})')
    assert ready['duration'] > 0 and ready['captions'] == 2, ready
    print('READY',ready)
    page.screenshot(path=str(ROOT/'player-desktop-preview.png'))
    page.get_by_role('button',name='Play video').first.click()
    page.wait_for_timeout(200)
    assert page.evaluate('window.player.controller.getSnapshot().status') == 'playing'
    print('PLAY passed')
    page.get_by_role('button',name='Pause video').first.click()
    page.get_by_role('combobox',name='Playback speed').select_option('1.5')
    assert page.evaluate('window.player.video.playbackRate') == 1.5
    print('SPEED passed')
    page.get_by_role('combobox',name='Captions').select_option('0')
    assert page.evaluate('window.player.video.textTracks[0].mode') == 'showing'
    print('CAPTION passed')
    page.locator('.kx-player').focus()
    page.keyboard.press('m')
    assert page.evaluate('window.player.video.muted') is True
    print('MUTED passed')
    page.keyboard.press('m')
    assert page.evaluate('window.player.video.muted') is False
    print('UNMUTED passed')
    page.keyboard.press('ArrowRight')
    assert page.evaluate('window.player.video.currentTime') > 0
    print('KEYBOARD SEEK passed')
    # Borrowed controller must not be destroyed or moved.
    page.evaluate('''async (src) => {
      const {createKineox}=await import(src);
      const video = document.querySelector('#borrow video');
      video.src = window.mediaUrl;
      window.borrowed = createKineox(video);
      window.borrowedView = window.mountPlayer('#borrow', {controller:window.borrowed, theme:'light'});
    }''',M1URL)
    assert page.evaluate('window.borrowedView.video === document.querySelector("#borrow video")') is True
    print('BORROWED same-element passed')
    page.evaluate('window.borrowedView.destroy()')
    borrowedAfter=page.evaluate('({videoAlive:!!document.querySelector("#borrow video"),controllerAlive:!!window.borrowed.getSnapshot(),chrome:!!document.querySelector("#borrow .kx-player__controls"),region:document.querySelector("#borrow").getAttribute("role")})')
    assert borrowedAfter == {'videoAlive':True,'controllerAlive':True,'chrome':False,'region':None}, borrowedAfter
    print('BORROWED CLEANUP passed')
    page.set_viewport_size({'width':390,'height':840})
    page.screenshot(path=str(ROOT/'player-mobile-preview.png'),full_page=True)
    page.evaluate('window.player.destroy();window.borrowed.destroy()')
    assert page.evaluate('document.querySelectorAll(".kx-player").length') == 0
    print('OWNED CLEANUP passed')
    assert not errors, errors
    print('M2 CHROMIUM SMOKE: PASS — playback, speed, captions, mute, seek, injected ownership, and cleanup; zero page errors')
    b.close()
