import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import { useTabVisible } from "@/lib/hooks/useTabVisible";

/**
 * Background footage for the hero: the first 20 s of the brand film, muted and
 * looped. Mobile gets a 720p encode; desktop a 1080p VP9 with an H.264 fallback.
 */
const SOURCES = [
  {
    src: "/media/hero-bg-720.mp4",
    type: "video/mp4",
    media: "(max-width: 767px)",
  },
  { src: "/media/hero-bg-1080.webm", type: "video/webm" },
  { src: "/media/hero-bg-1080.mp4", type: "video/mp4" },
];
const POSTER = "/media/poster.jpg";

/**
 * Plays only while the hero is on screen and the tab is showing. Under reduced
 * motion it holds the poster until the viewer presses play; a viewer's own
 * pause is respected across scrolls.
 */
export function useHeroVideo(reduceMotion: boolean) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const tabVisible = useTabVisible();
  const [inView, setInView] = useState(true);
  const [wantsPlay, setWantsPlay] = useState(!reduceMotion);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((entry) => entry.isIntersecting)),
      {
        threshold: 0.05,
      },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (wantsPlay && inView && tabVisible) {
      // Autoplay can still be refused (data saver, low-power mode): the poster stays up.
      video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }, [wantsPlay, inView, tabVisible]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, []);

  const toggle = useCallback(() => setWantsPlay(!playing), [playing]);

  return { sectionRef, videoRef, playing, toggle };
}

export function HeroVideo({
  videoRef,
  reduceMotion,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  reduceMotion: boolean;
}) {
  return (
    <div aria-hidden className="absolute inset-0 -z-10 bg-canvas">
      <video
        ref={videoRef}
        className={
          reduceMotion
            ? "size-full object-cover"
            : "hero-video size-full object-cover"
        }
        poster={POSTER}
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        tabIndex={-1}
      >
        {SOURCES.map((source) => (
          <source key={source.src} {...source} />
        ))}
      </video>

      {/* Legibility: darken the top for the nav, pool shadow behind the type, fade into the page below. */}
      <div className="absolute inset-0 bg-canvas/35" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_50%,rgb(11_14_17/0.55),transparent_75%)]" />
      <div className="absolute inset-x-0 top-0 h-40 bg-linear-to-b from-canvas/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-canvas via-canvas/70 to-transparent" />
      <div className="hero-grain absolute inset-0 opacity-[0.07] mix-blend-overlay" />
    </div>
  );
}
