const fs = require('fs');
const path = require('path');
const { loadToken } = require('./openai-oauth');

function readStreamLogs(files, maxChars = 120000) {
  const chunks = [];
  let remaining = maxChars;
  for (const file of files) {
    if (remaining <= 0) break;
    const text = fs.readFileSync(file, 'utf8');
    const slice = text.slice(0, remaining);
    chunks.push({ file, text: slice });
    remaining -= slice.length;
  }
  return chunks;
}

function buildPersonaPrompt(chunks, options = {}) {
  const glossary = options.glossary ? `\n전용 용어집:\n${options.glossary}\n` : '';
  const body = chunks.map((chunk, index) => `# Stream Log ${index + 1}: ${path.basename(chunk.file)}\n${chunk.text}`).join('\n\n---\n\n');
  return `너는 스트리머 방송 로그를 분석해서 AI 버튜버용 페르소나를 만드는 분석가다.
아래 스트림 로그에서 스트리머의 성향, 말투, 반복 패턴, 감정 반응, 진행 방식, 금지해야 할 과장/왜곡을 추출해라.
결과는 한국어 마크다운으로 작성하고, 다음 섹션을 반드시 포함해라.

1. 핵심 캐릭터 요약
2. 말투와 어휘 패턴
3. 감정 반응과 텐션 조절
4. 콘텐츠 진행 습관
5. 시청자와 상호작용 방식
6. AI 버튜버 시스템 프롬프트
7. 샘플 대사 10개
8. 주의사항과 금지 패턴
${glossary}
스트림 로그:
${body}`;
}

function extractHeuristicPersona(chunks) {
  const text = chunks.map((chunk) => chunk.text).join('\n');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const streamerLines = lines.filter((line) => /스트리머|srt_streamer|🎙️/.test(line)).slice(0, 120);
  const chatLines = lines.filter((line) => /채팅|chat|💬/.test(line)).slice(0, 120);
  const all = (streamerLines.length ? streamerLines : lines).join('\n');
  const frequentWords = Array.from(all.matchAll(/[가-힣a-zA-Z0-9]{2,}/g))
    .map((match) => match[0])
    .reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {});
  const topWords = Object.entries(frequentWords)
    .filter(([word]) => !['스트리머', 'Unknown', 'chat', 'srt'].includes(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);

  const samples = streamerLines.slice(0, 10).map((line) => line.replace(/^[-*\s]+/, ''));

  return `# AI 버튜버용 페르소나 초안

## 핵심 캐릭터 요약
- 입력 로그 ${chunks.length}개에서 자동 추출한 초안입니다.
- 반복 어휘: ${topWords.join(', ') || '충분한 반복 어휘를 찾지 못했습니다.'}
- 스트리머 발화 후보 ${streamerLines.length}개, 채팅 후보 ${chatLines.length}개를 기준으로 분석했습니다.

## 말투와 어휘 패턴
- 실제 모델 분석 전 단계의 로컬 휴리스틱 결과입니다.
- 아래 샘플 대사를 기준으로 말버릇과 호흡을 사람이 검수해야 합니다.

## 감정 반응과 텐션 조절
- 로그 안의 감탄사, 반복어, 시청자 반응 빈도를 기준으로 텐션을 조절합니다.
- 과장된 캐릭터화보다 실제 발화 샘플을 우선합니다.

## 콘텐츠 진행 습관
- 대화 흐름은 스트리머 발화와 채팅 반응이 교차하는 구간을 우선 반영합니다.

## 시청자와 상호작용 방식
- 채팅 반응을 즉시 받아치는 형식을 기본으로 합니다.

## AI 버튜버 시스템 프롬프트
너는 입력된 스트림 로그에서 추출한 말투와 진행 습관을 따르는 AI 버튜버다. 실제 스트리머를 그대로 사칭하지 말고, 분석된 톤과 상호작용 패턴만 참고한다. 시청자 질문에는 짧고 자연스럽게 반응하고, 모르는 사실은 꾸며내지 않는다.

## 샘플 대사 10개
${samples.length ? samples.map((line, index) => `${index + 1}. ${line}`).join('\n') : '1. 샘플 발화를 충분히 찾지 못했습니다.'}

## 주의사항과 금지 패턴
- 실제 인물 사칭, 개인정보 추정, 비공개 정보 생성 금지
- 로그에 없는 고유 말버릇을 임의로 만들지 말 것
- 논란성 발언은 원문 맥락 없이 확대 재현하지 말 것
`;
}

async function callOpenAI(prompt, { apiKey, model = 'gpt-5.5', tokenPath, temperature = 0.4 } = {}) {
  const saved = !apiKey ? loadToken(tokenPath) : null;
  const bearer = apiKey || saved?.access_token;
  if (!bearer) throw new Error('OpenAI API key or saved OAuth access token is required.');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: 'system', content: 'You produce concise, practical Korean persona documents for AI VTubers.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status} ${text}`);
  const data = JSON.parse(text);
  return data.choices?.[0]?.message?.content || '';
}

async function callOllama(prompt, { baseUrl = 'http://localhost:11434', model = 'llama3.1', temperature = 0.4 } = {}) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature },
      messages: [
        { role: 'system', content: '한국어 AI 버튜버 페르소나 문서를 작성한다.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Ollama request failed: ${response.status} ${text}`);
  const data = JSON.parse(text);
  return data.message?.content || '';
}

async function extractPersona(files, options = {}) {
  if (!files.length) throw new Error('At least one stream log file is required.');
  const chunks = readStreamLogs(files, options.maxChars);
  let content;
  const provider = options.provider || 'heuristic';
  const prompt = buildPersonaPrompt(chunks, options);

  if (provider === 'openai') {
    content = await callOpenAI(prompt, options);
  } else if (provider === 'ollama') {
    content = await callOllama(prompt, options);
  } else {
    content = extractHeuristicPersona(chunks);
  }

  const result = {
    provider,
    model: options.model || (provider === 'openai' ? 'gpt-5.5' : provider === 'ollama' ? 'llama3.1' : 'heuristic'),
    files,
    createdAt: new Date().toISOString(),
    content,
  };

  if (options.out) {
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, content, 'utf8');
  }
  if (options.jsonOut) {
    fs.mkdirSync(path.dirname(options.jsonOut), { recursive: true });
    fs.writeFileSync(options.jsonOut, JSON.stringify(result, null, 2), 'utf8');
  }
  return result;
}

module.exports = {
  readStreamLogs,
  buildPersonaPrompt,
  extractPersona,
};
