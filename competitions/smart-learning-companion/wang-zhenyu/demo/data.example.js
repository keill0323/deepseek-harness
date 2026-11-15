window.SMART_LEARNING_DATA = {
  "generated_at": "2026-11-15T12:00:00+08:00",
  "is_synthetic": true,
  "cases": {
    "S01": {
      "schema_version": "1.1.0",
      "plan_id": "PLAN-S01-t03i1-20261115",
      "generated_at": "2026-11-15T12:00:00+08:00",
      "module": {
        "name": "个性化建议与分步辅导",
        "owner": "王振宇",
        "version": "1.1.0"
      },
      "student": {
        "id": "S01",
        "class_id": "SC01"
      },
      "target_node_id": "N02",
      "plan_kind": "remediation",
      "certainty": "adequate",
      "primary_focus": {
        "indicator_id": "T03I1",
        "topic_id": "T03",
        "topic_name": "不等式与不等式组",
        "indicator_name": "运用不等式性质求解，负数乘除时正确改变方向",
        "focus_statement": "移项、合并后，两边乘除负数时改变不等号方向，并检验解集。",
        "score_rate": 40,
        "evidence_count": 3,
        "selection_reason": "调用方指定当前辅导重点"
      },
      "summary": "已评分证据 3 条，当前得分率为 40%。本次优先处理“运用不等式性质求解，负数乘除时正确改变方向”。",
      "evidence_used": [
        {
          "record_id": "XR01",
          "item_id": "Q043",
          "student_id": "S01",
          "node_id": "N02",
          "topic_id": "T03",
          "indicator_id": "T03I1",
          "status": "已评分",
          "score": 1,
          "max_score": 3,
          "answer": "示例作答",
          "steps": "示例步骤",
          "point_scores": "Q043P1=1；Q043P2=0；Q043P3=0",
          "stem": "示例：解不等式并检查解集。",
          "source_ref": "XR01"
        },
        {
          "record_id": "XR02",
          "item_id": "Q041",
          "student_id": "S01",
          "node_id": "N02",
          "topic_id": "T03",
          "indicator_id": "T03I1",
          "status": "已评分",
          "score": 0,
          "max_score": 1,
          "answer": "示例作答",
          "steps": "",
          "point_scores": "Q041P1=0",
          "stem": "示例：解一个含负数系数的不等式。",
          "source_ref": "XR02"
        },
        {
          "record_id": "XR03",
          "item_id": "Q039",
          "student_id": "S01",
          "node_id": "N02",
          "topic_id": "T03",
          "indicator_id": "T03I1",
          "status": "已评分",
          "score": 1,
          "max_score": 1,
          "answer": "示例作答",
          "steps": "",
          "point_scores": "Q039P1=1",
          "stem": "示例：解一个简单不等式。",
          "source_ref": "XR03"
        }
      ],
      "evidence_gaps": [
        {
          "indicator_id": "T01I1",
          "topic": "T01",
          "name": "表示数量关系并代入求值",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T01I2",
          "topic": "T01",
          "name": "识别同类项、去括号并化简",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T01I3",
          "topic": "T01",
          "name": "用整式解释具体问题",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I1",
          "topic": "T02",
          "name": "运用等式性质解一元一次方程",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I2",
          "topic": "T02",
          "name": "用消元法解二元一次方程组",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I3",
          "topic": "T02",
          "name": "列方程或方程组解决实际问题并检验",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I2",
          "topic": "T03",
          "name": "求两个一元一次不等式解集的交集",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I3",
          "topic": "T03",
          "name": "根据实际限制列不等式并解释取值范围",
          "interpretation": "无已评分证据，不能判断掌握程度"
        }
      ],
      "material_refs": [
        {
          "type": "学习卡",
          "id": "L03",
          "location": "L03",
          "note": "运用不等式性质求解，负数乘除时正确改变方向"
        },
        {
          "type": "教材切片",
          "id": "B02_相关资料切片.pdf",
          "location": "下册120—145",
          "note": "按教材正文顺序复习"
        },
        {
          "type": "课程标准",
          "id": "CR03",
          "location": "课标63／正文56",
          "note": "运用不等式性质求解，负数乘除时正确改变方向"
        }
      ],
      "steps": [
        {
          "step_no": 1,
          "phase": "概念复位",
          "objective": "用学习卡恢复规则和观察顺序，不直接解题。",
          "item_refs": [],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L03",
              "location": "L03",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            },
            {
              "type": "教材切片",
              "id": "B02_相关资料切片.pdf",
              "location": "下册120—145",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR03",
              "location": "课标63／正文56",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            }
          ],
          "student_action": "读学习卡，用自己的话说出本指标最关键的一条规则，并圈出关键词。",
          "hints": [
            {
              "level": 1,
              "text": "先看x的系数是正还是负；要把x单独留下，需要乘或除什么数？",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "先不要算结果；按“看条件—选规则—写下一步”的顺序说一遍。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "从解集两侧各取一个数代入原不等式，看看哪一侧满足，并检查端点是否包含。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "能说出规则而不看答案",
            "能指出题目中触发该规则的词或符号"
          ],
          "next_if_success": "进入原题复盘。",
          "next_if_not": "教师用学习卡中的最小例子示范一次，再让学生复述。"
        },
        {
          "step_no": 2,
          "phase": "原题复盘",
          "objective": "定位首次出错步骤，而不是重做整题。",
          "item_refs": [
            "Q043"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L03",
              "location": "L03",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            },
            {
              "type": "教材切片",
              "id": "B02_相关资料切片.pdf",
              "location": "下册120—145",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR03",
              "location": "课标63／正文56",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            }
          ],
          "student_action": "标出自己第一次不确定的步骤，说明当时依据的规则；使用一级提示后尝试修正该步。",
          "hints": [
            {
              "level": 1,
              "text": "先看x的系数是正还是负；要把x单独留下，需要乘或除什么数？",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "只检查当前这一步：你依据的是哪条规则？符号或方向在这一步有没有变化？",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "从解集两侧各取一个数代入原不等式，看看哪一侧满足，并检查端点是否包含。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "能指出具体卡点",
            "能按规则修正当前步骤并说明理由"
          ],
          "next_if_success": "进入同类独立练习。",
          "next_if_not": "下降到三级提示，用代值或反向运算核对这一步。",
          "teacher_only": [
            {
              "item_id": "Q043",
              "stem": "示例：解不等式并检查解集。",
              "answer": "示例解集",
              "analysis": "示例解析：移项后除以负数，方向改变并代值核对。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 3,
          "phase": "独立练习",
          "objective": "在同类题中独立迁移同一规则。",
          "item_refs": [
            "Q041"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L03",
              "location": "L03",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            },
            {
              "type": "教材切片",
              "id": "B02_相关资料切片.pdf",
              "location": "下册120—145",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR03",
              "location": "课标63／正文56",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            }
          ],
          "student_action": "独立完成，不先看提示；完成后用一句话说明关键步骤。",
          "hints": [
            {
              "level": 1,
              "text": "先看x的系数是正还是负；要把x单独留下，需要乘或除什么数？",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "移项后观察两边同时乘除的数；写出这一步时，明确判断不等号方向是否应改变。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "从解集两侧各取一个数代入原不等式，看看哪一侧满足，并检查端点是否包含。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "基本步骤正确",
            "能说明关键规则",
            "完成自检"
          ],
          "next_if_success": "进入不同情境的迁移题。",
          "next_if_not": "回到二级提示，只改卡点步骤，不重抄整题。",
          "teacher_only": [
            {
              "item_id": "Q041",
              "stem": "示例：解一个含负数系数的不等式。",
              "answer": "示例解集",
              "analysis": "示例解析：除以负数时改变方向。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 4,
          "phase": "迁移与检验",
          "objective": "换情境或换问法后仍能使用同一规则，并完成检查。",
          "item_refs": [
            "Q042"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L03",
              "location": "L03",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            },
            {
              "type": "教材切片",
              "id": "B02_相关资料切片.pdf",
              "location": "下册120—145",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR03",
              "location": "课标63／正文56",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            }
          ],
          "student_action": "完成后必须写出一个检查动作：代值、回代、数轴核对或结合实际条件解释。",
          "hints": [
            {
              "level": 1,
              "text": "先看x的系数是正还是负；要把x单独留下，需要乘或除什么数？",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "移项后观察两边同时乘除的数；写出这一步时，明确判断不等号方向是否应改变。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "从解集两侧各取一个数代入原不等式，看看哪一侧满足，并检查端点是否包含。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "迁移题结果正确",
            "检查动作与题型匹配",
            "能解释结果是否合理"
          ],
          "next_if_success": "进入反思和下一次观察。",
          "next_if_not": "暂停新题，回到学习卡并降低一个认知步骤。",
          "teacher_only": [
            {
              "item_id": "Q042",
              "stem": "示例：判断乘负数后不等号方向。",
              "answer": ">",
              "analysis": "示例解析：两边乘负数，不等号反向。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 5,
          "phase": "反思与退出",
          "objective": "把一次正确表现转成可复用的自检语言。",
          "item_refs": [],
          "student_action": "填写两句话：这次最容易错的地方是____；下次开始前我先检查____。",
          "hints": [
            {
              "level": 1,
              "text": "回看第2步和第4步，比较自己在哪一步使用了提示。",
              "purpose": "形成自我监控",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "把“粗心”改写成具体动作，例如检查符号、端点、单位或回代。",
              "purpose": "形成可执行检查",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "请教师根据本次提示层级决定下一题难度。",
              "purpose": "交给教师调整",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "反思包含具体步骤",
            "下一次计划有明确观察点"
          ],
          "next_if_success": "按调整规则决定是否结束本指标强化。",
          "next_if_not": "保留原计划再练一题，不立即切换主题。"
        }
      ],
      "observation": [
        "是否识别负系数",
        "除以负数后是否改变方向",
        "是否用代值法核对解集"
      ],
      "adjustment_rules": [
        {
          "id": "A1",
          "condition": "学生只读一级提示就能独立完成并说明理由",
          "action": "跳过二级提示，直接进入迁移题；记录为独立达成。"
        },
        {
          "id": "A2",
          "condition": "学生在二级提示后完成，但单独作答仍出错",
          "action": "保留同结构变式一题，减少提示层级后再次观察。"
        },
        {
          "id": "A3",
          "condition": "三级提示后仍未完成或仍只靠试猜",
          "action": "若第二层仍漏反向，回到“乘除负数”专项；下一次计划降低难度并增加示范。"
        },
        {
          "id": "A4",
          "condition": "连续两次独立完成同类题并能在反思中说清依据",
          "action": "结束本指标强化，转入下一薄弱指标或迁移任务。"
        }
      ],
      "limitations": [
        "证据数量足以为本次计划提供方向，但仍不代表长期掌握。",
        "待评分、未作答和无记录不会被当作零分或未掌握。",
        "若题目、材料或记录版本发生变化，必须重新生成计划。"
      ],
      "teacher_explanation": [
        {
          "item_id": "Q043",
          "stem": "示例：解不等式并检查解集。",
          "answer": "示例解集",
          "analysis": "示例解析：移项后除以负数，方向改变并代值核对。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        },
        {
          "item_id": "Q041",
          "stem": "示例：解一个含负数系数的不等式。",
          "answer": "示例解集",
          "analysis": "示例解析：除以负数时改变方向。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        },
        {
          "item_id": "Q042",
          "stem": "示例：判断乘负数后不等号方向。",
          "answer": ">",
          "analysis": "示例解析：两边乘负数，不等号反向。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        }
      ],
      "quality_checks": {
        "no_direct_answer_in_student_hints": true,
        "hint_leak_reasons": [],
        "uncertainty_explicit": true,
        "evidence_ids": [
          "XR01",
          "XR02",
          "XR03"
        ],
        "input_context_valid": true,
        "material_refs_present": true,
        "adjustment_conditions_present": true
      }
    },
    "S02": {
      "schema_version": "1.1.0",
      "plan_id": "PLAN-S02-t02i1-20261115",
      "generated_at": "2026-11-15T12:00:00+08:00",
      "module": {
        "name": "个性化建议与分步辅导",
        "owner": "王振宇",
        "version": "1.1.0"
      },
      "student": {
        "id": "S02",
        "class_id": "SC01"
      },
      "target_node_id": "N01",
      "plan_kind": "extension",
      "certainty": "adequate",
      "primary_focus": {
        "indicator_id": "T02I1",
        "topic_id": "T02",
        "topic_name": "方程与方程组",
        "indicator_name": "运用等式性质解一元一次方程",
        "focus_statement": "保持等式两边同变，按去分母、去括号、移项、系数化为1的顺序求解并检验。",
        "score_rate": 85.7,
        "evidence_count": 3,
        "selection_reason": "调用方指定当前辅导重点"
      },
      "summary": "已评分证据 3 条，当前得分率为 85.7%。本次优先处理“运用等式性质解一元一次方程”。",
      "evidence_used": [
        {
          "record_id": "XR11",
          "item_id": "Q026",
          "student_id": "S02",
          "node_id": "N01",
          "topic_id": "T02",
          "indicator_id": "T02I1",
          "status": "已评分",
          "score": 0,
          "max_score": 1,
          "answer": "否",
          "steps": "",
          "point_scores": "Q026P1=0",
          "stem": "示例：判断一个数是否为方程的解。",
          "source_ref": "XR11"
        },
        {
          "record_id": "XR12",
          "item_id": "Q025",
          "student_id": "S02",
          "node_id": "N01",
          "topic_id": "T02",
          "indicator_id": "T02I1",
          "status": "已评分",
          "score": 3,
          "max_score": 3,
          "answer": "示例作答",
          "steps": "示例步骤",
          "point_scores": "Q025P1=1；Q025P2=1；Q025P3=1",
          "stem": "示例：解含分母的一元一次方程。",
          "source_ref": "XR12"
        },
        {
          "record_id": "XR13",
          "item_id": "Q022",
          "student_id": "S02",
          "node_id": "N01",
          "topic_id": "T02",
          "indicator_id": "T02I1",
          "status": "已评分",
          "score": 3,
          "max_score": 3,
          "answer": "示例作答",
          "steps": "示例步骤",
          "point_scores": "Q022P1=1；Q022P2=1；Q022P3=1",
          "stem": "示例：解一元一次方程。",
          "source_ref": "XR13"
        }
      ],
      "evidence_gaps": [
        {
          "indicator_id": "T01I1",
          "topic": "T01",
          "name": "表示数量关系并代入求值",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T01I2",
          "topic": "T01",
          "name": "识别同类项、去括号并化简",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T01I3",
          "topic": "T01",
          "name": "用整式解释具体问题",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I2",
          "topic": "T02",
          "name": "用消元法解二元一次方程组",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I3",
          "topic": "T02",
          "name": "列方程或方程组解决实际问题并检验",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I1",
          "topic": "T03",
          "name": "运用不等式性质求解，负数乘除时正确改变方向",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I2",
          "topic": "T03",
          "name": "求两个一元一次不等式解集的交集",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I3",
          "topic": "T03",
          "name": "根据实际限制列不等式并解释取值范围",
          "interpretation": "无已评分证据，不能判断掌握程度"
        }
      ],
      "material_refs": [
        {
          "type": "学习卡",
          "id": "L02",
          "location": "L02",
          "note": "运用等式性质解一元一次方程"
        },
        {
          "type": "教材切片",
          "id": "B06_相关资料切片.pdf",
          "location": "上册110—148；下册87—119",
          "note": "按教材正文顺序复习"
        },
        {
          "type": "课程标准",
          "id": "CR02",
          "location": "课标63／正文56",
          "note": "运用等式性质解一元一次方程"
        }
      ],
      "steps": [
        {
          "step_no": 1,
          "phase": "概念复位",
          "objective": "用学习卡恢复规则和观察顺序，不直接解题。",
          "item_refs": [],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L02",
              "location": "L02",
              "note": "运用等式性质解一元一次方程"
            },
            {
              "type": "教材切片",
              "id": "B06_相关资料切片.pdf",
              "location": "上册110—148；下册87—119",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR02",
              "location": "课标63／正文56",
              "note": "运用等式性质解一元一次方程"
            }
          ],
          "student_action": "读学习卡，用自己的话说出本指标最关键的一条规则，并圈出关键词。",
          "hints": [
            {
              "level": 1,
              "text": "把方程两边想成天平：你在一侧做的运算，另一侧也要做。",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "先不要算结果；按“看条件—选规则—写下一步”的顺序说一遍。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "把求得的数代回原方程左右两边分别计算，不要只检查最后一步。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "能说出规则而不看答案",
            "能指出题目中触发该规则的词或符号"
          ],
          "next_if_success": "进入原题复盘。",
          "next_if_not": "教师用学习卡中的最小例子示范一次，再让学生复述。"
        },
        {
          "step_no": 2,
          "phase": "原题复盘",
          "objective": "定位首次出错步骤，而不是重做整题。",
          "item_refs": [
            "Q026"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L02",
              "location": "L02",
              "note": "运用等式性质解一元一次方程"
            },
            {
              "type": "教材切片",
              "id": "B06_相关资料切片.pdf",
              "location": "上册110—148；下册87—119",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR02",
              "location": "课标63／正文56",
              "note": "运用等式性质解一元一次方程"
            }
          ],
          "student_action": "标出自己第一次不确定的步骤，说明当时依据的规则；使用一级提示后尝试修正该步。",
          "hints": [
            {
              "level": 1,
              "text": "把方程两边想成天平：你在一侧做的运算，另一侧也要做。",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "只检查当前这一步：你依据的是哪条规则？符号或方向在这一步有没有变化？",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "把求得的数代回原方程左右两边分别计算，不要只检查最后一步。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "能指出具体卡点",
            "能按规则修正当前步骤并说明理由"
          ],
          "next_if_success": "进入同类独立练习。",
          "next_if_not": "下降到三级提示，用代值或反向运算核对这一步。",
          "teacher_only": [
            {
              "item_id": "Q026",
              "stem": "示例：判断一个数是否为方程的解。",
              "answer": "是",
              "analysis": "示例解析：代入左右两边判断是否相等。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 3,
          "phase": "独立练习",
          "objective": "在同类题中独立迁移同一规则。",
          "item_refs": [
            "Q022"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L02",
              "location": "L02",
              "note": "运用等式性质解一元一次方程"
            },
            {
              "type": "教材切片",
              "id": "B06_相关资料切片.pdf",
              "location": "上册110—148；下册87—119",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR02",
              "location": "课标63／正文56",
              "note": "运用等式性质解一元一次方程"
            }
          ],
          "student_action": "独立完成，不先看提示；完成后用一句话说明关键步骤。",
          "hints": [
            {
              "level": 1,
              "text": "把方程两边想成天平：你在一侧做的运算，另一侧也要做。",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "先确定当前应先处理分母、括号还是常数项；每一步只改变一个层次，并把等号对齐。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "把求得的数代回原方程左右两边分别计算，不要只检查最后一步。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "基本步骤正确",
            "能说明关键规则",
            "完成自检"
          ],
          "next_if_success": "进入不同情境的迁移题。",
          "next_if_not": "回到二级提示，只改卡点步骤，不重抄整题。",
          "teacher_only": [
            {
              "item_id": "Q022",
              "stem": "示例：解一元一次方程。",
              "answer": "示例解",
              "analysis": "示例解析：移项、合并并代回检验。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 4,
          "phase": "迁移与检验",
          "objective": "换情境或换问法后仍能使用同一规则，并完成检查。",
          "item_refs": [
            "Q025"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L02",
              "location": "L02",
              "note": "运用等式性质解一元一次方程"
            },
            {
              "type": "教材切片",
              "id": "B06_相关资料切片.pdf",
              "location": "上册110—148；下册87—119",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR02",
              "location": "课标63／正文56",
              "note": "运用等式性质解一元一次方程"
            }
          ],
          "student_action": "完成后必须写出一个检查动作：代值、回代、数轴核对或结合实际条件解释。",
          "hints": [
            {
              "level": 1,
              "text": "把方程两边想成天平：你在一侧做的运算，另一侧也要做。",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "先确定当前应先处理分母、括号还是常数项；每一步只改变一个层次，并把等号对齐。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "把求得的数代回原方程左右两边分别计算，不要只检查最后一步。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "迁移题结果正确",
            "检查动作与题型匹配",
            "能解释结果是否合理"
          ],
          "next_if_success": "进入反思和下一次观察。",
          "next_if_not": "暂停新题，回到学习卡并降低一个认知步骤。",
          "teacher_only": [
            {
              "item_id": "Q025",
              "stem": "示例：解含分母的一元一次方程。",
              "answer": "示例解",
              "analysis": "示例解析：去分母后逐步化简。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 5,
          "phase": "反思与退出",
          "objective": "把一次正确表现转成可复用的自检语言。",
          "item_refs": [],
          "student_action": "填写两句话：这次最容易错的地方是____；下次开始前我先检查____。",
          "hints": [
            {
              "level": 1,
              "text": "回看第2步和第4步，比较自己在哪一步使用了提示。",
              "purpose": "形成自我监控",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "把“粗心”改写成具体动作，例如检查符号、端点、单位或回代。",
              "purpose": "形成可执行检查",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "请教师根据本次提示层级决定下一题难度。",
              "purpose": "交给教师调整",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "反思包含具体步骤",
            "下一次计划有明确观察点"
          ],
          "next_if_success": "按调整规则决定是否结束本指标强化。",
          "next_if_not": "保留原计划再练一题，不立即切换主题。"
        }
      ],
      "observation": [
        "每一步是否两侧同变",
        "移项后符号是否改变",
        "是否把结果代回原方程检验"
      ],
      "adjustment_rules": [
        {
          "id": "A1",
          "condition": "学生只读一级提示就能独立完成并说明理由",
          "action": "跳过二级提示，直接进入迁移题；记录为独立达成。"
        },
        {
          "id": "A2",
          "condition": "学生在二级提示后完成，但单独作答仍出错",
          "action": "保留同结构变式一题，减少提示层级后再次观察。"
        },
        {
          "id": "A3",
          "condition": "三级提示后仍未完成或仍只靠试猜",
          "action": "若第二层出错，回到单项等式性质练习；下一次计划降低难度并增加示范。"
        },
        {
          "id": "A4",
          "condition": "连续两次独立完成同类题并能在反思中说清依据",
          "action": "结束本指标强化，转入下一薄弱指标或迁移任务。"
        }
      ],
      "limitations": [
        "证据数量足以为本次计划提供方向，但仍不代表长期掌握。",
        "待评分、未作答和无记录不会被当作零分或未掌握。",
        "若题目、材料或记录版本发生变化，必须重新生成计划。"
      ],
      "teacher_explanation": [
        {
          "item_id": "Q026",
          "stem": "示例：判断一个数是否为方程的解。",
          "answer": "是",
          "analysis": "示例解析：代入左右两边判断是否相等。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        },
        {
          "item_id": "Q022",
          "stem": "示例：解一元一次方程。",
          "answer": "示例解",
          "analysis": "示例解析：移项、合并并代回检验。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        },
        {
          "item_id": "Q025",
          "stem": "示例：解含分母的一元一次方程。",
          "answer": "示例解",
          "analysis": "示例解析：去分母后逐步化简。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        }
      ],
      "quality_checks": {
        "no_direct_answer_in_student_hints": true,
        "hint_leak_reasons": [],
        "uncertainty_explicit": true,
        "evidence_ids": [
          "XR11",
          "XR12",
          "XR13"
        ],
        "input_context_valid": true,
        "material_refs_present": true,
        "adjustment_conditions_present": true
      }
    },
    "S03": {
      "schema_version": "1.1.0",
      "plan_id": "PLAN-S03-coverage-20261115",
      "generated_at": "2026-11-15T12:00:00+08:00",
      "module": {
        "name": "个性化建议与分步辅导",
        "owner": "王振宇",
        "version": "1.1.0"
      },
      "student": {
        "id": "S03",
        "class_id": "SC02"
      },
      "target_node_id": "N02",
      "plan_kind": "coverage_probe",
      "certainty": "insufficient",
      "primary_focus": null,
      "summary": "现有证据只覆盖部分主题，先设计低负担观察任务，再决定后续强化方向。",
      "evidence_used": [],
      "evidence_gaps": [
        {
          "indicator_id": "T01I1",
          "topic": "T01",
          "name": "表示数量关系并代入求值",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T01I2",
          "topic": "T01",
          "name": "识别同类项、去括号并化简",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T01I3",
          "topic": "T01",
          "name": "用整式解释具体问题",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I1",
          "topic": "T02",
          "name": "运用等式性质解一元一次方程",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I2",
          "topic": "T02",
          "name": "用消元法解二元一次方程组",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I3",
          "topic": "T02",
          "name": "列方程或方程组解决实际问题并检验",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I1",
          "topic": "T03",
          "name": "运用不等式性质求解，负数乘除时正确改变方向",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I2",
          "topic": "T03",
          "name": "求两个一元一次不等式解集的交集",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I3",
          "topic": "T03",
          "name": "根据实际限制列不等式并解释取值范围",
          "interpretation": "无已评分证据，不能判断掌握程度"
        }
      ],
      "material_refs": [
        {
          "type": "学习卡",
          "id": "L02",
          "location": "L02",
          "note": "运用等式性质解一元一次方程"
        },
        {
          "type": "教材切片",
          "id": "B06_相关资料切片.pdf",
          "location": "上册110—148；下册87—119",
          "note": "按教材正文顺序复习"
        },
        {
          "type": "课程标准",
          "id": "CR02",
          "location": "课标63／正文56",
          "note": "运用等式性质解一元一次方程"
        },
        {
          "type": "学习卡",
          "id": "L03",
          "location": "L03",
          "note": "运用不等式性质求解，负数乘除时正确改变方向"
        },
        {
          "type": "教材切片",
          "id": "B02_相关资料切片.pdf",
          "location": "下册120—145",
          "note": "按教材正文顺序复习"
        },
        {
          "type": "课程标准",
          "id": "CR03",
          "location": "课标63／正文56",
          "note": "运用不等式性质求解，负数乘除时正确改变方向"
        }
      ],
      "steps": [
        {
          "step_no": 1,
          "phase": "确认已有优势",
          "objective": "用一题已掌握主题的题确认学生能独立说明步骤。",
          "item_refs": [],
          "student_action": "选择一题已经做过的题，口述“我先做什么、再做什么、最后怎样检查”。",
          "hints": [],
          "success_criteria": [
            "能独立口述完整步骤",
            "能指出自己使用的规则"
          ],
          "next_if_success": "进入未覆盖主题的短探测。",
          "next_if_not": "先回到对应学习卡，不用本次记录判断新主题。"
        },
        {
          "step_no": 2,
          "phase": "低负担主题探测",
          "objective": "补充观察 运用等式性质解一元一次方程。",
          "item_refs": [
            "Q022"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L02",
              "location": "L02",
              "note": "运用等式性质解一元一次方程"
            },
            {
              "type": "教材切片",
              "id": "B06_相关资料切片.pdf",
              "location": "上册110—148；下册87—119",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR02",
              "location": "课标63／正文56",
              "note": "运用等式性质解一元一次方程"
            }
          ],
          "student_action": "独立完成并写出关键步骤；不会时可使用一级提示。",
          "hints": [
            {
              "level": 1,
              "text": "把方程两边想成天平：你在一侧做的运算，另一侧也要做。",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "先确定当前应先处理分母、括号还是常数项；每一步只改变一个层次，并把等号对齐。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "把求得的数代回原方程左右两边分别计算，不要只检查最后一步。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "能说明使用的规则",
            "能完成基本步骤并自行检查"
          ],
          "next_if_success": "补一题同指标变式，确认不是偶然正确。",
          "next_if_not": "记录提示层级与卡点，进入该指标的小步辅导。",
          "teacher_only": [
            {
              "item_id": "Q022",
              "stem": "示例：解一元一次方程。",
              "answer": "示例解",
              "analysis": "示例解析：移项、合并并代回检验。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 3,
          "phase": "低负担主题探测",
          "objective": "补充观察 运用不等式性质求解，负数乘除时正确改变方向。",
          "item_refs": [
            "Q039"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L03",
              "location": "L03",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            },
            {
              "type": "教材切片",
              "id": "B02_相关资料切片.pdf",
              "location": "下册120—145",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR03",
              "location": "课标63／正文56",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            }
          ],
          "student_action": "独立完成并写出关键步骤；不会时可使用一级提示。",
          "hints": [
            {
              "level": 1,
              "text": "先看x的系数是正还是负；要把x单独留下，需要乘或除什么数？",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "移项后观察两边同时乘除的数；写出这一步时，明确判断不等号方向是否应改变。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "从解集两侧各取一个数代入原不等式，看看哪一侧满足，并检查端点是否包含。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "能说明使用的规则",
            "能完成基本步骤并自行检查"
          ],
          "next_if_success": "补一题同指标变式，确认不是偶然正确。",
          "next_if_not": "记录提示层级与卡点，进入该指标的小步辅导。",
          "teacher_only": [
            {
              "item_id": "Q039",
              "stem": "示例：解一个简单不等式。",
              "answer": "示例解集",
              "analysis": "示例解析：移项并检查方向。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 4,
          "phase": "形成下一次计划",
          "objective": "依据探测结果确定一个首要辅导指标。",
          "item_refs": [],
          "student_action": "留下本次最短反思：哪一步最容易出错，下一次先检查什么。",
          "hints": [],
          "success_criteria": [
            "下一次计划只聚焦一个首要问题",
            "调整条件有本次观察证据支持"
          ],
          "next_if_success": "生成正式强化计划。",
          "next_if_not": "继续补充观察，不提前贴标签。"
        }
      ],
      "observation": [
        "是否能在无提示下启动",
        "首次卡点发生在哪一步",
        "提示层级与最终独立性"
      ],
      "adjustment_rules": [
        {
          "id": "C1",
          "condition": "两项探测均独立正确",
          "action": "再各加一题变式；仍正确后才记为初步掌握。"
        },
        {
          "id": "C2",
          "condition": "一项正确、一项需要二级提示",
          "action": "优先辅导需要提示的指标。"
        },
        {
          "id": "C3",
          "condition": "两项均需三级提示",
          "action": "降低起点，先从学习卡中的单一规则开始。"
        }
      ],
      "limitations": [
        "当前只有有限主题的已评分记录，不能推断未测主题已掌握或未掌握。",
        "待评分、未作答和无记录均不进入掌握度计算。",
        "本计划首先补充观察，不直接给出“薄弱”结论。"
      ],
      "teacher_explanation": [
        {
          "item_id": "Q022",
          "stem": "示例：解一元一次方程。",
          "answer": "示例解",
          "analysis": "示例解析：移项、合并并代回检验。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        },
        {
          "item_id": "Q039",
          "stem": "示例：解一个简单不等式。",
          "answer": "示例解集",
          "analysis": "示例解析：移项并检查方向。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        }
      ],
      "quality_checks": {
        "no_direct_answer_in_student_hints": true,
        "uncertainty_explicit": true,
        "evidence_ids": [],
        "input_context_valid": true,
        "material_refs_present": true,
        "adjustment_conditions_present": true
      }
    }
  },
  "case_meta": {
    "S01": {
      "type": "合成案例 A",
      "tag": "规则反向",
      "note": "演示如何从部分得分定位具体步骤；所有内容均为合成样例。"
    },
    "S02": {
      "type": "合成案例 B",
      "tag": "检验与迁移",
      "note": "演示如何从单个错误走向检验与迁移；所有内容均为合成样例。"
    },
    "S03": {
      "type": "合成案例 C",
      "tag": "补充观察",
      "note": "演示记录不足时先观察、不推断掌握；所有内容均为合成样例。"
    }
  },
  "all_plans": [
    {
      "schema_version": "1.1.0",
      "plan_id": "PLAN-S01-t03i1-20261115",
      "generated_at": "2026-11-15T12:00:00+08:00",
      "module": {
        "name": "个性化建议与分步辅导",
        "owner": "王振宇",
        "version": "1.1.0"
      },
      "student": {
        "id": "S01",
        "class_id": "SC01"
      },
      "target_node_id": "N02",
      "plan_kind": "remediation",
      "certainty": "adequate",
      "primary_focus": {
        "indicator_id": "T03I1",
        "topic_id": "T03",
        "topic_name": "不等式与不等式组",
        "indicator_name": "运用不等式性质求解，负数乘除时正确改变方向",
        "focus_statement": "移项、合并后，两边乘除负数时改变不等号方向，并检验解集。",
        "score_rate": 40,
        "evidence_count": 3,
        "selection_reason": "调用方指定当前辅导重点"
      },
      "summary": "已评分证据 3 条，当前得分率为 40%。本次优先处理“运用不等式性质求解，负数乘除时正确改变方向”。",
      "evidence_used": [
        {
          "record_id": "XR01",
          "item_id": "Q043",
          "student_id": "S01",
          "node_id": "N02",
          "topic_id": "T03",
          "indicator_id": "T03I1",
          "status": "已评分",
          "score": 1,
          "max_score": 3,
          "answer": "示例作答",
          "steps": "示例步骤",
          "point_scores": "Q043P1=1；Q043P2=0；Q043P3=0",
          "stem": "示例：解不等式并检查解集。",
          "source_ref": "XR01"
        },
        {
          "record_id": "XR02",
          "item_id": "Q041",
          "student_id": "S01",
          "node_id": "N02",
          "topic_id": "T03",
          "indicator_id": "T03I1",
          "status": "已评分",
          "score": 0,
          "max_score": 1,
          "answer": "示例作答",
          "steps": "",
          "point_scores": "Q041P1=0",
          "stem": "示例：解一个含负数系数的不等式。",
          "source_ref": "XR02"
        },
        {
          "record_id": "XR03",
          "item_id": "Q039",
          "student_id": "S01",
          "node_id": "N02",
          "topic_id": "T03",
          "indicator_id": "T03I1",
          "status": "已评分",
          "score": 1,
          "max_score": 1,
          "answer": "示例作答",
          "steps": "",
          "point_scores": "Q039P1=1",
          "stem": "示例：解一个简单不等式。",
          "source_ref": "XR03"
        }
      ],
      "evidence_gaps": [
        {
          "indicator_id": "T01I1",
          "topic": "T01",
          "name": "表示数量关系并代入求值",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T01I2",
          "topic": "T01",
          "name": "识别同类项、去括号并化简",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T01I3",
          "topic": "T01",
          "name": "用整式解释具体问题",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I1",
          "topic": "T02",
          "name": "运用等式性质解一元一次方程",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I2",
          "topic": "T02",
          "name": "用消元法解二元一次方程组",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I3",
          "topic": "T02",
          "name": "列方程或方程组解决实际问题并检验",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I2",
          "topic": "T03",
          "name": "求两个一元一次不等式解集的交集",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I3",
          "topic": "T03",
          "name": "根据实际限制列不等式并解释取值范围",
          "interpretation": "无已评分证据，不能判断掌握程度"
        }
      ],
      "material_refs": [
        {
          "type": "学习卡",
          "id": "L03",
          "location": "L03",
          "note": "运用不等式性质求解，负数乘除时正确改变方向"
        },
        {
          "type": "教材切片",
          "id": "B02_相关资料切片.pdf",
          "location": "下册120—145",
          "note": "按教材正文顺序复习"
        },
        {
          "type": "课程标准",
          "id": "CR03",
          "location": "课标63／正文56",
          "note": "运用不等式性质求解，负数乘除时正确改变方向"
        }
      ],
      "steps": [
        {
          "step_no": 1,
          "phase": "概念复位",
          "objective": "用学习卡恢复规则和观察顺序，不直接解题。",
          "item_refs": [],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L03",
              "location": "L03",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            },
            {
              "type": "教材切片",
              "id": "B02_相关资料切片.pdf",
              "location": "下册120—145",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR03",
              "location": "课标63／正文56",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            }
          ],
          "student_action": "读学习卡，用自己的话说出本指标最关键的一条规则，并圈出关键词。",
          "hints": [
            {
              "level": 1,
              "text": "先看x的系数是正还是负；要把x单独留下，需要乘或除什么数？",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "先不要算结果；按“看条件—选规则—写下一步”的顺序说一遍。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "从解集两侧各取一个数代入原不等式，看看哪一侧满足，并检查端点是否包含。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "能说出规则而不看答案",
            "能指出题目中触发该规则的词或符号"
          ],
          "next_if_success": "进入原题复盘。",
          "next_if_not": "教师用学习卡中的最小例子示范一次，再让学生复述。"
        },
        {
          "step_no": 2,
          "phase": "原题复盘",
          "objective": "定位首次出错步骤，而不是重做整题。",
          "item_refs": [
            "Q043"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L03",
              "location": "L03",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            },
            {
              "type": "教材切片",
              "id": "B02_相关资料切片.pdf",
              "location": "下册120—145",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR03",
              "location": "课标63／正文56",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            }
          ],
          "student_action": "标出自己第一次不确定的步骤，说明当时依据的规则；使用一级提示后尝试修正该步。",
          "hints": [
            {
              "level": 1,
              "text": "先看x的系数是正还是负；要把x单独留下，需要乘或除什么数？",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "只检查当前这一步：你依据的是哪条规则？符号或方向在这一步有没有变化？",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "从解集两侧各取一个数代入原不等式，看看哪一侧满足，并检查端点是否包含。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "能指出具体卡点",
            "能按规则修正当前步骤并说明理由"
          ],
          "next_if_success": "进入同类独立练习。",
          "next_if_not": "下降到三级提示，用代值或反向运算核对这一步。",
          "teacher_only": [
            {
              "item_id": "Q043",
              "stem": "示例：解不等式并检查解集。",
              "answer": "示例解集",
              "analysis": "示例解析：移项后除以负数，方向改变并代值核对。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 3,
          "phase": "独立练习",
          "objective": "在同类题中独立迁移同一规则。",
          "item_refs": [
            "Q041"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L03",
              "location": "L03",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            },
            {
              "type": "教材切片",
              "id": "B02_相关资料切片.pdf",
              "location": "下册120—145",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR03",
              "location": "课标63／正文56",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            }
          ],
          "student_action": "独立完成，不先看提示；完成后用一句话说明关键步骤。",
          "hints": [
            {
              "level": 1,
              "text": "先看x的系数是正还是负；要把x单独留下，需要乘或除什么数？",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "移项后观察两边同时乘除的数；写出这一步时，明确判断不等号方向是否应改变。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "从解集两侧各取一个数代入原不等式，看看哪一侧满足，并检查端点是否包含。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "基本步骤正确",
            "能说明关键规则",
            "完成自检"
          ],
          "next_if_success": "进入不同情境的迁移题。",
          "next_if_not": "回到二级提示，只改卡点步骤，不重抄整题。",
          "teacher_only": [
            {
              "item_id": "Q041",
              "stem": "示例：解一个含负数系数的不等式。",
              "answer": "示例解集",
              "analysis": "示例解析：除以负数时改变方向。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 4,
          "phase": "迁移与检验",
          "objective": "换情境或换问法后仍能使用同一规则，并完成检查。",
          "item_refs": [
            "Q042"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L03",
              "location": "L03",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            },
            {
              "type": "教材切片",
              "id": "B02_相关资料切片.pdf",
              "location": "下册120—145",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR03",
              "location": "课标63／正文56",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            }
          ],
          "student_action": "完成后必须写出一个检查动作：代值、回代、数轴核对或结合实际条件解释。",
          "hints": [
            {
              "level": 1,
              "text": "先看x的系数是正还是负；要把x单独留下，需要乘或除什么数？",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "移项后观察两边同时乘除的数；写出这一步时，明确判断不等号方向是否应改变。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "从解集两侧各取一个数代入原不等式，看看哪一侧满足，并检查端点是否包含。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "迁移题结果正确",
            "检查动作与题型匹配",
            "能解释结果是否合理"
          ],
          "next_if_success": "进入反思和下一次观察。",
          "next_if_not": "暂停新题，回到学习卡并降低一个认知步骤。",
          "teacher_only": [
            {
              "item_id": "Q042",
              "stem": "示例：判断乘负数后不等号方向。",
              "answer": ">",
              "analysis": "示例解析：两边乘负数，不等号反向。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 5,
          "phase": "反思与退出",
          "objective": "把一次正确表现转成可复用的自检语言。",
          "item_refs": [],
          "student_action": "填写两句话：这次最容易错的地方是____；下次开始前我先检查____。",
          "hints": [
            {
              "level": 1,
              "text": "回看第2步和第4步，比较自己在哪一步使用了提示。",
              "purpose": "形成自我监控",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "把“粗心”改写成具体动作，例如检查符号、端点、单位或回代。",
              "purpose": "形成可执行检查",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "请教师根据本次提示层级决定下一题难度。",
              "purpose": "交给教师调整",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "反思包含具体步骤",
            "下一次计划有明确观察点"
          ],
          "next_if_success": "按调整规则决定是否结束本指标强化。",
          "next_if_not": "保留原计划再练一题，不立即切换主题。"
        }
      ],
      "observation": [
        "是否识别负系数",
        "除以负数后是否改变方向",
        "是否用代值法核对解集"
      ],
      "adjustment_rules": [
        {
          "id": "A1",
          "condition": "学生只读一级提示就能独立完成并说明理由",
          "action": "跳过二级提示，直接进入迁移题；记录为独立达成。"
        },
        {
          "id": "A2",
          "condition": "学生在二级提示后完成，但单独作答仍出错",
          "action": "保留同结构变式一题，减少提示层级后再次观察。"
        },
        {
          "id": "A3",
          "condition": "三级提示后仍未完成或仍只靠试猜",
          "action": "若第二层仍漏反向，回到“乘除负数”专项；下一次计划降低难度并增加示范。"
        },
        {
          "id": "A4",
          "condition": "连续两次独立完成同类题并能在反思中说清依据",
          "action": "结束本指标强化，转入下一薄弱指标或迁移任务。"
        }
      ],
      "limitations": [
        "证据数量足以为本次计划提供方向，但仍不代表长期掌握。",
        "待评分、未作答和无记录不会被当作零分或未掌握。",
        "若题目、材料或记录版本发生变化，必须重新生成计划。"
      ],
      "teacher_explanation": [
        {
          "item_id": "Q043",
          "stem": "示例：解不等式并检查解集。",
          "answer": "示例解集",
          "analysis": "示例解析：移项后除以负数，方向改变并代值核对。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        },
        {
          "item_id": "Q041",
          "stem": "示例：解一个含负数系数的不等式。",
          "answer": "示例解集",
          "analysis": "示例解析：除以负数时改变方向。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        },
        {
          "item_id": "Q042",
          "stem": "示例：判断乘负数后不等号方向。",
          "answer": ">",
          "analysis": "示例解析：两边乘负数，不等号反向。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        }
      ],
      "quality_checks": {
        "no_direct_answer_in_student_hints": true,
        "hint_leak_reasons": [],
        "uncertainty_explicit": true,
        "evidence_ids": [
          "XR01",
          "XR02",
          "XR03"
        ],
        "input_context_valid": true,
        "material_refs_present": true,
        "adjustment_conditions_present": true
      }
    },
    {
      "schema_version": "1.1.0",
      "plan_id": "PLAN-S02-t02i1-20261115",
      "generated_at": "2026-11-15T12:00:00+08:00",
      "module": {
        "name": "个性化建议与分步辅导",
        "owner": "王振宇",
        "version": "1.1.0"
      },
      "student": {
        "id": "S02",
        "class_id": "SC01"
      },
      "target_node_id": "N01",
      "plan_kind": "extension",
      "certainty": "adequate",
      "primary_focus": {
        "indicator_id": "T02I1",
        "topic_id": "T02",
        "topic_name": "方程与方程组",
        "indicator_name": "运用等式性质解一元一次方程",
        "focus_statement": "保持等式两边同变，按去分母、去括号、移项、系数化为1的顺序求解并检验。",
        "score_rate": 85.7,
        "evidence_count": 3,
        "selection_reason": "调用方指定当前辅导重点"
      },
      "summary": "已评分证据 3 条，当前得分率为 85.7%。本次优先处理“运用等式性质解一元一次方程”。",
      "evidence_used": [
        {
          "record_id": "XR11",
          "item_id": "Q026",
          "student_id": "S02",
          "node_id": "N01",
          "topic_id": "T02",
          "indicator_id": "T02I1",
          "status": "已评分",
          "score": 0,
          "max_score": 1,
          "answer": "否",
          "steps": "",
          "point_scores": "Q026P1=0",
          "stem": "示例：判断一个数是否为方程的解。",
          "source_ref": "XR11"
        },
        {
          "record_id": "XR12",
          "item_id": "Q025",
          "student_id": "S02",
          "node_id": "N01",
          "topic_id": "T02",
          "indicator_id": "T02I1",
          "status": "已评分",
          "score": 3,
          "max_score": 3,
          "answer": "示例作答",
          "steps": "示例步骤",
          "point_scores": "Q025P1=1；Q025P2=1；Q025P3=1",
          "stem": "示例：解含分母的一元一次方程。",
          "source_ref": "XR12"
        },
        {
          "record_id": "XR13",
          "item_id": "Q022",
          "student_id": "S02",
          "node_id": "N01",
          "topic_id": "T02",
          "indicator_id": "T02I1",
          "status": "已评分",
          "score": 3,
          "max_score": 3,
          "answer": "示例作答",
          "steps": "示例步骤",
          "point_scores": "Q022P1=1；Q022P2=1；Q022P3=1",
          "stem": "示例：解一元一次方程。",
          "source_ref": "XR13"
        }
      ],
      "evidence_gaps": [
        {
          "indicator_id": "T01I1",
          "topic": "T01",
          "name": "表示数量关系并代入求值",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T01I2",
          "topic": "T01",
          "name": "识别同类项、去括号并化简",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T01I3",
          "topic": "T01",
          "name": "用整式解释具体问题",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I2",
          "topic": "T02",
          "name": "用消元法解二元一次方程组",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I3",
          "topic": "T02",
          "name": "列方程或方程组解决实际问题并检验",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I1",
          "topic": "T03",
          "name": "运用不等式性质求解，负数乘除时正确改变方向",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I2",
          "topic": "T03",
          "name": "求两个一元一次不等式解集的交集",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I3",
          "topic": "T03",
          "name": "根据实际限制列不等式并解释取值范围",
          "interpretation": "无已评分证据，不能判断掌握程度"
        }
      ],
      "material_refs": [
        {
          "type": "学习卡",
          "id": "L02",
          "location": "L02",
          "note": "运用等式性质解一元一次方程"
        },
        {
          "type": "教材切片",
          "id": "B06_相关资料切片.pdf",
          "location": "上册110—148；下册87—119",
          "note": "按教材正文顺序复习"
        },
        {
          "type": "课程标准",
          "id": "CR02",
          "location": "课标63／正文56",
          "note": "运用等式性质解一元一次方程"
        }
      ],
      "steps": [
        {
          "step_no": 1,
          "phase": "概念复位",
          "objective": "用学习卡恢复规则和观察顺序，不直接解题。",
          "item_refs": [],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L02",
              "location": "L02",
              "note": "运用等式性质解一元一次方程"
            },
            {
              "type": "教材切片",
              "id": "B06_相关资料切片.pdf",
              "location": "上册110—148；下册87—119",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR02",
              "location": "课标63／正文56",
              "note": "运用等式性质解一元一次方程"
            }
          ],
          "student_action": "读学习卡，用自己的话说出本指标最关键的一条规则，并圈出关键词。",
          "hints": [
            {
              "level": 1,
              "text": "把方程两边想成天平：你在一侧做的运算，另一侧也要做。",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "先不要算结果；按“看条件—选规则—写下一步”的顺序说一遍。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "把求得的数代回原方程左右两边分别计算，不要只检查最后一步。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "能说出规则而不看答案",
            "能指出题目中触发该规则的词或符号"
          ],
          "next_if_success": "进入原题复盘。",
          "next_if_not": "教师用学习卡中的最小例子示范一次，再让学生复述。"
        },
        {
          "step_no": 2,
          "phase": "原题复盘",
          "objective": "定位首次出错步骤，而不是重做整题。",
          "item_refs": [
            "Q026"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L02",
              "location": "L02",
              "note": "运用等式性质解一元一次方程"
            },
            {
              "type": "教材切片",
              "id": "B06_相关资料切片.pdf",
              "location": "上册110—148；下册87—119",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR02",
              "location": "课标63／正文56",
              "note": "运用等式性质解一元一次方程"
            }
          ],
          "student_action": "标出自己第一次不确定的步骤，说明当时依据的规则；使用一级提示后尝试修正该步。",
          "hints": [
            {
              "level": 1,
              "text": "把方程两边想成天平：你在一侧做的运算，另一侧也要做。",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "只检查当前这一步：你依据的是哪条规则？符号或方向在这一步有没有变化？",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "把求得的数代回原方程左右两边分别计算，不要只检查最后一步。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "能指出具体卡点",
            "能按规则修正当前步骤并说明理由"
          ],
          "next_if_success": "进入同类独立练习。",
          "next_if_not": "下降到三级提示，用代值或反向运算核对这一步。",
          "teacher_only": [
            {
              "item_id": "Q026",
              "stem": "示例：判断一个数是否为方程的解。",
              "answer": "是",
              "analysis": "示例解析：代入左右两边判断是否相等。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 3,
          "phase": "独立练习",
          "objective": "在同类题中独立迁移同一规则。",
          "item_refs": [
            "Q022"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L02",
              "location": "L02",
              "note": "运用等式性质解一元一次方程"
            },
            {
              "type": "教材切片",
              "id": "B06_相关资料切片.pdf",
              "location": "上册110—148；下册87—119",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR02",
              "location": "课标63／正文56",
              "note": "运用等式性质解一元一次方程"
            }
          ],
          "student_action": "独立完成，不先看提示；完成后用一句话说明关键步骤。",
          "hints": [
            {
              "level": 1,
              "text": "把方程两边想成天平：你在一侧做的运算，另一侧也要做。",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "先确定当前应先处理分母、括号还是常数项；每一步只改变一个层次，并把等号对齐。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "把求得的数代回原方程左右两边分别计算，不要只检查最后一步。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "基本步骤正确",
            "能说明关键规则",
            "完成自检"
          ],
          "next_if_success": "进入不同情境的迁移题。",
          "next_if_not": "回到二级提示，只改卡点步骤，不重抄整题。",
          "teacher_only": [
            {
              "item_id": "Q022",
              "stem": "示例：解一元一次方程。",
              "answer": "示例解",
              "analysis": "示例解析：移项、合并并代回检验。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 4,
          "phase": "迁移与检验",
          "objective": "换情境或换问法后仍能使用同一规则，并完成检查。",
          "item_refs": [
            "Q025"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L02",
              "location": "L02",
              "note": "运用等式性质解一元一次方程"
            },
            {
              "type": "教材切片",
              "id": "B06_相关资料切片.pdf",
              "location": "上册110—148；下册87—119",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR02",
              "location": "课标63／正文56",
              "note": "运用等式性质解一元一次方程"
            }
          ],
          "student_action": "完成后必须写出一个检查动作：代值、回代、数轴核对或结合实际条件解释。",
          "hints": [
            {
              "level": 1,
              "text": "把方程两边想成天平：你在一侧做的运算，另一侧也要做。",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "先确定当前应先处理分母、括号还是常数项；每一步只改变一个层次，并把等号对齐。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "把求得的数代回原方程左右两边分别计算，不要只检查最后一步。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "迁移题结果正确",
            "检查动作与题型匹配",
            "能解释结果是否合理"
          ],
          "next_if_success": "进入反思和下一次观察。",
          "next_if_not": "暂停新题，回到学习卡并降低一个认知步骤。",
          "teacher_only": [
            {
              "item_id": "Q025",
              "stem": "示例：解含分母的一元一次方程。",
              "answer": "示例解",
              "analysis": "示例解析：去分母后逐步化简。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 5,
          "phase": "反思与退出",
          "objective": "把一次正确表现转成可复用的自检语言。",
          "item_refs": [],
          "student_action": "填写两句话：这次最容易错的地方是____；下次开始前我先检查____。",
          "hints": [
            {
              "level": 1,
              "text": "回看第2步和第4步，比较自己在哪一步使用了提示。",
              "purpose": "形成自我监控",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "把“粗心”改写成具体动作，例如检查符号、端点、单位或回代。",
              "purpose": "形成可执行检查",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "请教师根据本次提示层级决定下一题难度。",
              "purpose": "交给教师调整",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "反思包含具体步骤",
            "下一次计划有明确观察点"
          ],
          "next_if_success": "按调整规则决定是否结束本指标强化。",
          "next_if_not": "保留原计划再练一题，不立即切换主题。"
        }
      ],
      "observation": [
        "每一步是否两侧同变",
        "移项后符号是否改变",
        "是否把结果代回原方程检验"
      ],
      "adjustment_rules": [
        {
          "id": "A1",
          "condition": "学生只读一级提示就能独立完成并说明理由",
          "action": "跳过二级提示，直接进入迁移题；记录为独立达成。"
        },
        {
          "id": "A2",
          "condition": "学生在二级提示后完成，但单独作答仍出错",
          "action": "保留同结构变式一题，减少提示层级后再次观察。"
        },
        {
          "id": "A3",
          "condition": "三级提示后仍未完成或仍只靠试猜",
          "action": "若第二层出错，回到单项等式性质练习；下一次计划降低难度并增加示范。"
        },
        {
          "id": "A4",
          "condition": "连续两次独立完成同类题并能在反思中说清依据",
          "action": "结束本指标强化，转入下一薄弱指标或迁移任务。"
        }
      ],
      "limitations": [
        "证据数量足以为本次计划提供方向，但仍不代表长期掌握。",
        "待评分、未作答和无记录不会被当作零分或未掌握。",
        "若题目、材料或记录版本发生变化，必须重新生成计划。"
      ],
      "teacher_explanation": [
        {
          "item_id": "Q026",
          "stem": "示例：判断一个数是否为方程的解。",
          "answer": "是",
          "analysis": "示例解析：代入左右两边判断是否相等。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        },
        {
          "item_id": "Q022",
          "stem": "示例：解一元一次方程。",
          "answer": "示例解",
          "analysis": "示例解析：移项、合并并代回检验。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        },
        {
          "item_id": "Q025",
          "stem": "示例：解含分母的一元一次方程。",
          "answer": "示例解",
          "analysis": "示例解析：去分母后逐步化简。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        }
      ],
      "quality_checks": {
        "no_direct_answer_in_student_hints": true,
        "hint_leak_reasons": [],
        "uncertainty_explicit": true,
        "evidence_ids": [
          "XR11",
          "XR12",
          "XR13"
        ],
        "input_context_valid": true,
        "material_refs_present": true,
        "adjustment_conditions_present": true
      }
    },
    {
      "schema_version": "1.1.0",
      "plan_id": "PLAN-S03-coverage-20261115",
      "generated_at": "2026-11-15T12:00:00+08:00",
      "module": {
        "name": "个性化建议与分步辅导",
        "owner": "王振宇",
        "version": "1.1.0"
      },
      "student": {
        "id": "S03",
        "class_id": "SC02"
      },
      "target_node_id": "N02",
      "plan_kind": "coverage_probe",
      "certainty": "insufficient",
      "primary_focus": null,
      "summary": "现有证据只覆盖部分主题，先设计低负担观察任务，再决定后续强化方向。",
      "evidence_used": [],
      "evidence_gaps": [
        {
          "indicator_id": "T01I1",
          "topic": "T01",
          "name": "表示数量关系并代入求值",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T01I2",
          "topic": "T01",
          "name": "识别同类项、去括号并化简",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T01I3",
          "topic": "T01",
          "name": "用整式解释具体问题",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I1",
          "topic": "T02",
          "name": "运用等式性质解一元一次方程",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I2",
          "topic": "T02",
          "name": "用消元法解二元一次方程组",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T02I3",
          "topic": "T02",
          "name": "列方程或方程组解决实际问题并检验",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I1",
          "topic": "T03",
          "name": "运用不等式性质求解，负数乘除时正确改变方向",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I2",
          "topic": "T03",
          "name": "求两个一元一次不等式解集的交集",
          "interpretation": "无已评分证据，不能判断掌握程度"
        },
        {
          "indicator_id": "T03I3",
          "topic": "T03",
          "name": "根据实际限制列不等式并解释取值范围",
          "interpretation": "无已评分证据，不能判断掌握程度"
        }
      ],
      "material_refs": [
        {
          "type": "学习卡",
          "id": "L02",
          "location": "L02",
          "note": "运用等式性质解一元一次方程"
        },
        {
          "type": "教材切片",
          "id": "B06_相关资料切片.pdf",
          "location": "上册110—148；下册87—119",
          "note": "按教材正文顺序复习"
        },
        {
          "type": "课程标准",
          "id": "CR02",
          "location": "课标63／正文56",
          "note": "运用等式性质解一元一次方程"
        },
        {
          "type": "学习卡",
          "id": "L03",
          "location": "L03",
          "note": "运用不等式性质求解，负数乘除时正确改变方向"
        },
        {
          "type": "教材切片",
          "id": "B02_相关资料切片.pdf",
          "location": "下册120—145",
          "note": "按教材正文顺序复习"
        },
        {
          "type": "课程标准",
          "id": "CR03",
          "location": "课标63／正文56",
          "note": "运用不等式性质求解，负数乘除时正确改变方向"
        }
      ],
      "steps": [
        {
          "step_no": 1,
          "phase": "确认已有优势",
          "objective": "用一题已掌握主题的题确认学生能独立说明步骤。",
          "item_refs": [],
          "student_action": "选择一题已经做过的题，口述“我先做什么、再做什么、最后怎样检查”。",
          "hints": [],
          "success_criteria": [
            "能独立口述完整步骤",
            "能指出自己使用的规则"
          ],
          "next_if_success": "进入未覆盖主题的短探测。",
          "next_if_not": "先回到对应学习卡，不用本次记录判断新主题。"
        },
        {
          "step_no": 2,
          "phase": "低负担主题探测",
          "objective": "补充观察 运用等式性质解一元一次方程。",
          "item_refs": [
            "Q022"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L02",
              "location": "L02",
              "note": "运用等式性质解一元一次方程"
            },
            {
              "type": "教材切片",
              "id": "B06_相关资料切片.pdf",
              "location": "上册110—148；下册87—119",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR02",
              "location": "课标63／正文56",
              "note": "运用等式性质解一元一次方程"
            }
          ],
          "student_action": "独立完成并写出关键步骤；不会时可使用一级提示。",
          "hints": [
            {
              "level": 1,
              "text": "把方程两边想成天平：你在一侧做的运算，另一侧也要做。",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "先确定当前应先处理分母、括号还是常数项；每一步只改变一个层次，并把等号对齐。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "把求得的数代回原方程左右两边分别计算，不要只检查最后一步。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "能说明使用的规则",
            "能完成基本步骤并自行检查"
          ],
          "next_if_success": "补一题同指标变式，确认不是偶然正确。",
          "next_if_not": "记录提示层级与卡点，进入该指标的小步辅导。",
          "teacher_only": [
            {
              "item_id": "Q022",
              "stem": "示例：解一元一次方程。",
              "answer": "示例解",
              "analysis": "示例解析：移项、合并并代回检验。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 3,
          "phase": "低负担主题探测",
          "objective": "补充观察 运用不等式性质求解，负数乘除时正确改变方向。",
          "item_refs": [
            "Q039"
          ],
          "material_refs": [
            {
              "type": "学习卡",
              "id": "L03",
              "location": "L03",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            },
            {
              "type": "教材切片",
              "id": "B02_相关资料切片.pdf",
              "location": "下册120—145",
              "note": "按教材正文顺序复习"
            },
            {
              "type": "课程标准",
              "id": "CR03",
              "location": "课标63／正文56",
              "note": "运用不等式性质求解，负数乘除时正确改变方向"
            }
          ],
          "student_action": "独立完成并写出关键步骤；不会时可使用一级提示。",
          "hints": [
            {
              "level": 1,
              "text": "先看x的系数是正还是负；要把x单独留下，需要乘或除什么数？",
              "purpose": "激活概念与观察顺序",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 2,
              "text": "移项后观察两边同时乘除的数；写出这一步时，明确判断不等号方向是否应改变。",
              "purpose": "提供下一步操作，不给出结果",
              "visibility": "student",
              "reveals_answer": false
            },
            {
              "level": 3,
              "text": "从解集两侧各取一个数代入原不等式，看看哪一侧满足，并检查端点是否包含。",
              "purpose": "用检查或代值替代直接答案",
              "visibility": "student",
              "reveals_answer": false
            }
          ],
          "success_criteria": [
            "能说明使用的规则",
            "能完成基本步骤并自行检查"
          ],
          "next_if_success": "补一题同指标变式，确认不是偶然正确。",
          "next_if_not": "记录提示层级与卡点，进入该指标的小步辅导。",
          "teacher_only": [
            {
              "item_id": "Q039",
              "stem": "示例：解一个简单不等式。",
              "answer": "示例解集",
              "analysis": "示例解析：移项并检查方向。",
              "note": "仅供教师查看，学生端提示不得包含本字段。"
            }
          ]
        },
        {
          "step_no": 4,
          "phase": "形成下一次计划",
          "objective": "依据探测结果确定一个首要辅导指标。",
          "item_refs": [],
          "student_action": "留下本次最短反思：哪一步最容易出错，下一次先检查什么。",
          "hints": [],
          "success_criteria": [
            "下一次计划只聚焦一个首要问题",
            "调整条件有本次观察证据支持"
          ],
          "next_if_success": "生成正式强化计划。",
          "next_if_not": "继续补充观察，不提前贴标签。"
        }
      ],
      "observation": [
        "是否能在无提示下启动",
        "首次卡点发生在哪一步",
        "提示层级与最终独立性"
      ],
      "adjustment_rules": [
        {
          "id": "C1",
          "condition": "两项探测均独立正确",
          "action": "再各加一题变式；仍正确后才记为初步掌握。"
        },
        {
          "id": "C2",
          "condition": "一项正确、一项需要二级提示",
          "action": "优先辅导需要提示的指标。"
        },
        {
          "id": "C3",
          "condition": "两项均需三级提示",
          "action": "降低起点，先从学习卡中的单一规则开始。"
        }
      ],
      "limitations": [
        "当前只有有限主题的已评分记录，不能推断未测主题已掌握或未掌握。",
        "待评分、未作答和无记录均不进入掌握度计算。",
        "本计划首先补充观察，不直接给出“薄弱”结论。"
      ],
      "teacher_explanation": [
        {
          "item_id": "Q022",
          "stem": "示例：解一元一次方程。",
          "answer": "示例解",
          "analysis": "示例解析：移项、合并并代回检验。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        },
        {
          "item_id": "Q039",
          "stem": "示例：解一个简单不等式。",
          "answer": "示例解集",
          "analysis": "示例解析：移项并检查方向。",
          "note": "仅供教师查看，学生端提示不得包含本字段。"
        }
      ],
      "quality_checks": {
        "no_direct_answer_in_student_hints": true,
        "uncertainty_explicit": true,
        "evidence_ids": [],
        "input_context_valid": true,
        "material_refs_present": true,
        "adjustment_conditions_present": true
      }
    }
  ],
  "student_profiles": [
    {
      "student_id": "S01",
      "class_id": "SC01",
      "records": 3,
      "graded": 3,
      "pending": 0,
      "unanswered": 0,
      "earned": 2,
      "possible": 5,
      "score_rate": 40,
      "topic_count": 1,
      "topic_rates": {
        "T01": null,
        "T02": null,
        "T03": 40
      }
    },
    {
      "student_id": "S02",
      "class_id": "SC01",
      "records": 3,
      "graded": 3,
      "pending": 0,
      "unanswered": 0,
      "earned": 6,
      "possible": 7,
      "score_rate": 85.7,
      "topic_count": 1,
      "topic_rates": {
        "T01": null,
        "T02": 85.7,
        "T03": null
      }
    },
    {
      "student_id": "S03",
      "class_id": "SC02",
      "records": 2,
      "graded": 2,
      "pending": 0,
      "unanswered": 0,
      "earned": 6,
      "possible": 6,
      "score_rate": 100,
      "topic_count": 1,
      "topic_rates": {
        "T01": 100,
        "T02": null,
        "T03": null
      }
    }
  ],
  "data_quality_summary": {
    "raw_rows": 8,
    "event_count": 8,
    "revision_count": 0,
    "analysis_eligible_count": 8,
    "review_required_count": 0,
    "pending": 0,
    "unanswered": 0,
    "anomalies": 0
  },
  "class_stats": [
    {
      "key": "SC01",
      "rate": 66.7
    },
    {
      "key": "SC02",
      "rate": 100
    }
  ],
  "topic_stats": [
    {
      "key": "T01",
      "rate": 100,
      "records": 2,
      "graded": 2,
      "earned": 6,
      "possible": 6,
      "student_count": 1,
      "item_count": 2
    },
    {
      "key": "T02",
      "rate": 85.7,
      "records": 3,
      "graded": 3,
      "earned": 6,
      "possible": 7,
      "student_count": 1,
      "item_count": 2
    },
    {
      "key": "T03",
      "rate": 40,
      "records": 3,
      "graded": 3,
      "earned": 2,
      "possible": 5,
      "student_count": 1,
      "item_count": 2
    }
  ],
  "indicator_stats": [
    {
      "key": "T01I1",
      "rate": 100,
      "records": 1,
      "graded": 1,
      "earned": 3,
      "possible": 3,
      "student_count": 1,
      "item_count": 1
    },
    {
      "key": "T01I2",
      "rate": 100,
      "records": 1,
      "graded": 1,
      "earned": 3,
      "possible": 3,
      "student_count": 1,
      "item_count": 1
    },
    {
      "key": "T02I1",
      "rate": 85.7,
      "records": 3,
      "graded": 3,
      "earned": 6,
      "possible": 7,
      "student_count": 1,
      "item_count": 1
    },
    {
      "key": "T03I1",
      "rate": 40,
      "records": 3,
      "graded": 3,
      "earned": 2,
      "possible": 5,
      "student_count": 1,
      "item_count": 1
    }
  ],
  "anomaly_log": [],
  "question_bank": {
    "Q009": {
      "material_id": "Q009",
      "topic_id": "T01",
      "indicator_id": "T01I2",
      "type": "解答题",
      "stem": "示例：化简一个含括号的整式。",
      "answer": "示例答案",
      "analysis": "示例解析：先去括号，再合并同类项。",
      "max_score": 3
    },
    "Q014": {
      "material_id": "Q014",
      "topic_id": "T01",
      "indicator_id": "T01I1",
      "type": "解答题",
      "stem": "示例：用含x的整式表示总人数。",
      "answer": "示例整式",
      "analysis": "示例解析：先写第二个量，再相加。",
      "max_score": 3
    },
    "Q022": {
      "material_id": "Q022",
      "topic_id": "T02",
      "indicator_id": "T02I1",
      "type": "解答题",
      "stem": "示例：解一元一次方程。",
      "answer": "示例解",
      "analysis": "示例解析：移项、合并并代回检验。",
      "max_score": 3
    },
    "Q025": {
      "material_id": "Q025",
      "topic_id": "T02",
      "indicator_id": "T02I1",
      "type": "解答题",
      "stem": "示例：解含分母的一元一次方程。",
      "answer": "示例解",
      "analysis": "示例解析：去分母后逐步化简。",
      "max_score": 3
    },
    "Q026": {
      "material_id": "Q026",
      "topic_id": "T02",
      "indicator_id": "T02I1",
      "type": "填空题",
      "stem": "示例：判断一个数是否为方程的解。",
      "answer": "是",
      "analysis": "示例解析：代入左右两边判断是否相等。",
      "max_score": 1
    },
    "Q034": {
      "material_id": "Q034",
      "topic_id": "T02",
      "indicator_id": "T02I3",
      "type": "解答题",
      "stem": "示例：用方程组解决票价问题。",
      "answer": "示例答案",
      "analysis": "示例解析：设未知数、列方程并检验。",
      "max_score": 3
    },
    "Q039": {
      "material_id": "Q039",
      "topic_id": "T03",
      "indicator_id": "T03I1",
      "type": "填空题",
      "stem": "示例：解一个简单不等式。",
      "answer": "示例解集",
      "analysis": "示例解析：移项并检查方向。",
      "max_score": 1
    },
    "Q041": {
      "material_id": "Q041",
      "topic_id": "T03",
      "indicator_id": "T03I1",
      "type": "填空题",
      "stem": "示例：解一个含负数系数的不等式。",
      "answer": "示例解集",
      "analysis": "示例解析：除以负数时改变方向。",
      "max_score": 1
    },
    "Q042": {
      "material_id": "Q042",
      "topic_id": "T03",
      "indicator_id": "T03I1",
      "type": "填空题",
      "stem": "示例：判断乘负数后不等号方向。",
      "answer": ">",
      "analysis": "示例解析：两边乘负数，不等号反向。",
      "max_score": 1
    },
    "Q043": {
      "material_id": "Q043",
      "topic_id": "T03",
      "indicator_id": "T03I1",
      "type": "解答题",
      "stem": "示例：解不等式并检查解集。",
      "answer": "示例解集",
      "analysis": "示例解析：移项后除以负数，方向改变并代值核对。",
      "max_score": 3
    }
  },
  "requirements": [
    {
      "主题编号": "T01",
      "主题": "代数式与整式运算",
      "课标整理编号": "CR01",
      "课标文件页／正文页": "课标62／正文55",
      "教材正文页": "上册68—109"
    },
    {
      "主题编号": "T02",
      "主题": "方程与方程组",
      "课标整理编号": "CR02",
      "课标文件页／正文页": "课标63／正文56",
      "教材正文页": "上册110—148；下册87—119"
    },
    {
      "主题编号": "T03",
      "主题": "不等式与不等式组",
      "课标整理编号": "CR03",
      "课标文件页／正文页": "课标63／正文56",
      "教材正文页": "下册120—145"
    }
  ]
};
