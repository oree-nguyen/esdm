import { describe, expect, it } from 'vitest';
import { runRules } from './reportRules';
import type { Analysis, ChildInput, GoalDraft } from '../types';
const input:ChildInput={childName:'An',birthDate:'01/01/2020',evaluator:'Cô Mai',reportDate:'2026-08-03',interventionPeople:'Giáo viên và gia đình',sourceData:'An chưa ổn định khi gọi tên.'};
const analysis:Analysis={administrative:{childName:'An',birthDate:'01/01/2020',evaluator:'Cô Mai',missingFields:[]},domains:[{name:'Giao tiếp tiếp nhận',skills:[{skill:'Đáp lại khi gọi tên',category:'emerging',evidence:'Chưa ổn định',supportLevel:'',conflict:false,missingData:false}]}],conflicts:[],missingData:[],goalCandidates:[]};
const goal:GoalDraft={id:'1',domain:'Giao tiếp tiếp nhận',sourceSkill:'Đáp lại khi gọi tên',targetBehavior:'Đáp lại khi gọi tên',duration:'8 tuần',context:'Lớp học',opportunityCondition:'5 cơ hội',maxSupport:'Gợi ý lời nói',masteryCriterion:'4/5 cơ hội',contextsCount:2,peopleCount:2,consecutiveSessions:3,baselineStatus:'missing',baselineEvidence:'Chưa đủ dữ liệu nền'};
describe('rule engine',()=>{it('rejects a goal from an invalid source group',()=>{const bad={...goal,sourceSkill:'Không có'};expect(runRules('',input,analysis,[bad]).find(x=>x.id===12)?.passed).toBe(false)});it('limits goals to five',()=>expect(runRules('',input,analysis,Array(6).fill(goal)).find(x=>x.id===13)?.passed).toBe(false))});
