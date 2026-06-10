import {
  DEFAULT_USER_2D_AVATAR_SEED,
  getUser2DAvatarUriForSeed,
} from '@/constants/UserAvatars';
import Theme from '@/constants/Theme';

/**
 * Shared map marker HTML (TripMap Leaflet + MapLibre LeafletMap.web).
 * Live marker: isometric driver-in-cab + loaded cargo (Theme indigo / emerald / gold).
 */

export function resolveDriverMapAvatarSrc(
  avatarUri?: string | null,
  avatarSeed?: string | null,
): string {
  const trimmed = avatarUri?.trim();
  if (trimmed && (trimmed.startsWith('http') || trimmed.startsWith('data:'))) {
    return trimmed;
  }
  return getUser2DAvatarUriForSeed(avatarSeed?.trim() || DEFAULT_USER_2D_AVATAR_SEED);
}

let driverMapMarkerStylesInjected = false;

function ensureDriverMapMarkerStyles(): void {
  if (typeof document === 'undefined' || driverMapMarkerStylesInjected) return;
  const id = 'pulse-driver-map-marker-styles';
  if (document.getElementById(id)) {
    driverMapMarkerStylesInjected = true;
    return;
  }
  const el = document.createElement('style');
  el.id = id;
  el.textContent = `
@keyframes pulseDriverMapPulse{0%,100%{transform:scale(1);opacity:0.55;}50%{transform:scale(1.22);opacity:0.18;}}
.pulse-driver-map-marker{position:relative;display:flex;flex-direction:column;align-items:center;width:52px;filter:drop-shadow(0 4px 10px rgba(15,23,42,0.35));pointer-events:none;}
.pulse-driver-map-pulse{position:absolute;top:2px;left:50%;width:48px;height:48px;margin-left:-24px;border-radius:50%;border:2px solid var(--ring);box-sizing:border-box;}
.pulse-driver-map-pulse.on{animation:pulseDriverMapPulse 1.8s ease-in-out infinite;}
.pulse-driver-map-pulse.off{opacity:0.32;}
.pulse-driver-map-avatar{position:relative;width:44px;height:44px;border-radius:50%;border:3px solid var(--ring);background:#fff;overflow:hidden;z-index:1;}
.pulse-driver-map-avatar img{width:100%;height:100%;object-fit:cover;display:block;}
.pulse-driver-map-dot{position:absolute;right:2px;bottom:2px;width:10px;height:10px;border-radius:50%;background:var(--ring);border:2px solid #fff;}
.pulse-driver-map-pointer{width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-top:10px solid var(--ring);margin-top:-1px;}
`;
  document.head.appendChild(el);
  driverMapMarkerStylesInjected = true;
}

export function buildDriverAvatarMarkerHtml(
  avatarUri?: string | null,
  avatarSeed?: string | null,
  isOnline = false,
): string {
  ensureDriverMapMarkerStyles();
  const src = resolveDriverMapAvatarSrc(avatarUri, avatarSeed);
  const ring = isOnline ? Theme.darkGreen : Theme.teslaRed;
  const pulseClass = isOnline ? 'on' : 'off';
  const safeSrc = src.replace(/"/g, '&quot;');
  return `<div class="pulse-driver-map-marker" style="--ring:${ring};">
  <div class="pulse-driver-map-pulse ${pulseClass}"></div>
  <div class="pulse-driver-map-avatar">
    <img src="${safeSrc}" alt="" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <span class="pulse-driver-map-dot"></span>
  </div>
  <div class="pulse-driver-map-pointer"></div>
</div>`;
}

export const MAP_SOURCE_PIN_HTML = `<svg width="28" height="40" viewBox="0 0 28 40" style="filter:drop-shadow(0 3px 6px rgba(0,0,0,0.16));">
  <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26c0-7.73-6.27-14-14-14z" fill="#059669"/>
  <path d="M14 2C7.37 2 2 7.37 2 14c0 9.25 12 24 12 24s12-14.75 12-24c0-6.63-5.37-12-12-12z" fill="#10b981"/>
  <circle cx="14" cy="14" r="6" fill="#fff"/><circle cx="14" cy="14" r="3" fill="#059669"/>
</svg>`;

export const MAP_DESTINATION_PIN_HTML = `<svg width="28" height="40" viewBox="0 0 28 40" style="filter:drop-shadow(0 3px 6px rgba(0,0,0,0.16));">
  <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26c0-7.73-6.27-14-14-14z" fill="#b91c1c"/>
  <path d="M14 2C7.37 2 2 7.37 2 14c0 9.25 12 24 12 24s12-14.75 12-24c0-6.63-5.37-12-12-12z" fill="#dc2626"/>
  <circle cx="14" cy="14" r="6" fill="#fff"/><circle cx="14" cy="14" r="3" fill="#b91c1c"/>
</svg>`;

/**
 * Live driver + loaded container (isometric 3D).
 * Pulse rings are clip-path bounded to the cargo box interior.
 * Colors: Theme.primary, driverPrimary, driverGold.
 */
export const MAP_TRUCK_MARKER_HTML = `<div style="width:72px;height:72px;display:flex;align-items:center;justify-content:center;pointer-events:none;">
<svg width="72" height="72" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="overflow:visible">
  <defs>
    <clipPath id="qmContainerClip">
      <path d="M22 24 L28 20 H58 L52 24 V46 H22 Z"/>
    </clipPath>
    <filter id="qmDrvLoadShadow" x="-25%" y="-15%" width="150%" height="145%">
      <feDropShadow dx="0" dy="6" stdDeviation="3.5" flood-color="#0f172a" flood-opacity="0.42"/>
      <feDropShadow dx="0" dy="0" stdDeviation="1.2" flood-color="#059669" flood-opacity="0.18"/>
    </filter>
    <linearGradient id="qmCabPri" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4F46E5"/><stop offset="100%" stop-color="#4F46E5"/>
    </linearGradient>
    <linearGradient id="qmCabFace" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4F46E5"/><stop offset="100%" stop-color="#4F46E5"/>
    </linearGradient>
    <linearGradient id="qmBoxSide" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f1f5f9"/><stop offset="100%" stop-color="#94a3b8"/>
    </linearGradient>
    <linearGradient id="qmBoxTop" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
    <linearGradient id="qmBoxEnd" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#cbd5e1"/><stop offset="100%" stop-color="#64748b"/>
    </linearGradient>
    <linearGradient id="qmLoadTop" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#fde68a"/><stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <linearGradient id="qmLoadSide" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fbbf24"/><stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <linearGradient id="qmEmerald" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#059669"/>
    </linearGradient>
    <radialGradient id="qmWheel" cx="32%" cy="28%" r="72%">
      <stop offset="0%" stop-color="#64748b"/><stop offset="100%" stop-color="#0f172a"/>
    </radialGradient>
  </defs>
  <ellipse cx="44" cy="74" rx="26" ry="5" fill="#0f172a" opacity="0.2"/>
  <g filter="url(#qmDrvLoadShadow)" transform="translate(6 6)">
    <path d="M8 50 H64 V52 H8 Z" fill="#334155"/>
    <path d="M22 24 L28 20 H58 L52 24 V46 H22 Z" fill="url(#qmBoxSide)" stroke="#64748b" stroke-width="0.6"/>
    <path d="M22 24 L28 20 H58 L52 24 Z" fill="url(#qmBoxTop)" stroke="#94a3b8" stroke-width="0.5"/>
    <path d="M58 20 L64 24 V46 H58 V20 Z" fill="url(#qmBoxEnd)"/>
    <path d="M26 26 V44" stroke="#cbd5e1" stroke-width="0.7" opacity="0.9"/>
    <path d="M34 26 V44" stroke="#cbd5e1" stroke-width="0.7" opacity="0.7"/>
    <path d="M42 26 V44" stroke="#cbd5e1" stroke-width="0.7" opacity="0.7"/>
    <path d="M50 26 V44" stroke="#cbd5e1" stroke-width="0.7" opacity="0.5"/>
    <path d="M21 42 L53 42 L53 45 L21 45 Z" fill="url(#qmEmerald)"/>
    <g clip-path="url(#qmContainerClip)">
      <ellipse cx="38" cy="32" rx="8" ry="6" fill="#34d399" opacity="0.35">
        <animate attributeName="rx" values="6;13;6" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="ry" values="4.5;10;4.5" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.45;0.15;0.45" dur="2s" repeatCount="indefinite"/>
      </ellipse>
      <ellipse cx="38" cy="32" rx="5" ry="3.8" fill="#059669" opacity="0.55">
        <animate attributeName="rx" values="4;9;4" dur="2s" begin="0.35s" repeatCount="indefinite"/>
        <animate attributeName="ry" values="3;7;3" dur="2s" begin="0.35s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.6;0.25;0.6" dur="2s" begin="0.35s" repeatCount="indefinite"/>
      </ellipse>
      <circle cx="38" cy="32" r="3.4" fill="#059669">
        <animate attributeName="r" values="3;4.2;3" dur="1.4s" repeatCount="indefinite"/>
      </circle>
      <circle cx="38" cy="32" r="1.5" fill="#fff">
        <animate attributeName="opacity" values="0.75;1;0.75" dur="1.4s" repeatCount="indefinite"/>
      </circle>
    </g>
    <path d="M30 28 L36 24 H48 L42 28 V38 H30 Z" fill="url(#qmLoadSide)"/>
    <path d="M30 28 L36 24 H48 L42 28 Z" fill="url(#qmLoadTop)"/>
    <path d="M26 34 L32 30 H40 L34 34 V40 H26 Z" fill="url(#qmLoadSide)" opacity="0.95"/>
    <path d="M26 34 L32 30 H40 L34 34 Z" fill="url(#qmLoadTop)"/>
    <path d="M32 30 H40" stroke="#fff" stroke-width="0.8" opacity="0.45"/>
    <path d="M4 50 H20 V40 L15 34 L4 38 Z" fill="url(#qmCabPri)"/>
    <path d="M4 34 L11 29 L20 34 L20 40 L4 40 Z" fill="url(#qmCabFace)"/>
    <path d="M5.5 35 L11 32 L17 35 L17 39 L5.5 39 Z" fill="#0f172a" opacity="0.4"/>
    <circle cx="11" cy="36.5" r="2.6" fill="#fcd34d"/>
    <path d="M8.8 34 Q11.5 32.2 14.2 34 L13.8 36 L8.2 36 Z" fill="#4F46E5"/>
    <path d="M9.5 36.2 L13.5 36.2" stroke="#fff" stroke-width="0.55" opacity="0.4"/>
    <ellipse cx="16" cy="52" rx="5" ry="5" fill="url(#qmWheel)"/><circle cx="16" cy="52" r="2" fill="#94a3b8"/>
    <ellipse cx="40" cy="52" rx="5" ry="5" fill="url(#qmWheel)"/><circle cx="40" cy="52" r="2" fill="#94a3b8"/>
    <ellipse cx="58" cy="52" rx="5" ry="5" fill="url(#qmWheel)"/><circle cx="58" cy="52" r="2" fill="#94a3b8"/>
    <path d="M20 44 L23 44 L23 50 H20 Z" fill="#475569"/>
  </g>
</svg>
</div>`;

/** Leaflet divIcon size/anchor for {@link MAP_TRUCK_MARKER_HTML}. */
export const MAP_TRUCK_MARKER_ICON_SIZE: [number, number] = [72, 72];
/** Anchor at chassis / ground contact. */
export const MAP_TRUCK_MARKER_ICON_ANCHOR: [number, number] = [36, 54];

export const MAP_PING_DOT_HTML = `<div style="width:12px;height:12px;border-radius:50%;background:#fb923c;border:2px solid #c2410c;box-shadow:0 1px 4px rgba(0,0,0,0.25);"></div>`;

export type TripMapMarkerRole =
  | 'origin'
  | 'destination'
  | 'live'
  | 'truck'
  | 'driver'
  | 'ping'
  | 'past'
  | 'default';

export function tripMapMarkerRoleFromId(id: string): TripMapMarkerRole {
  if (id === 'origin') return 'origin';
  if (id === 'destination') return 'destination';
  if (id === 'you') return 'driver';
  if (id === 'live' || id === 'truck') return 'truck';
  if (id.startsWith('ping-') || id.startsWith('past-')) return id.startsWith('ping-') ? 'ping' : 'past';
  return 'default';
}

export type DriverMapMarkerOptions = {
  avatarUri?: string | null;
  avatarSeed?: string | null;
  isOnline?: boolean;
};

/** Build a DOM element for MapLibre markers (web). */
export function createTripMapMarkerElement(
  role: TripMapMarkerRole,
  label?: string,
  fallbackColor?: string,
  driverOptions?: DriverMapMarkerOptions,
): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '4px';
  wrap.style.cursor = 'pointer';
  wrap.style.pointerEvents = 'auto';

  const iconHost = document.createElement('div');
  if (role === 'origin') {
    iconHost.innerHTML = MAP_SOURCE_PIN_HTML;
  } else if (role === 'destination') {
    iconHost.innerHTML = MAP_DESTINATION_PIN_HTML;
  } else if (role === 'truck' || role === 'live') {
    iconHost.innerHTML = MAP_TRUCK_MARKER_HTML;
  } else if (role === 'driver') {
    iconHost.innerHTML = buildDriverAvatarMarkerHtml(
      driverOptions?.avatarUri,
      driverOptions?.avatarSeed,
      driverOptions?.isOnline ?? false,
    );
  } else if (role === 'ping') {
    iconHost.innerHTML = MAP_PING_DOT_HTML;
  } else {
    const dot = document.createElement('div');
    dot.style.width = '14px';
    dot.style.height = '14px';
    dot.style.borderRadius = '50%';
    dot.style.background = fallbackColor ?? '#3b82f6';
    dot.style.border = '3px solid #ffffff';
    dot.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';
    iconHost.appendChild(dot);
  }
  wrap.appendChild(iconHost);

  if (label?.trim()) {
    const chip = document.createElement('div');
    chip.textContent = label.trim();
    chip.style.background = 'rgba(15,20,26,0.92)';
    chip.style.color = '#f1f5f9';
    chip.style.fontSize = '10px';
    chip.style.fontWeight = '700';
    chip.style.padding = '3px 8px';
    chip.style.borderRadius = '6px';
    chip.style.whiteSpace = 'nowrap';
    chip.style.maxWidth = '160px';
    chip.style.overflow = 'hidden';
    chip.style.textOverflow = 'ellipsis';
    chip.style.boxShadow = '0 2px 6px rgba(0,0,0,0.35)';
    wrap.appendChild(chip);
  }

  return wrap;
}
