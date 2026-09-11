import './style.css';
import { Application } from 'pixi.js';
import { createPlaceholderScene } from './scenes/placeholder.js';

async function bootstrap() {
  const app = new Application();

  await app.init({
    resizeTo: window,
    background: '#1a1410',
    antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });

  document.querySelector('#app').appendChild(app.canvas);

  createPlaceholderScene(app);
}

bootstrap();
