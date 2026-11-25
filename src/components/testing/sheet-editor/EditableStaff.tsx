import RhythmSymbol from '../../brodle/components/RhythmSymbol';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import abcjs from 'abcjs';
import {
  eventTones,
  CLEFS,
  isTap,
  notationTones,
  staffPitch,
  shiftPitch,
  staffGeometry,
  svgPoint,
  tentativeOperation,
  rhythmTargets,
  commandAt,
  pitchY,
  pitchMidi,
  staffStep,
  POINTER_MAX,
  measureTicks, meterBeatTicks, meterName, DEFAULT_METER, DEFAULT_TEMPO_BEAT,
  totalTicks,
} from './sheetEditorModel';
import type {
  Bounds,
  Caret,
  EditorMode,
  EntryTool,
  Gesture,
  PlacementCommand,
  ScoreEvent,
  StaffGeometry,
} from './sheetEditorModel';
import { scoreNotation, legalCut } from './sheetEditorNotation';
import type { ScoreFragment } from './sheetEditorNotation';
import { scoreRowCuts } from './sheetEditorLayout';
import { eventData } from './sheetEditorCode';
import { inputPitch, refKey, scoreWithPartEvents } from './scoreModel';
import type { Score, NoteRef } from './scoreModel';

type Command = PlacementCommand & { staffId?: string };
type Props = EntryTool & {
  zoom?: number;
  fixedClef?: boolean;
  onProperty?: (kind: 'clef' | 'key' | 'meter' | 'tempo', staffId: string, anchor?: HTMLElement) => void;
  onAddMeasure?: () => void;
  staffActions?: ReactNode;
  score?: Score;
  activeStaffId?: string;
  selection?: readonly NoteRef[];
  entryKind?: 'note' | 'rest';
  entryAccidental?: number | 'key';
  locked?: boolean;
  interactionVersion?: number;
  revision: number;
  mode: EditorMode;
  modeVersion: number;
  targetId: string | null;
  onClearSelection: () => void;
  events: readonly ScoreEvent[];
  selectedId: string | null;
  selectedToneId?: string | null;
  caret: Caret;
  onPlace: (caret: Caret & { staffId?: string }) => void;
  onCaret: (caret: Caret & { staffId?: string }) => void;
  onPitchStep?: (delta: -1 | 1) => void;
  onSelect: (id: string, toneId?: string, staffId?: string, toggle?: boolean) => void;
  onAddTone: (command: Extract<Command, { kind: 'add-tone' }>) => void;
  requestedOperation?: {
    token: number;
    modeVersion: number;
    revision: number;
    interactionVersion?: number;
    command: Command;
  } | null;
  onDelete: (id: string) => void;
  onUndo: () => void;
  onTranspose: (delta: -1 | 1) => void;
};
type Fragment = Bounds & ScoreFragment & { id: string; staffId: string; rest: boolean };
type Head = {
  eventId: string;
  toneId: string;
  staffId: string;
  x: number;
  y: number;
  row: number;
  fragment: number;
  glyph?: SVGElement;
};
type Column = {
  id: string;
  staffId: string;
  start: number;
  end: number;
  x: number;
  endX: number;
  rest: boolean;
  row: number;
};
type System = {
  geometry: StaffGeometry;
  top: number;
  bottom: number;
  index: number;
  staffId: string;
  system: number;
  bottomMidi: number;
  minimum: number;
};
type Scene = {
  element: HTMLDivElement;
  svg: SVGSVGElement;
  width: number;
  height: number;
  viewportWidth: number;
  zoom: number;
  rows: System[];
  columns: Column[];
  fragments: Fragment[];
  heads: Head[];
  tune: ReturnType<typeof abcjs.renderAbc>[number];
  events: readonly ScoreEvent[];
  score: Score;
  signature: string;
  mapping: ScoreFragment[];
};
const STAFF_ACTION_GAP = 48;
const snapshot = (props: Props): Score =>
  props.score ?? {
    meter: DEFAULT_METER, tempoBeat: DEFAULT_TEMPO_BEAT,
    bpm: 120,
    key: 'C',
    staffs: [{ id: 'staff-1', clef: 'treble', events: props.events as ScoreEvent[] }],
  };
const signature = (score: Score) =>
  JSON.stringify({
    meter: score.meter ?? DEFAULT_METER, tempoBeat: score.tempoBeat ?? DEFAULT_TEMPO_BEAT,
    bpm: score.bpm,
    key: score.key,
    staffs: score.staffs.map((s) => ({
      id: s.id,
      clef: s.clef,
      events: s.events.map(eventData),
    })),
  });
function candidateScore(props: Props, command: Command): Score | null {
  const score = snapshot(props),
    id = command.staffId ?? props.activeStaffId ?? score.staffs[0].id,
    staff = score.staffs.find((s) => s.id === id);
  if (!staff) return null;
  const accidental = inputPitch(
    command.pitch,
    (props.entryAccidental ?? props.accidental) as -1 | 0 | 1 | 'key',
    score.key,
  ).accidental;
  const events = tentativeOperation(staff.events, command, {
    duration: props.duration,
    dotted: props.dotted,
    staccato: props.staccato,
    accidental,
    entryKind: props.entryKind,
  }, measureTicks(score.meter));
  return events ? scoreWithPartEvents(score, id, events) : null;
}
function boundsInSvg(element: SVGGraphicsElement, svg: SVGSVGElement): Bounds {
  // Stay in the SVG coordinate system. Screen rectangles depend on browser
  // layout/zoom and can be unavailable while Firefox settles a new SVG.
  // Use the same outer coordinate space for both matrices. Firefox's root
  // getCTM can omit the responsive viewBox scale while a child's includes it.
  const box = element.getBBox(),
    screenMatrices = typeof element.getScreenCTM === 'function',
    elementMatrix = screenMatrices ? element.getScreenCTM() : element.getCTM(),
    rootMatrix = screenMatrices ? svg.getScreenCTM() : svg.getCTM();
  if (!elementMatrix || !rootMatrix) throw new Error('SVG transform unavailable');
  const relative = rootMatrix.inverse().multiply(elementMatrix);
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
  ].map((point) => svgPoint(point, relative));
  return {
    left: Math.min(...corners.map((p) => p.x)),
    right: Math.max(...corners.map((p) => p.x)),
    top: Math.min(...corners.map((p) => p.y)),
    bottom: Math.max(...corners.map((p) => p.y)),
  };
}
function measureRows(svg: SVGSVGElement, score: Score): System[] {
  const staves = [...svg.querySelectorAll<SVGGElement>('g.abcjs-staff')],
    headers = [...svg.querySelectorAll<SVGGraphicsElement>('g.abcjs-staff-extra')].map((h) =>
      boundsInSvg(h, svg),
    );
  if (!staves.length) throw new Error('Missing staff geometry');
  // Fitting can wrap systems in SVG groups. Physical staff order remains
  // authoritative even when the renderer's DOM order changes.
  const measured = staves
    .map((staff) =>
      [...staff.querySelectorAll<SVGGraphicsElement>('path,line')].map((line) =>
        boundsInSvg(line, svg),
      ),
    )
    .sort((a, b) => Math.max(...a.map((l) => l.bottom)) - Math.max(...b.map((l) => l.bottom)));
  return measured.map((lines, index) => {
    const part = score.staffs[index % score.staffs.length],
      bottom = Math.max(...lines.map((line) => line.bottom)),
      rowHeaders = headers.filter((h) => Math.abs((h.top + h.bottom) / 2 - bottom) < 50);
    const geometry = staffGeometry(
      lines,
      Math.max(...rowHeaders.map((h) => h.right), lines[0]?.left ?? 0),
      [],
      0,
    );
    if (!geometry) throw new Error('Invalid staff geometry');
    return {
      geometry,
      top: 0,
      bottom: 0,
      index,
      staffId: part.id,
      system: Math.floor(index / score.staffs.length),
      bottomMidi: CLEFS[part.clef].bottomMidi,
      minimum: CLEFS[part.clef].minimum,
    };
  });
}
function bindEvents(scene: Scene, score: Score) {
  const groups = [...scene.svg.querySelectorAll<SVGGraphicsElement>('g.abcjs-note, g.abcjs-rest')]
    .map((group, order) => ({
      group,
      order: Number(group.dataset.fragment ?? order),
      bounds: boundsInSvg(group, scene.svg),
    }))
    .filter(({ bounds }) => bounds.right > bounds.left)
    .sort((a, b) => a.order - b.order);
  scene.fragments = groups.flatMap(({ group, bounds }, index) => {
    const map = scene.mapping[index],
      staff = map && score.staffs[map.staffIndex],
      event = staff?.events[map.eventIndex];
    if (!event) return [];
    group.dataset.eventId = event.id;
    group.dataset.staffId = staff.id;
    group.dataset.row = String(map.row);
    group.dataset.fragment = String(index);
    return [
      {
        ...map,
        id: event.id,
        staffId: staff.id,
        rest: !eventTones(event).length,
        ...bounds,
      },
    ];
  });
  scene.heads = scene.tune.getSelectableArray().flatMap((sel) => {
    const group = sel.svgEl.closest<SVGElement>('[data-event-id]'),
      staff = score.staffs.find((s) => s.id === group?.dataset.staffId),
      event = staff?.events.find((e) => e.id === group?.dataset.eventId);
    if (!staff || !event) return [];
    const tones = notationTones(event),
      row = Number(group?.dataset.row ?? 0),
      glyphs = sel.svgEl.querySelectorAll<SVGElement>('.abcjs-notehead');
    return (sel.absEl.notePositions ?? []).flatMap((p, i) =>
      tones[i]
        ? [
            {
              eventId: event.id,
              toneId: tones[i].id,
              staffId: staff.id,
              x: p.x,
              y: p.y,
              row,
              fragment: Number(group?.dataset.fragment ?? 0),
              glyph: glyphs[i],
            },
          ]
        : [],
    );
  });
  if (score.staffs.some((s) => s.events.some((e) => eventTones(e).length)) && !scene.heads.length)
    throw new Error('Missing notehead geometry');
  const bars = [...scene.svg.querySelectorAll<SVGGraphicsElement>('g.abcjs-bar')].map((bar) =>
    boundsInSvg(bar, scene.svg),
  );
  scene.columns = scene.fragments.map((fragment, index) => {
    const head = scene.heads.find((h) => h.fragment === index),
      next = scene.fragments[index + 1],
      row = scene.rows[fragment.row];
    const nextHead = next && scene.heads.find((h) => h.fragment === index + 1),
      x = head?.x ?? (fragment.left + fragment.right) / 2;
    const bar =
      fragment.end % measureTicks(score.meter) === 0
        ? bars
            .filter(
              (b) =>
                Math.abs((b.top + b.bottom) / 2 - (row.geometry.bottom - 4 * row.geometry.step)) <
                  row.geometry.step * 3 && b.left > x,
            )
            .sort((a, b) => a.left - b.left)[0]
        : undefined;
    return {
      id: fragment.id,
      staffId: fragment.staffId,
      start: fragment.start,
      end: fragment.end,
      row: fragment.row,
      rest: fragment.rest,
      x,
      endX:
        bar?.left ??
        (next?.row === fragment.row
          ? (nextHead?.x ?? (next.left + next.right) / 2)
          : row.geometry.right),
    };
  });
  for (const row of scene.rows) {
    const fragments = scene.fragments.filter((f) => f.row === row.index);
    row.top = Math.min(
      pitchY(POINTER_MAX, row.geometry, row.bottomMidi) - 16,
      ...fragments.map((f) => f.top - 16),
    );
    row.bottom = Math.max(
      pitchY(row.minimum, row.geometry, row.bottomMidi) + 16,
      ...fragments.map((f) => f.bottom + 16),
    );
  }
  scene.score = score;
  scene.events = score.staffs[0].events;
}
function engrave(element: HTMLDivElement, score: Score, viewportWidth: number, zoom = 1, controls = false): Scene {
  const leftPadding = 16, rightPadding = controls ? 128 / zoom : 16;
  const width = Math.max(360, Math.floor(viewportWidth / zoom)),
    register = score.staffs.flatMap((s) =>
      s.events.flatMap((e) =>
        eventTones(e).map((t) => staffStep(pitchMidi({ ...t.spelling, accidental: 0 }))),
      ),
    );
  const low = Math.min(
      ...score.staffs.map((s) => staffStep(CLEFS[s.clef].minimum)),
      ...register,
    ),
    high = Math.max(staffStep(POINTER_MAX), ...register),
    separation = Math.max(140, Math.ceil(((high - low) * 4 + 64) * 0.75));
  let cuts: number[] = [],
    packed = false;
  for (
    let attempt = 0;
    attempt <= score.staffs.reduce((n, s) => n + s.events.length, 0) + 1;
    attempt++
  ) {
    const notation = scoreNotation(score, cuts, separation);
    element.replaceChildren();
    element.style.width = width + 'px';
    const [tune] = abcjs.renderAbc(element, notation.abc, {
      afterParsing: notation.afterParsing,
      responsive: 'resize',
      add_classes: true,
      foregroundColor: 'currentColor',
      selectionColor: 'currentColor',
      staffwidth: Math.max(220, width - leftPadding - rightPadding),
      paddingleft: leftPadding,
      paddingright: rightPadding,
      paddingtop: 24,
      paddingbottom: 90,
    });
    const svg = element.querySelector('svg');
    if (!svg || !svg.viewBox.baseVal.width) throw new Error('Missing score');
    const height = (svg.viewBox.baseVal.height * width) / svg.viewBox.baseVal.width;
    element.style.width = width + 'px';
    element.style.height = height + 'px';
    element.style.paddingBottom = '0';
    svg.setAttribute('aria-hidden', 'true');
    const scene: Scene = {
      element,
      svg,
      width,
      height,
      viewportWidth,
      zoom,
      rows: measureRows(svg, score),
      columns: [],
      fragments: [],
      heads: [],
      tune,
      score,
      events: score.staffs[0].events,
      signature: signature(score),
      mapping: notation.fragments,
    };
    bindEvents(scene, score);
    if (!packed) {
      packed = true;
      const weights: Record<string, number> = {};
      for (const f of scene.fragments)
        weights[JSON.stringify([f.staffId, f.id])] = Math.max(
          weights[JSON.stringify([f.staffId, f.id])] ?? 36,
          f.right - f.left + 22,
        );
      const proposed = scoreRowCuts(
        score,
        weights,
        width - Math.max(...scene.rows.map((row) => row.geometry.left)) - rightPadding,
      );
      if (proposed.length) {
        cuts = proposed;
        continue;
      }
    }
    const overflow = scene.rows.find((row) =>
      scene.fragments.some((f) => f.row === row.index && f.right > width - rightPadding),
    );
    if (overflow) {
      const ticks = [
        ...new Set(
          scene.fragments
            .filter((f) => scene.rows[f.row].system === overflow.system)
            .map((f) => f.start)
            .filter((t) => legalCut(score, t)),
        ),
      ].sort((a, b) => a - b);
      if (ticks.length > 1) {
        cuts = [...cuts, ticks[Math.ceil(ticks.length / 2)]].sort((a, b) => a - b);
        continue;
      }
      // An indivisible group must remain readable. Keep its natural width
      // and allow the local viewport to scroll instead of compressing glyphs.
      const right = Math.max(width - 16, ...scene.fragments.map((f) => f.right));
      svg.setAttribute('viewBox', `0 0 ${Math.ceil(right + rightPadding)} ${svg.viewBox.baseVal.height}`);
    }
    // The SVG and every overlay use the same local coordinates. Physical sizing
    // implements zoom; native getScreenCTM maps input after scrolling/scaling.
    const top = Math.min(0, ...scene.rows.map((row) => row.top)),
      bottom = Math.max(
        scene.svg.viewBox.baseVal.height,
        ...scene.rows.map((row) => row.bottom + (controls ? (STAFF_ACTION_GAP + 64) / zoom : 24)),
      );
    if (top < 0 || bottom > scene.svg.viewBox.baseVal.height)
      scene.svg.setAttribute(
        'viewBox',
        `0 ${top} ${scene.svg.viewBox.baseVal.width} ${bottom - top}`,
      );
    scene.width = scene.svg.viewBox.baseVal.width * zoom;
    scene.height = scene.svg.viewBox.baseVal.height * zoom;
    element.style.width = scene.width + 'px';
    element.style.height = scene.height + 'px';
    element.style.paddingBottom = '0';

    return scene;
  }
  throw new Error('Unable to fit score rows');
}
function measuredTargets(scene: Scene, duration: EntryTool['duration']) {
  return scene.score.staffs.flatMap((staff) =>
    rhythmTargets(staff.events, duration).flatMap((tick) => {
      const span = scene.columns.find(
        (c) => c.staffId === staff.id && tick >= c.start && (tick < c.end || (tick === totalTicks(staff.events) && tick === c.end)),
      );
      return span
        ? [
            {
              tick,
              staffId: staff.id,
              row: span.row,
              geometry: scene.rows[span.row].geometry,
              bottomMidi: scene.rows[span.row].bottomMidi,
              minimum: scene.rows[span.row].minimum,
              x: span.x + ((span.endX - span.x) * (tick - span.start)) / (span.end - span.start),
            },
          ]
        : [];
    }),
  );
}
type Marking = { kind: 'clef' | 'key' | 'meter' | 'tempo'; staffId: string; bounds: Bounds };
function markings(scene: Scene): Marking[] {
  const result: Marking[] = [];
  for (const [kind, selector] of [['clef','g.abcjs-clef'],['key','g.abcjs-key-signature'],['meter','g.abcjs-time-signature'],['tempo','g.abcjs-tempo']] as const) {
    for (const element of scene.svg.querySelectorAll<SVGGraphicsElement>(selector)) {
      if (!element.matches?.(selector)) continue;
      let bounds: Bounds;
      try { bounds = boundsInSvg(element, scene.svg); } catch { continue; }
      if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) continue;
      const center = (bounds.top + bounds.bottom) / 2;
      const row = [...scene.rows].sort((a,b) => Math.abs(a.geometry.bottom - 4*a.geometry.step - center) - Math.abs(b.geometry.bottom - 4*b.geometry.step - center))[0];
      if (row && [bounds.left,bounds.top,bounds.right,bounds.bottom].every(Number.isFinite)) result.push({ kind, staffId: row.staffId, bounds });
    }
  }
  return result;
}
export default function EditableStaff(props: Props) {
  const { events, selectedId, selectedToneId } = props;
  const latest = useRef(props);
  latest.current = props;
  const viewport = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const committed = useRef<Scene | null>(null);
  const candidate = useRef<{
    key: string;
    scene: Scene;
    command: Command;
  } | null>(null);
  const promotion = useRef<Scene | null>(null);
  const frame = useRef<number | null>(null);
  const gesture = useRef<
    | (Gesture & {
        id: number;
        modeVersion: number;
        revision: number;
        interactionVersion: number;
        layoutVersion: number;
        toggle: boolean;
      })
    | null
  >(null);
  const layoutVersion = useRef(0);
  const keyboardPreview = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [layoutRevision, refreshGuides] = useState(0);
  const [retry, setRetry] = useState(0);

  const clearPreview = useCallback(() => {
    keyboardPreview.current = false;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    candidate.current = null;
    if (preview.current) preview.current.style.display = 'none';
    if (canvas.current) canvas.current.style.visibility = 'visible';
    if (surface.current && committed.current) {
      surface.current.style.width = committed.current.width + 'px';
      surface.current.style.height = committed.current.height + 'px';
    }
  }, []);

  const showPreview = useCallback(
    (
      command: Command,
      version = latest.current.modeVersion,
      revision = latest.current.revision,
      epoch = latest.current.interactionVersion ?? 0,
    ): Scene | null => {
      const base = committed.current;
      const target = preview.current;
      const current = latest.current;
      if (
        current.locked ||
        viewport.current?.clientWidth !== base?.viewportWidth ||
        base?.zoom !== (current.zoom ?? 1) ||
        (current.interactionVersion ?? 0) !== epoch ||
        current.mode !== 'place' ||
        current.modeVersion !== version ||
        current.revision !== revision ||
        !base ||
        (current.score ? base.score !== current.score : base.events !== current.events) ||
        !target ||
        !surface.current
      )
        return null;
      const pending = candidateScore(current, command);
      if (!pending) {
        clearPreview();
        return null;
      }
      const key = JSON.stringify(command) + '|' + signature(pending) + '|' + base.zoom;
      if (
        candidate.current?.key === key &&
        candidate.current.scene.viewportWidth === base.viewportWidth
      )
        return candidate.current.scene;
      try {
        target.style.display = 'block';
        target.style.visibility = 'hidden';
        const scene = engrave(target, pending, base.viewportWidth, base.zoom, Boolean(current.onProperty || current.onAddMeasure || current.staffActions));
        // abcjs sets position:relative on its responsive container. The candidate
        // must stay over the committed canvas, not flow below it.
        target.style.position = 'absolute';
        target.style.left = '0';
        target.style.top = '0';
        scene.svg.querySelectorAll<SVGElement>('[data-event-id]').forEach((note) => {
          note.classList.toggle('sheet-editor-preview-note', note.dataset.eventId === (command.kind === 'fill' ? '__pending_note__' : command.eventId));
        });
        candidate.current = { key, scene, command };
        surface.current.style.width = Math.max(base.width, scene.width) + 'px';
        surface.current.style.height = Math.max(base.height, scene.height) + 'px';
        if (canvas.current) canvas.current.style.visibility = 'hidden';
        target.style.visibility = 'visible';
        return scene;
      } catch {
        clearPreview();
        setError('The preview is not ready. Please try again.');
        return null;
      }
    },
    [clearPreview],
  );

  useEffect(() => {
    gesture.current = null;
    if (promotion.current?.signature !== signature(snapshot(latest.current)))
      promotion.current = null;
    clearPreview();
  }, [
    props.mode,
    props.modeVersion,
    props.locked,
    props.interactionVersion,
    props.zoom,
    clearPreview,
  ]);

  useEffect(() => {
    const element = canvas.current,
      scroll = viewport.current,
      overlay = preview.current;
    if (!element || !scroll || !overlay) return;
    let lastWidth = -1,
      retryFrame: number | null = null,
      retries = 0;
    const render = () => {
      const width = Math.round(scroll.clientWidth);
      if (width === lastWidth) return;
      lastWidth = width;
      layoutVersion.current++;
      gesture.current = null;
      clearPreview();
      try {
        let scene = promotion.current;
        promotion.current = null;
        if (
          scene?.signature === signature(snapshot(latest.current)) &&
          scene.viewportWidth === width &&
          scene.zoom === (latest.current.zoom ?? 1)
        ) {
          // Promote the actual preview SVG: no second layout can move the note.
          element.replaceChildren(...overlay.childNodes);
          element.style.width = scene.width + 'px';
          element.style.height = scene.height + 'px';
          element.style.paddingBottom = '0';
          scene.element = element;
          bindEvents(scene, snapshot(latest.current));
        } else scene = engrave(element, snapshot(latest.current), width, latest.current.zoom ?? 1, Boolean(latest.current.onProperty || latest.current.onAddMeasure || latest.current.staffActions));
        committed.current = scene;
        clearPreview();
        retries = 0;
        setError('');
        setReady(true);
        refreshGuides((value) => value + 1);
      } catch (cause) {
        committed.current = null;
        setReady(false);
        setError('The staff is not ready for note entry. Please try again.');
        if (retries++ === 0) {
          lastWidth = -1;
          retryFrame = requestAnimationFrame(() => {
            retryFrame = null;
            render();
          });
        } else console.warn('Sheet editor staff layout failed:', cause);
      }
    };
    render();
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      if (Math.round(scroll.clientWidth) === lastWidth) return;
      layoutVersion.current++;
      gesture.current = null;
      promotion.current = null;
      clearPreview();
      clearTimeout(timer);
      timer = setTimeout(render, 80);
    });
    observer.observe(scroll);
    const cancel = () => {
      gesture.current = null;
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      promotion.current = null;
      if (!keyboardPreview.current) clearPreview();
    };
    window.addEventListener('scroll', cancel, true);
    return () => {
      observer.disconnect();
      if (retryFrame !== null) cancelAnimationFrame(retryFrame);
      clearTimeout(timer);
      window.removeEventListener('scroll', cancel, true);
      gesture.current = null;
      clearPreview();
      element.replaceChildren();
    };
  }, [events, props.score, props.zoom, retry, clearPreview]);

  useEffect(() => {
    const scene = committed.current;
    if (!scene) return;
    const selection =
      props.selection ??
      (selectedId && selectedToneId
        ? [
            {
              staffId: scene.score.staffs[0].id,
              eventId: selectedId,
              toneId: selectedToneId,
            },
          ]
        : []);
    const selectedRest = props.mode === 'edit' && selectedId && !selectedToneId
      ? scene.fragments.find(fragment => fragment.rest && fragment.id === selectedId && fragment.staffId === (props.activeStaffId ?? scene.score.staffs[0].id))
      : null;
    scene.svg.querySelectorAll<SVGElement>('[data-event-id]').forEach(group => {
      group.classList.toggle('sheet-editor-rest-selected', Boolean(selectedRest && group.dataset.eventId === selectedRest.id && group.dataset.staffId === selectedRest.staffId));
    });
    const keys = new Set(selection.map(refKey));
    for (const head of scene.heads) {
      const selected = keys.has(
        refKey({
          staffId: head.staffId,
          eventId: head.eventId,
          toneId: head.toneId,
        }),
      );
      head.glyph?.classList.toggle('sheet-editor-note-selected', selected);
      if (head.glyph) {
        head.glyph.dataset.toneId = head.toneId;
      }
    }
    const ref = selection[selection.length - 1],
      head =
        ref &&
        scene.heads.find(
          (h) => h.staffId === ref.staffId && h.eventId === ref.eventId && h.toneId === ref.toneId,
        );
    if (document.activeElement === viewport.current)
      head?.glyph?.scrollIntoView?.({ block: 'nearest' });
    if (selection.length) clearPreview();
  }, [
    events,
    props.selection,
    props.mode,
    props.activeStaffId,
    selectedId,
    selectedToneId,
    props.modeVersion,
    ready,
    layoutRevision,
    clearPreview,
  ]);

  useEffect(() => {
    const proposed = candidate.current?.command;
    if (proposed) showPreview(proposed);
  }, [props.duration, props.accidental, props.dotted, props.staccato, props.entryKind, showPreview]);

  function point(event: PointerEvent<HTMLDivElement>) {
    const scene = committed.current;
    if (
      !scene ||
      scene.zoom !== (latest.current.zoom ?? 1) ||
      viewport.current?.clientWidth !== scene.viewportWidth ||
      (latest.current.score
        ? scene.score !== latest.current.score
        : scene.events !== latest.current.events)
    )
      return null;
    try {
      const inverse = scene.svg.getScreenCTM()?.inverse();
      if (!inverse) return null;
      const local = svgPoint({ x: event.clientX, y: event.clientY }, inverse);
      const scale = scene.svg.getBoundingClientRect().width / scene.svg.viewBox.baseVal.width;
      const row = scene.rows.find((row) => local.y >= row.top && local.y <= row.bottom);
      if (!row) return null;
      const head = scene.heads
        .filter(
          (head) =>
            head.row === row.index &&
            Math.abs(local.x - head.x) <= (event.pointerType === 'touch' ? 10 : 6) / scale &&
            Math.abs(local.y - head.y) <= row.geometry.step * 0.6,
        )
        .sort(
          (a, b) =>
            Math.hypot(local.x - a.x, local.y - a.y) - Math.hypot(local.x - b.x, local.y - b.y),
        )[0];
      if (head && latest.current.mode === 'place') return null;
      if (head)
        return {
          hit: head.eventId,
          toneId: head.toneId,
          staffId: head.staffId,
        };
      if (latest.current.locked || latest.current.mode === 'edit') {
        const rest = scene.fragments.find(
          (note) =>
            note.rest &&
            local.x >= note.left &&
            local.x <= note.right &&
            local.y >= note.top &&
            local.y <= note.bottom,
        );
        return rest ? { hit: rest.id, staffId: rest.staffId } : { blank: true };
      }
      const pitch = staffPitch(local, row.geometry, row.bottomMidi, row.minimum);
      if (pitch === null) return null;
      const targets = measuredTargets(scene, latest.current.duration).filter(
        (target) => target.row === row.index,
      );
      const target = targets.sort((a, b) => Math.abs(a.x - local.x) - Math.abs(b.x - local.x))[0];
      if (
        !target ||
        Math.abs(target.x - local.x) > (event.pointerType === 'touch' ? 20 : 14) / scale
      )
        return null;
      return {
        command: {
          ...commandAt(scene.score.staffs.find((s) => s.id === target.staffId)!.events, {
            tick: target.tick,
            pitch,
          }, latest.current.entryKind),
          ...(latest.current.score ? { staffId: target.staffId } : {}),
        },
      };
    } catch {
      return null;
    }
  }
  const commit = useCallback(
    (
      command: Command,
      version = latest.current.modeVersion,
      revision = latest.current.revision,
      epoch = latest.current.interactionVersion ?? 0,
    ) => {
      const current = latest.current;
      if (
        current.locked ||
        (current.interactionVersion ?? 0) !== epoch ||
        current.mode !== 'place' ||
        current.modeVersion !== version ||
        current.revision !== revision
      )
        return;
      const scene = showPreview(command, version, revision, epoch);
      if (scene) {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        promotion.current = scene;
      }
      if (scene || !candidateScore(current, command)) {
        if (command.kind === 'fill')
          current.onPlace({
            tick: command.tick,
            pitch: command.pitch,
            ...(current.score ? { staffId: command.staffId ?? current.activeStaffId } : {}),
          });
        else current.onAddTone(command);
      }
    },
    [showPreview],
  );
  function schedule(command: Command, keyboard = false) {
    if (latest.current.locked || latest.current.mode !== 'place') return;
    const version = latest.current.modeVersion,
      revision = latest.current.revision,
      epoch = latest.current.interactionVersion ?? 0,
      layout = layoutVersion.current;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (layout !== layoutVersion.current) return;
      const scene = showPreview(command, version, revision, epoch);
      keyboardPreview.current = keyboard;
      if (keyboard && scene) {
        const id = command.kind === 'fill' ? '__pending_note__' : command.eventId;
        scene.svg
          .querySelector<SVGGraphicsElement>(`[data-event-id="${id}"]`)
          ?.scrollIntoView?.({ block: 'nearest' });
      }
    });
  }
  useEffect(() => {
    if (props.requestedOperation)
      commit(
        props.requestedOperation.command,
        props.requestedOperation.modeVersion,
        props.requestedOperation.revision,
        props.requestedOperation.interactionVersion ?? 0,
      );
  }, [props.requestedOperation, commit]);
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.target !== event.currentTarget ||
      !ready ||
      event.nativeEvent?.isComposing ||
      event.altKey ||
      (event.shiftKey && !['ArrowUp', 'ArrowDown', 'Delete', 'Backspace'].includes(event.key)) ||
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() !== 'z')
    )
      return;
    const current = latest.current;
    if (
      current.locked &&
      event.key !== 'Escape' &&
      !(current.mode === 'edit' && ['ArrowLeft', 'ArrowRight'].includes(event.key))
    )
      return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === 'ArrowUp' ? 1 : -1;
      if (current.mode === 'edit' || current.selection?.length) {
        clearPreview();
        if (current.selectedId) current.onTranspose(delta);
      } else {
        const pitch = shiftPitch(current.caret.pitch, delta);
        if (pitch === current.caret.pitch) {
          setError('Pitch boundary reached: use MIDI 0–127.');
          return;
        }
        setError('');
        const caret = { ...current.caret, pitch };
        if (current.onPitchStep) current.onPitchStep(delta);
        else current.onCaret(caret);
        schedule(
          {
            ...commandAt(current.events, caret, current.entryKind),
            ...(current.score ? { staffId: current.activeStaffId } : {}),
          },
          true,
        );
      }
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (current.mode === 'edit') {
        const index = current.events.findIndex((item) => item.id === current.selectedId);
        const next =
          current.events[
            Math.max(
              0,
              Math.min(current.events.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)),
            )
          ];
        if (next) current.onSelect(next.id);
        return;
      }
      const targets = rhythmTargets(current.events, current.duration);
      const tick =
        event.key === 'ArrowLeft'
          ? ([...targets].reverse().find((tick) => tick < current.caret.tick) ?? targets[0])
          : (targets.find((tick) => tick > current.caret.tick) ?? targets[targets.length - 1]);
      const caret = { ...current.caret, tick };
      current.onCaret(caret);
      schedule(
        {
          ...commandAt(current.events, caret, current.entryKind),
          ...(current.score ? { staffId: current.activeStaffId } : {}),
        },
        true,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (current.mode === 'place') commit(commandAt(current.events, current.caret, current.entryKind));
    } else if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      current.mode === 'edit' &&
      current.selectedId
    ) {
      event.preventDefault();
      clearPreview();
      current.onDelete(current.selectedId);
    } else if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'z' &&
      !event.shiftKey
    ) {
      event.preventDefault();
      clearPreview();
      current.onUndo();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      gesture.current = null;
      clearPreview();
      current.onClearSelection();
    }
  }
  const scene = committed.current;
  const guides = scene && !props.locked && props.mode === 'place' ? measuredTargets(scene, props.duration) : [];
  const lastRow = scene?.rows[scene.rows.length - 1];
  const finalSystem = scene?.rows.filter(row => row.system === lastRow?.system) ?? [];
  const measureCenter = finalSystem.length
    ? (Math.min(...finalSystem.map(row => row.geometry.bottom - 8 * row.geometry.step)) + Math.max(...finalSystem.map(row => row.geometry.bottom))) / 2
    : 0;
  const score = snapshot(props), measured = scene && props.onProperty ? markings(scene) : [];
  const activate = (kind: 'clef' | 'key' | 'tempo' | 'meter', staffId: string, anchor: HTMLElement) => { if (props.locked || (props.fixedClef && kind === 'clef')) return; gesture.current = null; clearPreview(); props.onProperty?.(kind, staffId, anchor); };
  const markingLabel = (kind: Marking['kind'], staffId: string) => kind === 'clef' && props.fixedClef ? 'Treble clef (fixed for Game melody)' : kind === 'clef' ? `Change clef for staff ${score.staffs.findIndex(part => part.id === staffId) + 1}, currently ${score.staffs.find(part => part.id === staffId)?.clef}` : kind === 'key' ? `Change key signature, currently ${score.key}, whole score` : kind === 'meter' ? `Change time signature, currently ${meterName(score.meter)}, whole score` : `Change tempo, currently ${score.tempoBeat?.dotted ? 'dotted ' : ''}${score.tempoBeat?.duration ?? 'quarter'} = ${score.bpm}, whole score`;
  return (
    <section aria-label="Editable musical staff">
      {error && (
        <p role="alert">
          {error}{' '}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Try again
          </button>
        </p>
      )}
      {!ready && !error && <p role="status">Preparing the staff…</p>}
      {props.onProperty && <div className="score-property-fallbacks" role="group" aria-label="Score markings">
        {score.staffs.filter(part => !measured.some(mark => mark.kind === 'clef' && mark.staffId === part.id)).map((part,index) => <button key={part.id} type="button" data-studio-panel disabled={props.locked || props.fixedClef} data-clef-staff={part.id} aria-label={markingLabel('clef',part.id)} onClick={event => activate('clef',part.id,event.currentTarget)}>Staff {index+1} · {part.clef}</button>)}
        {(['key','meter','tempo'] as const).filter(kind => !measured.some(mark => mark.kind === kind)).map(kind => <button key={kind} type="button" data-studio-panel disabled={props.locked} aria-label={markingLabel(kind,score.staffs[0].id)} onClick={event => activate(kind,score.staffs[0].id,event.currentTarget)}>{kind === 'key' ? `Key: ${score.key}` : kind === 'meter' ? meterName(score.meter) : <><RhythmSymbol duration={score.tempoBeat?.duration ?? 'quarter'} dotted={score.tempoBeat?.dotted} /><span>= {score.bpm}</span></>}</button>)}
      </div>}

      <div
        ref={viewport}
        className="sheet-editor-scroll"
        data-mode={props.mode}
        tabIndex={0}
        role="group"
        aria-label="Staff input"
        aria-describedby="sheet-editor-keyboard"
        aria-disabled={!ready}
        onFocus={(event) => {
          if (event.target !== event.currentTarget) return;
          if (
            latest.current.mode === 'place' &&
            !latest.current.selection?.length &&
            !gesture.current
          )
            schedule(
              {
                ...commandAt(latest.current.events, latest.current.caret, latest.current.entryKind),
                ...(latest.current.score ? { staffId: latest.current.activeStaffId } : {}),
              },
              true,
            );
        }}
        onBlur={() => {
          gesture.current = null;
          clearPreview();
        }}
        onKeyDown={keyDown}
        onScroll={() => {
          gesture.current = null;
          clearPreview();
        }}
        onMouseDownCapture={(event) => event.stopPropagation()}
        onMouseUpCapture={(event) => event.stopPropagation()}
        onTouchStartCapture={(event) => event.stopPropagation()}
        onTouchEndCapture={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          keyboardPreview.current = false;
          if (event.button !== 0 || !event.isPrimary || !ready) return;
          gesture.current = {
            id: event.pointerId,
            modeVersion: latest.current.modeVersion,
            revision: latest.current.revision,
            interactionVersion: latest.current.interactionVersion ?? 0,
            layoutVersion: layoutVersion.current,
            toggle: event.shiftKey,
            x: event.clientX,
            y: event.clientY,
            scroll: event.currentTarget.scrollLeft,
          };
          const proposed = point(event);
          if (proposed?.hit) clearPreview();
          else if (proposed?.command) showPreview(proposed.command);
        }}
        onPointerMove={(event) => {
          const start = gesture.current;
          if (
            start &&
            !isTap(start, {
              x: event.clientX,
              y: event.clientY,
              scroll: event.currentTarget.scrollLeft,
            })
          )
            gesture.current = null;
          if (event.pointerType !== 'mouse') return;
          const proposed = point(event);
          if (!proposed || proposed.hit || !proposed.command) clearPreview();
          else schedule(proposed.command);
        }}
        onPointerLeave={() => {
          gesture.current = null;
          clearPreview();
        }}
        onPointerCancel={() => {
          gesture.current = null;
          clearPreview();
        }}
        onPointerUp={(event) => {
          const start = gesture.current;
          gesture.current = null;
          if (
            !start ||
            start.layoutVersion !== layoutVersion.current ||
            start.interactionVersion !== (latest.current.interactionVersion ?? 0) ||
            start.modeVersion !== latest.current.modeVersion ||
            start.revision !== latest.current.revision ||
            start.id !== event.pointerId ||
            event.button !== 0 ||
            !isTap(start, {
              x: event.clientX,
              y: event.clientY,
              scroll: event.currentTarget.scrollLeft,
            })
          ) {
            clearPreview();
            return;
          }
          event.currentTarget.focus({ preventScroll: true });
          const proposed = point(event);
          if (proposed?.hit) {
            clearPreview();
            if (latest.current.score)
              latest.current.onSelect(
                proposed.hit,
                proposed.toneId,
                proposed.staffId,
                start.toggle,
              );
            else latest.current.onSelect(proposed.hit, proposed.toneId);
          } else if (proposed?.command && !start.toggle)
            commit(proposed.command, start.modeVersion, start.revision, start.interactionVersion);
          else if (proposed?.blank) {
            clearPreview();
            if (!start.toggle) latest.current.onClearSelection();
          } else clearPreview();
        }}
      >
        <div ref={surface} className="sheet-editor-surface">
          {scene && (
            <svg
              className="sheet-editor-position-guides"
              width={scene.width}
              height={scene.height}
              viewBox={`0 ${scene.svg.viewBox.baseVal.y ?? 0} ${scene.svg.viewBox.baseVal.width} ${scene.svg.viewBox.baseVal.height}`}
              aria-hidden="true"
            >
              {guides.map((target) => (
                <g
                  key={target.staffId + target.tick}
                  data-tick={target.tick}
                  data-row={target.row}
                  data-staff-id={target.staffId}
                >
                  <line
                    x1={target.x}
                    x2={target.x}
                    y1={pitchY(POINTER_MAX, target.geometry, target.bottomMidi)}
                    y2={pitchY(target.minimum, target.geometry, target.bottomMidi)}
                  />
                  <text
                    x={target.x}
                    y={pitchY(target.minimum, target.geometry, target.bottomMidi) + 20}
                    textAnchor="middle"
                  >
                    {target.tick % meterBeatTicks(score.meter) === 0
                      ? String(Math.floor((target.tick % measureTicks(score.meter)) / meterBeatTicks(score.meter)) + 1)
                      : '+' + Number(((target.tick % meterBeatTicks(score.meter)) / meterBeatTicks(score.meter)).toFixed(3))}
                  </text>
                </g>
              ))}
            </svg>
          )}
          <div ref={canvas} className="sheet-editor-canvas" />
          {scene && (props.onProperty || props.onAddMeasure || props.staffActions) && <div className="score-native-controls" data-studio-panel style={{ width: scene.width, height: scene.height }} onFocusCapture={() => clearPreview()} onPointerMove={event => { event.stopPropagation(); clearPreview(); }} onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>

            {measured.map((mark,index) => <button key={`${mark.kind}-${index}`} type="button" className="score-marking-target" aria-label={markingLabel(mark.kind,mark.staffId)} data-clef-staff={mark.kind === 'clef' ? mark.staffId : undefined} data-property={mark.kind} disabled={props.locked || (props.fixedClef && mark.kind === 'clef')} style={{ left: (mark.bounds.left - (scene.svg.viewBox.baseVal.x ?? 0))*(props.zoom??1), top: (mark.bounds.top - (scene.svg.viewBox.baseVal.y ?? 0))*(props.zoom??1), width: (mark.bounds.right-mark.bounds.left)*(props.zoom??1), height: Math.max(30,(mark.bounds.bottom-mark.bounds.top)*(props.zoom??1)) }} onClick={event => activate(mark.kind,mark.staffId,event.currentTarget)} />)}
            {lastRow && props.onAddMeasure && <button type="button" className="score-add-measure" aria-label="Add measure" disabled={props.locked}
              style={{ left: scene.width - 116, top: (measureCenter - (scene.svg.viewBox.baseVal.y ?? 0)) * (props.zoom ?? 1), transform: 'translateY(-50%)' }}
              onClick={() => { if (!props.locked) { gesture.current = null; clearPreview(); props.onAddMeasure?.(); } }}>+ Measure</button>}
            {lastRow && props.staffActions && <div className="score-inline-staff-actions" style={{ left: ((lastRow.geometry.left + lastRow.geometry.right) / 2 - (scene.svg.viewBox.baseVal.x ?? 0)) * (props.zoom ?? 1), top: (lastRow.bottom - (scene.svg.viewBox.baseVal.y ?? 0)) * (props.zoom ?? 1) + STAFF_ACTION_GAP, transform: 'translateX(-50%)' }}>{props.staffActions}</div>}

          </div>}

          <div
            ref={preview}
            className="sheet-editor-canvas sheet-editor-preview"
            aria-hidden="true"
          />
        </div>
      </div>
    </section>
  );
}
