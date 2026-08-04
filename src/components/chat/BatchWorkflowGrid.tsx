import type { ReportSession, StepEvent } from "../../types";
import "./batchWorkflowGrid.css";

export type BatchJobStatus = "queued" | "running" | "completed" | "error" | "cancelled";

export interface BatchJob {
  id: string;
  fileName: string;
  sourceText: string;
  status: BatchJobStatus;
  progress: number;
  currentStatus: string;
  trace: StepEvent[];
  session: ReportSession;
  report?: string;
  error?: string;
}

const columnsFor = (count: number) => {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 8) return 3;
  if (count < 12) return 4;
  return 5;
};

export function BatchWorkflowGrid({
  jobs,
  onCancel,
  onOpenReport,
}: {
  jobs: BatchJob[];
  onCancel: (id: string) => void;
  onOpenReport: (job: BatchJob) => void;
}) {
  return (
    <section
      className="batchGrid"
      style={{ "--batch-columns": columnsFor(jobs.length) } as React.CSSProperties}
      aria-label={`Trạng thái xử lý ${jobs.length} tệp`}
    >
      {jobs.map((job) => (
        <article className={`workflowCell ${job.status}`} key={job.id}>
          <div className="workflowFile" title={job.fileName}>
            <span aria-hidden="true">📄</span>
            <span>{job.fileName}</span>
            {job.status === "completed" && (
              <button
                className="workflowOpen"
                aria-label={`Mở báo cáo ${job.fileName}`}
                title="Mở báo cáo"
                onClick={() => onOpenReport(job)}
              >
                📄
              </button>
            )}
          </div>
          <div className="workflowProgressRow">
            <div className="workflowProgress" aria-label={`Tiến độ ${job.progress}%`}>
              <i style={{ width: `${job.progress}%` }} />
            </div>
            <span>{job.progress}%</span>
          </div>
          <div className="workflowStatus" title={job.error || job.currentStatus}>
            {job.error || job.currentStatus}
          </div>
          <div className="workflowCellFooter">
            <i className={`workflowStateDot ${job.status}`} aria-hidden="true" />
            {(job.status === "running" || job.status === "queued") && (
              <button className="workflowCancel" onClick={() => onCancel(job.id)} aria-label={`Hủy ${job.fileName}`}>
                ×
              </button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
