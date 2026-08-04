import { describe, expect, it } from "vitest";
import { isCompleteReportMarkdown, parseGoalsMarkdown } from "./workflow";

describe("parseGoalsMarkdown", () => {
  it("accepts bold DeepSeek labels and full-width colons", () => {
    const result = parseGoalsMarkdown(`## MỤC TIÊU ĐÃ CHỌN
### 1. Lĩnh vực: Giao tiếp diễn đạt
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
    expect(parseGoalsMarkdown("## MỤC TIÊU ĐÃ CHỌN\n### 1. Nhận thức")).toBeUndefined();
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
