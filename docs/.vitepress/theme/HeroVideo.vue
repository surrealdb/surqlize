<script setup lang="ts">
/**
 * The hero video.
 *
 * Nothing plays until the reader asks for it. Autoplay would have forced the
 * video to be muted — browsers only permit it that way — so trading the
 * autoplay for a play button is what buys the audio back.
 *
 * That also removes the need to track focus, tab visibility, or whether a pause
 * was the reader's doing or the browser's: nothing starts on its own, so
 * nothing has to be second-guessed.
 */
import { ref } from "vue";

const video = ref<HTMLVideoElement | null>(null);

/** Mirrors the element, so the badge can follow it. */
const playing = ref(false);

/** Click, Enter or Space toggles playback. */
function toggle(): void {
	const element = video.value;
	if (!element) return;

	// A rejected play() leaves the poster showing, which is the right fallback.
	if (element.paused) void element.play().catch(() => {});
	else element.pause();
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key !== "Enter" && event.key !== " ") return;
	event.preventDefault();
	toggle();
}
</script>

<template>
  <div class="sur-hero-video">
    <video
      ref="video"
      class="sur-hero-video-el"
      src="/assets/surqlize-hero-video.mp4"
      poster="/assets/surqlize-hero-poster.webp"
      width="1280"
      height="720"
      playsinline
      preload="metadata"
      tabindex="0"
      role="button"
      :aria-label="
        playing ? 'Pause the Surqlize demonstration' : 'Play the Surqlize demonstration'
      "
      @click="toggle"
      @keydown="onKeydown"
      @play="playing = true"
      @pause="playing = false"
      @ended="playing = false"
    />

    <!--
      Shown only while paused, so a stopped video does not look broken. The
      video takes the clicks, so this keeps out of their way.
    -->
    <div v-show="!playing" class="sur-hero-video-badge" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M8 5.5v13l11-6.5z" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.sur-hero-video {
  position: relative;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
}

.sur-hero-video-el {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
  object-fit: cover;
  cursor: pointer;
}

.sur-hero-video-el:focus-visible {
  outline: 2px solid var(--sur-green, #2ee096);
  outline-offset: 3px;
}

.sur-hero-video-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: rgba(11, 11, 13, 0.72);
  color: #fff;
  pointer-events: none;
}

/* The play triangle reads as centred when nudged off the optical centre. */
.sur-hero-video-badge svg {
  margin-left: 2px;
}
</style>
