import { describe, expect, it } from "vitest";
import { isCompleteReportMarkdown, parseGoalsMarkdown } from "./workflow";

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
- Vì sao cần thiết: Bám mục tiêu giao tiếp`);

    expect(result?.selectedGoals).toHaveLength(2);
    expect(result?.selectedGoals[0]).toMatchObject({ status: "no_candidate", topic: "Kỹ năng chơi – tương tác xã hội" });
    expect(result?.selectedGoals[1].domain).toBe("Giao tiếp diễn đạt");
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
