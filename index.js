const { program } = require('commander');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

// Налаштування аргументів командного рядка 
program
  .requiredOption('-h, --host <host>', 'адреса сервера')
  .requiredOption('-p, --port <port>', 'порт сервера')
  .requiredOption('-c, --cache <path>', 'шлях до директорії з кешем');

program.parse();
const options = program.opts();

// Функція для перевірки та створення папки кешу 
async function ensureCacheDir() {
  try {
    await fs.access(options.cache);
  } catch (error) {
    await fs.mkdir(options.cache, { recursive: true });
    console.log(`Директорію кешу створено за шляхом: ${options.cache}`);
  }
}

// Створення HTTP сервера 
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Сервіс інвентаризації запущено.'); // 
});

// Функція запуску [cite: 43, 44]
async function start() {
  try {
    await ensureCacheDir();
    // Передача хоста та порту в listen 
    server.listen(options.port, options.host, () => {
      console.log(`Сервер працює за адресою http://${options.host}:${options.port}`);
      console.log(`Папка кешу: ${path.resolve(options.cache)}`);
    });
  } catch (err) {
    console.error('Помилка при запуску сервера:', err.message);
    process.exit(1);
  }
}

start();