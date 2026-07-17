const fs = require('fs');
const path = require('path');

const OFFICIAL_PAGE = 'https://ir.dlut.edu.cn/info/1013/1142.htm';
const DEFAULT_TARGET = path.join(__dirname, '..', 'data', 'dlut-emotion-ontology.csv');

function validateDlutCsv(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error(`找不到文件：${filePath || '未提供'}`);
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  const header = lines[0] || '';
  if (!header.includes('词语') || !header.includes('情感分类') || !header.includes('强度') || lines.length < 2) {
    throw new Error('文件格式不符合 DLUT 情感词汇本体 CSV 结构');
  }
  return { rows: lines.length - 1 };
}

function installDlutCsv(source, target = DEFAULT_TARGET) {
  validateDlutCsv(source);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return target;
}

function printGuide() {
  console.log([
    'DLUT 情感词汇本体未随本项目分发。',
    '',
    '1. 打开大连理工大学信息检索研究室官方页面：',
    `   ${OFFICIAL_PAGE}`,
    '2. 阅读页面上的使用限制，仅在获得相应授权的范围内下载和使用。',
    '3. 手动下载“情感词汇本体.zip”，解压并将词典另存为 UTF-8 CSV。',
    '4. 安装到本机（该文件已被 .gitignore 排除）：',
    '   npm run setup:dlut -- --source "/绝对路径/情感词汇本体.csv"',
    '5. 如需本地网页版完整情绪词库：',
    '   npm run build:web:dlut',
    '',
    '不要提交、公开部署或再分发生成的本地数据文件。'
  ].join('\n'));
}

function main(argv = process.argv.slice(2)) {
  const sourceIndex = argv.indexOf('--source');
  const source = sourceIndex >= 0 ? argv[sourceIndex + 1] : '';
  if (!source) {
    printGuide();
    return;
  }
  const result = validateDlutCsv(source);
  const target = installDlutCsv(source);
  console.log(`已安装 ${result.rows} 条本地数据：${target}`);
  console.log('该文件仅保存在本机，不属于本项目 MIT 授权范围。');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { OFFICIAL_PAGE, DEFAULT_TARGET, validateDlutCsv, installDlutCsv, printGuide, main };
