import { config } from "@/entrypoints/config/config";
import { detectlang } from "@/entrypoints/utils/common";

// 语速夹在 [0.9, 1.8]：过慢拖沓、过快听不清
const MIN_RATE = 0.9;
const MAX_RATE = 1.8;
// rate=1 时的估算朗读速度：CJK 按字、其余按字符（含空格）
const CJK_CHARS_PER_SEC = 4.5;
const OTHER_CHARS_PER_SEC = 13;

// config.to 与 speechSynthesis voice.lang 的标签差异映射
const PREFERRED_LANG_TAG: Record<string, string> = {
    'zh-Hans': 'zh-CN',
    'zh-Hant': 'zh-TW',
};

interface DubCue {
    startMs: number;
    durMs: number;
    text: string;
    translation?: string;
}

let lastSpokenKey = '';
let utteranceRefs: SpeechSynthesisUtterance[] = []; // 持引用防 Chrome 播放中 GC 截断
let mutedVideo: HTMLVideoElement | null = null;
let originalMuted = false;

export function dubLangTag(to: string): string {
    return PREFERRED_LANG_TAG[to] ?? to;
}

// 原文模式的朗读语言：franc 检测，未映射的 ISO639-3 三字码浏览器不认，兜底英语
export function dubOriginLang(text: string): string {
    const detected = detectlang(text);
    return /^[a-z]{3}$/.test(detected) ? 'en' : detected;
}

export function pickDubVoice(voices: SpeechSynthesisVoice[], to: string): SpeechSynthesisVoice | undefined {
    const preferred = dubLangTag(to).toLowerCase();
    const primary = preferred.split('-')[0];
    const langOf = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase().replace('_', '-');

    return voices.find(voice => langOf(voice) === preferred)
        ?? voices.find(voice => langOf(voice).startsWith(`${primary}-`))
        ?? voices.find(voice => langOf(voice) === primary);
}

export function estimateDubRate(text: string, durMs: number): number {
    if (durMs <= 0) return 1;

    const cjkCount = (text.match(/[぀-ヿ㐀-鿿가-힯]/g) ?? []).length;
    const otherCount = text.length - cjkCount;
    const speakMs = (cjkCount / CJK_CHARS_PER_SEC + otherCount / OTHER_CHARS_PER_SEC) * 1000;
    return Math.min(MAX_RATE, Math.max(MIN_RATE, speakMs / durMs));
}

// 由字幕运行时在 activeCue 变化处调用；同一条 cue 重复调用不重复发声。
// 不打断正在朗读的上一条（speechSynthesis 原生排队）；积压超过 1 条时丢弃新 cue 防漂移。
export function syncDub(cue: DubCue, video: HTMLVideoElement) {
    if (!config.youtubeDubbing) {
        cancelDub();
        return;
    }
    if (video.paused || !('speechSynthesis' in window)) return;

    const useOrigin = config.youtubeDubbingSource === 'origin';
    const text = useOrigin ? cue.text : cue.translation;
    if (!text) return;

    const key = `${cue.startMs}:${cue.text}`;
    if (key === lastSpokenKey) return;
    lastSpokenKey = key;

    muteVideo(video);
    // ponytail: 落后即丢弃整条 cue 追进度，不做压缩语速追赶
    if (speechSynthesis.pending) return;

    const lang = useOrigin ? dubOriginLang(text) : config.to;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickDubVoice(speechSynthesis.getVoices(), lang);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? dubLangTag(lang);
    utterance.rate = estimateDubRate(text, cue.durMs);
    utterance.onend = utterance.onerror = () => {
        utteranceRefs = utteranceRefs.filter(ref => ref !== utterance);
    };
    utteranceRefs.push(utterance);
    speechSynthesis.speak(utterance);
}

// 暂停/跳转/关 CC/换视频/关开关时调用；重置 key 使恢复播放后当前 cue 从头重读
export function cancelDub() {
    if (!lastSpokenKey && !utteranceRefs.length && !mutedVideo) return;

    lastSpokenKey = '';
    utteranceRefs = [];
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    restoreMute();
}

function muteVideo(video: HTMLVideoElement) {
    if (mutedVideo === video) return;

    restoreMute();
    mutedVideo = video;
    originalMuted = video.muted;
    video.muted = true;
}

function restoreMute() {
    if (mutedVideo?.isConnected) mutedVideo.muted = originalMuted;
    mutedVideo = null;
}
