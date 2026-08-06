let audio: HTMLAudioElement | null = null;

export function playCrowdCheer() {
  if (typeof window === "undefined") return;
  if (!audio) audio = new Audio("/football-crowd-cheering.mp3");
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}

export function stopCrowdCheer() {
  audio?.pause();
}
