// 极简测试版 — 先确认SCF能跑
exports.main_handler = async (event) => {
  console.log('event keys:', Object.keys(event));
  console.log('httpMethod:', event.httpMethod);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '{"status":"SCF运行正常"}' };
  }
  if (event.httpMethod === 'POST') {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: '{"status":"POST收到"}' };
  }
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: event.httpMethod }) };
};
