import { config } from "@/entrypoints/config/config";
import { getMainDomain } from "@/entrypoints/main/site-rules";
import { cancelAllTranslations, translateText } from "@/entrypoints/translate/translateApi";

const MESSAGE_SOURCE = 'fl-yt-timedtext';
const OVERLAY_ID = 'fl-youtube-subtitle';
const LOOKAHEAD_MS = 75_000;
const URL_POLL_MS = 1_000;
const SUBSTACK_CAPTION_SELECTOR = '[class^="captionsContainer-"], [class*=" captionsContainer-"]';
const SUBSTACK_TRANSCRIPT_SELECTOR = '[class*="transcriptPanel"]';
const SUBSTACK_POLL_MS = 1_000;
const TRANSCRIPT_CHUNK_WORDS = 9;
const SUBSTACK_VTT_URL_RE = /https:\/\/substackcdn\.com\/video_upload\/[^"'<>\\]+?\.vtt\?[^"'<>\\]+/g;
const WEBVTT_TIMESTAMP = String.raw`(?:\d{1,2}:)?\d{2}:\d{2}[\.,]\d{3}`;
const WEBVTT_TIMING_RE = new RegExp(String.raw`^\s*(${WEBVTT_TIMESTAMP})\s+-->\s+(${WEBVTT_TIMESTAMP})`);

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

interface SubtitleCueInput {
    startTime: number;
    endTime: number;
    text?: string;
}

interface TranscriptRowInput {
    startMs: number;
    text: string;
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
let substackMounted = false;
let substackCaptionEl: HTMLElement | null = null;
let substackPlayerEl: HTMLElement | null = null;
let substackCaptionObserver: MutationObserver | null = null;
let substackTimeCleanup: (() => void) | null = null;
let substackPollTimer: number | null = null;
let substackCurrentText = '';
let substackTranslationSessionId = 0;
let substackCues: YouTubeCueState[] = [];
let substackVttUrl = '';
let substackVttStatus: 'idle' | 'loading' | 'loaded' | 'failed' = 'idle';
const substackTranslations = new Map<string, string>();
const substackTranslating = new Set<string>();

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

        const text = normalizeSubtitleText(event.segs.map(seg => seg.utf8 ?? '').join(''));
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

export function normalizeSubtitleText(text: string): string {
    return text
        .replace(/<[^>]*>/g, '')
        .replace(/\u200B/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function textTrackCuesToSubtitleCues(trackCues: ArrayLike<SubtitleCueInput> | Iterable<SubtitleCueInput>): YouTubeCue[] {
    return Array.from(trackCues)
        .map(cue => ({
            startMs: Math.max(0, Math.round(cue.startTime * 1000)),
            durMs: Math.max(1, Math.round((cue.endTime - cue.startTime) * 1000)),
            text: normalizeSubtitleText(cue.text ?? ''),
        }))
        .filter(cue => cue.text);
}

export function parseWebVttCues(body: string): YouTubeCue[] {
    const result: YouTubeCue[] = [];
    const lines = body.replace(/^\uFEFF/, '').split(/\r?\n/);

    for (let index = 0; index < lines.length; index++) {
        const timing = lines[index].match(WEBVTT_TIMING_RE);
        if (!timing) continue;

        const startMs = parseWebVttTimestampMs(timing[1]);
        const endMs = parseWebVttTimestampMs(timing[2]);
        if (startMs === null || endMs === null || endMs <= startMs) continue;

        const textLines: string[] = [];
        index++;
        while (index < lines.length && lines[index].trim()) {
            textLines.push(lines[index]);
            index++;
        }

        const text = normalizeSubtitleText(textLines.join(' '));
        if (!text) continue;

        addDedupedCue(result, {
            startMs,
            durMs: endMs - startMs,
            text,
        });
    }

    return result;
}

export function extractSubstackVttUrl(text: string): string {
    SUBSTACK_VTT_URL_RE.lastIndex = 0;
    const match = SUBSTACK_VTT_URL_RE.exec(text);
    return match?.[0]
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/')
        ?? '';
}

export function isSubstackSubtitleEnabled(trackModes: string[], captionText: string): boolean {
    return trackModes.some(mode => mode !== 'disabled') || Boolean(normalizeSubtitleText(captionText));
}

function parseWebVttTimestampMs(text: string): number | null {
    const parts = text.replace(',', '.').split(':');
    if (parts.length !== 2 && parts.length !== 3) return null;

    const seconds = Number(parts[parts.length - 1]);
    const minutes = Number(parts[parts.length - 2]);
    const hours = parts.length === 3 ? Number(parts[0]) : 0;
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;

    return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

export function parseSubtitleTimestampMs(text: string): number | null {
    const match = text.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;

    const first = Number(match[1]);
    const second = Number(match[2]);
    const third = match[3] === undefined ? 0 : Number(match[3]);
    return match[3] === undefined
        ? (first * 60 + second) * 1000
        : (first * 3600 + second * 60 + third) * 1000;
}

export function transcriptRowsToSubtitleCues(rows: TranscriptRowInput[]): YouTubeCue[] {
    const result: YouTubeCue[] = [];
    const sortedRows = [...rows].sort((a, b) => a.startMs - b.startMs);

    sortedRows.forEach((row, index) => {
        const chunks = splitTranscriptText(row.text);
        if (!chunks.length) return;

        const nextStartMs = sortedRows[index + 1]?.startMs;
        const rowDurMs = Math.max(1000, (nextStartMs ?? row.startMs + 5000) - row.startMs);
        const chunkDurMs = Math.max(1, Math.round(rowDurMs / chunks.length));

        chunks.forEach((text, chunkIndex) => {
            result.push({
                startMs: row.startMs + chunkIndex * chunkDurMs,
                durMs: chunkDurMs,
                text,
            });
        });
    });

    return result;
}

function splitTranscriptText(text: string): string[] {
    const words = normalizeSubtitleText(text).split(' ').filter(Boolean);
    const chunks: string[] = [];
    let current: string[] = [];

    for (const word of words) {
        current.push(word);
        if (
            current.length >= TRANSCRIPT_CHUNK_WORDS &&
            (/[.!?;:,]$/.test(word) || current.length >= TRANSCRIPT_CHUNK_WORDS + 3)
        ) {
            chunks.push(current.join(' '));
            current = [];
        }
    }

    if (current.length) chunks.push(current.join(' '));
    return chunks;
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

export function mountSubstackSubtitleTranslation() {
    if (substackMounted) return;
    if (getMainDomain(location.href) === 'youtube.com') return;
    if (!config.youtubeSubtitle) return;

    substackMounted = true;
    substackPollTimer = window.setInterval(syncSubstackSubtitleRuntime, SUBSTACK_POLL_MS);
    syncSubstackSubtitleRuntime();
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

function syncSubstackSubtitleRuntime() {
    if (!config.youtubeSubtitle) {
        hideSubstackSubtitle(true);
        return;
    }

    const caption = document.querySelector<HTMLElement>(SUBSTACK_CAPTION_SELECTOR);
    if (!caption) {
        if (substackCaptionEl) resetSubstackCaption();
        return;
    }

    if (caption !== substackCaptionEl) attachSubstackCaption(caption);
    syncSubstackRemoteCaptionCues(findSubstackVideo(caption));
    syncSubstackTranscriptCues();
    renderSubstackSubtitle();
}

function attachSubstackCaption(caption: HTMLElement) {
    resetSubstackCaption();
    substackCaptionEl = caption;
    substackPlayerEl = findSubstackPlayer(caption);

    substackCaptionObserver = new MutationObserver(renderSubstackSubtitle);
    substackCaptionObserver.observe(caption, { childList: true, characterData: true, subtree: true });

    const video = findSubstackVideo(caption);
    if (video) {
        const onTimeUpdate = () => renderSubstackSubtitle();
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('seeked', onTimeUpdate);
        substackTimeCleanup = () => {
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('seeked', onTimeUpdate);
        };
    }

    syncSubstackTextTrackCues(video);
    syncSubstackRemoteCaptionCues(video);
    syncSubstackTranscriptCues();
}

function renderSubstackSubtitle() {
    if (!config.youtubeSubtitle || !substackCaptionEl?.isConnected) {
        hideSubstackSubtitle(true);
        return;
    }

    const video = findSubstackVideo(substackCaptionEl);
    if (!substackSubtitleEnabled(video, substackCaptionEl)) {
        hideSubstackSubtitle(true);
        return;
    }

    syncSubstackTextTrackCues(video);
    syncSubstackRemoteCaptionCues(video);
    if (video) translateSubstackLookahead(video);

    const activeCue = video
        ? findActiveYouTubeCue(substackCues, video.currentTime * 1000)
        : undefined;
    const text = activeCue?.text ?? activeSubstackCaptionText(substackCaptionEl);
    if (!text) {
        hideOverlay();
        return;
    }

    substackCurrentText = text;
    void translateSubstackText(text);

    const overlay = ensureOverlayInPlayer(substackPlayerEl);
    if (!overlay) return;

    overlay.style.display = 'flex';
    const original = overlay.querySelector<HTMLElement>('.fl-youtube-subtitle-origin');
    const translated = overlay.querySelector<HTMLElement>('.fl-youtube-subtitle-translation');
    if (original) original.textContent = text;
    if (translated) translated.textContent = substackTranslations.get(text) ?? '...';
}

function substackSubtitleEnabled(video: HTMLVideoElement | null, caption: HTMLElement): boolean {
    const trackModes = Array.from(video?.textTracks ?? [])
        .filter(track => track.kind === 'subtitles' || track.kind === 'captions')
        .map(track => track.mode);
    return isSubstackSubtitleEnabled(trackModes, activeSubstackCaptionText(caption));
}

function activeSubstackCaptionText(caption: HTMLElement): string {
    const style = getComputedStyle(caption);
    if (style.display === 'none' || style.visibility === 'hidden') return '';
    return normalizeSubtitleText(caption.textContent ?? '');
}

function syncSubstackTextTrackCues(video: HTMLVideoElement | null) {
    if (!video?.textTracks?.length) return;

    for (const track of Array.from(video.textTracks)) {
        if (track.kind !== 'subtitles' && track.kind !== 'captions') continue;
        if (track.mode === 'disabled') continue;
        if (!track.cues?.length) continue;
        substackCues = mergeCueTranslations(
            textTrackCuesToSubtitleCues(track.cues as unknown as ArrayLike<SubtitleCueInput>),
            substackCues,
        );
        return;
    }
}

function syncSubstackTranscriptCues() {
    const panel = document.querySelector<HTMLElement>(SUBSTACK_TRANSCRIPT_SELECTOR);
    if (!panel) return;

    const transcriptCues = transcriptRowsToSubtitleCues(extractSubstackTranscriptRows(panel));
    if (!transcriptCues.length) return;

    substackCues = mergeCueTranslations(transcriptCues, substackCues);
}

function syncSubstackRemoteCaptionCues(video: HTMLVideoElement | null) {
    if (substackVttUrl && substackVttStatus !== 'idle') return;

    const url = findSubstackVttUrl(video);
    if (!url) return;

    if (url !== substackVttUrl) {
        substackVttUrl = url;
        substackVttStatus = 'idle';
    }
    if (substackVttStatus !== 'idle') return;

    substackVttStatus = 'loading';
    void fetchSubstackVttCues(url);
}

async function fetchSubstackVttCues(url: string) {
    try {
        const response = await fetch(url, { credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const parsedCues = parseWebVttCues(await response.text());
        if (url !== substackVttUrl) return;

        substackVttStatus = parsedCues.length ? 'loaded' : 'failed';
        if (!parsedCues.length) return;

        substackCues = mergeCueTranslations(parsedCues, substackCues);
        if (substackCaptionEl) {
            const video = findSubstackVideo(substackCaptionEl);
            if (video && substackSubtitleEnabled(video, substackCaptionEl)) {
                translateSubstackLookahead(video);
            }
            renderSubstackSubtitle();
        }
    } catch {
        if (url === substackVttUrl) substackVttStatus = 'failed';
    }
}

function findSubstackVttUrl(video: HTMLVideoElement | null): string {
    for (const track of Array.from(video?.querySelectorAll<HTMLTrackElement>('track') ?? [])) {
        const url = normalizeSubstackVttUrl(track.src || track.getAttribute('src') || '');
        if (url) return url;
    }

    for (const track of Array.from(document.querySelectorAll<HTMLTrackElement>('track'))) {
        const url = normalizeSubstackVttUrl(track.src || track.getAttribute('src') || '');
        if (url) return url;
    }

    for (const script of Array.from(document.scripts)) {
        const url = extractSubstackVttUrl(script.textContent ?? '');
        if (url) return url;
    }

    return '';
}

function normalizeSubstackVttUrl(value: string): string {
    const text = value
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/');
    if (!/\.vtt(?:\?|$)/.test(text)) return '';

    try {
        const url = new URL(text, location.href).href;
        return url.includes('substackcdn.com/video_upload/') ? url : '';
    } catch {
        return '';
    }
}

function extractSubstackTranscriptRows(panel: HTMLElement): TranscriptRowInput[] {
    const rows = new Map<string, TranscriptRowInput>();

    for (const row of Array.from(panel.querySelectorAll<HTMLElement>('div'))) {
        const timeText = normalizeSubtitleText(row.children[0]?.textContent ?? '');
        const startMs = parseSubtitleTimestampMs(timeText);
        if (startMs === null || row.children.length < 2) continue;

        const wordText = Array.from(row.querySelectorAll<HTMLElement>('[data-word-index]'))
            .map(word => word.textContent ?? '')
            .join(' ');
        const fallbackText = row.children[1]?.textContent?.replace(/^SPEAKER\s+\d+\s*/i, '') ?? '';
        const text = normalizeSubtitleText(wordText || fallbackText);
        if (!text) continue;

        rows.set(`${startMs}:${text}`, { startMs, text });
    }

    return Array.from(rows.values());
}

function translateSubstackLookahead(video: HTMLVideoElement) {
    const nowMs = video.currentTime * 1000;
    const maxMs = nowMs + LOOKAHEAD_MS;
    substackCues
        .filter(cue => cue.startMs >= nowMs - 500 && cue.startMs <= maxMs)
        .forEach(cue => void translateSubstackText(cue.text));
}

async function translateSubstackText(text: string) {
    if (substackTranslations.has(text) || substackTranslating.has(text)) return;

    substackTranslating.add(text);
    const sessionId = substackTranslationSessionId;

    try {
        const translation = await translateText(text, document.title, { useCache: true });
        if (sessionId !== substackTranslationSessionId) return;
        substackTranslations.set(text, translation);
    } catch {
        if (sessionId !== substackTranslationSessionId) return;
        substackTranslations.set(text, text);
    } finally {
        substackTranslating.delete(text);
        if (sessionId === substackTranslationSessionId && text === substackCurrentText) {
            renderSubstackSubtitle();
        }
    }
}

function findSubstackVideo(caption: HTMLElement): HTMLVideoElement | null {
    const scope = caption.closest('.video-player, .video-player-wrapper, [aria-label="Video player"]') ?? document;
    return scope.querySelector<HTMLVideoElement>('video') ?? document.querySelector<HTMLVideoElement>('video');
}

function findSubstackPlayer(caption: HTMLElement): HTMLElement | null {
    const video = findSubstackVideo(caption);
    let el: HTMLElement | null = caption.parentElement;

    while (el) {
        if (video && !el.contains(video)) {
            el = el.parentElement;
            continue;
        }

        const rect = el.getBoundingClientRect();
        if (getComputedStyle(el).position !== 'static' && rect.width > 0 && rect.height > 0) return el;
        el = el.parentElement;
    }

    return video?.parentElement ?? caption.parentElement;
}

function resetSubstackCaption() {
    substackCaptionObserver?.disconnect();
    substackCaptionObserver = null;
    substackTimeCleanup?.();
    substackTimeCleanup = null;
    substackCaptionEl = null;
    substackCues = [];
    substackVttUrl = '';
    substackVttStatus = 'idle';
    hideSubstackSubtitle(true);
}

function hideSubstackSubtitle(removePlayerClass = false) {
    substackTranslationSessionId += 1;
    substackTranslating.clear();
    substackCurrentText = '';
    hideOverlay(removePlayerClass);
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
    return ensureOverlayInPlayer(player);
}

function ensureOverlayInPlayer(player: HTMLElement | null): HTMLElement | null {
    if (player) {
        player.classList.add('fl-youtube-subtitle-player');
        playerEl = player;
    }

    if (overlayEl?.isConnected && overlayEl.parentElement === player) return overlayEl;
    if (!player) return null;
    overlayEl?.remove();

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
