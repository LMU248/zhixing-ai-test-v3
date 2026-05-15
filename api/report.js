// Vercel Serverless Function — 飞书 + DeepSeek 生成诊断报告

// 从环境变量读取配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const BASE_ID = process.env.FEISHU_BASE_ID;
const TABLE_ID = process.env.FEISHU_TABLE_ID;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

// 飞书获取 tenant access token
async function getFeishuToken() {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET })
  });
  const data = await res.json();
  return data.tenant_access_token;
}

// 写数据到飞书多维表格
async function writeToFeishu(token, userData, scores, tier) {
  const fields = {
    '称呼': userData.name,
    '身份': userData.role,
    '行业': userData.industry,
    '联系方式': userData.contact || '',
    'Q1答案': scores.answers[0],
    'Q2答案': scores.answers[1],
    'Q3答案': scores.answers[2],
    'Q4答案': scores.answers[3],
    'Q5答案': scores.answers[4],
    'Q6答案': scores.answers[5],
    'Q7答案': scores.answers[6],
    'Q8答案': scores.answers[7],
    'Q9答案': scores.answers[8],
    'Q10答案': scores.openAnswer || '',
    '总分': scores.total,
    '段位': tier.name,
    '商业判断力': scores.dims['商业判断力'],
    'AI工具力': scores.dims['AI工具力'],
    '自动化力': scores.dims['自动化力'],
    '技术落地力': scores.dims['技术落地力']
  };

  await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_ID}/tables/${TABLE_ID}/records`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: fields })
  });
}

// 调用 DeepSeek 生成报告
async function generateReport(userData, scores, tier) {
  const dimLabels = {
    '商业判断力': '识别AI改造机会、算ROI、出改造方案的能力',
    'AI工具力': '掌握海外AI工具、搭建工具链的能力',
    '自动化力': '搭建工作流、打通系统、消除数据孤岛的能力',
    '技术落地力': '用AI编程做出实际可用系统的能力'
  };

  const dimAnalysis = Object.keys(scores.dims).map(k => {
    const val = scores.dims[k];
    const level = val <= 2 ? '基础薄弱' : val <= 4 ? '中等水平' : '较强优势';
    return `${k}(${val}/6，${level})：${dimLabels[k]}`;
  }).join('\n');

  const prompt = `你是企业AI化改造领域的资深诊断专家。请根据以下用户的测评数据，生成一份真诚、专业、有深度的个人诊断报告。

【用户信息】
称呼：${userData.name}
身份：${userData.role}
行业：${userData.industry}

【测评结果】
总分：${scores.total}/27
段位：${tier.name}

【四维能力雷达】
${dimAnalysis}

【用户开放题回答】
${scores.openAnswer || '（未填写）'}

【报告要求】
请严格按以下结构输出，语气真诚、专业，像一位导师在跟学员对话，不要营销感：

## 能力画像
用2-3句话描述这位用户的整体状态——他现在处于哪个阶段，有什么特点。

## 亮点分析
指出他能力雷达中最亮眼的1-2个维度，告诉他这代表了什么潜力，可以做哪些事。

## 关键提升点
指出目前最需要补的1-2个短板维度，给出具体、可操作的提升建议——不是泛泛的"多学习"，而是告诉他具体该做什么。

## 推荐学习路径
基于他的段位和能力结构，推荐一条合理的成长路径：先补什么、再强化什么、最后可以做什么。

## 一句话鼓励
用一句话收尾，让他感到被理解和有动力。

注意：报告总长度控制在500-800字，不要堆砌术语，像一个真正懂行的人在跟他说话。`;

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是企业AI化改造领域资深诊断专家。你说话真诚、专业、像导师跟学员对话，绝不营销。' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000,
      temperature: 0.7
    })
  });

  const data = await res.json();
  return data.choices[0].message.content;
}

// 主函数
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST' });

  try {
    const { userData, scores, tier } = req.body;

    if (!userData || !scores || !tier) {
      return res.status(400).json({ error: '缺少必要数据' });
    }

    // 1. 获取飞书 token
    const token = await getFeishuToken();

    // 2. 写飞书多维表格（异步，不阻塞报告生成）
    writeToFeishu(token, userData, scores, tier).catch(err =>
      console.error('飞书写入失败:', err.message)
    );

    // 3. 调 DeepSeek 生成报告
    const report = await generateReport(userData, scores, tier);

    // 4. 返回报告
    return res.status(200).json({ report: report });

  } catch (err) {
    console.error('生成报告失败:', err);
    return res.status(500).json({ error: '报告生成失败，请稍后重试' });
  }
}
