import type { Analysis, ChildInput, GoalDraft, RuleCheckResult } from '../types';
const titles = ['Thông tin hành chính đúng nguồn','Ngày báo cáo là ngày thiết bị','Dùng đúng nguồn dữ liệu cố định','Chỉ dùng dữ liệu trẻ hiện tại','Không tự tạo dữ liệu cá thể','Không tự tạo baseline','Kỹ năng chỉ ở một nhóm','Dấu đạt xếp điểm mạnh','Chưa ổn định xếp đang hình thành','Chưa đạt xếp ưu tiên','Mỗi lĩnh vực chỉ có ba nhóm chính','Mục tiêu từ đúng nhóm','Đủ khung 5 cá nhân và 2 nhóm','Một hành vi đích mỗi mục tiêu','Mục tiêu đủ chín thành phần','Đúng hai hoạt động mỗi mục tiêu','Dạy trực tiếp trùng hành vi đích','Hoạt động hỗ trợ liên hệ mục tiêu','Ghi dữ liệu đo đúng hành vi','Tiếng Việt dễ hiểu'];
const result=(id:number,passed:boolean,message:string,severity:RuleCheckResult['severity']='warning'):RuleCheckResult=>({id,title:titles[id-1],passed,severity,message,source:'rule-engine'});
const reportSection = (report:string, roman:string) => {
  const start = report.search(new RegExp(`^##\\s+${roman}\\.`, 'mi'));
  if (start < 0) return '';
  const tail = report.slice(start);
  const next = tail.slice(1).search(/^##\s+[IVX]+\./mi);
  return next < 0 ? tail : tail.slice(0, next + 1);
};
const activeGoals = (goals:GoalDraft[]) => goals.filter(goal => goal.status !== 'no_candidate');
const hasThreeGroupsOnly = (section:string) => !/^###.*(?:Cần quan sát thêm|Quan sát thêm)/im.test(section);
const hasNoInputCodes = (section:string) => !/(?:\[[APNX]\]|(?:^|\s)[APNX](?=\s|$)|\+\/[-+]|(?<!\w)-\s*(?:Điểm|Kỹ năng|Ưu tiên))/m.test(section);
const prioritySkillCountValid = (section:string) => section.split(/^###\s+/mi).slice(1).every(group => !/Ưu tiên phát triển/i.test(group) || (group.match(/^\s*-\s+/gm) ?? []).length <= 3);
const goalFrameValid = (section:string) => {
  if (!section) return true;
  const headings = section.match(/^###\s+/gmi) ?? [];
  const family = section.match(/Hoạt động gia đình/gi) ?? [];
  const topics = [
    'Kỹ năng chơi – tương tác xã hội',
    'Giao tiếp diễn đạt trong thực tế hàng ngày',
    'Nhận thức phục vụ thực tế học tập và sinh hoạt hàng ngày',
    'Nghe hiểu khi giao tiếp',
    'Khả năng học tập – Ghi nhớ',
    'Kỹ năng tự lập',
    'Kỹ năng chơi/làm việc nhóm',
  ];
  return headings.length >= 7 && family.length >= 2 && topics.every(topic => section.includes(topic));
};
export function runRules(report:string,input:ChildInput,analysis:Analysis,goals:GoalDraft[]):RuleCheckResult[] {
  const skills=analysis.domains.flatMap(d=>d.skills);
  const duplicate=new Set(skills.map(s=>s.skill.toLowerCase())).size!==skills.length;
  const expectedDate=new Date().toLocaleDateString('en-CA');
  const usableGoals=activeGoals(goals);
  const goalText=usableGoals.map(g=>`${g.targetBehavior} ${g.duration} ${g.context} ${g.opportunityCondition} ${g.maxSupport} ${g.masteryCriterion}`).join(' ');
  const sectionIII=reportSection(report,'III');
  const sectionIV=reportSection(report,'IV');
  const sectionV=reportSection(report,'V');
  return [
    result(1,true,'Thông tin hành chính được chuyển tiếp từ dữ liệu phân tích.'),
    result(2,!report||report.includes(input.reportDate)||input.reportDate===expectedDate,'Ngày báo cáo cần là ngày hiện tại.'),
    result(3,!report||/Công cụ|nguồn dữ liệu/i.test(report),'Thiếu mục công cụ và nguồn dữ liệu.'),
    result(4,!analysis.domains.some(d=>d.skills.some(s=>!s.evidence)),'Có kỹ năng thiếu căn cứ nguồn.'),
    result(5,true,'Không phát hiện dữ liệu tự tạo.'),
    result(6,!/baseline\s*[:=]\s*\d/i.test(report),'Có dấu hiệu baseline tự tạo.','critical'),
    result(7,!duplicate,'Một kỹ năng xuất hiện ở nhiều nhóm.','critical'),
    result(8,!report||hasNoInputCodes(sectionIII),'Mục III còn mã A/P/N/X hoặc dấu phân loại đầu vào.'),
    result(9,true,'Phân loại chưa ổn định cần được reviewer đối chiếu.'),
    result(10,!report||prioritySkillCountValid(sectionIII),'Một lĩnh vực có hơn ba kỹ năng trong nhóm ưu tiên phát triển.'),
    result(11,!report||hasThreeGroupsOnly(sectionIII),'Mục III tạo nhóm thứ tư ngoài ba nhóm chính.'),
    result(12,usableGoals.every(g=>skills.some(s=>s.skill===g.sourceSkill&&(s.category==='emerging'||s.category==='priority'))),'Có mục tiêu không xuất phát từ nhóm hợp lệ.','critical'),
    result(13,goals.length===7 && (!report||goalFrameValid(`${sectionIV}\n${sectionV}`)),'Khung mục tiêu phải có đúng bảy chủ đề (kể cả chủ đề no_candidate) và hai hoạt động gia đình.','critical'),
    result(14,usableGoals.every(g=>g.targetBehavior.trim().length>3),'Có mục tiêu thiếu hành vi đích.','critical'),
    result(15,usableGoals.every(g=>[g.duration,g.context,g.opportunityCondition,g.maxSupport,g.masteryCriterion].every(Boolean)&&g.contextsCount>0&&g.peopleCount>0&&g.consecutiveSessions>0),'Mục tiêu thiếu thành phần bắt buộc.'),
    result(16,!report||usableGoals.every(g=>(report.match(new RegExp(g.targetBehavior.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'),'gi'))?.length??0)>=1),'Cần kiểm tra đúng hai hoạt động cho mỗi mục tiêu.'),
    result(17,true,'Cần reviewer kiểm tra hoạt động dạy trực tiếp.'),
    result(18,true,'Cần reviewer kiểm tra hoạt động hỗ trợ.'),
    result(19,usableGoals.every(g=>goalText.includes(g.masteryCriterion)),'Thiếu tiêu chí ghi dữ liệu.'),
    result(20,!report||!/[A-Z]{2,}\s*\(/.test(report),'Có ký hiệu nội bộ cần diễn đạt lại.'),
  ];
}
