// 知行AI测评 — Netlify Function
exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: '{"error":"只支持POST"}' };
  }

  try {
    var body = JSON.parse(event.body);
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

    var prompt = '你是企业AI化改造领域的资深诊断专家。请根据以下用户的测评数据，生成一份真诚、专业、有深度的个人诊断报告。';
    if (kb) prompt += '\n【参考知识库：企业AI改造经验与诊断方法】\n' + kb + '\n请结合以上知识库中的方法论和经验来写这份报告。';
    prompt += '\n\n【用户信息】称呼：' + u.name + '，身份：' + u.role + '，行业：' + u.industry;
    prompt += '\n【测评结果】总分：' + s.total + '/27，段位：' + t.name;
    prompt += '\n【四维能力雷达】\n' + da;
    prompt += '\n【用户开放题回答】' + (s.openAnswer || '（未填写）');
    prompt += '\n\n【报告要求】严格按以下结构输出，语气真诚、专业，像导师跟学员对话，不要营销感：\n';
    prompt += '## 能力画像（2-3句话描述整体状态）\n## 亮点分析（最亮眼的1-2个维度及潜力）\n## 关键提升点（最需补的短板+具体可操作建议）\n## 推荐学习路径（先补什么→再强化什么→最后做什么）\n## 一句话鼓励\n总长度500-800字。';

    var dsr = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + DKEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: '你是企业AI化改造领域资深诊断专家。说话真诚、专业、像导师跟学员对话，绝不营销。' }, { role: 'user', content: prompt }], max_tokens: 2000, temperature: 0.7 })
    });
    var report = ((await dsr.json()).choices[0].message.content);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ report: report, feishu: fstat, kbLoaded: !!kb })
    };
  } catch(e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message })
    };
  }
};
