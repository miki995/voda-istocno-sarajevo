const LEAFLET_URL = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
const LEAFLET_JS_HASH = 'sha512-puJW3E/qXDqYp9IfhAI54BJEaWIfloJ7JWs7OeD5i6ruC9JZL1gERT1wjtwXFlh7CjE7ZJ+/vcRZRkIYIb6p4g==';
const LEAFLET_CSS_HASH = 'sha512-h9FcoyWjHcOcmEVkxOfTLnmZFWIH0iZhZT1H2TbOq55xssQGEJHEaIm+PgoUaZbRvQTNTluNOEfb1ZRy6D3BOw==';
const TILES_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const CENTER = [43.8235, 18.366];
const COVERAGE_RADIUS_M = 220;
const EARTH_RADIUS_M = 6371000;

export const ZONE_COLORS = { I: '#0071e3', II: '#ff9500', III: '#af52de' };

export function zoneColor(zone) {
  return ZONE_COLORS[zone] ?? '#8e8e93';
}

function distanceMeters(from, to) {
  const toRadians = degrees => (degrees * Math.PI) / 180;
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// Works on the phone only: the position is compared with the known places and never sent anywhere.
export function nearestPlaces(places, position, limit = 3) {
  return places
    .filter(place => typeof place.lat === 'number')
    .map(place => ({ ...place, distance: distanceMeters(position, place) }))
    .sort((first, second) => first.distance - second.distance)
    .slice(0, limit);
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error('unavailable'), { code: 2 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      result => resolve({ lat: result.coords.latitude, lon: result.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

let leafletReady;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletReady ??= new Promise((resolve, reject) => {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = `${LEAFLET_URL}leaflet.min.css`;
    style.integrity = LEAFLET_CSS_HASH;
    style.crossOrigin = '';
    const script = document.createElement('script');
    script.src = `${LEAFLET_URL}leaflet.min.js`;
    script.integrity = LEAFLET_JS_HASH;
    script.crossOrigin = '';
    script.onload = () => resolve(window.L);
    script.onerror = () => {
      leafletReady = undefined;
      reject(new Error('Leaflet did not load'));
    };
    document.head.append(style, script);
  });
  return leafletReady;
}

// Every known street or neighbourhood is a dot in the colour of its zone, with a soft circle around it that shows roughly how far it reaches.
export async function createZoneMap(container, places, { isWatched, onToggle, text }) {
  const L = await loadLeaflet();
  const map = L.map(container, { center: CENTER, zoom: 13, zoomControl: true });
  L.tileLayer(TILES_URL, { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  const markers = places
    .filter(place => typeof place.lat === 'number')
    .map(place => {
      const color = zoneColor(place.zone);
      L.circle([place.lat, place.lon], { radius: COVERAGE_RADIUS_M, stroke: false, fillColor: color, fillOpacity: 0.16, interactive: false }).addTo(map);
      const marker = L.circleMarker([place.lat, place.lon], { radius: 8, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(map);
      marker.bindPopup(() => {
        const box = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = text.name(place.place);
        const zone = document.createElement('div');
        zone.textContent = text.zone(place.zone);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'link-btn';
        button.textContent = isWatched(place.place) ? text.remove : text.add;
        button.addEventListener('click', () => {
          marker.closePopup();
          onToggle(place.place);
        });
        box.append(title, zone, button);
        return box;
      });
      return { place, marker };
    });
  let you;
  return {
    refresh() {
      map.invalidateSize();
      for (const { place, marker } of markers) {
        marker.setStyle(isWatched(place.place) ? { color: '#1d1d1f', weight: 3, radius: 10 } : { color: '#ffffff', weight: 2, radius: 8 });
      }
    },
    destroy() {
      map.remove();
    },
    showPosition(position) {
      you?.remove();
      you = L.circleMarker([position.lat, position.lon], { radius: 7, color: '#ffffff', weight: 3, fillColor: '#ff3b30', fillOpacity: 1 }).addTo(map);
      map.setView([position.lat, position.lon], Math.max(map.getZoom(), 15));
    },
  };
}
