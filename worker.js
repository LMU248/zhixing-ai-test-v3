// Cloudflare Worker — 飞书知识库 + DeepSeek 生成诊断报告

addEventListener('fetch', function(event) {
  event.respondWith(handleRequest(event.request, event));
});

async function handleRequest(request, event) {
  var env = typeof globalThis !== 'undefined' ? globalThis : {};

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: '只支持POST' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    var body = await request.json();
    var userData = body.userData;
    var scores = body.scores;
    var tier = body.tier;

    if (!userData || !scores || !tier) {
      return new Response(JSON.stringify({ error: '缺少必要数据' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 读取环境变量（Cloudflare Workers 绑定）
    var FEISHU_APP_ID = FEISHU_APP_ID;
    var FEISHU_APP_SECRET = FEISHU_APP_SECRET;
    var FEISHU_BASE_ID = FEISHU_BASE_ID;
    var FEISHU_TABLE_ID = FEISHU_TABLE_ID;
    var FEISHU_WIKI_SPACE_ID = FEISHU_WIKI_SPACE_ID;
    var DEEPSEEK_API_KEY = DEEPSEEK_API_KEY;

    // 1. 获取飞书 token
    var tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET })
    });
    var tokenData = await tokenRes.json();
    var token = tokenData.tenant_access_token;

    // 2. 读知识库
    var kbContent = '';
    if (FEISHU_WIKI_SPACE_ID) {
      try {
        var nodesRes = await fetch('https://open.feishu.cn/open-apis/wiki/v2/spaces/' + FEISHU_WIKI_SPACE_ID + '/nodes?page_size=20', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        var nodesData = await nodesRes.json();
        if (nodesData.data && nodesData.data.items) {
          for (var i = 0; i < nodesData.data.items.length; i++) {
            var node = nodesData.data.items[i];
            if (node.obj_type === 'doc') {
              var docRes = await fetch('https://open.feishu.cn/open-apis/wiki/v2/spaces/' + FEISHU_WIKI_SPACE_ID + '/nodes/' + node.node_token, {
                headers: { 'Authorization': 'Bearer ' + token }
              });
              var docData = await docRes.json();
              if (docData.data && docData.data.title) {
                kbContent += '\n【' + docData.data.title + '】\n';
                try {
                  var rawRes = await fetch('https://open.feishu.cn/open-apis/docx/v1/documents/' + node.obj_token + '/raw_content', {
                    headers: { 'Authorization': 'Bearer ' + token }
                  });
                  var rawData = await rawRes.json();
                  if (rawData.data && rawData.data.content) kbContent += rawData.data.content + '\n';
                } catch(e) {}
              }
            }
          }
        }
      } catch(e) {}
      if (kbContent.length > 6000) kbContent = kbContent.slice(0, 6000);
    }

    // 3. 写飞书表格
    var fields = {};
    fields['称呼'] = userData.name;
    fields['身份'] = userData.role;
    fields['行业'] = userData.industry;
    fields['联系方式'] = userData.contact || '';
    fields['Q1答案'] = scores.answers[0];
    fields['Q2答案'] = scores.answers[1];
    fields['Q3答案'] = scores.answers[2];
    fields['Q4答案'] = scores.answers[3];
    fields['Q5答案'] = scores.answers[4];
    fields['Q6答案'] = scores.answers[5];
    fields['Q7答案'] = scores.answers[6];
    fields['Q8答案'] = scores.answers[7];
    fields['Q9答案'] = scores.answers[8];
    fields['Q10答案'] = scores.openAnswer || '';
    fields['总分'] = scores.total;
    fields['段位'] = tier.name;
    fields['商业判断力'] = scores.dims['商业判断力'];
    fields['AI工具力'] = scores.dims['AI工具力'];
    fields['自动化力'] = scores.dims['自动化力'];
    fields['技术落地力'] = scores.dims['技术落地力'];

    var feishuStatus = '未尝试';
    try {
      var feishuRes = await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps/' + FEISHU_BASE_ID + '/tables/' + FEISHU_TABLE_ID + '/records', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: fields })
      });
      var feishuData = await feishuRes.json();
      feishuStatus = feishuData.code === 0 ? '已写入' : '失败: ' + (feishuData.msg || '');
    } catch(e) { feishuStatus = '异常: ' + e.message; }

    // 4. DeepSeek 生成报告
    var dimLabels = {
      '商业判断力': '识别AI改造机会、算ROI、出改造方案的能力',
      'AI工具力': '掌握海外AI工具、搭建工具链的能力',
      '自动化力': '搭建工作流、打通系统、消除数据孤岛的能力',
      '技术落地力': '用AI编程做出实际可用系统的能力'
    };
    var dimKeys = Object.keys(scores.dims);
    var dimAnalysis = '';
    for (var j = 0; j < dimKeys.length; j++) {
      var k = dimKeys[j];
      var val = scores.dims[k];
      var level = val <= 2 ? '基础薄弱' : val <= 4 ? '中等水平' : '较强优势';
      dimAnalysis += k + '(' + val + '/6，' + level + ')：' + dimLabels[k] + '\n';
    }

    var kbSection = kbContent ? '\n【参考知识库：企业AI改造经验与诊断方法】\n' + kbContent + '\n请结合以上知识库中的方法论和经验来写这份报告。' : '';

    var prompt = '你是企业AI化改造领域的资深诊断专家。请根据以下用户的测评数据，生成一份真诚、专业、有深度的个人诊断报告。' + kbSection + '\n\n';
    prompt += '【用户信息】称呼：' + userData.name + '，身份：' + userData.role + '，行业：' + userData.industry + '\n';
    prompt += '【测评结果】总分：' + scores.total + '/27，段位：' + tier.name + '\n';
    prompt += '【四维能力雷达】\n' + dimAnalysis + '\n';
    prompt += '【用户开放题回答】' + (scores.openAnswer || '（未填写）') + '\n\n';
    prompt += '【报告要求】严格按以下结构输出，语气真诚、专业，像导师跟学员对话，不要营销感：\n';
    prompt += '## 能力画像（2-3句话描述整体状态）\n';
    prompt += '## 亮点分析（最亮眼的1-2个维度，代表什么潜力）\n';
    prompt += '## 关键提升点（最需补的短板，给具体可操作建议）\n';
    prompt += '## 推荐学习路径（合理的成长路径：先补什么、再强化什么、最后做什么）\n';
    prompt += '## 一句话鼓励\n';
    prompt += '总长度500-800字，不要堆砌术语。';

    var dsRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + DEEPSEEK_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是企业AI化改造领域资深诊断专家。说话真诚、专业、像导师跟学员对话，绝不营销。' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });
    var dsData = await dsRes.json();
    var report = dsData.choices[0].message.content;

    return new Response(JSON.stringify({ report: report, feishu: feishuStatus, kbLoaded: !!kbContent }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
