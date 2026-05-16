// Cloudflare Worker — 飞书知识库 + DeepSeek 生成诊断报告
// 国内直连，无需 VPN

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }
      });
    }
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: '只支持POST' }), {
        status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      const body = await request.json();
      const { userData, scores, tier } = body;
      if (!userData || !scores || !tier) {
        return new Response(JSON.stringify({ error: '缺少必要数据' }), {
          status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // 1. 飞书 token
      const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET })
      });
      const tokenData = await tokenRes.json();
      const token = tokenData.tenant_access_token;

      // 2. 读知识库
      let kbContent = '';
      const spaceId = env.FEISHU_WIKI_SPACE_ID;
      if (spaceId) {
        try {
          const nodesRes = await fetch(`https://open.feishu.cn/open-apis/wiki/v2/spaces/${spaceId}/nodes?page_size=20`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const nodesData = await nodesRes.json();
          if (nodesData.data && nodesData.data.items) {
            for (const node of nodesData.data.items) {
              if (node.obj_type === 'doc') {
                const docRes = await fetch(`https://open.feishu.cn/open-apis/wiki/v2/spaces/${spaceId}/nodes/${node.node_token}`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                const docData = await docRes.json();
                if (docData.data && docData.data.title) {
                  kbContent += '\n【' + docData.data.title + '】\n';
                  try {
                    const rawRes = await fetch(`https://open.feishu.cn/open-apis/docx/v1/documents/${node.obj_token}/raw_content`, {
                      headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const rawData = await rawRes.json();
                    if (rawData.data && rawData.data.content) kbContent += rawData.data.content + '\n';
                  } catch(e) {}
                }
              }
            }
          }
        } catch(e) {}
        kbContent = kbContent.slice(0, 6000);
      }

      // 3. 写飞书表格
      const fields = {
        '称呼': userData.name, '身份': userData.role, '行业': userData.industry, '联系方式': userData.contact || '',
        'Q1答案': scores.answers[0], 'Q2答案': scores.answers[1], 'Q3答案': scores.answers[2], 'Q4答案': scores.answers[3],
        'Q5答案': scores.answers[4], 'Q6答案': scores.answers[5], 'Q7答案': scores.answers[6], 'Q8答案': scores.answers[7],
        'Q9答案': scores.answers[8], 'Q10答案': scores.openAnswer || '', '总分': scores.total, '段位': tier.name,
        '商业判断力': scores.dims['商业判断力'], 'AI工具力': scores.dims['AI工具力'],
        '自动化力': scores.dims['自动化力'], '技术落地力': scores.dims['技术落地力']
      };

      let feishuStatus = '未尝试';
      try {
        const feishuRes = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${env.FEISHU_BASE_ID}/tables/${env.FEISHU_TABLE_ID}/records`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: fields })
        });
        const feishuData = await feishuRes.json();
        feishuStatus = feishuData.code === 0 ? '已写入' : '失败: ' + (feishuData.msg || '');
      } catch(e) { feishuStatus = '异常: ' + e.message; }

      // 4. 生成报告
      const dimLabels = {
        '商业判断力': '识别AI改造机会、算ROI、出改造方案的能力',
        'AI工具力': '掌握海外AI工具、搭建工具链的能力',
        '自动化力': '搭建工作流、打通系统、消除数据孤岛的能力',
        '技术落地力': '用AI编程做出实际可用系统的能力'
      };
      const dimAnalysis = Object.keys(scores.dims).map(k => {
        const val = scores.dims[k], level = val <= 2 ? '基础薄弱' : val <= 4 ? '中等水平' : '较强优势';
        return `${k}(${val}/6，${level})：${dimLabels[k]}`;
      }).join('\n');

      const kbSection = kbContent ? '\n【参考知识库：企业AI改造经验与诊断方法】\n' + kbContent + '\n请结合以上知识库中的方法论和经验来写这份报告。' : '';

      const prompt = `你是企业AI化改造领域的资深诊断专家。请根据以下用户的测评数据，生成一份真诚、专业、有深度的个人诊断报告。${kbSection}

【用户信息】称呼：${userData.name}，身份：${userData.role}，行业：${userData.industry}
【测评结果】总分：${scores.total}/27，段位：${tier.name}
【四维能力雷达】${dimAnalysis}
【用户开放题回答】${scores.openAnswer || '（未填写）'}

【报告要求】严格按以下结构输出，语气真诚、专业，像导师跟学员对话，不要营销感：
## 能力画像（2-3句话描述整体状态）
## 亮点分析（最亮眼的1-2个维度，代表什么潜力）
## 关键提升点（最需补的短板，给具体可操作建议）
## 推荐学习路径（合理的成长路径：先补什么、再强化什么、最后做什么）
## 一句话鼓励
总长度500-800字，不要堆砌术语。`;

      const dsRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: '你是企业AI化改造领域资深诊断专家。说话真诚、专业、像导师跟学员对话，绝不营销。' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 2000, temperature: 0.7
        })
      });
      const dsData = await dsRes.json();
      const report = dsData.choices[0].message.content;

      return new Response(JSON.stringify({ report, feishu: feishuStatus, kbLoaded: !!kbContent }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
