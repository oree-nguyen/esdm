import { useEffect, useRef, useState } from "react";
import type { StepEvent } from "../../types";
import "./stepTraceStatus.css";
import "./stepTraceExtra.css";

export function StepTraceStatus({
  events,
  working,
  elapsed,
  onCancel,
  onContinue,
  resumable = false,
}: {
  events: StepEvent[];
  working: boolean;
  elapsed: number;
  onCancel?: () => void;
  onContinue?: () => void;
  resumable?: boolean;
}) {
  const [open, setOpen] = useState(working);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (working) setOpen(true);
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [events, working]);
  if (!events.length) return null;
  if (!working && !open)
    return (
      <button className="traceSummary" onClick={() => setOpen(true)}>
        ▸ Đã xử lý trong {elapsed} giây
      </button>
    );
  return (
    <section className="stepTrace">
      {working && onCancel && (
        <button className="traceCancel" onClick={onCancel}>
          Hủy
        </button>
      )}
      {!working && (
        <button className="traceSummary" onClick={() => setOpen(false)}>
          ˅ Đã xử lý trong {elapsed} giây
        </button>
      )}
      {events.map((event) => (
        <div className={`stepEvent ${event.status}`} key={event.id}>
          {event.status === "done" ? "✓" : event.status === "error" ? "×" : <span className="traceDot" />}{" "}
          {event.text}
        </div>
      ))}
      {resumable && onContinue && (
        <button className="traceContinue" onClick={onContinue}>
          Tiếp tục
        </button>
      )}
      <div ref={endRef} />
    </section>
  );
}
