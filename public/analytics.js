// Paste the GA4 Measurement ID (G-XXXXXXXXXX) here to turn Google Analytics on. Empty means nothing is loaded.
const MEASUREMENT_ID = '';

let ready = false;

function optedOut() {
  return navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
}

export function initAnalytics() {
  if (!MEASUREMENT_ID || optedOut() || ready) return;
  ready = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, { anonymize_ip: true, allow_ad_personalization_signals: false });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.append(script);
}

export function trackEvent(name, params = {}) {
  if (ready) window.gtag('event', name, params);
}
