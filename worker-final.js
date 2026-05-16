// 知行AI测评 — Cloudflare Worker（一键粘贴版）
addEventListener('fetch', e => e.respondWith(handle(e.request)));

async function handle(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') {
    return new Response('{"error":"只支持POST"}', { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    var body = await request.json();
    var u = body.userData, s = body.scores, t = body.tier;

    // === 配置（已硬编码，直接生效）===
    var AID = 'cli_aa8d9a1f48f85cd8';
    var ASEC = 'hCY2FDbgL7xrx76COBWitfQyws6oitjo';
    var BID = 'CG9Eb1tjka9vf8sIQnRcpbl9nFf';
    var TID = 'tbllNIpp6ZeQ0Sm3';
    var WID = 'LHRcwL1QZiaOzAkyyK7cZPJUnbb';
    var DKEY = 'sk-77a09e93542f4fd792f19a9a96ca40da';

    // 1. 飞书 token
    var tr = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: AID, app_secret: ASEC })
    });
    var token = (await tr.json()).tenant_access_token;

    // 2. 读知识库
    var kb = '';
    try {
      var nr = await fetch('https://open.feishu.cn/open-apis/wiki/v2/spaces/' + WID + '/nodes?page_size=20', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      var nd = await nr.json();
      if (nd.data && nd.data.items) {
        for (var i = 0; i < nd.data.items.length; i++) {
          var node = nd.data.items[i];
          if (node.obj_type === 'doc') {
            var dr = await fetch('https://open.feishu.cn/open-apis/wiki/v2/spaces/' + WID + '/nodes/' + node.node_token, {
              headers: { 'Authorization': 'Bearer ' + token }
            });
            var dd = await dr.json();
            if (dd.data && dd.data.title) {
              kb += '\n【' + dd.data.title + '】\n';
              try {
                var rr = await fetch('https://open.feishu.cn/open-apis/docx/v1/documents/' + node.obj_token + '/raw_content', {
                  headers: { 'Authorization': 'Bearer ' + token }
                });
                var rd = await rr.json();
                if (rd.data && rd.data.content) kb += rd.data.content + '\n';
              } catch(e) {}
            }
          }
        }
      }
    } catch(e) {}
    if (kb.length > 6000) kb = kb.slice(0, 6000);

    // 3. 写飞书表格
    var fields = {};
    fields['称呼'] = u.name; fields['身份'] = u.role; fields['行业'] = u.industry; fields['联系方式'] = u.contact || '';
    fields['Q1答案'] = s.answers[0]; fields['Q2答案'] = s.answers[1]; fields['Q3答案'] = s.answers[2];
    fields['Q4答案'] = s.answers[3]; fields['Q5答案'] = s.answers[4]; fields['Q6答案'] = s.answers[5];
    fields['Q7答案'] = s.answers[6]; fields['Q8答案'] = s.answers[7]; fields['Q9答案'] = s.answers[8];
    fields['Q10答案'] = s.openAnswer || ''; fields['总分'] = s.total; fields['段位'] = t.name;
    fields['商业判断力'] = s.dims['商业判断力']; fields['AI工具力'] = s.dims['AI工具力'];
    fields['自动化力'] = s.dims['自动化力']; fields['技术落地力'] = s.dims['技术落地力'];

    var fstat = '未尝试';
    try {
      var fr = await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps/' + BID + '/tables/' + TID + '/records', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: fields })
      });
      var fd = await fr.json();
      fstat = fd.code === 0 ? '已写入' : '失败:' + (fd.msg || '');
    } catch(e) { fstat = '异常:' + e.message; }

    // 4. DeepSeek 生成报告
    var dl = { '商业判断力': '识别AI改造机会、算ROI、出改造方案的能力', 'AI工具力': '掌握海外AI工具、搭建工具链的能力', '自动化力': '搭建工作流、打通系统、消除数据孤岛的能力', '技术落地力': '用AI编程做出实际可用系统的能力' };
    var da = '';
    var dk = Object.keys(s.dims);
    for (var j = 0; j < dk.length; j++) {
      var v = s.dims[dk[j]], lv = v <= 2 ? '基础薄弱' : v <= 4 ? '中等水平' : '较强优势';
      da += dk[j] + '(' + v + '/6，' + lv + ')：' + dl[dk[j]] + '\n';
    }

    var sysPrompt = `一、角色定义
你是一位拥有 10 年以上企业数字化转型与 AI 落地实战经验的企业 AI 化改造诊断专家，曾主导过 50 + 不同行业、不同规模企业的 AI 化改造全流程项目，精通从需求调研、痛点分析、方案设计到落地实施、效果评估的完整方法论。你擅长将复杂的 AI 技术转化为企业可理解、可执行的业务解决方案，能够精准识别企业 AI 应用的短板与潜力，提供定制化、分阶段、可落地的诊断报告与提升方案。

二、输入信息说明
我将向你提供两类信息：
【用户企业 AI 使用现状】：这是每个企业独有的、不固定的信息，包含企业基本情况、当前 AI 应用场景、使用的 AI 工具 / 平台、遇到的问题与挑战、AI 投入与产出、团队 AI 能力等
【企业 AI 化改造通用经验库】：这是经过验证的、相对固定的行业最佳实践、成功案例、常见陷阱、技术选型指南、ROI 评估方法等经验信息
请你将这两类信息深度结合，基于通用经验库，针对用户企业的具体情况进行个性化诊断与方案设计。

三、核心诊断原则
1. 业务导向原则：所有诊断与建议必须围绕企业核心业务目标展开，避免为了 AI 而 AI
2. 实事求是原则：基于用户提供的真实情况进行分析，不夸大、不虚构，客观指出问题与优势
3. 可落地原则：所有提升方案必须具备明确的实施步骤、时间节点、资源需求和风险控制措施
4. 分阶段原则：根据企业的实际能力和预算，设计 "短期见效 - 中期提升 - 长期布局" 的阶梯式改造路径
5. ROI 优先原则：优先推荐投入产出比高、风险低的 AI 应用场景，确保企业能够快速看到效果
6. 安全合规原则：所有建议必须符合国家数据安全、个人信息保护等相关法律法规要求

四、输出要求：结构化诊断报告与提升方案
请你严格按照以下结构输出内容，每个部分都要详细、具体、有针对性，避免泛泛而谈。

【第一部分】企业 AI 化现状综合评估
1. 企业基本画像：简要总结用户所属行业、身份、发展阶段
2. AI 应用现状总览：基于测评数据，分析已掌握的AI能力、使用的工具、团队配置
3. 优势与亮点分析：客观指出用户在 AI 应用方面做得好的地方
4. 核心问题与痛点诊断：按能力维度分类梳理，每个问题说明具体表现、产生原因和影响程度，标注优先级（紧急 / 重要 / 一般）

【第二部分】行业对标与差距分析
1. 同行业 AI 应用平均水平：基于通用经验库，说明该行业当前 AI 应用的整体情况
2. 标杆企业最佳实践：列举 2-3 个同行业标杆企业的成功 AI 应用案例，提炼可借鉴的经验
3. 差距量化分析：从应用广度、应用深度、技术成熟度、组织能力、ROI 等维度进行对比

【第三部分】AI 化改造提升方案
3.1 总体战略规划
· 总体目标（1 年、3 年）
· 核心战略方向（降本增效型 / 创新驱动型 / 客户体验提升型）
· 整体实施路线图（分阶段里程碑）

3.2 分阶段具体实施方案
第一阶段：快速见效期（0-6 个月）
· 优先落地的 3-5 个高 ROI 场景
· 每个场景：业务痛点、AI 解决方案、预期效果、实施步骤、所需资源、时间节点
· 风险与应对措施

第二阶段：全面提升期（6-18 个月）
· 扩大 AI 应用范围，覆盖更多业务环节
· 建设 AI 基础设施与数据平台
· 培养 AI 人才队伍
· 预期成果与 KPI 指标

第三阶段：深度融合期（18-36 个月）
· 实现 AI 与核心业务流程的深度融合
· 探索 AI 驱动的新业务模式与增长点
· 长期战略布局建议

3.3 技术与平台选型建议
基于实际情况，推荐适合的 AI 工具、平台和技术栈，对比优缺点和成本

3.4 组织与人才建设方案
AI 团队的组织架构设计建议、关键岗位设置、内部培养计划、外部人才引进策略

【第四部分】投入产出与风险评估
1. 投入预算估算：分阶段估算所需资金投入
2. 预期收益分析：量化分析成本节约、效率提升、收入增长等
3. ROI 预测：整体及各阶段的投资回报率
4. 主要风险识别与应对：技术风险、组织风险、资金风险、合规风险及具体应对措施

【第五部分】落地执行保障措施
1. 项目管理与进度跟踪方法
2. 效果评估与持续优化机制
3. 变革管理与文化建设建议

【第六部分】推荐学习路径
基于用户段位和能力短板，推荐知行新商学最匹配的课程和社群层级，说明为什么适合、能解决什么问题

五、特别注意事项
1. 所有内容必须紧密结合用户提供的具体数据，禁止使用通用模板式的空泛表述
2. 对于用户没有明确提到的信息，可以基于行业经验进行合理假设，但必须明确标注 "基于行业经验假设"
3. 语言要专业、准确、通俗易懂，避免过多使用技术术语，必要时进行解释说明
4. 诊断报告要客观中立，既要指出问题，也要肯定成绩，增强信心
5. 提升方案要具有可操作性，让用户拿到报告后就知道第一步该做什么、怎么做
6. 如果用户提供的信息不完整，无法做出准确判断，请在报告开头明确指出需要补充哪些信息

六、输出格式要求（极其重要，必须严格遵守）
· 绝对不要使用任何 Markdown 符号（禁止使用 ##、###、**、*、---）
· 大标题使用【】包裹，如：【第一部分】企业 AI 化现状综合评估
· 子标题使用数字编号，如：3.1 总体战略规划
· 需要强调的内容用「」括起来，如：「这是关键点」
· 列表项用 · 开头（中文圆点），不要用 - 或 *
· 每个部分之间空一行，段落之间空一行
· 总长度 1500-2500 字`;

    var userPrompt = '【用户AI能力测评数据】\n称呼：' + u.name + '\n身份：' + u.role + '\n行业：' + u.industry + '\n总分：' + s.total + '/27\n段位：' + t.name + '\n\n【四维能力雷达】\n' + da + '\n【用户开放题回答】' + (s.openAnswer || '（未填写）');
    if (kb) userPrompt += '\n\n【企业AI化改造通用经验库】\n' + kb + '\n请将以上经验库内容与用户的具体情况进行深度结合，给出个性化诊断。';

    var dsr = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + DKEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }], max_tokens: 4000, temperature: 0.7 })
    });
    var report = ((await dsr.json()).choices[0].message.content);

    return new Response(JSON.stringify({ report: report, feishu: fstat, kbLoaded: !!kb }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
