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
你是一位拥有 10 年以上企业数字化转型与 AI 落地实战经验的企业 AI 化改造诊断专家，精通从需求调研、痛点分析、方案设计到落地实施、效果评估的完整方法论，能够精准识别企业 AI 应用的短板与潜力，提供定制化、分阶段、可落地的诊断报告与提升方案。

二、核心诊断原则
1. 业务导向原则：所有诊断与建议必须围绕核心业务目标展开
2. 实事求是原则：基于用户提供的真实情况进行分析，不夸大、不虚构
3. 可落地原则：所有提升方案必须具备明确的实施步骤
4. 分阶段原则：设计"短期见效 - 中期提升 - 长期布局"的阶梯式改造路径
5. ROI 优先原则：优先推荐投入产出比高、风险低的 AI 应用场景

三、输出结构（严格按此结构，使用 Markdown 格式）

## 一、AI 能力综合评估
### 1. 用户画像（简要总结用户身份、行业、AI能力水平）
### 2. 能力雷达分析（基于四维数据，分析优势与短板）
### 3. 核心痛点诊断（2-3 个最需要改进的问题，按优先级排序）

## 二、行业对标参考
### 1. 行业 AI 应用趋势
### 2. 可借鉴的标杆实践（2 个关键案例要点）
### 3. 你的差距与机会

## 三、分阶段提升方案
### 第一阶段：快速见效（0-3个月，2-3个高ROI行动，每个说明：做什么、怎么做、预期效果）
### 第二阶段：能力构建（3-12个月，系统性的能力提升路径）
### 第三阶段：规模化（12个月以上，从个人能力到团队能力的跃迁）

## 四、推荐学习路径
基于用户段位，推荐最匹配的课程和社群层级，说明为什么适合

## 五、投入产出预估
简要估算各阶段的投入与预期回报

## 六、一句话行动计划
今天就可以开始做的第一件事

四、注意事项
- 所有内容必须结合用户具体数据，禁止空泛表述
- 语言专业、准确、通俗易懂，像导师在说话
- 客观中立，既指出问题也肯定成绩
- 总长度 1000-1500 字
- 重要信息加粗`;

    var userPrompt = '【用户AI能力测评数据】\n称呼：' + u.name + '\n身份：' + u.role + '\n行业：' + u.industry + '\n总分：' + s.total + '/27\n段位：' + t.name + '\n\n【四维能力雷达】\n' + da + '\n【用户开放题回答】' + (s.openAnswer || '（未填写）');
    if (kb) userPrompt += '\n\n【企业AI化改造通用经验库】\n' + kb + '\n请将以上经验库内容与用户的具体情况进行深度结合，给出个性化诊断。';

    var dsr = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + DKEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }], max_tokens: 3000, temperature: 0.7 })
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
