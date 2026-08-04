import { describe, expect, it } from 'vitest';
import { runRules } from './reportRules';
import { parseGoalsMarkdown } from '../services/workflow';
import type { Analysis, ChildInput, GoalDraft } from '../types';
const input:ChildInput={childName:'An',birthDate:'01/01/2020',evaluator:'Cô Mai',reportDate:'2026-08-03',interventionPeople:'Giáo viên và gia đình',sourceData:'An chưa ổn định khi gọi tên.'};
const analysis:Analysis={administrative:{childName:'An',birthDate:'01/01/2020',evaluator:'Cô Mai',missingFields:[]},domains:[{name:'Giao tiếp tiếp nhận',skills:[{skill:'Đáp lại khi gọi tên',category:'emerging',evidence:'Chưa ổn định',supportLevel:'',conflict:false,missingData:false}]}],conflicts:[],missingData:[],goalCandidates:[]};
const goal:GoalDraft={id:'1',domain:'Giao tiếp tiếp nhận',sourceSkill:'Đáp lại khi gọi tên',targetBehavior:'Đáp lại khi gọi tên',duration:'8 tuần',context:'Lớp học',opportunityCondition:'5 cơ hội',maxSupport:'Gợi ý lời nói',masteryCriterion:'4/5 cơ hội',contextsCount:2,peopleCount:2,consecutiveSessions:3,baselineStatus:'missing',baselineEvidence:'Chưa đủ dữ liệu nền'};
const report=(sectionIII:string,sectionIV='')=>`## I. THÔNG TIN HÀNH CHÍNH\n- An\n## II. HỆ THỐNG MÃ DỮ LIỆU VÀ QUY TẮC CHUNG\nCông cụ và nguồn dữ liệu\n## III. CHỨC NĂNG HIỆN TẠI THEO TỪNG LĨNH VỰC\n${sectionIII}\n## IV. MỤC TIÊU CAN THIỆP\n${sectionIV}\n## V. HOẠT ĐỘNG CAN THIỆP`;

describe('rule engine',()=>{
  it('rejects a goal from an invalid source group',()=>{const bad={...goal,sourceSkill:'Không có'};expect(runRules('',input,analysis,[bad]).find(x=>x.id===12)?.passed).toBe(false)});
  it('allows the fixed five individual plus two group goals',()=>expect(runRules('',input,analysis,Array(7).fill(goal)).find(x=>x.id===13)?.passed).toBe(true));
  it('rejects more than seven direct goals',()=>expect(runRules('',input,analysis,Array(8).fill(goal)).find(x=>x.id===13)?.passed).toBe(false));
  it('keeps a valid no-candidate topic without reporting missing goal fields',()=>{
    const noCandidate={...goal,status:'no_candidate' as const,targetBehavior:'',duration:'',context:'',opportunityCondition:'',maxSupport:'',masteryCriterion:'',contextsCount:0,peopleCount:0,consecutiveSessions:0};
    const results=runRules('',input,analysis,[noCandidate]);
    expect(results.find(x=>x.id===12)?.passed).toBe(true);
    expect(results.find(x=>x.id===14)?.passed).toBe(true);
    expect(results.find(x=>x.id===15)?.passed).toBe(true);
  });
  it('rejects source A/P/N/X codes in section III',()=>expect(runRules(report('- [P] Kỹ năng'),input,analysis,[]).find(x=>x.id===8)?.passed).toBe(false));
  it('rejects +/- classification marks in section III',()=>expect(runRules(report('- Kỹ năng — căn cứ: +/-'),input,analysis,[]).find(x=>x.id===8)?.passed).toBe(false));
  it('rejects a fourth group in section III',()=>expect(runRules(report('### Điểm mạnh\n### Đang hình thành\n### Ưu tiên phát triển\n### Cần quan sát thêm'),input,analysis,[]).find(x=>x.id===11)?.passed).toBe(false));
  it('rejects more than three priority skills in one domain',()=>expect(runRules(report('### Ưu tiên phát triển\n- a\n- b\n- c\n- d'),input,analysis,[]).find(x=>x.id===10)?.passed).toBe(false));
  it('rejects a goal section without the seven fixed topics and two family activities',()=>expect(runRules(report('', '### 1\n### 2\n### 3\n### 4\n### 5\n### 6\n### 7'),input,analysis,[]).find(x=>x.id===13)?.passed).toBe(false));
  it('reports a missing topic when the parsed output contains only six goals',()=>{
    const parsed = parseGoalsMarkdown(`## MỤC TIÊU CÁ NHÂN
### 1. Kỹ năng chơi – tương tác xã hội
- Trạng thái: không có ứng viên phù hợp trong dữ liệu
### 2. Giao tiếp diễn đạt trong thực tế hàng ngày
- Trạng thái: không có ứng viên phù hợp trong dữ liệu
### 3. Nhận thức phục vụ thực tế học tập và sinh hoạt hàng ngày
- Trạng thái: không có ứng viên phù hợp trong dữ liệu
### 4. Nghe hiểu khi giao tiếp
- Trạng thái: không có ứng viên phù hợp trong dữ liệu
### 5. Khả năng học tập – Ghi nhớ
- Trạng thái: không có ứng viên phù hợp trong dữ liệu
## MỤC TIÊU NHÓM
### 1. Kỹ năng tự lập
- Trạng thái: không có ứng viên phù hợp trong dữ liệu`);
    expect(parsed).toBeDefined();
    expect(runRules('',input,analysis,parsed!.selectedGoals).find(x=>x.id===13)?.passed).toBe(false);
  });
});
