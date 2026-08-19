import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve('docs/screenshots');
const check = process.argv.includes('--check');

const captures = [
  {
    filename: 'customer-redesign-ar-rtl.svg',
    dir: 'rtl',
    locale: 'ar',
    label: 'لقطة اختبار آلية — ليست لقطة من جهاز',
    location: 'المنزل · حي الملقا، الرياض',
    title: 'ما الخدمة التي تحتاجها؟',
    services: ['تكييف', 'سباكة', 'كهرباء', 'صيانة عامة'],
    assistant: 'متى بدأت المشكلة؟',
    customer: 'بدأت اليوم وتعمل بشكل متقطع',
    form: 'موقع الخدمة · المنزل',
    review: 'مراجعة الطلب · تعديل',
    tabs: ['الرئيسية', 'طلباتي', 'الرسائل', 'الحساب'],
  },
  {
    filename: 'customer-redesign-en-ltr.svg',
    dir: 'ltr',
    locale: 'en',
    label: 'AUTOMATED RENDERED TEST CAPTURE — NOT A DEVICE SCREENSHOT',
    location: 'Home · Al Malqa, Riyadh',
    title: 'Which service do you need?',
    services: ['Air conditioning', 'Plumbing', 'Electrical', 'General repair'],
    assistant: 'When did the issue start?',
    customer: 'It started today and works intermittently',
    form: 'Service location · Home',
    review: 'Review request · Edit',
    tabs: ['Home', 'Requests', 'Messages', 'Account'],
  },
];

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function render(capture) {
  const rtl = capture.dir === 'rtl';
  const anchor = rtl ? 'end' : 'start';
  const start = rtl ? 350 : 40;
  const cardXs = rtl ? [205, 35, 205, 35] : [35, 205, 35, 205];
  const serviceTexts = capture.services
    .map((service, index) => {
      const x = cardXs[index];
      const y = index < 2 ? 190 : 274;
      return `<rect x="${x}" y="${y - 42}" width="150" height="68" rx="16" fill="#ffffff" stroke="#d6ddd8"/><text x="${rtl ? x + 132 : x + 18}" y="${y}" text-anchor="${anchor}" class="card">${escapeXml(service)}</text>`;
    })
    .join('');
  const tabs = capture.tabs
    .map((tab, index) => {
      const logicalIndex = rtl ? capture.tabs.length - index - 1 : index;
      return `<text x="${49 + logicalIndex * 97}" y="812" text-anchor="middle" class="tab">${escapeXml(tab)}</text>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844" role="img" aria-labelledby="title desc" lang="${capture.locale}" direction="${capture.dir}">
  <title id="title">Sallah customer redesign ${capture.locale.toUpperCase()} ${capture.dir.toUpperCase()}</title>
  <desc id="desc">${escapeXml(capture.label)} showing location header, service grid, chat, form review and bottom tabs.</desc>
  <style>
    text{font-family:Arial,'Noto Sans Arabic',sans-serif;fill:#17332b} .stamp{font-size:9px;fill:#8a3d17;font-weight:700}.heading{font-size:21px;font-weight:800}.body{font-size:13px}.muted{font-size:11px;fill:#60716b}.card{font-size:13px;font-weight:700}.tab{font-size:10px;font-weight:700}
  </style>
  <rect width="390" height="844" rx="28" fill="#f6f4ed"/>
  <rect x="20" y="18" width="350" height="25" rx="12" fill="#fff0d9"/>
  <text x="195" y="35" text-anchor="middle" class="stamp">${escapeXml(capture.label)}</text>
  <rect x="24" y="58" width="342" height="66" rx="18" fill="#ffffff" stroke="#d6ddd8"/>
  <circle cx="${rtl ? 338 : 52}" cy="91" r="18" fill="#dff2ea"/>
  <text x="${start}" y="82" text-anchor="${anchor}" class="muted">${rtl ? 'موقع الخدمة' : 'Service location'}</text>
  <text x="${start}" y="103" text-anchor="${anchor}" class="body">${escapeXml(capture.location)}</text>
  <text x="${start}" y="141" text-anchor="${anchor}" class="heading">${escapeXml(capture.title)}</text>
  ${serviceTexts}
  <rect x="24" y="324" width="342" height="192" rx="20" fill="#eef7f3"/>
  <text x="${start}" y="351" text-anchor="${anchor}" class="muted">${rtl ? 'محادثة التشخيص' : 'Diagnostic chat'}</text>
  <rect x="${rtl ? 92 : 38}" y="367" width="260" height="50" rx="16" fill="#ffffff" stroke="#d6ddd8"/>
  <text x="${rtl ? 334 : 56}" y="397" text-anchor="${anchor}" class="body">${escapeXml(capture.assistant)}</text>
  <rect x="${rtl ? 38 : 92}" y="430" width="260" height="50" rx="16" fill="#157a63"/>
  <text x="${rtl ? 280 : 110}" y="460" text-anchor="${anchor}" class="body" fill="#ffffff" style="fill:#ffffff">${escapeXml(capture.customer)}</text>
  <rect x="38" y="489" width="314" height="15" rx="7" fill="#ffffff"/>
  <rect x="24" y="536" width="342" height="72" rx="18" fill="#ffffff" stroke="#d6ddd8"/>
  <text x="${start}" y="565" text-anchor="${anchor}" class="muted">${rtl ? 'النموذج' : 'Form'}</text>
  <text x="${start}" y="589" text-anchor="${anchor}" class="body">${escapeXml(capture.form)}</text>
  <rect x="24" y="624" width="342" height="122" rx="18" fill="#ffffff" stroke="#d6ddd8"/>
  <text x="${start}" y="655" text-anchor="${anchor}" class="heading">${escapeXml(capture.review)}</text>
  <line x1="40" y1="674" x2="350" y2="674" stroke="#d6ddd8"/>
  <text x="${start}" y="701" text-anchor="${anchor}" class="body">${rtl ? 'الفئة · الموقع · الموعد · السلامة' : 'Category · location · timing · safety'}</text>
  <text x="${start}" y="725" text-anchor="${anchor}" class="muted">${rtl ? 'كل قسم قابل للتعديل' : 'Every section has an Edit action'}</text>
  <rect x="0" y="770" width="390" height="74" fill="#ffffff"/>
  <line x1="0" y1="770" x2="390" y2="770" stroke="#d6ddd8"/>
  ${tabs}
</svg>
`;
}

if (!check) await mkdir(outputDirectory, { recursive: true });
let drift = false;
for (const capture of captures) {
  const path = resolve(outputDirectory, capture.filename);
  const expected = render(capture);
  if (check) {
    const actual = await readFile(path, 'utf8').catch(() => '');
    if (actual !== expected) {
      drift = true;
      console.error(`Customer capture drift: ${capture.filename}`);
    }
  } else {
    await writeFile(path, expected, 'utf8');
  }
}
if (drift) process.exitCode = 1;
