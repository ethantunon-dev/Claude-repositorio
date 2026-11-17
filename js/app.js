// Arranque: pestañas, tema, instalación, estado sin conexión y service worker.
import { $, $$, toast } from './ui.js';
import { requestPersist } from './db.js';
import { initHistory } from './history.js';
import { initScan } from './scan.js';
import { initOcr } from './ocr.js';
import { initPdfTools } from './pdftools.js';

function initTabs() {
  const tabs = $$('.tab');
  const show = v => {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.view === v));
    $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
    $('#scanBar').hidden = v !== 'scan' || !$('#pageList').children.length;
    $('#orgBar').hidden = v !== 'pdf' || $('#sub-org').hidden || !$('#orgPages').children.length;
    try { sessionStorage.setItem('tab', v); } catch { }
    window.scrollTo(0, 0);
  };
  tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.view)));
  let last = null; try { last = sessionStorage.getItem('tab'); } catch { }
  if (last && last !== 'scan') show(last);
}

function initTheme() {
  const order = ['auto', 'claro', 'oscuro'], icons = { auto: '#i-auto', claro: '#i-sun', oscuro: '#i-moon' };
  let t = 'auto'; try { t = localStorage.getItem('tema') || 'auto'; } catch { }
  const apply = () => {
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t === 'claro' ? 'light' : 'dark';
    $('#themeBtn use').setAttribute('href', icons[t]);
    $('#themeBtn').setAttribute('aria-label', `Tema: ${t}. Cambiar`);
  };
  apply();
  $('#themeBtn').onclick = () => {
    t = order[(order.indexOf(t) + 1) % 3];
    try { localStorage.setItem('tema', t); } catch { }
    apply(); toast(`Tema: ${t === 'auto' ? 'automático' : t}`, 1500);
  };
}

function initInstall() {
  let deferred = null;
  const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
  window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('¡App instalada!'); });
  if (isIOS && !isStandalone) $('#installBtn').hidden = false;
  $('#installBtn').onclick = async () => {
    if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; }
    else if (isIOS) toast('En Safari: toca Compartir ⬆️ y luego «Agregar a pantalla de inicio»', 6000);
  };
}

function initOffline() {
  const upd = () => { $('#offlineBadge').hidden = navigator.onLine; };
  window.addEventListener('online', upd); window.addEventListener('offline', upd); upd();
}

async function initSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const hadController = !!navigator.serviceWorker.controller;
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'ready-offline' && !hadController) toast('✓ Lista para usarse sin conexión');
    });
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'activated' && hadController) toast('App actualizada. Se aplicará al volver a abrirla.', 4000);
      });
    });
  } catch (e) { console.warn('SW no registrado', e); }
}

async function main() {
  initTabs(); initTheme(); initInstall(); initOffline();
  await initHistory();
  await initScan();
  initOcr();
  initPdfTools();
  initSW();
  requestPersist();
}

main().catch(e => { console.error(e); toast('⚠️ Error al iniciar: ' + e.message, 6000); });
