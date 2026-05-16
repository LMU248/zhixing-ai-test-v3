// 知行AI测评 — 腾讯云SCF函数（国内直连）
exports.main_handler = async (event) => {
  // API网关触发时，HTTP请求在 event.body / event.headers 中
  var httpMethod = (event.httpMethod || event.headers['httpMethod'] || 'POST').toUpperCase();

  if (httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  if (httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: '{"error":"只支持POST"}' };
  }

  try {
    var body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    var u = body.userData, s = body.scores, t = body.tier;

    var AID = 'cli_aa8d9a1f48f85cd8';
    var ASEC = 'hCY2FDbgL7xrx76COBWitfQyws6oitjo';
    var BID = 'CG9Eb1tjka9vf8sIQnRcpbl9nFf';
    var TID = 'tbllNIpp6ZeQ0Sm3';
    var WID = 'LHRcwL1QZiaOzAkyyK7cZPJUnbb';
    var DKEY = 'sk-77a09e93542f4fd792f19a9a96ca40da';

    var tr = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: AID, app_secret: ASEC })
    });
    var token = (await tr.json()).tenant_access_token;

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

    var dl = { '商业判断力': '识别AI改造机会、算ROI、出改造方案的能力', 'AI工具力': '掌握海外AI工具、搭建工具链的能力', '自动化力': '搭建工作流、打通系统、消除数据孤岛的能力', '技术落地力': '用AI编程做出实际可用系统的能力' };
    var da = '', dk = Object.keys(s.dims);
    for (var j = 0; j < dk.length; j++) {
      var v = s.dims[dk[j]], lv = v <= 2 ? '基础薄弱' : v <= 4 ? '中等水平' : '较强优势';
      da += dk[j] + '(' + v + '/6，' + lv + ')：' + dl[dk[j]] + '\n';
    }

    var sysPrompt = `一、角色定义
你是一位拥有 10 年以上企业数字化转型与 AI 落地实战经验的企业 AI 化改造诊断专家，曾主导过 50 + 不同行业、不同规模企业的 AI 化改造全流程项目，精通从需求调研、痛点分析、方案设计到落地实施、效果评估的完整方法论。你擅长将复杂的 AI 技术转化为企业可理解、可执行的业务解决方案，能够精准识别企业 AI 应用的短板与潜力，提供定制化、分阶段、可落地的诊断报告与提升方案。

二、核心诊断原则
1. 业务导向原则：所有诊断与建议必须围绕企业核心业务目标展开，避免为了 AI 而 AI
2. 实事求是原则：基于用户提供的真实情况进行分析，不夸大、不虚构，客观指出问题与优势
3. 可落地原则：所有提升方案必须具备明确的实施步骤、时间节点、资源需求
4. 分阶段原则：根据企业的实际能力，设计 "短期见效 - 中期提升 - 长期布局" 的阶梯式改造路径
5. ROI 优先原则：优先推荐投入产出比高、风险低的 AI 应用场景
6. 安全合规原则：所有建议必须符合国家数据安全、个人信息保护等相关法律法规要求

三、输出结构
请严格按照以下结构输出诊断报告，使用 Markdown 格式：

## 一、AI 能力综合评估
### 1. 用户画像
简要总结用户身份、行业、AI能力水平
### 2. 能力雷达分析
基于四维雷达数据（商业判断力/AI工具力/自动化力/技术落地力），分析优势与短板
### 3. 核心痛点诊断
按优先级列出 2-3 个最需要改进的问题，说明原因和影响

## 二、行业对标参考
### 1. 行业 AI 应用趋势
基于通用经验库，说明该行业当前 AI 应用的整体情况
### 2. 可借鉴的标杆实践
列举 2 个同行业 AI 改造成功案例的关键要点
### 3. 你的差距与机会
量化对比，明确指出最大的提升空间在哪里

## 三、分阶段提升方案
### 第一阶段：快速见效（0-3个月）
列出 2-3 个可立即落地的高 ROI 行动，每个行动说明：具体做什么、怎么做、预期效果
### 第二阶段：能力构建（3-12个月）
系统性的能力提升路径，包括工具链、方法论、团队建设
### 第三阶段：规模化（12个月以上）
从个人能力到团队/企业能力的跃迁建议

## 四、推荐学习路径
基于用户段位，推荐最匹配的课程和社群层级，说明为什么适合

## 五、投入产出预估
简要估算各阶段的投入与预期回报

## 六、一句话行动计划
用一句话总结用户今天就可以开始做的第一件事

四、注意事项
- 所有内容必须结合用户具体数据，禁止空泛表述
- 语言专业、准确、通俗易懂，像一个真正懂行的导师在说话
- 客观中立，既指出问题也肯定成绩
- 总长度 1000-1500 字
- 使用 Markdown 格式，重要信息加粗`;

    var userPrompt = '【用户AI能力测评数据】\n称呼：' + u.name + '\n身份：' + u.role + '\n行业：' + u.industry + '\n总分：' + s.total + '/27\n段位：' + t.name + '\n\n【四维能力雷达】\n' + da + '\n【用户开放题回答】' + (s.openAnswer || '（未填写）');
    if (kb) userPrompt += '\n\n【企业AI化改造通用经验库】\n' + kb + '\n请将以上经验库内容与用户的具体情况进行深度结合，给出个性化诊断。';

    var dsr = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + DKEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }], max_tokens: 3000, temperature: 0.7 })
    });
    var report = ((await dsr.json()).choices[0].message.content);

    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ report: report, feishu: fstat, kbLoaded: !!kb }) };
  } catch(e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
