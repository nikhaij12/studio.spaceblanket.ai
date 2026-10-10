import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What Studio by Spaceblanket.ai can make",
};

/**
 * The one page of documentation.
 *
 * It exists because the main screen deliberately shows almost nothing about
 * what is possible — two example sentences and a box. That is right for the
 * screen you work on and wrong for the moment before you start, when the honest
 * question is "what can I even ask for". So: one page, skimmed in a minute,
 * then closed.
 *
 * Every entry is one line about the thing and one line you could type to get
 * it. Anything longer would be a manual, and there is nothing here to learn —
 * only things to know are possible. The icons carry the scanning, so the prose
 * does not have to.
 */

type Thing = { icon: React.ReactNode; what: string; says: string; ask: string };

const MAKES: Thing[] = [
  {
    icon: <PhotosIcon />,
    what: "A reel from photos",
    says: "Your pictures and your voice, with motion and music.",
    ask: "Make a 30-second reel from these photos.",
  },
  {
    icon: <BeatIcon />,
    what: "Footage cut to music",
    says: "Every cut lands on the beat. Clips optional.",
    ask: "Cut this footage to the beat.",
  },
  {
    icon: <CaptionIcon />,
    what: "Captions on a talking head",
    says: "Thirty-six looks. Words can pass behind you.",
    ask: "Add captions to this clip.",
  },
  {
    icon: <SparkIcon />,
    what: "Motion graphics from nothing",
    says: "Kinetic type, counting numbers, charts, logo stings.",
    ask: "Animate this number counting up to 40,000.",
  },
  {
    icon: <ExplainIcon />,
    what: "An explainer with no camera",
    says: "Notes or a topic in, narrated video out.",
    ask: "Turn these notes into a 60-second explainer.",
  },
  {
    icon: <OverlayIcon />,
    what: "Graphics over an interview",
    says: "Titles and callouts on top of your clip.",
    ask: "Package this interview with on-screen graphics.",
  },
  {
    icon: <LinkIcon />,
    what: "A promo from a link",
    says: "Paste the page on the left. It reads it and builds from it.",
    ask: "Make a launch video for this page.",
  },
  {
    icon: <DeckIcon />,
    what: "A deck you can present",
    says: "Slides you click through, not a rendered file.",
    ask: "Turn this into a deck.",
  },
  {
    icon: <AnythingIcon />,
    what: "Whatever else you describe",
    says: "Title cards, montages, brand reels, a Figma design.",
    ask: "Open on a title card, then the first shot.",
  },
];

const FINDS: Thing[] = [
  {
    icon: <MusicIcon />,
    what: "Music and sound",
    says: "Beds and effects, found or generated, mixed under you.",
    ask: "Put something calmer under this.",
  },
  {
    icon: <StockIcon />,
    what: "Pictures and voices",
    says: "Stock shots, icons, logos, a spoken script, a transcript.",
    ask: "Find a shot of a city at night.",
  },
  {
    icon: <LookIcon />,
    what: "A look",
    says: "Colour grades and film looks. Vague is fine.",
    ask: "Same edit, warmer and filmier.",
  },
];

export default function Docs() {
  return (
    <>
      <div className="ambient" aria-hidden />
      <div className="grain" aria-hidden />
      <div className="paper">
        <header className="paper-top">
          <Link className="back" href="/">
            ← Studio
          </Link>
        </header>

        <article className="doc">
          <h1>What you can ask for</h1>
          <p className="lede">
            The box in the middle takes plain English. No settings, no menu — say
            it the way you would say it to a person.
          </p>

          <h2>It makes</h2>
          <ul className="things">
            {MAKES.map((t) => (
              <Row key={t.what} thing={t} />
            ))}
          </ul>

          <h2>It finds, so you don&rsquo;t have to</h2>
          <ul className="things">
            {FINDS.map((t) => (
              <Row key={t.what} thing={t} />
            ))}
          </ul>
          <p className="lede small">
            This half is the one that reaches outside your machine, so it is the
            one with a setup step: the <code>heygen</code> command, signed in.
            Everything above it works on your own files alone.
          </p>

          <h2>Getting what you want</h2>
          <ul className="tips">
            <li>Say the outcome, not the steps.</li>
            <li>One change per message.</li>
            <li>Click an earlier cut to talk about that one.</li>
            <li>
              Like the look? Save this style, name it, and it becomes a chip
              above the box — click it to use it on anything else.
            </li>
            <li>
              Admire someone else&rsquo;s video? New style from a video, above
              the box, studies a few frames of it on your machine and saves the
              look as a chip too.
            </li>
            <li>
              Done with a reel? The switcher by the wordmark deletes it — two
              clicks, because there is no undo.
            </li>
          </ul>

          <p className="lede small">
            Underneath is Claude Code with HeyGen&rsquo;s open-source HyperFrames.
            Videos are built as web pages and rendered on your own machine —
            nothing uploaded, no cost per video.
          </p>

          <p className="close">
            <Link className="back" href="/">
              ← Back to the studio
            </Link>
          </p>
        </article>
      </div>
    </>
  );
}

function Row({ thing }: { thing: Thing }) {
  return (
    <li>
      <span className="mark" aria-hidden>
        {thing.icon}
      </span>
      <span className="say">
        <h3>{thing.what}</h3>
        <p>{thing.says}</p>
        <p className="ask">{thing.ask}</p>
      </span>
    </li>
  );
}

/**
 * One drawing surface for all twelve. A 20-unit box at one stroke weight keeps
 * them reading as one hand — twelve icons at three weights would be twelve
 * different drawings sharing a page.
 */
function Ico({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/* A stack of pictures. */
function PhotosIcon() {
  return (
    <Ico>
      <rect x="2" y="5.5" width="12" height="10" rx="2" />
      <path d="M6 3.2h8.4a2 2 0 0 1 2 2v7.3" />
      <path d="M2.4 13 5.8 9.8l2.1 1.8 2-1.7 3.6 3.2" />
      <circle cx="5.4" cy="8.4" r="0.9" fill="currentColor" stroke="none" />
    </Ico>
  );
}

/* A beat grid: bars with the cut landing on one. */
function BeatIcon() {
  return (
    <Ico>
      <path d="M2.5 8.4v3.2M6 5.6v8.8M9.5 7.4v5.2M13 3.6v12.8M16.5 8v4" />
    </Ico>
  );
}

/* Two lines of subtitle in a frame. */
function CaptionIcon() {
  return (
    <Ico>
      <rect x="2.2" y="4" width="15.6" height="12" rx="2" />
      <path d="M5.4 9.4h5.2M13 9.4h1.6M5.4 12.4h2.4M10.2 12.4h4.4" />
    </Ico>
  );
}

/* Motion out of nothing: a burst. */
function SparkIcon() {
  return (
    <Ico>
      <path d="M10 2.4v3.4M10 14.2v3.4M2.4 10h3.4M14.2 10h3.4M4.9 4.9l2.4 2.4M12.7 12.7l2.4 2.4M15.1 4.9l-2.4 2.4M7.3 12.7l-2.4 2.4" />
      <circle cx="10" cy="10" r="2.1" />
    </Ico>
  );
}

/* Text becoming a picture. */
function ExplainIcon() {
  return (
    <Ico>
      <path d="M3 4.6h6M3 8h6M3 11.4h4" />
      <rect x="11.4" y="5.6" width="6.2" height="8.8" rx="1.6" />
      <path d="M13.9 8.6 16.2 10l-2.3 1.4Z" fill="currentColor" />
    </Ico>
  );
}

/* A frame wearing a lower third and a picture-in-picture. */
function OverlayIcon() {
  return (
    <Ico>
      <rect x="2.2" y="3.6" width="15.6" height="12.8" rx="2" />
      <rect x="4.4" y="12.2" width="7.6" height="2.4" rx="1" fill="currentColor" stroke="none" opacity="0.85" />
      <rect x="11.8" y="5.8" width="4.4" height="3.6" rx="1" />
    </Ico>
  );
}

/* A link. */
function LinkIcon() {
  return (
    <Ico>
      <path d="M8.4 11.6a3.3 3.3 0 0 0 4.7 0l2.4-2.4a3.3 3.3 0 0 0-4.7-4.7l-1 1" />
      <path d="M11.6 8.4a3.3 3.3 0 0 0-4.7 0l-2.4 2.4a3.3 3.3 0 0 0 4.7 4.7l1-1" />
    </Ico>
  );
}

/* Slides. */
function DeckIcon() {
  return (
    <Ico>
      <rect x="2.4" y="3.6" width="15.2" height="9.6" rx="1.8" />
      <path d="M7.4 16.4h5.2M10 13.2v3.2" />
    </Ico>
  );
}

/* An asterisk: the open case. */
function AnythingIcon() {
  return (
    <Ico>
      <path d="M10 3.4v13.2M4.3 6.7l11.4 6.6M15.7 6.7 4.3 13.3" />
    </Ico>
  );
}

/* A note. */
function MusicIcon() {
  return (
    <Ico>
      <path d="M8 14.4V4.6l8-1.7v9.5" />
      <circle cx="5.8" cy="14.6" r="2.2" />
      <circle cx="13.8" cy="12.4" r="2.2" />
    </Ico>
  );
}

/* A picture found for you. */
function StockIcon() {
  return (
    <Ico>
      <rect x="2.4" y="4" width="15.2" height="12" rx="2" />
      <path d="M3 13.4 6.8 9.6l2.4 2.2 2.6-2.4 4.8 4.4" />
      <circle cx="6.6" cy="7.8" r="1.1" fill="currentColor" stroke="none" />
    </Ico>
  );
}

/* Two tones: the grade. */
function LookIcon() {
  return (
    <Ico>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 3a7 7 0 0 1 0 14Z" fill="currentColor" stroke="none" opacity="0.85" />
    </Ico>
  );
}
