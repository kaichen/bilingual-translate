import { config } from "@/entrypoints/config/config";
import { getMainDomain } from "@/entrypoints/main/site-rules";
import { cancelAllTranslations, translateText } from "@/entrypoints/translate/translateApi";

const MESSAGE_SOURCE = 'fl-yt-timedtext';
const OVERLAY_ID = 'fl-youtube-subtitle';
const LOOKAHEAD_MS = 75_000;
const URL_POLL_MS = 1_000;

export interface YouTubeCue {
    startMs: number;
    durMs: number;
    text: string;
}

interface YouTubeCueState extends YouTubeCue {
    translation?: string;
    translating?: boolean;
}

interface TimedtextMessage {
    source: typeof MESSAGE_SOURCE;
    url: string;
    body: string;
}

interface Json3Event {
    tStartMs?: number;
    dDurationMs?: number;
    segs?: Array<{ utf8?: string }>;
}

interface Json3Body {
    events?: Json3Event[];
}

let mounted = false;
let overlayEl: HTMLElement | null = null;
let playerEl: HTMLElement | null = null;
let cues: YouTubeCueState[] = [];
let currentVideoId = '';
let videoSessionId = 0;
let translationSessionId = 0;
let ccActive = false;
let ccObserver: MutationObserver | null = null;
let waitAbort: AbortController | null = null;
let videoTimeCleanup: (() => void) | null = null;
let urlPollTimer: number | null = null;

export function parseYouTubeJson3Cues(body: string): YouTubeCue[] {
    let parsed: Json3Body;
    try {
        parsed = JSON.parse(body) as Json3Body;
    } catch {
        return [];
    }

    const result: YouTubeCue[] = [];

    for (const event of parsed.events ?? []) {
        if (!event.segs?.length) continue;

        const text = cleanCaptionText(event.segs.map(seg => seg.utf8 ?? '').join(''));
        if (!text) continue;

        const cue: YouTubeCue = {
            startMs: Number(event.tStartMs ?? 0),
            durMs: Number(event.dDurationMs ?? 0),
            text,
        };
        addDedupedCue(result, cue);
    }

    return result;
}

export function findActiveYouTubeCue(cueList: YouTubeCue[], currentMs: number): YouTubeCue | undefined {
    return cueList.find(cue => {
        const endMs = cue.startMs + Math.max(cue.durMs, 1);
        return currentMs >= cue.startMs && currentMs < endMs;
    });
}

function cleanCaptionText(text: string): string {
    return text
        .replace(/<[^>]*>/g, '')
        .replace(/\u200B/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function addDedupedCue(cueList: YouTubeCue[], cue: YouTubeCue): void {
    const previous = cueList[cueList.length - 1];
    if (!previous) {
        cueList.push(cue);
        return;
    }

    const overlapsPrevious = cue.startMs <= previous.startMs + previous.durMs + 500;
    if (cue.text === previous.text && overlapsPrevious) return;

    if (overlapsPrevious && cue.text.startsWith(previous.text)) {
        cueList[cueList.length - 1] = {
            startMs: previous.startMs,
            durMs: Math.max(previous.durMs, cue.startMs + cue.durMs - previous.startMs),
            text: cue.text,
        };
        return;
    }

    if (overlapsPrevious && previous.text.startsWith(cue.text)) return;

    cueList.push(cue);
}

export function mountYouTubeSubtitleTranslation() {
    if (mounted) return;
    if (getMainDomain(location.href) !== 'youtube.com') return;
    if (!config.youtubeSubtitle) return;

    mounted = true;
    window.addEventListener('message', handleTimedtextMessage);
    document.addEventListener('yt-navigate-finish', handleNavigation);
    document.addEventListener('yt-page-data-updated', handleNavigation);
    urlPollTimer = window.setInterval(handleNavigation, URL_POLL_MS);
    handleNavigation();
}

function handleTimedtextMessage(event: MessageEvent) {
    // 即使 CC 未开也先收下并存 cues（避免进页时 CC 已开、timedtext 消息早于 ccActive 就位而丢整轨）；
    // 翻译与渲染仍分别由 ccActive 门控（translateLookahead / renderSubtitle 内部自判）。
    if (!config.youtubeSubtitle) return;
    const data = event.data as Partial<TimedtextMessage>;
    if (data?.source !== MESSAGE_SOURCE || typeof data.url !== 'string' || typeof data.body !== 'string') return;

    const messageVideoId = videoIdFromUrl(data.url);
    if (messageVideoId && messageVideoId !== currentVideoId) return;

    const parsedCues = parseYouTubeJson3Cues(data.body);
    if (!parsedCues.length) return;

    cues = mergeCueTranslations(parsedCues, cues);
    translateLookahead();
    renderSubtitle();
}

function handleNavigation() {
    const nextVideoId = new URLSearchParams(location.search).get('v') || '';
    if (nextVideoId === currentVideoId) return;

    currentVideoId = nextVideoId;
    resetVideoState();
    if (!currentVideoId) return;

    const sessionId = videoSessionId;
    attachForVideo(sessionId);
}

async function attachForVideo(sessionId: number) {
    const button = await waitForElement<HTMLElement>('.ytp-right-controls .ytp-subtitles-button');
    if (!isCurrentSession(sessionId) || !button) return;

    ccObserver = new MutationObserver(syncCcState);
    ccObserver.observe(button, { attributes: true, attributeFilter: ['aria-pressed'] });
    syncCcState();

    const video = await waitForElement<HTMLVideoElement>('video.html5-main-video');
    if (!isCurrentSession(sessionId) || !video) return;

    const onTimeUpdate = () => {
        translateLookahead();
        renderSubtitle();
    };
    video.addEventListener('timeupdate', onTimeUpdate);
    videoTimeCleanup = () => video.removeEventListener('timeupdate', onTimeUpdate);
    renderSubtitle();
}

function resetVideoState() {
    videoSessionId += 1;
    cancelVideoTranslations();
    cues = [];
    ccActive = false;
    ccObserver?.disconnect();
    ccObserver = null;
    waitAbort?.abort();
    waitAbort = null;
    videoTimeCleanup?.();
    videoTimeCleanup = null;
    removeOverlay();
}

function cancelVideoTranslations() {
    translationSessionId += 1;
    cancelAllTranslations();
    cues.forEach(cue => {
        cue.translating = false;
    });
}

function syncCcState() {
    const button = document.querySelector<HTMLElement>('.ytp-right-controls .ytp-subtitles-button');
    const nextActive = Boolean(config.youtubeSubtitle && button?.getAttribute('aria-pressed') === 'true');
    if (nextActive === ccActive) return;

    ccActive = nextActive;
    if (!ccActive) {
        cancelVideoTranslations();
        hideOverlay(true);
        return;
    }

    ensureOverlay();
    translateLookahead();
    renderSubtitle();
}

function translateLookahead() {
    if (!ccActive || !config.youtubeSubtitle) return;
    const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
    if (!video) return;

    const nowMs = video.currentTime * 1000;
    const maxMs = nowMs + LOOKAHEAD_MS;
    cues
        .filter(cue => cue.startMs >= nowMs - 500 && cue.startMs <= maxMs)
        .filter(cue => !cue.translation && !cue.translating)
        .forEach(cue => translateCue(cue));
}

async function translateCue(cue: YouTubeCueState) {
    cue.translating = true;
    const sessionId = translationSessionId;

    try {
        const translation = await translateText(cue.text, document.title, { useCache: true });
        if (sessionId !== translationSessionId || !cues.includes(cue)) return;
        cue.translation = translation;
    } catch {
        if (sessionId !== translationSessionId || !cues.includes(cue)) return;
        cue.translation = cue.text;
    } finally {
        if (sessionId === translationSessionId && cues.includes(cue)) {
            cue.translating = false;
            renderSubtitle();
        }
    }
}

function renderSubtitle() {
    if (!config.youtubeSubtitle) {
        if (ccActive) {
            ccActive = false;
            cancelVideoTranslations();
        }
        hideOverlay(true);
        return;
    }

    if (!ccActive) {
        hideOverlay(true);
        return;
    }

    const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
    if (!video) return;

    const activeCue = findActiveYouTubeCue(cues, video.currentTime * 1000) as YouTubeCueState | undefined;
    if (!activeCue) {
        hideOverlay();
        return;
    }

    const overlay = ensureOverlay();
    if (!overlay) return;

    overlay.style.display = 'flex';
    const original = overlay.querySelector<HTMLElement>('.fl-youtube-subtitle-origin');
    const translated = overlay.querySelector<HTMLElement>('.fl-youtube-subtitle-translation');
    if (original) original.textContent = activeCue.text;
    if (translated) translated.textContent = activeCue.translation ?? '...';
}

function ensureOverlay(): HTMLElement | null {
    const player = document.querySelector<HTMLElement>('#movie_player, .html5-video-player');
    if (player) {
        player.classList.add('fl-youtube-subtitle-player');
        playerEl = player;
    }

    if (overlayEl?.isConnected) return overlayEl;
    if (!player) return null;

    const existing = document.getElementById(OVERLAY_ID) as HTMLElement | null;
    overlayEl = existing ?? document.createElement('div');
    overlayEl.id = OVERLAY_ID;
    overlayEl.innerHTML = `
        <div class="fl-youtube-subtitle-origin"></div>
        <div class="fl-youtube-subtitle-translation"></div>
    `;
    overlayEl.style.display = 'none';
    player.appendChild(overlayEl);

    return overlayEl;
}

function hideOverlay(removePlayerClass = false) {
    if (overlayEl) overlayEl.style.display = 'none';
    if (removePlayerClass) playerEl?.classList.remove('fl-youtube-subtitle-player');
}

function removeOverlay() {
    overlayEl?.remove();
    overlayEl = null;
    playerEl?.classList.remove('fl-youtube-subtitle-player');
    playerEl = null;
}

function mergeCueTranslations(nextCues: YouTubeCue[], previousCues: YouTubeCueState[]): YouTubeCueState[] {
    const previousByKey = new Map(previousCues.map(cue => [cueKey(cue), cue]));

    return nextCues.map(cue => {
        const previous = previousByKey.get(cueKey(cue));
        return previous ? { ...cue, translation: previous.translation, translating: previous.translating } : cue;
    });
}

function cueKey(cue: YouTubeCue): string {
    return `${cue.startMs}:${cue.text}`;
}

function isCurrentSession(sessionId: number): boolean {
    return mounted && sessionId === videoSessionId;
}

function videoIdFromUrl(url: string): string {
    try {
        return new URL(url, location.href).searchParams.get('v') || '';
    } catch {
        return '';
    }
}

function waitForElement<T extends Element>(selector: string): Promise<T | null> {
    waitAbort?.abort();
    waitAbort = new AbortController();
    const signal = waitAbort.signal;

    const existing = document.querySelector<T>(selector);
    if (existing) return Promise.resolve(existing);

    return new Promise(resolve => {
        const root = document.body || document.documentElement;
        const observer = new MutationObserver(() => {
            const found = document.querySelector<T>(selector);
            if (!found) return;
            observer.disconnect();
            resolve(found);
        });

        const onAbort = () => {
            observer.disconnect();
            resolve(null);
        };

        signal.addEventListener('abort', onAbort, { once: true });
        observer.observe(root, { childList: true, subtree: true });
    });
}
