import { ArrowRight, Pause, Play } from "lucide-react";
import { motion, useReducedMotion, type Transition } from "motion/react";
import { Link } from "react-router";

import { Button } from "@/ui/Button";
import { HeroVideo, useHeroVideo } from "./HeroVideo";

const WORDMARK = "SurgeGuard";
const LETTERS = Array.from(WORDMARK);

/** Each letter falls from above the fold and settles with a short, damped bounce. */
const DROP_START = 0.35;
const DROP_STAGGER = 0.075;
const DROP_SPRING: Transition = {
  type: "spring",
  stiffness: 240,
  damping: 17,
  mass: 0.9,
};
/** A small alternating tilt so the fall reads as physical rather than mechanical. */
const TILT = [-9, 7, -5, 8, -7, 6, -8, 5, -6, 9];

/** When the last letter has landed: everything after the wordmark is timed from here. */
const LANDED = DROP_START + DROP_STAGGER * (LETTERS.length - 1) + 0.55;

const EASE = [0.2, 0.7, 0.2, 1] as const;

function fadeUp(delay: number) {
  return {
    initial: { opacity: 0, y: 18, filter: "blur(6px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.9, delay, ease: EASE },
  };
}

export function Hero() {
  const reduceMotion = useReducedMotion() ?? false;
  const { sectionRef, videoRef, playing, toggle } = useHeroVideo(reduceMotion);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="hero-title"
      className="relative isolate -mt-16 flex min-h-[640px] items-center justify-center overflow-hidden h-svh"
    >
      <HeroVideo videoRef={videoRef} reduceMotion={reduceMotion} />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center px-4 pt-16 text-center sm:px-6 lg:px-8">
        <motion.p
          {...fadeUp(0.15)}
          className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-ink-strong/15 bg-canvas/35 px-3.5 py-1.5 text-2xs font-medium tracking-[0.22em] text-ink-secondary uppercase backdrop-blur-md sm:mb-8"
        >
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-stable/70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-stable" />
          </span>
          Real-time crowd intelligence
        </motion.p>

        <h1
          id="hero-title"
          aria-label={WORDMARK}
          className="hero-wordmark relative"
        >
          <span aria-hidden className="flex">
            {LETTERS.map((letter, index) => (
              <motion.span
                key={index}
                className="hero-letter inline-block"
                initial={{
                  y: "-70vh",
                  opacity: 0,
                  rotate: TILT[index],
                  filter: "blur(10px)",
                }}
                animate={{ y: 0, opacity: 1, rotate: 0, filter: "blur(0px)" }}
                transition={{
                  default: {
                    ...DROP_SPRING,
                    delay: DROP_START + index * DROP_STAGGER,
                  },
                  opacity: {
                    duration: 0.35,
                    delay: DROP_START + index * DROP_STAGGER,
                  },
                  filter: {
                    duration: 0.6,
                    delay: DROP_START + index * DROP_STAGGER,
                  },
                }}
              >
                {letter}
              </motion.span>
            ))}
          </span>
          {/* A single light sweep across the settled wordmark. Same glyph boxes, so it sits exactly on top. */}
          {!reduceMotion && (
            <span
              aria-hidden
              className="hero-shine pointer-events-none absolute inset-0 flex"
              style={{ animationDelay: `${LANDED + 0.1}s` }}
            >
              {LETTERS.map((letter, index) => (
                <span key={index} className="inline-block">
                  {letter}
                </span>
              ))}
            </span>
          )}
        </h1>

        <motion.span
          aria-hidden
          className="mt-5 block h-px w-40 origin-center bg-linear-to-r from-transparent via-ink-strong/70 to-transparent sm:mt-7 sm:w-64"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 1.1, delay: LANDED - 0.15, ease: EASE }}
        />

        <motion.p
          {...fadeUp(LANDED)}
          className="mt-5 font-serif text-[clamp(1.5rem,3.6vw,2.75rem)] leading-[1.1] text-ink-strong italic sm:mt-7"
        >
          Smart Crowd Management <br className="sm:hidden" />
          <span className="text-ink-secondary">and</span> Alert System
        </motion.p>

        <motion.p
          {...fadeUp(LANDED + 0.15)}
          className="mt-5 max-w-xl text-sm text-ink-secondary sm:text-base"
        >
          Live Crowd Stability Index, queue forecasts and operator guidance from
          the cameras a venue already has.
        </motion.p>

        <motion.div
          {...fadeUp(LANDED + 0.3)}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <Button
            asChild
            variant="primary"
            size="lg"
            className="rounded-full px-6"
          >
            <Link to="/command-center">
              Open the Command Center
              <ArrowRight size={16} aria-hidden />
            </Link>
          </Button>
          <Button
            asChild
            variant="secondary"
            size="lg"
            className="rounded-full border-ink-strong/25 bg-canvas/30 px-6 backdrop-blur-md hover:bg-canvas/55"
          >
            <a href="#how-it-works">How it works</a>
          </Button>
        </motion.div>
      </div>

      <motion.a
        href="#precursors"
        aria-label="Scroll to content"
        className="absolute bottom-7 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-2 text-2xs tracking-[0.3em] text-ink-muted uppercase hover:text-ink sm:flex"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: LANDED + 0.6 }}
      >
        Scroll
        <span className="hero-scroll-cue relative h-10 w-px overflow-hidden bg-ink-strong/15" />
      </motion.a>

      <motion.button
        type="button"
        onClick={toggle}
        aria-label={
          playing ? "Pause background video" : "Play background video"
        }
        className="absolute right-4 bottom-6 z-10 flex size-9 items-center justify-center rounded-full border border-ink-strong/20 bg-canvas/40 text-ink-secondary backdrop-blur-md transition-colors hover:bg-canvas/70 hover:text-ink-strong sm:right-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: LANDED + 0.6 }}
      >
        {playing ? (
          <Pause size={14} aria-hidden />
        ) : (
          <Play size={14} aria-hidden />
        )}
      </motion.button>
    </section>
  );
}
