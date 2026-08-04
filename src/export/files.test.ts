import { describe, expect, it } from "vitest";
import { buildFileChipName, buildFileName, resolveSessionChildName } from "./files";
import type { ReportSession } from "../types";

const session = (overrides: Partial<ReportSession> = {}): ReportSession => ({
  id: "session-1",
  createdAt: 0,
  updatedAt: 0,
  status: "completed",
  rawInput: "",
  reportDate: "2026-08-04",
  lastCompletedStep: "done",
  stepOutputs: { fixRoundCount: 0 },
  stepTraceLog: [],
  messages: [],
  ...overrides,
});

describe("DOCX filenames", () => {
  it("uses the normalized child name and dd-mm-yyyy date", () => {
    expect(buildFileName(session({ childNameLabel: "Trần Bùi Hải Đăng" })))
      .toBe("Bao_cao_Tran_Bui_Hai_Dang_04-08-2026.docx");
    expect(buildFileName(session({ childNameLabel: "Nguyễn Trâm Anh" })))
      .toBe("Bao_cao_Nguyen_Tram_Anh_04-08-2026.docx");
  });

  it("uses the required fallback when the child name is unknown", () => {
    expect(buildFileName(session())).toBe("Bao_cao_Khong_ro_ten_04-08-2026.docx");
  });

  it("recovers a child name from a legacy report and pads legacy dates", () => {
    const legacy = session({
      reportDate: "4/8/2026",
      stepOutputs: {
        fixRoundCount: 0,
        reportMarkdown: "## I. THÔNG TIN HÀNH CHÍNH\n\n**Họ và tên trẻ:** Nguyễn Văn A\n",
      },
    });
    expect(resolveSessionChildName(legacy)).toBe("Nguyễn Văn A");
    expect(buildFileName(legacy)).toBe("Bao_cao_Nguyen_Van_A_04-08-2026.docx");
    expect(buildFileChipName(legacy)).toBe("Nguyen_Van_A_04-08-2026.docx");
  });

  it("shows the original attachment until analysis finds the child name", () => {
    expect(buildFileChipName(session({ sourceFileName: "Bang_kiem_ESDM.docx" })))
      .toBe("Bang_kiem_ESDM.docx");
    expect(buildFileChipName(session({ childNameLabel: "Nguyễn Trâm Anh", sourceFileName: "Bang_kiem_ESDM.docx" })))
      .toBe("Nguyen_Tram_Anh_04-08-2026.docx");
  });
});
