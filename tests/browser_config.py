"""Use system Chromium when available, otherwise Playwright's installed Chromium.
Set KINEOX_CHROMIUM_PATH to override auto-discovery on Windows/Linux/macOS.
"""
import os
import shutil


def chromium_options():
    selected = os.environ.get('KINEOX_CHROMIUM_PATH')
    if selected:
        return {'executable_path': selected}
    candidate = next((path for name in ('chromium', 'chromium-browser', 'google-chrome', 'chrome', 'msedge')
                      if (path := shutil.which(name))), None)
    return {'executable_path': candidate} if candidate else {}
