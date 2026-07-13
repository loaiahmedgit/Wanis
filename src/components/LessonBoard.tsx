import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LessonBoardSpec, LessonSection, SectionRole } from "../explain/lessonBoard";
import { packBoard, unionRect, type MeasuredSection, type Region, type Rect, type BoardLayout } from "../board/boardLayout";
import { fitTransform, overviewTransform, transformCss, lerpTransform, easeInOutCubic, type Transform, type Viewport } from "../board/boardCamera";
import { lineDurationMs, graphDurationMs } from "../explain/timing";
import { Line, measureHandLine, type HandKind } from "./Line";
import { StrokePlayer } from "./StrokePlayer";

interface LessonBoardProps {
  board: LessonBoardSpec;
  /** Bumped when a new lesson should start from the top. */
  planToken: number;
}

const BOARD_WIDTH = 1100; // wrap threshold (board units)
const GAP = 64;
const SCENE_H = 300; // target height for a diagram section
const CAMERA_MS = 850;
const HOLD_MS = 700;
const REDUCED_DWELL = 900;
const MOBILE_MAX = 640;

const KIND_BY_ROLE: Record<Exclude<SectionRole, "sceneGraph">, HandKind> = {
  heading: "title",
  explanation: "text",
  equation: "equation",
  callout: "equation",
};

/** Split on hard newlines, then word-wrap long explanation lines. */
function wrapLines(role: SectionRole, text: string): string[] {
  const hard = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (role !== "explanation") return hard.length ? hard : [text];
  const out: string[] = [];
  const MAX = 34;
  for (const line of hard) {
    if (line.length <= MAX) {
      out.push(line);
      continue;
    }
    let cur = "";
    for (const word of line.split(/\s+/)) {
      if (cur && (cur + " " + word).length > MAX) {
        out.push(cur);
        cur = word;
      } else {
        cur = cur ? cur + " " + word : word;
      }
    }
    if (cur) out.push(cur);
  }
  return out.length ? out : [text];
}

interface Measured {
  section: LessonSection;
  lines: string[];
  size: { w: number; h: number };
}

function measureSection(s: LessonSection): Measured {
  if (s.role === "sceneGraph" && s.program) {
    const [, , vbW, vbH] = s.program.viewBox;
    const aspect = vbH > 0 ? vbW / vbH : 1.6;
    return { section: s, lines: [], size: { w: Math.round(SCENE_H * aspect), h: SCENE_H } };
  }
  const kind = KIND_BY_ROLE[s.role as Exclude<SectionRole, "sceneGraph">];
  const lines = wrapLines(s.role, s.text ?? "");
  const lineH = measureHandLine(kind, "Xg").h;
  let w = 16;
  for (const ln of lines) w = Math.max(w, measureHandLine(kind, ln).w);
  return { section: s, lines, size: { w, h: lines.length * lineH } };
}

function buildLayout(board: LessonBoardSpec): { layout: BoardLayout; measured: Measured[] } {
  const measured = board.sections.map(measureSection);
  const items: MeasuredSection[] = measured.map((m) => ({
    id: m.section.id,
    role: m.section.role,
    w: m.size.w,
    h: m.size.h,
    target: m.section.target,
  }));
  const layout = packBoard(items, { boardWidth: BOARD_WIDTH, gap: GAP, dir: board.readingDirection });
  return { layout, measured };
}

function sectionDurationMs(m: Measured): number {
  if (m.section.role === "sceneGraph" && m.section.program) return graphDurationMs(m.section.program);
  return m.lines.reduce((t, ln) => t + lineDurationMs(ln) + 200, 0);
}

// ---- One text section: reveals its wrapped lines top-to-bottom while writing ----

function SectionText({ role, lines, isWriting, sectionId, planToken }: {
  role: SectionRole;
  lines: string[];
  isWriting: boolean;
  sectionId: string;
  planToken: number;
}) {
  const kind = KIND_BY_ROLE[role as Exclude<SectionRole, "sceneGraph">];
  const [revealed, setRevealed] = useState(isWriting ? 0 : lines.length);

  useEffect(() => {
    setRevealed(isWriting ? 0 : lines.length);
  }, [isWriting, planToken, lines.length]);

  useEffect(() => {
    if (!isWriting || revealed >= lines.length) return;
    const wait = lineDurationMs(lines[revealed]) + 200;
    const t = setTimeout(() => setRevealed((c) => c + 1), wait);
    return () => clearTimeout(t);
  }, [isWriting, revealed, lines]);

  return (
    <div className={`board-text board-${role}`}>
      {lines.map((ln, i) =>
        !isWriting || i <= revealed ? (
          <Line key={i} step={{ id: `${sectionId}-l${i}`, kind, content: ln }} isWriting={isWriting && i === revealed} />
        ) : null,
      )}
    </div>
  );
}

function SectionView({ m, isWriting, planToken }: { m: Measured; isWriting: boolean; planToken: number }) {
  const s = m.section;
  if (s.role === "sceneGraph" && s.program) {
    return (
      <div className="board-graph">
        <StrokePlayer program={s.program} isWriting={isWriting} durationMs={graphDurationMs(s.program)} />
      </div>
    );
  }
  return <SectionText role={s.role} lines={m.lines} isWriting={isWriting} sectionId={s.id} planToken={planToken} />;
}

export function LessonBoard({ board, planToken }: LessonBoardProps) {
  const { layout, measured } = useMemo(() => buildLayout(board), [board]);
  const regionById = useMemo(() => {
    const map = new Map<string, Region>();
    for (const r of layout.regions) map.set(r.id, r);
    return map;
  }, [layout]);

  const clipRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [writingSection, setWritingSection] = useState(-1);

  useLayoutEffect(() => {
    const clip = clipRef.current;
    const boardEl = boardRef.current;
    if (!clip || !boardEl) return;
    const cancel = { done: false };
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const vp: Viewport = { w: clip.clientWidth || 900, h: clip.clientHeight || 600 };
    const mobile = vp.w < MOBILE_MAX;
    const marginFrac = mobile ? 0.05 : 0.08;
    const boardRect: Rect = { x: 0, y: 0, w: layout.width, h: layout.height };

    const focusOf = (i: number): Transform => {
      const m = measured[i];
      const region = regionById.get(m.section.id);
      if (!region) return overviewTransform(boardRect, vp, marginFrac);
      let target: Rect = region.content;
      // A targeted callout is framed together with its target so the relationship reads.
      if (m.section.role === "callout" && m.section.target) {
        const tr = regionById.get(m.section.target);
        if (tr) target = unionRect(region.content, tr.content);
      }
      return fitTransform(target, vp, { marginFrac, mobile });
    };

    let current: Transform = focusOf(0);
    boardEl.style.transform = transformCss(current);

    const tween = (to: Transform): Promise<void> =>
      new Promise((resolve) => {
        if (reduceMotion || CAMERA_MS <= 0) {
          current = to;
          boardEl.style.transform = transformCss(to);
          return resolve();
        }
        const from = current;
        const start = performance.now();
        const tick = (now: number) => {
          if (cancel.done) return resolve();
          const t = Math.min(1, (now - start) / CAMERA_MS);
          current = lerpTransform(from, to, easeInOutCubic(t));
          boardEl.style.transform = transformCss(current);
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });

    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    (async () => {
      for (let i = 0; i < measured.length; i++) {
        if (cancel.done) return;
        setWritingSection(-1);
        await tween(focusOf(i)); // camera moves only BETWEEN sections
        if (cancel.done) return;
        setWritingSection(i); // now draw this section, camera held
        await wait(reduceMotion ? REDUCED_DWELL : sectionDurationMs(measured[i]));
        if (cancel.done) return;
        await wait(HOLD_MS); // hold on the completed section
      }
      if (cancel.done) return;
      setWritingSection(-1);
      await tween(overviewTransform(boardRect, vp, marginFrac)); // final whole-board overview
    })();

    return () => {
      cancel.done = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, planToken]);

  return (
    <div className="lesson-board-clip" ref={clipRef}>
      <div className="lesson-board" ref={boardRef} style={{ width: layout.width, height: layout.height }}>
        {measured.map((m, i) => {
          const region = regionById.get(m.section.id);
          if (!region) return null;
          return (
            <div
              key={`${planToken}-${m.section.id}`}
              className={`board-section role-${m.section.role}`}
              style={{ left: region.content.x, top: region.content.y, width: region.content.w, height: region.content.h }}
            >
              <SectionView m={m} isWriting={writingSection === i} planToken={planToken} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
