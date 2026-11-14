#!/usr/bin/env node
/** 生成不含赛题原始学生数据的公开演示样例。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLearningPlan, validatePlan } from '../src/recommendation-engine.mjs';
import { INDICATORS, TOPICS } from '../src/knowledge-base.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedAt = '2026-11-14T12:00:00+08:00';
const questions = {
  Q009:{material_id:'Q009',topic_id:'T01',indicator_id:'T01I2',type:'解答题',stem:'示例：化简一个含括号的整式。',answer:'示例答案',analysis:'示例解析：先去括号，再合并同类项。',max_score:3},
  Q014:{material_id:'Q014',topic_id:'T01',indicator_id:'T01I1',type:'解答题',stem:'示例：用含x的整式表示总人数。',answer:'示例整式',analysis:'示例解析：先写第二个量，再相加。',max_score:3},
  Q022:{material_id:'Q022',topic_id:'T02',indicator_id:'T02I1',type:'解答题',stem:'示例：解一元一次方程。',answer:'示例解',analysis:'示例解析：移项、合并并代回检验。',max_score:3},
  Q025:{material_id:'Q025',topic_id:'T02',indicator_id:'T02I1',type:'解答题',stem:'示例：解含分母的一元一次方程。',answer:'示例解',analysis:'示例解析：去分母后逐步化简。',max_score:3},
  Q026:{material_id:'Q026',topic_id:'T02',indicator_id:'T02I1',type:'填空题',stem:'示例：判断一个数是否为方程的解。',answer:'是',analysis:'示例解析：代入左右两边判断是否相等。',max_score:1},
  Q034:{material_id:'Q034',topic_id:'T02',indicator_id:'T02I3',type:'解答题',stem:'示例：用方程组解决票价问题。',answer:'示例答案',analysis:'示例解析：设未知数、列方程并检验。',max_score:3},
  Q039:{material_id:'Q039',topic_id:'T03',indicator_id:'T03I1',type:'填空题',stem:'示例：解一个简单不等式。',answer:'示例解集',analysis:'示例解析：移项并检查方向。',max_score:1},
  Q041:{material_id:'Q041',topic_id:'T03',indicator_id:'T03I1',type:'填空题',stem:'示例：解一个含负数系数的不等式。',answer:'示例解集',analysis:'示例解析：除以负数时改变方向。',max_score:1},
  Q042:{material_id:'Q042',topic_id:'T03',indicator_id:'T03I1',type:'填空题',stem:'示例：判断乘负数后不等号方向。',answer:'>',analysis:'示例解析：两边乘负数，不等号反向。',max_score:1},
  Q043:{material_id:'Q043',topic_id:'T03',indicator_id:'T03I1',type:'解答题',stem:'示例：解不等式并检查解集。',answer:'示例解集',analysis:'示例解析：移项后除以负数，方向改变并代值核对。',max_score:3}
};
const evidence = [
  {record_id:'XR01',event_id:'S01-N02-Q043',revision:2,student_id:'S01',node_id:'N02',item_id:'Q043',topic_id:'T03',indicator_id:'T03I1',status:'已评分',score:1,max_score:3,answer:'示例作答',steps:'示例步骤',point_scores:'Q043P1=1；Q043P2=0；Q043P3=0',source_ref:'XR01'},
  {record_id:'XR02',event_id:'S01-N02-Q041',revision:1,student_id:'S01',node_id:'N02',item_id:'Q041',topic_id:'T03',indicator_id:'T03I1',status:'已评分',score:0,max_score:1,answer:'示例作答',steps:'',point_scores:'Q041P1=0',source_ref:'XR02'},
  {record_id:'XR03',event_id:'S01-N02-Q039',revision:1,student_id:'S01',node_id:'N02',item_id:'Q039',topic_id:'T03',indicator_id:'T03I1',status:'已评分',score:1,max_score:1,answer:'示例作答',steps:'',point_scores:'Q039P1=1',source_ref:'XR03'},
  {record_id:'XR11',event_id:'S02-N01-Q026',revision:1,student_id:'S02',node_id:'N01',item_id:'Q026',topic_id:'T02',indicator_id:'T02I1',status:'已评分',score:0,max_score:1,answer:'否',steps:'',point_scores:'Q026P1=0',source_ref:'XR11'},
  {record_id:'XR12',event_id:'S02-N01-Q025',revision:1,student_id:'S02',node_id:'N01',item_id:'Q025',topic_id:'T02',indicator_id:'T02I1',status:'已评分',score:3,max_score:3,answer:'示例作答',steps:'示例步骤',point_scores:'Q025P1=1；Q025P2=1；Q025P3=1',source_ref:'XR12'},
  {record_id:'XR13',event_id:'S02-N01-Q022',revision:1,student_id:'S02',node_id:'N01',item_id:'Q022',topic_id:'T02',indicator_id:'T02I1',status:'已评分',score:3,max_score:3,answer:'示例作答',steps:'示例步骤',point_scores:'Q022P1=1；Q022P2=1；Q022P3=1',source_ref:'XR13'},
  {record_id:'XR21',event_id:'S03-N01-Q009',revision:1,student_id:'S03',node_id:'N01',item_id:'Q009',topic_id:'T01',indicator_id:'T01I2',status:'已评分',score:3,max_score:3,answer:'示例作答',steps:'示例步骤',point_scores:'Q009P1=1；Q009P2=1；Q009P3=1',source_ref:'XR21'},
  {record_id:'XR22',event_id:'S03-N01-Q014',revision:1,student_id:'S03',node_id:'N01',item_id:'Q014',topic_id:'T01',indicator_id:'T01I1',status:'已评分',score:3,max_score:3,answer:'示例作答',steps:'示例步骤',point_scores:'Q014P1=1；Q014P2=1；Q014P3=1',source_ref:'XR22'}
];
const students = [
  {student_id:'S01',class_id:'SC01',records:3,graded:3,pending:0,unanswered:0,earned:2,possible:5,score_rate:40,topic_count:1,topic_rates:{T01:null,T02:null,T03:40}},
  {student_id:'S02',class_id:'SC01',records:3,graded:3,pending:0,unanswered:0,earned:6,possible:7,score_rate:85.7,topic_count:1,topic_rates:{T01:null,T02:85.7,T03:null}},
  {student_id:'S03',class_id:'SC02',records:2,graded:2,pending:0,unanswered:0,earned:6,possible:6,score_rate:100,topic_count:1,topic_rates:{T01:100,T02:null,T03:null}}
];
const options = {
  S01:{focus_indicator:'T03I1',review_item:'Q043',preferred_items:['Q043','Q041','Q042']},
  S02:{focus_indicator:'T02I1',review_item:'Q026',preferred_items:['Q026','Q022','Q034']},
  S03:{plan_mode:'coverage',coverage_probe_indicators:['T02I1','T03I1']}
};
const cases = {};
for (const [id,opt] of Object.entries(options)) {
  const plan = buildLearningPlan({student:{id,class_id:students.find(s=>s.student_id===id).class_id},evidence:evidence.filter(e=>e.student_id===id),questions,...opt},generatedAt);
  const errors=validatePlan(plan); if(errors.length)throw new Error(id+':'+errors.join(';'));
  cases[id]=plan;
}
const topicStats=['T01','T02','T03'].map(topic=>({key:topic,rate:topic==='T03'?40:topic==='T02'?85.7:100,records:topic==='T01'?2:topic==='T02'?3:3,graded:topic==='T01'?2:topic==='T02'?3:3,earned:topic==='T01'?6:topic==='T02'?6:2,possible:topic==='T01'?6:topic==='T02'?7:5,student_count:1,item_count:2}));
const indicatorStats=Object.keys(INDICATORS).map(id=>({key:id,rate:id==='T03I1'?40:id==='T02I1'?85.7:id==='T01I1'?100:id==='T01I2'?100:null,records:id==='T03I1'?3:id==='T02I1'?3:1,graded:id==='T03I1'?3:id==='T02I1'?3:1,earned:id==='T03I1'?2:id==='T02I1'?6:3,possible:id==='T03I1'?5:id==='T02I1'?7:3,student_count:1,item_count:1})).filter(x=>x.rate!==null);
const case_meta={
 S01:{type:'合成案例 A',tag:'规则反向',note:'演示如何从部分得分定位具体步骤；所有内容均为合成样例。'},
 S02:{type:'合成案例 B',tag:'检验与迁移',note:'演示如何从单个错误走向检验与迁移；所有内容均为合成样例。'},
 S03:{type:'合成案例 C',tag:'补充观察',note:'演示记录不足时先观察、不推断掌握；所有内容均为合成样例。'}
};
const data={generated_at:generatedAt,is_synthetic:true,cases,case_meta,all_plans:Object.values(cases),student_profiles:students,data_quality_summary:{raw_rows:8,event_count:8,revision_count:0,pending:0,unanswered:0,anomalies:0},class_stats:[{key:'SC01',rate:66.7},{key:'SC02',rate:100}],topic_stats:topicStats,indicator_stats:indicatorStats,anomaly_log:[],question_bank:questions,requirements:Object.entries(TOPICS).map(([topic_id,t])=>({'主题编号':topic_id,'主题':t.name,'课标整理编号':t.standard,'课标文件页／正文页':t.standardPage,'教材正文页':t.pages}))};
fs.writeFileSync(path.join(root,'demo','data.example.js'),'window.SMART_LEARNING_DATA = '+JSON.stringify(data,null,2)+';\n','utf8');
console.log(JSON.stringify({cases:Object.keys(cases),synthetic:true},null,2));
