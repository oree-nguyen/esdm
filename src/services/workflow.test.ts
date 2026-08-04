import { describe, expect, it } from "vitest";
import { enforceFixedReportSections, isCompleteReportMarkdown, parseGoalsMarkdown } from "./workflow";
import type { Analysis, ChildInput } from "../types";

const fixedInput: ChildInput = { childName: "Nguyễn Văn A", birthDate: "01/01/2021", evaluator: "Cô B", reportDate: "2026-08-04", interventionPeople: "Giáo viên và gia đình", sourceData: "" };
const fixedAnalysis: Analysis = { administrative: { childName: "Nguyễn Văn A", birthDate: "01/01/2021", evaluator: "Cô B", missingFields: [] }, domains: [], conflicts: [], missingData: [], goalCandidates: [] };

describe("parseGoalsMarkdown", () => {
  it("accepts bold DeepSeek labels and full-width colons", () => {
    const result = parseGoalsMarkdown(`## MỤC TIÊU CÁ NHÂN
### 1. Giao tiếp diễn đạt trong thực tế hàng ngày
- **Lĩnh vực nguồn:** Giao tiếp diễn đạt
- **Kỹ năng nguồn:** Chủ động yêu cầu đồ vật
- **Hành vi đích：** Trẻ nói tên đồ vật để yêu cầu
- **Thời gian dự kiến:** 8 tuần
- **Bối cảnh thực hiện:** Lớp học và gia đình
- **Điều kiện tạo cơ hội:** 5 cơ hội mỗi buổi
- **Mức hỗ trợ tối đa:** Gợi ý bằng lời
- **Tiêu chí đạt:** 4 trên 5 cơ hội
- **Số bối cảnh áp dụng:** 2
- **Số người khác nhau:** 2
- **Số buổi liên tiếp:** 3
- **Baseline:** missing`);

    expect(result?.selectedGoals[0]).toMatchObject({
      domain: "Giao tiếp diễn đạt",
      sourceSkill: "Chủ động yêu cầu đồ vật",
      targetBehavior: "Trẻ nói tên đồ vật để yêu cầu",
      contextsCount: 2,
    });
  });

  it("requests one repair when essential goal content is missing", () => {
    expect(parseGoalsMarkdown("## MỤC TIÊU CÁ NHÂN\n### 1. Nhận thức")).toBeUndefined();
  });

  it("ignores fixed empty topic blocks", () => {
    const result = parseGoalsMarkdown(`## MỤC TIÊU CÁ NHÂN
### 1. Kỹ năng chơi – tương tác xã hội
- Trạng thái: không có ứng viên phù hợp trong dữ liệu

### 2. Giao tiếp diễn đạt trong thực tế hàng ngày
- Lĩnh vực nguồn: Giao tiếp diễn đạt
- Kỹ năng nguồn: Chủ động yêu cầu đồ vật
- Hành vi đích: Trẻ nói tên đồ vật để yêu cầu
- Độ khó: trung bình
- Thời gian dự kiến: 6-7 tuần
- Bối cảnh thực hiện: Lớp học
- Điều kiện tạo cơ hội: 5 cơ hội
- Mức hỗ trợ tối đa: Gợi ý bằng lời
- Tiêu chí đạt: 4 trên 5 cơ hội
- Số bối cảnh áp dụng: 2
- Số người khác nhau: 2
- Số buổi liên tiếp: 3
- Baseline: missing — căn cứ: chưa đủ dữ liệu nền

## HOẠT ĐỘNG GIA ĐÌNH
### 1. Chơi gọi tên đồ vật
- Lĩnh vực liên quan: Giao tiếp diễn đạt
- Mô tả hoạt động: Gia đình tạo cơ hội gọi tên đồ vật
- Vì sao cần thiết: Bám mục tiêu giao tiếp
### 2. Chờ lượt trong trò chơi
- Lĩnh vực liên quan: Kỹ năng xã hội
- Mô tả hoạt động: Gia đình tạo cơ hội chờ lượt
- Vì sao cần thiết: Bám mục tiêu giao tiếp`);

    expect(result?.selectedGoals).toHaveLength(2);
    expect(result?.selectedGoals[0]).toMatchObject({ status: "no_candidate", topic: "Kỹ năng chơi – tương tác xã hội" });
    expect(result?.selectedGoals[1].domain).toBe("Giao tiếp diễn đạt");
  });

  it("does not parse family activities into selected goals", () => {
    const result = parseGoalsMarkdown(`## MỤC TIÊU CÁ NHÂN
### 1. Kỹ năng chơi – tương tác xã hội
- Trạng thái: không có ứng viên phù hợp trong dữ liệu

## MỤC TIÊU NHÓM
### 1. Kỹ năng tự lập
- Trạng thái: không có ứng viên phù hợp trong dữ liệu

## HOẠT ĐỘNG GIA ĐÌNH
### 1. Hoạt động một
- Mô tả hoạt động: A
### 2. Hoạt động hai
- Mô tả hoạt động: B`);

    expect(result?.selectedGoals).toHaveLength(2);
    expect(result?.selectedGoals.every((goal) => !goal.topic?.startsWith("Hoạt động"))).toBe(true);
  });
});

describe("isCompleteReportMarkdown", () => {
  it("rejects a fixer explanation that would overwrite the report", () => {
    expect(
      isCompleteReportMarkdown("Không có mục Markdown nào được gửi kèm để sửa."),
    ).toBe(false);
  });

  it("accepts a report only when all seven required sections exist", () => {
    expect(
      isCompleteReportMarkdown(
        ["I", "II", "III", "IV", "V", "VI", "VII"]
          .map((roman) => `## ${roman}. MỤC ${roman}`)
          .join("\n"),
      ),
    ).toBe(true);
  });
});

describe("report structure normalization", () => {
  it("always restores fixed sections and public goal labels", () => {
    const report = [
      "**BÁO CÁO CAN THIỆP**",
      "## I. THÔNG TIN HÀNH CHÍNH",
      "- Thông tin phụ huynh: không được xuất",
      "## II. HỆ THỐNG MÃ DỮ LIỆU VÀ QUY TẮC CHUNG",
      "- nội dung do model tự viết",
      "## III. CHỨC NĂNG HIỆN TẠI THEO TỪNG LĨNH VỰC",
      "### Giao tiếp tiếp nhận",
      "- kỹ năng",
      "## IV. MỤC TIÊU CAN THIỆP",
      "### Mục tiêu",
      "- **Lĩnh vực nguồn:** nội bộ",
      "- **Hành vi đích:** quan sát được",
      "- **Baseline:** missing",
    ].join("\n");
    const normalized = enforceFixedReportSections(report, fixedInput, fixedAnalysis);
    expect(normalized).toContain("- **Công cụ và nguồn dữ liệu:**");
    expect(normalized).toContain("### 1. Giao tiếp tiếp nhận");
    expect(normalized).toContain("### 1. Mục tiêu");
    expect(normalized).toContain("Hành vi quan sát được");
    expect(normalized).not.toContain("Thông tin phụ huynh");
    expect(normalized).not.toContain("Lĩnh vực nguồn");
    expect(normalized).not.toContain("Baseline");
  });
});
