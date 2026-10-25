# Customize Kineox

You can make Kineox blend into your site without replacing its playback engine. Choose a built-in theme, supply design tokens, or add your own controls.

## Themes and appearance

Both Player and Showcase support `dark`, `light`, `system` and `minimal` themes. `system` follows the browser's color preference.

```ts
import { mountPlayer } from '@blcklab/kineox/player';
import '@blcklab/kineox/styles/player.css';

const player = mountPlayer('#demo', {
  source: { src: '/demo.mp4' },
  theme: 'dark',
  appearance: 'minimal',
  themeTokens: { accent: '#a7f3d0', radius: '14px' }
});

player.setTheme('light');
player.setThemeTokens({ accent: '#f6ba74' });
```

The frame and playback behavior are separate. For example, a borderless player can still use a light theme and auto-hiding controls. Kineox styles are opt-in: import the CSS only for the interface you use.

## Add your own control

The public UI extension API lets you add a button without modifying Kineox's source:

```ts
const removeReplay = player.use({
  id: 'replay',
  mount({ controller, append, element }) {
    const button = element.ownerDocument.createElement('button');
    button.type = 'button';
    button.textContent = 'Replay';
    button.setAttribute('aria-label', 'Replay video');

    const replay = () => {
      controller.seek(0);
      void controller.play();
    };

    button.addEventListener('click', replay);
    append('toolbar-end', button);
    return () => button.removeEventListener('click', replay);
  }
});

// Remove the control whenever you like:
removeReplay();
```

Your extension owns its event listeners and returns a cleanup callback. This also works for a Showcase with an available slot. Don't depend on private class names or internal DOM structure when building reusable extensions.

## Headless behaviors

If you want something that has no UI—such as analytics instrumentation—build it against the public Core controller or the behavior-extension entry point:

```ts
import { createKineoxBehaviorHost } from '@blcklab/kineox/extensions';
```

Behavior extensions should read state through the controller and unsubscribe on cleanup. They should not mutate internal snapshots.

## Frameworks and CSS

Kineox doesn't import a CSS framework, component system or third-party theme library. Your React, Vue, Svelte or vanilla interface can use the public controller and theme APIs. For details, see [Framework adapters](framework-adapters.md).

For showcase frames and inline click behavior, see [Showcase](showcase.md).
